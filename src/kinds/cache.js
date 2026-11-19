/* Cache: an app reads keys through a cache in front of a database.
   Figure def: { kind: 'cache', scene: { period, rate, start, end, keys, skew, seq, capacity, policy, ttl, warm,
                 db, coalesce, writes: [{ at, key }], onWrite: 'none' | 'delete' } }
   keys is the number of distinct keys, drawn with a Zipf-like popularity (skew 0 = uniform). seq, if given,
   is a string of letters to request in order instead. policy: 'lru' | 'fifo' | 'random'. ttl in seconds.
   warm fills the cache at time 0. coalesce makes concurrent misses for one key share a single database query.
   Controls may set ctrl.capacity, ctrl.policy, ctrl.ttl, ctrl.coalesce and ctrl.onWrite. */
const CA_IN = 0.35, CA_DB = 0.3;

function caScene(f) {
  const base = f.def.scenarios ? f.def.scenarios[f.ctrl.scenario ?? Object.keys(f.def.scenarios)[0]].scene : f.def.scene, c = f.ctrl, s = { ...base };
  for (const k of ['capacity', 'policy', 'ttl', 'coalesce', 'onWrite', 'rate', 'skew']) if (c[k] != null) s[k] = c[k];
  return s;
}

const caCache = new Map();
function caSimulate(s) {
  const key = JSON.stringify(s); if (caCache.has(key)) return caCache.get(key);
  const r = rng(11), ev = rng(29), reqs = [];
  const names = s.seq ? [...new Set(s.seq)] : Array.from({ length: s.keys }, (_, i) => String(i + 1));
  if (s.seq) { const gap = (s.end - s.start) / s.seq.length; [...s.seq].forEach((k, i) => reqs.push({ t: s.start + i * gap, key: k })); }
  else {
    const w = names.map((_, i) => 1 / Math.pow(i + 1, s.skew ?? 1)), tot = w.reduce((a, b) => a + b, 0);
    const pickKey = () => { let x = r() * tot; for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return names[i]; } return names[names.length - 1]; };
    for (let t = s.start; t < s.end; t += 1 / s.rate) reqs.push({ t: t + (r() - .5) * .3 / s.rate, key: pickKey() });
  }
  reqs.sort((a, b) => a.t - b.t); reqs.forEach((q, i) => q.id = i);
  const ttl = s.ttl ?? Infinity, dbT = s.db ?? 0.25, C = s.capacity;
  // version of each key in the database, bumped by writes
  const dbVer = Object.fromEntries(names.map(k => [k, 0]));
  let slots = [];   // [{ key, ver, exp, last, ins }], most recently used first for lru, newest first for fifo
  const snaps = [{ t: -1, slots: [] }];
  if (s.warm) { slots = names.slice(0, C).map((k, i) => ({ key: k, ver: 0, exp: ttl, ins: -i, last: -i })); snaps[0].slots = slots.map(x => ({ ...x })); }
  const verAt = (k, t) => (s.writes || []).filter(wr => wr.key === k && wr.at <= t).length;
  const inflight = {};   // key -> time its database read returns
  const events = [];
  reqs.forEach(q => events.push({ at: q.t + CA_IN, type: 'arrive', q }));
  (s.writes || []).forEach(wr => events.push({ at: wr.at, type: 'write', key: wr.key }));
  events.sort((a, b) => a.at - b.at || (a.type === 'write' ? -1 : 1));
  const order = () => s.policy === 'fifo' ? slots.sort((a, b) => b.ins - a.ins) : slots.sort((a, b) => b.last - a.last);
  const snap = (t, hit) => snaps.push({ t, slots: order().map(x => ({ ...x })), hit });
  const insert = (k, ver, t) => {
    slots = slots.filter(x => x.key !== k);
    if (C <= 0) return;
    if (slots.length >= C) {
      let victim;
      if (s.policy === 'random') victim = slots[Math.floor(ev() * slots.length)];
      else if (s.policy === 'fifo') victim = slots.reduce((a, b) => a.ins < b.ins ? a : b);
      else victim = slots.reduce((a, b) => a.last < b.last ? a : b);
      slots = slots.filter(x => x !== victim);
    }
    slots.push({ key: k, ver, exp: t + ttl, ins: t, last: t });
  };
  let dbQueries = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'write') {
      dbVer[e.key]++;
      if (s.onWrite === 'delete') { slots = slots.filter(x => x.key !== e.key); snap(e.at); }
      continue;
    }
    if (e.type === 'fill') { insert(e.key, e.ver, e.at); snap(e.at); delete inflight[e.key]; continue; }
    const q = e.q, at = e.at, hit = slots.find(x => x.key === q.key && x.exp > at);
    if (hit) {
      hit.last = at; q.hit = true; q.stale = hit.ver < dbVer[q.key]; q.back = at; q.done = at + CA_IN; snap(at, q.key);
    } else {
      slots = slots.filter(x => x.key !== q.key || x.exp > at);
      q.hit = false;
      if (s.coalesce && inflight[q.key] != null) { q.shared = true; q.back = inflight[q.key]; }
      else {
        dbQueries++; q.db = true; q.back = at + CA_DB * 2 + dbT; inflight[q.key] = q.back;
        const fill = { at: q.back, type: 'fill', key: q.key, ver: verAt(q.key, at + CA_DB + dbT / 2) };   // the value as of the moment the database read it
        let j = i + 1; while (j < events.length && events[j].at <= fill.at) j++; events.splice(j, 0, fill);
      }
      q.done = q.back + CA_IN;
    }
    q.latency = q.done - q.t - 2 * CA_IN + (q.hit ? 0.002 : 0);
  }
  const sim = { s, reqs, snaps, names, dbQueries, P: s.period };
  caCache.set(key, sim); return sim;
}
const caSlotsAt = (sim, t) => { let lo = 0, hi = sim.snaps.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (sim.snaps[m].t <= t) lo = m; else hi = m - 1; } return sim.snaps[lo]; };

