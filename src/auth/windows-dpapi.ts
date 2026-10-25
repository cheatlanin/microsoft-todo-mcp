import { execFile } from "node:child_process";
import { join } from "node:path";
import { AppError } from "../graph/errors";

/** Use the OS DPAPI implementation. Secrets travel through pipes, never argv or files. */
export function windowsDpapi(data: Buffer, operation: "Protect" | "Unprotect"): Promise<Buffer> {
  if (process.platform !== "win32") throw new AppError("config_error", "Windows DPAPI is only available on Windows.");
  if (operation !== "Protect" && operation !== "Unprotect") throw new AppError("validation_error", "Invalid DPAPI operation.");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    "$data = [Convert]::FromBase64String([Console]::In.ReadToEnd())",
    `$result = [Security.Cryptography.ProtectedData]::${operation}($data, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    "[Console]::Out.Write([Convert]::ToBase64String($result))",
  ].join("; ");
  const executable = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise((resolve, reject) => {
    const child = execFile(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 16 * 1024 * 1024,
      encoding: "utf8",
    }, (error, stdout) => {
      if (error || !stdout.trim()) {
        // Do not include process output: it could contain sensitive material.
        reject(new AppError("internal_error", "Windows DPAPI token protection failed. No plaintext fallback is permitted."));
        return;
      }
      resolve(Buffer.from(stdout.trim(), "base64"));
    });
    child.stdin?.on("error", () => { /* execFile reports child failures above. */ });
    child.stdin?.end(data.toString("base64"));
  });
}
