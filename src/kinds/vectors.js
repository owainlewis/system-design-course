/* Vectors: nearest-neighbour search over embeddings, drawn in two dimensions.
   Figure def: { kind: 'vectors', scene | scenarios: { key: { label, note, scene } } }
   scene: { period, clusters: [{ label, x, y }], per, spread, query: { x, y, label }, k, mode: 'exact' | 'ivf', probe }
   x and y are in 0..1. 'exact' compares the query with every vector. 'ivf' first compares it with each cluster's
   centre, then only with the vectors in the nearest probe clusters, so it can miss a true neighbour. */
const VE_SCAN = 4.5, VE_START = 0.6, VE_CENT = 1.0;

function veScene(f) { return f.def.scenarios ? f.def.scenarios[f.ctrl.scenario ?? Object.keys(f.def.scenarios)[0]].scene : f.def.scene; }
const veCache = new Map();
function veSimulate(s) {
  const key = JSON.stringify(s); if (veCache.has(key)) return veCache.get(key);
  const r = rng(31), pts = [], g = () => { let u = 0; for (let i = 0; i < 4; i++) u += r(); return (u - 2) / 1.15; };
  s.clusters.forEach((c, ci) => { for (let i = 0; i < s.per; i++) pts.push({ x: clamp(c.x + g() * s.spread, .02, .98), y: clamp(c.y + g() * s.spread, .04, .96), c: ci }); });
  const d = p => Math.hypot(p.x - s.query.x, p.y - s.query.y);
  pts.forEach(p => p.d = d(p));
  const truth = [...pts].sort((a, b) => a.d - b.d).slice(0, s.k);
  // centres are the mean of each cluster's points, as k-means would find
  const cents = s.clusters.map((c, ci) => { const m = pts.filter(p => p.c === ci); return { x: m.reduce((a, p) => a + p.x, 0) / m.length, y: m.reduce((a, p) => a + p.y, 0) / m.length, c: ci }; });
  cents.forEach(c => c.d = d(c));
  const probed = s.mode === 'ivf' ? [...cents].sort((a, b) => a.d - b.d).slice(0, s.probe || 1).map(c => c.c) : cents.map(c => c.c);
  const scan = pts.filter(p => probed.includes(p.c)), per = VE_SCAN / pts.length, t0 = VE_START + (s.mode === 'ivf' ? VE_CENT : 0);
  scan.forEach((p, i) => p.at = t0 + i * per);
  const found = [...scan].sort((a, b) => a.d - b.d).slice(0, s.k), done = t0 + scan.length * per;
  const sim = { s, pts, truth, cents, probed, scan, found, done, recall: found.filter(p => truth.includes(p)).length };
  veCache.set(key, sim); return sim;
}

KINDS.vectors = {
  period: f => veScene(f).period,
  init(f) {
    if (f.def.scenarios && f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (f.def.scenarios && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const s = veScene(f), sim = veSimulate(s), now = f.t;
    const { ctx, w, h } = fitCanvas(f.cv, ww => ww < 600 ? 330 : 380);
    const pad = 22, Sy = h - 2 * pad, Sx = Math.min(w - 2 * pad, Sy * 1.3), X = x => w / 2 + (x - .5) * Sx, Y = y => pad + y * Sy, R = s.spread * 2.3;
    const ivf = s.mode === 'ivf', centOn = ivf && now >= VE_START, picked = ivf && now >= VE_START + VE_CENT * .7, finished = now >= sim.done;

    // cluster centres and their regions (ivf only)
    if (centOn) sim.cents.forEach(c => {
      const on = sim.probed.includes(c.c) && picked;
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = on ? rgba(COL.accent, .9) : COL.hair2; ctx.lineWidth = on ? 1.4 : 1;
      ctx.beginPath(); ctx.ellipse(X(c.x), Y(c.y), R * Sx, R * Sy, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      if (now < VE_START + VE_CENT) { ctx.strokeStyle = rgba(COL.ink2, .35); line(ctx, { x: X(s.query.x), y: Y(s.query.y) }, { x: X(c.x), y: Y(c.y) }); }
    });
    // points
    for (const p of sim.pts) {
      const checked = p.at != null && now >= p.at, flash = checked && now - p.at < .25;
      dot(ctx, X(p.x), Y(p.y), flash ? 4.5 : 3, rgba(COL['s' + p.c], checked ? .95 : .4));
    }
    s.clusters.forEach(c => { const above = Y(c.y) - R * Sy - 9; text(ctx, c.label, X(c.x), above > 10 && c.y < .5 ? above : Y(c.y) + R * Sy + 12, { align: 'center', size: 11.5, weight: 500, color: COL.ink2 }); });
    // results: best found so far while scanning, final when done
    const seen = sim.scan.filter(p => now >= p.at), best = [...seen].sort((a, b) => a.d - b.d).slice(0, s.k);
    const Q = { x: X(s.query.x), y: Y(s.query.y) };
    best.forEach(p => { ctx.strokeStyle = finished ? COL.accent : rgba(COL.accent, .45); ctx.lineWidth = finished ? 1.5 : 1; line(ctx, Q, { x: X(p.x), y: Y(p.y) }); ctx.lineWidth = 1; });
    const missed = finished ? sim.truth.filter(p => !sim.found.includes(p)) : [];
    missed.forEach(p => { ctx.strokeStyle = COL.red; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 7, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; });
    if (missed.length) { const p = missed.reduce((a, b) => (b.x > a.x ? b : a)); text(ctx, `${missed.length} missed`, X(p.x) + 11, Y(p.y) + 1, { size: 10.5, font: MONO, weight: 500, color: COL.red }); }
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(Q.x, Q.y, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COL.bg; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    tag(ctx, Q.x, Q.y + 22, s.query.label);

    if (!wantStats) return null;
    const note = f.def.scenarios?.[f.ctrl.scenario]?.note;
    const cmp = seen.length + (centOn ? sim.cents.length : 0);
    return `<span>${cmp} distances computed</span>` + (finished ? `<span class="${sim.recall < s.k ? 'bad' : 'pass'}">found ${sim.recall} of the ${s.k} true nearest</span>` : `<span>searching…</span>`) + (note ? `<span>${note}</span>` : '');
  }
};
