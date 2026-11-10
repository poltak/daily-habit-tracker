import type { EventEmitter } from "@app/common/features/core/events/event-emitter";
import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { BackendApi } from "../api/client/api-client.js";
import type { ApiAccessEvents } from "../api/client/access-events.js";
import type { CatalogEvent } from "../catalog/types.js";
import type { DialogServiceInterface } from "../dialogs/services/types.js";
import type { PasskeyServiceInterface } from "../auth/services/types.js";
import type { ClockServiceInterface } from "../clock/services/types.js";
import type { DaysStorage } from "../days/storage/days-storage.js";
import type { DownloadServiceInterface } from "../downloads/services/types.js";
import type { DeviceServiceInterface } from "../device/services/types.js";
import type { ThemeServiceInterface } from "../settings/services/types.js";
import type { SettingsStorage } from "../settings/storage/settings-storage.js";
import type { TimerServiceInterface } from "../timers/services/types.js";
import type { WindowFocusServiceInterface } from "../window-focus/services/types.js";

export interface FrontendStorage {
  days: DaysStorage;
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
  clock: ClockServiceInterface;
  device: DeviceServiceInterface;
  dialogs: DialogServiceInterface;
  downloads: DownloadServiceInterface;
  passkeys: PasskeyServiceInterface;
  theme: ThemeServiceInterface;
  timers: TimerServiceInterface;
  windowFocus: WindowFocusServiceInterface;
}

export interface App {
  api: BackendApi;
  apiAccessEvents: ApiAccessEvents;
  /** The pages that change the catalog tell the pages that show it. */
  catalogEvents: EventEmitter<CatalogEvent>;
  storage: FrontendStorage;
  services: FrontendServices;
}
