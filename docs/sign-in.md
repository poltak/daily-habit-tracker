# Sign-in

Daymark has one owner. The owner signs in with a passkey. MCP clients, such
as Claude Code, sign in with OAuth 2.1, and the owner allows each client with
a passkey session. The code is in `worker/auth/`. Both Workers call
`withAuth` before their own routes.

The design is the same as in calocount (`calocount/docs/sign-in.md`). Daymark
has no Cloudflare Access mode and no owner key, because it has one deployment
and one owner.

## Local development

Requests to `localhost`, `127.0.0.1` and `[::1]` skip sign-in, so
`pnpm run dev` and the integration tests need no passkey. A public host name
always needs sign-in.

To try passkeys locally, put these lines in `.dev.vars`:

```sh
DAYMARK_LOCAL_PASSKEYS=true
DAYMARK_SETUP_CODE=a long local setup code
```

Then run `pnpm run dev` and open `http://localhost:3000`. Browsers allow
passkeys on `localhost`, but not on `127.0.0.1`.

## Setup code

`DAYMARK_SETUP_CODE` is a secret with at least 12 characters. A person
without a session needs it to save a passkey: the first passkey, and a new
passkey after the owner loses all devices. Use a random value, for example the
output of `openssl rand -base64 24`, and keep it in a password manager.

- One network (one IP address) can try 10 wrong codes in 15 minutes, and all
  networks together can try 50. Each attempt counts before the check, so
  parallel requests cannot pass a limit. A refused attempt and a correct code
  do not count, so one network cannot lock the owner out.
- A missing or short setup code stops the setup with `503`. The sign-in page
  tells the owner how to set it.
- The owner can change the secret at any time. Saved passkeys continue to work.
- To be stricter, delete the secret after you set up your devices. Then
  nobody can add a passkey without a session. If you lose all your devices,
  add the secret again.

## Passkeys

- The Worker uses WebAuthn with resident keys and user verification, through
  `@simplewebauthn/server`. The relying party ID is the host name of the
  request. Sign-in asks the browser for any passkey of the site, so the server
  does not show credential IDs to anonymous visitors.
- A passkey works only on the host name where the owner saved it. After a move
  to another host name, use the setup code there to save a new passkey.
- The database keeps the public key of each passkey. No private key leaves
  the device. A passkey that is not in the database cannot sign in.
- **Setup > Sign-in** lists the passkeys. The owner can add a passkey on the
  current device and remove a passkey. The last passkey cannot be removed, so
  the owner keeps a way in. Removing a passkey ends the sessions that it
  signed in.

## Sessions

- The cookie is `__Host-daymark_session` on HTTPS and `daymark_session` on
  `http://localhost`. It is `HttpOnly` and `SameSite=Lax`, `Secure` on HTTPS,
  and has a `Max-Age` of 400 days. The database keeps only the SHA-256 of the
  cookie value.
- A session ends after 180 days without use. Each use moves the end, at most
  once a day, and the answer then sends the cookie again. An owner who uses
  the app does not sign in again.
- A request that changes data with the cookie (`POST`, `PUT`, `PATCH`,
  `DELETE`) must send the `Origin` of the site. Other requests get `403` with
  the code `invalid_origin`.
- An API request without a live session gets `401` with the code
  `sign_in_required`. The app then opens `/sign-in`, and comes back to the
  same page after sign-in. Unsaved choices stay in device storage.

## Pages

The pages and static files do not need sign-in. They hold no journal data:
the app gets all data from `/api`. The service worker keeps the app shell for
offline use. It does not keep `/sign-in` or the OAuth pages as the shell.

`/sign-in` and the OAuth pages send `X-Frame-Options: DENY`,
`Content-Security-Policy: frame-ancestors 'none'` and
`Referrer-Policy: same-origin`. Do not change the referrer policy to
`no-referrer`: with it, browsers send `Origin: null` with the consent form,
and the same-origin check refuses the owner's answer.

## Routes

