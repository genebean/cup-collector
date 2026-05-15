// PocketBase migration — add group_slug to households.
//
// group_slug ties a household to its PocketID groups without requiring
// anyone to handle raw OIDC subs. The admin creates groups named
// "{slug}-owner" and "{slug}-viewer" in PocketID, then sets this field
// to match. Auth resolves household membership entirely from the JWT groups.

/// <reference path="../pb_data/types.d.ts" />
migrate(
  (db) => {
    const col = db.findCollectionByNameOrId("households");
    col.fields.add(new Field({ name: "group_slug", type: "text", required: false }));
    db.save(col);
  },
  (db) => {
    const col = db.findCollectionByNameOrId("households");
    col.fields.removeByName("group_slug");
    db.save(col);
  }
);
