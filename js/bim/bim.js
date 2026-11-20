/* BeCity BIM – modellatore 3D: semplicità di uno sketch (disegna, push/pull, misure digitate)
   con struttura BIM (livelli, categorie IFC, proprietà, abachi, IFC4). Basato su three.js (MIT). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import * as M from './model.js';
import * as K from './kernels.js';

const App = window.App, $ = App.$, $$ = App.$$, esc = App.esc, G = App.geom;
let S = null;

const TOOLS = [
  ['select', 'select', 'Seleziona (Spazio)'], ['orbit', 'rotate', 'Orbita (anche tasto centrale)'], ['pan', 'hand', 'Pan (anche tasto destro)'], '-',
  ['rect', 'rect', 'Rettangolo → massa (R)'], ['pushpull', 'upload', 'Spingi/Tira (P)'], ['move', 'move', 'Sposta (M, Ctrl = copia)'], ['rotate', 'undo', 'Ruota (Q)'], ['tape', 'ruler', 'Metro (T)'], ['erase', 'erase', 'Gomma (E)'], '-',
  ['wall', 'wall', 'Muro (W)'], ['cwall', 'arc', 'Muro curvo NURBS'], ['slab', 'layers', 'Solaio (S)'], ['column', 'point', 'Pilastro (C)'], ['beam', 'line', 'Trave (B)'], ['roof', 'building', 'Copertura (O)'],
  ['door', 'door', 'Porta (D)'], ['window', 'window', 'Finestra (N)'], ['stair', 'measure', 'Scala (K)'], ['space', 'room', 'Spazio (A)'], '-', ['brep', 'cube', 'Solido B-rep (OpenCascade)'], ['csg', 'box3d', 'Booleane su masse (Manifold)']
];
const RTB = (t, ic, label, tip) => `<button class="rbtn" data-tool="${t}" title="${App.esc(tip || label)}">${App.icon(ic, 26)}<span>${label}</span></button>`;
const RTS = (t, ic, label, tip) => `<button class="rbtn-s" data-tool="${t}" title="${App.esc(tip || label)}">${App.icon(ic, 16)}${label}</button>`;
const RAB = (a, ic, label) => `<button class="rbtn" data-act="${a}" title="${label}">${App.icon(ic, 26)}<span>${label}</span></button>`;
const RAS = (a, ic, label) => `<button class="rbtn-s" data-act="${a}" title="${label}">${App.icon(ic, 16)}${label}</button>`;
const RG = (title, items) => `<div class="rgroup"><div class="rgroup-items">${items}</div><div class="rgroup-title">${title}</div></div>`;
const BRIBBON = {
  arch: () => RG('Costruisci', RTB('wall', 'wall', 'Muro', 'Muro (W)') + RTB('door', 'door', 'Porta', 'Porta (D)') + RTB('window', 'window', 'Finestra', 'Finestra (N)') + RTB('column', 'point', 'Pilastro', 'Pilastro (C)') + RTB('roof', 'building', 'Copertura', 'Copertura (O)') + RTB('slab', 'layers', 'Solaio', 'Solaio (S)') + `<div class="rcol">${RTS('curtain', 'curtain', 'Facciata continua')}${RTS('cwall', 'arc', 'Muro curvo NURBS')}${RTS('rail', 'rail', 'Ringhiera')}</div>`)
    + RG('Circolazione', RTB('stair', 'measure', 'Scala', 'Scala (K)'))
    + RG('Locali', RTB('space', 'room', 'Locale', 'Locale / spazio (A)') + `<div class="rcol">${RAS('fromPlan', 'room', 'Dalla pianta CAD')}${RAS('spacesTgl', 'eye', 'Mostra locali')}</div>`)
    + RG('Riferimento', RTB('grid', 'grid', 'Griglia', 'Assi strutturali') + RAB('levelsDlg', 'layers', 'Livelli')),
  struct: () => RG('Struttura', RTB('column', 'point', 'Pilastro') + RTB('beam', 'line', 'Trave', 'Trave (B)') + RTB('slab', 'layers', 'Solaio strutturale') + RTB('wall', 'wall', 'Muro portante')) + RG('Riferimento', RTB('grid', 'grid', 'Griglia')),
  mass: () => RG('Massa concettuale', RTB('rect', 'rect', 'Rettangolo', 'Rettangolo → massa (R)') + RTB('pushpull', 'upload', 'Spingi/Tira', 'Spingi/Tira (P)')) + RG('Solidi', RTB('brep', 'cube', 'Solido B-rep', 'OpenCascade') + RTB('csg', 'box3d', 'Booleane', 'Manifold')),
  modify: () => RG('Seleziona', RTB('select', 'select', 'Seleziona', 'Seleziona (Spazio)')) + RG('Modifica', `<div class="rcol">${RTS('move', 'move', 'Sposta (M)')}${RTS('rotate', 'rotate', 'Ruota (Q)')}${RTS('erase', 'erase', 'Elimina (E)')}</div><div class="rcol">${RTS('tape', 'ruler', 'Misura (T)')}${RAS('dup', 'copy', 'Copia selezione')}${RAS('levelCopy', 'layers', 'Copia su livello')}</div>`) + RG('Cronologia', RAB('undo', 'undo', 'Annulla') + RAB('redo', 'redo', 'Ripeti')),
  view: () => RG('Viste', RAB('v_persp', 'cube', '3D') + RAB('v_iso', 'box3d', 'Assonom.') + RAB('v_plan', 'grid', 'Pianta') + `<div class="rcol">${RAS('v_N', 'arrow', 'Prospetto Nord')}${RAS('v_S', 'arrow', 'Prospetto Sud')}</div><div class="rcol">${RAS('v_E', 'arrow', 'Prospetto Est')}${RAS('v_W', 'arrow', 'Prospetto Ovest')}</div>`)
    + RG('Grafica', `<div class="rcol">${RAS('st_shaded', 'cube', 'Ombreggiato')}${RAS('st_xray', 'eye', 'Raggi X')}${RAS('st_wire', 'grid', 'Fil di ferro')}</div>`) + RG('Sezione', RAB('sec', 'measure', 'Sezione dinamica')) + RG('Navigazione', RAB('zoom', 'zoom', 'Zoom tutto') + RTB('orbit', 'rotate', 'Orbita') + RTB('pan', 'hand', 'Pan')),
  manage: () => RG('Impostazioni', RAB('typesDlg', 'settings', 'Tipi') + RAB('levelsDlg', 'layers', 'Livelli')) + RG('Genera', RAB('fromPlan', 'room', 'Modello dalla pianta')),
  analyze: () => RG('Quantità', RAB('schedules', 'table', 'Abachi') + RAB('computo', 'acc', 'Computo metrico')) + RG('Verifica', RAB('norm', 'norm', 'Conformità')),
  output: () => RG('Esporta', RAB('ifc', 'bim', 'IFC4') + RAB('exch', 'download', 'glTF / OBJ / STEP') + RAB('png', 'image', 'Immagine')) + RG('Presentazione', RAB('present', 'present', 'Tavole e render'))
};
BRIBBON.ctx = () => RG('Seleziona', RTB('select', 'select', 'Modifica', 'Seleziona (Spazio)')) + RG('Proprietà', RAB('typesDlg', 'settings', 'Proprietà del tipo')) + RG('Modifica', `<div class="rcol">${RTS('move', 'move', 'Sposta (M)')}${RTS('rotate', 'rotate', 'Ruota (Q)')}${RAS('dup', 'copy', 'Copia')}</div><div class="rcol">${RTS('erase', 'erase', 'Elimina (E)')}${RAS('levelCopy', 'layers', 'Copia su livello')}${RTS('tape', 'ruler', 'Misura (T)')}</div>`) + RG('Vista', `<div class="rcol">${RAS('zoom', 'zoom', 'Zoom tutto')}${RAS('sec', 'measure', 'Sezione')}</div>`) + RG('Misura', RTB('tape', 'ruler', 'Misura'));
const BTABS = [['arch', 'Architettura'], ['struct', 'Struttura'], ['mass', 'Massa e solidi'], ['modify', 'Modifica'], ['view', 'Vista'], ['manage', 'Gestisci'], ['analyze', 'Analizza'], ['output', 'Esporta']];
/* tipi predefiniti (selettore del tipo) */
const FAMILY = {
  wall: [['Muro esterno – Laterizio 30', { thk: .3, material: 'Laterizio', external: true }], ['Muro esterno – Blocco cls + cappotto 40', { thk: .4, material: 'Blocchi cls', external: true }], ['Muro in c.a. 25', { thk: .25, material: 'Calcestruzzo armato', external: true }], ['Tramezzo – Laterizio 10', { thk: .1, material: 'Laterizio', external: false }], ['Tramezzo – Cartongesso 12,5', { thk: .125, material: 'Cartongesso', external: false }], ['Muro in legno X-lam 20', { thk: .2, material: 'Legno X-lam', external: true }]],
  slab: [['Solaio laterocemento 30', { thk: .3, material: 'Calcestruzzo armato' }], ['Soletta c.a. 20', { thk: .2, material: 'Calcestruzzo armato' }], ['Solaio legno 25', { thk: .25, material: 'Legno' }]],
  column: [['Pilastro c.a. 30×30', { w: .3, d: .3, shape: 'rect', material: 'Calcestruzzo armato' }], ['Pilastro c.a. 40×40', { w: .4, d: .4, shape: 'rect', material: 'Calcestruzzo armato' }], ['Pilastro circolare Ø40', { w: .4, d: .4, shape: 'round', material: 'Calcestruzzo armato' }], ['Pilastro acciaio HEB 200', { w: .2, d: .2, shape: 'rect', material: 'Acciaio' }]],
  beam: [['Trave c.a. 30×50', { w: .3, hb: .5, material: 'Calcestruzzo armato' }], ['Trave c.a. 40×60', { w: .4, hb: .6, material: 'Calcestruzzo armato' }], ['Trave legno 20×30', { w: .2, hb: .3, material: 'Legno' }]],
  roof: [['Copertura a due falde 30°', { kind: 'gable', slope: 30, thk: .25, overhang: .4, material: 'Tegole in cotto' }], ['Copertura a una falda 15°', { kind: 'mono', slope: 15, thk: .25, overhang: .3, material: 'Lamiera' }], ['Copertura piana', { kind: 'flat', slope: 0, thk: .35, overhang: .2, material: 'Calcestruzzo armato' }]],
  door: [['Porta 80×210', { width: .8, height: 2.1 }], ['Porta 90×210', { width: .9, height: 2.1 }], ['Porta ingresso 100×220', { width: 1, height: 2.2 }], ['Porta doppia 140×220', { width: 1.4, height: 2.2 }]],
  window: [['Finestra 60×60', { width: .6, height: .6, sill: 1.5 }], ['Finestra 120×140', { width: 1.2, height: 1.4, sill: .9 }], ['Finestra 160×140', { width: 1.6, height: 1.4, sill: .9 }], ['Portafinestra 120×240', { width: 1.2, height: 2.4, sill: 0 }]],
  curtain: [['Facciata montanti 1,50 × traversi 1,20', { gu: 1.5, gv: 1.2, mul: .06 }], ['Facciata montanti 1,20 × traversi 3,00', { gu: 1.2, gv: 3, mul: .08 }]],
  rail: [['Ringhiera h 1,00', { h: 1, step: 1 }], ['Ringhiera h 1,10', { h: 1.1, step: .8 }]],
  stair: [['Scala rampa 110 – pedata 28', { width: 1.1, run: .28, material: 'Calcestruzzo' }], ['Scala rampa 90 – pedata 30', { width: .9, run: .3, material: 'Legno' }]]
};
const KEYS = { ' ': 'select', r: 'rect', p: 'pushpull', m: 'move', q: 'rotate', t: 'tape', e: 'erase', w: 'wall', s: 'slab', c: 'column', b: 'beam', o: 'roof', d: 'door', n: 'window', k: 'stair', a: 'space' };
const HINT = { select: 'Clic per selezionare · Shift per aggiungere · Doppio clic per zoom sull\'elemento', orbit: 'Trascina per orbitare', pan: 'Trascina per spostare la vista', rect: 'Clic sul primo angolo, poi sul secondo (o digita L;P). Poi spingi/tira per dare altezza', pushpull: 'Clic su una faccia di massa, muro o solaio e trascina (o digita la distanza)', move: 'Seleziona, clic sul punto base e sul punto di arrivo (Ctrl: copia)', rotate: 'Seleziona, clic sul centro, poi digita l\'angolo o clic sulla direzione', tape: 'Clic su due punti per misurare', erase: 'Clic sugli elementi da eliminare', wall: 'Clic sui punti dell\'asse del muro · Esc per terminare · digita la lunghezza', cwall: 'Clic su inizio, fine e un punto di passaggio dell\'arco', slab: 'Disegna il contorno (rettangolo o poligono) del solaio', column: 'Clic per posizionare il pilastro', beam: 'Clic su inizio e fine della trave', roof: 'Clic su un solaio, massa o spazio per coprirlo, oppure disegna il contorno', door: 'Clic su un muro per inserire la porta', window: 'Clic su un muro per inserire la finestra', stair: 'Clic sul punto di partenza e sulla direzione di salita', space: 'Disegna il contorno dello spazio (rettangolo o poligono)', brep: 'Primitive e operazioni B-rep con OpenCascade', csg: 'Seleziona due masse e scegli l\'operazione', curtain: 'Clic su inizio e fine della facciata continua', rail: 'Clic su inizio e fine della ringhiera', grid: 'Clic su inizio e fine dell\'asse strutturale (etichetta automatica A, B… / 1, 2…)' };

export function mount(view, args) {
  const p = App.project(); if (!p.bim) p.bim = M.newBIM();
  const tab = args[0] || 'model';
  const body = App.modShell(view, { id: 'bim', title: 'BeCity BIM', sub: 'Modellazione dell\'edificio · livelli, tipi, IFC', tabs: [{ id: 'model', label: 'Modello 3D' }, { id: 'schedules', label: 'Abachi e quantità' }, { id: 'exchange', label: 'IFC e scambio' }], activeTab: tab, onTab: t => location.hash = '#/bim/' + t });
  if (tab === 'schedules') return schedules(body, p);
  if (tab === 'exchange') return exchange(body, p);
  model(body, p);
}
export function unmount() { if (!S) return; cancelAnimationFrame(S.raf); S.ro.disconnect(); S.renderer.dispose(); window.removeEventListener('keydown', S.kh); window.removeEventListener('pointermove', S.pm); window.removeEventListener('pointerup', S.pu); S = null; App.saveNow(); }

