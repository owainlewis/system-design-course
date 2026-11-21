/* Calc: a worked estimate. Sliders set the inputs; each row shows its formula with the numbers filled in.
   Figure def: { kind: 'calc', controls: [range...], ctrl: { ...inputs }, rows: [{ label, expr, show, format, tone }] }
   expr is a JavaScript expression over the inputs and earlier rows (by key). show is the formula text,
   where {name} is replaced by that input or row value. Content is ours, so the expressions are trusted. */
const CALC_STEP = 0.5, CALC_HOLD = 4;
function calcRun(def, ctrl) {
  const env = { ...ctrl }, out = [];
  for (const r of def.rows) {
    const v = Function(...Object.keys(env), `return (${r.expr});`)(...Object.values(env));
    if (r.key) env[r.key] = v; out.push({ ...r, v });
  }
  return { env, out };
}
function calcFmt(v, kind) {
  if (kind === 'bytes' || kind === 'duration') return barFmt(v, kind);
  if (kind === 'bool') return v ? 'Yes' : 'No';
  if (kind === 'big') { const u = [[1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million'], [1e3, ' thousand']].find(([k]) => Math.abs(v) >= k); return u ? `${fmt(v / u[0], v / u[0] < 10 ? 1 : 0)}${u[1]}` : fmt(v); }
  if (kind === 'g') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
  if (kind === 'rate') return `${fmt(v)} / s`;
  if (kind && kind.startsWith('d')) return fmt(v, +kind.slice(1));
  return fmt(v);
}

KINDS.calc = {
  period: f => f.def.rows.length * CALC_STEP + CALC_HOLD,
  draw(f, wantStats) {
    const { env, out } = calcRun(f.def, f.ctrl);
    const rowH = 54;
    const { ctx, w, h } = fitCanvas(f.cv, () => 18 + out.length * rowH + 10);
    const narrow = w < 600;
    out.forEach((r, i) => {
      const topY = 14 + i * rowH, y = topY + 18, g = clamp((f.t - i * CALC_STEP) / .4);
      ctx.globalAlpha = .25 + .75 * g;
      const shown = (r.show || '').replace(/\{(\w+)\}/g, (_, k) => calcFmt(env[k], (f.def.formats || {})[k]));
      const valStr = calcFmt(r.v, r.format);
      const isAcc = r.tone === 'accent';
      if (isAcc) {
        rr(ctx, 12, topY + 2, w - 24, rowH - 6, 7);
        ctx.fillStyle = rgba(COL.accent, .08); ctx.fill();
        ctx.strokeStyle = rgba(COL.accent, .28); ctx.stroke();
      }
      text(ctx, r.label, 22, y, { size: narrow ? 12.5 : 13.5, weight: isAcc ? 600 : 500, color: COL.ink });
      text(ctx, valStr, w - 22, y + 4, { align: 'right', size: narrow ? 15 : 17, font: MONO, weight: 600, color: isAcc ? COL.accent : COL.ink });
      if (shown) fitText(ctx, shown, 22, y + 18, w - 130, { size: narrow ? 10.5 : 11.5, font: MONO, color: COL.muted });
      ctx.globalAlpha = 1;
      if (i < out.length - 1 && !isAcc && out[i + 1]?.tone !== 'accent') {
        ctx.strokeStyle = COL.hair; line(ctx, { x: 22, y: topY + rowH - 1.5 }, { x: w - 22, y: topY + rowH - 1.5 });
      }
    });
    if (!wantStats) return null;
    return f.def.stat ? `<span>${f.def.stat}</span>` : '';
  }
};
