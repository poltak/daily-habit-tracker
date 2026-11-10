import {
  WEEKDAY_NAMES,
  weekRangeLabel,
} from "@app/common/features/settings/utils/week";
import { useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import type { ThemePreference } from "../utils/theme.js";
import { useTheme } from "./settings-context.js";
import { WeekLogic } from "./week-logic.js";

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  {
    value: "system",
    label: "System",
    description: "Follow your device setting",
  },
  {
    value: "light",
    label: "Light",
    description: "Keep the warm Daymark palette",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use a softer low-light palette",
  },
];

interface SetupPageProps {
  /** The sign-in part: the passkeys, the connected apps, and sign-out. The auth feature supplies it. */
  account: ReactNode;
}

/** The Setup page: the theme of this device, the week, and the account. */
export function SetupPage({ account }: SetupPageProps) {
  const app = useFrontendApp();
  const theme = useTheme();
  const weekDeps = useMemo(
    () => ({ storage: {}, services: {}, api: { settings: app.api.settings } }),
    [app],
  );
  const { logic: week, state: weekState } = useLogic({
    LogicClass: WeekLogic,
    deps: weekDeps,
  });
  const weekBusy =
    weekState.loadState === "running" || weekState.saveState === "running";
  const weekNotice =
    weekState.saveError ??
    weekState.loadError ??
    (weekState.saveState === "success"
      ? `Weeks now run ${weekRangeLabel(weekState.weekEndsOn)}.`
      : null);

  return (
    <section className="page-section settings-page">
      <div className="page-intro">
        <p className="eyebrow">Your setup</p>
        <h1>Make it yours</h1>
        <p className="muted">
          Your space, your routines. Set up a journal that feels like you.
        </p>
      </div>

      {weekNotice && (
        <output
          className={`settings-notice ${(weekState.saveError ?? weekState.loadError) ? "error" : "success"}`}
        >
          {weekNotice}
        </output>
      )}

      <section className="settings-card appearance-card">
        <div>
          <p className="eyebrow">Appearance</p>
          <h2>Choose your theme</h2>
          <p className="muted">
            System follows your device. Your choice is saved on this device.
          </p>
        </div>
        <div
          className="theme-options"
          role="radiogroup"
          aria-label="Appearance theme"
        >
          {THEME_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`theme-option ${theme.state.preference === option.value ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="theme-preference"
                value={option.value}
                checked={theme.state.preference === option.value}
                onChange={() =>
                  theme.logic.select({ preference: option.value })
                }
              />
              <span
                className={`theme-preview theme-preview-${option.value}`}
                aria-hidden="true"
              />
              <span className="theme-option-copy">
                <strong>{option.label}</strong>{" "}
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-card week-card" aria-busy={weekBusy}>
        <div>
          <p className="eyebrow">Week</p>
          <h2>Choose when your week ends</h2>
          <p className="muted">
            {`Weekly goal results, weekly insights, and calendars run ${weekRangeLabel(weekState.weekEndsOn)}. This applies on every device.`}
          </p>
        </div>
        <label className="week-end-field">
          <span>Week ends on</span>
          <select
            value={String(weekState.weekEndsOn)}
            disabled={weekBusy}
            onChange={(event) =>
              void week.changeWeekEnd({
                weekEndsOn: Number(event.target.value),
              })
            }
          >
            {WEEKDAY_NAMES.map((name, weekday) => (
              <option key={name} value={String(weekday)}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {account}
    </section>
  );
}
