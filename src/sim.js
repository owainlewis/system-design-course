/* ================= SIMULATION (shared by all designs) ================= */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function arrivals(scene, extras) {
  const r = rng(11), out = [], P = scene.period;
  const add = tr => {
    if (tr.type === 'steady') {
      const gap = 1 / tr.rate, end = tr.end ?? P - 0.8;
      for (let t = tr.start ?? 0.6; t < end; t += gap) out.push({ t: t + (r() - .5) * gap * .45, client: tr.client });
    } else if (tr.type === 'burst') {
      for (let i = 0; i < tr.count; i++) out.push({ t: tr.at + (tr.count > 1 ? i * tr.spread / (tr.count - 1) : 0), client: tr.client });
    }
  };
  scene.traffic.forEach(add);
  extras.forEach(e => add({ type: 'burst', client: 'app', ...e }));
  return out.filter(a => a.t >= TIN && a.t < P - 0.3).sort((a, b) => a.t - b.t).map((a, i) => ({ ...a, id: i }));
}

function makeLimiter(c) {
  const W = c.window ?? 1, L = c.limit ?? 5;
  switch (c.type) {
    case 'fixed': { let w = -1, n = 0; return {
      decide(t) { const k = Math.floor(t / W); if (k !== w) { w = k; n = 0; } if (n < L) { n++; return { ok: true }; } return { ok: false }; },
      view(t) { const k = Math.floor(t / W); return { type: 'fixed', count: k === w ? n : 0, limit: L, frac: (t - k * W) / W, window: W, est: k === w ? n : 0 }; } }; }
    case 'log': { const log = []; return {
      decide(t) { while (log.length && log[0] <= t - W) log.shift(); if (log.length < L) { log.push(t); return { ok: true }; } return { ok: false }; },
      view(t) { const times = log.filter(x => x > t - W); return { type: 'log', times, limit: L, window: W, est: times.length }; } }; }
    case 'counter': { let w = -1, cur = 0, prev = 0;
      const peek = t => { const k = Math.floor(t / W); return k === w ? { k, p: prev, c: cur } : { k, p: k === w + 1 ? cur : 0, c: 0 }; };
      return {
        decide(t) { const s = peek(t); w = s.k; prev = s.p; cur = s.c; const f = (t - w * W) / W; const est = prev * (1 - f) + cur; if (est + 1 <= L) { cur++; return { ok: true }; } return { ok: false }; },
        view(t) { const s = peek(t); const f = (t - s.k * W) / W; return { type: 'counter', prev: s.p, cur: s.c, f, est: s.p * (1 - f) + s.c, limit: L, window: W }; } }; }
    case 'token': { const C = c.capacity ?? L, R = c.rate ?? L; let tok = C, last = 0; return {
      decide(t) { tok = Math.min(C, tok + (t - last) * R); last = t; if (tok >= 1) { tok -= 1; return { ok: true }; } return { ok: false }; },
      view(t) { const v = Math.min(C, tok + (t - last) * R); return { type: 'token', tokens: v, capacity: C, rate: R, est: C - v, limit: C }; } }; }
    case 'leaky': { const Q = c.queue ?? L, R = c.rate ?? L; const q = []; let lastLeave = -1e9; return {
      decide(t) { while (q.length && q[0] <= t) q.shift(); if (q.length >= Q) return { ok: false }; const leave = Math.max(t, lastLeave + 1 / R); lastLeave = leave; q.push(leave); return { ok: true, delay: leave - t }; },
      view(t) { const queue = q.filter(x => x > t); return { type: 'leaky', queue, size: Q, rate: R, est: queue.length, limit: Q }; } }; }
    default: return { decide: () => ({ ok: true }), view: () => ({ type: 'none', est: 0 }) };
  }
}

