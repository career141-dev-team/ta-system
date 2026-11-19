import "server-only";
import { isConvex } from "@/data/mode";
import { convexMutation, internalUploadUrl } from "@/lib/convexServer";

// Shared by the old placement form (actions.ts recordPlacement) and the new UI's
// placement (api/ui/candidate, D7 19 Nov), so both store the signed letter the same way.
/** The offer letter, into the same storage the screenshots use. */
export async function storeOfferLetter(file: File): Promise<{ ok: true; fileId: string } | { ok: false; message: string }> {
  if (file.size > 10 * 1024 * 1024) return { ok: false, message: "The offer letter must be under 10 MB." };
  const type = file.type || "application/pdf";
  if (!isConvex()) return { ok: true, fileId: `local_${file.name}` };
  try {
    const uploadUrl = await convexMutation<string>("ta/storage:recordingUploadUrl", {});
    const put = await fetch(internalUploadUrl(uploadUrl), {
      method: "POST",
      headers: { "content-type": type },
      body: Buffer.from(await file.arrayBuffer()),
    });
    if (!put.ok) return { ok: false, message: `The offer letter could not be saved (${put.status}). Nothing was placed.` };
    const { storageId } = (await put.json()) as { storageId: string };
    return { ok: true, fileId: storageId };
  } catch (e) {
    console.error("[recordPlacement] offer letter upload failed:", e);
    return { ok: false, message: "The offer letter could not be saved. Nothing was placed." };
  }
}
