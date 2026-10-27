declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      ASSETS: Fetcher;
      /** The secret that lets a person without a session save a passkey. See docs/sign-in.md. */
      DAYMARK_SETUP_CODE?: string;
      /** "true" turns sign-in on for requests to localhost. */
      DAYMARK_LOCAL_PASSKEYS?: string;
    }
  }
}

export {};
