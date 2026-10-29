(function () {
  var $ = function (i) { return document.getElementById(i); };
  var BUCKET = 'property-images';
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var STATUS = { for_sale: 'For sale', for_rent: 'For rent', new_project: 'New project', distress_sale: 'Distress sale', ongoing_project: 'Ongoing project' };
  var TYPE = { residential: 'Residential', commercial: 'Commercial', land: 'Land' };
  var sb, props = [], enquiries = [], editId = null, imgs = [], removed = [], newId = null;

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
    var r = await sb.auth.getSession(); if (r.error) throw r.error; await gate(r.data.session);
  }
  async function gate(session) {
    if (!session) { show('vLogin'); return; }
    var o = await sb.rpc('is_owner');
    if (o.error) { show('vLogin'); say('lmsg', 'Could not verify administrator access. Check that the Supabase schema and is_owner() function are installed, then try again.', 'bad'); return; }
    if (o.data !== true) { $('deniedEmail').textContent = session.user.email || ''; show('vDenied'); return; }
    $('who').textContent = session.user.email || ''; show('vApp'); selectTab('dash');
    await Promise.all([loadProps(), loadEnq(), loadClients()]);
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
  async function out() {
    try {
      var r = await sb.auth.signOut(); if (r.error) throw r.error;
      show('vLogin');
    } catch (err) { say('lmsg', 'Could not sign out: ' + err.message, 'bad'); }
  }
  $('out').addEventListener('click', out); $('deniedOut').addEventListener('click', out);

  /* ---------- tabs ---------- */
  function selectTab(tab) {
    Array.prototype.forEach.call(document.querySelectorAll('.tabsA button[data-tab]'), function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === tab);
    });
    ['dash', 'props', 'enq', 'cli'].forEach(function (name) { $('t' + name[0].toUpperCase() + name.slice(1)).hidden = name !== tab; });
  }
  document.querySelector('.tabsA').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (b) selectTab(b.dataset.tab);
  });
  document.querySelector('.dash').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-goto]'); if (b) selectTab(b.dataset.goto);
  });

  function updateStats() {
    $('statProps').textContent = props.length;
    $('statAvailable').textContent = props.filter(function (p) { return p.is_available; }).length;
    $('statEnquiries').textContent = enquiries.filter(function (x) { return x.status === 'new'; }).length;
    $('statClients').textContent = $('clist').rows.length;
    $('dashMsg').textContent = 'Dashboard data loaded.';
    $('dashMsg').className = 'msg ok';
  }

  /* ---------- properties list ---------- */
  async function loadProps() {
    $('propsMsg').textContent = 'Loading properties…'; $('propsMsg').className = 'msg';
    try {
      var r = await sb.from('properties').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
      if (r.error) throw r.error;
      props = r.data || []; renderProps(); updateStats();
      $('propsMsg').textContent = props.length ? '' : 'No properties yet. Add a property or import the starter listings below.';
      $('areas').innerHTML = Array.from(new Set(props.map(function (p) { return p.area; }).filter(Boolean))).map(function (a) { return '<option value="' + esc(a) + '">'; }).join('');
    } catch (err) {
      $('plist').innerHTML = ''; $('propsMsg').textContent = 'Could not load properties: ' + err.message; $('propsMsg').className = 'msg bad';
      $('dashMsg').textContent = 'Some dashboard data could not be loaded.'; $('dashMsg').className = 'msg bad';
    }
  }
  function renderProps() {
    var q = $('search').value.trim().toLowerCase();
    var availability = $('availabilityFilter').value, featured = $('featuredFilter').value, type = $('typeFilter').value;
    var rows = props.filter(function (p) {
      var matchesSearch = !q || (p.title + ' ' + (p.location_detail || '') + ' ' + (p.area || '') + ' ' + (p.price_label || '')).toLowerCase().indexOf(q) > -1;
      return matchesSearch &&
        (!availability || (availability === 'available') === !!p.is_available) &&
        (!featured || (featured === 'featured') === !!p.is_featured) &&
        (!type || p.property_type === type);
    });
    $('pcount').textContent = rows.length + ' of ' + props.length + ' listings';
    $('import').hidden = props.length > 0 || q || availability || featured || type;
    $('plist').innerHTML = rows.map(function (p) {
      var th = (p.images || []).filter(okUrl)[0];
      return '<article class="prow" data-id="' + esc(p.id) + '"><div class="pth" style="' + (th ? 'background-image:url(' + esc(th) + ')' : '') + '"></div>' +
        '<div class="pmain"><b>' + esc(p.title) + '</b><span>' + esc(p.location_detail || p.area) + '</span><span>' + esc(p.price_label || '') + '</span>' +
        '<span><span class="chip">' + esc(STATUS[p.listing_status] || p.listing_status) + '</span><span class="chip">' + esc(TYPE[p.property_type] || '') + '</span>' +
        (p.is_available ? '' : '<span class="chip bad">Hidden</span>') + (p.is_featured ? '<span class="chip ok">Featured</span>' : '') + '</span></div>' +
        '<div class="pact"><label class="sw"><input type="checkbox" data-act="avail" aria-label="Available: ' + esc(p.title) + '"' + (p.is_available ? ' checked' : '') + '> Available</label>' +
        '<label class="sw"><input type="checkbox" data-act="featured" aria-label="Featured: ' + esc(p.title) + '"' + (p.is_featured ? ' checked' : '') + '> Featured</label>' +
        '<button class="btn sm ghost" data-act="edit" type="button">Edit</button><button class="btn sm danger ghost" data-act="del" type="button">Delete</button></div></article>';
    }).join('') || '<p class="sub">' + (props.length ? 'No properties match those search and filter choices.' : 'No properties are in the database yet.') + '</p>';
  }
  ['search', 'availabilityFilter', 'featuredFilter', 'typeFilter'].forEach(function (id) {
    $(id).addEventListener(id === 'search' ? 'input' : 'change', renderProps);
  });
  $('plist').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var id = b.closest('.prow').dataset.id, p = props.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (b.dataset.act === 'edit') openForm(p); else if (b.dataset.act === 'del') remove(p);
  });
  $('plist').addEventListener('change', async function (e) {
    var c = e.target.closest('input[data-act="avail"], input[data-act="featured"]'); if (!c) return;
    var p = props.filter(function (x) { return x.id === c.closest('.prow').dataset.id; })[0];
    if (!p) return;
    var field = c.dataset.act === 'avail' ? 'is_available' : 'is_featured', previous = !!p[field];
    c.disabled = true; $('propsMsg').textContent = 'Updating property…';
    try {
      var r = await sb.from('properties').update((function () { var row = {}; row[field] = c.checked; return row; })()).eq('id', p.id);
      if (r.error) throw r.error;
      p[field] = c.checked; renderProps(); updateStats(); $('propsMsg').textContent = 'Property updated.'; $('propsMsg').className = 'msg ok';
    } catch (err) {
      c.checked = previous; $('propsMsg').textContent = 'Could not update property: ' + err.message; $('propsMsg').className = 'msg bad';
    } finally { c.disabled = false; }
  });
  function pathOf(url) { var i = url.indexOf('/' + BUCKET + '/'); return i < 0 ? null : decodeURIComponent(url.slice(i + BUCKET.length + 2).split('?')[0]); }
  async function remove(p) {
    if (!confirm('Delete "' + p.title + '"? This cannot be undone.')) return;
    $('propsMsg').textContent = 'Deleting property…'; $('propsMsg').className = 'msg';
    var deleted = false;
    try {
      var r = await sb.from('properties').delete().eq('id', p.id);
      if (r.error) throw r.error;
      deleted = true;
      var paths = (p.images || []).map(pathOf).filter(Boolean), storageError = null;
      if (paths.length) {
        var rm = await sb.storage.from(BUCKET).remove(paths);
        if (rm.error) storageError = rm.error.message;
      }
      await loadProps();
      $('propsMsg').textContent = storageError ? 'Property deleted, but some stored photos could not be removed: ' + storageError : 'Property deleted.';
      $('propsMsg').className = storageError ? 'msg bad' : 'msg ok';
    } catch (err) {
      $('propsMsg').textContent = (deleted ? 'Property was deleted, but the page could not refresh or remove its photos: ' : 'Could not delete property: ') + err.message;
      $('propsMsg').className = 'msg bad';
    }
  }

  /* ---------- add / edit form ---------- */
  var dlg = $('dlg'), pf = $('pf');
  $('add').addEventListener('click', function () { openForm(null); });
  $('cancel').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () {
    imgs.forEach(function (it) { if (!it.url && it.preview) URL.revokeObjectURL(it.preview); });
    imgs = [];
  });
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
    var pid = editId || newId, uploaded = [], saved = false;
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
      saved = true;
      dlg.close();
      await loadProps();
      var gone = removed.map(pathOf).filter(Boolean), cleanupError = null;
      if (gone.length) {
        var cleanup = await sb.storage.from(BUCKET).remove(gone);
        if (cleanup.error) cleanupError = cleanup.error.message;
      }
      $('propsMsg').textContent = cleanupError ? 'Property saved, but some removed photos remain in storage: ' + cleanupError : 'Property saved.';
      $('propsMsg').className = cleanupError ? 'msg bad' : 'msg ok';
    } catch (err) {
      if (!saved && uploaded.length) {
        var cleanup = await sb.storage.from(BUCKET).remove(uploaded);
        say('pmsg', 'Could not save: ' + (err.message || err) + (cleanup.error ? ' Uploaded-photo cleanup also failed: ' + cleanup.error.message : ''), 'bad');
      } else if (!saved) say('pmsg', 'Could not save: ' + (err.message || err), 'bad');
      else { $('propsMsg').textContent = 'Property was saved, but refreshing or photo cleanup failed: ' + (err.message || err); $('propsMsg').className = 'msg bad'; }
    } finally { btn.disabled = false; btn.textContent = 'Save property'; }
  });

  /* ---------- import the 15 starter listings ---------- */
  $('doImport').addEventListener('click', async function () {
    var b = this; b.disabled = true; say('importMsg', 'Reading the starter listings…');
    try {
      var seed = await (await fetch('assets/seed/seed-listings.json', { cache: 'no-store' })).json();
      var existingResult = await sb.from('properties').select('title,area');
      if (existingResult.error) throw existingResult.error;
      var keyOf = function (p) { return (p.title || '').trim().toLowerCase() + '|' + (p.area || '').trim().toLowerCase(); };
      var existing = new Set((existingResult.data || []).map(keyOf));
      var imported = 0, skipped = 0;
      for (var k = 0; k < seed.length; k++) {
        var s = seed[k], key = keyOf(s);
        if (existing.has(key)) { skipped++; continue; }
        var pid = uuid(), urls = [], uploaded = [];
        say('importMsg', 'Importing ' + (k + 1) + ' of ' + seed.length + ': ' + s.title);
        try {
          for (var i = 0; i < s.images.length; i++) {
            var resp = await fetch(s.images[i]); if (!resp.ok) throw new Error('Missing photo file ' + s.images[i]);
            var blob = await resp.blob(), path = pid + '/' + i + '.jpg';
            var up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
            if (up.error) throw up.error;
            uploaded.push(path);
            urls.push(sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
          }
          var row = Object.assign({}, s, { id: pid, images: urls });
          var r = await sb.from('properties').insert(row); if (r.error) throw r.error;
          existing.add(key); imported++;
        } catch (err) {
          if (uploaded.length) {
            var cleanup = await sb.storage.from(BUCKET).remove(uploaded);
            if (cleanup.error) throw new Error(err.message + ' Photo cleanup also failed: ' + cleanup.error.message);
          }
          throw err;
        }
      }
      say('importMsg', 'Import finished. Added ' + imported + ' listing(s); skipped ' + skipped + ' matching existing listing(s).', 'ok');
      await loadProps();
    } catch (err) {
      say('importMsg', 'Import stopped: ' + err.message + ' Existing matches will be skipped if you retry.', 'bad');
    } finally { b.disabled = false; }
  });

  /* ---------- enquiries ---------- */
  async function loadEnq() {
    var box = $('elist');
    $('enqMsg').textContent = 'Loading enquiries…'; $('enqMsg').className = 'msg';
    try {
      var r = await sb.from('enquiries').select('*').order('created_at', { ascending: false }).limit(200);
      if (r.error) throw r.error;
      enquiries = r.data || [];
      var n = enquiries.filter(function (x) { return x.status === 'new'; }).length;
      $('enqBadge').hidden = !n; $('enqBadge').textContent = n;
      renderEnquiries(); updateStats();
      $('enqMsg').textContent = enquiries.length ? '' : 'No enquiries yet. The contact forms are not currently connected to save enquiries to this table.';
    } catch (err) {
      box.innerHTML = ''; $('enqMsg').textContent = 'Could not load enquiries: ' + err.message; $('enqMsg').className = 'msg bad';
      $('dashMsg').textContent = 'Some dashboard data could not be loaded.'; $('dashMsg').className = 'msg bad';
    }
  }
  function renderEnquiries() {
    var q = $('enqSearch').value.trim().toLowerCase(), status = $('enqStatusFilter').value;
    var rows = enquiries.filter(function (x) {
      var text = [x.name, x.email, x.phone, x.property_title, x.message, x.status].join(' ').toLowerCase();
      return (!q || text.indexOf(q) > -1) && (!status || x.status === status);
    });
    $('elist').innerHTML = rows.length ? rows.map(function (x) {
      return '<article class="enq" data-id="' + esc(x.id) + '"><div class="top"><b>' + esc(x.name) + '</b><span>' + esc(when(x.created_at)) + '</span></div>' +
        '<div><a href="mailto:' + esc(x.email) + '">' + esc(x.email) + '</a>' + (x.phone ? ' · <a href="tel:' + esc(String(x.phone).replace(/[^0-9+]/g, '')) + '">' + esc(x.phone) + '</a>' : '') + '</div>' +
        ((x.property_title || x.property_id) ? '<div><span class="chip">About: ' + esc(x.property_title || 'Property enquiry') + '</span></div>' : '') +
        '<p>' + esc(x.message) + '</p><div class="tool" style="margin:0"><span class="chip ' + (x.email_status === 'sent' ? 'ok' : x.email_status === 'failed' ? 'bad' : '') + '">Email: ' + esc(x.email_status) + '</span>' +
        '<label class="sw">Status <select data-est aria-label="Enquiry status for ' + esc(x.name) + '"><option value="new"' + (x.status === 'new' ? ' selected' : '') + '>New</option><option value="contacted"' + (x.status === 'contacted' ? ' selected' : '') + '>Contacted</option><option value="closed"' + (x.status === 'closed' ? ' selected' : '') + '>Closed</select></label></div></article>';
    }).join('') : '<p class="sub">' + (enquiries.length ? 'No enquiries match those search and filter choices.' : 'No enquiries have been submitted.') + '</p>';
  }
  $('enqSearch').addEventListener('input', renderEnquiries);
  $('enqStatusFilter').addEventListener('change', renderEnquiries);
  $('elist').addEventListener('change', async function (e) {
    var s = e.target.closest('select[data-est]'); if (!s) return;
    var card = s.closest('.enq'), item = enquiries.filter(function (x) { return x.id === card.dataset.id; })[0];
    if (!item) return;
    var previous = item.status; s.disabled = true; $('enqMsg').textContent = 'Updating enquiry…'; $('enqMsg').className = 'msg';
    try {
      var r = await sb.from('enquiries').update({ status: s.value }).eq('id', item.id);
      if (r.error) throw r.error;
      item.status = s.value; renderEnquiries(); updateStats();
      $('enqMsg').textContent = 'Enquiry status updated.'; $('enqMsg').className = 'msg ok';
    } catch (err) {
      s.value = previous; $('enqMsg').textContent = 'Could not update enquiry: ' + err.message; $('enqMsg').className = 'msg bad';
    } finally { s.disabled = false; }
  });

  /* ---------- clients ---------- */
  async function loadClients() {
    $('clientMsg').textContent = 'Loading clients…'; $('clientMsg').className = 'msg';
    try {
      var r = await sb.from('profiles').select('id,full_name,email,phone,created_at').order('created_at', { ascending: false }).limit(500);
      if (r.error) throw r.error;
      var rows = r.data || [];
      $('cempty').hidden = rows.length > 0;
      $('clist').innerHTML = rows.map(function (x) { return '<tr><td>' + esc(x.full_name) + '</td><td>' + esc(x.email) + '</td><td>' + esc(x.phone || '') + '</td><td>' + esc(when(x.created_at)) + '</td></tr>'; }).join('');
      $('clientMsg').textContent = rows.length ? '' : 'No client accounts yet.';
      updateStats();
    } catch (err) {
      $('clist').innerHTML = ''; $('cempty').hidden = true;
      $('clientMsg').textContent = 'Could not load client profiles: ' + err.message; $('clientMsg').className = 'msg bad';
      $('dashMsg').textContent = 'Some dashboard data could not be loaded.'; $('dashMsg').className = 'msg bad';
    }
  }
})();
