// Stubbed unit tests for payments/worker.js — node only, no network,
// no real credentials. Run:  node --test payments/test/
// (payments/package.json sets "type": "module" so node treats the
// worker as ESM for these tests.)

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, {
  handleUpdate,
  validatePreCheckout,
  verifyZeroTx,
  extractZeroOutputs,
  parseStartArg,
  isTxid,
  catalogGet,
  listUserPdfs,
  dhakaDateStr,
  dhakaWeekKey,
  dhakaMonthKey,
  prevMonthKey,
  rollSpinPrize,
  SPIN_PRIZES,
  LEADERBOARD_PRIZES,
  promoteCompletionsForZero,
  promoteCompletionsForUsd,
  gramRewardPerCompletion,
  listMyPromotions,
  handlePromoteSubmit,
  spinSlotsLeft,
  PROMOTE_MIN_BUDGET_ZERO,
  PROMOTE_MAX_BUDGET_ZERO,
  PROMOTE_MIN_BUDGET_USD,
  PROMOTE_MAX_BUDGET_USD,
  DEPOSIT_MIN_STARS,
  WITHDRAW_GRAM_MIN,
  WITHDRAW_ZERO_DAILY_CAP,
  WITHDRAW_MANUAL_ABOVE_ZERO,
  streakReward,
  prevDhakaDate,
  msUntilDhakaMidnight,
  dailyRewardPosition,
  levelFor,
  fmtZero,
  payUplineCommissions,
  QUIZ_QUESTIONS,
  PDF_CATALOG,
  ADMIN_ID,
  // v27: ZERO auto-send + withdraw gate + proof posts
  zeroWifToPriv,
  zeroPrivToAddress,
  zeroEcdsaSign,
  zeroEcdsaVerify,
  zeroParseTx,
  zeroSerializeTx,
  zeroSighash,
  zeroSignTx,
  zeroTxidFromHex,
  getZeroUtxos,
  getZeroBalanceSats,
  attemptZeroAutoSend,
  postWithdrawProof,
  getWithdrawGate,
  markPayoutSent,
  ZERO_COSMOS_BRANCH_ID,
  ZERO_TX_FEE_SATS,
  WITHDRAW_CHANNEL_ID,
  WITHDRAW_CHANNEL,
  WITHDRAW_PINNED_POST_URL,
  // Phase 2 i18n
  t,
  normalizeLang,
  getUserLang,
  setUserLang,
  apiLang,
  pdfTitle,
  translateHistoryNote,
  translateQuiz,
} from '../worker.js';

// ---------- fakes ----------

function makeKv() {
  const store = new Map();
  return {
    store,
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    async delete(k) { store.delete(k); },
    async list({ prefix }) {
      const keys = [...store.keys()]
        .filter((k) => k.startsWith(prefix || ''))
        .map((name) => ({ name }));
      return { keys };
    },
  };
}

function makeFetchStub() {
  const calls = [];
  let zeroTxResponse = null;
  let zeroTxStatus = 200;
  let chatMemberStatus = null; // null = default empty result (not a member)
  let chatMemberByChat = {}; // chat_id -> status (overrides the global one)
  let zerochainByPath = []; // [{ match, response, status }] — first match wins
  let tonapiResponse = null; // null = tonapi unreachable (404)
  let tonPrice = null; // null = CoinGecko unreachable
  const stub = async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('api.telegram.org')) {
      if (String(url).endsWith('/getChatMember')) {
        let chatId = null;
        try { chatId = JSON.parse((opts && opts.body) || '{}').chat_id; } catch (e) { /* ignore */ }
        const per = chatId !== null && chatId !== undefined ? chatMemberByChat[String(chatId)] : undefined;
        const status = per !== undefined ? per : chatMemberStatus;
        if (status !== null && status !== undefined) {
          return { ok: true, json: async () => ({ ok: true, result: { status } }) };
        }
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
      }
      return { ok: true, json: async () => ({ ok: true, result: {} }) };
    }
    if (String(url).includes('zerochain.info')) {
      for (const rule of zerochainByPath) {
        if (String(url).includes(rule.match)) {
          const body = typeof rule.response === 'function' ? rule.response(String(url)) : rule.response;
          return { ok: rule.status === 200, status: rule.status, json: async () => body };
        }
      }
      if (zeroTxResponse === null) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      return { ok: zeroTxStatus === 200, status: zeroTxStatus, json: async () => zeroTxResponse };
    }
    if (String(url).includes('tonapi.io')) {
      if (tonapiResponse === null) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, json: async () => tonapiResponse };
    }
    if (String(url).includes('api.coingecko.com')) {
      if (tonPrice === null) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ 'the-open-network': { usd: tonPrice } }) };
    }
    throw new Error('unexpected fetch: ' + url);
  };
  return {
    stub,
    calls,
    setZeroTx(response, status = 200) { zeroTxResponse = response; zeroTxStatus = status; },
    setChatMember(status) { chatMemberStatus = status; },
    setChatMemberFor(chatId, status) { chatMemberByChat[String(chatId)] = status; },
    // Per-path zerochain override (first match wins). `response` may be
    // a value or a function (url) => value — used for /txid/<txid>.
    setZerochain(match, response, status = 200) { zerochainByPath.push({ match, response, status }); },
    setTonapi(response) { tonapiResponse = response; },
    setTonPrice(price) { tonPrice = price; },
  };
}

function makeEnv(kv, overrides = {}) {
  return {
    TELEGRAM_BOT_TOKEN: 'TEST_TOKEN',
    WEBHOOK_SECRET: 'test-secret',
    ZEROCHAIN_API_KEY: 'TEST_ZERO_KEY',
    ZERO_SHOP_ADDRESS: 't1TestShopAddress123',
    KV: kv,
    ...overrides,
  };
}

function tgCalls(fetchStub, method) {
  return fetchStub.calls.filter((c) => c.url.endsWith('/' + method));
}
function tgBodies(fetchStub, method) {
  return tgCalls(fetchStub, method).map((c) => JSON.parse(c.opts.body));
}

let fetchStub;
let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  fetchStub = makeFetchStub();
  globalThis.fetch = fetchStub.stub;
});
afterEach(() => { globalThis.fetch = realFetch; });

function msgUpdate(overrides = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: 8507294759, username: 'Shamsul2104', first_name: 'Shamsul' },
      chat: { id: 8507294759, username: 'Shamsul2104', first_name: 'Shamsul' },
      date: 1794150000,
      ...overrides,
    },
  };
}

// ---------- pure helpers ----------

test('parseStartArg: plain, buy, zero, unknown', () => {
  assert.deepEqual(parseStartArg('/start'), { kind: 'plain' });
  assert.deepEqual(parseStartArg('/start buy_test-pdf'), { kind: 'buy', id: 'test-pdf' });
  assert.deepEqual(parseStartArg('/start zero_test-pdf'), { kind: 'zero', id: 'test-pdf' });
  assert.deepEqual(parseStartArg('/start deposit_10'), { kind: 'deposit', stars: 10 });
  assert.equal(parseStartArg('/start deposit_abc').kind, 'unknown');
  assert.equal(parseStartArg('/start nope').kind, 'unknown');
  assert.equal(parseStartArg('hello'), null);
});

test('isTxid: 64 hex only', () => {
  assert.equal(isTxid('a'.repeat(64)), true);
  assert.equal(isTxid('A1'.repeat(32)), true);
  assert.equal(isTxid('abc'), false);
  assert.equal(isTxid('g'.repeat(64)), false);
  assert.equal(isTxid(''), false);
});

test('validatePreCheckout: valid payload passes', () => {
  const v = validatePreCheckout({ invoice_payload: 'buy:test-pdf', currency: 'XTR', total_amount: 1 });
  assert.deepEqual(v, { ok: true, pdfId: 'test-pdf' });
});

test('validatePreCheckout: wrong amount rejected', () => {
  const v = validatePreCheckout({ invoice_payload: 'buy:test-pdf', currency: 'XTR', total_amount: 99 });
  assert.equal(v.ok, false);
  assert.match(v.error, /দাম/);
});

test('validatePreCheckout: unknown pdf, wrong currency, bad payload rejected', () => {
  assert.equal(validatePreCheckout({ invoice_payload: 'buy:nope', currency: 'XTR', total_amount: 1 }).ok, false);
  assert.equal(validatePreCheckout({ invoice_payload: 'buy:test-pdf', currency: 'USD', total_amount: 1 }).ok, false);
  assert.equal(validatePreCheckout({ invoice_payload: 'order:123', currency: 'XTR', total_amount: 1 }).ok, false);
  assert.equal(validatePreCheckout({}).ok, false);
});

test('validatePreCheckout: shopping-guide at 5 Stars passes, 4 rejected', () => {
  const ok = validatePreCheckout({ invoice_payload: 'buy:shopping-guide', currency: 'XTR', total_amount: 5 });
  assert.deepEqual(ok, { ok: true, pdfId: 'shopping-guide' });
  const bad = validatePreCheckout({ invoice_payload: 'buy:shopping-guide', currency: 'XTR', total_amount: 4 });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /দাম/);
  const safe = validatePreCheckout({ invoice_payload: 'buy:safe-shopping-guide', currency: 'XTR', total_amount: 10 });
  assert.deepEqual(safe, { ok: true, pdfId: 'safe-shopping-guide' });
});

test('catalog sync: worker PDF_CATALOG matches payments/pdf_catalog.json (ids + prices + categories + previews + reward_only)', () => {
  // The app reads the JSON; the worker validates payments against its
  // inlined copy. If these drift, buyers pay one price and the worker
  // checks another — so the test fails loudly on any mismatch.
  const catalogJson = JSON.parse(readFileSync(new URL('../pdf_catalog.json', import.meta.url), 'utf-8'));
  const jsonPdfs = catalogJson.pdfs;
  assert.equal(PDF_CATALOG.length, jsonPdfs.length, 'catalog length mismatch');
  for (let i = 0; i < jsonPdfs.length; i++) {
    assert.equal(PDF_CATALOG[i].id, jsonPdfs[i].id, 'id mismatch at index ' + i);
    assert.equal(PDF_CATALOG[i].price_stars, jsonPdfs[i].price_stars, 'price_stars mismatch for ' + jsonPdfs[i].id);
    assert.equal(PDF_CATALOG[i].price_zero, jsonPdfs[i].price_zero, 'price_zero mismatch for ' + jsonPdfs[i].id);
    assert.equal(PDF_CATALOG[i].free, jsonPdfs[i].free, 'free flag mismatch for ' + jsonPdfs[i].id);
    assert.equal(PDF_CATALOG[i].category, jsonPdfs[i].category, 'category mismatch for ' + jsonPdfs[i].id);
    assert.equal(PDF_CATALOG[i].preview_url || null, jsonPdfs[i].preview_url || null, 'preview_url mismatch for ' + jsonPdfs[i].id);
    assert.equal(PDF_CATALOG[i].preview_url_en || null, jsonPdfs[i].preview_url_en || null, 'preview_url_en mismatch for ' + jsonPdfs[i].id);
    assert.equal(PDF_CATALOG[i].reward_only || false, jsonPdfs[i].reward_only || false, 'reward_only mismatch for ' + jsonPdfs[i].id);
  }
  // Spot checks: tutorials are 10/10 with public previews; religion
  // PDFs are reward-only with null prices; existing categories kept.
  const muse = PDF_CATALOG.find((p) => p.id === 'ai-muse-guide');
  assert.equal(muse.price_stars, 10);
  assert.equal(muse.price_zero, 10);
  assert.equal(muse.category, 'AI টিউটোরিয়াল');
  assert.equal(muse.preview_url, 'payments/pdfs/AI টিউটোরিয়াল/ai-muse-guide-preview.pdf');
  assert.equal(muse.preview_url_en, 'payments/pdfs/AI টিউটোরিয়াল/ai-muse-guide-preview-en.pdf');
  const fatiha = PDF_CATALOG.find((p) => p.id === 'rel-fatiha');
  assert.equal(fatiha.reward_only, true);
  assert.equal(fatiha.price_stars, null);
  assert.equal(fatiha.price_zero, null);
  assert.equal(fatiha.category, 'ধর্মীয় বই');
  assert.equal(PDF_CATALOG.find((p) => p.id === 'test-pdf').category, 'টেস্ট');
  assert.equal(PDF_CATALOG.find((p) => p.id === 'shopping-guide').category, 'কেনাকাটা');
  assert.equal(PDF_CATALOG.find((p) => p.id === 'ai-earning-guide').category, 'AI টিউটোরিয়াল');
});

test('validatePreCheckout: free item must not be paid for', () => {
  PDF_CATALOG.push({ id: 'free-pdf', title: 'Free', free: true, price_stars: 0, price_zero: null, file_id: null, file_url: 'x.pdf' });
  try {
    const v = validatePreCheckout({ invoice_payload: 'buy:free-pdf', currency: 'XTR', total_amount: 0 });
    assert.equal(v.ok, false);
    assert.match(v.error, /ফ্রি/);
  } finally {
    PDF_CATALOG.pop();
  }
});

test('extractZeroOutputs: Insight-style, flat address, outputs shapes', () => {
  const a = extractZeroOutputs({ vout: [{ value: 5, scriptPubKey: { addresses: ['t1AAA', 't1BBB'] } }] });
  assert.deepEqual(a, [{ address: 't1AAA', value: 5 }, { address: 't1BBB', value: 5 }]);
  const b = extractZeroOutputs({ vout: [{ value: 2.5, address: 't1CCC' }] });
  assert.deepEqual(b, [{ address: 't1CCC', value: 2.5 }]);
  const c = extractZeroOutputs({ outputs: [{ address: 't1DDD', value: '7' }] });
  assert.deepEqual(c, [{ address: 't1DDD', value: 7 }]);
  assert.deepEqual(extractZeroOutputs({}), []);
  assert.deepEqual(extractZeroOutputs(null), []);
});

test('verifyZeroTx: valid, wrong address, insufficient, unconfirmed, unparsable, missing', () => {
  const shop = 't1SHOP';
  const good = { confirmations: 3, vout: [{ value: 10, scriptPubKey: { addresses: [shop] } }] };
  assert.deepEqual(verifyZeroTx(good, shop, 10), { ok: true, paid: 10 });
  assert.equal(verifyZeroTx(good, shop, 10.00000001).ok, true); // within epsilon
  assert.equal(verifyZeroTx(good, shop, 11).ok, false);
  assert.equal(verifyZeroTx(good, shop, 11).reason, 'insufficient');
  assert.equal(verifyZeroTx({ confirmations: 2, vout: [{ value: 10, scriptPubKey: { addresses: ['t1OTHER'] } }] }, shop, 10).reason, 'insufficient');
  assert.equal(verifyZeroTx({ confirmations: 0, vout: [{ value: 10, scriptPubKey: { addresses: [shop] } }] }, shop, 10).reason, 'unconfirmed');
  assert.equal(verifyZeroTx({}, shop, 10).reason, 'unparsable');
  assert.equal(verifyZeroTx(null, shop, 10).reason, 'not_found');
});

// ---------- Stars: buy deep link ----------

test('buy deep link: /start buy_test-pdf sends a Stars invoice (XTR, empty provider_token)', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate(msgUpdate({ text: '/start buy_test-pdf' }), env);
  assert.equal(res.handled, 'buy_start');
  assert.equal(res.ok, true);
  const invoices = tgBodies(fetchStub, 'sendInvoice');
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].currency, 'XTR');
  assert.equal(invoices[0].provider_token, '');
  assert.equal(invoices[0].payload, 'buy:test-pdf');
  assert.deepEqual(invoices[0].prices, [{ label: 'Test PDF — BazarGoo Guide', amount: 1 }]);
});

test('buy deep link: /start buy_shopping-guide sends a Stars invoice for 5 Stars', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate(msgUpdate({ text: '/start buy_shopping-guide' }), env);
  assert.equal(res.handled, 'buy_start');
  assert.equal(res.ok, true);
  assert.equal(res.stars, 5);
  const invoices = tgBodies(fetchStub, 'sendInvoice');
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].currency, 'XTR');
  assert.equal(invoices[0].payload, 'buy:shopping-guide');
  assert.deepEqual(invoices[0].prices, [{ label: 'BazarGoo কেনাকাটা গাইড', amount: 5 }]);
});

test('buy deep link: unknown pdf id sends an error, no invoice', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate(msgUpdate({ text: '/start buy_nope' }), env);
  assert.equal(res.ok, false);
  assert.equal(tgCalls(fetchStub, 'sendInvoice').length, 0);
  assert.equal(tgCalls(fetchStub, 'sendMessage').length, 1);
});

// ---------- Stars: pre_checkout ----------

test('pre_checkout: valid query is answered ok', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate({
    update_id: 2,
    pre_checkout_query: { id: 'pcq-1', invoice_payload: 'buy:test-pdf', currency: 'XTR', total_amount: 1 },
  }, env);
  assert.equal(res.handled, 'pre_checkout');
  assert.equal(res.ok, true);
  const answers = tgBodies(fetchStub, 'answerPreCheckoutQuery');
  assert.equal(answers.length, 1);
  assert.equal(answers[0].ok, true);
  assert.equal(answers[0].pre_checkout_query_id, 'pcq-1');
});

test('pre_checkout: wrong amount is answered not-ok with an error message', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  await handleUpdate({
    update_id: 3,
    pre_checkout_query: { id: 'pcq-2', invoice_payload: 'buy:test-pdf', currency: 'XTR', total_amount: 50 },
  }, env);
  const answers = tgBodies(fetchStub, 'answerPreCheckoutQuery');
  assert.equal(answers.length, 1);
  assert.equal(answers[0].ok, false);
  assert.ok(answers[0].error_message);
});

// ---------- Stars: successful_payment ----------

function paymentUpdate(chargeId = 'CHARGE1', amount = 1) {
  return msgUpdate({
    successful_payment: {
      currency: 'XTR',
      total_amount: amount,
      invoice_payload: 'buy:test-pdf',
      telegram_payment_charge_id: chargeId,
    },
  });
}

test('successful_payment: delivers the PDF and records the sale', async () => {
  const kv = makeKv();
  await kv.put('pdf_file:test-pdf', 'FILE123');
  const env = makeEnv(kv);
  const res = await handleUpdate(paymentUpdate(), env);
  assert.equal(res.handled, 'successful_payment');
  assert.equal(res.ok, true);
  assert.equal(res.delivered, true);
  const docs = tgBodies(fetchStub, 'sendDocument');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].document, 'FILE123');
  assert.equal(docs[0].chat_id, 8507294759);
  const saleId = await kv.get('sale:charge:CHARGE1');
  assert.ok(saleId);
  const sale = JSON.parse(await kv.get('sale:' + saleId));
  assert.equal(sale.currency, 'STAR');
  assert.equal(sale.item_id, 'test-pdf');
  assert.equal(sale.status, 'delivered');
  assert.equal(sale.telegram_payment_charge_id, 'CHARGE1');
});

test('successful_payment: delivers BOTH language versions when both are registered', async () => {
  const kv = makeKv();
  await kv.put('pdf_file:test-pdf', 'FILE123');
  await kv.put('pdf_file:test-pdf:en', 'FILE_EN456');
  const env = makeEnv(kv);
  const res = await handleUpdate(paymentUpdate(), env);
  assert.equal(res.delivered, true);
  const docs = tgBodies(fetchStub, 'sendDocument');
  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => d.document), ['FILE123', 'FILE_EN456']);
  assert.ok(/বাংলা/.test(docs[0].caption));
  assert.ok(/English/.test(docs[1].caption));
});

test('successful_payment: admin gets a "PDF বিক্রি হয়েছে" alert with price + buyer', async () => {
  const kv = makeKv();
  await kv.put('pdf_file:test-pdf', 'FILE123');
  const env = makeEnv(kv);
  const res = await handleUpdate(paymentUpdate(), env);
  assert.equal(res.delivered, true);
  const alerts = tgBodies(fetchStub, 'sendMessage')
    .filter((m) => m.chat_id === ADMIN_ID && /PDF বিক্রি হয়েছে/.test(m.text));
  assert.equal(alerts.length, 1);
  assert.ok(/test-pdf/.test(alerts[0].text));
  assert.ok(/1 Stars/.test(alerts[0].text));
  assert.ok(/8507294759/.test(alerts[0].text));
});

test('successful_payment: duplicate charge id delivers only once', async () => {
  const kv = makeKv();
  await kv.put('pdf_file:test-pdf', 'FILE123');
  const env = makeEnv(kv);
  const first = await handleUpdate(paymentUpdate(), env);
  const second = await handleUpdate(paymentUpdate(), env);
  assert.equal(first.delivered, true);
  assert.equal(second.duplicate, true);
  assert.equal(tgBodies(fetchStub, 'sendDocument').length, 1);
  // Admin sale alert fires once — the duplicate payment alerts nobody.
  const alerts = tgBodies(fetchStub, 'sendMessage')
    .filter((m) => m.chat_id === ADMIN_ID && /PDF বিক্রি হয়েছে/.test(m.text));
  assert.equal(alerts.length, 1);
});

test('successful_payment: paid but no PDF file yet → buyer + admin notified, sale kept waiting', async () => {
  const kv = makeKv(); // no pdf_file registered
  const env = makeEnv(kv);
  const res = await handleUpdate(paymentUpdate('CHARGE2'), env);
  assert.equal(res.ok, true);
  assert.equal(res.delivered, false);
  assert.equal(tgBodies(fetchStub, 'sendDocument').length, 0);
  const saleId = await kv.get('sale:charge:CHARGE2');
  const sale = JSON.parse(await kv.get('sale:' + saleId));
  assert.equal(sale.status, 'paid_waiting_file');
  const msgs = tgBodies(fetchStub, 'sendMessage');
  assert.ok(msgs.some((m) => m.chat_id === 8507294759 && /পেমেন্ট পেয়েছি/.test(m.text)));
  assert.ok(msgs.some((m) => m.chat_id === ADMIN_ID && /ফাইল নেই/.test(m.text)));
  // No sale alert when nothing was delivered — the missing-file alert above is the only admin message.
  assert.ok(!msgs.some((m) => m.chat_id === ADMIN_ID && /PDF বিক্রি হয়েছে/.test(m.text)));
});

// ---------- ZERO ----------

function zeroPricedItem() {
  // Temporarily price the test PDF at 10 ZERO for these tests; the
  // catalog's real price_zero is 1 — restore it afterwards.
  const prev = PDF_CATALOG[0].price_zero;
  PDF_CATALOG[0].price_zero = 10;
  return () => { PDF_CATALOG[0].price_zero = prev; };
}

test('zero deep link: stores an intent and replies with address + amount', async () => {
  const restoreZeroPrice = zeroPricedItem();
  try {
    const kv = makeKv();
    const env = makeEnv(kv);
    const res = await handleUpdate(msgUpdate({ text: '/start zero_test-pdf' }), env);
    assert.equal(res.handled, 'zero_start');
    assert.equal(res.ok, true);
    const intent = JSON.parse(await kv.get('zero_intent:8507294759'));
    assert.equal(intent.pdf_id, 'test-pdf');
    const msgs = tgBodies(fetchStub, 'sendMessage');
    assert.ok(msgs.some((m) => m.text.includes('t1TestShopAddress123') && m.text.includes('10 ZERO')));
  } finally {
    restoreZeroPrice();
  }
});

test('zero deep link: no shop address → "not set up yet"', async () => {
  const restoreZeroPrice = zeroPricedItem();
  try {
    const kv = makeKv();
    const env = makeEnv(kv, { ZEROCHAIN_API_KEY: '', ZERO_SHOP_ADDRESS: '' });
    const res = await handleUpdate(msgUpdate({ text: '/start zero_test-pdf' }), env);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not_configured');
    assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => /চালু হয়নি/.test(m.text)));
  } finally {
    restoreZeroPrice();
  }
});

test('zero deep link: no API key but shop address set → works (keyless API)', async () => {
  const restoreZeroPrice = zeroPricedItem();
  try {
    const kv = makeKv();
    const env = makeEnv(kv, { ZEROCHAIN_API_KEY: '' });
    const res = await handleUpdate(msgUpdate({ text: '/start zero_test-pdf' }), env);
    assert.equal(res.handled, 'zero_start');
    assert.equal(res.ok, true);
    const msgs = tgBodies(fetchStub, 'sendMessage');
    assert.ok(msgs.some((m) => m.text.includes('t1TestShopAddress123') && m.text.includes('10 ZERO')));
  } finally {
    restoreZeroPrice();
  }
});

test('zero txid: valid tx delivers the PDF and records a ZERO sale', async () => {
  const restoreZeroPrice = zeroPricedItem();
  try {
    const kv = makeKv();
    await kv.put('pdf_file:test-pdf', 'FILE123');
    await kv.put('zero_intent:8507294759', JSON.stringify({ pdf_id: 'test-pdf', created_at: new Date().toISOString() }));
    fetchStub.setZeroTx({ confirmations: 5, vout: [{ value: 10, scriptPubKey: { addresses: ['t1TestShopAddress123'] } }] });
    const env = makeEnv(kv);
    const txid = 'b'.repeat(64);
    const res = await handleUpdate(msgUpdate({ text: txid }), env);
    assert.equal(res.handled, 'zero_txid');
    assert.equal(res.ok, true);
    assert.equal(res.delivered, true);
    assert.equal(tgBodies(fetchStub, 'sendDocument').length, 1);
    const saleId = await kv.get('sale:txid:' + txid);
    const sale = JSON.parse(await kv.get('sale:' + saleId));
    assert.equal(sale.currency, 'ZERO');
    assert.equal(sale.txid, txid);
    assert.equal(sale.amount, 10);
    assert.equal(await kv.get('zero_intent:8507294759'), null); // intent consumed
    const alerts = tgBodies(fetchStub, 'sendMessage')
      .filter((m) => m.chat_id === ADMIN_ID && /PDF বিক্রি হয়েছে/.test(m.text));
    assert.equal(alerts.length, 1);
    assert.ok(/test-pdf/.test(alerts[0].text));
    assert.ok(/10 ZERO/.test(alerts[0].text));
  } finally {
    restoreZeroPrice();
  }
});

test('zero txid: wrong address → no delivery, buyer told the amount did not arrive', async () => {
  const restoreZeroPrice = zeroPricedItem();
  try {
    const kv = makeKv();
    await kv.put('zero_intent:8507294759', JSON.stringify({ pdf_id: 'test-pdf', created_at: new Date().toISOString() }));
    fetchStub.setZeroTx({ confirmations: 5, vout: [{ value: 10, scriptPubKey: { addresses: ['t1SomebodyElse'] } }] });
    const env = makeEnv(kv);
    const res = await handleUpdate(msgUpdate({ text: 'c'.repeat(64) }), env);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'insufficient');
    assert.equal(tgBodies(fetchStub, 'sendDocument').length, 0);
    assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => /যথেষ্ট ZERO/.test(m.text)));
  } finally {
    restoreZeroPrice();
  }
});

