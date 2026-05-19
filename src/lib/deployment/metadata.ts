export type VercelEnvironment = "production" | "preview" | "development" | "unknown";

export interface StaticDeploymentMetadata {
  appVersion: string;
  commitSha: string;
  deploymentTimestamp: string;
  vercelEnv: string;
  vercelUrl: string;
  productionUrl?: string;
}

export interface DeploymentMetadata {
  appVersion: string;
  commitSha: string;
  shortCommitSha: string;
  deploymentTimestamp: string;
  vercelEnv: VercelEnvironment;
  deploymentUrl: string;
  productionUrl: string;
  isPreview: boolean;
  isProduction: boolean;
}

export interface DeploymentRuntimeState {
  buildId: string;
  runtimeVersionLabel: string;
  staleAssetDetected: boolean;
}

export interface DeploymentChecklistItem {
  id: "version" | "commit" | "timestamp" | "environment" | "preview-url" | "public-env" | "frontend-only";
  label: string;
  detail: string;
  state: "ready" | "attention";
}

export interface DeploymentChecklist {
  status: "ready" | "attention";
  items: DeploymentChecklistItem[];
}

interface PublicEnvValidation {
  errors: string[];
  warnings: string[];
}

type EnvMap = Record<string, unknown>;

const SECRET_KEY_PATTERN = /(secret|token|password|private|credential|api[_-]?key|client[_-]?secret)/i;
const VERCEL_ENVS = new Set(["production", "preview", "development"]);

export const staticDeploymentMetadata: StaticDeploymentMetadata = {
  appVersion: readStaticValue("__APP_VERSION__"),
  commitSha: readStaticValue("__COMMIT_SHA__"),
  deploymentTimestamp: readStaticValue("__DEPLOYMENT_TIMESTAMP__"),
  vercelEnv: readStaticValue("__VERCEL_ENV__"),
  vercelUrl: readStaticValue("__VERCEL_URL__"),
  productionUrl: readStaticValue("__VERCEL_PROJECT_PRODUCTION_URL__"),
};

export const deploymentMetadata = resolveDeploymentMetadata(
  import.meta.env as EnvMap,
  staticDeploymentMetadata
);

export const deploymentChecklist = buildDeploymentChecklist(
  deploymentMetadata,
  import.meta.env as EnvMap
);

export const deploymentRuntimeState = resolveDeploymentRuntimeState(deploymentMetadata);

export function resolveDeploymentMetadata(
  env: EnvMap,
  generated: StaticDeploymentMetadata
): DeploymentMetadata {
  const appVersion = firstString(env.VITE_APP_VERSION, generated.appVersion);
  const commitSha = firstString(env.VITE_COMMIT_SHA, generated.commitSha);
  const deploymentTimestamp = firstString(
    env.VITE_DEPLOYMENT_TIMESTAMP,
    generated.deploymentTimestamp
  );
  const vercelEnv = normalizeVercelEnv(firstString(env.VITE_VERCEL_ENV, generated.vercelEnv));
  const vercelUrl = firstString(env.VITE_VERCEL_URL, generated.vercelUrl);
  const productionUrl = firstString(
    env.VITE_VERCEL_PROJECT_PRODUCTION_URL,
    generated.productionUrl
  );

  return {
    appVersion,
    commitSha,
    shortCommitSha: shortenCommitSha(commitSha),
    deploymentTimestamp,
    vercelEnv,
    deploymentUrl: normalizeUrl(vercelUrl),
    productionUrl: normalizeUrl(productionUrl),
    isPreview: vercelEnv === "preview",
    isProduction: vercelEnv === "production",
  };
}

export function resolveDeploymentRuntimeState(
  metadata: DeploymentMetadata,
  previousBuildId?: string | null
): DeploymentRuntimeState {
  const buildId = [
    metadata.appVersion || "unknown-version",
    metadata.shortCommitSha || "unknown-commit",
    metadata.deploymentTimestamp || "unknown-build-time",
  ].join(":");
  const runtimeVersionLabel = `${metadata.appVersion || "unknown"} (${metadata.shortCommitSha || "unknown"})`;

  return {
    buildId,
    runtimeVersionLabel,
    staleAssetDetected: Boolean(previousBuildId && previousBuildId !== buildId),
  };
}