/* ======================= MODELLO ======================= */
function model(body, p) {
  const bim = p.bim;
  body.style.flexDirection = 'column';
  const QI = (a, ic, t) => `<button data-q="${a}" title="${t}">${App.icon(ic, 15)}</button>`;
  const VC = (attr, ic, t) => `<button ${attr} title="${t}">${App.icon(ic, 14)}</button>`;
  body.innerHTML = `<div class="rvt">
    <div class="rvt-qat"><button class="rvt-app" id="bApp" title="Menu applicazione">B</button>
      <div class="rvt-qbtns">${QI('open', 'folder', 'Apri progetto')}${QI('save', 'save', 'Salva')}<i></i>${QI('undo', 'undo', 'Annulla')}${QI('redo', 'redo', 'Ripeti')}<i></i>${QI('tape', 'ruler', 'Misura')}${QI('dim', 'measure', 'Quota allineata')}${QI('text', 'text', 'Testo')}<i></i>${QI('v3d', 'cube', 'Vista 3D predefinita')}${QI('sec', 'measure', 'Sezione')}${QI('fit', 'zoom', 'Zoom tutto')}</div>
      <div class="rvt-title" id="bTitle"></div>
      <div class="rvt-info"><label class="rvt-search">${App.icon('search', 13)}<input id="bInfo" placeholder="Digita una parola chiave o una frase" aria-label="InfoCenter"></label>${QI('help', 'info', 'Guida')}</div></div>
    <div class="ribbon" id="bTools"><div class="ribbon-tabs">${BTABS.map(([k, l], i) => `<button data-bt="${k}" class="${i ? '' : 'active'}">${l}</button>`).join('')}<button data-bt="ctx" class="ctx hidden" id="bCtxTab"></button></div><div class="ribbon-body" id="bRb"></div></div>
    <div class="rvt-opt" id="bOpt"></div>
    <div class="cad-wrap">
    <aside class="rvt-left" id="bLeft">
      <section class="rvt-pal" id="bPalProps"><header><span>Proprietà</span><div class="rvt-ptabs"><button data-st2="props" class="active">Elemento</button><button data-st2="tree">Modello</button></div></header><div class="side-body" id="bSide" style="padding:0"></div></section>
      <div class="rvt-split" id="bSplit" title="Trascina per ridimensionare"></div>
      <section class="rvt-pal" id="bPalBr"><header><span id="bBrT">Browser di progetto</span></header><div class="side-body" id="bBrowser" style="padding:0"></div></section>
    </aside>
    <div class="canvas-col"><div class="rvt-doc" id="bDocTabs"></div><div class="canvas-host" id="bimHost" style="background:#f4f6f9">
      <div class="vcube-wrap" id="bCubeW"><button class="vc-home" data-cube="home" title="Vista iniziale">${App.icon('home', 13)}</button><div class="vcube" id="bCube">${[['front', 'FRONTE', 'S'], ['back', 'RETRO', 'N'], ['right', 'DESTRA', 'E'], ['left', 'SINISTRA', 'W'], ['top', 'ALTO', 'plan'], ['bottom', 'BASSO', 'iso']].map(([c, l, v]) => `<div class="vf ${c}" data-cube="${v}">${l}</div>`).join('')}</div><div class="vring" id="bRing"><b style="top:-7px;left:50%">N</b><b style="bottom:-7px;left:50%">S</b><b style="left:-6px;top:50%">O</b><b style="right:-6px;top:50%">E</b></div></div>
      <div class="navbar" id="bNav">${VC('data-nav="orbit"', 'rotate', 'Orbita (SteeringWheel)')}${VC('data-nav="pan"', 'hand', 'Pan')}${VC('data-nav="in"', 'plus', 'Zoom avanti')}${VC('data-nav="out"', 'minus', 'Zoom indietro')}${VC('data-nav="fit"', 'zoom', 'Zoom tutto')}</div>
      <div class="sec-bar hidden" id="bSec"><select id="bSecAx"><option value="x">Taglio X</option><option value="y">Taglio Y</option><option value="z">Taglio quota</option></select><input type="range" id="bSecV" min="0" max="1" step="0.001" value="0.5" style="width:220px"><span class="tiny" id="bSecL"></span></div>
      <div class="dim-label hidden" id="bLabel"></div>
      <div class="vcb"><span>Misure</span><input id="bVcb" autocomplete="off" spellcheck="false" placeholder="—" aria-label="Valore digitato"></div>
    </div>
    <div class="rvt-vcbar" id="bViews"><span class="rvt-scale" id="bScale">1 : 100</span><span class="vsep2"></span>${[['persp', 'cube', 'Vista 3D'], ['iso', 'box3d', 'Assonometria'], ['plan', 'grid', 'Pianta del livello'], ['N', 'arrow', 'Prospetto Nord'], ['S', 'arrow', 'Prospetto Sud'], ['E', 'arrow', 'Prospetto Est'], ['W', 'arrow', 'Prospetto Ovest']].map(([k, ic, t]) => `<button data-v="${k}" title="${t}">${App.icon(ic, 14)}${k.length === 1 ? `<small>${k === 'W' ? 'O' : k}</small>` : ''}</button>`).join('')}<span class="vsep2"></span>${[['shaded', 'cube', 'Stile: ombreggiato'], ['xray', 'eye', 'Stile: raggi X'], ['wire', 'grid', 'Stile: fil di ferro']].map(([k, ic, t]) => `<button data-st="${k}" title="${t}">${App.icon(ic, 14)}</button>`).join('')}<span class="vsep2"></span>${VC('data-x="shadow"', 'sun', 'Ombre')}${VC('data-x="spaces"', 'room', 'Mostra locali')}${VC('data-x="sec"', 'measure', 'Riquadro di sezione')}${VC('data-x="zoom"', 'zoom', 'Zoom tutto')}</div>
    <div class="statusbar"><span class="tiny" id="bHint" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
      <span class="tiny muted">Livello</span><select id="bLevel" style="width:auto;padding:2px 6px;font-size:11px"></select>
      <span class="tiny muted">Forma</span><select id="bShape" style="width:auto;padding:2px 6px;font-size:11px"><option value="rect">Rettangolo</option><option value="poly">Poligono</option></select>
      <span class="rvt-ws">${App.icon('layers', 12)} Modello principale</span>
      <button data-sn="grid" class="on">GRIGLIA</button><button data-sn="ends" class="on">ESTREMI</button><button data-sn="axis" class="on">ASSI</button></div></div>
    </div></div>`;
  const showRb = k => { $('#bRb').innerHTML = BRIBBON[k](); const ct = $('#bCtxTab'); if (ct) ct.classList.toggle('active', k === 'ctx'); $$('#bTools [data-bt]').forEach(b => b.classList.toggle('active', b.dataset.bt === k)); $$('#bTools [data-tool]').forEach(b => b.classList.toggle('active', S && b.dataset.tool === S.tool)); };
  $$('#bTools [data-bt]').forEach(b => b.onclick = () => showRb(b.dataset.bt));
  showRb('arch');

  const host = $('#bimHost');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.localClippingEnabled = true;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none'; renderer.domElement.tabIndex = 0; host.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9eef4');
  const camP = new THREE.PerspectiveCamera(45, 1, .05, 5000); camP.position.set(18, 14, 20);
  const camO = new THREE.OrthographicCamera(-10, 10, 10, -10, -2000, 5000); camO.position.set(20, 20, 20);
  const controls = new OrbitControls(camP, renderer.domElement); controls.enableDamping = false; controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
  const hemi = new THREE.HemisphereLight('#ffffff', '#b9c2cc', 1.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(-30, 50, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; scene.add(sun); scene.add(sun.target);
  const grid = new THREE.GridHelper(200, 200, '#b9c4d2', '#d8dfe8'); grid.material.transparent = true; grid.material.opacity = .6; scene.add(grid);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: .18 })); ground.rotateX(-Math.PI / 2); ground.position.y = -.001; ground.receiveShadow = true; scene.add(ground);
  const axes = new THREE.Group(); [[0xd23c3c, [1, 0, 0]], [0x1f9e5a, [0, 0, -1]], [0x3d6fe0, [0, 1, 0]]].forEach(([c, d]) => { const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...d).multiplyScalar(6)]); axes.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: c }))); }); scene.add(axes);
  const model = new THREE.Group(); scene.add(model); const imports = new THREE.Group(); scene.add(imports);
  const preview = new THREE.Group(); scene.add(preview);
  S = { p, bim, renderer, scene, camP, camO, cam: camP, controls, model, imports, preview, objs: new Map(), sel: new Set(), tool: 'select', undo: [], redo: [], style: 'shaded', snaps: { grid: true, ends: true, axis: true }, showSpaces: true, clip: null, pts: [], drag: null, defaults: Object.assign({ wall: { thk: .3, material: 'Laterizio', external: true }, slab: { thk: .3, material: 'Calcestruzzo armato' }, column: { w: .3, d: .3, shape: 'rect', material: 'Calcestruzzo armato' }, beam: { w: .3, hb: .5, material: 'Calcestruzzo armato' }, roof: { kind: 'gable', slope: 30, thk: .25, overhang: .4, material: 'Tegole in cotto' }, door: { width: .9, height: 2.1 }, window: { width: 1.2, height: 1.4, sill: .9 }, stair: { width: 1.1, run: .28, material: 'Calcestruzzo' }, space: { use: 'Soggiorno' }, mass: { material: 'Massa' }, curtain: { gu: 1.5, gv: 1.2, mul: .06 }, rail: { h: 1, step: 1 } }, bim.defaults || {}) };
  bim.defaults = S.defaults; S.defaults.curtain = S.defaults.curtain || { gu: 1.5, gv: 1.2, mul: .06 }; S.defaults.rail = S.defaults.rail || { h: 1, step: 1 };

  const resize = () => { const r = host.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camP.aspect = r.width / Math.max(1, r.height); camP.updateProjectionMatrix(); const k = camO.userData.k || 15; camO.left = -k * camP.aspect; camO.right = k * camP.aspect; camO.top = k; camO.bottom = -k; camO.updateProjectionMatrix(); render(); };
  S.ro = new ResizeObserver(resize); S.ro.observe(host);
  controls.addEventListener('change', render);
  function render() { if (!S) return; cancelAnimationFrame(S.raf); S.raf = requestAnimationFrame(() => { if (S) { renderer.render(scene, S.cam); updateCube(); } }); }
  S.render = render;

  /* ---------- costruzione oggetti ---------- */
  const matCache = {};
  const matFor = (color, opts = {}) => { const key = color + JSON.stringify(opts) + S.style; if (matCache[key]) return matCache[key]; const m = new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .02, transparent: !!opts.opacity || S.style === 'xray', opacity: opts.opacity ?? (S.style === 'xray' ? .35 : 1), wireframe: S.style === 'wire', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, depthWrite: !(opts.opacity || S.style === 'xray') }); return (matCache[key] = m); };
  const edgeMat = new THREE.LineBasicMaterial({ color: '#2a3243', transparent: true, opacity: .55 });
  const selMat = new THREE.MeshStandardMaterial({ color: '#3d7bff', emissive: '#1a49c9', emissiveIntensity: .35, transparent: true, opacity: .85, side: THREE.DoubleSide });
  function buildObj(e) {
    const old = S.objs.get(e.id); if (old) { model.remove(old); old.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const g = new THREE.Group(); g.userData.id = e.id; const lev = M.levelOf(bim, e.level);
    const hideLevel = bim.onlyActive && e.level !== bim.activeLevel;
    if (!hideLevel && !(e.type === 'space' && !S.showSpaces)) M.buildParts(bim, e).forEach(pt => {
      const mesh = new THREE.Mesh(pt.geom, S.sel.has(e.id) ? selMat : matFor(pt.color, { opacity: pt.opacity })); mesh.userData.id = e.id; mesh.userData.part = pt; mesh.castShadow = !pt.space && !pt.glass; mesh.receiveShadow = true; g.add(mesh);
      if (!pt.space && !pt.glass && S.style !== 'wire') { const eg = new THREE.EdgesGeometry(pt.geom, 25); const ln = new THREE.LineSegments(eg, edgeMat); ln.userData.id = e.id; ln.raycast = () => { }; g.add(ln); }
    });
    void lev; model.add(g); S.objs.set(e.id, g);
  }
  function rebuild(ids) { if (!ids) { S.objs.forEach(o => model.remove(o)); S.objs.clear(); bim.elements.forEach(buildObj); } else { const set = new Set(ids); bim.elements.filter(e => (e.type === 'door' || e.type === 'window') && set.has(e.host)).forEach(e => set.add(e.id)); set.forEach(id => { const e = bim.elements.find(x => x.id === id); if (e) buildObj(e); else { const o = S.objs.get(id); if (o) { model.remove(o); S.objs.delete(id); } } }); } updateShadowBox(); render(); }
  S.rebuild = rebuild;
  function updateShadowBox() { const b = new THREE.Box3().setFromObject(model); if (b.isEmpty()) return; const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).length(); sun.target.position.copy(c); sun.position.copy(c).add(new THREE.Vector3(-.5, 1, .45).normalize().multiplyScalar(s + 20)); const sc = sun.shadow.camera; sc.left = sc.bottom = -s; sc.right = sc.top = s; sc.near = 1; sc.far = s * 3 + 60; sc.updateProjectionMatrix(); }
  function fit() { const b = new THREE.Box3().setFromObject(model); b.union(new THREE.Box3().setFromObject(imports)); if (b.isEmpty()) b.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 4, 10)); const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).length(); const dir = S.cam.position.clone().sub(controls.target).normalize(); controls.target.copy(c); S.cam.position.copy(c).add(dir.multiplyScalar(s * 1.1 + 2)); camO.userData.k = s * .6; resize(); controls.update(); render(); }
  S.fit = fit;

  /* ---------- undo ---------- */
  const snap = () => JSON.stringify({ levels: bim.levels, elements: bim.elements, activeLevel: bim.activeLevel });
  function commit(label, ids) { S.undo.push({ label, data: S.base }); if (S.undo.length > 80) S.undo.shift(); S.redo = []; S.base = snap(); App.touch(p); App.audit('bim', label); rebuild(ids); renderSide(); }
  S.commit = commit; S.base = snap();
  function restore(data) { const o = JSON.parse(data); bim.levels = o.levels; bim.elements = o.elements; bim.activeLevel = o.activeLevel; S.sel.clear(); S.base = snap(); App.touch(p); rebuild(); renderSide(); renderLevels(); }
  const doUndo = () => { const u = S.undo.pop(); if (!u) return App.toast('Niente da annullare'); S.redo.push({ label: u.label, data: snap() }); restore(u.data); App.toast('Annullato: ' + u.label); };
  const doRedo = () => { const r = S.redo.pop(); if (!r) return; S.undo.push({ label: r.label, data: snap() }); restore(r.data); };

  /* ---------- input: raggi, snap ---------- */
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  const setNdc = ev => { const r = renderer.domElement.getBoundingClientRect(); ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, S.cam); return [ev.clientX - r.left, ev.clientY - r.top]; };
  const elev = () => M.levelOf(bim, bim.activeLevel).elev;
  const toScr = v => { const r = renderer.domElement.getBoundingClientRect(); const q = v.clone().project(S.cam); return [(q.x + 1) / 2 * r.width, (1 - q.y) / 2 * r.height]; };
  function groundPt(ev, base) {
    const scr = setNdc(ev); const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elev()); const hit = new THREE.Vector3(); if (!ray.ray.intersectPlane(plane, hit)) return null;
    let p2 = M.fromThree(hit).slice(0, 2); S.snapInfo = null;
    if (S.snaps.ends) { let best = null, bd = 14; candidates().forEach(c => { const s = toScr(M.toThree(c[0], c[1], elev())); const d = Math.hypot(s[0] - scr[0], s[1] - scr[1]); if (d < bd) { bd = d; best = c; } }); if (best) { S.snapInfo = 'end'; return [best[0], best[1]]; } }
    if (base && S.snaps.axis) { const dx = p2[0] - base[0], dy = p2[1] - base[1], L = Math.hypot(dx, dy); if (L > 1e-6) { const a = Math.atan2(dy, dx); const st = Math.PI / 2; const ra = Math.round(a / st) * st; if (Math.abs(a - ra) < .07) { p2 = [base[0] + L * Math.cos(ra), base[1] + L * Math.sin(ra)]; S.snapInfo = Math.abs(Math.cos(ra)) > .5 ? 'x' : 'y'; } } }
    if (S.snaps.grid && !S.snapInfo) p2 = [Math.round(p2[0] * 20) / 20, Math.round(p2[1] * 20) / 20];
    if (S.snapInfo === 'x' || S.snapInfo === 'y') { const L = Math.hypot(p2[0] - base[0], p2[1] - base[1]); const Lr = S.snaps.grid ? Math.round(L * 20) / 20 : L; const k = L ? Lr / L : 1; p2 = [base[0] + (p2[0] - base[0]) * k, base[1] + (p2[1] - base[1]) * k]; }
    return p2;
  }
  function candidates() { const out = []; const lv = bim.activeLevel; bim.elements.forEach(e => { if (e.level !== lv) return; if (e.a) out.push(e.a); if (e.b) out.push(e.b); if (e.pts) out.push(...e.pts); if (e.type === 'column') out.push([e.x, e.y]); if (e.path) out.push(e.path[0], e.path[e.path.length - 1]); }); return out; }
  function pickElement(ev, filter) { setNdc(ev); const hits = ray.intersectObjects([model, imports], true).filter(h => h.object.isMesh && (h.object.userData.id || h.object.userData.imported)); for (const h of hits) { const e = bim.elements.find(x => x.id === h.object.userData.id); if (!filter || (e && filter(e)) || (!e && filter === 'any')) return { e, hit: h, imp: !e ? h.object.userData : null }; } return null; }

  /* ---------- anteprima ---------- */
  const pvMat = new THREE.LineBasicMaterial({ color: '#ff7a1a' }), pvFill = new THREE.MeshBasicMaterial({ color: '#ff9a4a', transparent: true, opacity: .25, side: THREE.DoubleSide, depthWrite: false });
  function clearPv() { preview.children.slice().forEach(o => { preview.remove(o); if (o.geometry) o.geometry.dispose(); }); $('#bLabel').classList.add('hidden'); }
  function pvLine(pts2, closed, z = elev() + .01, col) { const v = pts2.map(p2 => M.toThree(p2[0], p2[1], z)); if (closed) v.push(v[0]); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), col ? new THREE.LineBasicMaterial({ color: col }) : pvMat); preview.add(l); }
  function pvGeom(geom) { preview.add(new THREE.Mesh(geom, pvFill)); }
  function label(text, at) { const l = $('#bLabel'); const s = toScr(at); l.textContent = text; l.style.left = (s[0] + 14) + 'px'; l.style.top = (s[1] + 10) + 'px'; l.classList.remove('hidden'); }
  const axisCol = () => S.snapInfo === 'x' ? '#d23c3c' : S.snapInfo === 'y' ? '#1f9e5a' : null;

  /* ---------- strumenti ---------- */
  const hint = t => { $('#bHint').textContent = t; };
  function setTool(t) { S.tool = t; S.pts = []; S.drag = null; clearPv(); $$('#bTools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t)); if (typeof renderSide === 'function' && !S.sel.size) setTimeout(renderSide); controls.mouseButtons.LEFT = t === 'orbit' ? THREE.MOUSE.ROTATE : t === 'pan' ? THREE.MOUSE.PAN : null; renderer.domElement.style.cursor = ['select', 'orbit', 'pan'].includes(t) ? 'default' : 'crosshair'; hint(HINT[t] || ''); $('#bVcb').value = ''; if (t === 'brep') brepDialog(); if (t === 'csg') csgDialog(); render(); if (S.ready) updateRvt(); }
  S.setTool = setTool;
  const L0 = () => bim.activeLevel;
  const add = e => { e.id = e.id || M.uid(); e.level = e.level || L0(); if (App.user) e.author = App.user.id; bim.elements.push(e); return e; };
  function joinFlags(w) { const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-3; bim.elements.filter(o => o.type === 'wall' && o.level === w.level && o !== w).forEach(o => { if (near(w.a, o.a) || near(w.a, o.b)) w.extA = true; if (near(w.b, o.a) || near(w.b, o.b)) w.extB = true; if (near(o.a, w.a) || near(o.a, w.b)) o.extA = true; if (near(o.b, w.a) || near(o.b, w.b)) o.extB = true; }); }
  function shapeDone(pts) {
    const t = S.tool, d = S.defaults;
    if (pts.length < 3 || M.polyArea(pts) < 1e-4) return;
    if (t === 'rect') { const e = add({ type: 'mass', pts, z0: 0, h: .01, material: d.mass.material, name: 'Massa' }); commit('Rettangolo', [e.id]); setTool('pushpull'); hint('Ora spingi/tira la faccia per dare altezza (o digita l\'altezza e premi Invio)'); S.pendingPush = e.id; return; }
    if (t === 'slab') { const e = add({ type: 'slab', pts, thk: d.slab.thk, offset: 0, material: d.slab.material, name: 'Solaio' }); commit('Solaio', [e.id]); }
    if (t === 'space') { const e = add({ type: 'space', pts, use: d.space.use, name: d.space.use }); commit('Spazio', [e.id]); }
    if (t === 'roof') roofFrom(pts);
    S.pts = []; clearPv();
  }
  function roofFrom(pts) { const d = S.defaults.roof; let o = pts; if (d.overhang) { let q = pts.slice(); if (G.area(q) < 0) q.reverse(); o = G.offsetPolyline(q, -d.overhang, true); } const bb = G.bbox(o); const dir = (bb[2] - bb[0]) >= (bb[3] - bb[1]) ? Math.PI / 2 : 0; const e = add({ type: 'roof', pts: o, kind: d.kind, slope: d.kind === 'flat' ? 0 : d.slope, thk: d.thk, dir, material: d.material, name: 'Copertura' }); commit('Copertura', [e.id]); }
  function onDown(ev) {
    if (ev.button !== 0) return; const t = S.tool; renderer.domElement.focus();
    if (t === 'select') { const h = pickElement(ev); if (!ev.shiftKey) S.sel.clear(); if (h && h.e) { S.sel.has(h.e.id) && ev.shiftKey ? S.sel.delete(h.e.id) : S.sel.add(h.e.id); } else if (h && h.imp) { S.impSel = h.imp; } rebuild(); renderSide(); return; }
    if (t === 'erase') { const h = pickElement(ev); if (h && h.e) { removeIds([h.e.id]); commit('Elimina ' + M.TYPES[h.e.type].label); } return; }
    if (t === 'pushpull') { const h = pickElement(ev, e => ['mass', 'slab', 'wall', 'column', 'space'].includes(e.type)); if (!h) return; const n = h.hit.face.normal.clone().transformDirection(h.hit.object.matrixWorld).normalize(); S.drag = { e: h.e, n, p0: h.hit.point.clone(), orig: JSON.parse(JSON.stringify(h.e)), side: Math.abs(n.y) < .5 }; controls.enabled = false; return; }
    if (t === 'door' || t === 'window') { const h = pickElement(ev, e => e.type === 'wall'); if (!h) { App.toast('Clic su un muro', 'warn'); return; } const w = h.e, q = M.fromThree(h.hit.point); const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); const d = S.defaults[t]; let tt = ((q[0] - w.a[0]) * (w.b[0] - w.a[0]) + (q[1] - w.a[1]) * (w.b[1] - w.a[1])) / (len * len); tt = Math.max(d.width / 2 / len, Math.min(1 - d.width / 2 / len, tt)); const e = add({ type: t, host: w.id, level: w.level, t: Math.round(tt * len * 20) / 20 / len, width: d.width, height: d.height, sill: t === 'window' ? d.sill : 0, name: t === 'door' ? 'Porta' : 'Finestra' }); commit(t === 'door' ? 'Porta' : 'Finestra', [w.id, e.id]); return; }
    if (t === 'roof') { const h = pickElement(ev, e => ['slab', 'mass', 'space'].includes(e.type)); if (h && !S.pts.length) { roofFrom(h.e.pts); return; } }
    if (t === 'move' || t === 'rotate') { if (!S.sel.size) { const h = pickElement(ev); if (h && h.e) { S.sel.add(h.e.id); rebuild(); renderSide(); } return; } }
    const q = ev.__q || groundPt(ev, S.pts[S.pts.length - 1]); if (!q) return;
    if (t === 'tape') { S.pts.push(q); if (S.pts.length === 2) { const d = Math.hypot(S.pts[1][0] - S.pts[0][0], S.pts[1][1] - S.pts[0][1]); App.toast(`Distanza: ${App.fnum(d, 3)} m`); S.lastTape = S.pts; S.pts = []; } return; }
    if (t === 'column') { const d = S.defaults.column; const e = add({ type: 'column', x: q[0], y: q[1], w: d.w, d: d.d, shape: d.shape, material: d.material, name: 'Pilastro' }); commit('Pilastro', [e.id]); return; }
    if (t === 'wall') { if (S.pts.length) { const a = S.pts[S.pts.length - 1]; if (Math.hypot(q[0] - a[0], q[1] - a[1]) > 1e-3) { const d = S.defaults.wall; const e = add({ type: 'wall', a, b: q, thk: d.thk, material: d.material, external: d.external, loadBearing: d.thk >= .25, name: 'Muro' }); if (d.h > 0) e.h = d.h; joinFlags(e); commit('Muro', null); if (S.chain === false) { S.pts = []; clearPv(); return; } } } S.pts.push(q); return; }
    if (t === 'curtain' || t === 'rail' || t === 'grid') { S.pts.push(q); if (S.pts.length === 2) { const [a, b] = S.pts; S.pts = []; clearPv(); if (Math.hypot(b[0] - a[0], b[1] - a[1]) < .05) return;
        let e; if (t === 'curtain') { const d = S.defaults.curtain; e = add({ type: 'curtain', a, b, gu: d.gu, gv: d.gv, mul: d.mul, name: 'Facciata continua' }); }
        else if (t === 'rail') { const d = S.defaults.rail; e = add({ type: 'rail', a, b, h: d.h, step: d.step, name: 'Ringhiera' }); }
        else { const used = bim.elements.filter(x => x.type === 'grid').map(x => x.label); const vert = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1]); let lab; if (vert) { let i = 1; while (used.includes(String(i))) i++; lab = String(i); } else { let i = 0; while (used.includes(String.fromCharCode(65 + i))) i++; lab = String.fromCharCode(65 + i); } e = add({ type: 'grid', a, b, label: lab, name: 'Asse ' + lab }); }
        commit(M.TYPES[e.type].label, [e.id]); } return; }
    if (t === 'beam') { S.pts.push(q); if (S.pts.length === 2) { const d = S.defaults.beam; const e = add({ type: 'beam', a: S.pts[0], b: S.pts[1], w: d.w, hb: d.hb, material: d.material, name: 'Trave' }); S.pts = []; commit('Trave', [e.id]); clearPv(); } return; }
    if (t === 'stair') { S.pts.push(q); if (S.pts.length === 2) { const d = S.defaults.stair; const a = S.pts[0], b = S.pts[1]; const e = add({ type: 'stair', x: a[0], y: a[1], rot: Math.atan2(b[1] - a[1], b[0] - a[0]), width: d.width, run: d.run, material: d.material, name: 'Scala' }); S.pts = []; commit('Scala', [e.id]); clearPv(); } return; }
    if (t === 'cwall') { S.pts.push(q); if (S.pts.length === 3) { const [a, b, m] = S.pts; S.pts = []; clearPv(); K.nurbsArc(a, m, b).then(path => { const d = S.defaults.wall; const e = add({ type: 'cwall', path, thk: d.thk, material: d.material, name: 'Muro curvo' }); commit('Muro curvo (NURBS)', [e.id]); }).catch(err => App.toast('NURBS non disponibile: ' + err.message, 'err')); } return; }
    if (t === 'move') { S.pts.push(q); if (S.pts.length === 2) { moveSel(S.pts[1][0] - S.pts[0][0], S.pts[1][1] - S.pts[0][1], ev.ctrlKey || ev.metaKey); S.pts = []; clearPv(); } return; }
    if (t === 'rotate') { S.pts.push(q); if (S.pts.length === 3) { const [c, a, b] = S.pts; const ang = Math.atan2(b[1] - c[1], b[0] - c[0]) - Math.atan2(a[1] - c[1], a[0] - c[0]); rotateSel(c, Math.round(ang / (Math.PI / 24)) * (Math.PI / 24)); S.pts = []; clearPv(); } return; }
    if (['rect', 'slab', 'space', 'roof'].includes(t)) { const mode = t === 'rect' ? 'rect' : $('#bShape').value; S.pts.push(q);
      if (mode === 'rect' && S.pts.length === 2) { const [a, b] = S.pts; shapeDone([a, [b[0], a[1]], b, [a[0], b[1]]]); }
      else if (mode === 'poly' && S.pts.length > 2 && Math.hypot(q[0] - S.pts[0][0], q[1] - S.pts[0][1]) < .05) { S.pts.pop(); shapeDone(S.pts.slice()); } return; }
  }
  function onMove(ev) {
    if (!S) return; const t = S.tool;
    if (S.drag) { const d = S.drag; setNdc(ev); const n = d.n; // distanza lungo la normale: punto più vicino tra raggio e retta (p0, n)
      const w0 = ray.ray.origin.clone().sub(d.p0); const a = n.dot(n), b = n.dot(ray.ray.direction), c = ray.ray.direction.dot(ray.ray.direction), dd = n.dot(w0), ee = ray.ray.direction.dot(w0); const den = a * c - b * b; let s = den > 1e-9 ? (b * ee - c * dd) / den : 0; s = Math.round(s * 100) / 100; applyPush(d, s); label(`${App.fnum(s, 2)} m`, d.p0); return; }
    if (['select', 'orbit', 'pan', 'erase', 'door', 'window', 'pushpull'].includes(t)) return;
    const base = S.pts[S.pts.length - 1]; const q = groundPt(ev, base); if (!q) return; clearPv(); const z = elev();
    const cross = (pt, col) => pvLine([[pt[0] - .25, pt[1]], [pt[0] + .25, pt[1]]], false, z + .01, col || '#14213d') || pvLine([[pt[0], pt[1] - .25], [pt[0], pt[1] + .25]], false, z + .01, col || '#14213d');
    cross(q, S.snapInfo === 'end' ? '#e8661c' : null);
    if (!base) return;
    const L = Math.hypot(q[0] - base[0], q[1] - base[1]);
    if (t === 'wall' || t === 'beam' || t === 'curtain' || t === 'rail' || t === 'grid') { if (t === 'curtain' || t === 'rail' || t === 'grid') { pvLine([base, q], false, elev() + .02, axisCol() || (t === 'grid' ? '#d1242f' : null)); label(`${App.fnum(L, 2)} m`, M.toThree(q[0], q[1], elev())); render(); return; } const d = S.defaults[t === 'wall' ? 'wall' : 'beam']; const len = L; if (len > 1e-3) { const dir = [(q[0] - base[0]) / len, (q[1] - base[1]) / len], nn = [-dir[1], dir[0]], h = (t === 'wall' ? d.thk : d.w) / 2; pvGeom(M.prism([[base[0] + nn[0] * h, base[1] + nn[1] * h], [q[0] + nn[0] * h, q[1] + nn[1] * h], [q[0] - nn[0] * h, q[1] - nn[1] * h], [base[0] - nn[0] * h, base[1] - nn[1] * h]], z, z + (t === 'wall' ? M.levelOf(bim, L0()).height : .05))); } pvLine([base, q], false, z + .02, axisCol()); label(`${App.fnum(L, 2)} m`, M.toThree(q[0], q[1], z)); }
    else if (['rect', 'slab', 'space', 'roof'].includes(t)) { const mode = t === 'rect' ? 'rect' : $('#bShape').value; if (mode === 'rect') { const a = S.pts[0]; pvLine([a, [q[0], a[1]], q, [a[0], q[1]]], true); label(`${App.fnum(Math.abs(q[0] - a[0]), 2)} × ${App.fnum(Math.abs(q[1] - a[1]), 2)} m`, M.toThree(q[0], q[1], z)); } else { pvLine([...S.pts, q], false, z + .01); pvLine([base, q], false, z + .02, axisCol()); label(`${App.fnum(L, 2)} m`, M.toThree(q[0], q[1], z)); } }
    else { pvLine([...S.pts, q], false, z + .02, axisCol()); label(`${App.fnum(L, 2)} m`, M.toThree(q[0], q[1], z)); }
    render();
  }
  function onUp() { if (S && S.drag) { const d = S.drag; S.drag = null; controls.enabled = true; clearPv(); commit('Spingi/Tira ' + M.TYPES[d.e.type].label, [d.e.id]); S.pendingPush = null; } }
  function applyPush(d, s) {
    const e = d.e, o = d.orig;
    if (!d.side) { const up = d.n.y > 0; if (e.type === 'mass') { if (up) e.h = Math.max(.01, o.h + s); else { e.z0 = (o.z0 || 0) - s; e.h = Math.max(.01, o.h + s); } } else if (e.type === 'slab') e.thk = Math.max(.02, o.thk + s); else if (e.type === 'wall' || e.type === 'column' || e.type === 'space') { const L = M.levelOf(bim, e.level); e.h = Math.max(.05, (o.h ?? (e.type === 'space' ? L.height - .3 : L.height)) + s); } }
    else { const n2 = [d.n.x, -d.n.z]; const p2 = M.fromThree(d.p0);
      if (e.type === 'wall') e.thk = Math.max(.05, o.thk + s * 2 * 0 + s);
      else if (e.type === 'column') { const ax = Math.abs(n2[0]) > Math.abs(n2[1]) ? 'w' : 'd'; e[ax] = Math.max(.05, o[ax] + s); e.x = o.x + n2[0] * s / 2 * (ax === 'w' ? 1 : 0); e.y = o.y + n2[1] * s / 2 * (ax === 'd' ? 1 : 0); }
      else if (e.pts) { // sposta il lato colpito lungo la normale
        let best = -1, bd = Infinity; o.pts.forEach((a, i) => { const b = o.pts[(i + 1) % o.pts.length]; const dd = G.segDist(p2, a, b); if (dd < bd) { bd = dd; best = i; } });
        e.pts = o.pts.map((pt, i) => (i === best || i === (best + 1) % o.pts.length) ? [pt[0] + n2[0] * s, pt[1] + n2[1] * s] : pt.slice()); } }
    rebuild([e.id]);
  }
  function removeIds(ids) { const set = new Set(ids); bim.elements.filter(e => (e.type === 'door' || e.type === 'window') && set.has(e.host)).forEach(e => set.add(e.id)); bim.elements = bim.elements.filter(e => !set.has(e.id)); set.forEach(id => { S.sel.delete(id); const o = S.objs.get(id); if (o) { model.remove(o); S.objs.delete(id); } }); }
  function xform(e, f, ang = 0) { const P = q => f(q); if (e.a) e.a = P(e.a); if (e.b) e.b = P(e.b); if (e.pts) e.pts = e.pts.map(P); if (e.holes) e.holes = e.holes.map(h => h.map(P)); if (e.path) e.path = e.path.map(P); if ('x' in e && 'y' in e) { [e.x, e.y] = P([e.x, e.y]); if (e.type === 'column' || e.type === 'stair') e.rot = (e.rot || 0) + ang; } if (e.type === 'roof') e.dir = (e.dir || 0) + ang; }
  function moveSel(dx, dy, copy) { const ids = [...S.sel]; const out = []; const map = {};
    ids.forEach(id => { const e = bim.elements.find(x => x.id === id); if (!e || ((e.type === 'door' || e.type === 'window') && ids.includes(e.host))) return; if (e.type === 'door' || e.type === 'window') return; if (e.type === 'brep' || e.type === 'csg') return brepMove(e, dx, dy, copy); const t = copy ? JSON.parse(JSON.stringify(e)) : e; if (copy) { t.id = M.uid(); map[e.id] = t.id; bim.elements.push(t); } xform(t, q => [q[0] + dx, q[1] + dy]); out.push(t.id); });
    if (copy) bim.elements.filter(o => (o.type === 'door' || o.type === 'window') && map[o.host]).forEach(o => { const n = JSON.parse(JSON.stringify(o)); n.id = M.uid(); n.host = map[o.host]; bim.elements.push(n); });
    commit(copy ? 'Copia' : 'Sposta', null); }
  function rotateSel(c, ang) { const co = Math.cos(ang), si = Math.sin(ang); [...S.sel].forEach(id => { const e = bim.elements.find(x => x.id === id); if (!e || e.type === 'door' || e.type === 'window' || e.type === 'brep' || e.type === 'csg') return; xform(e, q => [c[0] + (q[0] - c[0]) * co - (q[1] - c[1]) * si, c[1] + (q[0] - c[0]) * si + (q[1] - c[1]) * co], ang); }); commit(`Ruota ${App.fnum(ang * 180 / Math.PI, 1)}°`, null); }
  async function brepMove(e, dx, dy, copy) { const r = { op: 'move', a: e.recipe, v: [dx, dy, 0] }; try { const res = e.type === 'brep' ? await K.brepBuild(r) : await K.csgBuild(shiftCSG(e.recipe, dx, dy)); const t = copy ? { ...JSON.parse(JSON.stringify(e)), id: M.uid() } : e; t.recipe = e.type === 'brep' ? r : shiftCSG(e.recipe, dx, dy); t.mesh = res.mesh || res; if (copy) bim.elements.push(t); commit('Sposta solido', [t.id]); } catch (err) { App.toast(err.message, 'err'); } }
  const shiftCSG = (r, dx, dy) => r.op === 'prism' ? { ...r, pts: r.pts.map(q => [q[0] + dx, q[1] + dy]) } : { ...r, a: shiftCSG(r.a, dx, dy), b: shiftCSG(r.b, dx, dy) };

  /* VCB: valori digitati */
  function vcb(v) {
    const t = S.tool; const nums = v.replace(/,/g, '.').split(/[;x×\s]+/).map(Number).filter(n => isFinite(n)); if (!nums.length) return;
    if (S.pendingPush && t === 'pushpull') { const e = bim.elements.find(x => x.id === S.pendingPush); if (e) { e.h = nums[0]; S.pendingPush = null; commit('Altezza massa', [e.id]); } return; }
    if (t === 'pushpull' && S.sel.size === 1) { const e = bim.elements.find(x => S.sel.has(x.id)); if (e && 'h' in e) { e.h = nums[0]; commit('Altezza', [e.id]); } else if (e && e.type === 'slab') { e.thk = nums[0]; commit('Spessore', [e.id]); } return; }
    const base = S.pts[S.pts.length - 1]; if (!base) return;
    const last = S.lastMouse || [base[0] + 1, base[1]]; let dir = [last[0] - base[0], last[1] - base[1]]; const L = Math.hypot(...dir) || 1; dir = [dir[0] / L, dir[1] / L];
    if (t === 'rect' || ((t === 'slab' || t === 'space' || t === 'roof') && $('#bShape').value === 'rect')) { const w = nums[0], d = nums[1] ?? nums[0]; const sx = Math.sign(dir[0]) || 1, sy = Math.sign(dir[1]) || 1; const b = [base[0] + w * sx, base[1] + d * sy]; S.pts.push(b); shapeDone([base, [b[0], base[1]], b, [base[0], b[1]]]); return; }
    if (t === 'rotate' && S.pts.length >= 1) { rotateSel(S.pts[0], nums[0] * Math.PI / 180); S.pts = []; clearPv(); return; }
    const q = [base[0] + dir[0] * nums[0], base[1] + dir[1] * nums[0]];
    onDown(Object.assign(fakeEv(q), {}));
  }
  function fakeEv(q) { return { button: 0, __q: q, shiftKey: false, ctrlKey: false }; }
  const trackMouse = ev => { if (S && S.pts.length) { const q = groundPt(ev, S.pts[S.pts.length - 1]); if (q) S.lastMouse = q; } };

  /* ---------- eventi ---------- */
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', e => { trackMouse(e); onMove(e); });
  S.pm = e => { if (S && S.drag) onMove(e); }; S.pu = onUp; window.addEventListener('pointermove', S.pm); window.addEventListener('pointerup', S.pu);
  cv.addEventListener('dblclick', ev => { if (S.tool === 'select') { const h = pickElement(ev); if (h) { const b = new THREE.Box3().setFromObject(h.hit.object); const c = b.getCenter(new THREE.Vector3()); const dir = S.cam.position.clone().sub(controls.target); controls.target.copy(c); S.cam.position.copy(c).add(dir.setLength(Math.max(4, b.getSize(new THREE.Vector3()).length() * 2))); controls.update(); } } else if (S.tool === 'wall' || S.tool === 'beam') { S.pts = []; clearPv(); } else if (['slab', 'space', 'roof'].includes(S.tool) && S.pts.length > 2) { S.pts.pop(); shapeDone(S.pts.slice()); } });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  S.kh = ev => {
    if (!S || ev.target.closest('.side') || ev.target.closest('.modal-back')) return;
    const vcbI = $('#bVcb');
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? doRedo() : doUndo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); doRedo(); return; }
    if (ev.key === 'Escape') { if (S.pts.length && (S.tool === 'wall' || S.tool === 'beam')) { S.pts = []; clearPv(); render(); } else setTool('select'); vcbI.value = ''; return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace' && ev.target !== vcbI) { if (S.sel.size && ev.target !== vcbI) { removeIds([...S.sel]); commit('Elimina'); } return; }
    if (ev.key === 'Enter') { if (vcbI.value.trim()) { vcb(vcbI.value); vcbI.value = ''; vcbI.blur(); renderer.domElement.focus(); } else if (['slab', 'space', 'roof'].includes(S.tool) && S.pts.length > 2) shapeDone(S.pts.slice()); else if (S.tool === 'wall') { S.pts = []; clearPv(); render(); } ev.preventDefault(); return; }
    if (ev.target === vcbI) return;
    if (/^[0-9.,;x-]$/.test(ev.key) && (S.pts.length || S.pendingPush || S.tool === 'pushpull')) { vcbI.focus(); return; }
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && KEYS[ev.key.toLowerCase()] && ev.target.tagName !== 'INPUT') { ev.preventDefault(); setTool(KEYS[ev.key.toLowerCase()]); }
  };
  window.addEventListener('keydown', S.kh);
  $('#bTools').addEventListener('click', ev => { const t = ev.target.closest('[data-tool]'); if (t) { setTool(t.dataset.tool); return; } const a = ev.target.closest('[data-act]'); if (a) ribbonAct(a.dataset.act); });
  function ribbonAct(a) {
    if (a.startsWith('v_')) return setView(a.slice(2));
    if (a.startsWith('st_')) { S.style = a.slice(3); $$('#bViews [data-st]').forEach(x => x.classList.toggle('on', x.dataset.st === S.style)); return rebuild(); }
    ({ undo: doUndo, redo: doRedo, zoom: fit, sec: () => $('#bViews [data-x=sec]').click(), spacesTgl: () => $('#bViews [data-x=spaces]').click(), fromPlan: () => fromPlan(),
      levelsDlg: () => { sideTab = 'levels'; renderSide(); }, typesDlg: () => { sideTab = 'defaults'; renderSide(); }, dup: () => { if (S.sel.size) moveSel(1, 1, true); else App.toast('Seleziona prima gli elementi', 'warn'); },
      levelCopy: () => { sideTab = 'levels'; renderSide(); setTimeout(() => { const b = $('#lCopy'); if (b) b.click(); }, 50); },
      schedules: () => { location.hash = '#/bim/schedules'; }, computo: () => { location.hash = '#/acc/comp'; setTimeout(() => App.acc && App.acc.importFrom('bim', App.project(), App.acc.data(App.project()), () => App.route()), 400); }, norm: () => { location.hash = '#/norm/conformita'; }, ifc: () => { location.hash = '#/bim/exchange'; setTimeout(() => { const b = $('#xIfc'); if (b) b.click(); }, 300); }, exch: () => { location.hash = '#/bim/exchange'; },
      png: () => renderer.domElement.toBlob(b => App.download(App.slug(p.name) + '_3D.png', b)), present: () => { location.hash = '#/present/render'; } }[a] || (() => { }))();
  }
  $$('[data-sn]').forEach(b => b.onclick = () => { S.snaps[b.dataset.sn] = !S.snaps[b.dataset.sn]; b.classList.toggle('on', S.snaps[b.dataset.sn]); });

  /* ---------- viste ---------- */
  function setView(v) {
    const b = new THREE.Box3().setFromObject(model); if (b.isEmpty()) b.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 4, 10)); const c = b.getCenter(new THREE.Vector3()), s = Math.max(10, b.getSize(new THREE.Vector3()).length());
    renderer.clippingPlanes = S.clip ? [S.clip] : [];
    const dirs = { iso: [1, .8, 1], plan: [0, 1, 0.0001], N: [0, 0, -1], S: [0, 0, 1], E: [1, 0, 0], W: [-1, 0, 0] };
    if (v === 'persp') { S.cam = camP; controls.object = camP; camP.position.copy(c).add(new THREE.Vector3(.9, .7, 1.1).setLength(s * 1.1)); }
    else { S.cam = camO; controls.object = camO; camO.position.copy(c).add(new THREE.Vector3(...dirs[v]).setLength(s * 2)); camO.up.set(0, 1, 0); if (v === 'plan') { camO.up.set(0, 0, -1); const lv = M.levelOf(bim, bim.activeLevel); renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), lv.elev + 1.2)]; } camO.userData.k = s * .55; }
    controls.target.copy(c); controls.enableRotate = v !== 'plan' && !['N', 'S', 'E', 'W'].includes(v); S.view = v; $$('#bViews [data-v]').forEach(x => x.classList.toggle('on', x.dataset.v === v)); resize(); controls.update(); render(); if (S.ready) { const br = $('#bBrowser'); if (br) sideBrowser(br); updateRvt(); }
  }
  S.setView = setView;
  $$('#bViews [data-v]').forEach(b => b.onclick = () => setView(b.dataset.v));
  $$('#bViews [data-st]').forEach(b => b.onclick = () => { S.style = b.dataset.st; $$('#bViews [data-st]').forEach(x => x.classList.toggle('on', x === b)); rebuild(); });
  $('#bViews [data-x=zoom]').onclick = fit;
  $('#bViews [data-x=shadow]').onclick = e => { sun.castShadow = !sun.castShadow; e.target.classList.toggle('on', sun.castShadow); render(); };
  $('#bViews [data-x=spaces]').onclick = e => { S.showSpaces = !S.showSpaces; e.target.classList.toggle('on', S.showSpaces); rebuild(); };
  $('#bViews [data-x=sec]').onclick = e => { const on = $('#bSec').classList.toggle('hidden'); e.target.classList.toggle('on', !on); if (on) { S.clip = null; renderer.clippingPlanes = []; render(); } else secUpd(); };
  const secUpd = () => { const b = new THREE.Box3().setFromObject(model); if (b.isEmpty()) return; const ax = $('#bSecAx').value, t = +$('#bSecV').value; let pl; if (ax === 'x') { const v = b.min.x + (b.max.x - b.min.x) * t; pl = new THREE.Plane(new THREE.Vector3(-1, 0, 0), v); $('#bSecL').textContent = 'x = ' + App.fnum(v); } else if (ax === 'y') { const v = b.min.z + (b.max.z - b.min.z) * t; pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -v); $('#bSecL').textContent = 'y = ' + App.fnum(-v); } else { const v = b.min.y + (b.max.y - b.min.y) * t; pl = new THREE.Plane(new THREE.Vector3(0, -1, 0), v); $('#bSecL').textContent = 'z = ' + App.fnum(v); } S.clip = pl; renderer.clippingPlanes = [pl]; render(); };
  $('#bSecV').oninput = secUpd; $('#bSecAx').onchange = secUpd;
  $$('#bViews [data-x=shadow], #bViews [data-x=spaces], #bViews [data-st=shaded]').forEach(b => b.classList.add('on'));

  /* ---------- livelli ---------- */
  function renderLevels() { const s = $('#bLevel'); s.innerHTML = bim.levels.map(l => `<option value="${l.id}" ${l.id === bim.activeLevel ? 'selected' : ''}>${esc(l.name)} (${App.fnum(l.elev)} m)</option>`).join(''); grid.position.y = elev() + .001; render(); }
  $('#bLevel').onchange = e => { bim.activeLevel = e.target.value; renderLevels(); if (bim.onlyActive) rebuild(); renderSide(); };

  /* ---------- pannello laterale ---------- */
  let sideTab = 'props';
  $$('[data-st2]').forEach(b => b.onclick = () => { sideTab = b.dataset.st2; $$('[data-st2]').forEach(x => x.classList.toggle('active', x === b)); renderSide(); });
  function typeSel(tool) { const fam = FAMILY[tool]; if (!fam) return ''; const d = S.defaults[tool] || {}; const cur = fam.findIndex(([, v]) => Object.entries(v).every(([k, x]) => d[k] === x)); return `<div class="typesel"><span class="sw"></span><div class="grow"><div class="tiny muted">${esc(M.TYPES[tool] ? M.TYPES[tool].label : tool)}</div><select id="bType">${cur < 0 ? '<option>Personalizzato</option>' : ''}${fam.map(([n], i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div></div>`; }
  function bindTypeSel(tool) { const s2 = $('#bType'); if (!s2) return; s2.onchange = () => { const f = FAMILY[tool][+s2.value]; if (!f) return; Object.assign(S.defaults[tool] = S.defaults[tool] || {}, f[1]); App.touch(p); App.toast('Tipo: ' + f[0]); }; }
  function sideBrowser(el) {
    const lv = bim.levels.slice().sort((a, b) => a.elev - b.elev); const cv2 = S.view;
    el.innerHTML = `<div class="browser" style="padding:6px 8px">
      <details open><summary>${App.icon('folder', 14)} Viste (tutte)</summary>
        <details open style="margin-left:12px"><summary>Piante dei pavimenti</summary>${lv.map(l => `<div class="leaf ${cv2 === 'plan' && bim.activeLevel === l.id ? 'on' : ''}" data-plan="${l.id}">${App.icon('grid', 13)} ${esc(l.name)}</div>`).join('')}</details>
        <details open style="margin-left:12px"><summary>Viste 3D</summary><div class="leaf ${cv2 === 'persp' ? 'on' : ''}" data-v="persp">${App.icon('cube', 13)} {3D}</div><div class="leaf ${cv2 === 'iso' ? 'on' : ''}" data-v="iso">${App.icon('box3d', 13)} Assonometria</div></details>
        <details open style="margin-left:12px"><summary>Prospetti</summary>${[['N', 'Nord'], ['S', 'Sud'], ['E', 'Est'], ['W', 'Ovest']].map(([k, l]) => `<div class="leaf ${cv2 === k ? 'on' : ''}" data-v="${k}">${App.icon('arrow', 13)} ${l}</div>`).join('')}</details>
        <details style="margin-left:12px"><summary>Piante dei controsoffitti</summary>${lv.map(l => `<div class="leaf" data-plan="${l.id}">${App.icon('grid', 13)} ${esc(l.name)}</div>`).join('')}</details>
        <details style="margin-left:12px"><summary>Sezioni</summary><div class="leaf" data-sec="x">${App.icon('measure', 13)} Sezione trasversale</div><div class="leaf" data-sec="y">${App.icon('measure', 13)} Sezione longitudinale</div></details>
      </details>
      <details open><summary>${App.icon('table', 14)} Abachi / quantità</summary>${['Muri', 'Solai', 'Serramenti', 'Locali'].map(x => `<div class="leaf" data-sch="1">${App.icon('table', 13)} Abaco ${x}</div>`).join('')}</details>
      <details><summary>${App.icon('block', 14)} Famiglie</summary>${Object.entries(FAMILY).map(([k, fam]) => `<details style="margin-left:12px"><summary>${esc(M.TYPES[k] ? M.TYPES[k].label : k)}</summary>${fam.map(([n], i) => `<div class="leaf" data-fam="${k}:${i}">${esc(n)}</div>`).join('')}</details>`).join('')}</details>
      <details><summary>${App.icon('present', 14)} Tavole (tutte)</summary><div class="leaf" data-sheet="1">${App.icon('doc', 13)} A.01 – Pianta arredata</div><div class="leaf" data-sheet="1">${App.icon('doc', 13)} A.02 – Prospetti</div></details>
      <details><summary>${App.icon('layers', 14)} Livelli</summary><div class="leaf" data-lv="1">Gestione livelli…</div></details>
      <details><summary>${App.icon('block', 14)} Gruppi</summary><div class="leaf faint">Nessun gruppo</div></details></div>`;
    $$('[data-sheet]', el).forEach(d => d.onclick = () => { location.hash = '#/present'; });
    $$('[data-plan]', el).forEach(d => d.onclick = () => { bim.activeLevel = d.dataset.plan; renderLevels(); setView('plan'); });
    $$('[data-v]', el).forEach(d => d.onclick = () => { setView(d.dataset.v); });
    $$('[data-sec]', el).forEach(d => d.onclick = () => { if ($('#bSec').classList.contains('hidden')) $('#bViews [data-x=sec]').click(); $('#bSecAx').value = d.dataset.sec; $('#bSecV').dispatchEvent(new Event('input')); });
    $$('[data-sch]', el).forEach(d => d.onclick = () => { location.hash = '#/bim/schedules'; });
    $$('[data-fam]', el).forEach(d => d.onclick = () => { const [k, i] = d.dataset.fam.split(':'); Object.assign(S.defaults[k] = S.defaults[k] || {}, FAMILY[k][+i][1]); App.touch(p); const tool = k; setTool(tool); App.toast('Tipo attivo: ' + FAMILY[k][+i][0]); });
    $$('[data-lv]', el).forEach(d => d.onclick = () => { sideTab = 'levels'; renderSide(); });
  }
  function renderSide() { renderSide0(); const br = $('#bBrowser'); if (br) sideBrowser(br); updateRvt(); }
  function renderSide0() {
    const el = $('#bSide'); if (!el) return; el.style.padding = '12px';
    $$('[data-st2]').forEach(x => x.classList.toggle('active', x.dataset.st2 === sideTab || (sideTab === 'levels' || sideTab === 'defaults') && x.dataset.st2 === 'props'));
    if (sideTab === 'levels') return sideLevels(el); if (sideTab === 'tree') return sideTree(el); if (sideTab === 'defaults') return sideDefaults(el);
    if (!S.sel.size && FAMILY[S.tool]) { el.style.padding = '0'; el.innerHTML = typeSel(S.tool) + `<div style="padding:12px"><div class="sec-t">Proprietà del tipo</div><div class="tiny muted">${esc(HINT[S.tool] || '')}</div><div class="prop-grid" style="margin-top:8px">${Object.entries(S.defaults[S.tool] || {}).map(([k, v]) => `<label>${esc(k)}</label><span>${typeof v === 'number' ? App.fnum(v, 2) : esc(String(v))}</span>`).join('')}</div><button class="btn sm" style="margin-top:10px" id="bEditT">Modifica tipi…</button></div>`; bindTypeSel(S.tool); $('#bEditT').onclick = () => { sideTab = 'defaults'; renderSide(); }; return; }
    const ids = [...S.sel]; const ents = ids.map(id => bim.elements.find(e => e.id === id)).filter(Boolean);
    if (!ents.length) { if (S.impSel) { el.innerHTML = `<div class="sec-t">Oggetto IFC importato</div><div class="prop-grid"><label>Classe</label><span>${esc(S.impSel.ifcType || '')}</span><label>Nome</label><span>${esc(S.impSel.name || '')}</span><label>Express ID</label><span>#${S.impSel.eid}</span><label>Modello</label><span>${esc(S.impSel.model || '')}</span></div>`; return; }
      const tot = {}; bim.elements.forEach(e => tot[e.type] = (tot[e.type] || 0) + 1);
      el.innerHTML = `<div class="sec-t">Modello</div><div class="prop-grid"><label>Elementi</label><span>${bim.elements.length}</span><label>Livelli</label><span>${bim.levels.length}</span>${Object.entries(tot).map(([k, v]) => `<label>${esc(M.TYPES[k].label)}</label><span>${v}</span>`).join('')}</div>
        <div class="sec-t">Genera</div><button class="btn" id="bFromPlan" style="width:100%">${App.icon('room', 15)} Modello dalla pianta parametrica</button>
        <p class="tiny faint">Muri, aperture e stanze della pianta diventano muri, porte, finestre e spazi BIM; viene aggiunto il solaio e una copertura a falde.</p>
        <div class="sec-t">Scorciatoie</div><div class="tiny muted" style="line-height:1.8">R rettangolo · P spingi/tira · M sposta · Q ruota · T metro · E gomma<br>W muro · S solaio · C pilastro · B trave · O copertura · D porta · N finestra · K scala · A spazio<br>Digita una misura durante il disegno e premi Invio.</div>`;
      $('#bFromPlan').onclick = fromPlan; return; }
    const e = ents[0], one = ents.length === 1; const ty = M.TYPES[e.type];
    const num = (k, lab, step = .01) => `<label>${lab}</label><input type="number" step="${step}" data-k="${k}" value="${e[k] ?? ''}">`;
    const F = { wall: () => num('thk', 'Spessore') + num('h', 'Altezza (vuoto = livello)') + chk('external', 'Esterno') + chk('loadBearing', 'Portante') + txt('fire', 'Resistenza al fuoco') + num('u', 'Trasmittanza U'), cwall: () => num('thk', 'Spessore') + num('h', 'Altezza'), slab: () => num('thk', 'Spessore') + num('offset', 'Quota (rel. livello)'), mass: () => num('h', 'Altezza') + num('z0', 'Quota base'), space: () => txt('use', 'Destinazione') + num('h', 'Altezza netta'), column: () => num('w', 'Larghezza / Ø') + num('d', 'Profondità') + `<label>Sezione</label><select data-k="shape"><option value="rect" ${e.shape !== 'round' ? 'selected' : ''}>Rettangolare</option><option value="round" ${e.shape === 'round' ? 'selected' : ''}>Circolare</option></select>` + num('h', 'Altezza'), beam: () => num('w', 'Base') + num('hb', 'Altezza sezione') + num('top', 'Quota estradosso'), roof: () => `<label>Tipo</label><select data-k="kind">${[['flat', 'Piana'], ['mono', 'Una falda'], ['gable', 'Due falde']].map(([v, l]) => `<option value="${v}" ${e.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` + num('slope', 'Pendenza °', 1) + num('thk', 'Spessore') + num('base', 'Quota imposta') + `<label>Direzione</label><button class="btn sm" data-rot>Ruota colmo 90°</button>`, door: () => num('width', 'Larghezza') + num('height', 'Altezza') + num('t', 'Posizione 0-1'), window: () => num('width', 'Larghezza') + num('height', 'Altezza') + num('sill', 'Davanzale') + num('t', 'Posizione 0-1'), stair: () => num('width', 'Larghezza rampa') + num('run', 'Pedata') + num('rise', 'Dislivello'), brep: () => '', csg: () => '', curtain: () => num('gu', 'Passo montanti') + num('gv', 'Passo traversi') + num('mul', 'Sezione profili') + num('h', 'Altezza'), rail: () => num('h', 'Altezza') + num('step', 'Passo montanti'), grid: () => txt('label', 'Etichetta asse') };
    function chk(k, lab) { return `<label>${lab}</label><input type="checkbox" data-k="${k}" ${e[k] ? 'checked' : ''} style="width:auto">`; }
    function txt(k, lab) { return `<label>${lab}</label><input type="text" data-k="${k}" value="${esc(e[k] ?? '')}">`; }
    const q = one ? M.quantities(bim, e) : null;
    el.innerHTML = `<div class="row" style="margin-bottom:6px">${App.appIcon('bim', 28)}<div><b>${one ? esc(ty.label) : ents.length + ' elementi'}</b><div class="tiny faint">${one ? ty.ifc : ''}</div></div></div>
      <div class="prop-grid">${one ? `<label>Nome</label><input type="text" data-k="name" value="${esc(e.name || '')}">` : ''}
      <label>Livello</label><select data-k="level">${bim.levels.map(l => `<option value="${l.id}" ${l.id === e.level ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      ${e.type !== 'door' && e.type !== 'window' && e.type !== 'space' ? `<label>Materiale</label><select data-k="material"><option value=""></option>${Object.keys(M.MATERIALS).map(m => `<option ${e.material === m ? 'selected' : ''}>${m}</option>`).join('')}</select>` : ''}
      ${one ? (F[e.type] || (() => ''))() : ''}</div>
      ${q ? `<div class="sec-t">Quantità</div><div class="prop-grid">${Object.entries(q).filter(([, v]) => typeof v === 'number').map(([k, v]) => `<label>${esc(k.replace(/_/g, ' '))}</label><span>${App.fnum(v, 3)}</span>`).join('')}</div>` : ''}
      ${one && (e.type === 'brep' || e.type === 'csg') ? `<div class="sec-t">Ricetta ${e.type === 'brep' ? 'B-rep (OpenCascade)' : 'CSG (Manifold)'}</div><pre class="tiny" style="white-space:pre-wrap;max-height:160px;overflow:auto;background:var(--panel2);padding:6px;border-radius:6px">${esc(JSON.stringify(e.recipe, null, 1)).slice(0, 2000)}</pre>` : ''}
      <div class="row wrap" style="margin-top:10px"><button class="btn sm" data-a="dup">Duplica</button><button class="btn sm danger" data-a="del">Elimina</button>${one && e.ai ? '<button class="btn sm" data-a="val">Valida AI</button>' : ''}</div>`;
    $$('[data-k]', el).forEach(i => i.onchange = () => { const k = i.dataset.k; ents.forEach(x => { let v = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? undefined : parseFloat(i.value)) : i.value; if (v === undefined) delete x[k]; else x[k] = v; if (k === 't') x.t = Math.max(0, Math.min(1, x.t)); }); commit('Modifica ' + k, ents.map(x => x.id).concat(ents.map(x => x.host).filter(Boolean))); });
    const rb = $('[data-rot]', el); if (rb) rb.onclick = () => { e.dir = (e.dir || 0) + Math.PI / 2; commit('Ruota colmo', [e.id]); };
    $('[data-a=del]', el).onclick = () => { removeIds(ents.map(x => x.id)); commit('Elimina'); };
    $('[data-a=dup]', el).onclick = () => { moveSel(1, 1, true); };
    const va = $('[data-a=val]', el); if (va) va.onclick = () => { delete e.ai; commit('Validazione AI', [e.id]); };
  }
  function sideLevels(el) {
    el.innerHTML = `<div class="row between"><div class="sec-t" style="margin:0">Livelli (IfcBuildingStorey)</div><button class="btn sm" id="lAdd">${App.icon('plus', 13)} Livello</button></div>
      <table class="tbl" style="margin-top:8px"><thead><tr><th></th><th>Nome</th><th class="num">Quota</th><th class="num">Altezza</th><th></th></tr></thead><tbody>${bim.levels.slice().sort((a, b) => b.elev - a.elev).map(l => `<tr data-l="${l.id}"><td><input type="radio" name="al" ${l.id === bim.activeLevel ? 'checked' : ''}></td><td><input data-f="name" value="${esc(l.name)}" style="padding:3px 6px"></td><td><input type="number" step=".05" data-f="elev" value="${l.elev}" style="width:64px;padding:3px"></td><td><input type="number" step=".05" data-f="height" value="${l.height}" style="width:60px;padding:3px"></td><td><button class="btn sm ghost" data-del>✕</button></td></tr>`).join('')}</tbody></table>
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="lOnly" ${bim.onlyActive ? 'checked' : ''}> Mostra solo il livello attivo</label>
      <button class="btn sm" id="lCopy" style="margin-top:10px">Copia elementi del livello attivo sul livello superiore</button>`;
    $$('tr[data-l]', el).forEach(tr => { const l = bim.levels.find(x => x.id === tr.dataset.l);
      $('input[type=radio]', tr).onchange = () => { bim.activeLevel = l.id; renderLevels(); if (bim.onlyActive) rebuild(); };
      $$('[data-f]', tr).forEach(i => i.onchange = () => { l[i.dataset.f] = i.dataset.f === 'name' ? i.value : parseFloat(i.value); commit('Modifica livello'); renderLevels(); });
      $('[data-del]', tr).onclick = () => { if (bim.elements.some(e => e.level === l.id)) { App.toast('Il livello contiene elementi', 'warn'); return; } if (bim.levels.length < 2) return; bim.levels = bim.levels.filter(x => x !== l); if (bim.activeLevel === l.id) bim.activeLevel = bim.levels[0].id; commit('Elimina livello'); renderLevels(); }; });
    $('#lAdd').onclick = () => { const top = bim.levels.reduce((a, l) => l.elev > a.elev ? l : a); bim.levels.push({ id: 'L' + M.uid(), name: `Piano ${bim.levels.length}`, elev: +(top.elev + top.height).toFixed(3), height: top.height }); commit('Nuovo livello'); renderLevels(); };
    $('#lOnly').onchange = e => { bim.onlyActive = e.target.checked; App.touch(p); rebuild(); };
    $('#lCopy').onclick = () => { const cur = M.levelOf(bim, bim.activeLevel); const up = bim.levels.filter(l => l.elev > cur.elev).sort((a, b) => a.elev - b.elev)[0]; if (!up) { App.toast('Nessun livello superiore', 'warn'); return; } const map = {}; bim.elements.filter(e => e.level === cur.id && !['door', 'window', 'roof', 'stair'].includes(e.type)).forEach(e => { const n = JSON.parse(JSON.stringify(e)); n.id = M.uid(); n.level = up.id; map[e.id] = n.id; bim.elements.push(n); }); bim.elements.filter(e => e.level === cur.id && (e.type === 'door' || e.type === 'window') && map[e.host]).forEach(e => { const n = JSON.parse(JSON.stringify(e)); n.id = M.uid(); n.level = up.id; n.host = map[e.host]; bim.elements.push(n); }); commit('Copia livello'); };
  }
  function sideTree(el) {
    el.innerHTML = bim.levels.slice().sort((a, b) => b.elev - a.elev).map(l => { const els = bim.elements.filter(e => e.level === l.id); const by = {}; els.forEach(e => (by[e.type] = by[e.type] || []).push(e)); return `<details open><summary class="small" style="font-weight:600;padding:4px 0">${esc(l.name)} <span class="faint">(${els.length})</span></summary>${Object.entries(by).map(([t, list]) => `<details><summary class="small" style="padding:2px 12px">${esc(M.TYPES[t].label)} <span class="faint">${list.length}</span></summary>${list.map(e => `<div class="tree-item ${S.sel.has(e.id) ? 'active' : ''}" data-id="${e.id}" style="margin-left:20px">${esc(e.name || M.TYPES[t].label)}${e.ai ? ' <span class="pill ai">AI</span>' : ''}</div>`).join('')}</details>`).join('')}</details>`; }).join('') + (bim.imports.length ? `<div class="sec-t">Modelli IFC importati</div>${bim.imports.map(i => `<div class="tree-item"><input type="checkbox" data-imp="${i.fileId}" ${i.visible !== false ? 'checked' : ''}> ${esc(i.name)} <span class="tiny faint">${i.count} oggetti</span></div>`).join('')}` : '');
    $$('[data-id]', el).forEach(d => d.onclick = ev => { if (!ev.shiftKey) S.sel.clear(); S.sel.add(d.dataset.id); rebuild(); sideTab = 'props'; $$('[data-st2]').forEach(x => x.classList.toggle('active', x.dataset.st2 === 'props')); renderSide(); });
    $$('[data-imp]', el).forEach(c => c.onchange = () => { const i = bim.imports.find(x => x.fileId === c.dataset.imp); i.visible = c.checked; App.touch(p); imports.children.forEach(o => { if (o.userData.fileId === i.fileId) o.visible = c.checked; }); render(); });
  }
  function sideDefaults(el) {
    const d = S.defaults; const mats = sel => `<option value=""></option>${Object.keys(M.MATERIALS).map(m => `<option ${sel === m ? 'selected' : ''}>${m}</option>`).join('')}`;
    const f = (grp, k, lab, type = 'number', step = .01) => `<label>${lab}</label>${type === 'mat' ? `<select data-g="${grp}" data-k="${k}">${mats(d[grp][k])}</select>` : type === 'text' ? `<input data-g="${grp}" data-k="${k}" value="${esc(d[grp][k] ?? '')}">` : `<input type="number" step="${step}" data-g="${grp}" data-k="${k}" value="${d[grp][k]}">`}`;
    el.innerHTML = `<p class="tiny muted" style="margin-top:0">Valori usati dagli strumenti per i nuovi elementi (tipi di famiglia).</p>
      <div class="sec-t">Muro</div><div class="prop-grid">${f('wall', 'thk', 'Spessore')}${f('wall', 'material', 'Materiale', 'mat')}</div>
      <div class="sec-t">Solaio</div><div class="prop-grid">${f('slab', 'thk', 'Spessore')}${f('slab', 'material', 'Materiale', 'mat')}</div>
      <div class="sec-t">Pilastro</div><div class="prop-grid">${f('column', 'w', 'Larghezza')}${f('column', 'd', 'Profondità')}${f('column', 'material', 'Materiale', 'mat')}</div>
      <div class="sec-t">Trave</div><div class="prop-grid">${f('beam', 'w', 'Base')}${f('beam', 'hb', 'Altezza')}</div>
      <div class="sec-t">Copertura</div><div class="prop-grid"><label>Tipo</label><select data-g="roof" data-k="kind">${[['flat', 'Piana'], ['mono', 'Una falda'], ['gable', 'Due falde']].map(([v, l]) => `<option value="${v}" ${d.roof.kind === v ? 'selected' : ''}>${l}</option>`).join('')}</select>${f('roof', 'slope', 'Pendenza °', 'number', 1)}${f('roof', 'overhang', 'Sporto')}${f('roof', 'thk', 'Spessore')}</div>
      <div class="sec-t">Aperture</div><div class="prop-grid">${f('door', 'width', 'Porta L')}${f('door', 'height', 'Porta H')}${f('window', 'width', 'Finestra L')}${f('window', 'height', 'Finestra H')}${f('window', 'sill', 'Davanzale')}</div>
      <div class="sec-t">Scala e spazio</div><div class="prop-grid">${f('stair', 'width', 'Larghezza')}${f('stair', 'run', 'Pedata')}${f('space', 'use', 'Destinazione', 'text')}</div>`;
    $$('[data-g]', el).forEach(i => i.onchange = () => { d[i.dataset.g][i.dataset.k] = i.type === 'number' ? parseFloat(i.value) : i.value; App.touch(p); });
  }

  /* ---------- dalla pianta parametrica ---------- */
  function fromPlan() {
    const D = p.drawing; App.cad.use(p); const walls = D.entities.filter(e => e.type === 'wall'); if (!walls.length) { App.toast('La pianta non contiene muri', 'warn'); return; }
    const lv = bim.activeLevel; const map = {};
    walls.forEach(w => { const e = add({ type: 'wall', a: [w.x1, w.y1], b: [w.x2, w.y2], thk: w.thk, h: w.h, material: w.material === 'Cartongesso' ? 'Cartongesso' : 'Laterizio', external: w.thk >= .25, loadBearing: w.thk >= .25, name: w.thk >= .25 ? 'Muro esterno' : 'Tramezzo', level: lv, ai: w.ai }); map[w.id] = e.id; joinFlags(e); });
    D.entities.filter(o => (o.type === 'door' || o.type === 'window') && map[o.wall]).forEach(o => add({ type: o.type, host: map[o.wall], t: o.t, width: o.width, height: o.h || (o.type === 'door' ? 2.1 : 1.4), sill: o.type === 'door' ? 0 : (o.sill ?? .9), name: o.type === 'door' ? 'Porta' : 'Finestra', level: lv }));
    D.entities.filter(r => r.type === 'room').forEach(r => add({ type: 'space', pts: r.pts.map(q => q.slice()), name: r.name, use: r.rtype || r.name, h: r.h, level: lv }));
    const hull = G.hull(walls.flatMap(w => App.cad.wallPts(w)));
    add({ type: 'slab', pts: hull, thk: .3, offset: 0, material: 'Calcestruzzo armato', name: 'Solaio controterra', level: lv });
    const L = M.levelOf(bim, lv); const roofLv = L.id;
    let o = hull.slice(); if (G.area(o) < 0) o.reverse(); o = G.offsetPolyline(o, -.4, true); const bb = G.bbox(o);
    add({ type: 'roof', pts: o, kind: 'gable', slope: 28, thk: .25, dir: (bb[2] - bb[0]) >= (bb[3] - bb[1]) ? Math.PI / 2 : 0, base: L.height, material: 'Tegole in cotto', name: 'Copertura', level: roofLv });
    commit('Modello dalla pianta'); fit(); App.toast('Modello BIM generato dalla pianta parametrica', 'ok');
  }

  /* ---------- B-rep (OpenCascade) e CSG (Manifold) ---------- */
  async function brepDialog() {
    const selB = [...S.sel].map(id => bim.elements.find(e => e.id === id)).filter(e => e && e.type === 'brep');
    const r = await App.modal({ title: 'Solido B-rep – OpenCascade', size: 'wide', body: `<p class="small muted" style="margin-top:0">Kernel B-rep OpenCascade (via replicad), caricato al primo uso (~23 MB WebAssembly). Le operazioni sono parametriche: la ricetta resta salvata nell'elemento ed è esportabile in STEP.</p>
      <div class="grid2"><div class="card" style="padding:12px"><h4>Nuova primitiva</h4><div class="col"><select id="bpT"><option value="box">Parallelepipedo</option><option value="cyl">Cilindro</option><option value="cone">Tronco di cono</option><option value="sphere">Sfera</option></select>
        <div class="grid3"><label class="f"><span>A (L / r)</span><input type="number" id="bpA" value="2" step=".1"></label><label class="f"><span>B (P / r2)</span><input type="number" id="bpB" value="2" step=".1"></label><label class="f"><span>H</span><input type="number" id="bpH" value="3" step=".1"></label></div>
        <div class="grid2"><label class="f"><span>X</span><input type="number" id="bpX" value="0" step=".5"></label><label class="f"><span>Y</span><input type="number" id="bpY" value="0" step=".5"></label></div></div></div>
      <div class="card" style="padding:12px"><h4>Operazioni sui ${selB.length} solidi B-rep selezionati</h4><div class="col"><select id="bpO"><option value="">—</option>${selB.length >= 2 ? '<option value="fuse">Unione</option><option value="cut">Sottrazione (primo − secondo)</option><option value="common">Intersezione</option>' : ''}${selB.length >= 1 ? '<option value="fillet">Raccordo spigoli</option><option value="chamfer">Smusso spigoli</option><option value="shell">Svuota (guscio aperto in alto)</option>' : ''}</select><label class="f"><span>Raggio / spessore</span><input type="number" id="bpR" value=".2" step=".05"></label><p class="tiny faint">Seleziona i solidi (Shift+clic) prima di aprire lo strumento.</p></div></div></div>`,
      actions: [{ label: App.t('cancel'), value: null }, { label: 'Esegui', primary: true, value: b => ({ t: $('#bpT', b).value, A: +$('#bpA', b).value, B: +$('#bpB', b).value, H: +$('#bpH', b).value, X: +$('#bpX', b).value, Y: +$('#bpY', b).value, O: $('#bpO', b).value, R: +$('#bpR', b).value }) }] });
    setTool('select'); if (!r) return;
    let recipe, remove = [];
    if (r.O && selB.length) { if (['fuse', 'cut', 'common'].includes(r.O)) { recipe = { op: r.O, a: selB[0].recipe, b: selB[1].recipe }; remove = [selB[0].id, selB[1].id]; } else { recipe = r.O === 'shell' ? { op: 'shell', a: selB[0].recipe, t: r.R } : { op: r.O, a: selB[0].recipe, r: r.R }; remove = [selB[0].id]; } }
    else { const prim = r.t === 'box' ? { op: 'box', w: r.A, d: r.B, h: r.H } : r.t === 'cyl' ? { op: 'cyl', r: r.A, h: r.H } : r.t === 'cone' ? { op: 'cone', r1: r.A, r2: r.B, h: r.H } : { op: 'sphere', r: r.A }; recipe = { op: 'move', a: prim, v: [r.X, r.Y, 0] }; }
    App.toast('Calcolo B-rep in corso (OpenCascade)…');
    try { const res = await K.brepBuild(recipe); removeIds(remove); const e = add({ type: 'brep', recipe, mesh: res.mesh, material: 'Massa', name: 'Solido B-rep' }); commit('Solido B-rep', [e.id]); App.toast(`Solido B-rep creato (${res.mesh.idx.length / 3} triangoli)`, 'ok'); }
    catch (err) { console.error(err); App.toast('Errore OpenCascade: ' + (err.message || err), 'err'); }
  }
  async function csgDialog() {
    const sel = [...S.sel].map(id => bim.elements.find(e => e.id === id)).filter(e => e && (e.type === 'mass' || e.type === 'csg'));
    if (sel.length !== 2) { App.toast('Seleziona due masse (Shift+clic) e riattiva lo strumento', 'warn'); setTool('select'); return; }
    const r = await App.form('Booleane su masse – Manifold', [{ name: 'op', label: 'Operazione', type: 'select', options: [{ value: 'diff', label: 'Sottrazione (prima − seconda)' }, { value: 'union', label: 'Unione' }, { value: 'inter', label: 'Intersezione' }] }], 'Esegui');
    setTool('select'); if (!r) return;
    const rec = e => e.type === 'mass' ? { op: 'prism', pts: e.pts, z0: e.z0 || 0, h: e.h } : e.recipe;
    try { const recipe = { op: r.op, a: rec(sel[0]), b: rec(sel[1]) }; const mesh = await K.csgBuild(recipe); removeIds(sel.map(e => e.id)); const e = add({ type: 'csg', recipe, mesh, material: sel[0].material || 'Massa', name: 'Solido CSG', level: sel[0].level }); commit('Booleana Manifold', [e.id]); }
    catch (err) { console.error(err); App.toast('Errore Manifold: ' + (err.message || err), 'err'); }
  }

  /* ---------- modelli IFC importati ---------- */
  async function loadImports() {
    for (const imp of bim.imports) { if (imp.visible === false) continue; try { const f = await App.files.get(imp.fileId); if (f) await addIFCToScene(f.data, imp); } catch (e) { console.warn(e); } }
    fit();
  }
  async function addIFCToScene(u8, imp) {
    const res = await K.readIFC(u8); const mats = {};
    res.parts.forEach(pt => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pt.pos, 3)); g.setIndex(new THREE.BufferAttribute(pt.idx, 1)); g.computeVertexNormals(); const key = pt.color.join(','); const m = mats[key] || (mats[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(pt.color[0], pt.color[1], pt.color[2]), transparent: pt.color[3] < 1, opacity: pt.color[3], side: THREE.DoubleSide, roughness: .8 }));
      const mesh = new THREE.Mesh(g, m); mesh.applyMatrix4(new THREE.Matrix4().fromArray(pt.mat)); mesh.userData = { eid: pt.eid, name: pt.name, ifcType: pt.type, model: imp.name, fileId: imp.fileId, imported: true, id: null }; mesh.castShadow = mesh.receiveShadow = true; imports.add(mesh); });
    return res;
  }
  S.addIFCToScene = addIFCToScene;

  /* ---------- interfaccia tipo Revit: QAT, scheda contestuale, barra opzioni, ViewCube ---------- */
  const VNAME = { persp: 'Vista 3D: {3D}', iso: 'Vista 3D: Assonometria', N: 'Prospetto: Nord', S: 'Prospetto: Sud', E: 'Prospetto: Est', W: 'Prospetto: Ovest' };
  const viewName = () => S.view === 'plan' ? 'Pianta dei pavimenti: ' + (M.levelOf(bim, bim.activeLevel) || {}).name : (VNAME[S.view] || 'Vista 3D');
  const PLACE = { wall: 'Posiziona muro', cwall: 'Posiziona muro curvo', door: 'Posiziona porta', window: 'Posiziona finestra', column: 'Posiziona pilastro', beam: 'Posiziona trave', slab: 'Crea contorno solaio', roof: 'Crea copertura', stair: 'Crea scala', space: 'Posiziona locale', curtain: 'Posiziona facciata continua', rail: 'Crea ringhiera', grid: 'Posiziona griglia', rect: 'Massa – rettangolo', pushpull: 'Spingi/Tira', move: 'Sposta', rotate: 'Ruota', tape: 'Misura', erase: 'Elimina' };
  function updateRvt() {
    if (!S) return;
    $('#bTitle').innerHTML = `<b>${esc(p.name)}</b> – ${esc(viewName())}`;
    $('#bDocTabs').innerHTML = `<span class="on">${App.icon(S.view === 'plan' ? 'grid' : 'cube', 12)} ${esc(viewName())}</span>`;
    const scale = S.view === 'persp' ? '—' : '1 : ' + (S.view === 'plan' ? 100 : 100); $('#bScale').textContent = scale;
    const ents = [...S.sel].map(id => bim.elements.find(e => e.id === id)).filter(Boolean);
    let ctx = '';
    if (ents.length) { const types = [...new Set(ents.map(e => M.TYPES[e.type].label))]; ctx = 'Modifica | ' + (types.length === 1 ? types[0] + (ents.length > 1 ? ' (' + ents.length + ')' : '') : 'Selezione multipla'); }
    else if (PLACE[S.tool]) ctx = 'Modifica | ' + PLACE[S.tool];
    const ct = $('#bCtxTab'); ct.textContent = ctx; ct.classList.toggle('hidden', !ctx);
    if (!ctx && ct.classList.contains('active')) showRb('arch');
    // barra delle opzioni
    const o = $('#bOpt'); o.classList.toggle('ctx', !!ctx);
    const lvSel = `<label>Livello:</label><select data-o="level">${bim.levels.map(l => `<option value="${l.id}" ${l.id === bim.activeLevel ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
    const d = S.defaults[S.tool] || {}; const num = (k, lab, ph = '') => `<label>${lab}:</label><input type="number" step="0.01" data-od="${k}" value="${d[k] ?? ''}" placeholder="${ph}">`;
    let opts = '';
    if (ents.length) opts = `${lvSel}<button class="btn sm" data-oa="typesDlg">Modifica tipo</button><button class="btn sm" data-oa="dup">Copia</button><button class="btn sm" data-oa="del">Elimina</button><span class="faint tiny">${ents.length} selezionati</span>`;
    else if (S.tool === 'wall') opts = `${lvSel}${num('h', 'Altezza', 'livello')}${num('thk', 'Spessore')}<label>Linea di ubicazione:</label><select><option>Asse muro</option><option>Asse nucleo</option><option>Finitura esterna</option><option>Finitura interna</option></select><label class="chk"><input type="checkbox" data-oc="chain" ${S.chain === false ? '' : 'checked'}> Catena</label><label>Offset:</label><input type="number" value="0" step="0.01"><label class="chk"><input type="checkbox" disabled> Raggio</label>`;
    else if (S.tool === 'door' || S.tool === 'window') opts = `${lvSel}${num('width', 'Larghezza')}${num('height', 'Altezza')}${S.tool === 'window' ? num('sill', 'Davanzale') : ''}<label class="chk"><input type="checkbox" checked disabled> Etichetta al posizionamento</label>`;
    else if (S.tool === 'column') opts = `${lvSel}${num('w', 'Larghezza')}${num('d', 'Profondità')}<label>Altezza:</label><select><option>Livello superiore</option></select>`;
    else if (S.tool === 'beam') opts = `${lvSel}${num('w', 'Base')}${num('hb', 'Altezza')}<label class="chk"><input type="checkbox" checked disabled> Catena</label>`;
    else if (['slab', 'roof', 'space'].includes(S.tool)) opts = `${lvSel}<label>Forma:</label><select data-o="shape"><option value="rect" ${$('#bShape').value === 'rect' ? 'selected' : ''}>Rettangolo</option><option value="poly" ${$('#bShape').value === 'poly' ? 'selected' : ''}>Poligono</option></select>${S.tool === 'roof' ? num('slope', 'Pendenza °') + num('overhang', 'Sporto') : S.tool === 'slab' ? num('thk', 'Spessore') : ''}`;
    else if (PLACE[S.tool]) opts = `${lvSel}<span class="faint tiny">${esc(HINT[S.tool] || '')}</span>`;
    else opts = `${lvSel}<span class="faint tiny">Seleziona un elemento o scegli uno strumento dalla barra multifunzione</span>`;
    o.innerHTML = `<b class="rvt-opt-t">${esc(ctx || 'Modifica')}</b>${opts}`;
    $$('[data-o=level]', o).forEach(x => x.onchange = () => { if (ents.length) { ents.forEach(e => e.level = x.value); commit('Cambia livello', ents.map(e => e.id)); } else { bim.activeLevel = x.value; renderLevels(); } });
    $$('[data-o=shape]', o).forEach(x => x.onchange = () => { $('#bShape').value = x.value; });
    $$('[data-od]', o).forEach(x => x.onchange = () => { const g = S.defaults[S.tool] = S.defaults[S.tool] || {}; if (x.value === '') delete g[x.dataset.od]; else g[x.dataset.od] = parseFloat(x.value); App.touch(p); renderSide0(); });
    $$('[data-oc=chain]', o).forEach(x => x.onchange = () => { S.chain = x.checked; });
    $$('[data-oa]', o).forEach(x => x.onclick = () => { const a = x.dataset.oa; if (a === 'del') { removeIds(ents.map(e => e.id)); commit('Elimina'); } else ribbonAct(a); });
  }
  S.updateRvt = updateRvt;
  $('#bCtxTab').onclick = () => showRb('ctx');
  // ViewCube
  function updateCube() {
    const cube = $('#bCube'); if (!cube) return; const dir = S.cam.position.clone().sub(controls.target); const len = dir.length() || 1;
    const yaw = Math.atan2(dir.x, dir.z), pitch = Math.asin(Math.max(-1, Math.min(1, dir.y / len)));
    cube.style.transform = `rotateX(${(-pitch * 180 / Math.PI).toFixed(2)}deg) rotateY(${(-yaw * 180 / Math.PI).toFixed(2)}deg)`;
    $('#bRing').style.transform = `rotateX(${(90 - pitch * 180 / Math.PI).toFixed(2)}deg) rotateZ(${(yaw * 180 / Math.PI).toFixed(2)}deg)`;
  }
  $$('[data-cube]').forEach(f => f.onclick = () => { const v = f.dataset.cube; setView(v === 'home' ? 'persp' : v); });
  // barra di navigazione
  $$('#bNav [data-nav]').forEach(b => b.onclick = () => { const a = b.dataset.nav; if (a === 'fit') return fit(); if (a === 'orbit' || a === 'pan') { setTool(S.tool === a ? 'select' : a); $$('#bNav [data-nav]').forEach(x => x.classList.toggle('on', x.dataset.nav === S.tool)); return; }
    const k = a === 'in' ? .8 : 1.25; if (S.cam === camP) { const d2 = camP.position.clone().sub(controls.target).multiplyScalar(k); camP.position.copy(controls.target).add(d2); } else { camO.userData.k = (camO.userData.k || 15) * k; resize(); } controls.update(); render(); });
  // barra di accesso rapido
  $$('.rvt-qat [data-q]').forEach(b => b.onclick = () => { const a = b.dataset.q; ({ open: App.openProjectDialog, save: () => { App.saveNow(); App.toast('Progetto salvato', 'ok'); }, undo: () => ribbonAct('undo'), redo: () => ribbonAct('redo'), tape: () => setTool('tape'), dim: () => setTool('tape'), text: () => App.toast('Le annotazioni di testo si inseriscono nelle tavole (Presentazione) o nel CAD', 'info'), v3d: () => setView('persp'), sec: () => ribbonAct('sec'), fit, help: () => { location.hash = '#/support'; } }[a] || (() => { }))(); });
  $('#bApp').onclick = ev => { const r = ev.currentTarget.getBoundingClientRect(); App.ctxMenu(r.left, r.bottom, [{ label: 'Nuovo progetto…', action: App.newProjectDialog }, { label: 'Apri progetto…', action: App.openProjectDialog }, { label: 'Salva', action: () => { App.saveNow(); App.toast('Progetto salvato', 'ok'); } }, { label: 'Esporta IFC4', action: () => ribbonAct('ifc') }, { label: 'Esporta glTF / OBJ / STEP', action: () => ribbonAct('exch') }, { label: 'Abachi e quantità', action: () => ribbonAct('schedules') }, { label: 'Chiudi', action: () => { location.hash = '#/home'; } }]); };
  $('#bInfo').onkeydown = e => { if (e.key === 'Enter') { App.palette(); setTimeout(() => { const i = $('.palette input'); if (i) { i.value = e.target.value; i.dispatchEvent(new Event('input')); } }, 30); } };
  // divisore tra Proprietà e Browser di progetto
  $('#bSplit').onpointerdown = e => { const left = $('#bLeft'), pp = $('#bPalProps'); const r = left.getBoundingClientRect(); const mv = ev => { const h = Math.max(140, Math.min(r.height - 140, ev.clientY - r.top)); pp.style.flex = `0 0 ${h}px`; }; const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  S.ready = true;
  renderLevels(); rebuild(); renderSide(); setTool('select'); setView('persp');
  if (bim.imports.length) loadImports(); else fit();
  if (!bim.elements.length && !bim.imports.length) App.toast('Modello vuoto: disegna, oppure usa “Modello dalla pianta parametrica” nel pannello Proprietà.');
}

/* ======================= ABACHI ======================= */
function schedules(body, p) {
  const bim = p.bim; const groups = {}; bim.elements.forEach(e => { if (e.type === 'ifcobj') return; (groups[e.type] = groups[e.type] || []).push(M.quantities(bim, e)); });
  const order = ['wall', 'cwall', 'curtain', 'slab', 'roof', 'column', 'beam', 'door', 'window', 'stair', 'rail', 'space', 'grid', 'mass', 'brep', 'csg'];
  const html = order.filter(t => groups[t]).map(t => { const rows = groups[t]; const cols = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(k => k !== 'tipo'); const tot = {}; cols.forEach(c => { if (rows.every(r => typeof r[c] === 'number' || r[c] === undefined) && /area|volume|lunghezza/.test(c)) tot[c] = rows.reduce((a, r) => a + (r[c] || 0), 0); });
    return `<div class="card"><div class="row between"><h4 style="margin:0">${App.appIcon('bim', 24)} ${esc(M.TYPES[t].label)} <span class="faint">(${rows.length})</span></h4><button class="btn sm" data-csv="${t}">CSV</button></div><div style="overflow:auto;margin-top:8px"><table class="tbl"><thead><tr>${cols.map(c => `<th>${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${typeof r[c] === 'number' ? 'num' : ''}">${typeof r[c] === 'number' ? App.fnum(r[c], 3) : esc(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}${Object.keys(tot).length ? `<tr style="font-weight:600">${cols.map(c => `<td class="num">${tot[c] != null ? App.fnum(tot[c], 2) : ''}</td>`).join('')}</tr>` : ''}</tbody></table></div></div>`; }).join('');
  const sumBy = (t, k) => (groups[t] || []).reduce((a, r) => a + (r[k] || 0), 0);
  body.innerHTML = `<div class="page"><div class="kpi" style="max-width:1100px"><div class="card"><b>${App.fnum(sumBy('space', 'area'), 1)} m²</b><span>superficie spazi</span></div><div class="card"><b>${App.fnum(sumBy('space', 'volume'), 1)} m³</b><span>volume spazi</span></div><div class="card"><b>${App.fnum(sumBy('wall', 'volume') + sumBy('cwall', 'volume'), 2)} m³</b><span>volume murature</span></div><div class="card"><b>${App.fnum(sumBy('slab', 'volume'), 2)} m³</b><span>volume solai</span></div><div class="card"><b>${(groups.door || []).length + (groups.window || []).length}</b><span>serramenti</span></div></div>
    <div class="row" style="margin:14px 0"><button class="btn" id="sAll">${App.icon('download', 15)} Esporta tutti gli abachi (CSV)</button></div>${html || '<div class="card empty">Nessun elemento nel modello BIM.</div>'}</div>`;
  const csv = rows => App.geoformats.toCSV(rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(4) : v]))), [...new Set(rows.flatMap(r => Object.keys(r)))]);
  $$('[data-csv]').forEach(b => b.onclick = () => App.download(`Abaco_${M.TYPES[b.dataset.csv].label}.csv`, csv(groups[b.dataset.csv]), 'text/csv'));
  $('#sAll').onclick = () => App.download('Abachi_' + App.slug(p.name) + '.csv', csv(Object.values(groups).flat()), 'text/csv');
}

