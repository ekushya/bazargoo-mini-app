#!/usr/bin/env node
// BazarGoo Mini App — i18n smoke test (Phase 1, 2026-11-10).
//
// Exercises the real LANG / t() / detectLanguage() / setLanguage() /
// applyI18n() / bnNum() / productName() / catLabel() / pdfCategoryLabel()
// code sliced out of app.js, against stub DOM elements. Run from the
// repo root:
//
//   node i18n/smoke-test.js
//
// It does NOT boot the app (wireEvents/loadProducts need a real DOM), so
// it checks the i18n layer only. Exit code 0 = all checks pass.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const a = src.indexOf('// ---------- i18n (Phase 1');
const b = src.indexOf('// Bengali display labels for the store');
if (a === -1 || b === -1) { console.error('i18n block markers not found in app.js'); process.exit(1); }
let code = 'var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;\n' +
  'var IN_TELEGRAM = !!tg;\nvar openSheet = null;\n' + src.slice(a, b);
const bnM = src.match(/function bnNum\(n\) \{[\s\S]*?\n  \}/);
if (!bnM) { console.error('bnNum not found in app.js'); process.exit(1); }
code += '\n' + bnM[0] + '\n';

const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = v; },
  removeItem: k => { delete store[k]; },
};
global.window = { Telegram: { WebApp: { initDataUnsafe: { user: { language_code: 'en' } } } } };

function el(tag, attrs, text) {
  const e = {
    tagName: tag.toUpperCase(), attributes: { ...attrs },
    textContent: text || '', innerHTML: text || '',
    classList: {
      _s: new Set((attrs.class || '').split(' ').filter(Boolean)),
      toggle(c, f) { if (f) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    getAttribute(k) { return this.attributes[k] == null ? null : this.attributes[k]; },
    setAttribute(k, v) { this.attributes[k] = v; },
  };
  return e;
}
const title = el('title', { 'data-i18n': 'common.page_title' }, 'BazarGoo — অনলাইন শপ');
const banner = el('span', { class: 'coupon-banner-text', 'data-i18n': 'coupons.banner_first_order_5pct_bazar5' }, '🎉 প্রথম অর্ডারে ৫% ছাড় — কুপন: <strong>BAZAR5</strong>');
const search = el('input', { 'data-i18n-placeholder': 'common.search_products_placeholder', 'data-i18n-aria-label': 'common.search_products_label' });
const closeBtn = el('button', { 'aria-label': 'বন্ধ করুন', 'data-i18n-aria-label': 'common.close' }, '✕');
const bnBtn = el('button', { class: 'chip', 'data-lang': 'bn' }, 'বাংলা');
const enBtn = el('button', { class: 'chip', 'data-lang': 'en' }, 'English');
const allEls = [title, banner, search, closeBtn, bnBtn, enBtn];
global.document = {
  documentElement: { setAttribute() {} },
  querySelectorAll(sel) {
    if (sel === '[data-i18n]') return allEls.filter(e => e.attributes['data-i18n']);
    if (sel === '[data-i18n-placeholder]') return allEls.filter(e => e.attributes['data-i18n-placeholder']);
    if (sel === '[data-i18n-aria-label]') return allEls.filter(e => e.attributes['data-i18n-aria-label']);
    if (sel === '[data-lang]') return allEls.filter(e => e.attributes['data-lang']);
    return [];
  },
};
global.CATEGORY_BN = { Gadget: 'গ্যাজেট' };
for (const f of ['renderChips', 'renderGrid', 'renderTasks', 'renderCoupons', 'renderContest',
  'renderPdfs', 'renderMyPdfs', 'renderWallet', 'updateCartUI', 'renderCartItems',
  'renderCouponBanner', 'renderBrowserHistory', 'renderBrowserQuickLinks', 'loadHistory', 'loadWallet']) {
  global[f] = function () {};
}
eval(code); // Direct eval in sloppy mode (no 'use strict' in this file,
// on purpose): the sliced block's `var`/`function` declarations land in
// this module's scope, so the checks below can call them directly.

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name); }
}
detectLanguage();
check('auto-detect en from language_code', LANG === 'en');
check('t en close', t('common.close') === 'Close');
check('t en page title', t('common.page_title') === 'BazarGoo — Online Shop');
check('t missing key returns key', t('no.such.key') === 'no.such.key');
check('t positional', t('tasks.watch_more_seconds_then_claim', '15') === 'Watch 15 more seconds, then claim.');
check('t bn fallback when en missing', (function () {
  const keep = STRINGS.en['common.close'];
  delete STRINGS.en['common.close'];
  const r = t('common.close');
  STRINGS.en['common.close'] = keep;
  return r;
})() === 'বন্ধ করুন');
check('bnNum en', bnNum(123) === '123');
check('productName en', productName({ name: 'উলের ক্যালিগ্রাফি শাল' }) === 'Wool Calligraphy Shawl');
check('productName unknown passthrough', productName({ name: 'iPhone 15' }) === 'iPhone 15');
check('catLabel en raw', catLabel('Gadget') === 'Gadget');
check('pdfCategoryLabel en', pdfCategoryLabel('ধর্মীয় বই') === 'Religious Books');
setLanguage('en');
check('title translated', title.textContent === 'BazarGoo — Online Shop');
check('banner unwrap keeps strong', banner.innerHTML === '🎉 5% off your first order — coupon: <strong>BAZAR5</strong>');
check('placeholder translated', search.attributes.placeholder === 'Search products…');
check('aria-label translated', search.attributes['aria-label'] === 'Search products');
check('close aria translated', closeBtn.attributes['aria-label'] === 'Close');
check('en toggle active', enBtn.classList.contains('active') && !bnBtn.classList.contains('active'));
setLanguage('bn');
check('bnNum bn', bnNum(123) === '১২৩');
check('title back to bn', title.textContent === 'BazarGoo — অনলাইন শপ');
check('stored choice wins over detect', (function () { detectLanguage(); return LANG; })() === 'bn');
check('bn toggle active', bnBtn.classList.contains('active') && !enBtn.classList.contains('active'));
// v32 wallet cleanup guards (static — the sheet is gone, the Wallet
// screen carries the inline Deposit / Withdraw / Save-address cards).
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
check('v32 wallet sheet removed', !/openWalletSheet|walletSheetHtml|walletSheet|walletBody/.test(appSrc) && !/walletSheet|walletBody/.test(htmlSrc));
check('v32 inline wallet cards present', ['walletDepositForm', 'walletWithdrawForm', 'walletAddressForm', 'walletGateCard'].every(id => htmlSrc.includes('id="' + id + '"')) && /function renderWalletForms/.test(appSrc) && /function totalZeroBalance/.test(appSrc));
console.log('PASS:', pass, 'FAIL:', fail);
process.exit(fail ? 1 : 0);
