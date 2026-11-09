/* BazarGoo Telegram Mini App — checkout v2 (8 Nov 2026, per Angela)
 * Browse real bazargoo.com products, cart, and place an order.
 * Inside Telegram the order is sent to the bot via sendData();
 * outside Telegram the order summary is shown with a copy button.
 * Checkout: delivery form (name auto-filled from Telegram, phone via
 * Telegram contact share or typed, address typed), shipping Inside
 * Dhaka ৳60 / Outside Dhaka ৳120, payment Cash on Delivery only.
 * Sales features (8 Nov 2026): product share, flash deals
 * (daily-rotated discounted products with a countdown to midnight
 * Dhaka time), wishlist (localStorage).
 * First-order coupon (Angela, 8 Nov 2026): BAZAR5 = 5% off the first
 * order. Enforcement is PER-DEVICE only (localStorage) — there is no
 * server-side check, so do not claim the coupon cannot be reused.
 * Reviews (8 Nov 2026): real reviews only — approved reviews are
 * fetched from reviews.json (published by the shop after the admin
 * approves them in the bot); a buyer's own submitted review is stored
 * on their device until approved. Nothing is ever invented.
 * PDF payments (Phase 1, 8 Nov 2026): a "📚 PDF" section lists free and
 * paid PDFs from payments/pdf_catalog.json. Paid PDFs are bought through
 * the bot (@BazarGooBot) via deep links — sendData never reaches
 * Telegram, so the app never talks to the bot directly. Stars:
 * t.me/BazarGooBot?start=buy_<id> (the bot sends a Stars invoice and
 * delivers the PDF after payment). ZERO: a sheet shows the steps and a
 * deep link to t.me/BazarGooBot?start=zero_<id> (the buyer sends ZERO,
 * then pastes the txid to the bot for verification). Approved reviews
 * are fetched from the worker (WORKER_URL + '/reviews.json') when it is
 * set, otherwise from the static reviews.json.
 * v23 (9 Nov 2026): PDF library grouped by category (টেস্ট / কেনাকাটা /
 * AI টিউটোরিয়াল / ধর্মীয় বই); AI tutorials show a free preview button
 * (public preview PDFs); religion books are reward-only — free for
 * daily/weekly/monthly top-3 performers (GET /religion, POST /claim
 * religion_pdf). All paid PDFs stay 1–10 Stars / 1–10 ZERO.
 * v24 (9 Nov 2026): PDF library +15 commercial guides (35 total) in 4 new
 * categories — অনলাইন আয় / ক্যারিয়ার / ভাষা ও পড়াশোনা / স্বাস্থ্য;
 * health guides carry a medical disclaimer on every page.
 * v25 (9 Nov 2026): Monetag Rewarded Interstitial ad task — 1 ZERO per
 * VERIFIED view (Monetag 'valued' event only), max 5/day, 30s cooldown,
 * separate cap from the Zerads task. SDK zone ID + script URL come
 * from Angela's Monetag dashboard (MONETAG_ZONE_ID / MONETAG_SDK_URL
 * below) — until set, the task shows "coming soon" and no ad runs.
 * v26 (9 Nov 2026): Wallet (Deposit/Withdraw: Stars invoice, ZERO/GRAM
 * manual tx-hash; ZERO no fee/no minimum; GRAM min 0.5, daily caps,
 * solvency, manual approval above 2 GRAM — payouts manual by Angela),
 * Promote sponsor tasks (payment first, admin approval, auto-stop at
 * budget), join gates (all 4 channels for spin/prizes/withdraw), 4-spin
 * redesign (2 Monetag + 2 AdsGram/day, ad-gated claims, check-in gate
 * kept), PDF wallet-buy. Monetag zone ID + AdsGram block ID are EMPTY
 * placeholders — dashboard values from Angela, never invented.
 * v26 (9 Nov 2026): Wallet + Promote + Withdraw + 4-spin redesign.
 * Wallet (Profile tab): per-currency balances (earned ZERO + wallet
 * ZERO/GRAM/Stars), Deposit (Stars invoice / ZERO / GRAM manual
 * tx-hash) + Withdraw (ZERO: no fee, no minimum; GRAM min 0.5, daily
 * caps, solvency, manual approval above 2 GRAM; payouts are manual
 * by Angela + txid log — NO private key anywhere). Deposit-to-buy is
 * the user's free choice — direct payment always stays. ZERO
 * dual-option (instant pay/payout OR wallet save) at every ZERO
 * checkout/withdrawal. Join/react gates (all 4 channels verified)
 * gate spin + leaderboard/contest prizes + withdraw; the Profile
 * card shows the "প্রোফাইল সম্পূর্ণ করুন" checklist + an inactive
 * Security row. Promote: create -> pay first (ZERO/GRAM) -> Angela
 * approves -> live sponsor task (80 completions per 100 ZERO / $2,
 * completer 1 ZERO / ~0.019 GRAM). 4 spins/day (2 Monetag + 2
 * AdsGram), every prize claimed by watching ONE ad; check-in gate
 * kept; +1 free spin wins raise the daily max to 6. AdsGram block
 * ID (ADSGRAM_BLOCK_ID below) is empty until Angela's dashboard
 * steps are done — spin/ads tasks show "coming soon" meanwhile.
 * v27 (10 Nov 2026): ZERO auto-send (phase 2) — ≤500 ZERO payouts
 * send automatically from the payout wallet (worker signs + broadcasts
 * + confirms; >500 ZERO still needs Angela's approval, then it also
 * auto-sends); GRAM payouts stay manual. Withdraw gate: instant
 * withdrawals need @bazargoowithdraw join + today's react stamp
 * (task 'react_withdraw', reward 0) — the wallet sheet shows the two
 * gate steps with live status; every completed payout posts a proof
 * to @bazargoowithdraw (amount + user + payout id + txid — never the
 * destination address).
 * v28 (10 Nov 2026): Pickaxe-style redesign (always-dark theme, lime
 * CTAs, gold money numbers, 30px/900 section headings) + i18n gap
 * fix: worker GETs now send ?lang= so task titles/quiz/history
 * translate in English mode; header balance pill + full Wallet
 * screen (hero, currency rows, gate status, history, ZERO guide);
 * Profile/Friend stat tiles; Daily Reward title lime+white split.
 */
