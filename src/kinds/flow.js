/* Flow: a sequence diagram. Actors are columns; each message is a row, drawn as an arrow from one column to another.
   Figure def: { kind: 'flow', actors: [{ id, label, short, icon }], steps | scenarios: { key: { label, steps, state } }, counter }
   A step is { from, to, label, kind: 'ask' | 'refer' | 'answer' | 'fail' | 'lost', set: { actorId: text } }.
   from === to draws local work as a bracket beside that actor. 'lost' stops halfway with a cross.
   counter is an actor id (legacy: counts its questions) or { from, to?, label }: counts steps sent from that actor. */
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
      if (state[a.id]) { const s = narrow ? state[a.id].replace(/^cached: /, '') : state[a.id]; fitText(ctx, s, x, 82, Math.min(colW - 8, 2 * Math.min(x, w - x) - 6), { align: 'center', size: narrow ? 10 : 11, font: MONO, color: COL.accent }); }
    });

    // messages
    const colOf = s => s.kind === 'answer' ? COL.accent : (s.kind === 'fail' || s.kind === 'lost') ? COL.red : COL.ink2;
    for (let i = 0; i <= cur; i++) {
      const s = steps[i], y = headH + i * rowH + 26, x0 = X[s.from], x1 = X[s.to], dir = Math.sign(x1 - x0) || 1;
      const prog = i === cur ? clamp((t - times[i]) / FLOW_MOVE) : 1;
      const c = colOf(s), old = i < cur, cc = old ? rgba(c, .55) : c;
      const lab = s.label.replace(/\*\*|`/g, '');
      const labStyle = { size: narrow ? 10.5 : 12, font: narrow ? MONO : SANS, weight: old ? 400 : 500, color: old ? COL.muted : (s.kind === 'answer' ? COL.accent : (s.kind === 'fail' || s.kind === 'lost') ? COL.red : COL.ink) };
      ctx.strokeStyle = cc; ctx.lineWidth = 1.2;
      if (s.from === s.to) {
        // local work: a bracket to the right of the lifeline, drawn as it progresses
        const bw = 14, top = y - 12, bot = y + 8, right = x0 + bw * ease(prog);
        ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(right, top); if (prog > .5) { ctx.lineTo(right, lerp(top, bot, ease((prog - .5) * 2))); } if (prog >= 1) ctx.lineTo(x0 + 4, bot); ctx.stroke();
        if (prog >= 1) { ctx.fillStyle = cc; ctx.beginPath(); ctx.moveTo(x0, bot); ctx.lineTo(x0 + 7, bot - 3.5); ctx.lineTo(x0 + 7, bot + 3.5); ctx.closePath(); ctx.fill(); }
        const room = actors.findIndex(a => a.id === s.from) === n - 1;
        fitText(ctx, lab, room ? x0 - 8 : x0 + bw + 8, y - 2, room ? x0 - 30 : w - x0 - bw - 16, { ...labStyle, align: room ? 'right' : 'left' });
      } else {
        const lost = s.kind === 'lost', end = lost ? lerp(x0, x1, .55) : x1, xe = lerp(x0, end, ease(prog));
        if (s.kind === 'refer') ctx.setLineDash([4, 3]);
        line(ctx, { x: x0, y }, { x: xe, y }); ctx.setLineDash([]);
        if (prog >= 1 && lost) { ctx.lineWidth = 1.5; line(ctx, { x: end - 4, y: y - 4 }, { x: end + 4, y: y + 4 }); line(ctx, { x: end + 4, y: y - 4 }, { x: end - 4, y: y + 4 }); }
        else if (prog >= 1) { ctx.fillStyle = cc; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x1 - dir * 7, y - 3.5); ctx.lineTo(x1 - dir * 7, y + 3.5); ctx.closePath(); ctx.fill(); }
        else dot(ctx, xe, y, 3.4, c);
        // labels may run past the arrow's ends when the arrow is short; keep them inside the canvas
        ctx.font = `${labStyle.weight} ${labStyle.size}px ${labStyle.font}`;
        const lw = Math.min(ctx.measureText(lab).width, w - 40), mid = clamp((x0 + x1) / 2, 28 + lw / 2, w - 8 - lw / 2);
        fitText(ctx, lab, mid, y - 10, w - 40, { ...labStyle, align: 'center' });
      }
      ctx.lineWidth = 1;
      text(ctx, String(i + 1), narrow ? 10 : 18, y, { size: 10.5, font: MONO, color: old ? COL.hair2 : COL.muted });
    }
    if (!wantStats) return null;
    const C = typeof f.def.counter === 'string' ? { from: f.def.counter, not: 'laptop', label: 'questions the resolver sent' } : f.def.counter;
    const asks = C ? steps.filter((s, i) => i <= cur && s.from === C.from && s.to !== s.from && s.to !== C.not && (!C.to || s.to === C.to)).length : 0;
    return `<span>step ${Math.max(0, cur + 1)} of ${steps.length}</span>` + (C ? `<span>${C.label}: ${asks}</span>` : '') + (sc.note ? `<span>${sc.note}</span>` : '');
  }
};

// Draw text, shrinking it with an ellipsis if it is wider than maxW.
function fitText(ctx, s, x, y, maxW, o) {
  ctx.font = `${o.weight || 400} ${o.size || 12}px ${o.font || SANS}`;
  let str = String(s);
  if (ctx.measureText(str).width > maxW) { while (str.length > 3 && ctx.measureText(str + '…').width > maxW) str = str.slice(0, -1); str += '…'; }
  text(ctx, str, x, y, o);
}
