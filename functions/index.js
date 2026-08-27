/**
 * Mino Pets checkout API — Firestore stock + Razorpay.
 * Region: asia-south1
 */
const crypto = require('crypto');
const fs = require('fs');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

setGlobalOptions({ region: 'asia-south1', maxInstances: 20 });

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const razorpayKeySecret = defineSecret('RAZORPAY_KEY_SECRET');
const sheetsApiToken = defineSecret('SHEETS_TOKEN');
const catalogSyncSecret = defineSecret('SYNC_SECRET');
const googleMapsKey = defineSecret('GOOGLE_MAPS_KEY');
const couponMutateToken = defineSecret('COUPON_MUTATE_TOKEN');

const DELIVERY_FEE = 150;
const FREE_DELIVERY_AT = 1000;
const HOLD_MINUTES = 20;

function allowedOrigin(origin) {
  const o = String(origin || '').replace(/\/$/, '');
  const list = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const extra = [
    'https://myminopets.com',
    'https://www.myminopets.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000',
  ];
  const allowed = list.concat(extra);
  if (o && allowed.includes(o)) return o;
  if (o && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o)) return o;
  if (o && /myminopets\.com$/i.test(o.replace(/^https?:\/\//, ''))) return o;
  return o || '*';
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(origin),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Sync-Secret',
    'Access-Control-Max-Age': '3600',
  };
}

function sendJson(res, origin, body, status) {
  const headers = corsHeaders(origin);
  headers['Content-Type'] = 'application/json; charset=utf-8';
  res.set(headers);
  res.status(status || 200).send(JSON.stringify(body));
}

function parseRequestBody(req) {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b) && typeof b.pipe !== 'function') {
    return b;
  }
  const raw = Buffer.isBuffer(b)
    ? b.toString('utf8')
    : (typeof b === 'string' ? b : (req.rawBody ? String(req.rawBody) : ''));
  if (!raw || !String(raw).trim()) return {};
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return {};
  }
}

function readBoundSecret(param, name) {
  let raw = '';
  try {
    raw = param && typeof param.value === 'function' ? param.value() : '';
  } catch (_) {
    raw = '';
  }
  if (!raw) raw = process.env[name] || '';
  raw = String(raw || '').trim();
  if (raw.startsWith('/') && fs.existsSync(raw)) {
    try {
      raw = fs.readFileSync(raw, 'utf8').trim();
    } catch (_) { /* keep raw */ }
  }
  return raw;
}

function httpsFn(handler, secrets) {
  return onRequest({ cors: false, invoker: 'public', secrets: secrets || [] }, async (req, res) => {
    const origin = req.get('origin') || '';
    if (req.method === 'OPTIONS') {
      res.set(corsHeaders(origin));
      res.status(204).send('');
      return;
    }
    try {
      req.body = parseRequestBody(req);
      await handler(req, res, origin);
    } catch (err) {
      console.error(err);
      sendJson(res, origin, { ok: false, error: err.message || 'server_error' });
    }
  });
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
  return digits;
}

function makeOrderId(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `MINO-${y}${mo}${day}-${rand}`;
}

function stockAvailable(p) {
  if (!p) return 0;
  return Math.max(0, Number(p.stockOnHand || 0) - Number(p.stockReserved || 0));
}

function expandStockMoves(productMap, productId, qty) {
  const n = Math.floor(Number(qty)) || 0;
  const out = {};
  if (n < 1) return out;
  const p = productMap[String(productId)];
  const comps = (p && Array.isArray(p.components))
    ? p.components.filter((c) => c && c.product_id && Number(c.qty) > 0)
    : [];
  if (p && p.hasLinkedCombo && comps.length) {
    comps.forEach((c) => {
      const id = String(c.product_id);
      out[id] = (out[id] || 0) + n * Number(c.qty);
    });
    return out;
  }
  out[String(productId)] = n;
  return out;
}

function findPackOption(product, packKey) {
  const packs = product.packOptions || [];
  return packs.find((p) => p && p.key === packKey) || null;
}

async function loadProductMap(ids) {
  const unique = [...new Set(ids.map(String).filter(Boolean))];
  const map = {};
  const snaps = await Promise.all(unique.map((id) => db.collection('products').doc(id).get()));
  snaps.forEach((snap, i) => {
    if (snap.exists) map[unique[i]] = Object.assign({ id: unique[i] }, snap.data());
  });
  return map;
}

function sheetsCatalogUrl() {
  return String(process.env.SHEETS_CATALOG_URL || '').trim();
}

