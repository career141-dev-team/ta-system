import { NextResponse, type NextRequest } from "next/server";
import { primeStore } from "@/data/prime";
import { isConvex } from "@/data/mode";
import { currentUser } from "@/lib/session";
import { convexMutation, internalUploadUrl } from "@/lib/convexServer";
import { checkVoiceUpload, VOICE_MAX_BYTES } from "@/lib/voiceNote";

/**
 * Stores one voice note for a feedback item (12 Nov). A route, not a server
 * action, because audio is bigger than an action's 1 MB body. Anyone signed in
 * may send feedback, so anyone signed in may attach a note. It is saved under
 * the audio type read from its own bytes (lib/voiceNote), and the feedback row
 * keeps only the storage id. No transcript: a lead listens to it.
 */
export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > VOICE_MAX_BYTES + 64 * 1024) return NextResponse.json({ ok: false, message: "That voice note is over 10 MB. Record a shorter one." }, { status: 413 });
  if (!isConvex()) return NextResponse.json({ ok: false, message: "Voice notes are stored by the backend, which this local build is not connected to." }, { status: 501 });
  await primeStore();
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, message: "Your session has ended. Sign in again." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ ok: false, message: "No recording received. Try again." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = checkVoiceUpload(bytes.length, bytes.subarray(0, 16));
  if (!checked.ok) return NextResponse.json({ ok: false, message: checked.message }, { status: checked.status });

  try {
    const url = await convexMutation<string>("ta/storage:recordingUploadUrl", {});
    const put = await fetch(internalUploadUrl(url), { method: "POST", headers: { "content-type": checked.contentType }, body: Buffer.from(bytes) });
    if (!put.ok) return NextResponse.json({ ok: false, message: `The voice note could not be stored (${put.status}). Try again.` }, { status: 502 });
    const { storageId } = (await put.json()) as { storageId: string };
    return NextResponse.json({ ok: true, storageId });
  } catch (e) {
    console.warn("[feedback voice]", (e as Error).message);
    return NextResponse.json({ ok: false, message: "The voice note could not be saved. Try again." }, { status: 500 });
  }
}
