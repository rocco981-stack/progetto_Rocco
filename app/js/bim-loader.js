/* BeCity – caricamento del modulo BIM (ES module, richiede il server locale) */
'use strict';
(function () {
  let mod = null;
  App.register('bim', {
    guest: false, needProject: true,
    mount(view, args) {
      if (!location.protocol.startsWith('http')) { const body = App.modShell(view, { id: 'bim', title: App.t('m.bim'), sub: 'Modellazione BIM' }); body.innerHTML = '<div class="empty" style="padding-top:80px"><h3>Avvia la piattaforma con il server locale</h3><p>Il modulo BIM usa componenti WebAssembly (OpenCascade, web-ifc, Manifold) che il browser carica solo da <b>http://localhost</b>.<br>Avvia <span class="kbd">avvia.bat</span> (Windows) o <span class="kbd">avvia.sh</span> (macOS/Linux).</p></div>'; return; }
      view.innerHTML = '<div class="empty" style="padding-top:120px">Caricamento del modulo BIM…</div>';
      const route = location.hash;
      import('./bim/bim.js').then(m => { mod = m; if (location.hash !== route) return; view.innerHTML = ''; m.mount(view, args); App.applyI18n(); })
        .catch(e => { console.error(e); view.innerHTML = `<div class="empty">Impossibile caricare il modulo BIM: ${App.esc(e.message)}</div>`; });
    },
    unmount() { if (mod) mod.unmount(); }
  });
})();
