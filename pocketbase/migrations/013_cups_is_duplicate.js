/// <reference path="../pb_data/types.d.ts" />

// Add is_duplicate boolean field to cups.
// When true the cup is hidden from Browse, Map, and Search (unless owned by the household).
// Duplicates can be detected and flagged via the /admin/duplicates page.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");
    const field = new Field({
      type: "bool",
      name: "is_duplicate",
      required: false,
    });
    collection.fields.add(field);
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");
    const field = collection.fields.getByName("is_duplicate");
    if (field) collection.fields.remove(field);
    app.save(collection);
  },
);
