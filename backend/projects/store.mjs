
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { UUID_PATTERN } from "../shared/supabase-auth.mjs";

const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUserId(userId) {
  if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) throw new Error("Identificador de usuário inválido.");
}
function assertProjectId(projectId) {
  if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId)) throw new Error("Identificador de projeto inválido.");
}
function isMissing(error) { return error && error.code === "ENOENT"; }

export function createProjectStore(rootDirectory) {
  if (typeof rootDirectory !== "string" || !rootDirectory.trim()) throw new Error("Diretório de dados não configurado.");
  const root = path.resolve(rootDirectory);
  const lockQueues = new Map();

  async function withLock(key, task) {
    const previous = lockQueues.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    lockQueues.set(key, tail);
    await previous;
    try { return await task(); }
    finally {
      release();
      if (lockQueues.get(key) === tail) lockQueues.delete(key);
    }
  }

  async function userDirectory(userId) {
    assertUserId(userId);
    const directory = path.resolve(root, userId.toLowerCase());
    if (!directory.startsWith(root + path.sep)) throw new Error("Caminho inválido.");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    return directory;
  }

  async function readRecord(userId, projectId) {
    assertProjectId(projectId);
    const directory = await userDirectory(userId);
    try {
      const raw = await fs.readFile(path.join(directory, projectId + ".json"), "utf8");
      const record = JSON.parse(raw);
      if (record.ownerId !== userId.toLowerCase() || record.id !== projectId) throw new Error("Registro inconsistente.");
      return record;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async function writeRecord(userId, record) {
    const directory = await userDirectory(userId);
    const target = path.join(directory, record.id + ".json");
    const temporary = path.join(directory, "." + record.id + "." + randomUUID() + ".tmp");
    try {
      await fs.writeFile(temporary, JSON.stringify(record), { encoding: "utf8", mode: 0o600, flag: "wx" });
      await fs.rename(temporary, target);
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
  }

  async function listRecords(userId) {
    const directory = await userDirectory(userId);
    const names = await fs.readdir(directory);
    const records = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const record = JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
      if (record.ownerId === userId.toLowerCase() && PROJECT_ID_PATTERN.test(record.id ?? "")) records.push(record);
    }
    return records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  return {
    list: listRecords,
    get: readRecord,
    async create(userId, input) {
      return withLock("user:" + userId, async () => {
        if ((await listRecords(userId)).length >= 100) {
          const error = new Error("Limite de 100 projetos por usuário atingido.");
          error.code = "PROJECT_LIMIT";
          throw error;
        }
        const now = new Date().toISOString();
        const record = {
          id: randomUUID(), ownerId: userId.toLowerCase(),
          name: input.name, entryFile: input.entryFile, files: input.files,
          revision: 1, createdAt: now, updatedAt: now,
        };
        await writeRecord(userId, record);
        return record;
      });
    },
    async replace(userId, projectId, expectedRevision, input) {
      assertProjectId(projectId);
      return withLock("project:" + userId + ":" + projectId, async () => {
        const current = await readRecord(userId, projectId);
        if (!current) return null;
        if (current.revision !== expectedRevision) {
          const error = new Error("O projeto foi atualizado em outra sessão.");
          error.code = "REVISION_CONFLICT";
          error.currentRevision = current.revision;
          throw error;
        }
        const next = {
          ...current, name: input.name, entryFile: input.entryFile, files: input.files,
          revision: current.revision + 1, updatedAt: new Date().toISOString(),
        };
        await writeRecord(userId, next);
        return next;
      });
    },
    async remove(userId, projectId, expectedRevision) {
      assertProjectId(projectId);
      return withLock("project:" + userId + ":" + projectId, async () => {
        const current = await readRecord(userId, projectId);
        if (!current) return false;
        if (current.revision !== expectedRevision) {
          const error = new Error("O projeto foi atualizado em outra sessão.");
          error.code = "REVISION_CONFLICT";
          error.currentRevision = current.revision;
          throw error;
        }
        await fs.unlink(path.join(await userDirectory(userId), projectId + ".json"));
        return true;
      });
    },
  };
}
