// PocketBase migration — add condition and acquisition fields to owned_cups.
//
// New fields:
//   needs_replacing  boolean  — marks a cup as an action item (cracked lid, etc.)
//   replacement_note text     — optional reason / note (e.g. "cracked lid")
//   acquired_store_name text  — name of the Starbucks where the cup was obtained
//   acquired_store_lat  number — latitude of that store (for future map use)
//   acquired_store_lng  number — longitude of that store

/// <reference path="../pb_data/types.d.ts" />
migrate(
  // Apply (up) — add new optional fields to owned_cups
  (db) => {
    const col = db.findCollectionByNameOrId("owned_cups");

    col.fields.add(new Field({ name: "needs_replacing",   type: "bool",   required: false }));
    col.fields.add(new Field({ name: "replacement_note",  type: "text",   required: false }));
    col.fields.add(new Field({ name: "acquired_store_name", type: "text", required: false }));
    col.fields.add(new Field({ name: "acquired_store_lat",  type: "number", required: false }));
    col.fields.add(new Field({ name: "acquired_store_lng",  type: "number", required: false }));

    db.save(col);
  },

  // Revert (down) — remove the fields added above
  (db) => {
    const col = db.findCollectionByNameOrId("owned_cups");

    for (const name of [
      "needs_replacing",
      "replacement_note",
      "acquired_store_name",
      "acquired_store_lat",
      "acquired_store_lng",
    ]) {
      const field = col.fields.getByName(name);
      if (field) col.fields.remove(field);
    }

    db.save(col);
  }
);
