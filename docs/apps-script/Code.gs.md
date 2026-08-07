```javascript

var SHEET_PRODUCTS = 'Products';
var SHEET_ORDERS = 'Orders';
var SHEET_CUSTOMERS = 'Customers';
var SHEET_COUPONS = 'Coupons';
var SHEET_CONFIG = 'Config';
var PROP_TOKEN = 'STOREFRONT_TOKEN';
var PROP_ADMIN = 'ADMIN_PASSWORD';
var PROP_PP_CLIENT_ID = 'PHONEPE_CLIENT_ID';
var PROP_PP_CLIENT_SECRET = 'PHONEPE_CLIENT_SECRET';
var PROP_PP_CLIENT_VERSION = 'PHONEPE_CLIENT_VERSION';
var PROP_PP_ENV = 'PHONEPE_ENV'; // sandbox | production
var PROP_PP_ACCESS = 'PHONEPE_ACCESS_TOKEN';
var PROP_PP_EXPIRES = 'PHONEPE_TOKEN_EXPIRES_AT';

var STATUS_PENDING = 'pending_payment';
var STATUS_REPORTED = 'payment_reported';
var STATUS_PAID = 'paid';
var STATUS_EXPIRED = 'expired';

var COUPON_ACTIVE = 'active';
var COUPON_RESERVED = 'reserved';
var COUPON_USED = 'used';

/* ===================== HTTP ===================== */

function doGet(e) {
  try {
    e = e || { parameter: {} };
    var params = e.parameter || {};

    if (String(params.page || '') === 'admin') {
      return HtmlService.createHtmlOutputFromFile('Admin')
        .setTitle('Mino Pets — Mark Paid')
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    var action = (params.action || 'getStock').toString();
    var token = (params.token || '').toString();

    var originCheck = assertAllowedOrigin_(params.origin);
    if (!originCheck.ok) {
      return jsonOut_(originCheck);
    }

    if (!isValidToken(token)) {
      return jsonOut_({ ok: false, error: 'unauthorized' });
    }

    if (action === 'ping') {
      return jsonOut_({ ok: true, pong: true, at: new Date().toISOString() });
    }
    if (action === 'getStock') {
      return jsonOut_({ ok: true, stock: getStockMap_() });
    }
    if (action === 'getCatalog') {
      return jsonOut_(getCatalogResponse_());
    }
    if (action === 'lookupCustomer') {
      return jsonOut_(lookupCustomer_(params.phone));
    }
    if (action === 'validateCoupon') {
      return jsonOut_(validateCouponPreview_(params.code, params.phone, params.subtotal));
    }

    return jsonOut_({ ok: false, error: 'unknown_action', action: action });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    var body = parsePostBody_(e);

    var originCheck = assertAllowedOrigin_(body.origin);
    if (!originCheck.ok) {
      return jsonOut_(originCheck);
    }

    var token = (body.token || '').toString();
    if (!isValidToken(token)) {
      return jsonOut_({ ok: false, error: 'unauthorized' });
    }

    var action = (body.action || '').toString();
    if (action === 'createOrder') {
      return jsonOut_(createOrder_(body));
    }
    if (action === 'reportPayment') {
      return jsonOut_(reportPayment_(body));
    }
    if (action === 'createPhonePePayment') {
      return jsonOut_(createPhonePePayment_(body));
    }
    if (action === 'confirmPhonePePayment') {
      return jsonOut_(confirmPhonePePayment_(body));
    }

    return jsonOut_({ ok: false, error: 'unknown_action', action: action });
  } catch (err) {
    return jsonOut_({
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('empty_body');
  }
  return JSON.parse(e.postData.contents);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== Auth helpers ===================== */

/** Run once from editor if token not set yet */
function setStorefrontToken() {
  var token = 'mino_' + Utilities.getUuid().replace(/-/g, '').slice(0, 24);
  PropertiesService.getScriptProperties().setProperty(PROP_TOKEN, token);
  Logger.log('STOREFRONT_TOKEN set. Copy into LOCAL_SETUP.md and api-config:');
  Logger.log(token);
  return token;
}

function showStorefrontToken() {
  var token = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  Logger.log(token || '(not set — run setStorefrontToken first)');
  return token;
}

/**
 * Store admin password in Script Properties (for ?page=admin).
 *
 * Easiest from the Apps Script editor:
 *   1) Put your password in EDITOR_PASSWORD below (min 8 chars)
 *   2) Select setAdminPassword → Run
 *   3) Clear EDITOR_PASSWORD back to '' and Save (so it is not left in code)
 *
 * Spreadsheet UI prompt: open the Sheet tab first — the dialog appears THERE,
 * not in the Apps Script editor (otherwise Run looks "stuck").
 */
function setAdminPassword() {
  var EDITOR_PASSWORD = ''; // temporary: 'yourStrongPassword' then clear after Run

  var password = String(EDITOR_PASSWORD || '').trim();
  if (password) {
    if (password.length < 8) {
      throw new Error('Use at least 8 characters.');
    }
    PropertiesService.getScriptProperties().setProperty(PROP_ADMIN, password);
    Logger.log('ADMIN_PASSWORD saved. Clear EDITOR_PASSWORD in Code.gs and Save.');
    return true;
  }

  // Prompt only works when the Google Sheet UI is open (dialog is on the Sheet tab).
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (err) {
    throw new Error(
      'No Sheet UI. Set EDITOR_PASSWORD at the top of setAdminPassword(), Run, then clear it.'
    );
  }

  var res = ui.prompt(
    'Mino Pets admin password',
    'Password for the Mark Paid page (?page=admin):',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) {
    Logger.log('Cancelled');
    return false;
  }
  password = String(res.getResponseText() || '').trim();
  if (password.length < 8) {
    ui.alert('Use at least 8 characters.');
    return false;
  }
  PropertiesService.getScriptProperties().setProperty(PROP_ADMIN, password);
  ui.alert('Admin password saved in Script Properties.');
  return true;
}

function isValidToken(token) {
  var expected = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  if (!expected) return false;
  return token === expected;
}

function isValidAdminPassword_(password) {
  var expected = PropertiesService.getScriptProperties().getProperty(PROP_ADMIN);
  if (!expected) return false;
  return String(password || '') === expected;
}

/**
 * Save PhonePe Standard Checkout credentials in Script Properties.
 * Fill EDITOR_* below → Run setPhonePeCredentials → clear secrets → Save.
 * Also set Config sheet phonepe_enabled = TRUE.
 */
function setPhonePeCredentials() {
  var EDITOR_CLIENT_ID = '';
  var EDITOR_CLIENT_SECRET = '';
  var EDITOR_CLIENT_VERSION = '1';
  var EDITOR_ENV = 'sandbox'; // sandbox | production

  var clientId = String(EDITOR_CLIENT_ID || '').trim();
  var clientSecret = String(EDITOR_CLIENT_SECRET || '').trim();
  var clientVersion = String(EDITOR_CLIENT_VERSION || '1').trim() || '1';
  var env = String(EDITOR_ENV || 'sandbox').trim().toLowerCase();
  if (env !== 'production') env = 'sandbox';

  if (!clientId || !clientSecret) {
    throw new Error('Set EDITOR_CLIENT_ID and EDITOR_CLIENT_SECRET, Run, then clear them.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    PHONEPE_CLIENT_ID: clientId,
    PHONEPE_CLIENT_SECRET: clientSecret,
    PHONEPE_CLIENT_VERSION: clientVersion,
    PHONEPE_ENV: env
  }, false);
  // Clear cached token so next call uses new credentials
  props.deleteProperty(PROP_PP_ACCESS);
  props.deleteProperty(PROP_PP_EXPIRES);
  Logger.log('PhonePe credentials saved (env=' + env + '). Clear EDITOR_* fields and Save.');
  Logger.log('Set Config phonepe_enabled = TRUE, then redeploy web app (New version).');
  return true;
}

/* ===================== Config ===================== */

function getConfigMap_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONFIG);
  if (!sh) throw new Error('Config sheet not found');
  var values = sh.getDataRange().getValues();
  var map = {};
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][0] || '').trim();
    if (!key) continue;
    map[key] = values[r][1];
  }
  return map;
}

function configNumber_(cfg, key, fallback) {
  var n = Number(cfg[key]);
  return isFinite(n) ? n : fallback;
}

/** Step 10 — Config `allowed_origins` comma-separated.
 * Use real browser origins only: scheme + host + port (NO path).
 * Good: http://localhost:3000 , https://myminopets.com
 * Bad:  https://myminopets.com/dev  (path is stripped if present)
 *
 * Storefront Config keys (optional):
 * - pickup_maps_url — Google Maps share link shown for Self Pickup at checkout
 * - phonepe_enabled — TRUE to offer PhonePe Standard Checkout (needs Script Properties credentials)
 * - auto_confirm_on_report — TRUE = “I have paid” immediately marks order paid (no admin).
 *   Default when unset: ON while PhonePe is not ready; OFF once PhonePe is live.
 *   Set FALSE to always require admin Mark Paid; set TRUE to keep trust-customer even with PhonePe.
 */
function getAllowedOrigins_() {
  var cfg = getConfigMap_();
  var raw = String(cfg.allowed_origins || '').trim();
  var list;
  if (!raw) {
    list = ['http://localhost:3000', 'https://myminopets.com'];
  } else {
    list = raw.split(',');
  }
  return list.map(function (s) {
    return normalizeOrigin_(s);
  }).filter(Boolean);
}

/** Strip path/query — window.location.origin never includes /dev */
function normalizeOrigin_(origin) {
  var s = String(origin || '').trim();
  if (!s) return '';
  var m = s.match(/^(https?:\/\/[^\/\s?#]+)/i);
  return m ? m[1] : s.replace(/\/$/, '');
}

function isAllowedOrigin_(origin) {
  var o = normalizeOrigin_(origin);
  if (!o) return false;
  var allowed = getAllowedOrigins_();
  for (var i = 0; i < allowed.length; i++) {
    if (o === allowed[i]) return true;
  }
  return false;
}

function assertAllowedOrigin_(origin) {
  var o = normalizeOrigin_(origin);
  if (!o) return { ok: false, error: 'missing_origin' };
  if (!isAllowedOrigin_(o)) {
    return {
      ok: false,
      error: 'origin_not_allowed',
      origin: o,
      hint: 'Add this exact origin to Config allowed_origins (no /path). Example: http://localhost:3000,https://myminopets.com'
    };
  }
  return { ok: true };
}

/* ===================== Products / stock ===================== */

function getProductsSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PRODUCTS);
  if (!sh) throw new Error('Products sheet not found');
  return sh;
}

function getOrdersSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ORDERS);
  if (!sh) throw new Error('Orders sheet not found');
  return sh;
}

/**
 * Returns { byId: { id: { row, product_id, name, price, onHand, reserved, active } }, col: {...} }
 * row is 1-based sheet row index.
 */
function loadProductsState_() {
  var sh = getProductsSheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) {
    return { byId: {}, col: {} };
  }

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var col = {
    id: headers.indexOf('product_id'),
    name: headers.indexOf('name'),
    price: headers.indexOf('price'),
    onHand: headers.indexOf('stock_on_hand'),
    reserved: headers.indexOf('stock_reserved'),
    active: headers.indexOf('active'),
    packs: headers.indexOf('pack_options_json'),
    sku: headers.indexOf('sku'),
    comboItems: headers.indexOf('combo_items')
  };

  if (col.id < 0 || col.onHand < 0 || col.reserved < 0 || col.price < 0) {
    throw new Error('Products needs product_id, price, stock_on_hand, stock_reserved');
  }

  var byId = {};
  var bySku = {};
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = row[col.id];
    if (id === '' || id === null || id === undefined) continue;
    var entry = {
      rowIndex: r + 1,
      product_id: String(id),
      name: col.name >= 0 ? String(row[col.name] || '') : '',
      price: Number(row[col.price]) || 0,
      onHand: Number(row[col.onHand]) || 0,
      reserved: Number(row[col.reserved]) || 0,
      active: col.active < 0 ? true : !(
        row[col.active] === false ||
        row[col.active] === 'FALSE' ||
        row[col.active] === 0 ||
        row[col.active] === '0'
      ),
      packOptions: [],
      sku: '',
      comboItems: [],
      components: [],
      hasLinkedCombo: false,
      componentsOk: true
    };
    if (col.packs >= 0) {
      entry.packOptions = normalizePackOptions_(row[col.packs]);
    }
    if (col.sku >= 0 && row[col.sku]) {
      entry.sku = String(row[col.sku]).trim();
      if (entry.sku) bySku[entry.sku] = entry.product_id;
    }
    if (col.comboItems >= 0 && row[col.comboItems]) {
      entry.comboItems = normalizeComboItems_(row[col.comboItems]);
    }
    byId[String(id)] = entry;
  }

  var state = { byId: byId, bySku: bySku, col: col, sheet: sh };
  attachComboComponents_(state);
  return state;
}

function normalizePackOptions_(raw) {
  var arr = parseJsonCell_(raw, null);
  if (!Array.isArray(arr)) return [];
  var out = [];
  var seen = {};
  for (var i = 0; i < arr.length; i++) {
    var p = arr[i] || {};
    var units = Math.floor(Number(p.units));
    var price = Number(p.price);
    if (!isFinite(units) || units < 1 || !isFinite(price) || price < 0) continue;
    var key = String(p.key || ('u' + units)).trim();
    if (!key || seen[key]) key = 'u' + units;
    if (seen[key]) continue;
    seen[key] = true;
    out.push({
      key: key,
      label: String(p.label || (units + ' Fish')).trim(),
      units: units,
      price: price
    });
    var packMrp = Number(p.mrp);
    if (isFinite(packMrp) && packMrp > price) {
      out[out.length - 1].mrp = packMrp;
    }
  }
  out.sort(function (a, b) { return a.units - b.units; });
  return out;
}

/**
 * combo_items: display strings OR linked objects (product_id only for stock)
 * ["Neon Tetra ×4"] or
 * [{"product_id":"1001","qty":4,"label":"Neon Tetra ×4"}]
 */
function normalizeComboItems_(raw) {
  var arr = parseJsonCell_(raw, null);
  if (!Array.isArray(arr)) return [];
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    if (it == null) continue;
    if (typeof it === 'string' || typeof it === 'number') {
      var s = String(it).trim();
      if (s) out.push({ label: s, qty: 0, product_id: '' });
      continue;
    }
    if (typeof it !== 'object') continue;
    var qty = Math.floor(Number(it.qty));
    var label = String(it.label || it.name || '').trim();
    var pid = it.product_id != null && it.product_id !== '' ? String(it.product_id).trim() : '';
    if (!label && pid && isFinite(qty) && qty > 0) {
      label = '#' + pid + ' ×' + qty;
    }
    if (!label && !pid) continue;
    out.push({
      label: label || pid,
      qty: isFinite(qty) && qty > 0 ? qty : 0,
      product_id: pid
    });
  }
  return out;
}

function comboItemIsLinked_(it) {
  return !!(it && it.qty > 0 && it.product_id);
}

function productHasLinkedComboShape_(entry) {
  var items = (entry && entry.comboItems) || [];
  for (var i = 0; i < items.length; i++) {
    if (comboItemIsLinked_(items[i])) return true;
  }
  return false;
}

function attachComboComponents_(state) {
  Object.keys(state.byId).forEach(function (id) {
    var entry = state.byId[id];
    var linked = [];
    for (var i = 0; i < (entry.comboItems || []).length; i++) {
      if (comboItemIsLinked_(entry.comboItems[i])) linked.push(entry.comboItems[i]);
    }
    if (!linked.length) {
      entry.components = [];
      entry.hasLinkedCombo = false;
      entry.componentsOk = true;
      return;
    }
    entry.hasLinkedCombo = true;
    var comps = [];
    var ok = true;
    for (var j = 0; j < linked.length; j++) {
      var item = linked[j];
      var pid = String(item.product_id || '');
      var target = state.byId[pid];
      if (!target || !target.active) {
        ok = false;
        break;
      }
      if (productHasLinkedComboShape_(target)) {
        ok = false; // no nested linked combos
        break;
      }
      comps.push({
        product_id: pid,
        qty: item.qty,
        label: item.label || (target.name + ' ×' + item.qty)
      });
    }
    entry.components = ok ? comps : [];
    entry.componentsOk = ok && comps.length === linked.length;
  });
}

function comboAvailable_(state, entry) {
  if (!entry) return 0;
  if (entry.hasLinkedCombo) {
    if (!entry.componentsOk || !entry.components.length) return 0;
    var minKits = Infinity;
    for (var i = 0; i < entry.components.length; i++) {
      var c = entry.components[i];
      var avail = available_(state.byId[c.product_id]);
      var kits = Math.floor(avail / c.qty);
      if (kits < minKits) minKits = kits;
    }
    return isFinite(minKits) ? Math.max(0, minKits) : 0;
  }
  return available_(entry);
}

function expandStockMoves_(state, productId, qty) {
  var out = {};
  var n = Math.floor(Number(qty)) || 0;
  if (n < 1) return out;
  var p = state.byId[String(productId)];
  if (p && p.hasLinkedCombo && p.componentsOk && p.components.length) {
    for (var i = 0; i < p.components.length; i++) {
      var c = p.components[i];
      out[c.product_id] = (out[c.product_id] || 0) + n * c.qty;
    }
    return out;
  }
  out[String(productId)] = n;
  return out;
}

function mergeStockMoves_(into, moves) {
  Object.keys(moves || {}).forEach(function (id) {
    into[id] = (into[id] || 0) + (Number(moves[id]) || 0);
  });
}

function stockMovesToArray_(moves) {
  return Object.keys(moves || {}).map(function (id) {
    return { product_id: id, qty: moves[id] };
  });
}

function stockMovesFromOrderItem_(state, it) {
  if (it && Array.isArray(it.stock_moves) && it.stock_moves.length) {
    var map = {};
    for (var i = 0; i < it.stock_moves.length; i++) {
      var m = it.stock_moves[i] || {};
      var pid = String(m.product_id || '').trim();
      var q = Math.floor(Number(m.qty)) || 0;
      if (!pid || q < 1) continue;
      map[pid] = (map[pid] || 0) + q;
    }
    return map;
  }
  return expandStockMoves_(state, it && it.product_id, it && it.qty);
}

function findPackOption_(productState, packKey) {
  var packs = productState.packOptions || [];
  for (var i = 0; i < packs.length; i++) {
    if (packs[i].key === packKey) return packs[i];
  }
  return null;
}

function available_(p) {
  return Math.max(0, (Number(p.onHand) || 0) - (Number(p.reserved) || 0));
}

function getStockMap_() {
  var state = loadProductsState_();
  var out = {};
  Object.keys(state.byId).forEach(function (id) {
    var p = state.byId[id];
    if (!p.active) return;
    out[id] = comboAvailable_(state, p);
  });
  return out;
}

/**
 * Full catalog for the storefront (active rows only) + stock map.
 * Extra columns are optional — missing headers are treated as empty.
 * Optional `mrp` (number > price): struck MRP + % OFF + You save on storefront.
 * Pack-level mrp: include "mrp" on objects in pack_options_json.
 */
function getCatalogResponse_() {
  var built = buildCatalogFromSheet_();
  var cfg = getConfigMap_();
  return {
    ok: true,
    products: built.products,
    stock: built.stock,
    config: {
      pickup_maps_url: String(cfg.pickup_maps_url || '').trim(),
      phonepe_enabled: isPhonePeReady_()
    }
  };
}

function truthyCell_(v) {
  if (v === true || v === 1) return true;
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === '1';
}

function parseJsonCell_(raw, fallback) {
  if (raw === '' || raw === null || raw === undefined) return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch (e) {
    return fallback;
  }
}

function buildCatalogFromSheet_() {
  var sh = getProductsSheet_();
  var values = sh.getDataRange().getValues();
  var products = [];
  var stock = {};

  if (values.length < 2) {
    return { products: products, stock: stock };
  }

  var headers = values[0].map(function (h) { return String(h).trim(); });
  function col(name) { return headers.indexOf(name); }

  var c = {
    id: col('product_id'),
    sku: col('sku'),
    name: col('name'),
    description: col('description'),
    category: col('category'),
    subcategory: col('subcategory'),
    price: col('price'),
    mrp: col('mrp'),
    image: col('image'),
    video: col('video_url'),
    onSale: col('on_sale'),
    isCombo: col('is_combo'),
    comboItems: col('combo_items'),
    filters: col('filters_json'),
    packs: col('pack_options_json'),
    details: col('details_json'),
    onHand: col('stock_on_hand'),
    reserved: col('stock_reserved'),
    active: col('active')
  };

  if (c.id < 0 || c.name < 0 || c.price < 0) {
    throw new Error('Products needs product_id, name, price for getCatalog');
  }

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var idRaw = row[c.id];
    if (idRaw === '' || idRaw === null || idRaw === undefined) continue;

    var active = c.active < 0 ? true : !(
      row[c.active] === false ||
      row[c.active] === 'FALSE' ||
      row[c.active] === 0 ||
      row[c.active] === '0'
    );
    if (!active) continue;

    var onHand = c.onHand >= 0 ? (Number(row[c.onHand]) || 0) : 0;
    var reserved = c.reserved >= 0 ? (Number(row[c.reserved]) || 0) : 0;
    var avail = Math.max(0, onHand - reserved);
    var idStr = String(idRaw);
    stock[idStr] = avail;

    var idNum = Number(idRaw);
    var product = {
      id: isFinite(idNum) && String(idNum) === idStr.trim() ? idNum : idRaw,
      name: String(row[c.name] || ''),
      description: c.description >= 0 ? String(row[c.description] || '') : '',
      price: Number(row[c.price]) || 0,
      category: c.category >= 0 ? String(row[c.category] || '') : '',
      subcategory: c.subcategory >= 0 ? String(row[c.subcategory] || '') : '',
      image: c.image >= 0 ? String(row[c.image] || '') : '',
      inStock: avail > 0,
      available: avail,
      onSale: c.onSale >= 0 ? truthyCell_(row[c.onSale]) : false,
      isCombo: c.isCombo >= 0 ? truthyCell_(row[c.isCombo]) : false,
      filters: c.filters >= 0 ? parseJsonCell_(row[c.filters], {}) : {}
    };

    if (c.mrp >= 0 && row[c.mrp] !== '' && row[c.mrp] != null) {
      var mrpNum = Number(row[c.mrp]);
      if (isFinite(mrpNum) && mrpNum > product.price) product.mrp = mrpNum;
    }
    if (c.sku >= 0 && row[c.sku]) {
      product.sku = String(row[c.sku]).trim();
      var existingImage = c.image >= 0 ? String(row[c.image] || '').trim() : '';
      // Prefer Sheet image column (supports .png); only invent .jpg when image is blank
      if (existingImage) {
        product.image = existingImage;
      } else {
        product.image = '/assets/products/' + product.sku + '-01.jpg';
      }
    }
    if (c.video >= 0 && row[c.video]) {
      product.videoUrl = String(row[c.video]).trim();
    }
    if (c.comboItems >= 0 && row[c.comboItems]) {
      var items = parseJsonCell_(row[c.comboItems], null);
      if (Array.isArray(items)) product.comboItems = items;
    }
    if (c.packs >= 0 && row[c.packs]) {
      var packs = normalizePackOptions_(row[c.packs]);
      if (packs.length) product.packOptions = packs;
    }
    if (c.details >= 0 && row[c.details]) {
      var details = parseJsonCell_(row[c.details], null);
      if (Array.isArray(details) && details.length) {
        product.details = details.map(function (d) { return String(d); });
      } else {
        var detailsText = String(row[c.details] || '').trim();
        if (detailsText && detailsText.charAt(0) !== '[') {
          product.details = detailsText.split(/\n|•|;/).map(function (s) {
            return String(s).trim();
          }).filter(Boolean);
        }
      }
    }

    products.push(product);
  }

  // Linked combos: available = how many full kits can be built from components
  var state = loadProductsState_();
  for (var pi = 0; pi < products.length; pi++) {
    var prod = products[pi];
    var idKey = String(prod.id);
    var entry = state.byId[idKey];
    if (!entry) continue;
    var linkedAvail = comboAvailable_(state, entry);
    stock[idKey] = linkedAvail;
    prod.available = linkedAvail;
    prod.inStock = linkedAvail > 0;
    if (Array.isArray(entry.comboItems) && entry.comboItems.length) {
      if (entry.hasLinkedCombo && entry.componentsOk && entry.components.length) {
        prod.components = entry.components.map(function (c) {
          return { product_id: String(c.product_id), qty: c.qty, label: c.label };
        });
        prod.comboItems = entry.components.map(function (c) {
          return {
            label: c.label,
            qty: c.qty,
            product_id: String(c.product_id)
          };
        });
      } else {
        prod.comboItems = entry.comboItems.map(function (ci) {
          if (ci.qty > 0 && ci.product_id) {
            return {
              label: ci.label,
              qty: ci.qty,
              product_id: String(ci.product_id)
            };
          }
          return ci.label;
        });
      }
    }
  }

  return { products: products, stock: stock };
}

/* ===================== createOrder ===================== */

/**
 * Body:
 * {
 *   token, action: "createOrder",
 *   customer_phone, customer_name,
 *   fulfillment: "local_delivery" | "pickup",
 *   address, pincode,
 *   items: [{ product_id, qty, pack_key?, pack_qty? }]
 * }
 * Client prices ignored — Sheet unit price or pack_options_json wins.
 * qty = fish units to reserve. For packs: qty must equal pack.units * pack_qty.
 */
function createOrder_(body) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'busy_retry' };
  }

  try {
    // Release abandoned holds before taking new stock
    releaseExpiredReservations_(false);

    var phone = normalizePhone_(body.customer_phone);
    var name = String(body.customer_name || '').trim();
    var fulfillment = String(body.fulfillment || 'pickup').trim().toLowerCase();
    var address = String(body.address || '').trim();
    var pincode = String(body.pincode || '').trim();
    var itemsIn = body.items;

    if (!phone || phone.length < 10) {
      return { ok: false, error: 'invalid_phone' };
    }
    if (!name) {
      return { ok: false, error: 'invalid_name' };
    }
    if (fulfillment !== 'local_delivery' && fulfillment !== 'pickup') {
      return { ok: false, error: 'invalid_fulfillment' };
    }
    if (fulfillment === 'local_delivery' && (!address || !pincode)) {
      return { ok: false, error: 'address_required' };
    }
    if (!Array.isArray(itemsIn) || itemsIn.length === 0) {
      return { ok: false, error: 'empty_cart' };
    }

    var state = loadProductsState_();
    var priced = [];
    var subtotal = 0;
    var fishById = {};
    var stockDemand = {};

    for (var i = 0; i < itemsIn.length; i++) {
      var line = itemsIn[i] || {};
      var pid = String(line.product_id == null ? '' : line.product_id).trim();
      if (!pid) return { ok: false, error: 'invalid_product_id' };

      var p = state.byId[pid];
      if (!p || !p.active) {
        return { ok: false, error: 'unknown_product', product_id: pid };
      }

      var packKey = String(line.pack_key || '').trim();
      var fishQty = 0;
      var unitPrice = p.price;
      var packQty = 0;
      var packLabel = '';
      var lineTotal = 0;

      if (packKey) {
        if (p.hasLinkedCombo) {
          return { ok: false, error: 'combo_no_packs', product_id: pid };
        }
        var pack = findPackOption_(p, packKey);
        if (!pack) {
          return { ok: false, error: 'invalid_pack', product_id: pid, pack_key: packKey };
        }
        packQty = Math.floor(Number(line.pack_qty));
        if (!isFinite(packQty) || packQty < 1) {
          return { ok: false, error: 'invalid_pack_qty', product_id: pid };
        }
        fishQty = pack.units * packQty;
        var clientFish = Math.floor(Number(line.qty));
        if (isFinite(clientFish) && clientFish > 0 && clientFish !== fishQty) {
          return { ok: false, error: 'pack_qty_mismatch', product_id: pid, expected: fishQty, got: clientFish };
        }
        unitPrice = pack.price;
        packLabel = pack.label;
        lineTotal = pack.price * packQty;
      } else {
        fishQty = Math.floor(Number(line.qty));
        if (!isFinite(fishQty) || fishQty < 1) {
          return { ok: false, error: 'invalid_qty', product_id: pid };
        }
        lineTotal = p.price * fishQty;
      }

      if (p.hasLinkedCombo && !p.componentsOk) {
        return { ok: false, error: 'invalid_combo_components', product_id: pid };
      }

      var lineMoves = expandStockMoves_(state, pid, fishQty);
      mergeStockMoves_(stockDemand, lineMoves);

      fishById[pid] = (fishById[pid] || 0) + fishQty;
      subtotal += lineTotal;
      priced.push({
        product_id: pid,
        name: p.name,
        qty: fishQty,
        unit_price: unitPrice,
        line_total: lineTotal,
        pack_key: packKey || '',
        pack_label: packLabel,
        pack_qty: packQty || '',
        stock_moves: stockMovesToArray_(lineMoves)
      });
    }

    var ids = Object.keys(stockDemand);
    for (var j = 0; j < ids.length; j++) {
      var id = ids[j];
      var want = stockDemand[id];
      var prodCheck = state.byId[id];
      if (!prodCheck || !prodCheck.active) {
        return { ok: false, error: 'unknown_product', product_id: id };
      }
      var av = available_(prodCheck);
      if (want > av) {
        return {
          ok: false,
          error: 'insufficient_stock',
          product_id: id,
          available: av,
          requested: want
        };
      }
    }

    var cfg = getConfigMap_();
    var shipFee = configNumber_(cfg, 'shipping_fee', 150);
    var freeAt = configNumber_(cfg, 'free_shipping_threshold', 1000);
    var ttlMin = configNumber_(cfg, 'reservation_ttl_minutes', 20);

    var shipping = 0;
    if (fulfillment === 'local_delivery') {
      shipping = subtotal >= freeAt ? 0 : shipFee;
    }

    var couponCode = String(body.coupon_code || '').trim().toUpperCase();
    var discount = 0;
    var appliedCoupon = '';
    if (couponCode) {
      var couponRes = applyCouponForOrder_(couponCode, phone, subtotal + shipping);
      if (!couponRes.ok) return couponRes;
      discount = couponRes.discount;
      appliedCoupon = couponRes.code;
    }

    var total = Math.max(0, subtotal + shipping - discount);

    // Reserve stock on leaf products (components for linked combos)
    for (var k = 0; k < ids.length; k++) {
      var rid = ids[k];
      var prod = state.byId[rid];
      var newReserved = prod.reserved + stockDemand[rid];
      state.sheet.getRange(prod.rowIndex, state.col.reserved + 1).setValue(newReserved);
      prod.reserved = newReserved;
    }

    var now = new Date();
    var reservedUntil = new Date(now.getTime() + ttlMin * 60 * 1000);
    var orderId = makeOrderId_(now);

    var orders = getOrdersSheet_();
    // Headers (Step 1):
    // order_id created_at status customer_phone customer_name fulfillment address pincode
    // items_json subtotal shipping discount coupon_code total payment_mode payment_note
    // reserved_until exported_to_borzo borzo_tracking_id notes
    orders.appendRow([
      orderId,
      now,
      STATUS_PENDING,
      phone,
      name,
      fulfillment,
      address,
      pincode,
      JSON.stringify(priced),
      subtotal,
      shipping,
      discount,
      appliedCoupon,
      total,
      'upi',
      '',
      reservedUntil,
      false,
      '',
      ''
    ]);

    if (appliedCoupon) {
      reserveCoupon_(appliedCoupon, orderId);
    }

    upsertCustomer_(phone, name, address, pincode);
    SpreadsheetApp.flush();

    return {
      ok: true,
      order_id: orderId,
      status: STATUS_PENDING,
      subtotal: subtotal,
      shipping: shipping,
      discount: discount,
      coupon_code: appliedCoupon || null,
      total: total,
      reserved_until: reservedUntil.toISOString(),
      items: priced,
      stock: getStockMap_(),
      pay: buildPayInfo_(cfg, orderId, total)
    };
  } finally {
    lock.releaseLock();
  }
}

function buildPayInfo_(cfg, orderId, total) {
  var upi = String(cfg.upi_id || 'dummy@upi').trim() || 'dummy@upi';
  var payee = String(cfg.upi_payee_name || 'Mino Pets').trim() || 'Mino Pets';
  var am = Number(total) || 0;
  var tn = String(orderId || '');
  var uri =
    'upi://pay?pa=' + encodeURIComponent(upi) +
    '&pn=' + encodeURIComponent(payee) +
    '&am=' + encodeURIComponent(String(am)) +
    '&cu=INR&tn=' + encodeURIComponent(tn);
  return {
    upi_id: upi,
    payee_name: payee,
    amount: am,
    order_id: orderId,
    upi_uri: uri,
    phonepe_enabled: isPhonePeReady_() && am >= 1
  };
}

/* ===================== Coupons ===================== */

function getCouponsSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_COUPONS);
  if (!sh) throw new Error('Coupons sheet not found');
  return sh;
}

function couponColIndex_(headers) {
  return {
    code: headers.indexOf('code'),
    phone: headers.indexOf('phone'),
    amount: headers.indexOf('amount'),
    reason: headers.indexOf('reason'),
    orderId: headers.indexOf('order_id'),
    expires: headers.indexOf('expires_at'),
    status: headers.indexOf('status'),
    created: headers.indexOf('created_at'),
    used: headers.indexOf('used_at')
  };
}

function findCouponByCode_(code) {
  var want = String(code || '').trim().toUpperCase();
  if (!want) return null;
  var sh = getCouponsSheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return null;
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var col = couponColIndex_(headers);
  if (col.code < 0 || col.phone < 0 || col.amount < 0 || col.status < 0) {
    throw new Error('Coupons needs code, phone, amount, status columns');
  }
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][col.code] || '').trim().toUpperCase() === want) {
      return { sheet: sh, rowIndex: r + 1, row: values[r], col: col };
    }
  }
  return null;
}

function couponExpired_(expiresVal) {
  if (!expiresVal) return false;
  var d = expiresVal instanceof Date ? expiresVal : new Date(expiresVal);
  if (!(d instanceof Date) || isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

/**
 * Preview for checkout UI (GET validateCoupon).
 * subtotal query param = cart subtotal+shipping estimate (optional).
 */
function validateCouponPreview_(rawCode, rawPhone, rawSubtotal) {
  var phone = normalizePhone_(rawPhone);
  var base = Number(rawSubtotal);
  if (!isFinite(base) || base < 0) base = 999999;
  var res = applyCouponForOrder_(rawCode, phone, base);
  if (!res.ok) return res;
  return {
    ok: true,
    code: res.code,
    discount: res.discount,
    amount: res.amount,
    phone: phone
  };
}

/**
 * Validate coupon for this phone. Does not mutate sheet.
 * maxBase = subtotal + shipping (discount cannot exceed this).
 */
function applyCouponForOrder_(rawCode, phone, maxBase) {
  var code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false, error: 'missing_coupon' };
  if (!phone || phone.length < 10) return { ok: false, error: 'invalid_phone' };

  var found = findCouponByCode_(code);
  if (!found) return { ok: false, error: 'coupon_not_found' };

  var status = String(found.row[found.col.status] || '').trim().toLowerCase();
  if (status === COUPON_USED) return { ok: false, error: 'coupon_used' };
  if (status === COUPON_RESERVED) return { ok: false, error: 'coupon_reserved' };
  if (status !== COUPON_ACTIVE) return { ok: false, error: 'coupon_inactive', status: status };

  if (couponExpired_(found.row[found.col.expires])) {
    return { ok: false, error: 'coupon_expired' };
  }

  var couponPhone = normalizePhone_(found.row[found.col.phone]);
  if (couponPhone !== phone) {
    return { ok: false, error: 'coupon_phone_mismatch' };
  }

  var amount = Number(found.row[found.col.amount]) || 0;
  if (amount <= 0) return { ok: false, error: 'coupon_invalid_amount' };

  var discount = Math.min(amount, Math.max(0, Number(maxBase) || 0));
  return { ok: true, code: code, amount: amount, discount: discount };
}

function reserveCoupon_(code, orderId) {
  var found = findCouponByCode_(code);
  if (!found) return;
  found.sheet.getRange(found.rowIndex, found.col.status + 1).setValue(COUPON_RESERVED);
  if (found.col.orderId >= 0) {
    found.sheet.getRange(found.rowIndex, found.col.orderId + 1).setValue(orderId);
  }
}

function markCouponUsed_(code, orderId) {
  var found = findCouponByCode_(code);
  if (!found) return;
  found.sheet.getRange(found.rowIndex, found.col.status + 1).setValue(COUPON_USED);
  if (found.col.orderId >= 0) {
    found.sheet.getRange(found.rowIndex, found.col.orderId + 1).setValue(orderId);
  }
  if (found.col.used >= 0) {
    found.sheet.getRange(found.rowIndex, found.col.used + 1).setValue(new Date());
  }
}

function releaseCouponByCode_(code, orderId) {
  var found = findCouponByCode_(code);
  if (!found) return;
  var status = String(found.row[found.col.status] || '').trim().toLowerCase();
  if (status !== COUPON_RESERVED) return;
  if (found.col.orderId >= 0) {
    var linked = String(found.row[found.col.orderId] || '').trim();
    if (orderId && linked && linked !== orderId) return;
  }
  found.sheet.getRange(found.rowIndex, found.col.status + 1).setValue(COUPON_ACTIVE);
  if (found.col.orderId >= 0) {
    found.sheet.getRange(found.rowIndex, found.col.orderId + 1).setValue('');
  }
}

function issueCoupon_(opts) {
  var phone = normalizePhone_(opts.phone);
  var amount = Math.floor(Number(opts.amount));
  var reason = String(opts.reason || 'damage_credit').trim() || 'damage_credit';
  var expiresDays = Number(opts.expires_days);
  if (!isFinite(expiresDays) || expiresDays <= 0) expiresDays = 90;

  if (!phone || phone.length < 10) return { ok: false, error: 'invalid_phone' };
  if (!isFinite(amount) || amount < 1) return { ok: false, error: 'invalid_amount' };

  var code = makeCouponCode_();
  var now = new Date();
  var expires = new Date(now.getTime() + expiresDays * 24 * 60 * 60 * 1000);

  // code phone amount reason order_id expires_at status created_at used_at
  getCouponsSheet_().appendRow([
    code,
    phone,
    amount,
    reason,
    '',
    expires,
    COUPON_ACTIVE,
    now,
    ''
  ]);
  SpreadsheetApp.flush();
  return {
    ok: true,
    code: code,
    phone: phone,
    amount: amount,
    reason: reason,
    expires_at: expires.toISOString(),
    status: COUPON_ACTIVE
  };
}

function makeCouponCode_() {
  var rand = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return 'DMG-' + rand;
}

function listCoupons_(limit) {
  var sh = getCouponsSheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var col = couponColIndex_(headers);
  var out = [];
  for (var r = values.length - 1; r >= 1 && out.length < (limit || 40); r--) {
    var row = values[r];
    out.push({
      code: String(row[col.code] || ''),
      phone: String(row[col.phone] || ''),
      amount: Number(row[col.amount]) || 0,
      reason: col.reason >= 0 ? String(row[col.reason] || '') : '',
      status: String(row[col.status] || ''),
      order_id: col.orderId >= 0 ? String(row[col.orderId] || '') : '',
      expires_at: row[col.expires] instanceof Date
        ? row[col.expires].toISOString()
        : String(row[col.expires] || '')
    });
  }
  return out;
}

/* ===================== PhonePe Standard Checkout (v2) ===================== */

function isPhonePeReady_() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty(PROP_PP_CLIENT_ID) || '').trim();
  var secret = String(props.getProperty(PROP_PP_CLIENT_SECRET) || '').trim();
  if (!id || !secret) return false;
  try {
    var cfg = getConfigMap_();
    return truthyCell_(cfg.phonepe_enabled);
  } catch (e) {
    return false;
  }
}

function phonePeEnv_() {
  var env = String(PropertiesService.getScriptProperties().getProperty(PROP_PP_ENV) || 'sandbox')
    .trim()
    .toLowerCase();
  return env === 'production' ? 'production' : 'sandbox';
}

function phonePeAuthUrl_() {
  return phonePeEnv_() === 'production'
    ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
}

function phonePePgBase_() {
  return phonePeEnv_() === 'production'
    ? 'https://api.phonepe.com/apis/pg'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
}

/** O-Bearer access token (cached in Script Properties until near expires_at). */
function phonePeAccessToken_() {
  var props = PropertiesService.getScriptProperties();
  var cached = String(props.getProperty(PROP_PP_ACCESS) || '').trim();
  var exp = Number(props.getProperty(PROP_PP_EXPIRES) || 0);
  var nowSec = Math.floor(Date.now() / 1000);
  // Refresh 2 minutes early
  if (cached && isFinite(exp) && exp > nowSec + 120) {
    return cached;
  }

  var clientId = String(props.getProperty(PROP_PP_CLIENT_ID) || '').trim();
  var clientSecret = String(props.getProperty(PROP_PP_CLIENT_SECRET) || '').trim();
  var clientVersion = String(props.getProperty(PROP_PP_CLIENT_VERSION) || '1').trim() || '1';
  if (!clientId || !clientSecret) {
    throw new Error('phonepe_not_configured');
  }

  var form =
    'client_id=' + encodeURIComponent(clientId) +
    '&client_version=' + encodeURIComponent(clientVersion) +
    '&client_secret=' + encodeURIComponent(clientSecret) +
    '&grant_type=client_credentials';

  var res = UrlFetchApp.fetch(phonePeAuthUrl_(), {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: form,
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var body;
  try {
    body = JSON.parse(res.getContentText() || '{}');
  } catch (e) {
    throw new Error('phonepe_auth_parse_failed');
  }
  if (code < 200 || code >= 300 || !body.access_token) {
    throw new Error('phonepe_auth_failed:' + (body.message || body.error || code));
  }

  props.setProperty(PROP_PP_ACCESS, String(body.access_token));
  if (body.expires_at != null) {
    props.setProperty(PROP_PP_EXPIRES, String(body.expires_at));
  }
  return String(body.access_token);
}

function phonePeAuthHeader_() {
  return 'O-Bearer ' + phonePeAccessToken_();
}

function assertPhonePeRedirectUrl_(redirectUrl) {
  var url = String(redirectUrl || '').trim();
  if (!url || url.indexOf('http') !== 0) {
    return { ok: false, error: 'invalid_redirect_url' };
  }
  var originMatch = url.match(/^(https?:\/\/[^\/\s?#]+)/i);
  if (!originMatch) return { ok: false, error: 'invalid_redirect_url' };
  if (!isAllowedOrigin_(originMatch[1])) {
    return { ok: false, error: 'origin_not_allowed', origin: originMatch[1] };
  }
  return { ok: true, url: url };
}

function makePhonePeMerchantOrderId_(orderId) {
  var base = String(orderId || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!base) base = 'MINO';
  var suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var moid = base + '-' + suffix;
  if (moid.length > 63) moid = moid.slice(0, 63);
  return moid;
}

function extractPhonePeMoid_(paymentNote) {
  var note = String(paymentNote || '');
  var m = note.match(/phonepe_moid=([A-Za-z0-9_-]+)/);
  return m ? m[1] : '';
}

/**
 * Body: { order_id, redirect_url }
 * redirect_url must be on an allowed origin (e.g. https://myminopets.com/dev/?phonepe_order=MINO-…)
 */
function createPhonePePayment_(body) {
  if (!isPhonePeReady_()) {
    return { ok: false, error: 'phonepe_disabled' };
  }

  var orderId = String(body.order_id || '').trim();
  if (!orderId) return { ok: false, error: 'missing_order_id' };

  var redirectCheck = assertPhonePeRedirectUrl_(body.redirect_url);
  if (!redirectCheck.ok) return redirectCheck;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy_retry' };

  try {
    var found = findOrderById_(orderId);
    if (!found) return { ok: false, error: 'order_not_found' };

    var status = normalizeOrderStatus_(found.row[found.col.status]);
    if (status === STATUS_PAID) {
      return { ok: true, order_id: orderId, status: STATUS_PAID, already: true };
    }
    if (status !== STATUS_PENDING && status !== STATUS_REPORTED) {
      return { ok: false, error: 'invalid_status', status: status };
    }

    var total = Number(found.row[found.col.total]);
    if (!isFinite(total) || total < 1) {
      return { ok: false, error: 'invalid_amount' };
    }
    var amountPaisa = Math.round(total * 100);
    if (amountPaisa < 100) {
      return { ok: false, error: 'amount_below_phonepe_minimum' };
    }

    var merchantOrderId = makePhonePeMerchantOrderId_(orderId);
    var payload = {
      merchantOrderId: merchantOrderId,
      amount: amountPaisa,
      expireAfter: 1200,
      metaInfo: {
        udf1: orderId,
        udf2: String(found.row[found.col.phone] || '')
      },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: {
          redirectUrl: redirectCheck.url
        }
      }
    };

    var res = UrlFetchApp.fetch(phonePePgBase_() + '/checkout/v2/pay', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: phonePeAuthHeader_()
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var pp;
    try {
      pp = JSON.parse(res.getContentText() || '{}');
    } catch (e) {
      return { ok: false, error: 'phonepe_pay_parse_failed', http: code };
    }
    if (code < 200 || code >= 300 || !pp.redirectUrl) {
      return {
        ok: false,
        error: 'phonepe_pay_failed',
        http: code,
        phonepe: pp
      };
    }

    if (found.col.paymentMode >= 0) {
      found.sheet.getRange(found.rowIndex, found.col.paymentMode + 1).setValue('phonepe');
    }
    if (found.col.paymentNote >= 0) {
      found.sheet.getRange(found.rowIndex, found.col.paymentNote + 1)
        .setValue('phonepe_moid=' + merchantOrderId);
    }
    SpreadsheetApp.flush();

    return {
      ok: true,
      order_id: orderId,
      merchant_order_id: merchantOrderId,
      amount_paisa: amountPaisa,
      redirect_url: String(pp.redirectUrl),
      state: pp.state || 'PENDING'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Body: { order_id }
 * Checks PhonePe Order Status; on COMPLETED + amount match → markPaid_ (auto-confirm).
 */
function confirmPhonePePayment_(body) {
  if (!isPhonePeReady_()) {
    return { ok: false, error: 'phonepe_disabled' };
  }

  var orderId = String(body.order_id || '').trim();
  if (!orderId) return { ok: false, error: 'missing_order_id' };

  var found = findOrderById_(orderId);
  if (!found) return { ok: false, error: 'order_not_found' };

  var status = normalizeOrderStatus_(found.row[found.col.status]);
  if (status === STATUS_PAID) {
    var snapPaid = orderSnapshot_(found);
    return {
      ok: true,
      order_id: orderId,
      status: STATUS_PAID,
      already: true,
      whatsapp: buildWhatsAppBundle_(snapPaid)
    };
  }

  var note = found.col.paymentNote >= 0 ? found.row[found.col.paymentNote] : '';
  var merchantOrderId = String(body.merchant_order_id || '').trim() || extractPhonePeMoid_(note);
  if (!merchantOrderId) {
    return { ok: false, error: 'missing_phonepe_moid', hint: 'Start Pay with PhonePe first.' };
  }

  var total = Number(found.row[found.col.total]);
  var expectedPaisa = Math.round((isFinite(total) ? total : 0) * 100);

  var statusUrl =
    phonePePgBase_() +
    '/checkout/v2/order/' +
    encodeURIComponent(merchantOrderId) +
    '/status?details=false';

  var res = UrlFetchApp.fetch(statusUrl, {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
      Authorization: phonePeAuthHeader_()
    },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var pp;
  try {
    pp = JSON.parse(res.getContentText() || '{}');
  } catch (e) {
    return { ok: false, error: 'phonepe_status_parse_failed', http: code };
  }
  if (code < 200 || code >= 300) {
    return { ok: false, error: 'phonepe_status_failed', http: code, phonepe: pp };
  }

  var state = String(pp.state || '').toUpperCase();
  if (state !== 'COMPLETED') {
    return {
      ok: true,
      order_id: orderId,
      status: status,
      phonepe_state: state || 'UNKNOWN',
      paid: false,
      merchant_order_id: merchantOrderId
    };
  }

  var paidPaisa = Number(pp.amount);
  if (isFinite(paidPaisa) && expectedPaisa > 0 && paidPaisa !== expectedPaisa) {
    return {
      ok: false,
      error: 'amount_mismatch',
      expected_paisa: expectedPaisa,
      paid_paisa: paidPaisa
    };
  }

  var txnId = '';
  if (pp.paymentDetails && pp.paymentDetails[0] && pp.paymentDetails[0].transactionId) {
    txnId = String(pp.paymentDetails[0].transactionId);
  }

  var mark = markPaid_(orderId, {
    paymentMode: 'phonepe',
    paymentNote: 'phonepe_moid=' + merchantOrderId + (txnId ? ';txn=' + txnId : '')
  });
  if (!mark.ok) return mark;

  return {
    ok: true,
    order_id: orderId,
    status: STATUS_PAID,
    paid: true,
    already: !!mark.already,
    phonepe_state: 'COMPLETED',
    merchant_order_id: merchantOrderId,
    transaction_id: txnId || null,
    stock: mark.stock,
    whatsapp: mark.whatsapp
  };
}

/* ===================== reportPayment / Mark Paid ===================== */

/**
 * Interim (PhonePe KYC pending): “I have paid” → markPaid_ immediately.
 * Once PhonePe is live, defaults back to payment_reported + admin unless
 * Config auto_confirm_on_report = TRUE.
 */
function shouldAutoConfirmReport_() {
  var cfg;
  try {
    cfg = getConfigMap_();
  } catch (e) {
    return true;
  }
  var raw = cfg.auto_confirm_on_report;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    return truthyCell_(raw);
  }
  return !isPhonePeReady_();
}

function reportPayment_(body) {
  var orderId = String(body.order_id || '').trim();
  if (!orderId) return { ok: false, error: 'missing_order_id' };

  var found = findOrderById_(orderId);
  if (!found) return { ok: false, error: 'order_not_found' };

  var status = normalizeOrderStatus_(found.row[found.col.status]);
  if (status === STATUS_PAID) {
    var snap = orderSnapshot_(found);
    return {
      ok: true,
      order_id: orderId,
      status: STATUS_PAID,
      paid: true,
      already: true,
      whatsapp: buildWhatsAppBundle_(snap)
    };
  }

  if (shouldAutoConfirmReport_()) {
    var mark = markPaid_(orderId, {
      paymentMode: 'upi',
      paymentNote: String(body.payment_note || 'customer_reported_paid_auto').trim()
    });
    if (!mark.ok) return mark;
    return {
      ok: true,
      order_id: orderId,
      status: STATUS_PAID,
      paid: true,
      auto_confirmed: true,
      already: !!mark.already,
      stock: mark.stock,
      whatsapp: mark.whatsapp
    };
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy_retry' };

  try {
    found = findOrderById_(orderId);
    if (!found) return { ok: false, error: 'order_not_found' };

    status = String(found.row[found.col.status] || '');
    if (status === STATUS_REPORTED) {
      return { ok: true, order_id: orderId, status: STATUS_REPORTED, already: true };
    }
    if (status !== STATUS_PENDING) {
      return { ok: false, error: 'invalid_status', status: status };
    }

    found.sheet.getRange(found.rowIndex, found.col.status + 1).setValue(STATUS_REPORTED);
    if (found.col.paymentNote >= 0) {
      var note = String(body.payment_note || 'customer_reported_paid').trim();
      found.sheet.getRange(found.rowIndex, found.col.paymentNote + 1).setValue(note);
    }
    SpreadsheetApp.flush();
    return { ok: true, order_id: orderId, status: STATUS_REPORTED };
  } finally {
    lock.releaseLock();
  }
}

/** Called from Admin.html via google.script.run */
function adminListOrders(password) {
  if (!isValidAdminPassword_(password)) {
    return { ok: false, error: 'unauthorized' };
  }
  return { ok: true, orders: listOpenOrders_() };
}

/** Called from Admin.html via google.script.run */
function adminMarkPaid(password, orderId) {
  if (!isValidAdminPassword_(password)) {
    return { ok: false, error: 'unauthorized' };
  }
  return markPaid_(String(orderId || '').trim());
}

/** Called from Admin.html — issue a phone-locked damage/credit coupon */
function adminIssueCoupon(password, payload) {
  if (!isValidAdminPassword_(password)) {
    return { ok: false, error: 'unauthorized' };
  }
  payload = payload || {};
  return issueCoupon_({
    phone: payload.phone,
    amount: payload.amount,
    reason: payload.reason,
    expires_days: payload.expires_days
  });
}

/** Optional list for admin */
function adminListCoupons(password) {
  if (!isValidAdminPassword_(password)) {
    return { ok: false, error: 'unauthorized' };
  }
  return { ok: true, coupons: listCoupons_(40) };
}

function listOpenOrders_() {
  var orders = getOrdersSheet_();
  var values = orders.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var col = orderColIndex_(headers);
  var out = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var status = String(row[col.status] || '');
    var norm = normalizeOrderStatus_(status);
    if (norm !== STATUS_PENDING && norm !== STATUS_REPORTED && norm !== STATUS_EXPIRED) continue;
    var items;
    try {
      items = JSON.parse(row[col.items] || '[]');
    } catch (e) {
      items = [];
    }
    out.push({
      order_id: String(row[col.id] || ''),
      created_at: row[col.created] instanceof Date
        ? row[col.created].toISOString()
        : String(row[col.created] || ''),
      status: norm,
      customer_phone: String(row[col.phone] || ''),
      customer_name: String(row[col.name] || ''),
      fulfillment: String(row[col.fulfillment] || ''),
      total: Number(row[col.total]) || 0,
      items: items
    });
  }

  // Newest first
  out.sort(function (a, b) {
    return String(b.created_at).localeCompare(String(a.created_at));
  });
  return out;
}

function normalizeOrderStatus_(raw) {
  var s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (s === 'pending' || s === 'pendingpayment') s = STATUS_PENDING;
  if (s === 'reported' || s === 'paymentreported') s = STATUS_REPORTED;
  return s;
}

function markPaid_(orderId, opts) {
  opts = opts || {};
  if (!orderId) return { ok: false, error: 'missing_order_id' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'busy_retry' };

  try {
    var found = findOrderById_(orderId);
    if (!found) return { ok: false, error: 'order_not_found' };
    if (found.col.status < 0) {
      return { ok: false, error: 'orders_missing_status_column' };
    }

    var snap = orderSnapshot_(found);
    var statusRaw = found.row[found.col.status];
    var status = normalizeOrderStatus_(statusRaw);

    if (status === STATUS_PAID) {
      return {
        ok: true,
        order_id: orderId,
        status: STATUS_PAID,
        already: true,
        whatsapp: buildWhatsAppBundle_(snap)
      };
    }

    // pending / reported: release reservation + reduce on_hand
    // expired: reservation already released by TTL — only reduce on_hand if still available
    var reservationActive = (status === STATUS_PENDING || status === STATUS_REPORTED);
    var expiredPath = (status === STATUS_EXPIRED);

    if (!reservationActive && !expiredPath) {
      return {
        ok: false,
        error: 'invalid_status',
        status: String(statusRaw),
        normalized: status,
        hint: 'Orders sheet status must be pending_payment, payment_reported, or expired. Refresh the admin list.'
      };
    }

    var items = snap.items;
    var state = loadProductsState_();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var moves = stockMovesFromOrderItem_(state, it);
      var moveIds = Object.keys(moves);
      for (var mi = 0; mi < moveIds.length; mi++) {
        var pid = moveIds[mi];
        var qty = moves[pid];
        var p = state.byId[pid];
        if (!p || qty < 1) continue;

        if (expiredPath) {
          var av = available_(p);
          if (qty > av) {
            return {
              ok: false,
              error: 'insufficient_stock',
              product_id: pid,
              available: av,
              requested: qty,
              hint: 'Order was expired (hold released). Not enough free stock to Mark Paid now.'
            };
          }
          var newOnHandExp = Math.max(0, p.onHand - qty);
          state.sheet.getRange(p.rowIndex, state.col.onHand + 1).setValue(newOnHandExp);
          p.onHand = newOnHandExp;
        } else {
          var newOnHand = Math.max(0, p.onHand - qty);
          var newReserved = Math.max(0, p.reserved - qty);
          state.sheet.getRange(p.rowIndex, state.col.onHand + 1).setValue(newOnHand);
          state.sheet.getRange(p.rowIndex, state.col.reserved + 1).setValue(newReserved);
          p.onHand = newOnHand;
          p.reserved = newReserved;
        }
      }
    }

    found.sheet.getRange(found.rowIndex, found.col.status + 1).setValue(STATUS_PAID);

    if (opts.paymentMode && found.col.paymentMode >= 0) {
      found.sheet.getRange(found.rowIndex, found.col.paymentMode + 1).setValue(String(opts.paymentMode));
    }
    if (opts.paymentNote && found.col.paymentNote >= 0) {
      found.sheet.getRange(found.rowIndex, found.col.paymentNote + 1).setValue(String(opts.paymentNote));
    }

    var couponCode = found.col.couponCode >= 0
      ? String(found.row[found.col.couponCode] || '').trim().toUpperCase()
      : '';
    if (couponCode) {
      markCouponUsed_(couponCode, orderId);
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      order_id: orderId,
      status: STATUS_PAID,
      was_expired: expiredPath,
      stock: getStockMap_(),
      whatsapp: buildWhatsAppBundle_(snap)
    };
  } finally {
    lock.releaseLock();
  }
}

function orderSnapshot_(found) {
  var row = found.row;
  var col = found.col;
  var items;
  try {
    items = JSON.parse(row[col.items] || '[]');
  } catch (e) {
    items = [];
  }
  return {
    order_id: String(row[col.id] || ''),
    customer_phone: String(row[col.phone] || ''),
    customer_name: String(row[col.name] || ''),
    fulfillment: String(row[col.fulfillment] || ''),
    total: Number(row[col.total]) || 0,
    items: items
  };
}

function buildCustomerConfirmText_(o) {
  var lines = [];
  lines.push('Hi ' + (o.customer_name || 'there') + '! ✅ Payment confirmed.');
  lines.push('');
  lines.push('Order ID: ' + o.order_id);
  lines.push('Items:');
  (o.items || []).forEach(function (it) {
    lines.push('• ' + (it.qty || '?') + 'x ' + (it.name || it.product_id));
  });
  lines.push('');
  lines.push('Total paid: ₹' + o.total + '/-');
  var ful = o.fulfillment === 'local_delivery' ? 'Local Delivery' : 'Store Pickup';
  lines.push('Fulfillment: ' + ful);
  lines.push('');
  lines.push('We\'ll prepare your order shortly. Reply here if you have questions.');
  lines.push('— Mino Pets');
  return lines.join('\n');
}

function buildShopAlertText_(o) {
  var lines = [];
  lines.push('*Paid order — Mino Pets*');
  lines.push('Order: ' + o.order_id);
  lines.push((o.customer_name || '') + ' · ' + (o.customer_phone || ''));
  lines.push('Total: ₹' + o.total + '/- · ' + (o.fulfillment || ''));
  (o.items || []).forEach(function (it) {
    lines.push('• ' + (it.qty || '?') + 'x ' + (it.name || it.product_id));
  });
  return lines.join('\n');
}

function buildWhatsAppBundle_(o) {
  var cfg = getConfigMap_();
  var shop = String(cfg.shop_whatsapp || '919035559089').replace(/\D/g, '');
  var customerPhone = normalizePhone_(o.customer_phone);
  var customerText = buildCustomerConfirmText_(o);
  var shopText = buildShopAlertText_(o);
  return {
    customer_phone: customerPhone,
    shop_phone: shop,
    customer_text: customerText,
    shop_text: shopText,
    customer_url: customerPhone
      ? 'https://wa.me/' + customerPhone + '?text=' + encodeURIComponent(customerText)
      : '',
    shop_url: shop
      ? 'https://wa.me/' + shop + '?text=' + encodeURIComponent(shopText)
      : ''
  };
}

function orderColIndex_(headers) {
  return {
    id: headers.indexOf('order_id'),
    created: headers.indexOf('created_at'),
    status: headers.indexOf('status'),
    phone: headers.indexOf('customer_phone'),
    name: headers.indexOf('customer_name'),
    fulfillment: headers.indexOf('fulfillment'),
    address: headers.indexOf('address'),
    pincode: headers.indexOf('pincode'),
    items: headers.indexOf('items_json'),
    total: headers.indexOf('total'),
    paymentMode: headers.indexOf('payment_mode'),
    paymentNote: headers.indexOf('payment_note'),
    couponCode: headers.indexOf('coupon_code'),
    exported: headers.indexOf('exported_to_borzo'),
    tracking: headers.indexOf('borzo_tracking_id')
  };
}

function isTruthySheet_(v) {
  if (v === true || v === 1) return true;
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === '1';
}

/* ===================== Spreadsheet menu + Borzo export ===================== */

/** Runs when the spreadsheet is opened — adds custom menu. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Mino Pets')
    .addItem('Export paid → Borzo sheet', 'exportPaidOrdersToBorzo')
    .addToUi();
}

/**
 * Paid + local_delivery + not yet exported → new sheet for Borzo bulk upload.
 * Then File → Download → CSV on that sheet, upload in Borzo.
 * Sets exported_to_borzo = TRUE. Paste AWB into borzo_tracking_id later.
 */
function exportPaidOrdersToBorzo() {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    ui.alert('Busy — try again in a moment.');
    return;
  }

  try {
    var orders = getOrdersSheet_();
    var values = orders.getDataRange().getValues();
    if (values.length < 2) {
      ui.alert('No orders to export.');
      return;
    }

    var headers = values[0].map(function (h) { return String(h).trim(); });
    var col = orderColIndex_(headers);
    if (col.id < 0 || col.status < 0 || col.fulfillment < 0 || col.address < 0) {
      ui.alert('Orders sheet missing required columns (order_id, status, fulfillment, address).');
      return;
    }
    if (col.exported < 0) {
      ui.alert('Orders sheet needs exported_to_borzo column (see Step 1 schema).');
      return;
    }

    var cfg = getConfigMap_();
    var weight = configNumber_(cfg, 'borzo_default_weight_kg', 1);
    if (weight <= 0) weight = 1;
    var requiredTime = borzoRequiredTime_();

    // Headers aligned to Borzo India bulk help fields (English).
    // If your Borzo template uses different names, rename row 1 to match their download.
    var outHeaders = [
      'Address',
      'Contact person',
      'Phone',
      'Matter',
      'Weight',
      'Note',
      'Apartment',
      'Return',
      'Required time',
      'Taking amount',
      'Buyout amount',
      'Is check required',
      'Insurance',
      'Client order id'
    ];

    var outRows = [];
    var sourceRowIndexes = []; // 1-based sheet rows to flag

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var status = normalizeOrderStatus_(row[col.status]);
      if (status !== STATUS_PAID) continue;

      var ful = String(row[col.fulfillment] || '').trim().toLowerCase();
      if (ful !== 'local_delivery') continue;

      if (isTruthySheet_(row[col.exported])) continue;

      var address = String(row[col.address] || '').trim();
      var pincode = col.pincode >= 0 ? String(row[col.pincode] || '').trim() : '';
      if (!address) continue;

      var fullAddress = pincode ? (address + ', ' + pincode) : address;
      var name = String(row[col.name] || '').trim();
      var phone10 = borzoPhone10_(row[col.phone]);
      if (!phone10) continue;

      var items;
      try {
        items = JSON.parse(row[col.items] || '[]');
      } catch (e) {
        items = [];
      }
      var matterParts = (items || []).map(function (it) {
        return (it.qty || '?') + 'x ' + (it.name || it.product_id);
      });
      var orderId = String(row[col.id] || '');
      var matter = ('Mino Pets | ' + orderId + ' | ' + matterParts.join(', ')).slice(0, 200);
      var note = ('Order ' + orderId + (pincode ? ' | PIN ' + pincode : '')).slice(0, 200);
      var total = Number(row[col.total]) || 0;

      outRows.push([
        fullAddress,
        name,
        phone10,
        matter,
        weight,
        note,
        '',
        '',
        requiredTime,
        '',
        '',
        '',
        total,
        orderId
      ]);
      sourceRowIndexes.push(r + 1);
    }

    if (!outRows.length) {
      ui.alert(
        'Nothing to export.\n\nNeed: status=paid, fulfillment=local_delivery, exported_to_borzo empty/FALSE, and a non-empty address.'
      );
      return;
    }

    var ss = SpreadsheetApp.getActive();
    var stamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || 'Asia/Kolkata',
      'yyyyMMdd_HHmm'
    );
    var outName = 'Borzo_' + stamp;
    var outSheet = ss.insertSheet(outName);
    outSheet.getRange(1, 1, 1, outHeaders.length).setValues([outHeaders]);
    outSheet.getRange(2, 1, outRows.length, outHeaders.length).setValues(outRows);
    outSheet.setFrozenRows(1);
    outSheet.autoResizeColumns(1, outHeaders.length);

    for (var i = 0; i < sourceRowIndexes.length; i++) {
      orders.getRange(sourceRowIndexes[i], col.exported + 1).setValue(true);
    }
    SpreadsheetApp.flush();

    ui.alert(
      'Exported ' + outRows.length + ' order(s) to sheet "' + outName + '".\n\n' +
      '1) Open that sheet\n' +
      '2) File → Download → Comma Separated Values (.csv)\n' +
      '3) Upload in Borzo bulk orders\n\n' +
      'Those Orders rows are now exported_to_borzo = TRUE.\n' +
      'Paste AWB/tracking into borzo_tracking_id when you have it.\n\n' +
      'If Borzo rejects column names, rename row 1 to match Borzo’s template (keep column order).'
    );
  } catch (err) {
    ui.alert('Export failed: ' + (err && err.message ? err.message : err));
  } finally {
    lock.releaseLock();
  }
}

function borzoPhone10_(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return '';
}

/** DD.MM.YYYY HH:mm — today 18:00, or tomorrow 18:00 if already past. */
function borzoRequiredTime_() {
  var tz = Session.getScriptTimeZone() || 'Asia/Kolkata';
  var d = new Date();
  d.setHours(18, 0, 0, 0);
  if (d.getTime() < Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return Utilities.formatDate(d, tz, 'dd.MM.yyyy HH:mm');
}

function findOrderById_(orderId) {
  var sh = getOrdersSheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return null;
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var col = orderColIndex_(headers);
  if (col.id < 0 || col.status < 0 || col.items < 0) {
    throw new Error('Orders sheet missing required columns');
  }
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][col.id]) === orderId) {
      return { sheet: sh, rowIndex: r + 1, row: values[r], col: col };
    }
  }
  return null;
}

/* ===================== Customers (thin) ===================== */

function getCustomersSheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CUSTOMERS);
  if (!sh) throw new Error('Customers sheet not found');
  return sh;
}

function lookupCustomer_(rawPhone) {
  var phone = normalizePhone_(rawPhone);
  if (!phone || phone.length < 10) {
    return { ok: false, error: 'invalid_phone' };
  }
  var sh = getCustomersSheet_();
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: true, customer: null };

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var iPhone = headers.indexOf('phone');
  var iName = headers.indexOf('name');
  var iAddr = headers.indexOf('addresses_json');
  if (iPhone < 0) throw new Error('Customers needs phone column');

  for (var r = 1; r < values.length; r++) {
    var rowPhone = normalizePhone_(values[r][iPhone]);
    if (rowPhone !== phone) continue;
    var addresses = [];
    try {
      addresses = JSON.parse(values[r][iAddr] || '[]');
    } catch (e) {
      addresses = [];
    }
    return {
      ok: true,
      customer: {
        phone: phone,
        name: iName >= 0 ? String(values[r][iName] || '') : '',
        addresses: addresses,
        address: addresses.length ? addresses[0] : null
      }
    };
  }
  return { ok: true, customer: null };
}

function upsertCustomer_(phone, name, address, pincode) {
  var sh = getCustomersSheet_();
  var values = sh.getDataRange().getValues();
  var headers = values.length
    ? values[0].map(function (h) { return String(h).trim(); })
    : [];
  var iPhone = headers.indexOf('phone');
  var iName = headers.indexOf('name');
  var iAddr = headers.indexOf('addresses_json');
  var iLast = headers.indexOf('last_order_at');
  var iCreated = headers.indexOf('created_at');
  if (iPhone < 0 || iName < 0) return;

  var now = new Date();
  var addrList = [];
  if (address) {
    addrList.push({ address: address, pincode: pincode || '' });
  }

  for (var r = 1; r < values.length; r++) {
    if (normalizePhone_(values[r][iPhone]) !== phone) continue;
    sh.getRange(r + 1, iName + 1).setValue(name || values[r][iName]);
    if (iLast >= 0) sh.getRange(r + 1, iLast + 1).setValue(now);
    if (address && iAddr >= 0) {
      var existing = [];
      try {
        existing = JSON.parse(values[r][iAddr] || '[]');
      } catch (e) {
        existing = [];
      }
      if (!Array.isArray(existing)) existing = [];
      // Newest first; keep up to 3
      existing = [addrList[0]].concat(existing.filter(function (a) {
        return !(a && a.address === address && String(a.pincode || '') === String(pincode || ''));
      })).slice(0, 3);
      sh.getRange(r + 1, iAddr + 1).setValue(JSON.stringify(existing));
    }
    return;
  }

  // Append — column order matches Step 1 schema
  sh.appendRow([
    phone,
    name,
    JSON.stringify(addrList),
    now,
    now
  ]);
}

function normalizePhone_(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  return digits;
}

function makeOrderId_(d) {
  var y = d.getFullYear();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  var rand = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return 'MINO-' + y + m + day + '-' + rand;
}

/* ===================== TTL release ===================== */

/**
 * Time-driven: run every 10–15 minutes (see docs/BUILD.md Step 4).
 * Also called at the start of createOrder.
 */
function releaseExpiredReservations() {
  releaseExpiredReservations_(true);
}

function releaseExpiredReservations_(useLock) {
  var lock = null;
  if (useLock) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      Logger.log('releaseExpiredReservations: busy');
      return { ok: false, error: 'busy' };
    }
  }

  try {
    var orders = getOrdersSheet_();
    var values = orders.getDataRange().getValues();
    if (values.length < 2) return { ok: true, released: 0 };

    var headers = values[0].map(function (h) { return String(h).trim(); });
    var iStatus = headers.indexOf('status');
    var iItems = headers.indexOf('items_json');
    var iUntil = headers.indexOf('reserved_until');
    if (iStatus < 0 || iItems < 0 || iUntil < 0) {
      throw new Error('Orders missing status / items_json / reserved_until');
    }

    var state = loadProductsState_();
    var now = new Date();
    var released = 0;

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      if (String(row[iStatus]) !== STATUS_PENDING) continue;

      var until = row[iUntil];
      if (!until) continue;
      var untilDate = until instanceof Date ? until : new Date(until);
      if (!(untilDate instanceof Date) || isNaN(untilDate.getTime())) continue;
      if (untilDate > now) continue;

      var items;
      try {
        items = JSON.parse(row[iItems] || '[]');
      } catch (parseErr) {
        Logger.log('Bad items_json row ' + (r + 1));
        continue;
      }

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var moves = stockMovesFromOrderItem_(state, it);
        var moveIds = Object.keys(moves);
        for (var mi = 0; mi < moveIds.length; mi++) {
          var pid = moveIds[mi];
          var qty = moves[pid];
          var p = state.byId[pid];
          if (!p || qty < 1) continue;
          var newRes = Math.max(0, p.reserved - qty);
          state.sheet.getRange(p.rowIndex, state.col.reserved + 1).setValue(newRes);
          p.reserved = newRes;
        }
      }

      orders.getRange(r + 1, iStatus + 1).setValue(STATUS_EXPIRED);

      var iCoupon = headers.indexOf('coupon_code');
      if (iCoupon >= 0) {
        var cCode = String(row[iCoupon] || '').trim().toUpperCase();
        if (cCode) releaseCouponByCode_(cCode, String(row[headers.indexOf('order_id')] || ''));
      }
      released++;
    }

    SpreadsheetApp.flush();
    Logger.log('releaseExpiredReservations released=' + released);
    return { ok: true, released: released };
  } finally {
    if (lock) lock.releaseLock();
  }
}

/* ===================== Editor test helpers ===================== */

/**
 * Manual oversell check from the Apps Script editor.
 * 1) Set Neon Tetra (id 1) stock_on_hand=10, stock_reserved=0
 * 2) Run testCreateOrderOnce — should succeed (qty 6)
 * 3) Run testCreateOrderOnce again — should fail insufficient_stock available:4
 */
function testCreateOrderOnce() {
  var token = PropertiesService.getScriptProperties().getProperty(PROP_TOKEN);
  var result = createOrder_({
    token: token,
    action: 'createOrder',
    customer_phone: '9999999999',
    customer_name: 'Test User',
    fulfillment: 'pickup',
    address: '',
    pincode: '',
    items: [{ product_id: '1', qty: 6 }]
  });
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
```