async function syncCatalogFromSheets(token) {
  const url = sheetsCatalogUrl();
  if (!url) throw new Error('SHEETS_CATALOG_URL missing');
  const origin = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0] || 'https://myminopets.com';
  const sep = url.includes('?') ? '&' : '?';
  const fetchUrl = `${url}${sep}action=getCatalog&token=${encodeURIComponent(token)}` +
    `&origin=${encodeURIComponent(origin)}`;
  const res = await fetch(fetchUrl, { redirect: 'follow' });
  const text = await res.text();
  if (!text || text.trim().charAt(0) === '<') {
    throw new Error(
      'Sheets returned HTML instead of JSON. Check SHEETS_CATALOG_URL in functions/.env ' +
      '(must match api-config.js baseUrl, end with /exec) and Apps Script access: Anyone. Then redeploy functions.'
    );
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Sheets catalog was not JSON: ' + String(text).slice(0, 120));
  }
  if (!data || data.ok === false || !Array.isArray(data.products)) {
    throw new Error('Sheets getCatalog: ' + ((data && data.error) || 'catalog_sync_failed'));
  }
  const catalog = await upsertCatalog(data.products, null);

  // Legacy pull-sync remains safe: seed stock only when a product has no
  // Firestore stock yet. It must never reset live stock or reservations.
  const stockMap = data.stock || {};
  let seeded = 0;
  for (const p of data.products) {
    const id = String(p.id);
    const ref = db.collection('products').doc(id);
    const snap = await ref.get();
    const current = snap.exists ? snap.data() : {};
    if (current.stockOnHand !== undefined) continue;
    const available = Number(stockMap[id] != null ? stockMap[id] : (p.available || 0));
    await ref.set({
      stockOnHand: Math.max(0, Math.floor(available)),
      stockReserved: Number(current.stockReserved || 0),
      stockCorrectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    seeded += 1;
  }
  return { ok: true, count: data.products.length, catalog, stockSeeded: seeded };
}

function catalogFields(p) {
  const components = Array.isArray(p.components) ? p.components : [];
  return {
    id: String(p.id),
    name: p.name || '',
    description: p.description || '',
    price: Number(p.price) || 0,
    mrp: p.mrp || null,
    sku: p.sku || '',
    category: p.category || '',
    subcategory: p.subcategory || '',
    image: p.image || '',
    videoUrl: p.videoUrl || '',
    onSale: p.onSale === true,
    isCombo: p.isCombo === true,
    filters: p.filters && typeof p.filters === 'object' ? p.filters : {},
    details: Array.isArray(p.details) ? p.details : [],
    packOptions: Array.isArray(p.packOptions) ? p.packOptions : [],
    components,
    hasLinkedCombo: components.length > 0,
    active: p.active !== false,
    deletedFromSheet: false,
    catalogSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function upsertCatalog(products, sheetProductIds) {
  const list = Array.isArray(products) ? products : [];
  let batch = db.batch();
  let writes = 0;
  let upserted = 0;
  const commitIfFull = async () => {
    if (writes < 400) return;
    await batch.commit();
    batch = db.batch();
    writes = 0;
  };

  for (const p of list) {
    if (!p || p.id === undefined || p.id === null || String(p.id).trim() === '') continue;
    const id = String(p.id);
    batch.set(db.collection('products').doc(id), catalogFields(p), { merge: true });
    writes += 1;
    upserted += 1;
    await commitIfFull();
  }

  let deactivated = 0;
  if (Array.isArray(sheetProductIds)) {
    const present = new Set(sheetProductIds.map(String));
    const existing = await db.collection('products').get();
    for (const doc of existing.docs) {
      if (present.has(doc.id)) continue;
      batch.set(doc.ref, {
        active: false,
        deletedFromSheet: true,
        catalogSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      writes += 1;
      deactivated += 1;
      await commitIfFull();
    }
  }

  if (writes) await batch.commit();
  return { upserted, deactivated };
}

async function applyStockCorrections(corrections) {
  const appliedIds = [];
  const skipped = [];
  for (const correction of Array.isArray(corrections) ? corrections : []) {
    const id = String(correction && correction.product_id || '').trim();
    const raw = Number(correction && correction.stock_on_hand);
    if (!id || !Number.isFinite(raw) || raw < 0) {
      skipped.push({ product_id: id, reason: 'invalid_stock' });
      continue;
    }
    const ref = db.collection('products').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      skipped.push({ product_id: id, reason: 'not_found' });
      continue;
    }
    await ref.set({
      stockOnHand: Math.floor(raw),
      stockCorrectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    appliedIds.push(id);
  }
  return { applied: appliedIds.length, appliedIds, skipped };
}

async function verifyUser(req) {
  const header = req.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    return await admin.auth().verifyIdToken(m[1]);
  } catch {
    return null;
  }
}

async function orderActionAuthorized(req, body, order) {
  if (order.uid) {
    const user = await verifyUser(req);
    return !!user && user.uid === order.uid;
  }
  const supplied = String(body?.cancel_token || '');
  const expectedHash = String(order.cancel_token_hash || '');
  if (!supplied || !expectedHash) return false;
  const suppliedHash = crypto.createHash('sha256').update(supplied).digest('hex');
  return suppliedHash.length === expectedHash.length
    && crypto.timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(expectedHash));
}

async function mutateCoupon(action, payload) {
  const url = sheetsCatalogUrl();
  const secret = readBoundSecret(couponMutateToken, 'COUPON_MUTATE_TOKEN');
  if (!url || !secret) throw new Error('coupon_mutation_not_configured');
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({
      action,
      mutate_token: secret,
      origin: 'https://myminopets.com',
    }, payload || {})),
  });
  const data = await response.json();
  if (!response.ok || !data?.ok) {
    const error = new Error(data?.error || 'coupon_mutation_failed');
    error.details = data;
    throw error;
  }
  return data;
}

function validProfileEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '';
}

