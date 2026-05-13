#!/usr/bin/env node

import { spawnSync } from "child_process";

const target = process.argv[2] === "production" ? "production" : "preview";
const isProduction = target === "production";
const vercelEnvironment = isProduction ? "production" : "preview";
const tokenArgs = process.env.VERCEL_TOKEN ? ["--token", process.env.VERCEL_TOKEN] : [];
const ciArgs = process.env.CI || process.env.VERCEL_TOKEN ? ["--ci"] : [];

run(process.execPath, ["scripts/validate-deployment-env.mjs", ...ciArgs]);
run("vercel", ["pull", "--yes", `--environment=${vercelEnvironment}`, ...tokenArgs]);
run("vercel", ["build", ...(isProduction ? ["--prod"] : []), ...tokenArgs]);
run("vercel", ["deploy", "--prebuilt", ...(isProduction ? ["--prod"] : []), ...tokenArgs]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
