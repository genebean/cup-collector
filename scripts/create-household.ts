#!/usr/bin/env ts-node
// Create a household record in PocketBase.
// MUST be run inside the Nix dev shell: enter with `nix develop` first.
//
// Usage:
//   create-household --name "Our Collection" --slug our_collection
//
// Credentials are read from app/.env.local (POCKETBASE_URL,
// POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD).
// To target production via SSH tunnel, override those vars in the shell:
//
//   POCKETBASE_URL=http://localhost:8090 \
//   POCKETBASE_ADMIN_EMAIL=admin@example.com \
//   POCKETBASE_ADMIN_PASSWORD=secret \
//   create-household --name "Our Collection" --slug our_collection

import PocketBase from "pocketbase";

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

const name = getArg("--name");
const slug = getArg("--slug");

if (!name || !slug) {
  console.error("Usage: create-household --name <display name> --slug <group-slug>");
  console.error("  --name   Display name shown in the app, e.g. \"Our Collection\"");
  console.error("  --slug   PocketID group slug, e.g. our_collection");
  console.error("           Groups must be named <slug>_owner and/or <slug>_viewer in PocketID.");
  process.exit(1);
}

const pbUrl = process.env.POCKETBASE_URL;
const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

if (!pbUrl || !adminEmail || !adminPassword) {
  console.error("Missing required environment variables:");
  if (!pbUrl) console.error("  POCKETBASE_URL");
  if (!adminEmail) console.error("  POCKETBASE_ADMIN_EMAIL");
  if (!adminPassword) console.error("  POCKETBASE_ADMIN_PASSWORD");
  console.error("\nThese are loaded from app/.env.local by the dev shell alias.");
  console.error("To target production via SSH tunnel, set them explicitly in the shell.");
  process.exit(1);
}

const pb = new PocketBase(pbUrl);

async function run() {
  await pb.collection("_superusers").authWithPassword(adminEmail!, adminPassword!);

  const existing = await pb.collection("households").getList(1, 1, {
    filter: `group_slug = "${slug}"`,
  });

  if (existing.items.length > 0) {
    const h = existing.items[0];
    console.log(`Household already exists — no changes made.`);
    console.log(`  id:         ${h.id}`);
    console.log(`  name:       ${h["name"]}`);
    console.log(`  group_slug: ${h["group_slug"]}`);
    process.exit(0);
  }

  const h = await pb.collection("households").create({ name, group_slug: slug });

  console.log(`Household created.`);
  console.log(`  id:         ${h.id}`);
  console.log(`  name:       ${h["name"]}`);
  console.log(`  group_slug: ${h["group_slug"]}`);
  console.log(``);
  console.log(`Next: create PocketID groups named "${slug}_owner" and/or "${slug}_viewer"`)
  console.log(`and add users to them. They will resolve to this household at sign-in.`);
}

run().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
