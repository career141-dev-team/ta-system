"use client";

import { addLinkInline, addLinksBulkInline, extractLinkProfileInline } from "@/app/actions";
import { ActionNote, SubmitButton, latest, submitted, useInline } from "./Submit";

/**
 * Excel Tables' add box.
 *
 * A plain text box, not `type="url"`: the browser refused anything without
 * `https://` before the form was sent, which is how most people copy a
 * profile (testing, 21 Sep). The server tidies the address; a name typed here
 * is used, otherwise one is read from the link. The answer — added, already
 * there, not a profile — shows under the box.
 *
 * A lead, director, admin or ops also gets a note box: what the TA should do
 * with this person, shown on the row as "TA Lead · <name> sent this note"
 * (25 Sep). A TA's box is unchanged.
 */
export function AddLinkForm({ openingId, canNote = false, workLocationId, level, addingTo }: { openingId: string; canNote?: boolean; workLocationId?: string; level?: number; addingTo?: string }) {
  const add = useInline(addLinkInline);
  // "Extract with AI" is the same box, read by Apify (lib/apifyProfile); it adds the row too.
  const extract = useInline(extractLinkProfileInline);
  const working = add.pending || extract.pending;
  // Which sheet the link lands in, said before it is pressed (22 Oct).
  const button = (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <SubmitButton
          busy={add.pending}
          locked={working}
          pendingLabel="Adding…"
          className="rounded-lg bg-brand px-8 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Add to table
        </SubmitButton>
        <SubmitButton
          name="extract"
          value="1"
          busy={extract.pending}
          locked={working}
          pendingLabel="Reading profile… (up to a minute)"
          tone="dark"
          className="rounded-lg border border-brand px-6 py-3 text-[13px] font-medium text-brand transition-colors hover:bg-brand-soft disabled:opacity-60"
        >
          Extract with AI
        </SubmitButton>
      </div>
      {addingTo && <span className="text-[11.5px] text-ink-soft">{addingTo}</span>}
    </div>
  );
  return (
    <>
    <form
      onSubmit={(e) => {
        const form = e.currentTarget;
        const { formData, pressed } = submitted(e);
        (pressed === "extract" ? extract : add).run(formData);
        // Ready for the next paste; a refusal leaves nothing worth keeping
        // that the message does not already repeat.
        form.reset();
      }}
      className="mb-6 lg:pr-32"
    >
      <input type="hidden" name="openingId" value={openingId} />
      <input type="hidden" name="workLocationId" value={workLocationId ?? ""} />
      <input type="hidden" name="level" value={level ?? 0} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-[280px] flex-[2]">
          <span className="absolute -top-2 left-3 bg-paper px-1.5 text-[11px] text-ink-soft">LinkedIn profile</span>
          <input
            name="url"
            required
            inputMode="url"
            autoComplete="off"
            placeholder="linkedin.com/in/their-name"
            className="w-full rounded-lg border border-rule bg-surface px-3.5 py-3 text-[13.5px] outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
          />
        </label>
        <label className="relative min-w-[200px] flex-1">
          <span className="absolute -top-2 left-3 bg-paper px-1.5 text-[11px] text-ink-soft">
            Name <span className="text-ink-faint">optional</span>
          </span>
          <input
            name="name"
            autoComplete="off"
            placeholder="Read from the link if blank"
            className="w-full rounded-lg border border-rule bg-surface px-3.5 py-3 text-[13.5px] outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
          />
        </label>
        {!canNote && button}
      </div>
      {canNote && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="relative min-w-[280px] flex-1">
            <span className="absolute -top-2 left-3 bg-paper px-1.5 text-[11px] text-ink-soft">
              Note for the TA <span className="text-ink-faint">optional</span>
            </span>
            <textarea
              name="note"
              rows={2}
              maxLength={2000}
              placeholder="What the TA should know or do with this person"
              className="w-full resize-y rounded-lg border border-rule bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed outline-none transition-colors placeholder:text-ink-faint focus:border-brand"
            />
          </label>
          {button}
        </div>
      )}
      <ActionNote result={latest(add.result, extract.result)} className="mt-3" />
    </form>
    <PasteLinksForm openingId={openingId} workLocationId={workLocationId} level={level} addingTo={addingTo} />
    </>
  );
}

/**
 * Many rows at once (26 Oct): select the rows in the TA's own Excel sheet,
 * copy, paste here. Each row with a LinkedIn link is added to this L.
 */
function PasteLinksForm({ openingId, workLocationId, level, addingTo }: { openingId: string; workLocationId?: string; level?: number; addingTo?: string }) {
  const add = useInline(addLinksBulkInline);
  return (
    <details className="mb-6 lg:pr-32">
      <summary className="cursor-pointer text-[12.5px] text-ink-soft hover:text-ink">Paste many rows from an Excel sheet</summary>
      <form
        onSubmit={(e) => {
          const form = e.currentTarget;
          const { formData } = submitted(e);
          add.run(formData);
          form.reset();
        }}
        className="mt-3"
      >
        <input type="hidden" name="openingId" value={openingId} />
        <input type="hidden" name="workLocationId" value={workLocationId ?? ""} />
        <input type="hidden" name="level" value={level ?? 0} />
        <textarea
          name="rows"
          required
          rows={6}
          placeholder="Select the rows in your sheet (link column included), copy, and paste them here. Up to 100 at a time."
          className="w-full resize-y rounded-lg border border-rule bg-surface px-3.5 py-3 font-mono text-[12px] leading-relaxed outline-none transition-colors placeholder:font-sans placeholder:text-ink-faint focus:border-brand"
        />
        <p className="mt-1 text-[11.5px] text-ink-soft">The contact number becomes the phone; the rest of the row becomes your note on it.</p>
        <div className="mt-3 flex flex-col items-start gap-1">
          <SubmitButton
            busy={add.pending}
            locked={add.pending}
            pendingLabel="Adding…"
            className="rounded-lg bg-brand px-8 py-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Add all to table
          </SubmitButton>
          {addingTo && <span className="text-[11.5px] text-ink-soft">{addingTo}</span>}
        </div>
        <ActionNote result={add.result} className="mt-3" />
      </form>
    </details>
  );
}
