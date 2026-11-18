import test from "node:test";
import assert from "node:assert/strict";
import { createAgentServer } from "./server.mjs";

const plan = {
  summary: "Aplicativo de tarefas com calendário.",
  assumptions: ["Primeira versão individual."],
  questions: [],
  milestones: [{ title: "Base", description: "Criar estrutura inicial.", deliverables: ["Projeto compilável"] }],
  files: [{ path: "src/main.gp", purpose: "Ponto de entrada" }],
  risks: ["Notificações dependem de permissões."],
  acceptanceCriteria: ["Usuário cadastra uma tarefa."],
};

async function withServer(options, run) {
  const server = createAgentServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); }
}

test("health hides secrets and confirms execution is disabled", async () => {
  await withServer({ env: {} }, async (base) => {
    const r = await fetch(base + "/api/agent/health");
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.equal(data.executionEnabled, false);
    assert.equal(data.providerConfigured, false);
    assert.equal(JSON.stringify(data).includes("secret"), false);
  });
});

test("plan endpoint requires bearer token", async () => {
  await withServer({ env: { AGENT_API_TOKEN: "test-secret" } }, async (base) => {
    const r = await fetch(base + "/api/agent/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: "Quero um app para tarefas." }) });
    assert.equal(r.status, 401);
  });
});

test("input is validated before provider call", async () => {
  let called = false;
  await withServer({
    env: { AGENT_API_TOKEN: "test-secret", AI_API_KEY: "provider-secret", AI_MODEL: "mock" },
    fetchImpl: async () => { called = true; throw new Error("unexpected"); },
  }, async (base) => {
    const r = await fetch(base + "/api/agent/plan", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "curto" }),
    });
    assert.equal(r.status, 400);
    assert.equal(called, false);
  });
});

test("valid request returns normalized provider plan", async () => {
  let providerCall;
  await withServer({
    env: { AGENT_API_TOKEN: "test-secret", AI_API_KEY: "provider-secret", AI_MODEL: "mock-model", AI_BASE_URL: "https://ai.example/v1" },
    fetchImpl: async (url, options) => {
      providerCall = { url: String(url), options };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(plan) } }] }), { status: 200 });
    },
  }, async (base) => {
    const r = await fetch(base + "/api/agent/plan", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ projectName: "Tarefas", target: "web", prompt: "Quero um app para organizar tarefas e compromissos." }),
    });
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.plan.milestones.length, 1);
    assert.equal(providerCall.url, "https://ai.example/v1/chat/completions");
    assert.equal(providerCall.options.headers.authorization, "Bearer provider-secret");
    assert.equal(data.plan.files[0].path, "src/main.gp");
  });
});

test("oversized request bodies are rejected with 413", async () => {
  await withServer({ env: { AGENT_API_TOKEN: "test-secret" } }, async (base) => {
    const r = await fetch(base + "/api/agent/plan", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "x".repeat(40_000) }),
    });
    assert.equal(r.status, 413);
  });
});

test("unlisted browser origins are rejected", async () => {
  await withServer({ env: { AGENT_ALLOWED_ORIGINS: "https://allowed.example" } }, async (base) => {
    const r = await fetch(base + "/api/agent/health", { headers: { origin: "https://attacker.example" } });
    assert.equal(r.status, 403);
  });
});

test("unsafe paths returned by provider are removed", async () => {
  const unsafe = { ...plan, files: [{ path: "../../etc/passwd", purpose: "unsafe" }] };
  await withServer({
    env: { AGENT_API_TOKEN: "test-secret", AI_API_KEY: "provider-secret", AI_MODEL: "mock-model" },
    fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(unsafe) } }] }), { status: 200 }),
  }, async (base) => {
    const r = await fetch(base + "/api/agent/plan", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "Quero um aplicativo para organizar minhas tarefas." }),
    });
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.equal(data.plan.files.length, 0);
  });
});
