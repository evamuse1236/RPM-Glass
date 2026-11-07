# Telegram bridge

The phone's voice agent sends Telegram messages to the owner's bots and reads the owner's chats through this small service. It runs on the PC that already holds the owner's Telegram session (pune), and the phone reaches it over Tailscale.

```
phone (voice tool) → TelegramBridge.java → https://<pc>.<tailnet>.ts.net:8466 (tailscale serve) → 127.0.0.1:8466 (bridge.py, Telethon) → Telegram
```

## Install (on the PC with the session)

```sh
tools/telegram-bridge/install.sh     # copies bridge.py + logic.py, enables the user service, runs tailscale serve
systemctl --user status rpm-telegram-bridge
curl -s -XPOST https://<pc>.<tailnet>.ts.net:8466/read -d '{"chat":"Pantry","limit":1}'
```

The session, API id and API hash come from the keyring (`telegram-user-session`, `telegram-api-id`, `telegram-api-hash`), the same ones `ima-father` uses. No new login is needed.

The app reads the URL at build time: `rpm.telegramBridge=https://<pc>.<tailnet>.ts.net:8466` in `local.properties` (git-ignored), or `RPM_TELEGRAM_BRIDGE`. With neither, the phone does not offer the Telegram tools.

## API

| Call | Body | Answer |
|---|---|---|
| `POST /send` | `{to, text, dry}` | `{draft:{to,username,text}}` when `dry`, else `{sent:{to,username,text,id}}` |
| `POST /read` | `{chat?, limit?, waitSeconds?}` | one chat's newest messages, or the unread chats (at most 6, 3 messages each) |
| `GET /health` | | `{ok}` |

Errors are `{error}` with words the voice agent can say (404 for an unknown or unclear name, 403 for a caller that is not the owner).

## Rules

| Rule | Enforced by |
|---|---|
| Only the owner's tailnet login may call (`Tailscale-User-Login`, set by `tailscale serve`); the bridge listens on 127.0.0.1 only. | `logic.allowed`, `test_logic.py` (`Access`) |
| Sends go only to bots, never to people, groups or BotFather. | `logic.send_targets`, `test_logic.py` |
| A name that fits no chat lists the choices; a name that fits several asks which. | `logic.pick`, `test_logic.py` |
| Reading never marks a chat read, and never reads the login-code chat (777000). Muted chats stay out of the unread list. | `bridge.py` uses `get_messages` only (no `send_read_acknowledge`); `logic.LOGIN_CODE_CHATS`; measured 2026-11-07: Ima's unread count stayed 5 after a read |

## Undo

```sh
systemctl --user disable --now rpm-telegram-bridge
rm ~/.config/systemd/user/rpm-telegram-bridge.service; rm -r ~/.local/share/rpm-telegram-bridge
sudo tailscale serve --https=8466 off
```