KINDS.cache = {
  period: f => (f.def.scenarios ? Object.values(f.def.scenarios)[0].scene : f.def.scene).period,
  init(f) {
    if (f.def.scenarios && f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (f.def.scenarios && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const s = caScene(f), sim = caSimulate(s), now = f.t;
    const portrait = (f.cv.parentElement.clientWidth || 600) < 600, C = Math.max(1, s.capacity);
    const perRow = s.seq ? C : Math.min(10, C), cellRows = Math.ceil(C / perRow);
    const { ctx, w, h } = fitCanvas(f.cv, ww => (ww < 600 ? 360 : 250) + cellRows * 26 + 120);
    const chart = { x: 58, y: h - 92, w: w - 78, h: 62 };
    const cellW = s.seq ? (portrait ? 30 : 38) : portrait ? 26 : 30, boxW = Math.max(perRow * cellW + 24, 250), boxH = cellRows * 26 + 44;
    let A, D, B;
    if (!portrait) { const cy = (chart.y - 30) / 2 + 6; A = { x: Math.max(52, w * .08), y: cy }; D = { x: w - Math.max(56, w * .08), y: cy }; B = { x: (A.x + D.x) / 2 - boxW / 2, y: cy - boxH / 2, w: boxW, h: boxH }; }
    else { A = { x: w / 2, y: 30 }; B = { x: w / 2 - boxW / 2, y: 92, w: boxW, h: boxH }; D = { x: w / 2, y: B.y + boxH + 64 }; }
    const inP = portrait ? { x: w / 2, y: B.y } : { x: B.x, y: A.y }, outP = portrait ? { x: w / 2, y: B.y + B.h } : { x: B.x + B.w, y: A.y };
    ctx.strokeStyle = COL.hair2; strokeBez(ctx, A, inP, portrait); strokeBez(ctx, outP, D, portrait);

    // the cache box and its slots
    const snapNow = caSlotsAt(sim, now);
    rr(ctx, B.x, B.y, B.w, B.h, 8); ctx.fillStyle = COL.node; ctx.fill(); ctx.strokeStyle = COL.hair2; ctx.stroke();
    text(ctx, `Cache · ${s.capacity} slot${s.capacity === 1 ? '' : 's'}${s.policy && s.capacity > 0 ? ` · ${({ lru: 'LRU', fifo: 'FIFO', random: 'random' })[s.policy]}` : ''}`, B.x + 12, B.y + 16, { size: 11.5, weight: 500, color: COL.ink2 });
    if (s.capacity > 0 && (s.policy === 'lru' || s.policy === 'fifo')) text(ctx, s.policy === 'lru' ? 'most recent first' : 'newest first', B.x + B.w - 12, B.y + 16, { align: 'right', size: 10.5, font: MONO });
    for (let i = 0; i < s.capacity; i++) {
      const cx = B.x + 12 + (i % perRow) * cellW, cy = B.y + 30 + Math.floor(i / perRow) * 26, sl = snapNow.slots[i];
      rr(ctx, cx + 1, cy, cellW - 4, 20, 4);
      const flash = sl && snapNow.hit === sl.key && now - snapNow.t < .5, expired = sl && sl.exp <= now;
      ctx.fillStyle = !sl ? COL.fig : flash ? rgba(COL.accent, .9) : expired ? COL.fig : COL.node; ctx.fill();
      ctx.strokeStyle = sl ? (expired ? COL.hair2 : COL.ink2) : COL.hair; ctx.lineWidth = 1; ctx.stroke();
      if (sl) text(ctx, sl.key, cx + cellW / 2 - 1, cy + 10.5, { align: 'center', size: 11, font: MONO, weight: 500, color: flash ? COL.node : expired ? COL.muted : COL.ink });
    }
    node(ctx, A.x, A.y, 'server', 'App server');
    node(ctx, D.x, D.y, 'store', 'Database', null);

    // requests in flight
    const path = (q, lt) => {
      const a = q.t, c1 = a + CA_IN;
      if (lt < c1) return bez(A, inP, ease((lt - a) / CA_IN), portrait);
      if (q.hit || q.shared) { if (lt < q.back) return { x: inP.x + (portrait ? -10 : 8), y: inP.y + (portrait ? 8 : -10) }; return lt < q.done ? bez(inP, A, ease((lt - q.back) / CA_IN), portrait) : null; }
      const d1 = c1 + CA_DB, d2 = q.back - CA_DB;
      if (lt < d1) return bez(outP, D, ease((lt - c1) / CA_DB), portrait);
      if (lt < d2) return { x: D.x + (portrait ? 30 : 0), y: D.y + (portrait ? 0 : -30) };
      if (lt < q.back) return bez(D, outP, ease((lt - d2) / CA_DB), portrait);
      return lt < q.done ? bez(inP, A, ease((lt - q.back) / CA_IN), portrait) : null;
    };
    for (const q of sim.reqs) {
      if (now < q.t || now > q.done + .02) continue;
      const p = path(q, now); if (!p) continue;
      const returning = now >= q.back;
      const col = q.stale && returning ? COL.amber : returning ? (q.hit ? COL.accent : COL.ink2) : COL.ink2;
      dot(ctx, p.x, p.y, 3, col);
      if (s.seq) text(ctx, q.key, p.x, p.y - 10, { align: 'center', size: 11, font: MONO, weight: 600, color: col });
    }
    // database reads in progress
    const busy = sim.reqs.filter(q => q.db && now >= q.t + CA_IN + CA_DB && now < q.back - CA_DB).length;
    if (busy) tag(ctx, D.x + (portrait ? 60 : 0), D.y + (portrait ? 0 : 58), `${busy} reading`, busy > 3);

    // response-time scatter
    const done = sim.reqs.filter(q => q.done <= now);
    const ymax = Math.max(.1, ...sim.reqs.map(q => q.latency)) * 1.1;
    ctx.strokeStyle = COL.hair2; line(ctx, { x: chart.x, y: chart.y + chart.h + .5 }, { x: chart.x + chart.w, y: chart.y + chart.h + .5 });
    const X = t => chart.x + t / sim.P * chart.w, Y = v => chart.y + chart.h - v / ymax * chart.h;
    for (const q of done) dot(ctx, X(q.done), Y(q.latency), 2, q.stale ? COL.amber : q.hit ? COL.accent : COL.ink2);
    text(ctx, w < 600 ? 'response time: blue cache, grey database' + (s.writes ? ', amber stale' : '') : 'response time: blue from the cache, grey from the database' + (s.writes ? ', amber stale' : ''), chart.x, chart.y - 12, { size: 10.5, font: MONO });
    ctx.strokeStyle = rgba(COL.ink, .35); line(ctx, { x: X(now), y: chart.y - 2 }, { x: X(now), y: chart.y + chart.h + 2 });
    for (let t = 0; t <= sim.P; t += sim.P > 8 ? 2 : 1) text(ctx, t + 's', X(t), chart.y + chart.h + 12, { align: 'center', size: 10.5, font: MONO });

    if (!wantStats) return null;
    const hits = done.filter(q => q.hit).length, dbq = sim.reqs.filter(q => q.db && q.t + CA_IN <= now).length, stale = done.filter(q => q.stale).length;
    return `<span class="pass">hit ratio ${done.length ? Math.round(hits / done.length * 100) : 0}%</span><span>database reads ${dbq}</span>`
      + (s.writes ? `<span class="${stale ? 'bad' : ''}">stale reads ${stale}</span>` : '') + `<span>requests ${done.length}</span>`;
  }
};
