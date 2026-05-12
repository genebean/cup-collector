// PocketBase JavaScript migration — initial schema setup.
// Applied automatically when PocketBase starts with this migrations directory.
//
// Run with: pocketbase serve --dir ./pocketbase/pb_data --migrationsDir ./pocketbase/migrations
//
// This migration creates the three collections defined in the spec (§05):
//   households — links PocketID users to a shared collection and defines roles
//   cups       — master catalog of all known location cups
//   owned_cups — which cups the household has collected

/// <reference path="../pb_data/types.d.ts" />
migrate(
  // Apply (up)
  (db) => {
    // ── households ────────────────────────────────────────────────────────────
    const householdsCollection = new Collection({
      name: "households",
      type: "base",
      listRule: null,   // Set via admin UI — only authenticated members/viewers
      viewRule: null,
      createRule: null, // Admin only — household created once during setup
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "name",          type: "text",   required: true },
        { name: "member_sub_1",  type: "text",   required: true },
        { name: "member_sub_2",  type: "text",   required: false },
        // JSON array of PocketID sub strings for view-only users
        { name: "viewer_subs",   type: "json",   required: false },
      ],
    });
    db.save(householdsCollection);

    // ── cups ──────────────────────────────────────────────────────────────────
    const cupsCollection = new Collection({
      name: "cups",
      type: "base",
      listRule: null,   // Set via admin UI — authenticated household members
      viewRule: null,
      createRule: null, // Admin only — catalog imported via script
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "city",          type: "text",   required: true },
        { name: "region",        type: "text",   required: false },
        { name: "country",       type: "text",   required: true },
        { name: "country_code",  type: "text",   required: true },  // ISO 3166-1 alpha-2
        { name: "series",        type: "text",   required: true },  // "You Are Here" | "Been There" | etc.
        { name: "year",          type: "number", required: true },
        { name: "image",         type: "file",   required: false },
        { name: "image_credit",  type: "text",   required: false }, // Source URL or "own photo"
        { name: "lat",           type: "number", required: false },
        { name: "lng",           type: "number", required: false },
        { name: "notes",         type: "text",   required: false },
      ],
    });
    db.save(cupsCollection);

    // ── owned_cups ────────────────────────────────────────────────────────────
    // A cup is owned if a record exists here — no status field.
    // To un-own a cup, delete the record.
    const ownedCupsCollection = new Collection({
      name: "owned_cups",
      type: "base",
      listRule: null,   // Set via admin UI — household members and viewers
      viewRule: null,
      // Write access: members only (member_sub_1 or member_sub_2).
      // Viewers are explicitly excluded — enforced here AND in the UI.
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "household_id",
          type: "relation",
          required: true,
          collectionId: "@collection.households.id",
        },
        {
          name: "cup_id",
          type: "relation",
          required: true,
          collectionId: "@collection.cups.id",
        },
        { name: "marked_by_sub",  type: "text",   required: false }, // PocketID sub for attribution
        { name: "acquired_date",  type: "date",   required: false },
        { name: "own_photo",      type: "file",   required: false }, // Overrides catalog image when set
      ],
    });
    db.save(ownedCupsCollection);
  },

  // Revert (down)
  (db) => {
    db.deleteCollection("owned_cups");
    db.deleteCollection("cups");
    db.deleteCollection("households");
  }
);
