/** The live session of a request. The owner is the only user. */
export interface AuthSession {
  /** The passkey that signed in, or `null` when its record is gone. */
  passkeyId: string | null;
  /** True when this request moved the end of the session. The cookie then goes out again. */
  renewed: boolean;
}
