// Start the built standalone server, including its emitted assets, on loopback.
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const built = resolve(root, "apps/web/.next");
const server = resolve(built, "standalone/apps/web/server.js");
if (!existsSync(server)) {
  console.error("Build the web app before starting it.");
  process.exit(1);
}
cpSync(
  resolve(built, "static"),
  resolve(built, "standalone/apps/web/.next/static"),
  { recursive: true },
);
const child = spawn(process.execPath, [server], {
  stdio: "inherit",
  env: {
    ...process.env,
    HOSTNAME: "127.0.0.1",
    PORT: process.env.DIDBAN_WEB_PORT || "18148",
    NEXT_TELEMETRY_DISABLED: "1",
  },
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
