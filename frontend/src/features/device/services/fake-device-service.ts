import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { DeviceServiceInterface } from "./types.js";

/** Online and in view, until a test says otherwise. */
export class FakeDeviceService implements DeviceServiceInterface {
  private readonly listeners = new Set<() => void>();
  private online = true;
  private visible = true;
  leaveWarning = false;

  isOnline(): boolean {
    return this.online;
  }

  isVisible(): boolean {
    return this.visible;
  }

  listen(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setLeaveWarning(active: boolean): void {
    this.leaveWarning = active;
  }

  setOnline(online: boolean): void {
    this.online = online;
    this.notify();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.notify();
  }

  private notify(): void {
    for (const listener of Array.from(this.listeners)) {
      listener();
    }
  }
}
