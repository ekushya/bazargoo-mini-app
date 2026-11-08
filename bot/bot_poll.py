#!/usr/bin/env python3
"""BazarGoo order receiver - GitHub Actions single-shot poller.

Runs once per GitHub Actions invocation (every 5 minutes + manual):
polls Telegram getUpdates, handles web_app_data orders, /start and
other text, then persists the update offset to bot/offset.txt
(the workflow commits it back to the repo).

The bot token comes ONLY from the TELEGRAM_BOT_TOKEN environment
variable (a GitHub repository secret). It is never printed, logged
or written to any file.
"""
import json
import os
import sys
import urllib.error
import urllib.request

API = "https://api.telegram.org/bot{}/{}"
ADMIN_ID = 6113263787
SHOP_URL = "https://ekushya.github.io/bazargoo-mini-app/"
OFFSET_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offset.txt")


def call(method, payload, token):
    url = API.format(token, method)
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")
        print("HTTP {} on {}: {}".format(exc.code, method, body[:200]))
        return {"ok": False, "error_code": exc.code, "description": body[:200]}


def send(token, chat_id, text, reply_markup=None):
    payload = {"chat_id": chat_id, "text": text}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    res = call("sendMessage", payload, token)
    print("sendMessage to {}: ok={}".format(chat_id, res.get("ok")))
    return res


def shop_button():
    return {"inline_keyboard": [[{"text": "\U0001f6cd\ufe0f \u09a6\u09cb\u0995\u09be\u09a8 \u0996\u09c1\u09b2\u09c1\u09a8", "web_app": {"url": SHOP_URL}}]]}


def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        print("TELEGRAM_BOT_TOKEN is not set")
        return 2

    me = call("getMe", {}, token)
    if not me.get("ok"):
        print("getMe failed - the stored token was rejected by Telegram")
        return 2
    print("getMe ok: @{}".format(me["result"].get("username")))

    offset = 0
    try:
        offset = int(open(OFFSET_FILE).read().strip() or 0)
    except (FileNotFoundError, ValueError):
        offset = 0

    updates = call("getUpdates", {"offset": offset, "timeout": 10}, token)
    if not updates.get("ok"):
        print("getUpdates failed")
        return 2
    results = updates.get("result", [])
    print("{} update(s) at offset {}".format(len(results), offset))

    new_offset = offset
    for upd in results:
        new_offset = max(new_offset, upd["update_id"] + 1)
        msg = upd.get("message") or {}
        chat = msg.get("chat", {})
        chat_id = chat.get("id")
        if not chat_id:
            continue
        wad = msg.get("web_app_data")
        text = msg.get("text", "")

        if wad:
            try:
                order = json.loads(wad.get("data", "{}"))
            except json.JSONDecodeError:
                order = {}
            if order.get("type") == "bazargoo_order":
                items = order.get("items", [])
                lines = [
                    "\u2022 {} \u00d7 {} \u2014 \u09f3{}".format(
                        it.get("name"), it.get("qty"), it.get("subtotal")
                    )
                    for it in items
                ]
                buyer = order.get("user") or {}
                bname = buyer.get("first_name") or chat.get("first_name") or ""
                total = order.get("total")
                greet = " \u09a7\u09a8\u09cd\u09af\u09be\u09a6, {}!".format(bname) if bname else " \u09a7\u09a8\u09cd\u09af\u09be\u09a6!"
                confirm = (
                    "\u2705 \u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u09aa\u09c7\u09af\u09bc\u09c7\u099b\u09bf!{}"
                    "\n\n\u09ae\u09cb\u099f: \u09f3{}\n\u09b6\u09c0\u0998\u09cd\u09b0\u0987 \u0986\u09aa\u09a8\u09be\u09b0 \u09b8\u09be\u09a5\u09c7 \u09af\u09cb\u0997\u09be\u09af\u09cb\u0997 \u0995\u09b0\u09be \u09b9\u09ac\u09c7\u0964\n\u2014 Bazar Goo \U0001f6cd\ufe0f".format(greet, total)
                )
                send(token, chat_id, confirm)
                forward = (
                    "\U0001f6cd\ufe0f \u09a8\u09a4\u09c1\u09a8 \u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u2014 Bazar Goo\n"
                    "\u0995\u09cd\u09b0\u09c7\u09a4\u09be: {} (@{}, id {})\n".format(
                        bname, buyer.get("username") or "\u2014", buyer.get("id") or chat_id
                    )
                    + "\n".join(lines)
                    + "\n\u09ae\u09cb\u099f: \u09f3{} ({} \u0986\u0987\u099f\u09c7\u09ae)".format(
                        total, order.get("item_count")
                    )
                )
                send(token, ADMIN_ID, forward)
                print("order handled: total \u09f3{}".format(total))
                continue

        if text.startswith("/start"):
            send(
                token,
                chat_id,
                "\u0986\u09b8\u09b8\u09be\u09b2\u09be\u09ae\u09c1 \u0986\u09b2\u09be\u0987\u0995\u09c1\u09ae! Bazar Goo-\u09a4\u09c7 \u09b8\u09cd\u09ac\u09be\u0997\u09a4\u09ae \U0001f6cd\ufe0f\n\u09a8\u09bf\u099a\u09c7\u09b0 \u09ac\u09cb\u09a4\u09be\u09ae\u09c7 \u099f\u09cd\u09af\u09be\u09aa \u0995\u09b0\u09c7 \u09a6\u09cb\u0995\u09be\u09a8 \u0996\u09c1\u09b2\u09c1\u09a8, \u09aa\u09cd\u09b0\u09cb\u09a1\u09be\u0995\u09cd\u099f \u09a6\u09c7\u0996\u09c1\u09a8 \u0986\u09b0 \u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u0995\u09b0\u09c1\u09a8\u0964",
                shop_button(),
            )
        elif text:
            send(
                token,
                chat_id,
                "\u09a6\u09cb\u0995\u09be\u09a8 \u0996\u09c1\u09b2\u09a4\u09c7 \u09a8\u09bf\u099a\u09c7\u09b0 \u09ac\u09cb\u09a4\u09be\u09ae\u09c7 \u099f\u09cd\u09af\u09be\u09aa \u0995\u09b0\u09c1\u09a8 \U0001f6cd\ufe0f",
                shop_button(),
            )

    if new_offset != offset:
        with open(OFFSET_FILE, "w") as f:
            f.write(str(new_offset))
        print("offset saved: {}".format(new_offset))
    return 0


if __name__ == "__main__":
    sys.exit(main())
