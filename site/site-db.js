/* Connects the public website to the database.
   If the database is not set up, or has no listings yet, the page keeps its built-in listings. */
(function () {
  if (!window.PRS || !PRS.configured || typeof L === 'undefined') return;
  var TAG = { for_sale: 'For sale', for_rent: 'For rent', new_project: 'New project', distress_sale: 'Distress sale', ongoing_project: 'Ongoing project' };
  var TYPE = { residential: 'Residential', commercial: 'Commercial', land: 'Land' };
  var WA = (PRS.cfg.WHATSAPP_NUMBER || '2347065239666').replace(/\D/g, '');
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var $ = function (i) { return document.getElementById(i); };

  function okUrl(u) { return typeof u === 'string' && /^https?:\/\/[^"'()\s<>]+$/.test(u); }
  function uniq(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }

  function map(r) {
    var imgs = (r.images || []).filter(okUrl), tag = TAG[r.listing_status] || 'For sale', price = Number(r.price_ngn);
    var f = (r.features && r.features.length) ? r.features : (r.bedrooms ? [r.bedrooms + (r.bedrooms === 1 ? ' bed' : ' beds')] : []);
    return {
      id: r.id, t: r.title || 'Untitled', lf: r.location_detail || r.area || 'Lagos', loc: r.area || r.location_detail || 'Lagos',
      type: TYPE[r.property_type] || 'Residential', tag: tag, st: tag, bed: r.bedrooms || 0, p: price ? price / 1e6 : null,
      pt: r.price_label || (price ? '₦' + price.toLocaleString('en-NG') : 'Price on request'), f: f,
      cta: 'View property features', c: '#007890,#05323d', pos: 'center', d: r.description || '',
      img: imgs[0] || '', gal: imgs.slice(1), feat: !!r.is_featured
    };
  }
  function fill(sel, label, vals) {
    if (!sel) return; var cur = sel.value; sel.innerHTML = ''; sel.appendChild(new Option(label, ''));
    vals.forEach(function (v) { sel.appendChild(new Option(v, v)); }); if (vals.indexOf(cur) > -1) sel.value = cur;
  }

  function featured(rows) {
    var sec = $('featured'); if (!sec) return;
    var r = rows.filter(function (x) { return x.feat; })[0];
    if (!r) { sec.hidden = true; return; }
    sec.hidden = false;
    var h2 = sec.querySelector('.head h2'); if (h2) (h2.querySelector('.mi') || h2).textContent = r.t;
    var sub = sec.querySelector('.head>div>p:not(.eb)'); if (sub) sub.textContent = r.lf;
    var img = $('fImg'); if (img) {
      var layer = img.querySelector('.zi') || img; layer.style.background = r.img ? 'url(' + r.img + ') center 40%/cover no-repeat' : 'linear-gradient(135deg,#007890,#05323d)';
      var tg = img.querySelector('.tag'); if (tg) tg.textContent = r.tag;
    }
    var box = sec.querySelector('.eqtxt'); if (!box) return;
    var chips = r.f.slice(0, 8).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('');
    var wa = 'https://wa.me/' + WA + '?text=' + encodeURIComponent('Hello, I would like to book a visit: ' + r.t + ' (' + r.lf + ').');
    box.innerHTML = '<div class="pt"><div><span>Price</span><b>' + esc(r.pt) + '</b></div></div>' + (chips ? '<ul class="hl">' + chips + '</ul>' : '') +
      '<div class="tools"><button class="btn" id="fB2" type="button">View full details</button><a class="btn ghost" href="' + wa + '" target="_blank" rel="noopener">Book a visit</a></div>';
    $('fB2').addEventListener('click', function () { openD(L.indexOf(r)); });
  }

  function apply(rows) {
    L.length = 0; rows.forEach(function (r) { L.push(r); });
    fill($('fLoc'), 'Any location', uniq(rows.map(function (r) { return r.loc; })));
    fill($('fType'), 'Any type', uniq(rows.map(function (r) { return r.type; })));
    fill($('fStat'), 'Any status', uniq(rows.map(function (r) { return r.st; })));
    var a = $('sA'), b = $('sB');
    if (a) { a.dataset.n = L.length; a.textContent = L.length; }
    if (b) { var n = uniq(rows.map(function (r) { return r.loc; })).length; b.dataset.n = n; b.textContent = n; }
    featured(rows); upd(); render();
  }

  async function syncSaved(sb, uid) {
    var r = await sb.from('saved_properties').select('property_id').eq('user_id', uid); if (r.error) return;
    var ids = (r.data || []).map(function (x) { return x.property_id; });
    var local = saved.filter(function (k) { return UUID.test(k) && ids.indexOf(k) < 0; });
    if (local.length) await sb.from('saved_properties').upsert(local.map(function (k) { return { user_id: uid, property_id: k }; }), { onConflict: 'user_id,property_id', ignoreDuplicates: true });
    ids.forEach(function (k) { if (saved.indexOf(k) < 0) saved.push(k); });
    try { localStorage.setItem('saved', JSON.stringify(saved)); } catch (e) {}
    upd(); render();
    window.onSaved = function (key, on) {
      if (!UUID.test(key)) return;
      var q = on ? sb.from('saved_properties').upsert({ user_id: uid, property_id: key }, { onConflict: 'user_id,property_id', ignoreDuplicates: true })
                 : sb.from('saved_properties').delete().eq('user_id', uid).eq('property_id', key);
      q.then(null, function () {});
    };
  }

  PRS.client().then(async function (sb) {
    var sess = (await sb.auth.getSession()).data.session;
    var lbl = document.querySelector('.acct .l'); if (lbl && sess) lbl.textContent = 'My account';
    var r = await sb.from('properties').select('*').eq('is_available', true).order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    if (!r.error && r.data && r.data.length) apply(r.data.map(map));
    if (sess) await syncSaved(sb, sess.user.id);
  }).catch(function () { /* keep the built-in listings */ });
})();
