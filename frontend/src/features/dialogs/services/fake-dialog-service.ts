import type { DialogServiceInterface } from "./types.js";

/** Says yes to each question, unless a test tells it to say no. */
export class FakeDialogService implements DialogServiceInterface {
  readonly questions: string[] = [];
  readonly prompts: Array<{ question: string; initial: string }> = [];
  private answer = true;
  private textAnswer: string | null | undefined;

  confirm(question: string): boolean {
    this.questions.push(question);
    return this.answer;
  }

  /** Says the initial text back, unless a test gives a text or a cancel. */
  prompt(question: string, initial: string): string | null {
    this.prompts.push({ question, initial });
    return this.textAnswer === undefined ? initial : this.textAnswer;
  }

  answerWith(answer: boolean): void {
    this.answer = answer;
  }

  /** The text that the next prompts return. `null` is a cancel. */
  answerTextWith(answer: string | null): void {
    this.textAnswer = answer;
  }
}
