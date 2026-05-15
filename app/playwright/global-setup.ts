import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PocketBase from "pocketbase";
import { PB_PORT, PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, PB_CONTAINER } from "./test-pb.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the image tag from nixos/module.nix — single source of truth, kept current by Renovate.
function getPbImage(): string {
  const moduleNix = readFileSync(resolve(__dirname, "../../nixos/module.nix"), "utf-8");
  const match = moduleNix.match(/ghcr\.io\/muchobien\/pocketbase:([\d.]+)/);
  if (!match) throw new Error("Cannot determine PocketBase image version from nixos/module.nix");
  return `ghcr.io/muchobien/pocketbase:${match[1]}`;
}
const PB_IMAGE = getPbImage();
const MIGRATIONS_DIR = resolve(__dirname, "../../pocketbase/migrations");
const PB_DATA_DIR = "/tmp/playwright-pb-data";
const STATE_FILE = "/tmp/playwright-pb-state.json";

function detectRuntime(): string {
  try {
    execSync("which podman", { stdio: "pipe" });
    return "podman";
  } catch {
    return "docker";
  }
}

async function waitForHealthy(url: string, maxMs = 60_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`PocketBase did not become healthy at ${url} within ${maxMs}ms`);
}

export default async function globalSetup() {
  const rt = detectRuntime();

  // Reuse if already running on the test port (local dev convenience — e.g. from a previous aborted run)
  if (!process.env.CI) {
    try {
      const res = await fetch(`${PB_URL}/api/health`);
      if (res.ok) {
        writeFileSync(STATE_FILE, JSON.stringify({ reused: true }));
        return;
      }
    } catch {}
  }

  // Remove any stale container from a previous run
  spawnSync(rt, ["rm", "-f", PB_CONTAINER], { stdio: "ignore" });

  // Start with a clean data directory so tests are fully isolated
  rmSync(PB_DATA_DIR, { recursive: true, force: true });
  mkdirSync(PB_DATA_DIR, { recursive: true });

  execSync(
    [
      rt, "run", "-d",
      "--name", PB_CONTAINER,
      `-v "${MIGRATIONS_DIR}:/pb/pb_migrations:ro"`,
      `-v "${PB_DATA_DIR}:/pb/pb_data"`,
      `-p 127.0.0.1:${PB_PORT}:8090`, // host:8091 → container:8090
      PB_IMAGE,
      "serve",
      "--dir=/pb/pb_data",
      "--migrationsDir=/pb/pb_migrations",
      "--http=0.0.0.0:8090", // container-internal port; host sees it as PB_PORT (8091)
    ].join(" ")
  );

  writeFileSync(STATE_FILE, JSON.stringify({ reused: false, container: PB_CONTAINER, runtime: rt }));

  await waitForHealthy(`${PB_URL}/api/health`);

  // Create the initial superuser via the PocketBase CLI inside the running container.
  // PocketBase 0.22+ supports `superusers upsert` while the server is running.
  execSync(
    `${rt} exec ${PB_CONTAINER} pocketbase superuser upsert "${PB_ADMIN_EMAIL}" "${PB_ADMIN_PASSWORD}" --dir=/pb/pb_data`,
    { stdio: "pipe" }
  );

  // Authenticate and seed test data
  const pb = new PocketBase(PB_URL);
  await pb.collection("_superusers").authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
  await seedTestData(pb);
}

async function seedTestData(pb: PocketBase): Promise<void> {
  // The dev-bypass auth provider generates groups like "test-household-owner" and
  // "test-household-viewer". The JWT callback uses group_slug to resolve the household.
  await pb.collection("households").create({
    name: "Test Household",
    group_slug: "test-household",
  });

  const cups = [
    { city: "Seattle", region: "WA", country: "United States", country_code: "US", series: "Been There", year: 2018, lat: 47.6062, lng: -122.3321 },
    { city: "Atlanta", region: "GA", country: "United States", country_code: "US", series: "Been There", year: 2019, lat: 33.749, lng: -84.388 },
    { city: "London", region: "", country: "United Kingdom", country_code: "GB", series: "Been There", year: 2019, lat: 51.5074, lng: -0.1278 },
    { city: "Tokyo", region: "", country: "Japan", country_code: "JP", series: "Been There", year: 2020, lat: 35.6762, lng: 139.6503 },
    { city: "Sydney", region: "NSW", country: "Australia", country_code: "AU", series: "Been There", year: 2020, lat: -33.8688, lng: 151.2093 },
  ];
  for (const cup of cups) {
    await pb.collection("cups").create(cup);
  }
}