exports.completeProfile = httpsFn(async (req, res, origin) => {
  if (req.method !== 'POST') {
    sendJson(res, origin, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const user = await verifyUser(req);
  if (!user) {
    sendJson(res, origin, { ok: false, error: 'auth_required' }, 401);
    return;
  }
  const body = req.body || {};
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const rawEmail = String(body.email || '').trim();
  const email = rawEmail ? validProfileEmail(body.email) : '';
  if (name.length < 2 || name.length > 80) {
    sendJson(res, origin, { ok: false, error: 'invalid_name' });
    return;
  }
  if (rawEmail && !email) {
    sendJson(res, origin, { ok: false, error: 'invalid_email' });
    return;
  }

  // Read the verified number from Firebase Auth, never from browser input.
  const authUser = await admin.auth().getUser(user.uid);
  const phone = normalizePhone(authUser.phoneNumber);
  if (!/^91\d{10}$/.test(phone)) {
    sendJson(res, origin, { ok: false, error: 'phone_not_verified' });
    return;
  }

  const phoneRef = db.collection('phones').doc(phone);
  const userRef = db.collection('users').doc(user.uid);
  try {
    await db.runTransaction(async (tx) => {
      const phoneSnap = await tx.get(phoneRef);
      if (phoneSnap.exists && phoneSnap.data().uid !== user.uid) {
        throw new Error('phone_already_registered');
      }
      const existing = await tx.get(userRef);
      if (existing.exists) {
        const current = existing.data();
        if (current.profileComplete && current.phone && normalizePhone(current.phone) !== phone) {
          throw new Error('phone_change_not_allowed');
        }
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.set(phoneRef, { uid: user.uid, updatedAt: now }, { merge: true });
      tx.set(userRef, {
        name,
        email,
        phone,
        profileComplete: true,
        displayName: authUser.displayName || name,
        photoURL: authUser.photoURL || '',
        updatedAt: now,
        ...(!existing.exists ? { createdAt: now } : {}),
      }, { merge: true });
    });
  } catch (err) {
    if (err.message === 'phone_already_registered' || err.message === 'phone_change_not_allowed') {
      sendJson(res, origin, { ok: false, error: err.message });
      return;
    }
    throw err;
  }
  if (authUser.displayName !== name) {
    await admin.auth().updateUser(user.uid, { displayName: name });
  }
  sendJson(res, origin, { ok: true, profile: { name, email, phone, profileComplete: true } });
});

exports.releaseOrphanGoogleUser = httpsFn(async (req, res, origin) => {
  if (req.method !== 'POST') {
    sendJson(res, origin, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const user = await verifyUser(req);
  if (!user) {
    sendJson(res, origin, { ok: false, error: 'auth_required' }, 401);
    return;
  }
  const authUser = await admin.auth().getUser(user.uid);
  if (!authUser.phoneNumber) {
    sendJson(res, origin, { ok: false, error: 'phone_not_verified' });
    return;
  }
  const email = validProfileEmail(req.body && req.body.email);
  if (!email) {
    sendJson(res, origin, { ok: false, error: 'invalid_email' });
    return;
  }
  let other;
  try {
    other = await admin.auth().getUserByEmail(email);
  } catch (_) {
    sendJson(res, origin, { ok: true, released: false });
    return;
  }
  if (other.uid === user.uid) {
    sendJson(res, origin, { ok: true, released: false, alreadyOurs: true });
    return;
  }
  if (other.phoneNumber) {
    sendJson(res, origin, { ok: false, error: 'email_in_use' });
    return;
  }
  const otherRef = db.collection('users').doc(other.uid);
  const otherDoc = await otherRef.get();
  if (otherDoc.exists && otherDoc.data().profileComplete) {
    sendJson(res, origin, { ok: false, error: 'email_in_use' });
    return;
  }
  await admin.auth().deleteUser(other.uid);
  if (otherDoc.exists) await otherRef.delete();
  sendJson(res, origin, { ok: true, released: true });
});

async function readStockMap() {
  const snap = await db.collection('products').get();
  const stock = {};
  const products = {};
  snap.forEach((doc) => {
    products[doc.id] = doc.data();
    stock[doc.id] = stockAvailable(doc.data());
  });
  snap.forEach((doc) => {
    const product = products[doc.id];
    const components = Array.isArray(product.components) ? product.components : [];
    if (!product.hasLinkedCombo || !components.length) return;
    const kits = components
      .filter((c) => c && c.product_id && Number(c.qty) > 0)
      .map((c) => Math.floor(Number(stock[String(c.product_id)] || 0) / Number(c.qty)));
    stock[doc.id] = kits.length ? Math.min(...kits) : 0;
  });
  return stock;
}

function orderStockDemand(order) {
  if (order.stock_moves && typeof order.stock_moves === 'object') {
    return Object.keys(order.stock_moves).reduce((out, id) => {
      const qty = Number(order.stock_moves[id]) || 0;
      if (qty > 0) out[String(id)] = qty;
      return out;
    }, {});
  }
  const demand = {};
  (order.items || []).forEach((it) => {
    const pid = String(it.product_id);
    demand[pid] = (demand[pid] || 0) + (Number(it.qty) || 0);
  });
  return demand;
}

async function markOrderPaid(orderId, extra) {
  const ref = db.collection('orders').doc(orderId);
  let paidOrder = null;
  const transitioned = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('order_not_found');
    const order = snap.data();
    paidOrder = order;
    if (order.status === 'paid') return false;
    if (order.status !== 'pending') throw new Error('order_not_pending');
    const demand = orderStockDemand(order);
    const ids = Object.keys(demand);
    const prefs = ids.map((id) => db.collection('products').doc(id));
    const psnaps = await Promise.all(prefs.map((r) => tx.get(r)));
    psnaps.forEach((ps, i) => {
      if (!ps.exists) return;
      const data = ps.data();
      const qty = demand[ids[i]];
      tx.update(prefs[i], {
        stockOnHand: Math.max(0, Number(data.stockOnHand || 0) - qty),
        stockReserved: Math.max(0, Number(data.stockReserved || 0) - qty),
      });
    });
    tx.update(ref, Object.assign({
      status: 'paid',
      paid_at: admin.firestore.FieldValue.serverTimestamp(),
    }, extra || {}));
    return true;
  });
  if (!transitioned) return;
  if (paidOrder?.coupon_code && paidOrder.coupon_discount_type !== 'percent') {
    try {
      await mutateCoupon('markCouponUsed', {
        code: paidOrder.coupon_code,
        order_id: orderId,
      });
      await ref.set({
        coupon_sync_pending: false,
        coupon_sync_action: admin.firestore.FieldValue.delete(),
      }, { merge: true });
    } catch (err) {
      console.error('[coupon] mark used failed', orderId, err.message);
      await ref.set({
        coupon_sync_pending: true,
        coupon_sync_action: 'markCouponUsed',
      }, { merge: true });
    }
  }
  if (paidOrder) {
    try {
      await mutateCoupon('mirrorPaidOrder', Object.assign({
        order_id: orderId,
        customer_phone: paidOrder.customer_phone,
        customer_name: paidOrder.customer_name,
        fulfillment: paidOrder.fulfillment,
        address: paidOrder.address,
        pincode: paidOrder.pincode,
        items: paidOrder.items || [],
        subtotal: paidOrder.subtotal,
        shipping: paidOrder.shipping,
        discount: paidOrder.discount,
        coupon_code: paidOrder.coupon_code || '',
        total: paidOrder.total,
        payment_mode: extra?.payment_mode || paidOrder.payment_mode || 'razorpay',
        created_at: paidOrder.created_at,
      }, extra || {}));
      await ref.set({ order_sync_pending: false }, { merge: true });
    } catch (err) {
      console.error('[orders] mirror paid failed', orderId, err.message);
      await ref.set({ order_sync_pending: true }, { merge: true });
    }
  }
}

async function releaseOrderHold(orderRef, status) {
  const nextStatus = status === 'cancelled' ? 'cancelled' : 'expired';
  let released = false;
  let releasedOrder = null;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef);
    if (!fresh.exists || fresh.data().status !== 'pending') return;
    const order = fresh.data();
    releasedOrder = order;
    const demand = orderStockDemand(order);
    const ids = Object.keys(demand);
    const refs = ids.map((id) => db.collection('products').doc(id));
    const productSnaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    productSnaps.forEach((productSnap, index) => {
      if (!productSnap.exists) return;
      const data = productSnap.data();
      tx.update(refs[index], {
        stockReserved: Math.max(0, Number(data.stockReserved || 0) - demand[ids[index]]),
      });
    });
    const stamp = admin.firestore.FieldValue.serverTimestamp();
    tx.update(orderRef, {
      status: nextStatus,
      [nextStatus === 'cancelled' ? 'cancelled_at' : 'expired_at']: stamp,
      razorpay_order_creating_at: admin.firestore.FieldValue.delete(),
    });
    released = true;
  });
  if (released && releasedOrder?.coupon_code && releasedOrder.coupon_discount_type !== 'percent') {
    try {
      await mutateCoupon('releaseCoupon', {
        code: releasedOrder.coupon_code,
        order_id: orderRef.id,
      });
      await orderRef.set({
        coupon_sync_pending: false,
        coupon_sync_action: admin.firestore.FieldValue.delete(),
      }, { merge: true });
    } catch (err) {
      console.error('[coupon] release failed', orderRef.id, err.message);
      await orderRef.set({
        coupon_sync_pending: true,
        coupon_sync_action: 'releaseCoupon',
      }, { merge: true });
    }
  }
  return released;
}

