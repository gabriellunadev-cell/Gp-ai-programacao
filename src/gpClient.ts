export type BridgeHealth = {
  ok: boolean;
  service: string;
  version?: string;
  compilerAvailable?: boolean;
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
    response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
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
      payload?.error ?? payload?.message ?? `GP Bridge respondeu com HTTP ${response.status}.`,
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
