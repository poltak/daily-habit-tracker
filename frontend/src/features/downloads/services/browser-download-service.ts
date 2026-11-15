import type { DownloadServiceInterface } from "./types.js";

export class BrowserDownloadService implements DownloadServiceInterface {
  save({ filename, content }: { filename: string; content: Blob }): void {
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
