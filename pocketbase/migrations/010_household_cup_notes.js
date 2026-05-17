// PocketBase migration — add household_cup_notes collection.
//
// Stores per-household, per-cup notes. Independent of ownership status —
// notes can be added to any cup, whether or not the household owns it.
//
// Access rules follow the same pattern as owned_cups:
//   listRule/viewRule = "" (open reads through the Next.js proxy)
//   create/update/delete = null (admin-only; mutations go via /api/cup-note)

/// <reference path="../pb_data/types.d.ts" />
migrate(
  (db) => {
    const col = new Collection({
      name: "household_cup_notes",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "household_id", type: "text", required: true },
        { name: "cup_id",       type: "text", required: true },
        { name: "note",         type: "text", required: false },
      ],
    });
    db.save(col);
  },

  (db) => {
    db.deleteCollection("household_cup_notes");
  }
);
