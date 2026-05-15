// PocketBase migration — add acquired_store_address to owned_cups.
//
// The address string (e.g. "1 Main St, Seattle, WA") was omitted from the
// original acquisition fields. Recording it avoids a round-trip to Places API
// when displaying the cup detail card.

/// <reference path="../pb_data/types.d.ts" />
migrate(
  // Apply (up)
  (db) => {
    const col = db.findCollectionByNameOrId("owned_cups");
    col.fields.add(new Field({ name: "acquired_store_address", type: "text", required: false }));
    db.save(col);
  },

  // Revert (down)
  (db) => {
    const col = db.findCollectionByNameOrId("owned_cups");
    const field = col.fields.getByName("acquired_store_address");
    if (field) col.fields.remove(field);
    db.save(col);
  }
);
