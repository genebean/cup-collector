/// <reference path="../pb_data/types.d.ts" />

// Add collection_prefs JSON field to households.
// Stores per-household preferences for which series and item types to track.
// Absent / null = track everything.
//
// Shape:
//   { "excluded_series": ["Icon Mini", "Relief"], "excluded_types": ["ornament"] }
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("households");
    const field = new Field({
      type: "json",
      name: "collection_prefs",
      required: false,
    });
    collection.fields.add(field);
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("households");
    const field = collection.fields.getByName("collection_prefs");
    if (field) collection.fields.remove(field);
    app.save(collection);
  },
);
