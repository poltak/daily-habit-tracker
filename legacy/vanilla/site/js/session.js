// The end of a session. A 401 from the API means that the browser has no live
// session, so the sign-in page opens and comes back to this page after sign-in.
// Unsaved choices stay in device storage, as they do for any failed save.
import { signInUrl } from "../lib/passkey-client.js";

let leaving = false;

function goToSignIn() {
  if (leaving) return;
  leaving = true;
  window.location.replace(signInUrl(`${window.location.pathname}${window.location.search}`));
}

/**
 * Watches every API response of the page. Each view calls `fetch` itself, so
 * one wrapper here covers all of them.
 */
export function watchSession() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await nativeFetch(input, init);
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (response.status === 401 && url.origin === window.location.origin && url.pathname.startsWith("/api/")) goToSignIn();
    return response;
  };
}
