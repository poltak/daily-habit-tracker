/** The settings of the journal as `GET /api/settings` gives them. */
export interface AppSettings {
  /** The weekday on which a week ends: 0 is Sunday. */
  weekEndsOn: number;
}
