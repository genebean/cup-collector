// Core data types mirroring the PocketBase collections defined in the spec.
// See docs/reference/spec.html §05 for the authoritative data model.

export type UserRole = "owner" | "collaborator" | "viewer" | "none";

export interface Household {
  id: string;
  name: string;
  member_sub_1: string;
  member_sub_2: string;
  // JSON array of PocketID sub strings for view-only users
  viewer_subs: string[];
  created: string;
}

export interface Cup {
  id: string;
  collectionId: string; // PocketBase collection identifier — needed for file URL construction
  city: string;
  region: string;
  country: string;
  country_code: string; // ISO 3166-1 alpha-2, e.g. "US"
  series: string; // "You Are Here" | "Been There" | "Ornament" | other
  year: number;
  image: string; // PocketBase file token — use pb.files.getUrl() to resolve
  image_credit: string; // Source URL or "own photo"
  lat: number; // City centroid latitude
  lng: number; // City centroid longitude
  notes: string;
}

export interface OwnedCup {
  id: string;
  household_id: string;
  cup_id: string;
  marked_by_sub: string; // PocketID sub of whoever marked it owned
  acquired_date: string; // ISO date string, optional
  own_photo: string; // PocketBase file token, optional
  created: string;
}

// A Cup with ownership status resolved for the current household.
// Used throughout the UI to avoid joining this data at every render.
export interface CupWithOwnership extends Cup {
  isOwned: boolean;
  ownedRecord?: OwnedCup; // Present when isOwned is true
}

// A Starbucks store returned by the /api/nearby-starbucks proxy route
export interface NearbyStore {
  name: string;
  address: string;
  lat: number;
  lng: number;
  place_id: string;
}
