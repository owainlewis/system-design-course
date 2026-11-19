/* Flow: a sequence diagram. Actors are columns; each message is a row, drawn as an arrow from one column to another.
   Figure def: { kind: 'flow', actors: [{ id, label, short, icon }], steps | scenarios: { key: { label, steps, state } }, counter }
   A step is { from, to, label, kind: 'ask' | 'refer' | 'answer' | 'fail', set: { actorId: text } }. */
const FLOW_MOVE = 0.7, FLOW_HOLD = 0.5, FLOW_START = 0.5, FLOW_TAIL = 2;

function flowScenario(f) {
  const d = f.def;
  if (!d.scenarios) return { steps: d.steps, state: d.state || {} };
  return d.scenarios[f.ctrl.scenario ?? Object.keys(d.scenarios)[0]];
}
const flowMaxSteps = f => f.def.scenarios ? Math.max(...Object.values(f.def.scenarios).map(s => s.steps.length)) : f.def.steps.length;

KINDS.flow = {
  period: f => FLOW_START + flowScenario(f).steps.length * (FLOW_MOVE + FLOW_HOLD) + FLOW_TAIL,
  init(f) {
    if (f.def.scenarios && f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (f.def.scenarios && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const sc = flowScenario(f), steps = sc.steps, t = f.t, actors = f.def.actors, n = actors.length;
    const rowH = 46, headH = 96, rows = flowMaxSteps(f);
    const { ctx, w, h } = fitCanvas(f.cv, () => headH + rows * rowH + 34);
    const narrow = w < 600, margin = narrow ? 34 : Math.max(70, w * .08);
    const X = {}; actors.forEach((a, i) => X[a.id] = n === 1 ? w / 2 : lerp(margin, w - margin, i / (n - 1)));
    const colW = n > 1 ? (w - 2 * margin) / (n - 1) : w;
    const times = steps.map((s, i) => FLOW_START + i * (FLOW_MOVE + FLOW_HOLD));
    let cur = -1; for (let i = 0; i < steps.length; i++) if (t >= times[i]) cur = i;
    const state = { ...(sc.state || {}) };
    steps.forEach((s, i) => { if (s.set && t >= times[i] + FLOW_MOVE) Object.assign(state, s.set); });

    // heads and lifelines
    actors.forEach(a => {
      const x = X[a.id], busy = cur >= 0 && t < times[cur] + FLOW_MOVE + FLOW_HOLD && (steps[cur].from === a.id || steps[cur].to === a.id);
      ctx.save(); ctx.strokeStyle = COL.hair2; ctx.setLineDash([2, 4]); line(ctx, { x, y: 62 }, { x, y: h - 16 }); ctx.restore();
      node(ctx, x, 30, a.icon || 'server', null, null, { stroke: busy ? COL.ink2 : null });
      text(ctx, narrow ? (a.short || a.label) : a.label, x, 66, { align: 'center', size: narrow ? 11 : 12, color: COL.ink2 });
      if (state[a.id]) { const s = narrow ? state[a.id].replace(/^cached: /, '') : state[a.id]; fitText(ctx, s, x, 82, colW - 8, { align: 'center', size: narrow ? 10 : 11, font: MONO, color: COL.accent }); }
    });

    // messages
    const colOf = s => s.kind === 'answer' ? COL.accent : s.kind === 'fail' ? COL.red : COL.ink2;
    for (let i = 0; i <= cur; i++) {
      const s = steps[i], y = headH + i * rowH + 26, x0 = X[s.from], x1 = X[s.to], dir = Math.sign(x1 - x0) || 1;
      const prog = i === cur ? clamp((t - times[i]) / FLOW_MOVE) : 1, xe = lerp(x0, x1, ease(prog));
      const c = colOf(s), old = i < cur;
      ctx.strokeStyle = old ? rgba(c, .55) : c; ctx.lineWidth = 1.2;
      if (s.kind === 'refer') ctx.setLineDash([4, 3]);
      line(ctx, { x: x0, y }, { x: xe, y }); ctx.setLineDash([]); ctx.lineWidth = 1;
      if (prog >= 1) { ctx.fillStyle = old ? rgba(c, .55) : c; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - dir * 7, y - 3.5); ctx.lineTo(x1 - dir * 7, y + 3.5); ctx.closePath(); ctx.fill(); }
      else dot(ctx, xe, y, 3.4, c);
      const lab = s.label.replace(/\*\*|`/g, ''), mid = (x0 + x1) / 2;
      fitText(ctx, lab, mid, y - 10, Math.max(Math.abs(x1 - x0) - 12, colW - 12), { align: 'center', size: narrow ? 10.5 : 12, font: narrow ? MONO : SANS, weight: old ? 400 : 500, color: old ? COL.muted : (s.kind === 'answer' ? COL.accent : COL.ink) });
      text(ctx, String(i + 1), narrow ? 10 : 18, y, { size: 10.5, font: MONO, color: old ? COL.hair2 : COL.muted });
    }
    if (!wantStats) return null;
    const asks = f.def.counter ? steps.filter((s, i) => i <= cur && s.from === f.def.counter && s.to !== 'laptop').length : 0;
    return `<span>step ${Math.max(0, cur + 1)} of ${steps.length}</span>` + (f.def.counter ? `<span>questions the resolver sent: ${asks}</span>` : '');
  }
};

// Draw text, shrinking it with an ellipsis if it is wider than maxW.
function fitText(ctx, s, x, y, maxW, o) {
  ctx.font = `${o.weight || 400} ${o.size || 12}px ${o.font || SANS}`;
  let str = String(s);
  if (ctx.measureText(str).width > maxW) { while (str.length > 3 && ctx.measureText(str + '…').width > maxW) str = str.slice(0, -1); str += '…'; }
  text(ctx, str, x, y, o);
}