exports.syncCatalog = onRequest(
  {
    region: 'asia-south1',
    cors: false,
    invoker: 'public',
    secrets: [catalogSyncSecret, sheetsApiToken],
  },
  async (req, res) => {
    const origin = req.get('origin') || '';
    if (req.method === 'OPTIONS') {
      res.set(corsHeaders(origin));
      res.status(204).send('');
      return;
    }
    if (req.method === 'GET') {
      sendJson(res, origin, {
        ok: true,
        ping: 'mino-sync-v5',
        hasCatalogKey: !!String(process.env.CATALOG_SYNC_KEY || '').trim(),
        hasSyncSecret: !!String(process.env.SYNC_SECRET || '').trim(),
      });
      return;
    }
    try {
      const body = parseRequestBody(req);
      const expected = String(
        process.env.CATALOG_SYNC_KEY ||
        readBoundSecret(catalogSyncSecret, 'SYNC_SECRET') ||
        ''
      ).trim();
      const headerVal = req.get('x-sync-secret') || (req.headers && req.headers['x-sync-secret']);
      const sent = String(
        (body && (body.secret || body.sync_secret)) ||
        (req.query && req.query.secret) ||
        headerVal ||
        ''
      ).trim();
      if (!expected || !sent || sent !== expected) {
        console.warn('syncCatalog auth miss', {
          hasExpected: !!expected,
          expectedLen: expected.length,
          sentLen: sent.length,
          bodyType: typeof req.body,
          isBuffer: Buffer.isBuffer(req.body),
          bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
        });
        sendJson(res, origin, {
          ok: false,
          error: 'unauthorized',
          debug: {
            hasSecretOnServer: !!expected,
            secretLen: expected.length,
            sentLen: sent.length,
            bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
          },
        });
        return;
      }
      let result;
      if (body && (body.catalog || Array.isArray(body.stock_corrections))) {
        const catalogPayload = body.catalog;
        const catalog = catalogPayload
          ? await upsertCatalog(catalogPayload.products, catalogPayload.sheet_product_ids)
          : { upserted: 0, deactivated: 0 };
        const stock = await applyStockCorrections(body.stock_corrections);
        result = { ok: true, catalog, stock, at: new Date().toISOString() };
      } else {
        result = await syncCatalogFromSheets(readBoundSecret(sheetsApiToken, 'SHEETS_TOKEN'));
      }
      sendJson(res, origin, result);
    } catch (err) {
      console.error(err);
      sendJson(res, origin, { ok: false, error: err.message || 'server_error' });
    }
  }
);

exports.getStock = httpsFn(async (req, res, origin) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(res, origin, { ok: false, error: 'method_not_allowed' });
    return;
  }
  sendJson(res, origin, { ok: true, stock: await readStockMap() });
});

/**
 * Google Places proxy for the checkout address field. The Maps key stays
 * server-side; suggestions are biased to Bengaluru, the only city we deliver to.
 */
const PLACES_BIAS = {
  circle: {
    center: { latitude: 12.9716, longitude: 77.5946 },
    radius: 50000,
  },
};

function placesKey() {
  return readBoundSecret(googleMapsKey, 'GOOGLE_MAPS_KEY');
}

function readParam(req, name) {
  const fromQuery = req.query ? req.query[name] : '';
  const fromBody = req.body ? req.body[name] : '';
  return String(fromQuery || fromBody || '').trim();
}

/** Coordinates of a picked suggestion, kept with the order for the delivery run. */
function addressGeo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return {
    lat,
    lng,
    place_id: String(raw.place_id || '').slice(0, 200) || null,
  };
}

function placeAddressParts(place) {
  const comps = Array.isArray(place.addressComponents) ? place.addressComponents : [];
  const pick = (type) => {
    const hit = comps.find((c) => Array.isArray(c.types) && c.types.includes(type));
    return hit ? String(hit.longText || hit.shortText || '') : '';
  };
  return {
    pincode: pick('postal_code'),
    locality: pick('sublocality_level_1') || pick('locality'),
    city: pick('locality') || pick('administrative_area_level_2'),
  };
}

exports.addressSuggest = httpsFn(async (req, res, origin) => {
  const key = placesKey();
  if (!key) {
    sendJson(res, origin, { ok: false, error: 'places_disabled' });
    return;
  }
  const input = readParam(req, 'q').slice(0, 120);
  if (input.length < 3) {
    sendJson(res, origin, { ok: true, suggestions: [] });
    return;
  }

  const payload = {
    input,
    includedRegionCodes: ['in'],
    locationBias: PLACES_BIAS,
  };
  const session = readParam(req, 'session').slice(0, 64);
  if (session) payload.sessionToken = session;

  const gres = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify(payload),
  });
  const data = await gres.json().catch(() => ({}));
  if (!gres.ok) {
    console.error('[places] autocomplete failed', gres.status, data && data.error);
    sendJson(res, origin, { ok: false, error: 'places_failed' });
    return;
  }

  const suggestions = (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter((p) => p && p.placeId)
    .slice(0, 6)
    .map((p) => ({
      place_id: p.placeId,
      main: (p.structuredFormat && p.structuredFormat.mainText && p.structuredFormat.mainText.text)
        || (p.text && p.text.text)
        || '',
      secondary: (p.structuredFormat && p.structuredFormat.secondaryText && p.structuredFormat.secondaryText.text) || '',
    }));
  sendJson(res, origin, { ok: true, suggestions });
}, [googleMapsKey]);

