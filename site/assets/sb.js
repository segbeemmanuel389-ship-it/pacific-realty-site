/* Shared Supabase loader for every page. Uses only PUBLIC settings from config.js. */
(function () {
  var cfg = window.PRS_CONFIG || {};
  var PRS = (window.PRS = window.PRS || {});
  PRS.cfg = cfg;
  PRS.configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  function make() {
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  PRS.client = function () {
    if (PRS._p) return PRS._p;
    PRS._p = new Promise(function (resolve, reject) {
      if (!PRS.configured) return reject(new Error('not-configured'));
      if (window.supabase && window.supabase.createClient) return resolve(make());
      var s = document.createElement('script');
      s.src = LIB;
      s.onload = function () { try { resolve(make()); } catch (e) { reject(e); } };
      s.onerror = function () { reject(new Error('Could not load the Supabase library. Check your internet connection.')); };
      document.head.appendChild(s);
    });
    return PRS._p;
  };
})();
