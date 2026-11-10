/** A message above the form. `info` asks the owner to wait. */
export interface Notice {
  kind: "success" | "error" | "info";
  text: string;
}

export type ConnectionState = "checking" | "online" | "offline" | "error";

/** The tap that waits for the server. */
export type PendingSelection =
  | { kind: "mood" }
  | { kind: "activity"; id: string }
  | { kind: "goal"; id: string };
