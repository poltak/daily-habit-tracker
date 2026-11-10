import type { DialogServiceInterface } from "./types.js";

export class BrowserDialogService implements DialogServiceInterface {
  confirm(question: string): boolean {
    return window.confirm(question);
  }

  prompt(question: string, initial: string): string | null {
    return window.prompt(question, initial);
  }
}
