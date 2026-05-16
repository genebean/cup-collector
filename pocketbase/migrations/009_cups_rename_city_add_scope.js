/// <reference path="../pb_data/types.d.ts" />

// Rename cups.city → cups.name (cups cover cities, states, and countries).
// Add cups.scope: "city" | "state" | "country" (default "city" so existing records are unaffected).
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");

    const cityField = collection.fields.getByName("city");
    cityField.name = "name";
    app.save(collection);

    const scope = new Field({
      type: "select",
      name: "scope",
      required: false,
      maxSelect: 1,
      values: ["city", "state", "country"],
    });
    collection.fields.add(scope);
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");

    const scopeField = collection.fields.getByName("scope");
    if (scopeField) collection.fields.remove(scopeField);

    const nameField = collection.fields.getByName("name");
    nameField.name = "city";
    app.save(collection);
  },
);
