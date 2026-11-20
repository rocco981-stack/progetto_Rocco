/* BeCity BIM – caricamento lazy dei kernel geometrici open source:
   OpenCascade (B-rep, via replicad, LGPL-2.1/MIT), Manifold (CSG su mesh, Apache-2.0),
   verb-nurbs (NURBS, MIT), web-ifc (lettura IFC, MPL-2.0). */
const base = new URL('../../vendor/', import.meta.url).href;
let ocP = null, manP = null, verbP = null, ifcP = null;

export function loadOC() {
  if (!ocP) ocP = (async () => {
    const [{ default: opencascade }, replicad] = await Promise.all([import(base + 'replicad/replicad_single.js'), import('replicad')]);
    const OC = await opencascade({ locateFile: () => base + 'replicad/replicad_single.wasm' });
    replicad.setOC(OC);
    return replicad;
  })();
  return ocP;
}
export function loadManifold() {
  if (!manP) manP = (async () => {
    const { default: Module } = await import(base + 'manifold/manifold.js');
    const wasm = await Module({ locateFile: () => base + 'manifold/manifold.wasm' });
    wasm.setup();
    return wasm;
  })();
  return manP;
}
export function loadVerb() {
  if (!verbP) verbP = import(base + 'verb/verb.es.js').then(m => m.default || m.verb || m);
  return verbP;
}
export function loadIFC() {
  if (!ifcP) ifcP = (async () => {
    const WebIFC = await import('web-ifc');
    const api = new WebIFC.IfcAPI();
    api.SetWasmPath(base + 'web-ifc/', true);
    await api.Init();
    return { api, WebIFC };
  })();
  return ifcP;
}

/* ---------- ricette B-rep (OpenCascade) ---------- */
// recipe: {op:'box',w,d,h} | {op:'cyl',r,h} | {op:'sphere',r} | {op:'prism',pts,h} | {op:'cone',r1,r2,h}
//         | {op:'fuse'|'cut'|'common', a, b} | {op:'fillet', a, r} | {op:'chamfer', a, r} | {op:'shell', a, t}
//         | {op:'move', a, v:[x,y,z]} | {op:'rotate', a, deg}
export async function brepBuild(recipe) {
  const R = await loadOC();
  const build = r => {
    switch (r.op) {
      case 'box': return R.makeBaseBox(r.w, r.d, r.h).translate([r.w / 2, r.d / 2, 0]);
      case 'cyl': return R.makeCylinder(r.r, r.h);
      case 'cone': return R.drawCircle(r.r1).sketchOnPlane().loftWith(R.drawCircle(Math.max(1e-3, r.r2)).sketchOnPlane('XY', r.h));
      case 'sphere': return R.makeSphere(r.r).translate([0, 0, r.r]);
      case 'prism': { let d = R.draw(r.pts[0]); for (const p of r.pts.slice(1)) d = d.lineTo(p); return d.close().sketchOnPlane().extrude(r.h); }
      case 'fuse': return build(r.a).fuse(build(r.b));
      case 'cut': return build(r.a).cut(build(r.b));
      case 'common': return build(r.a).intersect(build(r.b));
      case 'fillet': return build(r.a).fillet(r.r);
      case 'chamfer': return build(r.a).chamfer(r.r);
      case 'shell': return build(r.a).shell(r.t, f => f.inPlane('XY', topZ(r.a)));
      case 'move': return build(r.a).translate(r.v);
      case 'rotate': return build(r.a).rotate(r.deg, [0, 0, 0], [0, 0, 1]);
      default: throw new Error('Operazione B-rep sconosciuta: ' + r.op);
    }
  };
  const shape = build(recipe);
  const m = shape.mesh({ tolerance: 0.01, angularTolerance: 15 });
  return { shape, mesh: { pos: Array.from(m.vertices, v => Math.round(v * 1e4) / 1e4), idx: Array.from(m.triangles) } };
}
function topZ(r) { if (r.op === 'box' || r.op === 'cyl' || r.op === 'prism' || r.op === 'cone') return r.h; if (r.op === 'sphere') return 2 * r.r; if (r.op === 'move') return topZ(r.a) + r.v[2]; if (r.a) return topZ(r.a); return 0; }
export async function brepSTEP(recipes) {
  const R = await loadOC();
  const shapes = []; for (const r of recipes) shapes.push((await brepBuild(r)).shape);
  let s = shapes[0]; for (const x of shapes.slice(1)) s = s.fuse(x);
  return s.blobSTEP();
}

/* ---------- CSG su prismi (Manifold) ---------- */
// mrecipe: {op:'prism', pts, z0, h} | {op:'union'|'diff'|'inter', a, b}
export async function csgBuild(rec) {
  const W = await loadManifold();
  const { Manifold, CrossSection } = W;
  const build = r => {
    if (r.op === 'prism') { let pts = r.pts.slice(); let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } if (a < 0) pts.reverse(); return new CrossSection([pts]).extrude(r.h).translate([0, 0, r.z0 || 0]); }
    const A = build(r.a), B = build(r.b);
    return r.op === 'union' ? A.add(B) : r.op === 'diff' ? A.subtract(B) : A.intersect(B);
  };
  const m = build(rec).getMesh(); const np = m.numProp; const pos = [];
  for (let i = 0; i < m.vertProperties.length; i += np) pos.push(+m.vertProperties[i].toFixed(4), +m.vertProperties[i + 1].toFixed(4), +m.vertProperties[i + 2].toFixed(4));
  return { pos, idx: Array.from(m.triVerts) };
}

/* ---------- NURBS (verb) per muri curvi ---------- */
export async function nurbsArc(p0, pm, p1, segments = 24) {
  const verb = await loadVerb();
  const crv = verb.geom.NurbsCurve.byPoints([[p0[0], p0[1], 0], [pm[0], pm[1], 0], [p1[0], p1[1], 0]], 2);
  const out = []; for (let i = 0; i <= segments; i++) { const p = crv.point(i / segments); out.push([+p[0].toFixed(4), +p[1].toFixed(4)]); }
  return out;
}

/* ---------- import IFC (web-ifc) ---------- */
export async function readIFC(u8, onProgress) {
  const { api, WebIFC } = await loadIFC();
  const id = api.OpenModel(u8, { COORDINATE_TO_ORIGIN: false });
  const parts = []; const types = {};
  api.StreamAllMeshes(id, mesh => {
    const eid = mesh.expressID; let name = '', type = '';
    try { const line = api.GetLine(id, eid); name = line && line.Name && line.Name.value || ''; type = api.GetNameFromTypeCode ? api.GetNameFromTypeCode(line.type) : String(line.type); } catch (e) { }
    types[type] = (types[type] || 0) + 1;
    const geoms = mesh.geometries;
    for (let i = 0; i < geoms.size(); i++) {
      const pg = geoms.get(i); const g = api.GetGeometry(id, pg.geometryExpressID);
      const v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()); const ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());
      const pos = new Float32Array(v.length / 2); for (let k = 0, j = 0; k < v.length; k += 6) { pos[j++] = v[k]; pos[j++] = v[k + 1]; pos[j++] = v[k + 2]; }
      parts.push({ eid, name, type, pos, idx: new Uint32Array(ix), mat: pg.flatTransformation.slice(), color: [pg.color.x, pg.color.y, pg.color.z, pg.color.w] });
      g.delete();
    }
    if (onProgress && parts.length % 200 === 0) onProgress(parts.length);
  });
  let schema = ''; try { schema = api.GetModelSchema(id); } catch (e) { }
  api.CloseModel(id);
  return { parts, types, schema };
}
