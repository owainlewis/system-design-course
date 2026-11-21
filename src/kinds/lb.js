/* Load balancer: clients -> load balancer -> N servers, each a first-in first-out queue.
   Figure def: { kind: 'lb', scene: { period, rate, start, end, work, servers: [{ label, speed }], algo, health: { server, down, up, detect } } }
   Controls may set ctrl.algo, ctrl.slow (0/1) and ctrl.rate. */
const LB_IN = 0.45, LB_OUT = 0.35;
const LB_ALGOS = [['rr', 'Round robin'], ['random', 'Random'], ['least', 'Least connections'], ['two', 'Two random choices']];

const lbBase = f => f.def.scenarios ? f.def.scenarios[f.ctrl.scenario ?? Object.keys(f.def.scenarios)[0]].scene : f.def.scene;
function lbScene(f) {
  const s = lbBase(f), c = f.ctrl;
  let servers = s.servers.map((v, i) => ({ ...v }));
  if (c.n != null) servers = Array.from({ length: c.n }, () => ({ speed: 1 }));
  if (c.slow != null) servers.forEach((v, i) => v.speed = (c.slow && i === servers.length - 1) ? .4 : 1);
  return { ...s, servers, algo: c.algo ?? s.algo, rate: c.rate ?? s.rate };
}

const lbCache = new Map();
function lbSimulate(s) {
  const key = JSON.stringify(s); if (lbCache.has(key)) return lbCache.get(key);
  const r = rng(7), pick = rng(23), N = s.servers.length, H = s.health;
  const reqs = [], gap = 1 / s.rate, end = s.end ?? s.period - 1.2;
  for (let t = s.start ?? .3; t < end; t += gap) reqs.push({ t: t + (r() - .5) * gap * .5, work: s.work * (0.4 + 0.6 * -Math.log(1 - r() * .999)) });
  reqs.sort((a, b) => a.t - b.t);
  const jobs = Array.from({ length: N }, () => []), lastEnd = new Array(N).fill(0);
  const isDown = (i, t) => H && H.server === i && t >= H.down && (H.up == null || t < H.up);
  const lbThinksUp = (i, t) => !(H && H.server === i && t >= H.down + H.detect && (H.up == null || t < H.up + H.detect));
  const outstanding = (i, t) => jobs[i].filter(j => j.dec <= t && (j.end ?? Infinity) > t).length;
  let rr = 0;
  reqs.forEach((q, k) => {
    q.id = k; const at = q.t + LB_IN;         // when the load balancer decides
    let pool = [...Array(N).keys()].filter(i => lbThinksUp(i, at));
    if (!pool.length) pool = [...Array(N).keys()];   // nothing healthy: send to all rather than none
    let i;
    if (s.algo === 'rr') { i = pool[rr % pool.length]; rr++; }
    else if (s.algo === 'random') i = pool[Math.floor(pick() * pool.length)];
    else if (s.algo === 'least') { let best = Infinity; const off = k % pool.length; for (let m = 0; m < pool.length; m++) { const c = pool[(m + off) % pool.length], o = outstanding(c, at); if (o < best) { best = o; i = c; } } }
    else { const a = pool[Math.floor(pick() * pool.length)]; let b = pool[Math.floor(pick() * pool.length)]; if (pool.length > 1) while (b === a) b = pool[Math.floor(pick() * pool.length)]; i = outstanding(a, at) <= outstanding(b, at) ? a : b; }
    q.server = i; q.dec = at; q.at = at + LB_OUT;          // arrives at the server
    if (isDown(i, q.at)) { q.failed = true; q.end = q.at; }
    else {
      q.start = Math.max(q.at, lastEnd[i]); q.end = q.start + q.work / (s.servers[i].speed ?? 1); lastEnd[i] = q.end;
      if (H && H.server === i && q.end > H.down && q.start < (H.up ?? Infinity) && q.at < H.down) { q.failed = true; q.end = Math.max(q.at, H.down); lastEnd[i] = H.down; }
    }
    jobs[i].push(q);
  });
  reqs.forEach(q => { if (!q.failed) q.latency = q.end - q.at; });  // time spent at the server: queue plus work
  const sim = { s, reqs, jobs, N, P: s.period, lbThinksUp, isDown };
  lbCache.set(key, sim); return sim;
}
function pct(xs, p) { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; }

