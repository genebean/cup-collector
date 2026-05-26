import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DOCS_DIR = process.env.DOCS_DIR ?? path.join(process.cwd(), "..", "docs");

const MIME: Record<string, string> = {
  ".html":  "text/html; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".ico":   "image/x-icon",
  ".woff2": "font/woff2",
  ".woff":  "font/woff",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".svg":   "image/svg+xml",
};

// Styled 404 page using the docs' own CSS — consistent with the rest of /docs.
// Route handlers in Next.js App Router pass through 404 response bodies directly;
// notFound() from next/navigation is NOT used here because it throws a special
// error that Next.js swallows when thrown from a route handler (produces 0-byte body).
const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>404 — Page Not Found</title>
<link rel="stylesheet" href="/docs/shared.css">
</head>
<body>
<div class="topbar">
  <a href="/docs" class="topbar-brand">☕ Cup Collector</a>
  <nav class="topbar-nav"><a href="/docs">Docs home</a></nav>
</div>
<div class="hero" style="text-align:center;padding:4rem 1rem;">
  <h1>404</h1>
  <p class="tagline">This page could not be found.</p>
  <p><a href="/docs">← Back to documentation</a></p>
</div>
</body>
</html>`;

// Build substitution pairs from env vars written by the Nix module.
// Called per-request so it picks up the env at runtime, not build time.
function substitutions(): [string, string][] {
  const pairs: [string, string][] = [];
  try {
    if (process.env.NEXTAUTH_URL)
      pairs.push(["cups.yourdomain.com", new URL(process.env.NEXTAUTH_URL).host]);
    if (process.env.POCKETID_ISSUER_URL)
      pairs.push(["id.yourdomain.com", new URL(process.env.POCKETID_ISSUER_URL).host]);
    if (process.env.POCKETBASE_PUBLIC_URL)
      pairs.push(["pb.yourdomain.com", new URL(process.env.POCKETBASE_PUBLIC_URL).host]);
  } catch {
    // malformed URL — skip that substitution
  }
  return pairs;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path: segments } = await context.params;
  const requested = path.join(DOCS_DIR, ...(segments ?? []));

  // Path traversal guard
  const docsAbs = path.resolve(DOCS_DIR);
  const resolved = path.resolve(requested);
  if (resolved !== docsAbs && !resolved.startsWith(docsAbs + path.sep)) {
    return new NextResponse(NOT_FOUND_HTML, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let target = resolved;
  let isDir = false;

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    isDir = true;
    target = path.join(target, "index.html");
  }

  if (!fs.existsSync(target)) {
    return new NextResponse(NOT_FOUND_HTML, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  if (ext === ".html") {
    let html = fs.readFileSync(target, "utf-8");

    for (const [placeholder, replacement] of substitutions()) {
      html = html.replaceAll(placeholder, replacement);
    }

    // When served from the app (not GitHub Pages), inject a "← App" link
    // so users can navigate back without using the browser back button.
    if (process.env.NEXTAUTH_URL) {
      html = html.replace(
        '<nav class="topbar-nav">',
        '<nav class="topbar-nav"><a href="/">← App</a>'
      );
    }

    // When serving index.html for a directory request, the browser's base URL
    // is the directory path (e.g. /docs) rather than /docs/ — relative hrefs
    // like "shared.css" would resolve to /shared.css instead of /docs/shared.css.
    // Injecting <base> fixes resolution without requiring a redirect.
    if (isDir) {
      const reqPath = req.nextUrl.pathname;
      const base = reqPath.endsWith("/") ? reqPath : reqPath + "/";
      html = html.replace("<head>", `<head>\n  <base href="${base}">`);
    }

    return new NextResponse(html, { headers: { "Content-Type": contentType } });
  }

  const buf = fs.readFileSync(target);
  return new NextResponse(buf, { headers: { "Content-Type": contentType } });
}
