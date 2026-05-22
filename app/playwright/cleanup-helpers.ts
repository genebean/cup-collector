import PocketBase from "pocketbase";
import { PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } from "./test-pb.ts";

// Delete all owned_cup records via the admin API — more reliable than UI-based
// cleanup, which can silently skip if buttons render slowly on a loaded CI machine.
export async function clearAllOwnedCups(): Promise<void> {
  const pb = new PocketBase(PB_URL);
  await pb.collection("_superusers").authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
  const records = await pb.collection("owned_cups").getFullList();
  await Promise.all(records.map((r) => pb.collection("owned_cups").delete(r.id)));
}
