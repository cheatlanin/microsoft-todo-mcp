import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TokenCacheContext } from "@azure/msal-node";
import { describe, expect, it } from "vitest";
import { fileCachePlugin, clearCache } from "../src/auth/token-cache";

function cacheContext(initial = "", changed = false) {
  let data = initial;
  const context = {
    cacheHasChanged: changed,
    tokenCache: {
      serialize: () => data,
      deserialize: (value: string) => { data = value; },
    },
  } as unknown as TokenCacheContext;
  return { context, content: () => data, setContent: (value: string) => { data = value; } };
}

describe("persistent token cache", () => {
  it("round-trips a dummy cache; Windows never persists the secret in plaintext", async () => {
    const directory = await mkdtemp(join(tmpdir(), "todo-mcp-cache-test-"));
    const path = join(directory, "cache.dpapi");
    const dummy = JSON.stringify({ RefreshToken: { audit: { secret: "AUDIT_DUMMY_REFRESH_TOKEN" } } });
    try {
      const writer = await fileCachePlugin(path);
      const writing = cacheContext("", true);
      await writer.beforeCacheAccess(writing.context);
      try {
        writing.setContent(dummy);
      } finally {
        await writer.afterCacheAccess(writing.context);
      }
      const persisted = await readFile(path);
      if (process.platform === "win32") {
        expect(persisted.toString("utf8")).not.toContain("AUDIT_DUMMY_REFRESH_TOKEN");
        expect(persisted.equals(Buffer.from(dummy))).toBe(false);
      }

      const reader = await fileCachePlugin(path);
      const reading = cacheContext();
      await reader.beforeCacheAccess(reading.context);
      try {
        expect(reading.content()).toBe(dummy);
      } finally {
        await reader.afterCacheAccess(reading.context);
      }
      const replacement = dummy.replace("AUDIT_DUMMY_REFRESH_TOKEN", "AUDIT_REPLACEMENT_TOKEN");
      const updating = cacheContext("", true);
      await writer.beforeCacheAccess(updating.context);
      try {
        updating.setContent(replacement);
      } finally {
        await writer.afterCacheAccess(updating.context);
      }
      const updated = cacheContext();
      await reader.beforeCacheAccess(updated.context);
      try {
        expect(updated.content()).toBe(replacement);
      } finally {
        await reader.afterCacheAccess(updated.context);
      }
      await clearCache(path);
      await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
