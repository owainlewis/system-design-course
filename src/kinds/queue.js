/* Queue: producers put messages on a queue; consumers take them off and work on them one at a time.
   Figure def: { kind: 'queue', scene: { period, start, end, schedule: [{ from, to, rate }], consumers, work,
                 capacity, onFull: 'grow' | 'reject' | 'block', shed } }
   producer, consumer, queue and unit rename the parts. deadline marks work started after the sender stopped waiting. capacity limits the queue (Infinity when absent). 'reject' drops a message that finds the queue full; 'block'
   makes the producer wait for space. shed, if set, drops a message that has waited longer than shed seconds when
   a consumer reaches it. Controls may set ctrl.consumers, ctrl.rate (scales the schedule's peak) and ctrl.onFull. */
const Q_IN = 0.45, Q_OUT = 0.4;

function qScene(f) {
  const base = f.def.scenarios ? f.def.scenarios[f.ctrl.scenario ?? Object.keys(f.def.scenarios)[0]].scene : f.def.scene, c = f.ctrl, s = { ...base };
  if (c.consumers != null) s.consumers = c.consumers;
  if (c.onFull != null) s.onFull = c.onFull;
  if (c.capacity != null) s.capacity = c.capacity;
  if (c.shed != null) s.shed = c.shed || undefined;
  if (c.rate != null) { const peak = Math.max(...s.schedule.map(x => x.rate)); s.schedule = s.schedule.map(x => ({ ...x, rate: x.rate === peak ? c.rate : x.rate })); }
  return s;
}

const qCache = new Map();
function qSimulate(s) {
  const key = JSON.stringify(s); if (qCache.has(key)) return qCache.get(key);
  const r = rng(13), msgs = [];
  for (const seg of s.schedule) for (let t = seg.from; t < seg.to; t += 1 / seg.rate) msgs.push({ t: t + (r() - .5) * .5 / seg.rate, work: s.work * (0.6 + 0.8 * r()) });
  msgs.sort((a, b) => a.t - b.t); msgs.forEach((m, i) => m.id = i);
  const C = s.consumers, cap = s.capacity ?? Infinity, freeAt = new Array(C).fill(0);
  const queue = [], blocked = [];   // messages in the queue, and messages waiting at the producer for space
  // events: arrivals at the queue and consumer completions, processed in time order
  const arrivals = msgs.map(m => ({ at: m.t + Q_IN, m }));
  let ai = 0, now = 0; const samples = [];
  const startWork = (t) => {
    for (let c = 0; c < C; c++) {
      while (freeAt[c] <= t && queue.length) {
        const m = queue.shift();
        if (blocked.length) { const b = blocked.shift(); b.enq = t; queue.push(b); }
        if (s.shed && t - m.enq > s.shed) { m.shed = true; m.end = t; continue; }
        m.consumer = c; m.start = t; m.end = t + m.work; freeAt[c] = m.end;
      }
    }
  };
  const nextFree = () => Math.min(...freeAt.map(x => x > now ? x : Infinity));
  while (ai < arrivals.length || queue.length) {
    const na = ai < arrivals.length ? arrivals[ai].at : Infinity, nf = queue.length ? Math.max(now, Math.min(...freeAt)) : Infinity;
    if (na <= nf) {
      now = na; const m = arrivals[ai++].m;
      startWork(now);
      if (queue.length < cap) { m.enq = now; queue.push(m); }
      else if (s.onFull === 'block') { m.blockedAt = now; blocked.push(m); }
      else { m.rejected = true; m.end = now; }
      startWork(now);
    } else { now = nf; startWork(now); if (nf === Infinity) break; }
    samples.push({ t: now, q: queue.length, b: blocked.length });
  }
  msgs.forEach(m => { if (!m.rejected && !m.shed && m.start != null) { m.wait = m.start - m.enq; m.total = m.end - (m.blockedAt ?? m.enq); } });
  const sim = { s, msgs, samples, C, cap, P: s.period };
  qCache.set(key, sim); return sim;
}
const qLenAt = (sim, t) => { let lo = 0, hi = sim.samples.length - 1, v = { q: 0, b: 0 }; while (lo <= hi) { const m = (lo + hi) >> 1; if (sim.samples[m].t <= t) { v = sim.samples[m]; lo = m + 1; } else hi = m - 1; } return v; };

