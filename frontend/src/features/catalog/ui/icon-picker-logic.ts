import { Logic } from "@app/common/features/core/logic/logic";
import type { ActivityIconChoice } from "@app/common/features/catalog/utils/curated-icons";
import { ACTIVITY_ICON_CHOICES } from "@app/common/features/catalog/utils/activity-icons";
import type { FrontendLogicProps } from "../../core/logic/types.js";

const PAGE_SIZE = 120;

export const ALL_CATEGORIES = "All";

/** "All", then each category in the order of the icon list. */
export const ICON_CATEGORIES: readonly string[] = [
  ALL_CATEGORIES,
  ...new Set(ACTIVITY_ICON_CHOICES.map((choice) => choice.category)),
];

/** The words of an icon name, for the label and for the search. */
export function iconLabel(name: string): string {
  return name.replaceAll("_", " ");
}

interface IconPickerState {
  query: string;
  category: string;
  /** How many of the matching icons show. */
  visibleLimit: number;
}

/** The search, the category and the page of the icon dialog. */
export class IconPickerLogic extends Logic<
  FrontendLogicProps,
  IconPickerState
> {
  constructor(deps: FrontendLogicProps) {
    super({
      deps,
      initialState: {
        query: "",
        category: ALL_CATEGORIES,
        visibleLimit: PAGE_SIZE,
      },
    });
  }

  setQuery({ query }: { query: string }): void {
    this.setState({ query, visibleLimit: PAGE_SIZE });
  }

  chooseCategory({ category }: { category: string }): void {
    this.setState({ category, visibleLimit: PAGE_SIZE });
  }

  showMore(): void {
    this.setState({ visibleLimit: this.state.visibleLimit + PAGE_SIZE });
  }

  /** Every icon that the category and the search keep. */
  matches(): ActivityIconChoice[] {
    const { category, query } = this.state;
    const normalized = query.trim().toLowerCase();
    return ACTIVITY_ICON_CHOICES.filter(
      (choice) =>
        (category === ALL_CATEGORIES || choice.category === category) &&
        (!normalized ||
          `${choice.name} ${iconLabel(choice.name)} ${choice.category}`
            .toLowerCase()
            .includes(normalized)),
    );
  }
}
