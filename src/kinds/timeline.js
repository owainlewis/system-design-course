/* Timeline: a waterfall. Each row is a lane with one or more spans on a shared time axis; a cursor sweeps
   left to right and fills the spans it has passed.
   Figure def: { kind: 'timeline', unit: 'ms', rows | scenarios: { key: { label, rows, note } }, legend: [[tone, label]] }
   A row is { label, depth, spans: [{ s, d, tone, text }] } or the shorthand { label, s, d, tone, text }.
   Tones: net (on the wire), work (a server doing work), wait (idle), stall (blocked), fail, accent. */
const TL_SWEEP = 5, TL_HOLD = 2.4;

function tlScenario(f) {
  const d = f.def;
  if (!d.scenarios) return { rows: d.rows, note: d.note };
  return d.scenarios[f.ctrl.scenario ?? Object.keys(d.scenarios)[0]];
}
const tlSpans = r => r.spans || [{ s: r.s, d: r.d, tone: r.tone, text: r.text }];
const tlEnd = rows => Math.max(...rows.flatMap(r => tlSpans(r).map(s => s.s + s.d)));
// The axis covers the longest scenario, so switching scenarios compares like with like.
const tlAxis = f => f.def.axis || (f.def.scenarios ? Math.max(...Object.values(f.def.scenarios).map(s => tlEnd(s.rows))) : tlEnd(f.def.rows));

function tlFmt(v, unit) { return unit === 'ms' && v >= 1000 ? `${fmt(v / 1000, v % 1000 ? 1 : 0)} s` : `${fmt(v, v < 10 && v % 1 ? 1 : 0)} ${unit}`; }
function tlTicks(max, n = 6) { const raw = max / Math.max(2, Math.min(6, n)), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

KINDS.timeline = {
  period: f => (f.def.sweep ?? TL_SWEEP) + TL_HOLD,
  init(f) {
    if (f.def.scenarios && f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (f.def.scenarios && !f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const sc = tlScenario(f), rows = sc.rows, unit = f.def.unit || 'ms', axis = tlAxis(f);
    const maxRows = f.def.scenarios ? Math.max(...Object.values(f.def.scenarios).map(s => s.rows.length)) : rows.length;
    const rowH = 30;
    const legendRows = !f.def.legend ? 0 : (f.cv.parentElement.clientWidth || 600) < 600 && f.def.legend.length > 1 ? 2 : 1, top = 14 + legendRows * 18;
    const { ctx, w, h } = fitCanvas(f.cv, () => top + maxRows * rowH + 44);
    const narrow = w < 600, labW = narrow ? Math.min(118, w * .36) : Math.min(210, w * .28), x0 = labW + 12, x1 = w - 18;
    const X = v => x0 + v / axis * (x1 - x0);
    const now = clamp(f.t / (f.def.sweep ?? TL_SWEEP)) * axis, done = f.t >= (f.def.sweep ?? TL_SWEEP);
    const toneCol = t => t === 'work' || t === 'accent' ? COL.accent : t === 'fail' || t === 'stall' ? COL.red : t === 'wait' ? COL.hair2 : COL.ink2;

    if (f.def.legend) {
      let lx = narrow ? 8 : x0, ly = 9; f.def.legend.forEach(([tone, label]) => {
        ctx.font = `400 11.5px ${SANS}`; if (lx > 8 && lx + 24 + ctx.measureText(label).width > w - 8) { lx = 8; ly += 16; }
        ctx.fillStyle = tone === 'wait' ? COL.hair : rgba(toneCol(tone), tone === 'net' ? .35 : .8); rr(ctx, lx, ly, 14, 9, 2); ctx.fill();
        text(ctx, label, lx + 20, ly + 5, { size: 11.5 }); ctx.font = `400 11.5px ${SANS}`; lx += 34 + ctx.measureText(label).width;
      });
    }
    // grid
    const step = tlTicks(axis, (x1 - x0) / 60), axY = top + maxRows * rowH + 6;
    for (let v = 0; v <= axis + 1e-9; v += step) {
      const x = Math.round(X(v)) + .5; ctx.strokeStyle = COL.hair; ctx.setLineDash([2, 4]); line(ctx, { x, y: top }, { x, y: axY }); ctx.setLineDash([]);
      text(ctx, tlFmt(v, unit), x, axY + 12, { align: 'center', size: 10.5, font: MONO });
    }
    rows.forEach((r, i) => {
      const y = top + i * rowH + rowH / 2, ind = (r.depth || 0) * 12;
      fitText(ctx, r.label, 8 + ind, y, labW - ind, { size: narrow ? 11 : 12, color: COL.ink2 });
      for (const sp of tlSpans(r)) {
        const a = X(sp.s), b = X(sp.s + sp.d), fill = clamp((now - sp.s) / sp.d), c = toneCol(sp.tone);
        rr(ctx, a, y - 8, Math.max(2, b - a), 16, 3); ctx.strokeStyle = sp.tone === 'wait' ? COL.hair2 : rgba(c, .45); ctx.lineWidth = 1; ctx.stroke();
        if (fill > 0) {
          ctx.save(); rr(ctx, a, y - 8, Math.max(2, b - a), 16, 3); ctx.clip();
          ctx.fillStyle = sp.tone === 'wait' ? COL.hair : rgba(c, sp.tone === 'net' ? .3 : .85); ctx.fillRect(a, y - 8, (b - a) * fill, 16);
          if (sp.tone === 'stall') { ctx.strokeStyle = rgba(COL.red, .9); for (let k = a - 16; k < a + (b - a) * fill; k += 6) line(ctx, { x: k, y: y + 8 }, { x: k + 16, y: y - 8 }); }
          ctx.restore();
        }
        if (sp.text && fill >= 1) {
          ctx.font = `500 11px ${MONO}`; const tw = ctx.measureText(sp.text).width, inside = tw + 10 < b - a;
          text(ctx, sp.text, inside ? (a + b) / 2 : b + 6, y + .5, { align: inside ? 'center' : 'left', size: 11, font: MONO, weight: 500, color: inside ? (sp.tone === 'net' || sp.tone === 'wait' ? COL.ink : COL.node) : COL.ink2 });
        }
      }
    });
    if (!done) { ctx.strokeStyle = rgba(COL.ink, .5); line(ctx, { x: X(now), y: top - 4 }, { x: X(now), y: axY }); }
    if (!wantStats) return null;
    const end = tlEnd(rows);
    return `<span>${done ? 'total' : 'time'} ${tlFmt(Math.min(now, end), unit)}</span>` + (sc.note ? `<span>${sc.note}</span>` : '');
  }
};
