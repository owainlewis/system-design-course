/* Topic: how a broker hands out messages.
   Figure def: { kind: 'topic', scene | scenarios: { key: { label, note, scene } } }
   scene.mode 'queue': each message goes to one consumer, in turn. 'pubsub': each message is copied to every subscriber.
     { mode, period, rate, count, broker, targets: [{ label, icon }] }
   scene.mode 'log': messages are appended to partitions by a hash of their key and stay there. Each consumer group
   keeps its own offset in each partition and reads at its own pace, from its start time.
     { mode: 'log', period, rate, count, keys: [names], partitions, groups: [{ label, rate, start }] } */
const TP_IN = 0.5, TP_HOLD = 0.25, TP_OUT = 0.5;

function tpScene(f) { return f.def.scenarios ? f.def.scenarios[f.ctrl.scenario ?? Object.keys(f.def.scenarios)[0]].scene : f.def.scene; }

const tpCache = new Map();
function tpSimulate(s) {
  const k = JSON.stringify(s); if (tpCache.has(k)) return tpCache.get(k);
  const r = rng(21), msgs = [];
  for (let i = 0; i < s.count; i++) msgs.push({ id: i, t: 0.4 + i / s.rate });
  let sim;
  if (s.mode === 'log') {
    const P = s.partitions, parts = Array.from({ length: P }, () => []);
    msgs.forEach(m => { m.key = Math.floor(r() * s.keys.length); m.part = hash32(s.keys[m.key]) % P; m.at = m.t + TP_IN; m.offset = parts[m.part].length; parts[m.part].push(m); });
    // reads[g][p][o]: when group g reads offset o of partition p
    const reads = s.groups.map(g => parts.map(list => { let prev = -Infinity; return list.map(m => (prev = Math.max(m.at + TP_HOLD, prev + 1 / g.rate, g.start || 0))); }));
    sim = { s, msgs, parts, reads, P };
  } else {
    const N = s.targets.length;
    msgs.forEach(m => { m.out = m.t + TP_IN + TP_HOLD; m.to = s.mode === 'pubsub' ? s.targets.map((_, j) => j) : [m.id % N]; });
    sim = { s, msgs, N };
  }
  tpCache.set(k, sim); return sim;
}
const tpColor = i => COL['s' + (i % 6)];

