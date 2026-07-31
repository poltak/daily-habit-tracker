import unittest

from scripts.daylio_import import normalize_backup


class DaylioImportTests(unittest.TestCase):
    def setUp(self):
        self.root = {
            "version": 15,
            "metadata": {"number_of_photos": 1},
            "customMoods": [
                {"id": 1, "predefined_name_id": 1, "custom_name": ""},
                {"id": 2, "predefined_name_id": 2, "custom_name": ""},
                {"id": 3, "predefined_name_id": 3, "custom_name": ""},
                {"id": 4, "predefined_name_id": 4, "custom_name": ""},
                {"id": 5, "predefined_name_id": 5, "custom_name": ""},
            ],
            "tag_groups": [{"id": 10, "name": "Health", "order": 0}],
            "tags": [
                {"id": 20, "id_tag_group": 10, "name": "Walk ", "icon": 99, "order": 0, "state": 0},
                {"id": 21, "id_tag_group": 10, "name": "Walk", "icon": 100, "order": 1, "state": 0},
            ],
            "dayEntries": [
                {"id": 30, "year": 2026, "month": 6, "day": 30, "hour": 23, "minute": 8, "timeZoneOffset": 25200000, "mood": 2, "tags": [20], "note": "kept", "note_title": ""}
            ],
            "goals": [{"goal_id": 40, "id_tag": 20, "name": "Walk", "repeat_type": 2, "repeat_value": 3, "state": 0, "order": 0}],
            "goalEntries": [{"id": 50, "goalId": 40, "year": 2026, "month": 7, "day": 1, "hour": 7, "minute": 5, "second": 0}],
        }

    def test_collection_specific_month_conventions_and_duplicate_names(self):
        payload = normalize_backup(self.root)
        self.assertEqual(payload["entries"][0]["logicalDate"], "2026-07-30")
        self.assertEqual(payload["completions"][0]["logicalDate"], "2026-07-01")
        self.assertEqual(payload["activities"][0]["name"], "Walk")
        self.assertEqual(len(payload["activities"]), 2)
        self.assertEqual(payload["goals"][0]["targetPerWeek"], 3)
        self.assertEqual(payload["entries"][0]["timezoneOffsetMinutes"], 420)

    def test_csv_reconciliation_ignores_source_whitespace(self):
        rows = [{"full_date": "2026-07-30", "time": "23:08", "mood": "good", "activities": "Walk"}]
        payload = normalize_backup(self.root, rows)
        self.assertEqual(payload["csvMismatches"], {"mood": 0, "time": 0, "activities": 0})

    def test_csv_reconciliation_reports_changed_fields(self):
        rows = [{"full_date": "2026-07-30", "time": "22:08", "mood": "bad", "activities": "Other"}]
        payload = normalize_backup(self.root, rows)
        self.assertEqual(payload["csvMismatches"], {"mood": 1, "time": 1, "activities": 1})

    def test_unlinked_goal_keeps_daylio_activity_id_for_store_reconciliation(self):
        self.root["goals"][0]["id_tag"] = -1
        payload = normalize_backup(self.root)
        self.assertEqual(payload["goals"][0]["activitySourceId"], "-1")
        self.assertEqual(payload["goalStateSummary"][0]["rawState"], 0)
        self.assertEqual(payload["goalStateSummary"][0]["completionCount"], 1)


if __name__ == "__main__":
    unittest.main()
