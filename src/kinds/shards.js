/* Shards: writes routed to N shards by key range or by hash of the key.
   Figure def: { kind: 'shards', scene: { period, rate, start, end, shards, by: 'range' | 'hash', keys: 'sequential' | 'uniform' | 'hot', hotShare } }
   'sequential' keys grow over time, like order IDs or timestamps. 'hot' sends hotShare of writes to one key.
   Controls may set ctrl.by and ctrl.keys. */
const SH_IN = 0.6;

function shScene(f) {
  const base = f.def.scenarios ? f.def.scenarios[f.ctrl.scenario ?? Object.keys(f.def.scenarios)[0]].scene : f.def.scene;
  return { ...base, ...(f.ctrl.by ? { by: f.ctrl.by } : {}), ...(f.ctrl.keys ? { keys: f.ctrl.keys } : {}) };
}
const shCache = new Map();
function shSimulate(s) {
  const k = JSON.stringify(s); if (shCache.has(k)) return shCache.get(k);
  const r = rng(5), N = s.shards, reqs = [], MAX = 1e6;
  for (let t = s.start; t < s.end; t += 1 / s.rate) {
    let key;
    if (s.keys === 'sequential') key = Math.floor(MAX * .76 + (t / s.end) * MAX * .235);   // new IDs, all above the old ones
    else if (s.keys === 'hot' && r() < (s.hotShare ?? .4)) key = 424242;
    else key = Math.floor(r() * MAX);
    // range: each shard owns an equal slice of the key space. hash: a mixed hash of the key, mod N.
    const shard = s.by === 'range' ? Math.min(N - 1, Math.floor(key / MAX * N)) : hash32('k' + key) % N;
    reqs.push({ t: t + (r() - .5) * .4 / s.rate, key, shard });
  }
  const counts = new Array(N).fill(0); reqs.forEach(q => counts[q.shard]++);
  const sim = { s, reqs, counts, N, P: s.period, MAX };
  shCache.set(k, sim); return sim;
}

KINDS.shards = {
  period: f => (f.def.scenarios ? Object.values(f.def.scenarios)[0].scene : f.def.scene).period,
  init(f) {
    if (f.def.scenarios && f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (f.def.scenarios && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const s = shScene(f), sim = shSimulate(s), now = f.t, N = sim.N;
    const portrait = (f.cv.parentElement.clientWidth || 600) < 600;
    const { ctx, w, h } = fitCanvas(f.cv, ww => ww < 600 ? 170 + N * 70 : Math.max(330, 96 + N * 64));
    const R = portrait ? { x: w / 2, y: 34 } : { x: Math.max(70, w * .14), y: h / 2 };
    const S = Array.from({ length: N }, (_, i) => portrait ? { x: 70, y: 130 + i * 70 } : { x: w * .46, y: lerp(52, h - 64, N === 1 ? .5 : i / (N - 1)) });
    const barX = portrait ? 120 : w * .46 + 70, barW = w - barX - (portrait ? 56 : 90);
    ctx.strokeStyle = COL.hair2; S.forEach(p => strokeBez(ctx, R, p, portrait));
    node(ctx, R.x, R.y, 'balancer', 'Router', s.by === 'range' ? 'by key range' : 'by hash of key');
    const seen = new Array(N).fill(0), recent = new Array(N).fill(0);
    for (const q of sim.reqs) {
      if (q.t > now) break;
      seen[q.shard]++; if (q.t > now - 1.5) recent[q.shard]++;
      const dt = now - q.t; if (dt < SH_IN) { const p = bez(R, S[q.shard], ease(dt / SH_IN), portrait); packet(ctx, p.x, p.y, 3.2, COL.accent); }
    }
    const per = s.by === 'range' ? sim.MAX / N : 0, maxRecent = Math.max(1, ...recent), avg = recent.reduce((a, b) => a + b, 0) / N;
    S.forEach((p, i) => {
      const hot = recent[i] > 1.8 * avg && avg > 0;
      node(ctx, p.x, p.y, 'store', null, null, { stroke: hot ? COL.red : null });
      text(ctx, `Shard ${i + 1}`, p.x + (portrait ? 0 : 0), p.y + 32, { align: 'center', size: 11.5, color: COL.ink2 });
      if (s.by === 'range') text(ctx, `${fmt(i * per / 1000)}k – ${fmt((i + 1) * per / 1000)}k`, p.x, p.y + 46, { align: 'center', size: 10, font: MONO });
      const bw = barW * recent[i] / Math.max(maxRecent, avg * 2.5 || 1), y = p.y - 6;
      rr(ctx, barX, y, barW, 12, 3); ctx.fillStyle = COL.fig; ctx.fill(); ctx.strokeStyle = COL.hair; ctx.stroke();
      if (bw > 0) { rr(ctx, barX, y, Math.max(2, bw), 12, 3); ctx.fillStyle = hot ? COL.red : COL.accent; ctx.fill(); }
      text(ctx, `${fmt(recent[i] / 1.5)}/s`, barX + barW + 8, p.y + .5, { size: 11, font: MONO, color: hot ? COL.red : COL.ink2 });
    });
    text(ctx, 'writes per second, last 1.5 s', barX, (portrait ? S[0].y : S[0].y) - 22, { size: 10.5, font: MONO });

    if (!wantStats) return null;
    const tot = seen.reduce((a, b) => a + b, 0), busiest = Math.max(...seen);
    return `<span>${fmt(tot)} writes</span><span class="${busiest / (tot / N) > 1.8 ? 'bad' : 'pass'}">busiest shard ${tot ? fmt(busiest / (tot / N), 1) : 0}x the average</span>`;
  }
};
