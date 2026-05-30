import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { requireWriter } from "@/lib/api-auth";

// GET /api/cup-note?cup_id=<id>
// Returns the note record for the current household + cup, or null if none exists.
// Requires an authenticated session (any role).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.pocketIdSub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const householdId = session.user.householdId;
  if (!householdId) {
    return NextResponse.json({ note: null });
  }

  const cup_id = req.nextUrl.searchParams.get("cup_id");
  if (!cup_id) return NextResponse.json({ error: "cup_id required" }, { status: 400 });

  const pb = await getAdminPocketBase();
  try {
    const record = await pb
      .collection("household_cup_notes")
      .getFirstListItem(`household_id="${householdId}" && cup_id="${cup_id}"`);
    return NextResponse.json({ note: record.note as string, id: record.id as string });
  } catch {
    return NextResponse.json({ note: null, id: null });
  }
}

// POST /api/cup-note
// Body: { cup_id: string; note: string }
// Upserts the note for the current household + cup. Owner-only.
export async function POST(req: NextRequest) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const householdId = session.user.householdId;
  if (!householdId) {
    return NextResponse.json({ error: "No household found for this user" }, { status: 400 });
  }

  const { cup_id, note } = await req.json() as { cup_id?: string; note?: string };
  if (!cup_id) return NextResponse.json({ error: "cup_id required" }, { status: 400 });

  const pb = await getAdminPocketBase();

  let existingId: string | null = null;
  try {
    const existing = await pb
      .collection("household_cup_notes")
      .getFirstListItem(`household_id="${householdId}" && cup_id="${cup_id}"`);
    existingId = existing.id as string;
  } catch { /* no existing record */ }

  const data = { household_id: householdId, cup_id, note: note ?? "" };

  if (existingId) {
    const record = await pb.collection("household_cup_notes").update(existingId, data);
    return NextResponse.json(record);
  } else {
    const record = await pb.collection("household_cup_notes").create(data);
    return NextResponse.json(record, { status: 201 });
  }
}
