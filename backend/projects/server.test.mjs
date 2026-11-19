
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProjectsServer } from "./server.mjs";
import { createProjectStore } from "./store.mjs";
import { createSupabaseAuthenticator } from "../shared/supabase-auth.mjs";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const validInput = {
  name: "Projeto de teste",
  entryFile: "app/principal.gp",
  files: [{ path: "app/principal.gp", source: 'mostrar("Olá GP")\n' }],
};

async function withServer(run, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "gp-projects-test-"));
  const store = createProjectStore(directory);
  const identities = new Map([["token-a", { id: USER_A }], ["token-b", { id: USER_B }]]);
  const server = createProjectsServer({
    env: { PROJECTS_ALLOWED_ORIGINS: "https://programinha.example" },
    store,
    authenticate: options.authenticate ?? (async (req) => {
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      return identities.get(token) ?? null;
    }),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run("http://127.0.0.1:" + server.address().port); }
  finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

function request(base, token, endpoint = "/api/projects", init = {}) {
  return fetch(base + endpoint, {
    ...init,
    headers: {
      authorization: token ? "Bearer " + token : "",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

test("health reports service capabilities without exposing credentials", async () => {
  await withServer(async (base) => {
    const response = await fetch(base + "/api/projects/health");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.service, "gp-projects-api");
    assert.equal(JSON.stringify(body).includes("secret"), false);
  });
});

test("project endpoints require an authenticated user", async () => {
  await withServer(async (base) => {
    const response = await request(base, null);
    assert.equal(response.status, 401);
  });
});

test("projects are isolated by authenticated user identity", async () => {
  await withServer(async (base) => {
    const created = await request(base, "token-a", "/api/projects", { method: "POST", body: JSON.stringify(validInput) });
    const result = await created.json();
    assert.equal(created.status, 201);
    assert.equal(result.project.ownerId, USER_A);
    assert.equal(result.project.revision, 1);

    const own = await request(base, "token-a");
    const other = await request(base, "token-b");
    assert.equal((await own.json()).projects.length, 1);
    assert.equal((await other.json()).projects.length, 0);

    const foreign = await request(base, "token-b", "/api/projects/" + result.project.id);
    assert.equal(foreign.status, 404);
  });
});

test("unsafe and inconsistent file paths are rejected", async () => {
  await withServer(async (base) => {
    const bad = { ...validInput, files: [{ path: "../outside.gp", source: "no" }] };
    const response = await request(base, "token-a", "/api/projects", { method: "POST", body: JSON.stringify(bad) });
    assert.equal(response.status, 400);
  });
});

test("updates require If-Match and reject stale revisions", async () => {
  await withServer(async (base) => {
    const created = await request(base, "token-a", "/api/projects", { method: "POST", body: JSON.stringify(validInput) });
    const project = (await created.json()).project;
    const url = "/api/projects/" + project.id;

    const missing = await request(base, "token-a", url, { method: "PUT", body: JSON.stringify(validInput) });
    assert.equal(missing.status, 428);

    const updatedInput = { ...validInput, name: "Projeto atualizado" };
    const updated = await request(base, "token-a", url, {
      method: "PUT", headers: { "if-match": '"1"' }, body: JSON.stringify(updatedInput),
    });
    assert.equal(updated.status, 200);
    const updatedProject = (await updated.json()).project;
    assert.equal(updatedProject.revision, 2);
    assert.equal(updatedProject.name, "Projeto atualizado");

    const stale = await request(base, "token-a", url, {
      method: "PUT", headers: { "if-match": '"1"' }, body: JSON.stringify(validInput),
    });
    assert.equal(stale.status, 412);
    assert.equal((await stale.json()).currentRevision, 2);
  });
});

test("delete requires the latest revision and cannot cross user boundaries", async () => {
  await withServer(async (base) => {
    const created = await request(base, "token-a", "/api/projects", { method: "POST", body: JSON.stringify(validInput) });
    const project = (await created.json()).project;
    const url = "/api/projects/" + project.id;

    const foreign = await request(base, "token-b", url, { method: "DELETE", headers: { "if-match": '"1"' } });
    assert.equal(foreign.status, 404);

    const removed = await request(base, "token-a", url, { method: "DELETE", headers: { "if-match": '"1"' } });
    assert.equal(removed.status, 204);

    const missing = await request(base, "token-a", url);
    assert.equal(missing.status, 404);
  });
});

test("unlisted origins are rejected before authentication", async () => {
  await withServer(async (base) => {
    const response = await fetch(base + "/api/projects", { headers: { origin: "https://attacker.example" } });
    assert.equal(response.status, 403);
  });
});

test("Supabase authenticator validates identity through Auth API, not JWT claims", async () => {
  let called;
  const authenticate = createSupabaseAuthenticator({
    env: { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "public-anon-key" },
    fetchImpl: async (url, options) => {
      called = { url: String(url), options };
      return new Response(JSON.stringify({ id: USER_A, email: "person@example.com" }), { status: 200 });
    },
  });
  const user = await authenticate({ headers: { authorization: "Bearer user-access-token" } });
  assert.equal(user.id, USER_A);
  assert.equal(called.url, "https://project.supabase.co/auth/v1/user");
  assert.equal(called.options.headers.apikey, "public-anon-key");
  assert.equal(called.options.headers.authorization, "Bearer user-access-token");
  assert.equal(called.options.redirect, "error");
});

test("invalid Supabase sessions are rejected and provider outages fail closed", async () => {
  const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "public-anon-key" };
  const invalid = createSupabaseAuthenticator({ env, fetchImpl: async () => new Response("{}", { status: 401 }) });
  assert.equal(await invalid({ headers: { authorization: "Bearer expired" } }), null);

  const unavailable = createSupabaseAuthenticator({ env, fetchImpl: async () => new Response("{}", { status: 503 }) });
  await assert.rejects(unavailable({ headers: { authorization: "Bearer token" } }),
    (error) => error.code === "AUTH_PROVIDER_UNAVAILABLE");
});

test("missing Supabase configuration never grants access", async () => {
  const authenticate = createSupabaseAuthenticator({ env: {} });
  await assert.rejects(authenticate({ headers: { authorization: "Bearer anything" } }),
    (error) => error.code === "AUTH_NOT_CONFIGURED");
});
