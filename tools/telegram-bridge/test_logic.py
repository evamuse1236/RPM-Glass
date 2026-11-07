import unittest
from datetime import datetime, timedelta, timezone

import logic

BOTS = [
    {"id": 1, "name": "Ima", "username": "vishwajit_factory_bot", "bot": True},
    {"id": 2, "name": "Ima Test", "username": "vishwajit_imatest_bot", "bot": True},
    {"id": 3, "name": "Pantry", "username": "vishwajit_pantry_bot", "bot": True},
    {"id": 4, "name": "Cupid", "username": "vishwajit_cupid_bot", "bot": True},
    {"id": 5, "name": "BotFather", "username": "BotFather", "bot": True},
    {"id": 777000, "name": "Telegram", "username": None, "bot": False},
    {"id": 6, "name": "Asha", "username": None, "bot": False},
]


class Pick(unittest.TestCase):
    def test_a_spoken_name_finds_its_bot_even_when_another_name_starts_the_same(self):
        self.assertEqual(logic.pick("Ima", BOTS)["id"], 1)
        self.assertEqual(logic.pick("ima test", BOTS)["id"], 2)
        self.assertEqual(logic.pick("the pantry bot", BOTS)["id"], 3)
        self.assertEqual(logic.pick("factory bot", BOTS)["id"], 1)
        self.assertEqual(logic.pick("@vishwajit_cupid_bot", BOTS)["id"], 4)

    def test_a_misheard_name_still_finds_the_bot_that_sounds_alike(self):
        self.assertEqual(logic.pick("Cupit", BOTS)["id"], 4)
        self.assertEqual(logic.pick("Pantri", BOTS)["id"], 3)

    def test_an_unknown_name_lists_the_choices_and_a_tie_asks_which(self):
        with self.assertRaisesRegex(logic.NoMatch, r'No bot called "Zorro"\. Your bots: Ima'):
            logic.pick("Zorro", logic.send_targets(BOTS), "bot")
        with self.assertRaisesRegex(logic.NoMatch, "more than one"):
            logic.pick("vishwajit", BOTS)

    def test_the_login_code_chat_is_never_picked_and_botfather_never_gets_a_send(self):
        with self.assertRaises(logic.NoMatch):
            logic.pick("Telegram", BOTS)
        self.assertNotIn(5, [c["id"] for c in logic.send_targets(BOTS)])
        self.assertNotIn(6, [c["id"] for c in logic.send_targets(BOTS)])


class Access(unittest.TestCase):
    def test_only_the_owner_login_passes_and_a_local_caller_only_when_allowed(self):
        self.assertTrue(logic.allowed("me@x", "127.0.0.1", "me@x"))
        self.assertFalse(logic.allowed("other@x", "127.0.0.1", "me@x", allow_local=True))
        self.assertFalse(logic.allowed(None, "127.0.0.1", "me@x"))
        self.assertTrue(logic.allowed(None, "127.0.0.1", "me@x", allow_local=True))
        self.assertFalse(logic.allowed(None, "100.1.2.3", "me@x", allow_local=True))
        self.assertFalse(logic.allowed("", "127.0.0.1", ""))


class Views(unittest.TestCase):
    def test_a_message_names_its_sender_clips_long_text_and_says_how_long_ago(self):
        now = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)
        view = logic.message_view({"out": False, "sender": "Ima", "text": "x" * 900, "date": now - timedelta(minutes=5)}, now)
        self.assertEqual(view["from"], "Ima")
        self.assertEqual(len(view["text"]), logic.TEXT_MAX)
        self.assertEqual(view["ago"], "5 min ago")
        self.assertEqual(logic.message_view({"out": True, "text": "", "media": "photo", "date": now}, now), {"from": "you", "text": "[photo]", "ago": "just now"})

    def test_limits_hold_whatever_the_model_asks(self):
        self.assertEqual(logic.bounded(99, 5, 1, logic.LIMIT_MAX), logic.LIMIT_MAX)
        self.assertEqual(logic.bounded("x", 5, 1, 10), 5)
        with self.assertRaises(logic.NoMatch):
            logic.send_text("   ")


if __name__ == "__main__":
    unittest.main()