KINDS.queue = {
  period: f => (f.def.scenarios ? Object.values(f.def.scenarios)[0].scene : f.def.scene).period,
  init(f) {
    if (f.def.scenarios && f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (f.def.scenarios && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const s = qScene(f), sim = qSimulate(s), now = f.t, C = sim.C;
    const portrait = (f.cv.parentElement.clientWidth || 600) < 600;
    const { ctx, w, h } = fitCanvas(f.cv, ww => ww < 600 ? 490 : Math.max(330, 150 + C * 56 + 100));
    const chart = { x: 58, y: h - 92, w: w - 78, h: 62 };
    const top = 18, bottom = chart.y - 36;
    const slots = Math.min(isFinite(sim.cap) ? sim.cap : 16, portrait ? 10 : 16), cw = portrait ? 18 : 20;
    let P, Qb; const K = [];
    if (!portrait) {
      const cy = (top + bottom) / 2; P = { x: Math.max(52, w * .08), y: cy };
      Qb = { x: w * .43 - slots * cw / 2, y: cy - 16, w: slots * cw + 12, h: 32 };
      for (let i = 0; i < C; i++) K.push({ x: w - Math.max(60, w * .1), y: C === 1 ? cy : lerp(top + 24, bottom - 30, i / (C - 1)) });
    } else {
      P = { x: w / 2, y: top + 22 }; Qb = { x: w / 2 - (slots * cw + 12) / 2, y: top + 112, w: slots * cw + 12, h: 32 };
      for (let i = 0; i < C; i++) K.push({ x: C === 1 ? w / 2 : lerp(50, w - 50, i / (C - 1)), y: bottom - 30 });
    }
    const qIn = portrait ? { x: w / 2, y: Qb.y } : { x: Qb.x, y: Qb.y + 16 }, qOut = portrait ? { x: w / 2, y: Qb.y + Qb.h } : { x: Qb.x + Qb.w, y: Qb.y + 16 };
    ctx.strokeStyle = COL.hair2; strokeBez(ctx, P, qIn, portrait); K.forEach(k => strokeBez(ctx, qOut, k, portrait));

    // queue box: slots fill from the exit end
    const L = qLenAt(sim, now);
    rr(ctx, Qb.x, Qb.y, Qb.w, Qb.h, 6); ctx.fillStyle = COL.node; ctx.fill(); ctx.strokeStyle = L.q >= sim.cap ? COL.red : COL.hair2; ctx.lineWidth = L.q >= sim.cap ? 1.4 : 1; ctx.stroke(); ctx.lineWidth = 1;
    for (let i = 0; i < slots; i++) {
      const x = Qb.x + Qb.w - 6 - (i + 1) * cw, on = i < L.q;
      rr(ctx, x + 2, Qb.y + 8, cw - 4, 16, 3); ctx.fillStyle = on ? rgba(COL.ink2, .75) : COL.fig; ctx.fill();
    }
    const label = `${s.queue || 'Queue'} · ${L.q}` + (isFinite(sim.cap) ? ` of ${sim.cap}` : '');
    text(ctx, label, Qb.x + Qb.w / 2, Qb.y - 10, { align: 'center', size: 11.5, weight: 500, color: L.q >= sim.cap ? COL.red : COL.ink2 });
    if (L.q > slots) text(ctx, `+${L.q - slots}`, Qb.x - 6, Qb.y + 16, { align: 'right', size: 11, font: MONO, weight: 500, color: COL.ink2 });

    // messages travelling and being worked on
    for (const m of sim.msgs) {
      if (now < m.t) continue;
      const lt = now; let p = null, col = COL.ink2, a = 1;
      if (lt < m.t + Q_IN) p = bez(P, qIn, ease((lt - m.t) / Q_IN), portrait);
      else if (m.rejected) { const dt = lt - m.end; if (dt < .7) { p = { x: qIn.x - (portrait ? 20 : 10) - dt * 24, y: qIn.y + (portrait ? -8 : 12) + 90 * dt * dt }; col = COL.red; a = 1 - dt / .7; } }
      else if (m.shed) { const dt = lt - m.end; if (lt >= m.end && dt < .7) { p = { x: qOut.x + 8 + dt * 20, y: qOut.y + 12 + 90 * dt * dt }; col = COL.amber; a = 1 - dt / .7; } }
      else if (m.blockedAt != null && lt < m.enq) { p = { x: P.x + (portrait ? 30 : 34), y: P.y + (portrait ? 0 : -2) }; col = COL.amber; }
      else if (m.start != null && lt >= m.start && lt < m.start + Q_OUT) p = bez(qOut, K[m.consumer], ease((lt - m.start) / Q_OUT), portrait);
      else if (m.start != null && lt >= m.start + Q_OUT && lt < m.end + Q_OUT) { const k = K[m.consumer]; p = portrait ? { x: k.x, y: k.y - 30 } : { x: k.x - 32, y: k.y }; col = s.deadline && m.total > s.deadline ? COL.amber : COL.accent; }
      if (!p) continue;
      ctx.globalAlpha = a; packet(ctx, p.x, p.y, 3.2, col); ctx.globalAlpha = 1;
    }
    node(ctx, P.x, P.y, 'app', s.producer || 'Producer', L.b ? `${L.b} waiting` : null, { subColor: COL.amber });
    K.forEach((k, i) => node(ctx, k.x, k.y, 'server', C > 1 ? `${s.consumer || 'Consumer'} ${i + 1}` : (s.consumer || 'Consumer')));

    // queue length over time
    const ymax = Math.max(4, isFinite(sim.cap) ? sim.cap * 1.15 : 0, ...sim.samples.map(x => x.q)) * 1.05;
    const X = t => chart.x + t / sim.P * chart.w, Y = v => chart.y + chart.h - v / ymax * chart.h;
    ctx.strokeStyle = COL.hair2; line(ctx, { x: chart.x, y: chart.y + chart.h + .5 }, { x: chart.x + chart.w, y: chart.y + chart.h + .5 });
    if (isFinite(sim.cap)) { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(COL.red, .65); line(ctx, { x: chart.x, y: Y(sim.cap) }, { x: chart.x + chart.w, y: Y(sim.cap) }); ctx.restore(); text(ctx, `limit ${sim.cap}`, chart.x + chart.w, Y(sim.cap) - 8, { align: 'right', size: 10.5, font: MONO, color: COL.red }); }
    ctx.beginPath(); let first = true, last = 0;
    for (const x of sim.samples) { if (x.t > now) break; if (first) { ctx.moveTo(X(0), Y(0)); first = false; } ctx.lineTo(X(x.t), Y(last)); ctx.lineTo(X(x.t), Y(x.q)); last = x.q; }
    if (!first) {
      ctx.lineTo(X(now), Y(last));
      ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.6; ctx.stroke(); ctx.lineWidth = 1;
      ctx.lineTo(X(now), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath();
      ctx.fillStyle = rgba(COL.accent, .12); ctx.fill();
    }
    sim.msgs.filter(m => (m.rejected || m.shed) && m.end <= now).forEach(m => { const x = X(m.end), y = chart.y + chart.h - 4; ctx.strokeStyle = m.shed ? COL.amber : COL.red; ctx.lineWidth = 1.2; line(ctx, { x: x - 3, y: y - 3 }, { x: x + 3, y: y + 3 }); line(ctx, { x: x + 3, y: y - 3 }, { x: x - 3, y: y + 3 }); ctx.lineWidth = 1; });
    const tick = ymax > 40 ? 20 : ymax > 16 ? 10 : 5;
    for (let v = tick; v < ymax; v += tick) { const y = Math.round(Y(v)) + .5; ctx.save(); ctx.setLineDash([2, 4]); ctx.strokeStyle = COL.hair; line(ctx, { x: chart.x, y }, { x: chart.x + chart.w, y }); ctx.restore(); text(ctx, `${v}`, chart.x - 8, y, { align: 'right', size: 10.5, font: MONO }); }
    text(ctx, `${s.unit || 'messages'} in the queue`, chart.x, chart.y - 12, { size: 10.5, font: MONO });
    // the incoming rate, as a faint band behind the chart
    ctx.strokeStyle = rgba(COL.ink, .35); line(ctx, { x: X(now), y: chart.y - 2 }, { x: X(now), y: chart.y + chart.h + 2 });
    for (let t = 0; t <= sim.P; t += sim.P > 8 ? 2 : 1) text(ctx, t + 's', X(t), chart.y + chart.h + 12, { align: 'center', size: 10.5, font: MONO });

    if (!wantStats) return null;
    const done = sim.msgs.filter(m => m.start != null && m.end <= now), rej = sim.msgs.filter(m => m.rejected && m.end <= now).length, shed = sim.msgs.filter(m => m.shed && m.end <= now).length;
    const waiting = sim.msgs.filter(m => (m.blockedAt ?? m.enq) != null && (m.blockedAt ?? m.enq) <= now && (m.start == null || m.start > now) && !m.shed && !m.rejected);
    const oldest = waiting.length ? Math.max(...waiting.map(m => now - (m.blockedAt ?? m.enq))) : 0;
    const late = s.deadline ? done.filter(m => m.total > s.deadline).length : 0;
    return `<span>processed ${done.length}</span>` + (late ? `<span class="bad">${late} after the client gave up</span>` : '') + `<span class="${oldest > 2 ? 'bad' : ''}">oldest waiting ${fmt(oldest, 1)} s</span>` + (L.b ? `<span>${L.b} blocked at producer</span>` : '') + (rej ? `<span class="bad">rejected ${rej}</span>` : '') + (shed ? `<span class="bad">dropped as too old ${shed}</span>` : '') + (f.def.scenarios?.[f.ctrl.scenario]?.note ? `<span>${f.def.scenarios[f.ctrl.scenario].note}</span>` : '');
  }
};