test('zero txid: insufficient amount → no delivery', async () => {
  const restoreZeroPrice = zeroPricedItem();
  try {
    const kv = makeKv();
    await kv.put('zero_intent:8507294759', JSON.stringify({ pdf_id: 'test-pdf', created_at: new Date().toISOString() }));
    fetchStub.setZeroTx({ confirmations: 5, vout: [{ value: 4, scriptPubKey: { addresses: ['t1TestShopAddress123'] } }] });
    const env = makeEnv(kv);
    const res = await handleUpdate(msgUpdate({ text: 'd'.repeat(64) }), env);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'insufficient');
    assert.equal(tgBodies(fetchStub, 'sendDocument').length, 0);
  } finally {
    restoreZeroPrice();
  }
});

test('zero txid: unknown txid → not found, no delivery', async () => {
  const restoreZeroPrice = zeroPricedItem();
  try {
    const kv = makeKv();
    await kv.put('zero_intent:8507294759', JSON.stringify({ pdf_id: 'test-pdf', created_at: new Date().toISOString() }));
    fetchStub.setZeroTx(null); // 404 from the explorer
    const env = makeEnv(kv);
    const res = await handleUpdate(msgUpdate({ text: 'e'.repeat(64) }), env);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'not_found');
    assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => /খুঁজে পাওয়া যায়নি/.test(m.text)));
  } finally {
    restoreZeroPrice();
  }
});

test('zero txid: no pending intent → buyer is asked to start from the app first', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate(msgUpdate({ text: 'f'.repeat(64) }), env);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_intent');
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => /প্রথমে অ্যাপ থেকে/.test(m.text)));
});

test('zero txid: same txid twice → second is a duplicate, one delivery', async () => {
  const restoreZeroPrice = zeroPricedItem();
  try {
    const kv = makeKv();
    await kv.put('pdf_file:test-pdf', 'FILE123');
    const env = makeEnv(kv);
    const txid = 'a'.repeat(64);
    fetchStub.setZeroTx({ confirmations: 5, vout: [{ value: 12, scriptPubKey: { addresses: ['t1TestShopAddress123'] } }] });
    await kv.put('zero_intent:8507294759', JSON.stringify({ pdf_id: 'test-pdf', created_at: new Date().toISOString() }));
    const first = await handleUpdate(msgUpdate({ text: txid }), env);
    await kv.put('zero_intent:8507294759', JSON.stringify({ pdf_id: 'test-pdf', created_at: new Date().toISOString() }));
    const second = await handleUpdate(msgUpdate({ text: txid }), env);
    assert.equal(first.delivered, true);
    assert.equal(second.duplicate, true);
    assert.equal(tgBodies(fetchStub, 'sendDocument').length, 1);
  } finally {
    restoreZeroPrice();
  }
});

// ---------- reviews: approve / reject ----------

async function seedPendingReview(kv) {
  await kv.put('pending_review:RV-20261108-AB12', JSON.stringify({
    review_id: 'RV-20261108-AB12',
    product_id: 'prod-1',
    product_name: 'Test Product',
    stars: 5,
    text: 'ভালো পণ্য',
    buyer_name: 'Shamsul',
    submitted_at: '2026-11-08T10:00:00.000Z',
  }));
}

function reviewCallbackUpdate(fromId, action) {
  return {
    update_id: 9,
    callback_query: {
      id: 'cq-1',
      from: { id: fromId },
      message: { message_id: 55, chat: { id: ADMIN_ID }, text: '⭐ নতুন রিভিউ — Bazar Goo' },
      data: 'review:' + action + ':RV-20261108-AB12',
    },
  };
}

test('review approve: admin approves → published to KV, pending removed, message edited', async () => {
  const kv = makeKv();
  await seedPendingReview(kv);
  const env = makeEnv(kv);
  const res = await handleUpdate(reviewCallbackUpdate(ADMIN_ID, 'approve'), env);
  assert.equal(res.handled, 'callback');
  assert.equal(res.ok, true);
  const approved = JSON.parse(await kv.get('reviews:approved'));
  assert.equal(approved.length, 1);
  assert.equal(approved[0].review_id, 'RV-20261108-AB12');
  assert.equal(await kv.get('pending_review:RV-20261108-AB12'), null);
  assert.equal(tgCalls(fetchStub, 'answerCallbackQuery').length, 1);
  assert.equal(tgCalls(fetchStub, 'editMessageText').length, 1);
  assert.match(tgBodies(fetchStub, 'editMessageText')[0].text, /প্রকাশ করা হয়েছে/);
});

test('review approve: approving twice publishes only once', async () => {
  const kv = makeKv();
  await seedPendingReview(kv);
  const env = makeEnv(kv);
  await handleUpdate(reviewCallbackUpdate(ADMIN_ID, 'approve'), env);
  const second = await handleUpdate(reviewCallbackUpdate(ADMIN_ID, 'approve'), env);
  assert.equal(second.ok, true);
  const approved = JSON.parse(await kv.get('reviews:approved'));
  assert.equal(approved.length, 1);
});

test('review reject: admin rejects → pending removed, nothing published', async () => {
  const kv = makeKv();
  await seedPendingReview(kv);
  const env = makeEnv(kv);
  const res = await handleUpdate(reviewCallbackUpdate(ADMIN_ID, 'reject'), env);
  assert.equal(res.ok, true);
  assert.equal(await kv.get('pending_review:RV-20261108-AB12'), null);
  assert.equal(await kv.get('reviews:approved'), null);
});

test('review callback: non-admin is ignored silently', async () => {
  const kv = makeKv();
  await seedPendingReview(kv);
  const env = makeEnv(kv);
  const res = await handleUpdate(reviewCallbackUpdate(999999, 'approve'), env);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_admin');
  assert.equal(tgCalls(fetchStub, 'answerCallbackQuery').length, 0);
  assert.ok(await kv.get('pending_review:RV-20261108-AB12')); // still pending
});

// ---------- webhook entry point ----------

test('webhook: wrong secret path → 403, correct path → 200', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const bad = await worker.fetch(new Request('https://worker.test/webhook/wrong-secret', {
    method: 'POST',
    body: JSON.stringify(msgUpdate({ text: '/start' })),
  }), env);
  assert.equal(bad.status, 403);
  const good = await worker.fetch(new Request('https://worker.test/webhook/test-secret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msgUpdate({ text: '/start' })),
  }), env);
  assert.equal(good.status, 200);
  assert.equal(tgCalls(fetchStub, 'sendMessage').length, 1); // welcome sent
});

test('webhook: GET /reviews.json serves approved reviews from KV (CORS enabled)', async () => {
  const kv = makeKv();
  await kv.put('reviews:approved', JSON.stringify([{ review_id: 'RV-1', product_id: 'p', stars: 5, text: 'x' }]));
  const env = makeEnv(kv);
  const res = await worker.fetch(new Request('https://worker.test/reviews.json'), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  const data = await res.json();
  assert.equal(data.reviews.length, 1);
  assert.equal(data.reviews[0].review_id, 'RV-1');
});

// ---------- PDF library: "আমার PDF" ----------

function seedSale(kv, saleId, overrides = {}) {
  const sale = {
    sale_id: saleId,
    user_id: 8507294759,
    username: 'Shamsul2104',
    item_id: 'test-pdf',
    item_type: 'pdf',
    currency: 'STAR',
    amount: 1,
    status: 'delivered',
    telegram_payment_charge_id: 'CHARGE-' + saleId,
    txid: null,
    created_at: '2026-11-09T01:34:56.000Z',
    ...overrides,
  };
  return kv.put('sale:' + saleId, JSON.stringify(sale));
}

test('my_pdfs: returns only this user\'s delivered PDF sales', async () => {
  const kv = makeKv();
  await seedSale(kv, 'SALE-20261109-AAAA');
  await seedSale(kv, 'SALE-20261109-BBBB', { status: 'paid_waiting_file' }); // not delivered → excluded
  await seedSale(kv, 'SALE-20261109-CCCC', { user_id: 111111111 }); // another user → excluded
  const env = makeEnv(kv);
  const res = await worker.fetch(new Request('https://worker.test/my_pdfs?user_id=8507294759'), env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.pdfs.length, 1);
  assert.equal(data.pdfs[0].item_id, 'test-pdf');
  assert.equal(data.pdfs[0].title, 'Test PDF — BazarGoo Guide');
  const empty = await worker.fetch(new Request('https://worker.test/my_pdfs'), env);
  assert.deepEqual((await empty.json()).pdfs, []);
});

test('redownload: owned PDF is re-sent, unowned PDF is refused', async () => {
  const kv = makeKv();
  await kv.put('pdf_file:test-pdf', 'FILE123');
  await kv.put('pdf_file:test-pdf:en', 'FILE_EN456');
  await seedSale(kv, 'SALE-20261109-AAAA');
  const env = makeEnv(kv);
  const owned = await handleUpdate(msgUpdate({ text: '/start redownload_test-pdf' }), env);
  assert.equal(owned.handled, 'redownload');
  assert.equal(owned.ok, true);
  const docs = tgBodies(fetchStub, 'sendDocument');
  assert.equal(docs.length, 2);
  assert.deepEqual(docs.map((d) => d.document), ['FILE123', 'FILE_EN456']);

  const kv2 = makeKv();
  await kv2.put('pdf_file:test-pdf', 'FILE123');
  const env2 = makeEnv(kv2); // no sale for this user
  const refused = await handleUpdate(msgUpdate({ text: '/start redownload_test-pdf' }), env2);
  assert.equal(refused.handled, 'redownload');
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'not_purchased');
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => /এখনো কেনা হয়নি/.test(m.text)));
});

test('parseStartArg: redownload_<id> parses', () => {
  assert.deepEqual(parseStartArg('/start redownload_test-pdf'), { kind: 'redownload', id: 'test-pdf' });
});

test('/start plain → welcome message with shop button', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate(msgUpdate({ text: '/start' }), env);
  assert.equal(res.handled, 'start');
  const msgs = tgBodies(fetchStub, 'sendMessage');
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /Bazar Goo/);
  assert.ok(msgs[0].reply_markup.inline_keyboard[0][0].web_app.url.includes('bazargoo-mini-app'));
});

test('pasted order → buyer confirmation + admin forward', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const pasted = '🛍️ BazarGoo অর্ডার\n• Test × 1 — ৳100\nমোট: ৳100 (Cash on Delivery)';
  const res = await handleUpdate(msgUpdate({ text: pasted }), env);
  assert.equal(res.handled, 'pasted_order');
  const msgs = tgBodies(fetchStub, 'sendMessage');
  assert.ok(msgs.some((m) => m.chat_id === 8507294759 && /অর্ডার পেয়েছি/.test(m.text)));
  assert.ok(msgs.some((m) => m.chat_id === ADMIN_ID && /কপি করা/.test(m.text)));
});

test('admin document with caption pdf:<id> registers the file_id in KV', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate(msgUpdate({
    from: { id: ADMIN_ID, first_name: 'Admin' },
    chat: { id: ADMIN_ID, first_name: 'Admin' },
    caption: 'pdf:test-pdf',
    document: { file_id: 'FILE999', file_name: 'guide.pdf' },
  }), env);
  assert.equal(res.handled, 'document');
  assert.equal(res.ok, true);
  assert.equal(await kv.get('pdf_file:test-pdf'), 'FILE999');
});

test('admin document with caption pdf:<id>:en registers the English file_id', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate(msgUpdate({
    from: { id: ADMIN_ID, first_name: 'Admin' },
    chat: { id: ADMIN_ID, first_name: 'Admin' },
    caption: 'pdf:test-pdf:en',
    document: { file_id: 'FILE_EN999', file_name: 'guide-en.pdf' },
  }), env);
  assert.equal(res.handled, 'document');
  assert.equal(res.ok, true);
  assert.equal(res.lang, 'en');
  assert.equal(await kv.get('pdf_file:test-pdf:en'), 'FILE_EN999');
  assert.equal(await kv.get('pdf_file:test-pdf'), null);
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => /English/.test(m.text)));
});

// ---------- micro-task earn (Phase 3, v1) ----------

let envForPost;
async function claim(userId, task, answers, deviceId) {
  const body = { user_id: userId, task };
  if (answers !== undefined) body.answers = answers;
  if (deviceId !== undefined) body.device_id = deviceId;
  const res = await worker.fetch(new Request('https://worker.test/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), envForPost);
  return res.json();
}
async function redeem(userId, itemId) {
  const res = await worker.fetch(new Request('https://worker.test/redeem', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, item_id: itemId }),
  }), envForPost);
  return res.json();
}
async function getTasks(userId, qs) {
  const res = await worker.fetch(new Request('https://worker.test/tasks?user_id=' + userId + (qs || '')), envForPost);
  return res.json();
}
async function getHistory(userId, kind) {
  const qs = kind ? '&kind=' + kind : '';
  const res = await worker.fetch(new Request('https://worker.test/history?user_id=' + userId + qs), envForPost);
  return res.json();
}
async function getReferrals(userId) {
  const res = await worker.fetch(new Request('https://worker.test/referrals?user_id=' + userId), envForPost);
  return res.json();
}

test('dhakaDateStr: UTC+6 fixed offset (never the local timezone)', () => {
  assert.equal(dhakaDateStr(new Date('2026-11-09T17:59:59Z')), '2026-11-09'); // 23:59:59 Dhaka
  assert.equal(dhakaDateStr(new Date('2026-11-09T18:00:00Z')), '2026-11-10'); // 00:00:00 Dhaka next day
  assert.match(dhakaDateStr(), /^\d{4}-\d{2}-\d{2}$/);
});

test('parseStartArg: ref_<id> parses, self-ref handled downstream', () => {
  assert.deepEqual(parseStartArg('/start ref_12345'), { kind: 'ref', referrer: '12345' });
  assert.deepEqual(parseStartArg('/start ref_8507294759'), { kind: 'ref', referrer: '8507294759' });
});

test('earn: GET /tasks returns balance + 23 tasks, quiz questions carry no answers', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const data = await getTasks(8507294759);
  assert.equal(data.balance, 0);
  assert.equal(data.tasks.length, 23);
  assert.deepEqual(data.tasks.map((t) => t.id), ['checkin', 'join_bazargoo', 'join_earnplaygame', 'join_cryptoguru', 'join_adsterratt', 'referral', 'ad', 'ad_monetag', 'quiz', 'react_daily', 'react_withdraw', 'video_daily', 'spin_daily', 'visit_page_play', 'visit_page_clipcraft', 'visit_page_crypto', 'visit_page_wowappbd', 'visit_page_noor', 'visit_page_usmp', 'visit_chan_bazargoo', 'visit_chan_earnplaygame', 'visit_chan_cryptoguru', 'visit_chan_adsterratt']);
  assert.deepEqual(data.tasks.map((t) => t.reward), [1, 5, 5, 5, 5, 10, 1, 1, 2, 1, 0, 2, 25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.ok(data.tasks.every((t) => t.done === false));
  const quiz = data.tasks.find((t) => t.id === 'quiz');
  assert.equal(quiz.questions.length, 3);
  assert.equal(quiz.questions[0].q, 'ঢাকার ভেতরে ডেলিভারি চার্জ কত?');
  assert.deepEqual(quiz.questions[0].options, ['৳৬০', '৳১২০', '৳২০০']);
  // The correct answers must never leave the worker.
  assert.equal(JSON.stringify(data).includes('correct'), false);
  const empty = await worker.fetch(new Request('https://worker.test/tasks'), envForPost);
  assert.deepEqual((await empty.json()).tasks, []);
});

test('earn: check-in claim credits 1 ZERO (Day 1 streak), same-day double claim blocked', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const first = await claim(8507294759, 'checkin');
  assert.deepEqual(first, { ok: true, balance: 1, credited: 1, streak: 1 });
  assert.equal(await kv.get('zb:8507294759'), '1');
  assert.equal(await kv.get('zs:8507294759'), '1');
  assert.equal(await kv.get('zl:8507294759:lastcheckin'), dhakaDateStr());
  assert.equal(await kv.get('zlt:8507294759'), '1'); // lifetime earned
  assert.equal(await kv.get('ztc:8507294759'), '1'); // tasks completed
  const second = await claim(8507294759, 'checkin');
  assert.deepEqual(second, { ok: false, reason: 'already_done' });
  assert.equal(await kv.get('zb:8507294759'), '1');
  const state = await getTasks(8507294759);
  assert.equal(state.tasks.find((t) => t.id === 'checkin').done, true);
  assert.equal(state.balance, 1);
  assert.equal(state.streak.current, 1);
  assert.equal(state.streak.claimed_today, true);
  assert.equal(state.streak.today_reward, 1);
  assert.deepEqual(state.streak.days.map((d) => d.done), [true, false, false, false, false, false, false]);
  assert.equal(state.profile.level, 1);
  assert.equal(state.profile.lifetime_earned, 1);
  assert.equal(state.profile.tasks_completed, 1);
});

test('earn: join claim with member status credits 5; second claim blocked', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  const res = await claim(8507294759, 'join_bazargoo');
  assert.deepEqual(res, { ok: true, balance: 5, credited: 5 });
  assert.equal(tgCalls(fetchStub, 'getChatMember').length, 1);
  assert.equal(JSON.parse(tgCalls(fetchStub, 'getChatMember')[0].opts.body).chat_id, '@bazargoo287');
  const again = await claim(8507294759, 'join_bazargoo');
  assert.deepEqual(again, { ok: false, reason: 'already_done' });
  assert.equal(tgCalls(fetchStub, 'getChatMember').length, 1); // no re-check
});

test('earn: join claim when not a member is refused (left / kicked)', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('left');
  const res = await claim(8507294759, 'join_earnplaygame');
  assert.deepEqual(res, { ok: false, reason: 'not_member' });
  assert.equal(await kv.get('zb:8507294759'), null);
  const state = await getTasks(8507294759);
  assert.equal(state.tasks.find((t) => t.id === 'join_earnplaygame').done, false);
});

test('earn: join_cryptoguru claim with member status credits 5; second claim blocked', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  const res = await claim(8507294759, 'join_cryptoguru');
  assert.deepEqual(res, { ok: true, balance: 5, credited: 5 });
  assert.equal(tgCalls(fetchStub, 'getChatMember').length, 1);
  assert.equal(JSON.parse(tgCalls(fetchStub, 'getChatMember')[0].opts.body).chat_id, '@cryptoguru_247');
  assert.equal(await kv.get('zt:8507294759:join:cryptoguru'), '1');
  const again = await claim(8507294759, 'join_cryptoguru');
  assert.deepEqual(again, { ok: false, reason: 'already_done' });
  assert.equal(tgCalls(fetchStub, 'getChatMember').length, 1); // no re-check
  const state = await getTasks(8507294759);
  assert.equal(state.tasks.find((t) => t.id === 'join_cryptoguru').done, true);
});

test('earn: join_adsterratt claim when not a member is refused (left / kicked)', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('kicked');
  const res = await claim(8507294759, 'join_adsterratt');
  assert.deepEqual(res, { ok: false, reason: 'not_member' });
  assert.equal(await kv.get('zb:8507294759'), null);
  assert.equal(await kv.get('zt:8507294759:join:adsterratt'), null);
  const state = await getTasks(8507294759);
  assert.equal(state.tasks.find((t) => t.id === 'join_adsterratt').done, false);
  // ...but once a member, the same channel credits normally.
  fetchStub.setChatMember('administrator');
  const ok = await claim(8507294759, 'join_adsterratt');
  assert.deepEqual(ok, { ok: true, balance: 5, credited: 5 });
  // v26: /tasks now also calls getChatMember (gates check), so the
  // adsterratt verification is the LAST member call, not the 2nd.
  const memberCalls = tgCalls(fetchStub, 'getChatMember');
  assert.equal(JSON.parse(memberCalls[memberCalls.length - 1].opts.body).chat_id, '@adsterratt');
});

test('earn: react_daily credits 1 once per day, blocked same day, allowed again next day', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const first = await claim(8507294759, 'react_daily');
  assert.deepEqual(first, { ok: true, balance: 1, credited: 1 });
  assert.equal(await kv.get('zt:8507294759:react:' + dhakaDateStr()), '1');
  const second = await claim(8507294759, 'react_daily');
  assert.deepEqual(second, { ok: false, reason: 'already_done' });
  assert.equal(await kv.get('zb:8507294759'), '1');
  const state = await getTasks(8507294759);
  assert.equal(state.tasks.find((t) => t.id === 'react_daily').done, true);
  // Next Dhaka day (today's key cleared) the task is claimable again.
  await kv.delete('zt:8507294759:react:' + dhakaDateStr());
  const nextDay = await claim(8507294759, 'react_daily');
  assert.deepEqual(nextDay, { ok: true, balance: 2, credited: 1 });
});

test('earn: quiz all-correct credits 2; one wrong refused, retry allowed', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const correct = QUIZ_QUESTIONS.map((q) => q.correct);
  assert.deepEqual(correct, [0, 0, 0]);
  const wrong = await claim(8507294759, 'quiz', [0, 0, 1]);
  assert.deepEqual(wrong, { ok: false, reason: 'wrong_answers' });
  assert.equal(await kv.get('zb:8507294759'), null); // nothing credited
  const right = await claim(8507294759, 'quiz', correct);
  assert.deepEqual(right, { ok: true, balance: 2, credited: 2 });
  const again = await claim(8507294759, 'quiz', correct);
  assert.deepEqual(again, { ok: false, reason: 'already_done' });
});

test('earn: /go logs the ad click and 302-redirects to zerads.com', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const res = await worker.fetch(new Request('https://worker.test/go?ad=zerads&user_id=8507294759'), envForPost);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), 'https://zerads.com/');
  assert.equal(await kv.get('za:8507294759:' + dhakaDateStr()), '1');
});

test('earn: ad claim needs a click first, then caps at 5/day', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const noClick = await claim(8507294759, 'ad');
  assert.deepEqual(noClick, { ok: false, reason: 'no_click' });
  for (let i = 0; i < 5; i++) {
    await worker.fetch(new Request('https://worker.test/go?ad=zerads&user_id=8507294759'), envForPost);
  }
  for (let i = 1; i <= 5; i++) {
    const r = await claim(8507294759, 'ad');
    assert.deepEqual(r, { ok: true, balance: i, credited: 1 });
  }
  const sixth = await claim(8507294759, 'ad');
  assert.deepEqual(sixth, { ok: false, reason: 'daily_limit' });
  assert.equal(await kv.get('zb:8507294759'), '5');
  const state = await getTasks(8507294759);
  assert.equal(state.tasks.find((t) => t.id === 'ad').done, true);
});

// ---------- v25: Monetag Rewarded Interstitial ----------

async function monetagStart(userId, deviceId) {
  const body = { user_id: userId };
  if (deviceId !== undefined) body.device_id = deviceId;
  const res = await worker.fetch(new Request('https://worker.test/monetag-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), envForPost);
  return res.json();
}
async function monetagPostback(body) {
  const res = await worker.fetch(new Request('https://worker.test/monetag-postback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), envForPost);
  return res.json();
}
async function monetagPostbackGet(qs) {
  const res = await worker.fetch(new Request('https://worker.test/monetag-postback?' + qs), envForPost);
  return { status: res.status, data: await res.json() };
}
// Seed a worker-issued pending ymid directly (bypasses
// /monetag-start, so credit-time rules can be tested in isolation).
async function seedPendingYmid(kv, ymid, userId) {
  await kv.put('zmtg:' + ymid, JSON.stringify({ user_id: userId, status: 'pending', created: Date.now() }));
}

test('v25 monetag: /monetag-start issues a unique pending ymid per call', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const a = await monetagStart(8507294759);
  assert.equal(a.ok, true);
  assert.match(a.ymid, /^mtg-8507294759-[0-9a-z]+-[0-9a-z]+$/);
  assert.equal(a.claims_left_today, 5);
  const rec = JSON.parse(await kv.get('zmtg:' + a.ymid));
  assert.equal(rec.user_id, 8507294759);
  assert.equal(rec.status, 'pending');
  const b = await monetagStart(8507294759);
  assert.equal(b.ok, true);
  assert.notEqual(b.ymid, a.ymid);
  assert.deepEqual(await monetagStart(0), { ok: false, reason: 'no_user' });
});

test('v25 monetag: valued postback credits 1 ZERO once — replay is a duplicate, upline + leaderboard included', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const A = 8507294759, B = 111111111;
  await kv.put('zref:' + A, String(B)); // B is A's L1 referrer
  const start = await monetagStart(A);
  const first = await monetagPostback({ user_id: A, ymid: start.ymid, reward_event_type: 'valued', event_type: 'impression', estimated_price: '0.0037000' });
  assert.deepEqual(first, { ok: true, balance: 1, credited: 1, estimated_price: 0.0037 });
  assert.equal(await kv.get('zb:' + A), '1');
  assert.equal(await kv.get('zt:' + A + ':mtg:' + dhakaDateStr()), '1');
  assert.equal(await kv.get('zw:' + A + ':' + dhakaWeekKey()), '1'); // weekly leaderboard total
  assert.equal(await kv.get('zlb:' + A + ':' + dhakaDateStr()), '1'); // daily total (religion top-3)
  assert.equal(await kv.get('zb:' + B), '0.03'); // L1 3% commission on 1 ZERO
  assert.equal(await kv.get('zrefearn:' + B), '0.03');
  const rec = JSON.parse(await kv.get('zmtg:' + start.ymid));
  assert.equal(rec.status, 'credited');
  const replay = await monetagPostback({ user_id: A, ymid: start.ymid, reward_event_type: 'valued', event_type: 'impression' });
  assert.deepEqual(replay, { ok: false, reason: 'already_credited', duplicate: true });
  assert.equal(await kv.get('zb:' + A), '1'); // balance unchanged
});

test('v25 monetag: non_valued credits nothing and does not consume the ymid', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const start = await monetagStart(8507294759);
  const nv = await monetagPostback({ user_id: 8507294759, ymid: start.ymid, reward_event_type: 'non_valued', event_type: 'impression' });
  assert.deepEqual(nv, { ok: false, reason: 'non_valued' });
  assert.equal(await kv.get('zb:8507294759'), null);
  const rec = JSON.parse(await kv.get('zmtg:' + start.ymid));
  assert.equal(rec.status, 'pending'); // still usable for a later valued (click) postback
  const valued = await monetagPostback({ user_id: 8507294759, ymid: start.ymid, reward_event_type: 'valued', event_type: 'click' });
  assert.deepEqual(valued, { ok: true, balance: 1, credited: 1, estimated_price: 0 });
});

test('v25 monetag: unknown ymid, missing ymid and telegram_id mismatch are rejected with no credit', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  assert.deepEqual(await monetagPostback({ user_id: 8507294759, ymid: 'mtg-999-xxx', reward_event_type: 'valued' }), { ok: false, reason: 'unknown_ymid' });
  assert.deepEqual(await monetagPostback({ user_id: 8507294759, reward_event_type: 'valued' }), { ok: false, reason: 'no_ymid' });
  const start = await monetagStart(8507294759);
  const mismatch = await monetagPostbackGet('ymid=' + encodeURIComponent(start.ymid) + '&reward_event_type=valued&event_type=impression&telegram_id=222222222');
  assert.deepEqual(mismatch.data, { ok: false, reason: 'user_mismatch' });
  assert.equal(await kv.get('zb:8507294759'), null);
});

