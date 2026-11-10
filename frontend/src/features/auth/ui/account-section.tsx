import { useMemo } from "react";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { useLogic } from "../../core/logic/use-logic.js";
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
  const passkeyNotice =
    passkeyState.notice ??
    (passkeyState.loadPasskeysError
      ? { kind: "error" as const, text: passkeyState.loadPasskeysError }
      : null);
  const connectionNotice =
    connectionState.notice ??
    (connectionState.loadConnectionsError
      ? { kind: "error" as const, text: connectionState.loadConnectionsError }
      : null);

  async function removePasskey({ id }: { id: string }) {
    await passkeys.removePasskey({ id });
    if (passkeys.state.removePasskeyState === "success") {
      // The session of a removed passkey ends with it.
      await auth.logic.refresh();
    }
  }

  return (
    <section className="settings-card account-card" aria-busy={busy}>
      <div>
        <p className="eyebrow">Sign-in</p>
        <h2>Passkeys and connected apps</h2>
        <p className="muted">
          A passkey signs you in with your face, fingerprint or screen lock. Add
          one on each device that you use.
        </p>
      </div>
      <h3 className="account-subheading">Passkeys</h3>
      {passkeyNotice && (
        <output className={`settings-notice ${passkeyNotice.kind}`}>
          {passkeyNotice.text}
        </output>
      )}
      <ul className="account-list passkey-list">
        {passkeyState.passkeys.map((passkey) => (
          <li key={passkey.id}>
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
          disabled={busy}
          aria-busy={passkeyState.addPasskeyState === "running"}
          onClick={() => void passkeys.addPasskey()}
        >
          Add a passkey on this device
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void auth.logic.signOut()}
        >
          Sign out
        </button>
      </div>
      <h3 className="account-subheading">Connected apps</h3>
      {connectionNotice && (
        <output className={`settings-notice ${connectionNotice.kind}`}>
          {connectionNotice.text}
        </output>
      )}
      {connectionState.loadConnectionsState === "success" &&
        connectionState.connections.length === 0 && (
          <p className="muted account-empty">
            No apps are connected. An MCP client such as Claude Code shows here
            after you allow it.
          </p>
        )}
      <ul className="account-list connection-list">
        {connectionState.connections.map((connection) => (
          <li key={connection.id}>
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
  );
}
