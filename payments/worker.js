/* BazarGoo Telegram bot — Cloudflare Worker (Phase 1: Stars + ZERO payments)
 *
 * This worker becomes the bot's single update receiver via a Telegram
 * webhook. It MUST be the receiver because Stars payments have a hard
 * rule: pre_checkout_query must be answered within 10 SECONDS, or the
 * payment is cancelled. The old GitHub Actions poller (every 5 min)
 * cannot meet that — see payments/DESIGN.md.
 *
 * Once a webhook is set, getUpdates returns nothing, so this worker
 * reimplements ALL of the old poller (bot/bot_poll.py) handlers:
 * /start welcome, buy_/zero_ deep links, web_app_data orders, pasted
 * orders, reviews with admin approve/reject — PLUS the new payment
 * handlers (Stars invoice + pre_checkout + successful_payment delivery,
 * ZERO txid verification).
 *
 * Plain JS, no build step. Deploy with wrangler (see payments/SETUP.md).
 * All secrets come from env only — nothing is hardcoded:
 *   TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET,
 *   ZERO_SHOP_ADDRESS (public ZERO address only, never a private key),
 *   ZERO_PAYOUT_ADDRESS (public ZERO payout wallet, provided 2026-11-09:
 *     t1atEkz24YDS4LDa5GeSQsnMxc7eF7CupWZ — Angela's separate payout
 *     wallet, never the shop wallet, never a private key).
 *   ZERO_PAYOUT_PRIVATE_KEY (WIF for the payout wallet, secret — set
 *     2026-11-09, verified: the address it derives matches
 *     ZERO_PAYOUT_ADDRESS exactly. Read ONLY here, never logged,
 *     never stored in KV, never in any error message. If unset, all
 *     auto-send fails CLOSED and payouts stay pending_send.)
 *   WITHDRAW_CHANNEL (optional override; default is the withdraw
 *     channel id -1003963165611, @bazargoowithdraw — the bot posts a
 *     proof there for every completed payout, never the destination
 *     address).
 * ZEROCHAIN_API_KEY is optional: the zerochain.info explorer API answers
 * without one (verified 2026-11-08 against a real tx); if set, it is
 * appended to the request path as before.
 *
 * State lives in Cloudflare KV (env.KV). Pure logic is exported so the
 * stubbed tests in payments/test/ can run it under node with no network
 * and no real credentials.
 */

export const BOT_USERNAME = 'BazarGooBot';
export const SHOP_URL = 'https://ekushya.github.io/bazargoo-mini-app/';
export const ADMIN_ID = 6113263787;
export const ZEROCHAIN_API = 'https://zerochain.info/api';
export const ZERO_INTENT_TTL_SECONDS = 1800; // 30 minutes
export const REVIEW_MARKER = 'BazarGoo রিভিউ';

// BEGIN I18N GENERATED (payments/i18n/gen-inline.mjs — do not hand-edit; edit en.json/bn.json and re-run)
// i18n maps inlined on purpose: cf_upload.py uploads worker.js as a single
// file, so the worker cannot import the JSON. Fallback: requested language
// -> Bengali -> the key itself (never blank, never a crash).
const I18N = {
  en: {
  "admin.not_admin_callback": "Only the admin can do this.",
  "claim.leaderboard_prize_note": (v) => { const { rank, week } = v || {}; return `Leaderboard prize — week ${week} #${rank}`; },
  "claim.monthly_bonus_title": "Monthly check-in bonus",
  "claim.referral_bonus_note": (v) => { const { earnerName, level } = v || {}; return `Referral bonus Level ${level + 1} — ${earnerName || 'friend'}`; },
  "common.shop_button": "🛍️ Open Shop",
  "contest.fallback_name": "Friend",
  "coupon.use_note": "Cannot be used together with the BAZAR5 coupon — only one coupon per order.",
  "deposit.gram_history_note": (v) => { const { slice, txid } = v || {}; return `GRAM deposit — ${txid.slice(0, 12)}…`; },
  "deposit.history_note": "Stars deposit",
  "deposit.invoice_description": (v) => { const { stars } = v || {}; return `${stars} Stars will be added to your BazarGoo Wallet — you can use them later to buy PDFs with your Wallet.`; },
  "deposit.invoice_title": "Add Stars to Wallet",
  "deposit.minimum_try_again": (v) => { return `You must deposit at least ${DEPOSIT_MIN_STARS} Stars. Please try again from the app.`; },
  "deposit.success": (v) => { const { stars } = v || {}; return `✅ ${stars} Stars added to your Wallet! You can now buy PDFs with your Wallet.`; },
  "deposit.zero_history_note": (v) => { const { slice, txid } = v || {}; return `ZERO deposit — ${txid.slice(0, 12)}…`; },
  "deposit.zero_note": "Confirm by sending the txid",
  "history.commission_note": (v) => { const { earnerName, level } = v || {}; return `Commission Level ${level + 1} — ${earnerName}`; },
  "history.coupon_redeem_note": (v) => { const { code } = v || {}; return `${code} — 5% off coupon`; },
  "leaderboard.fallback_name": "Friend",
  "monetag.task_title": "📺 Watch an ad (Monetag)",
  "order.confirm.closing": "We will contact you soon.\n— Bazar Goo 🛍️",
  "order.confirm.header": (v) => { const { greet } = v || {}; return `✅ Order received!${greet}`; },
  "order.greet.anon": " Thank you!",
  "order.greet.named": (v) => { const { name } = v || {}; return ` Thank you, ${name}!`; },
  "order.totals.coupon": (v) => { const { discount, fee, subtotal, total, zoneBn } = v || {}; return `Items total: ৳${subtotal}
Discount (BAZAR5 — 5%): −৳${discount}
Delivery (${zoneBn}): ৳${fee}
Total: ৳${total} (Cash on Delivery)`; },
  "order.totals.no_coupon": (v) => { const { fee, subtotal, total, zoneBn } = v || {}; return `Items total: ৳${subtotal}
Delivery (${zoneBn}): ৳${fee}
Total: ৳${total} (Cash on Delivery)`; },
  "order.totals.simple": (v) => { const { total } = v || {}; return `Total: ৳${total}`; },
  "order.zone.inside": "Inside Dhaka",
  "order.zone.outside": "Outside Dhaka",
  "payout.rejected": (v) => { const { id, payout } = v || {}; return `😔 Your withdrawal request was not approved (${payout.id}) — the amount has been refunded to your balance.`; },
  "payout.sent": (v) => { const { amount, currency, id, payout, toUpperCase, txid } = v || {}; return `💸 Your ${fmtZero(payout.amount)} ${payout.currency.toUpperCase()} has been sent (${payout.id})${payout.txid ? ' — txid: ' + payout.txid : ''}.`; },
  "payout.sent_txid": (v) => { const { amount, currency, id, payout, toUpperCase, txid } = v || {}; return `💸 Your ${fmtZero(payout.amount)} ${payout.currency.toUpperCase()} has been sent (${payout.id}) — txid: ${payout.txid}.`; },
  "pdf.buy_invoice_description": "BazarGoo PDF — the bot will send the PDF itself after payment.",
  "pdf.deliver_caption_bn": (v) => { const { title } = v || {}; return `📚 ${title} (Bangla)
Thank you! You've received your PDF.
— Bazar Goo 🛍️`; },
  "pdf.deliver_waiting_file": (v) => { const { title } = v || {}; return `✅ Payment received, thank you!
The PDF file for "${title}" isn't ready yet — the shop will send it soon.
— Bazar Goo 🛍️`; },
  "pdf.free_download_in_app": (v) => { const { title } = v || {}; return `📚 "${title}" is free — download it from the app.`; },
  "pdf.not_found_try_again": "This PDF was not found. Please try again from the app.",
  "pdf.not_purchased": (v) => { const { title } = v || {}; return `📚 "${title}" hasn't been bought yet — buy it from the app and you can download it again here.`; },
  "pdf.redownload_caption_bn": (v) => { const { title } = v || {}; return `📚 ${title} (Bangla)
Here is your purchased PDF again.
— Bazar Goo 🛍️`; },
  "pdf.redownload_no_file": (v) => { const { title } = v || {}; return `📚 The file for "${title}" isn't available right now — let the shop know and it will be sent soon.`; },
  "pdf.reward_only": (v) => { const { title } = v || {}; return `📚 "${title}" can't be bought — it's a reward for top performers. Check in the app under 📚 My PDFs whether you qualify.`; },
  "pdf.stars_not_priced": (v) => { const { title } = v || {}; return `📚 The Stars price for "${title}" hasn't been set yet. It will be announced soon.`; },
  "pdf.title.ai-chatgpt-guide": "ChatGPT Tutorial",
  "pdf.title.ai-claude-guide": "Claude Tutorial",
  "pdf.title.ai-copilot-guide": "Microsoft Copilot Tutorial",
  "pdf.title.ai-deepseek-guide": "DeepSeek Tutorial",
  "pdf.title.ai-earning-guide": "Guide to Earning with AI",
  "pdf.title.ai-flowmusic-guide": "FlowMusic Tutorial — Making Songs with AI",
  "pdf.title.ai-freelancing-start": "Start Freelancing with AI",
  "pdf.title.ai-gemini-guide": "Gemini Tutorial",
  "pdf.title.ai-google-flow-guide": "Google Flow Tutorial — Making Videos with AI",
  "pdf.title.ai-grok-guide": "Grok Tutorial",
  "pdf.title.ai-midjourney-guide": "Midjourney Tutorial — Making Images with AI",
  "pdf.title.ai-muse-guide": "Muse.ai Tutorial",
  "pdf.title.ai-perplexity-guide": "Perplexity Tutorial",
  "pdf.title.ai-product-photos": "Making Product Photos with AI",
  "pdf.title.ai-prompt-library": "Prompt Library — 100 Ready-Made Prompts",
  "pdf.title.ai-video-workflow": "AI Video Workflow",
  "pdf.title.cv-cover-letter-guide": "CV and Cover Letter Guide (with Templates)",
  "pdf.title.daily-english-conversation": "Everyday English Conversation",
  "pdf.title.diabetes-food-list": "Diabetes-Friendly Food List",
  "pdf.title.digital-marketing-checklist": "Digital Marketing Checklist for Small Shops",
  "pdf.title.excel-sheets-practical": "Excel / Google Sheets in Real Work",
  "pdf.title.facebook-page-selling": "Selling from a Facebook Page",
  "pdf.title.healthy-meal-plan": "Healthy Meal Planning at Home (with Weekly Chart)",
  "pdf.title.ielts-foundation": "IELTS Preparation Basics",
  "pdf.title.interview-prep": "Interview Preparation",
  "pdf.title.kids-study-ai": "Using AI the Right Way in Your Child's Studies",
  "pdf.title.rel-falaq-nas": "Surah Al-Falaq and An-Nas — With Bengali Translation",
  "pdf.title.rel-fatiha": "Surah Al-Fatiha — With Bengali Translation",
  "pdf.title.rel-ikhlas": "Surah Al-Ikhlas — With Bengali Translation",
  "pdf.title.rel-istighfar": "Sayyidul Istighfar — Dua and Its Virtues",
  "pdf.title.safe-shopping-guide": "10 Ways to Avoid Scams When Shopping Online",
  "pdf.title.shopping-guide": "BazarGoo Shopping Guide",
  "pdf.title.store-guide": "About the BazarGoo Shop",
  "pdf.title.telegram-miniapp-business": "Business with Telegram Mini Apps — From the Start",
  "precheckout.deposit_minimum": (v) => { return `You must deposit at least ${DEPOSIT_MIN_STARS} Stars.`; },
  "precheckout.order_unknown": "This order wasn't recognised.",
  "precheckout.pay_with_stars": "You must pay with Stars (XTR).",
  "precheckout.pdf_free": "This PDF is free — no payment needed.",
  "precheckout.pdf_not_found": "This PDF was not found.",
  "precheckout.price_mismatch": "The price doesn't match — please try again.",
  "profile.default_name": "User",
  "promo.approved": (v) => { const { promo, title } = v || {}; return `🎉 Your Promote has been approved! "${promo.title}" is now live as a sponsored task.`; },
  "promo.rejected": (v) => { const { promo, title } = v || {}; return `😔 Your Promote was not approved: "${promo.title}" — please contact the admin about a payment refund.`; },
  "promote.gram_pay_note": "Promote payment — confirm by sending the txid",
  "promote.zero_pay_note": "Promote payment — confirm by sending the txid",
  "quiz.q1": "How much is the delivery charge inside Dhaka?",
  "quiz.q1_option_1": "৳60",
  "quiz.q1_option_2": "৳120",
  "quiz.q1_option_3": "৳200",
  "quiz.q2": "What is the payment method at BazarGoo?",
  "quiz.q2_option_2": "Only bKash",
  "quiz.q2_option_3": "Only card",
  "quiz.question_first_order_coupon": "What is the first-order coupon code?",
  "ref.welcome": "Assalamu Alaikum! Welcome to Bazar Goo 🛍️\nYou came through a friend's link — once you open the app and check in daily, your friend will get 10 ZERO, and you can also earn ZERO by completing tasks.",
  "referrals.fallback_name": "Friend",
  "review.confirm": (v) => { const { name } = v || {}; return `Thank you${name ? ', ' + name : ''}! We've received your review; it will be published after verification.
— Bazar Goo 🛍️`; },
  "sponsor.desc": (v) => { const { promo, remaining } = v || {}; return `Sponsored task — complete the task for verification • ${promo.remaining} left`; },
  "start.fallback": "Tap the button below to open the shop 🛍️",
  "start.txid_not_admin": "Only the admin can use this command.",
  "start.welcome": "Assalamu Alaikum! Welcome to Bazar Goo 🛍️\nTap the button below to open the shop, browse products and place an order.",
  "tasks.ad_desc": "Up to 5 times a day — watch a Zerads ad",
  "tasks.ad_monetag_desc": "Up to 5 times a day — watch a Monetag ad (30-second break each time)",
  "tasks.ad_monetag_title": "📺 Watch an ad (Monetag)",
  "tasks.ad_title": "Watch an ad",
  "tasks.checkin_desc": "Once a day — open the app and check in",
  "tasks.checkin_title": "Daily Check-in",
  "tasks.join_adsterratt_title": "Join the @adsterratt channel",
  "tasks.join_bazargoo_title": "Join the @bazargoo287 channel",
  "tasks.join_cryptoguru_title": "Join the @cryptoguru_247 channel",
  "tasks.join_desc": "One time — join the channel and verify",
  "tasks.join_earnplaygame_title": "Join the @earnplaygame21 channel",
  "tasks.quiz_desc": "Once a day — answer all 3 questions correctly",
  "tasks.quiz_title": "Daily Quiz",
  "tasks.react_daily_desc": "Once a day — react ❤️ to the pinned post, then claim",
  "tasks.react_daily_title": "❤️ React to the pinned post",
  "tasks.react_withdraw_desc": "Once a day — react ❤️ to the pinned post in the withdraw channel, then claim (a withdraw requirement, not a reward)",
  "tasks.react_withdraw_title": "💸 Before withdrawing — react ❤️ on @bazargoowithdraw",
  "tasks.referral_desc": "Level 1: 10 ZERO · Level 2: 5 ZERO · Level 3: 2 ZERO — bonus on first check-in + 3%/2%/1% commission on task earnings",
  "tasks.referral_title": "Invite a friend",
  "tasks.spin_daily_desc": "Completely free — 4 times a day (2 Monetag + 2 AdsGram). Requirement: today's check-in + joined all 4 channels. Watch 1 ad to claim each prize. Prizes 1–25 ZERO + free spins.",
  "tasks.video_daily_desc": "Once every 24 hours — watch the bot's tutorial video all the way through",
  "tasks.video_daily_title": "🎬 Watch a video",
  "tasks.visit_desc": "Once every 24 hours — visit the Page/channel (the latest post will be at the top)",
  "withdraw.gram_history_note": (v) => { const { id } = v || {}; return `GRAM withdrawal — ${id}`; },
  "withdraw.save_history_note": "Saved to wallet",
  "withdraw.zero_history_note": (v) => { const { id } = v || {}; return `ZERO withdrawal — ${id}`; },
  "zero.instructions": (v) => { const { price_zero, shopAddress, title } = v || {}; return `⛓️ Buy with ZERO — "${title}"

1. Send to this address: \`${shopAddress}\`
2. Amount: ${price_zero} ZERO
3. After paying, send the transaction id (txid) here.

The bot will send the PDF once it's verified. (Send the txid within 30 minutes.)`; },
  "zero.no_intent": "First tap \"⛓️ Buy with ZERO\" in the app — the bot will give you the address and price, then send the txid.",
  "zero.not_configured": "⛓️ Paying with ZERO isn't live yet. You can buy with Stars instead.",
  "zero.not_priced": (v) => { const { title } = v || {}; return `📚 The ZERO price for "${title}" hasn't been set yet. It will be announced soon.`; },
  "zero.txid_duplicate": "This txid was already used to deliver a PDF. If this is a new payment, send its txid again.",
  "zero.txid_insufficient": (v) => { const { paid, price_zero } = v || {}; return `Not enough ZERO was found at the shop address in this txid (${paid} ZERO). Send the correct amount (${price_zero} ZERO) and try again.`; },
  "zero.txid_not_found": "This txid couldn't be found. Check that you sent the correct txid and send it again.",
  "zero.txid_not_priced": "The ZERO price for this PDF hasn't been set yet.",
  "zero.txid_unconfirmed": "The payment hasn't been confirmed yet. Send the txid again in a little while.",
  "zero.txid_verify_failed": "The txid couldn't be verified. Try again in a little while, or let the shop know.",
},
  bn: {
  "admin.not_admin_callback": "শুধু অ্যাডমিন করতে পারেন।",
  "claim.leaderboard_prize_note": (v) => { const { rank, week } = v || {}; return `লিডারবোর্ড পুরস্কার — ${week} সপ্তাহে #${rank}`; },
  "claim.monthly_bonus_title": "মাসিক চেক-ইন বোনাস",
  "claim.referral_bonus_note": (v) => { const { earnerName, level } = v || {}; return `রেফারেল বোনাস লেভেল ${level + 1} — ${earnerName || 'বন্ধু'}`; },
  "common.shop_button": "🛍️ দোকান খুলুন",
  "contest.fallback_name": "বন্ধু",
  "coupon.use_note": "BAZAR5 কুপনের সাথে একসাথে ব্যবহার করা যাবে না — এক অর্ডারে একটি কুপনই চলবে।",
  "deposit.gram_history_note": (v) => { const { slice, txid } = v || {}; return `GRAM জমা — ${txid.slice(0, 12)}…`; },
  "deposit.history_note": "Stars জমা",
  "deposit.invoice_description": (v) => { const { stars } = v || {}; return `${stars} Stars আপনার BazarGoo Wallet-এ জমা হবে — পরে Wallet দিয়ে PDF কিনতে পারবেন।`; },
  "deposit.invoice_title": "Wallet-এ Stars জমা",
  "deposit.minimum_try_again": (v) => { return `সর্বনিম্ন ${DEPOSIT_MIN_STARS} Stars জমা দিতে হবে। অ্যাপ থেকে আবার চেষ্টা করুন।`; },
  "deposit.success": (v) => { const { stars } = v || {}; return `✅ ${stars} Stars Wallet-এ জমা হয়েছে! এখন Wallet দিয়ে PDF কিনতে পারবেন।`; },
  "deposit.zero_history_note": (v) => { const { slice, txid } = v || {}; return `ZERO জমা — ${txid.slice(0, 12)}…`; },
  "deposit.zero_note": "txid পাঠিয়ে কনফার্ম করুন",
  "history.commission_note": (v) => { const { earnerName, level } = v || {}; return `কমিশন লেভেল ${level + 1} — ${earnerName}`; },
  "history.coupon_redeem_note": (v) => { const { code } = v || {}; return `${code} — ৫% ছাড়ের কুপন`; },
  "leaderboard.fallback_name": "বন্ধু",
  "monetag.task_title": "📺 অ্যাড দেখুন (Monetag)",
  "order.confirm.closing": "শীঘ্রই আপনার সাথে যোগাযোগ করা হবে।\n— Bazar Goo 🛍️",
  "order.confirm.header": (v) => { const { greet } = v || {}; return `✅ অর্ডার পেয়েছি!${greet}`; },
  "order.greet.anon": " ধন্যবাদ!",
  "order.greet.named": (v) => { const { name } = v || {}; return ` ধন্যবাদ, ${name}!`; },
  "order.totals.coupon": (v) => { const { discount, fee, subtotal, total, zoneBn } = v || {}; return `পণ্যের মোট: ৳${subtotal}
ছাড় (BAZAR5 — ৫%): −৳${discount}
ডেলিভারি (${zoneBn}): ৳${fee}
মোট: ৳${total} (Cash on Delivery)`; },
  "order.totals.no_coupon": (v) => { const { fee, subtotal, total, zoneBn } = v || {}; return `পণ্যের মোট: ৳${subtotal}
ডেলিভারি (${zoneBn}): ৳${fee}
মোট: ৳${total} (Cash on Delivery)`; },
  "order.totals.simple": (v) => { const { total } = v || {}; return `মোট: ৳${total}`; },
  "order.zone.inside": "ঢাকার ভেতরে",
  "order.zone.outside": "ঢাকার বাইরে",
  "payout.rejected": (v) => { const { id, payout } = v || {}; return `😔 আপনার তোলার অনুরোধটি অনুমোদন হয়নি (${payout.id}) — পরিমাণ আপনার ব্যালেন্সে ফেরত দেওয়া হয়েছে।`; },
  "payout.sent": (v) => { const { amount, currency, id, payout, toUpperCase, txid } = v || {}; return `💸 আপনার ${fmtZero(payout.amount)} ${payout.currency.toUpperCase()} পাঠানো হয়েছে (${payout.id})${payout.txid ? ' — txid: ' + payout.txid : ''}।`; },
  "payout.sent_txid": (v) => { const { amount, currency, id, payout, toUpperCase, txid } = v || {}; return `💸 আপনার ${fmtZero(payout.amount)} ${payout.currency.toUpperCase()} পাঠানো হয়েছে (${payout.id}) — txid: ${payout.txid}।`; },
  "pdf.buy_invoice_description": "BazarGoo PDF — পেমেন্টের পর বট নিজেই PDF পাঠিয়ে দেবে।",
  "pdf.deliver_caption_bn": (v) => { const { title } = v || {}; return `📚 ${title} (বাংলা)
ধন্যবাদ! আপনার PDF পেয়ে গেছেন।
— Bazar Goo 🛍️`; },
  "pdf.deliver_waiting_file": (v) => { const { title } = v || {}; return `✅ পেমেন্ট পেয়েছি, ধন্যবাদ!
"${title}"-এর PDF ফাইলটি এখনো তৈরি হয়নি — দোকান থেকে শীঘ্রই পাঠানো হবে।
— Bazar Goo 🛍️`; },
  "pdf.free_download_in_app": (v) => { const { title } = v || {}; return `📚 "${title}" ফ্রি — অ্যাপ থেকেই ডাউনলোড করুন।`; },
  "pdf.not_found_try_again": "এই PDF-টি পাওয়া যায়নি। অ্যাপ থেকে আবার চেষ্টা করুন।",
  "pdf.not_purchased": (v) => { const { title } = v || {}; return `📚 "${title}" এখনো কেনা হয়নি — অ্যাপ থেকে কিনে নিলে এখান থেকে আবার ডাউনলোড করতে পারবেন।`; },
  "pdf.redownload_caption_bn": (v) => { const { title } = v || {}; return `📚 ${title} (বাংলা)
আপনার কেনা PDF আবার পাঠানো হলো।
— Bazar Goo 🛍️`; },
  "pdf.redownload_no_file": (v) => { const { title } = v || {}; return `📚 "${title}"-এর ফাইলটি এখন পাওয়া যাচ্ছে না — দোকানে জানান, শীঘ্রই পাঠানো হবে।`; },
  "pdf.reward_only": (v) => { const { title } = v || {}; return `📚 "${title}" কেনা যায় না — এটি টপ পারফর্মারদের পুরস্কার। অ্যাপের 📚 আমার PDF থেকে দেখুন আপনি যোগ্য কি না।`; },
  "pdf.stars_not_priced": (v) => { const { title } = v || {}; return `📚 "${title}"-এর Stars দাম এখনো ঠিক হয়নি। শীঘ্রই জানানো হবে।`; },
  "pdf.title.ai-chatgpt-guide": "ChatGPT টিউটোরিয়াল",
  "pdf.title.ai-claude-guide": "Claude টিউটোরিয়াল",
  "pdf.title.ai-copilot-guide": "Microsoft Copilot টিউটোরিয়াল",
  "pdf.title.ai-deepseek-guide": "DeepSeek টিউটোরিয়াল",
  "pdf.title.ai-earning-guide": "AI দিয়ে আয় গাইডলাইন",
  "pdf.title.ai-flowmusic-guide": "FlowMusic টিউটোরিয়াল — AI দিয়ে গান বানানো",
  "pdf.title.ai-freelancing-start": "AI দিয়ে ফ্রিল্যান্সিং শুরু",
  "pdf.title.ai-gemini-guide": "Gemini টিউটোরিয়াল",
  "pdf.title.ai-google-flow-guide": "Google Flow টিউটোরিয়াল — AI দিয়ে ভিডিও বানানো",
  "pdf.title.ai-grok-guide": "Grok টিউটোরিয়াল",
  "pdf.title.ai-midjourney-guide": "Midjourney টিউটোরিয়াল — AI দিয়ে ছবি বানানো",
  "pdf.title.ai-muse-guide": "Muse.ai টিউটোরিয়াল",
  "pdf.title.ai-perplexity-guide": "Perplexity টিউটোরিয়াল",
  "pdf.title.ai-product-photos": "AI ছবি থেকে পণ্যের ছবি",
  "pdf.title.ai-prompt-library": "প্রম্পট লাইব্রেরি — ১০০ তৈরি প্রম্পট",
  "pdf.title.ai-video-workflow": "AI ভিডিও ওয়ার্কফ্লো",
  "pdf.title.cv-cover-letter-guide": "CV ও কভার লেটার গাইড (টেমপ্লেটসহ)",
  "pdf.title.daily-english-conversation": "দৈনন্দিন ইংরেজি কথোপকথন",
  "pdf.title.diabetes-food-list": "ডায়াবেটিস-বান্ধব খাদ্য তালিকা",
  "pdf.title.digital-marketing-checklist": "ছোট দোকানের ডিজিটাল মার্কেটিং চেকলিস্ট",
  "pdf.title.excel-sheets-practical": "Excel / Google Sheets বাস্তব কাজে",
  "pdf.title.facebook-page-selling": "Facebook Page থেকে বিক্রি",
  "pdf.title.healthy-meal-plan": "ঘরে বসে স্বাস্থ্যকর খাবারের পরিকল্পনা (সাপ্তাহিক চার্টসহ)",
  "pdf.title.ielts-foundation": "IELTS প্রস্তুতির ভিত্তি",
  "pdf.title.interview-prep": "ইন্টারভিউ প্রস্তুতি",
  "pdf.title.kids-study-ai": "সন্তানের পড়াশোনায় AI-র সঠিক ব্যবহার",
  "pdf.title.rel-falaq-nas": "সূরা আল-ফালাক ও আন-নাস — বাংলা অর্থসহ",
  "pdf.title.rel-fatiha": "সূরা আল-ফাতিহা — বাংলা অর্থসহ",
  "pdf.title.rel-ikhlas": "সূরা আল-ইখলাস — বাংলা অর্থসহ",
  "pdf.title.rel-istighfar": "সায়্যিদুল ইস্তিগফার — দোয়া ও ফজিলত",
  "pdf.title.safe-shopping-guide": "অনলাইন কেনাকাটায় প্রতারণা এড়ানোর ১০ উপায়",
  "pdf.title.shopping-guide": "BazarGoo কেনাকাটা গাইড",
  "pdf.title.store-guide": "BazarGoo দোকান পরিচিতি",
  "pdf.title.telegram-miniapp-business": "Telegram Mini App দিয়ে ব্যবসা — শুরু থেকে",
  "precheckout.deposit_minimum": (v) => { return `সর্বনিম্ন ${DEPOSIT_MIN_STARS} Stars জমা দিতে হবে।`; },
  "precheckout.order_unknown": "অর্ডারটি চেনা যায়নি।",
  "precheckout.pay_with_stars": "Stars (XTR) দিয়ে পেমেন্ট করতে হবে।",
  "precheckout.pdf_free": "এই PDF-টি ফ্রি — পেমেন্ট লাগবে না।",
  "precheckout.pdf_not_found": "এই PDF-টি পাওয়া যায়নি।",
  "precheckout.price_mismatch": "দাম মিলছে না — আবার চেষ্টা করুন।",
  "profile.default_name": "ব্যবহারকারী",
  "promo.approved": (v) => { const { promo, title } = v || {}; return `🎉 আপনার Promote অনুমোদন হয়েছে! "${promo.title}" এখন স্পন্সর টাস্ক হিসেবে লাইভ।`; },
  "promo.rejected": (v) => { const { promo, title } = v || {}; return `😔 আপনার Promote অনুমোদন হয়নি: "${promo.title}" — পেমেন্ট ফেরতের বিষয়ে অ্যাডমিনের সাথে যোগাযোগ করুন।`; },
  "promote.gram_pay_note": "Promote পেমেন্ট — txid পাঠিয়ে কনফার্ম করুন",
  "promote.zero_pay_note": "Promote পেমেন্ট — txid পাঠিয়ে কনফার্ম করুন",
  "quiz.q1": "ঢাকার ভেতরে ডেলিভারি চার্জ কত?",
  "quiz.q1_option_1": "৳৬০",
  "quiz.q1_option_2": "৳১২০",
  "quiz.q1_option_3": "৳২০০",
  "quiz.q2": "BazarGoo-তে পেমেন্টের উপায় কী?",
  "quiz.q2_option_2": "শুধু bKash",
  "quiz.q2_option_3": "শুধু কার্ড",
  "quiz.question_first_order_coupon": "প্রথম অর্ডারের কুপন কোড কী?",
  "ref.welcome": "আসসালামু আলাইকুম! Bazar Goo-তে স্বাগতম 🛍️\nবন্ধুর লিংকে এসেছেন — অ্যাপ খুলে দৈনিক চেক-ইন করলেই আপনার বন্ধু 10 ZERO পাবেন, আর আপনিও টাস্ক করে ZERO জমাতে পারবেন।",
  "referrals.fallback_name": "বন্ধু",
  "review.confirm": (v) => { const { name } = v || {}; return `ধন্যবাদ${name ? ', ' + name : ''}! আপনার রিভিউ পেয়েছি, যাচাই করে প্রকাশ করা হবে।
— Bazar Goo 🛍️`; },
  "sponsor.desc": (v) => { const { promo, remaining } = v || {}; return `স্পন্সর টাস্ক — যাচাই করা কাজটি করুন • বাকি ${promo.remaining}টি`; },
  "start.fallback": "দোকান খুলতে নিচের বোতামে ট্যাপ করুন 🛍️",
  "start.txid_not_admin": "শুধু অ্যাডমিন এই কমান্ড ব্যবহার করতে পারেন।",
  "start.welcome": "আসসালামু আলাইকুম! Bazar Goo-তে স্বাগতম 🛍️\nনিচের বোতামে ট্যাপ করে দোকান খুলুন, প্রোডাক্ট দেখুন আর অর্ডার করুন।",
  "tasks.ad_desc": "দিনে সর্বোচ্চ ৫ বার — Zerads বিজ্ঞাপন দেখুন",
  "tasks.ad_monetag_desc": "দিনে সর্বোচ্চ ৫ বার — Monetag বিজ্ঞাপন দেখুন (প্রতিবার ৩০ সেকেন্ড বিরতি)",
  "tasks.ad_monetag_title": "📺 অ্যাড দেখুন (Monetag)",
  "tasks.ad_title": "বিজ্ঞাপন দেখুন",
  "tasks.checkin_desc": "দিনে ১ বার — অ্যাপ খুলে চেক-ইন করুন",
  "tasks.checkin_title": "দৈনিক চেক-ইন",
  "tasks.join_adsterratt_title": "@adsterratt চ্যানেলে জয়েন",
  "tasks.join_bazargoo_title": "@bazargoo287 চ্যানেলে জয়েন",
  "tasks.join_cryptoguru_title": "@cryptoguru_247 চ্যানেলে জয়েন",
  "tasks.join_desc": "একবার — চ্যানেলে জয়েন করে যাচাই করুন",
  "tasks.join_earnplaygame_title": "@earnplaygame21 চ্যানেলে জয়েন",
  "tasks.quiz_desc": "দিনে ১ বার — ৩টি প্রশ্নের সব সঠিক উত্তর দিন",
  "tasks.quiz_title": "দৈনিক কুইজ",
  "tasks.react_daily_desc": "দিনে ১ বার — পিন করা পোস্টে ❤️ রিঅ্যাক্ট দিন, তারপর দাবি করুন",
  "tasks.react_daily_title": "পিন করা পোস্টে ❤️ রিঅ্যাক্ট",
  "tasks.react_withdraw_desc": "দিনে ১ বার — উইথড্র চ্যানেলের পিন করা পোস্টে ❤️ রিঅ্যাক্ট দিন, তারপর দাবি করুন (তোলার শর্ত, পুরস্কার নয়)",
  "tasks.react_withdraw_title": "💸 তোলার আগে — @bazargoowithdraw-এ ❤️ রিঅ্যাক্ট",
  "tasks.referral_desc": "লেভেল ১: ১০ ZERO · লেভেল ২: ৫ ZERO · লেভেল ৩: ২ ZERO — প্রথম চেক-ইনে বোনাস + টাস্ক আয়ে ৩%/২%/১% কমিশন",
  "tasks.referral_title": "বন্ধুকে আমন্ত্রণ",
  "tasks.spin_daily_desc": "সম্পূর্ণ ফ্রি — দিনে ৪ বার (২ Monetag + ২ AdsGram)। শর্ত: আজকের চেক-ইন + ৪ চ্যানেলে জয়েন। প্রতিটা পুরস্কার পেতে ১টি অ্যাড দেখুন। পুরস্কার ১–২৫ ZERO + ফ্রি স্পিন।",
  "tasks.video_daily_desc": "২৪ ঘণ্টায় ১ বার — বটের টিউটোরিয়াল ভিডিওটি পুরো দেখুন",
  "tasks.video_daily_title": "🎬 ভিডিও দেখুন",
  "tasks.visit_desc": "২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)",
  "withdraw.gram_history_note": (v) => { const { id } = v || {}; return `GRAM তোলা — ${id}`; },
  "withdraw.save_history_note": "Wallet-এ জমা",
  "withdraw.zero_history_note": (v) => { const { id } = v || {}; return `ZERO তোলা — ${id}`; },
  "zero.instructions": (v) => { const { price_zero, shopAddress, title } = v || {}; return `⛓️ ZERO দিয়ে কিনুন — "${title}"

১. এই ঠিকানায় পাঠান: \`${shopAddress}\`
২. পরিমাণ: ${price_zero} ZERO
৩. পেমেন্টের পর transaction id (txid) এখানে পাঠান।

যাচাই হলেই বট PDF পাঠিয়ে দেবে। (৩০ মিনিটের মধ্যে txid পাঠান।)`; },
  "zero.no_intent": "প্রথমে অ্যাপ থেকে \"⛓️ ZERO দিয়ে কিনুন\" চাপুন — বট ঠিকানা ও দাম জানিয়ে দেবে, তারপর txid পাঠান।",
  "zero.not_configured": "⛓️ ZERO দিয়ে পেমেন্ট এখনো চালু হয়নি। Stars দিয়ে কিনতে পারেন।",
  "zero.not_priced": (v) => { const { title } = v || {}; return `📚 "${title}"-এর ZERO দাম এখনো ঠিক হয়নি। শীঘ্রই জানানো হবে।`; },
  "zero.txid_duplicate": "এই txid দিয়ে আগেই PDF দেওয়া হয়েছে। নতুন পেমেন্টের txid হলে আবার পাঠান।",
  "zero.txid_insufficient": (v) => { const { paid, price_zero } = v || {}; return `এই txid-তে দোকানের ঠিকানায় যথেষ্ট ZERO পাওয়া যায়নি (${paid} ZERO)। সঠিক পরিমাণ (${price_zero} ZERO) পাঠিয়ে আবার চেষ্টা করুন।`; },
  "zero.txid_not_found": "এই txid-টি খুঁজে পাওয়া যায়নি। সঠিক txid দিয়েছেন কি না দেখে আবার পাঠান।",
  "zero.txid_not_priced": "এই PDF-টির ZERO দাম এখনো ঠিক হয়নি।",
  "zero.txid_unconfirmed": "পেমেন্টটি এখনো কনফার্ম হয়নি। একটু পরে আবার txid পাঠান।",
  "zero.txid_verify_failed": "txid যাচাই করা যায়নি। একটু পরে আবার চেষ্টা করুন, না হলে দোকানে জানান।",
},
};

