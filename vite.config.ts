import path from "path";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {
  version?: string;
};

function manualChunks(id: string) {
  if (!id.includes("node_modules")) return;

  if (
    id.includes("react-syntax-highlighter") ||
    id.includes("prismjs") ||
    id.includes("refractor") ||
    id.includes("highlight.js") ||
    id.includes("lowlight")
  ) {
    return "syntax";
  }

  if (
    id.includes("react-markdown") ||
    id.includes("unified") ||
    id.includes("remark-") ||
    id.includes("rehype-") ||
    id.includes("micromark") ||
    id.includes("mdast") ||
    id.includes("hast") ||
    id.includes("unist") ||
    id.includes("vfile")
  ) {
    return "markdown";
  }

  if (id.includes("framer-motion") || id.includes("/motion/")) {
    return "motion";
  }

  if (id.includes("lucide-react")) {
    return "icons";
  }

  if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("\\react\\") || id.includes("\\react-dom\\")) {
    return "react-vendor";
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const singleFile = mode === "singlefile" || process.env.SINGLE_FILE === "true";

  return {
    plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile()] : [])],
    define: createDeploymentDefines(),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    build: singleFile
      ? undefined
      : {
          cssCodeSplit: true,
          rollupOptions: {
            output: {
              manualChunks,
            },
          },
        },
  };
});

function createDeploymentDefines() {
  const commitSha =
    process.env.VITE_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    readGitCommitSha();

  return {
    __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION || packageJson.version || ""),
    __COMMIT_SHA__: JSON.stringify(commitSha),
    __DEPLOYMENT_TIMESTAMP__: JSON.stringify(
      process.env.VITE_DEPLOYMENT_TIMESTAMP || new Date().toISOString()
    ),
    __VERCEL_ENV__: JSON.stringify(process.env.VITE_VERCEL_ENV || process.env.VERCEL_ENV || ""),
    __VERCEL_URL__: JSON.stringify(process.env.VITE_VERCEL_URL || process.env.VERCEL_URL || ""),
    __VERCEL_PROJECT_PRODUCTION_URL__: JSON.stringify(
      process.env.VITE_VERCEL_PROJECT_PRODUCTION_URL ||
        process.env.VERCEL_PROJECT_PRODUCTION_URL ||
        ""
    ),
  };
}

function readGitCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
