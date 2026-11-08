#!/usr/bin/env python3
"""BazarGoo order receiver - GitHub Actions single-shot poller.

Runs once per GitHub Actions invocation (every 5 minutes + manual):
polls Telegram getUpdates, handles web_app_data orders, /start and
other text, then persists the update offset to bot/offset.txt
(the workflow commits it back to the repo).

The bot token comes ONLY from the TELEGRAM_BOT_TOKEN environment
variable (a GitHub repository secret). It is never printed, logged
or written to any file.

Checkout v2 order shape (from the Mini App):
{"type": "bazargoo_order", "items": [...], "subtotal": N,
 "delivery": {"name", "phone", "address", "shipping_zone": "inside"|"outside",
              "shipping_fee": 60|120, "payment": "cod"},
 "total": N, "item_count": N, "user": {...}, "ordered_at": ...}
Older orders without "delivery" still work (items total only).
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


def format_order_messages(order, buyer, chat):
    """Build (buyer confirmation, admin forward) for an order dict.

    New (checkout v2) shape carries delivery {name, phone, address,
    shipping_zone, shipping_fee, payment} plus subtotal; older orders
    without delivery still work (falls back to items total only).
    """
    items = order.get("items", [])
    item_lines = [
        u"\u2022 {} \u00d7 {} \u2014 \u09f3{}".format(
            it.get("name"), it.get("qty"), it.get("subtotal")
        )
        for it in items
    ]
    total = order.get("total")
    subtotal = order.get("subtotal", total)
    delivery = order.get("delivery") or {}
    name = delivery.get("name") or buyer.get("first_name") or chat.get("first_name") or ""
    greet = u" \u09a7\u09a8\u09cd\u09af\u09ac\u09be\u09a6, {}!".format(name) if name else u" \u09a7\u09a8\u09cd\u09af\u09ac\u09be\u09a6!"
    zone = delivery.get("shipping_zone")
    fee = delivery.get("shipping_fee")
    if zone and fee is not None:
        zone_bn = (
            u"\u09a2\u09be\u0995\u09be\u09b0 \u09ac\u09be\u0987\u09b0\u09c7"
            if zone == "outside"
            else u"\u09a2\u09be\u0995\u09be\u09b0 \u09ad\u09c7\u09a4\u09b0\u09c7"
        )
        totals = (
            u"\u09aa\u09a3\u09cd\u09af\u09c7\u09b0 \u09ae\u09cb\u099f: \u09f3{}\n"
            u"\u09a1\u09c7\u09b2\u09bf\u09ad\u09be\u09b0\u09bf ({}): \u09f3{}\n"
            u"\u09ae\u09cb\u099f: \u09f3{} (Cash on Delivery)"
        ).format(subtotal, zone_bn, fee, total)
        forward_totals = totals[:-1] + u", {} \u0986\u0987\u099f\u09c7\u09ae)".format(
            order.get("item_count")
        )
    else:
        totals = u"\u09ae\u09cb\u099f: \u09f3{}".format(total)
        forward_totals = totals + u" ({} \u0986\u0987\u099f\u09c7\u09ae)".format(
            order.get("item_count")
        )
    confirm = (
        u"\u2705 \u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u09aa\u09c7\u09af\u09bc\u09c7\u099b\u09bf!{}"
        u"\n\n{}\n\u09b6\u09c0\u0998\u09cd\u09b0\u0987 \u0986\u09aa\u09a8\u09be\u09b0 \u09b8\u09be\u09a5\u09c7 \u09af\u09cb\u0997\u09be\u09af\u09cb\u0997 \u0995\u09b0\u09be \u09b9\u09ac\u09c7\u0964"
        u"\n\u2014 Bazar Goo \U0001f6cd\ufe0f"
    ).format(greet, totals)
    header = (
        u"\U0001f6cd\ufe0f \u09a8\u09a4\u09c1\u09a8 \u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u2014 Bazar Goo\n"
        u"\u0995\u09cd\u09b0\u09c7\u09a4\u09be: {} (@{}, id {})\n".format(
            name, buyer.get("username") or u"\u2014", buyer.get("id") or chat.get("id")
        )
    )
    if delivery.get("phone"):
        header += u"\u09ae\u09cb\u09ac\u09be\u0987\u09b2: {}\n".format(delivery.get("phone"))
    if delivery.get("address"):
        header += u"\u09a0\u09bf\u0995\u09be\u09a8\u09be: {}\n".format(delivery.get("address"))
    forward = (
        header
        + "\n".join(item_lines)
        + "\n"
        + forward_totals
    )
    return confirm, forward


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
                buyer = order.get("user") or {}
                confirm, forward = format_order_messages(order, buyer, chat)
                send(token, chat_id, confirm)
                send(token, ADMIN_ID, forward)
                print("order handled: total \u09f3{}".format(order.get("total")))
                continue

        if "BazarGoo \u0985\u09b0\u09cd\u09a1\u09be\u09b0" in text and "\u09ae\u09cb\u099f: \u09f3" in text:
            # pasted order: copy fallback when sendData did not deliver
            bname = chat.get("first_name") or ""
            greet = " \u09a7\u09a8\u09cd\u09af\u09ac\u09be\u09a6, {}!".format(bname) if bname else " \u09a7\u09a8\u09cd\u09af\u09ac\u09be\u09a6!"
            send(
                token,
                chat_id,
                "\u2705 \u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u09aa\u09c7\u09af\u09bc\u09c7\u099b\u09bf!{}".format(greet)
                + "\n\n\u09b6\u09c0\u0998\u09cd\u09b0\u0987 \u0986\u09aa\u09a8\u09be\u09b0 \u09b8\u09be\u09a5\u09c7 \u09af\u09cb\u0997\u09be\u09af\u09cb\u0997 \u0995\u09b0\u09be \u09b9\u09ac\u09c7\u0964\n\u2014 Bazar Goo \U0001f6cd\ufe0f",
            )
            send(
                token,
                ADMIN_ID,
                "\U0001f6cd\ufe0f \u09a8\u09a4\u09c1\u09a8 \u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u2014 Bazar Goo (\u0995\u09aa\u09bf \u0995\u09b0\u09be)\n"
                + "\u0995\u09cd\u09b0\u09c7\u09a4\u09be: {} (@{}, id {})\n".format(
                    bname, chat.get("username") or "\u2014", chat_id
                )
                + text,
            )
            print("pasted order forwarded")
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