// t(key, lang, vars, fallback) — every user-facing string goes through this.
// vars supplies the ${...} placeholders of the template; missing keys fall
// back to Bengali, then to `fallback` (or the key itself). A template that
// throws renders the fallback instead of crashing the handler.
export function t(key, lang, vars, fallback) {
  const l = lang === 'en' ? 'en' : 'bn';
  const entry = (I18N[l] && I18N[l][key] !== undefined) ? I18N[l][key] : I18N.bn[key];
  if (entry === undefined) return fallback !== undefined ? fallback : key;
  if (typeof entry === 'function') {
    try { return entry(vars || {}); } catch (e) { return fallback !== undefined ? fallback : key; }
  }
  return entry;
}
// END I18N GENERATED

// ---------- i18n helpers (Phase 2, hand-written) ----------
// Per-user language: KV zlang:<uid> = 'en' | 'bn' (written on toggle),
// default from the Telegram update's from.language_code ('en'/'en-*' ->
// English, anything else -> Bengali). Never throws — falls back to 'bn'.
export function normalizeLang(code) {
  return String(code || '').toLowerCase().startsWith('en') ? 'en' : 'bn';
}

export async function getUserLang(env, userId, from) {
  if (userId) {
    try {
      const saved = await env.KV.get('zlang:' + userId);
      if (saved === 'en' || saved === 'bn') return saved;
    } catch (e) { /* fall through to language_code */ }
  }
  return normalizeLang(from && from.language_code);
}

export async function setUserLang(env, userId, lang) {
  const l = lang === 'en' ? 'en' : 'bn';
  await env.KV.put('zlang:' + userId, l);
  return l;
}

// API language: an explicit ?lang= / body.lang wins; else the user's
// stored zlang; else Bengali (existing clients keep today's behaviour).
export async function apiLang(env, userId, param) {
  if (param === 'en' || param === 'bn') return param;
  if (userId) {
    try {
      const saved = await env.KV.get('zlang:' + userId);
      if (saved === 'en' || saved === 'bn') return saved;
    } catch (e) { /* fall through */ }
  }
  return 'bn';
}

// Catalog title in the buyer's language; the Bengali catalog title is
// the fallback (e.g. test-pdf has no pdf.title.* key).
export function pdfTitle(item, lang) {
  if (!item) return '';
  return t('pdf.title.' + item.id, lang, {}, item.title || item.id);
}

/* PDF catalog — inlined on purpose: pre_checkout validation must never
 * wait on a network fetch (10-second rule). Keep in sync with
 * payments/pdf_catalog.json (same ids, same prices). file_id stays null
 * here until the admin sends the real PDF to the bot with caption
 * "pdf:<id>" — the worker then stores it in KV (pdf_file:<id>). */
export const PDF_CATALOG = [
  {
    id: "test-pdf",
    title: "Test PDF — BazarGoo Guide",
    description: "টেস্ট PDF — পেমেন্ট সিস্টেম যাচাইয়ের জন্য। আসল PDF নয়।",
    free: false,
    price_stars: 1,
    price_zero: 1,
    file_id: null,
    file_url: null,
    category: "টেস্ট",
  },
  {
    id: "shopping-guide",
    title: "BazarGoo কেনাকাটা গাইড",
    description: "Bazar Goo থেকে অর্ডার করার পুরো নিয়ম — অ্যাপ খোলা, কার্ট, চেকআউট, ডেলিভারি চার্জ ও Cash on Delivery।",
    free: false,
    price_stars: 5,
    price_zero: 5,
    file_id: null,
    file_url: null,
    category: "কেনাকাটা",
  },
  {
    id: "safe-shopping-guide",
    title: "অনলাইন কেনাকাটায় প্রতারণা এড়ানোর ১০ উপায়",
    description: "অনলাইনে কেনাকাটার সময় প্রতারণা এড়াতে ১০টি কাজের উপায়।",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "কেনাকাটা",
  },
  {
    id: "store-guide",
    title: "BazarGoo দোকান পরিচিতি",
    description: "Bazar Goo দোকান পরিচিতি — কীভাবে অর্ডার করবেন, ডেলিভারি চার্জ ও Cash on Delivery।",
    free: true,
    price_stars: null,
    price_zero: null,
    file_id: null,
    file_url: "payments/pdfs/কেনাকাটা/store-guide.pdf",
    category: "কেনাকাটা",
  },
  {
    id: "ai-earning-guide",
    title: "AI দিয়ে আয় গাইডলাইন",
    description: "AI টুলস, Muse, প্রম্পট আর AI দিয়ে আয়ের বাস্তব উপায় — কোনো আয়ের নিশ্চয়তা ছাড়া সত্যি কথা।",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
  },
  {
    id: "ai-muse-guide",
    title: "Muse.ai টিউটোরিয়াল",
    description: "Meta-র পার্সোনাল AI এজেন্ট — লক্ষ্য বলুন, কাজ করিয়ে নিন",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-muse-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-muse-guide-preview-en.pdf",
  },
  {
    id: "ai-gemini-guide",
    title: "Gemini টিউটোরিয়াল",
    description: "Google-এর AI সহকারী — লেখা, গবেষণা, ছবি আর ভয়েস",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-gemini-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-gemini-guide-preview-en.pdf",
  },
  {
    id: "ai-chatgpt-guide",
    title: "ChatGPT টিউটোরিয়াল",
    description: "OpenAI-এর জনপ্রিয় AI চ্যাটবট — লেখা, ছবি, ভয়েস, গবেষণা",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-chatgpt-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-chatgpt-guide-preview-en.pdf",
  },
  {
    id: "ai-grok-guide",
    title: "Grok টিউটোরিয়াল",
    description: "xAI-এর চ্যাটবট — লাইভ খবর, X পোস্ট, ছবি ও ভিডিও",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-grok-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-grok-guide-preview-en.pdf",
  },
  {
    id: "ai-claude-guide",
    title: "Claude টিউটোরিয়াল",
    description: "Anthropic-এর AI সহকারী — লম্বা লেখা, ডকুমেন্ট, কোড",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-claude-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-claude-guide-preview-en.pdf",
  },
  {
    id: "ai-deepseek-guide",
    title: "DeepSeek টিউটোরিয়াল",
    description: "ফ্রি AI চ্যাটবট — লেখা, যুক্তি, গণিত, কোড",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-deepseek-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-deepseek-guide-preview-en.pdf",
  },
  {
    id: "ai-google-flow-guide",
    title: "Google Flow টিউটোরিয়াল — AI দিয়ে ভিডিও বানানো",
    description: "Google-এর AI ফিল্মমেকিং টুল — Veo দিয়ে সিনেমার মতো ক্লিপ বানান",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-google-flow-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-google-flow-guide-preview-en.pdf",
  },
  {
    id: "ai-flowmusic-guide",
    title: "FlowMusic টিউটোরিয়াল — AI দিয়ে গান বানানো",
    description: "Google Flow Music — চ্যাট করে গান বানান, Lyria মডেল",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-flowmusic-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-flowmusic-guide-preview-en.pdf",
  },
  {
    id: "ai-copilot-guide",
    title: "Microsoft Copilot টিউটোরিয়াল",
    description: "Microsoft-এর AI সহকারী — Windows, Edge আর Office-এ",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-copilot-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-copilot-guide-preview-en.pdf",
  },
  {
    id: "ai-perplexity-guide",
    title: "Perplexity টিউটোরিয়াল",
    description: "উত্তরের সার্চ ইঞ্জিন — উৎসসহ সঠিক তথ্য",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-perplexity-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-perplexity-guide-preview-en.pdf",
  },
  {
    id: "ai-midjourney-guide",
    title: "Midjourney টিউটোরিয়াল — AI দিয়ে ছবি বানানো",
    description: "সবচেয়ে সুন্দর AI ছবি — Discord ও ওয়েব অ্যাপে",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-midjourney-guide-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-midjourney-guide-preview-en.pdf",
  },
  {
    id: "rel-fatiha",
    title: "সূরা আল-ফাতিহা — বাংলা অর্থসহ",
    description: "কুরআনের প্রথম সূরা — ৬টি আয়াত (এই সিরিজে বিসমিল্লাহ আয়াত হিসেবে গোনা হয় না)",
    free: false,
    price_stars: null,
    price_zero: null,
    file_id: null,
    file_url: null,
    category: "ধর্মীয় বই",
    reward_only: true,
  },
  {
    id: "rel-ikhlas",
    title: "সূরা আল-ইখলাস — বাংলা অর্থসহ",
    description: "আল্লাহর একত্বের সূরা — ৪টি আয়াত",
    free: false,
    price_stars: null,
    price_zero: null,
    file_id: null,
    file_url: null,
    category: "ধর্মীয় বই",
    reward_only: true,
  },
  {
    id: "rel-falaq-nas",
    title: "সূরা আল-ফালাক ও আন-নাস — বাংলা অর্থসহ",
    description: "আশ্রয় প্রার্থনার দুই সূরা (মুআওয়িযাতাইন)",
    free: false,
    price_stars: null,
    price_zero: null,
    file_id: null,
    file_url: null,
    category: "ধর্মীয় বই",
    reward_only: true,
  },
  {
    id: "rel-istighfar",
    title: "সায়্যিদুল ইস্তিগফার — দোয়া ও ফজিলত",
    description: "ক্ষমা প্রার্থনার সেরা দোয়া — সহীহ আল-বুখারী ৬৩০৬",
    free: false,
    price_stars: null,
    price_zero: null,
    file_id: null,
    file_url: null,
    category: "ধর্মীয় বই",
    reward_only: true,
  },
  {
    id: "ai-prompt-library",
    title: "প্রম্পট লাইব্রেরি — ১০০ তৈরি প্রম্পট",
    description: "ব্যবসা, লেখা ও পড়াশোনার জন্য তৈরি প্রম্পট",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-prompt-library-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-prompt-library-preview-en.pdf",
  },
  {
    id: "ai-freelancing-start",
    title: "AI দিয়ে ফ্রিল্যান্সিং শুরু",
    description: "AI টুল দিয়ে ফ্রিল্যান্স কাজ শুরু করার বাস্তব পথ",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-freelancing-start-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-freelancing-start-preview-en.pdf",
  },
  {
    id: "ai-product-photos",
    title: "AI ছবি থেকে পণ্যের ছবি",
    description: "দোকানের পণ্যের আকর্ষণীয় ছবি বানানো",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-product-photos-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-product-photos-preview-en.pdf",
  },
  {
    id: "ai-video-workflow",
    title: "AI ভিডিও ওয়ার্কফ্লো",
    description: "আইডিয়া থেকে শেষ ভিডিও পর্যন্ত পুরো প্রক্রিয়া",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "AI টিউটোরিয়াল",
    preview_url: "payments/pdfs/AI টিউটোরিয়াল/ai-video-workflow-preview.pdf",
    preview_url_en: "payments/pdfs/AI টিউটোরিয়াল/ai-video-workflow-preview-en.pdf",
  },
  {
    id: "telegram-miniapp-business",
    title: "Telegram Mini App দিয়ে ব্যবসা — শুরু থেকে",
    description: "বট, মিনি অ্যাপ, অর্ডার আর পেমেন্ট — শুরু থেকে ধাপে ধাপে",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "অনলাইন আয়",
    preview_url: "payments/pdfs/অনলাইন আয়/telegram-miniapp-business-preview.pdf",
    preview_url_en: "payments/pdfs/অনলাইন আয়/telegram-miniapp-business-preview-en.pdf",
  },
  {
    id: "facebook-page-selling",
    title: "Facebook Page থেকে বিক্রি",
    description: "পেইজ সাজানো, পোস্ট, মেসেজে অর্ডার আর বিশ্বাস গড়া",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "অনলাইন আয়",
    preview_url: "payments/pdfs/অনলাইন আয়/facebook-page-selling-preview.pdf",
    preview_url_en: "payments/pdfs/অনলাইন আয়/facebook-page-selling-preview-en.pdf",
  },
  {
    id: "digital-marketing-checklist",
    title: "ছোট দোকানের ডিজিটাল মার্কেটিং চেকলিস্ট",
    description: "অল্প বাজেটে দোকানের প্রচার — চেকলিস্ট ধরে ধরে",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "অনলাইন আয়",
    preview_url: "payments/pdfs/অনলাইন আয়/digital-marketing-checklist-preview.pdf",
    preview_url_en: "payments/pdfs/অনলাইন আয়/digital-marketing-checklist-preview-en.pdf",
  },
  {
    id: "cv-cover-letter-guide",
    title: "CV ও কভার লেটার গাইড (টেমপ্লেটসহ)",
    description: "পেশাদার CV আর কভার লেটার — টেমপ্লেটসহ",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "ক্যারিয়ার",
    preview_url: "payments/pdfs/ক্যারিয়ার/cv-cover-letter-guide-preview.pdf",
    preview_url_en: "payments/pdfs/ক্যারিয়ার/cv-cover-letter-guide-preview-en.pdf",
  },
  {
    id: "interview-prep",
    title: "ইন্টারভিউ প্রস্তুতি",
    description: "প্রশ্নের উত্তর, আচরণ আর আত্মবিশ্বাস — প্রস্তুতি ধাপে ধাপে",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "ক্যারিয়ার",
    preview_url: "payments/pdfs/ক্যারিয়ার/interview-prep-preview.pdf",
    preview_url_en: "payments/pdfs/ক্যারিয়ার/interview-prep-preview-en.pdf",
  },
  {
    id: "excel-sheets-practical",
    title: "Excel / Google Sheets বাস্তব কাজে",
    description: "দোকান, অফিস আর পড়াশোনার হিসাব — ফর্মুলাসহ",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "ক্যারিয়ার",
    preview_url: "payments/pdfs/ক্যারিয়ার/excel-sheets-practical-preview.pdf",
    preview_url_en: "payments/pdfs/ক্যারিয়ার/excel-sheets-practical-preview-en.pdf",
  },
  {
    id: "daily-english-conversation",
    title: "দৈনন্দিন ইংরেজি কথোপকথন",
    description: "দোকান, বাজার, অফিস আর ফোনে — রোজকার ইংরেজি বাক্য",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "ভাষা ও পড়াশোনা",
    preview_url: "payments/pdfs/ভাষা ও পড়াশোনা/daily-english-conversation-preview.pdf",
    preview_url_en: "payments/pdfs/ভাষা ও পড়াশোনা/daily-english-conversation-preview-en.pdf",
  },
  {
    id: "ielts-foundation",
    title: "IELTS প্রস্তুতির ভিত্তি",
    description: "চারটি অংশ, ব্যান্ড স্কোর আর প্রস্তুতির ভিত্তি",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "ভাষা ও পড়াশোনা",
    preview_url: "payments/pdfs/ভাষা ও পড়াশোনা/ielts-foundation-preview.pdf",
    preview_url_en: "payments/pdfs/ভাষা ও পড়াশোনা/ielts-foundation-preview-en.pdf",
  },
  {
    id: "kids-study-ai",
    title: "সন্তানের পড়াশোনায় AI-র সঠিক ব্যবহার",
    description: "হোমওয়ার্কে সাহায্য, কিন্তু উত্তর কপি নয় — সঠিক নিয়ম",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "ভাষা ও পড়াশোনা",
    preview_url: "payments/pdfs/ভাষা ও পড়াশোনা/kids-study-ai-preview.pdf",
    preview_url_en: "payments/pdfs/ভাষা ও পড়াশোনা/kids-study-ai-preview-en.pdf",
  },
  {
    id: "healthy-meal-plan",
    title: "ঘরে বসে স্বাস্থ্যকর খাবারের পরিকল্পনা (সাপ্তাহিক চার্টসহ)",
    description: "সাপ্তাহিক চার্ট আর বাজারের তালিকাসহ — সহজ, ঘরোয়া খাবার",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "স্বাস্থ্য",
    preview_url: "payments/pdfs/স্বাস্থ্য/healthy-meal-plan-preview.pdf",
    preview_url_en: "payments/pdfs/স্বাস্থ্য/healthy-meal-plan-preview-en.pdf",
  },
  {
    id: "diabetes-food-list",
    title: "ডায়াবেটিস-বান্ধব খাদ্য তালিকা",
    description: "সাধারণ খাদ্য-তালিকা — কী খাওয়া যায়, কী পরিমিত, কী এড়িয়ে চলা ভালো",
    free: false,
    price_stars: 10,
    price_zero: 10,
    file_id: null,
    file_url: null,
    category: "স্বাস্থ্য",
    preview_url: "payments/pdfs/স্বাস্থ্য/diabetes-food-list-preview.pdf",
    preview_url_en: "payments/pdfs/স্বাস্থ্য/diabetes-food-list-preview-en.pdf",
  },
];

export function catalogGet(id) {
  if (!id) return null;
  for (const p of PDF_CATALOG) if (p.id === id) return p;
  return null;
}

// ---------- small helpers ----------

export function makeSaleId(now) {
  const d = now || new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let s = '';
  for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'SALE-' + y + m + day + '-' + s;
}

export function isTxid(text) {
  return /^[0-9a-fA-F]{64}$/.test(String(text || '').trim());
}

export function parseStartArg(text) {
  // "/start", "/start buy_<id>", "/start zero_<id>", "/start redownload_<id>"
  const t = String(text || '').trim();
  if (!t.startsWith('/start')) return null;
  const arg = t.slice(6).trim();
  if (!arg) return { kind: 'plain' };
  if (arg.startsWith('buy_')) return { kind: 'buy', id: arg.slice(4) };
  if (arg.startsWith('zero_')) return { kind: 'zero', id: arg.slice(5) };
  if (arg.startsWith('redownload_')) return { kind: 'redownload', id: arg.slice(11) };
  if (arg.startsWith('ref_')) return { kind: 'ref', referrer: arg.slice(4) };
  if (arg.startsWith('deposit_')) { // v26: /start deposit_<stars> — wallet Stars deposit
    const n = Number(arg.slice(8));
    if (Number.isInteger(n) && n > 0) return { kind: 'deposit', stars: n };
  }
  return { kind: 'unknown', arg };
}

function shopButton(lang) {
  return { inline_keyboard: [[{ text: t('common.shop_button', lang), web_app: { url: SHOP_URL } }]] };
}

// /start welcome keyboard: shop button + language toggle (বাংলা / English).
function welcomeKeyboard(lang) {
  return { inline_keyboard: [
    [{ text: t('common.shop_button', lang), web_app: { url: SHOP_URL } }],
    [
      { text: '🌐 বাংলা', callback_data: 'lang:bn' },
      { text: '🌐 English', callback_data: 'lang:en' },
    ],
  ] };
}

// Standalone language picker (same two buttons, no shop button).
function languageKeyboard() {
  return { inline_keyboard: [[
    { text: '🌐 বাংলা', callback_data: 'lang:bn' },
    { text: '🌐 English', callback_data: 'lang:en' },
  ]] };
}

// ---------- Telegram API (global fetch; stubbed in tests) ----------

async function tgCall(env, method, payload) {
  try {
    const res = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, description: String(e && e.message || e) };
  }
}

async function tgSend(env, chatId, text, replyMarkup) {
  const payload = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tgCall(env, 'sendMessage', payload);
}

async function tgSendDocument(env, chatId, fileId, caption) {
  return tgCall(env, 'sendDocument', { chat_id: chatId, document: fileId, caption: caption || '' });
}

// ---------- zerochain.info API (read-only explorer; stubbed in tests) ----------

async function zerochainGet(env, path) {
  const key = (env.ZEROCHAIN_API_KEY || '').trim();
  // Verified 2026-11-08 against a REAL tx (4182c7ef…): the zerochain.info
  // explorer API answers WITHOUT an API key, and /txid returns the
  // Insight-style shape (vout[].value + scriptPubKey.addresses[]) that
  // extractZeroOutputs expects. A key, if one is ever set, is still
  // appended as before. No key is needed.
  const url = key ? ZEROCHAIN_API + path + '/' + key : ZEROCHAIN_API + path;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// ---------- KV helpers ----------

async function kvGetJson(env, key) {
  const raw = await env.KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function kvPutJson(env, key, value, opts) {
  await env.KV.put(key, JSON.stringify(value), opts || undefined);
}

// ---------- sales ledger (see DESIGN.md — same shape for STAR and ZERO,
// designed so a later micro-task / redeem system can write into it) ----------

async function recordSale(env, sale) {
  await kvPutJson(env, 'sale:' + sale.sale_id, sale);
  if (sale.telegram_payment_charge_id) {
    await env.KV.put('sale:charge:' + sale.telegram_payment_charge_id, sale.sale_id);
  }
  if (sale.txid) await env.KV.put('sale:txid:' + sale.txid, sale.sale_id);
}

async function saleByCharge(env, chargeId) {
  const id = await env.KV.get('sale:charge:' + chargeId);
  return id ? kvGetJson(env, 'sale:' + id) : null;
}

async function saleByTxid(env, txid) {
  const id = await env.KV.get('sale:txid:' + txid);
  return id ? kvGetJson(env, 'sale:' + id) : null;
}

async function resolvePdfFileId(env, pdfId) {
  const fromKv = await env.KV.get('pdf_file:' + pdfId);
  if (fromKv) return fromKv;
  const item = catalogGet(pdfId);
  return item && item.file_id ? item.file_id : null;
}

async function deliverPdf(env, sale, opts) {
  const item = catalogGet(sale.item_id);
  // User-facing captions use the buyer's language (opts.lang, else the
  // stored zlang); the admin alert always uses the Bengali catalog title.
  const lang = (opts && opts.lang) || await getUserLang(env, sale.user_id);
  const title = pdfTitle(item, lang);
  const adminTitle = (item && item.title) || sale.item_id;
  const fileId = await resolvePdfFileId(env, sale.item_id);
  const fileIdEn = await resolvePdfFileId(env, sale.item_id + ':en');
  if (!fileId && !fileIdEn) {
    sale.status = 'paid_waiting_file';
    await recordSale(env, sale);
    await tgSend(env, sale.user_id, t('pdf.deliver_waiting_file', lang, { title }));
    await tgSend(env, ADMIN_ID,
      '⚠️ পেইড PDF-এর ফাইল নেই — বিক্রি হয়েছে কিন্তু ডেলিভারি হয়নি\nPDF: ' + adminTitle + ' (' + sale.item_id + ')\nক্রেতা id: ' + sale.user_id + '\nবিক্রি: ' + sale.sale_id +
      '\nদয়া করে PDF-টি বটে পাঠান (ক্যাপশন: pdf:' + sale.item_id + ')।');
    return { delivered: false, reason: 'no_file' };
  }
  // Every PDF has a Bangla + an English version — the buyer gets both.
  if (fileId) {
    await tgSendDocument(env, sale.user_id, fileId, t('pdf.deliver_caption_bn', lang, { title }));
  }
  if (fileIdEn) {
    await tgSendDocument(env, sale.user_id, fileIdEn,
      '📚 ' + title + ' (English)\nThank you! Here is your PDF.\n— Bazar Goo 🛍️');
  }
  sale.status = 'delivered';
  await recordSale(env, sale);
  // Contest prizes are not sales — the caller sends its own admin
  // message, so the "PDF বিক্রি হয়েছে" alert is skipped (opts.quiet).
  if (!opts || !opts.quiet) await notifyAdminSale(env, sale, adminTitle);
  return { delivered: true };
}

// Admin alert on every successful PDF delivery (Stars + ZERO). Sent only
// after the buyer actually gets the PDF, so a paid-but-waiting sale alerts
// when it is delivered later (the missing-file branch above already alerts
// the admin separately), and a duplicate payment never alerts twice.
async function notifyAdminSale(env, sale, title) {
  const name = title || ((catalogGet(sale.item_id) || {}).title) || sale.item_id;
  const buyer = sale.username ? '@' + sale.username + ' (id: ' + sale.user_id + ')' : 'id: ' + sale.user_id;
  const price = sale.currency === 'STAR' ? sale.amount + ' Stars' : sale.amount + ' ZERO';
  await tgSend(env, ADMIN_ID,
    '💰 PDF বিক্রি হয়েছে!\nPDF: ' + name + ' (' + sale.item_id + ')\nদাম: ' + price +
    '\nক্রেতা: ' + buyer + '\nবিক্রি ID: ' + sale.sale_id);
}

// If a PDF file is registered after some buyers already paid, deliver to
// the ones still waiting. Best effort — a failure here must never break
// the registration itself.
async function deliverWaitingSalesForPdf(env, pdfId) {
  try {
    const list = await env.KV.list({ prefix: 'sale:' });
    for (const k of list.keys || []) {
      if (!/^sale:(SALE|RD)-/.test(k.name)) continue;
      const sale = await kvGetJson(env, k.name);
      if (sale && sale.item_id === pdfId && sale.status === 'paid_waiting_file') {
        await deliverPdf(env, sale);
      }
    }
  } catch (e) { /* best effort only */ }
}

// ---------- Stars: pre_checkout validation (pure — no I/O, fast) ----------

export function validatePreCheckout(pcq, lang) {
  const payload = String((pcq && pcq.invoice_payload) || '');
  // v26: Stars wallet deposit — payload 'deposit_stars:<user_id>:<stars>'.
  const dm = /^deposit_stars:(\d+):(\d+)$/.exec(payload);
  if (dm) {
    if (pcq.currency !== 'XTR') return { ok: false, error: t('precheckout.pay_with_stars', lang) };
    if (pcq.total_amount !== Number(dm[2])) return { ok: false, error: t('precheckout.price_mismatch', lang) };
    if (Number(dm[2]) < DEPOSIT_MIN_STARS) return { ok: false, error: t('precheckout.deposit_minimum', lang) };
    return { ok: true, deposit: true, user_id: Number(dm[1]), stars: Number(dm[2]) };
  }
  const m = /^buy:([A-Za-z0-9_-]+)$/.exec(payload);
  if (!m) return { ok: false, error: t('precheckout.order_unknown', lang) };
  const item = catalogGet(m[1]);
  if (!item) return { ok: false, error: t('precheckout.pdf_not_found', lang) };
  if (item.free) return { ok: false, error: t('precheckout.pdf_free', lang) };
  if (pcq.currency !== 'XTR') return { ok: false, error: t('precheckout.pay_with_stars', lang) };
  if (pcq.total_amount !== item.price_stars) {
    return { ok: false, error: t('precheckout.price_mismatch', lang) };
  }
  return { ok: true, pdfId: item.id };
}

async function handlePreCheckout(env, pcq) {
  const v = validatePreCheckout(pcq, await getUserLang(env, pcq.from && pcq.from.id, pcq.from));
  await tgCall(env, 'answerPreCheckoutQuery', {
    pre_checkout_query_id: pcq.id,
    ok: v.ok,
    ...(v.ok ? {} : { error_message: v.error }),
  });
  return { handled: 'pre_checkout', ok: v.ok };
}

// ---------- Stars: successful_payment ----------

async function handleSuccessfulPayment(env, msg) {
  const sp = msg.successful_payment || {};
  const chargeId = sp.telegram_payment_charge_id;
  const user = msg.from || {};
  const chatId = (msg.chat && msg.chat.id) || user.id;
  const lang = await getUserLang(env, user.id, user);
  // v26: Stars wallet deposit — payload 'deposit_stars:<user_id>:<stars>'.
  // The Stars are already collected by this invoice; credit the wallet
  // balance (prepaid Stars, spendable on PDFs via /buy-pdf-wallet).
  const dm = /^deposit_stars:(\d+):(\d+)$/.exec(String(sp.invoice_payload || ''));
  if (dm) {
    const uid = Number(dm[1]);
    const stars = Number(dm[2]);
    if (!chargeId || uid !== user.id) return { handled: 'successful_payment', ok: false, reason: 'bad_payload' };
    if (await env.KV.get('zdep:' + chargeId)) return { handled: 'successful_payment', ok: true, duplicate: true };
    await env.KV.put('zdep:' + chargeId, JSON.stringify({ user_id: uid, currency: 'stars', paid: stars, at: new Date().toISOString() }));
    const bal = await addWalletBalance(env, uid, 'stars', stars);
    await recordZeroHistory(env, uid, {
      type: 'deposit', amount: stars, source: 'deposit_stars',
      note: t('deposit.history_note', 'bn'), noteKey: 'deposit.history_note', noteVars: {},
      currency: 'STARS',
    });
    await tgSend(env, chatId, t('deposit.success', lang, { stars }));
    return { handled: 'successful_payment', ok: true, deposit: true, stars, balance: bal };
  }
  const m = /^buy:([A-Za-z0-9_-]+)$/.exec(String(sp.invoice_payload || ''));
  if (!m || !chargeId) return { handled: 'successful_payment', ok: false, reason: 'bad_payload' };
  // Idempotency: a redelivered update (same charge id) delivers once.
  if (await saleByCharge(env, chargeId)) {
    return { handled: 'successful_payment', ok: true, duplicate: true };
  }
  const item = catalogGet(m[1]);
  if (!item) return { handled: 'successful_payment', ok: false, reason: 'unknown_item' };
  const sale = {
    sale_id: makeSaleId(),
    user_id: user.id,
    username: user.username || null,
    item_id: item.id,
    item_type: 'pdf',
    currency: 'STAR',
    amount: sp.total_amount,
    status: 'paid',
    telegram_payment_charge_id: chargeId,
    txid: null,
    created_at: new Date().toISOString(),
  };
  const res = await deliverPdf(env, sale, { lang });
  return { handled: 'successful_payment', ok: true, sale_id: sale.sale_id, delivered: res.delivered };
}

// ---------- PDF library: "আমার PDF" (purchased PDFs, re-download) ----------

// All delivered PDF sales for one user, newest first. Only item ids,
// titles and purchase dates are returned — never charge ids or txids.
export async function listUserPdfs(env, userId) {
  const out = [];
  try {
    const list = await env.KV.list({ prefix: 'sale:' });
    for (const k of list.keys || []) {
      if (!/^sale:(SALE|RD)-/.test(k.name)) continue;
      const sale = await kvGetJson(env, k.name);
      if (sale && sale.user_id === userId && sale.item_type === 'pdf' && sale.status === 'delivered') {
        const item = catalogGet(sale.item_id);
        out.push({
          item_id: sale.item_id,
          title: (item && item.title) || sale.item_id,
          purchased_at: sale.created_at || null,
        });
      }
    }
  } catch (e) { /* on KV trouble return what we have (possibly empty) */ }
  out.sort((a, b) => String(b.purchased_at || '').localeCompare(String(a.purchased_at || '')));
  return out;
}

// v26: sponsor task claim. Verification depends on the target:
// our own 4 channels -> live getChatMember (verified); everything
// else -> server-enforced 15s dwell after POST /sponsor-start.
// The dwell timer is HONESTLY not a verification — Facebook /
// YouTube / TikTok / X / Instagram follows cannot be seen from the
// server; it only stops instant abuse. The app must say so.
async function handleSponsorClaim(env, userId, promoId, body) {
  const promo = await kvGetJson(env, 'zpromo:' + promoId);
  if (!promo) return { ok: false, reason: 'unknown_task' };
  if (promo.status !== 'live' || (promo.remaining || 0) <= 0) return { ok: false, reason: 'promo_not_live' };
  const device = await checkDevice(env, userId, body && body.device_id);
  if (!device.ok) return { ok: false, reason: 'device_conflict' };
  if (await env.KV.get('zpromoclaim:' + userId + ':' + promo.id)) return { ok: false, reason: 'already_done' };
  if (promo.target_channel) {
    if (!(await isChannelMember(env, promo.target_channel, userId))) {
      return { ok: false, reason: 'not_joined' };
    }
  } else {
    const started = parseInt((await env.KV.get('zpromostart:' + userId + ':' + promo.id)) || '0', 10) || 0;
    if (!started) return { ok: false, reason: 'start_first' };
    if (Date.now() - started < SPONSOR_DWELL_MS) {
      return { ok: false, reason: 'dwell_not_done', available_in_ms: started + SPONSOR_DWELL_MS - Date.now() };
    }
  }
  await env.KV.put('zpromoclaim:' + userId + ':' + promo.id, '1');
  const isGram = promo.currency === 'gram';
  promo.remaining = (promo.remaining || 0) - 1;
  promo.completed = (promo.completed || 0) + 1;
  if (promo.remaining <= 0) promo.status = 'completed';
  await kvPutJson(env, 'zpromo:' + promo.id, promo);
  if (isGram) {
    // GRAM completions pay GRAM straight to the wallet (no leaderboard,
    // no upline commission — the leaderboard is ZERO-denominated).
    const bal = await addWalletBalance(env, userId, 'gram', promo.reward_per_completion);
    await recordZeroHistory(env, userId, {
      type: 'task', amount: promo.reward_per_completion, source: 'sponsor_' + promo.id,
      note: promo.title || promo.id, currency: 'GRAM',
    });
    return { ok: true, balance: bal, credited: promo.reward_per_completion, currency: 'GRAM', remaining: promo.remaining };
  }
  const earnerName = String((body && body.name) || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 40) || null;
  const balance = await creditTaskEarning(env, userId, PROMOTE_REWARD_ZERO, 'sponsor_' + promo.id, promo.title || promo.id, earnerName);
  return { ok: true, balance, credited: PROMOTE_REWARD_ZERO, currency: 'ZERO', remaining: promo.remaining };
}

async function handleRedownloadStart(env, msg, pdfId) {
  const chatId = (msg.chat && msg.chat.id) || (msg.from && msg.from.id);
  const userId = msg.from && msg.from.id;
  const lang = await getUserLang(env, userId, msg.from);
  const item = catalogGet(pdfId);
  if (!item) {
    await tgSend(env, chatId, t('pdf.not_found_try_again', lang), shopButton(lang));
    return { handled: 'redownload', ok: false, reason: 'unknown_item' };
  }
  const title = pdfTitle(item, lang);
  if (item.free) {
    await tgSend(env, chatId, t('pdf.free_download_in_app', lang, { title }), shopButton(lang));
    return { handled: 'redownload', ok: false, reason: 'free_item' };
  }
  const owned = await listUserPdfs(env, userId);
  if (!owned.some((p) => p.item_id === pdfId)) {
    await tgSend(env, chatId, t('pdf.not_purchased', lang, { title }), shopButton(lang));
    return { handled: 'redownload', ok: false, reason: 'not_purchased' };
  }
  const fileId = await resolvePdfFileId(env, pdfId);
  const fileIdEn = await resolvePdfFileId(env, pdfId + ':en');
  if (!fileId && !fileIdEn) {
    await tgSend(env, chatId, t('pdf.redownload_no_file', lang, { title }));
    return { handled: 'redownload', ok: false, reason: 'no_file' };
  }
  if (fileId) {
    await tgSendDocument(env, chatId, fileId, t('pdf.redownload_caption_bn', lang, { title }));
  }
  if (fileIdEn) {
    await tgSendDocument(env, chatId, fileIdEn,
      '📚 ' + title + ' (English)\nHere is your purchased PDF again.\n— Bazar Goo 🛍️');
  }
  return { handled: 'redownload', ok: true, pdfId };
}

// ---------- Stars: buy deep link ----------

async function handleBuyStart(env, msg, pdfId) {
  const chatId = (msg.chat && msg.chat.id) || (msg.from && msg.from.id);
  const lang = await getUserLang(env, msg.from && msg.from.id, msg.from);
  const item = catalogGet(pdfId);
  if (!item) {
    await tgSend(env, chatId, t('pdf.not_found_try_again', lang), shopButton(lang));
    return { handled: 'buy_start', ok: false, reason: 'unknown_item' };
  }
  const title = pdfTitle(item, lang);
  if (item.free) {
    await tgSend(env, chatId, t('pdf.free_download_in_app', lang, { title }), shopButton(lang));
    return { handled: 'buy_start', ok: false, reason: 'free_item' };
  }
  if (item.reward_only) {
    await tgSend(env, chatId, t('pdf.reward_only', lang, { title }), shopButton(lang));
    return { handled: 'buy_start', ok: false, reason: 'reward_only' };
  }
  if (!item.price_stars) {
    await tgSend(env, chatId, t('pdf.stars_not_priced', lang, { title }), shopButton(lang));
    return { handled: 'buy_start', ok: false, reason: 'not_priced' };
  }
  await tgCall(env, 'sendInvoice', {
    chat_id: chatId,
    title,
    description: t('pdf.buy_invoice_description', lang),
    payload: 'buy:' + item.id,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: title, amount: item.price_stars }],
  });
  return { handled: 'buy_start', ok: true, pdfId: item.id, stars: item.price_stars };
}