test('v25 monetag: GET /monetag-postback with Monetag-style query params credits', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const start = await monetagStart(8507294759);
  const qs = 'ymid=' + encodeURIComponent(start.ymid) + '&event_type=impression&reward_event_type=valued&zone_id=123456&sub_zone_id=123456&estimated_price=0.0042000&request_var=bazargoo_ad_task&telegram_id=8507294759';
  const r = await monetagPostbackGet(qs);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true, balance: 1, credited: 1, estimated_price: 0.0042 });
  // The app's client confirmation arriving after the postback is a duplicate.
  const dup = await monetagPostback({ user_id: 8507294759, ymid: start.ymid, reward_event_type: 'valued', event_type: 'impression' });
  assert.deepEqual(dup, { ok: false, reason: 'already_credited', duplicate: true });
});

test('v25 monetag: GET postback secret enforced only when configured', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv, { MONETAG_POSTBACK_SECRET: 's3cret' });
  const start = await monetagStart(8507294759);
  const noSecret = await monetagPostbackGet('ymid=' + encodeURIComponent(start.ymid) + '&reward_event_type=valued&telegram_id=8507294759');
  assert.equal(noSecret.status, 403);
  assert.deepEqual(noSecret.data, { ok: false, reason: 'bad_secret' });
  const withSecret = await monetagPostbackGet('secret=s3cret&ymid=' + encodeURIComponent(start.ymid) + '&reward_event_type=valued&telegram_id=8507294759');
  assert.equal(withSecret.status, 200);
  assert.equal(withSecret.data.ok, true);
});

test('v25 monetag: daily cap of 5 enforced at credit time and at /monetag-start', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await kv.put('zt:' + uid + ':mtg:' + dhakaDateStr(), '5');
  assert.deepEqual(await monetagStart(uid), { ok: false, reason: 'daily_limit', claims_left_today: 0 });
  await seedPendingYmid(kv, 'mtg-manual-cap', uid);
  const r = await monetagPostback({ user_id: uid, ymid: 'mtg-manual-cap', reward_event_type: 'valued' });
  assert.deepEqual(r, { ok: false, reason: 'daily_limit' });
  assert.equal(await kv.get('zb:' + uid), null);
  const rec = JSON.parse(await kv.get('zmtg:mtg-manual-cap'));
  assert.equal(rec.status, 'rejected');
});

test('v25 monetag: 30s cooldown enforced at /monetag-start and at credit time', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  const first = await monetagStart(uid);
  assert.equal(first.ok, true);
  assert.equal((await monetagPostback({ user_id: uid, ymid: first.ymid, reward_event_type: 'valued' })).ok, true);
  const tooSoon = await monetagStart(uid);
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.reason, 'cooldown');
  assert.ok(tooSoon.available_in_ms > 0 && tooSoon.available_in_ms <= 30 * 1000);
  // Credit-time cooldown (defense in depth): a second pending ymid
  // cannot credit inside the 30s window even if /monetag-start was bypassed.
  await seedPendingYmid(kv, 'mtg-manual-cd', uid);
  const cd = await monetagPostback({ user_id: uid, ymid: 'mtg-manual-cd', reward_event_type: 'valued' });
  assert.equal(cd.ok, false);
  assert.equal(cd.reason, 'cooldown');
  assert.equal(await kv.get('zb:' + uid), '1');
  // After the window passes, a fresh start works.
  await kv.put('zt:' + uid + ':mtg_last', String(Date.now() - 31 * 1000));
  assert.equal((await monetagStart(uid)).ok, true);
});

test('v25 monetag: /tasks shows ad_monetag (5 left, cooldown 0); a Monetag view no longer unlocks the spin', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  let state = await getTasks(uid);
  const mtg = state.tasks.find((t) => t.id === 'ad_monetag');
  assert.equal(mtg.done, false);
  assert.equal(mtg.claims_left_today, 5);
  assert.equal(mtg.cooldown_ms, 0);
  assert.equal(mtg.reward, 1);
  // v26: a Monetag view no longer unlocks the spin — the spin has its
  // own gates (today's check-in + 4 channel joins) and its own ad
  // slots. The ad task still pays 1 ZERO per valued view.
  const start = await monetagStart(uid);
  await monetagPostback({ user_id: uid, ymid: start.ymid, reward_event_type: 'valued' });
  state = await getTasks(uid);
  assert.equal(state.tasks.find((t) => t.id === 'ad_monetag').claims_left_today, 4);
  assert.ok(state.tasks.find((t) => t.id === 'ad_monetag').cooldown_ms > 0);
  const spin = state.tasks.find((t) => t.id === 'spin_daily');
  assert.equal(spin.locked, true);
  assert.ok(spin.missing.includes('checkin_today'));
  assert.ok(spin.missing.some((m) => m.startsWith('joins:')));
  assert.equal(spin.slots.total, 4);
});

test('v25 monetag: ad_monetag is NOT claimable via /claim (postback only)', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  assert.deepEqual(await claim(8507294759, 'ad_monetag'), { ok: false, reason: 'not_claimable' });
  assert.equal(await kv.get('zb:8507294759'), null);
});

test('v25 monetag: device conflict blocks /monetag-start', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  await kv.put('zdev:device-xyz', '111111111'); // device bound to another user
  assert.deepEqual(await monetagStart(8507294759, 'device-xyz'), { ok: false, reason: 'device_conflict' });
});

test('earn: redeem success deducts balance, delivers the PDF, records an RD- sale in the library', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '5');
  await kv.put('pdf_file:test-pdf', 'FILE123');
  envForPost = makeEnv(kv);
  const res = await redeem(8507294759, 'test-pdf'); // price_zero 1
  assert.equal(res.ok, true);
  assert.equal(res.balance, 4);
  assert.ok(/^RD-\d{8}-[A-Z2-9]{4}$/.test(res.sale_id));
  assert.equal(res.delivered, true);
  const docs = tgBodies(fetchStub, 'sendDocument');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].document, 'FILE123');
  const sale = JSON.parse(await kv.get('sale:' + res.sale_id));
  assert.equal(sale.currency, 'ZERO');
  assert.equal(sale.amount, 1);
  assert.equal(sale.source, 'redeem');
  assert.equal(sale.status, 'delivered');
  // Admin sale alert fires on a redeem delivery too.
  const alerts = tgBodies(fetchStub, 'sendMessage')
    .filter((m) => m.chat_id === ADMIN_ID && /PDF বিক্রি হয়েছে/.test(m.text));
  assert.equal(alerts.length, 1);
  assert.ok(/1 ZERO/.test(alerts[0].text));
  // The redeemed PDF shows up in "আমার PDF".
  const owned = await listUserPdfs(envForPost, 8507294759);
  assert.equal(owned.length, 1);
  assert.equal(owned[0].item_id, 'test-pdf');
});

test('earn: redeem with insufficient balance refused, nothing delivered', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '4');
  await kv.put('pdf_file:shopping-guide', 'FILE999');
  envForPost = makeEnv(kv);
  const res = await redeem(8507294759, 'shopping-guide'); // price_zero 5
  assert.deepEqual(res, { ok: false, reason: 'insufficient_balance', balance: 4 });
  assert.equal(tgBodies(fetchStub, 'sendDocument').length, 0);
  assert.equal(await kv.get('zb:8507294759'), '4');
  const free = await redeem(8507294759, 'store-guide');
  assert.equal(free.ok, false);
  assert.equal(free.reason, 'not_redeemable');
});

test('earn: referral credited on the friend\'s FIRST check-in only', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const friend = 777777;
  // Friend opens the bot via the referrer's link.
  const ref = await handleUpdate(msgUpdate({
    from: { id: friend, username: 'Friend', first_name: 'Friend' },
    chat: { id: friend, username: 'Friend', first_name: 'Friend' },
    text: '/start ref_8507294759',
  }), envForPost);
  assert.equal(ref.handled, 'ref_start');
  assert.equal(ref.ok, true);
  assert.equal(await kv.get('zref:' + friend), '8507294759');
  // Friend's first check-in pays the referrer +10 flat AND +0.03
  // commission (3% of the friend's 1-ZERO check-in).
  const first = await claim(friend, 'checkin');
  assert.deepEqual(first, { ok: true, balance: 1, credited: 1, streak: 1 });
  assert.equal(await kv.get('zb:8507294759'), '10.03');
  assert.equal(await kv.get('zrefearn:8507294759'), '10.03');
  assert.equal(await kv.get('zref_paid:' + friend), '1');
  assert.equal(await kv.get('zrc:8507294759'), '1');
  assert.equal(await kv.get('zrc1:8507294759'), '1');
  assert.equal(await kv.get('zrc2:8507294759'), null);
  assert.equal(await kv.get('zrc3:8507294759'), null);
  // Next day: simulate by clearing today's key and moving the last
  // check-in back to yesterday with streak 1 — the friend's streak
  // continues to Day 2 (reward 2), the referrer is NOT paid the flat
  // bonus again, but still earns the 3% commission (+0.06).
  const yesterday = dhakaDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
  await kv.delete('zt:' + friend + ':checkin:' + dhakaDateStr());
  await kv.put('zl:' + friend + ':lastcheckin', yesterday);
  await kv.put('zs:' + friend, '1');
  const second = await claim(friend, 'checkin');
  assert.deepEqual(second, { ok: true, balance: 3, credited: 2, streak: 2 });
  assert.equal(await kv.get('zb:8507294759'), '10.09');
  assert.equal(await kv.get('zrefearn:8507294759'), '10.09');
  assert.equal(await kv.get('zb:' + friend), '3');
});

test('earn: referral pays 3 levels on the friend\'s FIRST check-in only', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const A = 111, B = 222, C = 333, D = 444;
  async function startWithRef(userId, referrer) {
    const res = await handleUpdate(msgUpdate({
      from: { id: userId, username: 'U' + userId, first_name: 'U' + userId },
      chat: { id: userId, username: 'U' + userId, first_name: 'U' + userId },
      text: '/start ref_' + referrer,
    }), envForPost);
    assert.equal(res.handled, 'ref_start');
    assert.equal(res.ok, true);
    assert.equal(await kv.get('zref:' + userId), String(referrer));
  }
  async function nextDay(userId, streak) {
    const yesterday = dhakaDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await kv.delete('zt:' + userId + ':checkin:' + dhakaDateStr());
    await kv.put('zl:' + userId + ':lastcheckin', yesterday);
    await kv.put('zs:' + userId, String(streak));
  }
  // Chain A -> B -> C -> D (each joins via the previous user's link).
  // Every first check-in pays the flat bonus (10/5/2) PLUS the % commission
  // on the 1-ZERO reward (L1 +0.03, L2 +0.02, L3 +0.01).
  await startWithRef(B, A);
  await claim(B, 'checkin');
  assert.equal(await kv.get('zb:' + A), '10.03'); // 10 flat + 0.03 commission
  assert.equal(await kv.get('zrc1:' + A), '1');
  assert.equal(await kv.get('zrc:' + A), '1');
  assert.equal(await kv.get('zref_paid:' + B), '1');

  await startWithRef(C, B);
  await claim(C, 'checkin');
  assert.equal(await kv.get('zb:' + B), '11.03'); // 1 own check-in + 10 L1 flat + 0.03 commission
  assert.equal(await kv.get('zb:' + A), '15.05'); // 10.03 + 5 L2 flat + 0.02 commission
  assert.equal(await kv.get('zrc1:' + B), '1');
  assert.equal(await kv.get('zrc2:' + A), '1');
  assert.equal(await kv.get('zrc:' + B), '1');
  assert.equal(await kv.get('zref_paid:' + C), '1');

  await startWithRef(D, C);
  await claim(D, 'checkin');
  assert.equal(await kv.get('zb:' + D), '1'); // D's own Day-1 check-in
  assert.equal(await kv.get('zb:' + C), '11.03'); // 1 own + 10 L1 flat + 0.03 commission
  assert.equal(await kv.get('zb:' + B), '16.05'); // 11.03 + 5 L2 flat + 0.02 commission
  assert.equal(await kv.get('zb:' + A), '17.06'); // 15.05 + 2 L3 flat + 0.01 commission
  assert.equal(await kv.get('zrc1:' + C), '1');
  assert.equal(await kv.get('zrc2:' + B), '1');
  assert.equal(await kv.get('zrc3:' + A), '1');
  assert.equal(await kv.get('zref_paid:' + D), '1');

  // D's second check-in (next day) pays no flat bonus again, but the
  // upline still earns the % commission on the 2-ZERO reward.
  await nextDay(D, 1);
  const again = await claim(D, 'checkin');
  assert.deepEqual(again, { ok: true, balance: 3, credited: 2, streak: 2 });
  assert.equal(await kv.get('zb:' + C), '11.09'); // +0.06 commission
  assert.equal(await kv.get('zb:' + B), '16.09'); // +0.04 commission
  assert.equal(await kv.get('zb:' + A), '17.08'); // +0.02 commission

  // A user with no referrer pays nobody.
  const E = 555;
  await claim(E, 'checkin');
  assert.equal(await kv.get('zb:' + A), '17.08');
  assert.equal(await kv.get('zref_paid:' + E), null);

  // Profile per-level counts + lifetime (referral credits count toward
  // lifetime but not toward tasks-completed).
  const stateA = await getTasks(A);
  assert.deepEqual(stateA.profile.referrals_by_level, { l1: 1, l2: 1, l3: 1 });
  assert.equal(stateA.profile.referrals, 1); // legacy direct-only total
  assert.equal(stateA.profile.lifetime_earned, 17.08); // 17 flat + 0.08 commissions
  assert.equal(stateA.profile.tasks_completed, 0);
  // Referral card describes all 3 levels + the % commission.
  const refTask = stateA.tasks.find((t) => t.id === 'referral');
  assert.equal(refTask.desc, 'লেভেল ১: ১০ ZERO · লেভেল ২: ৫ ZERO · লেভেল ৩: ২ ZERO — প্রথম চেক-ইনে বোনাস + টাস্ক আয়ে ৩%/২%/১% কমিশন');
});

test('earn: claim of an unknown task / referral directly is refused', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  assert.deepEqual(await claim(8507294759, 'nope'), { ok: false, reason: 'unknown_task' });
  assert.deepEqual(await claim(8507294759, 'referral'), { ok: false, reason: 'not_claimable' });
  assert.deepEqual(await claim(0, 'checkin'), { ok: false, reason: 'no_user' });
});

// ---------- streak check-in (v15) ----------

test('streak: reward table and prevDhakaDate', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 30].map((s) => streakReward(s)), [1, 2, 3, 5, 7, 10, 15, 15, 15]);
  assert.equal(streakReward(0), 1);
  assert.equal(prevDhakaDate('2026-11-09'), '2026-11-08');
  assert.equal(prevDhakaDate('2026-11-01'), '2026-10-31');
  assert.equal(prevDhakaDate('2026-01-01'), '2025-12-31');
  assert.equal(prevDhakaDate('garbage'), null);
});

test('streak: consecutive days pay 1, 2, 3, 5, 7, 10, 15, then cap at 15', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  const yesterday = () => dhakaDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
  // Simulate "yesterday claimed with streak N-1" before each claim.
  let balance = 0;
  const expected = [1, 2, 3, 5, 7, 10, 15, 15];
  for (let day = 1; day <= 8; day++) {
    if (day > 1) {
      await kv.put('zl:' + uid + ':lastcheckin', yesterday());
      await kv.put('zs:' + uid, String(day - 1));
      await kv.delete('zt:' + uid + ':checkin:' + dhakaDateStr());
    }
    const res = await claim(uid, 'checkin');
    balance += expected[day - 1];
    assert.deepEqual(res, { ok: true, balance, credited: expected[day - 1], streak: day });
    assert.equal(await kv.get('zs:' + uid), String(day));
    const state = await getTasks(uid);
    // After claiming, the card shows what today paid (Day N's reward).
    assert.equal(state.tasks.find((t) => t.id === 'checkin').reward, expected[day - 1]);
  }
  assert.equal(await kv.get('zb:' + uid), String(balance)); // 1+2+3+5+7+10+15+15 = 58
});

test('streak: a missed day resets to Day 1', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  const twoDaysAgo = dhakaDateStr(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
  await kv.put('zl:' + uid + ':lastcheckin', twoDaysAgo);
  await kv.put('zs:' + uid, '5');
  const res = await claim(uid, 'checkin');
  assert.deepEqual(res, { ok: true, balance: 1, credited: 1, streak: 1 });
  assert.equal(await kv.get('zs:' + uid), '1');
  const state = await getTasks(uid);
  assert.deepEqual(state.streak.days.map((d) => d.done), [true, false, false, false, false, false, false]);
});

test('streak: 7-day strip cycles — Day 8 starts a new cycle at Day 1', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  const yesterday = dhakaDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
  await kv.put('zl:' + uid + ':lastcheckin', yesterday);
  await kv.put('zs:' + uid, '7');
  const res = await claim(uid, 'checkin');
  assert.deepEqual(res, { ok: true, balance: 15, credited: 15, streak: 8 });
  const state = await getTasks(uid);
  assert.deepEqual(state.streak.days.map((d) => d.done), [true, false, false, false, false, false, false]);
  assert.deepEqual(state.streak.days.map((d) => d.reward), [1, 2, 3, 5, 7, 10, 15]);
  assert.equal(state.streak.current, 8);
});

// ---------- profile / level (v15) ----------

test('level: 0->L1, 49->L1, 50->L2, 149->L3, 150->L4', () => {
  assert.deepEqual(levelFor(0), { level: 1, xp: 0, xp_next: 50, progress: 0 });
  assert.deepEqual(levelFor(49), { level: 1, xp: 49, xp_next: 50, progress: 49 / 50 });
  assert.deepEqual(levelFor(50), { level: 2, xp: 0, xp_next: 50, progress: 0 });
  assert.deepEqual(levelFor(149), { level: 3, xp: 49, xp_next: 50, progress: 49 / 50 });
  assert.deepEqual(levelFor(150), { level: 4, xp: 0, xp_next: 50, progress: 0 });
});

test('profile: /tasks returns profile + streak for a fresh user', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const res = await worker.fetch(new Request('https://worker.test/tasks?user_id=8507294759&name=Kaniz'), envForPost);
  const data = await res.json();
  assert.equal(data.profile.name, 'Kaniz');
  assert.equal(data.profile.balance, 0);
  assert.equal(data.profile.lifetime_earned, 0);
  assert.equal(data.profile.level, 1);
  assert.equal(data.profile.xp, 0);
  assert.equal(data.profile.xp_next, 50);
  assert.equal(data.profile.progress, 0);
  assert.equal(data.profile.tasks_completed, 0);
  assert.equal(data.profile.referrals, 0);
  assert.deepEqual(data.profile.referrals_by_level, { l1: 0, l2: 0, l3: 0 });
  assert.equal(data.profile.referral_earnings, 0);
  assert.equal(typeof data.profile.join_date, 'string'); // set on first sight
  assert.equal(data.device_conflict, false);
  assert.deepEqual(data.streak, {
    current: 0,
    claimed_today: false,
    today_reward: 1,
    days: [1, 2, 3, 5, 7, 10, 15].map((r, i) => ({ day: i + 1, reward: r, done: false })),
  });
  // No name param -> default display name.
  const anon = await getTasks(8507294759);
  assert.equal(anon.profile.name, 'ব্যবহারকারী');
});

test('profile: lifetime + tasks-completed grow on a join claim', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  const res = await claim(8507294759, 'join_bazargoo');
  assert.deepEqual(res, { ok: true, balance: 5, credited: 5 });
  const state = await getTasks(8507294759);
  assert.equal(state.profile.lifetime_earned, 5);
  assert.equal(state.profile.tasks_completed, 1);
  assert.equal(state.profile.level, 1);
  assert.equal(state.profile.xp, 5);
  assert.equal(await kv.get('zlt:8507294759'), '5');
  assert.equal(await kv.get('ztc:8507294759'), '1');
});

// ---------- video task (v15, rolling 24h cooldown) ----------

test('video: claim once, then cooldown blocks until 24h pass', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  const first = await claim(uid, 'video_daily');
  assert.deepEqual(first, { ok: true, balance: 2, credited: 2 });
  const last = Number(await kv.get('zt:' + uid + ':video_last'));
  assert.ok(last > 0 && Date.now() - last < 60 * 1000);
  const second = await claim(uid, 'video_daily');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'cooldown');
  assert.ok(second.available_in_ms > 23 * 60 * 60 * 1000);
  assert.equal(await kv.get('zb:' + uid), '2');
  // /tasks shows the task done with remaining cooldown.
  const state = await getTasks(uid);
  const video = state.tasks.find((t) => t.id === 'video_daily');
  assert.equal(video.done, true);
  assert.ok(video.available_in_ms > 23 * 60 * 60 * 1000);
  // 23h later: still blocked.
  await kv.put('zt:' + uid + ':video_last', String(Date.now() - 23 * 60 * 60 * 1000));
  const tooSoon = await claim(uid, 'video_daily');
  assert.deepEqual(tooSoon.ok, false);
  assert.equal(tooSoon.reason, 'cooldown');
  // 25h later: allowed again.
  await kv.put('zt:' + uid + ':video_last', String(Date.now() - 25 * 60 * 60 * 1000));
  const next = await claim(uid, 'video_daily');
  assert.deepEqual(next, { ok: true, balance: 4, credited: 2 });
  const fresh = await getTasks(uid);
  assert.equal(fresh.tasks.find((t) => t.id === 'video_daily').done, true);
  assert.equal(fresh.profile.tasks_completed, 2);
  assert.equal(fresh.profile.lifetime_earned, 4);
});

// ---------- v22: daily visit tasks (Pages + channels, rolling 24h) ----------

test('visit: all 10 tasks present with reward 1, group visit, correct URLs', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const data = await getTasks(8507294759);
  const visits = data.tasks.filter((t) => t.group === 'visit');
  assert.equal(visits.length, 10);
  assert.deepEqual(visits.map((t) => t.id), ['visit_page_play', 'visit_page_clipcraft', 'visit_page_crypto', 'visit_page_wowappbd', 'visit_page_noor', 'visit_page_usmp', 'visit_chan_bazargoo', 'visit_chan_earnplaygame', 'visit_chan_cryptoguru', 'visit_chan_adsterratt']);
  assert.ok(visits.every((t) => t.reward === 1));
  assert.deepEqual(visits.map((t) => t.url), [
    'https://www.facebook.com/ekushyaplayearn',
    'https://www.facebook.com/61563692323373',
    'https://www.facebook.com/cryptocoinbang',
    'https://www.facebook.com/wowekushya',
    'https://www.facebook.com/61568910204325',
    'https://www.facebook.com/profile.php?id=61596357419229',
    'https://t.me/bazargoo287',
    'https://t.me/earnplaygame21',
    'https://t.me/cryptoguru_247',
    'https://t.me/adsterratt',
  ]);
  assert.ok(visits.every((t) => t.done === false && t.available_in_ms === 0));
  // No other task carries a group/url — except the v27 withdraw-gate
  // task, which carries the pinned-post URL + 'withdraw_gate' group.
  assert.ok(data.tasks.filter((t) => t.group !== 'visit' && t.group !== 'withdraw_gate').every((t) => t.group === undefined && t.url === undefined));
  const gateTask = data.tasks.find((t) => t.id === 'react_withdraw');
  assert.equal(gateTask.group, 'withdraw_gate');
  assert.equal(gateTask.url, 'https://t.me/bazargoowithdraw/2');
  assert.equal(gateTask.reward, 0);
});

test('visit: page claim once credits 1, then cooldown blocks until 24h pass', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  const first = await claim(uid, 'visit_page_play');
  assert.deepEqual(first, { ok: true, balance: 1, credited: 1 });
  const last = Number(await kv.get('zt:' + uid + ':visit_last:visit_page_play'));
  assert.ok(last > 0 && Date.now() - last < 60 * 1000);
  const second = await claim(uid, 'visit_page_play');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'cooldown');
  assert.ok(second.available_in_ms > 23 * 60 * 60 * 1000);
  assert.equal(await kv.get('zb:' + uid), '1');
  // /tasks shows the task done with remaining cooldown; other visits untouched.
  const state = await getTasks(uid);
  const page = state.tasks.find((t) => t.id === 'visit_page_play');
  assert.equal(page.done, true);
  assert.ok(page.available_in_ms > 23 * 60 * 60 * 1000);
  assert.equal(state.tasks.find((t) => t.id === 'visit_page_noor').done, false);
  // 23h later: still blocked.
  await kv.put('zt:' + uid + ':visit_last:visit_page_play', String(Date.now() - 23 * 60 * 60 * 1000));
  const tooSoon = await claim(uid, 'visit_page_play');
  assert.equal(tooSoon.ok, false);
  assert.equal(tooSoon.reason, 'cooldown');
  // 25h later: allowed again.
  await kv.put('zt:' + uid + ':visit_last:visit_page_play', String(Date.now() - 25 * 60 * 60 * 1000));
  const next = await claim(uid, 'visit_page_play');
  assert.deepEqual(next, { ok: true, balance: 2, credited: 1 });
  const fresh = await getTasks(uid);
  assert.equal(fresh.tasks.find((t) => t.id === 'visit_page_play').done, true);
  assert.equal(fresh.profile.tasks_completed, 2);
  assert.equal(fresh.profile.lifetime_earned, 2);
});

test('visit: channel claim by a member credits 1 and each visit task has its own cooldown', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  fetchStub.setChatMember('member');
  const chan = await claim(uid, 'visit_chan_bazargoo');
  assert.deepEqual(chan, { ok: true, balance: 1, credited: 1 });
  assert.equal(tgCalls(fetchStub, 'getChatMember').length, 1);
  assert.equal(JSON.parse(tgCalls(fetchStub, 'getChatMember')[0].opts.body).chat_id, '@bazargoo287');
  // A different visit task is unaffected by this claim's cooldown.
  const other = await claim(uid, 'visit_chan_cryptoguru');
  assert.deepEqual(other, { ok: true, balance: 2, credited: 1 });
  const again = await claim(uid, 'visit_chan_bazargoo');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'cooldown');
  // Unknown visit_ ids are rejected, not credited.
  const bogus = await claim(uid, 'visit_page_unknown');
  assert.deepEqual(bogus, { ok: false, reason: 'unknown_task' });
  assert.equal(await kv.get('zb:' + uid), '2');
});

