export type BridgeHealth = {
  ok: boolean;
  service: string;
  version?: string;
  bridgeVersion?: string;
  compilerAvailable?: boolean;
  projectApi?: boolean;
  limits?: {
    files?: number;
    fileBytes?: number;
    projectBytes?: number;
  };
};

export type BridgeResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs?: number;
  diagnostics?: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    line?: number;
    column?: number;
  }>;
};

export type GpProjectFile = {
  path: string;
  source: string;
};

export class GpBridgeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "GpBridgeError";
  }
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(baseUrl.replace(/\/$/, "") + path, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new GpBridgeError(
      "Não foi possível conectar ao GP Bridge. Inicie o serviço local da linguagem e tente novamente.",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string; message?: string })
    | null;

  if (!response.ok || payload === null) {
    throw new GpBridgeError(
      payload?.error ?? payload?.message ?? "GP Bridge respondeu com HTTP " + response.status + ".",
      response.status,
    );
  }
  return payload;
}

export function checkGpBridge(baseUrl: string): Promise<BridgeHealth> {
  return request<BridgeHealth>(baseUrl, "/api/health");
}

export function compileGpSource(
  baseUrl: string,
  source: string,
  fileName: string,
): Promise<BridgeResult> {
  return request<BridgeResult>(baseUrl, "/api/compile", {
    method: "POST",
    body: JSON.stringify({ source, fileName }),
  });
}

export function runGpSource(
  baseUrl: string,
  source: string,
  fileName: string,
): Promise<BridgeResult> {
  return request<BridgeResult>(baseUrl, "/api/run", {
    method: "POST",
    body: JSON.stringify({ source, fileName, runtime: "reference" }),
  });
}

function assertProjectLimits(entryFile: string, files: GpProjectFile[]): void {
  if (!Array.isArray(files) || files.length < 1 || files.length > 128) {
    throw new GpBridgeError("O projeto precisa conter entre 1 e 128 arquivos GP.");
  }
  const paths = new Set<string>();
  let totalBytes = 0;
  for (const file of files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.gp$/.test(file.path) ||
      file.path.split("/").some((part) => part === "." || part === ".." || part === "")
    ) {
      throw new GpBridgeError("Caminho de arquivo GP inválido: " + String(file?.path));
    }
    if (paths.has(file.path)) {
      throw new GpBridgeError("O projeto contém caminhos duplicados: " + file.path);
    }
    paths.add(file.path);
    if (typeof file.source !== "string") {
      throw new GpBridgeError("A fonte de " + file.path + " precisa ser texto.");
    }
    const bytes = new TextEncoder().encode(file.source).byteLength;
    if (bytes > 4 * 1024 * 1024) {
      throw new GpBridgeError("O arquivo " + file.path + " excede 4 MiB.");
    }
    totalBytes += bytes;
  }
  if (totalBytes > 16 * 1024 * 1024) {
    throw new GpBridgeError("O projeto excede o limite total de 16 MiB.");
  }
  if (!paths.has(entryFile)) {
    throw new GpBridgeError("O arquivo principal não está presente no projeto.");
  }
}

export function compileGpProject(
  baseUrl: string,
  entryFile: string,
  files: GpProjectFile[],
): Promise<BridgeResult> {
  assertProjectLimits(entryFile, files);
  return request<BridgeResult>(baseUrl, "/api/compile-project", {
    method: "POST",
    body: JSON.stringify({ entryFile, files }),
  });
}

export function runGpProject(
  baseUrl: string,
  entryFile: string,
  files: GpProjectFile[],
): Promise<BridgeResult> {
  assertProjectLimits(entryFile, files);
  return request<BridgeResult>(baseUrl, "/api/run-project", {
    method: "POST",
    body: JSON.stringify({ entryFile, files }),
  });
}
