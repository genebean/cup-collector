import { NextResponse } from "next/server";
import { auth } from "@/app/auth";

// GET /api/map-config
// Hands the CARTO Basemaps API key to the client at request time. Not a
// NEXT_PUBLIC_ var — those get inlined into the client bundle during
// `next build`, which runs in the Nix build sandbox with no access to the
// runtime envFile. Reading it here keeps it a normal server-side env var
// that picks up the systemd-injected value on every request.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ cartoApiKey: process.env.CARTO_API_KEY ?? "" });
}