test('visit: channel claim by a non-member is refused with not_joined, credits nothing', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  fetchStub.setChatMember('left');
  const refused = await claim(uid, 'visit_chan_bazargoo');
  assert.deepEqual(refused, { ok: false, reason: 'not_joined' });
  assert.equal(await kv.get('zb:' + uid), null); // nothing credited
  assert.equal(await kv.get('zt:' + uid + ':visit_last:visit_chan_bazargoo'), null); // no cooldown stamped
  // A Page visit (no membership check) still credits for the same user.
  const page = await claim(uid, 'visit_page_play');
  assert.deepEqual(page, { ok: true, balance: 1, credited: 1 });
  // Once a member, the same channel claim succeeds.
  fetchStub.setChatMember('member');
  const ok = await claim(uid, 'visit_chan_bazargoo');
  assert.deepEqual(ok, { ok: true, balance: 2, credited: 1 });
});

// ---------- v18: % commissions, history, referrals, device binding ----------

test('fmtZero: integers stay plain, fractions trim to 2 decimals', () => {
  assert.equal(fmtZero(10), '10');
  assert.equal(fmtZero(10.5), '10.5');
  assert.equal(fmtZero(10.03), '10.03');
  assert.equal(fmtZero(0), '0');
  assert.equal(fmtZero(0.1 + 0.02), '0.12');
});

test('commission: 100 earning pays L1 +3, L2 +2, L3 +1; 1 earning pays 0.03/0.02/0.01', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const A = 111, B = 222, C = 333, D = 444;
  await kv.put('zref:' + B, String(A));
  await kv.put('zref:' + C, String(B));
  await kv.put('zref:' + D, String(C));
  await payUplineCommissions(envForPost, D, 100, 'Dalim');
  assert.equal(await kv.get('zb:' + C), '3'); // L1 3%
  assert.equal(await kv.get('zb:' + B), '2'); // L2 2%
  assert.equal(await kv.get('zb:' + A), '1'); // L3 1%
  assert.equal(await kv.get('zrefearn:' + C), '3');
  assert.equal(await kv.get('zrefearn:' + B), '2');
  assert.equal(await kv.get('zrefearn:' + A), '1');
  // A 1-ZERO earning pays fractional commissions.
  await payUplineCommissions(envForPost, D, 1, 'Dalim');
  assert.equal(await kv.get('zb:' + C), '3.03');
  assert.equal(await kv.get('zb:' + B), '2.02');
  assert.equal(await kv.get('zb:' + A), '1.01');
  // No commission on a commission: the commission credits above did not
  // generate further commissions for anyone else in the chain.
  const histA = await getHistory(A);
  assert.equal(histA.entries.filter((e) => e.type === 'commission').length, 2);
  assert.equal(histA.entries.filter((e) => e.type === 'commission')[0].note, 'কমিশন লেভেল 3 — Dalim');
});

test('commission: real task claims pay the upline once each, no commission on the flat bonus', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const A = 111, B = 222, C = 333;
  async function startWithRef(userId, referrer) {
    const res = await handleUpdate(msgUpdate({
      from: { id: userId, username: 'U' + userId, first_name: 'U' + userId },
      chat: { id: userId, username: 'U' + userId, first_name: 'U' + userId },
      text: '/start ref_' + referrer,
    }), envForPost);
    assert.equal(res.handled, 'ref_start');
    assert.equal(res.ok, true);
  }
  await startWithRef(B, A);
  await startWithRef(C, B);
  // B's quiz (reward 2): B +2, A commission +0.06. No flat bonus yet
  // (the flat bonus only pays on the first check-in).
  const q = await claim(B, 'quiz', [0, 0, 0]);
  assert.deepEqual(q, { ok: true, balance: 2, credited: 2 });
  assert.equal(await kv.get('zb:' + A), '0.06');
  // B's first check-in (reward 1): B +1, A commission +0.03 AND flat +10.
  // The flat 10 itself pays no commission (A would be 10.12 otherwise).
  await claim(B, 'checkin');
  assert.equal(await kv.get('zb:' + A), '10.09');
  assert.equal(await kv.get('zrefearn:' + A), '10.09');
  // C's first check-in (reward 1): C +1, B flat +10 + commission 0.03,
  // A flat +5 + commission 0.02.
  await claim(C, 'checkin');
  assert.equal(await kv.get('zb:' + B), '13.03'); // 2 quiz + 1 check-in + 10 flat + 0.03
  assert.equal(await kv.get('zb:' + A), '15.11'); // 10.09 + 5 flat + 0.02
  // History for A: 3 commissions + 2 flat referral bonuses.
  const hist = await getHistory(A);
  assert.equal(hist.entries.filter((e) => e.type === 'commission').length, 3);
  assert.equal(hist.entries.filter((e) => e.type === 'referral_bonus').length, 2);
});

test('history: movements recorded; kind=earning groups totals per source', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await claim(uid, 'checkin'); // +1 check-in
  await claim(uid, 'quiz', [0, 0, 0]); // +2 quiz
  const r = await redeem(uid, 'test-pdf'); // -1 redeem (balance 3 -> 2)
  assert.equal(r.ok, true);
  const all = await getHistory(uid);
  assert.equal(all.balance, 2);
  assert.deepEqual(all.entries.map((e) => e.type), ['redeem', 'task', 'task']); // newest first
  assert.deepEqual(all.entries.map((e) => e.amount), [-1, 2, 1]);
  assert.deepEqual(all.entries.map((e) => e.source), ['redeem', 'quiz', 'checkin']);
  const earn = await getHistory(uid, 'earning');
  assert.deepEqual(earn.totals, { checkin: 1, quiz: 2 });
  assert.equal(earn.entries.length, 2);
  assert.equal(earn.balance, 2);
});

test('referrals: /referrals lists 3 levels with name, joined date and lifetime', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const A = 111, B = 222, C = 333, D = 444;
  async function startWithRef(userId, referrer, name) {
    const res = await handleUpdate(msgUpdate({
      from: { id: userId, username: 'U' + userId, first_name: name },
      chat: { id: userId, username: 'U' + userId, first_name: name },
      text: '/start ref_' + referrer,
    }), envForPost);
    assert.equal(res.handled, 'ref_start');
    assert.equal(res.ok, true);
  }
  await startWithRef(B, A, 'Babul');
  await startWithRef(C, B, 'Champa');
  await startWithRef(D, C, 'Dalim');
  await claim(B, 'checkin');
  await claim(C, 'checkin');
  const res = await getReferrals(A);
  // Flat 10 + 5 plus commissions 0.03 + 0.02.
  assert.equal(res.referral_earnings, 15.05);
  assert.deepEqual(res.referrals.map((r) => [r.user_id, r.level]), [[222, 1], [333, 2], [444, 3]]);
  assert.equal(res.referrals[0].name, 'Babul');
  assert.equal(res.referrals[0].joined, dhakaDateStr());
  assert.equal(res.referrals[0].lifetime, 11.03); // 1 own check-in + 10 flat + 0.03 commission for C
  assert.equal(res.referrals[1].name, 'Champa');
  assert.equal(res.referrals[2].name, 'Dalim');
  assert.equal(res.referrals[2].lifetime, 0); // D has not checked in yet
  // A user with no referrals gets an empty list.
  assert.deepEqual(await getReferrals(D), { referral_earnings: 0, referrals: [] });
});

test('device: same device, second account gets device_conflict on /tasks and claims', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const dev = 'dev-test-123';
  const A = 111, B = 222;
  const first = await getTasks(A, '&device_id=' + dev);
  assert.equal(first.device_conflict, false);
  assert.equal(await kv.get('zdev:' + dev), '111');
  assert.equal(await kv.get('zdevu:' + A), dev);
  // A different user on the same device is flagged and blocked.
  const second = await getTasks(B, '&device_id=' + dev);
  assert.equal(second.device_conflict, true);
  assert.deepEqual(await claim(B, 'checkin', undefined, dev), { ok: false, reason: 'device_conflict' });
  // The first account is unaffected on the same device.
  assert.deepEqual(await claim(A, 'checkin', undefined, dev), { ok: true, balance: 1, credited: 1, streak: 1 });
  // A different device is fine for B.
  const other = await getTasks(B, '&device_id=dev-other-9');
  assert.equal(other.device_conflict, false);
  assert.deepEqual(await claim(B, 'checkin', undefined, 'dev-other-9'), { ok: true, balance: 1, credited: 1, streak: 1 });
  // The binding is never overwritten: the original device still belongs to A.
  assert.equal(await kv.get('zdev:' + dev), '111');
});

// ---------- v19: week / month helpers ----------

test('v19: dhakaWeekKey is ISO (Mon first) and dhakaMonthKey/prevMonthKey handle year boundaries', () => {
  assert.equal(dhakaWeekKey(new Date('2026-11-09T00:00:00Z')), '2026-W46'); // Monday
  assert.equal(dhakaWeekKey(new Date('2026-11-15T12:00:00Z')), '2026-W46'); // Sunday, same week
  assert.equal(dhakaWeekKey(new Date('2026-11-16T00:00:00Z')), '2026-W47'); // next Monday
  assert.equal(dhakaWeekKey(new Date('2026-01-01T00:00:00Z')), '2026-W01'); // Thursday, week 1
  assert.equal(dhakaMonthKey(new Date('2026-11-09T00:00:00Z')), '2026-11');
  assert.equal(prevMonthKey('2026-01'), '2025-12');
  assert.equal(prevMonthKey('2026-11'), '2026-10');
  assert.equal(prevMonthKey('garbage'), null);
});

test('v19: rollSpinPrize follows the weight table at the boundaries', () => {
  // v26 weights: 1:0.45, 2:0.30, 3:0.12, 5:0.06, 10:0.019, 25:0.001, extra:0.05.
  assert.equal(rollSpinPrize(() => 0), 1);
  assert.equal(rollSpinPrize(() => 0.4499), 1);
  assert.equal(rollSpinPrize(() => 0.45), 2);
  assert.equal(rollSpinPrize(() => 0.7499), 2);
  assert.equal(rollSpinPrize(() => 0.75), 3);
  assert.equal(rollSpinPrize(() => 0.8699), 3);
  assert.equal(rollSpinPrize(() => 0.87), 5);
  assert.equal(rollSpinPrize(() => 0.9299), 5);
  assert.equal(rollSpinPrize(() => 0.93), 10);
  assert.equal(rollSpinPrize(() => 0.9489), 10);
  assert.equal(rollSpinPrize(() => 0.949), 25);
  assert.equal(rollSpinPrize(() => 0.9499), 25);
  assert.equal(rollSpinPrize(() => 0.95), 'extra');
  assert.equal(rollSpinPrize(() => 0.9999), 'extra');
  // Statistical sanity over 10,000 real rolls: 1 is the most common
  // (~45%), 25 is the rarest (expected ~10, must stay well under 1%),
  // 'extra' is ~5%.
  const counts = { 1: 0, 2: 0, 3: 0, 5: 0, 10: 0, 25: 0, extra: 0 };
  for (let i = 0; i < 10000; i++) counts[rollSpinPrize()]++;
  assert.ok(counts[1] > 4000, '1 ZERO should be ~45%, got ' + counts[1]);
  assert.ok(counts[2] > counts[3] && counts[3] > counts[5], 'tiers must order 2 > 3 > 5');
  assert.ok(counts[25] < 100, 'jackpot must stay under 1%, got ' + counts[25]);
  assert.ok(counts.extra > 300 && counts.extra < 700, 'extra spin should be ~5%, got ' + counts.extra);
  assert.deepEqual(Object.keys(counts).sort(), ['1', '10', '2', '25', '3', '5', 'extra']);
});

// ---------- v19: Lucky Spin ----------

async function claimBody(body) {
  const res = await worker.fetch(new Request('https://worker.test/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), envForPost);
  return res.json();
}

async function spinTaskState(userId) {
  const state = await getTasks(userId);
  return state.tasks.find((t) => t.id === 'spin_daily');
}

// ---------- v26: 4-spin redesign (replaces the v19 1/day strict spin) ----------

async function spinStart(userId, network, deviceId) {
  const body = { user_id: userId, network };
  if (deviceId !== undefined) body.device_id = deviceId;
  const res = await worker.fetch(new Request('https://worker.test/spin-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), envForPost);
  return res.json();
}

async function adsgramConfirm(userId, nonce, name) {
  const body = { user_id: userId, nonce };
  if (name !== undefined) body.name = name;
  const res = await worker.fetch(new Request('https://worker.test/adsgram-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), envForPost);
  return res.json();
}

// The stub's setChatMember applies to ALL channels, so 'member' makes
// all 4 gate joins pass at once.
async function unlockSpinGates(uid) {
  fetchStub.setChatMember('member');
  await claim(uid, 'checkin');
}

test('v26 spin: /claim spin_daily is gone (use /spin-start); /spin-start locked without check-in + joins; /tasks shows the lock + prize tiers + slots', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  assert.deepEqual(await claim(uid, 'spin_daily'), { ok: false, reason: 'use_spin_start' });
  const locked = await spinStart(uid, 'monetag');
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, 'locked');
  assert.ok(locked.missing.includes('checkin_today'));
  assert.ok(locked.missing.some((m) => m.startsWith('joins:')));
  assert.equal(await kv.get('zb:' + uid), null);
  // /tasks shows the same lock state plus the prize table and slots.
  const spin = await spinTaskState(uid);
  assert.equal(spin.done, false);
  assert.equal(spin.locked, true);
  assert.ok(spin.missing.includes('checkin_today'));
  assert.deepEqual(spin.prizes, SPIN_PRIZES.map((p) => ({ prize: p.prize, chance: p.weight * 100 })));
  assert.deepEqual(spin.slots, { total: 4, monetag: 2, adsgram: 2, extra: 0, base_left: 4 });
});

test('v26 spin: unlocked with check-in + all 4 joins; spin-start rolls a prize, a verified Monetag view credits it (ad task untouched)', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await unlockSpinGates(uid); // check-in 1 ZERO, all 4 joins verified
  const spin = await spinTaskState(uid);
  assert.equal(spin.locked, false);
  assert.deepEqual(spin.missing, []);
  assert.equal(spin.slots.total, 4);
  const start = await spinStart(uid, 'monetag');
  assert.equal(start.ok, true);
  assert.ok(start.spin_id);
  assert.ok([1, 2, 3, 5, 10, 25, 'extra'].includes(start.prize));
  assert.ok(start.ymid);
  // A rolled-but-unclaimed spin burns NO slot.
  assert.equal((await spinTaskState(uid)).slots.total, 4);
  // The verified Monetag view (spin-bound ymid) credits the prize.
  const credited = await monetagPostback({ user_id: uid, ymid: start.ymid, reward_event_type: 'valued' });
  assert.equal(credited.ok, true);
  if (start.prize === 'extra') {
    assert.equal(credited.prize, 'extra');
    assert.equal(credited.credited, 0);
    assert.equal(credited.balance, 1); // check-in only
    assert.equal(credited.spins_left, 4); // 3 base + 1 extra
    assert.equal(await kv.get('zt:' + uid + ':spin_extra_earned:' + dhakaDateStr()), '1');
  } else {
    assert.equal(credited.prize, start.prize);
    assert.equal(credited.credited, start.prize);
    assert.equal(credited.balance, 1 + start.prize);
    assert.equal(credited.spins_left, 3);
  }
  assert.equal(await kv.get('zt:' + uid + ':spin:' + dhakaDateStr()), '1');
  assert.equal(await kv.get('zt:' + uid + ':spin_mtg:' + dhakaDateStr()), '1');
  // The spin-bound ymid did NOT touch the ad task's cap.
  assert.equal((await spinTaskState(uid)).slots.total, credited.spins_left);
  const mtg = (await getTasks(uid)).tasks.find((t) => t.id === 'ad_monetag');
  assert.equal(mtg.claims_left_today, 5);
  // Replay of the same ymid is a duplicate, not a second credit.
  const replay = await monetagPostback({ user_id: uid, ymid: start.ymid, reward_event_type: 'valued' });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'already_credited');
});

test('v26 spin: no-fill never burns a slot — a pending spin blocks a second start, expiry frees it', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await unlockSpinGates(uid);
  const first = await spinStart(uid, 'adsgram');
  assert.equal(first.ok, true);
  assert.ok(first.nonce);
  const second = await spinStart(uid, 'monetag');
  assert.deepEqual(second, { ok: false, reason: 'spin_pending', spin_id: first.spin_id, network: 'adsgram' });
  assert.equal((await spinTaskState(uid)).slots.total, 4); // no slot burned
  // Expire the pending spin (10 min TTL) — a fresh start works.
  const pending = JSON.parse(await kv.get('zspin:pending:' + uid));
  pending.created_at = Date.now() - 11 * 60 * 1000;
  await kv.put('zspin:pending:' + uid, JSON.stringify(pending));
  const third = await spinStart(uid, 'monetag');
  assert.equal(third.ok, true);
  assert.notEqual(third.spin_id, first.spin_id);
});

test('v26 spin: 4 spins/day cap; extra-spin wins raise the cap to 6', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await unlockSpinGates(uid);
  const today = dhakaDateStr();
  // All 4 base slots used -> no spins left.
  await kv.put('zt:' + uid + ':spin_mtg:' + today, '2');
  await kv.put('zt:' + uid + ':spin_ads:' + today, '2');
  await kv.put('zt:' + uid + ':spin:' + today, '4');
  assert.deepEqual(await spinStart(uid, 'monetag'), { ok: false, reason: 'no_spins_left', spins_today: 4 });
  // Two '+1 free spin' wins earned -> 2 extra slots open (cap 6).
  await kv.put('zt:' + uid + ':spin_extra_earned:' + today, '2');
  const extra = await spinStart(uid, 'monetag');
  assert.equal(extra.ok, true);
  // At 6 total spins the cap is hard, even with extras left.
  await kv.put('zt:' + uid + ':spin:' + today, '6');
  await kv.delete('zspin:pending:' + uid);
  assert.deepEqual(await spinStart(uid, 'monetag'), { ok: false, reason: 'no_spins_left', spins_today: 6 });
  // Per-network cap: Monetag slots used, AdsGram still open.
  await kv.delete('zspin:pending:' + uid);
  await kv.put('zt:' + uid + ':spin:' + today, '2');
  await kv.put('zt:' + uid + ':spin_ads:' + today, '1');
  await kv.put('zt:' + uid + ':spin_extra_earned:' + today, '0');
  assert.deepEqual(await spinStart(uid, 'monetag'), { ok: false, reason: 'network_spins_used', network: 'monetag' });
  assert.equal((await spinStart(uid, 'adsgram')).ok, true);
});

test('v26 spin: AdsGram confirm credits a pending spin once; replay, unknown nonce and wrong user refused', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await unlockSpinGates(uid);
  assert.deepEqual(await adsgramConfirm(uid, 'bogus-nonce'), { ok: false, reason: 'unknown_nonce' });
  const start = await spinStart(uid, 'adsgram');
  assert.equal(start.ok, true);
  // Wrong user cannot spend another user's nonce.
  assert.deepEqual(await adsgramConfirm(999, start.nonce), { ok: false, reason: 'user_mismatch' });
  const credited = await adsgramConfirm(uid, start.nonce);
  assert.equal(credited.ok, true);
  assert.ok([1, 2, 3, 5, 10, 25, 'extra'].includes(credited.prize));
  // Replay of the same nonce is refused (one-time use).
  assert.deepEqual(await adsgramConfirm(uid, start.nonce), { ok: false, reason: 'unknown_nonce' });
  assert.equal(await kv.get('zt:' + uid + ':spin_ads:' + dhakaDateStr()), '1');
});

// ---------- v19: Leaderboard ----------

async function getLeaderboard(userId) {
  const res = await worker.fetch(new Request('https://worker.test/leaderboard?user_id=' + userId), envForPost);
  return res.json();
}

test('v19 leaderboard: weekly totals accumulate on real claims and order correctly', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const week = dhakaWeekKey();
  const A = 111, B = 222, C = 333;
  await claim(A, 'checkin'); // A: 1
  await claim(A, 'quiz', [0, 0, 0]); // A: 1 + 2 = 3
  await claim(B, 'checkin'); // B: 1
  await claim(C, 'quiz', [0, 0, 0]); // C: 2
  assert.equal(await kv.get('zw:' + A + ':' + week), '3');
  assert.equal(await kv.get('zw:' + B + ':' + week), '1');
  assert.equal(await kv.get('zw:' + C + ':' + week), '2');
  // Names are stored from /tasks and shown on the board.
  await getTasks(A, '&name=Arif');
  await getTasks(B, '&name=Babul');
  await getTasks(C, '&name=Champa');
  const board = await getLeaderboard(A);
  assert.equal(board.week, week);
  assert.deepEqual(board.top10.map((r) => [r.user_id, r.weekly_earned]), [[111, 3], [333, 2], [222, 1]]);
  assert.deepEqual(board.top10.map((r) => r.name), ['Arif', 'Champa', 'Babul']);
  assert.equal(board.my_rank, 1);
  assert.equal(board.my_weekly_earned, 3);
  const boardC = await getLeaderboard(C);
  assert.equal(boardC.my_rank, 2);
  assert.equal(boardC.my_weekly_earned, 2);
  // Nobody was top 3 last week, so no prize is claimable.
  assert.deepEqual(board.last_week_top3, []);
  assert.equal(board.my_last_week_rank, null);
  assert.equal(board.prize_claimable, false);
  assert.equal(board.my_prize, 0);
});

test('v19 leaderboard: last-week top 3 claim 50/30/20 once; rank 4 refused; old week expired', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member'); // v26: prize claims need all 4 joins
  const lastWeek = dhakaWeekKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  const A = 111, B = 222, C = 333, D = 444;
  await kv.put('zw:' + A + ':' + lastWeek, '40');
  await kv.put('zw:' + B + ':' + lastWeek, '30');
  await kv.put('zw:' + C + ':' + lastWeek, '20');
  await kv.put('zw:' + D + ':' + lastWeek, '10');
  await kv.put('zname:' + A, 'Arif');
  await kv.put('zname:' + B, 'Babul');
  await kv.put('zname:' + C, 'Champa');
  await kv.put('zname:' + D, 'Dalim');
  const board = await getLeaderboard(A);
  assert.equal(board.last_week, lastWeek);
  assert.deepEqual(board.last_week_top3.map((r) => [r.user_id, r.rank, r.weekly_earned]), [[111, 1, 40], [222, 2, 30], [333, 3, 20]]);
  assert.equal(board.prize_claimable, true);
  assert.equal(board.my_prize, 50);
  // Rank 1 claims 50.
  const first = await claimBody({ user_id: A, task: 'leaderboard_prize' });
  assert.deepEqual(first, { ok: true, balance: 50, credited: 50, rank: 1, week: lastWeek });
  assert.equal(await kv.get('zlb:' + A + ':' + lastWeek), '1');
  assert.equal(await kv.get('zb:' + A), '50');
  // Double-claim refused.
  assert.deepEqual(await claimBody({ user_id: A, task: 'leaderboard_prize' }), { ok: false, reason: 'already_claimed', week: lastWeek });
  assert.equal(await kv.get('zb:' + A), '50');
  // Rank 2 claims 30, rank 3 claims 20.
  assert.deepEqual(await claimBody({ user_id: B, task: 'leaderboard_prize' }), { ok: true, balance: 30, credited: 30, rank: 2, week: lastWeek });
  assert.deepEqual(await claimBody({ user_id: C, task: 'leaderboard_prize' }), { ok: true, balance: 20, credited: 20, rank: 3, week: lastWeek });
  // Rank 4 is not top 3.
  assert.deepEqual(await claimBody({ user_id: D, task: 'leaderboard_prize' }), { ok: false, reason: 'not_top3', week: lastWeek });
  // A week older than last week is expired.
  assert.deepEqual(await claimBody({ user_id: A, task: 'leaderboard_prize', week: '2026-W01' }), { ok: false, reason: 'expired', week: '2026-W01' });
  // The prize is in the earning history (type 'prize').
  const hist = await getHistory(A, 'earning');
  assert.ok(hist.entries.some((e) => e.type === 'prize' && e.amount === 50));
});

// ---------- v23: Religion reward PDFs (top performers) ----------

async function getReligion(userId) {
  const res = await worker.fetch(new Request('https://worker.test/religion?user_id=' + userId), envForPost);
  return res.json();
}

test('v23 religion: daily + monthly totals are written by creditTaskEarning', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const A = 111;
  await claim(A, 'checkin'); // 1
  await claim(A, 'quiz', [0, 0, 0]); // +2
  assert.equal(await kv.get('zlb:' + A + ':' + dhakaDateStr()), '3');
  assert.equal(await kv.get('zlb:' + A + ':' + dhakaMonthKey()), '3');
  assert.equal(await kv.get('zw:' + A + ':' + dhakaWeekKey()), '3');
});

test('v23 religion: /religion eligibility — daily/weekly/monthly top 3; rank 4 not eligible', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const today = dhakaDateStr();
  const month = dhakaMonthKey();
  const week = dhakaWeekKey();
  const A = 111, B = 222, C = 333, D = 444, E = 555;
  // Daily: A 40, B 30, C 20, D 10 (E earned nothing today).
  await kv.put('zlb:' + A + ':' + today, '40');
  await kv.put('zlb:' + B + ':' + today, '30');
  await kv.put('zlb:' + C + ':' + today, '20');
  await kv.put('zlb:' + D + ':' + today, '10');
  // Weekly: same four (E earned nothing this week).
  await kv.put('zw:' + A + ':' + week, '40');
  await kv.put('zw:' + B + ':' + week, '30');
  await kv.put('zw:' + C + ':' + week, '20');
  await kv.put('zw:' + D + ':' + week, '10');
  // Monthly: E (25) sits between B and C — top 3 by month only.
  await kv.put('zlb:' + A + ':' + month, '40');
  await kv.put('zlb:' + B + ':' + month, '30');
  await kv.put('zlb:' + E + ':' + month, '25');
  await kv.put('zlb:' + C + ':' + month, '20');
  await kv.put('zlb:' + D + ':' + month, '10');
  const relA = await getReligion(A);
  assert.equal(relA.eligible, true);
  assert.deepEqual(relA.ranks, { daily: 1, weekly: 1, monthly: 1 });
  assert.equal(relA.pdfs.length, 4);
  assert.deepEqual(relA.pdfs.map((p) => p.id), ['rel-fatiha', 'rel-ikhlas', 'rel-falaq-nas', 'rel-istighfar']);
  assert.ok(relA.pdfs.every((p) => p.claimed === false));
  // Rank 3 by day (C) is eligible; rank 4 by day (D) is not.
  const relC = await getReligion(C);
  assert.equal(relC.eligible, true);
  assert.equal(relC.ranks.daily, 3);
  const relD = await getReligion(D);
  assert.equal(relD.eligible, false);
  assert.deepEqual(relD.ranks, { daily: 4, weekly: 4, monthly: 5 });
  // E is top 3 by month only — still eligible.
  const relE = await getReligion(E);
  assert.equal(relE.eligible, true);
  assert.deepEqual(relE.ranks, { daily: null, weekly: null, monthly: 3 });
  // A user who earned nothing anywhere is not eligible.
  const relF = await getReligion(666);
  assert.equal(relF.eligible, false);
  assert.deepEqual(relF.ranks, { daily: null, weekly: null, monthly: null });
});

