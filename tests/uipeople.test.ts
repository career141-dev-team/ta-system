/**
 * The new UI's People and roles on the old server (R1, 20 Nov): the old /people
 * page's reads and its five actions with only their own fields, sign-in first,
 * invites and older-app accounts only for someone who may change people.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { readUiBody } from "../src/lib/uiLinks";
import { PEOPLE_ACTIONS, personRow, rosterOrder } from "../src/lib/uiPeople";
import type { User } from "../src/data/types";

let n = 0;
const ok = (l: string, f: () => void) => { f(); n++; console.log(`  ok   ${l}`); };
const route = fs.readFileSync("src/app/api/ui/people/route.ts", "utf8");

ok("a button carries only its old form's fields", () => {
  const r = readUiBody(PEOPLE_ACTIONS, { do: "invite", email: "a@b.lk", role: "ta" });
  assert.ok(r.ok && r.action === "invite" && r.fields.length === 2);
  assert.equal(readUiBody(PEOPLE_ACTIONS, { do: "add", name: "A", isAdmin: "1" }).ok, false);
  assert.equal(readUiBody(PEOPLE_ACTIONS, { do: "delete", userId: "u" }).ok, false);
  assert.equal(readUiBody(PEOPLE_ACTIONS, { do: "active", userId: "u", active: "0" }).ok, true);
});
ok("the five old actions through inline()", () => {
  for (const a of ["addUser", "updateUser", "inviteUser", "revokeUserInvite", "setUserActive"]) assert.ok(route.includes(a));
  assert.ok(route.includes("inline(() => RUN[read.action](form))"));
});
ok("sign-in first; invites and accounts only for an admin who may manage people", () => {
  const get = route.slice(route.indexOf("export async function GET"));
  assert.ok(get.indexOf("currentUser()") < get.indexOf("primeStore("));
  assert.ok(route.includes('allows(user, "user.manage") && user.role === "admin"'));
  assert.ok(route.includes("canEdit ? await Promise.all([pendingInvites(), offDeskAccounts(user.id)]) : [[], []]"));
  assert.ok(route.includes('authorization")?.startsWith("Bearer ")') && route.includes("uiCors("));
});
ok("a person row carries what the old list shows and nothing else; on the desk first", () => {
  const u = (id: string, name: string, isActive: boolean): User =>
    ({ id, name, email: `${id}@x.lk`, phone: null, routingEmail: null, role: "ta", initials: "X", isActive });
  const row = personRow(u("u1", "Asha", true));
  assert.deepEqual(Object.keys(row).sort(), ["active", "email", "id", "name", "phone", "role", "routingEmail", "workCountry"]);
  assert.equal(row.workCountry, "Sri Lanka");
  assert.deepEqual(rosterOrder([u("a", "Zed", false), u("b", "Bea", true), u("c", "Ann", true)]).map((x) => x.id), ["c", "b", "a"]);
});

console.log(`\n${n} passed, 0 failed`);
