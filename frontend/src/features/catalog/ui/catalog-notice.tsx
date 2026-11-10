import type { Notice } from "../../days/types.js";

const MARKS = { success: "✓", info: "↻", error: "!" } as const;

/** A message above a page. A screen reader announces it. */
export function CatalogNotice({ notice }: { notice: Notice | null }) {
  if (!notice) {
    return null;
  }
  return (
    <output className={`notice ${notice.kind}`}>
      {`${MARKS[notice.kind]} ${notice.text}`}
    </output>
  );
}