test('v23 religion: claim delivers BN+EN once, second claim refused, non-top refused', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const today = dhakaDateStr();
  const week = dhakaWeekKey();
  const A = 111, B = 222, C = 333, D = 444;
  await kv.put('zlb:' + A + ':' + today, '40');
  await kv.put('zlb:' + B + ':' + today, '30');
  await kv.put('zlb:' + C + ':' + today, '20');
  await kv.put('zlb:' + D + ':' + today, '10');
  await kv.put('zw:' + A + ':' + week, '40');
  await kv.put('zw:' + B + ':' + week, '30');
  await kv.put('zw:' + C + ':' + week, '20');
  await kv.put('zw:' + D + ':' + week, '10');
  // Register the PDF files (both languages) as the bot would hold them.
  await kv.put('pdf_file:rel-fatiha', 'FILE_FATIHA');
  await kv.put('pdf_file:rel-fatiha:en', 'FILE_FATIHA_EN');
  await kv.put('pdf_file:rel-ikhlas', 'FILE_IKHLAS');
  await kv.put('pdf_file:rel-ikhlas:en', 'FILE_IKHLAS_EN');
  // Rank 4 may not claim.
  assert.deepEqual(await claimBody({ user_id: D, task: 'religion_pdf', item_id: 'rel-fatiha' }), { ok: false, reason: 'not_top_performer' });
  // A paid tutorial is not a reward PDF.
  assert.deepEqual(await claimBody({ user_id: A, task: 'religion_pdf', item_id: 'ai-muse-guide' }), { ok: false, reason: 'not_reward_pdf' });
  // Rank 1 claims rel-fatiha: both language files delivered.
  const first = await claimBody({ user_id: A, task: 'religion_pdf', item_id: 'rel-fatiha' });
  assert.equal(first.ok, true);
  assert.equal(first.delivered, true);
  assert.equal(first.item_id, 'rel-fatiha');
  assert.ok(first.sale_id);
  assert.equal(await kv.get('zrel:' + A + ':rel-fatiha'), '1');
  const docs = tgBodies(fetchStub, 'sendDocument');
  assert.deepEqual(docs.map((d) => d.document), ['FILE_FATIHA', 'FILE_FATIHA_EN']);
  // The sale is recorded as a zero-amount reward, not a purchase.
  const sale = JSON.parse(await kv.get('sale:' + first.sale_id));
  assert.equal(sale.source, 'reward');
  assert.equal(sale.amount, 0);
  assert.equal(sale.status, 'delivered');
  // No "PDF বিক্রি হয়েছে" sale alert — the admin gets a reward message.
  const adminTexts = tgBodies(fetchStub, 'sendMessage').map((m) => m.text);
  assert.ok(!adminTexts.some((t) => /PDF বিক্রি হয়েছে/.test(t)));
  assert.ok(adminTexts.some((t) => /ধর্মীয় বইয়ের পুরস্কার/.test(t)));
  // /religion now shows rel-fatiha as claimed.
  assert.equal((await getReligion(A)).pdfs.find((p) => p.id === 'rel-fatiha').claimed, true);
  // Second claim of the same PDF is refused; a different PDF still works.
  assert.deepEqual(await claimBody({ user_id: A, task: 'religion_pdf', item_id: 'rel-fatiha' }), { ok: false, reason: 'already_claimed' });
  const second = await claimBody({ user_id: A, task: 'religion_pdf', item_id: 'rel-ikhlas' });
  assert.equal(second.ok, true);
  assert.equal(second.delivered, true);
  // Reward PDFs cannot be redeemed with ZERO or bought with Stars.
  assert.deepEqual(await redeem(A, 'rel-fatiha'), { ok: false, reason: 'not_redeemable' });
  const buyRes = await handleUpdate(msgUpdate({ text: '/start buy_rel-fatiha' }), envForPost);
  assert.equal(buyRes.handled, 'buy_start');
  assert.equal(buyRes.ok, false);
  assert.equal(buyRes.reason, 'reward_only');
  assert.equal(tgCalls(fetchStub, 'sendInvoice').length, 0);
  const zeroRes = await handleUpdate(msgUpdate({ text: '/start zero_rel-fatiha' }), envForPost);
  assert.equal(zeroRes.handled, 'zero_start');
  assert.equal(zeroRes.ok, false);
  assert.equal(zeroRes.reason, 'reward_only');
});

// ---------- v19: ZERO coupon ----------

async function getCoupons(userId) {
  const res = await worker.fetch(new Request('https://worker.test/coupons?user_id=' + userId), envForPost);
  return res.json();
}
async function verifyCoupon(code, userId) {
  const res = await worker.fetch(new Request('https://worker.test/coupon?code=' + encodeURIComponent(code) + '&user_id=' + userId), envForPost);
  return res.json();
}
async function useCoupon(userId, code) {
  const res = await worker.fetch(new Request('https://worker.test/coupon/use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, code }),
  }), envForPost);
  return res.json();
}

test('v19 coupon: redeem deducts 100 ZERO and returns a ZERO5- code; /coupons lists it', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '150');
  envForPost = makeEnv(kv);
  const res = await redeem(8507294759, 'coupon_5pct');
  assert.equal(res.ok, true);
  assert.equal(res.balance, 50);
  assert.equal(res.item_id, 'coupon_5pct');
  assert.match(res.code, /^ZERO5-[A-Z2-9]{6}$/);
  const stored = JSON.parse(await kv.get('zcoupon:' + res.code));
  assert.equal(stored.user_id, 8507294759);
  assert.equal(stored.used, false);
  assert.ok(stored.created_at);
  const list = await getCoupons(8507294759);
  assert.equal(list.coupons.length, 1);
  assert.equal(list.coupons[0].code, res.code);
  assert.equal(list.coupons[0].used, false);
  // History records the 100 ZERO spend.
  const hist = await getHistory(8507294759);
  assert.ok(hist.entries.some((e) => e.type === 'redeem' && e.amount === -100 && e.source === 'coupon'));
  // A second coupon works while the balance lasts (50 < 100, so it must fail).
  const second = await redeem(8507294759, 'coupon_5pct');
  assert.deepEqual(second, { ok: false, reason: 'insufficient_balance', balance: 50 });
  assert.equal(await kv.get('zb:8507294759'), '50');
});

test('v19 coupon: verify + use — used once, second use refused, another user cannot use it', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '100');
  envForPost = makeEnv(kv);
  const { code } = await redeem(8507294759, 'coupon_5pct');
  // Verify: owner + unused -> valid.
  assert.deepEqual(await verifyCoupon(code, 8507294759), { ok: true, valid: true, code });
  // Another user: not theirs.
  assert.deepEqual(await verifyCoupon(code, 111111111), { ok: false, reason: 'not_yours' });
  // Unknown code.
  assert.deepEqual(await verifyCoupon('ZERO5-ZZZZZZ', 8507294759), { ok: false, reason: 'not_found' });
  // Another user cannot spend it.
  assert.deepEqual(await useCoupon(111111111, code), { ok: false, reason: 'not_yours' });
  // Owner uses it once.
  const used = await useCoupon(8507294759, code);
  assert.equal(used.ok, true);
  assert.equal(used.code, code);
  assert.match(used.note, /BAZAR5/); // no-stack rule is stated in the response
  const stored = JSON.parse(await kv.get('zcoupon:' + code));
  assert.equal(stored.used, true);
  assert.ok(stored.used_at);
  // Second use refused, and verify now reports already_used.
  assert.deepEqual(await useCoupon(8507294759, code), { ok: false, reason: 'already_used' });
  assert.deepEqual(await verifyCoupon(code, 8507294759), { ok: false, reason: 'already_used' });
  const list = await getCoupons(8507294759);
  assert.equal(list.coupons[0].used, true);
});

// ---------- v19: monthly check-in bonus ----------

// Days '01'..'30' of the current Dhaka month, excluding today's day,
// so seeded check-in keys never collide with the real claim below.
function otherDaysThisMonth(n) {
  const today = dhakaDateStr();
  const todayDay = today.slice(8, 10);
  const days = [];
  for (let d = 1; d <= 30 && days.length < n; d++) {
    const dd = String(d).padStart(2, '0');
    if (dd !== todayDay) days.push(dd);
  }
  return days;
}
async function seedCheckinDays(kv, uid, month, days) {
  for (const dd of days) await kv.put('zt:' + uid + ':checkin:' + month + '-' + dd, '1');
}

test('v19 monthly: 24th check-in pays no bonus; 25th pays +50 once; 26th pays nothing more', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const month = dhakaMonthKey();
  // 23 seeded days + today's claim = 24th check-in: no bonus.
  const uid24 = 8507294759;
  await seedCheckinDays(kv, uid24, month, otherDaysThisMonth(23));
  const r24 = await claim(uid24, 'checkin');
  assert.equal(r24.ok, true);
  assert.equal(r24.monthly_bonus, undefined);
  assert.equal(await kv.get('zb:' + uid24), '1');
  const progress24 = (await getTasks(uid24)).monthly_progress;
  assert.equal(progress24.count, 24);
  assert.equal(progress24.target, 25);
  assert.equal(progress24.reward, 50);
  assert.equal(progress24.claimed_this_month, false);
  assert.equal(progress24.month, month);
  // A second user: 24 seeded days + today's claim = 25th check-in: +50 once.
  const uid = 8507294758;
  await seedCheckinDays(kv, uid, month, otherDaysThisMonth(24));
  const r25 = await claim(uid, 'checkin');
  assert.equal(r25.ok, true);
  assert.equal(r25.monthly_bonus, 50);
  assert.equal(r25.monthly_count, 25);
  assert.equal(r25.balance, 51); // 1 (Day-1 check-in) + 50 bonus
  assert.equal(await kv.get('zmb:' + uid + ':' + month), '1');
  const progress25 = (await getTasks(uid)).monthly_progress;
  assert.equal(progress25.count, 25);
  assert.equal(progress25.claimed_this_month, true);
  // History records the bonus under its own type.
  const hist = await getHistory(uid, 'earning');
  assert.ok(hist.entries.some((e) => e.type === 'monthly_bonus' && e.amount === 50));
  // 26th check-in (another simulated day): no second bonus.
  const yesterday = dhakaDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
  await kv.delete('zt:' + uid + ':checkin:' + dhakaDateStr());
  await kv.put('zl:' + uid + ':lastcheckin', yesterday);
  await kv.put('zs:' + uid, '1');
  const r26 = await claim(uid, 'checkin');
  assert.equal(r26.ok, true);
  assert.equal(r26.monthly_bonus, undefined);
  assert.equal(r26.balance, 53); // 51 + 2 (Day-2 check-in)
  assert.equal((await getHistory(uid, 'earning')).entries.filter((e) => e.type === 'monthly_bonus').length, 1);
});

test('v19 monthly: a new month resets the count (last month\'s 25 do not count)', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  const month = dhakaMonthKey();
  const lastMonth = prevMonthKey(month);
  // 25 check-ins last month + the bonus already claimed then.
  await seedCheckinDays(kv, uid, lastMonth, otherDaysThisMonth(25));
  await kv.put('zmb:' + uid + ':' + lastMonth, '1');
  // This month's first check-in: count 1, no bonus.
  const res = await claim(uid, 'checkin');
  assert.equal(res.ok, true);
  assert.equal(res.monthly_bonus, undefined);
  const progress = (await getTasks(uid)).monthly_progress;
  assert.equal(progress.count, 1);
  assert.equal(progress.claimed_this_month, false);
  assert.equal(progress.month, month);
});

// ---------- v19: referral contest ----------

async function getContest(userId) {
  const res = await worker.fetch(new Request('https://worker.test/referral-contest?user_id=' + userId), envForPost);
  return res.json();
}
async function startWithRef(userId, referrer, name) {
  const res = await handleUpdate(msgUpdate({
    from: { id: userId, username: 'U' + userId, first_name: name || ('U' + userId) },
    chat: { id: userId, username: 'U' + userId, first_name: name || ('U' + userId) },
    text: '/start ref_' + referrer,
  }), envForPost);
  assert.equal(res.handled, 'ref_start');
  assert.equal(res.ok, true);
}

test('v19 contest: monthly L1 counts increment only on paid L1 referrals', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const month = dhakaMonthKey();
  const A = 111, B = 222, C = 333;
  await startWithRef(B, A, 'Babul');
  await startWithRef(C, B, 'Champa');
  // B's first check-in pays A the L1 flat bonus -> A's contest count 1.
  await claim(B, 'checkin');
  assert.equal(await kv.get('zrefm:' + A + ':' + month), '1');
  assert.ok(Number(await kv.get('zrefmt:' + A + ':' + month)) > 0);
  // C's first check-in pays B the L1 flat bonus -> B's contest count 1.
  // A only gets the L2 flat bonus here, so A's contest count stays 1.
  await claim(C, 'checkin');
  assert.equal(await kv.get('zrefm:' + B + ':' + month), '1');
  assert.equal(await kv.get('zrefm:' + A + ':' + month), '1');
  const contest = await getContest(A);
  assert.equal(contest.month, month);
  assert.deepEqual(contest.top5.map((r) => [r.user_id, r.referrals]), [[111, 1], [222, 1]]);
  assert.equal(contest.my_referrals, 1);
  assert.equal(contest.am_i_winner, false); // last month had no contest
  assert.equal(contest.last_month.winner, null);
});

test('v19 contest: listing order + tie-break by earliest reach', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const month = dhakaMonthKey();
  const X = 111, Y = 222, Z = 333;
  // X and Y tie at 5 referrals; X reached 5 first (earlier timestamp).
  await kv.put('zrefm:' + X + ':' + month, '5');
  await kv.put('zrefmt:' + X + ':' + month, '1794000000000');
  await kv.put('zrefm:' + Y + ':' + month, '5');
  await kv.put('zrefmt:' + Y + ':' + month, '1794100000000');
  await kv.put('zrefm:' + Z + ':' + month, '3');
  await kv.put('zrefmt:' + Z + ':' + month, '1793900000000');
  await kv.put('zname:' + X, 'Arif');
  await kv.put('zname:' + Y, 'Babul');
  await kv.put('zname:' + Z, 'Champa');
  const contest = await getContest(X);
  assert.deepEqual(contest.top5.map((r) => [r.user_id, r.rank, r.referrals]), [[111, 1, 5], [222, 2, 5], [333, 3, 3]]);
  assert.deepEqual(contest.top5.map((r) => r.name), ['Arif', 'Babul', 'Champa']);
});

test('v19 contest: last month\'s winner claims one free PDF; non-winner, double-claim and invalid item refused', async () => {
  const kv = makeKv();
  await kv.put('pdf_file:test-pdf', 'FILE123');
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member'); // v26: prize claims need all 4 joins
  const month = dhakaMonthKey();
  const lastMonth = prevMonthKey(month);
  const W = 111, R = 222;
  // Last month: W won with 4 referrals, R had 2.
  await kv.put('zrefm:' + W + ':' + lastMonth, '4');
  await kv.put('zrefmt:' + W + ':' + lastMonth, '1793000000000');
  await kv.put('zrefm:' + R + ':' + lastMonth, '2');
  await kv.put('zrefmt:' + R + ':' + lastMonth, '1793100000000');
  await kv.put('zname:' + W, 'Arif');
  await kv.put('zname:' + R, 'Babul');
  const contest = await getContest(W);
  assert.deepEqual(contest.last_month.winner, { user_id: 111, name: 'Arif', referrals: 4 });
  assert.equal(contest.am_i_winner, true);
  assert.equal(contest.prize_claimed, false);
  assert.equal((await getContest(R)).am_i_winner, false);
  // Invalid item refused (unknown id, and the free store-guide).
  assert.deepEqual(await claimBody({ user_id: W, task: 'referral_contest_prize', item_id: 'nope' }), { ok: false, reason: 'invalid_item' });
  assert.deepEqual(await claimBody({ user_id: W, task: 'referral_contest_prize', item_id: 'store-guide' }), { ok: false, reason: 'invalid_item' });
  // Non-winner refused.
  assert.deepEqual(await claimBody({ user_id: R, task: 'referral_contest_prize', item_id: 'test-pdf' }), { ok: false, reason: 'not_winner' });
  // Winner claims the free PDF: delivered, sale recorded as contest prize.
  const win = await claimBody({ user_id: W, task: 'referral_contest_prize', item_id: 'test-pdf' });
  assert.equal(win.ok, true);
  assert.equal(win.delivered, true);
  assert.equal(win.item_id, 'test-pdf');
  assert.ok(win.sale_id);
  assert.equal(tgBodies(fetchStub, 'sendDocument').length, 1);
  assert.equal(tgBodies(fetchStub, 'sendDocument')[0].document, 'FILE123');
  const sale = JSON.parse(await kv.get('sale:' + win.sale_id));
  assert.equal(sale.source, 'contest');
  assert.equal(sale.amount, 0);
  assert.equal(sale.currency, 'ZERO');
  assert.equal(sale.status, 'delivered');
  assert.equal(await kv.get('zcontest:' + W + ':' + lastMonth), '1');
  assert.equal((await getContest(W)).prize_claimed, true);
  // Double-claim refused (and no second PDF sent).
  assert.deepEqual(await claimBody({ user_id: W, task: 'referral_contest_prize', item_id: 'shopping-guide' }), { ok: false, reason: 'already_claimed' });
  assert.equal(tgBodies(fetchStub, 'sendDocument').length, 1);
});

// ---------- v20: Pickaxe-style Daily Reward strip + countdowns ----------

test('v20 msUntilDhakaMidnight: (0, 24h], ~1s before midnight, ~24h at midnight', () => {
  const v = msUntilDhakaMidnight();
  assert.ok(v > 0 && v <= 24 * 60 * 60 * 1000);
  // 23:59:59 Dhaka -> ~1s left.
  const almost = msUntilDhakaMidnight(new Date('2026-11-09T17:59:59Z'));
  assert.ok(almost > 0 && almost <= 1500);
  // Exactly 00:00:00 Dhaka -> a full day left.
  assert.equal(msUntilDhakaMidnight(new Date('2026-11-09T18:00:00Z')), 24 * 60 * 60 * 1000);
  // 12:00 Dhaka -> 12h left.
  assert.equal(msUntilDhakaMidnight(new Date('2026-11-09T06:00:00Z')), 12 * 60 * 60 * 1000);
});

test('v20 dailyRewardPosition: cycle position for claimed/unclaimed streaks', () => {
  assert.equal(dailyRewardPosition(0, false), 1);
  assert.equal(dailyRewardPosition(0, true), 1);
  assert.equal(dailyRewardPosition(1, true), 1);
  assert.equal(dailyRewardPosition(1, false), 2);
  assert.equal(dailyRewardPosition(4, true), 4);
  assert.equal(dailyRewardPosition(4, false), 5);
  assert.equal(dailyRewardPosition(7, true), 7);
  assert.equal(dailyRewardPosition(7, false), 1);
  assert.equal(dailyRewardPosition(8, true), 1);
  assert.equal(dailyRewardPosition(8, false), 2);
  assert.equal(dailyRewardPosition(14, true), 7);
  assert.equal(dailyRewardPosition(15, false), 2);
});

test('v20 /tasks: fresh user gets daily_reward (day 1 today), ad 5 left, community 0/5', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const data = await getTasks(8507294759);
  assert.deepEqual(data.daily_reward.days, [1, 2, 3, 5, 7, 10, 15].map((r, i) => ({ day: i + 1, reward: r, claimed: false, is_today: i === 0 })));
  assert.equal(data.daily_reward.streak, 0);
  assert.equal(data.daily_reward.claimed_today, false);
  assert.equal(data.daily_reward.today_reward, 1);
  assert.ok(data.daily_reward.next_in_ms > 0 && data.daily_reward.next_in_ms <= 24 * 60 * 60 * 1000);
  const ad = data.tasks.find((t) => t.id === 'ad');
  assert.equal(ad.claims_left_today, 5);
  assert.ok(ad.resets_in_ms > 0 && ad.resets_in_ms <= 24 * 60 * 60 * 1000);
  assert.equal(data.tasks.find((t) => t.id === 'quiz').resets_in_ms, undefined);
  assert.equal(data.tasks.find((t) => t.id === 'react_daily').resets_in_ms, undefined);
  assert.deepEqual(data.community_progress, { done: 0, total: 5 });
  // Profile already carries level/xp/xp_next (level_progress) — reused, not duplicated.
  assert.equal(data.profile.level, 1);
  assert.equal(data.profile.xp, 0);
  assert.equal(data.profile.xp_next, 50);
});

test('v20 daily_reward: streak 1 claimed today — day 1 is today, nothing claimed before it', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  await claim(8507294759, 'checkin');
  const data = await getTasks(8507294759);
  assert.equal(data.daily_reward.streak, 1);
  assert.equal(data.daily_reward.claimed_today, true);
  assert.equal(data.daily_reward.today_reward, 1);
  assert.deepEqual(data.daily_reward.days.map((d) => d.claimed), [false, false, false, false, false, false, false]);
  assert.deepEqual(data.daily_reward.days.map((d) => d.is_today), [true, false, false, false, false, false, false]);
});

test('v20 daily_reward: streak 4, not claimed today — days 1-4 claimed, day 5 today, reward 7', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  await kv.put('zs:8507294759', '4');
  await kv.put('zl:8507294759:lastcheckin', prevDhakaDate(dhakaDateStr()));
  const data = await getTasks(8507294759);
  assert.equal(data.daily_reward.streak, 4);
  assert.equal(data.daily_reward.claimed_today, false);
  assert.equal(data.daily_reward.today_reward, 7);
  assert.deepEqual(data.daily_reward.days.map((d) => d.claimed), [true, true, true, true, false, false, false]);
  assert.deepEqual(data.daily_reward.days.map((d) => d.is_today), [false, false, false, false, true, false, false]);
});

test('v20 daily_reward: streak 7 unclaimed starts a fresh cycle; claiming makes streak 8, day 1 today', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await kv.put('zs:' + uid, '7');
  await kv.put('zl:' + uid + ':lastcheckin', prevDhakaDate(dhakaDateStr()));
  let data = await getTasks(uid);
  assert.equal(data.daily_reward.today_reward, 15);
  assert.deepEqual(data.daily_reward.days.map((d) => d.claimed), [false, false, false, false, false, false, false]);
  assert.deepEqual(data.daily_reward.days.map((d) => d.is_today), [true, false, false, false, false, false, false]);
  const res = await claim(uid, 'checkin');
  assert.deepEqual(res, { ok: true, balance: 15, credited: 15, streak: 8 });
  data = await getTasks(uid);
  assert.equal(data.daily_reward.streak, 8);
  assert.equal(data.daily_reward.claimed_today, true);
  assert.equal(data.daily_reward.today_reward, 15);
  assert.deepEqual(data.daily_reward.days.map((d) => d.claimed), [false, false, false, false, false, false, false]);
  assert.deepEqual(data.daily_reward.days.map((d) => d.is_today), [true, false, false, false, false, false, false]);
});

test('v20 daily_reward: streak 7 claimed today — days 1-6 claimed, day 7 (15 ZERO) today', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await kv.put('zs:' + uid, '7');
  await kv.put('zl:' + uid + ':lastcheckin', dhakaDateStr());
  await kv.put('zt:' + uid + ':checkin:' + dhakaDateStr(), '1');
  const data = await getTasks(uid);
  assert.equal(data.daily_reward.streak, 7);
  assert.equal(data.daily_reward.claimed_today, true);
  assert.equal(data.daily_reward.today_reward, 15);
  assert.deepEqual(data.daily_reward.days.map((d) => d.claimed), [true, true, true, true, true, true, false]);
  assert.deepEqual(data.daily_reward.days.map((d) => d.is_today), [false, false, false, false, false, false, true]);
  assert.equal(data.daily_reward.days[6].reward, 15);
});

test('v20 ad: claims_left_today drops with claims; resets_in_ms present', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  // Seed 3 ad claims today directly (the claim path needs a click first).
  await kv.put('zt:' + uid + ':ad:' + dhakaDateStr(), '3');
  const data = await getTasks(uid);
  const ad = data.tasks.find((t) => t.id === 'ad');
  assert.equal(ad.claims_left_today, 2);
  assert.equal(ad.done, false);
  assert.ok(ad.resets_in_ms > 0 && ad.resets_in_ms <= 24 * 60 * 60 * 1000);
  await kv.put('zt:' + uid + ':ad:' + dhakaDateStr(), '5');
  const full = await getTasks(uid);
  assert.equal(full.tasks.find((t) => t.id === 'ad').claims_left_today, 0);
  assert.equal(full.tasks.find((t) => t.id === 'ad').done, true);
});

test('v20 quiz + react: resets_in_ms appears only once done today', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await claim(uid, 'react_daily');
  const correct = QUIZ_QUESTIONS.map((q) => q.correct);
  await claim(uid, 'quiz', correct);
  const data = await getTasks(uid);
  const react = data.tasks.find((t) => t.id === 'react_daily');
  const quiz = data.tasks.find((t) => t.id === 'quiz');
  assert.equal(react.done, true);
  assert.ok(react.resets_in_ms > 0 && react.resets_in_ms <= 24 * 60 * 60 * 1000);
  assert.equal(quiz.done, true);
  assert.ok(quiz.resets_in_ms > 0 && quiz.resets_in_ms <= 24 * 60 * 60 * 1000);
  assert.deepEqual(data.community_progress, { done: 1, total: 5 });
});

test('v20 community_progress: joins shrink the total once done, react counts as done', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  fetchStub.setChatMember('member');
  let data = await getTasks(uid);
  assert.deepEqual(data.community_progress, { done: 0, total: 5 });
  await claim(uid, 'join_bazargoo');
  data = await getTasks(uid);
  assert.deepEqual(data.community_progress, { done: 0, total: 4 });
  await claim(uid, 'react_daily');
  data = await getTasks(uid);
  assert.deepEqual(data.community_progress, { done: 1, total: 4 });
});

// ---------- v26: Wallet + Deposit + Withdraw + Promote + 4-spin ----------

async function postJson(path, body) {
  const res = await worker.fetch(new Request('https://worker.test' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), envForPost);
  return res.json();
}
async function getJson(path) {
  const res = await worker.fetch(new Request('https://worker.test' + path), envForPost);
  return res.json();
}
async function getWallet(userId) {
  return getJson('/wallet?user_id=' + userId);
}
async function depositStart(userId, currency, amount) {
  return postJson('/deposit-start', { user_id: userId, currency, amount });
}
async function depositConfirm(userId, currency, txid, amount) {
  return postJson('/deposit-confirm', { user_id: userId, currency, txid, amount });
}
async function withdraw(userId, currency, amount, toWallet, address) {
  const body = { user_id: userId, currency, amount };
  if (toWallet !== undefined) body.to_wallet = toWallet;
  if (address !== undefined) body.address = address;
  return postJson('/withdraw', body);
}
async function promoteSubmit(userId, body) {
  return postJson('/promote-submit', { user_id: userId, ...body });
}
async function promoteConfirm(userId, body) {
  return postJson('/promote-confirm', { user_id: userId, ...body });
}
async function buyPdfWallet(userId, itemId, currency) {
  return postJson('/buy-pdf-wallet', { user_id: userId, item_id: itemId, currency });
}
async function sponsorStart(userId, promoId) {
  return postJson('/sponsor-start', { user_id: userId, promo_id: promoId });
}

