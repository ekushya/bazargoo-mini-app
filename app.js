/* BazarGoo Telegram Mini App — checkout v2 (8 Nov 2026, per Angela)
 * Browse real bazargoo.com products, cart, and place an order.
 * Inside Telegram the order is sent to the bot via sendData();
 * outside Telegram the order summary is shown with a copy button.
 * Checkout: delivery form (name auto-filled from Telegram, phone via
 * Telegram contact share or typed, address typed), shipping Inside
 * Dhaka ৳60 / Outside Dhaka ৳120, payment Cash on Delivery only.
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
  var cart = loadCart(); // { id: qty }
  var openSheet = null; // 'detail' | 'cart' | 'confirm' | null
  var detailId = null;

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
  function haptic(kind) {
    try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(kind || 'light'); } catch (e) {}
  }
  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
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
  function grandTotal() { return cartTotal() + shippingFee(); }

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
    } else if (openSheet === 'detail' || openSheet === 'confirm') {
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
  }

  // ---------- data ----------
  function loadProducts() {
    return fetch('products.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        products = data.products || [];
        products.forEach(function (p) { productById[p.id] = p; });
        renderChips();
        renderGrid();
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
    var html = '<button class="chip' + (activeCategory === 'all' ? ' active' : '') +
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
      if (activeCategory !== 'all' && (p.category || 'অন্যান্য') !== activeCategory) return false;
      if (q && p.name.toLowerCase().indexOf(q) === -1 &&
          (p.category || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    if (sortMode === 'price-asc') list.sort(function (a, b) { return a.price - b.price; });
    if (sortMode === 'price-desc') list.sort(function (a, b) { return b.price - a.price; });
    return list;
  }

  function qtyControlHTML(id, full) {
    var q = cart[id] || 0;
    if (q === 0) {
      return '<button class="btn-add" type="button" data-add="' + esc(id) + '">যোগ করুন</button>';
    }
    return '<div class="qty-control' + (full ? ' full' : '') + '">' +
      '<button type="button" data-dec="' + esc(id) + '" aria-label="কমান">−</button>' +
      '<span class="qty-num">' + bnNum(q) + '</span>' +
      '<button type="button" data-inc="' + esc(id) + '" aria-label="বাড়ান">+</button></div>';
  }

  function renderGrid() {
    var list = filteredProducts();
    var grid = $('grid');
    $('emptyState').hidden = list.length !== 0;
    var html = '';
    list.forEach(function (p) {
      var pct = discountPct(p);
      html += '<article class="card" data-open="' + esc(p.id) + '">' +
        (p.image
          ? '<img class="card-img" src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;card-img-placeholder&quot;>🛍️</div>\'">'
          : '<div class="card-img-placeholder">🛍️</div>') +
        '<div class="card-body">' +
        '<div class="card-name">' + esc(p.name) + '</div>' +
        '<div class="card-price-row"><span class="price">' + fmt(p.price) + '</span>' +
        (p.old_price ? '<span class="old-price">' + fmt(p.old_price) + '</span>' : '') +
        (pct ? '<span class="discount-badge">-' + pct + '%</span>' : '') + '</div>' +
        '<div class="card-cat">' + esc(CATEGORY_BN[p.category] || p.category || '') + '</div>' +
        qtyControlHTML(p.id, true) +
        '</div></article>';
    });
    grid.innerHTML = html;
    bindCardEvents(grid);
  }

  function bindCardEvents(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-open]'), function (el) {
      el.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-add],[data-inc],[data-dec]')) return;
        openDetail(el.getAttribute('data-open'));
      });
    });
    bindQtyButtons(root);
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

  // ---------- cart ----------
  function changeQty(id, delta) {
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
    updateTotals();
  }

  function updateTotals() {
    $('subtotalVal').textContent = fmt(cartTotal());
    $('shippingVal').textContent = fmt(shippingFee());
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
    openSheet = null;
    updateBackButton();
    updateMainButton();
  }

  function openDetail(id) {
    var p = productById[id];
    if (!p) return;
    detailId = id;
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
    var link = $('detailLink');
    link.href = p.url;
    link.addEventListener('click', function (ev) {
      if (tg && tg.openLink) { ev.preventDefault(); tg.openLink(p.url); }
    }, { once: true });
    renderDetailQty();
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
    return {
      type: 'bazargoo_order',
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
      total: cartTotal() + fee,
      item_count: cartCount(),
      user: user,
      ordered_at: new Date().toISOString()
    };
  }

  function orderSummaryText(order) {
    var lines = ['🛍️ BazarGoo অর্ডার', ''];
    order.items.forEach(function (it) {
      lines.push('• ' + it.name + ' × ' + it.qty + ' — ৳' + it.subtotal.toLocaleString('en-US'));
    });
    var d = order.delivery || {};
    lines.push('', 'পণ্যের মোট: ৳' + (order.subtotal || order.total).toLocaleString('en-US'));
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

  // ---------- wiring ----------
  function wireEvents() {
    $('searchInput').addEventListener('input', function (e) {
      searchQuery = e.target.value;
      renderGrid();
    });
    $('sortSelect').addEventListener('change', function (e) {
      sortMode = e.target.value;
      renderGrid();
    });
    $('cartBtn').addEventListener('click', openCartSheet);
    $('stickyCartBtn').addEventListener('click', openCartSheet);
    $('orderBtn').addEventListener('click', placeOrder);
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
})();
