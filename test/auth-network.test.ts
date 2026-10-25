import { expect, it, vi } from "vitest";
import { createAuthNetworkClient } from "../src/auth/network";

const authority = "https://login.microsoftonline.com/consumers";
const endpoint = `${authority}/oauth2/v2.0/token`;
const body = "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&device_code=DUMMY";

it("retries a transient polling transport failure and returns the HTTP response", async () => {
  const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("temporary network error")).mockResolvedValueOnce(new Response('{"error":"authorization_pending"}', { status: 400 }));
  const client = createAuthNetworkClient({ authority, fetchImpl, sleep: async () => {} });
  expect(await client.sendPostRequestAsync(endpoint, { body })).toMatchObject({ status: 400, body: { error: "authorization_pending" } });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl).toHaveBeenLastCalledWith(endpoint, expect.objectContaining({ redirect: "error" }));
});

it("times out a hung polling request and limits retries", async () => {
  const fetchImpl = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("timeout")));
  }));
  const client = createAuthNetworkClient({ authority, fetchImpl: fetchImpl as typeof fetch, timeoutMs: 20, sleep: async () => {} });
  await expect(client.sendPostRequestAsync(endpoint, { body })).rejects.toMatchObject({ code: "auth_required" });
  expect(fetchImpl).toHaveBeenCalledTimes(3);
});

it("does not replay one-time code redemption on transport failures", async () => {
  const fetchImpl = vi.fn().mockRejectedValue(new Error("lost response"));
  const client = createAuthNetworkClient({ authority, fetchImpl });
  await expect(client.sendPostRequestAsync(endpoint, { body: "grant_type=authorization_code&code=DUMMY" })).rejects.toMatchObject({ code: "auth_required" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("rejects identity endpoints outside the configured trust boundary", async () => {
  const fetchImpl = vi.fn();
  const client = createAuthNetworkClient({ authority, fetchImpl });
  await expect(client.sendPostRequestAsync("https://collector.example.invalid/token", { body })).rejects.toMatchObject({ code: "config_error" });
  expect(fetchImpl).not.toHaveBeenCalled();
});