const ZERO_ADDR = 't1' + 'A'.repeat(33); // valid t1 address shape (35 chars)
const GRAM_ADDR = 'EQ' + 'A'.repeat(46); // valid TON user-friendly shape (48 chars)
const GRAM_ENV = { GRAM_RECEIVING_ADDRESS: GRAM_ADDR, GRAM_PAYOUT_FLOAT: '20' };
const ZERO_PAYOUT_ADDR = 't1atEkz24YDS4LDa5GeSQsnMxc7eF7CupWZ'; // Angela's payout wallet (provided 2026-11-09)
const ZERO_PAYOUT_ENV = { ZERO_PAYOUT_ADDRESS: ZERO_PAYOUT_ADDR };

function seedPromo(kv, overrides = {}) {
  const promo = {
    id: 'PR-20261109-ABCD',
    user_id: 999,
    title: 'আমার পেজ',
    url: 'https://example.com/promo',
    type: 'post',
    currency: 'zero',
    budget: 100,
    budget_usd: null,
    paid_amount: 100,
    rate: null,
    completions: 80,
    remaining: 80,
    completed: 0,
    reward_per_completion: 1,
    target_channel: null,
    status: 'pending_approval',
    created_at: new Date().toISOString(),
    ...overrides,
  };
  return kv.put('zpromo:' + promo.id, JSON.stringify(promo)).then(() => promo);
}

function adminCallbackUpdate(fromId, data, text) {
  return {
    update_id: 9,
    callback_query: {
      id: 'cq-2',
      from: { id: fromId },
      message: { message_id: 56, chat: { id: ADMIN_ID }, text: text || 'admin message' },
      data,
    },
  };
}

// ----- Wallet + gates -----

test('v26 wallet: fresh user — zero balances, gates 0/4, withdraw rules, GRAM not configured', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const w = await getWallet(8507294759);
  assert.equal(w.ok, true);
  assert.deepEqual(w.balance, { zero: 0, gram: 0, stars: 0 });
  assert.equal(w.earned_zero, 0);
  assert.equal(w.gates.joins_done, 0);
  assert.equal(w.gates.all_joined, false);
  assert.equal(w.gates.complete, 0);
  assert.equal(w.gates.total, 6);
  assert.deepEqual(w.withdraw_rules.zero, { fee: 0, minimum: 0, daily_cap: WITHDRAW_ZERO_DAILY_CAP, manual_above: WITHDRAW_MANUAL_ABOVE_ZERO });
  assert.equal(w.withdraw_rules.gram.minimum, WITHDRAW_GRAM_MIN);
  assert.equal(w.withdraw_rules.stars.withdrawable, false);
  assert.equal(w.withdraw_rules.stars.minimum_deposit, DEPOSIT_MIN_STARS);
  assert.equal(w.gram_configured, false);
  assert.equal(w.zero_payout_configured, false);
});

test('v26 wallet: zero_payout_configured true when ZERO_PAYOUT_ADDRESS is set', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv, ZERO_PAYOUT_ENV);
  const w = await getWallet(8507294759);
  assert.equal(w.ok, true);
  assert.equal(w.zero_payout_configured, true);
  assert.equal(w.gram_configured, false);
});

test('v26 gates: /tasks returns the gates block; all-joined after the bot sees membership; checklist completes', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  let state = await getTasks(uid);
  assert.equal(state.gates.joins_done, 0);
  assert.equal(state.gates.all_joined, false);
  fetchStub.setChatMember('member');
  state = await getTasks(uid);
  assert.equal(state.gates.joins_done, 4);
  assert.equal(state.gates.all_joined, true);
  assert.equal(state.gates.complete, 4);
  // Claiming the joins invalidates the gates cache, so /tasks shows
  // the fresh membership right away.
  await claim(uid, 'join_bazargoo');
  await claim(uid, 'join_earnplaygame');
  await claim(uid, 'join_cryptoguru');
  await claim(uid, 'join_adsterratt');
  await claim(uid, 'checkin');
  await claim(uid, 'react_daily');
  state = await getTasks(uid);
  assert.equal(state.gates.complete, 6);
  assert.equal(state.gates.checkin_done, true);
  assert.equal(state.gates.react_done, true);
});

// ----- Stars deposit -----

test('v26 deposit: validatePreCheckout accepts deposit_stars payloads (min 10), rejects below-min / wrong amount', () => {
  assert.deepEqual(
    validatePreCheckout({ invoice_payload: 'deposit_stars:111:10', currency: 'XTR', total_amount: 10 }),
    { ok: true, deposit: true, user_id: 111, stars: 10 });
  assert.equal(validatePreCheckout({ invoice_payload: 'deposit_stars:111:5', currency: 'XTR', total_amount: 5 }).ok, false);
  assert.equal(validatePreCheckout({ invoice_payload: 'deposit_stars:111:10', currency: 'XTR', total_amount: 9 }).ok, false);
  assert.equal(validatePreCheckout({ invoice_payload: 'deposit_stars:111:10', currency: 'USD', total_amount: 10 }).ok, false);
});

test('v26 deposit: successful_payment with a deposit payload credits wallet Stars once (duplicate ignored)', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const update = msgUpdate({
    successful_payment: {
      currency: 'XTR',
      total_amount: 10,
      invoice_payload: 'deposit_stars:8507294759:10',
      telegram_payment_charge_id: 'DEP1',
    },
  });
  const res = await handleUpdate(update, env);
  assert.equal(res.handled, 'successful_payment');
  assert.equal(res.ok, true);
  assert.equal(res.deposit, true);
  assert.equal(res.stars, 10);
  assert.equal(await kv.get('zwb:8507294759:stars'), '10');
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => /জমা হয়েছে/.test(m.text)));
  const dup = await handleUpdate(update, env);
  assert.equal(dup.duplicate, true);
  assert.equal(await kv.get('zwb:8507294759:stars'), '10');
});

// ----- Wallet PDF buy -----

test('v26 wallet buy: ZERO wallet balance buys a PDF (delivered, sale recorded); insufficient / reward-only / free refused', async () => {
  const kv = makeKv();
  await kv.put('zwb:8507294759:zero', '10');
  await kv.put('pdf_file:test-pdf', 'FILE123');
  envForPost = makeEnv(kv);
  const res = await buyPdfWallet(8507294759, 'test-pdf', 'zero');
  assert.equal(res.ok, true);
  assert.equal(res.balance, 9);
  assert.equal(res.delivered, true);
  assert.ok(res.sale_id);
  assert.equal(tgBodies(fetchStub, 'sendDocument').length, 1);
  const sale = JSON.parse(await kv.get('sale:' + res.sale_id));
  assert.equal(sale.source, 'wallet_zero');
  assert.equal(sale.amount, 1);
  assert.equal(sale.currency, 'ZERO');
  // After the first buy the wallet holds 9 ZERO — a 10 ZERO PDF is
  // out of reach (shopping-guide at 5 would still be affordable).
  assert.deepEqual(await buyPdfWallet(8507294759, 'safe-shopping-guide', 'zero'), { ok: false, reason: 'insufficient_balance', balance: 9, price: 10 });
  // Religion books are reward-only — never buyable, not even with the wallet.
  assert.deepEqual(await buyPdfWallet(8507294759, 'rel-fatiha', 'zero'), { ok: false, reason: 'reward_only' });
  assert.deepEqual(await buyPdfWallet(8507294759, 'store-guide', 'zero'), { ok: false, reason: 'invalid_item' });
});

test('v26 wallet buy: prepaid Stars buy a PDF; insufficient refused', async () => {
  const kv = makeKv();
  await kv.put('zwb:8507294759:stars', '3');
  await kv.put('pdf_file:test-pdf', 'FILE123');
  envForPost = makeEnv(kv);
  const res = await buyPdfWallet(8507294759, 'test-pdf', 'stars');
  assert.equal(res.ok, true);
  assert.equal(res.balance, 2);
  assert.equal(res.delivered, true);
  assert.deepEqual(await buyPdfWallet(8507294759, 'shopping-guide', 'stars'), { ok: false, reason: 'insufficient_balance', balance: 2, price: 5 });
});

// ----- Withdraw -----

test('v26 withdraw: ZERO has no fee and no minimum — 1 ZERO out, daily cap enforced, save mode moves to wallet', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '2000');
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  await claim(8507294759, 'react_withdraw'); // v27 withdraw gate
  const one = await withdraw(8507294759, 'zero', 1, 'instant', ZERO_ADDR);
  assert.equal(one.ok, true);
  assert.equal(one.mode, 'instant');
  assert.equal(one.status, 'pending_send');
  assert.match(one.payout_id, /^PO-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(await kv.get('zb:8507294759'), '1999');
  const payout = JSON.parse(await kv.get('zpayout:' + one.payout_id));
  assert.equal(payout.amount, 1);
  assert.equal(payout.address, ZERO_ADDR);
  // Daily cap: 1 already out today, 1000 more would exceed 1000.
  assert.deepEqual(await withdraw(8507294759, 'zero', 1000, 'instant', ZERO_ADDR), { ok: false, reason: 'daily_cap', cap: WITHDRAW_ZERO_DAILY_CAP, used_today: 1 });
  // Save mode: earned ZERO moves into the wallet, no payout record.
  const saved = await withdraw(8507294759, 'zero', 5, 'save');
  assert.equal(saved.ok, true);
  assert.equal(saved.mode, 'save');
  assert.equal(saved.wallet_balance, 5);
  assert.equal(await kv.get('zb:8507294759'), '1994');
  assert.equal(saved.payout_id, undefined);
});

test('v26 withdraw: joins required; invalid address refused; above 500 needs manual approval + admin alert', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '1000');
  envForPost = makeEnv(kv, ZERO_PAYOUT_ENV);
  assert.deepEqual(await withdraw(8507294759, 'zero', 1, 'instant', ZERO_ADDR), { ok: false, reason: 'joins_required', joins_done: 0 });
  fetchStub.setChatMember('member');
  await claim(8507294759, 'react_withdraw'); // v27 withdraw gate
  assert.deepEqual(await withdraw(8507294759, 'zero', 1, 'instant', 'not-an-address'), { ok: false, reason: 'invalid_address' });
  const big = await withdraw(8507294759, 'zero', 600, 'instant', ZERO_ADDR);
  assert.equal(big.ok, true);
  assert.equal(big.status, 'pending_approval');
  assert.equal(await kv.get('zb:8507294759'), '400');
  const alerts = tgBodies(fetchStub, 'sendMessage').filter((m) => /তোলার অনুরোধ/.test(m.text));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].text, /অনুমোদন লাগবে/);
  assert.match(alerts[0].text, /পাঠানোর ওয়ালেট: t1atEkz24YDS4LDa5GeSQsnMxc7eF7CupWZ/);
  assert.ok(alerts[0].reply_markup.inline_keyboard[0].some((b) => b.callback_data === 'payout_approve:' + big.payout_id));
});

test('v26 payout alert: no send-from wallet line when ZERO_PAYOUT_ADDRESS is unset', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '1000');
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  await claim(8507294759, 'react_withdraw'); // v27 withdraw gate
  const big = await withdraw(8507294759, 'zero', 600, 'instant', ZERO_ADDR);
  assert.equal(big.status, 'pending_approval');
  const alerts = tgBodies(fetchStub, 'sendMessage').filter((m) => /তোলার অনুরোধ/.test(m.text));
  assert.equal(alerts.length, 1);
  assert.doesNotMatch(alerts[0].text, /পাঠানোর ওয়ালেট/);
});

test('v26 withdraw: GRAM closed without config; with config — minimum, solvency, daily cap (20% of float), manual approval above 2', async () => {
  const kv = makeKv();
  await kv.put('zwb:8507294759:gram', '10');
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  await claim(8507294759, 'react_withdraw'); // v27 withdraw gate
  assert.deepEqual(await withdraw(8507294759, 'gram', 1, 'instant', GRAM_ADDR), { ok: false, reason: 'gram_not_configured' });
  // Configured: float 20 GRAM -> daily cap min(5, 20% of 20) = 4.
  envForPost = makeEnv(kv, GRAM_ENV);
  assert.deepEqual(await withdraw(8507294759, 'gram', 0.4, 'instant', GRAM_ADDR), { ok: false, reason: 'below_minimum', minimum: WITHDRAW_GRAM_MIN });
  // Solvency: nothing has come in yet (gram_in 0) -> nothing can go out.
  assert.deepEqual(await withdraw(8507294759, 'gram', 0.5, 'instant', GRAM_ADDR), { ok: false, reason: 'insufficient_float', gram_in: 0, gram_out: 0 });
  await kv.put('zsol:gram_in', '10');
  // Daily cap: 5 GRAM would exceed min(5, 20% of 20 = 4).
  assert.deepEqual(await withdraw(8507294759, 'gram', 5, 'instant', GRAM_ADDR), { ok: false, reason: 'daily_cap', cap: 4, used_today: 0 });
  // 3 GRAM: within the cap, above 2 -> manual approval.
  const big = await withdraw(8507294759, 'gram', 3, 'instant', GRAM_ADDR);
  assert.equal(big.ok, true);
  assert.equal(big.status, 'pending_approval');
  assert.equal(await kv.get('zwb:8507294759:gram'), '7');
  assert.equal(await kv.get('zsol:gram_out'), '3');
  // 0.5 GRAM: small, direct to pending_send.
  const small = await withdraw(8507294759, 'gram', 0.5, 'instant', GRAM_ADDR);
  assert.equal(small.ok, true);
  assert.equal(small.status, 'pending_send');
  assert.equal(await kv.get('zwb:8507294759:gram'), '6.5');
});

test('v26 withdraw: Stars is not withdrawable', async () => {
  const kv = makeKv();
  await kv.put('zwb:8507294759:stars', '50');
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  assert.deepEqual(await withdraw(8507294759, 'stars', 10, 'instant', ZERO_ADDR), { ok: false, reason: 'stars_not_withdrawable' });
});

// ----- Deposit start / confirm -----

// ----- Deposit start / confirm -----

test('v26 deposit-start: /start deposit_<stars> sends a Stars invoice with the deposit payload; below-min refused', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const res = await handleUpdate(msgUpdate({ text: '/start deposit_10' }), env);
  assert.equal(res.handled, 'deposit_start');
  assert.equal(res.ok, true);
  assert.equal(res.stars, 10);
  const inv = tgBodies(fetchStub, 'sendInvoice')[0];
  assert.equal(inv.payload, 'deposit_stars:8507294759:10');
  assert.equal(inv.currency, 'XTR');
  assert.equal(inv.prices[0].amount, 10);
  const low = await handleUpdate(msgUpdate({ text: '/start deposit_5' }), env);
  assert.equal(low.ok, false);
  assert.equal(low.reason, 'below_minimum');
});

test('v26 deposit-confirm: ZERO txid verified once credits the wallet; insufficient refused', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setZeroTx({
    confirmations: 6,
    vout: [{ value: 100, scriptPubKey: { addresses: ['t1TestShopAddress123'] } }],
  });
  const res = await depositConfirm(8507294759, 'zero', 'txid-dep-1', 100);
  assert.equal(res.ok, true);
  assert.equal(res.credited, 100);
  assert.equal(res.balance, 100);
  assert.equal(await kv.get('zwb:8507294759:zero'), '100');
  assert.deepEqual(await depositConfirm(8507294759, 'zero', 'txid-dep-1', 100), { ok: false, reason: 'already_confirmed' });
  assert.deepEqual(await depositConfirm(8507294759, 'zero', 'txid-dep-2', 150), { ok: false, reason: 'insufficient', paid: 100 });
});

test('v26 deposit-start: Stars below min refused; ZERO returns the shop address; GRAM without config refused', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  assert.deepEqual(await depositStart(8507294759, 'stars', 5), { ok: false, reason: 'below_minimum', minimum: DEPOSIT_MIN_STARS });
  const stars = await depositStart(8507294759, 'stars', 10);
  assert.equal(stars.ok, true);
  assert.equal(stars.payload, 'deposit_stars:8507294759:10');
  const zero = await depositStart(8507294759, 'zero', 100);
  assert.equal(zero.ok, true);
  assert.equal(zero.address, 't1TestShopAddress123');
  assert.deepEqual(await depositStart(8507294759, 'gram', 2), { ok: false, reason: 'gram_not_configured' });
});

test('v26 deposit-start: GRAM converts at the LIVE CoinGecko rate; unreachable rate fails closed', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv, GRAM_ENV);
  // No rate mocked -> CoinGecko "unreachable" -> fail closed.
  assert.deepEqual(await depositStart(8507294759, 'gram', 2), { ok: false, reason: 'rate_unavailable' });
  fetchStub.setTonPrice(1.045);
  const res = await depositStart(8507294759, 'gram', 2);
  assert.equal(res.ok, true);
  assert.equal(res.gram, 1.91); // $2 / $1.045
  assert.equal(res.rate, 1.045);
  assert.equal(res.address, GRAM_ADDR);
  // $0.50 would be 0.48 GRAM — below the 0.5 minimum.
  assert.deepEqual(await depositStart(8507294759, 'gram', 0.5), { ok: false, reason: 'below_minimum', minimum: 0.5, gram: 0.48 });
});

test('v26 deposit-confirm: GRAM verified via tonapi credits the wallet once; wrong amount / unknown tx refused', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv, GRAM_ENV);
  fetchStub.setTonapi({
    transactions: [{
      hash: 'abc123',
      success: true,
      in_msg: {
        destination: { address: GRAM_ADDR },
        source: { address: 'UQ' + 'B'.repeat(46) },
        value: '500000000', // 0.5 GRAM
      },
    }],
  });
  const res = await depositConfirm(8507294759, 'gram', 'abc123', 0.5);
  assert.equal(res.ok, true);
  assert.equal(res.credited, 0.5);
  assert.equal(res.balance, 0.5);
  assert.equal(await kv.get('zwb:8507294759:gram'), '0.5');
  assert.equal(await kv.get('zsol:gram_in'), '0.5');
  // Same txid can never pay twice.
  assert.deepEqual(await depositConfirm(8507294759, 'gram', 'abc123', 0.5), { ok: false, reason: 'already_confirmed' });
  // A different txid asking for more than it paid is refused.
  fetchStub.setTonapi({
    transactions: [{
      hash: 'def456',
      success: true,
      in_msg: { destination: { address: GRAM_ADDR }, source: { address: 'UQ' + 'B'.repeat(46) }, value: '100000000' },
    }],
  });
  assert.deepEqual(await depositConfirm(8507294759, 'gram', 'def456', 0.5), { ok: false, reason: 'insufficient', paid: 0.1 });
  // Unknown hash.
  fetchStub.setTonapi({ transactions: [] });
  assert.deepEqual(await depositConfirm(8507294759, 'gram', 'nope', 0.5), { ok: false, reason: 'not_found', paid: 0 });
});

// ----- Promote -----

test('v26 promote math: completions + GRAM reward at the payment-time rate', () => {
  assert.equal(promoteCompletionsForZero(100), 80);
  assert.equal(promoteCompletionsForZero(625), 500);
  assert.equal(promoteCompletionsForZero(101), 80); // floor
  assert.equal(promoteCompletionsForUsd(2), 80); // minimum unchanged: 20% margin
  // Angela 2026-11-09 ~23:14: "$10 = 300 completions, so that even
  // with system losses I never lose" — supersedes BOTH the plan's old
  // "$10 = 500" and the worker's "$10 = 400". USD/GRAM budgets fund
  // completions with 60% of the budget (40% margin buffer): $10 ->
  // 300 completions ($6.00 to completers, $4.00 kept). The minimum
  // stays 80, so the result is floored at 80.
  assert.equal(promoteCompletionsForUsd(10), 300);
  assert.equal(promoteCompletionsForUsd(9), 270);
  assert.equal(promoteCompletionsForUsd(5), 150);
  assert.equal(promoteCompletionsForUsd(2.5), 80); // floor: 75 -> 80
  assert.equal(gramRewardPerCompletion(1.045), 0.019); // $0.02 / $1.045
  assert.equal(gramRewardPerCompletion(2), 0.01);
  assert.equal(gramRewardPerCompletion(0), 0);
});

test('v26 promote-submit: ZERO budget range + completions; bad URL/type refused; GRAM needs config + live rate', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const base = { title: 'আমার পেজ', url: 'https://example.com/promo', type: 'post' };
  assert.deepEqual(await promoteSubmit(8507294759, { ...base, currency: 'zero', budget: 50 }), { ok: false, reason: 'budget_out_of_range', min: PROMOTE_MIN_BUDGET_ZERO, max: PROMOTE_MAX_BUDGET_ZERO });
  assert.deepEqual(await promoteSubmit(8507294759, { ...base, currency: 'zero', budget: 626 }), { ok: false, reason: 'budget_out_of_range', min: PROMOTE_MIN_BUDGET_ZERO, max: PROMOTE_MAX_BUDGET_ZERO });
  const ok = await promoteSubmit(8507294759, { ...base, currency: 'zero', budget: 100 });
  assert.equal(ok.ok, true);
  assert.equal(ok.completions, 80);
  assert.equal(ok.reward_per_completion, 1);
  assert.equal(ok.pay.amount, 100);
  assert.equal(ok.pay.to, 't1TestShopAddress123');
  assert.deepEqual(await promoteSubmit(8507294759, { ...base, url: 'not-a-url', currency: 'zero', budget: 100 }), { ok: false, reason: 'invalid_url' });
  assert.deepEqual(await promoteSubmit(8507294759, { ...base, type: 'spam', currency: 'zero', budget: 100 }), { ok: false, reason: 'invalid_type' });
  assert.deepEqual(await promoteSubmit(8507294759, { ...base, currency: 'gram', budget: 2 }), { ok: false, reason: 'gram_not_configured' });
  envForPost = makeEnv(kv, GRAM_ENV);
  assert.deepEqual(await promoteSubmit(8507294759, { ...base, currency: 'gram', budget: 2 }), { ok: false, reason: 'rate_unavailable' });
  fetchStub.setTonPrice(1.045);
  const gram = await promoteSubmit(8507294759, { ...base, currency: 'gram', budget: 2 });
  assert.equal(gram.ok, true);
  assert.equal(gram.completions, 80);
  assert.equal(gram.reward_per_completion, 0.019);
  assert.equal(gram.pay.amount, 1.91);
  const gram10 = await promoteSubmit(8507294759, { ...base, currency: 'gram', budget: 10 });
  assert.equal(gram10.ok, true);
  assert.equal(gram10.completions, 300); // Angela 2026-11-09 ~23:14: $10 = 300, 40% margin buffer
  assert.equal(gram10.reward_per_completion, 0.019);
  assert.equal(gram10.pay.amount, 9.57);
});

test('v26 promote-confirm: ZERO txid verified once, promo recorded pending_approval, admin alerted with buttons; duplicate txid refused', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setZeroTx({
    confirmations: 6,
    vout: [{ value: 100, scriptPubKey: { addresses: ['t1TestShopAddress123'] } }],
  });
  const res = await promoteConfirm(8507294759, {
    title: 'আমার পেজ', url: 'https://example.com/promo', type: 'post', currency: 'zero', budget: 100, txid: 'txid-abc-123',
  });
  assert.equal(res.ok, true);
  assert.equal(res.status, 'pending_approval');
  assert.equal(res.completions, 80);
  assert.match(res.promo_id, /^PR-\d{8}-[A-Z0-9]{4}$/);
  const promo = JSON.parse(await kv.get('zpromo:' + res.promo_id));
  assert.equal(promo.status, 'pending_approval');
  assert.equal(promo.remaining, 80);
  assert.equal(promo.paid_amount, 100);
  const alerts = tgBodies(fetchStub, 'sendMessage').filter((m) => /Promote/.test(m.text));
  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].reply_markup.inline_keyboard[0].some((b) => b.callback_data === 'promo_approve:' + res.promo_id));
  // Same txid can never pay twice.
  assert.deepEqual(await promoteConfirm(8507294759, {
    title: 'আমার পেজ', url: 'https://example.com/promo', type: 'post', currency: 'zero', budget: 100, txid: 'txid-abc-123',
  }), { ok: false, reason: 'already_confirmed' });
});

test('v30 promote-submit: image_url is optional — submit works with and without it; bad image URL refused', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const base = { title: 'আমার পেজ', url: 'https://example.com/promo', type: 'post', currency: 'zero', budget: 100 };
  // No image_url at all: must succeed, echoed as null.
  const noImg = await promoteSubmit(8507294759, { ...base });
  assert.equal(noImg.ok, true);
  assert.equal(noImg.image_url, null);
  // Empty string: same — optional, no validation error.
  const emptyImg = await promoteSubmit(8507294759, { ...base, image_url: '' });
  assert.equal(emptyImg.ok, true);
  assert.equal(emptyImg.image_url, null);
  // A valid image URL: accepted and echoed back.
  const withImg = await promoteSubmit(8507294759, { ...base, image_url: 'https://example.com/banner.png' });
  assert.equal(withImg.ok, true);
  assert.equal(withImg.image_url, 'https://example.com/banner.png');
  // A non-URL value is refused (but a missing one never is).
  assert.deepEqual(await promoteSubmit(8507294759, { ...base, image_url: 'not-a-url' }), { ok: false, reason: 'invalid_image_url' });
});

test('v30 promote-confirm: image_url stored when given, null when empty; /my-promotions lists only the caller\'s promos, newest first', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setZeroTx({
    confirmations: 6,
    vout: [{ value: 100, scriptPubKey: { addresses: ['t1TestShopAddress123'] } }],
  });
  // With an image URL.
  const withImg = await promoteConfirm(8507294759, {
    title: 'ছবিসহ', url: 'https://example.com/a', type: 'post', currency: 'zero', budget: 100,
    txid: 'txid-img-1', image_url: 'https://example.com/banner.png',
  });
  assert.equal(withImg.ok, true);
  assert.equal(JSON.parse(await kv.get('zpromo:' + withImg.promo_id)).image_url, 'https://example.com/banner.png');
  // Without any image URL: stored as null, no error, promo still recorded.
  const noImg = await promoteConfirm(8507294759, {
    title: 'ছবি ছাড়া', url: 'https://example.com/b', type: 'post', currency: 'zero', budget: 100,
    txid: 'txid-noimg-1',
  });
  assert.equal(noImg.ok, true);
  assert.equal(JSON.parse(await kv.get('zpromo:' + noImg.promo_id)).image_url, null);
  // Another user's promo must never appear in my list.
  await seedPromo(kv, { id: 'PR-20261109-OTHR', user_id: 222, title: 'অন্যের', created_at: '2026-11-10T00:00:00.000Z' });
  const mine = await listMyPromotions(envForPost, 8507294759);
  assert.equal(mine.length, 2);
  const byId = {};
  mine.forEach((p) => { byId[p.id] = p; });
  assert.equal(byId[withImg.promo_id].image_url, 'https://example.com/banner.png');
  assert.equal(byId[noImg.promo_id].image_url, null);
  assert.equal(byId[noImg.promo_id].status, 'pending_approval');
  assert.equal(byId[noImg.promo_id].completed, 0);
  assert.equal(byId[noImg.promo_id].completions, 80);
  // Newest-first order (distinct created_at values).
  await seedPromo(kv, { id: 'PR-20261109-OLD1', user_id: 8507294759, title: 'old', created_at: '2026-11-09T00:00:00.000Z' });
  await seedPromo(kv, { id: 'PR-20261109-NEW1', user_id: 8507294759, title: 'new', created_at: '2026-11-10T00:00:00.000Z' });
  const ordered = await listMyPromotions(envForPost, 8507294759);
  const seeded = ordered.filter((p) => p.id === 'PR-20261109-OLD1' || p.id === 'PR-20261109-NEW1');
  assert.equal(seeded[0].id, 'PR-20261109-NEW1');
  assert.equal(seeded[1].id, 'PR-20261109-OLD1');
  // Same list over HTTP.
  const viaHttp = await (await worker.fetch(new Request('https://worker.test/my-promotions?user_id=8507294759'), envForPost)).json();
  assert.equal(viaHttp.promotions.length, 4);
  const others = await (await worker.fetch(new Request('https://worker.test/my-promotions?user_id=222'), envForPost)).json();
  assert.equal(others.promotions.length, 1);
  assert.equal(others.promotions[0].id, 'PR-20261109-OTHR');
});

