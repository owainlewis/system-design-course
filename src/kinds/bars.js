/* Bars: values compared on a linear or log scale. Bars grow in one at a time.
   Figure def: { kind: 'bars', scale: 'log' | 'linear', format: 'time-ns' | 'bytes' | 'number', items | sets: { key: { label, items } } }
   An item is { label, value, tone: 'accent' | 'red' | 'muted', note }. A 'scale' toggle may set ctrl.scale. */
const BAR_STEP = 0.45, BAR_HOLD = 3;

function barSet(f) { const d = f.def; return d.sets ? d.sets[f.ctrl.set ?? Object.keys(d.sets)[0]].items : d.items; }
function barFmt(v, kind) {
  if (kind === 'time-ns') {
    const u = [[1e9, 's'], [1e6, 'ms'], [1e3, 'µs'], [1, 'ns']].find(([k]) => v >= k) || [1, 'ns'];
    const x = v / u[0]; return `${fmt(x, x < 10 && x % 1 ? 1 : 0)} ${u[1]}`;
  }
  if (kind === 'time-ms') return v >= 1000 ? `${fmt(v / 1000, v % 1000 ? 1 : 0)} s` : `${fmt(v)} ms`;
  if (kind === 'bytes') {
    const u = [[1e15, 'PB'], [1e12, 'TB'], [1e9, 'GB'], [1e6, 'MB'], [1e3, 'KB'], [1, 'B']].find(([k]) => v >= k) || [1, 'B'];
    const x = v / u[0]; return `${fmt(x, x < 10 && x % 1 ? 1 : 0)} ${u[1]}`;
  }
  return fmt(v, v < 10 && v % 1 ? 1 : 0) + (kind && kind !== 'number' ? ` ${kind}` : '');
}

KINDS.bars = {
  period: f => Math.max(...(f.def.sets ? Object.values(f.def.sets).map(s => s.items.length) : [f.def.items.length])) * BAR_STEP + BAR_HOLD,
  init(f) {
    if (f.def.sets && f.ctrl.set == null) f.ctrl.set = Object.keys(f.def.sets)[0];
    f.ctrl.scale ??= f.def.scale || 'linear';
    if (f.def.sets && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'set', label: '', options: Object.entries(f.def.sets).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const items = barSet(f), log = f.ctrl.scale === 'log', kind = f.def.format;
    const maxN = f.def.sets ? Math.max(...Object.values(f.def.sets).map(s => s.items.length)) : items.length;
    const rowH = 34, top = 26;
    const { ctx, w, h } = fitCanvas(f.cv, () => top + maxN * rowH + 40);
    const narrow = w < 600, labW = narrow ? Math.min(132, w * .4) : Math.min(250, w * .32), x0 = labW + 14, x1 = w - (narrow ? 64 : 96);
    const all = (f.def.sets ? Object.values(f.def.sets).flatMap(s => s.items) : items).map(i => i.value);
    const max = f.def.max ?? Math.max(...all), min = f.def.min ?? Math.min(...all.filter(v => v > 0));
    const lo = Math.pow(10, Math.floor(Math.log10(min))), hi = Math.pow(10, Math.ceil(Math.log10(max)));
    const X = v => log ? x0 + (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * (x1 - x0) : x0 + v / max * (x1 - x0);
    const axY = top + maxN * rowH + 4;
    if (log) for (let v = lo; v <= hi * 1.0001; v *= 10) {
      const x = Math.round(X(v)) + .5; ctx.strokeStyle = COL.hair; ctx.setLineDash([2, 4]); line(ctx, { x, y: top }, { x, y: axY }); ctx.setLineDash([]);
      const gap = (x1 - x0) / Math.max(1, Math.log10(hi / lo)), every = Math.ceil(56 / gap);
      if (Math.round(Math.log10(v / lo)) % every === 0) text(ctx, barFmt(v, kind), x, axY + 12, { align: 'center', size: 10.5, font: MONO });
    } else { ctx.strokeStyle = COL.hair2; line(ctx, { x: x0 + .5, y: top }, { x: x0 + .5, y: axY }); }
    text(ctx, log ? 'log scale: each line is 10 times the last' : 'linear scale', w - 12, 10, { align: 'right', size: 10.5, font: MONO });
    items.forEach((it, i) => {
      const y = top + i * rowH + rowH / 2, g = ease(clamp((f.t - i * BAR_STEP) / .6)); if (g <= 0) { fitText(ctx, it.label, 8, y, labW - 4, { size: narrow ? 11.5 : 12.5, color: COL.muted }); return; }
      const c = it.tone === 'accent' ? COL.accent : it.tone === 'red' ? COL.red : it.tone === 'muted' ? COL.hair2 : COL.ink2;
      fitText(ctx, it.label, 8, y - (it.note && !narrow ? 6 : 0), labW - 4, { size: narrow ? 11.5 : 12.5, color: COL.ink });
      if (it.note && !narrow) fitText(ctx, it.note, 8, y + 8, labW - 4, { size: 10.5, font: MONO, color: COL.muted });
      const bw = Math.max(2, (X(it.value) - x0) * g);
      rr(ctx, x0, y - 7, bw, 14, 3); ctx.fillStyle = rgba(c, it.tone === 'muted' ? 1 : .85); ctx.fill();
      if (g > .9) text(ctx, barFmt(it.value, kind), x0 + bw + 8, y + .5, { size: 11.5, font: MONO, weight: 500, color: COL.ink2 });
    });
    if (!wantStats) return null;
    const ratio = max / min;
    return f.def.stat ? `<span>${f.def.stat}</span>` : `<span>largest is ${fmt(ratio)} times the smallest</span>`;
  }
};
