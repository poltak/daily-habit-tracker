/** The questions that the page asks the owner before it does something that cannot be undone. */
export interface DialogServiceInterface {
  /** Ask a yes or no question. `true` means yes. */
  confirm(question: string): boolean;
  /** Ask for a text. `null` means that the owner cancelled. */
  prompt(question: string, initial: string): string | null;
}
