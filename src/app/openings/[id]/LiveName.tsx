"use client";

// The opening's name and client on its page: the sample words in a design
// preview, the real opening (?job=<id>, ui/opening:summary) when signed in.
import { door, jobFromAddress, useDoorQuery, useLive, type Answer } from "@/lib/backend";

type Summary = Answer<{ opening: { title: string | null; client: string | null } }>;

export default function LiveName({ field, sample }: { field: "title" | "client"; sample: string }) {
  const live = useLive();
  const job = live ? jobFromAddress() : null;
  const got = useDoorQuery(door.summary, job ? { openingId: job } : "skip") as Summary | undefined;
  if (!live) return <>{sample}</>;
  if (!job) return <>Open an opening from the Openings page</>;
  if (got && !got.ok) return <>{field === "title" ? got.message : ""}</>;
  return <>{got?.opening[field] ?? ""}</>;
}
