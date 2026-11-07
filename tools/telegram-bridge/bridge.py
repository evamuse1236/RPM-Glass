#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["telethon>=1.36,<2", "aiohttp>=3.9,<4"]
# ///
"""RPM's Telegram bridge: the phone's voice agent sends to the owner's bots and reads their chats through this.

It holds the owner's Telethon session (keyring: telegram-user-session, telegram-api-id, telegram-api-hash) and
listens on 127.0.0.1 only. `tailscale serve` puts it on the tailnet over HTTPS and adds Tailscale-User-Login,
which must name the owner. Reading never marks a chat read. Sending goes only to bots.

  bridge.py serve [--port 8466] [--owner login] [--allow-local]
  bridge.py check            print the bot list as the bridge sees it (no server)
"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
import time

from aiohttp import web
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import User

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import logic  # noqa: E402

SESSION, API_ID, API_HASH = "telegram-user-session", "telegram-api-id", "telegram-api-hash"
DIALOG_TTL = 60


def secret(name):
    env = {k: v for k, v in os.environ.items() if k != "VIRTUAL_ENV"}
    r = subprocess.run(["secret", "get", "--reveal", name], capture_output=True, text=True, env=env)
    if r.returncode != 0 or not r.stdout.strip():
        sys.exit(f"keyring has no {name}")
    return r.stdout.strip()


def owner_login():
    r = subprocess.run(["tailscale", "status", "--json"], capture_output=True, text=True)
    status = json.loads(r.stdout)
    return status["User"][str(status["Self"]["UserID"])]["LoginName"]


def media_kind(message):
    if not message.media:
        return None
    for kind in ("photo", "voice", "video", "audio", "sticker", "gif", "document", "poll", "geo", "contact"):
        if getattr(message, kind, None):
            return kind
    return "media"


def muted(dialog):
    until = getattr(getattr(dialog.dialog, "notify_settings", None), "mute_until", None)
    return bool(until and until.timestamp() > time.time())


def chat_of(dialog):
    entity = dialog.entity
    return {"id": dialog.id, "name": dialog.name, "username": getattr(entity, "username", None),
            "bot": isinstance(entity, User) and bool(entity.bot), "unread": dialog.unread_count, "muted": muted(dialog)}


class Bridge:
    def __init__(self, client):
        self.client, self.chats, self.at = client, [], 0

    async def dialogs(self, fresh=False):
        if fresh or time.monotonic() - self.at > DIALOG_TTL:
            self.chats = [chat_of(d) for d in await self.client.get_dialogs(limit=100, archived=False)]
            self.at = time.monotonic()
        return self.chats

    async def view(self, message):
        sender = None
        if not message.out:
            who = await message.get_sender()
            sender = getattr(who, "first_name", None) or getattr(who, "title", None)
        return logic.message_view({"out": message.out, "sender": sender, "text": message.message, "media": media_kind(message), "date": message.date})

    async def send(self, body):
        bot = logic.pick(body.get("to"), logic.send_targets(await self.dialogs()), "bot")
        text = logic.send_text(body.get("text"))
        if body.get("dry"):
            return {"draft": {"to": logic.label(bot), "username": bot["username"], "text": text}}
        sent = await self.client.send_message(bot["id"], text)
        return {"sent": {"to": logic.label(bot), "username": bot["username"], "text": text, "id": sent.id}}

    async def bots(self, body):
        return {"bots": [logic.label(c) for c in logic.send_targets(await self.dialogs())]}

    async def read_chat(self, body):
        chat = logic.pick(body.get("chat"), await self.dialogs())
        limit = logic.bounded(body.get("limit"), 5, 1, logic.LIMIT_MAX)
        wait = logic.bounded(body.get("waitSeconds"), 0, 0, logic.WAIT_MAX)
        messages = await self.client.get_messages(chat["id"], limit=limit)
        deadline = time.monotonic() + wait
        while wait and messages and messages[0].out and time.monotonic() < deadline:
            await asyncio.sleep(1)
            messages = await self.client.get_messages(chat["id"], limit=limit)
        fresh = await self.dialogs(fresh=True)
        unread = next((c["unread"] for c in fresh if c["id"] == chat["id"]), 0)
        out = {"chat": logic.label(chat), "bot": chat["bot"], "unread": unread, "messages": [await self.view(m) for m in reversed(messages)]}
        if messages and messages[0].out:
            out["note"] = "Your message is the newest one: no reply yet."
        return out

    async def read_unread(self, body):
        chats = [c for c in await self.dialogs(fresh=True) if c["unread"] and not c["muted"] and c["id"] not in logic.LOGIN_CODE_CHATS]
        out = []
        for c in chats[: logic.CHATS_MAX]:
            messages = await self.client.get_messages(c["id"], limit=min(c["unread"], logic.PER_CHAT_MAX))
            out.append({"chat": logic.label(c), "bot": c["bot"], "unread": c["unread"], "messages": [await self.view(m) for m in reversed(messages)]})
        return {"unreadChats": len(chats), "chats": out}

    async def read(self, body):
        return await (self.read_chat(body) if body.get("chat") else self.read_unread(body))


def app_for(bridge, owner, allow_local):
    async def guard(request, action):
        if not logic.allowed(request.headers.get("Tailscale-User-Login"), request.remote, owner, allow_local):
            return web.json_response({"error": "This phone is not allowed to use Telegram."}, status=403)
        try:
            body = await request.json()
        except Exception:
            body = {}
        try:
            return web.json_response(await action(body))
        except logic.NoMatch as error:
            return web.json_response({"error": str(error)}, status=404)
        except Exception as error:
            print(f"telegram bridge error: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
            return web.json_response({"error": "Telegram did not answer. Try again."}, status=502)

    app = web.Application(client_max_size=64 * 1024)
    app.router.add_post("/send", lambda r: guard(r, bridge.send))
    app.router.add_post("/read", lambda r: guard(r, bridge.read))
    app.router.add_post("/bots", lambda r: guard(r, bridge.bots))
    app.router.add_get("/health", lambda r: web.json_response({"ok": bridge.client.is_connected()}))
    return app


async def connect():
    client = TelegramClient(StringSession(secret(SESSION)), int(secret(API_ID)), secret(API_HASH), receive_updates=False)
    await client.connect()
    if not await client.is_user_authorized():
        sys.exit("Telegram session is not logged in. Run ima-father login.")
    return client


async def serve(args):
    client = await connect()
    owner = args.owner or owner_login()
    runner = web.AppRunner(app_for(Bridge(client), owner, args.allow_local))
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", args.port).start()
    print(f"telegram bridge on 127.0.0.1:{args.port} for {owner}", flush=True)
    await client.disconnected


async def check():
    client = await connect()
    bots = [c for c in await Bridge(client).dialogs() if c["bot"]]
    print(json.dumps([{k: c[k] for k in ("name", "username", "unread")} for c in bots], indent=1))
    await client.disconnect()


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve")
    s.add_argument("--port", type=int, default=8466)
    s.add_argument("--owner")
    s.add_argument("--allow-local", action="store_true")
    sub.add_parser("check")
    args = parser.parse_args()
    asyncio.run(serve(args) if args.cmd == "serve" else check())


if __name__ == "__main__":
    main()
