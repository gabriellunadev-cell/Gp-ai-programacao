
import { createServer } from "node:http";
import { createProjectStore } from "./store.mjs";
import { createSupabaseAuthenticator, UUID_PATTERN } from "../shared/supabase-auth.mjs";

const MAX_BODY_BYTES = 18 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 128;
const UUID_ROUTE = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function send(res, status, data, headers = {}) {
  if (status === 204) {
    res.writeHead(status, { "cache-control": "no-store", ...headers });
    res.end();
    return;
  }
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { tooLarge = true; chunks.length = 0; }
      else if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Corpo excede 18 MiB."), { status: 413 }));
        return;
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("JSON inválido."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function validateProjectInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Envie um objeto JSON.";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) return "Nome do projeto obrigatório (máximo 80 caracteres).";
  if (typeof input.entryFile !== "string") return "Arquivo principal inválido.";
  if (!Array.isArray(input.files) || input.files.length < 1 || input.files.length > MAX_FILES) return "O projeto deve conter de 1 a 128 arquivos.";
  const paths = new Set();
  let total = 0;
  for (const file of input.files) {
    if (!file || typeof file.path !== "string" || typeof file.source !== "string") return "Cada arquivo precisa ter caminho e conteúdo textual.";
    const parts = file.path.split("/");
    if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.gp$/.test(file.path) || parts.some((part) => part === "." || part === ".." || part === "")) {
      return "Caminho GP inválido: " + file.path.slice(0, 180);
    }
    if (paths.has(file.path)) return "Caminho duplicado: " + file.path;
    paths.add(file.path);
    const bytes = Buffer.byteLength(file.source, "utf8");
    if (bytes > MAX_FILE_BYTES) return "Arquivo excede 4 MiB: " + file.path;
    total += bytes;
    if (total > MAX_PROJECT_BYTES) return "Projeto excede 16 MiB.";
  }
  if (!paths.has(input.entryFile)) return "O arquivo principal deve existir no projeto.";
  return null;
}

function expectedRevision(req) {
  const value = req.headers["if-match"];
  if (typeof value !== "string") return null;
  const match = /^(?:W\/)?"?([1-9][0-9]*)"?$/.exec(value.trim());
  if (!match) return null;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) ? revision : null;
}

