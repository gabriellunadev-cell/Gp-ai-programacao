
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredBaseUrl(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    const error = new Error("Supabase Auth não configurado.");
    error.code = "AUTH_NOT_CONFIGURED";
    throw error;
  }
  let url;
  try { url = new URL(env.SUPABASE_URL); }
  catch {
    const error = new Error("SUPABASE_URL inválida.");
    error.code = "AUTH_NOT_CONFIGURED";
    throw error;
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local))
    || url.username || url.password || url.search || url.hash) {
    const error = new Error("SUPABASE_URL deve usar HTTPS.");
    error.code = "AUTH_NOT_CONFIGURED";
    throw error;
  }
  return url;
}

/** Supabase Auth validates each token; no client-supplied identity or JWT claim is trusted. */
export function createSupabaseAuthenticator({ env = process.env, fetchImpl = fetch } = {}) {
  return async function authenticate(req) {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer ([^\s]+)$/.exec(header);
    if (!match) return null;

    const base = configuredBaseUrl(env);
    let response;
    try {
      response = await fetchImpl(new URL("/auth/v1/user", base), {
        method: "GET",
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: "Bearer " + match[1],
          accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      const error = new Error("Supabase Auth indisponível.");
      error.code = "AUTH_PROVIDER_UNAVAILABLE";
      throw error;
    }

    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) {
      const error = new Error("Supabase Auth retornou uma falha.");
      error.code = "AUTH_PROVIDER_UNAVAILABLE";
      throw error;
    }
    let user;
    try { user = await response.json(); }
    catch {
      const error = new Error("Resposta inválida do Supabase Auth.");
      error.code = "AUTH_PROVIDER_UNAVAILABLE";
      throw error;
    }
    if (!user || typeof user.id !== "string" || !UUID_PATTERN.test(user.id)) return null;
    return {
      id: user.id.toLowerCase(),
      email: typeof user.email === "string" ? user.email.slice(0, 254) : null,
    };
  };
}

export { UUID_PATTERN };
