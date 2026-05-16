/// <reference path="../pb_data/types.d.ts" />

// Make country and country_code optional on the cups collection.
// Fictional / themed locations (e.g. Wakanda) legitimately have no country.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");

    const country     = collection.fields.getByName("country");
    const countryCode = collection.fields.getByName("country_code");

    country.required     = false;
    countryCode.required = false;

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("cups");

    const country     = collection.fields.getByName("country");
    const countryCode = collection.fields.getByName("country_code");

    country.required     = true;
    countryCode.required = true;

    app.save(collection);
  },
);
