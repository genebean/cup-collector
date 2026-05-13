// Authenticated PocketBase proxy.
//
// All browser-side PocketBase access goes through here. The route checks that
// the caller has a valid Auth.js session before forwarding to the internal
// PocketBase URL. PocketBase itself is not exposed publicly — only the Next.js
// app is (via nginx). This keeps collection data private to signed-in users.
//
// Works for:
//  - REST API calls (GET /api/pb/collections/cups/records)
//  - Realtime SSE (GET /api/pb/realtime)  — streamed through transparently
//  - File serving  (GET /api/pb/files/...)

import { auth } from "@/app/auth";
import { NextRequest, NextResponse } from "next/server";

const PB_INTERNAL = process.env.POCKETBASE_URL ?? "http://localhost:8090";

async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { path } = await context.params;
  const url = new URL(req.url);
  // path already includes "api/..." from the SDK — don't add another prefix
  const target = `${PB_INTERNAL}/${path.join("/")}${url.search}`;

  // Forward headers, stripping ones that would confuse PocketBase
  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lk = key.toLowerCase();
    if (lk === "host" || lk === "connection") continue;
    headers.set(key, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body !== null;

  const pbRes = await fetch(target, {
    method: req.method,
    headers,
    ...(hasBody ? { body: req.body, duplex: "half" } : {}),
  } as RequestInit);

  // Forward response headers, stripping ones Node.js manages itself
  const resHeaders = new Headers();
  for (const [key, value] of pbRes.headers.entries()) {
    const lk = key.toLowerCase();
    if (lk === "connection" || lk === "transfer-encoding") continue;
    resHeaders.set(key, value);
  }

  // Stream the body — required for SSE realtime subscriptions and file downloads
  return new Response(pbRes.body, {
    status: pbRes.status,
    headers: resHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
export const PATCH = handler;
export const PUT = handler;
