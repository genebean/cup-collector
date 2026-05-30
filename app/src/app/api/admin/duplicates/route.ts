import { NextRequest, NextResponse } from "next/server";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { detectDuplicateGroups } from "@/lib/duplicate-detection";
import { requireWriter } from "@/lib/api-auth";
import type { Cup } from "@/types";

// GET /api/admin/duplicates
// Returns { groups: DuplicateGroup[], marked: Cup[] }
// groups = auto-detected potential duplicates
// marked = cups already flagged is_duplicate=true
export async function GET() {
  if (!await requireWriter()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pb = await getAdminPocketBase();
  const all = await pb.collection("cups").getFullList({ sort: "series,name" }) as unknown as Cup[];

  const groups = detectDuplicateGroups(all.filter((c) => !c.duplicate_ok));
  const marked = all.filter((c) => c.is_duplicate);

  return NextResponse.json({ groups, marked, all });
}

// PATCH /api/admin/duplicates
// Body: { cup_id: string; is_duplicate: boolean }
//   OR: { cup_ids: string[]; duplicate_ok: boolean }
export async function PATCH(req: NextRequest) {
  if (!await requireWriter()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const pb = await getAdminPocketBase();
  const body = await req.json() as
    | { cup_id: string; is_duplicate: boolean }
    | { cup_ids: string[]; duplicate_ok: boolean };

  if ("cup_ids" in body) {
    const { cup_ids, duplicate_ok } = body;
    if (!Array.isArray(cup_ids) || typeof duplicate_ok !== "boolean") {
      return NextResponse.json({ error: "cup_ids and duplicate_ok required" }, { status: 400 });
    }
    await Promise.all(cup_ids.map((id) => pb.collection("cups").update(id, { duplicate_ok })));
    return NextResponse.json({ ok: true });
  }

  const { cup_id, is_duplicate } = body;
  if (!cup_id || typeof is_duplicate !== "boolean") {
    return NextResponse.json({ error: "cup_id and is_duplicate required" }, { status: 400 });
  }
  const record = await pb.collection("cups").update(cup_id, { is_duplicate });
  return NextResponse.json(record);
}
