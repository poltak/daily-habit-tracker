import {
  createApiClient,
  type ApiClientProps,
} from "../../api/client/api-client.js";
import type { App, FrontendServices, FrontendStorage } from "../types.js";
import type { BrowserKeyValueStore } from "../storage/types.js";
import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { ConsoleLoggerService } from "@app/common/features/core/services/console-logger-service";
import type { LogLevel } from "@app/common/features/core/services/types";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import type { CatalogEvent } from "../../catalog/types.js";
import { BrowserClockService } from "../../clock/services/browser-clock-service.js";
import { DaysStorage } from "../../days/storage/days-storage.js";
import { BrowserDeviceService } from "../../device/services/browser-device-service.js";
import { BrowserDialogService } from "../../dialogs/services/browser-dialog-service.js";
import { BrowserThemeService } from "../../settings/services/browser-theme-service.js";
import { SettingsStorage } from "../../settings/storage/settings-storage.js";
import { BrowserTimerService } from "../../timers/services/browser-timer-service.js";
import { BrowserPasskeyService } from "../../auth/services/browser-passkey-service.js";
import { BrowserWindowFocusService } from "../../window-focus/services/browser-window-focus-service.js";

interface LiveAppProps extends ApiClientProps {
  logLevel?: LogLevel;
  /** The browser's `localStorage`, which `main.tsx` gives. */
  browserStorage: BrowserKeyValueStore;
}

export function createApp({
  logLevel = "warn",
  browserStorage,
  ...apiProps
}: LiveAppProps): App {
  const storage: FrontendStorage = {
    days: new DaysStorage({ store: browserStorage }),
    settings: new SettingsStorage({ store: browserStorage }),
  };
  const services: FrontendServices = {
    logger: new ConsoleLoggerService({ minLevel: logLevel }),
    clock: new BrowserClockService(),
    device: new BrowserDeviceService(),
    dialogs: new BrowserDialogService(),
    passkeys: new BrowserPasskeyService(),
    theme: new BrowserThemeService(),
    timers: new BrowserTimerService(),
    windowFocus: new BrowserWindowFocusService(),
  };

  const apiAccessEvents = new EventEmitter<ApiAccessEvent>();
  return {
    storage,
    services,
    apiAccessEvents,
    catalogEvents: new EventEmitter<CatalogEvent>(),
    api: createApiClient({
      ...apiProps,
      onSessionRejected: () =>
        apiAccessEvents.emitDetached({ type: "sessionRejected" }),
    }),
  };
}
