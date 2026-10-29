(function () {
  var $ = function (i) { return document.getElementById(i); };
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, PHONE = /^[0-9+()\-\s]{7,20}$/;
  var sb, user = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function view(id) { $('vAuth').hidden = id !== 'vAuth'; $('vMe').hidden = id !== 'vMe'; }
  function say(id, text, kind) { var m = $(id); m.textContent = text || ''; m.className = 'msg ' + (kind || ''); }
  function clearErrs(f) {
    Array.prototype.forEach.call(f.querySelectorAll('.err'), function (e) { e.textContent = ''; });
    Array.prototype.forEach.call(f.elements, function (i) { i.removeAttribute && i.removeAttribute('aria-invalid'); });
  }
  function fieldErr(f, name, text) {
    var s = f.querySelector('.err[data-for="' + name + '"]'); if (s) s.textContent = text;
    if (f.elements[name]) f.elements[name].setAttribute('aria-invalid', 'true');
  }
  function busy(f, on, label) {
    var b = f.querySelector('button[type=submit]'); b.disabled = on;
    if (on) { b.dataset.t = b.textContent; b.textContent = label || 'Please wait…'; } else if (b.dataset.t) { b.textContent = b.dataset.t; }
  }
  function nice(err) {
    var m = (err && err.message) || 'Something went wrong. Please try again.';
    if (/invalid login/i.test(m)) return 'The email or password is not correct.';
    if (/not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox (and spam folder).';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (/password/i.test(m) && /(weak|short|least)/i.test(m)) return 'Please choose a longer password (at least 8 characters).';
    return m;
  }

  function tab(up) {
    $('tUp').setAttribute('aria-selected', up); $('tIn').setAttribute('aria-selected', !up);
    $('fUp').hidden = !up; $('fIn').hidden = up; $('fReset').hidden = true; say('msg', '');
  }
  $('tUp').addEventListener('click', function () { tab(true); });
  $('tIn').addEventListener('click', function () { tab(false); });

  if (!PRS.configured) {
    $('notcfg').hidden = false; view('vAuth');
    ['fUp', 'fIn'].forEach(function (id) {
      $(id).addEventListener('submit', function (e) { e.preventDefault(); say('msg', 'Supabase is not configured for this deployment. Please contact the website owner.', 'bad'); });
    });
    return;
  }
  PRS.client().then(init).catch(function (e) {
    $('notcfg').hidden = false; $('notcfg').textContent = 'Could not connect to Supabase: ' + nice(e);
  });

  async function init(c) {
    sb = c;
    sb.auth.onAuthStateChange(function (ev, session) {
      if (ev === 'PASSWORD_RECOVERY') { view('vAuth'); $('fUp').hidden = true; $('fIn').hidden = true; $('fReset').hidden = false; say('msg', ''); return; }
      if (ev === 'SIGNED_OUT') { user = null; view('vAuth'); }
    });
    var r = await sb.auth.getSession(); if (r.error) throw r.error;
    if (r.data && r.data.session && $('fReset').hidden) await showMe(r.data.session.user); else if (!r.data.session) view('vAuth');
  }

  /* ---------- create account ---------- */
  $('fUp').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target; clearErrs(f); say('msg', '');
    if (f.website.value) { say('msg', 'Thank you. Please check your email to confirm your account.', 'ok'); return; } // bot trap
    var name = f.fn.value.trim(), email = f.em.value.trim().toLowerCase(), phone = f.ph.value.trim(), pw = f.pw.value, pw2 = f.pw2.value, bad = null;
    function fail(n, t) { fieldErr(f, n, t); bad = bad || n; }
    if (name.length < 2) fail('fn', 'Please enter your full name.');
    if (!EMAIL.test(email)) fail('em', 'Please enter a valid email address.');
    if (phone && !PHONE.test(phone)) fail('ph', 'Please enter a valid phone number, or leave it empty.');
    if (pw.length < 8) fail('pw', 'Use at least 8 characters.');
    if (pw2 !== pw) fail('pw2', 'The two passwords do not match.');
    if (bad) { f.elements[bad].focus(); return; }
    busy(f, true, 'Creating account…');
    try {
      var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { full_name: name, phone: phone }, emailRedirectTo: location.origin + location.pathname } });
      if (r.error) throw r.error;
      if (r.data.user && r.data.user.identities && r.data.user.identities.length === 0) {
        tab(false); $('fIn').em.value = email; say('msg', 'This email already has an account. Please sign in instead.', 'bad'); return;
      }
      f.reset();
      if (r.data.session) { await showMe(r.data.session.user); }
      else say('msg', 'Almost done! We sent a confirmation link to ' + email + '. Open it to activate your account, then sign in.', 'ok');
    } catch (err) { say('msg', nice(err), 'bad'); }
    finally { busy(f, false); }
  });

  /* ---------- sign in ---------- */
  $('fIn').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target; clearErrs(f); say('msg', '');
    var email = f.em.value.trim().toLowerCase(), pw = f.pw.value, bad = null;
    if (!EMAIL.test(email)) { fieldErr(f, 'em', 'Please enter a valid email address.'); bad = 'em'; }
    if (!pw) { fieldErr(f, 'pw', 'Please enter your password.'); bad = bad || 'pw'; }
    if (bad) { f.elements[bad].focus(); return; }
    busy(f, true, 'Signing in…');
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) throw r.error;
      f.reset(); await showMe(r.data.user || (r.data.session && r.data.session.user));
    } catch (err) { say('msg', nice(err), 'bad'); }
    finally { busy(f, false); }
  });

  $('forgot').addEventListener('click', async function () {
    var email = $('fIn').em.value.trim().toLowerCase(); say('msg', '');
    if (!EMAIL.test(email)) { fieldErr($('fIn'), 'em', 'Type your email above first, then press "Forgot your password?".'); $('fIn').em.focus(); return; }
    try {
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (r.error) throw r.error;
      say('msg', 'If that email has an account, we sent a link to reset the password.', 'ok');
    } catch (err) { say('msg', nice(err), 'bad'); }
  });

  $('fReset').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target; clearErrs(f);
    if (f.pw.value.length < 8) { fieldErr(f, 'pw', 'Use at least 8 characters.'); f.pw.focus(); return; }
    busy(f, true, 'Saving…');
    try {
      var r = await sb.auth.updateUser({ password: f.pw.value });
      if (r.error) throw r.error;
      f.reset(); $('fReset').hidden = true; say('msg', 'Password updated.', 'ok');
      var s = await sb.auth.getSession(); if (s.data.session) await showMe(s.data.session.user);
    } catch (err) { say('msg', nice(err), 'bad'); }
    finally { busy(f, false); }
  });

  /* ---------- signed-in view ---------- */
  async function showMe(u) {
    user = u; view('vMe'); say('meMsg', '');
    $('meEmail').textContent = u.email || '';
    var p = await sb.from('profiles').select('full_name,phone,email').eq('id', u.id).maybeSingle();
    var errors = [];
    if (p.error) errors.push('Could not load your profile: ' + nice(p.error));
    var prof = (p.data) || {};
    $('hi').textContent = 'Hello, ' + ((prof.full_name || (u.user_metadata && u.user_metadata.full_name) || 'there').split(' ')[0]);
    $('fMe').fn.value = prof.full_name || (u.user_metadata && u.user_metadata.full_name) || '';
    $('fMe').ph.value = prof.phone || '';
    var o = await sb.rpc('is_owner');
    $('adminBox').hidden = !(o && !o.error && o.data === true);
    if (o.error) errors.push('Could not verify administrator access: ' + nice(o.error));
    if (errors.length) say('meMsg', errors.join(' '), 'bad');
    await loadSaved();
  }

  $('fMe').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target; clearErrs(f); say('meMsg', '');
    var name = f.fn.value.trim(), phone = f.ph.value.trim(), bad = null;
    if (name.length < 2) { fieldErr(f, 'fn', 'Please enter your full name.'); bad = 'fn'; }
    if (phone && !PHONE.test(phone)) { fieldErr(f, 'ph', 'Please enter a valid phone number, or leave it empty.'); bad = bad || 'ph'; }
    if (bad) { f.elements[bad].focus(); return; }
    busy(f, true, 'Saving…');
    try {
      var r = await sb.from('profiles').update({ full_name: name, phone: phone || null }).eq('id', user.id);
      if (r.error) throw r.error;
      say('meMsg', 'Details saved.', 'ok'); $('hi').textContent = 'Hello, ' + name.split(' ')[0];
    } catch (err) { say('meMsg', nice(err), 'bad'); }
    finally { busy(f, false); }
  });

  async function loadSaved() {
    var ul = $('saved'); ul.innerHTML = '';
    var r = await sb.from('saved_properties').select('property_id').eq('user_id', user.id);
    if (r.error) { say('meMsg', 'Could not load saved properties: ' + nice(r.error), 'bad'); return; }
    var ids = (r.data || []).map(function (x) { return x.property_id; });
    $('noSaved').hidden = ids.length > 0; if (!ids.length) return;
    var p = await sb.from('properties').select('id,title,price_label,location_detail').in('id', ids);
    if (p.error) { say('meMsg', 'Could not load saved property details: ' + nice(p.error), 'bad'); return; }
    (p.data || []).forEach(function (x) {
      var li = document.createElement('li');
      li.innerHTML = '<span><b>' + esc(x.title) + '</b><br><small>' + esc(x.price_label || '') + ' · ' + esc(x.location_detail || '') + '</small></span><button class="lk" type="button" data-id="' + esc(x.id) + '">Remove</button>';
      ul.appendChild(li);
    });
  }
  $('saved').addEventListener('click', async function (e) {
    var b = e.target.closest('button[data-id]'); if (!b) return;
    b.disabled = true;
    var r = await sb.from('saved_properties').delete().eq('user_id', user.id).eq('property_id', b.dataset.id);
    if (!r.error) {
      try { var s = JSON.parse(localStorage.getItem('saved') || '[]').filter(function (k) { return k !== b.dataset.id; }); localStorage.setItem('saved', JSON.stringify(s)); } catch (x) {}
      loadSaved();
    } else { b.disabled = false; say('meMsg', 'Could not remove saved property: ' + nice(r.error), 'bad'); }
  });

  $('out').addEventListener('click', async function () {
    try {
      var r = await sb.auth.signOut(); if (r.error) throw r.error;
      user = null; view('vAuth'); tab(false); say('msg', 'You have signed out.', 'ok');
    } catch (err) { say('meMsg', nice(err), 'bad'); }
  });
})();
