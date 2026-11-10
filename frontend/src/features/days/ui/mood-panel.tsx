import type { CSSProperties } from "react";
import type { Mood } from "@app/common/features/catalog/types";
import { MoodFace } from "../../core/ui/mood-face.js";

interface MoodPanelProps {
  moods: readonly Mood[];
  chosenMoodId: string;
  /** True while the day loads, or while a tap waits for the server. */
  busy: boolean;
  unavailable: boolean;
  onChoose: (moodId: string) => void;
}

export function MoodPanel({
  moods,
  chosenMoodId,
  busy,
  unavailable,
  onChoose,
}: MoodPanelProps) {
  return (
    <section className="panel mood-panel">
      <div className="section-heading">
        <h2>Overall mood</h2>
        <span className="required-label">required</span>
      </div>
      <div className="mood-grid" aria-busy={busy}>
        {moods.map((mood) => {
          const chosen = chosenMoodId === mood.id;
          return (
            <button
              key={`${mood.id}|${mood.score}|${mood.color}|${mood.name}`}
              type="button"
              className={`mood-option ${chosen ? "selected" : ""}`}
              style={{ "--mood-color": mood.color } as CSSProperties}
              aria-pressed={chosen}
              disabled={unavailable}
              onClick={() => onChoose(mood.id)}
            >
              <MoodFace
                score={mood.score}
                color={mood.color}
                className="mood-emoji"
              />
              <span>{mood.name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