// ---------- v26: Stars wallet deposit deep link ----------
// /start deposit_<stars> — the bot sends a Stars invoice whose
// payload is 'deposit_stars:<user_id>:<stars>'. The existing
// pre_checkout + successful_payment handlers credit the wallet
// Stars balance (prepaid Stars, spendable on PDFs via /buy-pdf-wallet).
async function handleDepositStartBot(env, msg, stars) {
  const chatId = (msg.chat && msg.chat.id) || (msg.from && msg.from.id);
  const userId = msg.from && msg.from.id;
  const lang = await getUserLang(env, userId, msg.from);
  if (!Number.isInteger(stars) || stars < DEPOSIT_MIN_STARS) {
    await tgSend(env, chatId, t('deposit.minimum_try_again', lang), shopButton(lang));
    return { handled: 'deposit_start', ok: false, reason: 'below_minimum' };
  }
  const depTitle = t('deposit.invoice_title', lang);
  await tgCall(env, 'sendInvoice', {
    chat_id: chatId,
    title: depTitle,
    description: t('deposit.invoice_description', lang, { stars }),
    payload: 'deposit_stars:' + userId + ':' + stars,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: depTitle, amount: stars }],
  });
  return { handled: 'deposit_start', ok: true, stars };
}

// ---------- ZERO: tx verification (pure — see DESIGN.md for the shape note) ----------

export function extractZeroOutputs(tx) {
  // Tolerant parser for the common Insight-style shapes:
  //   vout[].scriptPubKey.addresses[], vout[].address, outputs[].address
  // Returns [{ address, value }]. The /txid shape is CONFIRMED against a
  // real tx (4182c7ef79665e9f3526563612d091e0d8d3ab5be0cef149fdbb206c71d37ebd,
  // checked 2026-11-08 keyless): vout[].value is a number and
  // vout[].scriptPubKey.addresses[] holds the t1 address. An unknown
  // shape still yields no outputs, and verifyZeroTx then reports
  // "unparsable" instead of guessing.
  const out = [];
  if (!tx || typeof tx !== 'object') return out;
  const vouts = Array.isArray(tx.vout) ? tx.vout : (Array.isArray(tx.outputs) ? tx.outputs : []);
  for (const v of vouts) {
    if (!v || typeof v !== 'object') continue;
    const value = typeof v.value === 'number' ? v.value : parseFloat(v.value);
    if (!isFinite(value)) continue;
    const spk = v.scriptPubKey || {};
    const addrs = [];
    if (Array.isArray(spk.addresses)) addrs.push(...spk.addresses);
    if (typeof spk.address === 'string') addrs.push(spk.address);
    if (typeof v.address === 'string') addrs.push(v.address);
    for (const a of addrs) out.push({ address: a, value });
  }
  return out;
}

export function verifyZeroTx(tx, shopAddress, minAmount) {
  if (!tx || typeof tx !== 'object') return { ok: false, reason: 'not_found' };
  if (typeof tx.confirmations === 'number' && tx.confirmations < 1) {
    return { ok: false, reason: 'unconfirmed' };
  }
  const outs = extractZeroOutputs(tx);
  if (!outs.length) return { ok: false, reason: 'unparsable' };
  let paid = 0;
  for (const o of outs) if (o.address === shopAddress) paid += o.value;
  if (paid + 1e-8 < minAmount) return { ok: false, reason: 'insufficient', paid };
  return { ok: true, paid };
}

// ---------- ZERO: buy deep link + txid handling ----------

async function handleZeroStart(env, msg, pdfId) {
  const chatId = (msg.chat && msg.chat.id) || (msg.from && msg.from.id);
  const userId = msg.from && msg.from.id;
  const lang = await getUserLang(env, userId, msg.from);
  const item = catalogGet(pdfId);
  const shopAddress = (env.ZERO_SHOP_ADDRESS || '').trim();
  if (!item) {
    await tgSend(env, chatId, t('pdf.not_found_try_again', lang), shopButton(lang));
    return { handled: 'zero_start', ok: false, reason: 'unknown_item' };
  }
  const title = pdfTitle(item, lang);
  if (!shopAddress) {
    await tgSend(env, chatId, t('zero.not_configured', lang), shopButton(lang));
    return { handled: 'zero_start', ok: false, reason: 'not_configured' };
  }
  if (item.free) {
    await tgSend(env, chatId, t('pdf.free_download_in_app', lang, { title }), shopButton(lang));
    return { handled: 'zero_start', ok: false, reason: 'free_item' };
  }
  if (item.reward_only) {
    await tgSend(env, chatId, t('pdf.reward_only', lang, { title }), shopButton(lang));
    return { handled: 'zero_start', ok: false, reason: 'reward_only' };
  }
  if (!item.price_zero) {
    await tgSend(env, chatId, t('pdf.stars_not_priced', lang, { title }), shopButton(lang));
    return { handled: 'zero_start', ok: false, reason: 'not_priced' };
  }
  await kvPutJson(env, 'zero_intent:' + userId, { pdf_id: item.id, created_at: new Date().toISOString() },
    { expirationTtl: ZERO_INTENT_TTL_SECONDS });
  await tgSend(env, chatId, t('zero.instructions', lang, { title, shopAddress, price_zero: item.price_zero }));
  return { handled: 'zero_start', ok: true, pdfId: item.id, zero: item.price_zero };
}

async function handleZeroTxid(env, msg, txid) {
  const chatId = (msg.chat && msg.chat.id) || (msg.from && msg.from.id);
  const userId = msg.from && msg.from.id;
  const lang = await getUserLang(env, userId, msg.from);
  const shopAddress = (env.ZERO_SHOP_ADDRESS || '').trim();
  if (!shopAddress) {
    await tgSend(env, chatId, t('zero.not_configured', lang), shopButton(lang));
    return { handled: 'zero_txid', ok: false, reason: 'not_configured' };
  }
  const intent = await kvGetJson(env, 'zero_intent:' + userId);
  if (!intent || !intent.pdf_id) {
    await tgSend(env, chatId, t('zero.no_intent', lang), shopButton(lang));
    return { handled: 'zero_txid', ok: false, reason: 'no_intent' };
  }
  const item = catalogGet(intent.pdf_id);
  if (!item || !item.price_zero) {
    await tgSend(env, chatId, t('zero.txid_not_priced', lang), shopButton(lang));
    return { handled: 'zero_txid', ok: false, reason: 'not_priced' };
  }
  if (await saleByTxid(env, txid)) {
    await tgSend(env, chatId, t('zero.txid_duplicate', lang));
    return { handled: 'zero_txid', ok: true, duplicate: true };
  }
  const tx = await zerochainGet(env, '/txid/' + txid);
  const v = verifyZeroTx(tx, shopAddress, item.price_zero);
  if (!v.ok) {
    if (v.reason === 'not_found') {
      await tgSend(env, chatId, t('zero.txid_not_found', lang));
    } else if (v.reason === 'unconfirmed') {
      await tgSend(env, chatId, t('zero.txid_unconfirmed', lang));
    } else if (v.reason === 'insufficient') {
      await tgSend(env, chatId, t('zero.txid_insufficient', lang, { paid: v.paid, price_zero: item.price_zero }));
    } else {
      await tgSend(env, chatId, t('zero.txid_verify_failed', lang));
    }
    return { handled: 'zero_txid', ok: false, reason: v.reason };
  }
  const sale = {
    sale_id: makeSaleId(),
    user_id: userId,
    username: (msg.from && msg.from.username) || null,
    item_id: item.id,
    item_type: 'pdf',
    currency: 'ZERO',
    amount: v.paid,
    status: 'paid',
    telegram_payment_charge_id: null,
    txid,
    created_at: new Date().toISOString(),
  };
  await env.KV.delete('zero_intent:' + userId);
  const res = await deliverPdf(env, sale, { lang });
  await recordZeroHistory(env, userId, {
    type: 'purchase', amount: -round2(v.paid), source: 'purchase',
    note: item.title || item.id, noteKey: 'pdf.title.' + item.id, noteVars: {},
  });
  return { handled: 'zero_txid', ok: true, sale_id: sale.sale_id, delivered: res.delivered };
}

// ---------- micro-task earn (Phase 3, v1) ----------
// Users earn ZERO (an in-app ledger in KV — NOT on-chain, NOT
// withdrawable as cash) by doing small tasks, and redeem the balance
// for PDFs. No real money, Stars or crypto is ever spent here.
// See goals/bazargoo-telegram-mini-app-shop/files/micro-task-earn-plan/plan.md