exports.addressDetails = httpsFn(async (req, res, origin) => {
  const key = placesKey();
  if (!key) {
    sendJson(res, origin, { ok: false, error: 'places_disabled' });
    return;
  }
  const placeId = readParam(req, 'place_id').slice(0, 200);
  if (!placeId) {
    sendJson(res, origin, { ok: false, error: 'place_id_required' });
    return;
  }

  // The terminating Place Details call is what closes a billed autocomplete session.
  const session = readParam(req, 'session').slice(0, 64);
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`
    + (session ? `?sessionToken=${encodeURIComponent(session)}` : '');
  const gres = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,formattedAddress,shortFormattedAddress,addressComponents,location',
    },
  });
  const place = await gres.json().catch(() => ({}));
  if (!gres.ok) {
    console.error('[places] details failed', gres.status, place && place.error);
    sendJson(res, origin, { ok: false, error: 'places_failed' });
    return;
  }

  const parts = placeAddressParts(place);
  sendJson(res, origin, {
    ok: true,
    place_id: place.id || placeId,
    address: place.shortFormattedAddress || place.formattedAddress || '',
    pincode: parts.pincode,
    locality: parts.locality,
    city: parts.city,
    lat: place.location ? place.location.latitude : null,
    lng: place.location ? place.location.longitude : null,
  });
}, [googleMapsKey]);

exports.createOrder = httpsFn(async (req, res, origin) => {
  if (req.method !== 'POST') {
    sendJson(res, origin, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const body = req.body || {};
  const user = await verifyUser(req);
  if (req.get('authorization') && !user) {
    sendJson(res, origin, { ok: false, error: 'auth_invalid' }, 401);
    return;
  }

  let phone = normalizePhone(body.customer_phone);
  let name = String(body.customer_name || '').trim();
  if (user) {
    const profileSnap = await db.collection('users').doc(user.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() : null;
    if (!profile?.profileComplete) {
      sendJson(res, origin, { ok: false, error: 'profile_incomplete' });
      return;
    }
    phone = normalizePhone(profile.phone);
    name = String(profile.name || '').trim();
  }
  const fulfillment = String(body.fulfillment || 'pickup').trim().toLowerCase();
  const address = String(body.address || '').trim();
  const pincode = String(body.pincode || '').trim();
  const geo = addressGeo(body.geo);
  const itemsIn = body.items;

  if (!/^91\d{10}$/.test(phone)) {
    sendJson(res, origin, { ok: false, error: 'invalid_phone' });
    return;
  }
  if (!name) {
    sendJson(res, origin, { ok: false, error: 'invalid_name' });
    return;
  }
  if (fulfillment !== 'local_delivery' && fulfillment !== 'pickup') {
    sendJson(res, origin, { ok: false, error: 'invalid_fulfillment' });
    return;
  }
  if (fulfillment === 'local_delivery' && (!address || !pincode)) {
    sendJson(res, origin, { ok: false, error: 'address_required' });
    return;
  }
  if (!Array.isArray(itemsIn) || !itemsIn.length) {
    sendJson(res, origin, { ok: false, error: 'empty_cart' });
    return;
  }

  const probe = await db.collection('products').limit(1).get();
  if (probe.empty) {
    await syncCatalogFromSheets(sheetsApiToken.value());
  }

  const ids = itemsIn.map((it) => String(it.product_id || '')).filter(Boolean);
  let productMap = await loadProductMap(ids);

  const priced = [];
  let subtotal = 0;
  const demand = {};

  for (const line of itemsIn) {
    const pid = String(line.product_id || '').trim();
    const p = productMap[pid];
    if (!p || p.active === false) {
      sendJson(res, origin, { ok: false, error: 'unknown_product', product_id: pid });
      return;
    }
    const packKey = String(line.pack_key || '').trim();
    let fishQty = 0;
    let unitPrice = Number(p.price) || 0;
    let packQty = 0;
    let packLabel = '';
    let lineTotal = 0;

    if (packKey) {
      if (p.hasLinkedCombo) {
        sendJson(res, origin, { ok: false, error: 'combo_no_packs', product_id: pid });
        return;
      }
      const pack = findPackOption(p, packKey);
      if (!pack) {
        sendJson(res, origin, { ok: false, error: 'invalid_pack', product_id: pid, pack_key: packKey });
        return;
      }
      packQty = Math.floor(Number(line.pack_qty));
      if (!packQty || packQty < 1) {
        sendJson(res, origin, { ok: false, error: 'invalid_pack_qty', product_id: pid });
        return;
      }
      fishQty = (Number(pack.units) || 1) * packQty;
      unitPrice = Number(pack.price) || 0;
      packLabel = pack.label || packKey;
      lineTotal = unitPrice * packQty;
    } else {
      fishQty = Math.floor(Number(line.qty));
      if (!fishQty || fishQty < 1) {
        sendJson(res, origin, { ok: false, error: 'invalid_qty', product_id: pid });
        return;
      }
      lineTotal = unitPrice * fishQty;
    }

    const moves = expandStockMoves(productMap, pid, fishQty);
    Object.keys(moves).forEach((id) => { demand[id] = (demand[id] || 0) + moves[id]; });
    subtotal += lineTotal;
    priced.push({
      product_id: pid,
      name: p.name,
      qty: fishQty,
      unit_price: unitPrice,
      line_total: lineTotal,
      pack_key: packKey,
      pack_label: packLabel,
      pack_qty: packQty || '',
    });
  }

  const extraIds = Object.keys(demand).filter((id) => !productMap[id]);
  if (extraIds.length) {
    Object.assign(productMap, await loadProductMap(extraIds));
  }

  const shipping = fulfillment === 'local_delivery'
    ? (subtotal >= FREE_DELIVERY_AT ? 0 : DELIVERY_FEE)
    : 0;

  let discount = 0;
  let couponCode = String(body.coupon_code || '').trim().toUpperCase();
  let couponDiscountType = null;
  let couponPercentage = null;
  if (couponCode) {
    const sheetsUrl = sheetsCatalogUrl();
    const token = sheetsApiToken.value();
    const sep = sheetsUrl.includes('?') ? '&' : '?';
    const url = `${sheetsUrl}${sep}action=validateCoupon&token=${encodeURIComponent(token)}` +
      `&origin=${encodeURIComponent('https://myminopets.com')}` +
      `&code=${encodeURIComponent(couponCode)}&phone=${encodeURIComponent(phone)}` +
      `&subtotal=${encodeURIComponent(String(subtotal))}` +
      `&total_base=${encodeURIComponent(String(subtotal + shipping))}`;
    const cres = await fetch(url, { redirect: 'follow' });
    const cdata = await cres.json();
    if (!cdata || !cdata.ok) {
      sendJson(res, origin, { ok: false, error: (cdata && cdata.error) || 'coupon_not_found' });
      return;
    }
    discount = Number(cdata.discount) || 0;
    couponCode = cdata.code || couponCode;
    couponDiscountType = cdata.discount_type || null;
    couponPercentage = Number(cdata.percentage) || null;
  } else {
    couponCode = '';
  }

  const total = Math.max(0, subtotal + shipping - discount);
  const now = new Date();
  const reservedUntil = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
  const orderId = makeOrderId(now);
  const cancelToken = user ? '' : crypto.randomBytes(24).toString('hex');
  const cancelTokenHash = cancelToken
    ? crypto.createHash('sha256').update(cancelToken).digest('hex')
    : null;

  try {
    await db.runTransaction(async (tx) => {
      const demandIds = Object.keys(demand);
      const refs = demandIds.map((id) => db.collection('products').doc(id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      snaps.forEach((snap, i) => {
        const id = demandIds[i];
        if (!snap.exists) {
          const err = new Error('unknown_product');
          err.product_id = id;
          throw err;
        }
        const data = snap.data();
        const want = demand[id];
        const av = stockAvailable(data);
        if (want > av) {
          const err = new Error('insufficient_stock');
          err.product_id = id;
          err.available = av;
          err.requested = want;
          throw err;
        }
      });
      snaps.forEach((snap, i) => {
        const data = snap.data();
        tx.update(refs[i], {
          stockReserved: Number(data.stockReserved || 0) + demand[demandIds[i]],
        });
      });

      tx.set(db.collection('orders').doc(orderId), {
        order_id: orderId,
        uid: user ? user.uid : null,
        customer_name: name,
        customer_phone: phone,
        fulfillment,
        address,
        pincode,
        geo,
        items: priced,
        subtotal,
        shipping,
        discount,
        coupon_code: couponCode || null,
        coupon_discount_type: couponDiscountType,
        coupon_percentage: couponPercentage,
        total,
        stock_moves: demand,
        status: 'pending',
        cancel_token_hash: cancelTokenHash,
        payment_mode: 'upi',
        reserved_until: reservedUntil.toISOString(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        created_at: now.toISOString(),
      });
    });
  } catch (err) {
    if (err.message === 'insufficient_stock') {
      sendJson(res, origin, {
        ok: false,
        error: 'insufficient_stock',
        product_id: err.product_id,
        available: err.available,
        requested: err.requested,
      });
      return;
    }
    if (err.message === 'unknown_product') {
      sendJson(res, origin, { ok: false, error: 'unknown_product', product_id: err.product_id });
      return;
    }
    throw err;
  }

  if (couponCode && couponDiscountType !== 'percent') {
    try {
      const reserved = await mutateCoupon('reserveCoupon', {
        code: couponCode,
        phone,
        subtotal,
        total_base: subtotal + shipping,
        order_id: orderId,
      });
      if (Number(reserved.discount) !== discount) {
        await releaseOrderHold(db.collection('orders').doc(orderId), 'cancelled');
        sendJson(res, origin, { ok: false, error: 'coupon_total_changed' });
        return;
      }
    } catch (err) {
      await releaseOrderHold(db.collection('orders').doc(orderId), 'cancelled');
      sendJson(res, origin, { ok: false, error: err.message || 'coupon_reserve_failed' });
      return;
    }
  }

  sendJson(res, origin, {
    ok: true,
    order_id: orderId,
    status: 'pending',
    subtotal,
    shipping,
    discount,
    coupon_code: couponCode || null,
    cancel_token: cancelToken || undefined,
    total,
    reserved_until: reservedUntil.toISOString(),
    items: priced,
    stock: await readStockMap(),
    pay: {
      upi_id: process.env.UPI_ID || '',
      payee_name: process.env.UPI_PAYEE_NAME || 'Mino Pets',
    },
  });
}, [sheetsApiToken, couponMutateToken]);

exports.createRazorpayOrder = httpsFn(async (req, res, origin) => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = razorpayKeySecret.value();
  if (!keyId || !keySecret) {
    sendJson(res, origin, { ok: false, error: 'razorpay_disabled' });
    return;
  }
  const body = req.body || {};
  const orderId = String(body.order_id || '').trim();
  if (!orderId) {
    sendJson(res, origin, { ok: false, error: 'missing_order_id' });
    return;
  }
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) {
    sendJson(res, origin, { ok: false, error: 'order_not_found' });
    return;
  }
  const order = snap.data();
  if (!(await orderActionAuthorized(req, body, order))) {
    sendJson(res, origin, { ok: false, error: 'order_not_authorized' }, 403);
    return;
  }
  if (order.status === 'paid') {
    sendJson(res, origin, { ok: true, already: true, paid: true, order_id: orderId, status: 'paid' });
    return;
  }
  if (order.status !== 'pending') {
    sendJson(res, origin, { ok: false, error: 'invalid_order_status', status: order.status || 'unknown' });
    return;
  }
  const holdUntil = Date.parse(String(order.reserved_until || ''));
  if (isFinite(holdUntil) && holdUntil <= Date.now()) {
    await releaseOrderHold(snap.ref);
    sendJson(res, origin, { ok: false, error: 'hold_expired' });
    return;
  }
  const amountPaisa = Math.round(Number(order.total) * 100);
  if (amountPaisa === 0) {
    await markOrderPaid(orderId, { payment_mode: 'fully_discounted' });
    sendJson(res, origin, {
      ok: true,
      already: true,
      paid: true,
      order_id: orderId,
      status: 'paid',
      stock: await readStockMap(),
    });
    return;
  }
  if (!amountPaisa || amountPaisa < 100) {
    sendJson(res, origin, { ok: false, error: 'invalid_amount' });
    return;
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const paymentHoldUntil = new Date(Date.now() + HOLD_MINUTES * 60 * 1000).toISOString();
  // Atomically claim Razorpay-order creation. Without this, two tabs (or a
  // double tap) can create two payment orders and strand the first payment.
  let existingRazorpayOrderId = '';
  try {
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(snap.ref);
      if (!freshSnap.exists) throw new Error('order_not_found');
      const fresh = freshSnap.data();
      if (fresh.status !== 'pending') throw new Error('invalid_order_status');
      const freshHoldUntil = Date.parse(String(fresh.reserved_until || ''));
      if (isFinite(freshHoldUntil) && freshHoldUntil <= Date.now()) throw new Error('hold_expired');
      if (fresh.razorpay_order_id) {
        existingRazorpayOrderId = String(fresh.razorpay_order_id);
        tx.update(snap.ref, { reserved_until: paymentHoldUntil });
        return;
      }
      const creatingAt = fresh.razorpay_order_creating_at;
      const creatingMs = creatingAt && typeof creatingAt.toMillis === 'function'
        ? creatingAt.toMillis()
        : Date.parse(String(creatingAt || ''));
      if (isFinite(creatingMs) && Date.now() - creatingMs < 60000) throw new Error('busy_retry');
      tx.update(snap.ref, {
        razorpay_order_creating_at: admin.firestore.FieldValue.serverTimestamp(),
        reserved_until: paymentHoldUntil,
      });
    });
  } catch (err) {
    const known = ['order_not_found', 'invalid_order_status', 'hold_expired', 'busy_retry'];
    if (err.message === 'hold_expired') await releaseOrderHold(snap.ref);
    sendJson(res, origin, { ok: false, error: known.includes(err.message) ? err.message : 'busy_retry' });
    return;
  }

  // A retry reopens the same Razorpay order.
  if (existingRazorpayOrderId) {
    let razorpayPaid = false;
    try {
      const existingRes = await fetch(
        `https://api.razorpay.com/v1/orders/${encodeURIComponent(existingRazorpayOrderId)}`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      const existing = await existingRes.json();
      razorpayPaid = existingRes.ok && String(existing.status || '').toLowerCase() === 'paid';
    } catch (err) {
      console.warn('[razorpay] could not inspect reused order', err.message);
    }
    sendJson(res, origin, {
      ok: true,
      reused: true,
      razorpay_paid: razorpayPaid,
      order_id: orderId,
      razorpay_order_id: existingRazorpayOrderId,
      key_id: keyId,
      amount_paisa: amountPaisa,
      currency: 'INR',
      reserved_until: paymentHoldUntil,
    });
    return;
  }
  let rzpRes;
  try {
    rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: amountPaisa,
        currency: 'INR',
        receipt: orderId.slice(0, 40),
        payment_capture: 1,
        notes: { mino_order_id: orderId, phone: order.customer_phone || '' },
      }),
    });
  } catch (err) {
    await snap.ref.update({
      razorpay_order_creating_at: admin.firestore.FieldValue.delete(),
    });
    throw err;
  }
  const rzpData = await rzpRes.json();
  if (!rzpRes.ok || !rzpData.id) {
    await snap.ref.update({
      razorpay_order_creating_at: admin.firestore.FieldValue.delete(),
    });
    sendJson(res, origin, { ok: false, error: 'razorpay_order_failed', razorpay: rzpData });
    return;
  }
  await snap.ref.update({
    payment_mode: 'razorpay',
    razorpay_order_id: rzpData.id,
    razorpay_amount_paisa: amountPaisa,
    razorpay_order_creating_at: admin.firestore.FieldValue.delete(),
  });
  sendJson(res, origin, {
    ok: true,
    order_id: orderId,
    razorpay_order_id: rzpData.id,
    key_id: keyId,
    amount_paisa: amountPaisa,
    currency: 'INR',
    reserved_until: paymentHoldUntil,
  });
}, [razorpayKeySecret, couponMutateToken]);

