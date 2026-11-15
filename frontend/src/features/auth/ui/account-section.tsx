import { useMemo } from "react";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { useLogic } from "../../core/logic/use-logic.js";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import { useAuth } from "./auth-context.js";
import { ConnectionsLogic } from "./connections-logic.js";
import { PasskeysLogic } from "./passkeys-logic.js";

function formatDate(value: number): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The sign-in part of the Setup page: the passkeys, the connected apps, and sign-out. */
export function AccountSection() {
  const app = useFrontendApp();
  const auth = useAuth();
  const passkeyDeps = useMemo(
    () => ({
      storage: {},
      services: {
        passkeys: app.services.passkeys,
        dialogs: app.services.dialogs,
      },
      api: { auth: app.api.auth },
      navigationLockEvents: app.navigationLockEvents,
      pageNoticeEvents: app.pageNoticeEvents,
    }),
    [app],
  );
  const { logic: passkeys, state: passkeyState } = useLogic({
    LogicClass: PasskeysLogic,
    deps: passkeyDeps,
  });
  const connectionDeps = useMemo(
    () => ({
      storage: {},
      services: { dialogs: app.services.dialogs },
      api: { auth: app.api.auth },
      navigationLockEvents: app.navigationLockEvents,
      pageNoticeEvents: app.pageNoticeEvents,
    }),
    [app],
  );
  const { logic: connections, state: connectionState } = useLogic({
    LogicClass: ConnectionsLogic,
    deps: connectionDeps,
  });
  const busy =
    passkeyState.addPasskeyState === "running" ||
    passkeyState.removePasskeyState === "running" ||
    connectionState.removeConnectionState === "running" ||
    auth.state.signOutState === "running";
  const onlyPasskey = passkeyState.passkeys.length <= 1;

  async function removePasskey({ id }: { id: string }) {
    await passkeys.removePasskey({ id });
    if (passkeys.state.removePasskeyState === "success") {
      // The session of a removed passkey ends with it.
      await auth.logic.refresh();
    }
  }

  const addingPasskey = passkeyState.addPasskeyState === "running";
  return (
    <>
      <section className="settings-card account-card" aria-busy={busy}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sign-in</p>
            <h2>Passkeys and connected apps</h2>
            <p className="muted small-copy">
              A passkey signs you in with your face, fingerprint or screen lock.
              Add one on each device that you use.
            </p>
          </div>
        </div>
        <h3 className="account-subheading">Passkeys</h3>
        <ul className="account-list passkey-list">
          {passkeyState.passkeys.map((passkey) => (
            <li key={passkey.id} data-id={passkey.id}>
              <span className="management-copy">
                <strong>
                  {passkey.current
                    ? `${passkey.name} · this device`
                    : passkey.name}
                </strong>
                <small>
                  {`Added ${formatDate(passkey.createdAt)} · ${
                    passkey.lastUsedAt
                      ? `Last used ${formatDate(passkey.lastUsedAt)}`
                      : "Not used to sign in yet"
                  }${passkey.synced ? " · Synced" : ""}`}
                </small>
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || onlyPasskey}
                title={
                  onlyPasskey
                    ? "Add another passkey before you remove this one."
                    : undefined
                }
                aria-label={`Remove passkey ${passkey.name}`}
                onClick={() => void removePasskey({ id: passkey.id })}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="account-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            aria-busy={addingPasskey}
            onClick={() => void passkeys.addPasskey()}
          >
            {addingPasskey ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <MaterialIcon name="passkey" />
            )}{" "}
            Add a passkey on this device
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void auth.logic.signOut()}
          >
            <MaterialIcon name="logout" /> Sign out
          </button>
        </div>
        {auth.state.signOutError && (
          <p role="alert">{auth.state.signOutError}</p>
        )}
        <h3 className="account-subheading">Connected apps</h3>
        {connectionState.loadConnectionsState === "success" &&
          connectionState.connections.length === 0 && (
            <p className="muted small-copy account-empty">
              No apps are connected. An MCP client such as Claude Code shows
              here after you allow it.
            </p>
          )}
        <ul className="account-list connection-list">
          {connectionState.connections.map((connection) => (
            <li key={connection.id} data-id={connection.id}>
              <span className="management-copy">
                <strong>{connection.name}</strong>
                <small>
                  {`Connected ${formatDate(connection.createdAt)} · ${
                    connection.lastUsedAt
                      ? `Last used ${formatDate(connection.lastUsedAt)}`
                      : "Not used yet"
                  }`}
                </small>
              </span>
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                aria-label={`Disconnect ${connection.name}`}
                onClick={() =>
                  void connections.removeConnection({ id: connection.id })
                }
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
