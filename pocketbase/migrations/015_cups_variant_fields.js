/// <reference path="../pb_data/types.d.ts" />

// Add variant relationship fields to cups.
//
// variant_of    — self-referential relation pointing to the base/canonical cup.
//                 "Atlanta 2" points to "Atlanta"; base cups have no value.
//                 Used to collapse variant groups in Browse, Map popup, and the
//                 /admin/duplicates Confirmed tab.
// is_unique     — admin override: this cup looks like a variant by name but is
//                 genuinely standalone. Prevents auto-grouping in all views.
// sub_collection — sub-collection tag from starbucks-mugs.com /tag/ pages,
//                  e.g. "Campus Collection", "Holiday". Enables future filtering.
// variant_notes — scraper-populated explanation of what makes this variant
//                 different (e.g. "V2 corrects misspelling of Chattahoochee").
//                 Kept separate from hand-written `notes`.
migrate(
  (app) => {
    const cups = app.findCollectionByNameOrId("cups");

    cups.fields.add(new RelationField({
      name: "variant_of",
      collectionId: cups.id,
      required: false,
      maxSelect: 1,
    }));

    cups.fields.add(new BoolField({
      name: "is_unique",
      required: false,
    }));

    cups.fields.add(new TextField({
      name: "sub_collection",
      required: false,
    }));

    cups.fields.add(new TextField({
      name: "variant_notes",
      required: false,
    }));

    app.save(cups);
  },
  (app) => {
    const cups = app.findCollectionByNameOrId("cups");
    for (const name of ["variant_of", "is_unique", "sub_collection", "variant_notes"]) {
      const field = cups.fields.getByName(name);
      if (field) cups.fields.remove(field);
    }
    app.save(cups);
  }
);
