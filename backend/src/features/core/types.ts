import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { AuthConnectionsLogic } from "../auth/logic/auth-connections-logic.js";
import type { AuthOAuthLogic } from "../auth/logic/auth-oauth-logic.js";
import type { AuthOAuthTokenLogic } from "../auth/logic/auth-oauth-token-logic.js";
import type { AuthPasskeyLogic } from "../auth/logic/auth-passkey-logic.js";
import type { AuthPasskeyManageLogic } from "../auth/logic/auth-passkey-manage-logic.js";
import type { AuthSessionLogic } from "../auth/logic/auth-session-logic.js";
import type { PasskeyServiceInterface } from "../auth/services/types.js";
import type { AuthStorage } from "../auth/storage/auth-storage.js";
import type { CatalogLogic } from "../catalog/logic/catalog-logic.js";
import type { CatalogStorage } from "../catalog/storage/catalog-storage.js";
import type { DaysLogic } from "../days/logic/days-logic.js";
import type { DaysStorage } from "../days/storage/days-storage.js";
import type { BlackBoxLogic } from "../black-box/logic/black-box-logic.js";
import type { BlackBoxStorage } from "../black-box/storage/black-box-storage.js";
import type { HealthLogic } from "../health/logic/health-logic.js";
import type { HealthStorage } from "../health/storage/health-storage.js";
import type { SettingsLogic } from "../settings/logic/settings-logic.js";
import type { SettingsStorage } from "../settings/storage/settings-storage.js";
import type { RunAtomic } from "./logic/types.js";
import type { ClockServiceInterface } from "./services/types.js";

export interface BackendStorage {
  auth: AuthStorage;
  blackBox: BlackBoxStorage;
  catalog: CatalogStorage;
  days: DaysStorage;
  health: HealthStorage;
  settings: SettingsStorage;
}

/**
 * Core Services. Any Service, Storage, or Logic class may depend on one. See
 * docs/agents/code-architecture.md (Class roles).
 */
interface BackendCoreServices {
  logger: LoggerServiceInterface;
  /** A Core Service, so that a test can move the time of the sessions. */
  clock: ClockServiceInterface;
}

export interface BackendServices extends BackendCoreServices {
  passkeys: PasskeyServiceInterface;
}

export interface BackendLogic {
  authConnections: AuthConnectionsLogic;
  authOAuth: AuthOAuthLogic;
  authOAuthToken: AuthOAuthTokenLogic;
  authPasskey: AuthPasskeyLogic;
  authPasskeyManage: AuthPasskeyManageLogic;
  authSession: AuthSessionLogic;
  blackBox: BlackBoxLogic;
  catalog: CatalogLogic;
  days: DaysLogic;
  health: HealthLogic;
  settings: SettingsLogic;
}

/**
 * The settings of one deployment, as plain values. `core/live/config.ts` reads
 * them from the Worker's vars and secrets, and a test root sets them.
 */
export interface AppConfig {
  /** The code that saves a passkey without a session. An empty text is no code. */
  setupCode: string;
  /** Origins of a frontend on another origin. Only a test backend has any. */
  trustedOrigins: readonly string[];
  /**
   * Turns on the reset route for the black-box tests. Only a local test Worker
   * sets it: `scripts/black-box-next.mjs` through `DAYMARK_BLACK_BOX`.
   */
  blackBox: boolean;
}

export interface App {
  storage: BackendStorage;
  services: BackendServices;
  logic: BackendLogic;
  config: AppConfig;
  atomic: RunAtomic;
  /** Clean up Logic before releasing the database. */
  close(): Promise<void>;
}
