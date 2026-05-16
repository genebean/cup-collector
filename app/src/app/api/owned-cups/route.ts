import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { getAdminPocketBase } from "@/lib/pocketbase";

async function requireWriter() {
  const session = await auth();
  if (!session?.user?.pocketIdSub) return null;
  if (session.user.householdRole !== "owner") return null;
  return session;
}

// POST /api/owned-cups
// Body: { cup_id: string }
// Creates the owned_cups record. Condition fields can be set immediately via
// PATCH once the record exists, or pre-populated here if provided.
export async function POST(req: NextRequest) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { cup_id } = await req.json();
  if (!cup_id) return NextResponse.json({ error: "cup_id required" }, { status: 400 });

  const householdId = session.user.householdId;
  if (!householdId) return NextResponse.json({ error: "No household found for this user" }, { status: 400 });

  const pb = await getAdminPocketBase();
  const record = await pb.collection("owned_cups").create({
    household_id: householdId,
    cup_id,
    marked_by_sub: session.user.pocketIdSub,
  });

  return NextResponse.json(record, { status: 201 });
}

// PATCH /api/owned-cups?id=<owned_cup_id>
// Two modes depending on Content-Type:
//   multipart/form-data — own_photo file upload; replaces the personal photo
//   application/json    — condition/acquisition field updates
export async function PATCH(req: NextRequest) {
  const session = await requireWriter();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const pb = await getAdminPocketBase();

  // File upload path — own_photo replacement
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const formData = await req.formData();
    const photo = formData.get("own_photo");
    if (!photo || !(photo instanceof File)) {
      return NextResponse.json({ error: "own_photo file required" }, { status: 400 });
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!allowed.includes(photo.type)) {
      return NextResponse.json(
        { error: `Unsupported image type: ${photo.type}. Allowed: jpeg, png, webp, heic.` },
        { status: 415 }
      );
    }
    const pbForm = new FormData();
    pbForm.append("own_photo", photo);
    const record = await pb.collection("owned_cups").update(id, pbForm);
    return NextResponse.json(record);
  }

  // JSON path — condition/acquisition fields
  const body = await req.json();

  // Only allow the condition/acquisition fields — never let callers overwrite
  // household_id, cup_id, or marked_by_sub through this endpoint.
  const allowed = [
    "needs_replacing",
    "replacement_note",
    "acquired_store_name",
    "acquired_store_address",
    "acquired_store_lat",
    "acquired_store_lng",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const record = await pb.collection("owned_cups").update(id, update);
  return NextResponse.json(record);
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
