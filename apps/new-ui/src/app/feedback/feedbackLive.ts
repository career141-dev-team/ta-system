"use client";

// Feedback on real data (R2, 20 Nov 2026; ta-system #56). Signed in, the Tell us panel
// and the board read the old server's /api/ui/feedback - old AURA's /feedback desk:
// what this person may see, mapped to the board's columns - and every button runs that
// desk's own action. The board's store (data.ts) is filled from it, so both screens
// show the same thing. Signed out, the sample stays.

import { useEffect, useState, useSyncExternalStore } from "react";
import { cvHeaders, OLD_SERVER } from "@/lib/backend";
import { setItems, type Item } from "./data";

const URL_FB = `${OLD_SERVER}/api/ui/feedback`;
const NO_LINE = "Could not reach the TA System. Check your connection and try again.";

type Live = Omit<Item, "screenshot" | "voice" | "href"> & { byId: string; screenshot: boolean; voice: boolean; read: boolean };
export type Rights = { me: string; canLead: boolean; canBuild: boolean; canDelete: boolean };

let rights: Rights | null = null;
let error: string | null = null;
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());
const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
/** What this person may do on the board, from the old actions' own role tests. */
export const useRights = () => useSyncExternalStore(subscribe, () => rights, () => null);
export const useFeedbackError = () => useSyncExternalStore(subscribe, () => error, () => null);

/** Read the desk again and put it on the board. */
export async function reloadFeedback(): Promise<void> {
  const res = await fetch(URL_FB, { headers: await cvHeaders(URL_FB), signal: AbortSignal.timeout(30_000) }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as ({ ok?: boolean; message?: string; items?: Live[] } & Partial<Rights>) | null;
  if (!got?.ok || !got.items) {
    error = got?.message ?? NO_LINE;
    return ping();
  }
  rights = { me: got.me ?? "", canLead: !!got.canLead, canBuild: !!got.canBuild, canDelete: !!got.canDelete };
  error = null;
  // The files stay on the TA System; a card asks for them when it opens (mediaUrl).
  setItems(() => got.items!.map((x) => ({ ...x, screenshot: x.screenshot ? `live:${x.id}` : undefined, voice: x.voice ? `live:${x.id}` : undefined })));
  ping();
}

/** Signed in: the desk once when the screen opens. */
export function useFeedbackLive(on: boolean) {
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(() => void reloadFeedback(), 0);
    return () => clearTimeout(first);
  }, [on]);
}

/** One old /feedback action; its answer, then the desk read again. */
export async function sendFeedback(body: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(URL_FB, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await cvHeaders(URL_FB)) },
    body: JSON.stringify(body),
  }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
  void reloadFeedback();
  return { ok: !!got?.ok, message: got?.message ?? (got ? undefined : NO_LINE) };
}

/** Store a screenshot or voice note first; its id goes with the words. */
export async function uploadFeedbackFile(what: "shot" | "voice", file: Blob): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const form = new FormData();
  form.append("what", what);
  form.append("file", file, what === "shot" ? "screenshot" : "voice-note");
  const res = await fetch(URL_FB, { method: "POST", headers: await cvHeaders(URL_FB), body: form }).catch(() => null);
  const got = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string; storageId?: string } | null;
  return got?.ok && got.storageId ? { ok: true, id: got.storageId } : { ok: false, message: got?.message ?? NO_LINE };
}

/** A card's own screenshot or voice note, asked for with the session when it opens. */
export function useMedia(src: string | undefined, what: "screenshot" | "voice"): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!src?.startsWith("live:")) return;
    let gone = false;
    let made: string | undefined;
    void (async () => {
      const u = `${URL_FB}?${new URLSearchParams({ file: what, id: src.slice(5) })}`;
      const res = await fetch(u, { headers: await cvHeaders(u) }).catch(() => null);
      if (!res?.ok || gone) return;
      made = URL.createObjectURL(await res.blob());
      if (!gone) setUrl(made);
    })();
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src, what]);
  return src?.startsWith("live:") ? url : src;
}