// Map the playground's single "limit per second" to each algorithm's own parameters.
function paramsFor(type, L, base = {}) {
  switch (type) {
    case 'fixed': case 'log': case 'counter': return { type, limit: L, window: 1, scope: base.scope };
    case 'token': return { type, capacity: L, rate: L, scope: base.scope };
    case 'leaky': return { type, queue: L, rate: L, scope: base.scope };
    default: return { type: 'none' };
  }
}
function limitOf(lim) { return lim.limit ?? lim.rate ?? lim.capacity ?? 5; }
// The most a limiter is meant to let through in any 1 s span, and how to say it.
function peakCap(lim) {
  if (lim.type === 'token') return { cap: lim.capacity + lim.rate, label: `burst ${lim.capacity}` };
  if (lim.type === 'leaky') return { cap: lim.rate + 1, label: `rate ${lim.rate}` };
  if (lim.type === 'none') return { cap: Infinity, label: '' };
  return { cap: lim.limit, label: `limit ${lim.limit}` };
}

const simCache = new Map();
function simulate(scene, lim, extras = []) {
  const key = JSON.stringify([scene.period, scene.traffic, scene.nodes, scene.server, lim, extras]);
  if (simCache.has(key)) return simCache.get(key);
  const nodes = scene.nodes || 1, perNode = lim.scope === 'node' && nodes > 1;
  const lims = Array.from({ length: perNode ? nodes : 1 }, () => makeLimiter(lim));
  const reqs = arrivals(scene, extras);
  reqs.forEach((q, i) => { q.node = i % nodes; const d = lims[perNode ? q.node : 0].decide(q.t); q.ok = d.ok; q.delay = d.delay || 0; });
  const cap = scene.server?.capacity ?? 1e6, timeout = scene.server?.timeout ?? 1e9;
  let free = 0;
  reqs.filter(q => q.ok).sort((a, b) => (a.t + a.delay) - (b.t + b.delay)).forEach(q => {
    q.ready = q.t + q.delay + TOUT;
    const start = Math.max(q.ready, free);
    if (start - q.ready > timeout) { q.timedOut = true; q.failAt = q.ready + timeout; }
    else { q.start = start; free = start + 1 / cap; }
  });
  const okTimes = reqs.filter(q => q.ok && !q.timedOut).map(q => q.t + q.delay);
  const sim = { scene, lim, reqs, nodes, perNode, okTimes, P: scene.period, limited: lim.type !== 'none', overload: !!scene.server };
  sim.series = sampleSeries(sim);
  simCache.set(key, sim);
  return sim;
}

// Replay the limiter(s) once and sample their state, so drawings are a pure function of time.
function sampleSeries(sim, dt = 1 / 60) {
  const n = sim.perNode ? sim.nodes : 1, lims = Array.from({ length: n }, () => makeLimiter(sim.lim));
  const out = []; let i = 0;
  for (let t = 0; t <= sim.P + 1e-9; t += dt) {
    while (i < sim.reqs.length && sim.reqs[i].t <= t) { const q = sim.reqs[i]; lims[sim.perNode ? q.node : 0].decide(q.t); i++; }
    out.push(lims.map(l => l.view(t)));
  }
  return { dt, out };
}
function viewsAt(sim, t) { const s = sim.series; return s.out[clamp(Math.round(t / s.dt), 0, s.out.length - 1)]; }

function peakUpTo(times, now, W = 1) { let best = 0, j = 0; const xs = times.filter(x => x <= now); for (let i = 0; i < xs.length; i++) { while (xs[i] - xs[j] >= W) j++; best = Math.max(best, i - j + 1); } return best; }
function peakSpan(times, W = 1) { let best = 0, at = 0, j = 0; for (let i = 0; i < times.length; i++) { while (times[i] - times[j] >= W) j++; if (i - j + 1 > best) { best = i - j + 1; at = times[j]; } } return { best, at, end: at + W }; }

function stats(sim, now) {
  const a = now - 1, R = sim.reqs;
  const sent = R.filter(q => q.t > a && q.t <= now).length;
  const passed = R.filter(q => q.ok && q.t + q.delay > a && q.t + q.delay <= now).length;
  const rejected = R.filter(q => !q.ok && q.t > a && q.t <= now).length;
  const served = R.filter(q => q.start != null && q.start > a && q.start <= now).length;
  const timedOutTotal = R.filter(q => q.timedOut && q.failAt <= now).length;
  let wait = 0; for (const q of R) if (q.ready != null && q.ready <= now && ((q.start ?? q.failAt) > now)) wait = Math.max(wait, now - q.ready);
  return { sent, passed, rejected, served, timedOutTotal, wait, peak: peakUpTo(sim.okTimes, now) };
}