KINDS.topic = {
  period: f => tpScene(f).period,
  init(f) {
    if (f.def.scenarios && f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (f.def.scenarios && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const s = tpScene(f), sim = tpSimulate(s);
    const out = s.mode === 'log' ? tpDrawLog(f, sim, wantStats) : tpDrawFan(f, sim, wantStats);
    const note = f.def.scenarios?.[f.ctrl.scenario]?.note;
    return out && note && s.mode === 'log' ? out + `<span>${note}</span>` : out;
  }
};

function tpDrawFan(f, sim, wantStats) {
  const s = sim.s, now = f.t, N = sim.N;
  const portrait = (f.cv.parentElement.clientWidth || 600) < 600;
  const { ctx, w, h } = fitCanvas(f.cv, ww => ww < 600 ? 330 : Math.max(300, 90 + N * 70));
  let P, B, T;
  if (!portrait) {
    P = { x: Math.max(52, w * .09), y: h / 2 }; B = { x: w * .45, y: h / 2 };
    T = s.targets.map((_, i) => ({ x: w - Math.max(64, w * .11), y: N === 1 ? h / 2 : lerp(48, h - 64, i / (N - 1)) }));
  } else {
    P = { x: w / 2, y: 34 }; B = { x: w / 2, y: 140 };
    T = s.targets.map((_, i) => ({ x: N === 1 ? w / 2 : lerp(56, w - 56, i / (N - 1)), y: h - 70 }));
  }
  const bw = portrait ? 170 : 186, bh = 34, bIn = portrait ? { x: B.x, y: B.y - bh / 2 } : { x: B.x - bw / 2, y: B.y }, bOut = portrait ? { x: B.x, y: B.y + bh / 2 } : { x: B.x + bw / 2, y: B.y };
  ctx.strokeStyle = COL.hair2; strokeBez(ctx, P, bIn, portrait); T.forEach(t => strokeBez(ctx, bOut, t, portrait));

  // the broker holds the latest messages, newest on the left
  rr(ctx, B.x - bw / 2, B.y - bh / 2, bw, bh, 6); ctx.fillStyle = COL.node; ctx.fill(); ctx.strokeStyle = COL.hair2; ctx.stroke();
  text(ctx, s.broker || (s.mode === 'pubsub' ? 'Topic' : 'Queue'), B.x, B.y - bh / 2 - 11, { align: 'center', size: 11.5, weight: 500, color: COL.ink2 });
  const held = sim.msgs.filter(m => m.t + TP_IN <= now && m.out + TP_OUT > now).slice(-6);
  held.forEach((m, i) => {
    const x = B.x + bw / 2 - 12 - (held.length - 1 - i) * 28 - 12;
    rr(ctx, x, B.y - 9, 24, 18, 4); ctx.fillStyle = rgba(tpColor(m.id), .22); ctx.fill(); ctx.strokeStyle = tpColor(m.id); ctx.stroke();
    text(ctx, `${m.id + 1}`, x + 12, B.y + .5, { align: 'center', size: 10.5, font: MONO, weight: 500, color: COL.ink2 });
  });

  const got = new Array(N).fill(0); let pub = 0, del = 0;
  for (const m of sim.msgs) {
    if (m.t > now) break;
    pub++;
    if (now < m.t + TP_IN) { const p = bez(P, bIn, ease((now - m.t) / TP_IN), portrait); dot(ctx, p.x, p.y, 3.5, tpColor(m.id)); }
    for (const j of m.to) {
      if (now >= m.out + TP_OUT) { got[j]++; del++; }
      else if (now >= m.out) { const p = bez(bOut, T[j], ease((now - m.out) / TP_OUT), portrait); dot(ctx, p.x, p.y, 3.5, tpColor(m.id)); }
    }
  }
  node(ctx, P.x, P.y, 'app', 'Producer');
  s.targets.forEach((t, i) => node(ctx, T[i].x, T[i].y, t.icon || 'server', t.label, `${got[i]} received`));

  if (!wantStats) return null;
  return s.mode === 'pubsub'
    ? `<span>${pub} published</span><span>${del} deliveries, ${N} for each message</span>`
    : `<span>${pub} sent</span><span>${del} delivered, each to one consumer</span>`;
}

function tpDrawLog(f, sim, wantStats) {
  const s = sim.s, now = f.t, P = sim.P, G = s.groups.length;
  const portrait = (f.cv.parentElement.clientWidth || 600) < 600;
  const rowH = 68, top = 44;
  const { ctx, w, h } = fitCanvas(f.cv, ww => top + P * rowH + (ww < 600 ? 120 : 24));
  const px = portrait ? 28 : Math.max(52, w * .08), x0 = portrait ? 64 : w * .2, x1 = portrait ? w - 12 : w * .72, gx = w - Math.max(64, w * .11);
  const maxLen = Math.max(...sim.parts.map(p => p.length)), cw = Math.min(30, (x1 - x0) / maxLen);
  const rowY = p => top + p * rowH + rowH / 2;
  const Pn = { x: px, y: top + P * rowH / 2 }, Gn = s.groups.map((_, i) => portrait
    ? { x: G === 1 ? w / 2 : lerp(w * .3, w * .75, i / (G - 1)), y: top + P * rowH + 40 }
    : { x: gx, y: G === 1 ? Pn.y : lerp(top + 26, top + P * rowH - 34, i / (G - 1)) });
  const gCol = i => [COL.accent, COL.amber, COL.s2][i % 3];

  // keys legend
  let lx = 0; ctx.font = `400 11px ${SANS}`;
  s.keys.forEach((k, i) => { dot(ctx, lx + 5, 12, 4, tpColor(i)); text(ctx, k, lx + 13, 12.5, { size: 11, color: COL.ink2 }); lx += 26 + ctx.measureText(k).width; });

  ctx.strokeStyle = COL.hair; for (let p = 0; p < P; p++) { strokeBez(ctx, Pn, { x: x0, y: rowY(p) }, false); if (!portrait || p === P - 1) Gn.forEach(g => strokeBez(ctx, portrait ? { x: x0 + cw * maxLen / 2, y: rowY(p) + 10 } : { x: x0 + cw * maxLen, y: rowY(p) }, g, portrait)); }
  const read = s.groups.map(() => new Array(P).fill(0));
  for (let p = 0; p < P; p++) {
    const y = rowY(p), list = sim.parts[p];
    text(ctx, `Partition ${p}`, x0, y - 30, { size: 10.5, font: MONO });
    for (let o = 0; o < maxLen; o++) {
      const m = list[o], x = x0 + o * cw, on = m && m.at <= now;
      rr(ctx, x + 1.5, y - 10, cw - 3, 20, 4);
      if (on) { ctx.fillStyle = rgba(tpColor(m.key), .22); ctx.fill(); ctx.strokeStyle = tpColor(m.key); ctx.stroke(); text(ctx, `${o}`, x + cw / 2, y + .5, { align: 'center', size: 10, font: MONO, color: COL.ink2 }); }
      else { ctx.fillStyle = COL.fig; ctx.fill(); ctx.strokeStyle = COL.hair; ctx.stroke(); }
    }
    s.groups.forEach((g, gi) => {
      const times = sim.reads[gi][p]; let n = 0; while (n < times.length && times[n] <= now) n++;
      read[gi][p] = n;
      // reads in flight to the group
      for (let o = Math.max(0, n - 3); o < n; o++) { const dt = now - times[o]; if (dt < TP_OUT) { const q = bez({ x: x0 + o * cw + cw / 2, y }, Gn[gi], ease(dt / TP_OUT), false); dot(ctx, q.x, q.y, 3, tpColor(list[o].key)); } }
      // the group's offset: the next message it will read
      const mx = x0 + n * cw + cw / 2, my = gi === 0 ? y + 15 : y - 15, d = gi === 0 ? 1 : -1;
      if (now >= (g.start || 0)) { ctx.fillStyle = gCol(gi); ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx - 4, my + 6 * d); ctx.lineTo(mx + 4, my + 6 * d); ctx.fill(); }
    });
  }
  // messages travelling from the producer
  for (const m of sim.msgs) { if (m.t > now) break; if (now < m.at) { const q = bez(Pn, { x: x0 + m.offset * cw + cw / 2, y: rowY(m.part) }, ease((now - m.t) / TP_IN), false); dot(ctx, q.x, q.y, 3.5, tpColor(m.key)); } }
  node(ctx, Pn.x, Pn.y, 'app', portrait ? null : 'Producer');
  s.groups.forEach((g, gi) => {
    const started = now >= (g.start || 0);
    node(ctx, Gn[gi].x, Gn[gi].y, 'server', g.label, started ? `read ${read[gi].reduce((a, b) => a + b, 0)}` : `starts at ${g.start} s`, { stroke: gCol(gi) });
  });

  if (!wantStats) return null;
  const appended = sim.msgs.filter(m => m.at <= now).length;
  return `<span>${appended} in the log</span>` + s.groups.map((g, gi) => { const lag = appended - read[gi].reduce((a, b) => a + b, 0); return `<span class="${lag > 4 ? 'bad' : ''}">${g.label} ${lag} behind</span>`; }).join('');
}