/* ======================= IFC E SCAMBIO ======================= */
function exchange(body, p) {
  const bim = p.bim;
  body.innerHTML = `<div class="page"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;max-width:1200px">
    <div class="card"><h4>Esporta IFC4</h4><p class="small muted">Livelli come IfcBuildingStorey, elementi con classe IFC (IfcWall, IfcSlab, IfcColumn, IfcBeam, IfcRoof, IfcDoor, IfcWindow, IfcStair, IfcSpace), materiali, Pset standard e quantità. Geometria in IfcTriangulatedFaceSet.</p><button class="btn primary" id="xIfc">${App.icon('download', 15)} Scarica IFC</button><div id="xIfcChk" class="tiny" style="margin-top:8px"></div></div>
    <div class="card"><h4>Importa IFC (web-ifc)</h4><p class="small muted">Visualizza modelli IFC2x3/IFC4 di altri software (Revit, Archicad, …) come riferimento federato nel modello. Il file resta nell'archivio del progetto.</p><button class="btn" id="xImp">${App.icon('upload', 15)} Importa file IFC</button><div id="xImpL" style="margin-top:10px"></div></div>
    <div class="card"><h4>Altri formati</h4><div class="col"><button class="btn" id="xGlb">glTF binario (.glb)</button><button class="btn" id="xObj">OBJ</button><button class="btn" id="xStep">STEP dei solidi B-rep (OpenCascade)</button><button class="btn" id="xPng">Immagine della vista 3D (PNG)</button></div></div>
    <div class="card"><h4>Componenti open source</h4><ul class="small" style="margin:0;padding-left:18px;line-height:1.7"><li>three.js – visualizzazione 3D (MIT)</li><li>web-ifc – lettura e verifica IFC (MPL-2.0)</li><li>OpenCascade via replicad – kernel B-rep, STEP (LGPL-2.1 / MIT)</li><li>Manifold – booleane su mesh (Apache-2.0)</li><li>verb-nurbs – curve NURBS (MIT)</li></ul></div></div></div>`;
  const offscreen = () => { const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1600px;height:1000px'; document.body.appendChild(host); const sc = new THREE.Scene(); bim.elements.forEach(e => M.buildParts(bim, e).forEach(pt => { const m = new THREE.Mesh(pt.geom, new THREE.MeshStandardMaterial({ color: pt.color, transparent: !!pt.opacity, opacity: pt.opacity ?? 1 })); m.name = (e.name || M.TYPES[e.type].label) + '_' + e.id; sc.add(m); })); host.remove(); return sc; };
  $('#xIfc').onclick = async () => { const txt = M.exportIFC(bim, p, e => M.partsToPlanMesh(M.buildParts(bim, e).filter(pt => !pt.glass)), App.user && App.user.name, App.state.org.name); App.download(App.slug(p.name) + '.ifc', txt, 'application/x-step');
    // verifica di rilettura con web-ifc
    try { const r = await K.readIFC(new TextEncoder().encode(txt)); $('#xIfcChk').innerHTML = `<span class="ok">Verifica web-ifc: file valido (${esc(r.schema || 'IFC4')}), ${r.parts.length} geometrie lette · ${Object.entries(r.types).map(([k, v]) => `${esc(k)} ${v}`).join(', ')}</span>`; } catch (e) { $('#xIfcChk').innerHTML = `<span class="warn">Verifica web-ifc non eseguita: ${esc(e.message)}</span>`; } };
  const renderImp = () => { $('#xImpL').innerHTML = bim.imports.map(i => `<div class="file-row"><span class="file-ext ifc">IFC</span><div class="grow"><div class="small">${esc(i.name)}</div><div class="tiny faint">${i.count} geometrie · ${esc(i.schema || '')}</div></div><button class="btn sm ghost" data-r="${i.fileId}">${App.icon('trash', 14)}</button></div>`).join(''); $$('[data-r]').forEach(b => b.onclick = async () => { bim.imports = bim.imports.filter(x => x.fileId !== b.dataset.r); await App.files.del(b.dataset.r); App.touch(p); renderImp(); }); };
  renderImp();
  $('#xImp').onclick = async () => { const [f] = await App.pickFiles({ accept: '.ifc' }); if (!f) return; App.toast('Lettura IFC con web-ifc…'); try { const u8 = new Uint8Array(await App.readBuf(f)); const r = await K.readIFC(u8); const fileId = App.uid(); await App.files.put({ id: fileId, project: p.id, name: f.name, format: 'ifc', size: u8.length, at: App.now(), by: App.user ? App.user.name : '', data: u8 }); bim.imports.push({ fileId, name: f.name, count: r.parts.length, schema: r.schema, visible: true }); App.touch(p); App.audit('bim-ifc-import', f.name); renderImp(); App.toast(`IFC importato: ${r.parts.length} geometrie (${Object.keys(r.types).length} classi). Aprilo nella scheda Modello 3D.`, 'ok'); } catch (e) { console.error(e); App.toast('Errore IFC: ' + e.message, 'err'); } };
  $('#xGlb').onclick = () => new GLTFExporter().parse(offscreen(), res => App.download(App.slug(p.name) + '.glb', new Blob([res], { type: 'model/gltf-binary' })), err => App.toast(String(err), 'err'), { binary: true });
  $('#xObj').onclick = () => App.download(App.slug(p.name) + '.obj', new OBJExporter().parse(offscreen()), 'text/plain');
  $('#xStep').onclick = async () => { const b = bim.elements.filter(e => e.type === 'brep'); if (!b.length) { App.toast('Nessun solido B-rep nel modello', 'warn'); return; } try { App.toast('Generazione STEP con OpenCascade…'); App.download(App.slug(p.name) + '.step', await K.brepSTEP(b.map(e => e.recipe))); } catch (e) { App.toast('Errore STEP: ' + e.message, 'err'); } };
  $('#xPng').onclick = () => { location.hash = '#/bim/model'; setTimeout(() => S && S.renderer.domElement.toBlob(b => App.download(App.slug(p.name) + '_3D.png', b)), 900); };
}
