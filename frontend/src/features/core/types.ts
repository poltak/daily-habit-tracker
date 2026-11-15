import type { EventEmitter } from "@app/common/features/core/events/event-emitter";
import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { BackendApi } from "../api/client/api-client.js";
import type { ApiAccessEvents } from "../api/client/access-events.js";
import type { CatalogEvent } from "../catalog/types.js";
import type { Notice } from "../days/types.js";
import type { DialogServiceInterface } from "../dialogs/services/types.js";
import type { PasskeyServiceInterface } from "../auth/services/types.js";
import type { ClockServiceInterface } from "../clock/services/types.js";
import type { DaysStorage } from "../days/storage/days-storage.js";
import type { DownloadServiceInterface } from "../downloads/services/types.js";
import type { DeviceServiceInterface } from "../device/services/types.js";
import type { HistoryServiceInterface } from "../history/services/types.js";
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
  history: HistoryServiceInterface;
  passkeys: PasskeyServiceInterface;
  theme: ThemeServiceInterface;
  timers: TimerServiceInterface;
  windowFocus: WindowFocusServiceInterface;
}

/** What the owner waits for before leaving a page. It sets the text of the notice. */
export type LeaveReason = "goal" | "setup" | "activity";

/** A page with a request in flight holds the navigation until the request ends. */
export type NavigationLockEvent =
  | { type: "held"; holder: string; reason: LeaveReason }
  | { type: "released"; holder: string };

/** The pages that the shell tells apart. A notice belongs to one of them. */
export type PageView =
  "log" | "calendar" | "insights" | "settings" | "goal" | "add-activity";

/** What a page tells the message slot of the shell. */
export type PageNoticeEvent =
  | {
      type: "shown";
      notice: Notice;
      /** The page that shows it. Without it, the page that is open now. */
      view?: PageView;
    }
  | { type: "cleared" };

export interface App {
  api: BackendApi;
  apiAccessEvents: ApiAccessEvents;
  /** The pages that change the catalog tell the pages that show it. */
  catalogEvents: EventEmitter<CatalogEvent>;
  /** The pages with a request in flight tell the shell to hold the navigation. */
  navigationLockEvents: EventEmitter<NavigationLockEvent>;
  /** The pages tell the message slot of the shell what to show. */
  pageNoticeEvents: EventEmitter<PageNoticeEvent>;
  storage: FrontendStorage;
  services: FrontendServices;
}
