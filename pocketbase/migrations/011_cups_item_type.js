/// <reference path="../pb_data/types.d.ts" />

// Add item_type text field to cups.
// Distinguishes mugs from ornaments (and future collectible types).
// Blank / absent = "mug" — all existing records remain valid without a backfill.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");
    const field = new Field({
      type: "text",
      name: "item_type",
      required: false,
    });
    collection.fields.add(field);
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");
    const field = collection.fields.getByName("item_type");
    if (field) collection.fields.remove(field);
    app.save(collection);
  },
);
