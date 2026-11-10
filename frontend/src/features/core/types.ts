import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { BackendApi } from "../api/client/api-client.js";
import type { ApiAccessEvents } from "../api/client/access-events.js";
import type { PasskeyServiceInterface } from "../auth/services/types.js";
import type { ClockServiceInterface } from "../clock/services/types.js";
import type { DaysStorage } from "../days/storage/days-storage.js";
import type { DeviceServiceInterface } from "../device/services/types.js";
import type { DialogServiceInterface } from "../dialogs/services/types.js";
import type { TimerServiceInterface } from "../timers/services/types.js";
import type { WindowFocusServiceInterface } from "../window-focus/services/types.js";

export interface FrontendStorage {
  days: DaysStorage;
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
  passkeys: PasskeyServiceInterface;
  timers: TimerServiceInterface;
  windowFocus: WindowFocusServiceInterface;
}

export interface App {
  api: BackendApi;
  apiAccessEvents: ApiAccessEvents;
  storage: FrontendStorage;
  services: FrontendServices;
}