| Path | Who can use it | Purpose |
| --- | --- | --- |
| `/sign-in` | Anyone | The sign-in page, or the setup page when no passkey exists |
| `GET /api/auth/status` | Anyone | Whether the browser is signed in, and whether a passkey exists |
| `POST /api/auth/register/options` | A session, or anyone with the setup code | Start to save a passkey |
| `POST /api/auth/register/verify` | The holder of a registration challenge | Save the passkey, and sign in without a session |
| `POST /api/auth/login/options` and `/verify` | Anyone | Sign in with a passkey |
| `POST /api/auth/logout` | Anyone | End the session of this browser |
| `GET /api/auth/passkeys`, `DELETE /api/auth/passkeys/:id` | A session | List and remove passkeys |
| `GET /api/auth/connections`, `DELETE /api/auth/connections/:id` | A session | List and disconnect OAuth apps |
| `POST /api/mcp` | An OAuth access token | The MCP endpoint. A session cookie does not work here. |

Every other `/api/*` route needs a session. `tests/worker-routes.test.mjs`
checks this for each route file.

## OAuth for the MCP endpoint

MCP clients use OAuth 2.1 to call `/api/mcp`:

1. `/api/mcp` answers a request without a valid token with `401` and
   `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/api/mcp"`.
2. `/.well-known/oauth-protected-resource` (also with `/api/mcp` at the end)
   names the resource `https://<host>/api/mcp` and the authorization server
   `https://<host>` (RFC 9728).
3. `/.well-known/oauth-authorization-server` lists the endpoints (RFC 8414).
   It advertises PKCE `S256` only and the `iss` response parameter (RFC 9207).
4. The client registers at `POST /oauth/register` (RFC 7591). Redirect URIs
   must use HTTPS, or HTTP on `localhost`. One network can register 10 clients
   in an hour, and all networks together 200.
5. `GET /oauth/authorize` sends a browser without a session to `/sign-in`
   first. With a session, it shows the consent page with the name of the app
   and the host that receives the code. Allow and Deny post the form back to
   the same path. A request error shows on the page and never redirects.
   Anyone can register a client with any HTTPS redirect URI, so an error
   redirect would be an open redirect (RFC 9700, section 4.11.2).
6. `POST /oauth/token` exchanges the code with the PKCE verifier, and
   refreshes tokens.

Access tokens last one hour. Refresh tokens last 180 days, and each refresh
moves the end. A public client gets a new refresh token at each refresh, and
the old one works for two more minutes, so a client that lost the answer can
retry. One app has one connection: a new approval replaces the earlier one.
**Setup > Sign-in > Connected apps** disconnects an app, and its tokens stop
working at once. The database keeps only the SHA-256 of each code and token.

The hourly cron trigger removes expired sessions, challenges, codes and
tokens, connections without a refresh token, and registered apps that the
owner did not allow within a day.

## Move from Cloudflare Access to passkeys

These steps keep the data. They change only the sign-in.

1. Add the setup code to the Worker:

   ```sh
   pnpm exec wrangler secret put DAYMARK_SETUP_CODE --config vanilla/wrangler.jsonc
   ```

   Versions before passkey support do not read this value, so you can add it
   before the deploy. A deploy never deletes a secret.
2. Deploy this version, with a push to `main`. The workflow applies the
   migration and deploys. Access still protects the host at the edge. The
   `cloudflared` token of the old MCP setup stops working now.
3. Open the app. Access asks you to sign in one last time. Then daymark shows
   **Set up daymark**. Type the setup code and save a passkey.
4. On each other device, sign in with that passkey (with the QR code), then
   add a passkey in **Setup > Sign-in**. Or use the setup code again. An
   installed home-screen app can keep its own cookies, so you may need to sign
   in once inside it too.
5. In Cloudflare Zero Trust, open **Access > Applications**, and delete the
   daymark application.
6. Open the app in a private window. You must see the daymark sign-in page,
   not Access. `curl https://<host>/api/bootstrap` must return `401`.
7. Connect Claude Code again, as in the README. Do this after step 5, because
   Access blocks `/oauth/*` while it is in front.
8. Delete the secrets `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and `ALLOWED_EMAIL`.
   This version does not read them.

To go back, create the Access application again and revert the deploy.

## Move to another host name

A passkey and the session cookie belong to one host name. The data does not
change, and the move needs no code change.

1. Point the new host name at the Worker. Keep the old one for now.
2. Open the new host. Daymark shows **Set up daymark**. Type the setup code
   and save a passkey. Add passkeys on your other devices.
3. Connect Claude Code again with the new URL.
4. In **Setup > Sign-in**, remove the old passkeys and the old connection.
5. Remove the old host name.
