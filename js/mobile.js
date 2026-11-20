/* BeCity – strato mobile (smartphone e tablet): gesti touch, barra delle applicazioni, pannelli a scomparsa,
   installazione come app (PWA) e funzionamento offline. Si attiva solo su schermi piccoli o con input touch. */
'use strict';
(function () {
  const M = App.mobile = {};
  const mq = window.matchMedia('(max-width: 820px)');
  M.small = () => mq.matches;
  const touchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const syncClass = () => { document.documentElement.classList.toggle('m-small', mq.matches); document.documentElement.classList.toggle('m-touch', touchDevice); };
  syncClass(); mq.addEventListener ? mq.addEventListener('change', () => { syncClass(); M.refresh(); }) : mq.addListener(() => { syncClass(); M.refresh(); });

  /* ---------- gesti touch per le aree di disegno CAD e GIS (il BIM usa già i pointer events) ---------- */
  const fire = (el, type, t, extra = {}) => el.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, view: window, clientX: t.clientX, clientY: t.clientY, button: 0, buttons: 0 }, extra)));
  const wheel = (el, x, y, dy) => el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY: dy, deltaMode: 0 }));
  M.attachTouch = cv => {
    if (!cv || cv.dataset.touch) return; cv.dataset.touch = '1'; cv.style.touchAction = 'none';
    let st = null, pinch = null, lastTap = 0;
    cv.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 2) { if (st && st.pan) fire(cv, 'mouseup', st.last, { button: 1 }); st = null; const [a, b] = e.touches; pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) }; return; }
      const t = e.touches[0]; st = { x: t.clientX, y: t.clientY, t: Date.now(), pan: false, last: t };
      fire(cv, 'mousemove', t);
    }, { passive: false });
    cv.addEventListener('touchmove', e => {
      e.preventDefault();
      if (pinch && e.touches.length === 2) { const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); const k = d / pinch.d; if (Math.abs(k - 1) > 0.04) { wheel(cv, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, k > 1 ? -120 : 120); pinch.d = d; } return; }
      if (!st) return; const t = e.touches[0]; st.last = t;
      if (!st.pan && Math.hypot(t.clientX - st.x, t.clientY - st.y) > 8) { st.pan = true; fire(cv, 'mousedown', { clientX: st.x, clientY: st.y }, { button: 1, buttons: 4 }); }
      if (st.pan) { fire(cv, 'mousemove', t, { buttons: 4 }); window.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY, buttons: 4 })); } else fire(cv, 'mousemove', t);
    }, { passive: false });
    cv.addEventListener('touchend', e => {
      e.preventDefault();
      if (pinch) { if (e.touches.length < 2) pinch = null; return; }
      if (!st) return; const t = st.last;
      if (st.pan) { fire(cv, 'mouseup', t, { button: 1 }); window.dispatchEvent(new MouseEvent('mouseup', { clientX: t.clientX, clientY: t.clientY, button: 1 })); }
      else if (Date.now() - st.t < 600) {
        fire(cv, 'mousedown', t, { buttons: 1 }); fire(cv, 'mouseup', t); window.dispatchEvent(new MouseEvent('mouseup', { clientX: t.clientX, clientY: t.clientY, button: 0 })); fire(cv, 'click', t);
        const now = Date.now(); if (now - lastTap < 350) fire(cv, 'dblclick', t, { detail: 2 }); lastTap = now;
      }
      st = null;
    }, { passive: false });
  };

  /* ---------- barra delle applicazioni in basso ---------- */
  const TABS = [['home', 'home', 'Home'], ['cad', 'cad', 'CAD'], ['gis', 'gis', 'GIS'], ['bim', 'bim', 'BIM'], ['acc', 'acc', 'Contabilità'], ['more', 'menu', 'Altro']];
  const tabbar = () => {
    let bar = document.getElementById('mTabs'); if (bar) return bar;
    bar = document.createElement('nav'); bar.id = 'mTabs'; bar.className = 'm-tabs'; bar.setAttribute('aria-label', 'Applicazioni');
    bar.innerHTML = TABS.map(([k, ic, l]) => `<button data-mt="${k}">${App.icon(ic === 'menu' ? 'layers' : ic, 21)}<span>${l}</span></button>`).join('');
    document.body.appendChild(bar);
    bar.addEventListener('click', e => { const b = e.target.closest('[data-mt]'); if (!b) return; if (b.dataset.mt === 'more') return M.moreSheet(); location.hash = '#/' + (b.dataset.mt === 'home' ? 'home' : b.dataset.mt); });
    return bar;
  };
  M.moreSheet = () => {
    const items = [['present', 'present', 'Presentazione'], ['norm', 'norm', 'Normativa'], ['projects', 'folder', 'Progetti'], ['admin', 'settings', 'Impostazioni e backup'], ['support', 'info', 'Guida']];
    App.modal({ title: 'Altre applicazioni', body: `<div class="m-more">${items.map(([k, ic, l]) => `<button class="m-more-it" data-go="${k}">${App.MODS.some(m => m.id === k) ? App.appIcon(k, 40) : `<span class="m-more-ic">${App.icon(ic, 22)}</span>`}<span>${l}</span></button>`).join('')}</div>${M.installHTML()}`, actions: [],
      onOpen: (back, close) => { back.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { close(); location.hash = '#/' + b.dataset.go; }); const ib = back.querySelector('#mInstall'); if (ib) ib.onclick = () => { close(); M.install(); }; } });
  };

  /* ---------- pannelli laterali come schede che salgono dal basso ---------- */
  const panelName = a => { const h = a.querySelector('header > span:first-child, .rvt-pal > header > span, header, .dock-title'); const t = a.querySelector('.side-tabs button.active, .side-tabs button, .rvt-ptabs button.active'); return ((h && h.textContent) || (t && t.textContent) || 'Pannello').trim().replace(/\s+/g, ' ').replace(/✕/g, '').slice(0, 22); };
  M.panels = () => {
    document.querySelectorAll('.m-chips').forEach(x => x.remove());
    if (!M.small()) { document.querySelectorAll('.m-open').forEach(x => x.classList.remove('m-open')); return; }
    const asides = [...document.querySelectorAll('#view .cad-wrap > aside')]; if (!asides.length) return;
    const bar = document.createElement('div'); bar.className = 'm-chips';
    asides.forEach((a, i) => { a.classList.add('m-sheet'); if (!a.querySelector('.m-close')) { const c = document.createElement('button'); c.className = 'm-close'; c.setAttribute('aria-label', 'Chiudi pannello'); c.textContent = '✕'; c.onclick = () => { a.classList.remove('m-open'); M.chips(); }; a.prepend(c); } const b = document.createElement('button'); b.dataset.i = i; b.textContent = panelName(a); b.onclick = () => { const open = !a.classList.contains('m-open'); asides.forEach(x => x.classList.remove('m-open')); a.classList.toggle('m-open', open); M.chips(); }; bar.appendChild(b); });
    document.body.appendChild(bar); M.chips();
  };
  M.chips = () => { const asides = [...document.querySelectorAll('#view .cad-wrap > aside')]; document.body.classList.toggle('m-sheet-open', asides.some(x => x.classList.contains('m-open'))); document.querySelectorAll('.m-chips button').forEach(b => b.classList.toggle('on', !!(asides[+b.dataset.i] && asides[+b.dataset.i].classList.contains('m-open')))); };

  M.refresh = () => {
    const bar = tabbar(); const r = (location.hash.replace(/^#\/?/, '') || 'home').split('/')[0];
    bar.querySelectorAll('[data-mt]').forEach(b => b.classList.toggle('on', b.dataset.mt === r || (b.dataset.mt === 'more' && ['present', 'norm', 'projects', 'admin', 'support', 'resources'].includes(r))));
    const bn = document.getElementById('mBanner'); if (bn && r !== 'home') bn.remove(); else if (!bn && r === 'home') setTimeout(M.banner, 1200);
    setTimeout(() => { M.panels(); ['cadCv', 'gisCv'].forEach(id => M.attachTouch(document.getElementById(id))); }, 60);
  };
  const route0 = App.route; App.route = function () { const r = route0.apply(this, arguments); try { M.refresh(); } catch (e) { console.error(e); } return r; };

  /* ---------- installazione come app e funzionamento offline ---------- */
  let deferred = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; M.banner(); });
  window.addEventListener('appinstalled', () => { deferred = null; const b = document.getElementById('mBanner'); if (b) b.remove(); App.toast('BeCity è stata installata: la trovi tra le app del telefono', 'ok'); });
  M.canInstall = () => !standalone() && (!!deferred || ios);
  M.installHTML = () => M.canInstall() ? `<button class="btn primary" id="mInstall" style="width:100%;margin-top:14px">${App.icon('download', 16)} Installa BeCity sul telefono</button>` : (standalone() ? '<p class="tiny muted" style="margin-top:14px">BeCity è installata come app su questo dispositivo.</p>' : '');
  M.install = async () => {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; const b = document.getElementById('mBanner'); if (b && r && r.outcome === 'accepted') b.remove(); return; }
    App.modal({ title: 'Installa BeCity', body: ios ? `<ol class="m-steps"><li>Apri questa pagina con <b>Safari</b>.</li><li>Tocca il pulsante <b>Condividi</b> (il quadrato con la freccia verso l'alto).</li><li>Scegli <b>Aggiungi alla schermata Home</b> e poi <b>Aggiungi</b>.</li></ol><p class="small muted">BeCity comparirà sulla schermata Home con la sua icona e si aprirà a schermo intero, anche senza connessione.</p>` : `<ol class="m-steps"><li>Apri questa pagina con <b>Chrome</b>.</li><li>Tocca il menu <b>⋮</b> in alto a destra.</li><li>Scegli <b>Installa app</b> (oppure <b>Aggiungi a schermata Home</b>).</li></ol>`, actions: [{ label: 'Ho capito', primary: true, value: null }] });
  };
  M.banner = () => {
    if (!M.canInstall() || document.getElementById('mBanner') || !/^#?\/?(home)?$/.test(location.hash.replace(/^#\/?/, '') ? '/' + location.hash.replace(/^#\/?/, '') : '')) return; try { if (localStorage.getItem('becity.noInstallBanner')) return; } catch (e) { }
    const b = document.createElement('div'); b.id = 'mBanner'; b.className = 'm-banner';
    b.innerHTML = `<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true"><rect width="48" height="48" rx="10" fill="#0a6cff"/><path d="M11 37V21h7v16M20.5 37V11h7v26M30 37V17h7v20" fill="#fff"/></svg><div><b>Installa BeCity</b><span>Apri l'app dalla schermata Home, anche offline</span></div><button class="btn sm primary" data-i>Installa</button><button class="m-x" aria-label="Chiudi" data-x>✕</button>`;
    b.querySelector('[data-i]').onclick = M.install; b.querySelector('[data-x]').onclick = () => { b.remove(); try { localStorage.setItem('becity.noInstallBanner', '1'); } catch (e) { } };
    document.body.appendChild(b);
  };
  M.registerSW = () => {
    if (!window.BECITY_PWA || !('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) App.toast('È disponibile una nuova versione di BeCity: chiudi e riapri l\'app per aggiornarla', 'info'); if (w.state === 'activated' && !navigator.serviceWorker.controller) App.toast('BeCity è pronta per l\'uso anche senza connessione', 'ok'); }); });
    }).catch(e => console.warn('service worker', e));
  };
  App.on && App.on('started', () => { M.refresh(); M.registerSW(); setTimeout(M.banner, 2500); });
})();
