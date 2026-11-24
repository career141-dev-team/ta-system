"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { DUR, EASE, gsap, useGSAP } from "@/lib/gsap";
import { DECLINE_REASONS, REJECT_REASONS, type Needs, type StageDef } from "./pipelineRules";

/** "job" is not a stage move: it is "Add to another job", which asks which one. */
export type Ask = { needs: Needs | "job"; name: string; from: string; to: StageDef; jobs?: { id: string; label: string }[] };

const FIELD =
  "h-[max(2.4rem,33px)] w-full rounded-xl border border-border bg-white px-3 text-[max(0.9125rem,13.5px)] text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand/30";
const LABEL = "block text-[max(0.8125rem,12px)] font-medium text-ink-2";

const day = (iso: string) => new Date(iso + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * What the TA System asks for BEFORE some moves are saved (FLOW-CHECK 2.2 to 2.4):
 * a reason for Rejected and Dropped out, the booking for Interview, the offer for
 * Offer, and the join date, agreed package and signed offer letter for Placed. A
 * plain move still has no question before it (owner, 12 Nov 2026) - only these do,
 * because the move cannot be saved without the answer. The browser's own "required"
 * does the checking. Sample data: the answer is shown back, nothing is stored.
 */
export default function MoveForm({
  ref: root,
  ask,
  onCancel,
  onSave,
}: {
  ref: RefObject<HTMLDivElement | null>;
  ask: Ask;
  onCancel: () => void;
  /** `note` is the answer in one line, for the notice after the move. */
  /** The sentence for the moved box, and the form itself (signed in, it is sent to the TA System). */
  onSave: (note: string, form: FormData) => void;
}) {
  const { needs, name, from, to, jobs = [] } = ask;
  const declined = needs === "reason" && from === "Offer" && to.name === "Dropped out";
  const [reason, setReason] = useState("");

  useGSAP(
    () => {
      gsap.from("[data-veil]", { opacity: 0, duration: DUR.fast });
      gsap.from("[data-box]", { opacity: 0, y: 14, scale: 0.94, duration: DUR.base, ease: EASE.pop });
    },
    { scope: root },
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onCancel]);

  const title =
    needs === "job"
      ? `Add ${name} to another job`
      : needs === "interview"
      ? "Book the interview"
      : needs === "offer"
        ? "Record the offer"
        : needs === "placement"
          ? "Record the placement"
          : declined
            ? `Why did ${name} decline the offer?`
            : to.name === "Rejected"
              ? `Why is ${name} rejected?`
              : `Why did ${name} drop out?`;
  const save =
    needs === "job" ? "Add to TA Follow-Up" : needs === "interview" ? "Book and move" : needs === "offer" ? "Make offer" : needs === "placement" ? "Record placement" : to.name === "Rejected" ? "Reject" : "Save";

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    if (needs === "job") onSave(v("job"), f);
    else if (needs === "reason") onSave(reason === "Other" ? v("other") : reason, f);
    else if (needs === "interview") onSave(`Interview on ${day(v("date"))} at ${v("time")}, ${v("how").toLowerCase()}, ${v("minutes")} minutes.`, f);
    else if (needs === "offer")
      onSave(`Offer: ${v("currency")} ${Number(v("salary")).toLocaleString("en-GB")} a ${v("per")}` + (v("start") ? `, starting ${day(v("start"))}.` : "."), f);
    else onSave(`Joins ${day(v("join"))}. Package: ${v("currency")} ${Number(v("salary")).toLocaleString("en-GB")} a ${v("per")}${v("package") ? `, ${v("package")}` : ""}. Signed offer letter attached.`, f);
  };

  return createPortal(
    <div ref={root} className="fixed inset-0 z-[80] flex items-center justify-center">
      <div data-veil className="absolute inset-0 bg-black/15 backdrop-blur-[2px]" onClick={onCancel} />
      <form
        data-box
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-title"
        onSubmit={submit}
        className="relative max-h-[calc(100dvh-24px)] w-[max(28rem,330px)] max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg bg-white p-[max(1.6rem,20px)] shadow-[0_30px_80px_rgba(17,44,32,0.25)]"
      >
        <h2 id="ask-title" className="text-[max(1.05rem,15px)] font-semibold text-ink">
          {title}
        </h2>
        {needs === "job" && (
          <p className="mt-1 text-[max(0.8625rem,12.5px)] text-ink-2">They go into TA Follow-Up there, and stay on this job too.</p>
        )}
        <p className={"mt-1 flex-wrap items-center gap-x-1.5 text-[max(0.8625rem,12.5px)] text-ink-2 " + (needs === "job" ? "hidden" : "flex")}>
          {needs !== "reason" && <span className="font-semibold text-ink">{name}</span>}
          <span>{from}</span>
          <span aria-hidden="true">→</span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: to.dot }} />
            {to.name}
          </span>
        </p>

        <div className="mt-[max(1.2rem,14px)] space-y-[max(0.8rem,10px)]">
          {needs === "job" && (
            <label className={LABEL}>
              Job
              <select name="job" required autoFocus defaultValue="" className={FIELD + " mt-1"}>
                <option value="" disabled>
                  Choose a job
                </option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {needs === "reason" && (
            <>
              <div role="radiogroup" aria-label="Reason" className="flex flex-wrap gap-[max(0.4rem,5px)]">
                {(declined ? DECLINE_REASONS : REJECT_REASONS).map((r, i) => (
                  <label
                    key={r}
                    className="cursor-pointer rounded-full border border-border px-[max(0.9rem,11px)] py-[max(0.4rem,5px)] text-[max(0.8625rem,12.5px)] text-ink transition-colors hover:bg-surface-2 has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30"
                  >
                    {/* One `required` covers the group: the form will not save with none picked. */}
                    <input type="radio" name="reason" value={r} required autoFocus={i === 0} onChange={() => setReason(r)} className="sr-only" />
                    {r}
                  </label>
                ))}
              </div>
              {reason === "Other" && (
                <label className={LABEL}>
                  Say why
                  <input name="other" required autoFocus maxLength={200} className={FIELD + " mt-1"} />
                </label>
              )}
            </>
          )}

          {needs === "interview" && (
            <>
              <div className="grid grid-cols-2 gap-[max(0.8rem,10px)]">
                <label className={LABEL}>
                  Date
                  <input name="date" type="date" required autoFocus className={FIELD + " mt-1"} />
                </label>
                <label className={LABEL}>
                  Time
                  <input name="time" type="time" required className={FIELD + " mt-1"} />
                </label>
                <label className={LABEL}>
                  How
                  <select name="how" defaultValue="Video" className={FIELD + " mt-1"}>
                    <option>In person</option>
                    <option>Video</option>
                    <option>Phone</option>
                  </select>
                </label>
                <label className={LABEL}>
                  Minutes
                  <input name="minutes" type="number" min={5} max={480} defaultValue={45} required className={FIELD + " mt-1"} />
                </label>
              </div>
              <label className={LABEL}>
                Where (address or meeting link)
                <input name="where" maxLength={200} className={FIELD + " mt-1"} />
              </label>
            </>
          )}

          {needs === "offer" && (
            <div className="grid grid-cols-2 gap-[max(0.8rem,10px)]">
              <label className={LABEL}>
                Salary
                <input name="salary" type="number" min={1} required autoFocus className={FIELD + " mt-1"} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={LABEL}>
                  Per
                  <select name="per" className={FIELD + " mt-1 px-2"}>
                    <option>month</option>
                    <option>year</option>
                  </select>
                </label>
                <label className={LABEL}>
                  Currency
                  <select name="currency" className={FIELD + " mt-1 px-2"}>
                    <option>LKR</option>
                    <option>USD</option>
                  </select>
                </label>
              </div>
              <label className={LABEL + " col-span-2"}>
                Start date
                <input name="start" type="date" className={FIELD + " mt-1"} />
              </label>
            </div>
          )}

          {needs === "placement" && (
            <>
              <label className={LABEL}>
                Joining date
                <input name="join" type="date" required autoFocus className={FIELD + " mt-1"} />
              </label>
              <div className="grid grid-cols-[1fr_auto_auto] gap-[max(0.6rem,8px)]">
                <label className={LABEL}>
                  Agreed salary
                  <input name="salary" type="number" min={1} required className={FIELD + " mt-1"} />
                </label>
                <label className={LABEL}>
                  Per
                  <select name="per" className={FIELD + " mt-1 px-2"}>
                    <option>month</option>
                    <option>year</option>
                  </select>
                </label>
                <label className={LABEL}>
                  Currency
                  <select name="currency" className={FIELD + " mt-1 px-2"}>
                    <option>LKR</option>
                    <option>USD</option>
                  </select>
                </label>
              </div>
              <label className={LABEL}>
                Package notes
                <input name="package" maxLength={200} placeholder="plus transport and medical" className={FIELD + " mt-1"} />
              </label>
              <label className={LABEL}>
                Signed offer letter (PDF or Word, under 10 MB)
                <input
                  name="letter"
                  type="file"
                  required
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.setCustomValidity(f && f.size > 10 * 1048576 ? "The offer letter must be under 10 MB." : "");
                  }}
                  className="mt-1 block w-full text-[max(0.8625rem,12.5px)] text-ink file:mr-3 file:h-[max(2.2rem,30px)] file:cursor-pointer file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:text-ink"
                />
              </label>
              <p className="text-[max(0.8125rem,12px)] text-ink-2">After this, mark the opening Placed in its Status menu.</p>
            </>
          )}
        </div>

        <div className="mt-[max(1.4rem,16px)] flex justify-end gap-[max(0.6rem,8px)]">
          <button
            type="button"
            onClick={onCancel}
            className="h-[max(2.4rem,33px)] rounded-full border border-border px-[max(1.2rem,15px)] text-[max(0.9125rem,13.5px)] text-ink hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            className={
              "h-[max(2.4rem,33px)] rounded-full px-[max(1.4rem,17px)] text-[max(0.9125rem,13.5px)] font-medium text-white " +
              (to.name === "Rejected" ? "bg-danger hover:bg-danger" : "bg-brand hover:bg-brand-strong")
            }
          >
            {save}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
