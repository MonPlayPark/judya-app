// A one-time message carried to the next page (M4 PR 8a): the edit page saves, goes back to the detail page, and that page
// says "บันทึกการแก้ไขแล้ว". Kept in memory only (never in storage); the next page takes it once on opening.
let pending: string | null = null;

export function setFlash(text: string): void {
  pending = text;
}

/** The message left by the page before, once. A second call (or a reload) gets null. */
export function takeFlash(): string | null {
  const t = pending;
  pending = null;
  return t;
}
