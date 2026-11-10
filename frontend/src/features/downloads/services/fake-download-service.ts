import type { DownloadServiceInterface } from "./types.js";

/** Keeps the files, so that a test can read them. */
export class FakeDownloadService implements DownloadServiceInterface {
  readonly files: Array<{ filename: string; content: Blob }> = [];

  save(file: { filename: string; content: Blob }): void {
    this.files.push(file);
  }
}
