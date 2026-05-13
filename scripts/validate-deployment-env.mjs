#!/usr/bin/env node

const SECRET_KEY_PATTERN = /(secret|token|password|private|credential|api[_-]?key|client[_-]?secret)/i;
const ALLOWED_VERCEL_ENVS = new Set(["production", "preview", "development"]);

const args = new Set(process.argv.slice(2));
const ciMode = args.has("--ci");

const checks = [];
const errors = [];

function addCheck(label, ok, detail) {
  checks.push({ label, ok, detail });
  if (!ok) errors.push(`${label}: ${detail}`);
}

const publicEnvKeys = Object.keys(process.env).filter((key) => key.startsWith("VITE_"));
const secretShapedPublicKeys = publicEnvKeys.filter((key) => SECRET_KEY_PATTERN.test(key));

addCheck(
  "Public Vite env",
  secretShapedPublicKeys.length === 0,
  secretShapedPublicKeys.length === 0
    ? "No secret-shaped VITE_* keys detected."
    : `${secretShapedPublicKeys.join(", ")} must not be exposed to the browser bundle.`
);

const vercelEnv = process.env.VITE_VERCEL_ENV || process.env.VERCEL_ENV || "";
addCheck(
  "Vercel environment",
  vercelEnv === "" || ALLOWED_VERCEL_ENVS.has(vercelEnv),
  vercelEnv === ""
    ? "No Vercel environment set; local builds will display unknown."
    : `${vercelEnv} is not one of production, preview, development.`
);

const timestamp = process.env.VITE_DEPLOYMENT_TIMESTAMP;
addCheck(
  "Deployment timestamp",
  !timestamp || !Number.isNaN(Date.parse(timestamp)),
  timestamp ? "Timestamp is ISO-parseable." : "No override set; Vite build metadata will generate one."
);

if (ciMode) {
  for (const key of ["VERCEL_TOKEN", "VERCEL_ORG_ID", "VERCEL_PROJECT_ID"]) {
    addCheck(
      key,
      typeof process.env[key] === "string" && process.env[key].length > 0,
      process.env[key] ? "Present." : "Required for non-interactive Vercel CI deploys."
    );
  }
}

console.log("Deployment environment validation");
for (const check of checks) {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.label} - ${check.detail}`);
}

if (errors.length > 0) {
  console.error("\nDeployment env validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}