exports.confirmRazorpayPayment = httpsFn(async (req, res, origin) => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = razorpayKeySecret.value();
  const body = req.body || {};
  const orderId = String(body.order_id || '').trim();
  if (!orderId) {
    sendJson(res, origin, { ok: false, error: 'missing_order_id' });
    return;
  }
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) {
    sendJson(res, origin, { ok: false, error: 'order_not_found' });
    return;
  }
  const order = snap.data();
  if (!(await orderActionAuthorized(req, body, order))) {
    sendJson(res, origin, { ok: false, error: 'order_not_authorized' }, 403);
    return;
  }
  if (order.status === 'paid') {
    sendJson(res, origin, {
      ok: true,
      paid: true,
      already: true,
      order_id: orderId,
      status: 'paid',
      stock: await readStockMap(),
    });
    return;
  }
  if (order.status !== 'pending') {
    sendJson(res, origin, { ok: false, error: 'invalid_order_status', status: order.status || 'unknown' });
    return;
  }
  const rzpOrderId = String(body.razorpay_order_id || order.razorpay_order_id || '').trim();
  const paymentId = String(body.razorpay_payment_id || '').trim();
  const signature = String(body.razorpay_signature || '').trim();
  if (!rzpOrderId || rzpOrderId !== String(order.razorpay_order_id || '')) {
    sendJson(res, origin, { ok: false, error: 'razorpay_order_mismatch' });
    return;
  }
  if (!keyId || !keySecret) {
    sendJson(res, origin, { ok: false, error: 'razorpay_disabled' });
    return;
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const expectedAmount = Math.round(Number(order.total) * 100);
  let capturedPaymentId = paymentId;
  if (paymentId && signature && rzpOrderId) {
    const expected = crypto.createHmac('sha256', keySecret).update(`${rzpOrderId}|${paymentId}`).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(expectedBuf, signatureBuf)) {
      sendJson(res, origin, { ok: false, error: 'invalid_signature' });
      return;
    }
    const paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const payment = await paymentRes.json();
    const validPayment = paymentRes.ok
      && String(payment.status || '').toLowerCase() === 'captured'
      && String(payment.order_id || '') === rzpOrderId
      && Number(payment.amount) === expectedAmount
      && String(payment.currency || '').toUpperCase() === 'INR';
    if (!validPayment) {
      console.error('[razorpay] payment verification failed', paymentRes.status, payment);
      sendJson(res, origin, { ok: false, error: 'payment_not_captured' });
      return;
    }
  } else {
    const paymentsRes = await fetch(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(rzpOrderId)}/payments`,
      { headers: { Authorization: `Basic ${auth}` } }
    );
    const payments = await paymentsRes.json();
    const captured = paymentsRes.ok && Array.isArray(payments.items)
      ? payments.items.find((payment) => (
        String(payment.status || '').toLowerCase() === 'captured'
        && String(payment.order_id || '') === rzpOrderId
        && Number(payment.amount) === expectedAmount
        && String(payment.currency || '').toUpperCase() === 'INR'
      ))
      : null;
    if (!captured) {
      sendJson(res, origin, {
        ok: true,
        order_id: orderId,
        paid: false,
        razorpay_state: 'pending',
        razorpay_order_id: rzpOrderId,
      });
      return;
    }
    capturedPaymentId = captured.id || '';
  }

  await markOrderPaid(orderId, {
    razorpay_order_id: rzpOrderId,
    razorpay_payment_id: capturedPaymentId || null,
  });
  sendJson(res, origin, {
    ok: true,
    paid: true,
    order_id: orderId,
    status: 'paid',
    stock: await readStockMap(),
  });
}, [razorpayKeySecret, couponMutateToken]);

/**
 * Frees a pending hold when the customer backs out of payment, so the fish are
 * sellable again instead of waiting for releaseExpiredHolds. Refuses to cancel
 * an order Razorpay already captured.
 */
exports.cancelOrder = httpsFn(async (req, res, origin) => {
  const body = req.body || {};
  const orderId = String(body.order_id || '').trim();
  if (!orderId) {
    sendJson(res, origin, { ok: false, error: 'missing_order_id' });
    return;
  }
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) {
    sendJson(res, origin, { ok: false, error: 'order_not_found' });
    return;
  }
  const order = snap.data();
  if (!(await orderActionAuthorized(req, body, order))) {
    sendJson(res, origin, { ok: false, error: 'cancel_not_authorized' }, 403);
    return;
  }
  if (order.status === 'paid') {
    sendJson(res, origin, { ok: false, error: 'order_already_paid', status: 'paid', order_id: orderId });
    return;
  }
  if (order.status !== 'pending') {
    sendJson(res, origin, {
      ok: true,
      order_id: orderId,
      status: order.status || 'cancelled',
      already: true,
      stock: await readStockMap(),
    });
    return;
  }

  // A payment may have been captured while the browser thought it failed.
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = razorpayKeySecret.value();
  const rzpOrderId = String(order.razorpay_order_id || '').trim();
  if (rzpOrderId && keyId && keySecret) {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const expectedAmount = Math.round(Number(order.total) * 100);
    try {
      const paymentsRes = await fetch(
        `https://api.razorpay.com/v1/orders/${encodeURIComponent(rzpOrderId)}/payments`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      const payments = await paymentsRes.json();
      const captured = paymentsRes.ok && Array.isArray(payments.items)
        ? payments.items.find((payment) => (
          String(payment.status || '').toLowerCase() === 'captured'
          && String(payment.order_id || '') === rzpOrderId
          && Number(payment.amount) === expectedAmount
          && String(payment.currency || '').toUpperCase() === 'INR'
        ))
        : null;
      if (captured) {
        await markOrderPaid(orderId, {
          razorpay_order_id: rzpOrderId,
          razorpay_payment_id: captured.id || null,
        });
        sendJson(res, origin, {
          ok: false,
          error: 'order_already_paid',
          status: 'paid',
          order_id: orderId,
          stock: await readStockMap(),
        });
        return;
      }
    } catch (err) {
      console.warn('[cancelOrder] could not inspect Razorpay order', err.message);
    }
  }

  await releaseOrderHold(ref, 'cancelled');
  sendJson(res, origin, {
    ok: true,
    order_id: orderId,
    status: 'cancelled',
    stock: await readStockMap(),
  });
}, [razorpayKeySecret, couponMutateToken]);

