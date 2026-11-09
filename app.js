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
 */
(function () {
  'use strict';

  var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  var IN_TELEGRAM = !!tg;
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
  function bnNum(n) { return String(n).replace(/[0-9]/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }
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
    if (p.in_stock === true) return '<span class="stock-badge in-stock">✓ স্টকে আছে</span>';
    if (p.in_stock === false) return '<span class="stock-badge out-of-stock">স্টক শেষ</span>';
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
    if (p.reward_only) return '<span class="pdf-price free">🎁 পুরস্কার — টপ ৩ পারফর্মারদের জন্য ফ্রি</span>';
    if (p.free) return '<span class="pdf-price free">ফ্রি</span>';
    var parts = [];
    if (p.price_stars) parts.push('⭐ ' + bnNum(p.price_stars) + ' Stars');
    else parts.push('⭐ দাম ঠিক হয়নি');
    if (p.price_zero) parts.push('⛓️ ' + p.price_zero + ' ZERO');
    else parts.push('⛓️ ZERO: দাম ঠিক হয়নি');
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
    if (!religionData) return '<div class="pdf-note">Telegram-এ অ্যাপ খুললে আপনার র‍্যাংক দেখাবে।</div>';
    if (religionData.eligible) {
      var parts = [];
      var r = religionData.ranks || {};
      if (r.daily && r.daily <= 3) parts.push('আজ');
      if (r.weekly && r.weekly <= 3) parts.push('এই সপ্তাহে');
      if (r.monthly && r.monthly <= 3) parts.push('এই মাসে');
      return '<div class="pdf-note">🎉 আপনি ' + esc(parts.join(' / ') || 'টপ ৩-এ') + ' টপ ৩-এ আছেন — নিচের বইগুলো ফ্রি নিন!</div>';
    }
    return '<div class="pdf-note">আজ / এই সপ্তাহে / এই মাসে টপ ৩-এ থাকলে এই বইগুলো ফ্রি পাবেন। টাস্ক করে ZERO জমিয়ে লিডারবোর্ডে উঠুন!</div>';
  }
  function pdfCardHtml(p) {
    var html = '<article class="pdf-card">' +
      '<div class="pdf-title">' + esc(p.title) + '</div>' +
      (p.description ? '<div class="pdf-desc">' + esc(p.description) + '</div>' : '') +
      '<div class="pdf-price-row">' + pdfPriceLine(p) + '</div>';
    if (p.reward_only) {
      if (religionClaimed(p.id)) {
        html += '<div class="task-status done">নেওয়া হয়েছে ✓ — বটের চ্যাটে PDF দেখুন।</div>';
      } else if (religionData && religionData.eligible) {
        html += '<button class="btn-primary pdf-btn" type="button" data-religion-claim="' + esc(p.id) + '">🎁 ফ্রি নিন — পুরস্কার</button>';
      } else {
        html += '<button class="btn-secondary pdf-btn" type="button" disabled>🎁 টপ ৩-এ থাকলে ফ্রি পাবেন</button>';
      }
    } else if (p.free && p.file_url) {
      html += '<a class="btn-primary pdf-btn" href="' + esc(p.file_url) + '" download>⬇️ ডাউনলোড করুন (বাংলা)</a>';
      if (p.file_url_en) {
        html += '<a class="btn-secondary pdf-btn" href="' + esc(p.file_url_en) + '" download>⬇️ Download (English)</a>';
      }
    } else if (p.free) {
      html += '<span class="pdf-note">ফ্রি — শীঘ্রই আসছে</span>';
    } else {
      if (p.en) html += '<div class="pdf-note">বাংলা + English ভার্সন — দুটোই পাবেন</div>';
      if (p.preview_url) {
        html += '<a class="btn-secondary pdf-btn" href="' + esc(p.preview_url) + '" target="_blank" rel="noopener">👀 ফ্রি প্রিভিউ দেখুন</a>';
        if (p.preview_url_en) {
          html += '<a class="btn-secondary pdf-btn" href="' + esc(p.preview_url_en) + '" target="_blank" rel="noopener">👀 Free preview (English)</a>';
        }
      }
      html += '<button class="btn-primary pdf-btn" type="button" data-buy-stars="' + esc(p.id) + '">⭐ Stars দিয়ে কিনুন</button>' +
        '<button class="btn-secondary pdf-btn" type="button" data-buy-zero="' + esc(p.id) + '">⛓️ ZERO দিয়ে কিনুন</button>';
      // v26: buy with the wallet balance (deposit-to-buy, free choice).
      if (p.price_zero) html += '<button class="btn-secondary pdf-btn" type="button" data-buy-wallet-zero="' + esc(p.id) + '">👛 Wallet ZERO (' + bnNum(p.price_zero) + ') দিয়ে কিনুন</button>';
      if (p.price_stars) html += '<button class="btn-secondary pdf-btn" type="button" data-buy-wallet-stars="' + esc(p.id) + '">👛 Wallet Stars (' + bnNum(p.price_stars) + ') দিয়ে কিনুন</button>';
      if (p.price_zero && earnBalance >= p.price_zero) {
        html += '<button class="btn-secondary pdf-btn" type="button" data-redeem="' + esc(p.id) + '">⛓️ ZERO দিয়ে রিডিম করুন</button>';
      }
    }
    return html + '</article>';
  }
  function loadReligion() {
    var uid = tgUserId();
    if (!WORKER_URL || !uid) { religionData = null; return; }
    fetch(WORKER_URL + '/religion?user_id=' + encodeURIComponent(uid))
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
          showEarnAlert('🎁 PDF পাঠানো হয়েছে — বটের চ্যাটে দেখুন।');
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
      html += '<h3 class="pdf-cat">' + esc(cat) + '</h3>';
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
      $('myPdfNote').textContent = 'Telegram-এ অ্যাপ খুললে আপনার কেনা PDF এখানে দেখাবে।';
      return;
    }
    fetch(WORKER_URL + '/my_pdfs?user_id=' + encodeURIComponent(uid))
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
        '<div class="pdf-note">কেনা হয়েছে ✓</div>' +
        '<button class="btn-primary pdf-btn" type="button" data-redownload="' + esc(p.item_id) + '">⬇️ আবার ডাউনলোড করুন</button>' +
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
    fetch(WORKER_URL + '/tasks?user_id=' + encodeURIComponent(uid) + nameParam + devParam)
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
    { icon: '🛍️', label: 'BazarGoo দোকান', url: 'https://bazargoo.com' },
    { icon: '🇺🇸', label: 'USA 247 Trend Post', url: 'https://usa247trendpost.blogspot.com/' },
    { icon: '💚', label: 'Unlocking Wellness', url: 'https://healthhackshub247.blogspot.com/' },
    { icon: '💰', label: 'US Money Pulse', url: 'https://usmoneypulse.blogspot.com/' },
    { icon: '📢', label: 'BazarGoo চ্যানেল', url: 'https://t.me/bazargoo287' },
    { icon: '🎮', label: 'EarnPLayGame চ্যানেল', url: 'https://t.me/earnplaygame21' },
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
      if (err) { err.textContent = 'সঠিক লিংক লিখুন (যেমন: bazargoo.com) অথবা কিছু সার্চ করুন।'; err.hidden = false; }
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
    if (h <= 0) return bnNum(m) + ' মিনিট';
    if (m === 0) return bnNum(h) + ' ঘণ্টা';
    return bnNum(h) + ' ঘণ্টা ' + bnNum(m) + ' মিনিট';
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
        else { el.textContent = 'এখন করা যাবে'; needRefresh = true; }
      });
      if (needRefresh) loadTasks();
    }, 30000);
  }
  function claimErrorText(reason) {
    if (reason === 'already_done') return 'আজকের জন্য হয়ে গেছে।';
    if (reason === 'not_member') return 'চ্যানেলে জয়েন করা হয়নি — জয়েন করে আবার চেষ্টা করুন।';
    if (reason === 'not_joined') return 'প্রথমে চ্যানেলে জয়েন করো — জয়েন করে আবার দাবি করুন।';
    if (reason === 'wrong_answers') return 'একটি উত্তর ভুল হয়েছে — আবার চেষ্টা করুন।';
    if (reason === 'daily_limit') return 'আজকের সীমা শেষ।';
    if (reason === 'no_click') return 'প্রথমে বিজ্ঞাপনটি দেখুন, তারপর দাবি করুন।';
    if (reason === 'cooldown') return 'এখনো সময় হয়নি — আবার পরে চেষ্টা করুন।';
    if (reason === 'device_conflict') return 'এই মোবাইলে already একটা অ্যাকাউন্ট আছে — এই অ্যাকাউন্ট দিয়ে আয় করা যাবে না।';
    if (reason === 'locked') return 'স্পিন এখনো আনলক হয়নি — শর্তগুলো পূরণ করুন।';
    if (reason === 'not_top3') return 'আপনি গত সপ্তাহের সেরা ৩-এ নেই।';
    if (reason === 'not_top_performer') return 'আপনি আজ/এই সপ্তাহে/এই মাসে টপ ৩-এ নেই — টাস্ক করে লিডারবোর্ডে উঠুন।';
    if (reason === 'not_reward_pdf') return 'এই PDF-টি পুরস্কার হিসেবে দেওয়া হয় না।';
    if (reason === 'expired') return 'এই পুরস্কারের মেয়াদ শেষ।';
    if (reason === 'already_claimed') return 'এই পুরস্কারটি ইতিমধ্যে নেওয়া হয়েছে।';
    if (reason === 'not_winner') return 'আপনি এই মাসের বিজয়ী নন।';
    if (reason === 'invalid_item') return 'এই PDF-টি বেছে নেওয়া যাবে না।';
    if (reason === 'insufficient_balance') return 'ZERO যথেষ্ট নয়।';
    if (reason === 'not_claimable') return 'এই টাস্কটি এখানে দাবি করা যায় না — বিজ্ঞাপন দেখে নিন।';
    if (reason === 'use_spin_start') return 'স্পিন এখন অ্যাড দেখে ঘোরাতে হয় — নিচের স্পিন কার্ড দেখুন।';
    if (reason === 'spin_pending') return 'একটি স্পিন already ঘোরানো হয়েছে — বিজ্ঞাপনটি দেখে পুরস্কার নিন।';
    if (reason === 'no_spins_left') return 'আজকের স্পিন শেষ — আগামীকাল আবার।';
    if (reason === 'network_spins_used') return 'এই নেটওয়ার্কের আজকের স্পিন শেষ — অন্য নেটওয়ার্কে চেষ্টা করো।';
    if (reason === 'spin_expired') return 'স্পিনের মেয়াদ শেষ — আবার ঘোরান।';
    if (reason === 'no_pending_spin') return 'কোনো স্পিন অপেক্ষায় নেই — আবার ঘোরান।';
    if (reason === 'unknown_nonce') return 'বিজ্ঞাপন যাচাই করা যায়নি — আবার চেষ্টা করো।';
    if (reason === 'user_mismatch') return 'এই পুরস্কারটি আপনার নয়।';
    if (reason === 'joins_required') return 'আগে ৪টি চ্যানেলে জয়েন করুন — প্রোফাইলে চেকলিস্ট দেখুন।';
    if (reason === 'start_first') return 'প্রথমে স্পন্সর কাজটি খুলুন।';
    if (reason === 'dwell_not_done') return 'একটু অপেক্ষা করুন — কাজটি দেখে তারপর দাবি করুন।';
    if (reason === 'promo_not_live') return 'এই প্রমোশনটি আর লাইভ নেই।';
    if (reason === 'gram_not_configured') return 'GRAM পেমেন্ট এখনো চালু হয়নি — অ্যাডমিন সেটআপ বাকি আছে।';
    if (reason === 'rate_unavailable') return 'রেট পাওয়া যায়নি — একটু পরে আবার চেষ্টা করুন।';
    if (reason === 'below_minimum') return 'পরিমাণ সর্বনিম্ন সীমার নিচে।';
    if (reason === 'invalid_address') return 'ঠিকানাটি সঠিক নয় — আবার দেখে লিখুন।';
    if (reason === 'daily_cap') return 'আজকের তোলার সীমা শেষ।';
    if (reason === 'insufficient_float') return 'এই মুহূর্তে GRAM তোলা যাবে না — ফান্ড কম আছে।';
    if (reason === 'stars_not_withdrawable') return 'Stars তোলা যায় না — শুধু জমা দিয়ে PDF কেনা যায়।';
    if (reason === 'invalid_amount') return 'পরিমাণটি সঠিক নয়।';
    if (reason === 'unknown_currency') return 'এই মুদ্রাটি সমর্থিত নয়।';
    if (reason === 'budget_out_of_range') return 'বাজেট সীমার বাইরে — সর্বনিম্ন ১০০ ZERO / $২, সর্বোচ্চ ৬২৫ ZERO / $১০।';
    if (reason === 'invalid_url') return 'লিংকটি সঠিক নয় — https:// দিয়ে শুরু করুন।';
    if (reason === 'invalid_type') return 'প্রমোশনের ধরনটি সঠিক নয়।';
    if (reason === 'no_txid') return 'txid দিতে হবে।';
    if (reason === 'not_verified') return 'পেমেন্ট যাচাই হয়নি — txid ঠিক আছে কি না দেখুন।';
    if (reason === 'already_confirmed') return 'এই txid দিয়ে আগেই কনফার্ম হয়েছে।';
    if (reason === 'not_found') return 'এই লেনদেনটি খুঁজে পাওয়া যায়নি।';
    if (reason === 'insufficient') return 'পাঠানো পরিমাণ যথেষ্ট নয়।';
    if (reason === 'unconfirmed') return 'পেমেন্টটি এখনো কনফার্ম হয়নি — একটু পরে চেষ্টা করুন।';
    if (reason === 'reward_only') return 'এই PDF-টি কেনা যায় না — এটি পুরস্কার হিসেবে দেওয়া হয়।';
    if (reason === 'no_zero_price') return 'এই PDF-টির ZERO দাম এখনো ঠিক হয়নি।';
    if (reason === 'no_stars_price') return 'এই PDF-টির Stars দাম এখনো ঠিক হয়নি।';
    return 'দাবি করা যায়নি — আবার চেষ্টা করুন।';
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
      '<div><div class="earn-name">' + esc(p.name || 'ব্যবহারকারী') + '</div>' +
      '<div class="earn-level">লেভেল ' + bnNum(p.level || 1) + ' • মোট আয় ' + bnNum(fmtZero(p.lifetime_earned || 0)) + ' ZERO</div></div>' +
      '<div class="earn-balance-big">' + bnNum(fmtZero(earnBalance)) + ' ZERO</div>' +
      '</div>' +
      '<div class="earn-progress"><div class="earn-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="earn-stats">পরের লেভেলে ' + bnNum(p.xp || 0) + '/' + bnNum(p.xp_next || 50) + ' • ✅ ' + bnNum(p.tasks_completed || 0) + 'টি টাস্ক সম্পন্ন • 👥 ' + bnNum(p.referrals || 0) + ' জন রেফারেল</div>' +
      '<div class="earn-details">Telegram ID: ' + esc(String(tgUserId() || '')) + ' • জয়েন: ' + join + ' • রেফারেল থেকে আয়: ' + bnNum(fmtZero(p.referral_earnings || 0)) + ' ZERO</div>' +
      '<div class="earn-note">লেভেল শুধু মোট আয়ের হিসাব — এখনো কিছু আনলক করে না।</div>' +
      gatesChecklistHTML() +
      '<div class="earn-details">🔒 সিকিউরিটি — শীঘ্রই আসছে</div>' +
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
        '<div class="hist-amt ' + (done ? 'pos' : '') + '">' + (done ? 'হয়েছে ✓' : 'বাকি') + '</div></div>';
    }
    return '<div class="earn-group-title">📋 প্রোফাইল সম্পূর্ণ করুন — ' + bnNum(g.complete || 0) + '/' + bnNum(g.total || 6) + '</div>' +
      row(!!j.bazargoo, '@bazargoo287 চ্যানেলে জয়েন') +
      row(!!j.earnplaygame, '@earnplaygame21 চ্যানেলে জয়েন') +
      row(!!j.cryptoguru, '@cryptoguru_247 চ্যানেলে জয়েন') +
      row(!!j.adsterratt, '@adsterratt চ্যানেলে জয়েন') +
      row(!!g.react_done, 'পিন করা পোস্টে রিঅ্যাক্ট') +
      row(!!g.checkin_done, 'আজকের চেক-ইন') +
      '<div class="earn-note">স্পিন, লিডারবোর্ড পুরস্কার ও উইথড্র-এর জন্য ৪টি চ্যানেলে জয়েন লাগবে।</div>';
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
      '<div class="earn-levelbar-top"><span>⭐ লেভেল ' + bnNum(p.level || 1) + '</span>' +
      '<span>পরের লেভেলে ' + bnNum(left) + ' XP বাকি</span></div>' +
      '<div class="earn-progress"><div class="earn-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="earn-levelbar-sub">' + bnNum(p.xp || 0) + '/' + bnNum(p.xp_next || 50) + ' XP • মোট আয় ' + bnNum(fmtZero(p.lifetime_earned || 0)) + ' ZERO</div>' +
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
      var html = '<div class="streak-strip"><div class="streak-title">🔥 চেক-ইন স্ট্রিক: ' +
        bnNum(s.current || 0) + ' দিন • আজ +' + bnNum(s.today_reward || 1) + ' ZERO</div><div class="streak-days">';
      s.days.forEach(function (d) {
        var cls = 'streak-day' + (d.done ? ' done' : '') + (!d.done && !s.claimed_today && d.day === (s.current % 7) + 1 ? ' next' : '');
        html += '<div class="' + cls + '">' + (d.done ? '✓' : bnNum(d.day)) +
          '<span>দিন ' + bnNum(d.day) + '</span><b>+' + bnNum(d.reward) + '</b></div>';
      });
      html += '</div></div>';
      el.innerHTML = html;
      return;
    }
    el.hidden = false;
    var dr = earnDailyReward;
    var card = '<div class="daily-reward">' +
      '<div class="dr-head"><div class="dr-title">🎁 দৈনিক পুরস্কার</div>' +
      '<div class="dr-streak">🔥 ' + bnNum(dr.streak || 0) + ' দিনের স্ট্রিক</div></div>' +
      '<div class="dr-days">';
    dr.days.forEach(function (d) {
      var ticked = d.claimed || (d.is_today && dr.claimed_today);
      var cls = 'dr-day' + (ticked ? ' done' : '') + (d.is_today ? ' today' : '') + (d.day === 7 ? ' big' : '');
      card += '<div class="' + cls + '">' + (ticked ? '✓' : bnNum(d.day)) +
        '<span>দিন ' + bnNum(d.day) + '</span><b>+' + bnNum(d.reward) + '</b></div>';
    });
    card += '</div><div class="dr-foot">';
    if (dr.claimed_today) {
      card += '<div class="dr-done">সংগ্রহ করা হয়েছে ✓ — আগামীকাল আবার আসো</div>' +
        '<div class="dr-countdown">পরেরটি <span data-cd-ms="' + (dr.next_in_ms || 0) + '">' + fmtCooldown(dr.next_in_ms) + '</span> পর</div>';
    } else {
      card += '<button class="btn-primary pdf-btn" type="button" data-claim="checkin"' + (earnDeviceConflict ? ' disabled' : '') + '>✅ চেক-ইন করুন — +' + bnNum(dr.today_reward || 1) + ' ZERO</button>' +
        '<div class="dr-note">আজকের পুরস্কার +' + bnNum(dr.today_reward || 1) + ' ZERO — প্রতিদিন চেক-ইন করলে পুরস্কার বাড়বে।</div>';
    }
    card += '</div></div>';
    el.innerHTML = card;
    var btn = el.querySelector('[data-claim="checkin"]');
    if (btn) btn.addEventListener('click', function () { claimTask('checkin'); });
  }
  function taskCardHTML(t) {
    var doneLabel = (t.id.indexOf('join_') === 0) ? 'হয়ে গেছে ✓' : 'আজ হয়েছে ✓';
    // v26: sponsor tasks pay in ZERO or GRAM — show the right currency.
    var cur = (t.reward_currency || 'ZERO');
    var html = '<article class="pdf-card">' +
      '<div class="pdf-title">' + esc(t.title) + '</div>' +
      (t.group === 'sponsor' ? '<div class="pdf-desc">🏷️ স্পন্সর</div>' : '') +
      (t.desc ? '<div class="pdf-desc">' + esc(t.desc) + '</div>' : '') +
      '<div class="pdf-price-row"><span class="pdf-price">+' + t.reward + ' ' + cur + '</span></div>';
    if (t.id === 'quiz' && !t.done && t.questions) {
      t.questions.forEach(function (q, qi) {
        html += '<div class="quiz-q"><p>' + esc(q.q) + '</p>';
        q.options.forEach(function (opt, oi) {
          html += '<label class="quiz-opt"><input type="radio" name="quiz-' + qi + '" value="' + oi + '"> ' + esc(opt) + '</label>';
        });
        html += '</div>';
      });
      html += '<button class="btn-primary pdf-btn" type="button" data-quiz-submit>উত্তর জমা দিন</button>';
    } else if (t.id === 'referral') {
      html += '<button class="btn-secondary pdf-btn" type="button" data-ref-share>🔗 রেফারেল লিংক কপি করুন</button>';
      var rb = (typeof earnProfile !== 'undefined' && earnProfile && earnProfile.referrals_by_level) || null;
      html += '<div class="task-status">আপনার রেফারেল — লেভেল ১: ' + bnNum(rb ? rb.l1 : 0) + ' জন • লেভেল ২: ' + bnNum(rb ? rb.l2 : 0) + ' জন • লেভেল ৩: ' + bnNum(rb ? rb.l3 : 0) + ' জন</div>';
    } else if (t.id === 'ad') {
      html += '<a class="btn-primary pdf-btn" href="' + WORKER_URL + '/go?ad=zerads&user_id=' + encodeURIComponent(tgUserId()) + '" target="_blank" rel="noopener">👁️ বিজ্ঞাপন দেখুন</a>';
      html += '<button class="btn-secondary pdf-btn" type="button" data-claim="ad"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : 'দাবি করুন') + '</button>';
      if (t.done) {
        html += '<div class="task-status done">আজকের ৫ বার শেষ ✓ — আবার <span data-cd-ms="' + (t.resets_in_ms || 0) + '">' + fmtCooldown(t.resets_in_ms) + '</span> পর</div>';
      } else {
        var left = (typeof t.claims_left_today === 'number') ? t.claims_left_today : 5;
        html += '<div class="task-status">আজ আরও ' + bnNum(left) + ' বার • দিনে ৫ বার পর্যন্ত</div>';
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
        html += '<button class="btn-secondary pdf-btn" type="button" disabled>📺 অ্যাড দেখুন (Monetag)</button>';
        html += '<div class="task-status">শীঘ্রই আসছে — Monetag ড্যাশবোর্ড সেটআপের অপেক্ষায়</div>';
      } else if (t.done) {
        html += '<button class="btn-secondary pdf-btn" type="button" disabled>আজকের ৫ বার শেষ ✓</button>';
        html += '<div class="task-status done">আজকের ৫ বার শেষ ✓ — আবার <span data-cd-ms="' + (t.resets_in_ms || 0) + '">' + fmtCooldown(t.resets_in_ms) + '</span> পর</div>';
      } else if (mtgCd > 0) {
        html += '<button class="btn-secondary pdf-btn" type="button" disabled>📺 অ্যাড দেখুন</button>';
        html += '<div class="task-status">পরের অ্যাড <span data-cd-ms="' + mtgCd + '">' + fmtCooldown(mtgCd) + '</span> পর • আজ আরও ' + bnNum(mtgLeft) + ' বার</div>';
      } else {
        html += '<button class="btn-primary pdf-btn" type="button" data-monetag-watch>📺 অ্যাড দেখুন — +১ ZERO</button>';
        html += '<div class="task-status">আজ আরও ' + bnNum(mtgLeft) + ' বার • দিনে ৫ বার পর্যন্ত • বিজ্ঞাপন পুরো দেখলে পুরস্কার</div>';
      }
    } else if (t.id === 'react_daily') {
      html += '<a class="btn-secondary pdf-btn" href="https://t.me/bazargoo287/83" target="_blank" rel="noopener">❤️ পিন করা পোস্ট খুলুন</a>';
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="react_daily"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : 'দাবি করুন') + '</button>';
      if (t.done) {
        html += '<div class="task-status done">সম্পন্ন ✓' + (t.resets_in_ms ? ' — আবার <span data-cd-ms="' + t.resets_in_ms + '">' + fmtCooldown(t.resets_in_ms) + '</span> পর' : '') + '</div>';
      }
    } else if (t.id === 'video_daily') {
      html += '<video class="earn-video" src="videos/bot-tutorial.mp4" controls playsinline preload="metadata" data-video-player></video>';
      html += '<div class="video-note">ভিডিওটি পুরো দেখলে দাবি বোতাম চালু হবে।</div>';
      if (t.done) {
        html += '<button class="btn-secondary pdf-btn" type="button" disabled>আবার <span data-cd-ms="' + (t.available_in_ms || 0) + '">' + fmtCooldown(t.available_in_ms) + '</span> পর</button>';
        html += '<div class="task-status">আবার <span data-cd-ms="' + (t.available_in_ms || 0) + '">' + fmtCooldown(t.available_in_ms) + '</span> পর করা যাবে</div>';
      } else {
        html += '<button class="btn-primary pdf-btn" type="button" data-claim="video_daily" data-video-claim disabled>ভিডিও শেষ হলে দাবি করুন</button>';
        html += '<div class="task-status">২৪ ঘণ্টায় ১ বার</div>';
      }
    } else if (t.id.indexOf('visit_') === 0) {
      // v22: daily visit task — "দেখুন" opens the Page/channel
      // (openLink / openTelegramLink via openBrowserUrl), and Claim
      // stays disabled until it was opened this session. The worker
      // enforces the 24h cooldown; it cannot verify the user
      // actually looked at the Page or the last post.
      var isChan = t.id.indexOf('visit_chan_') === 0;
      var opened = !!visitOpened[t.id];
      html += '<button class="btn-secondary pdf-btn" type="button" data-visit-open="' + esc(t.id) + '">' + (opened ? '👁️ খোলা হয়েছে ✓' : '👁️ দেখুন') + '</button>';
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + ((t.done || !opened) ? ' disabled' : '') + '>' + (t.done ? doneLabel : '✅ দাবি করুন') + '</button>';
      if (isChan) html += '<div class="task-status">জয়েন যাচাই করা হবে ✓ • শেষ পোস্টটি উপরে দেখতে পাবে</div>';
      if (isChan && visitNotJoined[t.id] && !t.done) {
        html += '<div class="task-status">প্রথমে চ্যানেলে জয়েন করো</div>';
        html += '<button class="btn-secondary pdf-btn" type="button" data-visit-join="' + esc(t.id) + '">✈️ চ্যানেলে জয়েন করুন</button>';
      }
      if (t.done) {
        html += '<div class="task-status done">আজ হয়েছে ✓' + (t.available_in_ms ? ' — আবার <span data-cd-ms="' + t.available_in_ms + '">' + fmtCooldown(t.available_in_ms) + '</span> পর' : '') + '</div>';
      } else if (!opened) {
        html += '<div class="task-status">প্রথমে পেইজ/চ্যানেলটি খুলুন, তারপর দাবি করুন</div>';
      }
    } else if (t.id.indexOf('sponsor_') === 0) {
      // v26: sponsor task (an approved promotion). "দেখুন" opens the
      // target and stamps the 15s dwell start (/sponsor-start); Claim
      // stays disabled until opened this session. Our own channels
      // are verified by the bot (getChatMember); other follows are
      // NOT verifiable — the timer only stops instant abuse, and the
      // app says so honestly.
      var sOpened = !!sponsorOpened[t.id];
      html += '<button class="btn-secondary pdf-btn" type="button" data-sponsor-open="' + esc(t.id) + '">' + (sOpened ? '👁️ খোলা হয়েছে ✓' : '👁️ দেখুন') + '</button>';
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + ((t.done || !sOpened) ? ' disabled' : '') + '>' + (t.done ? doneLabel : '✅ দাবি করুন') + '</button>';
      html += '<div class="task-status">বাকি ' + bnNum(t.remaining || 0) + 'টি • বাইরের ফলো/সাবস্ক্রাইব যাচাই করা যায় না — ১৫ সেকেন্ড দেখার পর দাবি করুন</div>';
      if (sponsorNotJoined[t.id] && !t.done) {
        html += '<div class="task-status">প্রথমে চ্যানেলে জয়েন করো</div>';
      }
      if (t.done) html += '<div class="task-status done">সম্পন্ন ✓</div>';
    } else if (t.id.indexOf('join_') === 0) {
      var ch = { join_bazargoo: 'bazargoo287', join_earnplaygame: 'earnplaygame21', join_cryptoguru: 'cryptoguru_247', join_adsterratt: 'adsterratt' }[t.id];
      html += '<a class="btn-secondary pdf-btn" href="https://t.me/' + ch + '" target="_blank" rel="noopener">চ্যানেলে জয়েন করুন</a>';
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : 'যাচাই করুন') + '</button>';
      if (t.done) html += '<div class="task-status done">সম্পন্ন ✓</div>';
    } else {
      html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : 'দাবি করুন') + '</button>';
      if (t.done) html += '<div class="task-status done">সম্পন্ন ✓' + (t.resets_in_ms ? ' — আবার <span data-cd-ms="' + t.resets_in_ms + '">' + fmtCooldown(t.resets_in_ms) + '</span> পর' : '') + '</div>';
    }
    html += '</article>';
    return html;
  }
  function renderTasks() {
    var sec = $('earnSection');
    if (!sec) return;
    sec.hidden = false;
    $('earnBalance').textContent = 'আপনার ZERO: ' + bnNum(fmtZero(earnBalance));
    var dn = $('earnDeviceNote');
    if (dn) {
      if (earnDeviceConflict) {
        dn.hidden = false;
        dn.textContent = 'এই মোবাইলে already একটা অ্যাকাউন্ট আছে — এই অ্যাকাউন্ট দিয়ে টাস্কের আয় করা যাবে না। দোকান ও PDF কেনা চলবে।';
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
      { title: '🎁 দৈনিক', ids: ['quiz'] },
      { title: '👥 কমিউনিটি', ids: ['join_bazargoo', 'join_earnplaygame', 'join_cryptoguru', 'join_adsterratt', 'react_daily'], community: true },
      { title: '🌐 ভিজিট করুন', ids: VISIT_PAGE_IDS.concat(VISIT_CHAN_IDS), visit: true },
      { title: '📺 দেখুন ও আয় করুন', ids: ['ad', 'ad_monetag', 'video_daily'] },
      { title: '📢 স্পন্সর', ids: sponsorIds, sponsor: true },
      { title: '🔗 রেফারেল', ids: ['referral'] },
    ];
    var html = '<div class="earn-group-title">📢 আপনার পেইজ/চ্যানেল প্রমোট করুন</div>' +
      '<article class="pdf-card"><div class="pdf-desc">আপনার Facebook পেইজ, YouTube চ্যানেল বা যেকোনো লিংক এই অ্যাপের ইউজারদের কাছে পৌঁছে দিন — তারা কাজটি করলে পুরস্কার পাবে।</div>' +
      '<button class="btn-primary pdf-btn" type="button" data-promote-open>📢 Promote করুন</button></article>';
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
          html += '<div class="earn-group-title">🌐 ভিজিট করুন — আজ ' + bnNum(doneCount) + '/' + bnNum(g.ids.length) + ' সম্পন্ন</div>';
          if (hasPage) html += '<div class="earn-group-title earn-sub">📘 ফেসবুক পেইজ</div>' + cards;
          if (hasChan) html += '<div class="earn-group-title earn-sub">✈️ টেলিগ্রাম চ্যানেল</div>' + chanCards;
        }
        return;
      }
      var cards = '';
      g.ids.forEach(function (id) { if (byId[id]) cards += taskCardHTML(byId[id]); });
      if (cards) {
        var title = g.title;
        if (g.community && earnCommunity) {
          title = '👥 কমিউনিটি — আজ ' + bnNum(earnCommunity.done || 0) + '/' + bnNum(earnCommunity.total || 0) + ' সম্পন্ন';
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
        b.textContent = '👁️ খোলা হয়েছে ✓';
        var card = b.closest ? b.closest('article') : null;
        var claimBtn = card ? card.querySelector('[data-claim]') : null;
        if (claimBtn && !earnDeviceConflict) { claimBtn.disabled = false; claimBtn.textContent = '✅ দাবি করুন'; }
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
        b.textContent = '👁️ খোলা হয়েছে ✓';
        var card = b.closest ? b.closest('article') : null;
        var claimBtn = card ? card.querySelector('[data-claim]') : null;
        if (claimBtn && !earnDeviceConflict) { claimBtn.disabled = false; claimBtn.textContent = '✅ দাবি করুন'; }
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
          btn.textContent = 'দাবি করুন';
          if (note) note.textContent = 'ভিডিও দেখা শেষ ✓ — এখন দাবি করুন।';
        });
      }
      v.addEventListener('error', function () {
        if (note) note.textContent = 'ভিডিওটি লোড হয়নি — ইন্টারনেট চেক করে আবার খুলুন।';
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
            showEarnAlert('আরও ' + bnNum(wait) + ' সেকেন্ড দেখে তারপর দাবি করুন।');
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
      showEarnAlert('Monetag বিজ্ঞাপন এখনো চালু হয়নি — ড্যাশবোর্ড সেটআপ বাকি আছে।');
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
          showEarnAlert(claimErrorText(start.reason) || 'এখন বিজ্ঞাপন দেখা যাবে না।');
          loadTasks();
          return;
        }
        return loadMonetagSdk().then(function (ready) {
          if (!ready) {
            monetagBusy = false;
            showEarnAlert('বিজ্ঞাপন লোড হয়নি — একটু পরে আবার চেষ্টা করো।');
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
                    if (data.ok) { earnBalance = data.balance; haptic('medium'); showEarnAlert('🎉 +১ ZERO যোগ হয়েছে!'); }
                    else if (data.reason === 'already_credited') { showEarnAlert('এই বিজ্ঞাপনের পুরস্কার already দেওয়া হয়েছে ✓'); }
                    else showEarnAlert(claimErrorText(data.reason) || 'পুরস্কার দেওয়া যায়নি।');
                    loadTasks();
                  })
                  .catch(function () { loadTasks(); });
              }
              showEarnAlert('এই বিজ্ঞাপন থেকে আয় হয়নি — আবার চেষ্টা করো।');
              loadTasks();
            })
            .catch(function (err) {
              monetagBusy = false;
              var msg = (err && err.message) || '';
              showEarnAlert(msg === 'Empty feed' ? 'এখন কোনো বিজ্ঞাপন নেই — একটু পরে আবার চেষ্টা করো।' : 'বিজ্ঞাপন দেখানো যায়নি — আবার চেষ্টা করো।');
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
      if (!sel) { showEarnAlert('সব প্রশ্নের উত্তর দিন।'); return; }
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
      if (m === 'checkin_today') out.push('আজকের চেক-ইন বাকি');
      else if (m === 'device_conflict') out.push('এই মোবাইলে already একটা অ্যাকাউন্ট আছে');
      else if (m.indexOf('joins:') === 0) {
        var p = m.split(':')[1].split('/');
        out.push('৪টি চ্যানেলে জয়েন বাকি (' + bnNum(p[0]) + '/৪) — প্রোফাইলে চেকলিস্ট দেখুন');
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
      ? 'এই মাসের বোনাস পাওয়া গেছে ✓'
      : 'এই মাসে ' + bnNum(count) + '/' + bnNum(target) + ' চেক-ইন — ' + bnNum(target) + ' হলেই ' + bnNum(m.reward || 50) + ' ZERO';
    el.innerHTML = '<div class="streak-strip"><div class="streak-title">📅 মাসিক চেক-ইন বোনাস: ' +
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
      return p.prize === 'extra' ? '+১ ফ্রি স্পিন — ' + bnNum(fmtZero(p.chance)) + '%' : bnNum(p.prize) + ' ZERO — ' + bnNum(fmtZero(p.chance)) + '%';
    }).join(' • ');
    var slots = t.slots || { total: 4, monetag: 2, adsgram: 2, extra: 0, base_left: 4 };
    var btnHtml, statusHtml;
    if (t.done) {
      btnHtml = '<button class="btn-secondary pdf-btn" type="button" disabled>আজকের স্পিন শেষ ✓ — আগামীকাল আবার</button>';
      statusHtml = '<div class="task-status done">আজ ' + bnNum(t.spins_today || 0) + ' বার ঘোরানো হয়েছে ✓</div>';
    } else if (t.locked) {
      btnHtml = '<button class="btn-secondary pdf-btn" type="button" disabled>🎡 স্পিন করুন</button>';
      statusHtml = '<div class="task-status">আনলক করতে বাকি:<br>• ' + spinMissingText(t.missing).map(esc).join('<br>• ') + '</div>';
    } else {
      btnHtml =
        '<button class="btn-primary pdf-btn" type="button" data-spin="monetag"' + (slots.monetag <= 0 && slots.extra <= 0 ? ' disabled' : '') + '>🎡 Monetag দিয়ে ঘোরান' + (slots.monetag > 0 ? ' — ' + bnNum(slots.monetag) + ' বার বাকি' : '') + '</button>' +
        '<button class="btn-primary pdf-btn" type="button" data-spin="adsgram"' + (slots.adsgram <= 0 && slots.extra <= 0 ? ' disabled' : '') + '>🎡 AdsGram দিয়ে ঘোরান' + (slots.adsgram > 0 ? ' — ' + bnNum(slots.adsgram) + ' বার বাকি' : '') + '</button>';
      statusHtml = '<div class="task-status">দিনে ৪ বার (২ Monetag + ২ AdsGram) — প্রতিটা পুরস্কার পেতে ১টি অ্যাড দেখুন। পুরস্কার সার্ভারেই ঠিক হয়।</div>';
    }
    var labels = '';
    SPIN_SEGMENTS.forEach(function (p, i) {
      labels += '<div class="spin-label" style="transform: rotate(' + (i * 60 + 30) + 'deg)"><span>' + bnNum(p) + '</span></div>';
    });
    var resultHtml = (t.done && lastSpinPrize !== null)
      ? '<div class="spin-result">' + (lastSpinPrize === 'extra' ? '🎉 +১ ফ্রি স্পিন পেয়েছেন!' : '🎉 আজ জিতেছেন ' + bnNum(fmtZero(lastSpinPrize)) + ' ZERO') + '</div>'
      : '<div class="spin-result" id="spinResult" hidden></div>';
    box.innerHTML =
      '<article class="pdf-card"><div class="pdf-title">🎡 Lucky Spin</div>' +
      '<div class="pdf-desc">সম্পূর্ণ ফ্রি — দিনে ৪ বার (২ Monetag + ২ AdsGram)। শর্ত: আজকের চেক-ইন + ৪ চ্যানেলে জয়েন। প্রতিটা পুরস্কার পেতে ১টি অ্যাড দেখুন।</div>' +
      '<div class="spin-wrap"><div class="spin-pointer">▼</div><div class="spin-wheel" id="spinWheel">' + labels + '<div class="spin-hub">🎡</div></div></div>' +
      btnHtml + statusHtml +
      '<div class="task-status">পুরস্কার: ' + esc(tierLine) + '</div>' +
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
          ? '🎉 অভিনন্দন! +১ ফ্রি স্পিন পেয়েছেন — আবার ঘোরান!'
          : '🎉 অভিনন্দন! আপনি জিতেছেন ' + bnNum(fmtZero(prize)) + ' ZERO';
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
      showEarnAlert('Monetag বিজ্ঞাপন এখনো চালু হয়নি — ড্যাশবোর্ড সেটআপ বাকি আছে। স্পিন নষ্ট হয়নি।');
      return;
    }
    loadMonetagSdk().then(function (ready) {
      if (!ready) {
        spinning = false;
        showEarnAlert('বিজ্ঞাপন লোড হয়নি — একটু পরে আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।');
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
                else if (data.reason === 'already_credited') { spinning = false; showEarnAlert('এই বিজ্ঞাপনের পুরস্কার already দেওয়া হয়েছে ✓'); loadTasks(); }
                else { spinning = false; showEarnAlert(claimErrorText(data.reason) || 'পুরস্কার দেওয়া যায়নি।'); loadTasks(); }
              })
              .catch(function () { spinning = false; loadTasks(); });
          }
          spinning = false;
          showEarnAlert('এই বিজ্ঞাপন থেকে পুরস্কার হয়নি — আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।');
          loadTasks();
        })
        .catch(function (err) {
          spinning = false;
          var msg = (err && err.message) || '';
          showEarnAlert(msg === 'Empty feed' ? 'এখন কোনো বিজ্ঞাপন নেই — একটু পরে আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।' : 'বিজ্ঞাপন দেখানো যায়নি — আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।');
          loadTasks();
        });
    });
  }
  function spinWatchAdsgram(start, uid, user) {
    if (!ADSGRAM_BLOCK_ID) {
      spinning = false;
      showEarnAlert('AdsGram বিজ্ঞাপন এখনো চালু হয়নি — ড্যাশবোর্ড সেটআপ বাকি আছে। স্পিন নষ্ট হয়নি।');
      return;
    }
    loadAdsgramSdk().then(function (ready) {
      if (!ready) {
        spinning = false;
        showEarnAlert('বিজ্ঞাপন লোড হয়নি — একটু পরে আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।');
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
            else { spinning = false; showEarnAlert(claimErrorText(data.reason) || 'পুরস্কার দেওয়া যায়নি।'); loadTasks(); }
          })
          .catch(function () { spinning = false; loadTasks(); });
      }).catch(function () {
        spinning = false;
        showEarnAlert('বিজ্ঞাপন শেষ না হলে পুরস্কার হয় না — আবার চেষ্টা করো। স্পিন নষ্ট হয়নি।');
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
    fetch(WORKER_URL + '/leaderboard?user_id=' + encodeURIComponent(uid))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        box.hidden = false;
        var medal = ['🥇', '🥈', '🥉'];
        var html = '<div class="earn-group-title">🏆 লিডারবোর্ড — এই সপ্তাহ (' + esc(String(data.week || '')) + ')</div>';
        var top = Array.isArray(data.top10) ? data.top10 : [];
        if (!top.length) {
          html += '<div class="pdf-note">এই সপ্তাহে এখনো কেউ আয় করেনি — টাস্ক করে প্রথম হোন!</div>';
        } else {
          top.forEach(function (r) {
            var me = r.user_id === uid;
            html += '<div class="hist-row' + (me ? ' lb-me' : '') + '"><div><div class="hist-title">' +
              (medal[r.rank - 1] || ('#' + bnNum(r.rank))) + ' ' + esc(r.name || 'বন্ধু') +
              (me ? ' (আপনি)' : '') + ' • লেভেল ' + bnNum(r.level || 1) + '</div>' +
              '<div class="hist-date">এই সপ্তাহের আয়</div></div>' +
              '<div class="hist-amt pos">+' + bnNum(fmtZero(r.weekly_earned || 0)) + ' ZERO</div></div>';
          });
        }
        if (data.my_rank) {
          html += '<div class="task-status">আপনার র‍্যাঙ্ক: #' + bnNum(data.my_rank) + ' • এই সপ্তাহে ' + bnNum(fmtZero(data.my_weekly_earned || 0)) + ' ZERO</div>';
        } else {
          html += '<div class="task-status">আপনি এখনো এই সপ্তাহের তালিকায় নেই — টাস্ক করলেই র‍্যাঙ্ক আসবে।</div>';
        }
        var last = Array.isArray(data.last_week_top3) ? data.last_week_top3 : [];
        if (last.length) {
          html += '<div class="earn-group-title">গত সপ্তাহের সেরা ৩ (' + esc(String(data.last_week || '')) + ')</div>';
          last.forEach(function (r) {
            html += '<div class="hist-row"><div><div class="hist-title">' +
              (medal[r.rank - 1] || ('#' + bnNum(r.rank))) + ' ' + esc(r.name || 'বন্ধু') +
              '</div><div class="hist-date">গত সপ্তাহের আয়</div></div>' +
              '<div class="hist-amt pos">+' + bnNum(fmtZero(r.weekly_earned || 0)) + ' ZERO</div></div>';
          });
        }
        if (data.prize_claimable) {
          html += '<button class="btn-primary pdf-btn" type="button" data-lb-claim>🏆 পুরস্কার দাবি করুন — ' + bnNum(data.my_prize || 0) + ' ZERO</button>';
        } else if (data.prize_claimed) {
          html += '<div class="task-status done">গত সপ্তাহের পুরস্কার নেওয়া হয়েছে ✓</div>';
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
          showEarnAlert('🏆 অভিনন্দন! গত সপ্তাহে #' + bnNum(data.rank) + ' — ' + bnNum(fmtZero(data.credited)) + ' ZERO পুরস্কার পেয়েছেন!');
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
      '<div><div class="earn-name">৫% ছাড়ের কুপন</div>' +
      '<div class="earn-level">১০০ ZERO = একবারের ৫% ছাড় — BAZAR5-এর সাথে চলবে না</div></div>' +
      '<div class="earn-balance-big">১০০ ZERO</div></div>' +
      '<div class="wallet-actions">' +
      '<button class="btn-primary" type="button" data-buy-coupon>🎟️ কুপন কিনুন — ১০০ ZERO</button>' +
      '</div>' +
      '<div class="task-status">কেনার পর কোডটি নিচে দেখাবে — চেকআউটে কোডটি লিখলেই ৫% ছাড়।</div>';
    var bb = card.querySelector('[data-buy-coupon]');
    if (bb) bb.addEventListener('click', buyCoupon);
    fetch(WORKER_URL + '/coupons?user_id=' + encodeURIComponent(uid))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var cs = Array.isArray(data.coupons) ? data.coupons : [];
        if (empty) empty.hidden = cs.length > 0;
        if (!list) return;
        if (!cs.length) { list.innerHTML = ''; return; }
        list.innerHTML = cs.map(function (c) {
          return '<article class="pdf-card"><div class="pdf-title">' + esc(c.code) + '</div>' +
            '<div class="pdf-desc">' + (c.used ? 'ব্যবহার করা হয়েছে ✓' : 'ব্যবহার করা হয়নি — চেকআউটে ব্যবহার করুন') + '</div>' +
            (c.used ? '' : '<button class="btn-secondary pdf-btn" type="button" data-copy-coupon="' + esc(c.code) + '">📋 কোড কপি করুন</button>') +
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
          showEarnAlert('🎟️ কুপন কেনা হয়েছে! কোড: ' + data.code);
          loadTasks();
          renderCoupons();
        } else if (data.reason === 'insufficient_balance') {
          showEarnAlert('ZERO যথেষ্ট নয় — কুপনের দাম ১০০ ZERO (আপনার ব্যালেন্স ' + bnNum(fmtZero(data.balance || earnBalance)) + ' ZERO)।');
        } else {
          showEarnAlert('কুপন কেনা যায়নি — আবার চেষ্টা করুন।');
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
    fetch(WORKER_URL + '/referral-contest?user_id=' + encodeURIComponent(uid))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        box.hidden = false;
        var medal = ['🥇', '🥈', '🥉'];
        var html = '<div class="pdf-note">এই মাসে (' + esc(String(data.month || '')) + ') সবচেয়ে বেশি বন্ধু আনা ৫ জন — গত মাসের বিজয়ী পাবে নিজের পছন্দের ১টি PDF ফ্রি।</div>';
        var top = Array.isArray(data.top5) ? data.top5 : [];
        if (!top.length) {
          html += '<div class="pdf-note">এই মাসে এখনো কেউ রেফারেল করেনি — লিংক শেয়ার করে প্রথম হোন!</div>';
        } else {
          top.forEach(function (r) {
            var me = r.user_id === uid;
            html += '<div class="hist-row' + (me ? ' lb-me' : '') + '"><div><div class="hist-title">' +
              (medal[r.rank - 1] || ('#' + bnNum(r.rank))) + ' ' + esc(r.name || 'বন্ধু') + (me ? ' (আপনি)' : '') +
              '</div><div class="hist-date">সরাসরি রেফারেল</div></div>' +
              '<div class="hist-amt pos">' + bnNum(r.referrals || 0) + ' জন</div></div>';
          });
        }
        html += '<div class="task-status">আপনার এই মাসের রেফারেল: ' + bnNum(data.my_referrals || 0) + ' জন</div>';
        var w = data.last_month && data.last_month.winner;
        if (w) {
          html += '<div class="task-status">গত মাসের বিজয়ী (' + esc(String(data.last_month.month || '')) + '): ' + esc(w.name || 'বন্ধু') + ' — ' + bnNum(w.referrals || 0) + ' জন রেফারেল</div>';
        }
        if (data.am_i_winner && !data.prize_claimed) {
          var paid = pdfs.filter(function (p) { return !p.free; });
          html += '<div class="pdf-note">🎉 অভিনন্দন — আপনি গত মাসের বিজয়ী! আপনার পছন্দের ১টি PDF ফ্রি নিন:</div>';
          if (!paid.length) {
            html += '<div class="pdf-note">PDF তালিকা লোড হচ্ছে…</div>';
            // Catalog may not have loaded yet — fetch it once and re-render.
            if (!contestPdfRetried) {
              contestPdfRetried = true;
              loadPdfs().then(function () { renderContest(); });
            }
          } else {
            html += '<select id="contestPdfSelect" class="contest-select">' +
              paid.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.title) + '</option>'; }).join('') +
              '</select>' +
              '<button class="btn-primary pdf-btn" type="button" data-contest-claim>🎁 এই PDF-টি ফ্রি নিন</button>';
          }
        } else if (data.am_i_winner && data.prize_claimed) {
          html += '<div class="task-status done">আপনার পুরস্কার নেওয়া হয়েছে ✓ — বটের চ্যাটে PDF দেখুন।</div>';
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
          showEarnAlert('PDF পাঠানো হয়েছে — বট চেক করো 🎁');
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
    var text = 'BazarGoo-তে জয়েন করুন — টাস্ক করে ZERO জমিয়ে PDF রিডিম করুন! 🛍️';
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
    fetch(WORKER_URL + '/referrals?user_id=' + encodeURIComponent(uid))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        friendLoaded = true;
        $('friendTotal').textContent = 'রেফারেল থেকে মোট আয়: ' + bnNum(fmtZero(data.referral_earnings || 0)) + ' ZERO';
        var list = $('friendList');
        var refs = Array.isArray(data.referrals) ? data.referrals : [];
        $('friendEmpty').hidden = refs.length > 0;
        if (!refs.length) { list.innerHTML = ''; return; }
        var html = '';
        refs.forEach(function (r) {
          html += '<article class="pdf-card">' +
            '<div class="pdf-title">' + esc(r.name || 'বন্ধু') + '</div>' +
            '<div class="pdf-desc">লেভেল ' + bnNum(r.level || 1) +
            (r.joined ? ' • জয়েন: ' + bnNum(String(r.joined)) : '') + '</div>' +
            '<div class="pdf-price-row"><span class="pdf-price">' + bnNum(fmtZero(r.lifetime || 0)) + ' ZERO আয় করেছে</span></div>' +
            '</article>';
        });
        list.innerHTML = html;
      })
      .catch(function () {});
    renderContest();
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
    fetch(WORKER_URL + '/wallet?user_id=' + encodeURIComponent(uid))
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
    if (!earnProfile) { el.innerHTML = ''; return; }
    var sec = $('profileSection');
    if (sec) sec.hidden = false;
    var w = (walletState && walletState.balance) ? walletState.balance : { zero: 0, gram: 0, stars: 0 };
    var earned = walletState ? (walletState.earned_zero || 0) : earnBalance;
    el.innerHTML =
      '<div class="earn-profile-top">' +
      '<div class="earn-avatar">👛</div>' +
      '<div><div class="earn-name">ZERO ওয়ালেট</div>' +
      '<div class="earn-level">আয়: ' + bnNum(fmtZero(earned)) + ' ZERO • Wallet: ' + bnNum(fmtZero(w.zero)) + ' ZERO • ' + bnNum(fmtZero(w.gram)) + ' GRAM • ' + bnNum(fmtZero(w.stars)) + ' Stars</div></div>' +
      '<div class="earn-balance-big">' + bnNum(fmtZero(earnBalance)) + ' ZERO</div>' +
      '</div>' +
      '<div class="wallet-actions">' +
      '<button class="btn-primary" type="button" data-wallet-open>⬆️ উইথড্র / ⬇️ ডিপোজিট</button>' +
      '<button class="btn-primary" type="button" data-wallet-shop>🛍️ দোকান দেখুন</button>' +
      '<button class="btn-primary" type="button" data-wallet-pdf>📚 PDF কিনুন</button>' +
      '</div>' +
      '<div class="earn-note">Wallet-এ জমা দিয়ে কিনতে পারেন, আবার যেকোনো সময় তুলতেও পারেন — জমা করা বাধ্যতামূলক নয়, সরাসরি পেমেন্ট সবসময় আছে। ZERO তুলতে কোনো ফি বা সর্বনিম্ন সীমা নেই। GRAM তোলা ম্যানুয়াল — অ্যাডমিন পাঠিয়ে txid জানিয়ে দেন।</div>';
    var openBtn = el.querySelector('[data-wallet-open]');
    if (openBtn) openBtn.onclick = function () { openWalletSheet(); };
    var shopBtn = el.querySelector('[data-wallet-shop]');
    if (shopBtn) shopBtn.onclick = function () { setActiveNav('shop'); scrollToEl($('chips')); };
    var pdfBtn = el.querySelector('[data-wallet-pdf]');
    if (pdfBtn) pdfBtn.onclick = function () { setActiveNav('mypdf'); scrollToEl($('myPdfSection')); };
  }
  function walletSheetHtml() {
    var w = (walletState && walletState.balance) ? walletState.balance : { zero: 0, gram: 0, stars: 0 };
    var earned = walletState ? (walletState.earned_zero || 0) : earnBalance;
    var gramNote = (walletState && walletState.gram_configured)
      ? ''
      : '<div class="pdf-note">GRAM পেমেন্ট/তোলা এখনো চালু হয়নি — অ্যাডমিন সেটআপ বাকি আছে।</div>';
    return '<p><strong>আয়:</strong> ' + bnNum(fmtZero(earned)) + ' ZERO &nbsp;•&nbsp; <strong>Wallet:</strong> ' +
      bnNum(fmtZero(w.zero)) + ' ZERO • ' + bnNum(fmtZero(w.gram)) + ' GRAM • ' + bnNum(fmtZero(w.stars)) + ' Stars</p>' +
      '<h3>⬇️ ডিপোজিট</h3>' +
      '<div class="form-row"><label>মুদ্রা <select id="depCurrency"><option value="stars">⭐ Stars</option><option value="zero">⛓️ ZERO</option><option value="gram">💎 GRAM</option></select></label>' +
      '<label>পরিমাণ <input id="depAmount" type="number" min="1" step="any" placeholder="১০"></label></div>' +
      '<button class="btn-primary btn-block" type="button" id="depStartBtn">ডিপোজিট শুরু করুন</button>' +
      '<div id="depPayBox"></div>' +
      '<h3>⬆️ উইথড্র</h3>' +
      '<div class="form-row"><label>মুদ্রা <select id="wdCurrency"><option value="zero">⛓️ ZERO</option><option value="gram">💎 GRAM</option></select></label>' +
      '<label>পরিমাণ <input id="wdAmount" type="number" min="0" step="any" placeholder="১"></label></div>' +
      '<label>আপনার ঠিকানা <input id="wdAddress" type="text" placeholder="ZERO হলে t1… / GRAM হলে EQ…/UQ…"></label>' +
      '<div class="form-row"><label>ধরন <select id="wdMode"><option value="instant">⚡ এখনই তুলুন</option><option value="save">💾 Wallet-এ জমা রাখুন</option></select></label></div>' +
      '<button class="btn-primary btn-block" type="button" id="wdBtn">তোলার অনুরোধ পাঠান</button>' +
      '<div id="wdMsg"></div>' +
      '<div class="pdf-note">ZERO তুলতে কোনো ফি বা সর্বনিম্ন সীমা নেই — ১ ZERO-ও তোলা যায়, যেকোনো সময়। দিনে সর্বোচ্চ ১,০০০ ZERO। ৫০০ ZERO-র বেশি হলে অ্যাডমিনের অনুমোদন লাগবে। GRAM: সর্বনিম্ন ০.৫, দিনে সর্বোচ্চ ৫ (ফান্ডের ২০%-এর বেশি নয়), ২ GRAM-এর বেশি হলে অনুমোদন লাগবে। Stars তোলা যায় না।</div>' +
      '<h3>📍 আমার ঠিকানা সংরক্ষণ</h3>' +
      '<div class="form-row"><label>মুদ্রা <select id="addrCurrency"><option value="zero">⛓️ ZERO</option><option value="gram">💎 GRAM</option></select></label>' +
      '<label>ঠিকানা <input id="addrValue" type="text" placeholder="t1… / EQ…"></label></div>' +
      '<button class="btn-secondary btn-block" type="button" id="addrSaveBtn">ঠিকানা সংরক্ষণ করুন</button>' +
      '<div id="addrMsg"></div>' +
      '<h3>⛓️ ZERO ওয়ালেট খোলার গাইড</h3>' +
      '<div class="pdf-note">১. <b>zerochain.info/wallet</b>-এ যান।<br>' +
      '২. নতুন ওয়ালেট খুলুন — Wallet ID ও Password পাবেন। <b>দুটোই নিরাপদে লিখে রাখুন — সাইটটি ভুলে গেলে ফেরত দিতে পারে না।</b><br>' +
      '৩. ওয়ালেটে আপনার <b>t1…</b> ঠিকানাটি দেখাবে — সেটি কপি করুন।<br>' +
      '৪. উপরে ঠিকানাটি বসিয়ে সংরক্ষণ করুন, অথবা তোলার সময় লিখুন।<br>' +
      '⚠️ Wallet ID, Password বা Private Key <b>কাউকে দেবেন না</b> — অ্যাডমিনও কখনো চাইবে না।</div>' +
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
      if (!amt || amt <= 0) { showEarnAlert('সঠিক পরিমাণ লিখুন।'); return; }
      walletPost('/deposit-start', { user_id: uid, currency: cur, amount: amt }).then(function (res) {
        var box = $('depPayBox');
        if (!box) return;
        if (!res.ok) { box.innerHTML = '<div class="form-error">' + esc(claimErrorText(res.reason)) + '</div>'; return; }
        if (cur === 'stars') {
          box.innerHTML = '<div class="pdf-note">বটে গিয়ে ' + bnNum(res.amount) + ' Stars-এর ইনভয়েস পাবেন — পেমেন্ট করলেই Wallet-এ জমা হবে।</div>';
          openBotLink('https://t.me/' + BOT_USERNAME + '?start=deposit_' + res.amount);
          return;
        }
        var unit = cur === 'zero' ? 'ZERO' : 'GRAM';
        var amount = cur === 'zero' ? res.amount : res.gram;
        box.innerHTML =
          '<div class="pdf-note"><strong>' + bnNum(fmtZero(amount)) + ' ' + unit + '</strong> পাঠান এই ঠিকানায়:<br><code>' + esc(res.address) + '</code></div>' +
          '<label>লেনদেনের ID (txid / tx hash) <input id="depTxid" type="text" placeholder="txid লিখুন"></label>' +
          '<button class="btn-primary btn-block" type="button" id="depConfirmBtn">কনফার্ম করুন</button>' +
          '<div id="depMsg"></div>';
        var cb = $('depConfirmBtn');
        if (cb) cb.addEventListener('click', function () {
          var txid = $('depTxid').value.trim();
          if (!txid) { showEarnAlert('txid লিখুন।'); return; }
          walletPost('/deposit-confirm', { user_id: uid, currency: cur, txid: txid, amount: amount }).then(function (r) {
            var m = $('depMsg');
            if (!m) return;
            if (r.ok) {
              m.innerHTML = '<div class="task-status done">✅ ' + bnNum(fmtZero(r.credited)) + ' ' + unit + ' Wallet-এ জমা হয়েছে!</div>';
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
      if (!amt || amt <= 0) { showEarnAlert('সঠিক পরিমাণ লিখুন।'); return; }
      walletPost('/withdraw', { user_id: uid, currency: cur, amount: amt, to_wallet: mode, address: addr, device_id: deviceId() || undefined }).then(function (res) {
        var m = $('wdMsg');
        if (!m) return;
        if (!res.ok) { m.innerHTML = '<div class="form-error">' + esc(claimErrorText(res.reason)) + '</div>'; return; }
        if (res.mode === 'save') {
          m.innerHTML = '<div class="task-status done">✅ ' + bnNum(fmtZero(res.amount)) + ' ' + (cur === 'zero' ? 'ZERO' : 'GRAM') + ' Wallet-এ জমা রাখা হয়েছে।</div>';
        } else if (res.status === 'pending_approval') {
          m.innerHTML = '<div class="task-status">⏳ অনুরোধ পাঠানো হয়েছে (' + esc(res.payout_id || '') + ') — অ্যাডমিনের অনুমোদনের অপেক্ষায়। অনুমোদন হলে অ্যাডমিন পাঠিয়ে txid জানিয়ে দেবেন।</div>';
        } else {
          m.innerHTML = '<div class="task-status">⏳ অনুরোধ পাঠানো হয়েছে (' + esc(res.payout_id || '') + ') — অ্যাডমিন শীঘ্রই পাঠিয়ে txid জানিয়ে দেবেন।</div>';
        }
        loadWallet(); loadTasks();
      });
    });
    var addrBtn = $('addrSaveBtn');
    if (addrBtn) addrBtn.addEventListener('click', function () {
      var uid = tgUserId();
      if (!uid) return;
      var cur = $('addrCurrency').value;
      var addr = $('addrValue').value.trim();
      if (!addr) { showEarnAlert('ঠিকানা লিখুন।'); return; }
      walletPost('/address', { user_id: uid, currency: cur, address: addr }).then(function (res) {
        var m = $('addrMsg');
        if (!m) return;
        m.innerHTML = res.ok
          ? '<div class="task-status done">✅ ঠিকানা সংরক্ষণ হয়েছে।</div>'
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
  // ~0.019 GRAM; max 625 ZERO / $10 = 500 completions.
  function openPromoteSheet() {
    var body = $('promoteBody');
    if (!body) return;
    body.innerHTML =
      '<p>আপনার পেইজ/চ্যানেল/লিংক এই অ্যাপের ইউজারদের কাছে পৌঁছে দিন। প্রতিটি কাজ শেষ করলে ইউজার পুরস্কার পাবে — <strong>১ ZERO</strong> (ZERO প্রমোশন) বা <strong>~০.০১৯ GRAM</strong> (GRAM প্রমোশন)।</p>' +
      '<div class="pdf-note">সর্বনিম্ন বাজেট: <strong>১০০ ZERO</strong> অথবা <strong>$২</strong> (≈১.৯১ GRAM) = ৮০টি কাজ। সর্বোচ্চ: ৬২৫ ZERO / $১০ = ৫০০টি কাজ। পেমেন্ট আগে, তারপর অ্যাডমিন প্রতিটি প্রমোশন অনুমোদন করেন — অনুমোদন না হলে লাইভ হবে না। বাজেট শেষ হলে প্রমোশন নিজে থেমে যাবে।</div>' +
      '<label>শিরোনাম <input id="promoTitle" type="text" maxlength="80" placeholder="যেমন: আমার ফেসবুক পেইজ"></label>' +
      '<label>লিংক <input id="promoUrl" type="url" placeholder="https://..."></label>' +
      '<div class="form-row"><label>ধরন <select id="promoType">' +
      '<option value="facebook_page">Facebook Page</option><option value="facebook">Facebook (পোস্ট/প্রোফাইল)</option>' +
      '<option value="telegram_channel">Telegram চ্যানেল</option><option value="post">পোস্ট</option>' +
      '<option value="video">ভিডিও</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option>' +
      '<option value="x">X (Twitter)</option><option value="instagram">Instagram</option><option value="referral">রেফারেল লিংক</option>' +
      '</select></label>' +
      '<label>মুদ্রা <select id="promoCurrency"><option value="zero">⛓️ ZERO</option><option value="gram">💎 GRAM</option></select></label></div>' +
      '<label>বাজেট <input id="promoBudget" type="number" min="0" step="any" placeholder="১০০ ZERO / $২"></label>' +
      '<label><input id="promoWallet" type="checkbox"> Wallet ব্যালেন্স থেকে পে করুন</label>' +
      '<button class="btn-primary btn-block" type="button" id="promoSubmitBtn">পেমেন্টের ধাপে যান</button>' +
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
      if (!title || !url || !budget || budget <= 0) { showEarnAlert('শিরোনাম, লিংক ও সঠিক বাজেট লিখুন।'); return; }
      walletPost('/promote-submit', { user_id: uid, title: title, url: url, type: type, currency: cur, budget: budget }).then(function (res) {
        var box = $('promoPayBox');
        if (!box) return;
        if (!res.ok) { box.innerHTML = '<div class="form-error">' + esc(claimErrorText(res.reason)) + '</div>'; return; }
        var unit = cur === 'zero' ? 'ZERO' : 'GRAM';
        var amount = cur === 'zero' ? res.pay.amount : res.pay.amount;
        var html = '<div class="pdf-note"><strong>' + bnNum(res.completions) + 'টি কাজ</strong> • প্রতিটিতে ' +
          bnNum(fmtZero(res.reward_per_completion)) + ' ' + unit + ' পুরস্কার</div>';
        if (fromWallet) {
          html += '<div class="pdf-note">Wallet ব্যালেন্স থেকে <strong>' + bnNum(fmtZero(amount)) + ' ' + unit + '</strong> কাটা হবে।</div>' +
            '<button class="btn-primary btn-block" type="button" id="promoConfirmBtn">Wallet দিয়ে পেমেন্ট করুন</button>';
        } else {
          html += '<div class="pdf-note"><strong>' + bnNum(fmtZero(amount)) + ' ' + unit + '</strong> পাঠান এই ঠিকানায়:<br><code>' + esc(res.pay.to) + '</code></div>' +
            '<label>লেনদেনের ID (txid / tx hash) <input id="promoTxid" type="text" placeholder="txid লিখুন"></label>' +
            '<button class="btn-primary btn-block" type="button" id="promoConfirmBtn">পেমেন্ট কনফার্ম করুন</button>';
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
            if (!txid) { showEarnAlert('txid লিখুন।'); return; }
            confirmBody.txid = txid;
          }
          walletPost('/promote-confirm', confirmBody).then(function (r) {
            var m = $('promoMsg');
            if (!m) return;
            if (r.ok) {
              m.innerHTML = '<div class="task-status done">✅ পেমেন্ট পেয়েছি! প্রমোশনটি অ্যাডমিনের অনুমোদনের অপেক্ষায় (' + esc(r.promo_id || '') + ') — অনুমোদন হলে স্পন্সর টাস্ক হিসেবে লাইভ হবে।</div>';
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
        showEarnAlert('PDF পাঠানো হয়েছে ✓ — বটের চ্যাটে দেখুন।');
        loadTasks();
        loadWallet();
        loadMyPdfs();
      } else if (data.reason === 'insufficient_balance') {
        showEarnAlert('Wallet-এ যথেষ্ট ব্যালেন্স নেই — প্রথমে ডিপোজিট করুন।');
      } else {
        showEarnAlert(claimErrorText(data.reason) || 'Wallet দিয়ে কেনা যায়নি।');
      }
    }).catch(function () {});
  }
  var HISTORY_TYPE_LABELS = {
    task: 'টাস্ক', commission: 'কমিশন', referral_bonus: 'রেফারেল বোনাস',
    redeem: 'রিডিম', purchase: 'কেনা',
  };
  var EARNING_SOURCE_LABELS = {
    checkin: 'চেক-ইন', quiz: 'কুইজ', ad: 'বিজ্ঞাপন', video_daily: 'ভিডিও',
    react_daily: 'রিঅ্যাক্ট', join_bazargoo: 'জয়েন', join_earnplaygame: 'জয়েন',
    join_cryptoguru: 'জয়েন', join_adsterratt: 'জয়েন',
    commission: 'কমিশন', referral: 'রেফারেল বোনাস',
  };
  function historyRowHTML(e) {
    var amt = Number(e.amount) || 0;
    var cls = amt >= 0 ? 'pos' : 'neg';
    var sign = amt >= 0 ? '+' : '−';
    var date = e.ts ? String(e.ts).slice(0, 10) : '';
    return '<div class="hist-row"><div><div class="hist-title">' +
      esc(HISTORY_TYPE_LABELS[e.type] || e.type || 'লেনদেন') +
      (e.note ? ' — ' + esc(e.note) : '') + '</div>' +
      '<div class="hist-date">' + bnNum(date) + '</div></div>' +
      '<div class="hist-amt ' + cls + '">' + sign + bnNum(fmtZero(Math.abs(amt))) + ' ZERO</div></div>';
  }
  function loadHistory() {
    var uid = tgUserId();
    if (!WORKER_URL || !uid) return;
    fetch(WORKER_URL + '/history?user_id=' + encodeURIComponent(uid))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var list = $('historyList');
        var entries = Array.isArray(data.entries) ? data.entries : [];
        $('historyEmpty').hidden = entries.length > 0;
        list.innerHTML = entries.map(historyRowHTML).join('');
      })
      .catch(function () {});
    fetch(WORKER_URL + '/history?user_id=' + encodeURIComponent(uid) + '&kind=earning')
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
          showEarnAlert('PDF পাঠানো হয়েছে ✓ — বটের চ্যাটে দেখুন।');
          loadTasks();
          loadMyPdfs();
        } else if (data.reason === 'insufficient_balance') {
          showEarnAlert('ZERO যথেষ্ট নয় — আরও টাস্ক করুন।');
        } else {
          showEarnAlert('রিডিম করা যায়নি — আবার চেষ্টা করুন।');
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
      ? '<p><strong>ঠিকানা:</strong><br><code>' + esc(ZERO_SHOP_ADDRESS) + '</code></p>'
      : '<p>দোকানের ZERO ঠিকানাটি বট জানিয়ে দেবে।</p>';
    body.innerHTML =
      '<p><strong>' + esc(p.title) + '</strong></p>' +
      '<p>১. বটে গিয়ে ZERO ঠিকানা ও সঠিক পরিমাণ দেখে নিন' +
      (p.price_zero ? ' (' + p.price_zero + ' ZERO)' : '') + '।</p>' +
      addrLine +
      '<p>২. নিজের ওয়ালেট থেকে ZERO পাঠান।</p>' +
      '<p>৩. পেমেন্টের transaction id (txid) বটের চ্যাটে পাঠান — যাচাই হলেই বট PDF পাঠিয়ে দেবে।</p>';
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
      rm.textContent = 'কুপন সরান';
      rm.addEventListener('click', function () { removeCoupon(); });
      n.appendChild(document.createTextNode(' '));
      n.appendChild(rm);
    }
  }
  function applyCoupon() {
    var input = $('couponInput');
    var code = (input ? input.value : '').trim().toUpperCase();
    if (!code) return; // empty: do nothing
    if (cartCount() === 0) { couponNote('প্রথমে কার্টে পণ্য যোগ করুন।', 'err'); return; }
    if (code === COUPON_CODE) {
      if (appliedCoupon && appliedCoupon.indexOf('ZERO5-') === 0) {
        couponNote('এক অর্ডারে একটি কুপনই চলবে — ZERO5 কুপনটি সরিয়ে BAZAR5 দিন।', 'err');
        return;
      }
      if (loadUsedCoupons().indexOf(COUPON_CODE) !== -1) {
        couponNote('এই কুপনটি ইতিমধ্যে ব্যবহার করা হয়েছে।', 'err');
        return;
      }
      appliedCoupon = COUPON_CODE;
      saveAppliedCoupon();
      if (input) input.value = COUPON_CODE;
      couponNote('৫% ছাড় প্রয়োগ হয়েছে! 🎉', 'ok', true);
      updateTotals();
      return;
    }
    if (code.indexOf('ZERO5-') === 0) {
      if (appliedCoupon === COUPON_CODE) {
        couponNote('এক অর্ডারে একটি কুপনই চলবে — BAZAR5 সরিয়ে ZERO5 কুপন দিন।', 'err');
        return;
      }
      var uid = tgUserId();
      if (!uid) { couponNote('ZERO5 কুপন শুধু Telegram অ্যাপে যাচাই করা যায়।', 'err'); return; }
      couponNote('কুপন যাচাই হচ্ছে…', 'ok');
      fetch(WORKER_URL + '/coupon?code=' + encodeURIComponent(code) + '&user_id=' + encodeURIComponent(uid))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok && data.valid) {
            appliedCoupon = code;
            saveAppliedCoupon();
            if (input) input.value = code;
            couponNote('৫% ছাড় প্রয়োগ হয়েছে! 🎉 (ZERO5 কুপন)', 'ok', true);
            updateTotals();
          } else if (data.reason === 'not_found') couponNote('কুপন কোডটি পাওয়া যায়নি।', 'err');
          else if (data.reason === 'not_yours') couponNote('এই কুপনটি আপনার নয়।', 'err');
          else if (data.reason === 'already_used') couponNote('এই কুপনটি ইতিমধ্যে ব্যবহার করা হয়েছে।', 'err');
          else couponNote('কুপন যাচাই করা যায়নি — আবার চেষ্টা করুন।', 'err');
        })
        .catch(function () { couponNote('কুপন যাচাই করা যায়নি — ইন্টারনেট চেক করুন।', 'err'); });
      return;
    }
    couponNote('ভুল কুপন কোড।', 'err');
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
    if (appliedCoupon === COUPON_CODE) couponNote('৫% ছাড় প্রয়োগ হয়েছে! 🎉', 'ok', true);
    else if (appliedCoupon) couponNote('৫% ছাড় প্রয়োগ হয়েছে! 🎉 (ZERO5 কুপন)', 'ok', true);
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
      b.innerHTML = '<span class="coupon-banner-text">✓ BAZAR5 ব্যবহার করা হয়েছে</span>' +
        '<span class="coupon-banner-hint">প্রথম অর্ডারের ছাড়টি ব্যবহার করা হয়েছে</span>';
    } else {
      b.classList.remove('used');
      b.innerHTML = '<span class="coupon-banner-text">🎉 প্রথম অর্ডারে ৫% ছাড় — কুপন: <strong>BAZAR5</strong></span>' +
        '<span class="coupon-banner-hint">চাপ দিলে কপি হবে</span>';
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
    var MONTHS = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগ', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
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
      mb.setText('অর্ডার করুন • ' + fmt(grandTotal()));
      mb.show();
    } else if (openSheet === 'detail' || openSheet === 'confirm' || openSheet === 'orders' || openSheet === 'pdfZero' || openSheet === 'wallet' || openSheet === 'promote') {
      mb.hide();
    } else if (cartCount() > 0) {
      mb.setText('কার্ট দেখুন • ' + fmt(cartTotal()));
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
      '" data-cat="__wishlist" type="button">❤️ পছন্দের (' + wishlist.length + ')</button>' +
      '<button class="chip' + (activeCategory === 'all' ? ' active' : '') +
      '" data-cat="all" type="button">সব (' + products.length + ')</button>';
    info.list.forEach(function (c) {
      var label = CATEGORY_BN[c] || c;
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
      return '<button class="btn-add btn-add-disabled" type="button" disabled>স্টক শেষ</button>';
    }
    var q = cart[id] || 0;
    if (q === 0) {
      return '<button class="btn-add" type="button" data-add="' + esc(id) + '">যোগ করুন</button>';
    }
    return '<div class="qty-control' + (full ? ' full' : '') + '">' +
      '<button type="button" data-dec="' + esc(id) + '" aria-label="কমান">−</button>' +
      '<span class="qty-num">' + bnNum(q) + '</span>' +
      '<button type="button" data-inc="' + esc(id) + '" aria-label="বাড়ান">+</button></div>';
  }

  function updateSearchUI(count) {
    var q = searchQuery.trim();
    var clearBtn = $('searchClear');
    if (clearBtn) clearBtn.hidden = !q;
    var countEl = $('searchCount');
    if (!countEl) return;
    if (q) {
      countEl.hidden = false;
      countEl.textContent = bnNum(count) + 'টি পণ্য পাওয়া গেছে';
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
      empty.querySelector('p').textContent = '💔 পছন্দের তালিকা খালি।';
      empty.querySelector('.empty-sub').textContent = 'হার্ট চেপে পছন্দের পণ্য যোগ করুন।';
    } else if (list.length === 0 && searchQuery.trim()) {
      empty.querySelector('p').textContent = 'কোনো পণ্য পাওয়া যায়নি';
      empty.querySelector('.empty-sub').textContent = 'অন্য কিছু লিখে খুঁজে দেখুন।';
    } else {
      empty.querySelector('p').textContent = '😕 কিছু পাওয়া যায়নি';
      empty.querySelector('.empty-sub').textContent = 'অন্য কিছু লিখে খুঁজে দেখুন।';
    }
    var html = '';
    list.forEach(function (p) {
      var pct = discountPct(p);
      var wished = isWished(p.id);
      html += '<article class="card" data-open="' + esc(p.id) + '">' +
        '<div class="card-img-wrap">' +
        (p.image
          ? '<img class="card-img" src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;card-img-placeholder&quot;>🛍️</div>\'">'
          : '<div class="card-img-placeholder">🛍️</div>') +
        '<button class="wish-btn' + (wished ? ' wished' : '') + '" type="button" data-wish="' + esc(p.id) + '" aria-label="পছন্দের তালিকায় যোগ করুন">' + (wished ? '❤️' : '♡') + '</button>' +
        '</div>' +
        '<div class="card-body">' +
        '<div class="card-name">' + esc(p.name) + '</div>' +
        stockBadgeHTML(p) +
        '<div class="card-price-row"><span class="price">' + fmt(p.price) + '</span>' +
        (p.old_price ? '<span class="old-price">' + fmt(p.old_price) + '</span>' : '') +
        (pct ? '<span class="discount-badge">-' + pct + '%</span>' : '') + '</div>' +
        '<div class="card-cat">' + esc(CATEGORY_BN[p.category] || p.category || '') + '</div>' +
        qtyControlHTML(p.id, true) +
        '<button class="share-btn" type="button" data-share="' + esc(p.id) + '">↗ শেয়ার</button>' +
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
    btn.innerHTML = 'কপি হয়েছে ✓';
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
    el.textContent = 'শেষ হতে বাকি ' + bnNum(fmtFlashCountdown(flashRemainingMs(Date.now())));
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
          ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;card-img-placeholder&quot;>🛍️</div>\'">'
          : '<div class="card-img-placeholder">🛍️</div>') +
        '<div class="deal-body">' +
        '<div class="deal-name">' + esc(p.name) + '</div>' +
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
          ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;card-img-placeholder&quot;>🛍️</div>\'">'
          : '<div class="card-img-placeholder">🛍️</div>') +
        '<div class="deal-body">' +
        '<div class="deal-name">' + esc(p.name) + '</div>' +
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
    btn.textContent = wished ? '❤️ পছন্দের তালিকায় আছে' : '♡ পছন্দের তালিকায় যোগ করুন';
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
      $('stickyCount').textContent = bnNum(n) + 'টি পণ্য';
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
        '<div class="cart-item-info"><div class="cart-item-name">' + esc(p.name) + '</div>' +
        '<div class="cart-item-price">' + fmt(p.price) + ' × ' + bnNum(cart[id]) + '</div></div>' +
        '<div class="cart-item-right">' +
        '<span class="cart-item-total">' + fmt(p.price * cart[id]) + '</span>' +
        qtyControlHTML(id, false) +
        '<button class="cart-remove" type="button" data-remove="' + esc(id) + '">সরান</button>' +
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
    if (dl) dl.textContent = (appliedCoupon && appliedCoupon.indexOf('ZERO5-') === 0) ? 'ছাড় (ZERO5 — ৫%)' : 'ছাড় (BAZAR5 — ৫%)';
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
    if (!granted) { phoneNote('নম্বর শেয়ার করেননি — নিজে লিখুন।'); return; }
    var phone = extractPhone(ev);
    if (validPhone(phone)) {
      $('buyerPhone').value = phone;
      setFieldError('buyerPhone', false);
      $('formError').hidden = true;
      phoneNote('');
      haptic();
    } else {
      phoneNote('নম্বর পাওয়া যায়নি — নিজে লিখুন।');
    }
  }

  function requestPhoneFromTelegram() {
    if (!tg || !tg.requestContact) return;
    if (phoneRequestPending) return;
    phoneRequestPending = true;
    var btn = $('fillPhoneBtn');
    if (btn) btn.disabled = true;
    phoneNote('অনুরোধ পাঠানো হয়েছে — টেলিগ্রামে Allow করুন…');
    try {
      tg.requestContact(function (granted, ev) {
        handleContactResult(granted, ev);
      });
    } catch (e) {
      // e.g. "Contact is already requested": an earlier tap is still in
      // flight — its callback will fill the number when it arrives.
      phoneNote('অনুরোধ পাঠানো হয়েছে — একটু অপেক্ষা করুন…');
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
    if (name.length < 3) err = 'আপনার পুরো নাম লিখুন।';
    else if (!validPhone(phone)) err = 'সঠিক মোবাইল নম্বর লিখুন (01XXXXXXXXX)।';
    else if (address.length < 10) err = 'সম্পূর্ণ ঠিকানা লিখুন।';
    else if (!district) err = 'জেলা বাছুন।';
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
    $('detailImg').alt = p.name;
    $('detailName').textContent = p.name;
    $('detailPrice').textContent = fmt(p.price);
    var pct = discountPct(p);
    $('detailOldPrice').hidden = !p.old_price;
    if (p.old_price) $('detailOldPrice').textContent = fmt(p.old_price);
    $('detailDiscount').hidden = !pct;
    if (pct) $('detailDiscount').textContent = '-' + pct + '%';
    $('detailCategory').textContent = CATEGORY_BN[p.category] || p.category || '';
    var st = $('detailStock');
    if (p.in_stock === true) { st.hidden = false; st.className = 'stock-badge in-stock'; st.textContent = '✓ স্টকে আছে'; }
    else if (p.in_stock === false) { st.hidden = false; st.className = 'stock-badge out-of-stock'; st.textContent = 'স্টক শেষ'; }
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
            '<div class="order-meta">' + esc(fmtShortDate(o.ordered_at)) + ' • ' + bnNum(o.item_count) + 'টি পণ্য' + (first ? ' • ' + esc(first) : '') + '</div>' +
          '</div>' +
          '<div class="order-head-side"><strong>' + fmt(o.total) + '</strong><span class="order-status">পাঠানো হয়েছে</span></div>' +
        '</div>';
      if (expanded) {
        html += '<div class="order-detail">';
        (o.items || []).forEach(function (it) {
          html += '<div class="summary-row small"><span>' + esc(it.name) + ' × ' + bnNum(it.qty) + '</span><span>' + fmt(it.subtotal) + '</span></div>';
        });
        html += '<div class="summary-row small"><span>পণ্যের মোট</span><span>' + fmt(o.subtotal) + '</span></div>';
        if (o.discount) {
          html += '<div class="summary-row small"><span>ছাড় (' + esc(o.coupon || 'BAZAR5') + ' — ৫%)</span><span class="order-discount">−' + fmt(o.discount) + '</span></div>';
        }
        html += '<div class="summary-row small"><span>ডেলিভারি চার্জ</span><span>' + fmt(o.shipping_fee) + '</span></div>' +
          '<div class="summary-row"><span>মোট</span><strong>' + fmt(o.total) + '</strong></div>';
        if (o.district) html += '<div class="order-district">জেলা: ' + esc(o.district) + '</div>';
        html += '<button class="btn-secondary btn-block order-rebuy" type="button" data-rebuy="' + esc(o.order_id) + '">আবার কিনুন</button></div>';
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
    var lines = ['🛍️ BazarGoo অর্ডার'];
    if (order.order_id) lines.push('অর্ডার নং: ' + order.order_id);
    lines.push('');
    order.items.forEach(function (it) {
      lines.push('• ' + it.name + ' × ' + it.qty + ' — ৳' + it.subtotal.toLocaleString('en-US'));
    });
    var d = order.delivery || {};
    lines.push('', 'পণ্যের মোট: ৳' + (order.subtotal || order.total).toLocaleString('en-US'));
    if (order.discount) {
      var cLabel = (order.coupon && order.coupon.indexOf('ZERO5-') === 0) ? 'ZERO5 কুপন (৫%)' : 'BAZAR5 — প্রথম অর্ডারে ৫%';
      lines.push('ছাড় (' + cLabel + '): −৳' + order.discount.toLocaleString('en-US'));
    }
    if (d.shipping_fee !== undefined) {
      lines.push('ডেলিভারি (' + (d.shipping_zone === 'outside' ? 'ঢাকার বাইরে' : 'ঢাকার ভেতরে') + '): ৳' + d.shipping_fee.toLocaleString('en-US'));
    }
    lines.push('মোট: ৳' + order.total.toLocaleString('en-US') + ' (Cash on Delivery)');
    if (d.name) {
      lines.push('', 'নাম: ' + d.name, 'মোবাইল: ' + d.phone, 'ঠিকানা: ' + d.address);
      if (d.district) lines.push('জেলা: ' + d.district);
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
        if (fe) { fe.hidden = false; fe.textContent = 'ZERO5 কুপন শুধু Telegram অ্যাপে ব্যবহার করা যায়।'; }
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
            couponNote('কুপনটি ব্যবহার করা যায়নি — আবার কুপন দিন।', 'err');
            updateTotals();
            if (fe) { fe.hidden = false; fe.textContent = 'কুপনটি ইতিমধ্যে ব্যবহার করা হয়েছে বা পাওয়া যায়নি — কুপন ছাড়া অর্ডার করুন।'; }
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
      b.textContent = 'কপি হয়েছে ✓';
      setTimeout(function () { b.textContent = 'অর্ডার কপি করুন'; }, 2000);
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
        '" data-star="' + i + '" aria-label="' + bnNum(i) + ' স্টার">★</button>';
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
        '<strong>' + bnNum(avg.toFixed(1)) + '</strong> • ' + bnNum(list.length) + 'টি রিভিউ';
    } else {
      sum.textContent = 'এখনো কোনো রিভিউ নেই — প্রথম রিভিউটি আপনিই দিন।';
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
      myBox.innerHTML = '<div class="my-review-title">আপনার রিভিউ</div>' +
        '<div class="review-stars-display">' + starsHTML(mine.stars) + '</div>' +
        (mine.text ? '<p class="review-text">' + esc(mine.text) + '</p>' : '') +
        '<p class="review-pending">' + (approved ? 'প্রকাশিত হয়েছে ✓' : 'পাঠানো হয়েছে — অনুমোদনের অপেক্ষায়') + '</p>';
      form.hidden = true;
    } else {
      myBox.hidden = true;
      form.hidden = false;
      renderReviewStars();
    }
  }

  function reviewSummaryText(r) {
    var lines = ['⭐ BazarGoo রিভিউ'];
    lines.push('রিভিউ নং: ' + r.review_id);
    lines.push('পণ্য: ' + r.product_name);
    lines.push('পণ্য ID: ' + r.product_id);
    lines.push('রেটিং: ' + starsHTML(r.stars) + ' (' + r.stars + '/৫)');
    lines.push('মন্তব্য: ' + (r.text ? r.text : '—'));
    return lines.join('\n');
  }

  function submitReview() {
    var p = productById[detailId];
    if (!p) return;
    if (myReviews[p.id]) return; // one review per product per device
    if (!reviewStars || reviewStars < 1 || reviewStars > 5) {
      var err = $('reviewError');
      err.textContent = 'দয়া করে ১–৫টি স্টার দিন।';
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
      b.textContent = 'কপি হয়েছে ✓';
      setTimeout(function () { b.textContent = 'রিভিউ কপি করুন'; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }

  // ---------- wiring ----------
  function wireEvents() {
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
  setupTelegram();
  wireEvents();
  setupBottomNav();
  setupBrowser();
  loadProducts();
  loadReviews();
  loadPdfs();
  loadMyPdfs();
  loadTasks();
})();
