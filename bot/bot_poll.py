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
 "delivery": {"name", "phone", "address", "district",
              "shipping_zone": "inside"|"outside",
              "shipping_fee": 60|120, "payment": "cod"},
 "total": N, "item_count": N, "user": {...}, "ordered_at": ...}
First-order coupon orders also carry "coupon": "BAZAR5" and
"discount": N (5% of the subtotal, rounded); "total" already has
the discount subtracted. Older orders without "delivery" or
without "coupon" still work (items total only / no discount line).

Reviews (8 Nov 2026): web_app_data {"type": "bazargoo_review", ...}
or a pasted "⭐ BazarGoo রিভিউ" summary. The buyer gets a Bengali
confirmation and the review is forwarded to the admin with inline
Approve/Reject buttons; the full review is stored in
bot/pending_reviews.json so an approve callback can publish it to
reviews.json (repo root), which the Mini App fetches on load.
Only the admin (ADMIN_ID) may approve/reject; callbacks from anyone
else are ignored. The workflow commits bot/offset.txt,
bot/pending_reviews.json and reviews.json back to the repo.
"""
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.request

API = "https://api.telegram.org/bot{}/{}"
ADMIN_ID = 6113263787
SHOP_URL = "https://ekushya.github.io/bazargoo-mini-app/"
OFFSET_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offset.txt")
REVIEW_MARKER = "BazarGoo রিভিউ"
PENDING_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pending_reviews.json")
REVIEWS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "reviews.json"
)


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


# ---------- reviews ----------

def load_json_file(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError, OSError):
        return default


def save_json_file(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def parse_pasted_review(text):
    """Parse a pasted review summary (copy fallback) into a review dict.

    Returns None when the text is not a review summary.
    """
    if REVIEW_MARKER not in text:
        return None

    def field(label):
        m = re.search(r"(?m)^" + re.escape(label) + r":\s*(.*)$", text)
        return m.group(1).strip() if m else ""

    review_id = field("রিভিউ নং")
    if not review_id:
        return None
    rating_line = field("রেটিং")
    stars = rating_line.count("★")
    if stars < 1 or stars > 5:
        m = re.search(r"\((\d)/", rating_line)
        stars = int(m.group(1)) if m else 0
    body = field("মন্তব্য")
    if body == "—":
        body = ""
    return {
        "type": "bazargoo_review",
        "review_id": review_id,
        "product_id": field("পণ্য ID"),
        "product_name": field("পণ্য"),
        "stars": stars,
        "text": body,
        "user": None,
        "submitted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def format_review_messages(review, buyer, chat):
    """Build (buyer confirmation, admin forward) for a review dict."""
    name = buyer.get("first_name") or chat.get("first_name") or ""
    stars = review.get("stars") or 0
    stars_txt = "★" * stars + "☆" * (5 - stars)
    confirm = (
        u"ধন্যবাদ{}! আপনার রিভিউ পেয়েছি, যাচাই করে প্রকাশ করা হবে।\n"
        u"— Bazar Goo \U0001f6cd\ufe0f"
    ).format(", " + name if name else "")
    forward = (
        u"⭐ নতুন রিভিউ — Bazar Goo\n"
        u"পণ্য: {} ({})\n"
        u"ক্রেতা: {} (@{}, id {})\n"
        u"রেটিং: {} ({}/৫)\n"
        u"রিভিউ নং: {}\n"
        u"মন্তব্য: {}"
    ).format(
        review.get("product_name") or "—",
        review.get("product_id") or "—",
        name or "—",
        buyer.get("username") or "—",
        buyer.get("id") or chat.get("id"),
        stars_txt,
        stars,
        review.get("review_id") or "—",
        review.get("text") or "—",
    )
    return confirm, forward


def review_keyboard(review_id):
    return {"inline_keyboard": [[
        {"text": "✅ অনুমোদন করুন", "callback_data": "review:approve:" + review_id},
        {"text": "❌ বাতিল", "callback_data": "review:reject:" + review_id},
    ]]}


def handle_review(review, buyer, chat, token):
    """Confirm a review to the buyer, forward it to the admin with
    Approve/Reject buttons, and store it in the pending file so an
    approve callback can publish the full data to reviews.json."""
    review_id = review.get("review_id")
    if not review_id:
        return False
    buyer = buyer or {}
    if not buyer.get("first_name"):
        buyer = {
            "id": chat.get("id"),
            "username": chat.get("username"),
            "first_name": chat.get("first_name"),
        }
    confirm, forward = format_review_messages(review, buyer, chat)
    send(token, chat.get("id"), confirm)
    send(token, ADMIN_ID, forward, review_keyboard(review_id))
    pending = load_json_file(PENDING_FILE, {})
    pending[review_id] = {
        "review_id": review_id,
        "product_id": review.get("product_id") or "",
        "product_name": review.get("product_name") or "",
        "stars": review.get("stars") or 0,
        "text": review.get("text") or "",
        "buyer_name": buyer.get("first_name") or chat.get("first_name") or "",
        "submitted_at": review.get("submitted_at") or "",
    }
    save_json_file(PENDING_FILE, pending)
    print("review forwarded: {}".format(review_id))
    return True


def handle_callback(cq, token):
    """Approve/reject a review from the admin's inline buttons.

    Only the admin (ADMIN_ID) may approve or reject; callbacks from
    anyone else are ignored silently. Returns True when the callback
    was a review action (handled or ignored), False otherwise.
    """
    data = cq.get("data") or ""
    if not (data.startswith("review:approve:") or data.startswith("review:reject:")):
        return False
    sender = (cq.get("from") or {}).get("id")
    if sender != ADMIN_ID:
        print("callback ignored: non-admin {}".format(sender))
        return True
    parts = data.split(":")
    action = parts[1]
    review_id = parts[2]
    pending = load_json_file(PENDING_FILE, {})
    review = pending.get(review_id)
    msg = cq.get("message") or {}
    chat_id = msg.get("chat", {}).get("id", ADMIN_ID)
    message_id = msg.get("message_id")
    orig_text = msg.get("text") or ""
    if action == "approve":
        if review:
            store = load_json_file(REVIEWS_FILE, {"reviews": []})
            reviews = store.get("reviews") or []
            if not any(r.get("review_id") == review_id for r in reviews):
                reviews.append({
                    "review_id": review["review_id"],
                    "product_id": review["product_id"],
                    "product_name": review["product_name"],
                    "stars": review["stars"],
                    "text": review["text"],
                    "buyer_name": review.get("buyer_name") or "",
                    "submitted_at": review.get("submitted_at") or "",
                    "approved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                })
                store["reviews"] = reviews
                save_json_file(REVIEWS_FILE, store)
            del pending[review_id]
            save_json_file(PENDING_FILE, pending)
            verdict = "✅ প্রকাশ করা হয়েছে"
        else:
            verdict = "⚠️ রিভিউটি পাওয়া যায়নি (হয়তো আগেই প্রসেস করা হয়েছে)"
    else:  # reject
        if review_id in pending:
            del pending[review_id]
            save_json_file(PENDING_FILE, pending)
        verdict = "❌ বাতিল করা হয়েছে"
    call("answerCallbackQuery", {"callback_query_id": cq.get("id"), "text": verdict}, token)
    if message_id:
        call("editMessageText", {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": orig_text + "\n\n" + verdict,
            "reply_markup": {"inline_keyboard": []},
        }, token)
    print("review {}: {}".format(action, review_id))
    return True


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
    discount = order.get("discount") or 0
    coupon = order.get("coupon")
    if zone and fee is not None:
        zone_bn = (
            u"\u09a2\u09be\u0995\u09be\u09b0 \u09ac\u09be\u0987\u09b0\u09c7"
            if zone == "outside"
            else u"\u09a2\u09be\u0995\u09be\u09b0 \u09ad\u09c7\u09a4\u09b0\u09c7"
        )
        if coupon and discount:
            totals = (
                u"\u09aa\u09a3\u09cd\u09af\u09c7\u09b0 \u09ae\u09cb\u099f: \u09f3{}\n"
                u"\u099b\u09be\u09a1\u09bc (BAZAR5 \u2014 \u09eb%): \u2212\u09f3{}\n"
                u"\u09a1\u09c7\u09b2\u09bf\u09ad\u09be\u09b0\u09bf ({}): \u09f3{}\n"
                u"\u09ae\u09cb\u099f: \u09f3{} (Cash on Delivery)"
            ).format(subtotal, discount, zone_bn, fee, total)
        else:
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
    if order.get("order_id"):
        header += u"\u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u09a8\u0982: {}\n".format(order.get("order_id"))
    if delivery.get("phone"):
        header += u"\u09ae\u09cb\u09ac\u09be\u0987\u09b2: {}\n".format(delivery.get("phone"))
    if delivery.get("address"):
        header += u"\u09a0\u09bf\u0995\u09be\u09a8\u09be: {}\n".format(delivery.get("address"))
    if delivery.get("district"):
        header += u"\u099c\u09c7\u09b2\u09be: {}\n".format(delivery.get("district"))
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
        cq = upd.get("callback_query")
        if cq:
            handle_callback(cq, token)
            continue
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
            if order.get("type") == "bazargoo_review":
                handle_review(order, order.get("user") or {}, chat, token)
                continue

        if REVIEW_MARKER in text:
            # pasted review: copy fallback when sendData did not deliver
            review = parse_pasted_review(text)
            if review:
                handle_review(review, {}, chat, token)
                print("pasted review forwarded")
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
