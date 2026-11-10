import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { DeviceServiceInterface } from "./types.js";

function warnBeforeLeaving(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

export class BrowserDeviceService implements DeviceServiceInterface {
  isOnline(): boolean {
    return navigator.onLine;
  }

  isVisible(): boolean {
    return document.visibilityState === "visible";
  }

  listen(listener: () => void): Unsubscribe {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    document.addEventListener("visibilitychange", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
      document.removeEventListener("visibilitychange", listener);
    };
  }

  setLeaveWarning(active: boolean): void {
    if (active) {
      window.addEventListener("beforeunload", warnBeforeLeaving);
    } else {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    }
  }
}