export function dhakaDateStr(now) {
  // Dhaka is UTC+6, fixed offset — same approach as the app's
  // flash-deal countdown (never the client's local timezone).
  const d = new Date((now ? now.getTime() : Date.now()) + 6 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// ---------- streak check-in (Pickaxe-style daily rewards) ----------
// Day 1: 1, Day 2: 2, Day 3: 3, Day 4: 5, Day 5: 7, Day 6: 10, Day 7: 15.
// Day 8+ stays at 15 (the streak keeps counting, the reward caps).
export const STREAK_REWARDS = [1, 2, 3, 5, 7, 10, 15];
export function streakReward(streak) {
  if (!streak || streak < 1) return STREAK_REWARDS[0];
  return STREAK_REWARDS[Math.min(streak, STREAK_REWARDS.length) - 1];
}

export function prevDhakaDate(dateStr) {
  // 'YYYY-MM-DD' -> the previous calendar day (UTC math on the date part).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const QUIZ_QUESTIONS = [  {
    q: 'ঢাকার ভেতরে ডেলিভারি চার্জ কত?',
    options: ['৳৬০', '৳১২০', '৳২০০'],
    correct: 0,
  },
  {
    q: 'BazarGoo-তে পেমেন্টের উপায় কী?',
    options: ['Cash on Delivery', 'শুধু bKash', 'শুধু কার্ড'],
    correct: 0,
  },
  {
    q: 'প্রথম অর্ডারের কুপন কোড কী?',
    options: ['BAZAR5', 'BAZAR10', 'FREE'],
    correct: 0,
  },
];

export const TASK_DEFS = [
  { id: 'checkin', title: 'দৈনিক চেক-ইন', reward: 1, desc: 'দিনে ১ বার — অ্যাপ খুলে চেক-ইন করুন' },
  { id: 'join_bazargoo', title: '@bazargoo287 চ্যানেলে জয়েন', reward: 5, desc: 'একবার — চ্যানেলে জয়েন করে যাচাই করুন' },
  { id: 'join_earnplaygame', title: '@earnplaygame21 চ্যানেলে জয়েন', reward: 5, desc: 'একবার — চ্যানেলে জয়েন করে যাচাই করুন' },
  { id: 'join_cryptoguru', title: '@cryptoguru_247 চ্যানেলে জয়েন', reward: 5, desc: 'একবার — চ্যানেলে জয়েন করে যাচাই করুন' },
  { id: 'join_adsterratt', title: '@adsterratt চ্যানেলে জয়েন', reward: 5, desc: 'একবার — চ্যানেলে জয়েন করে যাচাই করুন' },
  { id: 'referral', title: 'বন্ধুকে আমন্ত্রণ', reward: 10, desc: 'লেভেল ১: ১০ ZERO · লেভেল ২: ৫ ZERO · লেভেল ৩: ২ ZERO — প্রথম চেক-ইনে বোনাস + টাস্ক আয়ে ৩%/২%/১% কমিশন' },
  { id: 'ad', title: 'বিজ্ঞাপন দেখুন', reward: 1, desc: 'দিনে সর্বোচ্চ ৫ বার — Zerads বিজ্ঞাপন দেখুন' },
  // v25: Monetag Rewarded Interstitial — 1 ZERO per VERIFIED view
  // (Monetag 'valued' event only), max 5/day, 30s cooldown. NOT
  // claimable via /claim — credit comes only through
  // /monetag-postback (server postback or app confirmation after the
  // SDK resolves 'valued'). Zerads cap and Monetag cap are separate.
  { id: 'ad_monetag', title: '📺 অ্যাড দেখুন (Monetag)', reward: 1, desc: 'দিনে সর্বোচ্চ ৫ বার — Monetag বিজ্ঞাপন দেখুন (প্রতিবার ৩০ সেকেন্ড বিরতি)' },
  { id: 'quiz', title: 'দৈনিক কুইজ', reward: 2, desc: 'দিনে ১ বার — ৩টি প্রশ্নের সব সঠিক উত্তর দিন' },
  { id: 'react_daily', title: 'পিন করা পোস্টে ❤️ রিঅ্যাক্ট', reward: 1, desc: 'দিনে ১ বার — পিন করা পোস্টে ❤️ রিঅ্যাক্ট দিন, তারপর দাবি করুন' },
  // v27: withdraw gate — NOT an earning task (reward 0). The user
  // reacts to the pinned post in @bazargoowithdraw once per Dhaka day;
  // the stamp ('react_withdraw') + live channel membership unlock
  // instant withdrawals. Same click-based honesty limit as react_daily.
  { id: 'react_withdraw', title: '💸 তোলার আগে — @bazargoowithdraw-এ ❤️ রিঅ্যাক্ট', reward: 0, desc: 'দিনে ১ বার — উইথড্র চ্যানেলের পিন করা পোস্টে ❤️ রিঅ্যাক্ট দিন, তারপর দাবি করুন (তোলার শর্ত, পুরস্কার নয়)', group: 'withdraw_gate', url: 'https://t.me/bazargoowithdraw/2' },
  { id: 'video_daily', title: '🎬 ভিডিও দেখুন', reward: 2, desc: '২৪ ঘণ্টায় ১ বার — বটের টিউটোরিয়াল ভিডিওটি পুরো দেখুন' },
  { id: 'spin_daily', title: '🎡 Lucky Spin', reward: 25, desc: 'সম্পূর্ণ ফ্রি — দিনে ৪ বার (২ Monetag + ২ AdsGram)। শর্ত: আজকের চেক-ইন + ৪ চ্যানেলে জয়েন। প্রতিটা পুরস্কার পেতে ১টি অ্যাড দেখুন। পুরস্কার ১–২৫ ZERO + ফ্রি স্পিন।' },
  // v22: daily visit tasks — all 6 Facebook Pages + 4 Telegram
  // channels, 1 ZERO each, once per rolling 24h. Opening a channel
  // shows its last post at the top (no deep link to one message id).
  { id: 'visit_page_play', title: 'Play Game Get Paid', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://www.facebook.com/ekushyaplayearn' },
  { id: 'visit_page_clipcraft', title: 'ClipCraft', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://www.facebook.com/61563692323373' },
  { id: 'visit_page_crypto', title: 'Cryptocoinbd', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://www.facebook.com/cryptocoinbang' },
  { id: 'visit_page_wowappbd', title: 'Wowappbd', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://www.facebook.com/wowekushya' },
  { id: 'visit_page_noor', title: 'Noor-e-Naat', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://www.facebook.com/61568910204325' },
  { id: 'visit_page_usmp', title: 'US Money Pulse', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://www.facebook.com/profile.php?id=61596357419229' },
  { id: 'visit_chan_bazargoo', title: 'BazarGoo', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://t.me/bazargoo287' },
  { id: 'visit_chan_earnplaygame', title: 'EarnPLayGame', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://t.me/earnplaygame21' },
  { id: 'visit_chan_cryptoguru', title: 'CryptoGuru', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://t.me/cryptoguru_247' },
  { id: 'visit_chan_adsterratt', title: 'AdsterraTips', reward: 1, desc: '২৪ ঘণ্টায় ১ বার — পেইজ/চ্যানেলটি দেখুন (শেষ পোস্ট উপরে থাকবে)', group: 'visit', url: 'https://t.me/adsterratt' },
];

// ---------- i18n: task / quiz / history translation (Phase 2) ----------
// TASK_DEFS stays Bengali (the constant is never edited in place);
// /tasks translates title/desc at response time via this map. Tasks
// without a key (spin_daily title + visit titles are language-neutral
// proper nouns) keep their stored text.
const TASK_I18N = {
  checkin: { title: 'tasks.checkin_title', desc: 'tasks.checkin_desc' },
  join_bazargoo: { title: 'tasks.join_bazargoo_title', desc: 'tasks.join_desc' },
  join_earnplaygame: { title: 'tasks.join_earnplaygame_title', desc: 'tasks.join_desc' },
  join_cryptoguru: { title: 'tasks.join_cryptoguru_title', desc: 'tasks.join_desc' },
  join_adsterratt: { title: 'tasks.join_adsterratt_title', desc: 'tasks.join_desc' },
  referral: { title: 'tasks.referral_title', desc: 'tasks.referral_desc' },
  ad: { title: 'tasks.ad_title', desc: 'tasks.ad_desc' },
  ad_monetag: { title: 'tasks.ad_monetag_title', desc: 'tasks.ad_monetag_desc' },
  quiz: { title: 'tasks.quiz_title', desc: 'tasks.quiz_desc' },
  react_daily: { title: 'tasks.react_daily_title', desc: 'tasks.react_daily_desc' },
  react_withdraw: { title: 'tasks.react_withdraw_title', desc: 'tasks.react_withdraw_desc' },
  video_daily: { title: 'tasks.video_daily_title', desc: 'tasks.video_daily_desc' },
  spin_daily: { desc: 'tasks.spin_daily_desc' },
  visit_page_play: { desc: 'tasks.visit_desc' },
  visit_page_clipcraft: { desc: 'tasks.visit_desc' },
  visit_page_crypto: { desc: 'tasks.visit_desc' },
  visit_page_wowappbd: { desc: 'tasks.visit_desc' },
  visit_page_noor: { desc: 'tasks.visit_desc' },
  visit_page_usmp: { desc: 'tasks.visit_desc' },
  visit_chan_bazargoo: { desc: 'tasks.visit_desc' },
  visit_chan_earnplaygame: { desc: 'tasks.visit_desc' },
  visit_chan_cryptoguru: { desc: 'tasks.visit_desc' },
  visit_chan_adsterratt: { desc: 'tasks.visit_desc' },
  // history-only: the monthly-bonus note is stored under this source.
  monthly_bonus: { title: 'claim.monthly_bonus_title' },
};

// Quiz questions/options per index (QUIZ_QUESTIONS is never edited in
// place). null = language-neutral option, kept as-is ('Cash on Delivery',
// 'BAZAR5', 'BAZAR10', 'FREE').
const QUIZ_I18N = [
  { q: 'quiz.q1', options: ['quiz.q1_option_1', 'quiz.q1_option_2', 'quiz.q1_option_3'] },
  { q: 'quiz.q2', options: [null, 'quiz.q2_option_2', 'quiz.q2_option_3'] },
  { q: 'quiz.question_first_order_coupon', options: [null, null, null] },
];

export function translateQuiz(lang) {
  return QUIZ_QUESTIONS.map((qq, i) => {
    const m = QUIZ_I18N[i] || {};
    return {
      q: m.q ? t(m.q, lang, {}, qq.q) : qq.q,
      options: qq.options.map((opt, j) => {
        const k = m.options && m.options[j];
        return k ? t(k, lang, {}, opt) : opt;
      }),
    };
  });
}

// History notes are translated at RESPONSE time (/history). Entries
// recorded with noteKey/noteVars render through t(); older entries
// without a noteKey keep their stored Bengali note. Task-earning notes
// are the task title (source = task id); purchase/redeem notes are the
// PDF title (item_id). The commission note's earner fallback ('বন্ধু')
// is filled per-language here because its template has no || fallback.
export function translateHistoryNote(entry, lang) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  if (entry.noteKey) {
    const vars = { ...(entry.noteVars || {}) };
    if (entry.noteKey === 'history.commission_note' && !vars.earnerName) {
      vars.earnerName = t('referrals.fallback_name', lang);
    }
    out.note = t(entry.noteKey, lang, vars, entry.note || '');
  } else if ((entry.type === 'task' || entry.type === 'spin' || entry.type === 'monthly_bonus') && TASK_I18N[entry.source] && TASK_I18N[entry.source].title) {
    out.note = t(TASK_I18N[entry.source].title, lang, {}, entry.note || '');
  } else if ((entry.type === 'purchase' || entry.type === 'redeem') && entry.item_id) {
    out.note = t('pdf.title.' + entry.item_id, lang, {}, entry.note || '');
  }
  return out;
}

const JOIN_CHANNELS = {
  join_bazargoo: '@bazargoo287',
  join_earnplaygame: '@earnplaygame21',
  join_cryptoguru: '@cryptoguru_247',
  join_adsterratt: '@adsterratt',
};
// v22: channel visit tasks share the same verification — the claiming
// user must currently BE a member of the channel (checked live via
// getChatMember). A failed check fails CLOSED (no credit, no fallback
// to click-trust). Facebook Page visits have no server verification.
const VISIT_CHANNELS = {
  visit_chan_bazargoo: '@bazargoo287',
  visit_chan_earnplaygame: '@earnplaygame21',
  visit_chan_cryptoguru: '@cryptoguru_247',
  visit_chan_adsterratt: '@adsterratt',
};
const AD_DAILY_LIMIT = 5;
const AD_CLICK_LOG_CAP = 20;
// v25: Monetag Rewarded Interstitial ad task — 1 ZERO per VERIFIED
// (valued) view, max 5/day, 30s cooldown between views. Separate cap
// from the Zerads task (each max 5/day). Credit happens ONLY through
// the Monetag server-side postback (GET /monetag-postback) or the app's
// client confirmation after the SDK resolves 'valued' (POST
// /monetag-postback) — both go through the same one-time-use ymid
// check, so whichever arrives first credits and the other is a
// duplicate. The SDK script/zone ID comes from Angela's Monetag
// dashboard (see app.js MONETAG_ZONE_ID) — until it is set, no ad can
// be shown and no Monetag ZERO can be earned.
const MONETAG_DAILY_LIMIT = 5;
const MONETAG_REWARD = 1;
const MONETAG_COOLDOWN_MS = 30 * 1000; // 30 seconds between views
const MONETAG_REQUEST_VAR = 'bazargoo_ad_task';
const VIDEO_COOLDOWN_MS = 24 * 60 * 60 * 1000; // rolling 24 hours, not a calendar day
// v22: same rolling 24h model for the daily visit tasks. Last-claim
// timestamp per visit task lives in zt:<uid>:visit_last:<task id>.
const VISIT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
// Referral rewards per level, paid when the referred user completes their
// FIRST check-in. Level 1 = direct referrer, level 2 = referrer's
// referrer, level 3 = one more up the chain.
const REFERRAL_REWARDS = [10, 5, 2];
// % commissions on a downline user's TASK earnings (in addition to the
// flat first-check-in bonus above): L1 3%, L2 2%, L3 1%. Never paid on
// commissions themselves, on the flat referral bonus, or on
// redemptions/purchases.
const COMMISSION_RATES = [0.03, 0.02, 0.01];

// ---------- v26: Wallet + Deposit + Promote + Withdraw ----------
//
// Pricing is CALCULATED (plan §4.4, Angela 2026-11-09 ~22:13) — never
// change these numbers without her say-so:
//   per verified completion = $0.02 fiat anchor
//   minimum promote budget = 100 ZERO or $2.00 (≈1.91 GRAM at TON
//     $1.045, CoinGecko 2026-11-09 22:13) = 80 completions + 20% margin
//   maximum promote budget = 625 ZERO = 500 completions; $10.00
//     (≈9.57 GRAM) = 300 completions — 40% margin buffer, so that
//     even with system losses Angela never loses (Angela 2026-11-09
//     ~23:14; supersedes BOTH the plan's old "$10 = 500" and the
//     worker's "$10 = 400" — both are gone).
//   completer gets 1 ZERO (ZERO promos) or ~0.019 GRAM (GRAM promos)
//   GRAM amounts are fixed at payment time from the LIVE CoinGecko TON
//     rate — never from a stored rate.
// Withdraw rules (Angela's own, 2026-11-09 ~22:30):
//   ZERO: NO fee, NO minimum (even 1 ZERO, anytime, no lock-up).
//   Minimums apply ONLY to Stars & GRAM: GRAM min 0.5; Stars-credit
//     is NOT withdrawable (a Telegram bot cannot send Stars to a user
//     — only refunds exist), so the Stars minimum means minimum
//     DEPOSIT 10 Stars.
//   Daily caps: 1,000 ZERO + 5 GRAM (all users); GRAM daily cap =
//     min(5 GRAM, 20% of the GRAM payout float).
//   Above 500 ZERO or 2 GRAM needs Angela's manual approval.
//   SOLVENCY: GRAM out ≤ GRAM in (promote GRAM + GRAM deposits +
//     ad USD converted to GRAM) — never more.
//   Phase 2 (v27, 2026-11-10) = FULLY AUTOMATIC send by the worker:
//     the payout wallet's WIF lives ONLY in env.ZERO_PAYOUT_PRIVATE_KEY;
//     the worker derives the address, verifies it equals
//     env.ZERO_PAYOUT_ADDRESS, checks the on-chain float, builds +
//     signs a v4 P2PKH tx (ZIP-243 sighash, Cosmos branch) and
//     broadcasts it via zerochain.info, then confirms via /txid.
//     On ANY failure the payout stays 'pending_send' and Angela is
//     notified — the manual "txid <id> <txid>" command and the
//     "পাঠিয়েছি" button still work as fallback. GRAM stays manual.
//     Every completed payout posts a proof to @bazargoowithdraw
//     (amount + user + payout id + txid — NEVER the destination
//     address). Withdraws additionally need the withdraw gate:
//     joined @bazargoowithdraw + today's react stamp (task
//     'react_withdraw').
// Decision 13 is HALF DONE (ZERO payout address provided 2026-11-09:
// env.ZERO_PAYOUT_ADDRESS = t1atEkz24YDS4LDa5GeSQsnMxc7eF7CupWZ —
// Angela's separate payout wallet, fresh, balance 0). GRAM half still
// OPEN (TON receiving address + GRAM payout float):
// env.GRAM_RECEIVING_ADDRESS and env.GRAM_PAYOUT_FLOAT are empty
// placeholders until Angela provides them — every GRAM path fails
// CLOSED with a plain Bangla reason until then.
export const PROMOTE_PER_COMPLETION_USD = 0.02;
export const PROMOTE_MARGIN = 0.20; // ZERO packages: 20% margin (100 ZERO = 80 completions)
export const PROMOTE_MIN_BUDGET_ZERO = 100;
export const PROMOTE_MAX_BUDGET_ZERO = 625;
export const PROMOTE_MIN_BUDGET_USD = 2;
export const PROMOTE_MAX_BUDGET_USD = 10;
export const PROMOTE_PER_COMPLETION_ZERO = 1.25; // 100 ZERO / 80 completions
export const PROMOTE_REWARD_ZERO = 1;
export const DEPOSIT_MIN_STARS = 10;
export const DEPOSIT_MIN_GRAM = 0.5;
export const WITHDRAW_GRAM_MIN = 0.5;
export const WITHDRAW_ZERO_DAILY_CAP = 1000;
export const WITHDRAW_GRAM_DAILY_CAP = 5;
export const WITHDRAW_MANUAL_ABOVE_ZERO = 500;
export const WITHDRAW_MANUAL_ABOVE_GRAM = 2;
export const SPONSOR_DWELL_MS = 15 * 1000; // 15s dwell before a sponsor claim opens
export const STAR_USD = 0.013; // 1 Star = $0.013 (Fragment payout rate, for display only)

// ---------- v26: 4-spin redesign (replaces the v19 1/day strict spin) ----------
// 4 spins/day — 2 Monetag + 2 AdsGram slots. Every prize is claimed by
// watching ONE ad (Gram's model: "Watch a short ad to claim your spin
// reward"). The check-in gate stays; the streak 3+ and 3-task-types
// conditions are GONE. Prizes are rolled SERVER-side in /spin-start and
// credited only after a verified ad view (/monetag-postback with a
// spin-bound ymid, or /adsgram-confirm with a spin-bound nonce).
// '+1 free spin' (weight 5%) grants one extra spin the same day;
// daily max is 6 spins (4 base + max 2 extra). EV ≈ 2.02 ZERO/spin.
// Monitoring rule (plan §4.3): if weekly redeem count doubles vs the
// previous week, prize weights are lowered or a weekly spin cap is set
// — the counters live in zspinweek:<YYYY-Www> / zredeemweek:<YYYY-Www>.
const SPIN_BASE_PER_DAY = 4;
const SPIN_PER_NETWORK_PER_DAY = 2;
const SPIN_DAILY_MAX = 6;
const SPIN_PENDING_TTL_MS = 10 * 60 * 1000; // a rolled prize must be claimed within 10 min
export const SPIN_PRIZES = [
  { prize: 1, weight: 0.45 },
  { prize: 2, weight: 0.30 },
  { prize: 3, weight: 0.12 },
  { prize: 5, weight: 0.06 },
  { prize: 10, weight: 0.019 },
  { prize: 25, weight: 0.001 }, // jackpot
  { prize: 'extra', weight: 0.05 }, // +1 free spin
];
export function rollSpinPrize(rand) {
  const r = typeof rand === 'function' ? rand() : Math.random();
  let acc = 0;
  for (const p of SPIN_PRIZES) {
    acc += p.weight;
    if (r < acc) return p.prize;
  }
  return SPIN_PRIZES[0].prize;
}

// Leaderboard — Dhaka ISO week (Monday 00:00 to Sunday 23:59).
// Weekly totals live in zw:<uid>:<YYYY-Www>, incremented on every
// task-earning credit. Last week's top 3 can claim 50 / 30 / 20 ZERO
// during the following week only.
export const LEADERBOARD_PRIZES = [50, 30, 20];

// Monthly check-in bonus — 25 check-ins in one Dhaka calendar month
// auto-credits 50 ZERO on the 25th check-in, once per month.
const MONTHLY_TARGET = 25;
const MONTHLY_BONUS = 50;

// ZERO coupon — 100 ZERO buys a one-time 5% off shop coupon
// (code ZERO5-XXXXXX). Must NOT stack with BAZAR5: one coupon per
// order (enforced app-side; see plan.md).
const COUPON_PRICE_ZERO = 100;

export function dhakaMonthKey(now) {
  return dhakaDateStr(now).slice(0, 7);
}

export function prevMonthKey(month) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1;
  if (mo === 0) { y -= 1; mo = 12; }
  return y + '-' + String(mo).padStart(2, '0');
}

export function dhakaWeekKey(now) {
  // ISO week of the Dhaka wall-clock date (Monday = first day).
  // The Thursday of the ISO week fixes the ISO year; Jan 4 is always
  // in ISO week 1, so the first Thursday of the year anchors week 1.
  const d = new Date((now ? now.getTime() : Date.now()) + 6 * 60 * 60 * 1000);
  const isoDay = (d.getUTCDay() + 6) % 7; // Mon 0 ... Sun 6
  const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  th.setUTCDate(th.getUTCDate() - isoDay + 3);
  const year = th.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4IsoDay = (jan4.getUTCDay() + 6) % 7;
  const firstThu = new Date(Date.UTC(year, 0, 4 - jan4IsoDay));
  const week = 1 + Math.round((th.getTime() - firstThu.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return year + '-W' + String(week).padStart(2, '0');
}

function makeCouponCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  let s = '';
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'ZERO5-' + s;
}

// ZERO amounts may be fractional (commissions pay 3%/2%/1%). Every
// amount is rounded to 2 decimals on write so stored values stay
// clean; display trims trailing zeros ("10.50" -> "10.5", "10" -> "10").
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
export function fmtZero(n) {
  const v = round2(n);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2).replace(/0$/, '');
}
function parseNum(raw) {
  const n = parseFloat(raw || '0');
  return isFinite(n) ? n : 0;
}

async function getZeroBalance(env, userId) {
  return parseNum(await env.KV.get('zb:' + userId));
}

async function addZeroBalance(env, userId, delta) {
  const bal = round2((await getZeroBalance(env, userId)) + delta);
  await env.KV.put('zb:' + userId, String(bal));
  return bal;
}

// One entry of a user's ZERO transaction history (KV key zh:<uid>,
// newest first, capped at 50). type: task | commission |
// referral_bonus | redeem | purchase. amount is signed (credit +,
// spend -). source is the task id (or 'commission' / 'referral' /
// 'redeem' / 'purchase') so earning totals can group by source.
async function recordZeroHistory(env, userId, entry) {
  const list = (await kvGetJson(env, 'zh:' + userId)) || [];
  list.unshift({ ts: new Date().toISOString(), ...entry });
  await kvPutJson(env, 'zh:' + userId, list.slice(0, 50));
}

export async function getZeroHistory(env, userId, kind, lang) {
  const list = (await kvGetJson(env, 'zh:' + userId)) || [];
  if (kind === 'earning') {
    const entries = list.filter((e) => ['task', 'commission', 'referral_bonus', 'spin', 'monthly_bonus', 'prize'].includes(e.type));
    const totals = {};
    for (const e of entries) totals[e.source || 'other'] = round2((totals[e.source || 'other'] || 0) + e.amount);
    return { entries: entries.map((e) => translateHistoryNote(e, lang)), totals, balance: await getZeroBalance(env, userId) };
  }
  return { entries: list.map((e) => translateHistoryNote(e, lang)), balance: await getZeroBalance(env, userId) };
}

// Shared credit path for every earn: balance += amount, lifetime earned
// += amount, and (for a user's own task claim) tasks-completed += 1.
// Redeem never touches lifetime (it only spends the balance).
// hist (optional) records the movement: { type, source, note }.
async function creditEarned(env, userId, amount, countTask, hist) {
  const balance = await addZeroBalance(env, userId, amount);
  const lt = parseNum(await env.KV.get('zlt:' + userId));
  await env.KV.put('zlt:' + userId, String(round2(lt + amount)));
  if (countTask) {
    const tc = parseInt((await env.KV.get('ztc:' + userId)) || '0', 10) || 0;
    await env.KV.put('ztc:' + userId, String(tc + 1));
  }
  if (hist) {
    await recordZeroHistory(env, userId, {
      type: hist.type, amount: round2(amount), note: hist.note || '', source: hist.source || '',
      ...(hist.noteKey ? { noteKey: hist.noteKey, noteVars: hist.noteVars || {} } : {}),
    });
  }
  return balance;
}

// Pay the upline chain a % commission on one task earning. Called only
// from creditTaskEarning (never from the flat bonus, never from a
// commission credit itself — so commissions never compound). Each
// commission also adds to the referrer's referral-earnings total.
export async function payUplineCommissions(env, earnerId, amount, earnerName) {
  const referrer = await env.KV.get('zref:' + earnerId);
  if (!referrer || referrer === String(earnerId)) return;
  const seen = new Set([String(earnerId)]);
  let current = referrer;
  for (let level = 0; level < COMMISSION_RATES.length; level++) {
    if (!current || !Number(current) || seen.has(String(current))) break;
    seen.add(String(current));
    const commission = round2(amount * COMMISSION_RATES[level]);
    if (commission > 0) {
      await creditEarned(env, Number(current), commission, false, {
        type: 'commission', source: 'commission',
        note: t('history.commission_note', 'bn', { level, earnerName: earnerName || t('referrals.fallback_name', await getUserLang(env, Number(current))) }),
        noteKey: 'history.commission_note',
        noteVars: { level, earnerName: earnerName || null },
      });
      const re = parseNum(await env.KV.get('zrefearn:' + current));
      await env.KV.put('zrefearn:' + current, String(round2(re + commission)));
    }
    current = await env.KV.get('zref:' + current);
  }
}

// Task-earning credit: the earner's own reward (counts as a task) plus
// upline % commissions on that reward. Also feeds the weekly
// leaderboard total (zw:<uid>:<YYYY-Www>) AND the daily + monthly
// totals (zlb:<uid>:<YYYY-MM-DD> and zlb:<uid>:<YYYY-MM>) used by the
// religion-reward top-3 check. NOTE: zlb:<uid>:<YYYY-Www> is ALSO the
// weekly-prize-claimed marker — different suffix, so no clash.
// histType overrides the history entry type (default 'task') — spin
// and monthly-bonus credits are recorded under their own type but go
// through the same path.
async function creditTaskEarning(env, userId, amount, taskId, taskTitle, earnerName, histType) {
  const balance = await creditEarned(env, userId, amount, true, {
    type: histType || 'task', source: taskId, note: taskTitle || taskId,
  });
  const wk = 'zw:' + userId + ':' + dhakaWeekKey();
  const cur = parseNum(await env.KV.get(wk));
  await env.KV.put(wk, String(round2(cur + amount)));
  const day = 'zlb:' + userId + ':' + dhakaDateStr();
  const curDay = parseNum(await env.KV.get(day));
  await env.KV.put(day, String(round2(curDay + amount)));
  const mo = 'zlb:' + userId + ':' + dhakaMonthKey();
  const curMo = parseNum(await env.KV.get(mo));
  await env.KV.put(mo, String(round2(curMo + amount)));
  await payUplineCommissions(env, userId, amount, earnerName);
  return balance;
}

// Count this Dhaka month's check-ins from the dated claim keys
// (zt:<uid>:checkin:<YYYY-MM>-*). Used by the monthly bonus.
async function countMonthlyCheckins(env, userId, monthKey) {
  const list = await env.KV.list({ prefix: 'zt:' + userId + ':checkin:' + monthKey });
  return (list.keys || []).length;
}

// Distinct task types completed today (for the Lucky Spin unlock).
// check-in, quiz, react, ad (once, however many ads viewed), video
// (claimed within today), and each join channel claimed today.
async function countTasksToday(env, userId, today) {
  let n = 0;
  if (await env.KV.get('zt:' + userId + ':checkin:' + today)) n++;
  if (await env.KV.get('zt:' + userId + ':quiz:' + today)) n++;
  if (await env.KV.get('zt:' + userId + ':react:' + today)) n++;
  // v25: a Monetag view counts in the same 'ad' bucket as a Zerads
  // view — watching ads is ONE task type, whichever network served it,
  // so both networks together still count once for the spin unlock.
  const adViewedToday = parseInt((await env.KV.get('zt:' + userId + ':ad:' + today)) || '0', 10) > 0
    || parseInt((await env.KV.get('zt:' + userId + ':mtg:' + today)) || '0', 10) > 0;
  if (adViewedToday) n++;
  const videoLast = parseInt((await env.KV.get('zt:' + userId + ':video_last')) || '0', 10) || 0;
  if (videoLast && dhakaDateStr(new Date(videoLast)) === today) n++;
  for (const short of ['bazargoo', 'earnplaygame', 'cryptoguru', 'adsterratt']) {
    if (await env.KV.get('zt:' + userId + ':join:' + short + ':' + today)) n++;
  }
  return n;
}

// v26 Lucky Spin lock state: the only gates are today's check-in +
// all 4 channel joins (plan §11). The v19 streak 3+ and 3-task-types
// conditions are GONE — the price of every spin is one ad view.
async function getSpinLockState(env, userId, deviceOk) {
  const gates = await getGates(env, userId);
  const missing = [];
  if (!gates.checkin_done) missing.push('checkin_today');
  if (!gates.all_joined) missing.push('joins:' + gates.joins_done + '/4');
  if (deviceOk === false) missing.push('device_conflict');
  return { locked: missing.length > 0, missing, joins_done: gates.joins_done };
}

async function getLifetime(env, userId) {
  return parseNum(await env.KV.get('zlt:' + userId));
}

async function getTasksCompleted(env, userId) {
  return parseInt((await env.KV.get('ztc:' + userId)) || '0', 10) || 0;
}

async function getReferralCount(env, userId) {
  return parseInt((await env.KV.get('zrc:' + userId)) || '0', 10) || 0;
}

async function getReferralsByLevel(env, userId) {
  const l1 = parseInt((await env.KV.get('zrc1:' + userId)) || '0', 10) || 0;
  const l2 = parseInt((await env.KV.get('zrc2:' + userId)) || '0', 10) || 0;
  const l3 = parseInt((await env.KV.get('zrc3:' + userId)) || '0', 10) || 0;
  return { l1, l2, l3 };
}

async function getReferralEarnings(env, userId) {
  return parseNum(await env.KV.get('zrefearn:' + userId));
}

// Direct-referral list (KV key zdown:<referrer> — JSON array of user
// ids). Levels 2/3 are derived by walking these lists.
async function addToDownline(env, referrerId, userId) {
  const list = (await kvGetJson(env, 'zdown:' + referrerId)) || [];
  if (!list.includes(Number(userId)) && !list.includes(String(userId))) {
    list.push(Number(userId));
    await kvPutJson(env, 'zdown:' + referrerId, list);
  }
}

// The user's downline for the Friend menu: each entry { user_id, name,
// level (1/2/3), joined (Dhaka date), lifetime }. Name/joined fall back
// when the referred user never started via a ref link (legacy).
export async function getReferrals(env, userId, lang) {
  const out = [];
  const seen = new Set();
  async function collect(ids, level) {
    for (const raw of ids) {
      const uid = Number(raw);
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const name = (await env.KV.get('zrefname:' + uid)) || null;
      const joined = (await env.KV.get('zrefdate:' + uid)) || null;
      out.push({ user_id: uid, name: name || t('referrals.fallback_name', lang), level, joined, lifetime: parseNum(await env.KV.get('zlt:' + uid)) });
    }
  }
  const l1 = (await kvGetJson(env, 'zdown:' + userId)) || [];
  await collect(l1, 1);
  const l2ids = [];
  for (const uid of l1) l2ids.push(...((await kvGetJson(env, 'zdown:' + uid)) || []));
  await collect(l2ids, 2);
  const l3ids = [];
  for (const uid of l2ids) l3ids.push(...((await kvGetJson(env, 'zdown:' + uid)) || []));
  await collect(l3ids, 3);
  return { referral_earnings: await getReferralEarnings(env, userId), referrals: out };
}

// ---------- v19: Leaderboard (weekly) ----------

// Weekly leaderboard from the zw:<uid>:<YYYY-Www> totals. Returns the
// current week's top 10 + the caller's rank, and last week's top 3
// with the prize state (claimable only during the following week).
export async function getLeaderboardData(env, userId, lang) {
  const week = dhakaWeekKey();
  const lastWeek = dhakaWeekKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const list = await env.KV.list({ prefix: 'zw:' });
  const cur = [];
  const last = [];
  for (const k of list.keys || []) {
    const m = /^zw:(\d+):(\d{4}-W\d{2})$/.exec(k.name);
    if (!m) continue;
    const uid = Number(m[1]);
    const val = parseNum(await env.KV.get(k.name));
    if (m[2] === week) cur.push({ user_id: uid, weekly_earned: val });
    else if (m[2] === lastWeek) last.push({ user_id: uid, weekly_earned: val });
  }
  async function enrich(rows) {
    rows.sort((a, b) => b.weekly_earned - a.weekly_earned);
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = (await env.KV.get('zname:' + r.user_id)) || (await env.KV.get('zrefname:' + r.user_id)) || t('leaderboard.fallback_name', lang);
      const lifetime = parseNum(await env.KV.get('zlt:' + r.user_id));
      out.push({ rank: i + 1, user_id: r.user_id, name, weekly_earned: r.weekly_earned, level: levelFor(lifetime).level });
    }
    return out;
  }
  const fullCur = await enrich(cur);
  const fullLast = await enrich(last);
  const myCur = fullCur.find((r) => r.user_id === userId);
  const myLast = fullLast.find((r) => r.user_id === userId);
  const myLastRank = myLast ? myLast.rank : null;
  const claimed = myLastRank && myLastRank <= 3 ? !!(await env.KV.get('zlb:' + userId + ':' + lastWeek)) : false;
  return {
    week,
    top10: fullCur.slice(0, 10),
    my_rank: myCur ? myCur.rank : null,
    my_weekly_earned: myCur ? myCur.weekly_earned : 0,
    last_week: lastWeek,
    last_week_top3: fullLast.slice(0, 3),
    my_last_week_rank: myLastRank,
    prize_claimable: !!(myLastRank && myLastRank <= 3 && !claimed),
    my_prize: myLastRank && myLastRank <= 3 ? LEADERBOARD_PRIZES[myLastRank - 1] : 0,
    prize_claimed: !!claimed,
  };
}

async function handleLeaderboardPrizeClaim(env, userId, body) {
  const device = await checkDevice(env, userId, body && body.device_id);
  if (!device.ok) return { ok: false, reason: 'device_conflict' };
  // v26: prize claims need all 4 channel joins (plan §11) — checked
  // live, never from a cache.
  const gates = await getGates(env, userId);
  if (!gates.all_joined) return { ok: false, reason: 'joins_required', joins_done: gates.joins_done };
  const data = await getLeaderboardData(env, userId);
  const week = String((body && body.week) || '') || data.last_week;
  if (week < data.last_week) return { ok: false, reason: 'expired', week };
  if (week !== data.last_week) return { ok: false, reason: 'not_top3', week };
  const rank = data.my_last_week_rank;
  if (!rank || rank > 3) return { ok: false, reason: 'not_top3', week };
  if (await env.KV.get('zlb:' + userId + ':' + week)) return { ok: false, reason: 'already_claimed', week };
  const prize = LEADERBOARD_PRIZES[rank - 1];
  await env.KV.put('zlb:' + userId + ':' + week, '1');
  const balance = await creditEarned(env, userId, prize, false, {
    type: 'prize', source: 'leaderboard',
    note: t('claim.leaderboard_prize_note', 'bn', { week, rank }),
    noteKey: 'claim.leaderboard_prize_note', noteVars: { week, rank },
  });
  return { ok: true, balance, credited: prize, rank, week };
}

// ---------- v23: Religion reward PDFs (top performers) ----------

// Religion PDFs (reward_only in the catalog) are NOT for sale — they
// are free for users in the TOP 3 of today's daily, this week's weekly
// or this month's monthly earning totals. Daily/monthly totals live in
// zlb:<uid>:<YYYY-MM-DD> / zlb:<uid>:<YYYY-MM> (written by
// creditTaskEarning); weekly comes from getLeaderboardData. Claimed
// PDFs are stamped in zrel:<uid>:<id> (one claim per PDF per user).
const RELIGION_PDFS = ['rel-fatiha', 'rel-ikhlas', 'rel-falaq-nas', 'rel-istighfar'];

// Rank (1-based) of one user inside one totals period, or null when
// the user earned nothing in that period. re must match exactly the
// key shape for that period (daily YYYY-MM-DD vs monthly YYYY-MM vs
// the weekly prize marker YYYY-Www — the shapes never overlap).
async function rankInTotals(env, userId, suffix, re) {
  const list = await env.KV.list({ prefix: 'zlb:' });
  const rows = [];
  for (const k of list.keys || []) {
    const m = re.exec(k.name);
    if (!m || m[2] !== suffix) continue;
    rows.push({ user_id: Number(m[1]), earned: parseNum(await env.KV.get(k.name)) });
  }
  rows.sort((a, b) => b.earned - a.earned);
  const i = rows.findIndex((r) => r.user_id === userId);
  return i === -1 ? null : i + 1;
}

export async function getReligionData(env, userId, lang) {
  const dailyRank = await rankInTotals(env, userId, dhakaDateStr(), /^zlb:(\d+):(\d{4}-\d{2}-\d{2})$/);
  const monthlyRank = await rankInTotals(env, userId, dhakaMonthKey(), /^zlb:(\d+):(\d{4}-\d{2})$/);
  const lb = await getLeaderboardData(env, userId, lang);
  const weeklyRank = lb.my_rank;
  const eligible = [dailyRank, weeklyRank, monthlyRank].some((r) => r && r <= 3);
  const pdfs = [];
  for (const id of RELIGION_PDFS) {
    const p = catalogGet(id);
    pdfs.push({
      id,
      title: p ? pdfTitle(p, lang) : id,
      claimed: !!(await env.KV.get('zrel:' + userId + ':' + id)),
    });
  }
  return { eligible, ranks: { daily: dailyRank, weekly: weeklyRank, monthly: monthlyRank }, pdfs };
}

async function handleReligionPdfClaim(env, userId, body) {
  const device = await checkDevice(env, userId, body && body.device_id);
  if (!device.ok) return { ok: false, reason: 'device_conflict' };
  const itemId = String((body && body.item_id) || '');
  const item = catalogGet(itemId);
  if (!item || !item.reward_only) return { ok: false, reason: 'not_reward_pdf' };
  const data = await getReligionData(env, userId);
  if (!data.eligible) return { ok: false, reason: 'not_top_performer' };
  if (await env.KV.get('zrel:' + userId + ':' + itemId)) return { ok: false, reason: 'already_claimed' };
  await env.KV.put('zrel:' + userId + ':' + itemId, '1');
  const sale = {
    sale_id: makeSaleId(),
    user_id: userId,
    username: null,
    item_id: item.id,
    item_type: 'pdf',
    currency: 'ZERO',
    amount: 0,
    status: 'paid',
    telegram_payment_charge_id: null,
    txid: null,
    source: 'reward',
    created_at: new Date().toISOString(),
  };
  // Quiet delivery: a reward is not a sale, so the "PDF বিক্রি হয়েছে"
  // alert is skipped; the admin gets a reward-specific message instead.
  // If the PDF file is not registered yet, the sale stays
  // paid_waiting_file and is delivered automatically once the admin
  // registers it (deliverWaitingSalesForPdf covers SALE- ids).
  const res = await deliverPdf(env, sale, { quiet: true });
  await tgSend(env, ADMIN_ID,
    '🎁 ধর্মীয় বইয়ের পুরস্কার দেওয়া হয়েছে!\nPDF: ' + item.title + ' (' + item.id + ')\nবিজয়ী id: ' + userId +
    '\nর‍্যাংক — আজ: ' + (data.ranks.daily || '-') + ', সপ্তাহ: ' + (data.ranks.weekly || '-') + ', মাস: ' + (data.ranks.monthly || '-') +
    '\nবিক্রি ID: ' + sale.sale_id);
  return { ok: true, delivered: res.delivered, sale_id: sale.sale_id, item_id: item.id };
}

// ---------- v19: Referral contest (monthly) ----------

// This month's top referrers by PAID direct (L1) referral count, and
// last month's winner. Ties are broken by who reached the count
// FIRST (earliest zrefmt:<uid>:<month> wins). The winner may claim
// one free PDF of their choice during the following month only.
export async function getContestData(env, userId, lang) {
  const month = dhakaMonthKey();
  const lastMonth = prevMonthKey(month);
  const list = await env.KV.list({ prefix: 'zrefm:' });
  const cur = [];
  const last = [];
  for (const k of list.keys || []) {
    const m = /^zrefm:(\d+):(\d{4}-\d{2})$/.exec(k.name);
    if (!m) continue;
    const uid = Number(m[1]);
    const count = parseInt((await env.KV.get(k.name)) || '0', 10) || 0;
    const reachedAt = parseInt((await env.KV.get('zrefmt:' + uid + ':' + m[2])) || '0', 10) || 0;
    const row = { user_id: uid, referrals: count, reached_at: reachedAt };
    if (m[2] === month) cur.push(row);
    else if (m[2] === lastMonth) last.push(row);
  }
  function sortRows(rows) {
    // Most referrals first; on a tie, whoever reached the count first wins.
    rows.sort((a, b) => (b.referrals - a.referrals) || (a.reached_at - b.reached_at));
    return rows;
  }
  async function enrich(rows) {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const name = (await env.KV.get('zname:' + r.user_id)) || (await env.KV.get('zrefname:' + r.user_id)) || t('contest.fallback_name', lang);
      out.push({ rank: i + 1, user_id: r.user_id, name, referrals: r.referrals });
    }
    return out;
  }
  const curSorted = sortRows(cur);
  const lastSorted = sortRows(last);
  const top5 = (await enrich(curSorted)).slice(0, 5);
  const lastTop = await enrich(lastSorted);
  const winner = lastTop.length ? lastTop[0] : null;
  const myCur = curSorted.find((r) => r.user_id === userId);
  const amWinner = !!winner && winner.user_id === userId;
  return {
    month,
    top5,
    last_month: {
      month: lastMonth,
      winner: winner ? { user_id: winner.user_id, name: winner.name, referrals: winner.referrals } : null,
    },
    am_i_winner: amWinner,
    prize_claimed: amWinner ? !!(await env.KV.get('zcontest:' + userId + ':' + lastMonth)) : false,
    my_referrals: myCur ? myCur.referrals : 0,
  };
}

async function handleContestPrizeClaim(env, userId, body) {
  const device = await checkDevice(env, userId, body && body.device_id);
  if (!device.ok) return { ok: false, reason: 'device_conflict' };
  // v26: prize claims need all 4 channel joins (plan §11) — checked
  // live, never from a cache.
  const gates = await getGates(env, userId);
  if (!gates.all_joined) return { ok: false, reason: 'joins_required', joins_done: gates.joins_done };
  const itemId = String((body && body.item_id) || '');
  const item = catalogGet(itemId);
  if (!item || item.free) return { ok: false, reason: 'invalid_item' };
  const contest = await getContestData(env, userId);
  if (!contest.am_i_winner) return { ok: false, reason: 'not_winner' };
  if (contest.prize_claimed) return { ok: false, reason: 'already_claimed' };
  const contestMonth = contest.last_month.month;
  await env.KV.put('zcontest:' + userId + ':' + contestMonth, '1');
  const sale = {
    sale_id: makeSaleId(),
    user_id: userId,
    username: null,
    item_id: item.id,
    item_type: 'pdf',
    currency: 'ZERO',
    amount: 0,
    status: 'paid',
    telegram_payment_charge_id: null,
    txid: null,
    source: 'contest',
    created_at: new Date().toISOString(),
  };
  // Quiet delivery: the Stars/ZERO sale alert would wrongly call a
  // prize a "sale", so deliverPdf skips it and the admin gets a
  // contest-specific message instead. If the PDF file is not
  // registered yet, the sale stays paid_waiting_file and is delivered
  // automatically once the admin registers it.
  const res = await deliverPdf(env, sale, { quiet: true });
  await tgSend(env, ADMIN_ID,
    '🎁 রেফারেল প্রতিযোগিতার পুরস্কার দেওয়া হয়েছে!\nPDF: ' + item.title + ' (' + item.id + ')\nবিজয়ী id: ' + userId +
    '\nমাস: ' + contestMonth + '\nবিক্রি ID: ' + sale.sale_id);
  return { ok: true, delivered: res.delivered, sale_id: sale.sale_id, item_id: item.id };
}

// ---------- v19: ZERO coupon (100 ZERO = one-time 5% off) ----------

async function handleCouponRedeem(env, userId) {
  const balance = await getZeroBalance(env, userId);
  if (balance < COUPON_PRICE_ZERO) return { ok: false, reason: 'insufficient_balance', balance };
  let code = makeCouponCode();
  let guard = 0;
  while (await env.KV.get('zcoupon:' + code)) {
    code = makeCouponCode();
    if (++guard > 5) return { ok: false, reason: 'retry' };
  }
  const newBalance = await addZeroBalance(env, userId, -COUPON_PRICE_ZERO);
  await kvPutJson(env, 'zcoupon:' + code, {
    user_id: userId, code, used: false, created_at: new Date().toISOString(),
  });
  await recordZeroHistory(env, userId, {
    type: 'redeem', amount: -COUPON_PRICE_ZERO, source: 'coupon',
    note: t('history.coupon_redeem_note', 'bn', { code }),
    noteKey: 'history.coupon_redeem_note', noteVars: { code },
  });
  return { ok: true, balance: newBalance, code, item_id: 'coupon_5pct' };
}

async function listUserCoupons(env, userId) {
  const list = await env.KV.list({ prefix: 'zcoupon:' });
  const out = [];
  for (const k of list.keys || []) {
    const c = await kvGetJson(env, k.name);
    if (c && c.user_id === userId) {
      out.push({ code: c.code, used: !!c.used, created_at: c.created_at || null, used_at: c.used_at || null });
    }
  }
  out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return out;
}

async function verifyCoupon(env, code, userId) {
  const c = await kvGetJson(env, 'zcoupon:' + String(code || '').trim().toUpperCase());
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.user_id !== userId) return { ok: false, reason: 'not_yours' };
  if (c.used) return { ok: false, reason: 'already_used' };
  return { ok: true, valid: true, code: c.code };
}

async function useCoupon(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const lang = await apiLang(env, userId, body && body.lang);
  const code = String((body && body.code) || '').trim().toUpperCase();
  if (!userId) return { ok: false, reason: 'no_user' };
  const c = await kvGetJson(env, 'zcoupon:' + code);
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.user_id !== userId) return { ok: false, reason: 'not_yours' };
  if (c.used) return { ok: false, reason: 'already_used' };
  c.used = true;
  c.used_at = new Date().toISOString();
  await kvPutJson(env, 'zcoupon:' + code, c);
  return {
    ok: true, code,
    note: t('coupon.use_note', lang),
  };
}

// One mobile = one account. The app sends a persistent device id
// (localStorage UUID). The first user on a device binds it; a different
// user on the same device gets device_conflict and is blocked from
// earning claims (shopping / PDF buying still work). The binding is
// recorded, never overwritten. A deterrent, not a guarantee: clearing
// app data resets the device id.
async function checkDevice(env, userId, deviceId) {
  if (!deviceId || typeof deviceId !== 'string') return { ok: true };
  const dev = String(deviceId).slice(0, 64);
  if (!dev) return { ok: true };
  const bound = await env.KV.get('zdev:' + dev);
  if (bound && bound !== String(userId)) return { ok: false, reason: 'device_conflict' };
  if (!bound) {
    await env.KV.put('zdev:' + dev, String(userId));
    if (!(await env.KV.get('zdevu:' + userId))) await env.KV.put('zdevu:' + userId, dev);
  }
  return { ok: true };
}

// Level is display-only: 1 + floor(lifetime / 50). It unlocks nothing yet.
export function levelFor(lifetime) {
  const lt = Math.max(0, lifetime || 0);
  return { level: 1 + Math.floor(lt / 50), xp: lt % 50, xp_next: 50, progress: (lt % 50) / 50 };
}

export async function getProfile(env, userId, displayName, lang) {
  const lifetime = await getLifetime(env, userId);
  const lvl = levelFor(lifetime);
  return {
    name: displayName || t('profile.default_name', lang),
    balance: await getZeroBalance(env, userId),
    lifetime_earned: lifetime,
    level: lvl.level,
    xp: lvl.xp,
    xp_next: lvl.xp_next,
    progress: lvl.progress,
    tasks_completed: await getTasksCompleted(env, userId),
    referrals: await getReferralCount(env, userId),
    referrals_by_level: await getReferralsByLevel(env, userId),
    referral_earnings: await getReferralEarnings(env, userId),
    join_date: (await env.KV.get('zjoined:' + userId)) || null,
  };
}

export function msUntilDhakaMidnight(now) {
  // Milliseconds until the next Dhaka 00:00 (fixed UTC+6 offset).
  const t = now ? now.getTime() : Date.now();
  const shifted = new Date(t + 6 * 60 * 60 * 1000);
  const nextMidnight = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1);
  return Math.max(0, nextMidnight - shifted.getTime());
}

// Daily Reward strip position in the 7-day cycle (v20, Pickaxe-style):
// streak 0 -> day 1 is today; claimed today -> the streak's day in this
// cycle (7, not 0, when the streak is a multiple of 7); not claimed
// yet today -> the next day (a fresh cycle starts after day 7).
export function dailyRewardPosition(streak, claimedToday) {
  if (!streak || streak < 1) return 1;
  if (claimedToday) return streak % 7 === 0 ? 7 : streak % 7;
  return (streak % 7) + 1;
}

// Daily Reward state for /tasks (v20): the 7-day strip with which days
// of this cycle are already claimed, which day is today, and ms until
// the next check-in opens (Dhaka midnight). Additive — the legacy
// `streak` block is untouched.
async function getDailyRewardState(env, userId) {
  const today = dhakaDateStr();
  const streak = parseInt((await env.KV.get('zs:' + userId)) || '0', 10) || 0;
  const last = (await env.KV.get('zl:' + userId + ':lastcheckin')) || null;
  const claimedToday = !!(await env.KV.get('zt:' + userId + ':checkin:' + today));
  let nextStreak;
  if (claimedToday) nextStreak = Math.max(streak, 1);
  else if (last === prevDhakaDate(today)) nextStreak = streak + 1;
  else nextStreak = 1;
  const position = dailyRewardPosition(streak, claimedToday);
  const days = STREAK_REWARDS.map((r, i) => ({
    day: i + 1, reward: r, claimed: i + 1 < position, is_today: i + 1 === position,
  }));
  return {
    streak,
    claimed_today: claimedToday,
    today_reward: streakReward(nextStreak),
    next_in_ms: msUntilDhakaMidnight(),
    days,
  };
}

// Streak state for /tasks: current streak, what today pays, and the
// 7-day strip (which days of the current 7-day cycle are done).
async function getStreakState(env, userId) {
  const today = dhakaDateStr();
  const streak = parseInt((await env.KV.get('zs:' + userId)) || '0', 10) || 0;
  const last = (await env.KV.get('zl:' + userId + ':lastcheckin')) || null;
  const claimedToday = !!(await env.KV.get('zt:' + userId + ':checkin:' + today));
  // What claiming now would pay: if today is already claimed, the reward
  // of the day just completed; if yesterday was claimed, the next day of
  // the streak; otherwise a fresh Day 1.
  let nextStreak;
  if (claimedToday) nextStreak = Math.max(streak, 1);
  else if (last === prevDhakaDate(today)) nextStreak = streak + 1;
  else nextStreak = 1;
  const cyclePos = streak === 0 ? 0 : ((streak - 1) % 7) + 1;
  const days = STREAK_REWARDS.map((r, i) => ({ day: i + 1, reward: r, done: i < cyclePos }));
  return {
    current: streak,
    claimed_today: claimedToday,
    today_reward: streakReward(nextStreak),
    days,
  };
}

async function isChannelMember(env, channel, userId) {
  const res = await tgCall(env, 'getChatMember', { chat_id: channel, user_id: userId });
  if (!res || !res.ok || !res.result) return false;
  const s = res.result.status;
  return s === 'member' || s === 'administrator' || s === 'creator';
}

// ---------- v26: Wallet balances (separate from the earnings ledger) ----------
// Earnings live in zb:<uid> (task/spin rewards). Wallet balances live
// in zwb:<uid>:<currency> and hold DEPOSITS + funds the user chose to
// SAVE there (the ZERO dual-option: instant pay/payout OR wallet save).
// A wallet balance is dual-purpose: buy (promote / PDF) OR withdraw
// anytime, subject to the min/cap/solvency rules — never locked.
async function getWalletBalance(env, userId, currency) {
  return parseNum(await env.KV.get('zwb:' + userId + ':' + currency));
}

async function addWalletBalance(env, userId, currency, delta) {
  const bal = round2((await getWalletBalance(env, userId, currency)) + delta);
  await env.KV.put('zwb:' + userId + ':' + currency, String(bal));
  return bal;
}

// ---------- v26: joins/react/check-in gates (plan §11) ----------
// Spin + leaderboard prize + withdraw need ALL 4 channel joins
// (verified live via getChatMember — the bot is admin in all 4).
// React is click-only (the Bot API cannot verify a channel reaction),
// check-in is today's claim stamp. Live membership is cached 10
// minutes per user so /tasks does not hit Telegram 4 times per load.
const GATE_CHANNELS = {
  bazargoo: '@bazargoo287',
  earnplaygame: '@earnplaygame21',
  cryptoguru: '@cryptoguru_247',
  adsterratt: '@adsterratt',
};

export async function getGates(env, userId) {
  // Membership is checked LIVE on every call (4 Telegram API calls).
  // An earlier 10-minute cache was removed: a user who just joined in
  // Telegram must see the gate open immediately, and /tasks, spin and
  // withdraw must never disagree about membership. Telegram's limits
  // make 4 calls per /tasks load trivial.
  const joins = {};
  for (const short of Object.keys(GATE_CHANNELS)) {
    joins[short] = await isChannelMember(env, GATE_CHANNELS[short], userId);
  }
  const today = dhakaDateStr();
  const gates = {
    joins,
    joins_done: Object.values(joins).filter(Boolean).length,
    joins_total: 4,
    react_done: !!(await env.KV.get('zt:' + userId + ':react:' + today)),
    checkin_done: !!(await env.KV.get('zt:' + userId + ':checkin:' + today)),
  };
  gates.complete = gates.joins_done + (gates.react_done ? 1 : 0) + (gates.checkin_done ? 1 : 0);
  gates.total = 6;
  gates.all_joined = gates.joins_done === 4;
  return gates;
}

// ---------- v26: TON price (CoinGecko, cached 10 min) + GRAM verify (tonapi) ----------
// The GRAM amount of every payment is fixed from the LIVE rate at
// payment time. If CoinGecko is unreachable, GRAM pricing fails closed
// ('rate_unavailable') — a stored or guessed rate is never used.
export async function tonPriceUsd(env) {
  const cached = await kvGetJson(env, 'zrate:ton');
  if (cached && cached.price > 0 && Date.now() - cached.ts < 10 * 60 * 1000) return cached.price;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
    const j = await res.json();
    const price = j && j['the-open-network'] && Number(j['the-open-network'].usd);
    if (price > 0) {
      await kvPutJson(env, 'zrate:ton', { price, ts: Date.now() });
      return price;
    }
  } catch (e) { /* fall through to null — caller fails closed */ }
  return null;
}

// Verify a GRAM payment against tonapi.io (public, no key needed —
// verified live 2026-11-09). Matches the tx hash, the destination
// (our TON receiving address), the amount (>= expected GRAM) and
// success=true. Returns { ok, paid (GRAM), from } or { ok:false, reason }.
export async function verifyGramTx(env, address, hash, minGram) {
  try {
    const res = await fetch('https://tonapi.io/v2/blockchain/accounts/' + encodeURIComponent(address) + '/transactions?limit=20');
    const j = await res.json();
    const txs = (j && j.transactions) || [];
    for (const tx of txs) {
      if (String(tx.hash || '') !== String(hash)) continue;
      if (tx.success === false) return { ok: false, reason: 'failed' };
      const msg = tx.in_msg || {};
      const dest = msg.destination && (msg.destination.address || msg.destination);
      if (String(dest || '') !== String(address)) continue;
      const paid = Number(msg.value || 0) / 1e9;
      if (paid + 1e-9 < minGram) return { ok: false, reason: 'insufficient', paid };
      const src = msg.source && (msg.source.address || msg.source);
      return { ok: true, paid, from: src ? String(src) : null };
    }
    return { ok: false, reason: 'not_found' };
  } catch (e) {
    return { ok: false, reason: 'api_error' };
  }
}

// ---------- v26: Promote pricing (calculated, plan §4.4) ----------
export function promoteCompletionsForZero(budgetZero) {
  // 1 ZERO per completion goes to the completer; 20% margin stays with
  // the shop. 100 ZERO = 80 completions, 625 ZERO = 500 completions.
  return Math.floor((Number(budgetZero) || 0) * (1 - PROMOTE_MARGIN) / PROMOTE_REWARD_ZERO);
}

export function promoteCompletionsForUsd(budgetUsd) {
  // $0.02 per completion; only 60% of the budget funds completions —
  // a 40% margin buffer, so that even with system losses (invalid
  // clicks, rate swings) Angela never loses (Angela 2026-11-09
  // ~23:14: $10 = 300 completions; $6.00 goes to completers, $4.00
  // stays with her). The minimum package is unchanged ($2 = 80
  // completions, 20% margin), so the result never drops below 80.
  // Exact integer math (plain floats give 269.999... for $9): work in
  // cents — $0.02 = 2 cents per completion, 60% = 3/5, so completions
  // = floor(budgetCents * 3 / 10).
  const cents = Math.round((Number(budgetUsd) || 0) * 100);
  const raw = Math.floor((cents * 3) / 10);
  return Math.max(80, raw);
}

// Completer reward for a GRAM promo, in GRAM (3 decimals): $0.02 at the
// payment-time TON rate (e.g. 0.019 GRAM at $1.045).
export function gramRewardPerCompletion(tonPrice) {
  if (!tonPrice || tonPrice <= 0) return 0;
  return Math.round((PROMOTE_PER_COMPLETION_USD / tonPrice) * 1000) / 1000;
}

// ---------- v26: 4-spin slot accounting ----------
// Base slots: 2 Monetag + 2 AdsGram per Dhaka day. Extra spins come
// only from winning '+1 free spin' (max 2 extra/day, 6 total). Counts
// increment ONLY when a prize is credited (a rolled-but-unclaimed spin
// never burns a slot — no-fill never costs a spin, plan §6).
async function getSpinCounts(env, userId) {
  const today = dhakaDateStr();
  const mtg = parseInt((await env.KV.get('zt:' + userId + ':spin_mtg:' + today)) || '0', 10) || 0;
  const ads = parseInt((await env.KV.get('zt:' + userId + ':spin_ads:' + today)) || '0', 10) || 0;
  const total = parseInt((await env.KV.get('zt:' + userId + ':spin:' + today)) || '0', 10) || 0;
  const extraEarned = parseInt((await env.KV.get('zt:' + userId + ':spin_extra_earned:' + today)) || '0', 10) || 0;
  const extraUsed = Math.max(0, total - (mtg + ads));
  return { today, mtg, ads, total, base_used: mtg + ads, extra_earned: extraEarned, extra_used: extraUsed };
}

export function spinSlotsLeft(counts) {
  const baseLeft = Math.max(0, SPIN_BASE_PER_DAY - counts.base_used);
  const extraLeft = Math.max(0, Math.min(2, counts.extra_earned) - counts.extra_used);
  return {
    total: Math.min(baseLeft + extraLeft, SPIN_DAILY_MAX - counts.total),
    monetag: Math.max(0, SPIN_PER_NETWORK_PER_DAY - counts.mtg),
    adsgram: Math.max(0, SPIN_PER_NETWORK_PER_DAY - counts.ads),
    extra: extraLeft,
    base_left: baseLeft,
  };
}

function makePromoId(now) {
  const ds = dhakaDateStr(now).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'PR-' + ds + '-' + s;
}

function makePayoutId(now) {
  const ds = dhakaDateStr(now).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'PO-' + ds + '-' + s;
}

function makeSpinId(userId) {
  return 'spin-' + userId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function isZeroAddress(addr) {
  return /^t1[0-9A-Za-z]{33}$/.test(String(addr || '').trim());
}

function isTonAddress(addr) {
  const a = String(addr || '').trim();
  // TON user-friendly addresses are 48 chars (EQ… / UQ…), raw form is
  // "0:" + 64 hex. Either is accepted; the payout is manual anyway.
  return /^[EU]Q[A-Za-z0-9_-]{46}$/.test(a) || /^0:[0-9a-fA-F]{64}$/.test(a);
}

export async function getTasksState(env, userId, displayName, deviceId, lang) {
  const today = dhakaDateStr();
  // First sight: record the join date and the display name (used by the
  // Friend menu's referral list).
  if (!(await env.KV.get('zjoined:' + userId))) await env.KV.put('zjoined:' + userId, new Date().toISOString());
  if (displayName && !(await env.KV.get('zrefname:' + userId))) await env.KV.put('zrefname:' + userId, displayName);
  // Display name for the leaderboard / contest lists — updated whenever
  // the app passes a name, so the lists stay current.
  if (displayName) await env.KV.put('zname:' + userId, displayName);
  const device = await checkDevice(env, userId, deviceId);
  const balance = await getZeroBalance(env, userId);
  const checkinDone = !!(await env.KV.get('zt:' + userId + ':checkin:' + today));
  const quizDone = !!(await env.KV.get('zt:' + userId + ':quiz:' + today));
  const joinBazargooDone = !!(await env.KV.get('zt:' + userId + ':join:bazargoo'));
  const joinEarnDone = !!(await env.KV.get('zt:' + userId + ':join:earnplaygame'));
  const joinCryptoDone = !!(await env.KV.get('zt:' + userId + ':join:cryptoguru'));
  const joinAdsDone = !!(await env.KV.get('zt:' + userId + ':join:adsterratt'));
  const reactDone = !!(await env.KV.get('zt:' + userId + ':react:' + today));
  const reactWithdrawDone = !!(await env.KV.get('zt:' + userId + ':react_withdraw:' + today));
  const adClaims = parseInt((await env.KV.get('zt:' + userId + ':ad:' + today)) || '0', 10) || 0;
  // v25: Monetag views today + ms until the 30s cooldown ends.
  const mtgClaims = parseInt((await env.KV.get('zt:' + userId + ':mtg:' + today)) || '0', 10) || 0;
  const mtgLast = parseInt((await env.KV.get('zt:' + userId + ':mtg_last')) || '0', 10) || 0;
  const mtgCooldownMs = mtgLast ? Math.max(0, mtgLast + MONETAG_COOLDOWN_MS - Date.now()) : 0;
  // Video: rolling 24h cooldown from the last claim timestamp.
  const videoLast = parseInt((await env.KV.get('zt:' + userId + ':video_last')) || '0', 10) || 0;
  const videoAvailableInMs = videoLast ? Math.max(0, videoLast + VIDEO_COOLDOWN_MS - Date.now()) : 0;
  // v22: visit tasks — rolling 24h cooldown per task, same model.
  const visitAvail = {};
  for (const t of TASK_DEFS) {
    if (t.group !== 'visit') continue;
    const last = parseInt((await env.KV.get('zt:' + userId + ':visit_last:' + t.id)) || '0', 10) || 0;
    visitAvail[t.id] = last ? Math.max(0, last + VISIT_COOLDOWN_MS - Date.now()) : 0;
  }
  // v26: spin slots — 2 Monetag + 2 AdsGram base + up to 2 extra
  // (from '+1 free spin' wins). Done only when no slot is left today.
  const spinCounts = await getSpinCounts(env, userId);
  const spinSlots = spinSlotsLeft(spinCounts);
  const spinDone = spinSlots.total === 0;
  const doneMap = {
    checkin: checkinDone,
    join_bazargoo: joinBazargooDone,
    join_earnplaygame: joinEarnDone,
    join_cryptoguru: joinCryptoDone,
    join_adsterratt: joinAdsDone,
    referral: false,
    ad: adClaims >= AD_DAILY_LIMIT,
    ad_monetag: mtgClaims >= MONETAG_DAILY_LIMIT,
    quiz: quizDone,
    react_daily: reactDone,
    react_withdraw: reactWithdrawDone,
    video_daily: videoAvailableInMs > 0,
    spin_daily: spinDone,
  };
  for (const id of Object.keys(visitAvail)) doneMap[id] = visitAvail[id] > 0;
  const streak = await getStreakState(env, userId);
  const dailyReward = await getDailyRewardState(env, userId);
  const resetsInMs = msUntilDhakaMidnight();
  const tasks = TASK_DEFS.map((task) => {
    const i18n = TASK_I18N[task.id];
    const out = {
      id: task.id,
      title: i18n && i18n.title ? t(i18n.title, lang, {}, task.title) : task.title,
      reward: task.reward,
      desc: i18n && i18n.desc ? t(i18n.desc, lang, {}, task.desc) : task.desc,
      done: !!doneMap[task.id],
    };
    if (task.id === 'checkin') out.reward = streak.today_reward;
    if (task.id === 'video_daily') out.available_in_ms = videoAvailableInMs;
    // v22: visit tasks carry their URL + group so the app can open
    // them, and the remaining cooldown like video_daily.
    if (task.group === 'visit') {
      out.available_in_ms = visitAvail[task.id] || 0;
      out.url = task.url;
      out.group = 'visit';
    }
    // v27: the withdraw-gate task carries its URL (the pinned post)
    // + group so the app can open it from the Tasks list too.
    if (task.group === 'withdraw_gate') {
      out.url = task.url;
      out.group = 'withdraw_gate';
    }
    // v20: per-task countdown info — ad views left today + ms to the
    // Dhaka-midnight reset; daily tasks show the reset once done.
    if (task.id === 'ad') {
      out.claims_left_today = Math.max(0, AD_DAILY_LIMIT - adClaims);
      out.resets_in_ms = resetsInMs;
    }
    // v25: Monetag task — views left today, ms to the Dhaka-midnight
    // reset, and ms until the 30s cooldown ends (0 = ready now).
    if (task.id === 'ad_monetag') {
      out.claims_left_today = Math.max(0, MONETAG_DAILY_LIMIT - mtgClaims);
      out.resets_in_ms = resetsInMs;
      out.cooldown_ms = mtgCooldownMs;
    }
    if (task.id === 'quiz' && quizDone) out.resets_in_ms = resetsInMs;
    if (task.id === 'react_daily' && reactDone) out.resets_in_ms = resetsInMs;
    if (task.id === 'react_withdraw' && reactWithdrawDone) out.resets_in_ms = resetsInMs;
    if (task.id === 'quiz') {
      // Questions only — the correct answers never leave the worker.
      out.questions = translateQuiz(lang);
    }
    return out;
  });
  // v26 Lucky Spin: lock state (check-in + 4 joins) + slots left per
  // network + prize tiers, so the app can show exactly what is still
  // missing and what can be won.
  const spinLock = await getSpinLockState(env, userId, device.ok);
  const spinTask = tasks.find((t) => t.id === 'spin_daily');
  if (spinTask) {
    spinTask.locked = spinLock.locked;
    spinTask.missing = spinLock.missing;
    spinTask.joins_done = spinLock.joins_done;
    spinTask.slots = spinSlots;
    spinTask.spins_today = spinCounts.total;
    spinTask.prizes = SPIN_PRIZES.map((p) => ({ prize: p.prize, chance: p.weight * 100 }));
  }
  // Monthly check-in bonus progress (25 check-ins / month -> 50 ZERO).
  const month = today.slice(0, 7);
  const monthlyProgress = {
    count: await countMonthlyCheckins(env, userId, month),
    target: MONTHLY_TARGET,
    reward: MONTHLY_BONUS,
    claimed_this_month: !!(await env.KV.get('zmb:' + userId + ':' + month)),
    month,
  };
  const profile = await getProfile(env, userId, displayName, lang);
  // v20: community progress for today — total = the daily react task +
  // any one-time joins not yet done; done = how many of those are
  // completed today (the react task; a join leaves `total` once done).
  // Profile already carries level/xp/xp_next/progress (level_progress)
  // — reused as-is, not duplicated.
  const joinsPending = ['join_bazargoo', 'join_earnplaygame', 'join_cryptoguru', 'join_adsterratt']
    .filter((id) => !doneMap[id]).length;
  const communityProgress = { done: reactDone ? 1 : 0, total: 1 + joinsPending };
  // v26: gates block for the "প্রোফাইল সম্পূর্ণ করুন" checklist card
  // (live joins, cached 10 min) + live sponsor tasks (approved
  // promotions, group 'sponsor' — rendered by the app under the
  // "📢 স্পন্সর" filter). A fresh user with no live promo still gets
  // exactly the 23 static tasks (22 + the withdraw-gate task).
  const gates = await getGates(env, userId);
  const sponsorTasks = await listLiveSponsorTasks(env, userId, lang);
  for (const st of sponsorTasks) tasks.push(st);
  return { balance, tasks, streak, daily_reward: dailyReward, community_progress: communityProgress, profile, device_conflict: !device.ok, monthly_progress: monthlyProgress, gates };
}

// Live sponsor tasks for /tasks: approved promotions with budget left.
// Each is a claimable task (group 'sponsor'); the claim goes through
// handleClaim ('sponsor_<promo id>') with dwell / join verification.
async function listLiveSponsorTasks(env, userId, lang) {
  const out = [];
  try {
    const list = await env.KV.list({ prefix: 'zpromo:' });
    for (const k of list.keys || []) {
      if (!/^zpromo:PR-/.test(k.name)) continue;
      const promo = await kvGetJson(env, k.name);
      if (!promo || promo.status !== 'live' || (promo.remaining || 0) <= 0) continue;
      const claimed = !!(await env.KV.get('zpromoclaim:' + userId + ':' + promo.id));
      const isGram = promo.currency === 'gram';
      out.push({
        id: 'sponsor_' + promo.id,
        title: '📢 ' + promo.title,
        reward: isGram ? promo.reward_per_completion : PROMOTE_REWARD_ZERO,
        reward_currency: isGram ? 'GRAM' : 'ZERO',
        desc: t('sponsor.desc', lang, { promo }),
        done: claimed,
        group: 'sponsor',
        url: promo.url,
        image_url: promo.image_url || null,
        remaining: promo.remaining,
        currency: promo.currency,
      });
    }
  } catch (e) { /* on KV trouble return no sponsor tasks */ }
  return out;
}

async function handleClaim(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const task = String((body && body.task) || '');
  if (!userId) return { ok: false, reason: 'no_user' };
  // Prize claims are not in TASK_DEFS — they have their own handlers.
  if (task === 'leaderboard_prize') return handleLeaderboardPrizeClaim(env, userId, body);
  if (task === 'referral_contest_prize') return handleContestPrizeClaim(env, userId, body);
  if (task === 'religion_pdf') return handleReligionPdfClaim(env, userId, body);
  // v26: sponsor tasks are dynamic (live promotions) — not in TASK_DEFS.
  if (task.indexOf('sponsor_') === 0) return handleSponsorClaim(env, userId, task.slice('sponsor_'.length), body);
  const def = TASK_DEFS.find((t) => t.id === task);
  if (!def) return { ok: false, reason: 'unknown_task' };
  // One mobile = one account: a device bound to a different user may
  // not earn here (shopping / PDF buying are unaffected).
  const device = await checkDevice(env, userId, body && body.device_id);
  if (!device.ok) return { ok: false, reason: 'device_conflict' };
  const earnerName = String((body && body.name) || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 40) || null;
  const today = dhakaDateStr();

  if (task === 'checkin') {
    const key = 'zt:' + userId + ':checkin:' + today;
    if (await env.KV.get(key)) return { ok: false, reason: 'already_done' };
    // Streak: consecutive Dhaka days. Yesterday claimed -> +1; any gap
    // (or never) -> fresh Day 1. The reward follows the streak table.
    const last = (await env.KV.get('zl:' + userId + ':lastcheckin')) || null;
    const prevStreak = parseInt((await env.KV.get('zs:' + userId)) || '0', 10) || 0;
    const newStreak = last === prevDhakaDate(today) ? prevStreak + 1 : 1;
    const reward = streakReward(newStreak);
    await env.KV.put(key, '1');
    await env.KV.put('zs:' + userId, String(newStreak));
    await env.KV.put('zl:' + userId + ':lastcheckin', today);
    const balance = await creditTaskEarning(env, userId, reward, 'checkin', def.title, earnerName);
    // Referral: all 3 levels are paid on the referred user's FIRST
    // check-in, in one event. Walk the chain via the zref: keys
    // (L1 = direct referrer, L2 = referrer's referrer, L3 = one more
    // up); stop early if the chain ends. The single zref_paid flag
    // guards the whole payout against replays. A `seen` set stops one
    // user being paid twice if the chain ever loops back on itself.
    // The flat bonus pays NO commission on itself.
    const referrer = await env.KV.get('zref:' + userId);
    if (referrer && referrer !== String(userId) && !(await env.KV.get('zref_paid:' + userId))) {
      const seen = new Set([String(userId)]);
      let current = referrer;
      for (let level = 0; level < REFERRAL_REWARDS.length; level++) {
        if (!current || !Number(current) || seen.has(String(current))) break;
        seen.add(String(current));
        await creditEarned(env, Number(current), REFERRAL_REWARDS[level], false, {
          type: 'referral_bonus', source: 'referral',
          note: t('claim.referral_bonus_note', 'bn', { level, earnerName: earnerName || null }),
          noteKey: 'claim.referral_bonus_note',
          noteVars: { level, earnerName: earnerName || null },
        });
        const re = parseNum(await env.KV.get('zrefearn:' + current));
        await env.KV.put('zrefearn:' + current, String(round2(re + REFERRAL_REWARDS[level])));
        const levelKey = 'zrc' + (level + 1) + ':' + current;
        const lc = parseInt((await env.KV.get(levelKey)) || '0', 10) || 0;
        await env.KV.put(levelKey, String(lc + 1));
        if (level === 0) {
          // Legacy direct-referral total, kept for the profile `referrals` field.
          const rc = parseInt((await env.KV.get('zrc:' + current)) || '0', 10) || 0;
          await env.KV.put('zrc:' + current, String(rc + 1));
          // Monthly referral contest: count this PAID direct referral
          // for the current Dhaka month, and stamp when the count last
          // grew (tie-break: whoever reached the count first wins).
          const contestMonth = today.slice(0, 7);
          const mc = parseInt((await env.KV.get('zrefm:' + current + ':' + contestMonth)) || '0', 10) || 0;
          await env.KV.put('zrefm:' + current + ':' + contestMonth, String(mc + 1));
          await env.KV.put('zrefmt:' + current + ':' + contestMonth, String(Date.now()));
          // Backfill the Friend-menu downline list + join date for
          // referrals recorded before v18 (handleRefStart records
          // these for new referrals).
          await addToDownline(env, current, userId);
          if (!(await env.KV.get('zrefdate:' + userId))) await env.KV.put('zrefdate:' + userId, today);
        }
        current = await env.KV.get('zref:' + current);
      }
      await env.KV.put('zref_paid:' + userId, '1');
    }
    // Monthly check-in bonus: 25 check-ins in this Dhaka calendar
    // month auto-credits 50 ZERO on the 25th check-in, once per month.
    // The bonus goes through the task-earning path (weekly total +
    // upline commissions included). The response shape stays identical
    // when no bonus triggers, so existing clients keep working.
    const month = today.slice(0, 7);
    const monthCount = await countMonthlyCheckins(env, userId, month);
    let monthlyBonus = 0;
    let finalBalance = balance;
    if (monthCount >= MONTHLY_TARGET && !(await env.KV.get('zmb:' + userId + ':' + month))) {
      monthlyBonus = MONTHLY_BONUS;
      await env.KV.put('zmb:' + userId + ':' + month, '1');
      finalBalance = await creditTaskEarning(env, userId, MONTHLY_BONUS, 'monthly_bonus', t('claim.monthly_bonus_title', 'bn'), earnerName, 'monthly_bonus');
    }
    const res = { ok: true, balance: finalBalance, credited: reward, streak: newStreak };
    if (monthlyBonus) { res.monthly_bonus = monthlyBonus; res.monthly_count = monthCount; }
    return res;
  }

  if (JOIN_CHANNELS[task]) {
    const shortKey = task.slice('join_'.length);
    const key = 'zt:' + userId + ':join:' + shortKey;
    if (await env.KV.get(key)) return { ok: false, reason: 'already_done' };
    if (!(await isChannelMember(env, JOIN_CHANNELS[task], userId))) {
      return { ok: false, reason: 'not_member' };
    }
    await env.KV.put(key, '1');
    // Dated copy so the Lucky Spin unlock can count joins done TODAY
    // (the undated key has no date and would count forever).
    await env.KV.put('zt:' + userId + ':join:' + shortKey + ':' + today, '1');
    const balance = await creditTaskEarning(env, userId, def.reward, task, def.title, earnerName);
    return { ok: true, balance, credited: def.reward };
  }

  if (task === 'react_daily') {
    // v1 is trust-based: the Bot API cannot verify an individual user's
    // reaction to a channel post unless the bot is a channel admin
    // receiving reaction updates. Credit on the claim after the user
    // opened the pinned post — same model as the ad task.
    const key = 'zt:' + userId + ':react:' + today;
    if (await env.KV.get(key)) return { ok: false, reason: 'already_done' };
    await env.KV.put(key, '1');
    const balance = await creditTaskEarning(env, userId, def.reward, task, def.title, earnerName);
    return { ok: true, balance, credited: def.reward };
  }

  if (task === 'react_withdraw') {
    // v27 withdraw gate — NOT an earning task (reward 0): the user
    // taps this after reacting to the pinned post in @bazargoowithdraw.
    // Click-based only (the Bot API cannot verify individual channel
    // reactions) — same honest limit as react_daily. Stamps today's
    // gate key; no ZERO is credited, no weekly total, no commissions.
    const key = 'zt:' + userId + ':react_withdraw:' + today;
    if (await env.KV.get(key)) return { ok: false, reason: 'already_done' };
    await env.KV.put(key, '1');
    const balance = await getZeroBalance(env, userId);
    return { ok: true, balance, credited: 0 };
  }

  if (task === 'video_daily') {
    // v1 trust model: completion is enforced by the client-side
    // video-ended event — the app only enables Claim after the video
    // finishes playing. Gameable in principle (a client could POST
    // directly), same as the ad task. Rolling 24h cooldown from the
    // last claim timestamp, not a calendar day.
    const key = 'zt:' + userId + ':video_last';
    const last = parseInt((await env.KV.get(key)) || '0', 10) || 0;
    const nowMs = Date.now();
    if (last && nowMs - last < VIDEO_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown', available_in_ms: last + VIDEO_COOLDOWN_MS - nowMs };
    }
    await env.KV.put(key, String(nowMs));
    const balance = await creditTaskEarning(env, userId, def.reward, task, def.title, earnerName);
    return { ok: true, balance, credited: def.reward };
  }

  if (task.indexOf('visit_') === 0) {
    // v22: daily visit tasks — 1 ZERO, once per rolling 24h.
    // Channel visits MUST be verified: the claiming user has to
    // currently be a member of the channel (live getChatMember
    // check, same helper as the join tasks). Not a member -> refused
    // with 'not_joined', nothing credited, no click-trust fallback.
    // Facebook Page visits have no server verification (trust model,
    // same as ad/video): the app only enables Claim after the link
    // was opened this session; the worker enforces the 24h cooldown.
    if (VISIT_CHANNELS[task]) {
      if (!(await isChannelMember(env, VISIT_CHANNELS[task], userId))) {
        return { ok: false, reason: 'not_joined' };
      }
    }
    const key = 'zt:' + userId + ':visit_last:' + task;
    const last = parseInt((await env.KV.get(key)) || '0', 10) || 0;
    const nowMs = Date.now();
    if (last && nowMs - last < VISIT_COOLDOWN_MS) {
      return { ok: false, reason: 'cooldown', available_in_ms: last + VISIT_COOLDOWN_MS - nowMs };
    }
    await env.KV.put(key, String(nowMs));
    const balance = await creditTaskEarning(env, userId, def.reward, task, def.title, earnerName);
    return { ok: true, balance, credited: def.reward };
  }

  if (task === 'ad') {
    const claimsKey = 'zt:' + userId + ':ad:' + today;
    const claimed = parseInt((await env.KV.get(claimsKey)) || '0', 10) || 0;
    if (claimed >= AD_DAILY_LIMIT) return { ok: false, reason: 'daily_limit' };
    const clicks = parseInt((await env.KV.get('za:' + userId + ':' + today)) || '0', 10) || 0;
    if (claimed >= clicks) return { ok: false, reason: 'no_click' };
    await env.KV.put(claimsKey, String(claimed + 1));
    const balance = await creditTaskEarning(env, userId, def.reward, task, def.title, earnerName);
    return { ok: true, balance, credited: def.reward };
  }

  if (task === 'quiz') {
    const key = 'zt:' + userId + ':quiz:' + today;
    if (await env.KV.get(key)) return { ok: false, reason: 'already_done' };
    const answers = body && body.answers;
    if (!Array.isArray(answers) || answers.length !== QUIZ_QUESTIONS.length) {
      return { ok: false, reason: 'wrong_answers' };
    }
    for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
      if (Number(answers[i]) !== QUIZ_QUESTIONS[i].correct) {
        return { ok: false, reason: 'wrong_answers' };
      }
    }
    await env.KV.put(key, '1');
    const balance = await creditTaskEarning(env, userId, def.reward, task, def.title, earnerName);
    return { ok: true, balance, credited: def.reward };
  }

  if (task === 'spin_daily') {
    // v26: spins go through POST /spin-start + a verified ad view —
    // /claim never credits a spin anymore (the old strict 1/day spin
    // is replaced by the 4-spin ad-gated system, plan §6).
    return { ok: false, reason: 'use_spin_start' };
  }

  // referral is credited automatically when the friend checks in.
  return { ok: false, reason: 'not_claimable' };
}

function makeRedeemSaleId(now) {
  const ds = dhakaDateStr(now).replace(/-/g, '');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'RD-' + ds + '-' + s;
}

async function handleRedeem(env, body) {
  const userId = Number((body && body.user_id) || 0);
  if (!userId) return { ok: false, reason: 'no_user' };
  // ZERO coupon: 100 ZERO for a one-time 5% off shop coupon code.
  // Not a catalog PDF, so it is handled before the catalog lookup.
  if (body && body.item_id === 'coupon_5pct') return handleCouponRedeem(env, userId);
  const item = catalogGet(body && body.item_id);
  if (!item) return { ok: false, reason: 'unknown_item' };
  if (item.free || !item.price_zero) return { ok: false, reason: 'not_redeemable' };
  const balance = await getZeroBalance(env, userId);
  if (balance < item.price_zero) return { ok: false, reason: 'insufficient_balance', balance };
  const newBalance = await addZeroBalance(env, userId, -item.price_zero);
  await recordZeroHistory(env, userId, {
    type: 'redeem', amount: -item.price_zero, source: 'redeem',
    note: item.title || item.id, noteKey: 'pdf.title.' + item.id, noteVars: {},
  });
  // v26 monitoring counter (plan §4.3): weekly redeems vs weekly spin
  // claims — if redeems double vs the previous week, spin prize
  // weights are lowered or a weekly spin cap is set.
  await env.KV.put('zredeemweek:' + dhakaWeekKey(), String(parseInt((await env.KV.get('zredeemweek:' + dhakaWeekKey())) || '0', 10) + 1));
  const sale = {
    sale_id: makeRedeemSaleId(),
    user_id: userId,
    username: null,
    item_id: item.id,
    item_type: 'pdf',
    currency: 'ZERO',
    amount: item.price_zero,
    status: 'delivered',
    telegram_payment_charge_id: null,
    txid: null,
    source: 'redeem',
    created_at: new Date().toISOString(),
  };
  const res = await deliverPdf(env, sale);
  return { ok: true, balance: newBalance, sale_id: sale.sale_id, delivered: res.delivered };
}

async function handleAdClick(env, userId) {
  const today = dhakaDateStr();
  const key = 'za:' + userId + ':' + today;
  const cur = parseInt((await env.KV.get(key)) || '0', 10) || 0;
  if (cur < AD_CLICK_LOG_CAP) await env.KV.put(key, String(cur + 1));
  return { clicks: Math.min(cur + 1, AD_CLICK_LOG_CAP) };
}

// ---------- v25: Monetag Rewarded Interstitial ----------
//
// Flow: app taps the task -> POST /monetag-start issues a unique
// ymid (stored pending in KV, 48h TTL) -> app shows the ad with
// show_<ZONE>({ type: 'end', ymid, requestVar }) -> the SDK promise
// resolves with reward_event_type 'valued' | 'non_valued' -> EITHER
// the app confirms (POST /monetag-postback) OR Monetag's server sends
// the postback (GET /monetag-postback with the macros from the
// dashboard URL) -> handleMonetagPostback credits 1 ZERO through
// creditTaskEarning (leaderboard + upline commissions included).
// Whichever arrival comes first credits; the other is a duplicate.
// Only 'valued' events credit; a ymid can never pay twice.
//
// ymid charset (Monetag puts it in the postback URL WITHOUT
// URL-encoding): letters, digits, '-', '_', '.' only — the format
// below (mtg-<user>-<base36 time>-<base36 random>) complies.
// Postback URL to paste in the Monetag dashboard (main zone):
// https://bazargoo-bot.bazargoo.workers.dev/monetag-postback?ymid={ymid}&event_type={event_type}&reward_event_type={reward_event_type}&zone_id={zone_id}&sub_zone_id={sub_zone_id}&estimated_price={estimated_price}&request_var={request_var}&telegram_id={telegram_id}
// Optional secret: if env.MONETAG_POSTBACK_SECRET is set, the GET
// postback must carry ?secret=<value> (put the same value in the
// dashboard URL). Without it, the ymid check alone still blocks
// forged credits — a credit needs a worker-issued pending ymid.
function makeMonetagYmid(userId) {
  const rand = Math.random().toString(36).slice(2, 8);
  return 'mtg-' + userId + '-' + Date.now().toString(36) + '-' + rand;
}

async function handleMonetagStart(env, body) {
  const userId = Number((body && body.user_id) || 0);
  if (!userId) return { ok: false, reason: 'no_user' };
  const device = await checkDevice(env, userId, body && body.device_id);
  if (!device.ok) return { ok: false, reason: 'device_conflict' };
  const today = dhakaDateStr();
  const claims = parseInt((await env.KV.get('zt:' + userId + ':mtg:' + today)) || '0', 10) || 0;
  if (claims >= MONETAG_DAILY_LIMIT) return { ok: false, reason: 'daily_limit', claims_left_today: 0 };
  const last = parseInt((await env.KV.get('zt:' + userId + ':mtg_last')) || '0', 10) || 0;
  const nowMs = Date.now();
  if (last && nowMs - last < MONETAG_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown', available_in_ms: last + MONETAG_COOLDOWN_MS - nowMs };
  }
  const ymid = makeMonetagYmid(userId);
  await kvPutJson(env, 'zmtg:' + ymid, { user_id: userId, status: 'pending', created: nowMs }, { expirationTtl: 48 * 60 * 60 });
  return { ok: true, ymid, claims_left_today: Math.max(0, MONETAG_DAILY_LIMIT - claims) };
}

async function handleMonetagPostback(env, p) {
  const ymid = String((p && p.ymid) || '').trim().slice(0, 128);
  if (!ymid) return { ok: false, reason: 'no_ymid' };
  const rec = await kvGetJson(env, 'zmtg:' + ymid);
  if (!rec || typeof rec.user_id !== 'number') return { ok: false, reason: 'unknown_ymid' };
  if (rec.status !== 'pending') {
    return { ok: false, reason: rec.status === 'credited' ? 'already_credited' : 'already_used', duplicate: rec.status === 'credited' };
  }
  // Only a paid ('valued') event earns. A 'non_valued' arrival does
  // NOT consume the ymid — a later valued postback for the same show
  // (e.g. a click) can still credit it.
  const rewardEvent = String((p && p.reward_event_type) || '').trim();
  if (rewardEvent !== 'valued') return { ok: false, reason: 'non_valued' };
  // Monetag sends the Telegram user id separately as {telegram_id}.
  // When present it must match the user the ymid was issued to.
  const tgId = Number((p && p.telegram_id) || 0);
  if (tgId && tgId !== rec.user_id) return { ok: false, reason: 'user_mismatch' };
  const userId = rec.user_id;
  // v26: a spin-bound ymid credits the pending spin prize instead of
  // the ad task — the spin's own slots are the cap, not the ad-task
  // daily limit / 30s cooldown.
  if (rec.spin_id) {
    const spin = await kvGetJson(env, 'zspin:pending:' + userId);
    if (!spin || spin.spin_id !== rec.spin_id) {
      await kvPutJson(env, 'zmtg:' + ymid, { ...rec, status: 'rejected', reason: 'no_pending_spin' }, { expirationTtl: 48 * 60 * 60 });
      return { ok: false, reason: 'no_pending_spin' };
    }
    if (Date.now() - spin.created_at > SPIN_PENDING_TTL_MS) {
      await env.KV.delete('zspin:pending:' + userId);
      await kvPutJson(env, 'zmtg:' + ymid, { ...rec, status: 'rejected', reason: 'spin_expired' }, { expirationTtl: 48 * 60 * 60 });
      return { ok: false, reason: 'spin_expired' };
    }
    await kvPutJson(env, 'zmtg:' + ymid, {
      ...rec, status: 'credited',
      event_type: String((p && p.event_type) || ''),
      estimated_price: parseFloat((p && p.estimated_price) || 0) || 0,
      credited_at: Date.now(),
    }, { expirationTtl: 48 * 60 * 60 });
    const earnerName = String((p && p.name) || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 40) || null;
    return creditSpinPrize(env, spin, earnerName);
  }
  const today = dhakaDateStr();
  const claimsKey = 'zt:' + userId + ':mtg:' + today;
  const claims = parseInt((await env.KV.get(claimsKey)) || '0', 10) || 0;
  if (claims >= MONETAG_DAILY_LIMIT) {
    await kvPutJson(env, 'zmtg:' + ymid, { ...rec, status: 'rejected', reason: 'daily_limit' }, { expirationTtl: 48 * 60 * 60 });
    return { ok: false, reason: 'daily_limit' };
  }
  const last = parseInt((await env.KV.get('zt:' + userId + ':mtg_last')) || '0', 10) || 0;
  const nowMs = Date.now();
  if (last && nowMs - last < MONETAG_COOLDOWN_MS) {
    await kvPutJson(env, 'zmtg:' + ymid, { ...rec, status: 'rejected', reason: 'cooldown' }, { expirationTtl: 48 * 60 * 60 });
    return { ok: false, reason: 'cooldown', available_in_ms: last + MONETAG_COOLDOWN_MS - nowMs };
  }
  // Device check — client path only (the app passes device_id; the
  // Monetag server postback has none). A device conflict blocks the
  // client claim but never the server postback, so a legitimately
  // watched ad still pays; the ymid stays pending for the postback.
  if (p && p.device_id !== undefined && p.device_id !== null) {
    const device = await checkDevice(env, userId, p.device_id);
    if (!device.ok) return { ok: false, reason: 'device_conflict' };
  }
  await env.KV.put(claimsKey, String(claims + 1));
  await env.KV.put('zt:' + userId + ':mtg_last', String(nowMs));
  const estimated = parseFloat((p && p.estimated_price) || 0) || 0;
  await kvPutJson(env, 'zmtg:' + ymid, {
    ...rec, status: 'credited',
    event_type: String((p && p.event_type) || ''),
    estimated_price: estimated, credited_at: nowMs,
  }, { expirationTtl: 48 * 60 * 60 });
  const earnerName = String((p && p.name) || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 40) || null;
  const balance = await creditTaskEarning(env, userId, MONETAG_REWARD, 'ad_monetag', '📺 অ্যাড দেখুন (Monetag)', earnerName);
  return { ok: true, balance, credited: MONETAG_REWARD, estimated_price: estimated };
}

async function handleRefStart(env, msg, referrer) {
  const chatId = (msg.chat && msg.chat.id) || (msg.from && msg.from.id);
  const userId = msg.from && msg.from.id;
  const lang = await getUserLang(env, userId, msg.from);
  const ref = Number(referrer || 0);
  if (userId && ref && ref !== userId) {
    // Record the referred user's display name + join date for the
    // referrer's Friend-menu list (falls back to "বন্ধু" when unknown).
    const firstName = (msg.from && msg.from.first_name) ? String(msg.from.first_name).slice(0, 40) : null;
    if (firstName && !(await env.KV.get('zrefname:' + userId))) await env.KV.put('zrefname:' + userId, firstName);
    if (!(await env.KV.get('zref:' + userId))) {
      await env.KV.put('zref:' + userId, String(ref));
      await addToDownline(env, ref, userId);
      if (!(await env.KV.get('zrefdate:' + userId))) await env.KV.put('zrefdate:' + userId, dhakaDateStr());
    }
    await tgSend(env, chatId, t('ref.welcome', lang), welcomeKeyboard(lang));
    return { handled: 'ref_start', ok: true };
  }
  await tgSend(env, chatId, t('start.welcome', lang), welcomeKeyboard(lang));
  return { handled: 'ref_start', ok: false, reason: 'invalid' };
}

// ---------- admin: register a PDF file_id ----------

async function handleAdminDocument(env, msg) {
  const from = msg.from || {};
  const chatId = (msg.chat && msg.chat.id) || from.id;
  if (from.id !== ADMIN_ID) return { handled: 'document', ok: false, reason: 'not_admin' };
  const caption = String((msg.caption || '')).trim();
  const m = /^pdf:([A-Za-z0-9_-]+)(?::(en))?$/.exec(caption);
  if (!m) {
    await tgSend(env, chatId, 'PDF রেজিস্টার করতে ক্যাপশনে লিখুন: pdf:<pdf_id>  (যেমন pdf:test-pdf) — ইংরেজি ভার্সনের জন্য pdf:<pdf_id>:en');
    return { handled: 'document', ok: false, reason: 'bad_caption' };
  }
  const doc = msg.document || {};
  if (!doc.file_id) return { handled: 'document', ok: false, reason: 'no_file' };
  const pdfId = m[1];
  const lang = m[2] || 'bn';
  const kvKey = lang === 'en' ? 'pdf_file:' + pdfId + ':en' : 'pdf_file:' + pdfId;
  await env.KV.put(kvKey, doc.file_id);
  await tgSend(env, chatId, '✅ PDF রেজিস্টার হয়েছে: ' + pdfId + (lang === 'en' ? ' (English)' : '') + '\nএখন থেকে এই PDF-এর পেমেন্ট পেলেই বট নিজে পাঠিয়ে দেবে।');
  await deliverWaitingSalesForPdf(env, pdfId);
  return { handled: 'document', ok: true, pdfId, lang };
}

// ---------- reviews (ported from bot/bot_poll.py — same texts, KV instead of files) ----------

function parsePastedReview(text) {
  if (text.indexOf(REVIEW_MARKER) === -1) return null;
  function field(label) {
    const m = new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*(.*)$', 'm').exec(text);
    return m ? m[1].trim() : '';
  }
  const reviewId = field('রিভিউ নং');
  if (!reviewId) return null;
  const ratingLine = field('রেটিং');
  let stars = (ratingLine.match(/★/g) || []).length;
  if (stars < 1 || stars > 5) {
    const m = /\((\d)\//.exec(ratingLine);
    stars = m ? parseInt(m[1], 10) : 0;
  }
  let body = field('মন্তব্য');
  if (body === '—') body = '';
  return {
    type: 'bazargoo_review',
    review_id: reviewId,
    product_id: field('পণ্য ID'),
    product_name: field('পণ্য'),
    stars,
    text: body,
    user: null,
    submitted_at: new Date().toISOString(),
  };
}

function formatReviewMessages(review, buyer, chat, lang) {
  const name = (buyer && buyer.first_name) || (chat && chat.first_name) || '';
  const stars = review.stars || 0;
  const starsTxt = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  const confirm = t('review.confirm', lang, { name });
  const forward =
    '⭐ নতুন রিভিউ — Bazar Goo\n' +
    'পণ্য: ' + (review.product_name || '—') + ' (' + (review.product_id || '—') + ')\n' +
    'ক্রেতা: ' + (name || '—') + ' (@' + ((buyer && buyer.username) || '—') + ', id ' + ((buyer && buyer.id) || (chat && chat.id)) + ')\n' +
    'রেটিং: ' + starsTxt + ' (' + stars + '/৫)\n' +
    'রিভিউ নং: ' + (review.review_id || '—') + '\n' +
    'মন্তব্য: ' + (review.text || '—');
  return [confirm, forward];
}

function reviewKeyboard(reviewId) {
  return { inline_keyboard: [[
    { text: '✅ অনুমোদন করুন', callback_data: 'review:approve:' + reviewId },
    { text: '❌ বাতিল', callback_data: 'review:reject:' + reviewId },
  ]] };
}

async function handleReview(env, review, buyer, chat, lang) {
  const reviewId = review.review_id;
  if (!reviewId) return { handled: 'review', ok: false, reason: 'no_id' };
  buyer = buyer || {};
  if (!buyer.first_name) {
    buyer = { id: chat.id, username: chat.username, first_name: chat.first_name };
  }
  const [confirm, forward] = formatReviewMessages(review, buyer, chat, lang);
  await tgSend(env, chat.id, confirm);
  await tgSend(env, ADMIN_ID, forward, reviewKeyboard(reviewId));
  await kvPutJson(env, 'pending_review:' + reviewId, {
    review_id: reviewId,
    product_id: review.product_id || '',
    product_name: review.product_name || '',
    stars: review.stars || 0,
    text: review.text || '',
    buyer_name: buyer.first_name || chat.first_name || '',
    submitted_at: review.submitted_at || '',
  });
  return { handled: 'review', ok: true, review_id: reviewId };
}

// v26 admin action callbacks (Angela only — ADMIN_ID).
// Promote: approve -> 'live' (listed as a sponsor task); reject ->
// 'rejected' (the payment is NOT refunded automatically — she
// handles it manually; the message says so). Payout: approve ->
// 'pending_send'; reject -> the debited balance is REFUNDED and the
// payout is 'rejected'; sent -> 'sent' (she already sent it manually
// and logged the txid — the "পাঠিয়েছি" button or the
// "txid <payout_id> <txid>" command).
async function handleAdminActionCallback(env, cq) {
  const data = cq.data || '';
  const sender = (cq.from && cq.from.id) || null;
  if (sender !== ADMIN_ID) {
    await tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: t('admin.not_admin_callback', await getUserLang(env, sender, cq.from)) });
    return { handled: 'callback', ok: false, reason: 'not_admin' };
  }
  const m = /^(promo|payout)_(approve|reject|sent):(.+)$/.exec(data);
  if (!m) return { handled: 'callback', ok: false, reason: 'unknown_action' };
  const kind = m[1];
  const action = m[2];
  const id = m[3];
  const msg = cq.message || {};
  const chatId = (msg.chat && msg.chat.id) || ADMIN_ID;
  const messageId = msg.message_id;
  const origText = msg.text || '';
  let verdict;
  if (kind === 'promo') {
    const promo = await kvGetJson(env, 'zpromo:' + id);
    if (!promo) verdict = '⚠️ প্রমোশনটি পাওয়া যায়নি';
    else if (promo.status !== 'pending_approval') verdict = '⚠️ ইতিমধ্যে প্রসেস করা হয়েছে (' + promo.status + ')';
    else if (action === 'approve') {
      promo.status = 'live';
      promo.approved_at = new Date().toISOString();
      await kvPutJson(env, 'zpromo:' + id, promo);
      verdict = '✅ অনুমোদন হয়েছে — স্পন্সর টাস্ক হিসেবে লাইভ';
      await tgSend(env, promo.user_id, t('promo.approved', await getUserLang(env, promo.user_id), { promo }));
    } else {
      promo.status = 'rejected';
      promo.rejected_at = new Date().toISOString();
      await kvPutJson(env, 'zpromo:' + id, promo);
      verdict = '❌ প্রত্যাখ্যান হয়েছে (পেমেন্ট ম্যানুয়ালি ফেরত দিন)';
      await tgSend(env, promo.user_id, t('promo.rejected', await getUserLang(env, promo.user_id), { promo }));
    }
  } else {
    const payout = await kvGetJson(env, 'zpayout:' + id);
    if (!payout) verdict = '⚠️ তোলার অনুরোধটি পাওয়া যায়নি';
    else if (action === 'approve') {
      if (payout.status !== 'pending_approval') verdict = '⚠️ ইতিমধ্যে প্রসেস করা হয়েছে (' + payout.status + ')';
      else {
        payout.status = 'pending_send';
        payout.approved_at = new Date().toISOString();
        await kvPutJson(env, 'zpayout:' + id, payout);
        if (payout.currency === 'zero') {
          // v27 phase 2: approving a >500 ZERO payout TRIGGERS the
          // auto-send. On success the verdict carries the txid; on
          // failure the payout stays pending_send and Angela gets a
          // fresh alert with the "পাঠিয়েছি" button (manual fallback).
          const sent = await attemptZeroAutoSend(env, payout);
          if (sent.ok) verdict = '✅ অনুমোদন হয়েছে — অটো পাঠানো হয়েছে (txid: ' + sent.txid + ')';
          else verdict = '⚠️ অনুমোদন হয়েছে, কিন্তু অটো পাঠানো যায়নি (' + sent.reason + ') — ম্যানুয়ালি পাঠান';
        } else {
          verdict = '✅ অনুমোদন হয়েছে — এখন ম্যানুয়ালি পাঠান';
        }
      }
    } else if (action === 'reject') {
      if (payout.status === 'rejected' || payout.status === 'sent') verdict = '⚠️ ইতিমধ্যে প্রসেস করা হয়েছে (' + payout.status + ')';
      else {
        // Refund the amount that was debited at request time.
        if (payout.currency === 'zero') await addZeroBalance(env, payout.user_id, payout.amount);
        else if (payout.currency === 'gram') {
          await addWalletBalance(env, payout.user_id, 'gram', payout.amount);
          await addSolvency(env, 'gram_out', -payout.amount);
        }
        payout.status = 'rejected';
        payout.rejected_at = new Date().toISOString();
        await kvPutJson(env, 'zpayout:' + id, payout);
        verdict = '❌ প্রত্যাখ্যান হয়েছে — পরিমাণ ফেরত দেওয়া হয়েছে';
        await tgSend(env, payout.user_id, t('payout.rejected', await getUserLang(env, payout.user_id), { payout }));
      }
    } else { // sent
      if (payout.status === 'sent') verdict = '⚠️ ইতিমধ্যে পাঠানো হয়েছে';
      else {
        // v27: one place that marks sent, tells the user, and posts
        // the withdraw-channel proof (manual fallback path).
        await markPayoutSent(env, payout, payout.txid || null);
        verdict = '✅ পাঠানো হয়েছে হিসেবে চিহ্নিত';
      }
    }
  }
  await tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: verdict });
  if (messageId) {
    await tgCall(env, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: origText + '\n\n' + verdict,
      reply_markup: { inline_keyboard: [] },
    });
  }
  return { handled: 'callback', ok: true, action, id };
}

