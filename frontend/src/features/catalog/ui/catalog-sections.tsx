import { useEffect, useRef } from "react";
import { actionKey, reorderKey } from "../utils/catalog-mutations.js";
import { useCatalogSetup } from "./catalog-setup-context.js";
import { IconPicker } from "./icon-picker.js";
import { SetupActivitiesSection } from "./setup-activities-section.js";
import { SetupGoalsSection } from "./setup-goals-section.js";

interface CatalogSectionsProps {
  onAddActivity: (groupId: string) => void;
  onConfigureGoal: (goalId: string) => void;
}

/** The activity groups and the goals of the Setup page. */
export function CatalogSections({
  onAddActivity,
  onConfigureGoal,
}: CatalogSectionsProps) {
  const { logic, state } = useCatalogSetup();
  const mounts = useRef(0);
  useEffect(() => {
    mounts.current += 1;
    logic.startVisit();
    void logic.load();
    return () => {
      mounts.current -= 1;
      // A notice belongs to the visit, so the next visit starts clean. A
      // remount in the same tick, as in development, keeps it.
      queueMicrotask(() => {
        if (mounts.current === 0) {
          logic.clearNotice();
        }
      });
    };
  }, [logic]);
  const { iconTarget } = state;
  return (
    <>
      <SetupActivitiesSection onAddActivity={onAddActivity} />
      <SetupGoalsSection onConfigureGoal={onConfigureGoal} />
      {iconTarget && (
        <IconPicker
          kind="Activity"
          subject={iconTarget.name}
          currentIcon={iconTarget.icon}
          isSaving={
            logic.isPending(
              actionKey({ kind: "activity", id: iconTarget.id }),
            ) || logic.isPending(reorderKey("activity"))
          }
          onSelect={(icon) => void logic.chooseIcon({ icon })}
          onClose={() => logic.closeIconPicker()}
        />
      )}
    </>
  );
}
