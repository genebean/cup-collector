/// <reference path="../pb_data/types.d.ts" />

// member_sub_1, member_sub_2, and viewer_subs are superseded by group_slug
// (migration 005). Remove them so new household records don't require a sub.
migrate(
  (db) => {
    const col = db.findCollectionByNameOrId("households");
    col.fields.removeByName("member_sub_1");
    col.fields.removeByName("member_sub_2");
    col.fields.removeByName("viewer_subs");
    db.save(col);
  },
  (db) => {
    const col = db.findCollectionByNameOrId("households");
    col.fields.add(new Field({ name: "member_sub_1", type: "text", required: false }));
    col.fields.add(new Field({ name: "member_sub_2", type: "text", required: false }));
    col.fields.add(new Field({ name: "viewer_subs",  type: "json", required: false }));
    db.save(col);
  }
);
