import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { getAdminPocketBase } from "@/lib/pocketbase";
import type { CollectionPrefs } from "@/types";

// GET /api/household-prefs
// Returns collection_prefs for the current session's household.
export async function GET() {
  const session = await auth();
  if (!session?.user?.householdId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pb = await getAdminPocketBase();
  const household = await pb.collection("households").getOne(session.user.householdId);
  const prefs = (household.collection_prefs as CollectionPrefs | null) ?? {};
  return NextResponse.json(prefs);
}

// POST /api/household-prefs
// Owner-only. Replaces collection_prefs for the current household.
// Body: { excluded_series?: string[]; excluded_types?: string[] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.householdId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.user.householdRole !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const prefs: CollectionPrefs = {};
  if (Array.isArray(body.excluded_series)) {
    prefs.excluded_series = body.excluded_series.filter((s: unknown) => typeof s === "string");
  }
  if (Array.isArray(body.excluded_types)) {
    prefs.excluded_types = body.excluded_types.filter((t: unknown) => typeof t === "string");
  }

  const pb = await getAdminPocketBase();
  await pb.collection("households").update(session.user.householdId, { collection_prefs: prefs });
  return NextResponse.json(prefs);
}
