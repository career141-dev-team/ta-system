// convex/ui/team.ts
//
// Who is on an opening, after it was created (20 Nov). The new UI could only
// pick the team while creating; the old app's `setOpeningTeam` replaced the
// whole team through the generic commit ops. Here the same rules run in one
// transaction: at least one recruiter, the first is primary, the work mode of
// someone who stays is kept, new people are belled.
//
// Who may change it: leads and admins (desk-wide). A TA may change only their
// own working stage. Only active TAs can be put on; seats already held stay.

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { mapUser } from "../../src/data/convex/map";
import { can, isDeskWide, isTa } from "../../src/lib/auth";
import { isGone } from "../../src/lib/bin";
import { refreshWorkdayChecks } from "../ta/workdays";
import { NotSignedIn, mayReadOpening, uiUser } from "./me";

type Refused = { ok: false; message: string };
const refused = (message: string): Refused => ({ ok: false, message });
const RECRUITER = ["primary_recruiter", "supporting_recruiter"];
const STAGES = ["100%", "Follow-up", "Add-on"] as const;

/** The team as the panel draws it, and who could be added (only for someone who may edit). */
export const team = query({
  args: { openingId: v.string() },
  handler: async (ctx, args) => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const jobId = ctx.db.normalizeId("jobs", args.openingId);
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (!jobId || !job || isGone(job)) return refused("That opening no longer exists.");
    if (!(await mayReadOpening(ctx, user, jobId))) return refused("You are not on this opening.");

    const rows = await ctx.db
      .query("jobAssignments")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(60);
    const members = [];
    for (const r of rows) {
      if (!RECRUITER.includes(r.assignmentRole)) continue;
      const u = await ctx.db.get(r.userId);
      if (!u) continue;
      members.push({
        userId: r.userId as string,
        name: u.fullName,
        role: r.assignmentRole as "primary_recruiter" | "supporting_recruiter",
        stage: r.workingStage ?? ("100%" as const),
      });
    }
    members.sort((a, b) => Number(b.role === "primary_recruiter") - Number(a.role === "primary_recruiter") || a.name.localeCompare(b.name));

    const canEdit = isDeskWide(mapUser(user as never));
    let choices: { id: string; name: string }[] = [];
    if (canEdit) {
      const all = await ctx.db.query("users").take(500);
      choices = all
        .filter((u) => u.isActive && u.isOnboarded && isTa(mapUser(u as never)))
        .map((u) => ({ id: u._id as string, name: u.fullName }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return { ok: true as const, members, canEdit, mine: user._id as string, choices };
  },
});

/**
 * Replace the recruiters on an opening. `userIds` in order; `primaryId` is the
 * primary (the first if left out). Directors and client seats are not touched.
 */
export const setTeam = mutation({
  args: { openingId: v.string(), userIds: v.array(v.string()), primaryId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Refused | { ok: true; message: string }> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    const jobId = ctx.db.normalizeId("jobs", args.openingId);
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (!jobId || !job || isGone(job)) return refused("That opening no longer exists.");
    const mapped = mapUser(user as never);
    if (!isDeskWide(mapped)) return refused("Only a TA Lead or an admin can change who is on an opening.");
    const verdict = can(mapped, "opening.manage", { openingId: jobId as string, assignment: null });
    if (!verdict.ok) return refused(verdict.message);

    const ids = [...new Set(args.userIds)];
    if (ids.length === 0) return refused("A team needs at least one TA on it. Nothing was changed.");
    if (ids.length > 30) return refused("That is too many TAs for one opening.");
    const primary = args.primaryId && ids.includes(args.primaryId) ? args.primaryId : ids[0];

    const all = await ctx.db
      .query("jobAssignments")
      .withIndex("by_jobId", (q) => q.eq("jobId", jobId))
      .take(200);
    const held = new Set(all.filter((r) => r.isActive && RECRUITER.includes(r.assignmentRole)).map((r) => r.userId as string));

    // Someone new must be an active TA. Seats already held stay even if the
    // person's role has changed since, so an old team never blocks a save.
    const people = new Map<string, Doc<"users">>();
    for (const id of ids) {
      const uid = ctx.db.normalizeId("users", id);
      const u = uid ? await ctx.db.get(uid) : null;
      if (!uid || !u) return refused("One of those people is not on the desk.");
      if (!held.has(id) && !(u.isActive && u.isOnboarded && isTa(mapUser(u as never)))) {
        return refused(`${u.fullName} cannot be put on an opening. Only active TAs can.`);
      }
      people.set(id, u);
    }

    const now = new Date().toISOString();
    for (const r of all) {
      if (!r.isActive || !RECRUITER.includes(r.assignmentRole)) continue;
      if (!ids.includes(r.userId as string)) await ctx.db.patch(r._id, { isActive: false, revokedAt: now });
    }
    const added: Doc<"users">[] = [];
    for (const id of ids) {
      const role = id === primary ? "primary_recruiter" : "supporting_recruiter";
      const rows = all.filter((r) => (r.userId as string) === id);
      const live = rows.find((r) => r.isActive && RECRUITER.includes(r.assignmentRole));
      if (live) {
        if (live.assignmentRole !== role) await ctx.db.patch(live._id, { assignmentRole: role });
        continue;
      }
      const old = rows.find((r) => RECRUITER.includes(r.assignmentRole));
      if (old) await ctx.db.patch(old._id, { isActive: true, revokedAt: undefined, assignmentRole: role, assignedBy: user._id, assignedAt: now });
      else await ctx.db.insert("jobAssignments", { jobId, userId: people.get(id)!._id, assignmentRole: role, assignedBy: user._id, assignedAt: now, isActive: true });
      added.push(people.get(id)!);
    }
    const order = [primary, ...ids.filter((i) => i !== primary)];
    await ctx.db.patch(jobId, {
      assignedTaIds: order.map((i) => people.get(i)!._id),
      primaryRecruiterId: people.get(primary)!._id,
      updatedAt: Date.now(),
    } as never);

    for (const u of added) {
      if (u._id === user._id) continue;
      await ctx.runMutation(internal.ta.notifications.create, {
        userId: u._id as string, type: "opening_assigned", title: "You were assigned to an opening",
        body: `${user.fullName} added you to ${job.title}.`, jobId: jobId as string,
      });
      await refreshWorkdayChecks(ctx, jobId, u._id);
    }
    return { ok: true, message: "Team saved." };
  },
});

/** Someone's work mode on this opening: a lead for anyone, a TA for themselves. */
export const setStage = mutation({
  args: { openingId: v.string(), userId: v.string(), stage: v.string() },
  handler: async (ctx, args): Promise<Refused | { ok: true; message: string }> => {
    let user: Doc<"users">;
    try {
      user = await uiUser(ctx);
    } catch (error) {
      return refused(error instanceof NotSignedIn ? error.message : "Could not check who you are.");
    }
    if (!(STAGES as readonly string[]).includes(args.stage)) return refused("Pick 100%, Follow-up or Add-on.");
    const jobId = ctx.db.normalizeId("jobs", args.openingId);
    const job = jobId ? await ctx.db.get(jobId) : null;
    if (!jobId || !job || isGone(job)) return refused("That opening no longer exists.");
    if (!isDeskWide(mapUser(user as never)) && (user._id as string) !== args.userId) {
      return refused("You can change only your own work mode.");
    }
    try {
      await ctx.runMutation(internal.ta.openings.setWorkingStage, {
        actorId: user._id as string, openingId: jobId as string, userId: args.userId, stage: args.stage as (typeof STAGES)[number],
      });
    } catch (error) {
      return refused(error instanceof Error ? error.message.replace(/^.*Uncaught Error:\s*/s, "").split("\n")[0] : "Could not save that.");
    }
    return { ok: true, message: "Saved." };
  },
});
