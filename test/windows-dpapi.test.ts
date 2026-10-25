import { expect, it } from "vitest";
import { windowsDpapi } from "../src/auth/windows-dpapi";

it.skipIf(process.platform !== "win32")("round-trips Unicode and shell metacharacters as data", async () => {
  const original = Buffer.from('Тестовый токен: "quotes" $() `backticks` ; & | < >', "utf8");
  const encrypted = await windowsDpapi(original, "Protect");
  expect(encrypted.equals(original)).toBe(false);
  expect(await windowsDpapi(encrypted, "Unprotect")).toEqual(original);
}, 30_000);

it.skipIf(process.platform !== "win32")("rejects invalid ciphertext without reflecting its contents", async () => {
  const invalid = Buffer.from("AUDIT_FAKE_SECRET_NOT_ENCRYPTED");
  await expect(windowsDpapi(invalid, "Unprotect")).rejects.toMatchObject({
    code: "internal_error",
    message: "Windows DPAPI token protection failed. No plaintext fallback is permitted.",
  });
}, 20_000);
