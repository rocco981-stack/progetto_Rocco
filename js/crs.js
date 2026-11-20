/* BeCity – sistemi di riferimento e riproiezioni (TM, UTM, Gauss-Boaga, Web Mercator, Helmert 7 parametri) */
'use strict';
(function () {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const ELL = { WGS84: { a: 6378137, f: 1 / 298.257223563 }, GRS80: { a: 6378137, f: 1 / 298.257222101 }, INTL: { a: 6378388, f: 1 / 297 } };
  const ROMA40 = [-104.1, -49.1, -9.9, 0.971, -2.917, 0.714, -11.68], ED50 = [-87, -98, -121, 0, 0, 0, 0];
  const utm = (z, ell = 'WGS84', tw) => ({ type: 'tm', ell, lon0: -183 + 6 * z, k0: 0.9996, fe: 500000, fn: 0, towgs: tw });
  const C = {
    'EPSG:4326': { name: 'WGS 84 (geografiche)', type: 'geo', ell: 'WGS84' },
    'EPSG:4258': { name: 'ETRS89 (geografiche)', type: 'geo', ell: 'GRS80' },
    'EPSG:6706': { name: 'RDN2008 (geografiche)', type: 'geo', ell: 'GRS80' },
    'EPSG:3857': { name: 'WGS 84 / Pseudo-Mercator', type: 'merc' },
    'EPSG:32632': { name: 'WGS 84 / UTM 32N', ...utm(32) }, 'EPSG:32633': { name: 'WGS 84 / UTM 33N', ...utm(33) }, 'EPSG:32634': { name: 'WGS 84 / UTM 34N', ...utm(34) },
    'EPSG:25832': { name: 'ETRS89 / UTM 32N', ...utm(32, 'GRS80') }, 'EPSG:25833': { name: 'ETRS89 / UTM 33N', ...utm(33, 'GRS80') },
    'EPSG:6707': { name: 'RDN2008 / UTM 32N (N-E)', ...utm(32, 'GRS80') }, 'EPSG:6708': { name: 'RDN2008 / UTM 33N (N-E)', ...utm(33, 'GRS80') }, 'EPSG:6709': { name: 'RDN2008 / UTM 34N (N-E)', ...utm(34, 'GRS80') },
    'EPSG:7791': { name: 'RDN2008 / UTM 32N', ...utm(32, 'GRS80') }, 'EPSG:7792': { name: 'RDN2008 / UTM 33N', ...utm(33, 'GRS80') }, 'EPSG:7793': { name: 'RDN2008 / UTM 34N', ...utm(34, 'GRS80') },
    'EPSG:7794': { name: 'RDN2008 / Italy zone (fuso Italia)', type: 'tm', ell: 'GRS80', lon0: 12, k0: 0.9985, fe: 7000000, fn: 0 },
    'EPSG:6875': { name: 'RDN2008 / Italy zone (N-E)', type: 'tm', ell: 'GRS80', lon0: 12, k0: 0.9985, fe: 7000000, fn: 0 },
    'EPSG:3003': { name: 'Monte Mario / Italy zone 1 (Gauss-Boaga Ovest)', type: 'tm', ell: 'INTL', lon0: 9, k0: 0.9996, fe: 1500000, fn: 0, towgs: ROMA40 },
    'EPSG:3004': { name: 'Monte Mario / Italy zone 2 (Gauss-Boaga Est)', type: 'tm', ell: 'INTL', lon0: 15, k0: 0.9996, fe: 2520000, fn: 0, towgs: ROMA40 },
    'EPSG:4265': { name: 'Monte Mario (geografiche)', type: 'geo', ell: 'INTL', towgs: ROMA40 },
    'EPSG:23032': { name: 'ED50 / UTM 32N', ...utm(32, 'INTL', ED50) }, 'EPSG:23033': { name: 'ED50 / UTM 33N', ...utm(33, 'INTL', ED50) }, 'EPSG:23034': { name: 'ED50 / UTM 34N', ...utm(34, 'INTL', ED50) },
    'EPSG:4230': { name: 'ED50 (geografiche)', type: 'geo', ell: 'INTL', towgs: ED50 }
  };
  const ep = e => { const f = ELL[e].f; return { a: ELL[e].a, e2: f * (2 - f) }; };
  function tmFwd(lat, lon, p) {
    const { a, e2 } = ep(p.ell), ep2 = e2 / (1 - e2), phi = lat * D2R, lam = (lon - p.lon0) * D2R;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, Cc = ep2 * Math.cos(phi) ** 2, A = lam * Math.cos(phi);
    const e4 = e2 * e2, e6 = e4 * e2;
    const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi) + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - (35 * e6 / 3072) * Math.sin(6 * phi));
    const x = p.k0 * N * (A + (1 - T + Cc) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * Cc - 58 * ep2) * A ** 5 / 120) + p.fe;
    const y = p.k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * Cc + 4 * Cc * Cc) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * Cc - 330 * ep2) * A ** 6 / 720)) + p.fn;
    return [x, y];
  }
  function tmInv(x, y, p) {
    const { a, e2 } = ep(p.ell), ep2 = e2 / (1 - e2), e4 = e2 * e2, e6 = e4 * e2;
    const M = (y - p.fn) / p.k0, mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
    const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(p1) ** 2, 1.5), D = (x - p.fe) / (N1 * p.k0);
    const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
    const lon = p.lon0 * D2R + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
    return [lat * R2D, lon * R2D];
  }
  function toEcef(lat, lon, ell) { const { a, e2 } = ep(ell), p = lat * D2R, l = lon * D2R, N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2); return [N * Math.cos(p) * Math.cos(l), N * Math.cos(p) * Math.sin(l), N * (1 - e2) * Math.sin(p)]; }
  function fromEcef(X, Y, Z, ell) { const { a, e2 } = ep(ell), lon = Math.atan2(Y, X), p = Math.hypot(X, Y); let lat = Math.atan2(Z, p * (1 - e2)); for (let i = 0; i < 6; i++) { const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2); const h = p / Math.cos(lat) - N; lat = Math.atan2(Z, p * (1 - e2 * N / (N + h))); } return [lat * R2D, lon * R2D]; }
  const AS = Math.PI / 648000;
  function helmert(X, t, inv) { const [tx, ty, tz, rx0, ry0, rz0, s0] = t, rx = rx0 * AS, ry = ry0 * AS, rz = rz0 * AS, s = 1 + s0 * 1e-6;
    if (!inv) return [tx + s * (X[0] - rz * X[1] + ry * X[2]), ty + s * (rz * X[0] + X[1] - rx * X[2]), tz + s * (-ry * X[0] + rx * X[1] + X[2])];
    const v = [(X[0] - tx) / s, (X[1] - ty) / s, (X[2] - tz) / s]; return [v[0] + rz * v[1] - ry * v[2], -rz * v[0] + v[1] + rx * v[2], ry * v[0] - rx * v[1] + v[2]]; }
  /** coordinate CRS → [lon,lat] WGS84 */
  function toWgs(x, y, code) {
    const c = C[code]; if (!c) throw new Error('CRS non supportato: ' + code);
    if (c.type === 'merc') return [x / 6378137 * R2D, (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * R2D];
    let lat, lon; if (c.type === 'geo') { lon = x; lat = y; } else [lat, lon] = tmInv(x, y, c);
    if (c.towgs) { const E = helmert(toEcef(lat, lon, c.ell), c.towgs, false); [lat, lon] = fromEcef(E[0], E[1], E[2], 'WGS84'); }
    return [lon, lat];
  }
  function fromWgs(lon, lat, code) {
    const c = C[code]; if (!c) throw new Error('CRS non supportato: ' + code);
    if (c.type === 'merc') { const la = Math.max(-85.0511, Math.min(85.0511, lat)); return [lon * D2R * 6378137, Math.log(Math.tan(Math.PI / 4 + la * D2R / 2)) * 6378137]; }
    if (c.towgs) { const E = helmert(toEcef(lat, lon, 'WGS84'), c.towgs, true); [lat, lon] = fromEcef(E[0], E[1], E[2], c.ell); }
    if (c.type === 'geo') return [lon, lat];
    return tmFwd(lat, lon, c);
  }
  function detectPrj(wkt) {
    if (!wkt) return null; const w = wkt.replace(/\s+/g, '');
    const auth = [...w.matchAll(/AUTHORITY\["EPSG","?(\d+)"?\]/gi)]; if (auth.length) { const code = 'EPSG:' + auth[auth.length - 1][1]; if (C[code]) return code; }
    const id = w.match(/ID\["EPSG",(\d+)\]\]*$/i); if (id && C['EPSG:' + id[1]]) return 'EPSG:' + id[1];
    const L = w.toLowerCase();
    const zone = (L.match(/utm[_ ]?zone[_ ]?(\d\d)/) || L.match(/utm(\d\d)n/) || [])[1];
    if (L.includes('monte_mario') || L.includes('montemario') || L.includes('roma40') || L.includes('gauss')) { if (L.includes('zone_2') || L.includes('zone2') || L.includes('italy_2') || L.includes('est') || L.includes('2520000')) return 'EPSG:3004'; if (L.includes('projcs')) return 'EPSG:3003'; return 'EPSG:4265'; }
    if (L.includes('rdn2008') || L.includes('rdn_2008')) { if (L.includes('italy') || L.includes('7000000')) return 'EPSG:7794'; if (zone) return 'EPSG:' + (7759 + +zone); return 'EPSG:6706'; }
    if (L.includes('ed50') || L.includes('european_1950') || L.includes('ed_1950')) { if (zone) return 'EPSG:' + (23000 + +zone); return 'EPSG:4230'; }
    if (L.includes('etrs') || L.includes('etrf')) { if (zone) return 'EPSG:' + (25800 + +zone); return 'EPSG:4258'; }
    if (L.includes('pseudo') || L.includes('web_mercator') || L.includes('mercator_auxiliary')) return 'EPSG:3857';
    if (zone) return 'EPSG:' + (32600 + +zone);
    if (L.startsWith('geogcs') && L.includes('wgs')) return 'EPSG:4326';
    return null;
  }
  function wktOf(code) {
    const c = C[code]; if (!c) return '';
    const sph = { WGS84: 'SPHEROID["WGS_1984",6378137.0,298.257223563]', GRS80: 'SPHEROID["GRS_1980",6378137.0,298.257222101]', INTL: 'SPHEROID["International_1924",6378388.0,297.0]' }[c.ell || 'WGS84'];
    const dat = { WGS84: 'D_WGS_1984', GRS80: code.match(/6706|67|77|687/) ? 'D_Rete_Dinamica_Nazionale_2008' : 'D_ETRS_1989', INTL: c.towgs === ROMA40 ? 'D_Monte_Mario' : 'D_European_1950' }[c.ell || 'WGS84'];
    const geog = `GEOGCS["GCS_${dat.slice(2)}",DATUM["${dat}",${sph}],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`;
    if (c.type === 'geo') return geog;
    if (c.type === 'merc') return 'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",0.0],PARAMETER["Standard_Parallel_1",0.0],PARAMETER["Auxiliary_Sphere_Type",0.0],UNIT["Meter",1.0]]';
    return `PROJCS["${c.name.replace(/[^\w]+/g, '_')}",${geog},PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",${c.fe}],PARAMETER["False_Northing",${c.fn}],PARAMETER["Central_Meridian",${c.lon0}],PARAMETER["Scale_Factor",${c.k0}],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0],AUTHORITY["EPSG",${code.split(':')[1]}]]`;
  }
  App.crs = {
    defs: C, toWgs, fromWgs, detectPrj, wktOf,
    transform(x, y, from, to) { if (from === to) return [x, y]; const [lo, la] = toWgs(x, y, from); return fromWgs(lo, la, to); },
    list: () => Object.entries(C).map(([k, v]) => ({ code: k, name: v.name })),
    isGeo: code => C[code] && C[code].type === 'geo',
    note: 'Trasformazioni di datum con 7 parametri (Helmert): accuratezza indicativa 1–3 m per Roma40/ED50. I grigliati IGM (.gr1/.gsb) non sono inclusi nella versione offline.'
  };
})();
