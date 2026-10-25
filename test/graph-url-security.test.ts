import { describe, expect, it, vi } from "vitest";
import { GraphClient } from "../src/graph/client";
import { collectPages, encodeCursor, type Page } from "../src/graph/pagination";
import { createLogger } from "../src/lib/logger";
import type { AppConfig } from "../src/config";

function fixture(graphBase = "https://graph.microsoft.com/v1.0") {
  const getAccessToken = vi.fn(async () => "dummy-token");
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ value: [] }), { status: 200 }));
  const client = new GraphClient({
    config: { graphBase } as AppConfig,
    tokens: { getAccessToken, accountId: () => "dummy-account" },
    logger: createLogger("silent"),
    ids: { uuid: () => "dummy-request-id" },
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, getAccessToken, fetchImpl };
}

describe("Graph credential destination", () => {
  it.each([
    "https://collector.example.invalid/capture",
    "https://graph.microsoft.com.example.invalid/v1.0/me/todo/lists",
    "https://graph.microsoft.com@collector.example.invalid/capture",
    "https://graph.microsoft.com:444/v1.0/me/todo/lists",
    "http://graph.microsoft.com/v1.0/me/todo/lists",
    "http://127.0.0.1:49152/capture",
    "file:///etc/passwd",
    "https://user:password@graph.microsoft.com/v1.0/me/todo/lists",
    "https://graph.microsoft.com/v1.0/me/todo/lists#fragment",
  ])("rejects an unsafe pagination cursor before acquiring credentials: %s", async (target) => {
    const { client, getAccessToken, fetchImpl } = fixture();
    await expect(collectPages(
      () => client.request<Page<unknown>>("GET", "/me/todo/lists"),
      (url) => client.request<Page<unknown>>("GET", url),
      100,
      encodeCursor(target),
    )).rejects.toMatchObject({ code: "validation_error" });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects an off-origin nextLink returned by a page", async () => {
    const { client, fetchImpl, getAccessToken } = fixture();
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({
      value: [], "@odata.nextLink": "https://collector.example.invalid/capture",
    }), { status: 200 }));
    await expect(collectPages(
      () => client.request<Page<unknown>>("GET", "/me/todo/lists"),
      (url) => client.request<Page<unknown>>("GET", url),
      100,
    )).rejects.toMatchObject({ code: "validation_error" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("preserves valid Graph pagination query parameters and disables redirects", async () => {
    const { client, fetchImpl } = fixture();
    const target = "https://graph.microsoft.com/v1.0/me/todo/lists?$skiptoken=encoded%2Bvalue";
    await collectPages(
      () => client.request<Page<unknown>>("GET", "/me/todo/lists"),
      (url) => client.request<Page<unknown>>("GET", url),
      100,
      encodeCursor(target),
    );
    expect(fetchImpl).toHaveBeenCalledWith(target, expect.objectContaining({
      redirect: "error",
      headers: expect.objectContaining({ Authorization: "Bearer dummy-token" }),
    }));
  });

  it.each([
    "http://graph.microsoft.com/v1.0",
    "https://user:password@graph.microsoft.com/v1.0",
    "https://graph.microsoft.com/v1.0?unexpected=true",
    "https://graph.microsoft.com/v1.0#unexpected",
    "not-a-url",
  ])("rejects an unsafe Graph base before acquiring credentials: %s", async (base) => {
    const { client, fetchImpl, getAccessToken } = fixture(base);
    await expect(client.request("GET", "/me/todo/lists")).rejects.toMatchObject({ code: "config_error" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("keeps the configured sovereign Graph origin working", async () => {
    const { client, fetchImpl } = fixture("https://graph.microsoft.us/v1.0");
    await client.request("GET", "/me/todo/lists");
    expect(fetchImpl).toHaveBeenCalledWith("https://graph.microsoft.us/v1.0/me/todo/lists", expect.any(Object));
  });
});