export function createProjectsServer({
  env = process.env,
  authenticate = createSupabaseAuthenticator({ env }),
  store = createProjectStore(env.PROJECTS_DATA_DIR ?? "/var/lib/gp-programinha/projects"),
  clock = () => Date.now(),
} = {}) {
  const origins = new Set((env.PROJECTS_ALLOWED_ORIGINS ?? "http://localhost:4173,http://127.0.0.1:4173")
    .split(",").map((x) => x.trim()).filter(Boolean));
  const buckets = new Map();

  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    const cors = {};
    if (origin && !origins.has(origin)) {
      send(res, 403, { ok: false, error: "Origem não autorizada." });
      return;
    }
    if (origin) {
      cors["access-control-allow-origin"] = origin;
      cors["access-control-allow-headers"] = "authorization, content-type, if-match";
      cors["access-control-allow-methods"] = "GET, POST, PUT, DELETE, OPTIONS";
      cors.vary = "Origin";
    }
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }

    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method === "GET" && pathname === "/api/projects/health") {
      send(res, 200, { ok: true, service: "gp-projects-api", version: "0.1.0", authentication: "supabase-auth", storage: "per-user-filesystem" }, cors);
      return;
    }

    const key = req.socket.remoteAddress ?? "unknown";
    const now = clock();
    let bucket = buckets.get(key);
    if (!bucket && buckets.size >= 2000) {
      for (const [candidate, value] of buckets) if (now - value.start >= 60_000) buckets.delete(candidate);
      if (buckets.size >= 2000) {
        send(res, 503, { ok: false, error: "Capacidade temporariamente limitada." }, cors);
        return;
      }
    }
    bucket ??= { start: now, count: 0 };
    if (now - bucket.start >= 60_000) { bucket.start = now; bucket.count = 0; }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > 60) {
      send(res, 429, { ok: false, error: "Limite de 60 solicitações por minuto atingido." }, cors);
      return;
    }

    let user;
    try { user = await authenticate(req); }
    catch (error) {
      const status = error?.code === "AUTH_NOT_CONFIGURED" ? 503 : 502;
      send(res, status, { ok: false, error: status === 503
        ? "Autenticação ainda não foi configurada no servidor."
        : "Não foi possível validar a sessão com o provedor de identidade." }, cors);
      return;
    }
    if (!user || typeof user.id !== "string" || !UUID_PATTERN.test(user.id)) {
      send(res, 401, { ok: false, error: "Sessão inválida ou expirada." }, cors);
      return;
    }
    const ownerId = user.id.toLowerCase();

    if (pathname === "/api/projects" && req.method === "GET") {
      try { send(res, 200, { ok: true, projects: await store.list(ownerId) }, cors); }
      catch { send(res, 500, { ok: false, error: "Não foi possível consultar os projetos." }, cors); }
      return;
    }

    if (pathname === "/api/projects" && req.method === "POST") {
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
        send(res, 415, { ok: false, error: "Use Content-Type: application/json." }, cors);
        return;
      }
      let input;
      try { input = await readJson(req); }
      catch (error) { send(res, error.status ?? 400, { ok: false, error: error.message }, cors); return; }
      const invalid = validateProjectInput(input);
      if (invalid) { send(res, 400, { ok: false, error: invalid }, cors); return; }
      try {
        const project = await store.create(ownerId, { name: input.name.trim(), entryFile: input.entryFile, files: input.files });
        send(res, 201, { ok: true, project }, { ...cors, etag: '"' + project.revision + '"' });
      } catch (error) {
        send(res, error?.code === "PROJECT_LIMIT" ? 429 : 500, {
          ok: false, error: error?.code === "PROJECT_LIMIT" ? error.message : "Não foi possível criar o projeto.",
        }, cors);
      }
      return;
    }

    const match = new RegExp("^/api/projects/(" + UUID_ROUTE + ")$", "i").exec(pathname);
    if (!match) { send(res, 404, { ok: false, error: "Rota não encontrada." }, cors); return; }
    const projectId = match[1].toLowerCase();

    if (req.method === "GET") {
      try {
        const project = await store.get(ownerId, projectId);
        if (!project) { send(res, 404, { ok: false, error: "Projeto não encontrado." }, cors); return; }
        send(res, 200, { ok: true, project }, { ...cors, etag: '"' + project.revision + '"' });
      } catch { send(res, 500, { ok: false, error: "Não foi possível consultar o projeto." }, cors); }
      return;
    }

    if (req.method === "PUT") {
      const revision = expectedRevision(req);
      if (!revision) { send(res, 428, { ok: false, error: "Informe If-Match com a revisão atual do projeto." }, cors); return; }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
        send(res, 415, { ok: false, error: "Use Content-Type: application/json." }, cors);
        return;
      }
      let input;
      try { input = await readJson(req); }
      catch (error) { send(res, error.status ?? 400, { ok: false, error: error.message }, cors); return; }
      const invalid = validateProjectInput(input);
      if (invalid) { send(res, 400, { ok: false, error: invalid }, cors); return; }
      try {
        const project = await store.replace(ownerId, projectId, revision, {
          name: input.name.trim(), entryFile: input.entryFile, files: input.files,
        });
        if (!project) { send(res, 404, { ok: false, error: "Projeto não encontrado." }, cors); return; }
        send(res, 200, { ok: true, project }, { ...cors, etag: '"' + project.revision + '"' });
      } catch (error) {
        if (error?.code === "REVISION_CONFLICT") {
          send(res, 412, { ok: false, error: error.message, currentRevision: error.currentRevision }, cors);
          return;
        }
        send(res, 500, { ok: false, error: "Não foi possível atualizar o projeto." }, cors);
      }
      return;
    }

    if (req.method === "DELETE") {
      const revision = expectedRevision(req);
      if (!revision) { send(res, 428, { ok: false, error: "Informe If-Match com a revisão atual do projeto." }, cors); return; }
      try {
        const removed = await store.remove(ownerId, projectId, revision);
        if (!removed) { send(res, 404, { ok: false, error: "Projeto não encontrado." }, cors); return; }
        send(res, 204, null, cors);
      } catch (error) {
        if (error?.code === "REVISION_CONFLICT") {
          send(res, 412, { ok: false, error: error.message, currentRevision: error.currentRevision }, cors);
          return;
        }
        send(res, 500, { ok: false, error: "Não foi possível remover o projeto." }, cors);
      }
      return;
    }

    send(res, 405, { ok: false, error: "Método não permitido." }, cors);
  });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const host = process.env.PROJECTS_HOST ?? "127.0.0.1";
  const port = Number(process.env.PROJECTS_PORT ?? 18788);
  createProjectsServer().listen(port, host, () => {
    process.stdout.write("GP Projects API listening on http://" + host + ":" + port + "\n");
  });
}
