import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import { sha256Hex } from "../../core/utils/crypto.js";
import type { AuthSession } from "../types.js";
import {
  SESSION_IDLE_TTL_MS,
  SESSION_RENEW_AFTER_MS,
} from "../utils/session-times.js";

type AuthSessionProps = BackendLogicProps<"auth", "clock">;

/** Reads and ends the session of a cookie token. Passkey sign-in starts one. */
export class AuthSessionLogic extends Logic<
  AuthSessionProps,
  Record<string, never>
> {
  constructor(deps: AuthSessionProps) {
    super({ deps, initialState: {} });
  }

  /**
   * The live session of a token, or `null`. A session that was last seen more
   * than a day ago gets a new end, so an owner who uses the app stays signed in.
   * `renewed` tells the caller to send the cookie again.
   */
  async authenticate({
    token,
  }: {
    token: string;
  }): Promise<AuthSession | null> {
    const { storage, services } = this.deps;
    const id = await sha256Hex({ value: token });
    const now = services.clock.now();
    const session = await storage.auth.findSession({
      id,
      now,
    });
    if (!session) {
      return null;
    }
    const renewed = now - session.lastSeenAt > SESSION_RENEW_AFTER_MS;
    if (renewed) {
      await storage.auth.renewSession({
        id,
        now,
        expiresAt: now + SESSION_IDLE_TTL_MS,
      });
    }
    return { passkeyId: session.passkeyId, renewed };
  }

  async endSession({ token }: { token: string }): Promise<void> {
    await this.deps.storage.auth.deleteSession({
      id: await sha256Hex({ value: token }),
    });
  }
}
