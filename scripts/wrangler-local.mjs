import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const localConfigDirectory = resolve(projectRoot, ".wrangler", "config");
const localLogPath = resolve(projectRoot, ".wrangler", "wrangler.log");

mkdirSync(localConfigDirectory, { recursive: true });

const wranglerEntrypoint = resolve(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const result = spawnSync(
  process.execPath,
  [
    wranglerEntrypoint,
    ...process.argv.slice(2),
    "--config=wrangler.local.jsonc",
  ],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: localLogPath,
      XDG_CONFIG_HOME: localConfigDirectory,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error);
}

process.exitCode = result.status ?? 1;
