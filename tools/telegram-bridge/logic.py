"""Pure rules for the Telegram bridge: who a spoken name means, and what a message looks like to the voice agent.

Standard library only, so `npm test` runs these tests with no Telegram packages installed.
"""
import difflib
import re
from datetime import datetime, timezone

LOGIN_CODE_CHATS = frozenset({777000, 42777})
BOTS_THAT_DELETE_BOTS = frozenset({"botfather"})
TEXT_MAX = 400
CHATS_MAX = 6
PER_CHAT_MAX = 3
LIMIT_MAX = 10
WAIT_MAX = 10

FILLER = re.compile(r"\b(the|my|bot|chat|telegram|on|to)\b")


def norm(value):
    text = re.sub(r"[^a-z0-9 ]+", " ", str(value or "").lower().replace("_", " "))
    return re.sub(r"\s+", " ", FILLER.sub(" ", text)).strip()


def words(value):
    return norm(value).split()


def names(chat):
    """Every way a person might say this chat: its title, its username, the username without 'bot'."""
    out = [chat.get("name") or ""]
    if chat.get("username"):
        out.append(chat["username"])
    return [n for n in (norm(x) for x in out) if n]


def score(said, chat):
    """How well a spoken name fits a chat: 3 exact, 2 every spoken word starts a name word, 1 sounds alike, 0 no."""
    spoken = norm(said)
    if not spoken:
        return 0
    best = 0
    for name in names(chat):
        if spoken == name or spoken.replace(" ", "") == name.replace(" ", ""):
            return 3
        parts = name.split()
        if all(any(p.startswith(w) for p in parts) for w in spoken.split()):
            best = max(best, 2)
        elif max([difflib.SequenceMatcher(None, spoken, p).ratio() for p in parts + [name]] or [0]) >= 0.75:
            best = max(best, 1)
    return best


class NoMatch(Exception):
    pass


def label(chat):
    return chat.get("name") or ("@" + chat["username"] if chat.get("username") else "a chat")


def pick(said, chats, kind="chat"):
    """The one chat a spoken name means. Raises NoMatch with words the model can say when none or several fit."""
    chats = [c for c in chats if c.get("id") not in LOGIN_CODE_CHATS]
    ranked = sorted(((score(said, c), c) for c in chats), key=lambda x: -x[0])
    top = ranked[0][0] if ranked else 0
    if top == 0:
        known = ", ".join(label(c) for c in chats[:8])
        raise NoMatch(f'No {kind} called "{said}".' + (f" Your {kind}s: {known}." if known else ""))
    best = [c for s, c in ranked if s == top]
    if len(best) > 1:
        raise NoMatch(f'"{said}" fits more than one {kind}: ' + ", ".join(label(c) for c in best[:5]) + ". Ask which one.")
    return best[0]


def clip(text, limit=TEXT_MAX):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def ago(when, now=None):
    if when is None:
        return None
    now = now or datetime.now(timezone.utc)
    minutes = int((now - when).total_seconds() // 60)
    if minutes < 1:
        return "just now"
    if minutes < 60:
        return f"{minutes} min ago"
    if minutes < 48 * 60:
        return f"{minutes // 60} h ago"
    return f"{minutes // (24 * 60)} days ago"


def message_view(message, now=None):
    """One message as the agent sees it: who, words (a media kind in brackets) and how long ago."""
    text = message.get("text") or ""
    media = message.get("media")
    if media:
        text = f"[{media}] {text}".strip()
    return {"from": "you" if message.get("out") else message.get("sender") or "them", "text": clip(text) or "[empty]", "ago": ago(message.get("date"), now)}


def bounded(value, default, low, high):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def allowed(login, remote, owner, allow_local=False):
    """Only the owner's tailnet login (set by tailscale serve) may call, or a local caller when the operator allows it."""
    if login is not None:
        return bool(owner) and login == owner
    return allow_local and remote in ("127.0.0.1", "::1")


def send_targets(chats):
    return [c for c in chats if c.get("bot") and str(c.get("username") or "").lower() not in BOTS_THAT_DELETE_BOTS]


def send_text(value):
    text = str(value or "").strip()
    if not text:
        raise NoMatch("The message is empty. Ask what to send.")
    if len(text) > 2000:
        raise NoMatch("That message is too long to send by voice.")
    return text
