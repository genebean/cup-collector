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
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "name",          type: "text",   required: true },
        { name: "member_sub_1",  type: "text",   required: true },
        { name: "member_sub_2",  type: "text",   required: false },
        { name: "viewer_subs",   type: "json",   required: false },
      ],
    });
    db.save(householdsCollection);

    // ── cups ──────────────────────────────────────────────────────────────────
    const cupsCollection = new Collection({
      name: "cups",
      type: "base",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "city",          type: "text",   required: true },
        { name: "region",        type: "text",   required: false },
        { name: "country",       type: "text",   required: true },
        { name: "country_code",  type: "text",   required: true },
        { name: "series",        type: "text",   required: true },
        { name: "year",          type: "number", required: true },
        { name: "image",         type: "file",   required: false },
        { name: "image_credit",  type: "text",   required: false },
        { name: "lat",           type: "number", required: false },
        { name: "lng",           type: "number", required: false },
        { name: "notes",         type: "text",   required: false },
      ],
    });
    db.save(cupsCollection);

    // ── owned_cups ────────────────────────────────────────────────────────────
    // household_id and cup_id stored as plain text (PocketBase record IDs).
    // Relation-type fields require the related collection to already exist in the
    // same db.save pass; text avoids that ordering constraint while keeping the
    // same query interface the app uses (no .expand needed).
    const ownedCupsCollection = new Collection({
      name: "owned_cups",
      type: "base",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "household_id",   type: "text",   required: true },
        { name: "cup_id",         type: "text",   required: true },
        { name: "marked_by_sub",  type: "text",   required: false },
        { name: "acquired_date",  type: "date",   required: false },
        { name: "own_photo",      type: "file",   required: false },
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