KINDS.lb = {
  period: f => lbBase(f).period,
  init(f) {
    if (f.def.playground && !f.def.ctrl?.n) { f.ctrl.algo ??= 'rr'; f.ctrl.slow ??= 1; f.ctrl.rate ??= 12; }
    if (f.def.scenarios && f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (f.def.scenarios && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const s = lbScene(f), sim = lbSimulate(s), now = f.t, N = sim.N;
    const portrait = (f.cv.parentElement.clientWidth || 600) < 600;
    const { ctx, w, h } = fitCanvas(f.cv, ww => ww < 600 ? 560 : Math.max(360, 96 + N * 74 + 120));
    const chart = { x: 58, y: h - 100, w: w - 78, h: 70 };
    const top = 20, bottom = chart.y - 34;
    const direct = N === 1;
    let C, LB; const S = [];
    if (!portrait) {
      const cy = (top + bottom) / 2; C = { x: Math.max(56, w * .08), y: cy }; LB = { x: w * .32, y: cy };
      for (let i = 0; i < N; i++) S.push({ x: w - Math.max(110, w * .14), y: N === 1 ? cy : lerp(top + 26, bottom - 30, i / (N - 1)) });
    } else {
      C = { x: w / 2, y: top + 22 }; LB = { x: w / 2, y: top + 112 };
      for (let i = 0; i < N; i++) S.push({ x: N === 1 ? w / 2 : lerp(64, w - 64, i / (N - 1)), y: bottom - 40 });
    }
    ctx.strokeStyle = COL.hair2; ctx.lineWidth = 1;
    if (direct) {
      ctx.save(); if (!sim.lbThinksUp(0, now)) ctx.setLineDash([3, 4]); strokeBez(ctx, C, S[0], portrait); ctx.restore();
    } else {
      strokeBez(ctx, C, LB, portrait); S.forEach((p, i) => { ctx.save(); if (!sim.lbThinksUp(i, now)) ctx.setLineDash([3, 4]); strokeBez(ctx, LB, p, portrait); ctx.restore(); });
    }

    // requests
    const qpos = (i, k) => portrait ? { x: S[i].x - 30 + (k % 8) * 8, y: S[i].y - 34 - Math.floor(k / 8) * 8 } : { x: S[i].x - 34 - (k % 14) * 8, y: S[i].y - 2 - Math.floor(k / 14) * 8 };
    for (const off of [0, sim.P]) for (const q of sim.reqs) {
      const lt = now + off, t0 = q.t; if (lt < t0) continue;
      let p, col = COL.ink2, a = 1, label = null;
      if (direct && lt < q.at) p = bez(C, S[0], ease((lt - t0) / (LB_IN + LB_OUT)), portrait);
      else if (lt < q.t + LB_IN) p = bez(C, LB, ease((lt - t0) / LB_IN), portrait);
      else if (lt < q.at) p = bez(LB, S[q.server], ease((lt - q.t - LB_IN) / LB_OUT), portrait);
      else if (q.failed && lt >= q.end) { const dt = lt - q.end; if (dt > .7) continue; p = portrait ? { x: S[q.server].x - 26 - dt * 30, y: S[q.server].y + 10 + 90 * dt * dt } : { x: S[q.server].x - 30 - dt * 30, y: S[q.server].y + 10 + 90 * dt * dt }; col = COL.red; a = 1 - dt / .7; label = dt < .45 && q.id % 2 === 0 ? 'error' : null; }
      else if (lt < q.start) { const k = sim.jobs[q.server].filter(j => j.start != null && j.at <= lt && j.start > lt && j.start < q.start && j.end > lt).length + 1; p = qpos(q.server, k); }
      else if (lt < q.end) p = qpos(q.server, 0);
      else { const dt = lt - q.end; if (dt > .25) continue; p = portrait ? { x: S[q.server].x, y: S[q.server].y + 24 + dt * 60 } : { x: S[q.server].x + 26 + dt * 80, y: S[q.server].y }; col = COL.accent; a = 1 - dt / .25; }
      ctx.globalAlpha = a; packet(ctx, p.x, p.y, 3.2, col);
      if (label) text(ctx, label, p.x - 6, p.y - 8, { align: 'right', size: 10.5, font: MONO, weight: 500, color: COL.red });
      ctx.globalAlpha = 1;
    }

    node(ctx, C.x, C.y, 'user', 'Clients');
    if (!direct) node(ctx, LB.x, LB.y, 'balancer', 'Load balancer', ALGO_LB_NAME[s.algo]);
    S.forEach((p, i) => {
      const down = sim.isDown(i, now), out = sim.jobs[i].filter(j => j.at <= now && j.end > now && !j.failed).length;
      const v = s.servers[i], sub = down ? (N === 1 ? 'down' : sim.lbThinksUp(i, now) ? 'down, not detected' : 'down, removed') : (v.speed ?? 1) < 1 ? `${Math.round(v.speed * 100)}% speed` : (v.speed ?? 1) > 1 ? `${v.speed}× speed` : null;
      node(ctx, p.x, p.y, 'server', v.label || `Server ${i + 1}`, sub, { stroke: down ? COL.red : null, subColor: down ? COL.red : null });
      if (!down) tag(ctx, portrait ? p.x + 30 : p.x + 44, portrait ? p.y - 10 : p.y, `${out}`, out > 6);
    });

    // response-time scatter
    const done = sim.reqs.filter(q => q.end <= now && q.end >= 0);
    const ymax = Math.max(1, ...sim.reqs.filter(q => !q.failed).map(q => q.latency)) * 1.05;
    ctx.strokeStyle = COL.hair2; line(ctx, { x: chart.x, y: chart.y + chart.h + .5 }, { x: chart.x + chart.w, y: chart.y + chart.h + .5 });
    const X = t => chart.x + t / sim.P * chart.w, Y = v => chart.y + chart.h - v / ymax * chart.h;
    for (const q of done) {
      if (q.failed) { const x = X(q.end), y = chart.y + chart.h - 4; ctx.strokeStyle = COL.red; ctx.lineWidth = 1.2; line(ctx, { x: x - 3, y: y - 3 }, { x: x + 3, y: y + 3 }); line(ctx, { x: x + 3, y: y - 3 }, { x: x - 3, y: y + 3 }); ctx.lineWidth = 1; }
      else dot(ctx, X(q.end), Y(q.latency), 2, (s.servers[q.server].speed ?? 1) < 1 ? COL.ink2 : COL.accent);
    }
    const tick = ymax > 4 ? 2 : ymax > 2 ? 1 : .5;
    for (let v = tick; v < ymax; v += tick) { const y = Math.round(Y(v)) + .5; ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = COL.hair; line(ctx, { x: chart.x, y }, { x: chart.x + chart.w, y }); ctx.restore(); text(ctx, `${v} s`, chart.x - 8, y, { align: 'right', size: 10.5, font: MONO }); }
    text(ctx, 'response time', chart.x, chart.y - 12, { size: 10.5, font: MONO });
    ctx.strokeStyle = rgba(COL.ink, .35); line(ctx, { x: X(now), y: chart.y - 2 }, { x: X(now), y: chart.y + chart.h + 2 });
    for (let t = 0; t <= sim.P; t += sim.P > 8 ? 2 : 1) text(ctx, t + 's', X(t), chart.y + chart.h + 12, { align: 'center', size: 10.5, font: MONO });

    if (!wantStats) return null;
    const recent = done.filter(q => !q.failed && q.end > now - 2).map(q => q.latency);
    const errs = done.filter(q => q.failed).length;
    const maxQ = Math.max(...S.map((p, i) => sim.jobs[i].filter(j => j.at <= now && j.end > now && !j.failed).length));
    if (!recent.length && errs) return `<span>no responses in the last 2 s</span><span class="bad">errors ${errs}</span>`;
    return `<span>median ${fmt(pct(recent, .5) * 1000)} ms</span><span class="${pct(recent, .95) > 1 ? 'bad' : ''}">p95 ${fmt(pct(recent, .95) * 1000)} ms</span><span>longest queue ${maxQ}</span>` + (s.health ? `<span class="${errs ? 'bad' : ''}">errors ${errs}</span>` : '');
  }
};
const ALGO_LB_NAME = Object.fromEntries(LB_ALGOS);
