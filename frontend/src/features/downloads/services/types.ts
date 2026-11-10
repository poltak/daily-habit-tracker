/** Saves a file that the page made, as the browser's download does. */
export interface DownloadServiceInterface {
  save(file: { filename: string; content: Blob }): void;
}
