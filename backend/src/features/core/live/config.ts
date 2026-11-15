import type { LogLevel } from "@app/common/features/core/services/types";
import { LOG_LEVELS } from "@app/common/features/core/utils/log-level";
import type { AppConfig } from "../types.js";

/** The vars of the Worker and its secrets. All are text. */
export type WorkerVars = Partial<Record<WorkerVarName, string>>;

type WorkerVarName = "DAYMARK_SETUP_CODE" | "DAYMARK_BLACK_BOX" | "LOG_LEVEL";

function nonEmpty(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
}

/** Read the vars and secrets of the Worker, and apply the defaults. */
export function readLiveConfig(vars: WorkerVars): AppConfig {
  return {
    setupCode: nonEmpty(vars.DAYMARK_SETUP_CODE) ?? "",
    trustedOrigins: [],
    blackBox: vars.DAYMARK_BLACK_BOX === "true",
  };
}

export function readLogLevel(vars: WorkerVars): LogLevel {
  const level = vars.LOG_LEVEL as LogLevel | undefined;
  return level && LOG_LEVELS.includes(level) ? level : "info";
}
