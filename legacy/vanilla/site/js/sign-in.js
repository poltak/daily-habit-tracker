// The sign-in page. It signs in with a passkey, or saves the first passkey
// with the setup code. After sign-in, it opens the page in `returnTo`.
import { addPasskey, fetchAuthStatus, passkeyErrorMessage, safeReturnTo, signInWithPasskey, supportsPasskeys } from "../lib/passkey-client.js";
import { delegate, html, set } from "./dom.js";

/** @import { AuthStatus } from "../lib/passkey-client.js" */
/** @typedef {"loading" | "unsupported" | "unavailable" | "sign-in" | "setup"} View */

const panel = /** @type {HTMLElement} */ (document.querySelector(".auth-panel"));
const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
// The OAuth consent page sends the owner here first. The text is fixed, so a link cannot put its own words on this page.
const notice = returnTo.startsWith("/oauth/authorize") ? "An app wants to connect to your daymark. Sign in first, then daymark asks you to allow it." : null;

const state = {
  /** @type {View} */
  view: "loading",
  /** True when the owner has a passkey and uses the setup code to add another one. */
  recovery: false,
  /** @type {"missing" | "too_short" | "ready"} */
  setupCodeState: "ready",
  busy: false,
  /** @type {string | null} */
  error: null,
};

/** @param {Partial<typeof state>} patch */
function update(patch) {
  Object.assign(state, patch);
  render();
}

function done() {
  window.location.replace(returnTo);
}

const brand = html`<p class="auth-brand"><span class="brand-mark" aria-hidden="true"></span><span>daymark</span></p>`;
const noticeLine = notice ? html`<p class="auth-notice">${notice}</p>` : null;
const errorLine = html`<p class="auth-error" role="alert" data-error hidden></p>`;

function setupForm() {
  if (state.setupCodeState !== "ready") {
    return html`<p class="auth-error" role="alert">${passkeyErrorMessage(state.setupCodeState === "missing" ? "setup_code_missing" : "setup_code_too_short")}</p>`;
  }
  return html`
    <form class="auth-form" data-action="create-passkey">
      <label>Setup code
        <input name="setup-code" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required>
      </label>
      <button class="primary-button" type="submit" data-busy-text="Waiting for your device…">Create passkey</button>
    </form>
    ${errorLine}`;
}

/** The markup of the current view. The busy state and the error change in place, so the setup code stays in its field. */
function viewMarkup() {
  switch (state.view) {
    case "loading":
      return html`${brand}<h1>Sign in to daymark</h1><p class="muted">Checking sign-in…</p>`;
    case "unsupported":
      return html`${brand}<h1>This browser cannot use passkeys</h1><p class="muted">Open daymark in a current version of Safari, Chrome, Edge or Firefox.</p>`;
    case "unavailable":
      return html`${brand}<h1>Sign-in is unavailable</h1><p class="auth-error" role="alert">daymark could not check the sign-in. Try again.</p>
        <div class="auth-actions"><button class="primary-button" type="button" data-action="reload">Try again</button></div>`;
    case "sign-in":
      return html`
        ${brand}
        <h1>Sign in to daymark</h1>
        ${noticeLine}
        <p class="muted">Use your passkey. Your device asks for your face, fingerprint or screen lock.</p>
        <div class="auth-actions"><button class="primary-button" type="button" data-action="sign-in" data-busy-text="Waiting for your device…">Sign in with passkey</button></div>
        ${errorLine}
        <button class="auth-link" type="button" data-action="recover">Lost your passkey? Use your setup code</button>`;
    case "setup":
      return html`
        ${brand}
        <h1>${state.recovery ? "Add a passkey" : "Set up daymark"}</h1>
        ${noticeLine}
        <p class="muted">${state.recovery
          ? "Type your setup code. Then this device saves a new passkey."
          : "Type the setup code that you chose for this daymark. Then this device saves a passkey, and you sign in with your face, fingerprint or screen lock."}</p>
        ${setupForm()}
        ${state.recovery ? html`<button class="auth-link" type="button" data-action="back">Back to sign-in</button>` : null}`;
  }
}

function render() {
  set(panel, { html: viewMarkup() });
  for (const button of panel.querySelectorAll("button")) {
    const busyText = button.dataset.busyText;
    if (busyText && !button.dataset.idleText) button.dataset.idleText = button.textContent ?? "";
    set(button, { disabled: state.busy, ...(busyText ? { "aria-busy": state.busy, text: state.busy ? busyText : button.dataset.idleText } : {}) });
  }
  const input = panel.querySelector("input");
  if (input) set(input, { disabled: state.busy });
  const error = panel.querySelector("[data-error]");
  if (error) set(error, { hidden: !state.error, text: state.error ?? "" });
}

async function load() {
  if (!supportsPasskeys()) {
    update({ view: "unsupported" });
    return;
  }
  try {
    /** @type {AuthStatus} */
    const status = await fetchAuthStatus();
    if (status.mode !== "passkey" || status.signedIn) {
      done();
      return;
    }
    update({ view: status.hasPasskeys ? "sign-in" : "setup", setupCodeState: status.setupCode, error: null });
  } catch {
    update({ view: "unavailable" });
  }
}

async function signIn() {
  update({ busy: true, error: null });
  const result = await signInWithPasskey();
  if (result.ok) {
    done();
    return;
  }
  if (result.code === "setup_required") update({ view: "setup", recovery: false, busy: false });
  else update({ busy: false, error: result.message });
}

/** @param {HTMLFormElement} form */
async function createPasskey(form) {
  const setupCode = String(new FormData(form).get("setup-code") ?? "").trim();
  if (!setupCode) {
    update({ error: "Type the setup code." });
    return;
  }
  update({ busy: true, error: null });
  const result = await addPasskey({ setupCode });
  if (result.ok) done();
  else update({ busy: false, error: result.message });
}

delegate({
  root: panel,
  type: "click",
  handlers: {
    "sign-in": () => void signIn(),
    recover: () => update({ view: "setup", recovery: true, error: null }),
    back: () => update({ view: "sign-in", recovery: false, error: null }),
    reload: () => window.location.reload(),
  },
});
delegate({
  root: panel,
  type: "submit",
  handlers: {
    "create-passkey": (/** @type {HTMLFormElement} */ form, /** @type {Event} */ event) => {
      event.preventDefault();
      void createPasskey(form);
    },
  },
});

render();
void load();
