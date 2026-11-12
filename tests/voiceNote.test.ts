import assert from "node:assert/strict";
import { checkVoiceUpload, sniffAudio, VOICE_MAX_BYTES } from "@/lib/voiceNote";

const bytes = (...n: number[]) => new Uint8Array([...n, ...new Array(16).fill(0)]);
const text = (t: string, at = 0) => { const b = new Uint8Array(16); [...t].forEach((c, i) => (b[at + i] = c.charCodeAt(0))); return b; };

assert.equal(sniffAudio(bytes(0x1a, 0x45, 0xdf, 0xa3)), "audio/webm");
assert.equal(sniffAudio(text("OggS")), "audio/ogg");
assert.equal(sniffAudio(text("ftyp", 4)), "audio/mp4");
assert.equal(sniffAudio(text("ID3")), "audio/mpeg");
const wav = text("RIFF"); [..."WAVE"].forEach((c, i) => (wav[8 + i] = c.charCodeAt(0)));
assert.equal(sniffAudio(wav), "audio/wav");
// A PDF, an HTML page and a PNG are not audio, whatever the browser said.
assert.equal(sniffAudio(text("%PDF-1.7")), null);
assert.equal(sniffAudio(text("<html>")), null);
assert.equal(sniffAudio(bytes(0x89, 0x50, 0x4e, 0x47)), null);

assert.equal(checkVoiceUpload(0, bytes(0x1a, 0x45, 0xdf, 0xa3)).ok, false);
assert.equal(checkVoiceUpload(VOICE_MAX_BYTES + 1, bytes(0x1a, 0x45, 0xdf, 0xa3)).ok, false);
assert.equal(checkVoiceUpload(1000, text("%PDF")).ok, false);
const good = checkVoiceUpload(1000, text("OggS"));
assert.ok(good.ok && good.contentType === "audio/ogg");
console.log("ok voiceNote");
