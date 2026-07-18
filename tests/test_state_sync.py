import importlib
import os
import sys
import tempfile
import unittest


class StateSyncTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.previous_data_dir = os.environ.get("SPORTTERY_DATA_DIR")
        os.environ["SPORTTERY_DATA_DIR"] = self.temp_dir.name
        for name in ("sporttery_web", "sporttery_db"):
            sys.modules.pop(name, None)
        self.storage = importlib.import_module("sporttery_db")
        self.web = importlib.import_module("sporttery_web")

    def tearDown(self):
        for name in ("sporttery_web", "sporttery_db"):
            sys.modules.pop(name, None)
        if self.previous_data_dir is None:
            os.environ.pop("SPORTTERY_DATA_DIR", None)
        else:
            os.environ["SPORTTERY_DATA_DIR"] = self.previous_data_dir
        self.temp_dir.cleanup()

    def test_results_settle_ledger_and_manual_return_is_preserved(self):
        plan_id = "sync-test-plan"
        plan = {
            "id": plan_id,
            "name": "同步测试",
            "passCounts": [2],
            "multiplier": 1,
            "tags": ["已购"],
            "selections": [
                {"key": "910001|had|h", "matchId": 910001, "market": "had", "outcome": "h", "odds": 2.0},
                {"key": "910002|had|a", "matchId": 910002, "market": "had", "outcome": "a", "odds": 3.0},
            ],
        }
        self.storage.store_matches([
            {"matchId": 910001, "matchNum": "周一101", "matchDateTime": "2026-06-01 20:00:00", "homeTeam": "甲", "awayTeam": "乙"},
            {"matchId": 910002, "matchNum": "周一102", "matchDateTime": "2026-06-02 20:00:00", "homeTeam": "丙", "awayTeam": "丁"},
        ])
        self.storage.upsert_plan(plan)
        self.web.refresh_ledger_returns()
        order = next(x for x in self.storage.list_ledger()["items"] if x["plan_id"] == plan_id)
        self.assertEqual("pending", order["status"])
        renamed = {**plan, "name": "同步测试（已改名）"}
        self.storage.upsert_plan(renamed)
        order = next(x for x in self.storage.list_ledger()["items"] if x["plan_id"] == plan_id)
        self.assertEqual("同步测试（已改名）", order["plan_name"])
        self.assertEqual("同步测试", order["snapshot"]["name"])

        for index, (match_id, score, outcome) in enumerate(
            ((910001, "2:0", "h"), (910002, "0:1", "a")), 1
        ):
            self.storage.store_result({
                "matchId": match_id,
                "fullTimeScore": score,
                "halfTimeScore": "0:0",
                "officialResults": {"had": outcome},
                "fetchedAt": f"2026-06-03T00:00:0{index}+08:00",
            })

        summary = self.web.refresh_ledger_returns()
        order = next(x for x in self.storage.list_ledger()["items"] if x["plan_id"] == plan_id)
        self.assertEqual("settled", order["status"])
        self.assertEqual(12.0, order["return_amount"])
        self.assertGreaterEqual(summary["changed"], 1)

        self.storage.update_ledger(order["id"], 123.0)
        self.storage.store_result({
            "matchId": 910001,
            "fullTimeScore": "1:1",
            "halfTimeScore": "0:0",
            "officialResults": {"had": "d"},
            "fetchedAt": "2026-06-04T00:00:00+08:00",
        })
        self.web.refresh_ledger_returns()
        order = next(x for x in self.storage.list_ledger()["items"] if x["plan_id"] == plan_id)
        self.assertEqual(123.0, order["return_amount"])

    def test_deleted_plan_ledger_matches_remain_in_result_sync_scope(self):
        plan_id = "deleted-sync-plan"
        self.storage.store_matches([
            {"matchId": 920001, "matchNum": "周二201", "matchDateTime": "2026-05-10 20:00:00", "homeTeam": "甲", "awayTeam": "乙"},
            {"matchId": 920002, "matchNum": "周二202", "matchDateTime": "2026-05-11 20:00:00", "homeTeam": "丙", "awayTeam": "丁"},
        ])
        self.storage.upsert_plan({
            "id": plan_id,
            "name": "删除后仍需结算",
            "passCounts": [2],
            "multiplier": 1,
            "tags": ["已购"],
            "selections": [
                {"key": "920001|had|h", "matchId": 920001, "market": "had", "outcome": "h", "odds": 1.8},
                {"key": "920002|had|a", "matchId": 920002, "market": "had", "outcome": "a", "odds": 2.1},
            ],
        })
        self.storage.remove_plan(plan_id)

        _, desired_ids, dates = self.web.result_sync_scope([])
        self.assertTrue({920001, 920002}.issubset(desired_ids))
        self.assertTrue({"2026-05-10", "2026-05-11"}.issubset(dates))

    def test_tag_metadata_color_rename_and_order_are_persisted(self):
        existing = self.storage.list_tag_details()
        self.assertTrue(existing)
        first = existing[0]
        self.storage.rename_tag(first["name"], first["name"], "#FF8FB3")
        updated = self.storage.list_tag_details()
        self.assertEqual("#FF8FB3", updated[0]["color"])

        if len(updated) > 1:
            reversed_names = [tag["name"] for tag in reversed(updated)]
            reordered = self.storage.reorder_tags(reversed_names)
            self.assertEqual(reversed_names, [tag["name"] for tag in reordered])
            self.assertEqual(list(range(1, len(reordered) + 1)), [tag["sortOrder"] for tag in reordered])


if __name__ == "__main__":
    unittest.main()
