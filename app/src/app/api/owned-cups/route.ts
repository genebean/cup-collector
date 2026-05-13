import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { roleFromGroups, canWrite } from "@/lib/roles";
import { getAdminPocketBase } from "@/lib/pocketbase";

async function requireWriter() {
  const session = await auth();
  if (!session?.user?.pocketIdSub) return null;
  const role = roleFromGroups(session.user.groups ?? []);
  if (!canWrite(role)) return null;
  return session;
}

// POST /api/owned-cups  { cup_id: string }
export async function POST(req: NextRequest) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { cup_id } = await req.json();
  if (!cup_id) return NextResponse.json({ error: "cup_id required" }, { status: 400 });

  const pb = await getAdminPocketBase();

  // Get the single household
  const households = await pb.collection("households").getList(1, 1);
  const household = households.items[0];
  if (!household) return NextResponse.json({ error: "No household configured" }, { status: 500 });

  const record = await pb.collection("owned_cups").create({
    household_id: household.id,
    cup_id,
    marked_by_sub: session.user.pocketIdSub,
  });

  return NextResponse.json(record, { status: 201 });
}

// DELETE /api/owned-cups?id=<owned_cup_id>
export async function DELETE(req: NextRequest) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const pb = await getAdminPocketBase();
  await pb.collection("owned_cups").delete(id);

  return new NextResponse(null, { status: 204 });
}
