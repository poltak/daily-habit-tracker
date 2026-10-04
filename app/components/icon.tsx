"use client";

// Names the current icon font no longer contains, mapped to the glyph that replaced them.
const RENAMED_ICONS: Record<string, string> = { no_smoking: "smoke_free" };

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{RENAMED_ICONS[name] ?? name}</span>;
}

/** A button's icon, or a spinner in its place while the button's action is in progress. */
export function ActionIcon({ name, pending }: { name: string; pending: boolean }) {
  return pending ? <span className="spinner" aria-hidden="true" /> : <Icon name={name} />;
}
