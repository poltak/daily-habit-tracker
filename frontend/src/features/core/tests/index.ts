import { createApiClient } from "../../api/client/api-client.js";
import type { App } from "../types.js";
import { EventEmitter } from "@app/common/features/core/events/event-emitter";
import { MemoryLoggerService } from "@app/common/features/core/services/memory-logger-service";
import type { ApiAccessEvent } from "../../api/client/access-events.js";
import type { CatalogEvent } from "../../catalog/types.js";
import { FakeClockService } from "../../clock/services/fake-clock-service.js";
import { DaysStorage } from "../../days/storage/days-storage.js";
import { FakeDeviceService } from "../../device/services/fake-device-service.js";
import { FakeDownloadService } from "../../downloads/services/fake-download-service.js";
import { FakeDialogService } from "../../dialogs/services/fake-dialog-service.js";
import { FakeThemeService } from "../../settings/services/fake-theme-service.js";
import { SettingsStorage } from "../../settings/storage/settings-storage.js";
import { FakeTimerService } from "../../timers/services/fake-timer-service.js";
import { SoftPasskeyService } from "../../auth/services/soft-passkey-service.js";
import { FakeWindowFocusService } from "../../window-focus/services/fake-window-focus-service.js";
import { MemoryKeyValueStore } from "./memory-key-value-store.js";

export interface TestApp extends App {
  browserStorage: MemoryKeyValueStore;
  services: {
    logger: MemoryLoggerService;
    /** The clock of the device. A test moves it with `advance`. */
    clock: FakeClockService;
    /** Online and in view. A test goes offline or into the background. */
    device: FakeDeviceService;
    /** The questions to the owner. A test reads them, and picks the answer. */
    dialogs: FakeDialogService;
    /** The files that the page saved. */
    downloads: FakeDownloadService;
    /** The device's passkeys. A test gives it the owner's passkey, or makes it fail. */
    passkeys: SoftPasskeyService;
    theme: FakeThemeService;
    /** Repeating timers that a test fires by hand. */
    timers: FakeTimerService;
    windowFocus: FakeWindowFocusService;
  };
}

interface TestAppProps {
  /** Supply an in-memory handler transport or an explicit unit-test transport. */
  fetch: typeof globalThis.fetch;
  baseUrl?: string;
}

/** Test composition never defaults to a real network request. */
export function createApp({
  fetch,
  baseUrl = "http://app.test",
}: TestAppProps): TestApp {
  const apiAccessEvents = new EventEmitter<ApiAccessEvent>();
  const browserStorage = new MemoryKeyValueStore();
  return {
    browserStorage,
    storage: {
      days: new DaysStorage({ store: browserStorage }),
      settings: new SettingsStorage({ store: browserStorage }),
    },
    services: {
      logger: new MemoryLoggerService(),
      clock: new FakeClockService(),
      device: new FakeDeviceService(),
      dialogs: new FakeDialogService(),
      downloads: new FakeDownloadService(),
      theme: new FakeThemeService(),
      timers: new FakeTimerService(),
      // The page's origin is the one of the backend in these tests.
      passkeys: new SoftPasskeyService({ origin: new URL(baseUrl).origin }),
      windowFocus: new FakeWindowFocusService(),
    },
    apiAccessEvents,
    catalogEvents: new EventEmitter<CatalogEvent>(),
    api: createApiClient({
      fetch,
      baseUrl,
      onSessionRejected: () =>
        apiAccessEvents.emitDetached({ type: "sessionRejected" }),
    }),
  };
}
