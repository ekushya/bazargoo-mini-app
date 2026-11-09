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
  var PDF_CATALOG_URL = 'payments/pdf_catalog.json';
  var pdfs = [];
  var pdfZeroId = null;
  function loadPdfs() {
    return fetch(PDF_CATALOG_URL)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) { pdfs = Array.isArray(data.pdfs) ? data.pdfs : []; renderPdfs(); })
      .catch(function () { pdfs = []; renderPdfs(); });
  }
  function pdfPriceLine(p) {
    if (p.free) return '<span class="pdf-price free">ফ্রি</span>';
    var parts = [];
    if (p.price_stars) parts.push('⭐ ' + bnNum(p.price_stars) + ' Stars');
    else parts.push('⭐ দাম ঠিক হয়নি');
    if (p.price_zero) parts.push('⛓️ ' + p.price_zero + ' ZERO');
    else parts.push('⛓️ ZERO: দাম ঠিক হয়নি');
    return '<span class="pdf-price">' + parts.join(' • ') + '</span>';
  }
  function renderPdfs() {
    var sec = $('pdfSection');
    if (!sec) return;
    if (!pdfs.length) { sec.hidden = true; $('pdfRow').innerHTML = ''; return; }
    sec.hidden = false;
    var html = '';
    pdfs.forEach(function (p) {
      html += '<article class="pdf-card">' +
        '<div class="pdf-title">' + esc(p.title) + '</div>' +
        (p.description ? '<div class="pdf-desc">' + esc(p.description) + '</div>' : '') +
        '<div class="pdf-price-row">' + pdfPriceLine(p) + '</div>';
      if (p.free && p.file_url) {
        html += '<a class="btn-primary pdf-btn" href="' + esc(p.file_url) + '" download>⬇️ ডাউনলোড করুন (বাংলা)</a>';
        if (p.file_url_en) {
          html += '<a class="btn-secondary pdf-btn" href="' + esc(p.file_url_en) + '" download>⬇️ Download (English)</a>';
        }
      } else if (p.free) {
        html += '<span class="pdf-note">ফ্রি — শীঘ্রই আসছে</span>';
      } else {
        if (p.en) html += '<div class="pdf-note">বাংলা + English ভার্সন — দুটোই পাবেন</div>';
        html += '<button class="btn-primary pdf-btn" type="button" data-buy-stars="' + esc(p.id) + '">⭐ Stars দিয়ে কিনুন</button>' +
          '<button class="btn-secondary pdf-btn" type="button" data-buy-zero="' + esc(p.id) + '">⛓️ ZERO দিয়ে কিনুন</button>';
        if (p.price_zero && earnBalance >= p.price_zero) {
          html += '<button class="btn-secondary pdf-btn" type="button" data-redeem="' + esc(p.id) + '">⛓️ ZERO দিয়ে রিডিম করুন</button>';
        }
      }
      html += '</article>';
    });
    $('pdfRow').innerHTML = html;
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-buy-stars]'), function (b) {
      b.addEventListener('click', function () { buyPdfStars(b.getAttribute('data-buy-stars')); });
    });
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-buy-zero]'), function (b) {
      b.addEventListener('click', function () { openPdfZeroSheet(b.getAttribute('data-buy-zero')); });
    });
    Array.prototype.forEach.call($('pdfRow').querySelectorAll('[data-redeem]'), function (b) {
      b.addEventListener('click', function () { redeemPdf(b.getAttribute('data-redeem')); });
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
  function loadTasks() {
    var sec = $('earnSection');
    if (!sec) return;
    var uid = tgUserId();
    if (!WORKER_URL || !uid) { sec.hidden = true; return; }
    fetch(WORKER_URL + '/tasks?user_id=' + encodeURIComponent(uid))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        earnBalance = data.balance || 0;
        earnTasks = Array.isArray(data.tasks) ? data.tasks : [];
        renderTasks();
        renderPdfs(); // redeem buttons depend on the balance
      })
      .catch(function () { sec.hidden = true; });
  }
  function claimErrorText(reason) {
    if (reason === 'already_done') return 'আজকের জন্য হয়ে গেছে।';
    if (reason === 'not_member') return 'চ্যানেলে জয়েন করা হয়নি — জয়েন করে আবার চেষ্টা করুন।';
    if (reason === 'wrong_answers') return 'একটি উত্তর ভুল হয়েছে — আবার চেষ্টা করুন।';
    if (reason === 'daily_limit') return 'আজকের সীমা শেষ।';
    if (reason === 'no_click') return 'প্রথমে বিজ্ঞাপনটি দেখুন, তারপর দাবি করুন।';
    return 'দাবি করা যায়নি — আবার চেষ্টা করুন।';
  }
  function showEarnAlert(msg) {
    if (tg && tg.showAlert) { try { tg.showAlert(msg); return; } catch (e) {} }
    alert(msg);
  }
  function renderTasks() {
    var sec = $('earnSection');
    if (!sec) return;
    sec.hidden = false;
    $('earnBalance').textContent = 'আপনার ZERO: ' + earnBalance;
    var html = '';
    earnTasks.forEach(function (t) {
      var doneLabel = (t.id === 'join_bazargoo' || t.id === 'join_earnplaygame') ? 'হয়ে গেছে ✓' : 'আজ হয়েছে ✓';
      html += '<article class="pdf-card">' +
        '<div class="pdf-title">' + esc(t.title) + '</div>' +
        (t.desc ? '<div class="pdf-desc">' + esc(t.desc) + '</div>' : '') +
        '<div class="pdf-price-row"><span class="pdf-price">+' + t.reward + ' ZERO</span></div>';
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
      } else if (t.id === 'ad') {
        html += '<a class="btn-primary pdf-btn" href="' + WORKER_URL + '/go?ad=zerads&user_id=' + encodeURIComponent(tgUserId()) + '" target="_blank" rel="noopener">👁️ বিজ্ঞাপন দেখুন</a>';
        html += '<button class="btn-secondary pdf-btn" type="button" data-claim="ad"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : 'দাবি করুন') + '</button>';
      } else if (t.id === 'join_bazargoo' || t.id === 'join_earnplaygame') {
        var ch = t.id === 'join_bazargoo' ? 'bazargoo287' : 'earnplaygame21';
        html += '<a class="btn-secondary pdf-btn" href="https://t.me/' + ch + '" target="_blank" rel="noopener">চ্যানেলে জয়েন করুন</a>';
        html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : 'যাচাই করুন') + '</button>';
      } else {
        html += '<button class="btn-primary pdf-btn" type="button" data-claim="' + esc(t.id) + '"' + (t.done ? ' disabled' : '') + '>' + (t.done ? doneLabel : 'দাবি করুন') + '</button>';
      }
      html += '</article>';
    });
    $('earnTaskRow').innerHTML = html;
    Array.prototype.forEach.call($('earnTaskRow').querySelectorAll('[data-claim]'), function (b) {
      b.addEventListener('click', function () { claimTask(b.getAttribute('data-claim')); });
    });
    var qs = $('earnTaskRow').querySelector('[data-quiz-submit]');
    if (qs) qs.addEventListener('click', submitQuiz);
    var rs = $('earnTaskRow').querySelector('[data-ref-share]');
    if (rs) rs.addEventListener('click', function () { copyRefLink(rs); });
  }
  function claimTask(id, answers) {
    var uid = tgUserId();
    if (!uid) return;
    var body = { user_id: uid, task: id };
    if (answers) body.answers = answers;
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
        } else {
          showEarnAlert(claimErrorText(data.reason));
        }
        loadTasks();
      })
      .catch(function () {});
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
  function copyRefLink(btn) {
    var uid = tgUserId();
    if (!uid) return;
    var link = 'https://t.me/' + BOT_USERNAME + '?start=ref_' + uid;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () { flashCopied(btn); }, function () { fallbackCopy(link); flashCopied(btn); });
    } else { fallbackCopy(link); flashCopied(btn); }
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
    return appliedCoupon === COUPON_CODE ? Math.round(cartTotal() * COUPON_PCT) : 0;
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
    if (code !== COUPON_CODE) { couponNote('ভুল কুপন কোড।', 'err'); return; }
    if (loadUsedCoupons().indexOf(COUPON_CODE) !== -1) {
      couponNote('এই কুপনটি ইতিমধ্যে ব্যবহার করা হয়েছে।', 'err');
      return;
    }
    if (cartCount() === 0) { couponNote('প্রথমে কার্টে পণ্য যোগ করুন।', 'err'); return; }
    appliedCoupon = COUPON_CODE;
    saveAppliedCoupon();
    if (input) input.value = COUPON_CODE;
    couponNote('৫% ছাড় প্রয়োগ হয়েছে! 🎉', 'ok', true);
    updateTotals();
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
    if (appliedCoupon) couponNote('৫% ছাড় প্রয়োগ হয়েছে! 🎉', 'ok', true);
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
    } else if (openSheet === 'detail' || openSheet === 'confirm' || openSheet === 'orders' || openSheet === 'pdfZero') {
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
    if (disc > 0) { order.coupon = COUPON_CODE; order.discount = disc; }
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
      lines.push('ছাড় (BAZAR5 — প্রথম অর্ডারে ৫%): −৳' + order.discount.toLocaleString('en-US'));
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
  loadProducts();
  loadReviews();
  loadPdfs();
  loadMyPdfs();
  loadTasks();
})();
