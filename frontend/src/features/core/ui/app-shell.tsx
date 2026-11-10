import type { CSSProperties, ReactNode } from "react";
import { MaterialIcon } from "./material-icon.js";

/** A page that the bottom navigation opens. */
export type NavView = "log" | "calendar" | "insights" | "settings";

/** Every page of the shell. The goal page opens from the log, not from the navigation. */
export type ShellView = NavView | "goal";

type ConnectionState = "checking" | "online" | "offline" | "error";

interface ShellPage {
  view: NavView;
  label: string;
  icon: string;
}

const PAGES: ShellPage[] = [
  { view: "log", label: "Log", icon: "add_circle" },
  { view: "calendar", label: "Calendar", icon: "calendar_month" },
  { view: "insights", label: "Insights", icon: "insights" },
  { view: "settings", label: "Setup", icon: "tune" },
];

const CONNECTION_ICONS: Record<ConnectionState, string> = {
  checking: "cloud_done",
  online: "cloud_done",
  offline: "cloud_off",
  error: "cloud_alert",
};

interface AppShellProps {
  /** The page that is open, or `null` for an address with no page. */
  view: ShellView | null;
  /** Fills the date area of the header: the day switcher on the log, a title elsewhere. */
  title: ReactNode;
  /** The buttons at the right of the header. Only the log has them. */
  actions?: ReactNode;
  connection: ConnectionState;
  /** The colour of the sky behind the header. The log takes it from the mood of the day. */
  dayColor?: string | undefined;
  onOpen: (view: NavView) => void;
  children: ReactNode;
}

/** The header, the bottom navigation and the content area that every page of the journal shares. */
export function AppShell({
  view,
  title,
  actions,
  connection,
  dayColor,
  onOpen,
  children,
}: AppShellProps) {
  const style = dayColor
    ? ({ "--day-color": dayColor } as CSSProperties)
    : undefined;
  return (
    <div className={`journal-shell view-${view ?? "none"}`} style={style}>
      <a className="skip-link" href="#journal-content">
        Skip to content
      </a>
      <header className="topbar">
        <button
          type="button"
          className="brand"
          aria-label="Go to log"
          onClick={() => onOpen("log")}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span>daymark</span>
        </button>
        <div className={`topbar-date ${view === "log" ? "is-log" : ""}`}>
          {title}
        </div>
        <output
          className={`connection-pill ${connection}`}
          aria-label={`Connection: ${connection}`}
        >
          <MaterialIcon name={CONNECTION_ICONS[connection]} />{" "}
          {connection === "error" ? "sync issue" : connection}
        </output>
        {actions}
      </header>
      <main className="content-shell" id="journal-content" tabIndex={-1}>
        {children}
      </main>
      <nav className="bottom-nav" aria-label="Primary navigation">
        <span className="nav-heading" aria-hidden="true">
          Your journal
        </span>
        {PAGES.map((page) => (
          <button
            key={page.view}
            type="button"
            className={view === page.view ? "active" : ""}
            aria-current={view === page.view ? "page" : undefined}
            onClick={() => onOpen(page.view)}
          >
            <span className="nav-icon">
              <MaterialIcon name={page.icon} />
            </span>
            <span>{page.label}</span>
          </button>
        ))}
        <span className="nav-footer">
          <MaterialIcon name="spa" />
          <span>
            A more intentional
            <br />
            you, one day at a time.
          </span>
        </span>
      </nav>
    </div>
  );
}
