/** A message above the form. `info` asks the owner to wait. */
export interface Notice {
  kind: "success" | "error" | "info";
  text: string;
}

export type ConnectionState = "checking" | "online" | "offline" | "error";
