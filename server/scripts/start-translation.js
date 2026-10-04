import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localDirectory = path.join(serverDirectory, ".local-data");
const python = path.join(localDirectory, "translate-venv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");

if (!existsSync(python)) {
  console.error("Local LibreTranslate is not installed. See the translation setup in README.md.");
  process.exitCode = 1;
} else {
  const child = spawn(python, [
    "-c", "from libretranslate.main import main; main()",
    "--host", "127.0.0.1", "--port", String(process.env.COMMENT_TRANSLATE_PORT || 5001), "--load-only", process.env.COMMENT_TRANSLATE_LANGUAGES || "en,hi,es,fr,ur", "--disable-web-ui", "--threads", "2",
  ], {
    cwd: serverDirectory,
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_DATA_HOME: path.join(localDirectory, "translate-data"),
      XDG_CONFIG_HOME: path.join(localDirectory, "translate-config"),
      XDG_CACHE_HOME: path.join(localDirectory, "translate-cache"),
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
    },
  });
  child.on("error", (error) => { console.error("Could not start local translation:", error); process.exitCode = 1; });
  child.on("exit", (code) => { process.exitCode = code ?? 1; });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}
