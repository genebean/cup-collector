import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/auth";
import { getAdminPocketBase } from "@/lib/pocketbase";

interface CsvRow {
  city: string;
  region: string;
  country: string;
  country_code: string;
  series: string;
  year: number;
  lat: number;
  lng: number;
  image_url: string;
  notes: string;
}

function parseCSV(text: string): CsvRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });

    if (!row.city || !row.series || !row.year) continue;

    rows.push({
      city: row.city,
      region: row.region ?? "",
      country: row.country ?? "",
      country_code: row.country_code ?? "",
      series: row.series,
      year: parseInt(row.year, 10),
      lat: parseFloat(row.lat) || 0,
      lng: parseFloat(row.lng) || 0,
      image_url: row.image_url ?? "",
      notes: row.notes ?? "",
    });
  }
  return rows;
}

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
  const results = { created: 0, updated: 0, errors: 0, preview: [] as string[] };

  for (const row of rows) {
    const label = `${row.city} / ${row.series} / ${row.year}`;
    try {
      let existingId: string | null = null;
      try {
        const existing = await pb.collection("cups").getFirstListItem(
          `city="${row.city}" && series="${row.series}" && year=${row.year}`
        );
        existingId = existing.id;
      } catch { /* not found */ }

      if (dryRun) {
        results.preview.push(`${existingId ? "UPDATE" : "CREATE"}: ${label}`);
        if (existingId) { results.updated++; } else { results.created++; }
        continue;
      }

      let imageFile: File | null = null;
      if (row.image_url) imageFile = await downloadImage(row.image_url);

      const data: Record<string, unknown> = {
        city: row.city, region: row.region, country: row.country,
        country_code: row.country_code, series: row.series, year: row.year,
        lat: row.lat, lng: row.lng, image_credit: row.image_url || undefined,
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
