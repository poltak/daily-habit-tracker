import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { BackendApi } from "../api/client/api-client.js";
import type { ApiAccessEvents } from "../api/client/access-events.js";
import type { DialogServiceInterface } from "../dialogs/services/types.js";
import type { PasskeyServiceInterface } from "../auth/services/types.js";
import type { ThemeServiceInterface } from "../settings/services/types.js";
import type { SettingsStorage } from "../settings/storage/settings-storage.js";
import type { WindowFocusServiceInterface } from "../window-focus/services/types.js";

/** The frontend Storage classes. */
export interface FrontendStorage {
  settings: SettingsStorage;
}

/**
 * Core Services. Any Service, Storage, or Logic class may depend on one. See
 * docs/agents/code-architecture.md (Class roles).
 */
interface FrontendCoreServices {
  logger: LoggerServiceInterface;
}

export interface FrontendServices extends FrontendCoreServices {
  dialogs: DialogServiceInterface;
  passkeys: PasskeyServiceInterface;
  theme: ThemeServiceInterface;
  windowFocus: WindowFocusServiceInterface;
}

export interface App {
  api: BackendApi;
  apiAccessEvents: ApiAccessEvents;
  storage: FrontendStorage;
  services: FrontendServices;
}
