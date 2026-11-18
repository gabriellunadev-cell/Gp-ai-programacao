import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const MAX_BODY = 32 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const REQUEST_TIMEOUT_MS = 25_000;

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(body);
}

function equalSecret(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bodyJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("Corpo excede 32 KiB."), { status: 413 }));
        return;
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("JSON inválido."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Envie um objeto JSON.";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (prompt.length < 12) return "Descreva a ideia com pelo menos 12 caracteres.";
  if (prompt.length > 12_000) return "Descrição excede 12.000 caracteres.";
  const name = typeof input.projectName === "string" ? input.projectName.trim() : "Novo projeto";
  if (!name || name.length > 80) return "Nome do projeto inválido (máximo 80 caracteres).";
  if (input.target !== undefined && !["gp", "web", "android", "ios", "backend"].includes(input.target)) return "Plataforma-alvo inválida.";
  if (input.context !== undefined && (typeof input.context !== "string" || input.context.length > 8_000)) return "Contexto inválido (máximo 8.000 caracteres).";
  return null;
}

function normalizePlan(content) {
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Formato inválido.");
  const text = (v, max = 1200) => typeof v === "string" ? v.trim().slice(0, max) : "";
  const list = (v, max = 12) => Array.isArray(v) ? v.slice(0, max).map((x) => text(x, 400)).filter(Boolean) : [];
  const milestones = Array.isArray(parsed.milestones) ? parsed.milestones.slice(0, 8).map((m) => ({
    title: text(m?.title, 100),
    description: text(m?.description, 500),
    deliverables: list(m?.deliverables, 8),
  })).filter((m) => m.title && m.description) : [];
  const files = Array.isArray(parsed.files) ? parsed.files.slice(0, 30).map((f) => ({
    path: text(f?.path, 180),
    purpose: text(f?.purpose, 300),
  })).filter((f) => /^([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(f.path) && !f.path.split("/").includes("..")) : [];
  const plan = {
    summary: text(parsed.summary, 1600),
    assumptions: list(parsed.assumptions, 8),
    questions: list(parsed.questions, 6),
    milestones,
    files,
    risks: list(parsed.risks, 8),
    acceptanceCriteria: list(parsed.acceptanceCriteria, 12),
  };
  if (!plan.summary || !plan.milestones.length) throw new Error("Plano sem resumo ou etapas válidas.");
  return plan;
}

export function createAgentServer({ env = process.env, fetchImpl = fetch, clock = () => Date.now() } = {}) {
  const origins = new Set((env.AGENT_ALLOWED_ORIGINS ?? "http://localhost:4173,http://127.0.0.1:4173").split(",").map((x) => x.trim()).filter(Boolean));
  const buckets = new Map();

  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    const cors = {};
    if (origin && origins.has(origin)) {
      cors["access-control-allow-origin"] = origin;
      cors["access-control-allow-headers"] = "authorization, content-type";
      cors["access-control-allow-methods"] = "GET, POST, OPTIONS";
      cors.vary = "Origin";
    } else if (origin) {
      send(res, 403, { ok: false, error: "Origem não autorizada." });
      return;
    }
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }

    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (req.method === "GET" && path === "/api/agent/health") {
      send(res, 200, {
        ok: true,
        service: "gp-agent-planner",
        version: "0.1.0",
        providerConfigured: Boolean(env.AI_API_KEY && env.AI_MODEL),
        authenticationConfigured: Boolean(env.AGENT_API_TOKEN),
        capabilities: ["requirements-planning"],
        executionEnabled: false,
      }, cors);
      return;
    }
    if (req.method !== "POST" || path !== "/api/agent/plan") {
      send(res, 404, { ok: false, error: "Rota não encontrada." }, cors);
      return;
    }

    const expected = env.AGENT_API_TOKEN ?? "";
    const header = req.headers.authorization ?? "";
    const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!expected || !supplied || !equalSecret(supplied, expected)) {
      send(res, 401, { ok: false, error: "Autenticação necessária." }, cors);
      return;
    }

    const now = clock();
    const key = req.socket.remoteAddress ?? "unknown";
    const bucket = buckets.get(key) ?? { start: now, count: 0 };
    if (now - bucket.start >= WINDOW_MS) { bucket.start = now; bucket.count = 0; }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > MAX_PER_WINDOW) {
      send(res, 429, { ok: false, error: "Limite de 12 solicitações por minuto atingido." }, cors);
      return;
    }
    if (buckets.size > 2000) for (const [k, v] of buckets) if (now - v.start >= WINDOW_MS) buckets.delete(k);

    let input;
    try { input = await bodyJson(req); }
    catch (error) {
      if (!res.headersSent && !res.destroyed) send(res, error.status ?? 400, { ok: false, error: error.message }, cors);
      return;
    }
    const invalid = validateInput(input);
    if (invalid) { send(res, 400, { ok: false, error: invalid }, cors); return; }
    if (!env.AI_API_KEY || !env.AI_MODEL) {
      send(res, 503, { ok: false, error: "Provedor de IA não configurado no backend." }, cors);
      return;
    }

    const base = (env.AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    let endpoint;
    try {
      endpoint = new URL(base);
      if (endpoint.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(endpoint.hostname)) throw new Error("invalid");
    } catch {
      send(res, 500, { ok: false, error: "AI_BASE_URL inválida; use HTTPS ou localhost." }, cors);
      return;
    }

    const system = [
      "Você é o agente de planejamento de engenharia do GP Programinha.",
      "Analise requisitos e proponha um plano incremental, seguro e testável.",
      "Nunca afirme que executou código, criou arquivos ou realizou testes.",
      "Não invente credenciais ou capacidades disponíveis.",
      "Retorne somente JSON com summary, assumptions, questions, milestones, files, risks, acceptanceCriteria.",
      "milestones: objetos title, description, deliverables; files: objetos path, purpose.",
      "Caminhos relativos sem '..'. Não inclua comandos shell executáveis.",
    ].join(" ");
    const user = JSON.stringify({
      projectName: input.projectName ?? "Novo projeto",
      target: input.target ?? "gp",
      prompt: input.prompt,
      context: input.context ?? "",
    });

    let response;
    try {
      response = await fetchImpl(new URL(base + "/chat/completions"), {
        method: "POST",
        headers: { authorization: `Bearer ${env.AI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: env.AI_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      send(res, 502, { ok: false, error: "Não foi possível conectar ao provedor de IA." }, cors);
      return;
    }
    if (!response.ok) {
      send(res, 502, { ok: false, error: "O provedor de IA recusou a solicitação.", providerStatus: response.status }, cors);
      return;
    }
    try {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("missing content");
      send(res, 200, { ok: true, plan: normalizePlan(content), model: env.AI_MODEL }, cors);
    } catch {
      send(res, 502, { ok: false, error: "Resposta inválida do provedor; nenhum arquivo foi alterado." }, cors);
    }
  });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const host = process.env.AGENT_HOST ?? "127.0.0.1";
  const port = Number(process.env.AGENT_PORT ?? 18787);
  createAgentServer().listen(port, host, () => process.stdout.write(`GP Agent Planner listening on http://${host}:${port}\n`));
}
