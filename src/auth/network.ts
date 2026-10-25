import type { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-node";
import { AppError } from "../graph/errors";

interface AuthNetworkOptions {
  authority: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Bound identity requests, including response bodies; never log OAuth request data. */
export function createAuthNetworkClient(config: AuthNetworkOptions): INetworkModule {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 15_000;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const origins = new Set([new URL(config.authority).origin, "https://login.microsoftonline.com", "https://login.live.com"]);

  async function request<T>(method: "GET" | "POST", target: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
    let url: URL;
    try { url = new URL(target); } catch { throw new AppError("config_error", "Invalid Microsoft identity endpoint."); }
    if (url.protocol !== "https:" || !origins.has(url.origin) || url.username || url.password || url.hash) {
      throw new AppError("config_error", "Microsoft identity endpoint must use a trusted HTTPS origin.");
    }
    const grant = new URLSearchParams(options?.body ?? "").get("grant_type");
    // Device-code polling can safely repeat after a lost response. Do not replay
    // authorization-code redemption or refresh requests with an unknown outcome.
    const retryable = method === "GET" || url.pathname.endsWith("/devicecode") || grant === "urn:ietf:params:oauth:grant-type:device_code";
    const attempts = retryable ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await fetchImpl(url.href, {
          method,
          headers: options?.headers,
          body: method === "POST" ? options?.body : undefined,
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
        return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() as T };
      } catch {
        if (attempt + 1 === attempts) {
          throw new AppError("auth_required", "Microsoft identity request timed out or failed. Retry sign-in.");
        }
        await sleep(1000 * (attempt + 1));
      }
    }
    throw new AppError("auth_required", "Microsoft identity request failed.");
  }

  return {
    sendGetRequestAsync: <T>(url: string, options?: NetworkRequestOptions) => request<T>("GET", url, options),
    sendPostRequestAsync: <T>(url: string, options?: NetworkRequestOptions) => request<T>("POST", url, options),
  };
}
