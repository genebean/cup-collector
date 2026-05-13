// PocketBase migration — set collection access rules.
//
// All three collections allow unrestricted reads from the PocketBase perspective.
// This is intentional: browser clients do not hold PocketBase auth tokens, so
// @request.auth rules cannot be used for read enforcement.
//
// Security is enforced at the network layer instead:
//   - PocketBase is not exposed publicly (no nginx vhost by default in the NixOS module)
//   - All browser → PocketBase traffic goes through the Next.js /api/pb proxy
//   - That proxy checks for a valid Auth.js session before forwarding any request
//
// Writes remain admin-only: the create/update/delete rules are null (locked to
// PocketBase admin). All mutations from the app go through Next.js API routes
// that authenticate as the admin user server-side.

/// <reference path="../pb_data/types.d.ts" />
migrate(
  (db) => {
    for (const name of ["cups", "households", "owned_cups"]) {
      const col = db.findCollectionByNameOrId(name);
      col.listRule = "";
      col.viewRule = "";
      db.save(col);
    }
  },
  (db) => {
    for (const name of ["cups", "households", "owned_cups"]) {
      const col = db.findCollectionByNameOrId(name);
      col.listRule = null;
      col.viewRule = null;
      db.save(col);
    }
  }
);
