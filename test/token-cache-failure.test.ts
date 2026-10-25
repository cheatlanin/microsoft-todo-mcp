import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TokenCacheContext } from "@azure/msal-node";
import { expect, it, vi } from "vitest";

vi.mock("../src/auth/windows-dpapi", () => ({
  windowsDpapi: vi.fn(async () => { throw new Error("simulated OS protection failure"); }),
}));
import { fileCachePlugin } from "../src/auth/token-cache";

it.skipIf(process.platform !== "win32")("does not write plaintext when Windows protection fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "todo-mcp-failure-test-"));
  const path = join(directory, "cache.dpapi");
  try {
    const plugin = await fileCachePlugin(path);
    const context = {
      cacheHasChanged: true,
      tokenCache: { serialize: () => "AUDIT_DUMMY_REFRESH_TOKEN" },
    } as unknown as TokenCacheContext;
    await expect(plugin.afterCacheAccess(context)).rejects.toThrow("simulated OS protection failure");
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
