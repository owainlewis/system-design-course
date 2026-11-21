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

function veVoronoiCell(cents, ci) {
  const a = cents[ci];
  let poly = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  for (let cj = 0; cj < cents.length; cj++) {
    if (cj === ci || !poly.length) continue;
    const b = cents[cj], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = b.x - a.x, ny = b.y - a.y;
    const val = p => (p.x - mx) * nx + (p.y - my) * ny;
    const next = [];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length], v1 = val(p1), v2 = val(p2);
      if (v1 <= 0) next.push(p1);
      if ((v1 <= 0) !== (v2 <= 0)) {
        const f = v1 / (v1 - v2);
        next.push({ x: p1.x + f * (p2.x - p1.x), y: p1.y + f * (p2.y - p1.y) });
      }
    }
    poly = next;
  }
  return poly;
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
    const { ctx, w, h } = fitCanvas(f.cv, ww => ww < 600 ? 340 : 400);
    const wide = w >= 640, panelW = wide ? 210 : 0, pad = 22;
    const plotW = w - panelW - pad * 2, plotH = h - pad * 2;
    const S = Math.min(plotW, plotH), ox = pad + (plotW - S) / 2, oy = pad + (plotH - S) / 2;
    const X = x => ox + x * S, Y = y => oy + y * S;
    const ivf = s.mode === 'ivf', centOn = ivf && now >= VE_START, picked = ivf && now >= VE_START + VE_CENT * .7, finished = now >= sim.done;

    // coordinate frame
    rr(ctx, ox, oy, S, S, 8); ctx.fillStyle = rgba(COL.node, .55); ctx.fill();
    ctx.strokeStyle = COL.hair; ctx.lineWidth = 1; ctx.stroke();

    // Voronoi cells & cluster centres (IVF)
    if (centOn) {
      ctx.save(); rr(ctx, ox, oy, S, S, 8); ctx.clip();
      sim.cents.forEach(c => {
        const poly = veVoronoiCell(sim.cents, c.c), on = sim.probed.includes(c.c) && picked;
        if (poly.length > 2) {
          ctx.beginPath();
          poly.forEach((pt, idx) => idx ? ctx.lineTo(X(pt.x), Y(pt.y)) : ctx.moveTo(X(pt.x), Y(pt.y)));
          ctx.closePath();
          if (on) { ctx.fillStyle = rgba(COL.accent, .09); ctx.fill(); }
          ctx.strokeStyle = on ? rgba(COL.accent, .85) : COL.hair2;
          ctx.lineWidth = on ? 1.5 : 1;
          ctx.setLineDash(on ? [] : [4, 4]);
          ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
        }
        if (now < VE_START + VE_CENT) {
          ctx.strokeStyle = rgba(COL.ink2, .45); ctx.setLineDash([2, 3]);
          line(ctx, { x: X(s.query.x), y: Y(s.query.y) }, { x: X(c.x), y: Y(c.y) });
          ctx.setLineDash([]);
        }
      });
      ctx.restore();
    }

    // points
    for (const p of sim.pts) {
      const checked = p.at != null && now >= p.at, flash = checked && now - p.at < .25;
      const col = COL['s' + p.c];
      if (flash) dot(ctx, X(p.x), Y(p.y), 7.5, rgba(col, .25));
      dot(ctx, X(p.x), Y(p.y), flash ? 4.4 : 3.2, rgba(col, checked ? 1 : .42));
    }

    // explicit centroid markers in IVF mode
    if (centOn) sim.cents.forEach(c => {
      const cx = X(c.x), cy = Y(c.y), on = sim.probed.includes(c.c) && picked;
      const col = on ? COL.accent : COL.ink2;
      ctx.fillStyle = COL.node; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
      line(ctx, { x: cx - 3.5, y: cy }, { x: cx + 3.5, y: cy });
      line(ctx, { x: cx, y: cy - 3.5 }, { x: cx, y: cy + 3.5 });
      ctx.lineWidth = 1;
    });

    // cluster labels positioned cleanly near cluster centres
    s.clusters.forEach((c, ci) => {
      const offY = c.y < .5 ? -s.spread * 2.2 * S - 10 : s.spread * 2.2 * S + 14;
      const ly = clamp(Y(c.y) + offY, oy + 14, oy + S - 12);
      const on = centOn && picked && sim.probed.includes(ci);
      text(ctx, c.label, X(c.x), ly, { align: 'center', size: 11.5, weight: on ? 600 : 500, color: on ? COL.accent : COL.ink2 });
    });

    // results: best found so far while scanning, final when done
    const seen = sim.scan.filter(p => now >= p.at), best = [...seen].sort((a, b) => a.d - b.d).slice(0, s.k);
    const Q = { x: X(s.query.x), y: Y(s.query.y) };
    best.forEach(p => {
      ctx.strokeStyle = finished ? COL.accent : rgba(COL.accent, .5); ctx.lineWidth = finished ? 1.6 : 1.1;
      line(ctx, Q, { x: X(p.x), y: Y(p.y) }); ctx.lineWidth = 1;
      if (finished) { ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 5.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1; }
    });
    const missed = finished ? sim.truth.filter(p => !sim.found.includes(p)) : [];
    missed.forEach(p => {
      dot(ctx, X(p.x), Y(p.y), 9, rgba(COL.red, .14));
      ctx.strokeStyle = COL.red; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 6.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    });
    if (missed.length) {
      const p = missed.reduce((a, b) => (b.x > a.x ? b : a));
      const lx = Math.min(ox + S - 44, X(p.x) + 34), ly = Math.min(oy + S - 14, Y(p.y) + 28);
      ctx.strokeStyle = rgba(COL.red, .7); ctx.lineWidth = 1;
      line(ctx, { x: X(p.x) + 4, y: Y(p.y) + 6 }, { x: lx - 12, y: ly - 9 });
      pillLabel(ctx, `${missed.length} missed`, lx, ly, { size: 10.5, font: MONO, weight: 500, color: COL.red, bg: COL.node, border: rgba(COL.red, .45) });
    }
    dot(ctx, Q.x, Q.y, 10, rgba(COL.accent, .14));
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(Q.x, Q.y, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COL.node; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    tag(ctx, Q.x, Q.y + 22, s.query.label);

    // right-hand info panel on desktop so canvas space is balanced and scannable
    if (wide) {
      const px = ox + S + 24, pw = w - px - 18, py = oy + 12;
      text(ctx, ivf ? 'IVF clusters' : 'All vectors', px, py, { size: 11.5, weight: 600, color: COL.ink });
      s.clusters.forEach((c, ci) => {
        const y = py + 26 + ci * 28, on = !ivf || (picked && sim.probed.includes(ci));
        const cnt = sim.pts.filter(p => p.c === ci && p.at != null && now >= p.at).length;
        dot(ctx, px + 5, y, 4, rgba(COL['s' + ci], on ? 1 : .35));
        text(ctx, c.label, px + 16, y, { size: 12, weight: on ? 500 : 400, color: on ? COL.ink : COL.muted });
        text(ctx, `${cnt}/${s.per}`, px + pw, y, { align: 'right', size: 11, font: MONO, color: on ? COL.ink2 : COL.muted });
      });
      const ly = py + 152;
      ctx.strokeStyle = COL.hair; line(ctx, { x: px, y: ly }, { x: px + pw, y: ly });
      text(ctx, 'Legend', px, ly + 18, { size: 11, font: MONO, color: COL.muted });
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(px + 5, ly + 40, 4, 0, Math.PI * 2); ctx.fill();
      text(ctx, 'Query vector', px + 16, ly + 40, { size: 11.5, color: COL.ink2 });
      ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.5; line(ctx, { x: px, y: ly + 62 }, { x: px + 10, y: ly + 62 }); ctx.lineWidth = 1;
      text(ctx, `Top-${s.k} match`, px + 16, ly + 62, { size: 11.5, color: COL.ink2 });
      if (ivf) {
        ctx.strokeStyle = COL.ink2; ctx.lineWidth = 1.3;
        line(ctx, { x: px + 1, y: ly + 84 }, { x: px + 9, y: ly + 84 });
        line(ctx, { x: px + 5, y: ly + 80 }, { x: px + 5, y: ly + 88 }); ctx.lineWidth = 1;
        text(ctx, 'Cluster centre', px + 16, ly + 84, { size: 11.5, color: COL.ink2 });
        ctx.strokeStyle = COL.red; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(px + 5, ly + 106, 4.5, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
        text(ctx, 'Missed neighbour', px + 16, ly + 106, { size: 11.5, color: COL.ink2 });
      }
    }

    if (!wantStats) return null;
    const note = f.def.scenarios?.[f.ctrl.scenario]?.note;
    const cmp = seen.length + (centOn ? sim.cents.length : 0);
    return `<span>${cmp} distances computed</span>` + (finished ? `<span class="${sim.recall < s.k ? 'bad' : 'pass'}">found ${sim.recall} of the ${s.k} true nearest</span>` : `<span>searching…</span>`) + (note ? `<span>${note}</span>` : '');
  }
};