exports.releaseExpiredHolds = onSchedule({
  schedule: 'every 15 minutes',
  secrets: [couponMutateToken],
}, async () => {
  const nowIso = new Date().toISOString();
  const snap = await db.collection('orders').where('status', '==', 'pending').get();
  for (const doc of snap.docs) {
    const order = doc.data();
    if (!order.reserved_until || order.reserved_until > nowIso) continue;
    await releaseOrderHold(doc.ref);
  }

  const couponSync = await db.collection('orders').where('coupon_sync_pending', '==', true).get();
  for (const doc of couponSync.docs) {
    const order = doc.data();
    if (!order.coupon_code || !order.coupon_sync_action) continue;
    try {
      await mutateCoupon(order.coupon_sync_action, {
        code: order.coupon_code,
        order_id: doc.id,
      });
      await doc.ref.set({
        coupon_sync_pending: false,
        coupon_sync_action: admin.firestore.FieldValue.delete(),
      }, { merge: true });
    } catch (err) {
      console.error('[coupon] scheduled reconciliation failed', doc.id, err.message);
    }
  }

  const orderSync = await db.collection('orders').where('order_sync_pending', '==', true).get();
  for (const doc of orderSync.docs) {
    const order = doc.data();
    if (order.status !== 'paid') continue;
    try {
      await mutateCoupon('mirrorPaidOrder', {
        order_id: doc.id,
        customer_phone: order.customer_phone,
        customer_name: order.customer_name,
        fulfillment: order.fulfillment,
        address: order.address,
        pincode: order.pincode,
        items: order.items || [],
        subtotal: order.subtotal,
        shipping: order.shipping,
        discount: order.discount,
        coupon_code: order.coupon_code || '',
        total: order.total,
        payment_mode: order.payment_mode || 'razorpay',
        created_at: order.created_at,
      });
      await doc.ref.set({ order_sync_pending: false }, { merge: true });
    } catch (err) {
      console.error('[orders] scheduled mirror failed', doc.id, err.message);
    }
  }
});
