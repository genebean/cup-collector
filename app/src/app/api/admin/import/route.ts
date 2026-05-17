import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { getAdminPocketBase } from "@/lib/pocketbase";
import { parseCSV, rowMatchesExisting } from "@/lib/cup-import";

async function downloadImage(url: string): Promise<File | null> {
  if (!url?.startsWith("http")) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const ext = url.split(".").pop()?.split("?")[0] ?? "jpg";
    return new File([buf], `cup.${ext}`, {
      type: ext === "png" ? "image/png" : "image/jpeg",
    });
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.pocketIdSub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.householdRole !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const csvFile = form.get("csv") as File | null;
  const dryRun = form.get("dry_run") === "on";

  if (!csvFile) {
    return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
  }

  const csvText = await csvFile.text();
  const rows = parseCSV(csvText);

  const pb = await getAdminPocketBase();
  const results = { created: 0, updated: 0, skipped: 0, errors: 0, preview: [] as string[] };

  for (const row of rows) {
    const label = `${row.name} / ${row.series} / ${row.year}`;
    try {
      let existingId: string | null = null;
      let existingRecord: Record<string, unknown> | null = null;
      try {
        const found = await pb.collection("cups").getFirstListItem(
          `name="${row.name}" && series="${row.series}" && year=${row.year}`
        );
        existingRecord = found;
        existingId = found.id as string;
      } catch { /* not found */ }

      const existingImageCredit = existingRecord ? String(existingRecord.image_credit ?? "") : null;
      const imageChanged = !!row.image_url && row.image_url !== existingImageCredit;
      const noChange = !!existingRecord && rowMatchesExisting(row, existingRecord) && !imageChanged;

      if (dryRun) {
        if (!existingId) {
          results.preview.push(`CREATE: ${label}`);
          results.created++;
        } else if (noChange) {
          results.preview.push(`NO CHANGE: ${label}`);
          results.skipped++;
        } else {
          results.preview.push(`UPDATE: ${label}`);
          results.updated++;
        }
        continue;
      }

      if (noChange) {
        results.skipped++;
        continue;
      }

      let imageFile: File | null = null;
      if (imageChanged) imageFile = await downloadImage(row.image_url);

      const data: Record<string, unknown> = {
        name: row.name, scope: row.scope || "city",
        venue_series: row.venue_series || undefined,
        item_type: row.item_type || "mug",
        region: row.region, country: row.country,
        country_code: row.country_code, series: row.series, year: row.year,
        lat: row.lat, lng: row.lng, image_credit: row.image_url || undefined,
        hobbydb_url: row.hobbydb_url || undefined,
        more_info_url: row.more_info_url || undefined,
        notes: row.notes,
      };
      if (imageFile) data.image = imageFile;

      if (existingId) {
        await pb.collection("cups").update(existingId, data);
        results.updated++;
      } else {
        await pb.collection("cups").create(data);
        results.created++;
      }
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({ dryRun, rows: rows.length, ...results });
}
