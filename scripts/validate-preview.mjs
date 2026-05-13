#!/usr/bin/env node

const DEFAULT_TIMEOUT_MS = 15000;

const rawUrl =
  process.argv.find((arg) => /^https?:\/\//i.test(arg)) ||
  process.env.DEPLOYMENT_URL ||
  process.env.VERCEL_URL ||
  "";

if (!rawUrl) {
  console.error("Usage: npm run deploy:preview -- https://your-preview.vercel.app");
  process.exit(1);
}

const previewUrl = normalizeUrl(rawUrl);
const failures = [];

console.log(`Preview validation: ${previewUrl}`);

const page = await fetchWithTimeout(previewUrl);
record("HTML response", page.ok, `${page.status} ${page.statusText}`);

const contentType = page.headers.get("content-type") || "";
record("HTML content type", contentType.includes("text/html"), contentType || "missing content-type");

const html = await page.text();
record("Vite root", html.includes('id="root"'), 'Expected <div id="root"> in HTML.');
record("Unresolved env tokens", !/%VITE_|__APP_/i.test(html), "No unresolved Vite placeholders in HTML.");

const assetUrls = findLocalAssetUrls(html, previewUrl);
record(
  "Asset discovery",
  assetUrls.length > 0,
  assetUrls.length > 0 ? `${assetUrls.length} local asset(s) found.` : "No local JS/CSS assets found."
);

for (const assetUrl of assetUrls) {
  const asset = await fetchWithTimeout(assetUrl);
  record(`Asset ${new URL(assetUrl).pathname}`, asset.ok, `${asset.status} ${asset.statusText}`);
}

if (failures.length > 0) {
  console.error("\nPreview validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\nPreview validation passed.");

function record(label, ok, detail) {
  console.log(`${ok ? "OK" : "FAIL"} ${label} - ${detail}`);
  if (!ok) failures.push(`${label}: ${detail}`);
}

function normalizeUrl(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "ai-superhub-preview-validator/1.0",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function findLocalAssetUrls(html, baseUrl) {
  const assetUrls = new Set();
  const pattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const candidate = match[1];
    if (!candidate || candidate.startsWith("data:") || candidate.startsWith("#")) continue;

    const assetUrl = new URL(candidate, baseUrl);
    if (assetUrl.origin !== new URL(baseUrl).origin) continue;
    if (!/\.(js|css)(?:$|\?)/i.test(assetUrl.pathname)) continue;

    assetUrls.add(assetUrl.toString());
  }

  return Array.from(assetUrls);
}
