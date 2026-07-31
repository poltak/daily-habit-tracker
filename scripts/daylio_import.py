#!/usr/bin/env python3
"""Parse a Daylio Android .daylio backup into the app's normalized import shape.

The real backup and CSV stay outside the repository. This script intentionally
prints aggregate reconciliation results rather than note contents or photos.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import json
import sys
import zipfile
from collections import Counter
from datetime import date
from pathlib import Path
from typing import Any


DEFAULT_MOODS = {1: "rad", 2: "good", 3: "meh", 4: "bad", 5: "awful"}


def source_id(value: Any) -> str:
    return str(value)


def entry_date(item: dict[str, Any], *, goal_history: bool = False) -> str:
    month = int(item["month"]) if goal_history else int(item["month"]) + 1
    return date(int(item["year"]), month, int(item["day"])).isoformat()


def hhmm(item: dict[str, Any], include_seconds: bool = False) -> str:
    result = f"{int(item.get('hour', 0)):02d}:{int(item.get('minute', 0)):02d}"
    if include_seconds:
        result += f":{int(item.get('second', 0)):02d}"
    return result


def timezone_offset_minutes(value: Any) -> int | None:
    if value is None:
        return None
    offset = int(value)
    # Daylio backups store this field in milliseconds despite its compact
    # numeric representation. Keep the normalized contract in minutes.
    return offset // 60_000 if abs(offset) > 24 * 60 else offset


def read_backup(path: Path) -> tuple[dict[str, Any], str]:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    with zipfile.ZipFile(path) as archive:
        if "backup.daylio" not in archive.namelist():
            raise ValueError("The archive does not contain backup.daylio")
        encoded = b"".join(archive.read("backup.daylio").split())
    decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    payload = json.loads(decoded)
    if payload.get("version") != 15:
        raise ValueError(f"Unsupported Daylio backup version: {payload.get('version')!r}")
    return payload, digest


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def mood_name(item: dict[str, Any]) -> str:
    custom = item.get("custom_name")
    if isinstance(custom, str) and custom.strip():
        return custom.strip()
    return DEFAULT_MOODS.get(int(item.get("predefined_name_id", 0)), "Unknown")


def csv_activities(row: dict[str, str]) -> list[str]:
    return sorted((value.strip() for value in (row.get("activities") or "").split(" | ") if value.strip()), key=str.casefold)


def normalize_backup(root: dict[str, Any], csv_rows: list[dict[str, str]] | None = None, source_sha256: str | None = None, csv_sha256: str | None = None) -> dict[str, Any]:
    moods = root.get("customMoods", [])
    groups = root.get("tag_groups", [])
    tags = root.get("tags", [])
    entries = root.get("dayEntries", [])
    goals = root.get("goals", [])
    goal_entries = root.get("goalEntries", [])

    mood_by_id = {source_id(item["id"]): mood_name(item) for item in moods}
    group_by_id = {source_id(item["id"]): item for item in groups}
    tag_by_id = {source_id(item["id"]): item for item in tags}
    normalized_moods = [
        {"sourceId": source_id(item["id"]), "name": mood_name(item), "score": max(1, min(5, 6 - int(item.get("predefined_name_id", 3))))}
        for item in moods
    ]
    normalized_groups = [
        {"sourceId": source_id(item["id"]), "name": item.get("name") or "Untitled group", "sortOrder": int(item.get("order", 0)), "archived": False}
        for item in groups
    ]
    normalized_activities = [
        {
            "sourceId": source_id(item["id"]),
            "groupSourceId": source_id(item.get("id_tag_group")),
            "name": (item.get("name") or "Untitled activity").strip(),
            "sourceIconId": source_id(item.get("icon")) if item.get("icon") is not None else None,
            "sourceState": int(item.get("state", 0)),
            "sortOrder": int(item.get("order", 0)),
            "archived": False,
        }
        for item in tags
    ]
    normalized_entries = []
    for item in entries:
        normalized_entries.append(
            {
                "sourceId": source_id(item["id"]),
                "logicalDate": entry_date(item),
                "localTime": hhmm(item),
                "timezoneOffsetMinutes": timezone_offset_minutes(item.get("timeZoneOffset")),
                "moodSourceId": source_id(item["mood"]),
                "activitySourceIds": [source_id(value) for value in item.get("tags", [])],
                "legacyNoteTitle": item.get("note_title") or None,
                "legacyNote": item.get("note") or None,
            }
        )

    normalized_goals = []
    for item in goals:
        repeat_type = int(item.get("repeat_type", 0))
        repeat_value = int(item.get("repeat_value", 0)) if item.get("repeat_value") is not None else None
        normalized_goals.append(
            {
                "sourceId": source_id(item["goal_id"]),
                "activitySourceId": source_id(item.get("id_tag")),
                "name": item.get("name") or "Activity goal",
                "scheduleType": "times_per_week" if repeat_type == 2 else "weekdays",
                "targetPerWeek": repeat_value if repeat_type == 2 and repeat_value is not None and repeat_value <= 7 else None,
                "weekdaysMask": repeat_value if repeat_type != 2 and repeat_value is not None else None,
                "sortOrder": int(item.get("order", 0)),
                "archived": False,
                "reminderEnabled": bool(item.get("reminder_enabled")),
                "reminderTime": f"{int(item.get('reminder_hour', 0)):02d}:{int(item.get('reminder_minute', 0)):02d}",
                "sourceState": int(item.get("state", 0)),
            }
        )

    normalized_completions = [
        {
            "sourceId": source_id(item["id"]),
            "goalSourceId": source_id(item["goalId"]),
            "logicalDate": entry_date(item, goal_history=True),
            "localTime": hhmm(item, include_seconds=True),
        }
        for item in goal_entries
    ]
    completion_dates_by_goal: dict[str, list[str]] = {}
    for completion in normalized_completions:
        completion_dates_by_goal.setdefault(completion["goalSourceId"], []).append(completion["logicalDate"])
    goal_state_summary = []
    for goal in normalized_goals:
        dates = sorted(completion_dates_by_goal.get(goal["sourceId"], []))
        goal_state_summary.append({
            "sourceId": goal["sourceId"],
            "name": goal["name"],
            "rawState": goal["sourceState"],
            "completionCount": len(dates),
            "firstCompletion": dates[0] if dates else None,
            "lastCompletion": dates[-1] if dates else None,
        })

    report: dict[str, Any] = {
        "backupVersion": root.get("version"),
        "entries": len(normalized_entries),
        "dateRange": [min((item["logicalDate"] for item in normalized_entries), default=None), max((item["logicalDate"] for item in normalized_entries), default=None)],
        "distinctDates": len({item["logicalDate"] for item in normalized_entries}),
        "moods": len(normalized_moods),
        "activities": len(normalized_activities),
        "activityNames": len({item["name"].strip().casefold() for item in normalized_activities}),
        "groups": len(normalized_groups),
        "goals": len(normalized_goals),
        "goalCompletions": len(normalized_completions),
        "notes": sum(bool(item.get("legacyNote")) for item in normalized_entries),
        "noteTitles": sum(bool(item.get("legacyNoteTitle")) for item in normalized_entries),
        "photoManifest": int(root.get("metadata", {}).get("number_of_photos", 0)),
        "sourceSha256": source_sha256,
        "csvSha256": csv_sha256,
        "goalStateSummary": goal_state_summary,
    }

    if csv_rows is not None:
        backup_by_date = {item["logicalDate"]: item for item in normalized_entries}
        csv_by_date = {row.get("full_date") or row.get("date"): row for row in csv_rows}
        mismatches = {"mood": 0, "time": 0, "activities": 0}
        activity_names_by_id = {source_id(item["id"]): (item.get("name", "") or "").strip() for item in tags}
        for logical_date in set(backup_by_date) & set(csv_by_date):
            backup = backup_by_date[logical_date]
            csv_row = csv_by_date[logical_date]
            backup_mood = mood_by_id.get(backup["moodSourceId"], "").casefold()
            if backup_mood != (csv_row.get("mood") or "").strip().casefold():
                mismatches["mood"] += 1
            if backup["localTime"] != (csv_row.get("time") or "")[:5]:
                mismatches["time"] += 1
            backup_activities = sorted((activity_names_by_id.get(value, "") for value in backup["activitySourceIds"]), key=str.casefold)
            if [value.casefold() for value in backup_activities] != [value.casefold() for value in csv_activities(csv_row)]:
                mismatches["activities"] += 1
        report["csvRows"] = len(csv_rows)
        report["csvMismatches"] = mismatches
        report["csvOnlyDates"] = len(set(csv_by_date) - set(backup_by_date))
        report["backupOnlyDates"] = len(set(backup_by_date) - set(csv_by_date))

    return {"sourceSystem": "daylio", "sourceSha256": source_sha256, "csvSha256": csv_sha256, **report, "moods": normalized_moods, "groups": normalized_groups, "activities": normalized_activities, "entries": normalized_entries, "goals": normalized_goals, "completions": normalized_completions}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--csv", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        root, digest = read_backup(args.backup)
        rows = read_csv(args.csv) if args.csv else None
        csv_digest = hashlib.sha256(args.csv.read_bytes()).hexdigest() if args.csv else None
        payload = normalize_backup(root, rows, digest, csv_digest)
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, base64.binascii.Error) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        return 1
    if args.output:
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = {key: value for key, value in payload.items() if key not in {"moods", "groups", "activities", "entries", "goals", "completions"}}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
