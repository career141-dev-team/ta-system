/** A name for a CV that could not be read, so the list never shows a bare file name as if it were a person (3 Nov). */
export function unreadCvName(fileName?: string | null): string {
  const stem = (fileName ?? "").replace(/\.[^/.]+$/, "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
  return stem ? `Unread CV – ${stem}` : "Unread CV";
}
