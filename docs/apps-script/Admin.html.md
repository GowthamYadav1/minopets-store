# Apps Script — `Admin.html` (Step 6–9)

In the Apps Script project: open the existing **`Admin`** HTML file (or **+** → **HTML** → name **`Admin`**).

Replace **everything** with the block below (from `<!DOCTYPE` through `</html>`).

```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <meta charset="utf-8">
  <style>
    :root {
      --blue: #004B93;
      --coral: #ff7d00;
      --bg: #f4f7fb;
      --card: #fff;
      --muted: #64748b;
      --line: #e2e8f0;
      --ok: #047857;
      --warn: #b45309;
      --wa: #128C7E;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      background: var(--bg);
      color: #0f172a;
      line-height: 1.4;
    }
    .wrap { max-width: 520px; margin: 0 auto; padding: 1.25rem; }
    h1 { font-size: 1.25rem; color: var(--blue); margin: 0 0 0.25rem; }
    h2 { font-size: 0.95rem; color: var(--blue); margin: 0 0 0.5rem; }
    .sub { color: var(--muted); font-size: 0.85rem; margin-bottom: 1.25rem; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 1rem;
      margin-bottom: 0.75rem;
    }
    label { display: block; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.35rem; }
    input, textarea {
      width: 100%;
      padding: 0.65rem 0.75rem;
      border: 1px solid var(--line);
      border-radius: 8px;
      font-size: 1rem;
      margin-bottom: 0.55rem;
    }
    button, .btn-link {
      border: none;
      border-radius: 8px;
      padding: 0.65rem 1rem;
      font-weight: 700;
      cursor: pointer;
      font-size: 0.95rem;
      display: block;
      text-align: center;
      text-decoration: none;
    }
    .btn-primary { background: var(--blue); color: #fff; width: 100%; margin-top: 0.35rem; }
    .btn-paid { background: var(--ok); color: #fff; width: 100%; margin-top: 0.65rem; }
    .btn-wa { background: var(--wa); color: #fff; width: 100%; margin-top: 0.5rem; }
    .btn-wa-secondary { background: #075E54; color: #fff; width: 100%; margin-top: 0.5rem; }
    .btn-ghost {
      background: transparent;
      color: var(--blue);
      text-decoration: underline;
      padding: 0.4rem 0;
      margin-top: 0.5rem;
      width: auto;
    }
    .err { color: #b91c1c; font-size: 0.85rem; margin-top: 0.5rem; }
    .ok { color: var(--ok); font-size: 0.85rem; margin-top: 0.5rem; }
    .badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 800;
      padding: 0.15rem 0.45rem;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .badge-pending { background: #ffedd5; color: var(--warn); }
    .badge-reported { background: #dbeafe; color: var(--blue); }
    .badge-expired { background: #fee2e2; color: #b91c1c; }
    .badge-active { background: #d1fae5; color: var(--ok); }
    .badge-reserved { background: #ffedd5; color: var(--warn); }
    .badge-used { background: #e2e8f0; color: #475569; }
    .meta { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; }
    .total { font-size: 1.1rem; font-weight: 800; color: var(--blue); margin-top: 0.35rem; }
    .items { font-size: 0.8rem; color: #334155; margin-top: 0.4rem; }
    .toolbar { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; }
    .toolbar button { width: auto; margin-top: 0; }
    #panel { display: none; }
    #empty { display: none; color: var(--muted); text-align: center; padding: 1.5rem 0; }
    #wa-box { display: none; border-color: #99f6e4; background: #f0fdfa; }
    #wa-box h2 { font-size: 0.95rem; color: var(--wa); margin: 0 0 0.35rem; }
    #wa-box .hint { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.5rem; }
    .code { font-family: ui-monospace, monospace; font-weight: 800; color: var(--blue); }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Mino Pets — Admin</h1>
    <p class="sub">Mark Paid · WhatsApp confirm · Issue damage coupons</p>

    <div id="login" class="card">
      <label for="password">Admin password</label>
      <input id="password" type="password" autocomplete="current-password" placeholder="Script Properties password">
      <button class="btn-primary" type="button" onclick="login()">Open queue</button>
      <p id="login-err" class="err" style="display:none"></p>
    </div>

    <div id="panel">
      <div class="toolbar">
        <button class="btn-primary" type="button" style="flex:1" onclick="refreshAll()">Refresh</button>
        <button class="btn-ghost" type="button" onclick="logout()">Log out</button>
      </div>
      <p id="panel-msg" class="ok" style="display:none"></p>
      <p id="panel-err" class="err" style="display:none"></p>

      <div id="wa-box" class="card">
        <h2>WhatsApp — send confirmation</h2>
        <p class="hint" id="wa-hint"></p>
        <a id="wa-customer" class="btn-link btn-wa" href="#" target="_blank" rel="noopener">Message customer</a>
        <a id="wa-shop" class="btn-link btn-wa-secondary" href="#" target="_blank" rel="noopener">Copy to shop WhatsApp</a>
        <button class="btn-ghost" type="button" onclick="hideWaBox()">Dismiss</button>
      </div>

      <div class="card">
        <h2>Issue coupon</h2>
        <label for="c-phone">Customer phone</label>
        <input id="c-phone" type="tel" placeholder="9876543210">
        <div class="row2">
          <div>
            <label for="c-amount">Amount (₹)</label>
            <input id="c-amount" type="number" min="1" step="1" placeholder="100">
          </div>
          <div>
            <label for="c-days">Expires (days)</label>
            <input id="c-days" type="number" min="1" value="90">
          </div>
        </div>
        <label for="c-reason">Reason</label>
        <input id="c-reason" type="text" placeholder="damage_credit" value="damage_credit">
        <button class="btn-primary" type="button" onclick="issueCoupon()">Issue coupon</button>
        <p id="coupon-issue-msg" class="ok" style="display:none"></p>
        <p id="coupon-issue-err" class="err" style="display:none"></p>
      </div>

      <div class="card">
        <h2>Recent coupons</h2>
        <div id="coupon-list"></div>
      </div>

      <h2 style="margin:1rem 0 0.5rem">Open orders</h2>
      <div id="list"></div>
      <p id="empty">No pending / payment_reported / expired orders.</p>
    </div>
  </div>

  <script>
    var adminPassword = '';

    function login() {
      var pw = document.getElementById('password').value;
      setErr('login-err', '');
      google.script.run
        .withSuccessHandler(function (res) {
          if (!res || !res.ok) {
            setErr('login-err', 'Wrong password or password not set. Run setAdminPassword in the editor.');
            return;
          }
          adminPassword = pw;
          document.getElementById('login').style.display = 'none';
          document.getElementById('panel').style.display = 'block';
          renderOrders(res.orders || []);
          refreshCoupons();
        })
        .withFailureHandler(function (err) {
          setErr('login-err', String(err && err.message ? err.message : err));
        })
        .adminListOrders(pw);
    }

    function logout() {
      adminPassword = '';
      hideWaBox();
      document.getElementById('panel').style.display = 'none';
      document.getElementById('login').style.display = 'block';
      document.getElementById('password').value = '';
      document.getElementById('list').innerHTML = '';
      document.getElementById('coupon-list').innerHTML = '';
    }

    function refreshAll() {
      refresh();
      refreshCoupons();
    }

    function refresh() {
      setMsg('');
      setErr('panel-err', '');
      google.script.run
        .withSuccessHandler(function (res) {
          if (!res || !res.ok) {
            setErr('panel-err', 'Session rejected — log in again.');
            logout();
            return;
          }
          renderOrders(res.orders || []);
        })
        .withFailureHandler(function (err) {
          setErr('panel-err', String(err && err.message ? err.message : err));
        })
        .adminListOrders(adminPassword);
    }

    function refreshCoupons() {
      google.script.run
        .withSuccessHandler(function (res) {
          if (!res || !res.ok) return;
          renderCoupons(res.coupons || []);
        })
        .adminListCoupons(adminPassword);
    }

    function issueCoupon() {
      setErr('coupon-issue-err', '');
      setEl('coupon-issue-msg', '');
      var payload = {
        phone: document.getElementById('c-phone').value,
        amount: document.getElementById('c-amount').value,
        reason: document.getElementById('c-reason').value,
        expires_days: document.getElementById('c-days').value
      };
      google.script.run
        .withSuccessHandler(function (res) {
          if (!res || !res.ok) {
            setErr('coupon-issue-err', (res && res.error) ? res.error : 'Issue failed');
            return;
          }
          setEl('coupon-issue-msg', 'Issued ' + res.code + ' · ₹' + res.amount + ' for ' + res.phone);
          document.getElementById('c-amount').value = '';
          refreshCoupons();
        })
        .withFailureHandler(function (err) {
          setErr('coupon-issue-err', String(err && err.message ? err.message : err));
        })
        .adminIssueCoupon(adminPassword, payload);
    }

    function markPaid(orderId) {
      if (!confirm('Mark ' + orderId + ' as PAID?\nThis finalizes inventory.')) return;
      setMsg('Marking ' + orderId + '…');
      setErr('panel-err', '');
      google.script.run
        .withSuccessHandler(function (res) {
          if (!res || !res.ok) {
            setMsg('');
            var detail = (res && res.error) ? res.error : 'Mark Paid failed';
            if (res && res.status) detail += ' (status: ' + res.status + ')';
            if (res && res.hint) detail += ' — ' + res.hint;
            setErr('panel-err', detail);
            refresh();
            return;
          }
          setMsg((res.already ? 'Already paid: ' : 'Paid: ') + orderId +
            (res.was_expired ? ' (was expired; stock finalized)' : ''));
          showWaBox(res.whatsapp, orderId);
          refreshAll();
        })
        .withFailureHandler(function (err) {
          setMsg('');
          setErr('panel-err', String(err && err.message ? err.message : err));
        })
        .adminMarkPaid(adminPassword, orderId);
    }

    function showWaBox(wa, orderId) {
      var box = document.getElementById('wa-box');
      if (!wa || !box) return;
      document.getElementById('wa-hint').textContent =
        'Order ' + (orderId || '') + ' — open WhatsApp, review the prefilled text, then send.';
      var cust = document.getElementById('wa-customer');
      var shop = document.getElementById('wa-shop');
      if (wa.customer_url) {
        cust.href = wa.customer_url;
        cust.style.display = 'block';
      } else {
        cust.style.display = 'none';
      }
      if (wa.shop_url) {
        shop.href = wa.shop_url;
        shop.style.display = 'block';
      } else {
        shop.style.display = 'none';
      }
      box.style.display = 'block';
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideWaBox() {
      var box = document.getElementById('wa-box');
      if (box) box.style.display = 'none';
    }

    function renderOrders(orders) {
      var list = document.getElementById('list');
      var empty = document.getElementById('empty');
      list.innerHTML = '';
      if (!orders.length) {
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';
      orders.forEach(function (o) {
        var badgeClass = o.status === 'payment_reported' ? 'badge-reported'
          : (o.status === 'expired' ? 'badge-expired' : 'badge-pending');
        var items = (o.items || []).map(function (it) {
          return (it.qty || '?') + '× ' + (it.name || it.product_id);
        }).join(', ');
        var el = document.createElement('div');
        el.className = 'card';
        el.innerHTML =
          '<div><span class="badge ' + badgeClass + '">' + escapeHtml(o.status) + '</span></div>' +
          '<div style="font-weight:800;margin-top:0.35rem;color:var(--blue)">' + escapeHtml(o.order_id) + '</div>' +
          '<div class="meta">' + escapeHtml(o.customer_name || '') + ' · ' + escapeHtml(o.customer_phone || '') + '</div>' +
          '<div class="meta">' + escapeHtml(o.fulfillment || '') + ' · ' + escapeHtml(formatDate(o.created_at)) + '</div>' +
          '<div class="total">₹' + escapeHtml(String(o.total)) + '/-</div>' +
          '<div class="items">' + escapeHtml(items) + '</div>' +
          '<button class="btn-paid" type="button">Mark Paid</button>';
        el.querySelector('button').onclick = function () { markPaid(o.order_id); };
        list.appendChild(el);
      });
    }

    function renderCoupons(coupons) {
      var list = document.getElementById('coupon-list');
      list.innerHTML = '';
      if (!coupons.length) {
        list.innerHTML = '<p class="meta">No coupons yet.</p>';
        return;
      }
      coupons.forEach(function (c) {
        var badge =
          c.status === 'used' ? 'badge-used' :
          c.status === 'reserved' ? 'badge-reserved' : 'badge-active';
        var el = document.createElement('div');
        el.style.marginBottom = '0.65rem';
        el.innerHTML =
          '<div class="code">' + escapeHtml(c.code) + '</div>' +
          '<div class="meta"><span class="badge ' + badge + '">' + escapeHtml(c.status) + '</span> · ₹' +
          escapeHtml(String(c.amount)) + ' · ' + escapeHtml(c.phone) + '</div>' +
          '<div class="meta">' + escapeHtml(c.reason || '') +
          (c.order_id ? ' · order ' + escapeHtml(c.order_id) : '') + '</div>';
        list.appendChild(el);
      });
    }

    function formatDate(iso) {
      try { return new Date(iso).toLocaleString(); } catch (e) { return iso || ''; }
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function setErr(id, msg) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = msg ? 'block' : 'none';
      el.textContent = msg || '';
    }

    function setEl(id, msg) {
      var el = document.getElementById(id);
      if (!el) return;
      el.style.display = msg ? 'block' : 'none';
      el.textContent = msg || '';
    }

    function setMsg(msg) {
      setEl('panel-msg', msg);
    }
  </script>
</body>
</html>
```

After saving **Admin** + **Code.gs**, deploy a **New version**, then open:

`https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?page=admin`
