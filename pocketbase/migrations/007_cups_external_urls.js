/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const cups = app.findCollectionByNameOrId("cups");

    cups.fields.add(new TextField({ name: "hobbydb_url",   required: false }));
    cups.fields.add(new TextField({ name: "more_info_url", required: false }));

    app.save(cups);
  },
  (app) => {
    const cups = app.findCollectionByNameOrId("cups");
    cups.fields.removeById(cups.fields.getByName("hobbydb_url").id);
    cups.fields.removeById(cups.fields.getByName("more_info_url").id);
    app.save(cups);
  }
);
