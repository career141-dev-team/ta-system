/**
 * Rules for the voice note a person may attach to a feedback item (12 Nov).
 * Pure, so they are tested; the routes only apply them. The type is read from
 * the file's own first bytes, never from what the browser claimed, and the
 * stored copy is saved and served under that type — so a page or a CV renamed
 * ".webm" cannot come back out of this site as anything but audio.
 */

export const VOICE_MAX_BYTES = 10 * 1024 * 1024;
export const VOICE_MAX_SECONDS = 180;

export type VoiceType = "audio/webm" | "audio/ogg" | "audio/mp4" | "audio/mpeg" | "audio/wav";

export function sniffAudio(b: Uint8Array): VoiceType | null {
  const s = (i: number, text: string) => text.split("").every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (b.length >= 4 && s(0, "OggS")) return "audio/ogg";
  if (b.length >= 12 && s(4, "ftyp")) return "audio/mp4"; // .m4a, and WhatsApp/phone voice notes
  if (b.length >= 3 && s(0, "ID3")) return "audio/mpeg";
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (b.length >= 12 && s(0, "RIFF") && s(8, "WAVE")) return "audio/wav";
  return null;
}

export function checkVoiceUpload(size: number, head: Uint8Array): { ok: true; contentType: VoiceType } | { ok: false; message: string; status: number } {
  if (size === 0) return { ok: false, message: "The recording is empty. Record again.", status: 400 };
  if (size > VOICE_MAX_BYTES) return { ok: false, message: "That voice note is over 10 MB. Record a shorter one.", status: 413 };
  const contentType = sniffAudio(head);
  if (!contentType) return { ok: false, message: "That file is not an audio recording (webm, ogg, m4a, mp3 or wav).", status: 415 };
  return { ok: true, contentType };
}
