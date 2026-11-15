// Names that the icon font no longer has, mapped to the glyph that replaced them.
const RENAMED_ICONS: Record<string, string> = { no_smoking: "smoke_free" };

/** A glyph of the Material Symbols Rounded font. A screen reader skips it. */
export function MaterialIcon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-rounded ${className}`.trim()}
      aria-hidden="true"
    >
      {RENAMED_ICONS[name] ?? name}
    </span>
  );
}
