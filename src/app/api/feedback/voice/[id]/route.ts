import { NextResponse, type NextRequest } from "next/server";
import { primeStore } from "@/data/prime";
import { isConvex } from "@/data/mode";
import { currentUser } from "@/lib/session";
import { repo } from "@/data/store";
import { convexQuery, internalUploadUrl } from "@/lib/convexServer";

/** Plays one feedback item's voice note, for someone who may see that item (same rule as its screenshot). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await primeStore();
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const item = repo.feedbacks(user).find((f) => f.id === id) ?? null;
  if (!item?.voiceNote || !isConvex()) return new NextResponse("Not found", { status: 404 });

  try {
    // The backend checks again who may see the item, and that the file is audio.
    const url = await convexQuery<string | null>("ta/feedbacks:voiceNoteUrl", { actorId: user.id, feedbackId: id });
    if (!url) return new NextResponse("Not found", { status: 404 });
    const res = await fetch(internalUploadUrl(url), { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return new NextResponse(`Storage answered ${res.status}`, { status: res.status });
    const type = res.headers.get("content-type") ?? "";
    return new NextResponse(Buffer.from(await res.arrayBuffer()), {
      headers: { "Content-Type": type.startsWith("audio/") ? type : "audio/webm", "Cache-Control": "private, max-age=86400" },
    });
  } catch (e) {
    console.warn("[feedback voice]", (e as Error).message);
    return new NextResponse("Failed to fetch the voice note", { status: 500 });
  }
}
