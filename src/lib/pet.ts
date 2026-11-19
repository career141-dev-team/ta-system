// Each person picks their own pet, or hides it (19 Nov 2026). Kept in this browser,
// per person, like the theme; the person is the signed-in name, or the "View as" name
// until sign-in. ponytail: localStorage only; move to the person's record when the
// backend has a field for it.
import { useSyncExternalStore } from "react";
import { useMe } from "./role";

export const PETS = [
  { id: "boba", name: "Boba" },
  { id: "rocky-2", name: "Rocky" },
  { id: "pixel", name: "Pixel" },
  { id: "mofu-2", name: "Mofu" },
  { id: "humboldt", name: "Humboldt" },
  { id: "ostrom", name: "Ostrom" },
  { id: "lunar-warden", name: "Lunar Warden" },
  { id: "doc-volt", name: "Doc Volt" },
  { id: "tabby-2", name: "Tabby" },
  { id: "silver-shorthair", name: "Silver" },
  { id: "nova-2", name: "Nova" },
  { id: "meridian", name: "Meridian" },
];
const subs = new Set<() => void>();
const key = (who: string, what: "pet" | "hide" | "pet-at") => `ta-ui:${what}:${who}`;
const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const put = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
  subs.forEach((f) => f());
};

/** The pet of whoever is looking: which one, whether it is hidden, and how to change. */
export function useMyPet() {
  const { name } = useMe();
  // one string, so the store snapshot stays stable between renders
  const snap = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => `${get(key(name, "pet")) ?? PETS[0].id}|${get(key(name, "hide")) ?? ""}|${get(key(name, "pet-at")) ?? ""}`,
    () => `${PETS[0].id}||`,
  );
  const [id, off, at] = snap.split("|");
  const [right, bottom] = at ? at.split(",").map(Number) : [12, 12];
  return {
    pet: PETS.find((p) => p.id === id) ?? PETS[0],
    hidden: off === "1",
    /** Where the person left it: px from the window's right and bottom edges. */
    at: { right: right || 0, bottom: bottom || 0 },
    moveTo: (r: number, b: number) => put(key(name, "pet-at"), `${Math.round(r)},${Math.round(b)}`),
    choose: (p: string) => {
      put(key(name, "hide"), null); // choosing a pet brings it back
      put(key(name, "pet"), p);
    },
    setHidden: (h: boolean) => put(key(name, "hide"), h ? "1" : null),
  };
}

/** What AURA is doing, for the pet to show (owner 19 Nov 2026: "work like an agent").
 *  working = AURA is thinking or reading; done = something went through; failed = it was
 *  refused; waiting = something needs the person. The words go in the pet's bubble. */
export type PetMood = "working" | "done" | "failed" | "waiting";
export const petSay = (mood: PetMood, text: string) =>
  typeof window !== "undefined" && window.dispatchEvent(new CustomEvent("aura:pet", { detail: { mood, text } }));

/** Open the picker (the name menu's "My pet" row calls this). */
export const openPetPicker = () => window.dispatchEvent(new Event("aura:pet-picker"));
