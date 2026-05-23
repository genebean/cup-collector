/// <reference path="../pb_data/types.d.ts" />

// Add duplicate_ok boolean field to cups.
// When true the cup has been reviewed and confirmed as a unique entry,
// so it is excluded from auto-detected potential-duplicate groups.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");
    const field = new Field({
      type: "bool",
      name: "duplicate_ok",
      required: false,
    });
    collection.fields.add(field);
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");
    const field = collection.fields.getByName("duplicate_ok");
    if (field) collection.fields.remove(field);
    app.save(collection);
  },
);