(function () {
  'use strict';

  var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  var IN_TELEGRAM = !!tg;

  // ---------- i18n (Phase 1, 10 Nov 2026) ----------
  // STRINGS is inlined from i18n/en.json + i18n/bn.json by
  // i18n/generate-inline.js (run: node i18n/generate-inline.js). The JSON
  // files stay the source of truth — never hand-edit the block below.
  // __I18N_STRINGS_BEGIN__ (generated by i18n/generate-inline.js — do not hand-edit; edit i18n/en.json + i18n/bn.json and re-run: node i18n/generate-inline.js)
  var STRINGS = {"bn":{"browser.address_or_search_aria_label":"ঠিকানা বা সার্চ","browser.browser_heading":"🌐 ব্রাউজার","browser.browser_hint":"লিংক লিখে যাও চাপো — Telegram-এর ব্রাউজারেই খুলবে, ফিরে আসতে ব্যাক চাপো।","browser.browser_nav_label":"ব্রাউজার","browser.enter_valid_link_or_search":"সঠিক লিংক লিখুন (যেমন: bazargoo.com) অথবা কিছু সার্চ করুন।","browser.link_or_search_placeholder":"লিংক লিখুন বা সার্চ করুন…","browser.no_history_yet":"এখনো কিছু ব্রাউজ করা হয়নি — উপরে লিংক লিখে শুরু করুন।","browser.quick_links_heading":"⚡ দ্রুত লিংক","cart.add_to_cart_first":"প্রথমে কার্টে পণ্য যোগ করুন।","cart.cart_empty":"কার্ট খালি।","cart.choose_district":"জেলা বাছুন।","cart.choose_district_placeholder":"জেলা বাছুন…","cart.copy_order":"অর্ডার কপি করুন","cart.coupon_already_used_or_not_found":"কুপনটি ইতিমধ্যে ব্যবহার করা হয়েছে বা পাওয়া যায়নি — কুপন ছাড়া অর্ডার করুন।","cart.coupon_bazar5_label":"BAZAR5 — প্রথম অর্ডারে ৫%","cart.coupon_could_not_be_used":"কুপনটি ব্যবহার করা যায়নি — আবার কুপন দিন।","cart.coupon_zero5_telegram_only":"ZERO5 কুপন শুধু Telegram অ্যাপে ব্যবহার করা যায়।","cart.delivery_charge":"ডেলিভারি চার্জ","cart.delivery_charge_row":"<div class=\"summary-row small\"><span>ডেলিভারি চার্জ</span><span>","cart.district_label":"District / জেলা","cart.enter_full_address":"সম্পূর্ণ ঠিকানা লিখুন।","cart.items_count_suffix":"টি পণ্য","cart.main_button_place_order":"অর্ডার করুন •","cart.main_button_view_cart":"কার্ট দেখুন •","cart.my_orders":"আমার অর্ডার 📦","cart.no_orders_hint":"প্রথম অর্ডার করলেই এখানে দেখতে পাবেন।","cart.no_orders_yet":"এখনো কোনো অর্ডার নেই।","cart.order_confirmation_coming":"বট থেকে শীঘ্রই কনফার্মেশন মেসেজ আসবে। কনফার্মেশন না এলে নিচের অর্ডারটি কপি করে বটের চ্যাটে পাঠান।","cart.order_confirmation_note":"অর্ডারটি দোকানে পাঠানো হবে। দোকান থেকে মেসেজ করে অর্ডারটি কনফার্ম করা হবে।","cart.order_copy_if_no_confirmation":"বট থেকে কনফার্মেশন না পেলে উপরের অর্ডারটি কপি করে চ্যাটে পাঠান।","cart.order_details_heading":"অর্ডারের বিবরণ","cart.order_district_label":"<div class=\"order-district\">জেলা:","cart.order_sent_message":"ধন্যবাদ! আপনার অর্ডারটি পাঠানো হয়েছে।","cart.order_sent_title":"অর্ডার পাঠানো হয়েছে!","cart.order_summary_address":"ঠিকানা:","cart.order_summary_delivery":"ডেলিভারি (","cart.order_summary_district":"জেলা:","cart.order_summary_heading":"🛍️ BazarGoo অর্ডার","cart.order_summary_number":"অর্ডার নং:","cart.order_summary_subtotal":"পণ্যের মোট: ৳","cart.pdf_zero_address_from_bot":"<p>দোকানের ZERO ঠিকানাটি বট জানিয়ে দেবে।</p>","cart.pdf_zero_address_label":"<p><strong>ঠিকানা:</strong><br><code>","cart.pdf_zero_step_one":"<p>১. বটে গিয়ে ZERO ঠিকানা ও সঠিক পরিমাণ দেখে নিন","cart.remove_item_button":"\">সরান</button>","cart.view_cart":"কার্ট দেখুন","cart.view_my_orders":"আমার অর্ডার দেখুন","cart.your_cart":"আপনার কার্ট 🛒","common.ad_could_not_be_shown":"বিজ্ঞাপন দেখানো যায়নি — আবার চেষ্টা করো।","common.add_button":"\">যোগ করুন</button>","common.add_favourite_products_empty":"পছন্দের পণ্য যোগ করুন।","common.add_to_favourites":"♡ পছন্দের তালিকায় যোগ করুন","common.address_placeholder":"বাসা/হোল্ডিং, রোড, এলাকা, থানা","common.after_cooldown_button_fragment":"</span> পর</button>","common.after_cooldown_can_do_fragment":"</span> পর করা যাবে</div>","common.after_cooldown_fragment":"</span> পর","common.again_in_button_fragment":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>আবার <span data-cd-ms=\"","common.again_in_cooldown_fragment":"— আবার <span data-cd-ms=\"","common.apply_button":"প্রয়োগ করুন","common.available_now":"এখন করা যাবে","common.baby_care":"শিশুর যত্ন","common.bazargoo_channel":"BazarGoo চ্যানেল","common.bazargoo_shop":"BazarGoo দোকান","common.beauty_and_care":"বিউটি ও যত্ন","common.browser_go_button":"যাও","common.buy_again_button":"\">আবার কিনুন</button></div>","common.buy_with_zero":"⛓️ ZERO দিয়ে কিনুন","common.category_label":"ক্যাটাগরি","common.check_internet_reopen":"ইন্টারনেট চেক করে আবার খুলুন।","common.chip_all":"\" data-cat=\"all\" type=\"button\">সব (","common.chip_wishlist":"\" data-cat=\"__wishlist\" type=\"button\">❤️ পছন্দের (","common.cleaning":"পরিষ্কার-পরিচ্ছন্নতা","common.clear_history":"🗑️ ইতিহাস মুছুন","common.close":"বন্ধ করুন","common.coming_soon_monetag":"<div class=\"task-status\">শীঘ্রই আসছে — Monetag ড্যাশবোর্ড সেটআপের অপেক্ষায়</div>","common.completed_status_done":"<div class=\"task-status done\">সম্পন্ন ✓</div>","common.congratulations_you_won":"🎉 অভিনন্দন! আপনি জিতেছেন","common.cooldown_more_today_fragment":"</span> পর • আজ আরও","common.copied":"কপি হয়েছে ✓","common.copy_button":"📋 কপি করুন","common.discount_amount_suffix":"): −৳","common.discount_percent_suffix_html":"— ৫%)</span><span class=\"order-discount\">−","common.discount_zero":"−৳০","common.do_again_in_fragment":"<div class=\"task-status\">আবার <span data-cd-ms=\"","common.done_today":"আজ হয়েছে ✓","common.done_today_status":"<div class=\"task-status done\">আজ হয়েছে ✓","common.download_again_button":"\">⬇️ আবার ডাউনলোড করুন</button>","common.earnplaygame_channel":"EarnPLayGame চ্যানেল","common.electronics":"ইলেকট্রনিক্স","common.enter_full_name":"আপনার পুরো নাম লিখুন।","common.enter_valid_mobile_number":"সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)।","common.exercise":"ব্যায়াম","common.flash_deal":"⚡ ফ্ল্যাশ ডিল","common.flash_deal_ends_in":"শেষ হতে বাকি","common.flash_deal_ends_in_timer":"শেষ হতে বাকি --:--:--","common.full_name_placeholder":"আপনার পুরো নাম","common.gadgets":"গ্যাজেট","common.get_number_from_telegram":"📱 Telegram থেকে নম্বর নিন","common.headphones":"হেডফোন","common.health_and_beauty":"স্বাস্থ্য ও বিউটি","common.home_and_living":"হোম ও লিভিং","common.home_appliances":"হোম অ্যাপ্লায়েন্স","common.household":"গৃহস্থালি","common.in_favourites":"❤️ পছন্দের তালিকায় আছে","common.in_stock":"✓ স্টকে আছে","common.in_stock_badge":"<span class=\"stock-badge in-stock\">✓ স্টকে আছে</span>","common.inside_dhaka":"ঢাকার ভেতরে","common.jewellery":"জুয়েলারি","common.join_adsterratt_channel":"@adsterratt চ্যানেলে জয়েন","common.join_bazargoo_channel":"@bazargoo287 চ্যানেলে জয়েন","common.join_channel_button":"\">✈️ চ্যানেলে জয়েন করুন</button>","common.join_channel_first":"<div class=\"task-status\">প্রথমে চ্যানেলে জয়েন করো</div>","common.join_channel_link":"\" target=\"_blank\" rel=\"noopener\">চ্যানেলে জয়েন করুন</a>","common.join_cryptoguru_channel":"@cryptoguru_247 চ্যানেলে জয়েন","common.join_earnplaygame_channel":"@earnplaygame21 চ্যানেলে জয়েন","common.join_task_done":"হয়ে গেছে ✓","common.join_will_be_verified":"<div class=\"task-status\">জয়েন যাচাই করা হবে ✓ • শেষ পোস্টটি উপরে দেখতে পাবে</div>","common.kitchen":"রান্নাঘর","common.label_mobile":"মোবাইল:","common.label_name":"নাম:","common.leaderboard_congrats_rank":"🏆 অভিনন্দন! গত সপ্তাহে #","common.main_menu":"মূল মেনু","common.mens_clothing":"পুরুষদের পোশাক","common.mens_fashion":"পুরুষদের ফ্যাশন","common.monthly_bonus_claimed":"এই মাসের বোনাস পাওয়া গেছে ✓","common.monthly_target_gets_you_fragment":"হলেই","common.more_times_limit_fragment":"বার • দিনে ৫ বার পর্যন্ত</div>","common.more_times_today_fragment":"বার</div>","common.name_from_telegram_hint":"নাম টেলিগ্রাম থেকে নেওয়া হয়েছে — ভুল থাকলে ঠিক করে নিন।","common.nebulizer":"নেবুলাইজার","common.no_ads_right_now":"এখন কোনো বিজ্ঞাপন নেই — একটু পরে আবার চেষ্টা করো।","common.once_every_24_hours":"<div class=\"task-status\">২৪ ঘণ্টায় ১ বার</div>","common.open_first_then_claim":"<div class=\"task-status\">প্রথমে পেইজ/চ্যানেলটি খুলুন, তারপর দাবি করুন</div>","common.open_pinned_post_link":"<a class=\"btn-secondary pdf-btn\" href=\"https://t.me/bazargoo287/83\" target=\"_blank\" rel=\"noopener\">❤️ পিন করা পোস্ট খুলুন</a>","common.order_status_sent":"</strong><span class=\"order-status\">পাঠানো হয়েছে</span></div>","common.other_category":"অন্যান্য","common.out_of_stock":"স্টক শেষ","common.out_of_stock_badge":"<span class=\"stock-badge out-of-stock\">স্টক শেষ</span>","common.out_of_stock_button":"<button class=\"btn-add btn-add-disabled\" type=\"button\" disabled>স্টক শেষ</button>","common.outside_dhaka":"ঢাকার বাইরে","common.page_subtitle":"অনলাইন শপ • bazargoo.com","common.page_title":"BazarGoo — অনলাইন শপ","common.pdf_purchased_note":"<div class=\"pdf-note\">কেনা হয়েছে ✓</div>","common.phone_not_found_type_manually":"নম্বর পাওয়া যায়নি — নিজে লিখুন।","common.phone_not_shared_type_manually":"নম্বর শেয়ার করেননি — নিজে লিখুন।","common.phone_request_allow_in_telegram":"অনুরোধ পাঠানো হয়েছে — টেলিগ্রামে Allow করুন…","common.phone_request_please_wait":"অনুরোধ পাঠানো হয়েছে — একটু অপেক্ষা করুন…","common.prices_from_bazargoo_date":"দাম bazargoo.com থেকে নেওয়া • ৮ নভেম্বর ২০২৬","common.products_found_suffix":"টি পণ্য পাওয়া গেছে","common.products_load_failed":"প্রোডাক্ট লোড করা যায়নি।","common.products_total":"পণ্যের মোট","common.profile_task_done":"হয়েছে ✓","common.profile_task_remaining":"বাকি","common.promote_heading":"📢 Promote করুন","common.qty_decrease":"\" aria-label=\"কমান\">−</button>","common.qty_increase":"\" aria-label=\"বাড়ান\">+</button></div>","common.rate_it":"রেটিং দিন","common.react_to_pinned_post":"পিন করা পোস্টে রিঅ্যাক্ট","common.recent":"🕐 সাম্প্রতিক","common.recently_viewed":"🕐 সম্প্রতি দেখা","common.redeem_failed_try_again":"রিডিম করা যায়নি — আবার চেষ্টা করুন।","common.remaining_count_fragment":"<div class=\"task-status\">বাকি","common.remaining_external_follow_note":"টি • বাইরের ফলো/সাবস্ক্রাইব যাচাই করা যায় না — ১৫ সেকেন্ড দেখার পর দাবি করুন</div>","common.reward_label":"<div class=\"task-status\">পুরস্কার:","common.search_products_label":"প্রোডাক্ট খুঁজুন","common.search_products_placeholder":"প্রোডাক্ট খুঁজুন…","common.share_button":"↗ শেয়ার করুন","common.shop_tab":"দোকান","common.shop_will_message_to_confirm":"দোকান থেকে মেসেজ করে কনফার্ম করা হবে।","common.sort_label":"সাজান","common.sort_popular":"সাজান: জনপ্রিয়","common.sort_price_high_to_low":"দাম: বেশি থেকে কম","common.sort_price_low_to_high":"দাম: কম থেকে বেশি","common.submit_answers_button":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-quiz-submit>উত্তর জমা দিন</button>","common.summary_products_total_html":"<div class=\"summary-row small\"><span>পণ্যের মোট</span><span>","common.summary_total_html":"<div class=\"summary-row\"><span>মোট</span><strong>","common.tap_to_copy":"চাপ দিলে কপি হবে","common.task_completed_status":"<div class=\"task-status done\">সম্পন্ন ✓","common.times_limit_watch_full_ad":"বার • দিনে ৫ বার পর্যন্ত • বিজ্ঞাপন পুরো দেখলে পুরস্কার</div>","common.today_five_times_done":"<div class=\"task-status done\">আজকের ৫ বার শেষ ✓ — আবার <span data-cd-ms=\"","common.today_five_times_done_button":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>আজকের ৫ বার শেষ ✓</button>","common.today_more_times_fragment":"<div class=\"task-status\">আজ আরও","common.total":"মোট","common.total_taka":"মোট: ৳","common.toys":"খেলনা","common.trimmer":"ট্রিমার","common.verify_button":"যাচাই করুন","common.view_button":"👁️ দেখুন","common.view_on_bazargoo":"bazargoo.com-এ দেখুন ↗","common.view_shop_button":"<button class=\"btn-primary\" type=\"button\" data-wallet-shop>🛍️ দোকান দেখুন</button>","common.watch_ad_link":"\" target=\"_blank\" rel=\"noopener\">👁️ বিজ্ঞাপন দেখুন</a>","common.womens_fashion":"নারীদের ফ্যাশন","common.write_review_placeholder":"আপনার অভিজ্ঞতা লিখুন (ঐচ্ছিক)…","common.xp_left_fragment":"XP বাকি</span></div>","common.you_won_today":"🎉 আজ জিতেছেন","common.your_zero_balance":"আপনার ZERO: ০","common.zero_prize_received":"ZERO পুরস্কার পেয়েছেন!","common.zero_products":"০টি পণ্য","contest.claim_this_pdf_free_button":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-contest-claim>🎁 এই PDF-টি ফ্রি নিন</button>","contest.congrats_last_month_winner":"<div class=\"pdf-note\">🎉 অভিনন্দন — আপনি গত মাসের বিজয়ী! আপনার পছন্দের ১টি PDF ফ্রি নিন:</div>","contest.direct_referrals_label":"</div><div class=\"hist-date\">সরাসরি রেফারেল</div></div>","contest.last_month_winner_open":"<div class=\"task-status\">গত মাসের বিজয়ী (","contest.loading_pdf_list":"<div class=\"pdf-note\">PDF তালিকা লোড হচ্ছে…</div>","contest.no_referrals_yet_this_month":"<div class=\"pdf-note\">এই মাসে এখনো কেউ রেফারেল করেনি — লিংক শেয়ার করে প্রথম হোন!</div>","contest.people_suffix":"জন</div>","contest.prize_claimed_see_bot_chat":"<div class=\"task-status done\">আপনার পুরস্কার নেওয়া হয়েছে ✓ — বটের চ্যাটে PDF দেখুন।</div>","contest.referral_contest_title":"🎁 রেফারেল প্রতিযোগিতা","contest.referrals_count_suffix_rows":"জন</div></div>","contest.referrals_suffix":"জন রেফারেল</div>","contest.this_month_open":"<div class=\"pdf-note\">এই মাসে (","contest.top5_this_month_last_winner_prize":") সবচেয়ে বেশি বন্ধু আনা ৫ জন — গত মাসের বিজয়ী পাবে নিজের পছন্দের ১টি PDF ফ্রি।</div>","contest.your_referrals_this_month":"<div class=\"task-status\">আপনার এই মাসের রেফারেল:","coupons.banner_bazar5_used":"<span class=\"coupon-banner-text\">✓ BAZAR5 ব্যবহার করা হয়েছে</span>","coupons.banner_first_order_5pct_bazar5":"<span class=\"coupon-banner-text\">🎉 প্রথম অর্ডারে ৫% ছাড় — কুপন: <strong>BAZAR5</strong></span>","coupons.banner_first_order_discount_used":"<span class=\"coupon-banner-hint\">প্রথম অর্ডারের ছাড়টি ব্যবহার করা হয়েছে</span>","coupons.banner_tap_to_copy":"<span class=\"coupon-banner-hint\">চাপ দিলে কপি হবে</span>","coupons.buy_coupon_100_zero_button":"<button class=\"btn-primary\" type=\"button\" data-buy-coupon>🎟️ কুপন কিনুন — ১০০ ZERO</button>","coupons.code_shows_after_buy_note":"<div class=\"task-status\">কেনার পর কোডটি নিচে দেখাবে — চেকআউটে কোডটি লিখলেই ৫% ছাড়।</div>","coupons.copy_code_button":"\">📋 কোড কপি করুন</button>","coupons.coupon_already_used":"এই কুপনটি ইতিমধ্যে ব্যবহার করা হয়েছে।","coupons.coupon_bought_code":"🎟️ কুপন কেনা হয়েছে! কোড:","coupons.coupon_buy_failed":"কুপন কেনা যায়নি — আবার চেষ্টা করুন।","coupons.coupon_code_not_found":"কুপন কোডটি পাওয়া যায়নি।","coupons.coupon_code_placeholder":"কুপন কোড (যেমন: BAZAR5)","coupons.coupon_not_used_yet":"ব্যবহার করা হয়নি — চেকআউটে ব্যবহার করুন","coupons.coupon_not_yours":"এই কুপনটি আপনার নয়।","coupons.coupon_used":"ব্যবহার করা হয়েছে ✓","coupons.coupon_verify_failed_internet":"কুপন যাচাই করা যায়নি — ইন্টারনেট চেক করুন।","coupons.coupon_verify_failed_retry":"কুপন যাচাই করা যায়নি — আবার চেষ্টা করুন।","coupons.discount_bazar5_5pct":"ছাড় (BAZAR5 — ৫%)","coupons.discount_label_open_order_summary":"ছাড় (","coupons.discount_zero5_5pct":"ছাড় (ZERO5 — ৫%)","coupons.first_order_5pct_coupon_label":"🎉 প্রথম অর্ডারে ৫% ছাড় — কুপন:","coupons.five_percent_off_applied":"৫% ছাড় প্রয়োগ হয়েছে! 🎉","coupons.five_percent_off_applied_zero5":"৫% ছাড় প্রয়োগ হয়েছে! 🎉 (ZERO5 কুপন)","coupons.five_percent_off_coupon_name":"<div><div class=\"earn-name\">৫% ছাড়ের কুপন</div>","coupons.hundred_zero_one_time_off_note":"<div class=\"earn-level\">১০০ ZERO = একবারের ৫% ছাড় — BAZAR5-এর সাথে চলবে না</div></div>","coupons.my_coupons_tab":"🎟️ আমার কুপন","coupons.no_coupon_yet_save_100_zero":"এখনো কোনো কুপন কেনা হয়নি — ১০০ ZERO জমিয়ে ৫% ছাড়ের কুপন কিনুন।","coupons.not_enough_zero_balance":"ZERO যথেষ্ট নয় — কুপনের দাম ১০০ ZERO (আপনার ব্যালেন্স","coupons.one_coupon_remove_bazar5_use_zero5":"এক অর্ডারে একটি কুপনই চলবে — BAZAR5 সরিয়ে ZERO5 কুপন দিন।","coupons.one_coupon_remove_zero5_use_bazar5":"এক অর্ডারে একটি কুপনই চলবে — ZERO5 কুপনটি সরিয়ে BAZAR5 দিন।","coupons.order_discount_label_open":"<div class=\"summary-row small\"><span>ছাড় (","coupons.price_100_zero":"<div class=\"earn-balance-big\">১০০ ZERO</div></div>","coupons.remove_coupon":"কুপন সরান","coupons.sort_discount_high_to_low":"ছাড়: বেশি থেকে কম","coupons.verifying_coupon":"কুপন যাচাই হচ্ছে…","coupons.wrong_coupon_code":"ভুল কুপন কোড।","coupons.zero5_coupon_5pct_label":"ZERO5 কুপন (৫%)","coupons.zero5_telegram_only":"ZERO5 কুপন শুধু Telegram অ্যাপে যাচাই করা যায়।","coupons.zero_coupon_tab":"🎟️ ZERO কুপন","friend.copy_referral_link_button":"<button class=\"btn-secondary pdf-btn\" type=\"button\" data-ref-share>🔗 রেফারেল লিংক কপি করুন</button>","friend.friends_heading":"👥 বন্ধু","friend.my_referral_list":"👥 আমার রেফারেল লিস্ট","friend.nav_friends_label":"বন্ধু","friend.no_referrals_yet":"এখনো কেউ আপনার লিংকে জয়েন করেনি — লিংকটি শেয়ার করুন।","friend.referral_level_label":"<div class=\"pdf-desc\">লেভেল","friend.stat_contest_rank_label":"প্রতিযোগিতায় র‍্যাঙ্ক","friend.stat_referral_earnings_label":"রেফারেল থেকে আয়","friend.stat_referrals_label":"রেফারেল","friend.total_referral_earnings":"রেফারেল থেকে মোট আয়:","friend.total_referral_earnings_zero":"রেফারেল থেকে মোট আয়: ০ ZERO","friend.your_referral_link":"🔗 আপনার রেফারেল লিংক","friend.zero_earned":"ZERO আয় করেছে</span></div>","leaderboard.claim_prize_button_open":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-lb-claim>🏆 পুরস্কার দাবি করুন —","leaderboard.friend_fallback_name":"বন্ধু","leaderboard.last_week_earnings_label":"</div><div class=\"hist-date\">গত সপ্তাহের আয়</div></div>","leaderboard.last_week_prize_claimed":"<div class=\"task-status done\">গত সপ্তাহের পুরস্কার নেওয়া হয়েছে ✓</div>","leaderboard.last_week_top3_title_open":"<div class=\"earn-group-title\">গত সপ্তাহের সেরা ৩ (","leaderboard.level_separator":"• লেভেল","leaderboard.no_earnings_yet_this_week":"<div class=\"pdf-note\">এই সপ্তাহে এখনো কেউ আয় করেনি — টাস্ক করে প্রথম হোন!</div>","leaderboard.not_on_list_yet":"<div class=\"task-status\">আপনি এখনো এই সপ্তাহের তালিকায় নেই — টাস্ক করলেই র‍্যাঙ্ক আসবে।</div>","leaderboard.this_week_earnings_label":"<div class=\"hist-date\">এই সপ্তাহের আয়</div></div>","leaderboard.this_week_separator":"• এই সপ্তাহে","leaderboard.this_week_title_open":"<div class=\"earn-group-title\">🏆 লিডারবোর্ড — এই সপ্তাহ (","leaderboard.you_marker":"(আপনি)","leaderboard.your_rank_open":"<div class=\"task-status\">আপনার র‍্যাঙ্ক: #","pdfs.both_versions_note":"<div class=\"pdf-note\">বাংলা + English ভার্সন — দুটোই পাবেন</div>","pdfs.buy_with_stars":"\">⭐ Stars দিয়ে কিনুন</button>","pdfs.buy_with_zero":"\">⛓️ ZERO দিয়ে কিনুন</button>","pdfs.category_ai_tutorials":"AI টিউটোরিয়াল","pdfs.category_books":"বই","pdfs.category_career":"ক্যারিয়ার","pdfs.category_health":"স্বাস্থ্য","pdfs.category_language_study":"ভাষা ও পড়াশোনা","pdfs.category_online_earning":"অনলাইন আয়","pdfs.category_religious_books":"ধর্মীয় বই","pdfs.category_shopping":"কেনাকাটা","pdfs.category_test":"টেস্ট","pdfs.claim_reward_free_button":"\">🎁 ফ্রি নিন — পুরস্কার</button>","pdfs.download_bangla_button":"\" download>⬇️ ডাউনলোড করুন (বাংলা)</a>","pdfs.free_coming_soon":"<span class=\"pdf-note\">ফ্রি — শীঘ্রই আসছে</span>","pdfs.free_if_top3_disabled_button":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>🎁 টপ ৩-এ থাকলে ফ্রি পাবেন</button>","pdfs.free_preview_button":"\" target=\"_blank\" rel=\"noopener\">👀 ফ্রি প্রিভিউ দেখুন</a>","pdfs.join_bazargoo_redeem_pdfs":"BazarGoo-তে জয়েন করুন — টাস্ক করে ZERO জমিয়ে PDF রিডিম করুন! 🛍️","pdfs.my_pdfs_label":"আমার PDF","pdfs.my_pdfs_telegram_note":"Telegram-এ অ্যাপ খুললে আপনার কেনা PDF এখানে দেখাবে।","pdfs.my_pdfs_title":"📚 আমার PDF","pdfs.pdf_sent_check_bot":"PDF পাঠানো হয়েছে — বট চেক করো 🎁","pdfs.pdf_sent_check_bot_chat":"🎁 PDF পাঠানো হয়েছে — বটের চ্যাটে দেখুন।","pdfs.price_free":"<span class=\"pdf-price free\">ফ্রি</span>","pdfs.price_reward_top3_free":"<span class=\"pdf-price free\">🎁 পুরস্কার — টপ ৩ পারফর্মারদের জন্য ফ্রি</span>","pdfs.price_stars_not_set":"⭐ দাম ঠিক হয়নি","pdfs.price_zero_not_set":"⛓️ ZERO: দাম ঠিক হয়নি","pdfs.redeem_pdfs_withdraw_note":"টাস্ক করে ZERO জমিয়ে PDF রিডিম করুন — জমা ZERO Wallet থেকে তুলতেও পারবেন।","pdfs.redeem_with_zero":"\">⛓️ ZERO দিয়ে রিডিম করুন</button>","pdfs.religion_claimed_see_bot_chat":"<div class=\"task-status done\">নেওয়া হয়েছে ✓ — বটের চ্যাটে PDF দেখুন।</div>","pdfs.religion_rank_telegram_note":"<div class=\"pdf-note\">Telegram-এ অ্যাপ খুললে আপনার র‍্যাংক দেখাবে।</div>","pdfs.religion_this_month":"এই মাসে","pdfs.religion_this_week":"এই সপ্তাহে","pdfs.religion_today":"আজ","pdfs.religion_top3_fallback":"টপ ৩-এ","pdfs.religion_top3_free_books_suffix":"টপ ৩-এ আছেন — নিচের বইগুলো ফ্রি নিন!</div>","pdfs.religion_top3_how_to_get_free":"<div class=\"pdf-note\">আজ / এই সপ্তাহে / এই মাসে টপ ৩-এ থাকলে এই বইগুলো ফ্রি পাবেন। টাস্ক করে ZERO জমিয়ে লিডারবোর্ডে উঠুন!</div>","pdfs.religion_top3_no_period":"🎉 আপনি টপ ৩-এ আছেন — নিচের বইগুলো ফ্রি নিন!","pdfs.religion_top3_open":"<div class=\"pdf-note\">🎉 আপনি","pdfs.religion_top3_periods":"🎉 আপনি {0} টপ ৩-এ আছেন — নিচের বইগুলো ফ্রি নিন!","pdfs.wallet_buy_button_suffix":") দিয়ে কিনুন</button>","pdfs.wallet_buy_pdfs_button":"<button class=\"btn-primary\" type=\"button\" data-wallet-pdf>📚 PDF কিনুন</button>","product.100_million_series_3":"$100 মিলিয়ন সিরিজ – অ্যালেক্স হরমোজির ৩টি আন্তর্জাতিক বেস্টসেলার বই","product.automatic_fruit_and_vegetable":"Automatic Fruit and Vegetable Peeler | অটোমেটিক ফল ও সবজি খোসা ছাড়ানোর মেশিন","product.china_brush_fabric_calligraphy":"চায়না ব্রাশ কাপড়ের ক্যালিগ্রাফি শাল","product.double_sit_up_bar":"ডাবল সিট আপ বার (Double Sit Up Bar) - ঘরে বসে ফিট থাকার সহজ উপায়","product.multipurpose_durable_plastic_basket":"মাল্টিপারপাস টেকসই প্লাস্টিকের টুকরি","product.silicone_sink_splash_guard":"Silicone Sink Splash Guard | সিঙ্কের পানি ছিটা প্রতিরোধক","product.wool_calligraphy_shawl":"উলের ক্যালিগ্রাফি শাল","profile.complete_profile_title":"<div class=\"earn-group-title\">📋 প্রোফাইল সম্পূর্ণ করুন —","profile.default_user_name":"ব্যবহারকারী","profile.joined_label":"• জয়েন:","profile.level_bar_level_label":"<div class=\"earn-levelbar-top\"><span>⭐ লেভেল","profile.level_label":"<div class=\"earn-level\">লেভেল","profile.level_note_no_unlock":"<div class=\"earn-note\">লেভেল শুধু মোট আয়ের হিসাব — এখনো কিছু আনলক করে না।</div>","profile.next_level_stats_open":"<div class=\"earn-stats\">পরের লেভেলে","profile.profile_label":"প্রোফাইল","profile.profile_tab_title":"👤 প্রোফাইল","profile.referral_bonus_commission_note":"বন্ধু প্রথম চেক-ইন করলেই বোনাস — লেভেল ১: ১০ · লেভেল ২: ৫ · লেভেল ৩: ২ ZERO। তার টাস্ক আয়েও কমিশন পাবেন: লেভেল ১: ৩% · লেভেল ২: ২% · লেভেল ৩: ১%।","profile.referral_earnings_label":"• রেফারেল থেকে আয়:","profile.referrals_level2_separator":"জন • লেভেল ২:","profile.referrals_level3_separator":"জন • লেভেল ৩:","profile.security_coming_soon":"<div class=\"earn-details\">🔒 সিকিউরিটি — শীঘ্রই আসছে</div>","profile.stat_lifetime_label":"মোট আয়","profile.stat_tasks_label":"টাস্ক","profile.tasks_completed_count_suffix":"টি টাস্ক সম্পন্ন • 👥","profile.total_earnings_separator":"• মোট আয়","profile.xp_left_next_level_label":"<span>পরের লেভেলে","profile.your_referrals_level1":"<div class=\"task-status\">আপনার রেফারেল — লেভেল ১:","promote.approved_goes_live_suffix":") — অনুমোদন হলে স্পন্সর টাস্ক হিসেবে লাইভ হবে।</div>","promote.budget_label":"<label>বাজেট <input id=\"promoBudget\" type=\"number\" min=\"0\" step=\"any\" placeholder=\"১০০ ZERO / $২\"></label>","promote.budget_limits_note":"<div class=\"pdf-note\">সর্বনিম্ন বাজেট: <strong>১০০ ZERO</strong> অথবা <strong>$২</strong> (≈১.৯১ GRAM) = ৮০টি কাজ। সর্বোচ্চ: ৬২৫ ZERO / $১০ = ৩০০টি কাজ। পেমেন্ট আগে, তারপর অ্যাডমিন প্রতিটি প্রমোশন অনুমোদন করেন — অনুমোদন না হলে লাইভ হবে না। বাজেট শেষ হলে প্রমোশন নিজে থেমে যাবে।</div>","promote.completions_count":"টি কাজ</strong> • প্রতিটিতে","promote.confirm_payment_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"promoConfirmBtn\">পেমেন্ট কনফার্ম করুন</button>","promote.continue_to_payment_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"promoSubmitBtn\">পেমেন্টের ধাপে যান</button>","promote.currency_label":"<label>মুদ্রা <select id=\"promoCurrency\"><option value=\"zero\">⛓️ ZERO</option><option value=\"gram\">💎 GRAM</option></select></label></div>","promote.enter_title_link_budget":"শিরোনাম, লিংক ও সঠিক বাজেট লিখুন।","promote.enter_txid":"txid লিখুন।","promote.intro_reward_per_task":"<p>আপনার পেইজ/চ্যানেল/লিংক এই অ্যাপের ইউজারদের কাছে পৌঁছে দিন। প্রতিটি কাজ শেষ করলে ইউজার পুরস্কার পাবে — <strong>১ ZERO</strong> (ZERO প্রমোশন) বা <strong>~০.০১৯ GRAM</strong> (GRAM প্রমোশন)।</p>","promote.link_label":"<label>লিংক <input id=\"promoUrl\" type=\"url\" placeholder=\"https://...\"></label>","promote.pay_from_wallet_checkbox":"<label><input id=\"promoWallet\" type=\"checkbox\"> Wallet ব্যালেন্স থেকে পে করুন</label>","promote.pay_with_wallet_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"promoConfirmBtn\">Wallet দিয়ে পেমেন্ট করুন</button>","promote.payment_received_pending_approval":"<div class=\"task-status done\">✅ পেমেন্ট পেয়েছি! প্রমোশনটি অ্যাডমিনের অনুমোদনের অপেক্ষায় (","promote.reward_per_completion_suffix":"পুরস্কার</div>","promote.send_to_address":"</strong> পাঠান এই ঠিকানায়:<br><code>","promote.sponsor_label":"<div class=\"pdf-desc\">🏷️ স্পন্সর</div>","promote.title_label":"<label>শিরোনাম <input id=\"promoTitle\" type=\"text\" maxlength=\"80\" placeholder=\"যেমন: আমার ফেসবুক পেইজ\"></label>","promote.txid_label":"<label>লেনদেনের ID (txid / tx hash) <input id=\"promoTxid\" type=\"text\" placeholder=\"txid লিখুন\"></label>","promote.type_facebook_options":"<option value=\"facebook_page\">Facebook Page</option><option value=\"facebook\">Facebook (পোস্ট/প্রোফাইল)</option>","promote.type_label_open":"<div class=\"form-row\"><label>ধরন <select id=\"promoType\">","promote.type_telegram_post_options":"<option value=\"telegram_channel\">Telegram চ্যানেল</option><option value=\"post\">পোস্ট</option>","promote.type_video_youtube_tiktok_options":"<option value=\"video\">ভিডিও</option><option value=\"youtube\">YouTube</option><option value=\"tiktok\">TikTok</option>","promote.type_x_instagram_referral_options":"<option value=\"x\">X (Twitter)</option><option value=\"instagram\">Instagram</option><option value=\"referral\">রেফারেল লিংক</option>","promote.wallet_deduct_intro":"<div class=\"pdf-note\">Wallet ব্যালেন্স থেকে <strong>","promote.wallet_deduct_suffix":"</strong> কাটা হবে।</div>","shop.clear_search":"সার্চ মুছুন","shop.cooldown_hours":"ঘণ্টা","shop.cooldown_minutes":"মিনিট","shop.copy_review":"রিভিউ কপি করুন","shop.earn_level_total_earnings":"XP • মোট আয়","shop.earnings_history_heading":"📈 আয়ের ইতিহাস","shop.month_apr":"এপ্রিল","shop.month_aug":"আগ","shop.month_dec":"ডিসে","shop.month_feb":"ফেব্রু","shop.month_jan":"জানু","shop.month_jul":"জুলাই","shop.month_jun":"জুন","shop.month_mar":"মার্চ","shop.month_may":"মে","shop.month_nov":"নভে","shop.month_oct":"অক্টো","shop.month_sep":"সেপ্টে","shop.my_review_title":"<div class=\"my-review-title\">আপনার রিভিউ</div>","shop.no_products_found":"কোনো পণ্য পাওয়া যায়নি","shop.no_reviews_yet":"এখনো কোনো রিভিউ নেই — প্রথম রিভিউটি আপনিই দিন।","shop.no_transactions_yet":"এখনো কোনো লেনদেন হয়নি।","shop.nothing_found":"😕 কিছু পাওয়া যায়নি","shop.review_choose_stars":"দয়া করে ১–৫টি স্টার দিন।","shop.review_copy_if_no_confirmation":"বট থেকে কনফার্মেশন না এলে নিচের রিভিউটি কপি করে বটের চ্যাটে পাঠান।","shop.review_copy_if_no_confirmation_above":"বট থেকে কনফার্মেশন না পেলে উপরের রিভিউটি কপি করে চ্যাটে পাঠান।","shop.review_count_suffix":"টি রিভিউ","shop.review_details_heading":"রিভিউর বিবরণ","shop.review_pending_approval":"পাঠানো হয়েছে — অনুমোদনের অপেক্ষায়","shop.review_published":"প্রকাশিত হয়েছে ✓","shop.review_sent_message":"ধন্যবাদ! আপনার রিভিউটি পাঠানো হয়েছে।","shop.review_sent_title":"রিভিউ পাঠানো হয়েছে!","shop.review_star_button":"স্টার\">★</button>","shop.review_summary_comment":"মন্তব্য:","shop.review_summary_heading":"⭐ BazarGoo রিভিউ","shop.review_summary_number":"রিভিউ নং:","shop.review_summary_product":"পণ্য:","shop.review_summary_product_id":"পণ্য ID:","shop.review_summary_rating":"রেটিং:","shop.reviews_heading":"রিভিউ","shop.share_button":"\">↗ শেয়ার</button>","shop.submit_review":"রিভিউ পাঠান","shop.transaction_history_heading":"💳 লেনদেনের ইতিহাস","shop.transaction_label":"লেনদেন","shop.try_another_search":"অন্য কিছু লিখে খুঁজে দেখুন।","shop.wallet_earnings_label":"<div class=\"earn-level\">আয়:","shop.wishlist_button_aria_label":"\" aria-label=\"পছন্দের তালিকায় যোগ করুন\">","shop.wishlist_empty":"💔 পছন্দের তালিকা খালি।","shop.wishlist_empty_hint":"হার্ট চেপে পছন্দের পণ্য যোগ করুন।","shop.write_review":"রিভিউ লিখুন","spin.ad_could_not_be_shown":"বিজ্ঞাপন দেখানো যায়নি — আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।","spin.ad_did_not_load":"বিজ্ঞাপন লোড হয়নি — একটু পরে আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।","spin.ad_not_finished_no_reward":"বিজ্ঞাপন শেষ না হলে পুরস্কার হয় না — আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।","spin.ad_reward_already_given":"এই বিজ্ঞাপনের পুরস্কার already দেওয়া হয়েছে ✓","spin.adsgram_not_live":"AdsGram বিজ্ঞাপন এখনো চালু হয়নি — ড্যাশবোর্ড সেটআপ বাকি আছে। স্পিন নষ্ট হয়নি।","spin.channel_joins_checklist_suffix":"/৪) — প্রোফাইলে চেকলিস্ট দেখুন","spin.channel_joins_pending":"৪টি চ্যানেলে জয়েন বাকি (","spin.channel_joins_status":"৪টি চ্যানেলের মধ্যে {0}টিতে জয়েন করেছেন — প্রোফাইলে চেকলিস্ট দেখুন","spin.checkin_today_pending":"আজকের চেক-ইন বাকি","spin.congrats_free_spin_again":"🎉 অভিনন্দন! +১ ফ্রি স্পিন পেয়েছেন — আবার ঘোরান!","spin.daily_spins_note":"<div class=\"task-status\">দিনে ৪ বার (২ Monetag + ২ AdsGram) — প্রতিটা পুরস্কার পেতে ১টি অ্যাড দেখুন। পুরস্কার সার্ভারেই ঠিক হয়।</div>","spin.device_already_has_account":"এই মোবাইলে already একটা অ্যাকাউন্ট আছে","spin.free_spin_prize_tier":"+১ ফ্রি স্পিন —","spin.got_free_spin_result":"🎉 +১ ফ্রি স্পিন পেয়েছেন!","spin.monetag_not_live":"Monetag বিজ্ঞাপন এখনো চালু হয়নি — ড্যাশবোর্ড সেটআপ বাকি আছে। স্পিন নষ্ট হয়নি।","spin.no_ads_right_now":"এখন কোনো বিজ্ঞাপন নেই — একটু পরে আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।","spin.no_reward_from_ad":"এই বিজ্ঞাপন থেকে পুরস্কার হয়নি — আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।","spin.reward_could_not_be_given":"পুরস্কার দেওয়া যায়নি।","spin.spin_button_disabled":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>🎡 স্পিন করুন</button>","spin.spin_with_adsgram_button":">🎡 AdsGram দিয়ে ঘোরান","spin.spin_with_monetag_button":">🎡 Monetag দিয়ে ঘোরান","spin.spins_done_today_button":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>আজকের স্পিন শেষ ✓ — আগামীকাল আবার</button>","spin.spins_left_suffix":"বার বাকি","spin.spun_today_intro":"<div class=\"task-status done\">আজ","spin.spun_today_suffix":"বার ঘোরানো হয়েছে ✓</div>","spin.unlock_remaining_intro":"<div class=\"task-status\">আনলক করতে বাকি:<br>•","tasks.account_already_exists_on_phone":"এই মোবাইলে already একটা অ্যাকাউন্ট আছে — এই অ্যাকাউন্ট দিয়ে আয় করা যাবে না।","tasks.account_exists_no_task_earnings":"এই মোবাইলে already একটা অ্যাকাউন্ট আছে — এই অ্যাকাউন্ট দিয়ে টাস্কের আয় করা যাবে না। দোকান ও PDF কেনা চলবে।","tasks.ad_not_loaded_try_later":"বিজ্ঞাপন লোড হয়নি — একটু পরে আবার চেষ্টা করো।","tasks.ad_not_verified_try_again":"বিজ্ঞাপন যাচাই করা যায়নি — আবার চেষ্টা করো।","tasks.address_incorrect":"ঠিকানাটি সঠিক নয় — আবার দেখে লিখুন।","tasks.ads_not_available_now":"এখন বিজ্ঞাপন দেখা যাবে না।","tasks.already_done_today":"আজকের জন্য হয়ে গেছে।","tasks.amount_below_minimum":"পরিমাণ সর্বনিম্ন সীমার নিচে।","tasks.amount_incorrect":"পরিমাণটি সঠিক নয়।","tasks.amount_sent_not_enough":"পাঠানো পরিমাণ যথেষ্ট নয়।","tasks.answer_all_questions":"সব প্রশ্নের উত্তর দিন।","tasks.budget_out_of_range":"বাজেট সীমার বাইরে — সর্বনিম্ন ১০০ ZERO / $২, সর্বোচ্চ ৬২৫ ZERO / $১০।","tasks.checkin_button_open":">✅ চেক-ইন করুন — +","tasks.checkins_dash":"চেক-ইন —","tasks.claim":"দাবি করুন","tasks.claim_after_video_ends_disabled":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-claim=\"video_daily\" data-video-claim disabled>ভিডিও শেষ হলে দাবি করুন</button>","tasks.claim_with_check":"✅ দাবি করুন","tasks.community_today_title_open":"👥 কমিউনিটি — আজ","tasks.could_not_claim_try_again":"দাবি করা যায়নি — আবার চেষ্টা করুন।","tasks.countdown_close":"</span> পর</div>","tasks.currency_not_supported":"এই মুদ্রাটি সমর্থিত নয়।","tasks.daily_reward_title_open":"<div class=\"dr-head\"><div class=\"dr-title\">🎁 দৈনিক পুরস্কার</div>","tasks.day_label_open":"<span>দিন","tasks.day_streak_close":"দিনের স্ট্রিক</div></div>","tasks.done":"সম্পন্ন","tasks.done_close":"সম্পন্ন</div>","tasks.facebook_pages_subtitle":"<div class=\"earn-group-title earn-sub\">📘 ফেসবুক পেইজ</div>","tasks.gram_payment_not_live":"GRAM পেমেন্ট এখনো চালু হয়নি — অ্যাডমিন সেটআপ বাকি আছে।","tasks.gram_withdraw_unavailable_low_funds":"এই মুহূর্তে GRAM তোলা যাবে না — ফান্ড কম আছে।","tasks.join_4_channels_first":"আগে ৪টি চ্যানেলে জয়েন করুন — প্রোফাইলে চেকলিস্ট দেখুন।","tasks.join_channel_first_claim_again":"প্রথমে চ্যানেলে জয়েন করো — জয়েন করে আবার দাবি করুন।","tasks.link_invalid_start_https":"লিংকটি সঠিক নয় — https:// দিয়ে শুরু করুন।","tasks.lucky_spin_desc":"<div class=\"pdf-desc\">সম্পূর্ণ ফ্রি — দিনে ৪ বার (২ Monetag + ২ AdsGram)। শর্ত: আজকের চেক-ইন + ৪ চ্যানেলে জয়েন। প্রতিটা পুরস্কার পেতে ১টি অ্যাড দেখুন।</div>","tasks.monetag_ads_not_live":"Monetag বিজ্ঞাপন এখনো চালু হয়নি — ড্যাশবোর্ড সেটআপ বাকি আছে।","tasks.monthly_checkin_bonus_title_open":"<div class=\"streak-strip\"><div class=\"streak-title\">📅 মাসিক চেক-ইন বোনাস:","tasks.more_seconds_then_claim":"সেকেন্ড দেখে তারপর দাবি করুন।","tasks.nav_tasks":"✅ টাস্ক","tasks.nav_tasks_label":"টাস্ক","tasks.network_spins_done_try_another":"এই নেটওয়ার্কের আজকের স্পিন শেষ — অন্য নেটওয়ার্কে চেষ্টা করো।","tasks.next_ad_countdown_open":"<div class=\"task-status\">পরের অ্যাড <span data-cd-ms=\"","tasks.next_in_countdown_open":"<div class=\"dr-countdown\">পরেরটি <span data-cd-ms=\"","tasks.no_earnings_from_ad_try_again":"এই বিজ্ঞাপন থেকে আয় হয়নি — আবার চেষ্টা করো।","tasks.no_earnings_yet_do_tasks":"এখনো কোনো আয় হয়নি — টাস্ক করুন।","tasks.no_spin_waiting_spin_again":"কোনো স্পিন অপেক্ষায় নেই — আবার ঘোরান।","tasks.not_enough_zero":"ZERO যথেষ্ট নয়।","tasks.not_enough_zero_do_more_tasks":"ZERO যথেষ্ট নয় — আরও টাস্ক করুন।","tasks.not_in_last_week_top3":"আপনি গত সপ্তাহের সেরা ৩-এ নেই।","tasks.not_in_top3_complete_tasks":"আপনি আজ/এই সপ্তাহে/এই মাসে টপ ৩-এ নেই — টাস্ক করে লিডারবোর্ডে উঠুন।","tasks.not_joined_try_again":"চ্যানেলে জয়েন করা হয়নি — জয়েন করে আবার চেষ্টা করুন।","tasks.not_this_month_winner":"আপনি এই মাসের বিজয়ী নন।","tasks.not_yet_time_try_later":"এখনো সময় হয়নি — আবার পরে চেষ্টা করুন।","tasks.one_answer_wrong_try_again":"একটি উত্তর ভুল হয়েছে — আবার চেষ্টা করুন।","tasks.open_sponsor_task_first":"প্রথমে স্পন্সর কাজটি খুলুন।","tasks.opened_check":"👁️ খোলা হয়েছে ✓","tasks.payment_not_confirmed_yet":"পেমেন্টটি এখনো কনফার্ম হয়নি — একটু পরে চেষ্টা করুন।","tasks.payment_not_verified_check_txid":"পেমেন্ট যাচাই হয়নি — txid ঠিক আছে কি না দেখুন।","tasks.pdf_cannot_be_bought_reward_only":"এই PDF-টি কেনা যায় না — এটি পুরস্কার হিসেবে দেওয়া হয়।","tasks.pdf_cannot_be_selected":"এই PDF-টি বেছে নেওয়া যাবে না।","tasks.pdf_not_given_as_reward":"এই PDF-টি পুরস্কার হিসেবে দেওয়া হয় না।","tasks.pdf_stars_price_not_set":"এই PDF-টির Stars দাম এখনো ঠিক হয়নি।","tasks.pdf_zero_price_not_set":"এই PDF-টির ZERO দাম এখনো ঠিক হয়নি।","tasks.plus_1_zero_added":"🎉 +১ ZERO যোগ হয়েছে!","tasks.promote_button":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-promote-open>📢 Promote করুন</button></article>","tasks.promote_desc":"<article class=\"pdf-card\"><div class=\"pdf-desc\">আপনার Facebook পেইজ, YouTube চ্যানেল বা যেকোনো লিংক এই অ্যাপের ইউজারদের কাছে পৌঁছে দিন — তারা কাজটি করলে পুরস্কার পাবে।</div>","tasks.promote_your_page_channel_title":"<div class=\"earn-group-title\">📢 আপনার পেইজ/চ্যানেল প্রমোট করুন</div>","tasks.promotion_no_longer_live":"এই প্রমোশনটি আর লাইভ নেই।","tasks.promotion_type_invalid":"প্রমোশনের ধরনটি সঠিক নয়।","tasks.quiz_desc":"দিনে ১ বার — ৩টি প্রশ্নের সব সঠিক উত্তর দিন","tasks.quiz_title":"দৈনিক কুইজ","tasks.rate_not_found_try_later":"রেট পাওয়া যায়নি — একটু পরে আবার চেষ্টা করুন।","tasks.reward_already_claimed":"এই পুরস্কারটি ইতিমধ্যে নেওয়া হয়েছে।","tasks.reward_collected_come_back_tomorrow":"<div class=\"dr-done\">সংগ্রহ করা হয়েছে ✓ — আগামীকাল আবার আসো</div>","tasks.reward_expired":"এই পুরস্কারের মেয়াদ শেষ।","tasks.reward_grows_note":"ZERO — প্রতিদিন চেক-ইন করলে পুরস্কার বাড়বে।</div>","tasks.reward_not_yours":"এই পুরস্কারটি আপনার নয়।","tasks.spin_already_made_watch_ad":"একটি স্পিন already ঘোরানো হয়েছে — বিজ্ঞাপনটি দেখে পুরস্কার নিন।","tasks.spin_expired_spin_again":"স্পিনের মেয়াদ শেষ — আবার ঘোরান।","tasks.spin_not_unlocked":"স্পিন এখনো আনলক হয়নি — শর্তগুলো পূরণ করুন।","tasks.spin_requires_ad_see_card":"স্পিন এখন অ্যাড দেখে ঘোরাতে হয় — নিচের স্পিন কার্ড দেখুন।","tasks.stars_cannot_be_withdrawn":"Stars তোলা যায় না — শুধু জমা দিয়ে PDF কেনা যায়।","tasks.streak_days_today_plus":"দিন • আজ +","tasks.streak_title_open":"<div class=\"streak-strip\"><div class=\"streak-title\">🔥 চেক-ইন স্ট্রিক:","tasks.tab_community":"👥 কমিউনিটি","tasks.tab_daily":"🎁 দৈনিক","tasks.tab_referral":"🔗 রেফারেল","tasks.tab_sponsor":"📢 স্পন্সর","tasks.tab_visit":"🌐 ভিজিট করুন","tasks.tab_watch_earn":"📺 দেখুন ও আয় করুন","tasks.task_cannot_be_claimed_here":"এই টাস্কটি এখানে দাবি করা যায় না — বিজ্ঞাপন দেখে নিন।","tasks.telegram_channels_subtitle":"<div class=\"earn-group-title earn-sub\">✈️ টেলিগ্রাম চ্যানেল</div>","tasks.today_limit_reached":"আজকের সীমা শেষ।","tasks.today_spins_done":"আজকের স্পিন শেষ — আগামীকাল আবার।","tasks.today_withdrawal_limit_reached":"আজকের তোলার সীমা শেষ।","tasks.todays_checkin":"আজকের চেক-ইন","tasks.todays_reward_plus_open":"<div class=\"dr-note\">আজকের পুরস্কার +","tasks.transaction_not_found":"এই লেনদেনটি খুঁজে পাওয়া যায়নি।","tasks.txid_already_confirmed":"এই txid দিয়ে আগেই কনফার্ম হয়েছে।","tasks.txid_required":"txid দিতে হবে।","tasks.video_not_loaded_check_internet":"ভিডিওটি লোড হয়নি — ইন্টারনেট চেক করে আবার খুলুন।","tasks.video_watched_claim_now":"ভিডিও দেখা শেষ ✓ — এখন দাবি করুন।","tasks.visit_today_title_open":"<div class=\"earn-group-title\">🌐 ভিজিট করুন — আজ","tasks.wait_view_task_then_claim":"একটু অপেক্ষা করুন — কাজটি দেখে তারপর দাবি করুন।","tasks.watch_ad_disabled":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>📺 অ্যাড দেখুন</button>","tasks.watch_ad_first_then_claim":"প্রথমে বিজ্ঞাপনটি দেখুন, তারপর দাবি করুন।","tasks.watch_ad_monetag_disabled":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>📺 অ্যাড দেখুন (Monetag)</button>","tasks.watch_ad_plus_1_zero":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-monetag-watch>📺 অ্যাড দেখুন — +১ ZERO</button>","tasks.watch_full_video_to_enable_claim":"<div class=\"video-note\">ভিডিওটি পুরো দেখলে দাবি বোতাম চালু হবে।</div>","tasks.watch_more_seconds_open":"আরও","tasks.watch_more_seconds_then_claim":"আরও {0} সেকেন্ড দেখে তারপর দাবি করুন।","tasks.withdraw_gate_join_react":"আগে BazarGoo Withdraw চ্যানেলে জয়েন করে পিন করা পোস্টে ❤️ রিঅ্যাক্ট দিন — ওয়ালেটের \"তোলার আগে\" ধাপ দুটি দেখুন।","tasks.your_zero":"আপনার ZERO:","wallet.address_currency_label":"<div class=\"form-row\"><label>মুদ্রা <select id=\"addrCurrency\"><option value=\"zero\">⛓️ ZERO</option><option value=\"gram\">💎 GRAM</option></select></label>","wallet.address_saved":"<div class=\"task-status done\">✅ ঠিকানা সংরক্ষণ হয়েছে।</div>","wallet.address_value_label":"<label>ঠিকানা <input id=\"addrValue\" type=\"text\" placeholder=\"t1… / EQ…\"></label></div>","wallet.deposit_amount_label":"<label>পরিমাণ <input id=\"depAmount\" type=\"number\" min=\"1\" step=\"any\" placeholder=\"১০\"></label></div>","wallet.deposit_confirm_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"depConfirmBtn\">কনফার্ম করুন</button>","wallet.deposit_credited":"Wallet-এ জমা হয়েছে!</div>","wallet.deposit_currency_label":"<div class=\"form-row\"><label>মুদ্রা <select id=\"depCurrency\"><option value=\"stars\">⭐ Stars</option><option value=\"zero\">⛓️ ZERO</option><option value=\"gram\">💎 GRAM</option></select></label>","wallet.deposit_heading":"<h3>⬇️ ডিপোজিট</h3>","wallet.deposit_optional_note":"<div class=\"earn-note\">Wallet-এ জমা দিয়ে কিনতে পারেন, আবার যেকোনো সময় তুলতেও পারেন — জমা করা বাধ্যতামূলক নয়, সরাসরি পেমেন্ট সবসময় আছে। ZERO তুলতে কোনো ফি বা সর্বনিম্ন সীমা নেই। GRAM তোলা ম্যানুয়াল — অ্যাডমিন পাঠিয়ে txid জানিয়ে দেন।</div>","wallet.deposit_start_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"depStartBtn\">ডিপোজিট শুরু করুন</button>","wallet.deposit_txid_label":"<label>লেনদেনের ID (txid / tx hash) <input id=\"depTxid\" type=\"text\" placeholder=\"txid লিখুন\"></label>","wallet.earned_zero_row_label":"⛓️ আয়ের ZERO","wallet.earning_source_ad":"বিজ্ঞাপন","wallet.earning_source_checkin":"চেক-ইন","wallet.earning_source_join":"জয়েন","wallet.earning_source_quiz":"কুইজ","wallet.earning_source_react":"রিঅ্যাক্ট","wallet.earning_source_video":"ভিডিও","wallet.earnings_label":"<p><strong>আয়:</strong>","wallet.enter_address":"ঠিকানা লিখুন।","wallet.enter_correct_amount":"সঠিক পরিমাণ লিখুন।","wallet.gram_not_configured_yet":"এখনো সেটআপ হয়নি","wallet.gram_not_live_note":"<div class=\"pdf-note\">GRAM পেমেন্ট/তোলা এখনো চালু হয়নি — অ্যাডমিন সেটআপ বাকি আছে।</div>","wallet.hero_earned_wallet_split":"আয়ের {0} ZERO + Wallet-এর {1} ZERO","wallet.history_label_commission":"কমিশন","wallet.history_label_purchase":"কেনা","wallet.history_label_redeem":"রিডিম","wallet.history_label_referral_bonus":"রেফারেল বোনাস","wallet.history_label_task":"টাস্ক","wallet.insufficient_balance_deposit_first":"Wallet-এ যথেষ্ট ব্যালেন্স নেই — প্রথমে ডিপোজিট করুন।","wallet.join_required_for_spin_rewards_withdraw":"<div class=\"earn-note\">স্পিন, লিডারবোর্ড পুরস্কার ও উইথড্র-এর জন্য ৪টি চ্যানেলে জয়েন লাগবে।</div>","wallet.pdf_sent_check_bot":"PDF পাঠানো হয়েছে ✓ — বটের চ্যাটে দেখুন।","wallet.pdf_zero_step2_send":"<p>২. নিজের ওয়ালেট থেকে ZERO পাঠান।</p>","wallet.pdf_zero_step3_send_txid":"<p>৩. পেমেন্টের transaction id (txid) বটের চ্যাটে পাঠান — যাচাই হলেই বট PDF পাঠিয়ে দেবে।</p>","wallet.profile_wallet_live_note":"ZERO ও GRAM উইথড্র ও ডিপোজিট চালু হয়েছে — Wallet খুলে দেখুন। তোলা ম্যানুয়াল — অ্যাডমিন পাঠিয়ে txid জানিয়ে দেন। ZERO তুলতে কোনো ফি বা সর্বনিম্ন সীমা নেই।","wallet.profile_wallet_section_title":"👛 ওয়ালেট","wallet.purchase_with_wallet_failed":"Wallet দিয়ে কেনা যায়নি।","wallet.save_address_button":"<button class=\"btn-secondary btn-block\" type=\"button\" id=\"addrSaveBtn\">ঠিকানা সংরক্ষণ করুন</button>","wallet.save_address_heading":"<h3>📍 আমার ঠিকানা সংরক্ষণ</h3>","wallet.send_txid_in_bot_button":"বটে গিয়ে txid পাঠান","wallet.stars_invoice_intro":"<div class=\"pdf-note\">বটে গিয়ে","wallet.stars_invoice_pay_note":"Stars-এর ইনভয়েস পাবেন — পেমেন্ট করলেই Wallet-এ জমা হবে।</div>","wallet.total_zero_balance_label":"মোট ZERO ব্যালেন্স","wallet.wallet_zero_row_label":"👛 Wallet-এর ZERO","wallet.withdraw_address_label":"<label>আপনার ঠিকানা <input id=\"wdAddress\" type=\"text\" placeholder=\"ZERO হলে t1… / GRAM হলে EQ…/UQ…\"></label>","wallet.withdraw_amount_label":"<label>পরিমাণ <input id=\"wdAmount\" type=\"number\" min=\"0\" step=\"any\" placeholder=\"১\"></label></div>","wallet.withdraw_currency_label":"<div class=\"form-row\"><label>মুদ্রা <select id=\"wdCurrency\"><option value=\"zero\">⛓️ ZERO</option><option value=\"gram\">💎 GRAM</option></select></label>","wallet.withdraw_deposit_button":"<button class=\"btn-primary\" type=\"button\" data-wallet-open>⬆️ উইথড্র / ⬇️ ডিপোজিট</button>","wallet.withdraw_gate_card_heading":"তোলার শর্ত","wallet.withdraw_gate_claim_button":"✅ রিঅ্যাক্ট করেছি — দাবি করুন","wallet.withdraw_gate_heading":"💸 তোলার আগে — ২টি ধাপ","wallet.withdraw_gate_join_button":"1️⃣ চ্যানেলে জয়েন ","wallet.withdraw_gate_join_link":"চ্যানেলে জয়েন করুন","wallet.withdraw_gate_join_row":"✅ @bazargoowithdraw-এ জয়েন করুন","wallet.withdraw_gate_note":"তুলতে হলে প্রথমে <b>BazarGoo Withdraw</b> চ্যানেলে জয়েন করুন আর পিন করা পোস্টে ❤️ রিঅ্যাক্ট দিন — প্রতিদিন একবার।","wallet.withdraw_gate_ok":"✅ তোলার শর্ত পূরণ হয়েছে — এখন তুলতে পারেন।","wallet.withdraw_gate_react_button":"2️⃣ পিন করা পোস্টে ❤️ ","wallet.withdraw_gate_react_link":"❤️ পিন করা পোস্টটি খুলুন","wallet.withdraw_gate_react_row":"○ পিন করা পোস্টে রিঅ্যাক্ট দিন","wallet.withdraw_gate_refresh_button":"🔄 অবস্থা আবার দেখুন","wallet.withdraw_heading":"<h3>⬆️ উইথড্র</h3>","wallet.withdraw_limits_note":"<div class=\"pdf-note\">ZERO তুলতে কোনো ফি বা সর্বনিম্ন সীমা নেই — ১ ZERO-ও তোলা যায়, যেকোনো সময়। দিনে সর্বোচ্চ ১,০০০ ZERO। ৫০০ ZERO-র বেশি হলে অ্যাডমিনের অনুমোদন লাগবে। GRAM: সর্বনিম্ন ০.৫, দিনে সর্বোচ্চ ৫ (ফান্ডের ২০%-এর বেশি নয়), ২ GRAM-এর বেশি হলে অনুমোদন লাগবে। Stars তোলা যায় না।</div>","wallet.withdraw_mode_label":"<div class=\"form-row\"><label>ধরন <select id=\"wdMode\"><option value=\"instant\">⚡ এখনই তুলুন</option><option value=\"save\">💾 Wallet-এ জমা রাখুন</option></select></label></div>","wallet.withdraw_pending_approval":") — অ্যাডমিনের অনুমোদনের অপেক্ষায়। অনুমোদন হলে অ্যাডমিন পাঠিয়ে txid জানিয়ে দেবেন।</div>","wallet.withdraw_pending_approval_auto":") — অ্যাডমিনের অনুমোদনের অপেক্ষায়। অনুমোদন হলে অটো পাঠানো হবে, txid জানিয়ে দেওয়া হবে।</div>","wallet.withdraw_pending_soon":") — অ্যাডমিন শীঘ্রই পাঠিয়ে txid জানিয়ে দেবেন।</div>","wallet.withdraw_request_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"wdBtn\">তোলার অনুরোধ পাঠান</button>","wallet.withdraw_request_sent":"<div class=\"task-status\">⏳ অনুরোধ পাঠানো হয়েছে (","wallet.withdraw_saved_in_wallet":"Wallet-এ জমা রাখা হয়েছে।</div>","wallet.withdraw_sending_soon":") — পাঠানো হচ্ছে, txid শীঘ্রই জানানো হবে।</div>","wallet.withdraw_sent_txid":"✅ পাঠানো হয়েছে! txid: ","wallet.zero_guide_step1":"<div class=\"pdf-note\">১. <b>zerochain.info/wallet</b>-এ যান।<br>","wallet.zero_guide_step2":"২. নতুন ওয়ালেট খুলুন — Wallet ID ও Password পাবেন। <b>দুটোই নিরাপদে লিখে রাখুন — সাইটটি ভুলে গেলে ফেরত দিতে পারে না।</b><br>","wallet.zero_guide_step3":"৩. ওয়ালেটে আপনার <b>t1…</b> ঠিকানাটি দেখাবে — সেটি কপি করুন।<br>","wallet.zero_guide_step4":"৪. উপরে ঠিকানাটি বসিয়ে সংরক্ষণ করুন, অথবা তোলার সময় লিখুন।<br>","wallet.zero_guide_warning":"⚠️ Wallet ID, Password বা Private Key <b>কাউকে দেবেন না</b> — অ্যাডমিনও কখনো চাইবে না।</div>","wallet.zero_wallet_guide_heading":"<h3>⛓️ ZERO ওয়ালেট খোলার গাইড</h3>","wallet.zero_wallet_name":"<div><div class=\"earn-name\">ZERO ওয়ালেট</div>"},"en":{"browser.address_or_search_aria_label":"Address or search","browser.browser_heading":"🌐 Browser","browser.browser_hint":"Enter a link and tap Go — it will open in Telegram's browser. Tap Back to come back.","browser.browser_nav_label":"Browser","browser.enter_valid_link_or_search":"Enter a valid link (for example: bazargoo.com) or search for something.","browser.link_or_search_placeholder":"Enter a link or search…","browser.no_history_yet":"You haven't browsed anything yet — enter a link above to start.","browser.quick_links_heading":"⚡ Quick links","cart.add_to_cart_first":"Add products to your cart first.","cart.cart_empty":"Cart is empty.","cart.choose_district":"Choose a district.","cart.choose_district_placeholder":"Choose a district…","cart.copy_order":"Copy order","cart.coupon_already_used_or_not_found":"The coupon has already been used or was not found — place your order without a coupon.","cart.coupon_bazar5_label":"BAZAR5 — 5% off your first order","cart.coupon_could_not_be_used":"The coupon could not be used — please enter a coupon again.","cart.coupon_zero5_telegram_only":"The ZERO5 coupon can only be used in the Telegram app.","cart.delivery_charge":"Delivery charge","cart.delivery_charge_row":"<div class=\"summary-row small\"><span>Delivery charge</span><span>","cart.district_label":"District","cart.enter_full_address":"Enter your full address.","cart.items_count_suffix":" items","cart.main_button_place_order":"Place order •","cart.main_button_view_cart":"View cart •","cart.my_orders":"My orders 📦","cart.no_orders_hint":"Your first order will appear here.","cart.no_orders_yet":"No orders yet.","cart.order_confirmation_coming":"You will soon get a confirmation message from the bot. If it doesn't come, copy the order below and send it in the bot chat.","cart.order_confirmation_note":"Your order will be sent to the shop. The shop will message you to confirm your order.","cart.order_copy_if_no_confirmation":"If you don't get a confirmation from the bot, copy the order above and send it in the chat.","cart.order_details_heading":"Order details","cart.order_district_label":"<div class=\"order-district\">District:","cart.order_sent_message":"Thank you! Your order has been sent.","cart.order_sent_title":"Order sent!","cart.order_summary_address":"Address:","cart.order_summary_delivery":"Delivery (","cart.order_summary_district":"District:","cart.order_summary_heading":"🛍️ BazarGoo Order","cart.order_summary_number":"Order No.:","cart.order_summary_subtotal":"Products total: ৳","cart.pdf_zero_address_from_bot":"<p>The bot will tell you the shop's ZERO address.</p>","cart.pdf_zero_address_label":"<p><strong>Address:</strong><br><code>","cart.pdf_zero_step_one":"<p>1. Go to the bot and check the ZERO address and the exact amount","cart.remove_item_button":"\">Remove</button>","cart.view_cart":"View cart","cart.view_my_orders":"View my orders","cart.your_cart":"Your cart 🛒","common.ad_could_not_be_shown":"The ad couldn't be shown — please try again.","common.add_button":"\">Add</button>","common.add_favourite_products_empty":"Add products to your favourites.","common.add_to_favourites":"♡ Add to favourites","common.address_placeholder":"House/holding, road, area, police station","common.after_cooldown_button_fragment":"</span></button>","common.after_cooldown_can_do_fragment":"</span></div>","common.after_cooldown_fragment":"</span>","common.again_in_button_fragment":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>Again in <span data-cd-ms=\"","common.again_in_cooldown_fragment":"— again in <span data-cd-ms=\"","common.apply_button":"Apply","common.available_now":"Available now","common.baby_care":"Baby Care","common.bazargoo_channel":"BazarGoo Channel","common.bazargoo_shop":"BazarGoo Shop","common.beauty_and_care":"Beauty & Care","common.browser_go_button":"Go","common.buy_again_button":"\">Buy again</button></div>","common.buy_with_zero":"⛓️ Buy with ZERO","common.category_label":"Category","common.check_internet_reopen":"Check your internet and open it again.","common.chip_all":"\" data-cat=\"all\" type=\"button\">All (","common.chip_wishlist":"\" data-cat=\"__wishlist\" type=\"button\">❤️ Favourites (","common.cleaning":"Cleaning","common.clear_history":"🗑️ Clear history","common.close":"Close","common.coming_soon_monetag":"<div class=\"task-status\">Coming soon — waiting for the Monetag dashboard setup</div>","common.completed_status_done":"<div class=\"task-status done\">Completed ✓</div>","common.congratulations_you_won":"🎉 Congratulations! You won","common.cooldown_more_today_fragment":"</span> later • ","common.copied":"Copied ✓","common.copy_button":"📋 Copy","common.discount_amount_suffix":"): −৳","common.discount_percent_suffix_html":"— 5%)</span><span class=\"order-discount\">−","common.discount_zero":"−৳0","common.do_again_in_fragment":"<div class=\"task-status\">You can do it again in <span data-cd-ms=\"","common.done_today":"Done today ✓","common.done_today_status":"<div class=\"task-status done\">Done today ✓","common.download_again_button":"\">⬇️ Download again</button>","common.earnplaygame_channel":"EarnPLayGame Channel","common.electronics":"Electronics","common.enter_full_name":"Enter your full name.","common.enter_valid_mobile_number":"Enter a valid mobile number (01XXXXXXXXX).","common.exercise":"Exercise","common.flash_deal":"⚡ Flash Deal","common.flash_deal_ends_in":"Ends in","common.flash_deal_ends_in_timer":"Ends in --:--:--","common.full_name_placeholder":"Your full name","common.gadgets":"Gadgets","common.get_number_from_telegram":"📱 Get number from Telegram","common.headphones":"Headphones","common.health_and_beauty":"Health & Beauty","common.home_and_living":"Home & Living","common.home_appliances":"Home Appliances","common.household":"Household","common.in_favourites":"❤️ In your favourites","common.in_stock":"✓ In stock","common.in_stock_badge":"<span class=\"stock-badge in-stock\">✓ In stock</span>","common.inside_dhaka":"Inside Dhaka","common.jewellery":"Jewellery","common.join_adsterratt_channel":"Join the @adsterratt channel","common.join_bazargoo_channel":"Join the @bazargoo287 channel","common.join_channel_button":"\">✈️ Join the channel</button>","common.join_channel_first":"<div class=\"task-status\">Join the channel first</div>","common.join_channel_link":"\" target=\"_blank\" rel=\"noopener\">Join the channel</a>","common.join_cryptoguru_channel":"Join the @cryptoguru_247 channel","common.join_earnplaygame_channel":"Join the @earnplaygame21 channel","common.join_task_done":"Done ✓","common.join_will_be_verified":"<div class=\"task-status\">Your join will be verified ✓ • you'll see the latest post at the top</div>","common.kitchen":"Kitchen","common.label_mobile":"Mobile:","common.label_name":"Name:","common.leaderboard_congrats_rank":"🏆 Congratulations! Last week you ranked #","common.main_menu":"Main menu","common.mens_clothing":"Men's Clothing","common.mens_fashion":"Men's Fashion","common.monthly_bonus_claimed":"This month's bonus claimed ✓","common.monthly_target_gets_you_fragment":"gets you","common.more_times_limit_fragment":" more times • up to 5 times a day</div>","common.more_times_today_fragment":" more times today</div>","common.name_from_telegram_hint":"Your name was taken from Telegram — fix it if it's wrong.","common.nebulizer":"Nebulizer","common.no_ads_right_now":"No ads right now — please try again in a bit.","common.once_every_24_hours":"<div class=\"task-status\">Once every 24 hours</div>","common.open_first_then_claim":"<div class=\"task-status\">Open the Page/channel first, then claim</div>","common.open_pinned_post_link":"<a class=\"btn-secondary pdf-btn\" href=\"https://t.me/bazargoo287/83\" target=\"_blank\" rel=\"noopener\">❤️ Open the pinned post</a>","common.order_status_sent":"</strong><span class=\"order-status\">Sent</span></div>","common.other_category":"Other","common.out_of_stock":"Out of stock","common.out_of_stock_badge":"<span class=\"stock-badge out-of-stock\">Out of stock</span>","common.out_of_stock_button":"<button class=\"btn-add btn-add-disabled\" type=\"button\" disabled>Out of stock</button>","common.outside_dhaka":"Outside Dhaka","common.page_subtitle":"Online shop • bazargoo.com","common.page_title":"BazarGoo — Online Shop","common.pdf_purchased_note":"<div class=\"pdf-note\">Purchased ✓</div>","common.phone_not_found_type_manually":"No number found — type it in yourself.","common.phone_not_shared_type_manually":"You didn't share a number — type it in yourself.","common.phone_request_allow_in_telegram":"Request sent — tap Allow in Telegram…","common.phone_request_please_wait":"Request sent — please wait a moment…","common.prices_from_bazargoo_date":"Prices from bazargoo.com • 8 November 2026","common.products_found_suffix":" products found","common.products_load_failed":"Couldn't load the products.","common.products_total":"Products total","common.profile_task_done":"Done ✓","common.profile_task_remaining":"Remaining","common.promote_heading":"📢 Promote","common.qty_decrease":"\" aria-label=\"Decrease\">−</button>","common.qty_increase":"\" aria-label=\"Increase\">+</button></div>","common.rate_it":"Give a rating","common.react_to_pinned_post":"React to the pinned post","common.recent":"🕐 Recent","common.recently_viewed":"🕐 Recently viewed","common.redeem_failed_try_again":"Couldn't redeem — please try again.","common.remaining_count_fragment":"<div class=\"task-status\">","common.remaining_external_follow_note":" left • external follows/subscribes can't be verified — claim after watching for 15 seconds</div>","common.reward_label":"<div class=\"task-status\">Reward:","common.search_products_label":"Search products","common.search_products_placeholder":"Search products…","common.share_button":"↗ Share","common.shop_tab":"Shop","common.shop_will_message_to_confirm":"The shop will message you to confirm.","common.sort_label":"Sort","common.sort_popular":"Sort: Popular","common.sort_price_high_to_low":"Price: High to Low","common.sort_price_low_to_high":"Price: Low to High","common.submit_answers_button":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-quiz-submit>Submit answers</button>","common.summary_products_total_html":"<div class=\"summary-row small\"><span>Products total</span><span>","common.summary_total_html":"<div class=\"summary-row\"><span>Total</span><strong>","common.tap_to_copy":"Tap to copy","common.task_completed_status":"<div class=\"task-status done\">Completed ✓","common.times_limit_watch_full_ad":" times • up to 5 times a day • watch the full ad to earn the reward</div>","common.today_five_times_done":"<div class=\"task-status done\">Today's 5 times done ✓ — again in <span data-cd-ms=\"","common.today_five_times_done_button":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>Today's 5 times done ✓</button>","common.today_more_times_fragment":"<div class=\"task-status\">Today, ","common.total":"Total","common.total_taka":"Total: ৳","common.toys":"Toys","common.trimmer":"Trimmer","common.verify_button":"Verify","common.view_button":"👁️ View","common.view_on_bazargoo":"View on bazargoo.com ↗","common.view_shop_button":"<button class=\"btn-primary\" type=\"button\" data-wallet-shop>🛍️ View shop</button>","common.watch_ad_link":"\" target=\"_blank\" rel=\"noopener\">👁️ Watch ad</a>","common.womens_fashion":"Women's Fashion","common.write_review_placeholder":"Write about your experience (optional)…","common.xp_left_fragment":"XP left</span></div>","common.you_won_today":"🎉 You won today","common.your_zero_balance":"Your ZERO: 0","common.zero_prize_received":"ZERO prize received!","common.zero_products":"0 products","contest.claim_this_pdf_free_button":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-contest-claim>🎁 Get this PDF free</button>","contest.congrats_last_month_winner":"<div class=\"pdf-note\">🎉 Congratulations — you are last month's winner! Take 1 PDF of your choice free:</div>","contest.direct_referrals_label":"</div><div class=\"hist-date\">Direct referrals</div></div>","contest.last_month_winner_open":"<div class=\"task-status\">Last month's winner (","contest.loading_pdf_list":"<div class=\"pdf-note\">Loading PDF list…</div>","contest.no_referrals_yet_this_month":"<div class=\"pdf-note\">No one has made a referral this month yet — share your link and be the first!</div>","contest.people_suffix":" people</div>","contest.prize_claimed_see_bot_chat":"<div class=\"task-status done\">Your prize has been claimed ✓ — see the PDF in the bot's chat.</div>","contest.referral_contest_title":"🎁 Referral Contest","contest.referrals_count_suffix_rows":" people</div></div>","contest.referrals_suffix":" referrals</div>","contest.this_month_open":"<div class=\"pdf-note\">This month (","contest.top5_this_month_last_winner_prize":") — the top 5 who invite the most friends this month. Last month's winner gets 1 PDF of their choice free.</div>","contest.your_referrals_this_month":"<div class=\"task-status\">Your referrals this month:","coupons.banner_bazar5_used":"<span class=\"coupon-banner-text\">✓ BAZAR5 used</span>","coupons.banner_first_order_5pct_bazar5":"<span class=\"coupon-banner-text\">🎉 5% off your first order — coupon: <strong>BAZAR5</strong></span>","coupons.banner_first_order_discount_used":"<span class=\"coupon-banner-hint\">The first-order discount has been used</span>","coupons.banner_tap_to_copy":"<span class=\"coupon-banner-hint\">Tap to copy</span>","coupons.buy_coupon_100_zero_button":"<button class=\"btn-primary\" type=\"button\" data-buy-coupon>🎟️ Buy coupon — 100 ZERO</button>","coupons.code_shows_after_buy_note":"<div class=\"task-status\">After buying, the code will show below — enter it at checkout to get 5% off.</div>","coupons.copy_code_button":"\">📋 Copy code</button>","coupons.coupon_already_used":"This coupon has already been used.","coupons.coupon_bought_code":"🎟️ Coupon bought! Code:","coupons.coupon_buy_failed":"Coupon could not be bought — please try again.","coupons.coupon_code_not_found":"Coupon code not found.","coupons.coupon_code_placeholder":"Coupon code (e.g. BAZAR5)","coupons.coupon_not_used_yet":"Not used yet — use it at checkout","coupons.coupon_not_yours":"This coupon is not yours.","coupons.coupon_used":"Used ✓","coupons.coupon_verify_failed_internet":"Coupon could not be verified — check your internet.","coupons.coupon_verify_failed_retry":"Coupon could not be verified — please try again.","coupons.discount_bazar5_5pct":"Discount (BAZAR5 — 5%)","coupons.discount_label_open_order_summary":"Discount (","coupons.discount_zero5_5pct":"Discount (ZERO5 — 5%)","coupons.first_order_5pct_coupon_label":"🎉 5% off your first order — coupon:","coupons.five_percent_off_applied":"5% off applied! 🎉","coupons.five_percent_off_applied_zero5":"5% off applied! 🎉 (ZERO5 coupon)","coupons.five_percent_off_coupon_name":"<div><div class=\"earn-name\">5% off coupon</div>","coupons.hundred_zero_one_time_off_note":"<div class=\"earn-level\">100 ZERO = one-time 5% off — cannot be used with BAZAR5</div></div>","coupons.my_coupons_tab":"🎟️ My Coupons","coupons.no_coupon_yet_save_100_zero":"No coupon bought yet — save 100 ZERO to buy a 5% off coupon.","coupons.not_enough_zero_balance":"Not enough ZERO — the coupon costs 100 ZERO (your balance","coupons.one_coupon_remove_bazar5_use_zero5":"Only one coupon works per order — remove BAZAR5 and enter the ZERO5 coupon.","coupons.one_coupon_remove_zero5_use_bazar5":"Only one coupon works per order — remove the ZERO5 coupon and enter BAZAR5.","coupons.order_discount_label_open":"<div class=\"summary-row small\"><span>Discount (","coupons.price_100_zero":"<div class=\"earn-balance-big\">100 ZERO</div></div>","coupons.remove_coupon":"Remove coupon","coupons.sort_discount_high_to_low":"Discount: high to low","coupons.verifying_coupon":"Verifying coupon…","coupons.wrong_coupon_code":"Wrong coupon code.","coupons.zero5_coupon_5pct_label":"ZERO5 coupon (5%)","coupons.zero5_telegram_only":"The ZERO5 coupon can only be verified in the Telegram app.","coupons.zero_coupon_tab":"🎟️ ZERO Coupon","friend.copy_referral_link_button":"<button class=\"btn-secondary pdf-btn\" type=\"button\" data-ref-share>🔗 Copy referral link</button>","friend.friends_heading":"👥 Friends","friend.my_referral_list":"👥 My referral list","friend.nav_friends_label":"Friends","friend.no_referrals_yet":"Nobody has joined through your link yet — share your link.","friend.referral_level_label":"<div class=\"pdf-desc\">Level","friend.stat_contest_rank_label":"Contest rank","friend.stat_referral_earnings_label":"Referral earnings","friend.stat_referrals_label":"Referrals","friend.total_referral_earnings":"Total earnings from referrals:","friend.total_referral_earnings_zero":"Total earnings from referrals: 0 ZERO","friend.your_referral_link":"🔗 Your referral link","friend.zero_earned":" ZERO earned</span></div>","leaderboard.claim_prize_button_open":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-lb-claim>🏆 Claim prize —","leaderboard.friend_fallback_name":"Friend","leaderboard.last_week_earnings_label":"</div><div class=\"hist-date\">Last week's earnings</div></div>","leaderboard.last_week_prize_claimed":"<div class=\"task-status done\">Last week's prize claimed ✓</div>","leaderboard.last_week_top3_title_open":"<div class=\"earn-group-title\">Last week's top 3 (","leaderboard.level_separator":"• Level","leaderboard.no_earnings_yet_this_week":"<div class=\"pdf-note\">No one has earned this week yet — do a task and be the first!</div>","leaderboard.not_on_list_yet":"<div class=\"task-status\">You are not on this week's list yet — do a task and your rank will appear.</div>","leaderboard.this_week_earnings_label":"<div class=\"hist-date\">This week's earnings</div></div>","leaderboard.this_week_separator":"• This week","leaderboard.this_week_title_open":"<div class=\"earn-group-title\">🏆 Leaderboard — this week (","leaderboard.you_marker":"(You)","leaderboard.your_rank_open":"<div class=\"task-status\">Your rank: #","pdfs.both_versions_note":"<div class=\"pdf-note\">Bangla + English versions — you get both</div>","pdfs.buy_with_stars":"\">⭐ Buy with Stars</button>","pdfs.buy_with_zero":"\">⛓️ Buy with ZERO</button>","pdfs.category_ai_tutorials":"AI Tutorials","pdfs.category_books":"Books","pdfs.category_career":"Career","pdfs.category_health":"Health","pdfs.category_language_study":"Language & Study","pdfs.category_online_earning":"Online Earning","pdfs.category_religious_books":"Religious Books","pdfs.category_shopping":"Shopping","pdfs.category_test":"Test","pdfs.claim_reward_free_button":"\">🎁 Get it free — Reward</button>","pdfs.download_bangla_button":"\">⬇️ Download (Bangla)</a>","pdfs.free_coming_soon":"<span class=\"pdf-note\">Free — coming soon</span>","pdfs.free_if_top3_disabled_button":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>🎁 Free if you are in the top 3</button>","pdfs.free_preview_button":"\">👀 See free preview</a>","pdfs.join_bazargoo_redeem_pdfs":"Join BazarGoo — do tasks, earn ZERO, and redeem PDFs! 🛍️","pdfs.my_pdfs_label":"My PDFs","pdfs.my_pdfs_telegram_note":"Open the app in Telegram to see your purchased PDFs here.","pdfs.my_pdfs_title":"📚 My PDFs","pdfs.pdf_sent_check_bot":"PDF sent — check the bot 🎁","pdfs.pdf_sent_check_bot_chat":"🎁 PDF sent — check the bot's chat.","pdfs.price_free":"<span class=\"pdf-price free\">Free</span>","pdfs.price_reward_top3_free":"<span class=\"pdf-price free\">🎁 Reward — Free for the top 3 performers</span>","pdfs.price_stars_not_set":"⭐ Price not set yet","pdfs.price_zero_not_set":"⛓️ ZERO: Price not set yet","pdfs.redeem_pdfs_withdraw_note":"Do tasks to earn ZERO and redeem PDFs — you can also withdraw your saved ZERO from your Wallet.","pdfs.redeem_with_zero":"\">⛓️ Redeem with ZERO</button>","pdfs.religion_claimed_see_bot_chat":"<div class=\"task-status done\">Claimed ✓ — see the PDF in the bot's chat.</div>","pdfs.religion_rank_telegram_note":"<div class=\"pdf-note\">Open the app in Telegram to see your rank.</div>","pdfs.religion_this_month":"This month","pdfs.religion_this_week":"This week","pdfs.religion_today":"Today","pdfs.religion_top3_fallback":"in the top 3","pdfs.religion_top3_free_books_suffix":"— get the books below free!</div>","pdfs.religion_top3_how_to_get_free":"<div class=\"pdf-note\">If you are in the top 3 today, this week, or this month, you will get these books free. Do tasks, earn ZERO, and climb the leaderboard!</div>","pdfs.religion_top3_no_period":"🎉 You are in the top 3 — get the books below free!","pdfs.religion_top3_open":"<div class=\"pdf-note\">🎉 You are","pdfs.religion_top3_periods":"🎉 You are in the top 3 {0} — get the books below free!","pdfs.wallet_buy_button_suffix":") to buy</button>","pdfs.wallet_buy_pdfs_button":"<button class=\"btn-primary\" type=\"button\" data-wallet-pdf>📚 Buy PDFs</button>","product.100_million_series_3":"$100 Million Series – 3 International Bestsellers by Alex Hormozi","product.automatic_fruit_and_vegetable":"Automatic Fruit and Vegetable Peeler","product.china_brush_fabric_calligraphy":"China Brush Fabric Calligraphy Shawl","product.double_sit_up_bar":"Double Sit Up Bar – Easy Way to Stay Fit at Home","product.multipurpose_durable_plastic_basket":"Multipurpose Durable Plastic Basket","product.silicone_sink_splash_guard":"Silicone Sink Splash Guard","product.wool_calligraphy_shawl":"Wool Calligraphy Shawl","profile.complete_profile_title":"<div class=\"earn-group-title\">📋 Complete your profile —","profile.default_user_name":"User","profile.joined_label":"• Joined:","profile.level_bar_level_label":"<div class=\"earn-levelbar-top\"><span>⭐ Level ","profile.level_label":"<div class=\"earn-level\">Level ","profile.level_note_no_unlock":"<div class=\"earn-note\">Level is only based on your total earnings — it does not unlock anything yet.</div>","profile.next_level_stats_open":"<div class=\"earn-stats\">Next level: ","profile.profile_label":"Profile","profile.profile_tab_title":"👤 Profile","profile.referral_bonus_commission_note":"You get a bonus when a friend checks in for the first time — Level 1: 10 · Level 2: 5 · Level 3: 2 ZERO. You also earn commission on their task earnings: Level 1: 3% · Level 2: 2% · Level 3: 1%.","profile.referral_earnings_label":"• Earnings from referrals:","profile.referrals_level2_separator":" people • Level 2:","profile.referrals_level3_separator":" people • Level 3:","profile.security_coming_soon":"<div class=\"earn-details\">🔒 Security — coming soon</div>","profile.stat_lifetime_label":"Lifetime","profile.stat_tasks_label":"Tasks","profile.tasks_completed_count_suffix":" tasks completed • 👥","profile.total_earnings_separator":"• Total earnings","profile.xp_left_next_level_label":"<span>XP left to the next level: ","profile.your_referrals_level1":"<div class=\"task-status\">Your referrals — Level 1:","promote.approved_goes_live_suffix":") — once approved, it will go live as a sponsored task.</div>","promote.budget_label":"<label>Budget <input id=\"promoBudget\" type=\"number\" min=\"0\" step=\"any\" placeholder=\"100 ZERO / $2\"></label>","promote.budget_limits_note":"<div class=\"pdf-note\">Minimum budget: <strong>100 ZERO</strong> or <strong>$2</strong> (≈1.91 GRAM) = 80 tasks. Maximum: 625 ZERO / $10 = 300 tasks. Pay first, then the admin approves each promotion — it will not go live without approval. When the budget runs out, the promotion stops by itself.</div>","promote.completions_count":" tasks</strong> • per task, ","promote.confirm_payment_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"promoConfirmBtn\">Confirm payment</button>","promote.continue_to_payment_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"promoSubmitBtn\">Continue to payment</button>","promote.currency_label":"<label>Currency <select id=\"promoCurrency\"><option value=\"zero\">⛓️ ZERO</option><option value=\"gram\">💎 GRAM</option></select></label></div>","promote.enter_title_link_budget":"Enter a title, link and correct budget.","promote.enter_txid":"Enter the txid.","promote.intro_reward_per_task":"<p>Share your page/channel/link with this app's users. When a user completes a task, they earn a reward — <strong>1 ZERO</strong> (ZERO promotion) or <strong>~0.019 GRAM</strong> (GRAM promotion).</p>","promote.link_label":"<label>Link <input id=\"promoUrl\" type=\"url\" placeholder=\"https://...\"></label>","promote.pay_from_wallet_checkbox":"<label><input id=\"promoWallet\" type=\"checkbox\"> Pay from Wallet balance</label>","promote.pay_with_wallet_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"promoConfirmBtn\">Pay with Wallet</button>","promote.payment_received_pending_approval":"<div class=\"task-status done\">✅ Payment received! Your promotion is waiting for admin approval (","promote.reward_per_completion_suffix":" reward</div>","promote.send_to_address":"</strong> — send it to this address:<br><code>","promote.sponsor_label":"<div class=\"pdf-desc\">🏷️ Sponsor</div>","promote.title_label":"<label>Title <input id=\"promoTitle\" type=\"text\" maxlength=\"80\" placeholder=\"e.g. My Facebook Page\"></label>","promote.txid_label":"<label>Transaction ID (txid / tx hash) <input id=\"promoTxid\" type=\"text\" placeholder=\"Enter txid\"></label>","promote.type_facebook_options":"<option value=\"facebook_page\">Facebook Page</option><option value=\"facebook\">Facebook (post/profile)</option>","promote.type_label_open":"<div class=\"form-row\"><label>Type <select id=\"promoType\">","promote.type_telegram_post_options":"<option value=\"telegram_channel\">Telegram channel</option><option value=\"post\">Post</option>","promote.type_video_youtube_tiktok_options":"<option value=\"video\">Video</option><option value=\"youtube\">YouTube</option><option value=\"tiktok\">TikTok</option>","promote.type_x_instagram_referral_options":"<option value=\"x\">X (Twitter)</option><option value=\"instagram\">Instagram</option><option value=\"referral\">Referral link</option>","promote.wallet_deduct_intro":"<div class=\"pdf-note\">From your Wallet balance, <strong>","promote.wallet_deduct_suffix":"</strong> will be deducted.</div>","shop.clear_search":"Clear search","shop.cooldown_hours":"hours","shop.cooldown_minutes":"minutes","shop.copy_review":"Copy review","shop.earn_level_total_earnings":"XP • Total earnings","shop.earnings_history_heading":"📈 Earnings history","shop.month_apr":"Apr","shop.month_aug":"Aug","shop.month_dec":"Dec","shop.month_feb":"Feb","shop.month_jan":"Jan","shop.month_jul":"Jul","shop.month_jun":"Jun","shop.month_mar":"Mar","shop.month_may":"May","shop.month_nov":"Nov","shop.month_oct":"Oct","shop.month_sep":"Sep","shop.my_review_title":"<div class=\"my-review-title\">Your review</div>","shop.no_products_found":"No products found","shop.no_reviews_yet":"No reviews yet — be the first to write one.","shop.no_transactions_yet":"No transactions yet.","shop.nothing_found":"😕 Nothing found","shop.review_choose_stars":"Please give 1–5 stars.","shop.review_copy_if_no_confirmation":"If you don't get a confirmation from the bot, copy the review below and send it in the bot chat.","shop.review_copy_if_no_confirmation_above":"If you don't get a confirmation from the bot, copy the review above and send it in the chat.","shop.review_count_suffix":" reviews","shop.review_details_heading":"Review details","shop.review_pending_approval":"Sent — waiting for approval","shop.review_published":"Published ✓","shop.review_sent_message":"Thank you! Your review has been sent.","shop.review_sent_title":"Review sent!","shop.review_star_button":"star\">★</button>","shop.review_summary_comment":"Comment:","shop.review_summary_heading":"⭐ BazarGoo Review","shop.review_summary_number":"Review No.:","shop.review_summary_product":"Product:","shop.review_summary_product_id":"Product ID:","shop.review_summary_rating":"Rating:","shop.reviews_heading":"Reviews","shop.share_button":"\">↗ Share</button>","shop.submit_review":"Send review","shop.transaction_history_heading":"💳 Transaction history","shop.transaction_label":"Transaction","shop.try_another_search":"Try searching for something else.","shop.wallet_earnings_label":"<div class=\"earn-level\">Earnings:","shop.wishlist_button_aria_label":"\" aria-label=\"Add to wishlist\">","shop.wishlist_empty":"💔 Your wishlist is empty.","shop.wishlist_empty_hint":"Tap the heart to add products you like.","shop.write_review":"Write a review","spin.ad_could_not_be_shown":"The ad could not be shown — try again. Your spin was not lost.","spin.ad_did_not_load":"The ad did not load — try again in a bit. Your spin was not lost.","spin.ad_not_finished_no_reward":"No reward unless you finish the ad — try again. Your spin was not lost.","spin.ad_reward_already_given":"This ad's reward was already given ✓","spin.adsgram_not_live":"AdsGram ads are not live yet — dashboard setup is still pending. Your spin was not lost.","spin.channel_joins_checklist_suffix":"/4) — see the checklist in your profile","spin.channel_joins_pending":"Channel joins pending (","spin.channel_joins_status":"Joined {0} of 4 channels — see the checklist in your profile","spin.checkin_today_pending":"Today's check-in is still pending","spin.congrats_free_spin_again":"🎉 Congratulations! You got +1 free spin — spin again!","spin.daily_spins_note":"<div class=\"task-status\">4 spins a day (2 Monetag + 2 AdsGram) — watch 1 ad to get each reward. The prize is decided on the server.</div>","spin.device_already_has_account":"This phone already has an account","spin.free_spin_prize_tier":"+1 free spin — ","spin.got_free_spin_result":"🎉 You got +1 free spin!","spin.monetag_not_live":"Monetag ads are not live yet — dashboard setup is still pending. Your spin was not lost.","spin.no_ads_right_now":"There are no ads right now — try again in a bit. Your spin was not lost.","spin.no_reward_from_ad":"This ad gave no reward — try again. Your spin was not lost.","spin.reward_could_not_be_given":"The reward could not be given.","spin.spin_button_disabled":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>🎡 Spin</button>","spin.spin_with_adsgram_button":">🎡 Spin with AdsGram","spin.spin_with_monetag_button":">🎡 Spin with Monetag","spin.spins_done_today_button":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>Today's spins are done ✓ — come back tomorrow</button>","spin.spins_left_suffix":" spins left","spin.spun_today_intro":"<div class=\"task-status done\">Spun ","spin.spun_today_suffix":" times today ✓</div>","spin.unlock_remaining_intro":"<div class=\"task-status\">Still needed to unlock:<br>•","tasks.account_already_exists_on_phone":"This phone already has an account — you can't earn with this account.","tasks.account_exists_no_task_earnings":"This phone already has an account — you can't earn from tasks with this account. Shopping and buying PDFs still work.","tasks.ad_not_loaded_try_later":"The ad didn't load — try again shortly.","tasks.ad_not_verified_try_again":"The ad couldn't be verified — try again.","tasks.address_incorrect":"The address isn't correct — check and enter it again.","tasks.ads_not_available_now":"Ads can't be watched right now.","tasks.already_done_today":"Already done for today.","tasks.amount_below_minimum":"The amount is below the minimum limit.","tasks.amount_incorrect":"The amount isn't correct.","tasks.amount_sent_not_enough":"The amount sent isn't enough.","tasks.answer_all_questions":"Answer all the questions.","tasks.budget_out_of_range":"Budget is out of range — minimum 100 ZERO / $2, maximum 625 ZERO / $10.","tasks.checkin_button_open":">✅ Check in — +","tasks.checkins_dash":"check-ins —","tasks.claim":"Claim","tasks.claim_after_video_ends_disabled":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-claim=\"video_daily\" data-video-claim disabled>Claim after the video ends</button>","tasks.claim_with_check":"✅ Claim","tasks.community_today_title_open":"👥 Community — today ","tasks.could_not_claim_try_again":"Couldn't claim — try again.","tasks.countdown_close":"</span></div>","tasks.currency_not_supported":"This currency isn't supported.","tasks.daily_reward_title_open":"<div class=\"dr-head\"><div class=\"dr-title\">🎁 Daily Reward</div>","tasks.day_label_open":"<span>Day ","tasks.day_streak_close":"-day streak</div></div>","tasks.done":"done","tasks.done_close":"done</div>","tasks.facebook_pages_subtitle":"<div class=\"earn-group-title earn-sub\">📘 Facebook Pages</div>","tasks.gram_payment_not_live":"GRAM payments aren't live yet — admin setup is still pending.","tasks.gram_withdraw_unavailable_low_funds":"GRAM can't be withdrawn right now — funds are low.","tasks.join_4_channels_first":"Join all 4 channels first — see the checklist in your profile.","tasks.join_channel_first_claim_again":"Join the channel first — then claim again after joining.","tasks.link_invalid_start_https":"The link isn't valid — start it with https://","tasks.lucky_spin_desc":"<div class=\"pdf-desc\">Completely free — 4 times a day (2 Monetag + 2 AdsGram). Requirements: today's check-in + joining 4 channels. Watch 1 ad to get each reward.</div>","tasks.monetag_ads_not_live":"Monetag ads aren't live yet — dashboard setup is still pending.","tasks.monthly_checkin_bonus_title_open":"<div class=\"streak-strip\"><div class=\"streak-title\">📅 Monthly check-in bonus: ","tasks.more_seconds_then_claim":" more seconds, then claim.","tasks.nav_tasks":"✅ Tasks","tasks.nav_tasks_label":"Tasks","tasks.network_spins_done_try_another":"Today's spins on this network are done — try another network.","tasks.next_ad_countdown_open":"<div class=\"task-status\">Next ad <span data-cd-ms=\"","tasks.next_in_countdown_open":"<div class=\"dr-countdown\">Next in <span data-cd-ms=\"","tasks.no_earnings_from_ad_try_again":"This ad didn't earn anything — try again.","tasks.no_earnings_yet_do_tasks":"No earnings yet — complete tasks.","tasks.no_spin_waiting_spin_again":"No spin is waiting — spin again.","tasks.not_enough_zero":"Not enough ZERO.","tasks.not_enough_zero_do_more_tasks":"Not enough ZERO — complete more tasks.","tasks.not_in_last_week_top3":"You weren't in last week's top 3.","tasks.not_in_top3_complete_tasks":"You're not in today's / this week's / this month's top 3 — complete tasks to climb the leaderboard.","tasks.not_joined_try_again":"You haven't joined the channel — join it and try again.","tasks.not_this_month_winner":"You're not this month's winner.","tasks.not_yet_time_try_later":"Not yet time — try again later.","tasks.one_answer_wrong_try_again":"One answer was wrong — try again.","tasks.open_sponsor_task_first":"Open the sponsor task first.","tasks.opened_check":"👁️ Opened ✓","tasks.payment_not_confirmed_yet":"The payment isn't confirmed yet — try again shortly.","tasks.payment_not_verified_check_txid":"Payment not verified — check whether the txid is correct.","tasks.pdf_cannot_be_bought_reward_only":"This PDF can't be bought — it's given as a reward.","tasks.pdf_cannot_be_selected":"This PDF can't be selected.","tasks.pdf_not_given_as_reward":"This PDF isn't given as a reward.","tasks.pdf_stars_price_not_set":"This PDF's Stars price hasn't been set yet.","tasks.pdf_zero_price_not_set":"This PDF's ZERO price hasn't been set yet.","tasks.plus_1_zero_added":"🎉 +1 ZERO added!","tasks.promote_button":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-promote-open>📢 Promote</button></article>","tasks.promote_desc":"<article class=\"pdf-card\"><div class=\"pdf-desc\">Reach this app's users with your Facebook Page, YouTube channel, or any link — they earn a reward when they complete the task.</div>","tasks.promote_your_page_channel_title":"<div class=\"earn-group-title\">📢 Promote your Page / Channel</div>","tasks.promotion_no_longer_live":"This promotion is no longer live.","tasks.promotion_type_invalid":"The promotion type isn't valid.","tasks.quiz_desc":"Once a day — answer all 3 questions correctly","tasks.quiz_title":"Daily Quiz","tasks.rate_not_found_try_later":"The rate couldn't be found — try again shortly.","tasks.reward_already_claimed":"This reward has already been claimed.","tasks.reward_collected_come_back_tomorrow":"<div class=\"dr-done\">Collected ✓ — come back tomorrow</div>","tasks.reward_expired":"This reward has expired.","tasks.reward_grows_note":" ZERO — check in every day and the reward grows.</div>","tasks.reward_not_yours":"This reward isn't yours.","tasks.spin_already_made_watch_ad":"A spin has already been made — watch the ad to collect the reward.","tasks.spin_expired_spin_again":"The spin has expired — spin again.","tasks.spin_not_unlocked":"The spin isn't unlocked yet — complete the requirements.","tasks.spin_requires_ad_see_card":"Spins now require watching an ad — see the spin card below.","tasks.stars_cannot_be_withdrawn":"Stars can't be withdrawn — they can only be used to buy PDFs.","tasks.streak_days_today_plus":"days • today +","tasks.streak_title_open":"<div class=\"streak-strip\"><div class=\"streak-title\">🔥 Check-in streak: ","tasks.tab_community":"👥 Community","tasks.tab_daily":"🎁 Daily","tasks.tab_referral":"🔗 Referral","tasks.tab_sponsor":"📢 Sponsor","tasks.tab_visit":"🌐 Visit","tasks.tab_watch_earn":"📺 Watch & Earn","tasks.task_cannot_be_claimed_here":"This task can't be claimed here — watch the ad first.","tasks.telegram_channels_subtitle":"<div class=\"earn-group-title earn-sub\">✈️ Telegram Channels</div>","tasks.today_limit_reached":"Today's limit is reached.","tasks.today_spins_done":"Today's spins are done — come back tomorrow.","tasks.today_withdrawal_limit_reached":"Today's withdrawal limit is reached.","tasks.todays_checkin":"Today's check-in","tasks.todays_reward_plus_open":"<div class=\"dr-note\">Today's reward +","tasks.transaction_not_found":"This transaction couldn't be found.","tasks.txid_already_confirmed":"This txid has already been used to confirm.","tasks.txid_required":"A txid is required.","tasks.video_not_loaded_check_internet":"The video didn't load — check your internet and open it again.","tasks.video_watched_claim_now":"Video watched ✓ — claim now.","tasks.visit_today_title_open":"<div class=\"earn-group-title\">🌐 Visit — today ","tasks.wait_view_task_then_claim":"Wait a moment — view the task first, then claim.","tasks.watch_ad_disabled":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>📺 Watch Ad</button>","tasks.watch_ad_first_then_claim":"Watch the ad first, then claim.","tasks.watch_ad_monetag_disabled":"<button class=\"btn-secondary pdf-btn\" type=\"button\" disabled>📺 Watch Ad (Monetag)</button>","tasks.watch_ad_plus_1_zero":"<button class=\"btn-primary pdf-btn\" type=\"button\" data-monetag-watch>📺 Watch Ad — +1 ZERO</button>","tasks.watch_full_video_to_enable_claim":"<div class=\"video-note\">Watch the full video to enable the claim button.</div>","tasks.watch_more_seconds_open":"Watch ","tasks.watch_more_seconds_then_claim":"Watch {0} more seconds, then claim.","tasks.withdraw_gate_join_react":"First join the BazarGoo Withdraw channel and ❤️ react to the pinned post — see the two \"Before withdrawing\" steps in the Wallet.","tasks.your_zero":"Your ZERO:","wallet.address_currency_label":"<div class=\"form-row\"><label>Currency <select id=\"addrCurrency\"><option value=\"zero\">⛓️ ZERO</option><option value=\"gram\">💎 GRAM</option></select></label>","wallet.address_saved":"<div class=\"task-status done\">✅ Address saved.</div>","wallet.address_value_label":"<label>Address <input id=\"addrValue\" type=\"text\" placeholder=\"t1… / EQ…\"></label></div>","wallet.deposit_amount_label":"<label>Amount <input id=\"depAmount\" type=\"number\" min=\"1\" step=\"any\" placeholder=\"10\"></label></div>","wallet.deposit_confirm_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"depConfirmBtn\">Confirm</button>","wallet.deposit_credited":" has been added to your Wallet!</div>","wallet.deposit_currency_label":"<div class=\"form-row\"><label>Currency <select id=\"depCurrency\"><option value=\"stars\">⭐ Stars</option><option value=\"zero\">⛓️ ZERO</option><option value=\"gram\">💎 GRAM</option></select></label>","wallet.deposit_heading":"<h3>⬇️ Deposit</h3>","wallet.deposit_optional_note":"<div class=\"earn-note\">You can top up your Wallet to buy, and withdraw any time — topping up is not required, direct payment is always available. There is no fee or minimum to withdraw ZERO. GRAM withdrawals are manual — the admin sends it and shares the txid.</div>","wallet.deposit_start_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"depStartBtn\">Start deposit</button>","wallet.deposit_txid_label":"<label>Transaction ID (txid / tx hash) <input id=\"depTxid\" type=\"text\" placeholder=\"Enter txid\"></label>","wallet.earned_zero_row_label":"⛓️ Earned ZERO","wallet.earning_source_ad":"Ad","wallet.earning_source_checkin":"Check-in","wallet.earning_source_join":"Join","wallet.earning_source_quiz":"Quiz","wallet.earning_source_react":"React","wallet.earning_source_video":"Video","wallet.earnings_label":"<p><strong>Earnings:</strong>","wallet.enter_address":"Enter your address.","wallet.enter_correct_amount":"Enter the correct amount.","wallet.gram_not_configured_yet":"not configured yet","wallet.gram_not_live_note":"<div class=\"pdf-note\">GRAM payments/withdrawals are not live yet — admin setup is still pending.</div>","wallet.hero_earned_wallet_split":"Earned {0} ZERO + Wallet {1} ZERO","wallet.history_label_commission":"Commission","wallet.history_label_purchase":"Purchase","wallet.history_label_redeem":"Redeem","wallet.history_label_referral_bonus":"Referral bonus","wallet.history_label_task":"Task","wallet.insufficient_balance_deposit_first":"Not enough balance in your Wallet — deposit first.","wallet.join_required_for_spin_rewards_withdraw":"<div class=\"earn-note\">To spin, earn leaderboard rewards and withdraw, you need to join all 4 channels.</div>","wallet.pdf_sent_check_bot":"PDF sent ✓ — check the bot chat.","wallet.pdf_zero_step2_send":"<p>2. Send ZERO from your own wallet.</p>","wallet.pdf_zero_step3_send_txid":"<p>3. Send the payment transaction id (txid) in the bot chat — once it is verified, the bot will send you the PDF.</p>","wallet.profile_wallet_live_note":"ZERO and GRAM withdrawals and deposits are now live — open your Wallet to see. Withdrawals are manual — the admin sends it and shares the txid. There is no fee or minimum to withdraw ZERO.","wallet.profile_wallet_section_title":"👛 Wallet","wallet.purchase_with_wallet_failed":"Could not buy with Wallet.","wallet.save_address_button":"<button class=\"btn-secondary btn-block\" type=\"button\" id=\"addrSaveBtn\">Save address</button>","wallet.save_address_heading":"<h3>📍 Save my address</h3>","wallet.send_txid_in_bot_button":"Send txid in the bot","wallet.stars_invoice_intro":"<div class=\"pdf-note\">Go to the bot — you will get an invoice for ","wallet.stars_invoice_pay_note":" Stars — once you pay, it will be added to your Wallet.</div>","wallet.total_zero_balance_label":"Total ZERO Balance","wallet.wallet_zero_row_label":"👛 Wallet ZERO","wallet.withdraw_address_label":"<label>Your address <input id=\"wdAddress\" type=\"text\" placeholder=\"For ZERO: t1… / For GRAM: EQ…/UQ…\"></label>","wallet.withdraw_amount_label":"<label>Amount <input id=\"wdAmount\" type=\"number\" min=\"0\" step=\"any\" placeholder=\"1\"></label></div>","wallet.withdraw_currency_label":"<div class=\"form-row\"><label>Currency <select id=\"wdCurrency\"><option value=\"zero\">⛓️ ZERO</option><option value=\"gram\">💎 GRAM</option></select></label>","wallet.withdraw_deposit_button":"<button class=\"btn-primary\" type=\"button\" data-wallet-open>⬆️ Withdraw / ⬇️ Deposit</button>","wallet.withdraw_gate_card_heading":"Withdraw gate","wallet.withdraw_gate_claim_button":"✅ I reacted — claim it","wallet.withdraw_gate_heading":"💸 Before withdrawing — 2 steps","wallet.withdraw_gate_join_button":"1️⃣ Join the channel ","wallet.withdraw_gate_join_link":"Join the channel","wallet.withdraw_gate_join_row":"✅ Join @bazargoowithdraw","wallet.withdraw_gate_note":"To withdraw, first join the <b>BazarGoo Withdraw</b> channel and ❤️ react to the pinned post — once a day.","wallet.withdraw_gate_ok":"✅ Withdrawal requirements met — you can withdraw now.","wallet.withdraw_gate_react_button":"2️⃣ React to the pinned post ❤️ ","wallet.withdraw_gate_react_link":"❤️ Open the pinned post","wallet.withdraw_gate_react_row":"○ React to the pinned post","wallet.withdraw_gate_refresh_button":"🔄 Check status again","wallet.withdraw_heading":"<h3>⬆️ Withdraw</h3>","wallet.withdraw_limits_note":"<div class=\"pdf-note\">There is no fee or minimum to withdraw ZERO — you can withdraw even 1 ZERO, any time. Maximum 1,000 ZERO per day. Over 500 ZERO needs admin approval. GRAM: minimum 0.5, maximum 5 per day (no more than 20% of the fund), over 2 GRAM needs approval. Stars cannot be withdrawn.</div>","wallet.withdraw_mode_label":"<div class=\"form-row\"><label>Type <select id=\"wdMode\"><option value=\"instant\">⚡ Withdraw now</option><option value=\"save\">💾 Save in Wallet</option></select></label></div>","wallet.withdraw_pending_approval":") — waiting for admin approval. Once approved, the admin will send it and share the txid.</div>","wallet.withdraw_pending_approval_auto":") — waiting for admin approval. Once approved, it will be sent automatically and the txid will be shared.</div>","wallet.withdraw_pending_soon":") — the admin will send it soon and share the txid.</div>","wallet.withdraw_request_button":"<button class=\"btn-primary btn-block\" type=\"button\" id=\"wdBtn\">Send withdrawal request</button>","wallet.withdraw_request_sent":"<div class=\"task-status\">⏳ Request sent (","wallet.withdraw_saved_in_wallet":" has been saved in your Wallet.</div>","wallet.withdraw_sending_soon":") — sending now, the txid will be shared shortly.</div>","wallet.withdraw_sent_txid":"✅ Sent! txid: ","wallet.zero_guide_step1":"<div class=\"pdf-note\">1. Go to <b>zerochain.info/wallet</b>.<br>","wallet.zero_guide_step2":"2. Create a new wallet — you will get a Wallet ID and Password. <b>Write both down safely — if you forget them, the site cannot recover them.</b><br>","wallet.zero_guide_step3":"3. Your wallet will show your <b>t1…</b> address — copy it.<br>","wallet.zero_guide_step4":"4. Paste the address above and save it, or enter it when you withdraw.<br>","wallet.zero_guide_warning":"⚠️ Never share your Wallet ID, Password or Private Key with <b>anyone</b> — the admin will never ask for them.</div>","wallet.zero_wallet_guide_heading":"<h3>⛓️ How to open a ZERO wallet</h3>","wallet.zero_wallet_name":"<div><div class=\"earn-name\">ZERO Wallet</div>"}};
  // __I18N_STRINGS_END__
  var LANG_KEY = 'bazargoo_lang_v1';
  var LANG = 'bn';
  // Language lookup with {0}/{1} positional replacement. Missing key in
  // the current language falls back to Bengali, then to the key itself —
  // never blank, never a crash.
  function t(key) {
    var args = Array.prototype.slice.call(arguments, 1);
    var s = (STRINGS[LANG] && STRINGS[LANG][key] != null) ? STRINGS[LANG][key]
      : (STRINGS.bn && STRINGS.bn[key] != null) ? STRINGS.bn[key] : key;
    return String(s).replace(/\{(\d+)\}/g, function (m, i) {
      return args[Number(i)] != null ? args[Number(i)] : m;
    });
  }
  // Auto-detect once at boot from Telegram's language_code (en* -> en,
  // anything else/missing -> bn). A stored choice always wins and is
  // never overridden by detection.
  function detectLanguage() {
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved === 'bn' || saved === 'en') { LANG = saved; return; }
    } catch (e) {}
    var code = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.language_code) || '';
    LANG = (String(code).toLowerCase().indexOf('en') === 0) ? 'en' : 'bn';
  }
  function setLanguage(lang) {
    if (lang !== 'bn' && lang !== 'en') return;
    LANG = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    applyI18n();
    rerenderAll();
  }
  // Static HTML shells (index.html data-i18n attributes). Elements whose
  // content is re-rendered by app.js need no attribute — t() covers them.
  // Values that carry HTML use innerHTML (trusted app strings only);
  // a value whose outer wrapper matches the element itself is unwrapped
  // first so we don't nest e.g. <span class="coupon-banner-text"> twice.
  function applyI18n() {
    document.documentElement.setAttribute('lang', LANG === 'en' ? 'en' : 'bn');
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (/<[a-z][^>]*>/i.test(v)) {
        var tag = el.tagName.toLowerCase();
        var m = v.match(new RegExp('^<' + tag + '(\\s[^>]*)?>([\\s\\S]*)</' + tag + '>$'));
        el.innerHTML = m ? m[2] : v;
      } else {
        el.textContent = v;
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-placeholder]'), function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria-label]'), function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
    // Keep the Profile language toggle in sync (both names always shown).
    Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === LANG);
    });
  }
  // Re-render every live section after a language switch (all render
  // from cached data; only history/wallet re-fetch, user-initiated).
  function rerenderAll() {
    renderChips();
    renderGrid();
    renderTasks();
    renderCoupons();
    renderContest();
    renderPdfs();
    renderMyPdfs();
    renderWallet();
    updateCartUI();
    if (openSheet === 'cart') renderCartItems();
    renderCouponBanner();
    renderBrowserHistory();
    renderBrowserQuickLinks();
    if (typeof loadHistory === 'function') loadHistory();
    if (typeof loadWallet === 'function') loadWallet();
    if (typeof loadTasks === 'function' && tgUserId()) loadTasks();
    if (typeof renderFriendStats === 'function') renderFriendStats();
  }
  // v28: worker GETs take ?lang= — the worker translates task titles,
  // quiz, history (and other localized payloads) when it is passed, so
  // the app always sends its current language explicitly (bn included).
  function langQuery() { return '&lang=' + LANG; }
  // Category display label: raw English category in en mode, Bengali
  // label in bn mode. CATEGORY_BN stays data (never translated inline).
  function catLabel(c) { return LANG === 'en' ? (c || '') : (CATEGORY_BN[c] || c || ''); }
  // PDF library category headings (catalog categories are Bengali data).
  var PDF_CAT_KEYS = {
    'টেস্ট': 'pdfs.category_test', 'কেনাকাটা': 'pdfs.category_shopping',
    'AI টিউটোরিয়াল': 'pdfs.category_ai_tutorials', 'অনলাইন আয়': 'pdfs.category_online_earning',
    'ক্যারিয়ার': 'pdfs.category_career', 'ভাষা ও পড়াশোনা': 'pdfs.category_language_study',
    'স্বাস্থ্য': 'pdfs.category_health', 'ধর্মীয় বই': 'pdfs.category_religious_books'
  };
  function pdfCategoryLabel(cat) {
    var k = PDF_CAT_KEYS[cat];
    return k ? t(k) : cat;
  }
  // Product display names: 7 products have Bengali names in
  // products.json; in en mode show the mapped English display name.
  var PRODUCT_NAME_MAP = {};
  Object.keys(STRINGS.bn).forEach(function (k) {
    if (k.indexOf('product.') === 0) PRODUCT_NAME_MAP[STRINGS.bn[k]] = STRINGS.en[k];
  });
  function productName(p) {
    var n = p && p.name;
    return (LANG === 'en' && n && PRODUCT_NAME_MAP[n]) ? PRODUCT_NAME_MAP[n] : n;
  }
  var CART_KEY = 'bazargoo_cart_v1';
  var DELIVERY_KEY = 'bazargoo_delivery_v1';
  var SHIPPING = { inside: 60, outside: 120 };
  // All 64 districts of Bangladesh; Dhaka first. District drives shipping:
  // Dhaka -> Inside Dhaka (৳60), any other district -> Outside Dhaka (৳120).
  var DISTRICTS = ['Dhaka', 'Bagerhat', 'Bandarban', 'Barguna', 'Barishal',
    'Bhola', 'Bogura', 'Brahmanbaria', 'Chandpur', 'Chapainawabganj',
    'Chattogram', 'Chuadanga', "Cox's Bazar", 'Cumilla', 'Dinajpur',
    'Faridpur', 'Feni', 'Gaibandha', 'Gazipur', 'Gopalganj', 'Habiganj',
    'Jamalpur', 'Jashore', 'Jhalokati', 'Jhenaidah', 'Joypurhat',
    'Khagrachari', 'Khulna', 'Kishoreganj', 'Kurigram', 'Kushtia',
    'Lakshmipur', 'Lalmonirhat', 'Madaripur', 'Magura', 'Manikganj',
    'Meherpur', 'Moulvibazar', 'Munshiganj', 'Mymensingh', 'Naogaon',
    'Narail', 'Narayanganj', 'Narsingdi', 'Natore', 'Netrokona',
    'Nilphamari', 'Noakhali', 'Pabna', 'Panchagarh', 'Patuakhali',
    'Pirojpur', 'Rajbari', 'Rajshahi', 'Rangamati', 'Rangpur', 'Satkhira',
    'Shariatpur', 'Sherpur', 'Sirajganj', 'Sunamganj', 'Sylhet', 'Tangail',
    'Thakurgaon'];

  // Bengali display labels for the store's real categories (raw category kept in data)
  var CATEGORY_BN = {
    'Gadget': 'গ্যাজেট',
    'Kitchen Accessories': 'রান্নাঘর',
    'Men Cloth': 'পুরুষদের পোশাক',
    'Cleanning': 'পরিষ্কার-পরিচ্ছন্নতা',
    'Home Appliances': 'হোম অ্যাপ্লায়েন্স',
    'Beauty and Care': 'বিউটি ও যত্ন',
    'Books': 'বই',
    'Electronics': 'ইলেকট্রনিক্স',
    'Exercise': 'ব্যায়াম',
    'Headphone': 'হেডফোন',
    'Health': 'স্বাস্থ্য',
    'Health & Beauty': 'স্বাস্থ্য ও বিউটি',
    'Household': 'গৃহস্থালি',
    'Nebulizer': 'নেবুলাইজার',
    'Toys': 'খেলনা',
    'Kithen': 'রান্নাঘর',
    'Jewelry': 'জুয়েলারি',
    'Baby Care': 'শিশুর যত্ন',
    'Trimmer': 'ট্রিমার',
    'Mens Fashion': 'পুরুষদের ফ্যাশন',
    "Women's Fashion": 'নারীদের ফ্যাশন',
    'Home & Living': 'হোম ও লিভিং'
  };

  var products = [];
  var productById = {};
  var activeCategory = 'all';
  var searchQuery = '';
  var sortMode = 'default';
  var SORT_KEY = 'bazargoo_sort_v1';
  var SORT_MODES = ['default', 'price-asc', 'price-desc', 'discount-desc'];
  try {
    var _savedSort = localStorage.getItem(SORT_KEY) || 'default';
    if (SORT_MODES.indexOf(_savedSort) !== -1) sortMode = _savedSort;
  } catch (e) {}
  var cart = loadCart(); // { id: qty }
  var openSheet = null; // 'detail' | 'cart' | 'confirm' | 'orders' | null
  var detailId = null;
  var WISH_KEY = 'bazargoo_wishlist_v1';
  var wishlist = loadWishlist(); // [ id, ... ]
  // First-order coupon (Angela, 8 Nov 2026): BAZAR5 = 5% off the first
  // order. Enforcement is PER-DEVICE only (localStorage): a buyer who
  // clears app data or switches devices could use it again — the bot
  // trusts whatever the app sends, there is no server-side check.
  var COUPON_CODE = 'BAZAR5';
  var COUPON_PCT = 0.05;
  var COUPON_APPLIED_KEY = 'bazargoo_coupon_applied_v1';
  var COUPON_USED_KEY = 'bazargoo_coupons_used_v1';
  var appliedCoupon = loadAppliedCoupon(); // '' or 'BAZAR5'

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return '৳' + Number(n).toLocaleString('en-US'); }
  // i18n: Bengali digits in bn mode, Western digits in en mode. The
  // '০১২৩৪৫৬৭৮৯' map string is code, not a UI string — it stays.
  function bnNum(n) {
    if (LANG === 'en') return String(n);
    return String(n).replace(/[0-9]/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; });
  }
  // ZERO amounts may be fractional (3%/2%/1% commissions). Show up to
  // 2 decimals, trimming trailing zeros: 10 -> "10", 10.5 -> "10.5".
  function fmtZero(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    if (v % 1 === 0) return String(v);
    return v.toFixed(2).replace(/0$/, '');
  }
  // One mobile = one account: a persistent device id (localStorage
  // UUID) sent with /tasks and claims. The worker binds the first user
  // on a device; a different user on the same device is blocked from
  // earning. Clearing app data resets the id — a deterrent, not a
  // guarantee.
  function deviceId() {
    try {
      var k = 'bazargoo_device_v1';
      var id = localStorage.getItem(k);
      if (!id) {
        id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(k, id);
      }
      return id;
    } catch (e) { return null; }
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function discountPct(p) {
    if (!p.old_price || p.old_price <= p.price) return 0;
    return Math.round((1 - p.price / p.old_price) * 100);
  }

  // ---------- stock ----------
  // in_stock comes from the store's JSON-LD availability (sync-products.py):
  // true = InStock, false = OutOfStock/SoldOut, null/missing = no info given.
  function isOutOfStock(p) { return p && p.in_stock === false; }
  function stockBadgeHTML(p) {
    if (p.in_stock === true) return t("common.in_stock_badge");
    if (p.in_stock === false) return t("common.out_of_stock_badge");
    return '';
  }

  // ---------- reviews ----------
  // Reviews are REAL only: approved reviews come from reviews.json
  // (published by the shop after admin approval via the bot), and the
  // buyer's own submitted review is stored on THIS device only until
  // approved. Nothing is ever invented or pre-filled.
  var REVIEWS_KEY = 'bazargoo_my_reviews_v1';
  var approvedReviews = []; // [{review_id, product_id, stars, text, buyer_name, submitted_at, approved_at}]
  var myReviews = loadMyReviews(); // { productId: {review_id, stars, text, submitted_at} }
  var reviewStars = 0; // stars currently selected in the form (1-5)
  function loadMyReviews() {
    try {
      var r = JSON.parse(localStorage.getItem(REVIEWS_KEY) || '{}');
      return r && typeof r === 'object' ? r : {};
    } catch (e) { return {}; }
  }
  function saveMyReviews() {
    try { localStorage.setItem(REVIEWS_KEY, JSON.stringify(myReviews)); } catch (e) {}
  }
  function makeReviewId() {
    var now = new Date();
    var y = now.getFullYear();
    var m = ('0' + (now.getMonth() + 1)).slice(-2);
    var d = ('0' + now.getDate()).slice(-2);
    // No 0/O/1/I — same rule as order ids.
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'RV-' + y + m + d + '-' + s;
  }
  function starsHTML(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += (i <= n ? '★' : '☆');
    return s;
  }
  function loadReviews() {
    // Approved reviews: once the Cloudflare Worker is live (WORKER_URL
    // set — see payments/SETUP.md), fetch them from the worker first;
    // otherwise — and on any failure — fall back to the static
    // reviews.json in the repo. A missing file (no approved reviews
    // yet) is an empty list, never an error that breaks the app.
    var urls = WORKER_URL ? [WORKER_URL + '/reviews.json', 'reviews.json'] : ['reviews.json'];
    var chain = Promise.reject();
    urls.forEach(function (u) {
      chain = chain.catch(function () {
        return fetch(u).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      });
    });
    return chain
      .then(function (data) {
        approvedReviews = Array.isArray(data.reviews) ? data.reviews : [];
        // A detail sheet opened before the fetch finished: refresh it.
        if (detailId) renderReviews();
      })
      .catch(function () { approvedReviews = []; });
  }
  function approvedFor(productId) {
    return approvedReviews.filter(function (r) { return r.product_id === productId; });
  }
  function avgStars(list) {
    if (!list.length) return 0;
    var s = list.reduce(function (a, r) { return a + (r.stars || 0); }, 0);
    return s / list.length;
  }

  // ---------- PDF payments (Phase 1) ----------
  // Paid PDFs are bought through the bot (@BazarGooBot) via deep links —
  // sendData never reaches Telegram, so the app never talks to the bot
  // directly. Stars: t.me/BazarGooBot?start=buy_<id> (the bot sends a
  // Stars invoice and delivers the PDF after payment). ZERO: the sheet
  // below shows the steps; the bot (start=zero_<id>) gives the shop
  // address and verifies the txid the buyer pastes. WORKER_URL is the
  // live Cloudflare Worker (webhook set 2026-11-09) — see payments/SETUP.md.
  // The ZERO shop address is also empty here on purpose: the bot always
  // shows the real one, so the address never lives in the app.
  var WORKER_URL = 'https://bazargoo-bot.bazargoo.workers.dev';
  var ZERO_SHOP_ADDRESS = '';
  var BOT_USERNAME = 'BazarGooBot';
  // v25: Monetag Rewarded Interstitial (Telegram Mini App SDK).
  // ⚠️ ANGELA — Monetag ড্যাশবোর্ড থেকে TMA zone-এর script tag-এর
  // মান এখানে বসাতে হবে: MONETAG_ZONE_ID = zone ID (শুধু সংখ্যা),
  // MONETAG_SDK_URL = script tag-এর src URL। যতক্ষণ খালি থাকবে,
  // Monetag টাস্কটি "শীঘ্রই আসছে" দেখাবে — কোনো অ্যাড চলবে না,
  // কোনো ZERO দেওয়া হবে না। Dashboard ধাপ: Monetag → Add Site →
  // Telegram Mini App (bot + app URL) → Rewarded Interstitial tag
  // তৈরি → script tag কপি করুন → এই দুই মান বসান। Postback URL
  // (Monetag dashboard-এ main zone-এ বসাতে হবে):
  // https://bazargoo-bot.bazargoo.workers.dev/monetag-postback?ymid={ymid}&event_type={event_type}&reward_event_type={reward_event_type}&zone_id={zone_id}&sub_zone_id={sub_zone_id}&estimated_price={estimated_price}&request_var={request_var}&telegram_id={telegram_id}
  var MONETAG_ZONE_ID = '';
  var MONETAG_SDK_URL = '';
  var MONETAG_REQUEST_VAR = 'bazargoo_ad_task';
  // v26: AdsGram Reward format (spin claims + future ad tasks).
  // ⚠️ ANGELA — AdsGram ড্যাশবোর্ড থেকে Reward ব্লকের blockId এখানে
  // বসাতে হবে (শুধু সংখ্যা)। যতক্ষণ খালি থাকবে, AdsGram স্পিন
  // "শীঘ্রই আসছে" দেখাবে — কোনো অ্যাড চলবে না, কোনো ZERO দেওয়া
  // হবে না। Dashboard ধাপ: AdsGram → Add Platform → Telegram Mini
  // App → Reward ব্লক তৈরি → blockId কপি করুন → এখানে বসান।
  // Monetag-এর মতো AdsGram-এর কোনো সার্ভার postback নেই — worker
  // শুধু /spin-start-এর one-time nonce যাচাই করে।
  var ADSGRAM_BLOCK_ID = '';
  var PDF_CATALOG_URL = 'payments/pdf_catalog.json';
  var pdfs = [];
  var pdfZeroId = null;
  function loadPdfs() {
    return fetch(PDF_CATALOG_URL)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { pdfs = Array.isArray(data.pdfs) ? data.pdfs : []; renderPdfs(); loadReligion(); })
      .catch(function () { pdfs = []; renderPdfs(); loadReligion(); });
  }
  function pdfPriceLine(p) {
    if (p.reward_only) return t("pdfs.price_reward_top3_free");
    if (p.free) return t("pdfs.price_free");
    var parts = [];
    if (p.price_stars) parts.push('⭐ ' + bnNum(p.price_stars) + ' Stars');
    else parts.push(t("pdfs.price_stars_not_set"));
    if (p.price_zero) parts.push('⛓️ ' + p.price_zero + ' ZERO');
    else parts.push(t("pdfs.price_zero_not_set"));
    return '<span class="pdf-price">' + parts.join(' • ') + '</span>';
  }
  // ---------- v23: PDF library by category + religion reward ----------
  // Catalog groups: টেস্ট / কেনাকাটা / AI টিউটোরিয়াল / অনলাইন আয় /
  // ক্যারিয়ার / ভাষা ও পড়াশোনা / স্বাস্থ্য / ধর্মীয় বই (v24: +4 groups).
  // Tutorials show a free preview button (public preview PDF). Religion
  // books are reward-only: free ONLY for daily/weekly/monthly top-3
  // performers (GET /religion), claimed via POST /claim religion_pdf.
  var PDF_CATEGORY_ORDER = ['টেস্ট', 'কেনাকাটা', 'AI টিউটোরিয়াল', 'অনলাইন আয়', 'ক্যারিয়ার', 'ভাষা ও পড়াশোনা', 'স্বাস্থ্য', 'ধর্মীয় বই'];
  var religionData = null;
  function religionClaimed(id) {
    if (!religionData || !Array.isArray(religionData.pdfs)) return false;
    var found = null;
    religionData.pdfs.forEach(function (p) { if (p.id === id) found = p; });
    return !!(found && found.claimed);
  }
  function religionStatusHtml() {
    if (!religionData) return t("pdfs.religion_rank_telegram_note");
    if (religionData.eligible) {
      var parts = [];
      var r = religionData.ranks || {};
      if (r.daily && r.daily <= 3) parts.push(t("pdfs.religion_today"));
      if (r.weekly && r.weekly <= 3) parts.push(t("pdfs.religion_this_week"));
      if (r.monthly && r.monthly <= 3) parts.push(t("pdfs.religion_this_month"));
      // i18n Q4: one parameterized string — the period reads correctly in
      // both languages ("You are in the top 3 Today / This week").
      var period = parts.join(' / ');
      return '<div class="pdf-note">' + (period ? t("pdfs.religion_top3_periods", period) : t("pdfs.religion_top3_no_period")) + '</div>';
    }
    return t("pdfs.religion_top3_how_to_get_free");
  }
  function pdfCardHtml(p) {
    var html = '<article class="pdf-card">' +
      '<div class="pdf-title">' + esc(p.title) + '</div>' +
      (p.description ? '<div class="pdf-desc">' + esc(p.description) + '</div>' : '') +
      '<div class="pdf-price-row">' + pdfPriceLine(p) + '</div>';
    if (p.reward_only) {
      if (religionClaimed(p.id)) {
        html += t("pdfs.religion_claimed_see_bot_chat");
      } else if (religionData && religionData.eligible) {
        html += '<button class="btn-primary pdf-btn" type="button" data-religion-claim="' + esc(p.id) + t("pdfs.claim_reward_free_button");
      } else {
        html += t("pdfs.free_if_top3_disabled_button");
      }
    } else if (p.free && p.file_url) {
      html += '<a class="btn-primary pdf-btn" href="' + esc(p.file_url) + t("pdfs.download_bangla_button");
      if (p.file_url_en) {
        html += '<a class="btn-secondary pdf-btn" href="' + esc(p.file_url_en) + '" download>⬇️ Download (English)</a>';
      }
    } else if (p.free) {
      html += t("pdfs.free_coming_soon");
    } else {
      if (p.en) html += t("pdfs.both_versions_note");
      if (p.preview_url) {
        html += '<a class="btn-secondary pdf-btn" href="' + esc(p.preview_url) + t("pdfs.free_preview_button");
        if (p.preview_url_en) {
          html += '<a class="btn-secondary pdf-btn" href="' + esc(p.preview_url_en) + '" target="_blank" rel="noopener">👀 Free preview (English)</a>';
        }
      }
      html += '<button class="btn-primary pdf-btn" type="button" data-buy-stars="' + esc(p.id) + t("pdfs.buy_with_stars") +
        '<button class="btn-secondary pdf-btn" type="button" data-buy-zero="' + esc(p.id) + t("pdfs.buy_with_zero");
      // v26: buy with the wallet balance (deposit-to-buy, free choice).
      if (p.price_zero) html += '<button class="btn-secondary pdf-btn" type="button" data-buy-wallet-zero="' + esc(p.id) + '">👛 Wallet ZERO (' + bnNum(p.price_zero) + t("pdfs.wallet_buy_button_suffix");
      if (p.price_stars) html += '<button class="btn-secondary pdf-btn" type="button" data-buy-wallet-stars="' + esc(p.id) + '">👛 Wallet Stars (' + bnNum(p.price_stars) + t("pdfs.wallet_buy_button_suffix");
      if (p.price_zero && earnBalance >= p.price_zero) {
        html += '<button class="btn-secondary pdf-btn" type="button" data-redeem="' + esc(p.id) + t("pdfs.redeem_with_zero");
      }
    }
    return html + '</article>';
  }
  function loadReligion() {
    var uid = tgUserId();
    if (!WORKER_URL || !uid) { religionData = null; return; }
    fetch(WORKER_URL + '/religion?user_id=' + encodeURIComponent(uid) + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { religionData = data; renderPdfs(); })
      .catch(function () { religionData = null; });
  }
  function claimReligionPdf(id) {
    var uid = tgUserId();
    if (!uid) return;
    var body = { user_id: uid, task: 'religion_pdf', item_id: id };
    var dev = deviceId();
    if (dev) body.device_id = dev;
    fetch(WORKER_URL + '/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          showEarnAlert(t("pdfs.pdf_sent_check_bot_chat"));
          loadReligion();
          loadMyPdfs();
        } else {
          showEarnAlert(claimErrorText(data.reason));
          loadReligion();
        }
      })
      .catch(function () {});
  }
  function renderPdfs() {
    var sec = $('pdfSection');
    if (!sec) return;
    if (!pdfs.length) { sec.hidden = true; $('pdfRow').innerHTML = ''; return; }
    sec.hidden = false;
    var html = '';
    var seen = {};
    PDF_CATEGORY_ORDER.forEach(function (cat) {
      var group = pdfs.filter(function (p) { return (p.category || 'কেনাকাটা') === cat; });
      if (!group.length) return;
      html += '<h3 class="pdf-cat">' + esc(pdfCategoryLabel(cat)) + '</h3>';
      if (cat === 'ধর্মীয় বই') html += religionStatusHtml();
      group.forEach(function (p) { seen[p.id] = true; html += pdfCardHtml(p); });
    });
    pdfs.forEach(function (p) {
      if (!seen[p.id]) html += pdfCardHtml(p);
    });
    $('pdfRow').innerHTML = html;
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-buy-stars]'), function (b) {
      b.addEventListener('click', function () { buyPdfStars(b.getAttribute('data-buy-stars')); });
    });
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-buy-zero]'), function (b) {
      b.addEventListener('click', function () { openPdfZeroSheet(b.getAttribute('data-buy-zero')); });
    });
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-buy-wallet-zero]'), function (b) {
      b.addEventListener('click', function () { buyPdfWallet(b.getAttribute('data-buy-wallet-zero'), 'zero'); });
    });
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-buy-wallet-stars]'), function (b) {
      b.addEventListener('click', function () { buyPdfWallet(b.getAttribute('data-buy-wallet-stars'), 'stars'); });
    });
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-redeem]'), function (b) {
      b.addEventListener('click', function () { redeemPdf(b.getAttribute('data-redeem')); });
    });
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-religion-claim]'), function (b) {
      b.addEventListener('click', function () { claimReligionPdf(b.getAttribute('data-religion-claim')); });
    });
  }
  // ---------- PDF library: "আমার PDF" (purchased PDFs, re-download) ----------
  // The app never sees a payment finish (it happens in the bot chat), so
  // the library asks the worker which PDFs this Telegram user has bought
  // (GET /my_pdfs). Re-download goes through the bot too: the worker
  // re-sends the file only if a delivered sale exists for this user.
  var myPdfs = [];
  function tgUserId() {
    var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    return u && u.id ? u.id : null;
  }
  function loadMyPdfs() {
    var sec = $('myPdfSection');
    if (!sec) return;
    var uid = tgUserId();
    if (!WORKER_URL || !uid) {
      // Outside Telegram the library cannot know who bought what.
      sec.hidden = false;
      $('myPdfRow').innerHTML = '';
      $('myPdfNote').textContent = t("pdfs.my_pdfs_telegram_note");
      return;
    }
    fetch(WORKER_URL + '/my_pdfs?user_id=' + encodeURIComponent(uid) + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { myPdfs = Array.isArray(data.pdfs) ? data.pdfs : []; renderMyPdfs(); })
      .catch(function () { sec.hidden = true; });
  }
  function renderMyPdfs() {
    var sec = $('myPdfSection');
    if (!sec) return;
    if (!myPdfs.length) { sec.hidden = true; $('myPdfRow').innerHTML = ''; $('myPdfNote').textContent = ''; return; }
    sec.hidden = false;
    var html = '';
    myPdfs.forEach(function (p) {
      html += '<article class="pdf-card">' +
        '<div class="pdf-title">' + esc(p.title) + '</div>' +
        t("common.pdf_purchased_note") +
        '<button class="btn-primary pdf-btn" type="button" data-redownload="' + esc(p.item_id) + t("common.download_again_button") +
        '</article>';
    });
    $('myPdfRow').innerHTML = html;
    $('myPdfNote').textContent = '';
    Array.prototype.forEach.call($('myPdfRow').querySelectorAll('[data-redownload]'), function (b) {
      b.addEventListener('click', function () { redownloadPdf(b.getAttribute('data-redownload')); });
    });
  }
  function redownloadPdf(id) {
    openBotLink('https://t.me/' + BOT_USERNAME + '?start=redownload_' + encodeURIComponent(id));
  }
  // ---------- micro-task earn (Phase 3, v1) ----------
  // Earn ZERO (an in-app ledger on the worker — NOT on-chain, NOT
  // withdrawable as cash) by doing small tasks, and redeem the balance
  // for PDFs. The worker verifies every claim server-side.
  var earnBalance = 0;
  var earnTasks = [];
  var earnProfile = null;
  var earnStreak = null;
  var earnDailyReward = null; // v20 Daily Reward strip from /tasks
  var earnCommunity = null; // v20 community progress {done, total}
  var earnFetchedAt = 0; // epoch ms when /tasks last returned (countdown base)
  var earnTickTimer = null; // 30s live-countdown ticker (v20)
  var earnMonthly = null; // monthly check-in progress from /tasks (v19)
  var earnLoaded = false; // true once /tasks has returned (used by the bottom nav)
  var earnDeviceConflict = false; // true when this device belongs to another account
  var earnGates = null; // v26: joins/react/check-in gates from /tasks
  var walletState = null; // v26: GET /wallet response
  var walletLoaded = false;
  var sponsorOpened = {}; // v26: sponsor tasks opened this session (claim unlock)
  var sponsorNotJoined = {}; // v26: sponsor claim refused as not_joined
  // v22: visit tasks — ids the user opened THIS session (Claim stays
  // disabled until the link was opened), and the done-state seen on
  // the previous render (so a cooldown expiring clears the stale open).
  var visitOpened = {};
  var visitNotJoined = {}; // v22: channel visit claims refused as not_joined (show Join button)
  var visitDonePrev = {};
  var VISIT_PAGE_IDS = ['visit_page_play', 'visit_page_clipcraft', 'visit_page_crypto', 'visit_page_wowappbd', 'visit_page_noor', 'visit_page_usmp'];
  var VISIT_CHAN_IDS = ['visit_chan_bazargoo', 'visit_chan_earnplaygame', 'visit_chan_cryptoguru', 'visit_chan_adsterratt'];
  function loadTasks() {
    var sec = $('earnSection');
    if (!sec) return;
    var uid = tgUserId();
    if (!WORKER_URL || !uid) { sec.hidden = true; return; }
    var user = telegramUser();
    var nameParam = user && user.first_name ? '&name=' + encodeURIComponent(user.first_name) : '';
    var dev = deviceId();
    var devParam = dev ? '&device_id=' + encodeURIComponent(dev) : '';
    fetch(WORKER_URL + '/tasks?user_id=' + encodeURIComponent(uid) + nameParam + devParam + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        earnBalance = data.balance || 0;
        earnTasks = Array.isArray(data.tasks) ? data.tasks : [];
        earnProfile = data.profile || null;
        earnStreak = data.streak || null;
        earnDailyReward = data.daily_reward || null;
        earnCommunity = data.community_progress || null;
        earnMonthly = data.monthly_progress || null;
        earnDeviceConflict = !!data.device_conflict;
        earnGates = data.gates || null; // v26: joins/react/check-in gates
        earnFetchedAt = Date.now(); // countdowns tick from these values
        earnLoaded = true;
        renderTasks();
        renderProfile();
        renderWallet();
        loadWallet(); // v26: per-currency wallet balances
        renderPdfs(); // redeem buttons depend on the balance
        startEarnTicker(); // v20: live countdowns, every 30s
      })
      .catch(function () { sec.hidden = true; });
  }
  // ---------- bottom navigation (v18) ----------
  // Fixed 6-tab bar: দোকান / টাস্ক / বন্ধু / আমার PDF / প্রোফাইল / ব্রাউজার.
  // Tapping a tab smooth-scrolls to its section; IntersectionObserver
  // keeps the active tab in sync while scrolling manually. Safe in a
  // plain browser: the Earn/Friend/Profile tabs just scroll — loadTasks
  // guards on a Telegram user, and hidden sections are simply skipped
  // (nothing harmful happens).
  var NAV_TABS = [
    { id: 'shop', target: 'chips', section: 'grid' },
    { id: 'tasks', target: 'earnSection', section: 'earnSection', earn: true },
    { id: 'friend', target: 'friendSection', section: 'friendSection', earn: true },
    { id: 'mypdf', target: 'myPdfSection', section: 'myPdfSection' },
    { id: 'profile', target: 'profileSection', section: 'profileSection', earn: true },
    { id: 'browser', target: 'browserSection', section: 'browserSection' },
  ];
  function isVisibleEl(el) {
    if (!el || el.hidden) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function scrollToEl(el) {
    if (!el) return;
    var top = el.getBoundingClientRect().top + window.pageYOffset - 64; // below sticky header
    if (top < 0) top = 0;
    window.scrollTo({ top: top, behavior: 'smooth' });
  }
  function scrollToNavTarget(tab) {
    var targetId = tab.target;
    // Profile tab falls back to the Friend section when the profile
    // section itself is hidden (e.g. no profile data yet).
    if (tab.id === 'profile' && !isVisibleEl($('profileSection'))) targetId = 'friendSection';
    var el = $(targetId);
    if (isVisibleEl(el)) { scrollToEl(el); return; }
    // Section not visible yet (e.g. Earn still loading) — wait for it.
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var node = $(targetId);
      if (isVisibleEl(node) || tries >= 15) {
        clearInterval(timer);
        if (isVisibleEl(node)) scrollToEl(node);
      }
    }, 200);
  }
  function setActiveNav(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.bottom-nav-tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-nav-tab') === id);
    });
  }
  function setupBottomNav() {
    var nav = $('bottomNav');
    if (!nav) return;
    Array.prototype.forEach.call(nav.querySelectorAll('.bottom-nav-tab'), function (btn) {
      btn.addEventListener('click', function () {
        var tabId = btn.getAttribute('data-nav-tab');
        var tab = null;
        NAV_TABS.forEach(function (t) { if (t.id === tabId) tab = t; });
        if (!tab) return;
        setActiveNav(tabId);
        if (tab.earn && !earnLoaded) loadTasks();
        if (tab.id === 'friend') loadFriend();
        if (tab.id === 'profile') { loadProfile(); loadHistory(); }
        scrollToNavTarget(tab);
      });
    });
    // Keep the active tab in sync while the user scrolls manually.
    if (!('IntersectionObserver' in window)) return;
    var visible = {};
    var order = ['browser', 'profile', 'mypdf', 'friend', 'tasks', 'shop']; // priority when several intersect
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var tabId = en.target.getAttribute('data-nav-section');
        if (tabId) visible[tabId] = en.isIntersecting;
      });
      for (var i = 0; i < order.length; i++) {
        if (visible[order[i]]) { setActiveNav(order[i]); return; }
      }
    }, { rootMargin: '-40% 0px -50% 0px' });
    NAV_TABS.forEach(function (t) {
      var sec = $(t.section);
      if (sec) { sec.setAttribute('data-nav-section', t.id); io.observe(sec); }
    });
  }
  // ---------- in-app browser (v21) ----------
  // A Mini App cannot embed other sites in an iframe (X-Frame-Options),
  // so links open in Telegram's own in-app browser via tg.openLink —
  // the user comes back with the back button. t.me links use
  // openTelegramLink when available. Outside Telegram the fallback is
  // window.open in a new tab. History is localStorage only, never sent.
  var BROWSER_HISTORY_KEY = 'bazargoo_browser_history_v1';
  var BROWSER_QUICK_LINKS = [
    { icon: '🛍️', label: t("common.bazargoo_shop"), url: 'https://bazargoo.com' },
    { icon: '🇺🇸', label: 'USA 247 Trend Post', url: 'https://usa247trendpost.blogspot.com/' },
    { icon: '💚', label: 'Unlocking Wellness', url: 'https://healthhackshub247.blogspot.com/' },
    { icon: '💰', label: 'US Money Pulse', url: 'https://usmoneypulse.blogspot.com/' },
    { icon: '📢', label: t("common.bazargoo_channel"), url: 'https://t.me/bazargoo287' },
    { icon: '🎮', label: t("common.earnplaygame_channel"), url: 'https://t.me/earnplaygame21' },
  ];
  function browserDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
  }
  function loadBrowserHistory() {
    try {
      var raw = localStorage.getItem(BROWSER_HISTORY_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveBrowserHistory(list) {
    try { localStorage.setItem(BROWSER_HISTORY_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function recordBrowserHistory(url) {
    var list = loadBrowserHistory().filter(function (h) { return h.url !== url; });
    list.unshift({ url: url, domain: browserDomain(url), at: Date.now() });
    if (list.length > 8) list.length = 8;
    saveBrowserHistory(list);
    renderBrowserHistory();
  }
  function renderBrowserHistory() {
    var listEl = $('browserHistoryList');
    var emptyEl = $('browserHistoryEmpty');
    var clearBtn = $('browserClearBtn');
    if (!listEl) return;
    var list = loadBrowserHistory();
    if (emptyEl) emptyEl.hidden = list.length > 0;
    if (clearBtn) clearBtn.hidden = list.length === 0;
    listEl.innerHTML = list.map(function (h) {
      return '<button type="button" class="hist-row browser-row" data-url="' + esc(h.url) + '">' +
        '<span class="browser-row-text"><span class="hist-title">' + esc(h.domain) + '</span>' +
        '<span class="hist-date">' + esc(h.url) + '</span></span>' +
        '<span class="hist-amt">↗</span></button>';
    }).join('');
    Array.prototype.forEach.call(listEl.querySelectorAll('[data-url]'), function (b) {
      b.addEventListener('click', function () { openBrowserUrl(b.getAttribute('data-url')); });
    });
  }
  function renderBrowserQuickLinks() {
    var row = $('browserQuickLinks');
    if (!row) return;
    row.innerHTML = BROWSER_QUICK_LINKS.map(function (l) {
      return '<button type="button" class="hist-row browser-row" data-url="' + esc(l.url) + '">' +
        '<span class="browser-row-text"><span class="hist-title">' + esc(l.icon) + ' ' + esc(l.label) + '</span>' +
        '<span class="hist-date">' + esc(browserDomain(l.url)) + '</span></span>' +
        '<span class="hist-amt">↗</span></button>';
    }).join('');
    Array.prototype.forEach.call(row.querySelectorAll('[data-url]'), function (b) {
      b.addEventListener('click', function () { openBrowserUrl(b.getAttribute('data-url')); });
    });
  }
  // Resolve what the user typed: a URL (add https:// when missing) or
  // a search query (Google). Returns a safe http(s) URL or null.
  function resolveBrowserInput(text) {
    var raw = String(text || '').trim();
    if (!raw) return null;
    var lower = raw.toLowerCase();
    if (lower.indexOf('javascript:') === 0 || lower.indexOf('data:') === 0 || lower.indexOf('vbscript:') === 0) return null;
    if (/\s/.test(raw)) {
      return 'https://www.google.com/search?q=' + encodeURIComponent(raw);
    }
    var url = raw;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      var u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (u.hostname.indexOf('.') === -1) return 'https://www.google.com/search?q=' + encodeURIComponent(raw);
      return u.href;
    } catch (e) {
      return 'https://www.google.com/search?q=' + encodeURIComponent(raw);
    }
  }
  function openBrowserUrl(url) {
    if (!url) return;
    var inTg = !!(tg && tg.initData);
    recordBrowserHistory(url);
    if (inTg && /^https:\/\/t\.me\//i.test(url) && tg.openTelegramLink) {
      try { tg.openTelegramLink(url); return; } catch (e) { /* fall through */ }
    }
    if (inTg && tg.openLink) {
      try { tg.openLink(url); return; } catch (e) { /* fall through */ }
    }
    window.open(url, '_blank');
  }
  function browserGo() {
    var input = $('browserInput');
    var err = $('browserError');
    if (!input) return;
    var url = resolveBrowserInput(input.value);
    if (!url) {
      if (err) { err.textContent = t("browser.enter_valid_link_or_search"); err.hidden = false; }
      return;
    }
    if (err) err.hidden = true;
    input.value = '';
    openBrowserUrl(url);
  }
  function setupBrowser() {
    var goBtn = $('browserGoBtn');
    var input = $('browserInput');
    if (!goBtn || !input) return;
    goBtn.addEventListener('click', browserGo);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); browserGo(); }
    });
    input.addEventListener('input', function () { var err = $('browserError'); if (err) err.hidden = true; });
    var clearBtn = $('browserClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      saveBrowserHistory([]);
      renderBrowserHistory();
    });
    renderBrowserQuickLinks();
    renderBrowserHistory();
  }
  function fmtCooldown(ms) {
    // Remaining cooldown in Bengali: "৫ ঘণ্টা ১০ মিনিট" / "৪৫ মিনিট".
    if (!ms || ms <= 0) return '';
    var totalMin = Math.ceil(ms / 60000);
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h <= 0) return bnNum(m) + ' '+t("shop.cooldown_minutes")+'';
    if (m === 0) return bnNum(h) + ' '+t("shop.cooldown_hours")+'';
    return bnNum(h) + ' '+t("shop.cooldown_hours")+' ' + bnNum(m) + ' '+t("shop.cooldown_minutes")+'';
  }
  // v20: live countdowns. Every [data-cd-ms] element holds the ms the
  // worker reported at fetch time; each tick subtracts the time since
  // earnFetchedAt. When a countdown reaches zero, the state changed
  // (new day / cooldown over) — re-fetch /tasks once to refresh.
  function startEarnTicker() {
    if (earnTickTimer) return;
    earnTickTimer = setInterval(function () {
      if (!earnLoaded || !earnFetchedAt) return;
      var needRefresh = false;
      Array.prototype.forEach.call(document.querySelectorAll('[data-cd-ms]'), function (el) {
        var base = Number(el.getAttribute('data-cd-ms')) || 0;
        var remain = base - (Date.now() - earnFetchedAt);
        if (remain > 0) { el.textContent = fmtCooldown(remain); }
        else { el.textContent = t("common.available_now"); needRefresh = true; }
      });
      if (needRefresh) loadTasks();
    }, 30000);
  }
  function claimErrorText(reason) {
    if (reason === 'already_done') return t("tasks.already_done_today");
    if (reason === 'not_member') return t("tasks.not_joined_try_again");
    if (reason === 'not_joined') return t("tasks.join_channel_first_claim_again");
    if (reason === 'wrong_answers') return t("tasks.one_answer_wrong_try_again");
    if (reason === 'daily_limit') return t("tasks.today_limit_reached");
    if (reason === 'no_click') return t("tasks.watch_ad_first_then_claim");
    if (reason === 'cooldown') return t("tasks.not_yet_time_try_later");
    if (reason === 'device_conflict') return t("tasks.account_already_exists_on_phone");
    if (reason === 'locked') return t("tasks.spin_not_unlocked");
    if (reason === 'not_top3') return t("tasks.not_in_last_week_top3");
    if (reason === 'not_top_performer') return t("tasks.not_in_top3_complete_tasks");
    if (reason === 'not_reward_pdf') return t("tasks.pdf_not_given_as_reward");
    if (reason === 'expired') return t("tasks.reward_expired");
    if (reason === 'already_claimed') return t("tasks.reward_already_claimed");
    if (reason === 'not_winner') return t("tasks.not_this_month_winner");
    if (reason === 'invalid_item') return t("tasks.pdf_cannot_be_selected");
    if (reason === 'insufficient_balance') return t("tasks.not_enough_zero");
    if (reason === 'not_claimable') return t("tasks.task_cannot_be_claimed_here");
    if (reason === 'use_spin_start') return t("tasks.spin_requires_ad_see_card");
    if (reason === 'spin_pending') return t("tasks.spin_already_made_watch_ad");
    if (reason === 'no_spins_left') return t("tasks.today_spins_done");
    if (reason === 'network_spins_used') return t("tasks.network_spins_done_try_another");
    if (reason === 'spin_expired') return t("tasks.spin_expired_spin_again");
    if (reason === 'no_pending_spin') return t("tasks.no_spin_waiting_spin_again");
    if (reason === 'unknown_nonce') return t("tasks.ad_not_verified_try_again");
    if (reason === 'user_mismatch') return t("tasks.reward_not_yours");
    if (reason === 'joins_required') return t("tasks.join_4_channels_first");
    if (reason === 'withdraw_gate') return t("tasks.withdraw_gate_join_react");
    if (reason === 'start_first') return t("tasks.open_sponsor_task_first");
    if (reason === 'dwell_not_done') return t("tasks.wait_view_task_then_claim");
    if (reason === 'promo_not_live') return t("tasks.promotion_no_longer_live");
    if (reason === 'gram_not_configured') return t("tasks.gram_payment_not_live");
    if (reason === 'rate_unavailable') return t("tasks.rate_not_found_try_later");
    if (reason === 'below_minimum') return t("tasks.amount_below_minimum");
    if (reason === 'invalid_address') return t("tasks.address_incorrect");
    if (reason === 'daily_cap') return t("tasks.today_withdrawal_limit_reached");
    if (reason === 'insufficient_float') return t("tasks.gram_withdraw_unavailable_low_funds");
    if (reason === 'stars_not_withdrawable') return t("tasks.stars_cannot_be_withdrawn");
    if (reason === 'invalid_amount') return t("tasks.amount_incorrect");
    if (reason === 'unknown_currency') return t("tasks.currency_not_supported");
    if (reason === 'budget_out_of_range') return t("tasks.budget_out_of_range");
    if (reason === 'invalid_url') return t("tasks.link_invalid_start_https");
    if (reason === 'invalid_type') return t("tasks.promotion_type_invalid");
    if (reason === 'no_txid') return t("tasks.txid_required");
    if (reason === 'not_verified') return t("tasks.payment_not_verified_check_txid");
    if (reason === 'already_confirmed') return t("tasks.txid_already_confirmed");
    if (reason === 'not_found') return t("tasks.transaction_not_found");
    if (reason === 'insufficient') return t("tasks.amount_sent_not_enough");
    if (reason === 'unconfirmed') return t("tasks.payment_not_confirmed_yet");
    if (reason === 'reward_only') return t("tasks.pdf_cannot_be_bought_reward_only");
    if (reason === 'no_zero_price') return t("tasks.pdf_zero_price_not_set");
    if (reason === 'no_stars_price') return t("tasks.pdf_stars_price_not_set");
    return t("tasks.could_not_claim_try_again");
  }
  function showEarnAlert(msg) {
    if (tg && tg.showAlert) { try { tg.showAlert(msg); return; } catch (e) {} }
    alert(msg);
  }
  function renderProfile() {
    var el = $('profileCard');
    if (!el) return;
    if (!earnProfile) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var sec = $('profileSection');
    if (sec) sec.hidden = false;
    var p = earnProfile;
    var pct = Math.round((p.progress || 0) * 100);
    var join = p.join_date ? bnNum(String(p.join_date).slice(0, 10)) : '—';
    el.innerHTML =
      '<div class="earn-profile">' +
      '<div class="earn-profile-top">' +
      '<div class="earn-avatar">👤</div>' +
      '<div><div class="earn-name">' + esc(p.name || t("profile.default_user_name")) + '</div>' +
      ''+t("profile.level_label")+' ' + bnNum(p.level || 1) + ' '+t("profile.total_earnings_separator")+' ' + bnNum(fmtZero(p.lifetime_earned || 0)) + ' ZERO</div></div>' +
      '<div class="earn-balance-big">' + bnNum(fmtZero(earnBalance)) + ' ZERO</div>' +
      '</div>' +
      '<div class="earn-progress"><div class="earn-progress-fill" style="width:' + pct + '%"></div></div>' +
      ''+t("profile.next_level_stats_open")+' ' + bnNum(p.xp || 0) + '/' + bnNum(p.xp_next || 50) + ' • ✅ ' + bnNum(p.tasks_completed || 0) + ''+t("profile.tasks_completed_count_suffix")+' ' + bnNum(p.referrals || 0) + ' '+t("contest.referrals_suffix")+'' +
      '<div class="earn-details">Telegram ID: ' + esc(String(tgUserId() || '')) + ' '+t("profile.joined_label")+' ' + join + ' '+t("profile.referral_earnings_label")+' ' + bnNum(fmtZero(p.referral_earnings || 0)) + ' ZERO</div>' +
      t("profile.level_note_no_unlock") +
      gatesChecklistHTML() +
      t("profile.security_coming_soon") +
      '</div>' +
      profileStatTilesHTML(p);
  }
  // v28: Pickaxe stat tiles (Level / Lifetime / Tasks) under the profile
  // card. Labels come from i18n keys; the Level label reuses
  // leaderboard.level_separator with its bullet stripped.
  function profileStatTilesHTML(p) {
    var levelLabel = t("leaderboard.level_separator").replace(/^•\s*/, '');
    return '<div class="stat-tiles-row">' +
      '<div class="stat-tile"><div class="stat-tile-label">' + esc(levelLabel) + '</div>' +
      '<div class="stat-tile-value">' + bnNum(p.level || 1) + '</div>' +
      '<div class="stat-tile-sub">' + bnNum(p.xp || 0) + '/' + bnNum(p.xp_next || 50) + ' XP</div></div>' +
      '<div class="stat-tile"><div class="stat-tile-label">' + esc(t("profile.stat_lifetime_label")) + '</div>' +
      '<div class="stat-tile-value"><strong>' + bnNum(fmtZero(p.lifetime_earned || 0)) + '</strong></div>' +
      '<div class="stat-tile-sub">ZERO</div></div>' +
      '<div class="stat-tile"><div class="stat-tile-label">' + esc(t("profile.stat_tasks_label")) + '</div>' +
      '<div class="stat-tile-value">' + bnNum(p.tasks_completed || 0) + '</div>' +
      '<div class="stat-tile-sub">👥 ' + bnNum(p.referrals || 0) + '</div></div>' +
      '</div>';
  }
  // v26: "প্রোফাইল সম্পূর্ণ করুন" checklist — the 4 channel joins +
  // react + today's check-in. Spin, leaderboard/contest prizes and
  // withdraw all need the 4 joins; this card shows exactly what is
  // left. Joins are verified by the bot (getChatMember), react is
  // click-only and is never shown as "verified".
  function gatesChecklistHTML() {
    if (!earnGates) return '';
    var g = earnGates;
    var j = g.joins || {};
    function row(done, label) {
      return '<div class="hist-row"><div class="hist-title">' + (done ? '✅ ' : '⬜ ') + esc(label) + '</div>' +
        '<div class="hist-amt ' + (done ? 'pos' : '') + '">' + (done ? t("common.profile_task_done") : t("common.profile_task_remaining")) + '</div></div>';
    }
    return ''+t("profile.complete_profile_title")+' ' + bnNum(g.complete || 0) + '/' + bnNum(g.total || 6) + '</div>' +
      row(!!j.bazargoo, t("common.join_bazargoo_channel")) +
      row(!!j.earnplaygame, t("common.join_earnplaygame_channel")) +
      row(!!j.cryptoguru, t("common.join_cryptoguru_channel")) +
      row(!!j.adsterratt, t("common.join_adsterratt_channel")) +
      row(!!g.react_done, t("common.react_to_pinned_post")) +
      row(!!g.checkin_done, t("tasks.todays_checkin")) +
      t("wallet.join_required_for_spin_rewards_withdraw");
  }
  // v20: level progress bar at the top of the Task menu (Pickaxe-style
  // header). Reuses profile.level/xp/xp_next — display only.
  function renderEarnLevel() {
    var el = $('earnLevelBar');
    if (!el) return;
    if (!earnProfile) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var p = earnProfile;
    var pct = Math.round((p.progress || 0) * 100);
    var left = Math.max(0, (p.xp_next || 50) - (p.xp || 0));
    el.innerHTML =
      '<div class="earn-levelbar">' +
      ''+t("profile.level_bar_level_label")+' ' + bnNum(p.level || 1) + '</span>' +
      ''+t("profile.xp_left_next_level_label")+' ' + bnNum(left) + ' '+t("common.xp_left_fragment")+'' +
      '<div class="earn-progress"><div class="earn-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="earn-levelbar-sub">' + bnNum(p.xp || 0) + '/' + bnNum(p.xp_next || 50) + ' '+t("shop.earn_level_total_earnings")+' ' + bnNum(fmtZero(p.lifetime_earned || 0)) + ' ZERO</div>' +
      '</div>';
  }
  // v20: Daily Reward card (Pickaxe-style) — gold card, 7-day strip,
  // D7 as the big prize. The check-in button lives in this card.
  // Falls back to the old streak strip if the worker sent no
  // daily_reward block (e.g. a cached older response).
  function renderDailyReward() {
    var el = $('earnStreak');
    if (!el) return;
    if (!earnDailyReward || !earnDailyReward.days) {
      if (!earnStreak || !earnStreak.days) { el.hidden = true; el.innerHTML = ''; return; }
      el.hidden = false;
      var s = earnStreak;
      var html = ''+t("tasks.streak_title_open")+' ' +
        bnNum(s.current || 0) + ' '+t("tasks.streak_days_today_plus")+'' + bnNum(s.today_reward || 1) + ' ZERO</div><div class="streak-days">';
      s.days.forEach(function (d) {
        var cls = 'streak-day' + (d.done ? ' done' : '') + (!d.done && !s.claimed_today && d.day === (s.current % 7) + 1 ? ' next' : '');
        html += '<div class="' + cls + '">' + (d.done ? '✓' : bnNum(d.day)) +
          ''+t("tasks.day_label_open")+' ' + bnNum(d.day) + '</span><b>+' + bnNum(d.reward) + '</b></div>';
      });
      html += '</div></div>';
      el.innerHTML = html;
      return;
    }
    el.hidden = false;
    var dr = earnDailyReward;
    // v28: lime+white title split — wrap the first word after 🎁 in a
    // <span> (lime in styles.css). Falls back to the key as-is if its
    // shape ever changes.
    var drTitle = t("tasks.daily_reward_title_open").replace(/^(<div class="dr-head"><div class="dr-title">🎁 )([^<\s]+)( )/, '$1<span>$2</span>$3');
    var card = '<div class="daily-reward">' +
      drTitle +
      '<div class="dr-streak">🔥 ' + bnNum(dr.streak || 0) + ' '+t("tasks.day_streak_close")+'' +
      '<div class="dr-days">';
    dr.days.forEach(function (d) {
      var ticked = d.claimed || (d.is_today && dr.claimed_today);
      var cls = 'dr-day' + (ticked ? ' done' : '') + (d.is_today ? ' today' : '') + (d.day === 7 ? ' big' : '');
      card += '<div class="' + cls + '">' + (ticked ? '✓' : bnNum(d.day)) +
        ''+t("tasks.day_label_open")+' ' + bnNum(d.day) + '</span><b>+' + bnNum(d.reward) + '</b></div>';
    });
    card += '</div><div class="dr-foot">';
    if (dr.claimed_today) {
      card += t("tasks.reward_collected_come_back_tomorrow") +
        t("tasks.next_in_countdown_open") + (dr.next_in_ms || 0) + '">' + fmtCooldown(dr.next_in_ms) + t("tasks.countdown_close");
    } else {
      card += '<button class="btn-primary pdf-btn" type="button" data-claim="checkin"' + (earnDeviceConflict ? ' disabled' : '') + t("tasks.checkin_button_open") + bnNum(dr.today_reward || 1) + ' ZERO</button>' +
        t("tasks.todays_reward_plus_open") + bnNum(dr.today_reward || 1) + ' '+t("tasks.reward_grows_note")+'';
    }
    card += '</div></div>';
    el.innerHTML = card;
    var btn = el.querySelector('[data-claim="checkin"]');
    if (btn) btn.addEventListener('click', function () { claimTask('checkin'); });
  }
  function taskCardHTML(t) {
    var doneLabel = (t.id.indexOf('join_') === 0) ? t("common.join_task_done") : t("common.done_today");
    // v26: sponsor tasks pay in ZERO or GRAM — show the right currency.
    var cur = (t.reward_currency || 'ZERO');
    // i18n: the worker sends task titles/descs in Bengali only. The quiz
    // is the one task whose title/desc are keyed client-side
    // (tasks.quiz_title / tasks.quiz_desc); other server titles stay
    // Bengali until the worker ships translations.
    var cardTitle = (t.id === 'quiz') ? t("tasks.quiz_title") : t.title;
    var cardDesc = (t.id === 'quiz') ? t("tasks.quiz_desc") : t.desc;
    var html = '<article class="pdf-card">' +
      '<div class="pdf-title">' + esc(cardTitle) + '</div>' +
      (t.group === 'sponsor' ? t("promote.sponsor_label") : '') +
      (cardDesc ? '<div class="pdf-desc">' + esc(cardDesc) + '</div>' : '') +
      '<div class="pdf-price-row"><span class="pdf-price">+' + t.reward + ' ' + cur + '</span></div>';
    if (t.id === 'quiz' && !t.done && t.questions) {
      t.questions.forEach(function (q, qi) {
        html += '<div class="quiz-q"><p>' + esc(q.q) + '</p>';
        q.options.forEach(function (opt, oi) {
          html += '<label class="quiz-opt"><input type="radio" name="quiz-' + qi + '" value="' + oi + '"> ' + esc(opt) + '</label>';
        });
        html += '</div>';
      });
      html += t("common.submit_answers_button");
    } else if (t.id === 'referral') {
      html += t("friend.copy_referral_link_button");
      var rb = (typeof earnProfile !== 'undefined' && earnProfile && earnProfile.referrals_by_level) || null;
      html += ''+t("profile.your_referrals_level1")+' ' + bnNum(rb ? rb.l1 : 0) + ' '+t("profile.referrals_level2_separator")+' ' + bnNum(rb ? rb.l2 : 0) + ' '+t("profile.referrals_level3_separator")+' ' + bnNum(rb ? rb.l3 : 0) + ' '+t("contest.people_suffix")+'';
    } else if (t.id === 'ad') {
      html += '<a class="btn-primary pdf-btn" href="' + WORKER_URL + '/go?ad=zerads&user_id=' + encodeURIComponent(tgUserId()) + t("common.watch_ad_link");
      html += '<button class="btn-secondary pdf-btn" type="button" data-claim="ad"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : t("tasks.claim")) + '</button>';
      if (t.done) {
        html += t("common.today_five_times_done") + (t.resets_in_ms || 0) + '">' + fmtCooldown(t.resets_in_ms) + t("tasks.countdown_close");
      } else {
        var left = (typeof t.claims_left_today === 'number') ? t.claims_left_today : 5;
        html += ''+t("common.today_more_times_fragment")+' ' + bnNum(left) + ' '+t("common.more_times_limit_fragment")+'';
      }
    } else if (t.id === 'ad_monetag') {
      // v25: Monetag Rewarded Interstitial — 1 ZERO per VERIFIED view,
      // max 5/day, 30s cooldown. The SDK script/zone is configured in
      // MONETAG_ZONE_ID / MONETAG_SDK_URL; until then the task shows
      // "coming soon" and cannot be tapped. The button calls
      // watchMonetagAd() (bound in renderTasks) — never /claim.
      var mtgReady = !!(MONETAG_ZONE_ID && MONETAG_SDK_URL);
      var mtgLeft = (typeof t.claims_left_today === 'number') ? t.claims_left_today : 5;
      var mtgCd = (typeof t.cooldown_ms === 'number') ? t.cooldown_ms : 0;
      if (!mtgReady) {
        html += t("tasks.watch_ad_monetag_disabled");
        html += t("common.coming_soon_monetag");
      } else if (t.done) {
        html += t("common.today_five_times_done_button");
        html += t("common.today_five_times_done") + (t.resets_in_ms || 0) + '">' + fmtCooldown(t.resets_in_ms) + t("tasks.countdown_close");
      } else if (mtgCd > 0) {
        html += t("tasks.watch_ad_disabled");
        html += t("tasks.next_ad_countdown_open") + mtgCd + '">' + fmtCooldown(mtgCd) + ''+t("common.cooldown_more_today_fragment")+' ' + bnNum(mtgLeft) + ' '+t("common.more_times_today_fragment")+'';
      } else {
        html += t("tasks.watch_ad_plus_1_zero");
        html += ''+t("common.today_more_times_fragment")+' ' + bnNum(mtgLeft) + ' '+t("common.times_limit_watch_full_ad")+'';
      }
    } else if (t.id === 'react_daily') {
      html += t("common.open_pinned_post_link");
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="react_daily"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : t("tasks.claim")) + '</button>';
      if (t.done) {
        html += t("common.task_completed_status") + (t.resets_in_ms ? ' '+t("common.again_in_cooldown_fragment")+'' + t.resets_in_ms + '">' + fmtCooldown(t.resets_in_ms) + t("common.after_cooldown_fragment") : '') + '</div>';
      }
    } else if (t.id === 'video_daily') {
      html += '<video class="earn-video" src="videos/bot-tutorial.mp4" controls playsinline preload="metadata" data-video-player></video>';
      html += t("tasks.watch_full_video_to_enable_claim");
      if (t.done) {
        html += t("common.again_in_button_fragment") + (t.available_in_ms || 0) + '">' + fmtCooldown(t.available_in_ms) + t("common.after_cooldown_button_fragment");
        html += t("common.do_again_in_fragment") + (t.available_in_ms || 0) + '">' + fmtCooldown(t.available_in_ms) + t("common.after_cooldown_can_do_fragment");
      } else {
        html += t("tasks.claim_after_video_ends_disabled");
        html += t("common.once_every_24_hours");
      }
    } else if (t.id.indexOf('visit_') === 0) {
      // v22: daily visit task — "দেখুন" opens the Page/channel
      // (openLink / openTelegramLink via openBrowserUrl), and Claim
      // stays disabled until it was opened this session. The worker
      // enforces the 24h cooldown; it cannot verify the user
      // actually looked at the Page or the last post.
      var isChan = t.id.indexOf('visit_chan_') === 0;
      var opened = !!visitOpened[t.id];
      html += '<button class="btn-secondary pdf-btn" type="button" data-visit-open="' + esc(t.id) + '">' + (opened ? t("tasks.opened_check") : t("common.view_button")) + '</button>';
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + ((t.done || !opened) ? ' disabled' : '') + '>' + (t.done ? doneLabel : t("tasks.claim_with_check")) + '</button>';
      if (isChan) html += t("common.join_will_be_verified");
      if (isChan && visitNotJoined[t.id] && !t.done) {
        html += t("common.join_channel_first");
        html += '<button class="btn-secondary pdf-btn" type="button" data-visit-join="' + esc(t.id) + t("common.join_channel_button");
      }
      if (t.done) {
        html += t("common.done_today_status") + (t.available_in_ms ? ' '+t("common.again_in_cooldown_fragment")+'' + t.available_in_ms + '">' + fmtCooldown(t.available_in_ms) + t("common.after_cooldown_fragment") : '') + '</div>';
      } else if (!opened) {
        html += t("common.open_first_then_claim");
      }
    } else if (t.id.indexOf('sponsor_') === 0) {
      // v26: sponsor task (an approved promotion). "দেখুন" opens the
      // target and stamps the 15s dwell start (/sponsor-start); Claim
      // stays disabled until opened this session. Our own channels
      // are verified by the bot (getChatMember); other follows are
      // NOT verifiable — the timer only stops instant abuse, and the
      // app says so honestly.
      var sOpened = !!sponsorOpened[t.id];
      html += '<button class="btn-secondary pdf-btn" type="button" data-sponsor-open="' + esc(t.id) + '">' + (sOpened ? t("tasks.opened_check") : t("common.view_button")) + '</button>';
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + ((t.done || !sOpened) ? ' disabled' : '') + '>' + (t.done ? doneLabel : t("tasks.claim_with_check")) + '</button>';
      html += ''+t("common.remaining_count_fragment")+' ' + bnNum(t.remaining || 0) + t("common.remaining_external_follow_note");
      if (sponsorNotJoined[t.id] && !t.done) {
        html += t("common.join_channel_first");
      }
      if (t.done) html += t("common.completed_status_done");
    } else if (t.id.indexOf('join_') === 0) {
      var ch = { join_bazargoo: 'bazargoo287', join_earnplaygame: 'earnplaygame21', join_cryptoguru: 'cryptoguru_247', join_adsterratt: 'adsterratt' }[t.id];
      html += '<a class="btn-secondary pdf-btn" href="https://t.me/' + ch + t("common.join_channel_link");
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : t("common.verify_button")) + '</button>';
      if (t.done) html += t("common.completed_status_done");
    } else {
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : t("tasks.claim")) + '</button>';
      if (t.done) html += t("common.task_completed_status") + (t.resets_in_ms ? ' '+t("common.again_in_cooldown_fragment")+'' + t.resets_in_ms + '">' + fmtCooldown(t.resets_in_ms) + t("common.after_cooldown_fragment") : '') + '</div>';
    }
    html += '</article>';
    return html;
  }
  function renderTasks() {
    var sec = $('earnSection');
    if (!sec) return;
    sec.hidden = false;
    $('earnBalance').textContent = ''+t("tasks.your_zero")+' ' + bnNum(fmtZero(earnBalance));
    var dn = $('earnDeviceNote');
    if (dn) {
      if (earnDeviceConflict) {
        dn.hidden = false;
        dn.textContent = t("tasks.account_exists_no_task_earnings");
      } else { dn.hidden = true; dn.textContent = ''; }
    }
    renderProfile();
    renderEarnLevel(); // v20: level bar at the top of the Task menu
    renderDailyReward(); // v20: gold Daily Reward card (check-in lives here)
    renderMonthly();
    renderSpin();
    renderLeaderboard();
    var byId = {};
    earnTasks.forEach(function (t) { byId[t.id] = t; });
    // v20 groups: check-in lives in the Daily Reward card; react_daily
    // moved into Community (joins + react = the community tasks).
    // v26: live sponsor tasks (approved promotions) get their own
    // group; the Promote button opens the create-promotion sheet.
    var sponsorIds = [];
    earnTasks.forEach(function (t) { if (t.group === 'sponsor') sponsorIds.push(t.id); });
    var groups = [
      { title: t("tasks.tab_daily"), ids: ['quiz'] },
      { title: t("tasks.tab_community"), ids: ['join_bazargoo', 'join_earnplaygame', 'join_cryptoguru', 'join_adsterratt', 'react_daily'], community: true },
      { title: t("tasks.tab_visit"), ids: VISIT_PAGE_IDS.concat(VISIT_CHAN_IDS), visit: true },
      { title: t("tasks.tab_watch_earn"), ids: ['ad', 'ad_monetag', 'video_daily'] },
      { title: t("tasks.tab_sponsor"), ids: sponsorIds, sponsor: true },
      { title: t("tasks.tab_referral"), ids: ['referral'] },
    ];
    var html = t("tasks.promote_your_page_channel_title") +
      t("tasks.promote_desc") +
      t("tasks.promote_button");
    groups.forEach(function (g) {
      if (g.visit) {
        // v22: visit section — two sub-groups (Pages, then channels)
        // with a "আজ X/১০ সম্পন্ন" header. A cooldown expiring
        // clears the stale "opened this session" state for that task.
        var doneCount = 0;
        g.ids.forEach(function (id) {
          if (byId[id]) {
            if (byId[id].done) doneCount++;
            if (!byId[id].done && visitDonePrev[id]) { delete visitOpened[id]; delete visitNotJoined[id]; }
            visitDonePrev[id] = !!byId[id].done;
          }
        });
        var cards = '';
        var hasPage = false, hasChan = false;
        VISIT_PAGE_IDS.forEach(function (id) { if (byId[id]) { cards += taskCardHTML(byId[id]); hasPage = true; } });
        var chanCards = '';
        VISIT_CHAN_IDS.forEach(function (id) { if (byId[id]) { chanCards += taskCardHTML(byId[id]); hasChan = true; } });
        if (cards || chanCards) {
          html += ''+t("tasks.visit_today_title_open")+' ' + bnNum(doneCount) + '/' + bnNum(g.ids.length) + ' '+t("tasks.done_close")+'';
          if (hasPage) html += t("tasks.facebook_pages_subtitle") + cards;
          if (hasChan) html += t("tasks.telegram_channels_subtitle") + chanCards;
        }
        return;
      }
      var cards = '';
      g.ids.forEach(function (id) { if (byId[id]) cards += taskCardHTML(byId[id]); });
      if (cards) {
        var title = g.title;
        if (g.community && earnCommunity) {
          title = ''+t("tasks.community_today_title_open")+' ' + bnNum(earnCommunity.done || 0) + '/' + bnNum(earnCommunity.total || 0) + ' '+t("tasks.done")+'';
        }
        html += '<div class="earn-group-title">' + esc(title) + '</div>' + cards;
      }
    });
    // Any task not in a group (future-proofing) still renders — except
    // spin_daily, which has its own wheel card (renderSpin above), and
    // checkin, which lives in the Daily Reward card (renderDailyReward).
    earnTasks.forEach(function (t) {
      if (t.id === 'spin_daily' || t.id === 'checkin') return;
      var grouped = groups.some(function (g) { return g.ids.indexOf(t.id) !== -1; });
      if (!grouped) html += taskCardHTML(t);
    });
    $('earnTaskRow').innerHTML = html;
    Array.prototype.forEach.call($('earnTaskRow').querySelectorAll('[data-claim]'), function (b) {
      b.addEventListener('click', function () { claimTask(b.getAttribute('data-claim')); });
    });
    // v25: Monetag ad task — the button shows the Rewarded
    // Interstitial (watchMonetagAd), it never claims via /claim.
    Array.prototype.forEach.call($('earnTaskRow').querySelectorAll('[data-monetag-watch]'), function (b) {
      b.addEventListener('click', function () { watchMonetagAd(); });
    });
    // v26: sponsor tasks — "দেখুন" stamps the 15s dwell start
    // (/sponsor-start) and unlocks Claim for this session.
    Array.prototype.forEach.call($('earnTaskRow').querySelectorAll('[data-sponsor-open]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-sponsor-open');
        var t = byId[id];
        if (!t || !t.url) return;
        var uid = tgUserId();
        if (uid) {
          fetch(WORKER_URL + '/sponsor-start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: uid, promo_id: id.replace('sponsor_', '') }),
          }).catch(function () {});
        }
        sponsorOpened[id] = true;
        openBrowserUrl(t.url);
        b.textContent = t("tasks.opened_check");
        var card = b.closest ? b.closest('article') : null;
        var claimBtn = card ? card.querySelector('[data-claim]') : null;
        if (claimBtn && !earnDeviceConflict) { claimBtn.disabled = false; claimBtn.textContent = t("tasks.claim_with_check"); }
      });
    });
    var promoteBtn = $('earnTaskRow').querySelector('[data-promote-open]');
    if (promoteBtn) promoteBtn.addEventListener('click', function () { openPromoteSheet(); });
    // v22: visit tasks — "দেখুন" opens the Page/channel and unlocks
    // Claim for this session; "জয়েন করুন" opens the channel so a
    // non-member can join before claiming again.
    Array.prototype.forEach.call($('earnTaskRow').querySelectorAll('[data-visit-open]'), function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-visit-open');
        var t = byId[id];
        if (!t || !t.url) return;
        visitOpened[id] = true;
        openBrowserUrl(t.url);
        b.textContent = t("tasks.opened_check");
        var card = b.closest ? b.closest('article') : null;
        var claimBtn = card ? card.querySelector('[data-claim]') : null;
        if (claimBtn && !earnDeviceConflict) { claimBtn.disabled = false; claimBtn.textContent = t("tasks.claim_with_check"); }
      });
    });
    Array.prototype.forEach.call($('earnTaskRow').querySelectorAll('[data-visit-join]'), function (b) {
      b.addEventListener('click', function () {
        var t = byId[b.getAttribute('data-visit-join')];
        if (t && t.url) openBrowserUrl(t.url);
      });
    });
    // One mobile = one account: when this device belongs to another
    // account, earning claims are disabled here (the worker blocks them
    // too — this is only the visible part).
    if (earnDeviceConflict) {
      Array.prototype.forEach.call($('earnTaskRow').querySelectorAll('[data-claim], [data-quiz-submit]'), function (b) {
        b.disabled = true;
      });
    }
    var qs = $('earnTaskRow').querySelector('[data-quiz-submit]');
    if (qs) qs.addEventListener('click', submitQuiz);
    var rs = $('earnTaskRow').querySelector('[data-ref-share]');
    if (rs) rs.addEventListener('click', function () { copyRefLink(rs); });
    // Video: Claim stays disabled until the video ends; a load failure
    // shows a clear message instead of a broken player.
    Array.prototype.forEach.call($('earnTaskRow').querySelectorAll('[data-video-player]'), function (v) {
      var card = v.closest ? v.closest('article') : null;
      var btn = card ? card.querySelector('[data-video-claim]') : null;
      var note = card ? card.querySelector('.video-note') : null;
      if (btn) {
        v.addEventListener('ended', function () {
          btn.disabled = false;
          btn.textContent = t("tasks.claim");
          if (note) note.textContent = t("tasks.video_watched_claim_now");
        });
      }
      v.addEventListener('error', function () {
        if (note) note.textContent = t("tasks.video_not_loaded_check_internet");
        v.style.display = 'none';
      });
    });
  }
  function claimTask(id, answers) {
    var uid = tgUserId();
    if (!uid) return;
    var body = { user_id: uid, task: id };
    if (answers) body.answers = answers;
    var user = telegramUser();
    if (user && user.first_name) body.name = user.first_name;
    var dev = deviceId();
    if (dev) body.device_id = dev;
    fetch(WORKER_URL + '/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          earnBalance = data.balance;
          delete visitNotJoined[id];
          delete sponsorNotJoined[id];
          haptic('medium');
        } else {
          if (data.reason === 'not_joined') { visitNotJoined[id] = true; sponsorNotJoined[id] = true; }
          if (data.reason === 'dwell_not_done') {
            var wait = Math.ceil((data.available_in_ms || 15000) / 1000);
            // i18n Q2: one parameterized string — "Watch {0} more seconds,
            // then claim." (the old two-fragment split is retired).
            showEarnAlert(t("tasks.watch_more_seconds_then_claim", bnNum(wait)));
            loadTasks();
            return;
          }
          showEarnAlert(claimErrorText(data.reason));
        }
        loadTasks();
      })
      .catch(function () {});
  }
  // ---------- v25: Monetag Rewarded Interstitial ----------
  // Flow: 1) Worker থেকে এই ভিউয়ের ymid নিন (POST /monetag-start —
  // দৈনিক ৫ বার + ৩০ সেকেন্ড কুলডাউন এখানেই যাচাই হয়)। 2) SDK-তে
  // অ্যাড দেখান — reward শুধু 'valued' হলে। 3) Worker-কে জানান
  // (POST /monetag-postback) — Monetag-এর server postback-ও একই
  // ymid-এ আসবে; যেটা আগে পৌঁছাবে সেটাই ১ ZERO দেবে, অন্যটা
  // duplicate। SDK script/zone খালি থাকলে টাস্কটি "শীঘ্রই আসছে"
  // দেখায় — এই ফাংশন কখনো ডাকা হয় না।
  var monetagSdkLoading = null;
  var monetagBusy = false;
  function monetagShowFn() {
    if (!MONETAG_ZONE_ID || !MONETAG_SDK_URL) return null;
    var fn = window['show_' + MONETAG_ZONE_ID];
    return (typeof fn === 'function') ? fn : null;
  }
  function loadMonetagSdk() {
    if (!MONETAG_ZONE_ID || !MONETAG_SDK_URL) return Promise.resolve(false);
    if (monetagShowFn()) return Promise.resolve(true);
    if (monetagSdkLoading) return monetagSdkLoading;
    monetagSdkLoading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = MONETAG_SDK_URL;
      s.setAttribute('data-zone', MONETAG_ZONE_ID);
      s.setAttribute('data-sdk', 'show_' + MONETAG_ZONE_ID);
      s.onload = function () { resolve(!!monetagShowFn()); };
      s.onerror = function () { monetagSdkLoading = null; resolve(false); };
      document.head.appendChild(s);
    });
    return monetagSdkLoading;
  }
  function watchMonetagAd() {
    var uid = tgUserId();
    if (!uid || monetagBusy) return;
    if (!MONETAG_ZONE_ID || !MONETAG_SDK_URL) {
      showEarnAlert(t("tasks.monetag_ads_not_live"));
      return;
    }
    monetagBusy = true;
    var user = telegramUser();
    fetch(WORKER_URL + '/monetag-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, device_id: deviceId() || undefined }),
    })
      .then(function (r) { return r.json(); })
      .then(function (start) {
        if (!start.ok) {
          monetagBusy = false;
          showEarnAlert(claimErrorText(start.reason) || t("tasks.ads_not_available_now"));
          loadTasks();
          return;
        }
        return loadMonetagSdk().then(function (ready) {
          if (!ready) {
            monetagBusy = false;
            showEarnAlert(t("tasks.ad_not_loaded_try_later"));
            return;
          }
          var showFn = monetagShowFn();
          return showFn({ type: 'end', ymid: start.ymid, requestVar: MONETAG_REQUEST_VAR })
            .then(function (result) {
              monetagBusy = false;
              if (result && result.reward_event_type === 'valued') {
                var body = { user_id: uid, ymid: start.ymid, reward_event_type: 'valued', event_type: result.event_type || 'impression', device_id: deviceId() || undefined };
                if (user && user.first_name) body.name = user.first_name;
                return fetch(WORKER_URL + '/monetag-postback', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                })
                  .then(function (r) { return r.json(); })
                  .then(function (data) {
                    if (data.ok) { earnBalance = data.balance; haptic('medium'); showEarnAlert(t("tasks.plus_1_zero_added")); }
                    else if (data.reason === 'already_credited') { showEarnAlert(t("spin.ad_reward_already_given")); }
                    else showEarnAlert(claimErrorText(data.reason) || t("spin.reward_could_not_be_given"));
                    loadTasks();
                  })
                  .catch(function () { loadTasks(); });
              }
              showEarnAlert(t("tasks.no_earnings_from_ad_try_again"));
              loadTasks();
            })
            .catch(function (err) {
              monetagBusy = false;
              var msg = (err && err.message) || '';
              showEarnAlert(msg === 'Empty feed' ? t("common.no_ads_right_now") : t("common.ad_could_not_be_shown"));
              loadTasks();
            });
        });
      })
      .catch(function () { monetagBusy = false; });
  }
  function submitQuiz() {
    var quiz = null;
    earnTasks.forEach(function (t) { if (t.id === 'quiz') quiz = t; });
    if (!quiz || !quiz.questions) return;
    var answers = [];
    for (var i = 0; i < quiz.questions.length; i++) {
      var sel = document.querySelector('input[name="quiz-' + i + '"]:checked');
      if (!sel) { showEarnAlert(t("tasks.answer_all_questions")); return; }
      answers.push(parseInt(sel.value, 10));
    }
    claimTask('quiz', answers);
  }
  // ---------- v26: Lucky Spin — 4 spins/day, ad-gated (replaces v19) ----------
  // 4 spins/day — 2 Monetag + 2 AdsGram. Every prize is claimed by
  // watching ONE ad (Gram's model). The check-in gate stays; the
  // streak and 3-task conditions are GONE. The prize is rolled
  // SERVER-side in /spin-start; the slot is consumed ONLY when the
  // ad-verified credit lands — a no-fill never burns a slot. '+1 free
  // spin' wins raise the daily max to 6. The wheel only animates to
  // the server's prize (or a random segment for a free-spin win).
  var SPIN_SEGMENTS = [1, 2, 3, 5, 10, 25];
  var spinRotation = 0;
  var spinning = false;
  var lastSpinPrize = null; // shown again after the refresh that follows a spin
  function spinMissingText(missing) {
    var out = [];
    (missing || []).forEach(function (m) {
      if (m === 'checkin_today') out.push(t("spin.checkin_today_pending"));
      else if (m === 'device_conflict') out.push(t("spin.device_already_has_account"));
      else if (m.indexOf('joins:') === 0) {
        // i18n Q3: the worker sends joins:<already-joined>/4
        // (worker.js spinLock: 'joins:' + gates.joins_done + '/4'), so
        // the number is channels already JOINED, not still to join.
        var p = m.split(':')[1].split('/');
        out.push(t("spin.channel_joins_status", bnNum(p[0])));
      } else out.push(m);
    });
    return out;
  }
  function renderMonthly() {
    var el = $('earnMonthly');
    if (!el) return;
    if (!earnMonthly) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var m = earnMonthly;
    var count = Number(m.count) || 0;
    var target = Number(m.target) || 25;
    var pct = Math.min(100, Math.round((count / target) * 100));
    var line = m.claimed_this_month
      ? t("common.monthly_bonus_claimed")
      : ''+t("pdfs.religion_this_month")+' ' + bnNum(count) + '/' + bnNum(target) + ' '+t("tasks.checkins_dash")+' ' + bnNum(target) + ' '+t("common.monthly_target_gets_you_fragment")+' ' + bnNum(m.reward || 50) + ' ZERO';
    el.innerHTML = ''+t("tasks.monthly_checkin_bonus_title_open")+' ' +
      bnNum(count) + '/' + bnNum(target) + '</div>' +
      '<div class="earn-progress"><div class="earn-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="task-status">' + esc(line) + '</div></div>';
  }
  function renderSpin() {
    var box = $('spinBox');
    if (!box) return;
    var t = null;
    earnTasks.forEach(function (x) { if (x.id === 'spin_daily') t = x; });
    if (!t) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    var prizes = Array.isArray(t.prizes) ? t.prizes : [];
    var tierLine = prizes.map(function (p) {
      return p.prize === 'extra' ? ''+t("spin.free_spin_prize_tier")+' ' + bnNum(fmtZero(p.chance)) + '%' : bnNum(p.prize) + ' ZERO — ' + bnNum(fmtZero(p.chance)) + '%';
    }).join(' • ');
    var slots = t.slots || { total: 4, monetag: 2, adsgram: 2, extra: 0, base_left: 4 };
    var btnHtml, statusHtml;
    if (t.done) {
      btnHtml = t("spin.spins_done_today_button");
      statusHtml = ''+t("spin.spun_today_intro")+' ' + bnNum(t.spins_today || 0) + ' '+t("spin.spun_today_suffix")+'';
    } else if (t.locked) {
      btnHtml = t("spin.spin_button_disabled");
      statusHtml = ''+t("spin.unlock_remaining_intro")+' ' + spinMissingText(t.missing).map(esc).join('<br>• ') + '</div>';
    } else {
      btnHtml =
        '<button class="btn-primary pdf-btn" type="button" data-spin="monetag"' + (slots.monetag <= 0 && slots.extra <= 0 ? ' disabled' : '') + t("spin.spin_with_monetag_button") + (slots.monetag > 0 ? ' — ' + bnNum(slots.monetag) + ' '+t("spin.spins_left_suffix")+'' : '') + '</button>' +
        '<button class="btn-primary pdf-btn" type="button" data-spin="adsgram"' + (slots.adsgram <= 0 && slots.extra <= 0 ? ' disabled' : '') + t("spin.spin_with_adsgram_button") + (slots.adsgram > 0 ? ' — ' + bnNum(slots.adsgram) + ' '+t("spin.spins_left_suffix")+'' : '') + '</button>';
      statusHtml = t("spin.daily_spins_note");
    }
    var labels = '';
    SPIN_SEGMENTS.forEach(function (p, i) {
      labels += '<div class="spin-label" style="transform: rotate(' + (i * 60 + 30) + 'deg)"><span>' + bnNum(p) + '</span></div>';
    });
    var resultHtml = (t.done && lastSpinPrize !== null)
      ? '<div class="spin-result">' + (lastSpinPrize === 'extra' ? t("spin.got_free_spin_result") : ''+t("common.you_won_today")+' ' + bnNum(fmtZero(lastSpinPrize)) + ' ZERO') + '</div>'
      : '<div class="spin-result" id="spinResult" hidden></div>';
    box.innerHTML =
      '<article class="pdf-card"><div class="pdf-title">🎡 Lucky Spin</div>' +
      t("tasks.lucky_spin_desc") +
      '<div class="spin-wrap"><div class="spin-pointer">▼</div><div class="spin-wheel" id="spinWheel">' + labels + '<div class="spin-hub">🎡</div></div></div>' +
      btnHtml + statusHtml +
      ''+t("common.reward_label")+' ' + esc(tierLine) + '</div>' +
      resultHtml + '</article>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-spin]'), function (btn) {
      btn.addEventListener('click', function () { doSpin(btn.getAttribute('data-spin')); });
    });
  }
  function animateSpinWheel(prize, done) {
    var wheel = $('spinWheel');
    var resEl = $('spinResult');
    // 'extra' (free spin) has no wheel segment — land anywhere.
    var idx = (prize === 'extra') ? Math.floor(Math.random() * SPIN_SEGMENTS.length) : SPIN_SEGMENTS.indexOf(Number(prize));
    if (idx === -1) idx = 0;
    var center = idx * 60 + 30;
    var cur = ((spinRotation % 360) + 360) % 360;
    var delta = (360 - center - cur + 360) % 360;
    var jitter = Math.floor(Math.random() * 37) - 18; // stay inside the segment
    spinRotation += 360 * 5 + delta + jitter;
    if (wheel) {
      wheel.style.transition = 'transform 4.2s cubic-bezier(0.12, 0.8, 0.08, 1)';
      wheel.style.transform = 'rotate(' + spinRotation + 'deg)';
    }
    setTimeout(function () {
      spinning = false;
      lastSpinPrize = prize;
      haptic('medium');
      if (resEl) {
        resEl.hidden = false;
        resEl.textContent = (prize === 'extra')
          ? t("spin.congrats_free_spin_again")
          : ''+t("common.congratulations_you_won")+' ' + bnNum(fmtZero(prize)) + ' ZERO';
      }
      loadTasks();
      if (done) done();
    }, 4400);
  }
  function doSpin(network) {
    var uid = tgUserId();
    if (!uid || spinning) return;
    spinning = true;
    var user = telegramUser();
    var body = { user_id: uid, network: network };
    if (user && user.first_name) body.name = user.first_name;
    var dev = deviceId();
    if (dev) body.device_id = dev;
    fetch(WORKER_URL + '/spin-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (start) {
        if (!start.ok) {
          spinning = false;
          showEarnAlert(claimErrorText(start.reason));
          loadTasks();
          return;
        }
        // The prize is already rolled server-side; now show ONE ad to
        // claim it. A no-fill never burns the slot — the worker only
        // consumes it when the verified view lands.
        if (network === 'monetag') return spinWatchMonetag(start, uid, user);
        return spinWatchAdsgram(start, uid, user);
      })
      .catch(function () { spinning = false; });
  }
  function spinWatchMonetag(start, uid, user) {
    if (!MONETAG_ZONE_ID || !MONETAG_SDK_URL) {
      spinning = false;
      showEarnAlert(t("spin.monetag_not_live"));
      return;
    }
    loadMonetagSdk().then(function (ready) {
      if (!ready) {
        spinning = false;
        showEarnAlert(t("spin.ad_did_not_load"));
        return;
      }
      var showFn = monetagShowFn();
      showFn({ type: 'end', ymid: start.ymid, requestVar: MONETAG_REQUEST_VAR })
        .then(function (result) {
          if (result && result.reward_event_type === 'valued') {
            var body = { user_id: uid, ymid: start.ymid, reward_event_type: 'valued', event_type: result.event_type || 'impression', device_id: deviceId() || undefined };
            if (user && user.first_name) body.name = user.first_name;
            return fetch(WORKER_URL + '/monetag-postback', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
              .then(function (r) { return r.json(); })
              .then(function (data) {
                if (data.ok) { earnBalance = data.balance; animateSpinWheel(data.prize); }
                else if (data.reason === 'already_credited') { spinning = false; showEarnAlert(t("spin.ad_reward_already_given")); loadTasks(); }
                else { spinning = false; showEarnAlert(claimErrorText(data.reason) || t("spin.reward_could_not_be_given")); loadTasks(); }
              })
              .catch(function () { spinning = false; loadTasks(); });
          }
          spinning = false;
          showEarnAlert(t("spin.no_reward_from_ad"));
          loadTasks();
        })
        .catch(function (err) {
          spinning = false;
          var msg = (err && err.message) || '';
          showEarnAlert(msg === 'Empty feed' ? t("spin.no_ads_right_now") : t("spin.ad_could_not_be_shown"));
          loadTasks();
        });
    });
  }
  function spinWatchAdsgram(start, uid, user) {
    if (!ADSGRAM_BLOCK_ID) {
      spinning = false;
      showEarnAlert(t("spin.adsgram_not_live"));
      return;
    }
    loadAdsgramSdk().then(function (ready) {
      if (!ready) {
        spinning = false;
        showEarnAlert(t("spin.ad_did_not_load"));
        return;
      }
      var ctrl = adsgramController;
      ctrl.show().then(function () {
        // The Reward promise resolves only when the ad is watched to
        // the end. The worker credits the spin on the one-time nonce
        // from /spin-start — never on a client claim alone.
        var body = { user_id: uid, nonce: start.nonce };
        if (user && user.first_name) body.name = user.first_name;
        return fetch(WORKER_URL + '/adsgram-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.ok) { earnBalance = data.balance; animateSpinWheel(data.prize); }
            else { spinning = false; showEarnAlert(claimErrorText(data.reason) || t("spin.reward_could_not_be_given")); loadTasks(); }
          })
          .catch(function () { spinning = false; loadTasks(); });
      }).catch(function () {
        spinning = false;
        showEarnAlert(t("spin.ad_not_finished_no_reward"));
        loadTasks();
      });
    });
  }
  // ---------- v26: AdsGram Reward SDK ----------
  // Docs: docs.adsgram.ai — window.Adsgram.init({ blockId }) returns a
  // controller; .show() resolves only when the Reward ad is watched to
  // the end. There is NO signed server callback (unlike Monetag), so
  // the worker only trusts the one-time nonce from /spin-start.
  var adsgramSdkLoading = null;
  var adsgramController = null;
  function loadAdsgramSdk() {
    if (!ADSGRAM_BLOCK_ID) return Promise.resolve(false);
    if (adsgramController) return Promise.resolve(true);
    if (adsgramSdkLoading) return adsgramSdkLoading;
    adsgramSdkLoading = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://sad.adsgram.ai/js/sad.min.js';
      s.onload = function () {
        try {
          adsgramController = (window.Adsgram && window.Adsgram.init) ? window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID }) : null;
          resolve(!!adsgramController);
        } catch (e) { adsgramSdkLoading = null; resolve(false); }
      };
      s.onerror = function () { adsgramSdkLoading = null; resolve(false); };
      document.head.appendChild(s);
    });
    return adsgramSdkLoading;
  }
  function renderLeaderboard() {
    var box = $('leaderboardBox');
    if (!box) return;
    var uid = tgUserId();
    if (!WORKER_URL || !uid) { box.hidden = true; box.innerHTML = ''; return; }
    fetch(WORKER_URL + '/leaderboard?user_id=' + encodeURIComponent(uid) + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        box.hidden = false;
        var medal = ['🥇', '🥈', '🥉'];
        var html = t("leaderboard.this_week_title_open") + esc(String(data.week || '')) + ')</div>';
        var top = Array.isArray(data.top10) ? data.top10 : [];
        if (!top.length) {
          html += t("leaderboard.no_earnings_yet_this_week");
        } else {
          top.forEach(function (r) {
            var me = r.user_id === uid;
            html += '<div class="hist-row' + (me ? ' lb-me' : '') + '"><div><div class="hist-title">' +
              (medal[r.rank - 1] || ('#' + bnNum(r.rank))) + ' ' + esc(r.name || t("leaderboard.friend_fallback_name")) +
              (me ? ' '+t("leaderboard.you_marker")+'' : '') + ' '+t("leaderboard.level_separator")+' ' + bnNum(r.level || 1) + '</div>' +
              t("leaderboard.this_week_earnings_label") +
              '<div class="hist-amt pos">+' + bnNum(fmtZero(r.weekly_earned || 0)) + ' ZERO</div></div>';
          });
        }
        if (data.my_rank) {
          html += t("leaderboard.your_rank_open") + bnNum(data.my_rank) + ' '+t("leaderboard.this_week_separator")+' ' + bnNum(fmtZero(data.my_weekly_earned || 0)) + ' ZERO</div>';
        } else {
          html += t("leaderboard.not_on_list_yet");
        }
        var last = Array.isArray(data.last_week_top3) ? data.last_week_top3 : [];
        if (last.length) {
          html += t("leaderboard.last_week_top3_title_open") + esc(String(data.last_week || '')) + ')</div>';
          last.forEach(function (r) {
            html += '<div class="hist-row"><div><div class="hist-title">' +
              (medal[r.rank - 1] || ('#' + bnNum(r.rank))) + ' ' + esc(r.name || t("leaderboard.friend_fallback_name")) +
              t("leaderboard.last_week_earnings_label") +
              '<div class="hist-amt pos">+' + bnNum(fmtZero(r.weekly_earned || 0)) + ' ZERO</div></div>';
          });
        }
        if (data.prize_claimable) {
          html += ''+t("leaderboard.claim_prize_button_open")+' ' + bnNum(data.my_prize || 0) + ' ZERO</button>';
        } else if (data.prize_claimed) {
          html += t("leaderboard.last_week_prize_claimed");
        }
        box.innerHTML = html;
        var cb = box.querySelector('[data-lb-claim]');
        if (cb) cb.addEventListener('click', claimLeaderboardPrize);
      })
      .catch(function () { box.hidden = true; });
  }
  function claimLeaderboardPrize() {
    var uid = tgUserId();
    if (!uid) return;
    var body = { user_id: uid, task: 'leaderboard_prize' };
    var dev = deviceId();
    if (dev) body.device_id = dev;
    fetch(WORKER_URL + '/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          earnBalance = data.balance;
          haptic('medium');
          showEarnAlert(t("common.leaderboard_congrats_rank") + bnNum(data.rank) + ' — ' + bnNum(fmtZero(data.credited)) + ' '+t("common.zero_prize_received")+'');
          loadTasks();
        } else {
          showEarnAlert(claimErrorText(data.reason));
          renderLeaderboard();
        }
      })
      .catch(function () {});
  }
  // ---------- v19: ZERO coupon (Profile) ----------
  // 100 ZERO buys a one-time 5% off code (ZERO5-XXXXXX). One coupon per
  // order — it never stacks with BAZAR5 (enforced in applyCoupon).
  function renderCoupons() {
    var card = $('couponCard');
    var list = $('myCouponsList');
    var empty = $('myCouponsEmpty');
    if (!card) return;
    var uid = tgUserId();
    if (!WORKER_URL || !uid) {
      card.innerHTML = '';
      if (list) list.innerHTML = '';
      if (empty) empty.hidden = true;
      return;
    }
    card.innerHTML =
      '<div class="earn-profile-top">' +
      '<div class="earn-avatar">🎟️</div>' +
      t("coupons.five_percent_off_coupon_name") +
      t("coupons.hundred_zero_one_time_off_note") +
      t("coupons.price_100_zero") +
      '<div class="wallet-actions">' +
      t("coupons.buy_coupon_100_zero_button") +
      '</div>' +
      t("coupons.code_shows_after_buy_note");
    var bb = card.querySelector('[data-buy-coupon]');
    if (bb) bb.addEventListener('click', buyCoupon);
    fetch(WORKER_URL + '/coupons?user_id=' + encodeURIComponent(uid) + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var cs = Array.isArray(data.coupons) ? data.coupons : [];
        if (empty) empty.hidden = cs.length > 0;
        if (!list) return;
        if (!cs.length) { list.innerHTML = ''; return; }
        list.innerHTML = cs.map(function (c) {
          return '<article class="pdf-card"><div class="pdf-title">' + esc(c.code) + '</div>' +
            '<div class="pdf-desc">' + (c.used ? t("coupons.coupon_used") : t("coupons.coupon_not_used_yet")) + '</div>' +
            (c.used ? '' : '<button class="btn-secondary pdf-btn" type="button" data-copy-coupon="' + esc(c.code) + t("coupons.copy_code_button")) +
            '</article>';
        }).join('');
        Array.prototype.forEach.call(list.querySelectorAll('[data-copy-coupon]'), function (b) {
          b.addEventListener('click', function () {
            var code = b.getAttribute('data-copy-coupon');
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(code).then(function () { flashCopied(b); }, function () { fallbackCopy(code); flashCopied(b); });
            } else { fallbackCopy(code); flashCopied(b); }
          });
        });
      })
      .catch(function () {});
  }
  function buyCoupon() {
    var uid = tgUserId();
    if (!uid) return;
    fetch(WORKER_URL + '/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, item_id: 'coupon_5pct' }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          earnBalance = data.balance;
          haptic('medium');
          showEarnAlert(''+t("coupons.coupon_bought_code")+' ' + data.code);
          loadTasks();
          renderCoupons();
        } else if (data.reason === 'insufficient_balance') {
          showEarnAlert(''+t("coupons.not_enough_zero_balance")+' ' + bnNum(fmtZero(data.balance || earnBalance)) + ' ZERO)।');
        } else {
          showEarnAlert(t("coupons.coupon_buy_failed"));
        }
      })
      .catch(function () {});
  }
  // ---------- v19: Referral contest (Friend menu, monthly) ----------
  // This month's top 5 direct referrers; last month's winner claims one
  // free PDF of their choice during the following month only.
  var contestPdfRetried = false;
  function renderContest() {
    var box = $('contestBox');
    if (!box) return;
    var uid = tgUserId();
    if (!WORKER_URL || !uid) { box.hidden = true; box.innerHTML = ''; return; }
    fetch(WORKER_URL + '/referral-contest?user_id=' + encodeURIComponent(uid) + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        box.hidden = false;
        var medal = ['🥇', '🥈', '🥉'];
        var html = t("contest.this_month_open") + esc(String(data.month || '')) + t("contest.top5_this_month_last_winner_prize");
        var top = Array.isArray(data.top5) ? data.top5 : [];
        if (!top.length) {
          html += t("contest.no_referrals_yet_this_month");
        } else {
          top.forEach(function (r) {
            var me = r.user_id === uid;
            html += '<div class="hist-row' + (me ? ' lb-me' : '') + '"><div><div class="hist-title">' +
              (medal[r.rank - 1] || ('#' + bnNum(r.rank))) + ' ' + esc(r.name || t("leaderboard.friend_fallback_name")) + (me ? ' '+t("leaderboard.you_marker")+'' : '') +
              t("contest.direct_referrals_label") +
              '<div class="hist-amt pos">' + bnNum(r.referrals || 0) + ' '+t("contest.referrals_count_suffix_rows")+'';
          });
        }
        // v28: Friend stat tiles need my contest rank (top-5 or null).
        contestMyRank = null;
        top.forEach(function (r) { if (r.user_id === uid) contestMyRank = r.rank; });
        contestMyReferrals = data.my_referrals || 0;
        renderFriendStats();
        html += ''+t("contest.your_referrals_this_month")+' ' + bnNum(data.my_referrals || 0) + ' '+t("contest.people_suffix")+'';
        var w = data.last_month && data.last_month.winner;
        if (w) {
          html += t("contest.last_month_winner_open") + esc(String(data.last_month.month || '')) + '): ' + esc(w.name || t("leaderboard.friend_fallback_name")) + ' — ' + bnNum(w.referrals || 0) + ' '+t("contest.referrals_suffix")+'';
        }
        if (data.am_i_winner && !data.prize_claimed) {
          var paid = pdfs.filter(function (p) { return !p.free; });
          html += t("contest.congrats_last_month_winner");
          if (!paid.length) {
            html += t("contest.loading_pdf_list");
            // Catalog may not have loaded yet — fetch it once and re-render.
            if (!contestPdfRetried) {
              contestPdfRetried = true;
              loadPdfs().then(function () { renderContest(); });
            }
          } else {
            html += '<select id="contestPdfSelect" class="contest-select">' +
              paid.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.title) + '</option>'; }).join('') +
              '</select>' +
              t("contest.claim_this_pdf_free_button");
          }
        } else if (data.am_i_winner && data.prize_claimed) {
          html += t("contest.prize_claimed_see_bot_chat");
        }
        box.innerHTML = html;
        var cb = box.querySelector('[data-contest-claim]');
        if (cb) cb.addEventListener('click', claimContestPrize);
      })
      .catch(function () { box.hidden = true; });
  }
  function claimContestPrize() {
    var uid = tgUserId();
    if (!uid) return;
    var sel = $('contestPdfSelect');
    var itemId = sel ? sel.value : '';
    if (!itemId) return;
    var body = { user_id: uid, task: 'referral_contest_prize', item_id: itemId };
    var dev = deviceId();
    if (dev) body.device_id = dev;
    fetch(WORKER_URL + '/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          haptic('medium');
          showEarnAlert(t("pdfs.pdf_sent_check_bot"));
          loadTasks();
          loadMyPdfs();
          renderContest();
        } else {
          showEarnAlert(claimErrorText(data.reason));
          renderContest();
        }
      })
      .catch(function () {});
  }
  function copyRefLink(btn) {
    var uid = tgUserId();
    if (!uid) return;
    var link = 'https://t.me/' + BOT_USERNAME + '?start=ref_' + uid;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () { flashCopied(btn); }, function () { fallbackCopy(link); flashCopied(btn); });
    } else { fallbackCopy(link); flashCopied(btn); }
  }
  function refLink() {
    var uid = tgUserId();
    return uid ? 'https://t.me/' + BOT_USERNAME + '?start=ref_' + uid : '';
  }
  function shareRefLink() {
    var link = refLink();
    if (!link) return;
    var text = t("pdfs.join_bazargoo_redeem_pdfs");
    if (tg && tg.initData && tg.openTelegramLink) {
      try {
        tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text));
        return;
      } catch (e) { /* fall through */ }
    }
    window.open('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text), '_blank');
  }
  // ---------- Friend menu (v18) ----------
  // Referral link + invite/share, the 3-level downline list, and the
  // cumulative referral earnings (flat bonuses + % commissions).
  var friendLoaded = false;
  var friendData = null; // v28: last /referrals payload (Friend tiles)
  var contestMyRank = null; // v28: my rank in this month's top 5 (or null)
  var contestMyReferrals = 0; // v28: my referrals this month
  function loadFriend() {
    var sec = $('friendSection');
    if (!sec) return;
    var uid = tgUserId();
    if (!WORKER_URL || !uid) { sec.hidden = true; return; }
    sec.hidden = false;
    $('friendLinkText').textContent = refLink();
    var cb = $('friendCopyBtn');
    if (cb) cb.onclick = function () { copyRefLink(cb); };
    var sb = $('friendShareBtn');
    if (sb) sb.onclick = function () { shareRefLink(); };
    fetch(WORKER_URL + '/referrals?user_id=' + encodeURIComponent(uid) + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        friendLoaded = true;
        friendData = data;
        $('friendTotal').textContent = ''+t("friend.total_referral_earnings")+' ' + bnNum(fmtZero(data.referral_earnings || 0)) + ' ZERO';
        var list = $('friendList');
        var refs = Array.isArray(data.referrals) ? data.referrals : [];
        $('friendEmpty').hidden = refs.length > 0;
        if (!refs.length) { list.innerHTML = ''; renderFriendStats(); return; }
        var html = '';
        refs.forEach(function (r) {
          html += '<article class="pdf-card">' +
            '<div class="pdf-title">' + esc(r.name || t("leaderboard.friend_fallback_name")) + '</div>' +
            ''+t("friend.referral_level_label")+' ' + bnNum(r.level || 1) +
            (r.joined ? ' '+t("profile.joined_label")+' ' + bnNum(String(r.joined)) : '') + '</div>' +
            '<div class="pdf-price-row"><span class="pdf-price">' + bnNum(fmtZero(r.lifetime || 0)) + ' '+t("friend.zero_earned")+'' +
            '</article>';
        });
        list.innerHTML = html;
        renderFriendStats();
      })
      .catch(function () {});
    renderContest();
  }
  // v28: Pickaxe stat tiles (Referrals / Referral earnings / Contest
  // rank) under the Friend total. Rank comes from /referral-contest
  // (renderContest stores it); '—' when not in this month's top 5.
  // Re-renders from cached data on language switch (rerenderAll).
  function renderFriendStats() {
    var el = $('friendStats');
    if (!el) return;
    if (!friendData) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var refs = Array.isArray(friendData.referrals) ? friendData.referrals : [];
    var rank = contestMyRank ? '#' + bnNum(contestMyRank) : '—';
    el.innerHTML =
      '<div class="stat-tile"><div class="stat-tile-label">' + esc(t("friend.stat_referrals_label")) + '</div>' +
      '<div class="stat-tile-value">' + bnNum(refs.length) + '</div></div>' +
      '<div class="stat-tile"><div class="stat-tile-label">' + esc(t("friend.stat_referral_earnings_label")) + '</div>' +
      '<div class="stat-tile-value"><strong>' + bnNum(fmtZero(friendData.referral_earnings || 0)) + '</strong></div>' +
      '<div class="stat-tile-sub">ZERO</div></div>' +
      '<div class="stat-tile"><div class="stat-tile-label">' + esc(t("friend.stat_contest_rank_label")) + '</div>' +
      '<div class="stat-tile-value">' + rank + '</div>' +
      '<div class="stat-tile-sub">👥 ' + bnNum(contestMyReferrals || 0) + '</div></div>';
  }
  // ---------- Profile menu: wallet + histories (v18) ----------
  // Withdraw / Deposit are DISABLED for now (UI only, "শীঘ্রই আসছে");
  // auto-withdraw comes later. Buy reuses the existing shop / PDF
  // flows — no new purchase logic.
  function loadProfile() {
    var sec = $('profileSection');
    if (!sec) return;
    if (!earnLoaded) { loadTasks(); return; }
    sec.hidden = false;
    renderProfile();
    renderWallet();
    renderCoupons();
  }
  // ---------- v26: Wallet (balances, deposit, withdraw) ----------
  // GET /wallet — per-currency balances. Deposit: Stars via a bot
  // invoice (/start deposit_<stars>), ZERO/GRAM by manual tx-hash
  // verified by the worker. Withdraw: ZERO has no fee and no minimum;
  // GRAM min 0.5, daily caps, solvency, manual approval above 2 GRAM.
  // Payouts are MANUAL by Angela + txid log — the worker never holds
  // a private key. Deposit-to-buy is the user's free choice: direct
  // payment always stays available at every checkout.
  function loadWallet() {
    var uid = tgUserId();
    if (!WORKER_URL || !uid) return;
    fetch(WORKER_URL + '/wallet?user_id=' + encodeURIComponent(uid) + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { walletState = data; walletLoaded = true; renderWallet(); })
      .catch(function () {});
  }
  function walletPost(path, body) {
    return fetch(WORKER_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }
  function renderWallet() {
    var el = $('walletCard');
    if (!el) return;
    // v28: header balance pill always shows the total ZERO balance.
    var pill = $('balancePillValue');
    if (pill) {
      var w0 = (walletState && walletState.balance) ? walletState.balance : { zero: 0, gram: 0, stars: 0 };
      var earned0 = walletState ? (walletState.earned_zero || 0) : earnBalance;
      pill.textContent = bnNum(fmtZero((Number(earned0) || 0) + (Number(w0.zero) || 0)));
    }
    // v28: Wallet-screen Deposit/Withdraw buttons reuse the Deposit /
    // Withdraw heading keys (the <h3> wrapper stripped) — no new copy.
    // (Lives here, not in applyI18n, so the i18n smoke-test slice —
    // which has no $() helper — keeps passing.)
    var depBtn = $('walletDepositBtn');
    if (depBtn) depBtn.textContent = t("wallet.deposit_heading").replace(/<\/?h3>/g, '');
    var wdBtn = $('walletWithdrawBtn');
    if (wdBtn) wdBtn.textContent = t("wallet.withdraw_heading").replace(/<\/?h3>/g, '');
    if (!earnProfile) { el.innerHTML = ''; return; }
    var sec = $('profileSection');
    if (sec) sec.hidden = false;
    var w = (walletState && walletState.balance) ? walletState.balance : { zero: 0, gram: 0, stars: 0 };
    var earned = walletState ? (walletState.earned_zero || 0) : earnBalance;
    el.innerHTML =
      '<div class="earn-profile-top">' +
      '<div class="earn-avatar">👛</div>' +
      t("wallet.zero_wallet_name") +
      ''+t("shop.wallet_earnings_label")+' ' + bnNum(fmtZero(earned)) + ' ZERO • Wallet: ' + bnNum(fmtZero(w.zero)) + ' ZERO • ' + bnNum(fmtZero(w.gram)) + ' GRAM • ' + bnNum(fmtZero(w.stars)) + ' Stars</div></div>' +
      '<div class="earn-balance-big">' + bnNum(fmtZero(earnBalance)) + ' ZERO</div>' +
      '</div>' +
      '<div class="wallet-actions">' +
      t("wallet.withdraw_deposit_button") +
      t("common.view_shop_button") +
      t("pdfs.wallet_buy_pdfs_button") +
      '<button class="btn-secondary" type="button" data-wallet-screen">' + esc(t("wallet.profile_wallet_section_title")) + '</button>' +
      '</div>' +
      t("wallet.deposit_optional_note");
    var openBtn = el.querySelector('[data-wallet-open]');
    if (openBtn) openBtn.onclick = function () { openWalletSheet(); };
    var shopBtn = el.querySelector('[data-wallet-shop]');
    if (shopBtn) shopBtn.onclick = function () { setActiveNav('shop'); scrollToEl($('chips')); };
    var pdfBtn = el.querySelector('[data-wallet-pdf]');
    if (pdfBtn) pdfBtn.onclick = function () { setActiveNav('mypdf'); scrollToEl($('myPdfSection')); };
    var screenBtn = el.querySelector('[data-wallet-screen]');
    if (screenBtn) screenBtn.onclick = function () { showWalletScreen(); };
    renderWalletScreen();
  }
  // v28: full Wallet screen (Option A — header pill + screen, no 7th
  // tab). Same data as the Profile wallet card (loadWallet), no new
  // endpoints; Deposit/Withdraw open the existing v26 wallet sheet.
  // The screen shows the gate status; the sheet enforces it.
  function renderWalletScreen() {
    var sec = $('walletSection');
    if (!sec) return;
    if (!earnProfile) { sec.hidden = true; return; }
    sec.hidden = false;
    var w = (walletState && walletState.balance) ? walletState.balance : { zero: 0, gram: 0, stars: 0 };
    var earned = walletState ? (walletState.earned_zero || 0) : earnBalance;
    var total = (Number(earned) || 0) + (Number(w.zero) || 0);
    var hero = $('walletHero');
    if (hero) {
      hero.innerHTML =
        '<div class="wallet-hero">' +
        '<div class="stat-tile-label">' + esc(t("wallet.total_zero_balance_label")) + '</div>' +
        '<div class="wallet-hero-balance">' + bnNum(fmtZero(total)) + ' ZERO</div>' +
        '<div class="wallet-hero-sub">' + esc(t("wallet.hero_earned_wallet_split", bnNum(fmtZero(earned)), bnNum(fmtZero(w.zero)))) + '</div>' +
        '</div>';
    }
    var cur = $('walletCurrencies');
    if (cur) {
      var gramVal = (walletState && walletState.gram_configured)
        ? '<span>' + bnNum(fmtZero(w.gram)) + '</span>'
        : '<span>' + esc(t("wallet.gram_not_configured_yet")) + '</span>';
      cur.innerHTML =
        '<div class="wallet-currency-row"><span>' + esc(t("wallet.earned_zero_row_label")) + '</span><strong>' + bnNum(fmtZero(earned)) + '</strong></div>' +
        '<div class="wallet-currency-row"><span>' + esc(t("wallet.wallet_zero_row_label")) + '</span><strong>' + bnNum(fmtZero(w.zero)) + '</strong></div>' +
        '<div class="wallet-currency-row"><span>💎 GRAM</span>' + gramVal + '</div>' +
        '<div class="wallet-currency-row"><span>⭐ Stars</span><span>' + bnNum(fmtZero(w.stars)) + '</span></div>';
    }
    var gateEl = $('walletGateCard');
    if (gateEl) {
      var gate = walletState && walletState.withdraw_gate;
      var joinRow = gate ? gateRowText("wallet.withdraw_gate_join_row", !!gate.joined) : t("wallet.withdraw_gate_join_row");
      var reactRow = gate ? gateRowText("wallet.withdraw_gate_react_row", !!gate.react_done) : t("wallet.withdraw_gate_react_row");
      gateEl.hidden = false;
      gateEl.innerHTML =
        '<div class="pdf-title">' + esc(t("wallet.withdraw_gate_card_heading")) + '</div>' +
        '<div class="pdf-note">' + t("wallet.withdraw_gate_note") + '</div>' +
        '<div class="hist-row"><div class="hist-title">' + esc(joinRow) + '</div><div class="hist-amt' + (gate && gate.joined ? ' pos' : '') + '"><a href="https://t.me/bazargoowithdraw" target="_blank" rel="noopener">' + esc(t("wallet.withdraw_gate_join_link")) + '</a></div></div>' +
        '<div class="hist-row"><div class="hist-title">' + esc(reactRow) + '</div><div class="hist-amt' + (gate && gate.react_done ? ' pos' : '') + '"><a href="https://t.me/bazargoowithdraw/2" target="_blank" rel="noopener">' + esc(t("wallet.withdraw_gate_react_link")) + '</a></div></div>' +
        ((gate && gate.ok) ? '<div class="task-status done">' + esc(t("wallet.withdraw_gate_ok")) + '</div>' : '');
    }
    var guide = $('walletGuide');
    if (guide) {
      var gramNote = (walletState && walletState.gram_configured) ? '' : t("wallet.gram_not_live_note");
      guide.innerHTML =
        t("wallet.zero_wallet_guide_heading") +
        t("wallet.zero_guide_step1") +
        t("wallet.zero_guide_step2") +
        t("wallet.zero_guide_step3") +
        t("wallet.zero_guide_step4") +
        t("wallet.zero_guide_warning") +
        gramNote;
    }
  }
  // v28: gate row label with a live status mark — the key's own leading
  // mark (✅/○) is replaced by the live state (✅ done / ⬜ pending).
  function gateRowText(key, done) {
    return (done ? '✅ ' : '⬜ ') + t(key).replace(/^[✅○⬜]\s*/, '');
  }
  // v28: open the Wallet screen from the header pill / Profile card.
  function showWalletScreen() {
    var sec = $('walletSection');
    if (!sec) return;
    sec.hidden = false;
    renderWallet();
    loadWallet();
    scrollToEl(sec);
  }
  function walletSheetHtml() {
    var w = (walletState && walletState.balance) ? walletState.balance : { zero: 0, gram: 0, stars: 0 };
    var earned = walletState ? (walletState.earned_zero || 0) : earnBalance;
    var gramNote = (walletState && walletState.gram_configured)
      ? ''
      : t("wallet.gram_not_live_note");
    // v27 withdraw gate: instant withdrawals need @bazargoowithdraw
    // join + today's react stamp. Status comes from /wallet
    // (withdraw_gate); the sheet shows the two steps with Join/React
    // buttons and a claim button for the react stamp.
    var gate = walletState && walletState.withdraw_gate;
    var gateHtml = '';
    if (gate) {
      var joinMark = gate.joined ? '✅' : '⬜';
      var reactMark = gate.react_done ? '✅' : '⬜';
      gateHtml = '<h3>'+t("wallet.withdraw_gate_heading")+'</h3>' +
        '<div class="pdf-note">'+t("wallet.withdraw_gate_note")+'</div>' +
        '<div class="form-row"><a class="btn-primary" href="https://t.me/bazargoowithdraw" target="_blank" rel="noopener">'+t("wallet.withdraw_gate_join_button")+'' + joinMark + '</a>' +
        '<a class="btn-primary" href="https://t.me/bazargoowithdraw/2" target="_blank" rel="noopener">'+t("wallet.withdraw_gate_react_button")+'' + reactMark + '</a></div>' +
        (gate.ok
          ? '<div class="task-status done">'+t("wallet.withdraw_gate_ok")+'</div>'
          : '<button class="btn-secondary btn-block" type="button" id="wdGateClaimBtn">'+t("wallet.withdraw_gate_claim_button")+'</button><div id="wdGateMsg"></div>') +
        '<button class="btn-secondary btn-block" type="button" id="wdGateRefreshBtn">'+t("wallet.withdraw_gate_refresh_button")+'</button>';
    }
    return ''+t("wallet.earnings_label")+' ' + bnNum(fmtZero(earned)) + ' ZERO &nbsp;•&nbsp; <strong>Wallet:</strong> ' +
      bnNum(fmtZero(w.zero)) + ' ZERO • ' + bnNum(fmtZero(w.gram)) + ' GRAM • ' + bnNum(fmtZero(w.stars)) + ' Stars</p>' +
      t("wallet.deposit_heading") +
      t("wallet.deposit_currency_label") +
      t("wallet.deposit_amount_label") +
      t("wallet.deposit_start_button") +
      '<div id="depPayBox"></div>' +
      gateHtml +
      t("wallet.withdraw_heading") +
      t("wallet.withdraw_currency_label") +
      t("wallet.withdraw_amount_label") +
      t("wallet.withdraw_address_label") +
      t("wallet.withdraw_mode_label") +
      t("wallet.withdraw_request_button") +
      '<div id="wdMsg"></div>' +
      t("wallet.withdraw_limits_note") +
      t("wallet.save_address_heading") +
      t("wallet.address_currency_label") +
      t("wallet.address_value_label") +
      t("wallet.save_address_button") +
      '<div id="addrMsg"></div>' +
      t("wallet.zero_wallet_guide_heading") +
      t("wallet.zero_guide_step1") +
      t("wallet.zero_guide_step2") +
      t("wallet.zero_guide_step3") +
      t("wallet.zero_guide_step4") +
      t("wallet.zero_guide_warning") +
      gramNote;
  }
  function openWalletSheet() {
    var body = $('walletBody');
    if (!body) return;
    body.innerHTML = walletSheetHtml();
    showSheet('walletSheet', 'wallet');
    var depBtn = $('depStartBtn');
    if (depBtn) depBtn.addEventListener('click', function () {
      var uid = tgUserId();
      if (!uid) return;
      var cur = $('depCurrency').value;
      var amt = parseFloat($('depAmount').value);
      if (!amt || amt <= 0) { showEarnAlert(t("wallet.enter_correct_amount")); return; }
      walletPost('/deposit-start', { user_id: uid, currency: cur, amount: amt }).then(function (res) {
        var box = $('depPayBox');
        if (!box) return;
        if (!res.ok) { box.innerHTML = '<div class="form-error">' + esc(claimErrorText(res.reason)) + '</div>'; return; }
        if (cur === 'stars') {
          box.innerHTML = ''+t("wallet.stars_invoice_intro")+' ' + bnNum(res.amount) + ' '+t("wallet.stars_invoice_pay_note")+'';
          openBotLink('https://t.me/' + BOT_USERNAME + '?start=deposit_' + res.amount);
          return;
        }
        var unit = cur === 'zero' ? 'ZERO' : 'GRAM';
        var amount = cur === 'zero' ? res.amount : res.gram;
        box.innerHTML =
          '<div class="pdf-note"><strong>' + bnNum(fmtZero(amount)) + ' ' + unit + t("promote.send_to_address") + esc(res.address) + '</code></div>' +
          t("wallet.deposit_txid_label") +
          t("wallet.deposit_confirm_button") +
          '<div id="depMsg"></div>';
        var cb = $('depConfirmBtn');
        if (cb) cb.addEventListener('click', function () {
          var txid = $('depTxid').value.trim();
          if (!txid) { showEarnAlert(t("promote.enter_txid")); return; }
          walletPost('/deposit-confirm', { user_id: uid, currency: cur, txid: txid, amount: amount }).then(function (r) {
            var m = $('depMsg');
            if (!m) return;
            if (r.ok) {
              m.innerHTML = '<div class="task-status done">✅ ' + bnNum(fmtZero(r.credited)) + ' ' + unit + ' '+t("wallet.deposit_credited")+'';
              loadWallet(); loadTasks();
            } else {
              m.innerHTML = '<div class="form-error">' + esc(claimErrorText(r.reason)) + '</div>';
            }
          });
        });
      });
    });
    var wdBtn = $('wdBtn');
    if (wdBtn) wdBtn.addEventListener('click', function () {
      var uid = tgUserId();
      if (!uid) return;
      var cur = $('wdCurrency').value;
      var amt = parseFloat($('wdAmount').value);
      var addr = $('wdAddress').value.trim();
      var mode = $('wdMode').value;
      if (!amt || amt <= 0) { showEarnAlert(t("wallet.enter_correct_amount")); return; }
      walletPost('/withdraw', { user_id: uid, currency: cur, amount: amt, to_wallet: mode, address: addr, device_id: deviceId() || undefined }).then(function (res) {
        var m = $('wdMsg');
        if (!m) return;
        if (!res.ok) { m.innerHTML = '<div class="form-error">' + esc(claimErrorText(res.reason)) + '</div>'; return; }
        if (res.mode === 'save') {
          m.innerHTML = '<div class="task-status done">✅ ' + bnNum(fmtZero(res.amount)) + ' ' + (cur === 'zero' ? 'ZERO' : 'GRAM') + ' '+t("wallet.withdraw_saved_in_wallet")+'';
        } else if (res.status === 'pending_approval') {
          m.innerHTML = t("wallet.withdraw_request_sent") + esc(res.payout_id || '') + t("wallet.withdraw_pending_approval_auto");
        } else if (res.status === 'sent') {
          // v27: ≤500 ZERO auto-sends immediately — the txid is in the response.
          m.innerHTML = '<div class="task-status done">' + t("wallet.withdraw_sent_txid") + '<code>' + esc(res.txid || '') + '</code></div>';
        } else {
          m.innerHTML = t("wallet.withdraw_request_sent") + esc(res.payout_id || '') + t("wallet.withdraw_sending_soon");
        }
        loadWallet(); loadTasks();
      });
    });
    // v27 withdraw gate: claim the react stamp, then refresh the
    // wallet state + re-render the sheet so the gate shows done.
    var gateClaimBtn = $('wdGateClaimBtn');
    if (gateClaimBtn) gateClaimBtn.addEventListener('click', function () {
      claimTask('react_withdraw');
      loadWallet();
      setTimeout(function () { openWalletSheet(); }, 900);
    });
    var gateRefreshBtn = $('wdGateRefreshBtn');
    if (gateRefreshBtn) gateRefreshBtn.addEventListener('click', function () {
      loadWallet();
      setTimeout(function () { openWalletSheet(); }, 900);
    });
    var addrBtn = $('addrSaveBtn');
    if (addrBtn) addrBtn.addEventListener('click', function () {
      var uid = tgUserId();
      if (!uid) return;
      var cur = $('addrCurrency').value;
      var addr = $('addrValue').value.trim();
      if (!addr) { showEarnAlert(t("wallet.enter_address")); return; }
      walletPost('/address', { user_id: uid, currency: cur, address: addr }).then(function (res) {
        var m = $('addrMsg');
        if (!m) return;
        m.innerHTML = res.ok
          ? t("wallet.address_saved")
          : '<div class="form-error">' + esc(claimErrorText(res.reason)) + '</div>';
      });
    });
  }
  // ---------- v26: Promote — create a sponsor task ----------
  // Create -> payment FIRST (ZERO / GRAM manual tx-hash, or the wallet
  // balance) -> Angela approves every promotion (bot message) -> the
  // promotion goes live as a sponsor task -> auto-stops when the
  // budget is spent. Pricing (calculated, plan §4.4): min 100 ZERO or
  // $2.00 (≈1.91 GRAM) = 80 completions; completer gets 1 ZERO or
  // ~0.019 GRAM; max 625 ZERO (= 500 completions); $2.00 = 80, $10 = 300 (Angela 2026-11-09: 40% margin buffer).
  function openPromoteSheet() {
    var body = $('promoteBody');
    if (!body) return;
    body.innerHTML =
      t("promote.intro_reward_per_task") +
      t("promote.budget_limits_note") +
      t("promote.title_label") +
      t("promote.link_label") +
      t("promote.type_label_open") +
      t("promote.type_facebook_options") +
      t("promote.type_telegram_post_options") +
      t("promote.type_video_youtube_tiktok_options") +
      t("promote.type_x_instagram_referral_options") +
      '</select></label>' +
      t("promote.currency_label") +
      t("promote.budget_label") +
      t("promote.pay_from_wallet_checkbox") +
      t("promote.continue_to_payment_button") +
      '<div id="promoPayBox"></div>';
    showSheet('promoteSheet', 'promote');
    var submitBtn = $('promoSubmitBtn');
    if (submitBtn) submitBtn.addEventListener('click', function () {
      var uid = tgUserId();
      if (!uid) return;
      var title = $('promoTitle').value.trim();
      var url = $('promoUrl').value.trim();
      var type = $('promoType').value;
      var cur = $('promoCurrency').value;
      var budget = parseFloat($('promoBudget').value);
      var fromWallet = $('promoWallet').checked;
      if (!title || !url || !budget || budget <= 0) { showEarnAlert(t("promote.enter_title_link_budget")); return; }
      walletPost('/promote-submit', { user_id: uid, title: title, url: url, type: type, currency: cur, budget: budget }).then(function (res) {
        var box = $('promoPayBox');
        if (!box) return;
        if (!res.ok) { box.innerHTML = '<div class="form-error">' + esc(claimErrorText(res.reason)) + '</div>'; return; }
        var unit = cur === 'zero' ? 'ZERO' : 'GRAM';
        var amount = cur === 'zero' ? res.pay.amount : res.pay.amount;
        var html = '<div class="pdf-note"><strong>' + bnNum(res.completions) + ''+t("promote.completions_count")+' ' +
          bnNum(fmtZero(res.reward_per_completion)) + ' ' + unit + ' '+t("promote.reward_per_completion_suffix")+'';
        if (fromWallet) {
          html += t("promote.wallet_deduct_intro") + bnNum(fmtZero(amount)) + ' ' + unit + t("promote.wallet_deduct_suffix") +
            t("promote.pay_with_wallet_button");
        } else {
          html += '<div class="pdf-note"><strong>' + bnNum(fmtZero(amount)) + ' ' + unit + t("promote.send_to_address") + esc(res.pay.to) + '</code></div>' +
            t("promote.txid_label") +
            t("promote.confirm_payment_button");
        }
        html += '<div id="promoMsg"></div>';
        box.innerHTML = html;
        var cb = $('promoConfirmBtn');
        if (cb) cb.addEventListener('click', function () {
          var confirmBody = { user_id: uid, title: title, url: url, type: type, currency: cur, budget: budget };
          if (fromWallet) {
            confirmBody.from_wallet = true;
          } else {
            var txid = $('promoTxid').value.trim();
            if (!txid) { showEarnAlert(t("promote.enter_txid")); return; }
            confirmBody.txid = txid;
          }
          walletPost('/promote-confirm', confirmBody).then(function (r) {
            var m = $('promoMsg');
            if (!m) return;
            if (r.ok) {
              m.innerHTML = t("promote.payment_received_pending_approval") + esc(r.promo_id || '') + t("promote.approved_goes_live_suffix");
              loadTasks();
            } else {
              m.innerHTML = '<div class="form-error">' + esc(claimErrorText(r.reason)) + '</div>';
            }
          });
        });
      });
    });
  }
  // v26: buy a PDF with the wallet balance (deposit-to-buy, the user's
  // free choice — Stars/ZERO direct payment always stays available).
  function buyPdfWallet(id, currency) {
    var uid = tgUserId();
    if (!uid) return;
    walletPost('/buy-pdf-wallet', { user_id: uid, item_id: id, currency: currency || 'zero' }).then(function (data) {
      if (data.ok) {
        earnBalance = data.balance;
        haptic('medium');
        showEarnAlert(t("wallet.pdf_sent_check_bot"));
        loadTasks();
        loadWallet();
        loadMyPdfs();
      } else if (data.reason === 'insufficient_balance') {
        showEarnAlert(t("wallet.insufficient_balance_deposit_first"));
      } else {
        showEarnAlert(claimErrorText(data.reason) || t("wallet.purchase_with_wallet_failed"));
      }
    }).catch(function () {});
  }
  var HISTORY_TYPE_LABELS = {
    task: t("wallet.history_label_task"), commission: t("wallet.history_label_commission"), referral_bonus: t("wallet.history_label_referral_bonus"),
    redeem: t("wallet.history_label_redeem"), purchase: t("wallet.history_label_purchase"),
  };
  var EARNING_SOURCE_LABELS = {
    checkin: t("wallet.earning_source_checkin"), quiz: t("wallet.earning_source_quiz"), ad: t("wallet.earning_source_ad"), video_daily: t("wallet.earning_source_video"),
    react_daily: t("wallet.earning_source_react"), join_bazargoo: t("wallet.earning_source_join"), join_earnplaygame: t("wallet.earning_source_join"),
    join_cryptoguru: t("wallet.earning_source_join"), join_adsterratt: t("wallet.earning_source_join"),
    commission: t("wallet.history_label_commission"), referral: t("wallet.history_label_referral_bonus"),
  };
  function historyRowHTML(e) {
    var amt = Number(e.amount) || 0;
    var cls = amt >= 0 ? 'pos' : 'neg';
    var sign = amt >= 0 ? '+' : '−';
    var date = e.ts ? String(e.ts).slice(0, 10) : '';
    return '<div class="hist-row"><div><div class="hist-title">' +
      esc(HISTORY_TYPE_LABELS[e.type] || e.type || t("shop.transaction_label")) +
      (e.note ? ' — ' + esc(e.note) : '') + '</div>' +
      '<div class="hist-date">' + bnNum(date) + '</div></div>' +
      '<div class="hist-amt ' + cls + '">' + sign + bnNum(fmtZero(Math.abs(amt))) + ' ZERO</div></div>';
  }
  function loadHistory() {
    var uid = tgUserId();
    if (!WORKER_URL || !uid) return;
    fetch(WORKER_URL + '/history?user_id=' + encodeURIComponent(uid) + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var list = $('historyList');
        var entries = Array.isArray(data.entries) ? data.entries : [];
        $('historyEmpty').hidden = entries.length > 0;
        list.innerHTML = entries.map(historyRowHTML).join('');
        // v28: the Wallet screen shows the same transaction history.
        var wList = $('walletHistoryList');
        if (wList) wList.innerHTML = entries.map(historyRowHTML).join('');
        var wEmpty = $('walletHistoryEmpty');
        if (wEmpty) wEmpty.hidden = entries.length > 0;
      })
      .catch(function () {});
    fetch(WORKER_URL + '/history?user_id=' + encodeURIComponent(uid) + '&kind=earning' + langQuery())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var totals = data.totals || {};
        var keys = Object.keys(totals);
        var totEl = $('earningTotals');
        $('earningEmpty').hidden = keys.length > 0;
        totEl.innerHTML = keys.map(function (k) {
          return '<article class="pdf-card"><div class="pdf-title">' +
            esc(EARNING_SOURCE_LABELS[k] || k) + '</div>' +
            '<div class="pdf-price-row"><span class="pdf-price">+' + bnNum(fmtZero(totals[k])) + ' ZERO</span></div></article>';
        }).join('');
        var entries = Array.isArray(data.entries) ? data.entries : [];
        $('earningList').innerHTML = entries.map(historyRowHTML).join('');
      })
      .catch(function () {});
  }
  function redeemPdf(id) {
    var uid = tgUserId();
    if (!uid) return;
    fetch(WORKER_URL + '/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: uid, item_id: id }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          earnBalance = data.balance;
          haptic('medium');
          showEarnAlert(t("wallet.pdf_sent_check_bot"));
          loadTasks();
          loadMyPdfs();
        } else if (data.reason === 'insufficient_balance') {
          showEarnAlert(t("tasks.not_enough_zero_do_more_tasks"));
        } else {
          showEarnAlert(t("common.redeem_failed_try_again"));
        }
      })
      .catch(function () {});
  }
  function openBotLink(url) {
    var inTg = !!(tg && tg.initData);
    if (inTg && tg.openTelegramLink) {
      try { tg.openTelegramLink(url); return; } catch (e) { /* fall through */ }
    }
    window.open(url, '_blank');
  }
  function buyPdfStars(id) {
    openBotLink('https://t.me/' + BOT_USERNAME + '?start=buy_' + encodeURIComponent(id));
  }
  function openPdfZeroSheet(id) {
    var p = null;
    pdfs.forEach(function (x) { if (x.id === id) p = x; });
    if (!p) return;
    pdfZeroId = id;
    var body = $('pdfZeroBody');
    var addrLine = ZERO_SHOP_ADDRESS
      ? t("cart.pdf_zero_address_label") + esc(ZERO_SHOP_ADDRESS) + '</code></p>'
      : t("cart.pdf_zero_address_from_bot");
    body.innerHTML =
      '<p><strong>' + esc(p.title) + '</strong></p>' +
      t("cart.pdf_zero_step_one") +
      (p.price_zero ? ' (' + p.price_zero + ' ZERO)' : '') + '।</p>' +
      addrLine +
      t("wallet.pdf_zero_step2_send") +
      t("wallet.pdf_zero_step3_send_txid");
    showSheet('pdfZeroSheet', 'pdfZero');
  }

  function telegramUser() {
    try {
      var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (u) return { id: u.id, username: u.username || null, first_name: u.first_name || null };
    } catch (e) {}
    return null;
  }
  function haptic(kind) {
    try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(kind || 'light'); } catch (e) {}
  }
  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  }
  // ---------- wishlist ----------
  function loadWishlist() {
    try {
      var w = JSON.parse(localStorage.getItem(WISH_KEY) || '[]');
      return Array.isArray(w) ? w.filter(function (id) { return typeof id === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveWishlist() {
    try { localStorage.setItem(WISH_KEY, JSON.stringify(wishlist)); } catch (e) {}
  }
  function isWished(id) { return wishlist.indexOf(id) !== -1; }
  function toggleWish(id) {
    var i = wishlist.indexOf(id);
    if (i === -1) wishlist.push(id); else wishlist.splice(i, 1);
    saveWishlist();
    haptic();
    renderChips();
    renderGrid();
    if (openSheet === 'detail' && detailId === id) renderDetailWish();
  }
  // ---------- delivery (checkout v2) ----------
  function loadDelivery() {
    try { return JSON.parse(localStorage.getItem(DELIVERY_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveDelivery(d) {
    try { localStorage.setItem(DELIVERY_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function normalizePhone(raw) {
    var d = String(raw || '').replace(/[^0-9]/g, '');
    if (d.indexOf('880') === 0 && d.length === 13) d = '0' + d.slice(3);
    else if (d.indexOf('88') === 0 && d.length === 12) d = d.slice(2);
    return d;
  }
  function validPhone(raw) { return /^01[3-9][0-9]{8}$/.test(normalizePhone(raw)); }
  function deliveryZone() {
    var r = document.querySelector('input[name="shipZone"]:checked');
    return r ? r.value : 'inside';
  }
  function shippingFee() { return SHIPPING[deliveryZone()] || 60; }
  function discountAmount() {
    // One coupon per order: BAZAR5 or a ZERO5 code, never both — the
    // mutual exclusion is enforced in applyCoupon.
    return appliedCoupon ? Math.round(cartTotal() * COUPON_PCT) : 0;
  }
  function grandTotal() { return cartTotal() - discountAmount() + shippingFee(); }

  // ---------- first-order coupon ----------
  function loadUsedCoupons() {
    try {
      var u = JSON.parse(localStorage.getItem(COUPON_USED_KEY) || '[]');
      return Array.isArray(u) ? u.filter(function (c) { return typeof c === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveUsedCoupons(list) {
    try { localStorage.setItem(COUPON_USED_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function loadAppliedCoupon() {
    try {
      var c = localStorage.getItem(COUPON_APPLIED_KEY) || '';
      if (c === COUPON_CODE && loadUsedCoupons().indexOf(COUPON_CODE) === -1) return c;
      // A ZERO5 code was server-verified when applied; the server is the
      // source of truth for its used state (marked used at order time).
      if (c.indexOf('ZERO5-') === 0) return c;
    } catch (e) {}
    return '';
  }
  function saveAppliedCoupon() {
    try { localStorage.setItem(COUPON_APPLIED_KEY, appliedCoupon); } catch (e) {}
  }
  function couponNote(text, kind, showRemove) {
    var n = $('couponNote');
    if (!n) return;
    n.classList.remove('coupon-note-ok', 'coupon-note-err');
    if (!text) { n.hidden = true; n.textContent = ''; return; }
    n.hidden = false;
    n.classList.add(kind === 'ok' ? 'coupon-note-ok' : 'coupon-note-err');
    n.textContent = text;
    if (showRemove) {
      var rm = document.createElement('span');
      rm.className = 'coupon-remove';
      rm.textContent = t("coupons.remove_coupon");
      rm.addEventListener('click', function () { removeCoupon(); });
      n.appendChild(document.createTextNode(' '));
      n.appendChild(rm);
    }
  }
  function applyCoupon() {
    var input = $('couponInput');
    var code = (input ? input.value : '').trim().toUpperCase();
    if (!code) return; // empty: do nothing
    if (cartCount() === 0) { couponNote(t("cart.add_to_cart_first"), 'err'); return; }
    if (code === COUPON_CODE) {
      if (appliedCoupon && appliedCoupon.indexOf('ZERO5-') === 0) {
        couponNote(t("coupons.one_coupon_remove_zero5_use_bazar5"), 'err');
        return;
      }
      if (loadUsedCoupons().indexOf(COUPON_CODE) !== -1) {
        couponNote(t("coupons.coupon_already_used"), 'err');
        return;
      }
      appliedCoupon = COUPON_CODE;
      saveAppliedCoupon();
      if (input) input.value = COUPON_CODE;
      couponNote(t("coupons.five_percent_off_applied"), 'ok', true);
      updateTotals();
      return;
    }
    if (code.indexOf('ZERO5-') === 0) {
      if (appliedCoupon === COUPON_CODE) {
        couponNote(t("coupons.one_coupon_remove_bazar5_use_zero5"), 'err');
        return;
      }
      var uid = tgUserId();
      if (!uid) { couponNote(t("coupons.zero5_telegram_only"), 'err'); return; }
      couponNote(t("coupons.verifying_coupon"), 'ok');
      fetch(WORKER_URL + '/coupon?code=' + encodeURIComponent(code) + '&user_id=' + encodeURIComponent(uid) + langQuery())
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok && data.valid) {
            appliedCoupon = code;
            saveAppliedCoupon();
            if (input) input.value = code;
            couponNote(t("coupons.five_percent_off_applied_zero5"), 'ok', true);
            updateTotals();
          } else if (data.reason === 'not_found') couponNote(t("coupons.coupon_code_not_found"), 'err');
          else if (data.reason === 'not_yours') couponNote(t("coupons.coupon_not_yours"), 'err');
          else if (data.reason === 'already_used') couponNote(t("coupons.coupon_already_used"), 'err');
          else couponNote(t("coupons.coupon_verify_failed_retry"), 'err');
        })
        .catch(function () { couponNote(t("coupons.coupon_verify_failed_internet"), 'err'); });
      return;
    }
    couponNote(t("coupons.wrong_coupon_code"), 'err');
  }
  function removeCoupon() {
    appliedCoupon = '';
    saveAppliedCoupon();
    var input = $('couponInput');
    if (input) input.value = '';
    couponNote('');
    updateTotals();
  }
  function restoreCoupon() {
    // Re-read the applied coupon when the cart opens (per-device only).
    appliedCoupon = loadAppliedCoupon();
    var input = $('couponInput');
    if (input) input.value = appliedCoupon;
    if (appliedCoupon === COUPON_CODE) couponNote(t("coupons.five_percent_off_applied"), 'ok', true);
    else if (appliedCoupon) couponNote(t("coupons.five_percent_off_applied_zero5"), 'ok', true);
    else couponNote('');
  }

  // ---------- coupon banner ----------
  // Advertises the real first-order coupon. Once BAZAR5 is used on this
  // device the banner switches to a muted "used" state and does nothing.
  function isCouponUsed() { return loadUsedCoupons().indexOf(COUPON_CODE) !== -1; }
  function renderCouponBanner() {
    var b = $('couponBanner');
    if (!b) return;
    if (isCouponUsed()) {
      b.classList.add('used');
      b.innerHTML = t("coupons.banner_bazar5_used") +
        t("coupons.banner_first_order_discount_used");
    } else {
      b.classList.remove('used');
      b.innerHTML = t("coupons.banner_first_order_5pct_bazar5") +
        t("coupons.banner_tap_to_copy");
    }
  }
  function copyCouponCode(btn) {
    if (isCouponUsed()) return;
    var done = function () { flashCopied(btn); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(COUPON_CODE).then(done, function () { fallbackCopy(COUPON_CODE); done(); });
    } else { fallbackCopy(COUPON_CODE); done(); }
  }

  // ---------- order history (per-device only) ----------
  // "আমার অর্ডার" is stored in localStorage on THIS device only. There is
  // no server: orders placed on another device or after clearing app data
  // will not appear here, and the app cannot know the shop's confirmation
  // or shipping status — every saved order shows "পাঠানো হয়েছে".
  var ORDERS_KEY = 'bazargoo_orders_v1';
  var MAX_ORDERS = 20;
  var expandedOrderId = null;
  function loadOrders() {
    try {
      var o = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
      return Array.isArray(o) ? o : [];
    } catch (e) { return []; }
  }
  function saveOrderRecord(rec) {
    var list = loadOrders();
    list.unshift(rec);
    if (list.length > MAX_ORDERS) list = list.slice(0, MAX_ORDERS);
    try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function makeOrderId() {
    var now = new Date();
    var y = now.getFullYear();
    var m = ('0' + (now.getMonth() + 1)).slice(-2);
    var d = ('0' + now.getDate()).slice(-2);
    // No 0/O/1/I — avoids look-alike confusion when a buyer reads the id.
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'BG-' + y + m + d + '-' + s;
  }
  function fmtShortDate(iso) {
    // i18n: month abbreviations via shop.month_* keys (evaluated per call
    // so a language switch takes effect without a reload).
    var MONTHS = [t("shop.month_jan"), t("shop.month_feb"), t("shop.month_mar"), t("shop.month_apr"), t("shop.month_may"), t("shop.month_jun"), t("shop.month_jul"), t("shop.month_aug"), t("shop.month_sep"), t("shop.month_oct"), t("shop.month_nov"), t("shop.month_dec")];
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return bnNum(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + bnNum(d.getFullYear());
  }

  // ---------- district -> shipping ----------
  function populateDistricts() {
    var sel = $('buyerDistrict');
    if (!sel || sel.options.length > 1) return;
    DISTRICTS.forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      sel.appendChild(opt);
    });
  }
  function applyDistrictShipping() {
    var district = $('buyerDistrict').value;
    if (!district) return;
    var zone = district === 'Dhaka' ? 'inside' : 'outside';
    var radio = document.querySelector('input[name="shipZone"][value="' + zone + '"]');
    if (radio) { radio.checked = true; markSelectedZone(); }
    updateTotals();
  }
  function cartCount() { return Object.keys(cart).reduce(function (s, id) { return s + cart[id]; }, 0); }
  function cartTotal() {
    return Object.keys(cart).reduce(function (s, id) {
      var p = productById[id];
      return p ? s + p.price * cart[id] : s;
    }, 0);
  }

  // ---------- Telegram setup ----------
  function setupTelegram() {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('bg_color');
      if (tg.setBackgroundColor) tg.setBackgroundColor(tg.backgroundColor || '#ffffff');
      if (tg.MainButton) tg.MainButton.onClick(onMainButton);
      if (tg.BackButton) tg.BackButton.onClick(onBackButton);
      // Backup path for the phone share result: the same data also arrives
      // as a 'contactRequested' event; skipped if the callback already ran.
      if (tg.onEvent) {
        try {
          tg.onEvent('contactRequested', function (ev) {
            if (phoneRequestPending || !$('buyerPhone').value) {
              handleContactResult(ev && ev.status === 'sent', ev);
            }
          });
        } catch (e) {}
      }
    } catch (e) {}
  }

  function updateMainButton() {
    if (!tg || !tg.MainButton) return;
    var mb = tg.MainButton;
    if (openSheet === 'cart') {
      if (cartCount() === 0) { mb.hide(); return; }
      mb.setText(''+t("cart.main_button_place_order")+' ' + fmt(grandTotal()));
      mb.show();
    } else if (openSheet === 'detail' || openSheet === 'confirm' || openSheet === 'orders' || openSheet === 'pdfZero' || openSheet === 'wallet' || openSheet === 'promote') {
      mb.hide();
    } else if (cartCount() > 0) {
      mb.setText(''+t("cart.main_button_view_cart")+' ' + fmt(cartTotal()));
      mb.show();
    } else {
      mb.hide();
    }
  }

  function updateBackButton() {
    if (!tg || !tg.BackButton) return;
    if (openSheet) tg.BackButton.show(); else tg.BackButton.hide();
  }

  function onMainButton() {
    if (openSheet === 'cart') { placeOrder(); }
    else if (!openSheet && cartCount() > 0) { openCartSheet(); }
  }

  function onBackButton() {
    if (openSheet === 'detail') closeSheet('detailSheet');
    else if (openSheet === 'cart') closeSheet('cartSheet');
    else if (openSheet === 'confirm') closeSheet('confirmSheet');
    else if (openSheet === 'reviewConfirm') closeSheet('reviewConfirmSheet');
    else if (openSheet === 'orders') closeSheet('ordersSheet');
    else if (openSheet === 'pdfZero') closeSheet('pdfZeroSheet');
    else if (openSheet === 'wallet') closeSheet('walletSheet');
    else if (openSheet === 'promote') closeSheet('promoteSheet');
  }

  // ---------- data ----------
  function loadProducts() {
    return fetch('products.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        products = data.products || [];
        products.forEach(function (p) { productById[p.id] = p; });
        renderChips();
        renderDeals();
        renderGrid();
        renderRecent();
        updateCartUI();
      })
      .catch(function () { $('loadError').hidden = false; });
  }

  // ---------- rendering ----------
  function getCategories() {
    var seen = {};
    var list = [];
    products.forEach(function (p) {
      var c = p.category || 'অন্যান্য';
      if (!seen[c]) { seen[c] = 0; list.push(c); }
      seen[c]++;
    });
    list.sort(function (a, b) { return seen[b] - seen[a]; });
    return { list: list, counts: seen };
  }

  function renderChips() {
    var info = getCategories();
    var html = '<button class="chip' + (activeCategory === '__wishlist' ? ' active' : '') +
      t("common.chip_wishlist") + wishlist.length + ')</button>' +
      '<button class="chip' + (activeCategory === 'all' ? ' active' : '') +
      t("common.chip_all") + products.length + ')</button>';
    info.list.forEach(function (c) {
      var label = catLabel(c);
      html += '<button class="chip' + (activeCategory === c ? ' active' : '') +
        '" data-cat="' + esc(c) + '" type="button">' + esc(label) + ' (' + info.counts[c] + ')</button>';
    });
    $('chips').innerHTML = html;
    Array.prototype.forEach.call($('chips').querySelectorAll('.chip'), function (btn) {
      btn.addEventListener('click', function () {
        activeCategory = btn.getAttribute('data-cat');
        renderChips();
        renderGrid();
      });
    });
  }

  function filteredProducts() {
    var q = searchQuery.trim().toLowerCase();
    var list = products.filter(function (p) {
      if (activeCategory === '__wishlist' && wishlist.indexOf(p.id) === -1) return false;
      if (activeCategory !== 'all' && activeCategory !== '__wishlist' && (p.category || 'অন্যান্য') !== activeCategory) return false;
      if (q && p.name.toLowerCase().indexOf(q) === -1 &&
          productName(p).toLowerCase().indexOf(q) === -1 &&
          (p.category || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    if (sortMode === 'price-asc') list.sort(function (a, b) { return a.price - b.price; });
    if (sortMode === 'price-desc') list.sort(function (a, b) { return b.price - a.price; });
    if (sortMode === 'discount-desc') list.sort(function (a, b) { return discountPct(b) - discountPct(a); });
    return list;
  }

  function qtyControlHTML(id, full) {
    // Out-of-stock products cannot be added: show a disabled button
    // instead of "যোগ করুন" and never show the quantity stepper.
    if (isOutOfStock(productById[id])) {
      return t("common.out_of_stock_button");
    }
    var q = cart[id] || 0;
    if (q === 0) {
      return '<button class="btn-add" type="button" data-add="' + esc(id) + t("common.add_button");
    }
    return '<div class="qty-control' + (full ? ' full' : '') + '">' +
      '<button type="button" data-dec="' + esc(id) + t("common.qty_decrease") +
      '<span class="qty-num">' + bnNum(q) + '</span>' +
      '<button type="button" data-inc="' + esc(id) + t("common.qty_increase");
  }

  function updateSearchUI(count) {
    var q = searchQuery.trim();
    var clearBtn = $('searchClear');
    if (clearBtn) clearBtn.hidden = !q;
    var countEl = $('searchCount');
    if (!countEl) return;
    if (q) {
      countEl.hidden = false;
      countEl.textContent = bnNum(count) + t("common.products_found_suffix");
    } else {
      countEl.hidden = true;
    }
  }

  function renderGrid() {
    var list = filteredProducts();
    var grid = $('grid');
    var empty = $('emptyState');
    updateSearchUI(list.length);
    empty.hidden = list.length !== 0;
    if (list.length === 0 && activeCategory === '__wishlist') {
      empty.querySelector('p').textContent = t("shop.wishlist_empty");
      empty.querySelector('.empty-sub').textContent = t("shop.wishlist_empty_hint");
    } else if (list.length === 0 && searchQuery.trim()) {
      empty.querySelector('p').textContent = t("shop.no_products_found");
      empty.querySelector('.empty-sub').textContent = t("shop.try_another_search");
    } else {
      empty.querySelector('p').textContent = t("shop.nothing_found");
      empty.querySelector('.empty-sub').textContent = t("shop.try_another_search");
    }
    var html = '';
    list.forEach(function (p) {
      var pct = discountPct(p);
      var wished = isWished(p.id);
      html += '<article class="card" data-open="' + esc(p.id) + '">' +
        '<div class="card-img-wrap">' +
        (p.image
          ? '<img class="card-img" src="' + esc(p.image) + '" alt="' + esc(productName(p)) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;card-img-placeholder&quot;>🛍️</div>\'">'
          : '<div class="card-img-placeholder">🛍️</div>') +
        '<button class="wish-btn' + (wished ? ' wished' : '') + '" type="button" data-wish="' + esc(p.id) + t("shop.wishlist_button_aria_label") + (wished ? '❤️' : '♡') + '</button>' +
        '</div>' +
        '<div class="card-body">' +
        '<div class="card-name">' + esc(productName(p)) + '</div>' +
        stockBadgeHTML(p) +
        '<div class="card-price-row"><span class="price">' + fmt(p.price) + '</span>' +
        (p.old_price ? '<span class="old-price">' + fmt(p.old_price) + '</span>' : '') +
        (pct ? '<span class="discount-badge">-' + pct + '%</span>' : '') + '</div>' +
        '<div class="card-cat">' + esc(catLabel(p.category)) + '</div>' +
        qtyControlHTML(p.id, true) +
        '<button class="share-btn" type="button" data-share="' + esc(p.id) + t("shop.share_button") +
        '</div></article>';
    });
    grid.innerHTML = html;
    bindCardEvents(grid);
  }

  function bindCardEvents(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-open]'), function (el) {
      el.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-add],[data-inc],[data-dec],[data-share],[data-wish]')) return;
        openDetail(el.getAttribute('data-open'));
      });
    });
    bindQtyButtons(root);
    bindShareWishButtons(root);
  }

  function bindShareWishButtons(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-share]'), function (b) {
      b.addEventListener('click', function (ev) { ev.stopPropagation(); shareProduct(b.getAttribute('data-share'), b); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-wish]'), function (b) {
      b.addEventListener('click', function (ev) { ev.stopPropagation(); toggleWish(b.getAttribute('data-wish')); });
    });
  }

  function bindQtyButtons(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-add]'), function (b) {
      b.addEventListener('click', function (ev) { ev.stopPropagation(); changeQty(b.getAttribute('data-add'), 1); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-inc]'), function (b) {
      b.addEventListener('click', function (ev) { ev.stopPropagation(); changeQty(b.getAttribute('data-inc'), 1); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-dec]'), function (b) {
      b.addEventListener('click', function (ev) { ev.stopPropagation(); changeQty(b.getAttribute('data-dec'), -1); });
    });
  }

  // ---------- share ----------
  function shareText(p) {
    return p.name + ' — ' + fmt(p.price) + '\n' + (p.url || 'https://bazargoo.com');
  }
  function flashCopied(btn) {
    if (!btn) return;
    var prev = btn.innerHTML;
    btn.innerHTML = t("common.copied");
    setTimeout(function () { btn.innerHTML = prev; }, 2000);
  }
  function copyShareText(text, btn) {
    var done = function () { flashCopied(btn); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function shareProduct(id, btn) {
    var p = productById[id];
    if (!p) return;
    var text = shareText(p);
    // Telegram's share methods only work INSIDE Telegram. tg exists (empty
    // initData) even in a plain browser, where openTelegramLink would just
    // navigate the page away — so check initData, not just tg.
    var inTg = !!(tg && tg.initData);
    // 1) Telegram inline share (needs inline mode on the bot; throws
    //    WebAppInlineModeDisabled when it is off — then fall through).
    if (inTg && tg.switchInlineQuery) {
      try { tg.switchInlineQuery(text); return; } catch (e) { /* fall through */ }
    }
    // 2) Telegram's native share sheet — works without inline mode.
    if (inTg && tg.openTelegramLink) {
      try {
        var url = 'https://t.me/share/url?url=' + encodeURIComponent(p.url || 'https://bazargoo.com') +
          '&text=' + encodeURIComponent(p.name + ' — ' + fmt(p.price));
        tg.openTelegramLink(url);
        return;
      } catch (e) { /* fall through to copy */ }
    }
    // 3) Copy "name — ৳price" + real bazargoo.com URL to the clipboard.
    copyShareText(text, btn);
  }

  // ---------- flash deals (daily rotation + countdown) ----------
  // Dhaka is UTC+6, fixed offset. All Dhaka wall-clock math derives from
  // the client's clock (Date.now() is UTC-based) — never the client's
  // local timezone, which may not be Dhaka.
  var DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
  var FLASH_DAY_MS = 24 * 60 * 60 * 1000;
  var flashSeed = null;    // Dhaka YYYYMMDD of the currently shown deals
  var flashTimerId = null; // 1s interval id, started once

  function dhakaDateSeed(nowMs) {
    var d = new Date((nowMs == null ? Date.now() : nowMs) + DHAKA_OFFSET_MS);
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }
  function flashRemainingMs(nowMs) {
    var d = new Date((nowMs == null ? Date.now() : nowMs) + DHAKA_OFFSET_MS);
    var intoDay = d.getUTCHours() * 3600000 + d.getUTCMinutes() * 60000 +
      d.getUTCSeconds() * 1000 + d.getUTCMilliseconds();
    return FLASH_DAY_MS - intoDay;
  }
  // mulberry32: small deterministic PRNG (seeded by the Dhaka date).
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Same Dhaka date -> the same 8 deals in the same order; a new date
  // shuffles the discounted products differently (seeded Fisher-Yates).
  function flashDeals(seed) {
    var discounted = products.filter(function (p) { return discountPct(p) > 0; });
    var rnd = mulberry32(seed);
    var arr = discounted.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr.slice(0, 8);
  }
  function pad2(n) { return ('0' + n).slice(-2); }
  function fmtFlashCountdown(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
  }
  function updateFlashTimer() {
    var el = $('flashTimer');
    if (!el || $('dealsSection').hidden) return;
    // Midnight in Dhaka crossed while the app was open: re-pick today's deals.
    if (dhakaDateSeed(Date.now()) !== flashSeed) { renderDeals(); return; }
    el.textContent = ''+t("common.flash_deal_ends_in")+' ' + bnNum(fmtFlashCountdown(flashRemainingMs(Date.now())));
  }
  function renderDeals() {
    flashSeed = dhakaDateSeed(Date.now());
    var deals = flashDeals(flashSeed);
    var sec = $('dealsSection');
    if (!deals.length) { sec.hidden = true; return; }
    sec.hidden = false;
    var html = '';
    deals.forEach(function (p) {
      var pct = discountPct(p);
      html += '<article class="deal-card" data-deal="' + esc(p.id) + '">' +
        (p.image
          ? '<img src="' + esc(p.image) + '" alt="' + esc(productName(p)) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;card-img-placeholder&quot;>🛍️</div>\'">'
          : '<div class="card-img-placeholder">🛍️</div>') +
        '<div class="deal-body">' +
        '<div class="deal-name">' + esc(productName(p)) + '</div>' +
        stockBadgeHTML(p) +
        '<div class="deal-price-row"><span class="price">' + fmt(p.price) + '</span>' +
        (p.old_price ? '<span class="old-price">' + fmt(p.old_price) + '</span>' : '') +
        (pct ? '<span class="discount-badge">-' + pct + '%</span>' : '') + '</div>' +
        '</div></article>';
    });
    $('dealsRow').innerHTML = html;
    Array.prototype.forEach.call($('dealsRow').querySelectorAll('[data-deal]'), function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-deal')); });
    });
    updateFlashTimer();
    if (!flashTimerId) { flashTimerId = setInterval(updateFlashTimer, 1000); }
  }

  // ---------- recently viewed ----------
  var RECENT_KEY = 'bazargoo_recently_viewed_v1';
  var MAX_RECENT = 8;
  function loadRecent() {
    try {
      var r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(r) ? r.filter(function (id) { return typeof id === 'string'; }) : [];
    } catch (e) { return []; }
  }
  function saveRecent(list) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function recordRecent(id) {
    if (!id || !productById[id]) return;
    var list = loadRecent().filter(function (x) { return x !== id; });
    list.unshift(id);
    if (list.length > MAX_RECENT) list = list.slice(0, MAX_RECENT);
    saveRecent(list);
    renderRecent();
  }
  function renderRecent() {
    var sec = $('recentSection');
    if (!sec) return;
    var ids = loadRecent().filter(function (id) { return !!productById[id]; });
    if (!ids.length) { sec.hidden = true; $('recentRow').innerHTML = ''; return; }
    sec.hidden = false;
    var html = '';
    ids.forEach(function (id) {
      var p = productById[id];
      var pct = discountPct(p);
      html += '<article class="deal-card" data-recent="' + esc(p.id) + '">' +
        (p.image
          ? '<img src="' + esc(p.image) + '" alt="' + esc(productName(p)) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;card-img-placeholder&quot;>🛍️</div>\'">'
          : '<div class="card-img-placeholder">🛍️</div>') +
        '<div class="deal-body">' +
        '<div class="deal-name">' + esc(productName(p)) + '</div>' +
        stockBadgeHTML(p) +
        '<div class="deal-price-row"><span class="price">' + fmt(p.price) + '</span>' +
        (p.old_price ? '<span class="old-price">' + fmt(p.old_price) + '</span>' : '') +
        (pct ? '<span class="discount-badge">-' + pct + '%</span>' : '') + '</div>' +
        '</div></article>';
    });
    $('recentRow').innerHTML = html;
    Array.prototype.forEach.call($('recentRow').querySelectorAll('[data-recent]'), function (el) {
      el.addEventListener('click', function () { openDetail(el.getAttribute('data-recent')); });
    });
  }

  // ---------- detail wishlist ----------
  function renderDetailWish() {
    var btn = $('detailWishBtn');
    if (!btn || !detailId) return;
    var wished = isWished(detailId);
    btn.textContent = wished ? t("common.in_favourites") : t("common.add_to_favourites");
    btn.classList.toggle('wished', wished);
    btn.onclick = function () { toggleWish(detailId); };
  }

  // ---------- cart ----------
  function changeQty(id, delta) {
    // Belt and braces: the add/stepper buttons are not rendered for
    // out-of-stock products, but never let a stale handler add one either.
    if (delta > 0 && isOutOfStock(productById[id])) return;
    var q = (cart[id] || 0) + delta;
    if (q <= 0) delete cart[id]; else cart[id] = q;
    saveCart();
    haptic();
    renderGrid();
    updateCartUI();
    if (openSheet === 'cart') renderCartItems();
    if (openSheet === 'detail' && detailId === id) renderDetailQty();
  }

  function updateCartUI() {
    var n = cartCount();
    var badge = $('cartCount');
    badge.hidden = n === 0;
    badge.textContent = bnNum(n);
    var bar = $('stickyBar');
    if (!IN_TELEGRAM && n > 0) {
      bar.hidden = false;
      $('stickyCount').textContent = bnNum(n) + t("cart.items_count_suffix");
      $('stickyTotal').textContent = fmt(cartTotal());
    } else {
      bar.hidden = true;
    }
    document.body.classList.toggle('has-sticky-bar', !bar.hidden);
    updateMainButton();
  }

  function renderCartItems() {
    var box = $('cartItems');
    var ids = Object.keys(cart);
    $('cartEmpty').hidden = ids.length !== 0;
    $('checkoutForm').style.display = ids.length === 0 ? 'none' : '';
    var html = '';
    ids.forEach(function (id) {
      var p = productById[id];
      if (!p) return;
      html += '<div class="cart-item">' +
        (p.image ? '<img src="' + esc(p.image) + '" alt="">' : '') +
        '<div class="cart-item-info"><div class="cart-item-name">' + esc(productName(p)) + '</div>' +
        '<div class="cart-item-price">' + fmt(p.price) + ' × ' + bnNum(cart[id]) + '</div></div>' +
        '<div class="cart-item-right">' +
        '<span class="cart-item-total">' + fmt(p.price * cart[id]) + '</span>' +
        qtyControlHTML(id, false) +
        '<button class="cart-remove" type="button" data-remove="' + esc(id) + t("cart.remove_item_button") +
        '</div></div>';
    });
    box.innerHTML = html;
    bindQtyButtons(box);
    Array.prototype.forEach.call(box.querySelectorAll('[data-remove]'), function (b) {
      b.addEventListener('click', function () {
        delete cart[b.getAttribute('data-remove')];
        saveCart(); haptic(); renderGrid(); updateCartUI(); renderCartItems();
      });
    });
    restoreCoupon();
    updateTotals();
  }

  function updateTotals() {
    $('subtotalVal').textContent = fmt(cartTotal());
    $('shippingVal').textContent = fmt(shippingFee());
    var disc = discountAmount();
    var row = $('discountRow');
    if (row) row.hidden = disc <= 0;
    var dl = $('discountLabel');
    if (dl) dl.textContent = (appliedCoupon && appliedCoupon.indexOf('ZERO5-') === 0) ? t("coupons.discount_zero5_5pct") : t("coupons.discount_bazar5_5pct");
    var dv = $('discountVal');
    if (dv) dv.textContent = '−' + fmt(disc);
    $('grandTotalVal').textContent = fmt(grandTotal());
    updateMainButton();
  }

  function telegramName() {
    try {
      var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (!u) return '';
      return [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
    } catch (e) { return ''; }
  }

  function markSelectedZone() {
    Array.prototype.forEach.call(document.querySelectorAll('.option-card[data-zone]'), function (card) {
      card.classList.toggle('selected', card.getAttribute('data-zone') === deliveryZone());
    });
  }

  function fillCheckoutForm() {
    var saved = loadDelivery();
    var nameEl = $('buyerName'), phoneEl = $('buyerPhone'), addrEl = $('buyerAddress');
    if (nameEl && !nameEl.value) nameEl.value = saved.name || telegramName();
    if (phoneEl && !phoneEl.value) phoneEl.value = saved.phone || '';
    if (addrEl && !addrEl.value) addrEl.value = saved.address || '';
    var distEl = $('buyerDistrict');
    if (distEl && saved.district) {
      distEl.value = saved.district;
      applyDistrictShipping();
    } else {
      var radio = document.querySelector('input[name="shipZone"][value="' + (saved.zone || 'inside') + '"]');
      if (radio) { radio.checked = true; markSelectedZone(); }
    }
    // The "name taken from Telegram" hint is only true inside Telegram.
    var hint = $('tgNameHint');
    if (hint) hint.hidden = !IN_TELEGRAM;
    // Telegram does not put the phone number in initData — offer the native
    // contact-share button when the client supports requestContact (6.9+).
    var btn = $('fillPhoneBtn');
    if (btn) {
      var supported = !!(tg && tg.requestContact) ||
        !!(tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9'));
      btn.hidden = !supported;
    }
    updateTotals();
  }

  // ---------- phone from Telegram ----------
  // The real requestContact callback is (granted, event) where event is
  // {status, response?, responseUnsafe?}; the contact hides inside
  // responseUnsafe.contact (object or JSON string) or responseUnsafe
  // itself as a query string — the earlier code looked in the wrong
  // places, so the number never filled in. This reads every shape.
  var phoneRequestPending = false;

  function parseQueryString(qs) {
    var out = {};
    String(qs || '').split('&').forEach(function (pair) {
      var idx = pair.indexOf('=');
      if (idx === -1) return;
      try {
        out[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(pair.slice(idx + 1));
      } catch (e) {}
    });
    return out;
  }

  function phoneFromValue(c) {
    if (!c) return '';
    if (typeof c === 'object') return c.phone_number || '';
    if (typeof c !== 'string') return '';
    if (c.indexOf('phone_number') !== -1 && c.indexOf('=') !== -1) {
      var q = parseQueryString(c);
      if (q.phone_number) return q.phone_number;
      if (q.contact) {
        try { var cj = JSON.parse(q.contact); if (cj && cj.phone_number) return cj.phone_number; } catch (e) {}
      }
    }
    try { var j = JSON.parse(c); if (j && j.phone_number) return j.phone_number; } catch (e) {}
    return c;
  }

  function extractPhone(ev) {
    if (!ev) return '';
    if (typeof ev === 'string') return normalizePhone(phoneFromValue(ev));
    var ru = ev.responseUnsafe || {};
    var cands = [ru.contact, ru.phone_number, ev.response, ev.contact, ev.phone_number];
    for (var i = 0; i < cands.length; i++) {
      var p = normalizePhone(phoneFromValue(cands[i]));
      if (/^01[3-9][0-9]{8}$/.test(p)) return p;
    }
    return '';
  }

  function phoneNote(text) {
    var n = $('phoneNote');
    if (!n) return;
    if (text) { n.textContent = text; n.hidden = false; }
    else { n.hidden = true; }
  }

  function handleContactResult(granted, ev) {
    phoneRequestPending = false;
    var btn = $('fillPhoneBtn');
    if (btn) btn.disabled = false;
    if (!granted) { phoneNote(t("common.phone_not_shared_type_manually")); return; }
    var phone = extractPhone(ev);
    if (validPhone(phone)) {
      $('buyerPhone').value = phone;
      setFieldError('buyerPhone', false);
      $('formError').hidden = true;
      phoneNote('');
      haptic();
    } else {
      phoneNote(t("common.phone_not_found_type_manually"));
    }
  }

  function requestPhoneFromTelegram() {
    if (!tg || !tg.requestContact) return;
    if (phoneRequestPending) return;
    phoneRequestPending = true;
    var btn = $('fillPhoneBtn');
    if (btn) btn.disabled = true;
    phoneNote(t("common.phone_request_allow_in_telegram"));
    try {
      tg.requestContact(function (granted, ev) {
        handleContactResult(granted, ev);
      });
    } catch (e) {
      // e.g. "Contact is already requested": an earlier tap is still in
      // flight — its callback will fill the number when it arrives.
      phoneNote(t("common.phone_request_please_wait"));
      setTimeout(function () {
        phoneRequestPending = false;
        if (btn) btn.disabled = false;
      }, 5000);
    }
  }

  function setFieldError(id, bad) {
    var el = $(id);
    if (el) el.classList.toggle('invalid', !!bad);
  }

  function validateDelivery() {
    var name = $('buyerName').value.trim();
    var phone = normalizePhone($('buyerPhone').value);
    var address = $('buyerAddress').value.trim();
    var district = $('buyerDistrict').value;
    setFieldError('buyerName', name.length < 3);
    setFieldError('buyerPhone', !validPhone(phone));
    setFieldError('buyerAddress', address.length < 10);
    setFieldError('buyerDistrict', !district);
    var err = '';
    if (name.length < 3) err = t("common.enter_full_name");
    else if (!validPhone(phone)) err = t("common.enter_valid_mobile_number");
    else if (address.length < 10) err = t("cart.enter_full_address");
    else if (!district) err = t("cart.choose_district");
    var errEl = $('formError');
    if (err) { errEl.textContent = err; errEl.hidden = false; }
    else { errEl.hidden = true; }
    return err ? null : { name: name, phone: phone, address: address, district: district, zone: deliveryZone() };
  }

  // ---------- sheets ----------
  function showSheet(id, name) {
    $(id).hidden = false;
    openSheet = name;
    updateBackButton();
    updateMainButton();
  }
  function closeSheet(id) {
    $(id).hidden = true;
    if (openSheet === 'detail') detailId = null;
    if (id === 'ordersSheet') expandedOrderId = null;
    openSheet = null;
    // The review confirm sheet sits on top of the detail sheet: closing
    // it returns to the detail sheet, so keep the back button working.
    if (id === 'reviewConfirmSheet' && !$('detailSheet').hidden) openSheet = 'detail';
    updateBackButton();
    updateMainButton();
  }

  function openDetail(id) {
    var p = productById[id];
    if (!p) return;
    detailId = id;
    recordRecent(id);
    $('detailImg').src = p.image_large || p.image;
    $('detailImg').alt = productName(p);
    $('detailName').textContent = productName(p);
    $('detailPrice').textContent = fmt(p.price);
    var pct = discountPct(p);
    $('detailOldPrice').hidden = !p.old_price;
    if (p.old_price) $('detailOldPrice').textContent = fmt(p.old_price);
    $('detailDiscount').hidden = !pct;
    if (pct) $('detailDiscount').textContent = '-' + pct + '%';
    $('detailCategory').textContent = catLabel(p.category);
    var st = $('detailStock');
    if (p.in_stock === true) { st.hidden = false; st.className = 'stock-badge in-stock'; st.textContent = t("common.in_stock"); }
    else if (p.in_stock === false) { st.hidden = false; st.className = 'stock-badge out-of-stock'; st.textContent = t("common.out_of_stock"); }
    else { st.hidden = true; }
    var link = $('detailLink');
    link.href = p.url;
    link.addEventListener('click', function (ev) {
      if (tg && tg.openLink) { ev.preventDefault(); tg.openLink(p.url); }
    }, { once: true });
    renderDetailQty();
    renderDetailWish();
    var shareBtn = $('detailShareBtn');
    shareBtn.onclick = function () { shareProduct(detailId, shareBtn); };
    reviewStars = 0;
    renderReviews();
    showSheet('detailSheet', 'detail');
  }

  function renderDetailQty() {
    var box = $('detailQty');
    box.innerHTML = qtyControlHTML(detailId, false);
    bindQtyButtons(box);
  }

  function openCartSheet() {
    renderCartItems();
    fillCheckoutForm();
    showSheet('cartSheet', 'cart');
  }

  // ---------- order history UI ----------
  function renderOrders() {
    var list = loadOrders();
    var box = $('ordersList');
    $('ordersEmpty').hidden = list.length !== 0;
    var html = '';
    list.forEach(function (o) {
      var first = (o.items && o.items[0]) ? o.items[0].name : '';
      var expanded = expandedOrderId === o.order_id;
      html += '<div class="order-row' + (expanded ? ' expanded' : '') + '" data-order="' + esc(o.order_id) + '">' +
        '<div class="order-head">' +
          '<div class="order-head-main">' +
            '<div class="order-id">' + esc(o.order_id) + '</div>' +
            '<div class="order-meta">' + esc(fmtShortDate(o.ordered_at)) + ' • ' + bnNum(o.item_count) + t("cart.items_count_suffix") + (first ? ' • ' + esc(first) : '') + '</div>' +
          '</div>' +
          '<div class="order-head-side"><strong>' + fmt(o.total) + t("common.order_status_sent") +
        '</div>';
      if (expanded) {
        html += '<div class="order-detail">';
        (o.items || []).forEach(function (it) {
          html += '<div class="summary-row small"><span>' + esc(it.name) + ' × ' + bnNum(it.qty) + '</span><span>' + fmt(it.subtotal) + '</span></div>';
        });
        html += t("common.summary_products_total_html") + fmt(o.subtotal) + '</span></div>';
        if (o.discount) {
          html += t("coupons.order_discount_label_open") + esc(o.coupon || 'BAZAR5') + ' '+t("common.discount_percent_suffix_html")+'' + fmt(o.discount) + '</span></div>';
        }
        html += t("cart.delivery_charge_row") + fmt(o.shipping_fee) + '</span></div>' +
          t("common.summary_total_html") + fmt(o.total) + '</strong></div>';
        if (o.district) html += ''+t("cart.order_district_label")+' ' + esc(o.district) + '</div>';
        html += '<button class="btn-secondary btn-block order-rebuy" type="button" data-rebuy="' + esc(o.order_id) + t("common.buy_again_button");
      }
      html += '</div>';
    });
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll('.order-head'), function (h) {
      h.addEventListener('click', function () {
        var id = h.parentNode.getAttribute('data-order');
        expandedOrderId = (expandedOrderId === id) ? null : id;
        renderOrders();
      });
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-rebuy]'), function (b) {
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();
        rebuyOrder(b.getAttribute('data-rebuy'));
      });
    });
  }

  function rebuyOrder(orderId) {
    var list = loadOrders();
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].order_id === orderId) { found = list[i]; break; }
    }
    if (!found) return;
    var added = 0;
    (found.items || []).forEach(function (it) {
      if (it.id && productById[it.id]) {
        cart[it.id] = (cart[it.id] || 0) + it.qty;
        added++;
      }
    });
    if (!added) return; // nothing from this order is sold anymore
    saveCart();
    renderGrid();
    updateCartUI();
    haptic();
    closeSheet('ordersSheet');
    openCartSheet();
  }

  function openOrdersSheet() {
    expandedOrderId = null;
    renderOrders();
    showSheet('ordersSheet', 'orders');
  }

  // ---------- order ----------
  function buildOrder(delivery) {
    var items = Object.keys(cart).map(function (id) {
      var p = productById[id];
      return { id: id, name: p.name, price: p.price, qty: cart[id], subtotal: p.price * cart[id] };
    });
    var user = null;
    try {
      var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      if (u) user = { id: u.id, username: u.username || null, first_name: u.first_name || null };
    } catch (e) {}
    var fee = shippingFee();
    var disc = discountAmount();
    var order = {
      type: 'bazargoo_order',
      order_id: makeOrderId(),
      store: 'Bazar Goo',
      currency: 'BDT',
      items: items,
      subtotal: cartTotal(),
      delivery: {
        name: delivery.name,
        phone: delivery.phone,
        address: delivery.address,
        district: delivery.district,
        shipping_zone: delivery.zone,
        shipping_fee: fee,
        payment: 'cod'
      },
      total: cartTotal() - disc + fee,
      item_count: cartCount(),
      user: user,
      ordered_at: new Date().toISOString()
    };
    if (disc > 0) { order.coupon = appliedCoupon; order.discount = disc; }
    return order;
  }

  function orderSummaryText(order) {
    var lines = [t("cart.order_summary_heading")];
    if (order.order_id) lines.push(''+t("cart.order_summary_number")+' ' + order.order_id);
    lines.push('');
    order.items.forEach(function (it) {
      lines.push('• ' + it.name + ' × ' + it.qty + ' — ৳' + it.subtotal.toLocaleString('en-US'));
    });
    var d = order.delivery || {};
    lines.push('', t("cart.order_summary_subtotal") + (order.subtotal || order.total).toLocaleString('en-US'));
    if (order.discount) {
      var cLabel = (order.coupon && order.coupon.indexOf('ZERO5-') === 0) ? t("coupons.zero5_coupon_5pct_label") : t("cart.coupon_bazar5_label");
      lines.push(t("coupons.discount_label_open_order_summary") + cLabel + t("common.discount_amount_suffix") + order.discount.toLocaleString('en-US'));
    }
    if (d.shipping_fee !== undefined) {
      lines.push(t("cart.order_summary_delivery") + (d.shipping_zone === 'outside' ? t("common.outside_dhaka") : t("common.inside_dhaka")) + '): ৳' + d.shipping_fee.toLocaleString('en-US'));
    }
    lines.push(t("common.total_taka") + order.total.toLocaleString('en-US') + ' (Cash on Delivery)');
    if (d.name) {
      lines.push('', ''+t("common.label_name")+' ' + d.name, ''+t("common.label_mobile")+' ' + d.phone, ''+t("cart.order_summary_address")+' ' + d.address);
      if (d.district) lines.push(''+t("cart.order_summary_district")+' ' + d.district);
    }
    return lines.join('\n');
  }

  function placeOrder() {
    if (cartCount() === 0) return;
    var delivery = validateDelivery();
    if (!delivery) return;
    saveDelivery(delivery);
    var order = buildOrder(delivery);
    // ZERO5 coupon: mark it used on the server BEFORE the order goes
    // out — one coupon per order, never stacked with BAZAR5 (applyCoupon
    // already enforces that). If the code is no longer valid, stop the
    // order so the discount is not given for free; a network failure
    // still lets the order through (the code then stays usable once).
    if (appliedCoupon && appliedCoupon.indexOf('ZERO5-') === 0) {
      var code = appliedCoupon;
      var uid = tgUserId();
      var fe = $('formError');
      if (!uid) {
        if (fe) { fe.hidden = false; fe.textContent = t("cart.coupon_zero5_telegram_only"); }
        return;
      }
      fetch(WORKER_URL + '/coupon/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, code: code }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok) { finishPlaceOrder(order); }
          else {
            appliedCoupon = '';
            saveAppliedCoupon();
            couponNote(t("cart.coupon_could_not_be_used"), 'err');
            updateTotals();
            if (fe) { fe.hidden = false; fe.textContent = t("cart.coupon_already_used_or_not_found"); }
          }
        })
        .catch(function () { finishPlaceOrder(order); });
      return;
    }
    finishPlaceOrder(order);
  }
  function finishPlaceOrder(order) {
    // Save a compact record for "আমার অর্ডার" (per-device only, no
    // name/phone/address — the full order already went to the shop).
    // Stored item ids (not in the spec's field list) let "আবার কিনুন"
    // match products reliably; matching by name alone would be fragile.
    saveOrderRecord({
      order_id: order.order_id,
      ordered_at: order.ordered_at,
      items: order.items.map(function (it) {
        return { id: it.id, name: it.name, qty: it.qty, subtotal: it.subtotal };
      }),
      subtotal: order.subtotal,
      discount: order.discount || 0,
      coupon: order.coupon || null,
      shipping_fee: order.delivery.shipping_fee,
      total: order.total,
      district: order.delivery.district,
      item_count: order.item_count
    });
    // First-order coupon: mark BAZAR5 used on this device now that the
    // order is built (per-device only — see the coupon comment above).
    // The order itself still carries coupon + discount.
    if (appliedCoupon === COUPON_CODE) {
      var used = loadUsedCoupons();
      if (used.indexOf(COUPON_CODE) === -1) { used.push(COUPON_CODE); saveUsedCoupons(used); }
      appliedCoupon = '';
      saveAppliedCoupon();
      renderCouponBanner();
    }
    // ZERO5: the code was already marked used on the server in
    // placeOrder — just clear the local applied state here.
    if (appliedCoupon && appliedCoupon.indexOf('ZERO5-') === 0) {
      appliedCoupon = '';
      saveAppliedCoupon();
    }
    if (tg && tg.sendData) {
      try { tg.sendData(JSON.stringify(order)); } catch (e) { /* fall through to the copy backup below */ }
    }
    // clear cart either way — the order is either sent or shown for copying
    cart = {};
    saveCart();
    renderGrid();
    updateCartUI();
    closeSheet('cartSheet');
    // sendData can fail silently (no exception) in some Telegram clients,
    // so always show the order summary as a backup: if the bot does not
    // message a confirmation, the buyer can copy the order into the chat.
    $('orderSummaryBox').hidden = false;
    $('orderSummaryText').textContent = orderSummaryText(order);
    showSheet('confirmSheet', 'confirm');
    haptic('medium');
  }

  function copyOrder() {
    var text = $('orderSummaryText').textContent;
    var done = function () {
      var b = $('copyOrderBtn');
      b.textContent = t("common.copied");
      setTimeout(function () { b.textContent = t("cart.copy_order"); }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  // ---------- reviews UI ----------
  function renderReviewStars() {
    var wrap = $('reviewStars');
    var html = '';
    for (var i = 1; i <= 5; i++) {
      html += '<button type="button" class="review-star' + (i <= reviewStars ? ' selected' : '') +
        '" data-star="' + i + '" aria-label="' + bnNum(i) + ' '+t("shop.review_star_button")+'';
    }
    wrap.innerHTML = html;
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-star]'), function (b) {
      b.addEventListener('click', function () {
        reviewStars = parseInt(b.getAttribute('data-star'), 10);
        $('reviewError').hidden = true;
        renderReviewStars();
        haptic('light');
      });
    });
  }

  function renderReviews() {
    var p = productById[detailId];
    if (!p) return;
    var list = approvedFor(p.id);
    var mine = myReviews[p.id];
    var sum = $('reviewSummary');
    if (list.length) {
      var avg = avgStars(list);
      sum.innerHTML = '<span class="review-avg">' + starsHTML(Math.round(avg)) + '</span> ' +
        '<strong>' + bnNum(avg.toFixed(1)) + '</strong> • ' + bnNum(list.length) + t("shop.review_count_suffix");
    } else {
      sum.textContent = t("shop.no_reviews_yet");
    }
    var box = $('approvedReviews');
    var html = '';
    list.forEach(function (r) {
      html += '<div class="review-item">' +
        '<div class="review-item-head"><span class="review-stars-display">' + starsHTML(r.stars || 0) + '</span>' +
        '<span class="review-date">' + esc(fmtShortDate(r.submitted_at)) + '</span></div>' +
        (r.text ? '<p class="review-text">' + esc(r.text) + '</p>' : '') +
        '</div>';
    });
    box.innerHTML = html;
    var myBox = $('myReviewBox');
    var form = $('reviewForm');
    if (mine) {
      var approved = list.some(function (r) { return r.review_id === mine.review_id; });
      myBox.hidden = false;
      myBox.innerHTML = t("shop.my_review_title") +
        '<div class="review-stars-display">' + starsHTML(mine.stars) + '</div>' +
        (mine.text ? '<p class="review-text">' + esc(mine.text) + '</p>' : '') +
        '<p class="review-pending">' + (approved ? t("shop.review_published") : t("shop.review_pending_approval")) + '</p>';
      form.hidden = true;
    } else {
      myBox.hidden = true;
      form.hidden = false;
      renderReviewStars();
    }
  }

  function reviewSummaryText(r) {
    var lines = [t("shop.review_summary_heading")];
    lines.push(''+t("shop.review_summary_number")+' ' + r.review_id);
    lines.push(''+t("shop.review_summary_product")+' ' + r.product_name);
    lines.push(''+t("shop.review_summary_product_id")+' ' + r.product_id);
    lines.push(t("shop.review_summary_rating") + ' ' + starsHTML(r.stars) + ' (' + r.stars + '/' + bnNum(5) + ')');
    lines.push(''+t("shop.review_summary_comment")+' ' + (r.text ? r.text : '—'));
    return lines.join('\n');
  }

  function submitReview() {
    var p = productById[detailId];
    if (!p) return;
    if (myReviews[p.id]) return; // one review per product per device
    if (!reviewStars || reviewStars < 1 || reviewStars > 5) {
      var err = $('reviewError');
      err.textContent = t("shop.review_choose_stars");
      err.hidden = false;
      return;
    }
    var text = ($('reviewText').value || '').trim().slice(0, 300);
    var review = {
      type: 'bazargoo_review',
      review_id: makeReviewId(),
      product_id: p.id,
      product_name: p.name,
      stars: reviewStars,
      text: text,
      user: telegramUser(),
      submitted_at: new Date().toISOString()
    };
    // Save locally first: the buyer's own review shows as pending even
    // if sendData fails (same copy-fallback pattern as orders).
    myReviews[p.id] = {
      review_id: review.review_id,
      stars: review.stars,
      text: review.text,
      submitted_at: review.submitted_at
    };
    saveMyReviews();
    if (tg && tg.sendData) {
      try { tg.sendData(JSON.stringify(review)); } catch (e) { /* fall through to the copy backup below */ }
    }
    // sendData can fail silently (no exception) in some Telegram clients,
    // so always show the review summary as a backup: if the bot does not
    // message a confirmation, the buyer can copy the review into the chat.
    $('reviewSummaryBox').hidden = false;
    $('reviewSummaryText').textContent = reviewSummaryText(review);
    reviewStars = 0;
    $('reviewText').value = '';
    $('reviewError').hidden = true;
    renderReviews();
    showSheet('reviewConfirmSheet', 'reviewConfirm');
    haptic('medium');
  }

  function copyReview() {
    var text = $('reviewSummaryText').textContent;
    var done = function () {
      var b = $('copyReviewBtn');
      b.textContent = t("common.copied");
      setTimeout(function () { b.textContent = t("shop.copy_review"); }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }

  // ---------- wiring ----------
  function wireEvents() {
    // i18n: Profile language toggle (segmented বাংলা | English, .chip
    // buttons in index.html). The choice persists in localStorage and
    // re-renders the whole app; both names are always shown.
    Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
      b.addEventListener('click', function () { setLanguage(b.getAttribute('data-lang')); });
    });
    $('searchInput').addEventListener('input', function (e) {
      searchQuery = e.target.value;
      renderGrid();
    });
    $('searchClear').addEventListener('click', function () {
      $('searchInput').value = '';
      searchQuery = '';
      renderGrid();
      $('searchInput').focus();
    });
    $('sortSelect').value = sortMode;
    $('sortSelect').addEventListener('change', function (e) {
      sortMode = e.target.value;
      try { localStorage.setItem(SORT_KEY, sortMode); } catch (err) {}
      renderGrid();
    });
    $('couponBanner').addEventListener('click', function () { copyCouponCode($('couponBanner')); });
    $('couponBanner').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copyCouponCode($('couponBanner')); }
    });
    renderCouponBanner();
    $('cartBtn').addEventListener('click', openCartSheet);
    $('ordersBtn').addEventListener('click', openOrdersSheet);
    // v28: header balance pill opens the Wallet screen; the screen's
    // Deposit/Withdraw buttons open the existing v26 wallet sheet.
    var balancePill = $('balancePill');
    if (balancePill) balancePill.addEventListener('click', showWalletScreen);
    var walletDepBtn = $('walletDepositBtn');
    if (walletDepBtn) walletDepBtn.addEventListener('click', openWalletSheet);
    var walletWdBtn = $('walletWithdrawBtn');
    if (walletWdBtn) walletWdBtn.addEventListener('click', openWalletSheet);
    $('stickyCartBtn').addEventListener('click', openCartSheet);
    $('orderBtn').addEventListener('click', placeOrder);
    $('applyCouponBtn').addEventListener('click', applyCoupon);
    $('couponInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="shipZone"]'), function (r) {
      r.addEventListener('change', function () { markSelectedZone(); updateTotals(); });
    });
    populateDistricts();
    $('buyerDistrict').addEventListener('change', function () {
      setFieldError('buyerDistrict', false);
      $('formError').hidden = true;
      applyDistrictShipping();
    });
    $('fillPhoneBtn').addEventListener('click', requestPhoneFromTelegram);
    ['buyerName', 'buyerPhone', 'buyerAddress', 'buyerDistrict'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        setFieldError(id, false);
        $('formError').hidden = true;
      });
    });
    $('copyOrderBtn').addEventListener('click', copyOrder);
    $('pdfZeroBotBtn').addEventListener('click', function () {
      if (!pdfZeroId) return;
      closeSheet('pdfZeroSheet');
      openBotLink('https://t.me/' + BOT_USERNAME + '?start=zero_' + encodeURIComponent(pdfZeroId));
    });
    $('reviewSubmitBtn').addEventListener('click', submitReview);
    $('copyReviewBtn').addEventListener('click', copyReview);
    $('closeReviewConfirmBtn').addEventListener('click', function () {
      closeSheet('reviewConfirmSheet');
    });
    $('closeConfirmBtn').addEventListener('click', function () {
      closeSheet('confirmSheet');
      if (tg && tg.close) { /* keep app open; user closes via Telegram UI */ }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', function () { closeSheet(b.getAttribute('data-close')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.sheet-backdrop'), function (bd) {
      bd.addEventListener('click', function (ev) {
        if (ev.target === bd) closeSheet(bd.id);
      });
    });
  }

  // ---------- boot ----------
  detectLanguage(); // stored choice wins; else Telegram language_code
  setupTelegram();
  wireEvents();
  setupBottomNav();
  setupBrowser();
  applyI18n(); // static HTML shells, before the async renders land
  loadProducts();
  loadReviews();
  loadPdfs();
  loadMyPdfs();
  loadTasks();
})();