test('v26 promote admin: approve lists the promo live; reject marks it rejected; non-admin ignored', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const promo = await seedPromo(kv);
  const res = await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'promo_approve:' + promo.id, '📢 নতুন Promote'), env);
  assert.equal(res.handled, 'callback');
  assert.equal(res.ok, true);
  assert.equal(JSON.parse(await kv.get('zpromo:' + promo.id)).status, 'live');
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => m.chat_id === 999 && /অনুমোদন হয়েছে/.test(m.text)));
  // Approve twice: second time is a no-op (already live).
  const again = await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'promo_approve:' + promo.id, '📢 নতুন Promote'), env);
  assert.equal(again.ok, true);
  assert.equal(JSON.parse(await kv.get('zpromo:' + promo.id)).status, 'live');
  const promo2 = await seedPromo(kv, { id: 'PR-20261109-WXYZ' });
  const rej = await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'promo_reject:' + promo2.id, '📢 নতুন Promote'), env);
  assert.equal(rej.ok, true);
  assert.equal(JSON.parse(await kv.get('zpromo:' + promo2.id)).status, 'rejected');
  // Non-admin cannot approve.
  const no = await handleUpdate(adminCallbackUpdate(999999, 'promo_approve:' + promo2.id, '📢 নতুন Promote'), env);
  assert.equal(no.ok, false);
  assert.equal(no.reason, 'not_admin');
  assert.equal(JSON.parse(await kv.get('zpromo:' + promo2.id)).status, 'rejected');
});

// ----- Sponsor tasks -----

test('v26 sponsor: a live promo appears in /tasks under the sponsor group; dwell gate then claim credits 1 ZERO', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await seedPromo(kv, { id: 'PR-20261109-SPON', status: 'live', remaining: 2 });
  let state = await getTasks(uid);
  const task = state.tasks.find((t) => t.id === 'sponsor_PR-20261109-SPON');
  assert.ok(task);
  assert.equal(task.group, 'sponsor');
  assert.equal(task.reward, 1);
  assert.equal(task.reward_currency, 'ZERO');
  assert.equal(task.remaining, 2);
  assert.equal(task.done, false);
  // Claim needs /sponsor-start first.
  assert.deepEqual(await claim(uid, 'sponsor_PR-20261109-SPON'), { ok: false, reason: 'start_first' });
  const started = await sponsorStart(uid, 'PR-20261109-SPON');
  assert.equal(started.ok, true);
  assert.equal(started.dwell_ms, 15000);
  const early = await claim(uid, 'sponsor_PR-20261109-SPON');
  assert.equal(early.ok, false);
  assert.equal(early.reason, 'dwell_not_done');
  assert.ok(early.available_in_ms > 0);
  // 20s later the dwell is done.
  await kv.put('zpromostart:' + uid + ':PR-20261109-SPON', String(Date.now() - 20000));
  const done = await claim(uid, 'sponsor_PR-20261109-SPON');
  assert.equal(done.ok, true);
  assert.equal(done.credited, 1);
  assert.equal(done.currency, 'ZERO');
  assert.equal(done.remaining, 1);
  assert.equal(await kv.get('zb:' + uid), '1');
  assert.equal(JSON.parse(await kv.get('zpromo:PR-20261109-SPON')).remaining, 1);
  assert.deepEqual(await claim(uid, 'sponsor_PR-20261109-SPON'), { ok: false, reason: 'already_done' });
});

test('v26 sponsor: channel-target promo verifies membership via getChatMember (not_joined when kicked)', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await seedPromo(kv, {
    id: 'PR-20261109-CHAN', status: 'live', remaining: 5,
    url: 'https://t.me/bazargoo287', target_channel: '@bazargoo287',
  });
  fetchStub.setChatMember('kicked');
  assert.deepEqual(await claim(uid, 'sponsor_PR-20261109-CHAN'), { ok: false, reason: 'not_joined' });
  fetchStub.setChatMember('member');
  const done = await claim(uid, 'sponsor_PR-20261109-CHAN');
  assert.equal(done.ok, true);
  assert.equal(done.credited, 1);
});

// ----- Payout admin flow -----

test('v26 payout admin: approve moves pending_approval to pending_send; reject refunds the balance; txid command marks sent + notifies', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '1000');
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  await claim(8507294759, 'react_withdraw'); // v27 withdraw gate
  const env = envForPost;
  // 600 ZERO -> pending_approval, balance debited.
  const req = await withdraw(8507294759, 'zero', 600, 'instant', ZERO_ADDR);
  assert.equal(req.status, 'pending_approval');
  assert.equal(await kv.get('zb:8507294759'), '400');
  // Reject -> balance refunded.
  const rej = await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'payout_reject:' + req.payout_id, '💸 তোলার অনুরোধ'), env);
  assert.equal(rej.ok, true);
  assert.equal(JSON.parse(await kv.get('zpayout:' + req.payout_id)).status, 'rejected');
  assert.equal(await kv.get('zb:8507294759'), '1000');
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => m.chat_id === 8507294759 && /ফেরত দেওয়া হয়েছে/.test(m.text)));
  // A fresh request -> approve -> pending_send. (400, not 600: the
  // first 600 already counts toward today's 1,000 ZERO daily cap.)
  const req2 = await withdraw(8507294759, 'zero', 400, 'instant', ZERO_ADDR);
  const app = await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'payout_approve:' + req2.payout_id, '💸 তোলার অনুরোধ'), env);
  assert.equal(app.ok, true);
  assert.equal(JSON.parse(await kv.get('zpayout:' + req2.payout_id)).status, 'pending_send');
  // Angela sends it manually and logs the txid.
  const tx = await handleUpdate(msgUpdate({
    text: 'txid ' + req2.payout_id + ' ' + 'f'.repeat(64),
    from: { id: ADMIN_ID, username: 'admin' },
    chat: { id: ADMIN_ID },
  }), env);
  assert.equal(tx.handled, 'payout_txid');
  assert.equal(tx.ok, true);
  const payout = JSON.parse(await kv.get('zpayout:' + req2.payout_id));
  assert.equal(payout.status, 'sent');
  assert.equal(payout.txid, 'f'.repeat(64));
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => m.chat_id === 8507294759 && /পাঠানো হয়েছে/.test(m.text)));
  // Non-admin cannot log a txid.
  const no = await handleUpdate(msgUpdate({
    text: 'txid ' + req2.payout_id + ' ' + 'a'.repeat(64),
  }), env);
  assert.equal(no.ok, false);
  assert.equal(no.reason, 'not_admin');
});

// ----- Monitoring counters -----

test('v26 monitoring: spin claims and redeems increment the weekly counters', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const uid = 8507294759;
  await unlockSpinGates(uid);
  const start = await spinStart(uid, 'adsgram');
  await adsgramConfirm(uid, start.nonce);
  assert.equal(await kv.get('zspinweek:' + dhakaWeekKey()), '1');
  await kv.put('zb:' + uid, '5');
  await kv.put('pdf_file:test-pdf', 'FILE123');
  const res = await redeem(uid, 'test-pdf');
  assert.equal(res.ok, true);
  assert.equal(await kv.get('zredeemweek:' + dhakaWeekKey()), '1');
});

// ----- v27: ZERO auto-send (phase 2) + withdraw gate + proof posts -----
//
// Throwaway test keypairs (generated for these tests only — they hold
// no funds and are NOT the real payout key):
//   T1: WIF KyS1KJRmWvMEg8qgLXnGrEGuy4F9FUBfdUvMjFEX1riZx8inW5rR
//       addr t1TfJjp2bWQsLRnNbM7o9eJK1z43s5qwH8N
//       pub  02228f8f0a45bbb81c44320d6c1db19b271b6b5fe8db683a32707bd3b6dce3e34f
//       P2PKH script 76a9146b5dda1ba7e53c3cc532965e3cdf26b91f46dac988ac
//   T2: WIF Kwnkqf4mxAW6aXeCn7NrtVZY2Bey4cgNivbtTHtp69cDvhA3em57
//       addr t1bXAzh6YSU6B9yoW3zedDavsU7jW2m9PDJ
const T1_WIF = 'KyS1KJRmWvMEg8qgLXnGrEGuy4F9FUBfdUvMjFEX1riZx8inW5rR';
const T1_ADDR = 't1TfJjp2bWQsLRnNbM7o9eJK1z43s5qwH8N';
const T1_PUB = '02228f8f0a45bbb81c44320d6c1db19b271b6b5fe8db683a32707bd3b6dce3e34f';
const T1_SCRIPT = '76a9146b5dda1ba7e53c3cc532965e3cdf26b91f46dac988ac';
const T2_WIF = 'Kwnkqf4mxAW6aXeCn7NrtVZY2Bey4cgNivbtTHtp69cDvhA3em57';
const T2_ADDR = 't1bXAzh6YSU6B9yoW3zedDavsU7jW2m9PDJ';
// The real funding tx (10 ZER to the payout wallet, confirmed on-chain
// 2026-11-09) — the live vector the sighash + verify code must match.
const FUND_HEX = '0400008085202f8901c0cb7b13b1cb61147bdc9db63a93128c21c29d53554258f5d92ad34c931f91ac010000006a4730440220657931b0437e04d9414626dad7e7406fcf59e6c83ca065583a8714dfb1ef5ee30220494f87d97cb2d2ecc236cd067244ed01a8e88894b5a106dac29e0c94743d25bc012102977cc3aa35966c694b46e35706c4b77056deef3c73a20b1e1a91ad60456220f5ffffffff0200ca9a3b000000001976a914ba98d15c4046d90383618d5d70a03f22986ee8c988ac2d25506f000000001976a914c0fb5e3d55032c80adcad21dacbde923740b8afa88ac50c30000000000000000000000000000000000';
const ZIP243_RAW = '0400008085202f8901a8c685478265f4c14dada651969c45a65e1aeb8cd6791f2f5bb6a1d9952104d9010000006b483045022100a61e5d557568c2ddc1d9b03a7173c6ce7c996c4daecab007ac8f34bee01e6b9702204d38fdc0bcf2728a69fde78462a10fb45a9baa27873e6a5fc45fb5c76764202a01210365ffea3efa3908918a8b8627724af852fc9b86d7375b103ab0543cf418bcaa7ffeffffff02005a6202000000001976a9148132712c3ff19f3a151234616777420a6d7ef22688ac8b959800000000001976a9145453e4698f02a38abdaa521cd1ff2dee6fac187188ac29b0040048b00400000000000000000000000000'.slice(0, 490); // exact 245-byte tx (the ZIP text carries 2 extra trailing zeros)
function hexBytes(h) {
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return b;
}
function hexStr(b) {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}
const T1_ENV = { ZERO_PAYOUT_ADDRESS: T1_ADDR, ZERO_PAYOUT_PRIVATE_KEY: T1_WIF };
// Stub the zerochain chain reads for a T1 payout wallet holding one
// 10-ZER UTXO. /txid/<txid> answers from the URL itself (the computed
// txid is only known after signing).
function stubT1Chain(balanceSats = 1000000000, utxoValueSat = 1000000000) {
  fetchStub.setZerochain('/addressbalance/', balanceSats);
  fetchStub.setZerochain('/txs/' + T1_ADDR + '/0', {
    pagesTotal: 1,
    txs: [{
      txid: '22'.repeat(32),
      vin: [],
      vout: [{ value: utxoValueSat / 1e8, valueSat: utxoValueSat, n: 0, scriptPubKey: { addresses: [T1_ADDR], hex: T1_SCRIPT } }],
    }],
  });
  fetchStub.setZerochain('/rawtx/', {});
  fetchStub.setZerochain('/txid/', (url) => ({ txid: url.split('/txid/')[1].split('/')[0] }));
}
function zerochainCalls() {
  return fetchStub.calls.filter((c) => String(c.url).includes('zerochain.info'));
}
function proofPosts() {
  return tgBodies(fetchStub, 'sendMessage').filter((m) => String(m.chat_id) === WITHDRAW_CHANNEL_ID);
}
async function setupGatedUser(kv, uid = 8507294759, earnedZero = '1000') {
  await kv.put('zb:' + uid, earnedZero);
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  await claim(uid, 'react_withdraw');
}

test('v27 crypto: WIF decodes to privkey-1; derived address matches the known vector; bad WIF throws', () => {
  const one = new Uint8Array(32); one[31] = 1;
  const priv = zeroWifToPriv('KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn');
  assert.deepEqual([...priv], [...one]);
  assert.equal(zeroPrivToAddress(one), 't1UYsZVJkLPeMjxEtACvSxfWuNmddpWfxzs');
  assert.equal(zeroPrivToAddress(zeroWifToPriv(T1_WIF)), T1_ADDR);
  assert.throws(() => zeroWifToPriv('not-a-wif'), /./);
  assert.throws(() => zeroWifToPriv('KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWm'), /./); // bad checksum
});

test('v27 crypto: ZIP-243 test vector 3 — sighash matches the official value, embedded signature verifies', () => {
  const tx = zeroParseTx(ZIP243_RAW);
  assert.equal(tx.bytesConsumed, tx.totalLen);
  assert.equal(hexStr(zeroSerializeTx(tx)), ZIP243_RAW);
  const sighash = zeroSighash(tx, 0, hexBytes('76a914507173527b4c3318a2aecd793bf1cfed705950cf88ac'), 50000000n, 0x76b809bb);
  assert.equal(hexStr(sighash), 'f3148f80dfab5e573d5edfe7a850f5fd39234f80b5429d3a57edcc11e34c585b');
  const sig = tx.vins[0].scriptSig;
  const der = sig.slice(1, 1 + 2 + sig[2]);
  const pub = sig.slice(1 + 2 + sig[2] + 2);
  assert.equal(zeroEcdsaVerify(pub, sighash, der), true);
});

test('v27 crypto: real funding tx verifies under the Cosmos branch (and NOT Sapling); serialize round-trips', () => {
  const tx = zeroParseTx(FUND_HEX);
  assert.equal(tx.bytesConsumed, tx.totalLen);
  assert.equal(hexStr(zeroSerializeTx(tx)), FUND_HEX);
  const scriptCode = hexBytes('76a914c0fb5e3d55032c80adcad21dacbde923740b8afa88ac');
  const cosmos = zeroSighash(tx, 0, scriptCode, 2867523373n, ZERO_COSMOS_BRANCH_ID);
  assert.equal(hexStr(cosmos), 'e31e7742097fd216cf15cf0b2ae85e7643d32d68068e2be7de3bfcf361448065');
  const sig = tx.vins[0].scriptSig;
  const der = sig.slice(1, 1 + 2 + sig[2]);
  const pub = sig.slice(1 + 2 + sig[2] + 2);
  assert.equal(zeroEcdsaVerify(pub, cosmos, der), true);
  const sapling = zeroSighash(tx, 0, scriptCode, 2867523373n, 0x76b809bb);
  assert.equal(zeroEcdsaVerify(pub, sapling, der), false);
});

test('v27 crypto: zeroSignTx builds a valid payout tx (sig verifies, outputs + change exact, txid matches)', () => {
  const priv = zeroWifToPriv(T1_WIF);
  const utxos = [{ txid: '11'.repeat(32), vout: 0, valueSat: 100000000, scriptPubKey: T1_SCRIPT }];
  // NOTE: the destination must be a CHECKSUM-VALID t1 address (the
  // generic ZERO_ADDR 't1' + 'A'*33 has a bad checksum).
  const signed = zeroSignTx(priv, utxos, T2_ADDR, 50000000, T1_ADDR, ZERO_TX_FEE_SATS);
  assert.match(signed.txid, /^[0-9a-f]{64}$/);
  assert.equal(zeroTxidFromHex(signed.hex), signed.txid);
  const tx = zeroParseTx(signed.hex);
  assert.equal(tx.vins.length, 1);
  assert.equal(tx.vouts.length, 2);
  assert.equal(tx.vouts[0].value, 50000000n);
  assert.equal(hexStr(tx.vouts[0].script), '76a914c1951110c72b6cdbba452b913b0d8d89d5e6300488ac'); // T2_ADDR P2PKH script
  assert.equal(tx.vouts[1].value, 49990000n); // 1 ZER - 0.5 - 0.0001 fee
  // The signature inside the built tx verifies against its own sighash.
  const clean = { ...tx, vins: tx.vins.map((v) => ({ ...v, scriptSig: new Uint8Array(0) })) };
  const sighash = zeroSighash(clean, 0, hexBytes(T1_SCRIPT), 100000000n, ZERO_COSMOS_BRANCH_ID);
  const ss = tx.vins[0].scriptSig;
  const der = ss.slice(1, 1 + 2 + ss[2]);
  const pub = ss.slice(1 + 2 + ss[2] + 2);
  assert.equal(hexStr(pub), T1_PUB);
  assert.equal(zeroEcdsaVerify(pub, sighash, der), true);
  // Dust change folds into the fee (no dust output).
  const dusty = zeroSignTx(priv, [{ txid: '11'.repeat(32), vout: 0, valueSat: 50010500, scriptPubKey: T1_SCRIPT }], T2_ADDR, 50000000, T1_ADDR, ZERO_TX_FEE_SATS);
  assert.equal(zeroParseTx(dusty.hex).vouts.length, 1);
  // Insufficient UTXOs throw.
  assert.throws(() => zeroSignTx(priv, utxos, T2_ADDR, 99999999, T1_ADDR, ZERO_TX_FEE_SATS), /insufficient_utxo/);
});

test('v27 chain: getZeroUtxos collects unspent outputs across pages, marks spent ones', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  fetchStub.setZerochain('/txs/' + T1_ADDR + '/0', {
    pagesTotal: 2,
    txs: [{
      txid: 'aa'.repeat(32), vin: [],
      vout: [
        { value: 10, valueSat: 1000000000, n: 0, scriptPubKey: { addresses: [T1_ADDR], hex: T1_SCRIPT } },
        { value: 2, valueSat: 200000000, n: 1, scriptPubKey: { addresses: ['t1OtherAddress12345678901234567890'], hex: '76a914' + '00'.repeat(20) + '88ac' } },
      ],
    }],
  });
  fetchStub.setZerochain('/txs/' + T1_ADDR + '/1', {
    pagesTotal: 2,
    txs: [
      { txid: 'bb'.repeat(32), vin: [{ txid: 'aa'.repeat(32), vout: 0 }], vout: [] },
      { txid: 'cc'.repeat(32), vin: [], vout: [{ value: 5, valueSat: 500000000, n: 0, scriptPubKey: { addresses: [T1_ADDR], hex: T1_SCRIPT } }] },
    ],
  });
  const utxos = await getZeroUtxos(envForPost, T1_ADDR);
  assert.equal(utxos.length, 1);
  assert.equal(utxos[0].txid, 'cc'.repeat(32));
  assert.equal(utxos[0].valueSat, 500000000);
});

test('v27 chain: getZeroBalanceSats returns satoshis; null when the API fails', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  // No rule set yet -> the API 404s -> null.
  assert.equal(await getZeroBalanceSats(envForPost, T1_ADDR), null);
  fetchStub.setZerochain('/addressbalance/', 1000000000);
  assert.equal(await getZeroBalanceSats(envForPost, T1_ADDR), 1000000000);
});

test('v27 auto-send: fail-closed without the key — stays pending_send, admin notified once, no chain calls, no double debit', async () => {
  const kv = makeKv();
  await setupGatedUser(kv);
  envForPost = makeEnv(kv, { ZERO_PAYOUT_ADDRESS: T1_ADDR }); // key NOT set
  const res = await withdraw(8507294759, 'zero', 1, 'instant', ZERO_ADDR);
  assert.equal(res.ok, true);
  assert.equal(res.status, 'pending_send');
  assert.equal(await kv.get('zb:8507294759'), '999'); // debited once, at request time
  assert.equal(zerochainCalls().length, 0);
  const alerts = tgBodies(fetchStub, 'sendMessage').filter((m) => m.chat_id === ADMIN_ID && /অটো পাঠানো যায়নি/.test(m.text));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].text, /প্রাইভেট কী সেট করা নেই/);
  assert.ok(alerts[0].reply_markup.inline_keyboard[0].some((b) => b.callback_data === 'payout_sent:' + res.payout_id));
  assert.equal(JSON.stringify(alerts[0]).includes(T1_WIF), false); // key never in any message
});

test('v27 auto-send: address mismatch never broadcasts', async () => {
  const kv = makeKv();
  const env = makeEnv(kv, { ZERO_PAYOUT_ADDRESS: T1_ADDR, ZERO_PAYOUT_PRIVATE_KEY: T2_WIF });
  const payout = { id: 'PO-20261110-XXXX', user_id: 8507294759, currency: 'zero', amount: 1, address: ZERO_ADDR, status: 'pending_send', created_at: new Date().toISOString() };
  const res = await attemptZeroAutoSend(env, payout);
  assert.deepEqual(res, { ok: false, reason: 'address_mismatch' });
  assert.equal(zerochainCalls().filter((c) => String(c.url).includes('/rawtx/')).length, 0);
  assert.equal(payout.status, 'pending_send');
});

test('v27 auto-send: float low blocks the send (no broadcast)', async () => {
  const kv = makeKv();
  const env = makeEnv(kv, T1_ENV);
  fetchStub.setZerochain('/addressbalance/', 50000000); // 0.5 ZER < 1 + fee
  const payout = { id: 'PO-20261110-XXXX', user_id: 8507294759, currency: 'zero', amount: 1, address: ZERO_ADDR, status: 'pending_send', created_at: new Date().toISOString() };
  const res = await attemptZeroAutoSend(env, payout);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'float_low');
  assert.equal(zerochainCalls().filter((c) => String(c.url).includes('/rawtx/')).length, 0);
});

test('v27 auto-send: success — broadcasts, confirms, marks sent, notifies user, posts proof without the destination address', async () => {
  const kv = makeKv();
  await setupGatedUser(kv);
  envForPost = makeEnv(kv, T1_ENV);
  stubT1Chain();
  // NOTE: the destination must be a CHECKSUM-VALID t1 address (the
  // generic ZERO_ADDR 't1' + 'A'*33 has a bad checksum and would fail
  // at signing) — T2_ADDR is a real throwaway address.
  const res = await withdraw(8507294759, 'zero', 1, 'instant', T2_ADDR);
  assert.equal(res.ok, true);
  assert.equal(res.status, 'sent');
  assert.match(res.txid, /^[0-9a-f]{64}$/);
  const payout = JSON.parse(await kv.get('zpayout:' + res.payout_id));
  assert.equal(payout.status, 'sent');
  assert.equal(payout.txid, res.txid);
  assert.equal(await kv.get('zb:8507294759'), '999'); // debited once
  // The broadcast hex is a real v4 tx paying the user's address.
  const rawtxCall = zerochainCalls().find((c) => String(c.url).includes('/rawtx/'));
  assert.ok(rawtxCall);
  const sentHex = String(rawtxCall.url).split('/rawtx/')[1].split('/')[0];
  const sentTx = zeroParseTx(sentHex);
  assert.equal(sentTx.vouts[0].value, 100000000n);
  assert.equal(hexStr(sentTx.vouts[0].script), '76a914c1951110c72b6cdbba452b913b0d8d89d5e6300488ac'); // T2_ADDR P2PKH script
  assert.equal(zeroTxidFromHex(sentHex), res.txid);
  // User notified with the txid.
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => m.chat_id === 8507294759 && m.text.includes(res.txid)));
  // The private key never appears in any Telegram message.
  assert.equal(JSON.stringify(tgBodies(fetchStub, 'sendMessage')).includes(T1_WIF), false);
  // Proof posted to the withdraw channel — amount + payout id + txid,
  // NEVER the destination address.
  const proofs = proofPosts();
  assert.equal(proofs.length, 1);
  assert.match(proofs[0].text, /তোলা সম্পন্ন/);
  assert.ok(proofs[0].text.includes(res.payout_id));
  assert.ok(proofs[0].text.includes(res.txid));
  assert.equal(proofs[0].text.includes(T2_ADDR), false);
});

test('v27 auto-send: broadcast failure keeps pending_send, no double debit, one broadcast attempt', async () => {
  const kv = makeKv();
  await setupGatedUser(kv);
  envForPost = makeEnv(kv, T1_ENV);
  // The failing /rawtx/ rule must be registered BEFORE stubT1Chain
  // (first matching rule wins).
  fetchStub.setZerochain('/rawtx/', {}, 500);
  stubT1Chain();
  const res = await withdraw(8507294759, 'zero', 1, 'instant', T2_ADDR);
  assert.equal(res.ok, true);
  assert.equal(res.status, 'pending_send');
  assert.equal(await kv.get('zb:8507294759'), '999');
  assert.equal(zerochainCalls().filter((c) => String(c.url).includes('/rawtx/')).length, 1);
  assert.ok(tgBodies(fetchStub, 'sendMessage').some((m) => m.chat_id === ADMIN_ID && /broadcast করা যায়নি/.test(m.text)));
});

