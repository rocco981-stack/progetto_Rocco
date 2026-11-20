/* BeCity – caricamento del modulo BIM (ES module, richiede il server locale) */
'use strict';
(function () {
  let mod = null;
  App.register('bim', {
    guest: false, needProject: true,
    mount(view, args) {
      view.innerHTML = '<div class="empty" style="padding-top:120px">Caricamento del modulo BIM…</div>';
      const route = location.hash;
      App.loadBIM().then(m => { mod = m; if (location.hash !== route) return; view.innerHTML = ''; m.mount(view, args); App.applyI18n(); })
        .catch(e => { console.error(e); view.innerHTML = `<div class="empty" style="max-width:640px;margin:60px auto"><h3>Impossibile caricare il modulo BIM</h3><p class="small">${App.esc(e.message)}</p><p class="small muted">Verifica di aver estratto <b>tutto</b> il contenuto dello ZIP nella stessa cartella e che l'antivirus non abbia bloccato o messo in quarantena file della cartella <span class="mono">app/js</span> (in quel caso ripristinali o aggiungi la cartella di BeCity alle esclusioni).</p><button class="btn" onclick="location.reload()">Riprova</button></div>`; if (App.store && App.store.mode === 'disk') fetch('api/log', { method: 'POST', body: 'BIM: ' + e.message }).catch(() => { }); });
    },
    unmount() { if (mod) mod.unmount(); }
  });
})();
