/** The HTML pages of the OAuth flow. Each page is complete in itself, so the Worker does not need the names of the built files. */

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/**
 * The consent page must not show inside a frame of another site, where a
 * click could be hijacked. `same-origin` keeps the address of the page from
 * other sites. Do not use `no-referrer`: with it, the browser sends
 * `Origin: null` with the consent form, and the same-origin check refuses it.
 */
const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  // No `form-action`: browsers apply it to the redirect after Allow, and that redirect goes to the app, on another origin.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  "referrer-policy": "same-origin",
};

// The colours of app/globals.css.
const STYLE = `
:root { color-scheme: light dark; --bg: #f7f3ec; --card: #fffdf9; --ink: #221e2f; --muted: #5f596a; --line: #e9e1d4; --accent: #221e2f; --on-accent: #fffdf9; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f0e17; --card: #181724; --ink: #f4f1f9; --muted: #a9a4ba; --line: #2a2939; --accent: #f4f1f9; --on-accent: #15131f; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
main { width: min(100%, 440px); padding: 28px; border: 1px solid var(--line); border-radius: 24px; background: var(--card); }
.brand { margin: 0 0 12px; color: var(--muted); font-weight: 700; letter-spacing: .02em; }
h1 { margin: 0 0 12px; font-size: 24px; line-height: 1.2; }
p { margin: 0 0 12px; }
.notice { color: var(--muted); }
form { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
button, a.button { flex: 1 1 140px; min-height: 44px; padding: 10px 16px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--ink); font: inherit; font-weight: 600; text-align: center; text-decoration: none; cursor: pointer; }
button.primary { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
`;

function page({ title, body, status = 200 }: { title: string; body: string; status?: number }): Response {
  const markup = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main><p class="brand">daymark</p>${body}</main></body></html>`;
  return new Response(markup, { status, headers: PAGE_HEADERS });
}

/** Ask the owner to allow an OAuth client. The form posts the checked request back. */
export function renderConsentPage({ clientName, redirectHost, fields }: {
  clientName: string;
  redirectHost: string;
  fields: Record<string, string>;
}): Response {
  const name = escapeHtml(clientName);
  const hidden = Object.entries(fields)
    .map(([field, value]) => `<input type="hidden" name="${escapeHtml(field)}" value="${escapeHtml(value)}">`)
    .join("");
  return page({
    title: "Connect an app — daymark",
    body: `<h1>Connect ${name} to daymark?</h1><p>${name} will be able to read your journal and to add entries.</p><p class="notice">After you allow it, daymark sends you to <strong>${escapeHtml(redirectHost)}</strong>. Allow only an app that you started to connect yourself.</p><form method="post" action="/oauth/authorize">${hidden}<button class="primary" type="submit" name="decision" value="allow">Allow</button><button type="submit" name="decision" value="deny">Deny</button></form>`,
  });
}

/** An OAuth request that cannot go back to its app, for example because its return address is not registered. */
export function renderOAuthErrorPage({ status, message }: { status: number; message: string }): Response {
  return page({
    title: "Cannot connect the app — daymark",
    status,
    body: `<h1>The app cannot connect</h1><p>${escapeHtml(message)}</p><form><a class="button" href="/">Open daymark</a></form>`,
  });
}