test('v27 auto-send: unconfirmed broadcast stays pending_send (no blind retry) and the admin gets the txid', async () => {
  const kv = makeKv();
  const env = makeEnv(kv, T1_ENV);
  // /txid/ never confirms (rule registered first so it wins over
  // stubT1Chain's echo rule). sleepMs 0 keeps the test fast.
  fetchStub.setZerochain('/txid/', null, 404);
  stubT1Chain();
  const payout = { id: 'PO-20261110-XXXX', user_id: 8507294759, currency: 'zero', amount: 1, address: T2_ADDR, status: 'pending_send', created_at: new Date().toISOString() };
  const res = await attemptZeroAutoSend(env, payout, { sleepMs: 0 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_confirmed');
  assert.match(res.txid, /^[0-9a-f]{64}$/);
  assert.equal(payout.status, 'pending_send');
  assert.equal(zerochainCalls().filter((c) => String(c.url).includes('/rawtx/')).length, 1);
  const alerts = tgBodies(fetchStub, 'sendMessage').filter((m) => m.chat_id === ADMIN_ID && /অটো পাঠানো যায়নি/.test(m.text));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].text, /explorer-এ এখনো দেখা যাচ্ছে না/);
  assert.ok(alerts[0].text.includes(res.txid));
});

test('v27 auto-send: in-flight lock + already-sent payouts never re-send', async () => {
  const kv = makeKv();
  const env = makeEnv(kv, T1_ENV);
  await kv.put('zpayoutsend:PO-20261110-LOCK', JSON.stringify({ at: new Date().toISOString() }));
  const locked = { id: 'PO-20261110-LOCK', user_id: 8507294759, currency: 'zero', amount: 1, address: ZERO_ADDR, status: 'pending_send', created_at: new Date().toISOString() };
  assert.deepEqual(await attemptZeroAutoSend(env, locked), { ok: false, reason: 'already_in_progress' });
  const sent = { id: 'PO-20261110-SENT', user_id: 8507294759, currency: 'zero', amount: 1, address: ZERO_ADDR, status: 'sent', txid: 'a'.repeat(64), created_at: new Date().toISOString() };
  assert.deepEqual(await attemptZeroAutoSend(env, sent), { ok: false, reason: 'already_sent' });
  assert.equal(zerochainCalls().length, 0);
});

test('v27 auto-send: admin approve triggers the send for ZERO; GRAM approve stays manual', async () => {
  const kv = makeKv();
  await setupGatedUser(kv);
  envForPost = makeEnv(kv, { ...T1_ENV, ...{ GRAM_RECEIVING_ADDRESS: GRAM_ADDR, GRAM_PAYOUT_FLOAT: '20' } });
  // 600 ZERO needs a 600+ ZER float: stub a 700-ZER balance + UTXO.
  stubT1Chain(70000000000, 70000000000);
  // 600 ZERO -> pending_approval -> approve -> auto-sent with txid.
  const req = await withdraw(8507294759, 'zero', 600, 'instant', T2_ADDR);
  assert.equal(req.status, 'pending_approval');
  const app = await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'payout_approve:' + req.payout_id, '💸 তোলার অনুরোধ'), envForPost);
  assert.equal(app.ok, true);
  const payout = JSON.parse(await kv.get('zpayout:' + req.payout_id));
  assert.equal(payout.status, 'sent');
  assert.match(payout.txid, /^[0-9a-f]{64}$/);
  assert.equal(proofPosts().length, 1);
  // GRAM: 3 GRAM -> pending_approval -> approve -> still pending_send.
  await kv.put('zwb:8507294759:gram', '10');
  await kv.put('zsol:gram_in', '10');
  const greq = await withdraw(8507294759, 'gram', 3, 'instant', GRAM_ADDR);
  assert.equal(greq.status, 'pending_approval');
  const gapp = await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'payout_approve:' + greq.payout_id, '💸 তোলার অনুরোধ'), envForPost);
  assert.equal(gapp.ok, true);
  assert.equal(JSON.parse(await kv.get('zpayout:' + greq.payout_id)).status, 'pending_send');
  assert.equal(zerochainCalls().filter((c) => String(c.url).includes('/rawtx/')).length, 1); // only the ZERO send
});

test('v27 withdraw gate: blocks instant withdraw when not joined / no react stamp; allows when both done; save mode not gated', async () => {
  const kv = makeKv();
  await kv.put('zb:8507294759', '1000');
  envForPost = makeEnv(kv);
  fetchStub.setChatMember('member');
  // Not a member of the withdraw channel -> blocked.
  fetchStub.setChatMemberFor(WITHDRAW_CHANNEL_ID, 'left');
  let res = await withdraw(8507294759, 'zero', 1, 'instant', ZERO_ADDR);
  assert.deepEqual(res, { ok: false, reason: 'withdraw_gate', withdraw_gate: { joined: false, react_done: false, ok: false } });
  // Member, but no react stamp today -> still blocked.
  fetchStub.setChatMemberFor(WITHDRAW_CHANNEL_ID, 'member');
  res = await withdraw(8507294759, 'zero', 1, 'instant', ZERO_ADDR);
  assert.deepEqual(res, { ok: false, reason: 'withdraw_gate', withdraw_gate: { joined: true, react_done: false, ok: false } });
  // 'save' mode is not gated (money stays in the wallet).
  const saved = await withdraw(8507294759, 'zero', 5, 'save');
  assert.equal(saved.ok, true);
  assert.equal(saved.mode, 'save');
  // React stamp -> instant withdraw allowed (no key: stays pending_send).
  await claim(8507294759, 'react_withdraw');
  res = await withdraw(8507294759, 'zero', 1, 'instant', ZERO_ADDR);
  assert.equal(res.ok, true);
  assert.equal(res.status, 'pending_send');
});

test('v27 react_withdraw: stamps once per day, pays 0, no balance change, claimable again next day', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const first = await claim(8507294759, 'react_withdraw');
  assert.deepEqual(first, { ok: true, balance: 0, credited: 0 });
  assert.equal(await kv.get('zt:8507294759:react_withdraw:' + dhakaDateStr()), '1');
  assert.equal(await kv.get('zb:8507294759'), null); // nothing credited
  const second = await claim(8507294759, 'react_withdraw');
  assert.deepEqual(second, { ok: false, reason: 'already_done' });
  const state = await getTasks(8507294759);
  const task = state.tasks.find((t) => t.id === 'react_withdraw');
  assert.equal(task.done, true);
  assert.equal(task.reward, 0);
  assert.equal(task.group, 'withdraw_gate');
  assert.equal(task.url, WITHDRAW_PINNED_POST_URL);
  assert.ok(task.resets_in_ms > 0);
  await kv.delete('zt:8507294759:react_withdraw:' + dhakaDateStr());
  const nextDay = await claim(8507294759, 'react_withdraw');
  assert.deepEqual(nextDay, { ok: true, balance: 0, credited: 0 });
});

test('v27 wallet: /wallet returns the withdraw-gate state', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv, { ZERO_PAYOUT_ADDRESS: T1_ADDR });
  const w0 = await getWallet(8507294759);
  assert.deepEqual(w0.withdraw_gate, { joined: false, react_done: false, ok: false });
  assert.equal(w0.zero_payout_configured, true);
  fetchStub.setChatMember('member');
  await claim(8507294759, 'react_withdraw');
  const w1 = await getWallet(8507294759);
  assert.deepEqual(w1.withdraw_gate, { joined: true, react_done: true, ok: true });
  // The gate is NOT part of the spin/leaderboard gates (getGates).
  const gates = w1.gates;
  assert.equal(gates.joins_total, 4);
  assert.equal(gates.total, 6);
});

test('v27 proof: manual txid command posts proof to @bazargoowithdraw without the destination address', async () => {
  const kv = makeKv();
  await setupGatedUser(kv);
  envForPost = makeEnv(kv);
  const req = await withdraw(8507294759, 'zero', 1, 'instant', ZERO_ADDR);
  assert.equal(req.status, 'pending_send');
  const tx = await handleUpdate(msgUpdate({
    text: 'txid ' + req.payout_id + ' ' + 'b'.repeat(64),
    from: { id: ADMIN_ID, username: 'admin' },
    chat: { id: ADMIN_ID },
  }), envForPost);
  assert.equal(tx.ok, true);
  const proofs = proofPosts();
  assert.equal(proofs.length, 1);
  assert.ok(proofs[0].text.includes(req.payout_id));
  assert.ok(proofs[0].text.includes('b'.repeat(64)));
  assert.equal(proofs[0].text.includes(ZERO_ADDR), false);
  assert.equal(proofs[0].text.includes('t1'), false); // no t1 address anywhere in the proof
});

test('v27 proof: postWithdrawProof uses the env override when set', async () => {
  const kv = makeKv();
  const env = makeEnv(kv, { WITHDRAW_CHANNEL: '@someotherchannel' });
  const payout = { id: 'PO-20261110-XXXX', user_id: 8507294759, currency: 'zero', amount: 5, txid: 'c'.repeat(64) };
  await postWithdrawProof(env, payout);
  const posts = tgBodies(fetchStub, 'sendMessage').filter((m) => m.chat_id === '@someotherchannel');
  assert.equal(posts.length, 1);
  assert.ok(posts[0].text.includes('PO-20261110-XXXX'));
});

// ---------- Phase 2 i18n (language) ----------

const I18N_VARS = {
  stars: 10, title: 'T', name: 'A', level: 0, earnerName: null,
  week: '2026-W45', rank: 2, code: 'ZERO5-ABCDEF', txid: 'a'.repeat(64),
  id: 'PO-20261110-ABCD',
  payout: { amount: 10, currency: 'zero', id: 'PO-1', txid: 'tx123' },
  promo: { title: 'P', remaining: 3 },
  subtotal: 100, discount: 5, zoneBn: 'Inside Dhaka', fee: 60, total: 155,
  greet: ' Thank you!', shopAddress: 't1SHOP', price_zero: 5, paid: 3,
};

test('i18n: t() renders all 137 keys in both languages; fallback is Bengali, then the key', () => {
  const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf-8'));
  const bn = JSON.parse(readFileSync(new URL('../i18n/bn.json', import.meta.url), 'utf-8'));
  const enKeys = Object.keys(en).sort();
  const bnKeys = Object.keys(bn).sort();
  assert.equal(enKeys.length, 137);
  assert.deepEqual(enKeys, bnKeys);
  for (const k of enKeys) {
    for (const lang of ['en', 'bn']) {
      const s = t(k, lang, I18N_VARS);
      assert.equal(typeof s, 'string', k + '/' + lang);
      assert.ok(s.length > 0, k + '/' + lang);
      assert.notEqual(s, k, k + '/' + lang);
      assert.ok(!s.includes('undefined'), k + '/' + lang + ' => ' + s);
    }
  }
  assert.equal(t('no.such.key', 'en'), 'no.such.key');
  assert.equal(t('no.such.key', 'bn', {}, 'fallback'), 'fallback');
  assert.equal(t('tasks.checkin_title', 'en'), 'Daily Check-in');
  assert.equal(t('tasks.checkin_title', 'bn'), 'দৈনিক চেক-ইন');
  assert.ok(t('deposit.success', 'en', { stars: 25 }).includes('25 Stars'));
  // Referral-bonus fallback literal is language-consistent (friend / বন্ধু).
  assert.match(t('claim.referral_bonus_note', 'en', { level: 0, earnerName: null }), /friend/);
  assert.match(t('claim.referral_bonus_note', 'bn', { level: 0, earnerName: null }), /বন্ধু/);
  // Commission note has no || fallback in its template — the history
  // translator fills the per-language fallback name.
  assert.equal(translateHistoryNote({ type: 'commission', source: 'commission', note: 'x', noteKey: 'history.commission_note', noteVars: { level: 0, earnerName: null } }, 'en').note, 'Commission Level 1 — Friend');
  assert.equal(translateHistoryNote({ type: 'commission', source: 'commission', note: 'x', noteKey: 'history.commission_note', noteVars: { level: 0, earnerName: null } }, 'bn').note, 'কমিশন লেভেল 1 — বন্ধু');
  // pdfTitle falls back to the catalog title when no pdf.title.* key exists.
  assert.equal(pdfTitle({ id: 'test-pdf', title: 'Test PDF — BazarGoo Guide' }, 'en'), 'Test PDF — BazarGoo Guide');
  assert.equal(pdfTitle({ id: 'shopping-guide', title: 'BazarGoo কেনাকাটা গাইড' }, 'en'), 'BazarGoo Shopping Guide');
});

test('i18n: normalizeLang + getUserLang/setUserLang (stored zlang wins over language_code)', async () => {
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('en-US'), 'en');
  assert.equal(normalizeLang('bn'), 'bn');
  assert.equal(normalizeLang(undefined), 'bn');
  assert.equal(normalizeLang('ru'), 'bn');
  const kv = makeKv();
  const env = makeEnv(kv);
  assert.equal(await getUserLang(env, 111, { language_code: 'en' }), 'en');
  assert.equal(await getUserLang(env, 111, { language_code: 'bn' }), 'bn');
  await setUserLang(env, 111, 'en');
  assert.equal(await kv.get('zlang:111'), 'en');
  assert.equal(await getUserLang(env, 111, { language_code: 'bn' }), 'en'); // stored wins
  assert.equal(await apiLang(env, 111, 'bn'), 'bn'); // explicit param wins over stored
  assert.equal(await apiLang(env, 111, 'fr'), 'en'); // invalid param -> stored
  assert.equal(await apiLang(env, 222, null), 'bn'); // no param, no stored
});

test('i18n: GET /tasks?lang=en returns English titles + quiz; default stays Bengali', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const en = await getTasks(8507294759, '&lang=en');
  assert.equal(en.tasks.length, 23);
  assert.equal(en.tasks.find((x) => x.id === 'checkin').title, 'Daily Check-in');
  assert.equal(en.tasks.find((x) => x.id === 'checkin').desc, 'Once a day — open the app and check in');
  assert.equal(en.tasks.find((x) => x.id === 'visit_page_play').desc, 'Once every 24 hours — visit the Page/channel (the latest post will be at the top)');
  assert.equal(en.tasks.find((x) => x.id === 'ad_monetag').title, '📺 Watch an ad (Monetag)');
  const quiz = en.tasks.find((x) => x.id === 'quiz');
  assert.equal(quiz.questions[0].q, 'How much is the delivery charge inside Dhaka?');
  assert.deepEqual(quiz.questions[0].options, ['৳60', '৳120', '৳200']);
  assert.equal(quiz.questions[1].q, 'What is the payment method at BazarGoo?');
  assert.equal(quiz.questions[1].options[0], 'Cash on Delivery'); // language-neutral, kept
  assert.equal(quiz.questions[2].q, 'What is the first-order coupon code?');
  assert.equal(en.profile.name, 'User');
  const bn = await getTasks(8507294759);
  assert.equal(bn.tasks.find((x) => x.id === 'checkin').title, 'দৈনিক চেক-ইন');
  assert.equal(bn.tasks.find((x) => x.id === 'quiz').questions[0].q, 'ঢাকার ভেতরে ডেলিভারি চার্জ কত?');
  assert.equal(bn.profile.name, 'ব্যবহারকারী');
});

test('i18n: GET /tasks?lang=en translates react_withdraw (withdraw gate); Bengali default unchanged', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv);
  const en = await getTasks(8507294759, '&lang=en');
  const rwEn = en.tasks.find((x) => x.id === 'react_withdraw');
  assert.equal(rwEn.title, '💸 Before withdrawing — react ❤️ on @bazargoowithdraw');
  assert.equal(rwEn.desc, 'Once a day — react ❤️ to the pinned post in the withdraw channel, then claim (a withdraw requirement, not a reward)');
  assert.equal(rwEn.reward, 0); // withdraw gate, not an earning task
  const bn = await getTasks(8507294759);
  const rwBn = bn.tasks.find((x) => x.id === 'react_withdraw');
  assert.equal(rwBn.title, '💸 তোলার আগে — @bazargoowithdraw-এ ❤️ রিঅ্যাক্ট');
  assert.equal(rwBn.desc, 'দিনে ১ বার — উইথড্র চ্যানেলের পিন করা পোস্টে ❤️ রিঅ্যাক্ট দিন, তারপর দাবি করুন (তোলার শর্ত, পুরস্কার নয়)');
});

test('i18n: /start in English via language_code; stored zlang wins when no language_code', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const fromEn = { id: 8507294759, username: 'Shamsul2104', first_name: 'Shamsul', language_code: 'en' };
  await handleUpdate(msgUpdate({ text: '/start', from: fromEn, chat: { id: 8507294759, first_name: 'Shamsul' } }), env);
  let msgs = tgBodies(fetchStub, 'sendMessage');
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /Welcome to Bazar Goo/);
  assert.equal(msgs[0].reply_markup.inline_keyboard[0][0].text, '🛍️ Open Shop');
  // Language toggle row is present on the welcome.
  assert.deepEqual(msgs[0].reply_markup.inline_keyboard[1].map((b) => b.callback_data), ['lang:bn', 'lang:en']);
  // Stored zlang wins over a Bengali language_code.
  await kv.put('zlang:8507294759', 'en');
  await handleUpdate(msgUpdate({ text: '/start' }), env);
  msgs = tgBodies(fetchStub, 'sendMessage');
  assert.match(msgs[1].text, /Welcome to Bazar Goo/);
});

test('i18n: /language shows the picker; lang:en toggle persists and re-sends the welcome', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const uid = 8507294759;
  await handleUpdate(msgUpdate({ text: '/language' }), env);
  let msgs = tgBodies(fetchStub, 'sendMessage');
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].text, /ভাষা বেছে নিন \/ Choose your language/);
  assert.deepEqual(msgs[0].reply_markup.inline_keyboard[0].map((b) => b.callback_data), ['lang:bn', 'lang:en']);
  const cb = {
    update_id: 10,
    callback_query: {
      id: 'cq-lang-1',
      from: { id: uid },
      message: { message_id: 5, chat: { id: uid }, text: 'ভাষা বেছে নিন / Choose your language:' },
      data: 'lang:en',
    },
  };
  const res = await handleUpdate(cb, env);
  assert.equal(res.handled, 'callback');
  assert.equal(res.action, 'language');
  assert.equal(res.lang, 'en');
  assert.equal(await kv.get('zlang:' + uid), 'en');
  assert.equal(tgCalls(fetchStub, 'answerCallbackQuery').length, 1);
  msgs = tgBodies(fetchStub, 'sendMessage');
  assert.match(msgs[1].text, /Welcome to Bazar Goo/);
  // The toggle persists: a later /start with no language_code stays English.
  await handleUpdate(msgUpdate({ text: '/start' }), env);
  assert.match(tgBodies(fetchStub, 'sendMessage')[2].text, /Welcome to Bazar Goo/);
  // Toggle back to Bengali.
  await handleUpdate({ ...cb, callback_query: { ...cb.callback_query, id: 'cq-lang-2', data: 'lang:bn' } }, env);
  assert.equal(await kv.get('zlang:' + uid), 'bn');
  assert.match(tgBodies(fetchStub, 'sendMessage')[3].text, /Bazar Goo-তে স্বাগতম/);
});

test('i18n: admin messages stay Bengali while the user message is translated', async () => {
  const kv = makeKv();
  await kv.put('zlang:999', 'en'); // the promo owner is an English user
  const promo = await seedPromo(kv);
  const env = makeEnv(kv);
  const res = await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'promo_approve:' + promo.id), env);
  assert.equal(res.ok, true);
  const userMsgs = tgBodies(fetchStub, 'sendMessage').filter((m) => m.chat_id === 999);
  assert.equal(userMsgs.length, 1);
  assert.match(userMsgs[0].text, /has been approved/); // user-facing: English
  assert.ok(!/অনুমোদন হয়েছে/.test(userMsgs[0].text));
  // Admin-side verdict + edited message stay Bengali.
  assert.match(tgBodies(fetchStub, 'answerCallbackQuery')[0].text, /অনুমোদন হয়েছে/);
  assert.match(tgBodies(fetchStub, 'editMessageText')[0].text, /অনুমোদন হয়েছে/);
  // Reject path: same split — English user message, Bengali verdict.
  const promo2 = await seedPromo(kv, { id: 'PR-20261109-EFGH' });
  await handleUpdate(adminCallbackUpdate(ADMIN_ID, 'promo_reject:' + promo2.id), env);
  const userMsgs2 = tgBodies(fetchStub, 'sendMessage').filter((m) => m.chat_id === 999);
  assert.match(userMsgs2[1].text, /was not approved/);
  assert.match(tgBodies(fetchStub, 'answerCallbackQuery')[1].text, /প্রত্যাখ্যান হয়েছে/);
  // A non-admin tapping an admin button gets the translated refusal.
  await kv.put('zlang:555', 'en');
  const nonAdmin = await handleUpdate(adminCallbackUpdate(555, 'promo_approve:' + promo.id), env);
  assert.equal(nonAdmin.ok, false);
  assert.equal(nonAdmin.reason, 'not_admin');
  assert.equal(tgBodies(fetchStub, 'answerCallbackQuery')[2].text, 'Only the admin can do this.');
});

test('i18n: Stars invoice translates per buyer language', async () => {
  const kv = makeKv();
  const env = makeEnv(kv);
  const fromEn = { id: 8507294759, username: 'Shamsul2104', first_name: 'Shamsul', language_code: 'en' };
  await handleUpdate(msgUpdate({ text: '/start buy_shopping-guide', from: fromEn, chat: { id: 8507294759 } }), env);
  let invoices = tgBodies(fetchStub, 'sendInvoice');
  assert.equal(invoices.length, 1);
  assert.equal(invoices[0].title, 'BazarGoo Shopping Guide');
  assert.match(invoices[0].description, /the bot will send the PDF itself/);
  assert.equal(invoices[0].prices[0].label, 'BazarGoo Shopping Guide');
  const env2 = makeEnv(makeKv());
  await handleUpdate(msgUpdate({ text: '/start buy_shopping-guide' }), env2);
  invoices = tgBodies(fetchStub, 'sendInvoice');
  assert.equal(invoices[1].title, 'BazarGoo কেনাকাটা গাইড');
  assert.match(invoices[1].description, /পেমেন্টের পর বট নিজেই/);
});

test('i18n: /history translates notes at response time; legacy notes stay as stored', async () => {
  const kv = makeKv();
  const uid = 8507294759;
  await kv.put('zh:' + uid, JSON.stringify([
    { ts: '2026-11-10T00:00:00.000Z', type: 'deposit', amount: 10, source: 'deposit_stars', note: 'Stars জমা', noteKey: 'deposit.history_note', noteVars: {}, currency: 'STARS' },
    { ts: '2026-11-10T00:00:00.000Z', type: 'task', amount: 1, source: 'checkin', note: 'দৈনিক চেক-ইন' },
    { ts: '2026-11-10T00:00:00.000Z', type: 'purchase', amount: -5, source: 'purchase', note: 'BazarGoo কেনাকাটা গাইড', item_id: 'shopping-guide' },
    { ts: '2026-11-10T00:00:00.000Z', type: 'task', amount: 1, source: 'weird_task', note: 'অজানা নোট' },
  ]));
  envForPost = makeEnv(kv);
  const enRes = await worker.fetch(new Request('https://worker.test/history?user_id=' + uid + '&lang=en'), envForPost);
  const en = await enRes.json();
  assert.equal(en.entries[0].note, 'Stars deposit');
  assert.equal(en.entries[1].note, 'Daily Check-in');
  assert.equal(en.entries[2].note, 'BazarGoo Shopping Guide');
  assert.equal(en.entries[3].note, 'অজানা নোট'); // no key/source match -> stored note kept
  const bnRes = await worker.fetch(new Request('https://worker.test/history?user_id=' + uid), envForPost);
  const bn = await bnRes.json();
  assert.equal(bn.entries[0].note, 'Stars জমা');
  assert.equal(bn.entries[1].note, 'দৈনিক চেক-ইন');
});

test('i18n: /leaderboard + /referral-contest fallback names and /religion titles translate', async () => {
  const kv = makeKv();
  const week = dhakaWeekKey();
  await kv.put('zw:111:' + week, '10');
  await kv.put('zlt:111', '10');
  envForPost = makeEnv(kv);
  const lbEn = await (await worker.fetch(new Request('https://worker.test/leaderboard?user_id=8507294759&lang=en'), envForPost)).json();
  assert.equal(lbEn.top10[0].name, 'Friend');
  const lbBn = await (await worker.fetch(new Request('https://worker.test/leaderboard?user_id=8507294759'), envForPost)).json();
  assert.equal(lbBn.top10[0].name, 'বন্ধু');
  const relEn = await (await worker.fetch(new Request('https://worker.test/religion?user_id=8507294759&lang=en'), envForPost)).json();
  assert.equal(relEn.pdfs.find((p) => p.id === 'rel-fatiha').title, 'Surah Al-Fatiha — With Bengali Translation');
  const relBn = await (await worker.fetch(new Request('https://worker.test/religion?user_id=8507294759'), envForPost)).json();
  assert.equal(relBn.pdfs.find((p) => p.id === 'rel-fatiha').title, 'সূরা আল-ফাতিহা — বাংলা অর্থসহ');
});

test('i18n: pre-checkout errors translate; validatePreCheckout default stays Bengali', async () => {
  assert.equal(validatePreCheckout({ invoice_payload: 'buy:test-pdf', currency: 'USD', total_amount: 1 }, 'en').error, 'You must pay with Stars (XTR).');
  assert.match(validatePreCheckout({ invoice_payload: 'buy:test-pdf', currency: 'XTR', total_amount: 99 }).error, /দাম/);
  assert.equal(validatePreCheckout({ invoice_payload: 'buy:test-pdf', currency: 'XTR', total_amount: 1 }).ok, true);
  const kv = makeKv();
  const env = makeEnv(kv);
  await handleUpdate({
    update_id: 3,
    pre_checkout_query: {
      id: 'pcq-1',
      from: { id: 8507294759, language_code: 'en' },
      currency: 'USD', total_amount: 1, invoice_payload: 'buy:test-pdf',
    },
  }, env);
  const answers = tgBodies(fetchStub, 'answerPreCheckoutQuery');
  assert.equal(answers.length, 1);
  assert.equal(answers[0].ok, false);
  assert.equal(answers[0].error_message, 'You must pay with Stars (XTR).');
});

test('i18n: /wallet accepts lang; /deposit-start and /promote-submit notes translate via body.lang', async () => {
  const kv = makeKv();
  envForPost = makeEnv(kv, ZERO_PAYOUT_ENV);
  const w = await (await worker.fetch(new Request('https://worker.test/wallet?user_id=111&lang=en'), envForPost)).json();
  assert.equal(w.ok, true);
  assert.ok(w.withdraw_gate);
  assert.equal(w.zero_payout_configured, true);
  const dep = await postJson('/deposit-start', { user_id: 111, currency: 'zero', amount: 5, lang: 'en' });
  assert.equal(dep.note, 'Confirm by sending the txid');
  const depBn = await postJson('/deposit-start', { user_id: 111, currency: 'zero', amount: 5 });
  assert.equal(depBn.note, 'txid পাঠিয়ে কনফার্ম করুন');
  const promo = await postJson('/promote-submit', { user_id: 111, title: 'X', url: 'https://example.com/x', type: 'post', currency: 'zero', budget: 100, lang: 'en' });
  assert.equal(promo.pay.note, 'Promote payment — confirm by sending the txid');
  const coupon = await postJson('/coupon/use', { user_id: 111, code: 'NOPE', lang: 'en' });
  assert.equal(coupon.ok, false); // no coupon seeded; note only comes back on success
});
