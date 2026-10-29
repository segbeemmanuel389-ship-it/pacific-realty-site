(function () {
  var $ = function (i) { return document.getElementById(i); };
  var BUCKET = 'property-images';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var STATUS = { for_sale: 'For sale', for_rent: 'For rent', new_project: 'New project', distress_sale: 'Distress sale', ongoing_project: 'Ongoing project' };
  var TYPE = { residential: 'Residential', commercial: 'Commercial', land: 'Land' };
  var sb, props = [], editId = null, imgs = [], removed = [], newId = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function okUrl(u) { return typeof u === 'string' && /^(https?:\/\/|assets\/)[^"'()\s<>]+$/.test(u); }
  function show(id) { ['vOff', 'vLogin', 'vDenied', 'vApp'].forEach(function (v) { $(v).hidden = v !== id; }); $('out').hidden = id !== 'vApp'; }
  function say(id, t, k) { var m = $(id); m.textContent = t || ''; m.className = 'msg ' + (k || ''); }
  function clearErrs(f) { Array.prototype.forEach.call(f.querySelectorAll('.err'), function (e) { e.textContent = ''; }); Array.prototype.forEach.call(f.elements, function (i) { i.removeAttribute('aria-invalid'); }); }
  function fieldErr(f, n, t) { var s = f.querySelector('.err[data-for="' + n + '"]'); if (s) s.textContent = t; if (f.elements[n]) f.elements[n].setAttribute('aria-invalid', 'true'); }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function when(d) { try { return new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return d || ''; } }

  if (!PRS.configured) { show('vOff'); return; }
  PRS.client().then(init).catch(function (e) { show('vOff'); $('vOff').firstElementChild.textContent = 'Could not connect: ' + e.message; });

  async function init(c) {
    sb = c;
    sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT') show('vLogin'); });
    var r = await sb.auth.getSession(); await gate(r.data.session);
  }
  async function gate(session) {
    if (!session) { show('vLogin'); return; }
    var o = await sb.rpc('is_owner');
    if (o.error || o.data !== true) { $('deniedEmail').textContent = session.user.email || ''; show('vDenied'); return; }
    $('who').textContent = session.user.email || ''; show('vApp'); loadProps(); loadEnq(); loadClients();
  }

  /* ---------- sign in / out ---------- */
  $('fLogin').addEventListener('submit', async function (e) {
    e.preventDefault(); var f = e.target; clearErrs(f); say('lmsg', '');
    var email = f.em.value.trim().toLowerCase(), pw = f.pw.value, bad = null;
    if (!EMAIL.test(email)) { fieldErr(f, 'em', 'Please enter a valid email address.'); bad = 'em'; }
    if (!pw) { fieldErr(f, 'pw', 'Please enter your password.'); bad = bad || 'pw'; }
    if (bad) { f.elements[bad].focus(); return; }
    var b = f.querySelector('button'); b.disabled = true;
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) throw r.error;
      f.reset(); await gate(r.data.session);
    } catch (err) { say('lmsg', /invalid login/i.test(err.message) ? 'The email or password is not correct.' : err.message, 'bad'); }
    finally { b.disabled = false; }
  });
  async function out() { await sb.auth.signOut(); show('vLogin'); }
  $('out').addEventListener('click', out); $('deniedOut').addEventListener('click', out);

  /* ---------- tabs ---------- */
  document.querySelector('.tabsA').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.setAttribute('aria-selected', x === b); });
    $('tProps').hidden = b.dataset.tab !== 'props'; $('tEnq').hidden = b.dataset.tab !== 'enq'; $('tCli').hidden = b.dataset.tab !== 'cli';
  });

  /* ---------- properties list ---------- */
  async function loadProps() {
    var r = await sb.from('properties').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    if (r.error) { $('plist').innerHTML = '<div class="note warn">Could not load listings: ' + esc(r.error.message) + '</div>'; return; }
    props = r.data || []; renderProps();
    $('areas').innerHTML = Array.from(new Set(props.map(function (p) { return p.area; }).filter(Boolean))).map(function (a) { return '<option value="' + esc(a) + '">'; }).join('');
  }
  function renderProps() {
    var q = $('search').value.trim().toLowerCase();
    var rows = props.filter(function (p) { return !q || (p.title + ' ' + (p.location_detail || '') + ' ' + (p.area || '')).toLowerCase().indexOf(q) > -1; });
    $('pcount').textContent = rows.length + ' of ' + props.length + ' listings';
    $('import').hidden = props.length > 0;
    $('plist').innerHTML = rows.map(function (p) {
      var th = (p.images || []).filter(okUrl)[0];
      return '<article class="prow" data-id="' + esc(p.id) + '"><div class="pth" style="' + (th ? 'background-image:url(' + esc(th) + ')' : '') + '"></div>' +
        '<div class="pmain"><b>' + esc(p.title) + '</b><span>' + esc(p.location_detail || p.area) + '</span><span>' + esc(p.price_label || '') + '</span>' +
        '<span><span class="chip">' + esc(STATUS[p.listing_status] || p.listing_status) + '</span><span class="chip">' + esc(TYPE[p.property_type] || '') + '</span>' +
        (p.is_available ? '' : '<span class="chip bad">Hidden</span>') + (p.is_featured ? '<span class="chip ok">Featured</span>' : '') + '</span></div>' +
        '<div class="pact"><label class="sw"><input type="checkbox" data-act="avail"' + (p.is_available ? ' checked' : '') + '> Available</label>' +
        '<button class="btn sm ghost" data-act="edit" type="button">Edit</button><button class="btn sm danger ghost" data-act="del" type="button">Delete</button></div></article>';
    }).join('') || '<p class="sub">No listings match.</p>';
  }
  $('search').addEventListener('input', renderProps);
  $('plist').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var id = b.closest('.prow').dataset.id, p = props.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (b.dataset.act === 'edit') openForm(p); else if (b.dataset.act === 'del') remove(p);
  });
  $('plist').addEventListener('change', async function (e) {
    var c = e.target.closest('input[data-act="avail"]'); if (!c) return;
    var id = c.closest('.prow').dataset.id; c.disabled = true;
    var r = await sb.from('properties').update({ is_available: c.checked }).eq('id', id);
    if (r.error) { c.checked = !c.checked; alert('Could not update: ' + r.error.message); } else loadProps();
    c.disabled = false;
  });
  function pathOf(url) { var i = url.indexOf('/' + BUCKET + '/'); return i < 0 ? null : decodeURIComponent(url.slice(i + BUCKET.length + 2).split('?')[0]); }
  async function remove(p) {
    if (!confirm('Delete "' + p.title + '"? This cannot be undone.')) return;
    var r = await sb.from('properties').delete().eq('id', p.id);
    if (r.error) { alert('Could not delete: ' + r.error.message); return; }
    var paths = (p.images || []).map(pathOf).filter(Boolean);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    loadProps();
  }

  /* ---------- add / edit form ---------- */
  var dlg = $('dlg'), pf = $('pf');
  $('add').addEventListener('click', function () { openForm(null); });
  $('cancel').addEventListener('click', function () { dlg.close(); });
  function openForm(p) {
    editId = p ? p.id : null; newId = p ? null : uuid(); removed = []; clearErrs(pf); say('pmsg', ''); $('imgErr').textContent = '';
    $('dlgT').textContent = p ? 'Edit property' : 'Add property';
    var v = p || { property_type: 'residential', listing_status: 'for_sale', is_available: true, is_featured: false, features: [], images: [] };
    pf.title.value = v.title || ''; pf.area.value = v.area || ''; pf.location_detail.value = v.location_detail || '';
    pf.price_label.value = v.price_label || ''; pf.price_ngn.value = v.price_ngn != null ? Math.round(v.price_ngn) : '';
    pf.property_type.value = v.property_type; pf.listing_status.value = v.listing_status;
    pf.bedrooms.value = v.bedrooms != null ? v.bedrooms : ''; pf.bathrooms.value = v.bathrooms != null ? v.bathrooms : '';
    pf.features.value = (v.features || []).join(', '); pf.description.value = v.description || '';
    pf.is_available.checked = !!v.is_available; pf.is_featured.checked = !!v.is_featured;
    imgs = (v.images || []).map(function (u) { return { url: u, preview: u }; }); renderImgs(); $('imgFile').value = '';
    dlg.showModal();
  }
  function renderImgs() {
    $('imgs').innerHTML = imgs.map(function (it, i) {
      return '<li data-i="' + i + '">' + (i === 0 ? '<span class="cover">Cover</span>' : '') + '<img alt="Photo ' + (i + 1) + '" src="' + esc(it.preview) + '">' +
        '<div class="ib"><button type="button" data-m="up" aria-label="Move earlier"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" data-m="down" aria-label="Move later"' + (i === imgs.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" data-m="rm" aria-label="Remove photo">✕</button></div></li>';
    }).join('');
  }
  $('imgs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-m]'); if (!b) return;
    var i = +b.closest('li').dataset.i, m = b.dataset.m;
    if (m === 'rm') { var it = imgs.splice(i, 1)[0]; if (it.url) removed.push(it.url); else if (it.preview) URL.revokeObjectURL(it.preview); }
    else { var j = m === 'up' ? i - 1 : i + 1; if (j < 0 || j >= imgs.length) return; var t = imgs[i]; imgs[i] = imgs[j]; imgs[j] = t; }
    renderImgs();
  });
  $('imgFile').addEventListener('change', function () {
    var err = $('imgErr'); err.textContent = '';
    Array.prototype.forEach.call(this.files, function (f) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { err.textContent = '"' + f.name + '" is not a JPG, PNG or WebP image.'; return; }
      if (f.size > 15 * 1024 * 1024) { err.textContent = '"' + f.name + '" is too large (maximum 15 MB).'; return; }
      if (imgs.length >= 12) { err.textContent = 'You can add up to 12 photos.'; return; }
      imgs.push({ file: f, preview: URL.createObjectURL(f) });
    });
    this.value = ''; renderImgs();
  });
  function resize(file, max, q) {
    return new Promise(function (res, rej) {
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () {
        var r = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * r); c.height = Math.round(im.height * r); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(function (b) { URL.revokeObjectURL(u); b ? res(b) : rej(new Error('Could not process "' + file.name + '".')); }, 'image/jpeg', q);
      };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('"' + file.name + '" is not a valid image.')); };
      im.src = u;
    });
  }
  function validate() {
    clearErrs(pf); var bad = null;
    function fail(n, t) { fieldErr(pf, n, t); bad = bad || n; }
    if (pf.title.value.trim().length < 3) fail('title', 'Please enter a title (at least 3 letters).');
    if (!pf.area.value.trim()) fail('area', 'Please enter the place, for example "Orchid".');
    var pn = pf.price_ngn.value.replace(/[,\s]/g, ''); if (pn && !/^\d{1,13}$/.test(pn)) fail('price_ngn', 'Use numbers only, for example 300000000.');
    ['bedrooms', 'bathrooms'].forEach(function (n) { var v = pf[n].value.trim(); if (v && !/^\d{1,2}$/.test(v)) fail(n, 'Use a whole number.'); });
    if (bad) pf.elements[bad].focus();
    return !bad;
  }
  pf.addEventListener('submit', async function (e) {
    e.preventDefault(); if (!validate()) return;
    var btn = $('save'); btn.disabled = true; btn.textContent = 'Saving…'; say('pmsg', '');
    var pid = editId || newId, uploaded = [];
    try {
      var urls = [];
      for (var i = 0; i < imgs.length; i++) {
        var it = imgs[i];
        if (it.url) { urls.push(it.url); continue; }
        say('pmsg', 'Uploading photo ' + (i + 1) + ' of ' + imgs.length + '…');
        var blob = await resize(it.file, 1400, 0.82), path = pid + '/' + Date.now() + '-' + i + '.jpg';
        var up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw up.error; uploaded.push(path);
        urls.push(sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
      }
      var num = function (n) { var v = pf[n].value.trim(); return v === '' ? null : parseInt(v, 10); };
      var pn = pf.price_ngn.value.replace(/[,\s]/g, '');
      var row = {
        title: pf.title.value.trim(), description: pf.description.value.trim() || null, area: pf.area.value.trim(),
        location_detail: pf.location_detail.value.trim() || null, price_label: pf.price_label.value.trim() || null, price_ngn: pn ? Number(pn) : null,
        property_type: pf.property_type.value, listing_status: pf.listing_status.value, bedrooms: num('bedrooms'), bathrooms: num('bathrooms'),
        features: pf.features.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 12),
        images: urls, is_available: pf.is_available.checked, is_featured: pf.is_featured.checked
      };
      var r;
      if (editId) r = await sb.from('properties').update(row).eq('id', editId);
      else { row.id = pid; row.sort_order = props.length ? Math.min.apply(null, props.map(function (p) { return p.sort_order || 0; })) - 1 : 0; r = await sb.from('properties').insert(row); }
      if (r.error) throw r.error;
      var gone = removed.map(pathOf).filter(Boolean); if (gone.length) await sb.storage.from(BUCKET).remove(gone);
      dlg.close(); await loadProps();
    } catch (err) {
      if (uploaded.length) { try { await sb.storage.from(BUCKET).remove(uploaded); } catch (x) {} }
      say('pmsg', 'Could not save: ' + (err.message || err), 'bad');
    } finally { btn.disabled = false; btn.textContent = 'Save property'; }
  });

  /* ---------- import the 15 starter listings ---------- */
  $('doImport').addEventListener('click', async function () {
    var b = this; b.disabled = true; say('importMsg', 'Reading the starter listings…');
    try {
      var seed = await (await fetch('assets/seed/seed-listings.json', { cache: 'no-store' })).json();
      for (var k = 0; k < seed.length; k++) {
        var s = seed[k], pid = uuid(), urls = [];
        say('importMsg', 'Importing ' + (k + 1) + ' of ' + seed.length + ': ' + s.title);
        for (var i = 0; i < s.images.length; i++) {
          var resp = await fetch(s.images[i]); if (!resp.ok) throw new Error('Missing photo file ' + s.images[i]);
          var blob = await resp.blob(), path = pid + '/' + i + '.jpg';
          var up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
          if (up.error) throw up.error;
          urls.push(sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
        }
        var row = Object.assign({}, s, { id: pid, images: urls });
        var r = await sb.from('properties').insert(row); if (r.error) throw r.error;
      }
      say('importMsg', 'Done. All listings were imported.', 'ok'); await loadProps();
    } catch (err) { say('importMsg', 'Import stopped: ' + err.message + ' (you can press the button again after fixing this).', 'bad'); b.disabled = false; }
  });

  /* ---------- enquiries ---------- */
  async function loadEnq() {
    var r = await sb.from('enquiries').select('*').order('created_at', { ascending: false }).limit(200);
    var box = $('elist');
    if (r.error) { box.innerHTML = '<div class="note warn">Could not load enquiries: ' + esc(r.error.message) + '</div>'; return; }
    var rows = r.data || [], n = rows.filter(function (x) { return x.status === 'new'; }).length;
    $('enqBadge').hidden = !n; $('enqBadge').textContent = n;
    box.innerHTML = rows.length ? rows.map(function (x) {
      return '<article class="enq" data-id="' + esc(x.id) + '"><div class="top"><b>' + esc(x.name) + '</b><span>' + esc(when(x.created_at)) + '</span></div>' +
        '<div><a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a>' + (x.phone ? ' · <a href="tel:' + esc(String(x.phone).replace(/[^0-9+]/g, '')) + '">' + esc(x.phone) + '</a>' : '') + '</div>' +
        (x.property_title ? '<div><span class="chip">About: ' + esc(x.property_title) + '</span></div>' : '') +
        '<p>' + esc(x.message) + '</p><div class="tool" style="margin:0"><span class="chip ' + (x.email_status === 'sent' ? 'ok' : x.email_status === 'failed' ? 'bad' : '') + '">Email: ' + esc(x.email_status) + '</span>' +
        '<label class="sw">Status <select data-est><option value="new"' + (x.status === 'new' ? ' selected' : '') + '>New</option><option value="contacted"' + (x.status === 'contacted' ? ' selected' : '') + '>Contacted</option><option value="closed"' + (x.status === 'closed' ? ' selected' : '') + '>Closed</option></select></label></div></article>';
    }).join('') : '<p class="sub">No enquiries yet. They will appear here once the website\'s contact form is connected to the database (next setup step).</p>';
  }
  $('elist').addEventListener('change', async function (e) {
    var s = e.target.closest('select[data-est]'); if (!s) return;
    var r = await sb.from('enquiries').update({ status: s.value }).eq('id', s.closest('.enq').dataset.id);
    if (r.error) alert('Could not update: ' + r.error.message); else loadEnq();
  });

  /* ---------- clients ---------- */
  async function loadClients() {
    var r = await sb.from('profiles').select('id,full_name,email,phone,created_at').order('created_at', { ascending: false }).limit(500);
    var rows = r.data || [];
    $('cempty').hidden = rows.length > 0;
    $('clist').innerHTML = rows.map(function (x) { return '<tr><td>' + esc(x.full_name) + '</td><td>' + esc(x.email) + '</td><td>' + esc(x.phone || '') + '</td><td>' + esc(when(x.created_at)) + '</td></tr>'; }).join('');
  }
})();
