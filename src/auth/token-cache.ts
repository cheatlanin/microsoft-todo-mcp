import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { ICachePlugin, TokenCacheContext } from "@azure/msal-node";
import { windowsDpapi } from "./windows-dpapi";
import { AppError } from "../graph/errors";

/**
 * Windows uses OS DPAPI persistence, scoped to the current OS user.
 * POSIX retains a local file protected with 0600 permissions. There is no plaintext
 * fallback on Windows if native protection cannot be initialized.
 */
export async function fileCachePlugin(path: string): Promise<ICachePlugin> {
  return {
    async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
      let persisted: Buffer;
      try {
        persisted = await readFile(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw err;
      }
      const data = process.platform === "win32" ? await windowsDpapi(persisted, "Unprotect") : persisted;
      try {
        ctx.tokenCache.deserialize(data.toString("utf8"));
      } catch {
        throw new AppError("internal_error", "Token cache is invalid. Sign out and sign in again.");
      }
    },
    async afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
      if (!ctx.cacheHasChanged) return;
      const serialized = Buffer.from(ctx.tokenCache.serialize(), "utf8");
      const persisted = process.platform === "win32" ? await windowsDpapi(serialized, "Protect") : serialized;
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, persisted, { mode: 0o600, flag: "wx" });
        await rename(temporary, path);
      } finally {
        await unlink(temporary).catch((err: NodeJS.ErrnoException) => { if (err.code !== "ENOENT") throw err; });
      }
    },
  };
}

export async function clearCache(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