export function buildDeploymentChecklist(
  metadata: DeploymentMetadata,
  env: EnvMap
): DeploymentChecklist {
  const publicEnvValidation = validatePublicDeploymentEnv(env);
  const items: DeploymentChecklistItem[] = [
    {
      id: "version",
      label: "Version",
      detail: metadata.appVersion || "Missing VITE_APP_VERSION or package version.",
      state: metadata.appVersion ? "ready" : "attention",
    },
    {
      id: "commit",
      label: "Commit",
      detail: metadata.shortCommitSha || "Missing VITE_COMMIT_SHA or Vercel commit metadata.",
      state: metadata.commitSha ? "ready" : "attention",
    },
    {
      id: "timestamp",
      label: "Build time",
      detail: formatTimestamp(metadata.deploymentTimestamp),
      state: isValidTimestamp(metadata.deploymentTimestamp) ? "ready" : "attention",
    },
    {
      id: "environment",
      label: "Environment",
      detail: metadata.vercelEnv,
      state: metadata.vercelEnv === "unknown" ? "attention" : "ready",
    },
    {
      id: "preview-url",
      label: metadata.isProduction ? "Production URL" : "Preview URL",
      detail: metadata.deploymentUrl || metadata.productionUrl || "No deployment URL metadata.",
      state: metadata.deploymentUrl || metadata.productionUrl ? "ready" : "attention",
    },
    {
      id: "public-env",
      label: "Public env",
      detail:
        publicEnvValidation.errors.length === 0
          ? "No secret-shaped VITE_* keys detected."
          : publicEnvValidation.errors.join(" "),
      state: publicEnvValidation.errors.length === 0 ? "ready" : "attention",
    },
    {
      id: "frontend-only",
      label: "Frontend only",
      detail: "Static Vite bundle; no backend routes required for deployment metadata.",
      state: "ready",
    },
  ];

  return {
    status: items.some((item) => item.state === "attention") ? "attention" : "ready",
    items,
  };
}

export function validatePublicDeploymentEnv(env: EnvMap): PublicEnvValidation {
  const publicKeys = Object.keys(env).filter((key) => key.startsWith("VITE_"));
  const secretShapedKeys = publicKeys.filter((key) => SECRET_KEY_PATTERN.test(key));

  return {
    errors: secretShapedKeys.map(
      (key) => `${key} looks secret-shaped but VITE_* values are public.`
    ),
    warnings: [],
  };
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function normalizeVercelEnv(value: string): VercelEnvironment {
  return VERCEL_ENVS.has(value) ? (value as VercelEnvironment) : "unknown";
}

function normalizeUrl(value: string): string {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function shortenCommitSha(value: string): string {
  return value ? value.slice(0, 7) : "";
}

function isValidTimestamp(value: string): boolean {
  return value.length > 0 && !Number.isNaN(Date.parse(value));
}

function formatTimestamp(value: string): string {
  return isValidTimestamp(value) ? new Date(value).toISOString() : "Missing deployment timestamp.";
}

function readStaticValue(name: string): string {
  switch (name) {
    case "__APP_VERSION__":
      return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
    case "__COMMIT_SHA__":
      return typeof __COMMIT_SHA__ === "string" ? __COMMIT_SHA__ : "";
    case "__DEPLOYMENT_TIMESTAMP__":
      return typeof __DEPLOYMENT_TIMESTAMP__ === "string" ? __DEPLOYMENT_TIMESTAMP__ : "";
    case "__VERCEL_ENV__":
      return typeof __VERCEL_ENV__ === "string" ? __VERCEL_ENV__ : "";
    case "__VERCEL_URL__":
      return typeof __VERCEL_URL__ === "string" ? __VERCEL_URL__ : "";
    case "__VERCEL_PROJECT_PRODUCTION_URL__":
      return typeof __VERCEL_PROJECT_PRODUCTION_URL__ === "string"
        ? __VERCEL_PROJECT_PRODUCTION_URL__
        : "";
    default:
      return "";
  }
}