async function handleReviewCallback(env, cq) {
  const data = cq.data || '';
  // Phase 2: language toggle — any user may switch; the welcome is
  // re-sent in the new language. (The confirmation text is a bilingual
  // literal, not a t() key — it must read correctly in either language.)
  if (data === 'lang:bn' || data === 'lang:en') {
    const lang = data.slice(5);
    const userId = (cq.from && cq.from.id) || null;
    if (userId) await setUserLang(env, userId, lang);
    await tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: lang === 'en' ? 'Language: English' : 'ভাষা: বাংলা' });
    const chatId = (cq.message && cq.message.chat && cq.message.chat.id) || userId;
    if (chatId) await tgSend(env, chatId, t('start.welcome', lang), welcomeKeyboard(lang));
    return { handled: 'callback', ok: true, action: 'language', lang };
  }
  // v26 admin actions (promote approve/reject, payout approve/reject/sent)
  if (data.startsWith('promo_') || data.startsWith('payout_')) {
    return handleAdminActionCallback(env, cq);
  }
  if (!data.startsWith('review:approve:') && !data.startsWith('review:reject:')) {
    return { handled: 'callback', ok: false, reason: 'not_review' };
  }
  const sender = (cq.from && cq.from.id) || null;
  if (sender !== ADMIN_ID) return { handled: 'callback', ok: false, reason: 'not_admin' };
  const parts = data.split(':');
  const action = parts[1];
  const reviewId = parts[2];
  const pending = await kvGetJson(env, 'pending_review:' + reviewId);
  const msg = cq.message || {};
  const chatId = (msg.chat && msg.chat.id) || ADMIN_ID;
  const messageId = msg.message_id;
  const origText = msg.text || '';
  let verdict;
  if (action === 'approve') {
    if (pending) {
      const approved = (await kvGetJson(env, 'reviews:approved')) || [];
      if (!approved.some((r) => r.review_id === reviewId)) {
        approved.push({
          review_id: pending.review_id,
          product_id: pending.product_id,
          product_name: pending.product_name,
          stars: pending.stars,
          text: pending.text,
          buyer_name: pending.buyer_name || '',
          submitted_at: pending.submitted_at || '',
          approved_at: new Date().toISOString(),
        });
        await kvPutJson(env, 'reviews:approved', approved);
      }
      await env.KV.delete('pending_review:' + reviewId);
      verdict = '✅ প্রকাশ করা হয়েছে';
    } else {
      verdict = '⚠️ রিভিউটি পাওয়া যায়নি (হয়তো আগেই প্রসেস করা হয়েছে)';
    }
  } else {
    if (pending) await env.KV.delete('pending_review:' + reviewId);
    verdict = '❌ বাতিল করা হয়েছে';
  }
  await tgCall(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: verdict });
  if (messageId) {
    await tgCall(env, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: origText + '\n\n' + verdict,
      reply_markup: { inline_keyboard: [] },
    });
  }
  return { handled: 'callback', ok: true, action, review_id: reviewId };
}

