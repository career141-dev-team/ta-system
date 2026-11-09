/**
 * Send one opening's WhatsApp follow-ups from one number (10 Nov: the Full
 * Stack Developer Intern opening from Rakshana's line, +94 74 011 0160).
 *
 * Sets `jobs.outreachWhatsAppNumber`, which `lib/senderRouting.pickSender`
 * already puts first - used only while that number's row is not "not ready",
 * else the usual TA / main-line order. There is no screen for this field, so
 * it is a migration. The opening must be one, by its title words; the dry run
 * lists every opening the words match and changes nothing.
 *
 *   run_function: admin/setOpeningWhatsAppNumber:run
 *   run_args:     {"dryRun":true,"title":"full stack developer intern","number":"+94740110160"}
 *   Clear it:     {"dryRun":false,"title":"...","number":""}
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const run = internalMutation({
  args: { dryRun: v.boolean(), title: v.string(), number: v.string() },
  handler: async (ctx, args) => {
    const words = args.title.toLowerCase().split(/\s+/).filter(Boolean);
    const jobs = (await ctx.db.query("jobs").collect()).filter(
      (j) => j.status === "active" && words.every((w) => (j.title ?? "").toLowerCase().includes(w)),
    );
    const report = jobs.map(
      (j) => `${j.title} (${j.clientName}, ${j._id}): now ${j.outreachWhatsAppNumber || "none"} -> ${args.number || "none"}`,
    );
    if (jobs.length !== 1) return { dryRun: args.dryRun, changed: 0, report: [`Needs exactly one active opening, found ${jobs.length}.`, ...report] };
    if (!args.dryRun) await ctx.db.patch(jobs[0]._id, { outreachWhatsAppNumber: args.number || undefined });
    return { dryRun: args.dryRun, changed: args.dryRun ? 0 : 1, report };
  },
});
