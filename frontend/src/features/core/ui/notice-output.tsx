const MARKS = { success: "✓", info: "↻", error: "!" } as const;

/** A message on a page, with its mark. A screen reader announces it. */
export function NoticeOutput({
  kind,
  text,
}: {
  kind: keyof typeof MARKS;
  text: string;
}) {
  return (
    <output className={`notice ${kind}`}>{`${MARKS[kind]} ${text}`}</output>
  );
}