// ---------- orders (ported from bot/bot_poll.py) ----------

function formatOrderMessages(order, buyer, chat, lang) {
  const items = order.items || [];
  const itemLines = items.map((it) => '• ' + it.name + ' × ' + it.qty + ' — ৳' + it.subtotal);
  const total = order.total;
  const subtotal = order.subtotal !== undefined ? order.subtotal : total;
  const delivery = order.delivery || {};
  const name = delivery.name || (buyer && buyer.first_name) || (chat && chat.first_name) || '';
  const greet = name ? t('order.greet.named', lang, { name }) : t('order.greet.anon', lang);
  const zone = delivery.shipping_zone;
  const fee = delivery.shipping_fee;
  const discount = order.discount || 0;
  const coupon = order.coupon;
  let totals;
  let forwardTotals;
  if (zone && fee !== undefined && fee !== null) {
    const zoneBn = zone === 'outside' ? t('order.zone.outside', lang) : t('order.zone.inside', lang);
    const zoneBnAdmin = zone === 'outside' ? 'ঢাকার বাইরে' : 'ঢাকার ভেতরে';
    if (coupon && discount) {
      totals = t('order.totals.coupon', lang, { subtotal, discount, zoneBn, fee, total });
    } else {
      totals = t('order.totals.no_coupon', lang, { subtotal, zoneBn, fee, total });
    }
    // The admin forward always uses the Bengali totals.
    const totalsBn = coupon && discount
      ? t('order.totals.coupon', 'bn', { subtotal, discount, zoneBn: zoneBnAdmin, fee, total })
      : t('order.totals.no_coupon', 'bn', { subtotal, zoneBn: zoneBnAdmin, fee, total });
    forwardTotals = totalsBn.slice(0, -1) + ', ' + order.item_count + ' আইটেম)';
  } else {
    totals = t('order.totals.simple', lang, { total });
    forwardTotals = t('order.totals.simple', 'bn', { total }) + ' (' + order.item_count + ' আইটেম)';
  }
  const confirm = t('order.confirm.header', lang, { greet }) + '\n\n' + totals +
    '\n' + t('order.confirm.closing', lang);
  let header = '🛍️ নতুন অর্ডার — Bazar Goo\nক্রেতা: ' + name + ' (@' + ((buyer && buyer.username) || '—') +
    ', id ' + ((buyer && buyer.id) || (chat && chat.id)) + ')\n';
  if (order.order_id) header += 'অর্ডার নং: ' + order.order_id + '\n';
  if (delivery.phone) header += 'মোবাইল: ' + delivery.phone + '\n';
  if (delivery.address) header += 'ঠিকানা: ' + delivery.address + '\n';
  if (delivery.district) header += 'জেলা: ' + delivery.district + '\n';
  return [confirm, header + itemLines.join('\n') + '\n' + forwardTotals];
}

async function handleOrder(env, order, chat, lang) {
  const buyer = order.user || {};
  const [confirm, forward] = formatOrderMessages(order, buyer, chat, lang);
  await tgSend(env, chat.id, confirm);
  await tgSend(env, ADMIN_ID, forward);
  return { handled: 'order', ok: true, total: order.total };
}

// ---------- message dispatch ----------

async function handleMessage(env, msg) {
  const chat = msg.chat || {};
  const chatId = chat.id;
  if (!chatId) return { handled: 'message', ok: false, reason: 'no_chat' };
  const lang = await getUserLang(env, chatId, msg.from);

  if (msg.successful_payment) return handleSuccessfulPayment(env, msg);
  if (msg.document) return handleAdminDocument(env, msg);

  const wad = msg.web_app_data;
  if (wad) {
    let data = {};
    try { data = JSON.parse(wad.data || '{}'); } catch (e) { data = {}; }
    if (data.type === 'bazargoo_order') return handleOrder(env, data, chat, lang);
    if (data.type === 'bazargoo_review') return handleReview(env, data, data.user || {}, chat, lang);
  }

  const text = msg.text || '';
  if (text.startsWith('/start')) {
    const arg = parseStartArg(text);
    if (arg && arg.kind === 'buy') return handleBuyStart(env, msg, arg.id);
    if (arg && arg.kind === 'zero') return handleZeroStart(env, msg, arg.id);
    if (arg && arg.kind === 'deposit') return handleDepositStartBot(env, msg, arg.stars);
    if (arg && arg.kind === 'redownload') return handleRedownloadStart(env, msg, arg.id);
    if (arg && arg.kind === 'ref') return handleRefStart(env, msg, arg.referrer);
    await tgSend(env, chatId, t('start.welcome', lang), welcomeKeyboard(lang));
    return { handled: 'start', ok: true };
  }

  // v26 admin command: "txid <payout_id> <txid>" — Angela logs the
  // manual payout txid after sending (ZERO or GRAM). Marks the payout
  // 'sent' and tells the user. Admin only.
  const txidCmd = /^txid\s+(PO-[0-9]{8}-[A-Z0-9]{4})\s+(\S+)$/.exec(text.trim());
  if (txidCmd) {
    if (chatId !== ADMIN_ID) {
      await tgSend(env, chatId, t('start.txid_not_admin', lang));
      return { handled: 'payout_txid', ok: false, reason: 'not_admin' };
    }
    const payout = await kvGetJson(env, 'zpayout:' + txidCmd[1]);
    if (!payout) {
      await tgSend(env, chatId, '⚠️ এই আইডির তোলার অনুরোধ পাওয়া যায়নি: ' + txidCmd[1]);
      return { handled: 'payout_txid', ok: false, reason: 'not_found' };
    }
    payout.txid = txidCmd[2];
    // v27: one place that marks sent, tells the user, and posts the
    // withdraw-channel proof (manual fallback path).
    await markPayoutSent(env, payout, txidCmd[2]);
    await tgSend(env, chatId, '✅ ' + txidCmd[1] + ' — পাঠানো হয়েছে হিসেবে চিহ্নিত (txid: ' + txidCmd[2] + ')।');
    return { handled: 'payout_txid', ok: true, payout_id: txidCmd[1] };
  }

  if (isTxid(text)) return handleZeroTxid(env, msg, text.trim());

  if (text.indexOf(REVIEW_MARKER) !== -1) {
    const review = parsePastedReview(text);
    if (review) return handleReview(env, review, {}, chat);
  }

  if (text.indexOf('BazarGoo অর্ডার') !== -1 && text.indexOf('মোট: ৳') !== -1) {
    const bname = chat.first_name || '';
    const greet = bname ? t('order.greet.named', lang, { name: bname }) : t('order.greet.anon', lang);
    await tgSend(env, chatId, t('order.confirm.header', lang, { greet }) + '\n\n' + t('order.confirm.closing', lang));
    await tgSend(env, ADMIN_ID,
      '🛍️ নতুন অর্ডার — Bazar Goo (কপি করা)\nক্রেতা: ' + bname + ' (@' + (chat.username || '—') + ', id ' + chatId + ')\n' + text);
    return { handled: 'pasted_order', ok: true };
  }

  // /language — show the language picker (bilingual prompt, works in either language).
  if (/^\/language(@\w+)?(\s|$)/.test(text)) {
    await tgSend(env, chatId, 'ভাষা বেছে নিন / Choose your language:', languageKeyboard());
    return { handled: 'language', ok: true };
  }

  if (text) {
    await tgSend(env, chatId, t('start.fallback', lang), shopButton(lang));
    return { handled: 'fallback', ok: true };
  }
  return { handled: 'message', ok: false, reason: 'empty' };
}

// ---------- update dispatch ----------

export async function handleUpdate(update, env) {
  if (!update || typeof update !== 'object') return { handled: 'none', ok: false };
  if (update.pre_checkout_query) return handlePreCheckout(env, update.pre_checkout_query);
  if (update.callback_query) return handleReviewCallback(env, update.callback_query);
  if (update.message) return handleMessage(env, update.message);
  return { handled: 'none', ok: false, reason: 'unknown_update' };
}

// Shared ZERO txid verification for deposits/promotes (same check as
// the PDF purchase flow: /txid must show >= minAmount to the shop
// receiving address). Returns { ok, paid } or { ok:false, reason }.
async function verifyZeroPayment(env, txid, minAmount) {
  const shopAddress = (env.ZERO_SHOP_ADDRESS || '').trim();
  if (!shopAddress) return { ok: false, reason: 'not_configured' };
  const tx = await zerochainGet(env, '/txid/' + txid);
  return verifyZeroTx(tx, shopAddress, minAmount);
}

// ---------- v27: ZERO auto-send (phase 2) + withdraw gate + proof posts ----------
//
// Fully automatic ZERO payouts from the separate payout wallet
// (env.ZERO_PAYOUT_ADDRESS). Phase 1 was manual send by Angela + txid
// log; phase 2 signs and broadcasts the transaction in the worker.
//
// SECURITY (hard rules, Angela 2026-11-09):
// - The private key comes ONLY from env.ZERO_PAYOUT_PRIVATE_KEY as a
//   WIF string. It is NEVER logged, printed, stored in KV, or put in
//   any error message. Only its DERIVED address is ever compared or
//   shown (the derived address is public, like the payout address).
// - Before ANY signing, the address derived from the key MUST equal
//   env.ZERO_PAYOUT_ADDRESS — a mismatch aborts the send.
// - FAIL CLOSED: key unset/invalid, balance/UTXO check fails, or
//   broadcast unconfirmed -> the payout stays 'pending_send' and
//   Angela is notified; the user's balance was already deducted at
//   request time and is NEVER deducted twice.
// - Daily cap 1,000 ZERO and manual approval above 500 ZERO are
//   unchanged (enforced in handleWithdraw, before this code runs).
// - GRAM auto-send does NOT exist: every GRAM path stays manual
//   (Decision 13 GRAM half still open).
//
// CRYPTO (pure JS, no dependency — Cloudflare Workers have no
// node:crypto; vendored here and validated against real data):
// - SHA-256, BLAKE2b-256, RIPEMD-160, Base58Check, secp256k1 ECDSA
//   (RFC 6979 deterministic k, low-S), ZIP-243 sighash.
// - Validated 2026-11-09/10: official ZIP-243 test vector 3 sighash
//   reproduced byte-for-byte (f3148f80…); the REAL funding tx
//   a72fc934… (10 ZER to the payout wallet) verifies under the Cosmos
//   branch id 0x7361707a (active since height 620450) with its
//   on-chain DER signature; privkey-1 vector -> generator pubkey +
//   WIF round-trip.
// - FEE: fixed 0.0001 ZERO (10,000 sats) per tx. The funding tx
//   confirmed with 0 fee; 0.0001 matches the zerochain docs example
//   and is negligible next to any payout. Change below 1,000 sats
//   folds into the fee (no dust output).
// - UTXOs come from /api/txs/{address}/{page} (paginated; the
//   Insight-style /api/addr/{addr}/utxo does NOT exist — verified
//   live, it returns HTML). Outputs to the payout address are
//   candidates; an output is spent if any vin in any page references
//   (txid, vout). Broadcast is GET /api/rawtx/{hex}[/{key}] and is
//   confirmed by polling /api/txid/{computed-txid}.

export const ZERO_COSMOS_BRANCH_ID = 0x7361707a; // Cosmos branch — active since height 620450
export const ZERO_TX_VERSION = 0x80000004;
export const ZERO_TX_VERSION_GROUP_ID = 0x892f2085;
export const ZERO_TX_FEE_SATS = 10000; // 0.0001 ZERO per tx
export const ZERO_DUST_SATS = 1000; // change below this folds into the fee
export const ZERO_MAX_INPUTS = 10;
export const ZERO_UTXO_MAX_PAGES = 50;
export const ZERO_CONFIRM_TRIES = 4;
export const ZERO_CONFIRM_SLEEP_MS = 2000;
export const WITHDRAW_CHANNEL = '@bazargoowithdraw';
export const WITHDRAW_CHANNEL_ID = '-1003963165611';
export const WITHDRAW_CHANNEL_URL = 'https://t.me/bazargoowithdraw';
export const WITHDRAW_PINNED_POST_URL = 'https://t.me/bazargoowithdraw/2';

// ----- byte helpers (module-private) -----
function hexToBytes(h) {
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return b;
}
function bytesToHex(b) {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}
function concatBytes(...arrs) {
  const n = arrs.reduce((s, a) => s + a.length, 0);
  const o = new Uint8Array(n);
  let p = 0;
  for (const a of arrs) { o.set(a, p); p += a.length; }
  return o;
}
function reverseBytes(b) {
  const o = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) o[i] = b[b.length - 1 - i];
  return o;
}
function u32le(n) {
  return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]);
}
function u64le(n) {
  const b = new Uint8Array(8);
  let x = BigInt(n);
  for (let i = 0; i < 8; i++) { b[i] = Number(x & 0xffn); x >>= 8n; }
  return b;
}
function varintBytes(n) {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return concatBytes(new Uint8Array([0xfd]), new Uint8Array([n & 255, (n >> 8) & 255]));
  if (n <= 0xffffffff) return concatBytes(new Uint8Array([0xfe]), u32le(n));
  return concatBytes(new Uint8Array([0xff]), u64le(n));
}
function readVarint(bytes, off) {
  const b = bytes[off];
  if (b < 0xfd) return [b, off + 1];
  if (b === 0xfd) return [bytes[off + 1] | (bytes[off + 2] << 8), off + 3];
  if (b === 0xfe) return [new DataView(bytes.buffer, bytes.byteOffset + off + 1, 4).getUint32(0, true), off + 5];
  return [Number(new DataView(bytes.buffer, bytes.byteOffset + off + 1, 8).getBigUint64(0, true)), off + 9];
}

// ----- SHA-256 (pure JS) -----
const SHA_K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
const rotr32 = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;
function sha256(msg) {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(Math.ceil((msg.length + 9) / 64) * 64);
  padded.set(msg); padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0); dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + SHA_K[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const mj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32); const o = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => o.setUint32(i * 4, v));
  return out;
}
function sha256d(m) { return sha256(sha256(m)); }

// ----- BLAKE2b-256 with 16-byte personalization -----
const BLAKE_IV = [0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n, 0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n];
const BLAKE_SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3]];
const M64 = (1n << 64n) - 1n;
const rotr64 = (x, n) => ((x >> BigInt(n)) | (x << BigInt(64 - n))) & M64;
function blake2b(msg, personal) {
  const param = new Uint8Array(64);
  param[0] = 32; param[2] = 1; param[3] = 1;
  param.set(personal, 48);
  const pv = new DataView(param.buffer);
  const h = BLAKE_IV.map((iv, i) => iv ^ BigInt.asUintN(64, pv.getBigUint64(i * 8, true)));
  const blocks = Math.max(1, Math.ceil((msg.length + 1) / 128));
  const buf = new Uint8Array(blocks * 128);
  buf.set(msg);
  let t = 0n;
  for (let b = 0; b < blocks; b++) {
    const last = b === blocks - 1;
    const chunk = buf.slice(b * 128, (b + 1) * 128);
    const chunkLen = last ? msg.length - b * 128 : 128;
    t += BigInt(chunkLen);
    const m = new DataView(chunk.buffer);
    const mw = []; for (let i = 0; i < 16; i++) mw.push(m.getBigUint64(i * 8, true));
    const v = [...h, ...BLAKE_IV];
    v[12] ^= t & M64; v[13] ^= (t >> 64n) & M64;
    if (last) v[14] = ~v[14] & M64;
    const G = (a, bb, c, d, x, y) => {
      v[a] = (v[a] + v[bb] + x) & M64; v[d] = rotr64(v[d] ^ v[a], 32);
      v[c] = (v[c] + v[d]) & M64; v[bb] = rotr64(v[bb] ^ v[c], 24);
      v[a] = (v[a] + v[bb] + y) & M64; v[d] = rotr64(v[d] ^ v[a], 16);
      v[c] = (v[c] + v[d]) & M64; v[bb] = rotr64(v[bb] ^ v[c], 63);
    };
    for (let r = 0; r < 12; r++) {
      const s = BLAKE_SIGMA[r];
      G(0, 4, 8, 12, mw[s[0]], mw[s[1]]); G(1, 5, 9, 13, mw[s[2]], mw[s[3]]);
      G(2, 6, 10, 14, mw[s[4]], mw[s[5]]); G(3, 7, 11, 15, mw[s[6]], mw[s[7]]);
      G(0, 5, 10, 15, mw[s[8]], mw[s[9]]); G(1, 6, 11, 12, mw[s[10]], mw[s[11]]);
      G(2, 7, 8, 13, mw[s[12]], mw[s[13]]); G(3, 4, 9, 14, mw[s[14]], mw[s[15]]);
    }
    for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) ov.setBigUint64(i * 8, h[i], true);
  return out;
}

// ----- RIPEMD-160 -----
const RMD_R = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
const RMD_RP = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
const RMD_S = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
const RMD_SP = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
const RMD_K = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const RMD_KP = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];
function ripemd160(msg) {
  const bitLen = msg.length * 8;
  const padded = new Uint8Array(Math.ceil((msg.length + 9) / 64) * 64);
  padded.set(msg); padded[msg.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true); dv.setUint32(padded.length - 4, Math.floor(bitLen / 4294967296), true);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;
  const fl = [(x, y, z) => (x ^ y ^ z) >>> 0, (x, y, z) => ((x & y) | (~x & z)) >>> 0, (x, y, z) => ((x | ~y) ^ z) >>> 0, (x, y, z) => ((x & z) | (y & ~z)) >>> 0, (x, y, z) => (x ^ (y | ~z)) >>> 0];
  const fr = [(x, y, z) => (x ^ (y | ~z)) >>> 0, (x, y, z) => ((x & z) | (y & ~z)) >>> 0, (x, y, z) => ((x | ~y) ^ z) >>> 0, (x, y, z) => ((x & y) | (~x & z)) >>> 0, (x, y, z) => (x ^ y ^ z) >>> 0];
  for (let off = 0; off < padded.length; off += 64) {
    const X = []; for (let i = 0; i < 16; i++) X.push(dv.getUint32(off + i * 4, true));
    let al = h0, bl = h1, cl = h2, dl = h3, el = h4;
    let ar = h0, br = h1, cr = h2, dr = h3, er = h4;
    for (let i = 0; i < 80; i++) {
      const j = (i / 16) | 0;
      let t = (rol((al + fl[j](bl, cl, dl) + X[RMD_R[i]] + RMD_K[j]) >>> 0, RMD_S[i]) + el) >>> 0;
      al = el; el = dl; dl = rol(cl, 10); cl = bl; bl = t;
      t = (rol((ar + fr[j](br, cr, dr) + X[RMD_RP[i]] + RMD_KP[j]) >>> 0, RMD_SP[i]) + er) >>> 0;
      ar = er; er = dr; dr = rol(cr, 10); cr = br; br = t;
    }
    const t = (h1 + cl + dr) >>> 0;
    h1 = (h2 + dl + er) >>> 0; h2 = (h3 + el + ar) >>> 0; h3 = (h4 + al + br) >>> 0; h4 = (h0 + bl + cr) >>> 0; h0 = t;
  }
  const out = new Uint8Array(20); const o = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((v, i) => o.setUint32(i * 4, v, true));
  return out;
}
function hash160(b) { return ripemd160(sha256(b)); }

