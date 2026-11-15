/** The newest protocol version first. The server answers with the version of the client when it knows it. */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

export const SERVER_INFO = {
  name: "daymark",
  title: "Daymark journal",
  version: "1.0.0",
};

/** The longest span of day-level rows one call returns, so a response stays a manageable size. */
export const MAX_DAY_RANGE = 366;

export const SERVER_INSTRUCTIONS = [
  "Daymark is a personal daily journal. It holds one entry per calendar day: a mood scored from 1 (worst) to 5 (best), the activities done that day, and the goals completed.",
  "Call get_overview first to learn the moods, activities, goals and how much history exists.",
  "To analyse long periods, use summarize_mood and summarize_activities, which cover any span in one call. Use get_days for day-level detail, at most 366 days per call.",
  "Dates are calendar dates in the journal owner's local time, written YYYY-MM-DD. The server does not know the owner's time zone, so pass explicit dates.",
  "save_day adds an entry for today or an earlier day. It refuses to overwrite an existing day unless replace_existing is true.",
].join(" ");

export const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const DATE_PROPERTY = { type: "string", pattern: DATE_PATTERN };

export interface JsonSchema {
  type: "object";
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint: boolean;
  };
}

const RANGE_PROPERTIES = {
  start_date: {
    ...DATE_PROPERTY,
    description:
      "First day to include, YYYY-MM-DD. Defaults to the first recorded day.",
  },
  end_date: {
    ...DATE_PROPERTY,
    description:
      "Last day to include, YYYY-MM-DD. Defaults to the last recorded day.",
  },
};

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "get_overview",
    title: "Journal overview",
    description:
      "Start here. Returns the vocabulary of the journal and how much history it holds: the five moods with their scores (5 is best, 1 is worst), every activity by group, the goals with their schedules, the day a week ends on, and the first day, last day and number of recorded days.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "get_days",
    title: "Day-by-day entries",
    description: `Returns each recorded day in a date range, oldest first: the date, weekday, mood name and score, the activities done, and the goals completed. Days with no saved entry are left out. One call covers at most ${MAX_DAY_RANGE} days. For longer periods, call it once per year or use summarize_mood and summarize_activities, which cover any span in one call.`,
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          ...DATE_PROPERTY,
          description: "First day to include, YYYY-MM-DD.",
        },
        end_date: {
          ...DATE_PROPERTY,
          description: "Last day to include, YYYY-MM-DD.",
        },
      },
      required: ["start_date", "end_date"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "summarize_mood",
    title: "Mood summary by period",
    description:
      "Summarizes mood over any span in one call. Returns the number of recorded days, the mean mood score (1 to 5), the share of days scored 4 or 5, and how many days had each mood, for the whole range and for each period. Group by month, year, week or weekday to see trends and rhythms. Days without an entry are not counted.",
    inputSchema: {
      type: "object",
      properties: {
        ...RANGE_PROPERTIES,
        group_by: {
          type: "string",
          enum: ["month", "year", "week", "weekday", "none"],
          description:
            "How to split the range into periods. Defaults to month. Weeks are labelled by their first day and follow the journal's week setting.",
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "summarize_activities",
    title: "Activity frequency and mood association",
    description:
      "For every activity, over any span in one call: how many days it was recorded, its share of recorded days, the mean mood on days with it and on days without it, and the difference. Rows are ranked by that difference, largest first. The difference describes an association in the recorded days and does not show that the activity caused the mood. Rows marked small_sample have fewer than 10 days on one side and are weak evidence.",
    inputSchema: {
      type: "object",
      properties: {
        ...RANGE_PROPERTIES,
        min_days: {
          type: "integer",
          minimum: 1,
          description:
            "Leave out activities recorded on fewer days than this. Defaults to 1.",
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "get_goal_history",
    title: "Goal completions and weekly results",
    description: `Returns one goal's history in a date range of at most ${MAX_DAY_RANGE} days: the dates it was completed and a result for each week (accomplished, not_accomplished, in_progress or upcoming) with completed and expected day counts. Weeks before the goal's start date are left out.`,
    inputSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "The goal's name or id, from get_overview.",
        },
        start_date: {
          ...DATE_PROPERTY,
          description: "First day to include, YYYY-MM-DD.",
        },
        end_date: {
          ...DATE_PROPERTY,
          description: "Last day to include, YYYY-MM-DD.",
        },
        today: {
          ...DATE_PROPERTY,
          description:
            "Today's date where the journal owner lives, YYYY-MM-DD. It decides which week is in progress. Defaults to the server's date, which is in UTC.",
        },
      },
      required: ["goal", "start_date", "end_date"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: "save_day",
    title: "Add or replace a day's entry",
    description:
      "Saves the entry for one day: its mood and the full list of activities done. A day that has not started is refused. The journal holds one entry per day, so this also fails if the day already has an entry unless replace_existing is true, and replacing overwrites that day's mood, activities and goal completions. Goals linked to an activity are completed automatically when that activity is listed, and completing a linked goal adds its activity. Activities, goals and moods can be given by name or by id from get_overview.",
    inputSchema: {
      type: "object",
      properties: {
        date: {
          ...DATE_PROPERTY,
          description:
            "The day the entry describes, YYYY-MM-DD, in the journal owner's local time. It must be today or an earlier day.",
        },
        mood: {
          type: ["string", "integer"],
          description:
            'A mood name such as "Good", a mood id, or a score from 1 (worst) to 5 (best).',
        },
        activities: {
          type: "array",
          items: { type: "string" },
          description:
            "Every activity done that day, by name or id. Pass an empty list for none.",
        },
        completed_goals: {
          type: "array",
          items: { type: "string" },
          description:
            "Goals to mark completed that day, by name or id. Only needed for goals with no linked activity. When given, unlinked goals not listed are marked not completed. When omitted, they are left as they are.",
        },
        replace_existing: {
          type: "boolean",
          description:
            "Set true to overwrite an entry that already exists for this day. Defaults to false.",
        },
      },
      required: ["date", "mood", "activities"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
