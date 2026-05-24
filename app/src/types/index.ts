// Core data types mirroring the PocketBase collections defined in the spec.
// See docs/reference/spec.html §05 for the authoritative data model.

// collaborator intentionally omitted — no feature today distinguishes it from owner.
// Add it back when household management (invite/remove members) is built.
export type UserRole = "owner" | "viewer" | "none";

export interface Household {
  id: string;
  name: string;
  group_slug: string; // matches PocketID group prefix: "{slug}_owner" / "{slug}_viewer"
  created: string;
}

export type CupScope = "city" | "state" | "country" | "themed";

export interface Cup {
  id: string;
  collectionId: string; // PocketBase collection identifier — needed for file URL construction
  name: string;         // Display name: city ("Atlanta"), state ("Georgia"), or country ("Canada")
  scope: CupScope;      // Determines pin rendering and detail-page labeling
  region: string;
  country: string;
  country_code: string; // ISO 3166-1 alpha-2, e.g. "US"
  series: string; // "You Are Here" | "Been There" | "Ornament" | other
  item_type: string; // "mug" | "ornament" | ""; blank treated as "mug"
  year: number;
  image: string; // PocketBase filename — pass to getFileUrl() to get a usable URL
  image_credit: string; // Source URL or "own photo"
  lat: number; // Centroid latitude (city, state, or country centroid) — used for Near Me sorting
  lng: number; // Centroid longitude
  notes: string;
  hobbydb_url: string;   // Direct URL to this cup's hobbyDB record, if known
  more_info_url: string; // Fallback external reference (e.g. starbucks-mugs.com)
  venue_series: string;  // Themed cups only: series name of the venue cups they're sold at
  is_duplicate: boolean; // When true, hidden from Browse/Map/Search unless the household owns it
  duplicate_ok: boolean; // When true, excluded from auto-detected potential-duplicate groups
  variant_of: string;    // ID of the canonical base cup; "" means this cup IS the base
  is_unique: boolean;    // When true, never auto-grouped as a variant even if name implies it
  sub_collection: string; // e.g. "Campus Collection" — from starbucks-mugs.com /tag/ links
  variant_notes: string;  // Scraper-populated explanation of what makes this variant different
  slug: string;          // URL slug for the detail page: /cup/{slug}; "" until import backfill
}

export interface OwnedCup {
  id: string;
  collectionId: string; // PocketBase collection identifier — needed for own_photo URL construction
  household_id: string;
  cup_id: string;
  marked_by_sub: string; // PocketID sub of whoever marked it owned
  acquired_date: string; // ISO date string, optional
  own_photo: string; // PocketBase file token, optional
  // Condition tracking (added in migration 003)
  needs_replacing: boolean; // true = action item; map pins and badges show orange like unowned
  replacement_note: string; // optional free-text reason (e.g. "cracked lid")
  // Where the cup was acquired — pre-populated from nearby Starbucks list
  acquired_store_name: string;
  acquired_store_address: string;
  acquired_store_lat: number;
  acquired_store_lng: number;
  created: string;
}

// A Cup with ownership status resolved for the current household.
// Used throughout the UI to avoid joining this data at every render.
export interface CupWithOwnership extends Cup {
  isOwned: boolean;
  ownedRecord?: OwnedCup; // Present when isOwned is true
}

// Per-household preferences for which series and item types to track.
// Absent or empty arrays mean "track everything."
export interface CollectionPrefs {
  excluded_series?: string[]; // e.g. ["Icon Mini", "Relief"]
  excluded_types?: string[];  // e.g. ["ornament"]
}

// A Starbucks store returned by the /api/nearby-starbucks proxy route
export interface NearbyStore {
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_id: string;
}