// ----- Base58Check -----
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes) {
  let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = ''; while (n > 0n) { s = B58_ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  return '1'.repeat(zeros) + s;
}
function base58Decode(str) {
  let zeros = 0; while (zeros < str.length && str[zeros] === '1') zeros++;
  let n = 0n; for (const c of str) { const i = B58_ALPHABET.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const bytes = []; while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  return new Uint8Array([...new Uint8Array(zeros), ...bytes]);
}
function base58CheckEncode(versionBytes, payload) {
  const data = concatBytes(versionBytes, payload);
  const chk = sha256d(data).slice(0, 4);
  return base58Encode(concatBytes(data, chk));
}
function base58CheckDecode(str) {
  const raw = base58Decode(str);
  if (raw.length < 5) throw new Error('short');
  const data = raw.slice(0, -4); const chk = raw.slice(-4);
  const expect = sha256d(data).slice(0, 4);
  if (bytesToHex(chk) !== bytesToHex(expect)) throw new Error('checksum');
  return data;
}

// ----- secp256k1 (BigInt) -----
const SECP_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const SECP_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP_G = { x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, y: 0x0483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n };
function modInv(a, m) {
  let [old, nw] = [((a % m) + m) % m, m];
  let [x, y] = [1n, 0n];
  while (nw !== 0n) { const q = old / nw; [old, nw] = [nw, old - q * nw]; [x, y] = [y, x - q * y]; }
  return ((x % m) + m) % m;
}
function modPow(base, exp, mod) {
  let r = 1n; let b = base % mod;
  while (exp > 0n) { if (exp & 1n) r = (r * b) % mod; b = (b * b) % mod; exp >>= 1n; }
  return r;
}
function pointAdd(p1, p2) {
  if (!p1) return p2; if (!p2) return p1;
  if (p1.x === p2.x && (p1.y + p2.y) % SECP_P === 0n) return null;
  let lam;
  if (p1.x === p2.x && p1.y === p2.y) lam = ((3n * p1.x * p1.x) * modInv(2n * p1.y, SECP_P)) % SECP_P;
  else lam = ((p2.y - p1.y) * modInv(p2.x - p1.x, SECP_P)) % SECP_P;
  lam = ((lam % SECP_P) + SECP_P) % SECP_P;
  const x = ((lam * lam - p1.x - p2.x) % SECP_P + SECP_P) % SECP_P;
  const y = ((lam * (p1.x - x) - p1.y) % SECP_P + SECP_P) % SECP_P;
  return { x, y };
}
function scalarMult(k, pt) {
  let r = null; let a = pt;
  while (k > 0n) { if (k & 1n) r = pointAdd(r, a); a = pointAdd(a, a); k >>= 1n; }
  return r;
}
function privToPubBytes(privBytes) {
  const d = BigInt('0x' + bytesToHex(privBytes));
  const pt = scalarMult(d, SECP_G);
  const xb = new Uint8Array(32); let x = pt.x;
  for (let i = 31; i >= 0; i--) { xb[i] = Number(x & 0xffn); x >>= 8n; }
  return concatBytes(new Uint8Array([pt.y & 1n ? 0x03 : 0x02]), xb);
}
// WIF -> 32-byte private key. Throws on bad version/checksum/length.
export function zeroWifToPriv(wif) {
  const data = base58CheckDecode(String(wif || '').trim());
  if (data[0] !== 0x80) throw new Error('bad wif version');
  if (data.length === 34 && data[33] === 0x01) return data.slice(1, 33);
  if (data.length === 33) return data.slice(1);
  throw new Error('bad wif length');
}
// Private key bytes -> t1 ZERO address (P2PKH prefix 0x1CB8).
export function zeroPrivToAddress(privBytes) {
  return base58CheckEncode(new Uint8Array([0x1c, 0xb8]), hash160(privToPubBytes(privBytes)));
}
// t1 address -> 20-byte hash160 payload. Throws on bad prefix/checksum.
function addressToHash160(addr) {
  const data = base58CheckDecode(String(addr || '').trim());
  if (data.length !== 22 || data[0] !== 0x1c || data[1] !== 0xb8) throw new Error('bad zero address');
  return data.slice(2);
}
function zeroP2pkhScript(hash160Bytes) {
  return concatBytes(new Uint8Array([0x76, 0xa9, 0x14]), hash160Bytes, new Uint8Array([0x88, 0xac]));
}
function hmacSha256(key, msg) {
  const block = new Uint8Array(64);
  const k = key.length > 64 ? sha256(key) : key;
  block.set(k);
  const ipad = block.map((b) => b ^ 0x36); const opad = block.map((b) => b ^ 0x5c);
  return sha256(concatBytes(opad, sha256(concatBytes(ipad, msg))));
}
function rfc6979(privBytes, hashBytes) {
  const bx = concatBytes(privBytes, (() => {
    const z = BigInt('0x' + bytesToHex(hashBytes));
    const z2 = z >= SECP_N ? z - SECP_N : z;
    const b = new Uint8Array(32); let x = z2;
    for (let i = 31; i >= 0; i--) { b[i] = Number(x & 0xffn); x >>= 8n; }
    return b;
  })());
  let v = new Uint8Array(32).fill(1); let k = new Uint8Array(32).fill(0);
  k = hmacSha256(k, concatBytes(v, new Uint8Array([0]), bx));
  v = hmacSha256(k, v);
  k = hmacSha256(k, concatBytes(v, new Uint8Array([1]), bx));
  v = hmacSha256(k, v);
  for (;;) {
    v = hmacSha256(k, v);
    const cand = BigInt('0x' + bytesToHex(v));
    if (cand >= 1n && cand < SECP_N) return cand;
    k = hmacSha256(k, concatBytes(v, new Uint8Array([0])));
    v = hmacSha256(k, v);
  }
}
function derSig(r, s) {
  const enc = (x) => {
    const b = []; let v = x;
    while (v > 0n) { b.unshift(Number(v & 0xffn)); v >>= 8n; }
    if (b.length === 0) b = [0];
    if (b[0] & 0x80) b.unshift(0);
    return b;
  };
  const rb = enc(r), sb = enc(s);
  return new Uint8Array([0x30, rb.length + sb.length + 4, 0x02, rb.length, ...rb, 0x02, sb.length, ...sb]);
}
function parseDer(sig) {
  if (sig[0] !== 0x30) throw new Error('der');
  let o = 2;
  if (sig[o] !== 0x02) throw new Error('der');
  const rl = sig[o + 1]; const r = BigInt('0x' + bytesToHex(sig.slice(o + 2, o + 2 + rl)));
  o += 2 + rl;
  if (sig[o] !== 0x02) throw new Error('der');
  const sl = sig[o + 1]; const s = BigInt('0x' + bytesToHex(sig.slice(o + 2, o + 2 + sl)));
  return { r, s };
}
// ECDSA sign over a 32-byte digest (the sighash itself — NO extra hash).
export function zeroEcdsaSign(privBytes, hashBytes) {
  const d = BigInt('0x' + bytesToHex(privBytes));
  const z = BigInt('0x' + bytesToHex(hashBytes));
  const k = rfc6979(privBytes, hashBytes);
  const R = scalarMult(k, SECP_G);
  const r = R.x % SECP_N;
  let s = (modInv(k, SECP_N) * (z + r * d)) % SECP_N;
  if (s > SECP_N / 2n) s = SECP_N - s; // low-S
  return derSig(r, s);
}
// ECDSA verify over a 32-byte digest. Used by tests (funding tx +
// ZIP-243 vector); the worker never needs to verify its own sends.
export function zeroEcdsaVerify(pubBytes, hashBytes, der) {
  const { r, s } = parseDer(der);
  if (r <= 0n || r >= SECP_N || s <= 0n || s >= SECP_N) return false;
  const x = BigInt('0x' + bytesToHex(pubBytes.slice(1)));
  const yOdd = pubBytes[0] === 0x03;
  const y2 = (modPow(x, 3n, SECP_P) + 7n) % SECP_P;
  let y = modPow(y2, (SECP_P + 1n) / 4n, SECP_P);
  if ((y & 1n) === (yOdd ? 0n : 1n)) y = SECP_P - y;
  const Q = { x, y };
  const z = BigInt('0x' + bytesToHex(hashBytes));
  const w = modInv(s, SECP_N);
  const u1 = (z * w) % SECP_N, u2 = (r * w) % SECP_N;
  const pt = pointAdd(scalarMult(u1, SECP_G), scalarMult(u2, Q));
  return pt !== null && pt.x % SECP_N === r;
}

// ----- v4 transaction parse / serialize / ZIP-243 sighash -----
export function zeroParseTx(hex) {
  const b = hexToBytes(hex); let o = 0;
  const dv = new DataView(b.buffer, b.byteOffset);
  const version = dv.getUint32(o, true); o += 4;
  const versionGroupId = dv.getUint32(o, true); o += 4;
  const [vinLen, o1] = readVarint(b, o); o = o1;
  const vins = [];
  for (let i = 0; i < vinLen; i++) {
    const hash = b.slice(o, o + 32); o += 32;
    const index = dv.getUint32(o, true); o += 4;
    const [sl, o2] = readVarint(b, o); o = o2;
    const scriptSig = b.slice(o, o + sl); o += sl;
    const sequence = dv.getUint32(o, true); o += 4;
    vins.push({ hash, index, scriptSig, sequence });
  }
  const [voutLen, o3] = readVarint(b, o); o = o3;
  const vouts = [];
  for (let i = 0; i < voutLen; i++) {
    const value = dv.getBigUint64(o, true); o += 8;
    const [sl, o4] = readVarint(b, o); o = o4;
    const script = b.slice(o, o + sl); o += sl;
    vouts.push({ value, script });
  }
  const locktime = dv.getUint32(o, true); o += 4;
  const expiryHeight = dv.getUint32(o, true); o += 4;
  const valueBalance = dv.getBigUint64(o, true); o += 8;
  const [ss, o5] = readVarint(b, o); o = o5;
  const [so, o6] = readVarint(b, o); o = o6;
  const [js, o7] = readVarint(b, o); o = o7;
  return { version, versionGroupId, vins, vouts, locktime, expiryHeight, valueBalance, shieldedSpend: ss, shieldedOutput: so, joinsplit: js, bytesConsumed: o, totalLen: b.length };
}
export function zeroSerializeTx(tx) {
  const parts = [u32le(tx.version), u32le(tx.versionGroupId), varintBytes(tx.vins.length)];
  for (const v of tx.vins) {
    parts.push(v.hash, u32le(v.index), varintBytes(v.scriptSig.length), v.scriptSig, u32le(v.sequence));
  }
  parts.push(varintBytes(tx.vouts.length));
  for (const v of tx.vouts) {
    parts.push(u64le(v.value), varintBytes(v.script.length), v.script);
  }
  parts.push(u32le(tx.locktime), u32le(tx.expiryHeight), u64le(tx.valueBalance || 0n));
  parts.push(varintBytes(tx.shieldedSpend || 0), varintBytes(tx.shieldedOutput || 0), varintBytes(tx.joinsplit || 0));
  return concatBytes(...parts);
}
const ZERO32 = new Uint8Array(32);
// ZIP-243 sighash (Sapling/Cosmos v4 format). tx is a zeroParseTx-shaped
// object; scriptCode is the spent output's scriptPubKey bytes;
// prevValueSats is that output's value in satoshis.
export function zeroSighash(tx, inputIndex, scriptCode, prevValueSats, branchId) {
  const prevouts = concatBytes(...tx.vins.map((v) => concatBytes(v.hash, u32le(v.index))));
  const seqs = concatBytes(...tx.vins.map((v) => u32le(v.sequence)));
  const outs = concatBytes(...tx.vouts.map((v) => concatBytes(u64le(v.value), varintBytes(v.script.length), v.script)));
  const hashPrevouts = blake2b(prevouts, new TextEncoder().encode('ZcashPrevoutHash'));
  const hashSequence = blake2b(seqs, new TextEncoder().encode('ZcashSequencHash'));
  const hashOutputs = blake2b(outs, new TextEncoder().encode('ZcashOutputsHash'));
  const vin = tx.vins[inputIndex];
  const pre = concatBytes(
    u32le(tx.version), u32le(tx.versionGroupId),
    hashPrevouts, hashSequence, hashOutputs, ZERO32, ZERO32, ZERO32,
    u32le(tx.locktime), u32le(tx.expiryHeight), u64le(tx.valueBalance || 0n), u32le(1),
    vin.hash, u32le(vin.index),
    varintBytes(scriptCode.length), scriptCode,
    u64le(prevValueSats), u32le(vin.sequence));
  const personal = concatBytes(new TextEncoder().encode('ZcashSigHash'), u32le(branchId));
  return blake2b(pre, personal);
}
export function zeroTxidFromHex(hex) {
  return bytesToHex(reverseBytes(sha256d(hexToBytes(hex))));
}
// Build + sign a v4 P2PKH payout tx. utxos: [{ txid (display hex),
// vout, valueSat, scriptPubKey (hex) }]. Returns { hex, txid }.
// Change below ZERO_DUST_SATS folds into the fee (no dust output).
export function zeroSignTx(privBytes, utxos, toAddress, amountSats, changeAddress, feeSats) {
  const pub = privToPubBytes(privBytes);
  const totalIn = utxos.reduce((s, u) => s + BigInt(u.valueSat), 0n);
  const amount = BigInt(amountSats);
  const fee = BigInt(feeSats);
  if (totalIn < amount + fee) throw new Error('insufficient_utxo');
  let change = totalIn - amount - fee;
  if (change > 0n && change < BigInt(ZERO_DUST_SATS)) change = 0n;
  const vouts = [{ value: amount, script: zeroP2pkhScript(addressToHash160(toAddress)) }];
  if (change > 0n) vouts.push({ value: change, script: zeroP2pkhScript(addressToHash160(changeAddress)) });
  const tx = {
    version: ZERO_TX_VERSION, versionGroupId: ZERO_TX_VERSION_GROUP_ID,
    vins: utxos.map((u) => ({ hash: reverseBytes(hexToBytes(u.txid)), index: u.vout, scriptSig: new Uint8Array(0), sequence: 0xffffffff })),
    vouts, locktime: 0, expiryHeight: 0, valueBalance: 0n,
  };
  for (let i = 0; i < utxos.length; i++) {
    const scriptCode = hexToBytes(utxos[i].scriptPubKey);
    const sighash = zeroSighash(tx, i, scriptCode, BigInt(utxos[i].valueSat), ZERO_COSMOS_BRANCH_ID);
    const sig = zeroEcdsaSign(privBytes, sighash);
    const sigWithHash = concatBytes(sig, new Uint8Array([1]));
    tx.vins[i].scriptSig = concatBytes(varintBytes(sigWithHash.length), sigWithHash, varintBytes(pub.length), pub);
  }
  const raw = zeroSerializeTx(tx);
  const hex = bytesToHex(raw);
  return { hex, txid: zeroTxidFromHex(hex) };
}

// ----- zerochain.info chain reads (UTXOs + balance + confirm) -----
// /api/addressbalance returns the balance in SATOSHIS as a plain JSON
// number (verified live 2026-11-10: 1000000000 for the payout wallet).
export async function getZeroBalanceSats(env, address) {
  const raw = await zerochainGet(env, '/addressbalance/' + address);
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}
// UTXOs via /api/txs/{address}/{page} (verified live 2026-11-10 — the
// Insight-style /api/addr/{addr}/utxo does NOT exist, it returns HTML).
// An output is unspent only if no vin in ANY page references it.
export async function getZeroUtxos(env, address) {
  const spent = new Set();
  const found = [];
  let pagesTotal = 1;
  for (let page = 0; page < pagesTotal && page < ZERO_UTXO_MAX_PAGES; page++) {
    const data = await zerochainGet(env, '/txs/' + address + '/' + page);
    if (!data || !Array.isArray(data.txs)) break;
    if (typeof data.pagesTotal === 'number') pagesTotal = data.pagesTotal;
    for (const tx of data.txs) {
      for (const vin of tx.vin || []) spent.add(String(vin.txid) + ':' + vin.vout);
      for (const vout of tx.vout || []) {
        const addrs = (vout.scriptPubKey && vout.scriptPubKey.addresses)
          || (vout.address ? [vout.address] : []);
        if (!addrs.includes(address)) continue;
        const valueSat = Number(vout.valueSat != null ? vout.valueSat : Math.round(Number(vout.value || 0) * 1e8));
        if (!(valueSat > 0)) continue;
        found.push({
          txid: String(tx.txid),
          vout: Number(vout.n),
          valueSat,
          scriptPubKey: String((vout.scriptPubKey && vout.scriptPubKey.hex) || ''),
        });
      }
    }
  }
  return found
    .filter((u) => !spent.has(u.txid + ':' + u.vout) && u.scriptPubKey)
    .sort((a, b) => b.valueSat - a.valueSat);
}
async function broadcastZeroTx(env, hex) {
  const key = (env.ZEROCHAIN_API_KEY || '').trim();
  const url = key ? ZEROCHAIN_API + '/rawtx/' + hex + '/' + key : ZEROCHAIN_API + '/rawtx/' + hex;
  try {
    const res = await fetch(url);
    return !!res.ok;
  } catch (e) { return false; }
}
async function confirmZeroTx(env, txid, opts) {
  const tries = (opts && opts.tries) || ZERO_CONFIRM_TRIES;
  const sleepMs = (opts && typeof opts.sleepMs === 'number') ? opts.sleepMs : ZERO_CONFIRM_SLEEP_MS;
  for (let i = 0; i < tries; i++) {
    const tx = await zerochainGet(env, '/txid/' + txid);
    if (tx && String(tx.txid || '') === txid) return true;
    if (i + 1 < tries && sleepMs > 0) await new Promise((r) => setTimeout(r, sleepMs));
  }
  return false;
}

// ----- withdraw gate: @bazargoowithdraw join + today's react stamp -----
// The gate applies ONLY to instant (external) withdrawals — NOT to
// 'save' mode, NOT to spin/leaderboard (getGates), NOT to the
// 4-channel join tasks. Membership is checked LIVE via getChatMember
// (fail closed on API error); the react is click-based (the Bot API
// cannot verify individual channel reactions — same honest limit as
// react_daily) and stamped by the 'react_withdraw' task.
export async function getWithdrawGate(env, userId) {
  const joined = await isChannelMember(env, WITHDRAW_CHANNEL_ID, userId);
  const today = dhakaDateStr();
  const reactDone = !!(await env.KV.get('zt:' + userId + ':react_withdraw:' + today));
  return { joined, react_done: reactDone, ok: joined && reactDone };
}

// ----- withdraw proof post (never the destination address) -----
export async function postWithdrawProof(env, payout) {
  try {
    const channel = (env.WITHDRAW_CHANNEL || '').trim() || WITHDRAW_CHANNEL_ID;
    if (!channel) return { ok: false, reason: 'no_channel' };
    const name = (await env.KV.get('zname:' + payout.user_id))
      || (await env.KV.get('zrefname:' + payout.user_id))
      || ('id ' + payout.user_id);
    const text = '✅ তোলা সম্পন্ন\n'
      + 'পরিমাণ: ' + fmtZero(payout.amount) + ' ' + String(payout.currency || 'zero').toUpperCase() + '\n'
      + 'ইউজার: ' + name + '\n'
      + 'পেআউট আইডি: ' + payout.id
      + (payout.txid ? '\ntxid: ' + payout.txid : '');
    await tgSend(env, channel, text);
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'post_failed' }; }
}

// Mark a payout sent (auto-send success, admin "পাঠিয়েছি" button, or
// the manual "txid <id> <txid>" command): one place that saves the
// record, tells the user, and posts the withdraw-channel proof.
export async function markPayoutSent(env, payout, txid) {
  payout.status = 'sent';
  if (txid) payout.txid = txid;
  payout.sent_at = new Date().toISOString();
  await kvPutJson(env, 'zpayout:' + payout.id, payout);
  await tgSend(env, payout.user_id, t('payout.sent', await getUserLang(env, payout.user_id), { payout }));
  await postWithdrawProof(env, payout);
  return payout;
}

// Admin alert when auto-send fails. Config problems (key missing /
// invalid / address mismatch) alert once per day — the same failure
// would repeat for every payout. Per-payout problems (float low,
// no UTXO, broadcast, not confirmed) alert every time, with the
// "পাঠিয়েছি" button so Angela can still send it manually. The
// private key is NEVER included in any message.
const AUTO_FAIL_REASON_TEXT = {
  key_missing: 'পেআউট প্রাইভেট কী সেট করা নেই (ZERO_PAYOUT_PRIVATE_KEY)',
  key_invalid: 'প্রাইভেট কী-টি সঠিক WIF নয়',
  address_mismatch: 'কী থেকে পাওয়া ঠিকানা payout ওয়ালেটের ঠিকানার সঙ্গে মিলছে না — পাঠানো হয়নি',
  float_low: 'পেআউট ওয়ালেটে যথেষ্ট ZERO নেই',
  no_utxo: 'খরচ করার মতো UTXO পাওয়া যায়নি',
  sign_failed: 'লেনদেনে স্বাক্ষর করা যায়নি',
  broadcast_failed: 'লেনদেন broadcast করা যায়নি',
  balance_check_failed: 'ওয়ালেটের ব্যালেন্স যাচাই করা যায়নি',
  not_confirmed: 'broadcast হয়েছে কিন্তু explorer-এ এখনো দেখা যাচ্ছে না — txid দিয়ে যাচাই করে "txid" কমান্ড দিন',
};
async function notifyAdminAutoFail(env, payout, reason, txid) {
  try {
    const configProblem = reason === 'key_missing' || reason === 'key_invalid' || reason === 'address_mismatch';
    if (configProblem) {
      const throttleKey = 'zautofail:' + reason + ':' + dhakaDateStr();
      if (await env.KV.get(throttleKey)) return;
      await env.KV.put(throttleKey, '1');
    }
    const text = '⚠️ অটো পাঠানো যায়নি — ' + payout.id + '\n'
      + 'পরিমাণ: ' + fmtZero(payout.amount) + ' ' + String(payout.currency).toUpperCase() + '\n'
      + 'কারণ: ' + (AUTO_FAIL_REASON_TEXT[reason] || reason) + '\n'
      + (txid ? 'txid: ' + txid + '\n' : '')
      + 'ম্যানুয়ালি পাঠিয়ে "পাঠিয়েছি" চাপুন অথবা "txid ' + payout.id + ' <txid>" লিখুন।';
    await tgSend(env, ADMIN_ID, text, {
      inline_keyboard: [[{ text: '✅ পাঠিয়েছি', callback_data: 'payout_sent:' + payout.id }]],
    });
  } catch (e) { /* alert failure must not break the payout record */ }
}

// ----- fully automatic ZERO send (phase 2) -----
// Called when a ≤500 ZERO payout is created, and when Angela approves
// a >500 ZERO payout. GRAM never reaches here. On ANY failure the
// payout stays 'pending_send' (balance was already deducted at request
// time — never deducted twice) and Angela is notified.
export async function attemptZeroAutoSend(env, payout, opts) {
  if (!payout || payout.currency !== 'zero') return { ok: false, reason: 'not_zero' };
  if (payout.status === 'sent') return { ok: false, reason: 'already_sent' };
  // One in-flight send per payout: a second call (double tap / retry)
  // must never build a second transaction from the same UTXOs.
  const lockKey = 'zpayoutsend:' + payout.id;
  if (await env.KV.get(lockKey)) return { ok: false, reason: 'already_in_progress' };
  await kvPutJson(env, lockKey, { at: new Date().toISOString() }, { expirationTtl: 300 });
  try {
    const wif = (env.ZERO_PAYOUT_PRIVATE_KEY || '').trim();
    if (!wif) {
      await notifyAdminAutoFail(env, payout, 'key_missing');
      return { ok: false, reason: 'key_missing' };
    }
    let priv;
    try { priv = zeroWifToPriv(wif); } catch (e) {
      await notifyAdminAutoFail(env, payout, 'key_invalid');
      return { ok: false, reason: 'key_invalid' };
    }
    // The derived address MUST equal the payout wallet address —
    // never send from a mismatched key.
    const derived = zeroPrivToAddress(priv);
    const expected = (env.ZERO_PAYOUT_ADDRESS || '').trim();
    if (!expected || derived !== expected) {
      await notifyAdminAutoFail(env, payout, 'address_mismatch');
      return { ok: false, reason: 'address_mismatch' };
    }
    const amountSats = Math.round(Number(payout.amount) * 1e8);
    if (!(amountSats > 0)) return { ok: false, reason: 'invalid_amount' };
    const balanceSats = await getZeroBalanceSats(env, expected);
    if (balanceSats === null) {
      await notifyAdminAutoFail(env, payout, 'balance_check_failed');
      return { ok: false, reason: 'balance_check_failed' };
    }
    if (balanceSats < amountSats + ZERO_TX_FEE_SATS) {
      await notifyAdminAutoFail(env, payout, 'float_low');
      return { ok: false, reason: 'float_low', balance_zero: balanceSats / 1e8 };
    }
    const utxos = await getZeroUtxos(env, expected);
    const selected = [];
    let total = 0n;
    for (const u of utxos) {
      selected.push(u);
      total += BigInt(u.valueSat);
      if (total >= BigInt(amountSats) + BigInt(ZERO_TX_FEE_SATS)) break;
      if (selected.length >= ZERO_MAX_INPUTS) break;
    }
    if (total < BigInt(amountSats) + BigInt(ZERO_TX_FEE_SATS)) {
      await notifyAdminAutoFail(env, payout, 'no_utxo');
      return { ok: false, reason: 'no_utxo' };
    }
    let signed;
    try {
      signed = zeroSignTx(priv, selected, payout.address, amountSats, expected, ZERO_TX_FEE_SATS);
    } catch (e) {
      await notifyAdminAutoFail(env, payout, 'sign_failed');
      return { ok: false, reason: 'sign_failed' };
    }
    if (!(await broadcastZeroTx(env, signed.hex))) {
      await notifyAdminAutoFail(env, payout, 'broadcast_failed');
      return { ok: false, reason: 'broadcast_failed' };
    }
    if (!(await confirmZeroTx(env, signed.txid, opts))) {
      // Broadcast accepted but the explorer does not show the tx yet.
      // Do NOT mark sent and do NOT retry blindly (a retry could
      // double-spend the same UTXOs) — Angela verifies with the txid
      // and the manual "txid" command marks it sent once confirmed.
      await notifyAdminAutoFail(env, payout, 'not_confirmed', signed.txid);
      return { ok: false, reason: 'not_confirmed', txid: signed.txid };
    }
    await markPayoutSent(env, payout, signed.txid);
    return { ok: true, txid: signed.txid };
  } finally {
    try { await env.KV.delete(lockKey); } catch (e) { /* lock expires on its own (300s TTL) */ }
  }
}

// ---------- v26: Wallet + Deposit + Withdraw (phases A + C) ----------
//
// Wallet balances (zwb:<uid>:<currency>) hold DEPOSITS and funds the
// user chose to SAVE there (the ZERO dual-option). A wallet balance is
// dual-purpose: buy (promote / PDF) OR withdraw anytime, subject to
// the min/cap/solvency rules — never locked, never forced.
//   Deposit-to-buy is the USER'S FREE CHOICE, never mandatory — direct
//   payment always stays available at every checkout.
//   ZERO dual-option at every ZERO checkout AND withdrawal: instant
//   pay/payout OR wallet save.
//   TON Connect is NOT active — manual tx-hash GRAM only.
//   Decision 13 HALF DONE: ZERO payout address provided 2026-11-09
//   (env.ZERO_PAYOUT_ADDRESS = t1atEkz24YDS4LDa5GeSQsnMxc7eF7CupWZ).
//   GRAM half still OPEN (TON receiving address + GRAM payout float):
//   env.GRAM_RECEIVING_ADDRESS / env.GRAM_PAYOUT_FLOAT are empty
//   placeholders until Angela provides them — every GRAM path fails
//   CLOSED with a plain Bangla reason until then.

async function getWalletState(env, userId) {
  const [zero, gram, stars] = await Promise.all([
    getWalletBalance(env, userId, 'zero'),
    getWalletBalance(env, userId, 'gram'),
    getWalletBalance(env, userId, 'stars'),
  ]);
  const gates = await getGates(env, userId);
  const earned = await getZeroBalance(env, userId);
  // v27: withdraw gate state (live @bazargoowithdraw membership +
  // today's react stamp) so the app can render the two gate steps.
  const withdrawGate = await getWithdrawGate(env, userId);
  return {
    ok: true,
    balance: { zero, gram, stars },
    earned_zero: earned,
    gates,
    withdraw_gate: withdrawGate,
    withdraw_rules: {
      zero: { fee: 0, minimum: 0, daily_cap: WITHDRAW_ZERO_DAILY_CAP, manual_above: WITHDRAW_MANUAL_ABOVE_ZERO },
      gram: { fee: 0, minimum: WITHDRAW_GRAM_MIN, daily_cap: WITHDRAW_GRAM_DAILY_CAP, manual_above: WITHDRAW_MANUAL_ABOVE_GRAM },
      stars: { withdrawable: false, minimum_deposit: DEPOSIT_MIN_STARS },
    },
    gram_configured: !!(env.GRAM_RECEIVING_ADDRESS || ''),
    gram_float: parseNum(env.GRAM_PAYOUT_FLOAT || '0'),
    zero_payout_configured: !!(env.ZERO_PAYOUT_ADDRESS || ''),
  };
}

// POST /deposit-start { user_id, currency, amount }
// Starts a deposit. Stars -> returns an invoice payload the app
// turns into a Telegram invoice (Stars invoice with payload
// 'deposit_stars:<user_id>:<stars>'). ZERO -> returns the shop
// receiving address + a txid to paste (verified by /zero-txid).
// GRAM -> returns the TON receiving address + the GRAM amount (fixed
// from the LIVE CoinGecko rate) + a txid to paste (verified by
// /deposit-confirm via tonapi). Fails closed if GRAM is not configured.
async function handleDepositStart(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const currency = String((body && body.currency) || '');
  const amount = Number((body && body.amount) || 0);
  const lang = await apiLang(env, userId, body && body.lang);
  if (!userId) return { ok: false, reason: 'no_user' };
  if (currency === 'stars') {
    if (!Number.isFinite(amount) || amount < DEPOSIT_MIN_STARS) {
      return { ok: false, reason: 'below_minimum', minimum: DEPOSIT_MIN_STARS };
    }
    return { ok: true, currency: 'stars', amount: Math.floor(amount), payload: 'deposit_stars:' + userId + ':' + Math.floor(amount) };
  }
  if (currency === 'zero') {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
    return { ok: true, currency: 'zero', amount, address: env.ZERO_SHOP_ADDRESS || '', note: t('deposit.zero_note', lang) };
  }
  if (currency === 'gram') {
    if (!env.GRAM_RECEIVING_ADDRESS) return { ok: false, reason: 'gram_not_configured' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
    // amount is USD here — convert at the LIVE rate (never a stored one).
    const price = await tonPriceUsd(env);
    if (!price) return { ok: false, reason: 'rate_unavailable' };
    const gram = round2(amount / price);
    if (gram < DEPOSIT_MIN_GRAM) return { ok: false, reason: 'below_minimum', minimum: DEPOSIT_MIN_GRAM, gram };
    return { ok: true, currency: 'gram', amount_usd: amount, gram, rate: price, address: env.GRAM_RECEIVING_ADDRESS };
  }
  return { ok: false, reason: 'unknown_currency' };
}

// POST /deposit-confirm { user_id, currency, txid, amount, from? }
// ZERO: re-uses the existing /zero-txid flow by intent. GRAM: verifies
// the tx hash against tonapi (destination + amount + success) and
// credits the wallet GRAM balance once — the same txid can never pay
// twice (zdep:<txid> guard).
async function handleDepositConfirm(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const currency = String((body && body.currency) || '');
  const txid = String((body && body.txid) || '').trim();
  if (!userId || !txid) return { ok: false, reason: 'no_user' };
  if (await env.KV.get('zdep:' + txid)) return { ok: false, reason: 'already_confirmed' };
  if (currency === 'zero') {
    // ZERO deposit: verify the txid pays >= amount to the shop
    // receiving address (same check as a PDF purchase).
    const expected = Number((body && body.amount) || 0);
    if (!Number.isFinite(expected) || expected <= 0) return { ok: false, reason: 'invalid_amount' };
    const v = await verifyZeroPayment(env, txid, expected);
    if (!v.ok) return { ok: false, reason: v.reason || 'not_verified', paid: v.paid || 0 };
    await env.KV.put('zdep:' + txid, JSON.stringify({ user_id: userId, currency: 'zero', paid: v.paid, at: new Date().toISOString() }));
    const bal = await addWalletBalance(env, userId, 'zero', v.paid);
    await recordZeroHistory(env, userId, {
      type: 'deposit', amount: v.paid, source: 'deposit_zero',
      note: t('deposit.zero_history_note', 'bn', { txid }),
      noteKey: 'deposit.zero_history_note', noteVars: { txid },
    });
    return { ok: true, currency: 'zero', credited: v.paid, balance: bal };
  }
  if (currency === 'gram') {
    if (!env.GRAM_RECEIVING_ADDRESS) return { ok: false, reason: 'gram_not_configured' };
    const expected = Number((body && body.amount) || 0);
    const v = await verifyGramTx(env, env.GRAM_RECEIVING_ADDRESS, txid, expected);
    if (!v.ok) return { ok: false, reason: v.reason || 'not_verified', paid: v.paid || 0 };
    await env.KV.put('zdep:' + txid, JSON.stringify({ user_id: userId, currency: 'gram', paid: v.paid, at: new Date().toISOString() }));
    await addSolvency(env, 'gram_in', v.paid);
    const bal = await addWalletBalance(env, userId, 'gram', v.paid);
    await recordZeroHistory(env, userId, {
      type: 'deposit', amount: v.paid, source: 'deposit_gram',
      note: t('deposit.gram_history_note', 'bn', { txid }),
      noteKey: 'deposit.gram_history_note', noteVars: { txid },
      currency: 'GRAM',
    });
    return { ok: true, currency: 'gram', credited: v.paid, balance: bal, from: v.from };
  }
  return { ok: false, reason: 'unknown_currency' };
}

// POST /address { user_id, currency, address }
// Saves the user's payout address. ZERO: t1… (35 chars). GRAM: TON
// user-friendly (EQ/UQ, 48 chars) or raw (0: + 64 hex). The address is
// NEVER trusted for identity — only for the manual payout.
async function handleSetAddress(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const currency = String((body && body.currency) || '');
  const address = String((body && body.address) || '').trim();
  if (!userId) return { ok: false, reason: 'no_user' };
  if (currency === 'zero' && isZeroAddress(address)) {
    await env.KV.put('zaddr:' + userId + ':zero', address);
    return { ok: true, currency: 'zero', address };
  }
  if (currency === 'gram' && isTonAddress(address)) {
    await env.KV.put('zaddr:' + userId + ':gram', address);
    return { ok: true, currency: 'gram', address };
  }
  return { ok: false, reason: 'invalid_address' };
}

// POST /withdraw { user_id, currency, amount, to_wallet ('save'|'instant'), address?, device_id }
//   ZERO: NO fee, NO minimum (even 1 ZERO), anytime — but the amount
//     must exist in the chosen source (earned balance for 'instant',
//     wallet balance for 'save'). Above 500 ZERO -> Angela's manual
//     approval (payout stays PENDING until she approves).
//   GRAM: min 0.5 GRAM, daily cap min(5, 20% of float), above 2 GRAM
//     -> manual approval. SOLVENCY: GRAM out <= GRAM in — never more.
//   Phase 2 (v27) = FULLY AUTOMATIC ZERO send by the worker
//     (attemptZeroAutoSend: derive + verify address, float check,
//     build + sign + broadcast + confirm via /txid; on ANY failure
//     the payout stays 'pending_send' and Angela is notified — the
//     manual "txid <payout_id> <txid>" command and the "পাঠিয়েছি"
//     button still work as fallback). GRAM stays MANUAL (Decision 13
//     GRAM half open) — no private key for GRAM anywhere.
async function handleWithdraw(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const currency = String((body && body.currency) || '');
  const amount = Number((body && body.amount) || 0);
  const toWallet = String((body && body.to_wallet) || 'instant');
  if (!userId) return { ok: false, reason: 'no_user' };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  if (currency === 'stars') return { ok: false, reason: 'stars_not_withdrawable' };
  const gates = await getGates(env, userId);
  if (!gates.all_joined) return { ok: false, reason: 'joins_required', joins_done: gates.joins_done };
  // v27 withdraw gate (Angela's rule): instant (external) withdrawals
  // need the user to be a JOINED member of @bazargoowithdraw AND to
  // have reacted to its pinned post today (task 'react_withdraw').
  // 'save' mode (money stays in the wallet) is not gated.
  if (toWallet !== 'save') {
    const wgate = await getWithdrawGate(env, userId);
    if (!wgate.ok) return { ok: false, reason: 'withdraw_gate', withdraw_gate: wgate };
  }
  const device = await checkDevice(env, userId, body && body.device_id);
  if (!device.ok) return { ok: false, reason: 'device_conflict' };
  const today = dhakaDateStr();
  const now = new Date();
  const id = makePayoutId(now);

  if (currency === 'zero') {
    // ZERO dual-option: 'instant' pays out from the EARNINGS balance,
    // 'save' moves earned ZERO into the wallet instead.
    const earned = await getZeroBalance(env, userId);
    if (amount > earned) return { ok: false, reason: 'insufficient_balance', balance: earned };
    const dayTotal = parseNum((await env.KV.get('zwd:' + today + ':zero')) || '0') + amount;
    if (dayTotal > WITHDRAW_ZERO_DAILY_CAP) {
      return { ok: false, reason: 'daily_cap', cap: WITHDRAW_ZERO_DAILY_CAP, used_today: dayTotal - amount };
    }
    const needsManual = amount > WITHDRAW_MANUAL_ABOVE_ZERO;
    const address = String((body && body.address) || '').trim();
    if (toWallet === 'save') {
      await addZeroBalance(env, userId, -amount);
      const bal = await addWalletBalance(env, userId, 'zero', amount);
      await recordZeroHistory(env, userId, {
        type: 'save', amount, source: 'withdraw_save',
        note: t('withdraw.save_history_note', 'bn'),
        noteKey: 'withdraw.save_history_note', noteVars: {},
      });
      return { ok: true, currency: 'zero', mode: 'save', amount, wallet_balance: bal };
    }
    if (!isZeroAddress(address)) return { ok: false, reason: 'invalid_address' };
    await addZeroBalance(env, userId, -amount);
    await env.KV.put('zwd:' + today + ':zero', String(dayTotal));
    const payout = {
      id, user_id: userId, currency: 'zero', amount, address,
      status: needsManual ? 'pending_approval' : 'pending_send',
      created_at: now.toISOString(),
    };
    await kvPutJson(env, 'zpayout:' + id, payout);
    await recordZeroHistory(env, userId, {
      type: 'withdraw', amount: -amount, source: 'withdraw',
      note: t('withdraw.zero_history_note', 'bn', { id }),
      noteKey: 'withdraw.zero_history_note', noteVars: { id },
    });
    if (needsManual) await notifyAdminPayout(env, payout);
    else {
      // v27 phase 2: ≤500 ZERO sends automatically. On success the
      // payout is 'sent' with its txid; on ANY failure it stays
      // 'pending_send' and Angela is notified (manual fallback).
      const sent = await attemptZeroAutoSend(env, payout);
      if (sent.ok) {
        return { ok: true, currency: 'zero', mode: 'instant', amount, payout_id: id, status: 'sent', txid: sent.txid };
      }
    }
    return { ok: true, currency: 'zero', mode: 'instant', amount, payout_id: id, status: payout.status };
  }

  if (currency === 'gram') {
    // GRAM is closed until Decision 13 is settled (no receiving
    // address / float configured) — fail closed, never guess.
    if (!env.GRAM_RECEIVING_ADDRESS) return { ok: false, reason: 'gram_not_configured' };
    if (amount < WITHDRAW_GRAM_MIN) return { ok: false, reason: 'below_minimum', minimum: WITHDRAW_GRAM_MIN };
    const floatGram = parseNum(env.GRAM_PAYOUT_FLOAT || '0');
    const dailyCap = Math.min(WITHDRAW_GRAM_DAILY_CAP, round2(floatGram * 0.20));
    const dayTotal = parseNum((await env.KV.get('zwd:' + today + ':gram')) || '0') + amount;
    if (dayTotal > dailyCap) {
      return { ok: false, reason: 'daily_cap', cap: dailyCap, used_today: dayTotal - amount };
    }
    const sol = await getSolvency(env);
    if (sol.gram_in - sol.gram_out - amount < -1e-9) {
      return { ok: false, reason: 'insufficient_float', gram_in: sol.gram_in, gram_out: sol.gram_out };
    }
    const walletBal = await getWalletBalance(env, userId, 'gram');
    if (amount > walletBal) return { ok: false, reason: 'insufficient_balance', balance: walletBal };
    const address = String((body && body.address) || '').trim();
    if (toWallet === 'save') {
      // 'save' for GRAM means: keep it in the wallet (no move needed
      // — it is already there). Report the balance back.
      return { ok: true, currency: 'gram', mode: 'save', amount, wallet_balance: walletBal };
    }
    if (!isTonAddress(address)) return { ok: false, reason: 'invalid_address' };
    await addWalletBalance(env, userId, 'gram', -amount);
    await env.KV.put('zwd:' + today + ':gram', String(dayTotal));
    await addSolvency(env, 'gram_out', amount);
    const payout = {
      id, user_id: userId, currency: 'gram', amount, address,
      status: amount > WITHDRAW_MANUAL_ABOVE_GRAM ? 'pending_approval' : 'pending_send',
      created_at: now.toISOString(),
    };
    await kvPutJson(env, 'zpayout:' + id, payout);
    await recordZeroHistory(env, userId, {
      type: 'withdraw', amount: -amount, source: 'withdraw',
      note: t('withdraw.gram_history_note', 'bn', { id }),
      noteKey: 'withdraw.gram_history_note', noteVars: { id },
      currency: 'GRAM',
    });
    await notifyAdminPayout(env, payout);
    return { ok: true, currency: 'gram', mode: 'instant', amount, payout_id: id, status: payout.status };
  }
  return { ok: false, reason: 'unknown_currency' };
}

// GRAM solvency counters (zsol:gram_in / zsol:gram_out, grams).
async function getSolvency(env) {
  return {
    gram_in: parseNum((await env.KV.get('zsol:gram_in')) || '0'),
    gram_out: parseNum((await env.KV.get('zsol:gram_out')) || '0'),
  };
}

async function addSolvency(env, key, delta) {
  const cur = parseNum((await env.KV.get('zsol:' + key)) || '0');
  const next = round2(cur + delta);
  await env.KV.put('zsol:' + key, String(next));
  return next;
}

// Admin alert for a payout needing attention (manual approval or
// manual send). Same pattern as the PDF sale alert.
async function notifyAdminPayout(env, payout) {
  try {
    // v27: ZERO payouts usually send automatically (phase 2) — this
    // alert fires for payouts needing approval, and for auto-send
    // failures (via notifyAdminAutoFail). GRAM payouts are still
    // manual: tell Angela exactly which wallet to send FROM — the
    // separate ZERO payout wallet for ZERO payouts (never the shop
    // wallet), her TON wallet for GRAM payouts.
    const sendFrom = payout.currency === 'zero'
      ? (env.ZERO_PAYOUT_ADDRESS || '')
      : (env.GRAM_RECEIVING_ADDRESS || '');
    const text = '💸 তোলার অনুরোধ' + (payout.status === 'pending_approval' ? ' — অনুমোদন লাগবে' : '') + '\n'
      + 'আইডি: ' + payout.id + '\n'
      + 'পরিমাণ: ' + fmtZero(payout.amount) + ' ' + payout.currency.toUpperCase() + '\n'
      + 'ঠিকানা: ' + payout.address + '\n'
      + (sendFrom ? 'পাঠানোর ওয়ালেট: ' + sendFrom + '\n' : '')
      + 'ইউজার: ' + payout.user_id;
    const buttons = [];
    if (payout.status === 'pending_approval') {
      buttons.push([
        { text: '✅ অনুমোদন', callback_data: 'payout_approve:' + payout.id },
        { text: '❌ প্রত্যাখ্যান', callback_data: 'payout_reject:' + payout.id },
      ]);
    } else if (payout.status === 'pending_send') {
      buttons.push([{ text: '✅ পাঠিয়েছি', callback_data: 'payout_sent:' + payout.id }]);
    }
    await tgSend(env, ADMIN_ID, text, buttons.length ? { inline_keyboard: buttons } : undefined);
  } catch (e) { /* alert failure must not break the payout record */ }
}

// ---------- v26: Promote system (phase B) ----------
//
// Create -> payment FIRST -> Angela approves every promotion (bot
// message with approve/reject buttons) -> listed as a sponsor task
// with a "স্পন্সর" label -> auto-stops when the budget is spent.
// Pricing (calculated, plan §4.4 — never change without her say-so):
//   min budget 100 ZERO or $2.00 (≈1.91 GRAM at TON $1.045) =
//     80 completions + 20% margin; $0.02/completion anchor;
//   completer gets 1 ZERO (ZERO promos) or ~0.019 GRAM (GRAM promos,
//     fixed at payment time from the live CoinGecko TON rate).
//   Maximum budget 625 ZERO = 500 completions; $10.00 = 300 completions (40% margin buffer, Angela 2026-11-09 ~23:14).
//   Payment: ZERO / GRAM manual tx-hash at launch. Stars optional
//     LATER, not launch.
//   Verification: TG join via getChatMember where the bot is admin;
//     everything else click + 15s dwell — honestly NOT verified.
//   Accounting in USD at payment-time rates.
//   Anti-scam: no USDT-withdraw / instant-cash / guaranteed-income
//     claims, no wallet-connect tasks, no tasks asking users for money.

// POST /promote-submit { user_id, title, url, type, currency, budget, image_url? }
// Validates the form, computes completions + the GRAM amount at the
// LIVE rate, and returns a payment instruction. Nothing is stored
// yet — the promo is recorded only after payment is confirmed.
// image_url is OPTIONAL (Angela, 2026-11-10): an empty field is fine
// and must not fail validation; a non-empty one must be an http(s)
// URL (max 500 chars) and is echoed back for /promote-confirm.
export async function handlePromoteSubmit(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const title = String((body && body.title) || '').trim().slice(0, 80);
  const url = String((body && body.url) || '').trim();
  const type = String((body && body.type) || '');
  const currency = String((body && body.currency) || '');
  const budget = Number((body && body.budget) || 0);
  const imageUrl = String((body && body.image_url) || '').trim().slice(0, 500) || null;
  if (imageUrl && !/^https?:\/\/.+\..+/.test(imageUrl)) return { ok: false, reason: 'invalid_image_url' };
  const lang = await apiLang(env, userId, body && body.lang);
  if (!userId) return { ok: false, reason: 'no_user' };
  if (!title || !/^https?:\/\/.+\..+/.test(url)) return { ok: false, reason: 'invalid_url' };
  const types = ['others', 'facebook', 'facebook_page', 'youtube', 'tiktok', 'x', 'instagram', 'referral', 'telegram_channel', 'post', 'video'];
  if (types.indexOf(type) < 0) return { ok: false, reason: 'invalid_type' };
  if (currency === 'zero') {
    if (!Number.isFinite(budget) || budget < PROMOTE_MIN_BUDGET_ZERO || budget > PROMOTE_MAX_BUDGET_ZERO) {
      return { ok: false, reason: 'budget_out_of_range', min: PROMOTE_MIN_BUDGET_ZERO, max: PROMOTE_MAX_BUDGET_ZERO };
    }
    const completions = promoteCompletionsForZero(budget);
    if (completions < 1) return { ok: false, reason: 'budget_out_of_range', min: PROMOTE_MIN_BUDGET_ZERO, max: PROMOTE_MAX_BUDGET_ZERO };
    return {
      ok: true, currency: 'zero', budget, completions, image_url: imageUrl,
      reward_per_completion: PROMOTE_REWARD_ZERO,
      pay: { to: env.ZERO_SHOP_ADDRESS || '', amount: budget, currency: 'ZERO', note: t('promote.zero_pay_note', lang) },
    };
  }
  if (currency === 'gram') {
    if (!env.GRAM_RECEIVING_ADDRESS) return { ok: false, reason: 'gram_not_configured' };
    if (!Number.isFinite(budget) || budget < PROMOTE_MIN_BUDGET_USD || budget > PROMOTE_MAX_BUDGET_USD) {
      return { ok: false, reason: 'budget_out_of_range', min_usd: PROMOTE_MIN_BUDGET_USD, max_usd: PROMOTE_MAX_BUDGET_USD };
    }
    const completions = promoteCompletionsForUsd(budget);
    if (completions < 1) return { ok: false, reason: 'budget_out_of_range', min_usd: PROMOTE_MIN_BUDGET_USD, max_usd: PROMOTE_MAX_BUDGET_USD };
    const price = await tonPriceUsd(env);
    if (!price) return { ok: false, reason: 'rate_unavailable' };
    const gram = round2(budget / price);
    return {
      ok: true, currency: 'gram', budget_usd: budget, completions, image_url: imageUrl,
      reward_per_completion: gramRewardPerCompletion(price),
      rate: price,
      pay: { to: env.GRAM_RECEIVING_ADDRESS, amount: gram, currency: 'GRAM', note: t('promote.gram_pay_note', lang) },
    };
  }
  return { ok: false, reason: 'unknown_currency' };
}

// POST /promote-confirm { user_id, title, url, type, currency, budget, txid, from_wallet?, image_url? }
// Verifies the payment, then records the promotion as pending_approval
// and alerts Angela (approve/reject buttons). ZERO: verified via the
// existing zerochain /txid flow (same as a PDF purchase). GRAM:
// verified via tonapi. 'from_wallet' pays from the wallet balance
// instead of an external txid (deposit-to-buy, user's free choice).
// image_url is optional and stored as-is (null when empty).
async function handlePromoteConfirm(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const title = String((body && body.title) || '').trim().slice(0, 80);
  const url = String((body && body.url) || '').trim();
  const type = String((body && body.type) || '');
  const currency = String((body && body.currency) || '');
  const budget = Number((body && body.budget) || 0);
  const imageUrl = String((body && body.image_url) || '').trim().slice(0, 500) || null;
  if (!userId) return { ok: false, reason: 'no_user' };
  const pre = await handlePromoteSubmit(env, { user_id: userId, title, url, type, currency, budget, image_url: imageUrl });
  if (!pre.ok) return pre;
  const now = new Date();
  const id = makePromoId(now);
  let paidAmount = 0;
  if (body && body.from_wallet) {
    const bal = currency === 'zero'
      ? await getWalletBalance(env, userId, 'zero')
      : await getWalletBalance(env, userId, 'gram');
    const need = currency === 'zero' ? budget : (pre.pay && pre.pay.amount) || 0;
    if (bal < need) return { ok: false, reason: 'insufficient_balance', balance: bal, need };
    await addWalletBalance(env, userId, currency, -need);
    paidAmount = need;
  } else if (currency === 'zero') {
    const txid = String((body && body.txid) || '').trim();
    if (!txid) return { ok: false, reason: 'no_txid' };
    const v = await verifyZeroPayment(env, txid, budget);
    if (!v.ok) return { ok: false, reason: v.reason || 'not_verified' };
    if (await env.KV.get('zdep:' + txid)) return { ok: false, reason: 'already_confirmed' };
    await env.KV.put('zdep:' + txid, JSON.stringify({ user_id: userId, promo_id: id, amount: v.paid, at: now.toISOString() }));
    paidAmount = v.paid;
  } else if (currency === 'gram') {
    const txid = String((body && body.txid) || '').trim();
    if (!txid) return { ok: false, reason: 'no_txid' };
    const v = await verifyGramTx(env, env.GRAM_RECEIVING_ADDRESS, txid, (pre.pay && pre.pay.amount) || 0);
    if (!v.ok) return { ok: false, reason: v.reason || 'not_verified', paid: v.paid || 0 };
    if (await env.KV.get('zdep:' + txid)) return { ok: false, reason: 'already_confirmed' };
    await env.KV.put('zdep:' + txid, JSON.stringify({ user_id: userId, promo_id: id, amount: v.paid, at: now.toISOString() }));
    await addSolvency(env, 'gram_in', v.paid);
    paidAmount = v.paid;
  } else {
    return { ok: false, reason: 'unknown_currency' };
  }
  // If the URL points at one of OUR 4 channels, completion is verified
  // by getChatMember; everything else is click + 15s dwell (not verified).
  const target_channel = channelForUrl(url);
  const promo = {
    id, user_id: userId, title, url, type, currency,
    budget, budget_usd: currency === 'gram' ? budget : null,
    paid_amount: paidAmount, rate: pre.rate || null,
    completions: pre.completions, remaining: pre.completions, completed: 0,
    reward_per_completion: pre.reward_per_completion,
    target_channel, image_url: imageUrl,
    status: 'pending_approval',
    created_at: now.toISOString(),
  };
  await kvPutJson(env, 'zpromo:' + id, promo);
  await notifyAdminPromo(env, promo);
  return { ok: true, promo_id: id, status: 'pending_approval', completions: pre.completions };
}

function channelForUrl(url) {
  const m = String(url || '').match(/^https?:\/\/t\.me\/([A-Za-z0-9_]+)/i);
  if (!m) return null;
  const name = m[1].toLowerCase();
  for (const short of Object.keys(GATE_CHANNELS)) {
    if (GATE_CHANNELS[short].toLowerCase() === '@' + name) return GATE_CHANNELS[short];
  }
  return null;
}

async function notifyAdminPromo(env, promo) {
  try {
    const text = '📢 নতুন Promote — অনুমোদন লাগবে\n'
      + 'শিরোনাম: ' + promo.title + '\n'
      + 'লিংক: ' + promo.url + '\n'
      + (promo.image_url ? 'ছবি: ' + promo.image_url + '\n' : '')
      + 'ধরন: ' + promo.type + ' • ' + promo.currency.toUpperCase() + ' ' + fmtZero(promo.budget) + '\n'
      + 'কমপ্লিশন: ' + promo.completions + ' • প্রতি কাজে ' + fmtZero(promo.reward_per_completion) + ' ' + (promo.currency === 'gram' ? 'GRAM' : 'ZERO') + '\n'
      + 'আইডি: ' + promo.id;
    await tgSend(env, ADMIN_ID, text, {
      inline_keyboard: [[
        { text: '✅ অনুমোদন', callback_data: 'promo_approve:' + promo.id },
        { text: '❌ প্রত্যাখ্যান', callback_data: 'promo_reject:' + promo.id },
      ]],
    });
  } catch (e) { /* alert failure must not break the promo record */ }
}

// GET /promotions — the app's "📢 স্পন্সর" list (live ones only).
async function listLivePromotions(env) {
  const out = [];
  try {
    const list = await env.KV.list({ prefix: 'zpromo:' });
    for (const k of list.keys || []) {
      if (!/^zpromo:PR-/.test(k.name)) continue;
      const promo = await kvGetJson(env, k.name);
      if (!promo || promo.status !== 'live') continue;
      out.push({
        id: promo.id, title: promo.title, url: promo.url, type: promo.type,
        currency: promo.currency, reward_per_completion: promo.reward_per_completion,
        remaining: promo.remaining, completions: promo.completions,
        image_url: promo.image_url || null,
      });
    }
  } catch (e) { /* on KV trouble return what we have */ }
  return out;
}

// GET /my-promotions?user_id=… — the app's "My Promotions" list for
// the Promotion Ads page: ALL of the user's promotions (any status),
// newest first. Read-only; only the caller's own records.
export async function listMyPromotions(env, userId) {
  const out = [];
  try {
    const list = await env.KV.list({ prefix: 'zpromo:' });
    for (const k of list.keys || []) {
      if (!/^zpromo:PR-/.test(k.name)) continue;
      const promo = await kvGetJson(env, k.name);
      if (!promo || Number(promo.user_id) !== Number(userId)) continue;
      out.push({
        id: promo.id, title: promo.title, url: promo.url, type: promo.type,
        currency: promo.currency, budget: promo.budget,
        completions: promo.completions, completed: promo.completed || 0,
        remaining: promo.remaining || 0, status: promo.status,
        created_at: promo.created_at || '', image_url: promo.image_url || null,
      });
    }
  } catch (e) { /* on KV trouble return what we have */ }
  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return out;
}

// POST /sponsor-start { user_id, promo_id } — stamps the 15s dwell
// start for a non-channel sponsor task (the claim needs it).
async function handleSponsorStart(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const promoId = String((body && body.promo_id) || '');
  if (!userId || !promoId) return { ok: false, reason: 'no_user' };
  const promo = await kvGetJson(env, 'zpromo:' + promoId);
  if (!promo || promo.status !== 'live') return { ok: false, reason: 'promo_not_live' };
  if (await env.KV.get('zpromoclaim:' + userId + ':' + promoId)) return { ok: false, reason: 'already_done' };
  await env.KV.put('zpromostart:' + userId + ':' + promoId, String(Date.now()));
  return { ok: true, dwell_ms: SPONSOR_DWELL_MS, url: promo.url };
}

// ---------- v26: 4-spin redesign (phase D) ----------
//
// Replaces the v19 1/day strict spin. 4 spins/day — 2 Monetag + 2
// AdsGram — every prize is claimed by watching ONE ad. The check-in
// gate stays; streak and task-count conditions are gone. The prize is
// rolled SERVER-side in /spin-start and the slot is consumed ONLY when
// the ad-verified credit lands (no-fill never burns a slot). A pending
// spin expires after 10 minutes. Daily max is 6 (4 base + 2 extra
// from '+1 free spin' wins).

// POST /spin-start { user_id, network ('monetag'|'adsgram'), device_id }
// Rolls the prize server-side and returns the spin_id + the ad
// verification handle (Monetag: a spin-bound ymid via /monetag-start;
// AdsGram: a spin-bound nonce the app returns after the SDK reward).
// ONE pending spin per user at a time.
async function handleSpinStart(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const network = String((body && body.network) || '');
  if (!userId) return { ok: false, reason: 'no_user' };
  if (network !== 'monetag' && network !== 'adsgram') return { ok: false, reason: 'invalid_network' };
  const device = await checkDevice(env, userId, body && body.device_id);
  if (!device.ok) return { ok: false, reason: 'device_conflict' };
  const lock = await getSpinLockState(env, userId, true);
  if (lock.locked) return { ok: false, reason: 'locked', missing: lock.missing };
  const counts = await getSpinCounts(env, userId);
  const slots = spinSlotsLeft(counts);
  if (slots.total <= 0) return { ok: false, reason: 'no_spins_left', spins_today: counts.total };
  // A slot of this network is still open? (Extra spins may use either.)
  const netUsed = network === 'monetag' ? counts.mtg : counts.ads;
  const netSlots = Math.max(0, SPIN_PER_NETWORK_PER_DAY - netUsed);
  const extraFree = slots.extra > 0;
  if (netSlots <= 0 && !extraFree) return { ok: false, reason: 'network_spins_used', network };
  const pending = await kvGetJson(env, 'zspin:pending:' + userId);
  if (pending && Date.now() - pending.created_at < SPIN_PENDING_TTL_MS) {
    return { ok: false, reason: 'spin_pending', spin_id: pending.spin_id, network: pending.network };
  }
  const spinId = makeSpinId(userId);
  const prize = rollSpinPrize();
  const spin = {
    spin_id: spinId, user_id: userId, network, prize,
    created_at: Date.now(), status: 'pending',
  };
  if (network === 'monetag') {
    const ymid = 'mtg-' + userId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    spin.ymid = ymid;
    await kvPutJson(env, 'zmtg:' + ymid, {
      user_id: userId, created_at: Date.now(), status: 'pending', task: 'spin_daily', spin_id: spinId,
    }, { expirationTtl: 48 * 3600 });
  } else {
    const nonce = 'ads-' + userId + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    spin.nonce = nonce;
    await kvPutJson(env, 'zad:' + nonce, {
      user_id: userId, spin_id: spinId, created_at: Date.now(),
    }, { expirationTtl: 48 * 3600 });
  }
  await kvPutJson(env, 'zspin:pending:' + userId, spin, { expirationTtl: 600 });
  return { ok: true, spin_id: spinId, network, prize: prize === 'extra' ? 'extra' : prize, ymid: spin.ymid || null, nonce: spin.nonce || null, expires_in_ms: SPIN_PENDING_TTL_MS };
}

// Credits a pending spin after a VERIFIED ad view. Shared by the
// Monetag postback (spin-bound ymid) and the AdsGram confirm
// (spin-bound nonce). Returns the new balance + slots left.
async function creditSpinPrize(env, spin, earnerName) {
  const userId = spin.user_id;
  const today = dhakaDateStr();
  const counts = await getSpinCounts(env, userId);
  // Consume the slot NOW (credit time) — a rolled spin never burns a
  // slot on its own, so no-fill and expiry cost nothing.
  await env.KV.put('zt:' + userId + ':spin:' + today, String(counts.total + 1));
  if (spin.network === 'monetag') {
    await env.KV.put('zt:' + userId + ':spin_mtg:' + today, String(counts.mtg + 1));
  } else {
    await env.KV.put('zt:' + userId + ':spin_ads:' + today, String(counts.ads + 1));
  }
  await env.KV.delete('zspin:pending:' + userId);
  await kvPutJson(env, 'zspin:' + spin.spin_id, { ...spin, status: 'credited', credited_at: Date.now() });
  // Weekly monitoring counters (plan §4.3): spin claims vs redeems.
  await env.KV.put('zspinweek:' + dhakaWeekKey(), String(parseInt((await env.KV.get('zspinweek:' + dhakaWeekKey())) || '0', 10) + 1));
  if (spin.prize === 'extra') {
    await env.KV.put('zt:' + userId + ':spin_extra_earned:' + today, String(counts.extra_earned + 1));
    const bal = await getZeroBalance(env, userId);
    const left = spinSlotsLeft(await getSpinCounts(env, userId));
    return { ok: true, balance: bal, credited: 0, prize: 'extra', spins_left: left.total };
  }
  const balance = await creditTaskEarning(env, userId, spin.prize, 'spin_daily', '🎡 Lucky Spin', earnerName, 'spin');
  const left = spinSlotsLeft(await getSpinCounts(env, userId));
  return { ok: true, balance, credited: spin.prize, prize: spin.prize, spins_left: left.total };
}

// ---------- v26: AdsGram reward confirm (phase E wiring) ----------
//
// AdsGram's Reward format resolves client-side only when the ad is
// watched to the end — the SDK gives no signed server callback, so the
// worker CANNOT verify an AdsGram view the way it verifies Monetag
// (server postback + one-time ymid). This endpoint is the honest
// middle ground: it only credits a spin that /spin-start rolled
// (spin-bound nonce, one-time use) — the app must show the AdsGram
// Reward ad first and call this ONLY from the SDK's reward callback.
// The nonce is single-use, the spin must be pending and unexpired,
// and the user must match. App-reported AdsGram views are NOT trusted
// without a nonce (plan §5: the worker cap/idempotency is the real
// protection). Block IDs are NOT set yet (Angela's dashboard steps) —
// the app shows "শীঘ্রই আসছে" until ADSGRAM_BLOCK_ID is configured.
//
// POST /adsgram-confirm { user_id, nonce, name? }
async function handleAdsgramConfirm(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const nonce = String((body && body.nonce) || '');
  if (!userId || !nonce) return { ok: false, reason: 'no_user' };
  const rec = await kvGetJson(env, 'zad:' + nonce);
  if (!rec) return { ok: false, reason: 'unknown_nonce' };
  if (rec.user_id !== userId) return { ok: false, reason: 'user_mismatch' };
  await env.KV.delete('zad:' + nonce);
  const spin = await kvGetJson(env, 'zspin:pending:' + userId);
  if (!spin || spin.spin_id !== rec.spin_id) return { ok: false, reason: 'no_pending_spin' };
  if (Date.now() - spin.created_at > SPIN_PENDING_TTL_MS) {
    await env.KV.delete('zspin:pending:' + userId);
    return { ok: false, reason: 'spin_expired' };
  }
  const earnerName = String((body && body.name) || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 40) || null;
  return creditSpinPrize(env, spin, earnerName);
}

// GET /adsgram-reward?user_id=&nonce= — the optional Reward URL the
// AdsGram dashboard can call (audit/log only, NEVER credits — the
// nonce is one-time and the app must still confirm via POST).
async function handleAdsgramReward(env, url) {
  const nonce = String(url.searchParams.get('nonce') || '');
  const rec = nonce ? await kvGetJson(env, 'zad:' + nonce) : null;
  return { ok: !!rec, nonce, user_id: rec ? rec.user_id : null, note: 'audit only — no credit' };
}

// ---------- v26: buy a PDF with the wallet balance ----------
//
// Deposit-to-buy, user's free choice: a PDF can be bought with Stars
// (invoice, unchanged), ZERO (txid, unchanged), ZERO redeem (earned
// balance, unchanged) OR the wallet balance (this endpoint). Wallet
// Stars are NOT a currency — Stars live only as Telegram invoices,
// never as a worker balance.

// POST /buy-pdf-wallet { user_id, item_id, currency ('zero'|'gram'), name?, device_id? }
async function handleBuyPdfWallet(env, body) {
  const userId = Number((body && body.user_id) || 0);
  const itemId = String((body && body.item_id) || '');
  const currency = String((body && body.currency) || 'zero');
  const item = catalogGet(itemId);
  if (!userId) return { ok: false, reason: 'no_user' };
  if (!item || item.free) return { ok: false, reason: 'invalid_item' };
  if (item.reward_only) return { ok: false, reason: 'reward_only' };
  if (currency === 'zero') {
    const price = Number(item.price_zero);
    if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'no_zero_price' };
    const bal = await getWalletBalance(env, userId, 'zero');
    if (bal < price) return { ok: false, reason: 'insufficient_balance', balance: bal, price };
    await addWalletBalance(env, userId, 'zero', -price);
    const sale = {
      sale_id: makeSaleId(),
      user_id: userId,
      username: null,
      item_id: item.id,
      item_type: 'pdf',
      currency: 'ZERO',
      amount: price,
      status: 'paid',
      telegram_payment_charge_id: null,
      txid: null,
      source: 'wallet_zero',
      created_at: new Date().toISOString(),
    };
    const res = await deliverPdf(env, sale);
    await recordZeroHistory(env, userId, {
      type: 'purchase', amount: -price, source: 'purchase',
      note: item.title || item.id, noteKey: 'pdf.title.' + item.id, noteVars: {},
    });
    return { ok: true, balance: bal - price, sale_id: sale.sale_id, item_id: itemId, wallet: true, delivered: res.delivered };
  }
  if (currency === 'stars') {
    // Wallet Stars are PREPAID Stars (collected at deposit time via a
    // Stars invoice) — buying with them draws the balance down and
    // delivers immediately. No new invoice is issued here.
    const price = Number(item.price_stars);
    if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'no_stars_price' };
    const bal = await getWalletBalance(env, userId, 'stars');
    if (bal < price) return { ok: false, reason: 'insufficient_balance', balance: bal, price };
    await addWalletBalance(env, userId, 'stars', -price);
    const sale = {
      sale_id: makeSaleId(),
      user_id: userId,
      username: null,
      item_id: item.id,
      item_type: 'pdf',
      currency: 'STAR',
      amount: price,
      status: 'paid',
      telegram_payment_charge_id: null,
      txid: null,
      source: 'wallet_stars',
      created_at: new Date().toISOString(),
    };
    const res = await deliverPdf(env, sale);
    return { ok: true, balance: bal - price, sale_id: sale.sale_id, item_id: itemId, wallet: true, delivered: res.delivered };
  }
  if (currency === 'gram') {
    if (!env.GRAM_RECEIVING_ADDRESS) return { ok: false, reason: 'gram_not_configured' };
    return { ok: false, reason: 'gram_price_not_set' };
  }
  return { ok: false, reason: 'unknown_currency' };
}

