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
      values: ["city", "state", "country", "themed"],
    });
    collection.fields.add(scope);

    // venue_series: only set on themed cups — holds the series name of the park/venue
    // cups they're associated with (e.g. "Been There Disney Parks" for Wakanda).
    // Used by the map to surface themed cups in the popups of matching city pins.
    const venueSeries = new Field({
      type: "text",
      name: "venue_series",
      required: false,
    });
    collection.fields.add(venueSeries);
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");

    const scopeField = collection.fields.getByName("scope");
    if (scopeField) collection.fields.remove(scopeField);

    const venueSeriesField = collection.fields.getByName("venue_series");
    if (venueSeriesField) collection.fields.remove(venueSeriesField);

    const nameField = collection.fields.getByName("name");
    nameField.name = "city";
    app.save(collection);
  },
);
