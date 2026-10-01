"use client";

// Names the current icon font no longer contains, mapped to the glyph that replaced them.
const RENAMED_ICONS: Record<string, string> = { no_smoking: "smoke_free" };

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{RENAMED_ICONS[name] ?? name}</span>;
}