// ---------- Worker entry point ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight for the app's POST calls (/claim, /redeem,
    // /monetag-start, /monetag-postback).
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/reviews.json') {
      const approved = (await kvGetJson(env, 'reviews:approved')) || [];
      return new Response(JSON.stringify({ reviews: approved }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/my_pdfs') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      if (!userId) {
        return new Response(JSON.stringify({ pdfs: [] }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      const pdfs = await listUserPdfs(env, userId);
      return new Response(JSON.stringify({ pdfs }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    // ---------- micro-task earn (Phase 3, v1) ----------
    if (url.pathname === '/tasks') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      if (!userId) {
        return new Response(JSON.stringify({ balance: 0, tasks: [] }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      // Display name comes from Telegram initData (app-side); the worker
      // only echoes it back in the profile, never trusts it for identity.
      const rawName = (url.searchParams.get('name') || '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 40);
      const deviceId = (url.searchParams.get('device_id') || '').trim().slice(0, 64) || null;
      const lang = await apiLang(env, userId, url.searchParams.get('lang'));
      const data = await getTasksState(env, userId, rawName || null, deviceId, lang);
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/referrals') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      const data = userId ? await getReferrals(env, userId, await apiLang(env, userId, url.searchParams.get('lang'))) : { referral_earnings: 0, referrals: [] };
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/history') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      const kind = (url.searchParams.get('kind') || '').trim();
      const data = userId ? await getZeroHistory(env, userId, kind, await apiLang(env, userId, url.searchParams.get('lang'))) : { entries: [], balance: 0 };
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    // ---------- v19: leaderboard, referral contest, ZERO coupons ----------
    if (url.pathname === '/leaderboard') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      const data = await getLeaderboardData(env, userId, await apiLang(env, userId, url.searchParams.get('lang')));
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    // ---------- v23: religion reward PDFs (top performers) ----------
    if (url.pathname === '/religion') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      const data = userId ? await getReligionData(env, userId, await apiLang(env, userId, url.searchParams.get('lang'))) : { eligible: false, ranks: { daily: null, weekly: null, monthly: null }, pdfs: [] };
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/referral-contest') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      const data = await getContestData(env, userId, await apiLang(env, userId, url.searchParams.get('lang')));
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/coupons') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      const coupons = userId ? await listUserCoupons(env, userId) : [];
      return new Response(JSON.stringify({ coupons }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/coupon') {
      const code = (url.searchParams.get('code') || '').trim();
      const userId = Number(url.searchParams.get('user_id') || 0);
      const data = userId ? await verifyCoupon(env, code, userId) : { ok: false, reason: 'no_user' };
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/coupon/use' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await useCoupon(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/claim' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleClaim(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    // ---------- v25: Monetag Rewarded Interstitial ----------
    if (url.pathname === '/monetag-start' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleMonetagStart(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/monetag-postback') {
      // Monetag's server postback is a GET with query macros; the
      // app's confirmation after a 'valued' SDK result is a POST
      // with JSON. Both go through the same one-time-use ymid check.
      if (request.method === 'GET') {
        const secret = (env.MONETAG_POSTBACK_SECRET || '').trim();
        if (secret && url.searchParams.get('secret') !== secret) {
          return new Response(JSON.stringify({ ok: false, reason: 'bad_secret' }), {
            status: 403, headers: { 'Content-Type': 'application/json' },
          });
        }
        const res = await handleMonetagPostback(env, {
          ymid: url.searchParams.get('ymid'),
          reward_event_type: url.searchParams.get('reward_event_type'),
          event_type: url.searchParams.get('event_type'),
          estimated_price: url.searchParams.get('estimated_price'),
          telegram_id: url.searchParams.get('telegram_id'),
          request_var: url.searchParams.get('request_var'),
        });
        return new Response(JSON.stringify(res), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      if (request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch (e) { body = null; }
        const res = await handleMonetagPostback(env, body);
        return new Response(JSON.stringify(res), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
      return new Response('Method Not Allowed', { status: 405 });
    }
    if (url.pathname === '/redeem' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleRedeem(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/go') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      if (url.searchParams.get('ad') === 'zerads' && userId) {
        await handleAdClick(env, userId);
      }
      return Response.redirect('https://zerads.com/', 302);
    }
    // ---------- v26: Wallet + Deposit + Withdraw + Promote + 4-spin ----------
    if (url.pathname === '/wallet') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      const data = userId ? await getWalletState(env, userId) : { ok: false, reason: 'no_user' };
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/deposit-start' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleDepositStart(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/deposit-confirm' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleDepositConfirm(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/address' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleSetAddress(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/withdraw' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleWithdraw(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/promote-submit' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handlePromoteSubmit(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/promote-confirm' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handlePromoteConfirm(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/promotions') {
      const list = await listLivePromotions(env);
      return new Response(JSON.stringify({ promotions: list }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/my-promotions') {
      const userId = Number(url.searchParams.get('user_id') || 0);
      const list = userId ? await listMyPromotions(env, userId) : [];
      return new Response(JSON.stringify({ promotions: list }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/sponsor-start' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleSponsorStart(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/spin-start' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleSpinStart(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/adsgram-confirm' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleAdsgramConfirm(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/adsgram-reward') {
      const res = await handleAdsgramReward(env, url);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/buy-pdf-wallet' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch (e) { body = null; }
      const res = await handleBuyPdfWallet(env, body);
      return new Response(JSON.stringify(res), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (url.pathname === '/') {
      return new Response('BazarGoo worker ok\n', { headers: { 'Content-Type': 'text/plain' } });
    }

    const secret = (env.WEBHOOK_SECRET || '').trim();
    if (!secret || url.pathname !== '/webhook/' + secret) {
      return new Response('Forbidden', { status: 403 });
    }
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    let update;
    try {
      update = await request.json();
    } catch (e) {
      return new Response('Bad Request', { status: 400 });
    }
    await handleUpdate(update, env);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
