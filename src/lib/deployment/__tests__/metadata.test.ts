import { describe, expect, it } from "vitest";
import {
  buildDeploymentChecklist,
  resolveDeploymentRuntimeState,
  resolveDeploymentMetadata,
  validatePublicDeploymentEnv,
} from "@/lib/deployment/metadata";

describe("deployment metadata", () => {
  it("prefers Vite-provided deployment values and normalizes Vercel URLs", () => {
    const metadata = resolveDeploymentMetadata(
      {
        VITE_APP_VERSION: "2.4.6",
        VITE_COMMIT_SHA: "1234567890abcdef",
        VITE_DEPLOYMENT_TIMESTAMP: "2026-05-13T11:42:00.000Z",
        VITE_VERCEL_ENV: "preview",
        VITE_VERCEL_URL: "ai-superhub-git-feature-team.vercel.app",
      },
      {
        appVersion: "0.0.0",
        commitSha: "fallback",
        deploymentTimestamp: "2020-01-01T00:00:00.000Z",
        vercelEnv: "development",
        vercelUrl: "",
      }
    );

    expect(metadata).toMatchObject({
      appVersion: "2.4.6",
      commitSha: "1234567890abcdef",
      shortCommitSha: "1234567",
      deploymentTimestamp: "2026-05-13T11:42:00.000Z",
      vercelEnv: "preview",
      deploymentUrl: "https://ai-superhub-git-feature-team.vercel.app",
      isPreview: true,
    });
  });

  it("falls back to generated static metadata when Vite env values are absent", () => {
    const metadata = resolveDeploymentMetadata(
      {},
      {
        appVersion: "1.0.0",
        commitSha: "abcdef123456",
        deploymentTimestamp: "2026-05-13T12:00:00.000Z",
        vercelEnv: "production",
        vercelUrl: "ai-superhub.vercel.app",
        productionUrl: "ai-superhub.com",
      }
    );

    expect(metadata).toMatchObject({
      appVersion: "1.0.0",
      shortCommitSha: "abcdef1",
      vercelEnv: "production",
      deploymentUrl: "https://ai-superhub.vercel.app",
      productionUrl: "https://ai-superhub.com",
      isProduction: true,
    });
  });

  it("builds a deployment checklist with attention items for missing metadata", () => {
    const checklist = buildDeploymentChecklist(
      resolveDeploymentMetadata(
        {},
        {
          appVersion: "",
          commitSha: "",
          deploymentTimestamp: "",
          vercelEnv: "",
          vercelUrl: "",
        }
      ),
      { VITE_OPENAI_API_KEY: "should-not-be-public" }
    );

    expect(checklist.status).toBe("attention");
    expect(checklist.items.filter((item) => item.state === "attention").map((item) => item.id)).toEqual(
      expect.arrayContaining(["version", "commit", "timestamp", "environment", "public-env"])
    );
  });

  it("passes the checklist when deployment metadata is complete and public env is safe", () => {
    const metadata = resolveDeploymentMetadata(
      {
        VITE_APP_VERSION: "1.2.3",
        VITE_COMMIT_SHA: "abcdef123456",
        VITE_DEPLOYMENT_TIMESTAMP: "2026-05-13T12:00:00.000Z",
        VITE_VERCEL_ENV: "preview",
        VITE_VERCEL_URL: "ai-superhub-preview.vercel.app",
      },
      {
        appVersion: "",
        commitSha: "",
        deploymentTimestamp: "",
        vercelEnv: "",
        vercelUrl: "",
      }
    );

    const checklist = buildDeploymentChecklist(metadata, { VITE_APP_NAME: "AI Superhub" });

    expect(checklist.status).toBe("ready");
    expect(checklist.items.every((item) => item.state === "ready")).toBe(true);
  });

  it("derives deterministic runtime build identity and stale asset state", () => {
    const metadata = resolveDeploymentMetadata(
      {
        VITE_APP_VERSION: "1.2.3",
        VITE_COMMIT_SHA: "abcdef123456",
        VITE_DEPLOYMENT_TIMESTAMP: "2026-05-13T12:00:00.000Z",
        VITE_VERCEL_ENV: "production",
        VITE_VERCEL_URL: "ai-superhub.vercel.app",
      },
      {
        appVersion: "",
        commitSha: "",
        deploymentTimestamp: "",
        vercelEnv: "",
        vercelUrl: "",
      }
    );

    expect(resolveDeploymentRuntimeState(metadata, "1.2.2:oldsha:2026-05-12T00:00:00.000Z")).toMatchObject({
      buildId: "1.2.3:abcdef1:2026-05-13T12:00:00.000Z",
      runtimeVersionLabel: "1.2.3 (abcdef1)",
      staleAssetDetected: true,
    });
    expect(resolveDeploymentRuntimeState(metadata, "1.2.3:abcdef1:2026-05-13T12:00:00.000Z")).toMatchObject({
      staleAssetDetected: false,
    });
  });
});

describe("public deployment env validation", () => {
  it("blocks secret-shaped Vite env keys because they are bundled into the frontend", () => {
    expect(
      validatePublicDeploymentEnv({
        VITE_PUBLIC_LABEL: "ok",
        VITE_STRIPE_SECRET_KEY: "leak",
        VITE_PASSWORD: "leak",
      }).errors
    ).toEqual([
      "VITE_STRIPE_SECRET_KEY looks secret-shaped but VITE_* values are public.",
      "VITE_PASSWORD looks secret-shaped but VITE_* values are public.",
    ]);
  });
});
