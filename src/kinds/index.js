/* Index: finding one row with a full table scan or through a B-tree index.
   Figure def: { kind: 'index', rows, target, scenarios: { scan: { label, mode: 'scan' }, tree: { label, mode: 'tree' } } }
   The table is drawn as a grid of rows in the order they were inserted. A scan reads them in order until it reaches
   the target. The tree reads one page per level, then the row. */
const IX_SCAN = 6, IX_HOLD = 2.5, IX_LEVEL = 0.9;

KINDS.index = {
  period: f => (ixMode(f) === 'scan' ? IX_SCAN : 4 * IX_LEVEL + .6) + IX_HOLD,
  init(f) {
    if (f.ctrl.scenario == null) f.ctrl.scenario = Object.keys(f.def.scenarios)[0];
    if (!f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'scenario', label: '', options: Object.entries(f.def.scenarios).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  draw(f, wantStats) {
    const d = f.def, mode = ixMode(f), R = d.rows || 96, target = d.target ?? 77;
    const portrait = (f.cv.parentElement.clientWidth || 600) < 600;
    const cols = portrait ? 12 : 16, rowsN = Math.ceil(R / cols);
    const { ctx, w, h } = fitCanvas(f.cv, () => 196 + rowsN * 20 + 40);
    // the tree, on top
    const levels = [[{ label: 'a – z' }], [{ label: 'a – f' }, { label: 'g – m' }, { label: 'n – s' }, { label: 't – z' }]];
    const leaves = Array.from({ length: portrait ? 8 : 12 }, (_, i) => ({ label: '' }));
    const leafIdx = Math.round(leaves.length * .62);
    leaves[leafIdx].label = 'nina';
    levels.push(leaves);
    const path = [0, 2, leafIdx];   // root, then 'n – s', then the leaf containing nina@example.com
    const tTop = 18, lvlGap = 54, nodeH = 24;
    const posOf = (l, i) => { const n = levels[l].length, nw = l === 2 ? Math.min(54, (w - 40) / n - 6) : l === 1 ? Math.min(110, (w - 40) / 4 - 10) : 120; const span = Math.min(w - 40, n * (nw + (l === 2 ? 6 : 16))); return { x: w / 2 - span / 2 + (i + .5) * span / n, y: tTop + l * lvlGap, nw }; };
    const step = mode === 'tree' ? Math.floor(f.t / IX_LEVEL) : -1;   // 0 root, 1 internal, 2 leaf, 3 row
    for (let l = 0; l < 3; l++) levels[l].forEach((nd, i) => {
      const p = posOf(l, i), on = mode === 'tree' && path[l] === i && step >= l, dim = mode === 'scan';
      if (l > 0) { const parentIdx = l === 1 ? 0 : Math.min(3, Math.floor(i / (levels[2].length / 4))); const pp = posOf(l - 1, parentIdx); ctx.strokeStyle = on ? COL.accent : COL.hair2; ctx.lineWidth = on ? 1.5 : 1; line(ctx, { x: pp.x, y: pp.y + nodeH / 2 }, { x: p.x, y: p.y - nodeH / 2 }); ctx.lineWidth = 1; }
      rr(ctx, p.x - p.nw / 2, p.y - nodeH / 2, p.nw, nodeH, 4); ctx.fillStyle = on ? rgba(COL.accent, .14) : COL.node; ctx.fill();
      ctx.strokeStyle = on ? COL.accent : dim ? COL.hair : COL.hair2; ctx.lineWidth = on ? 1.5 : 1; ctx.stroke(); ctx.lineWidth = 1;
      if (nd.label) text(ctx, nd.label, p.x, p.y + .5, { align: 'center', size: l === 2 ? 10 : 11, font: MONO, color: on ? COL.accent : dim ? COL.hair2 : COL.ink2 });
    });
    text(ctx, mode === 'tree' ? 'B-tree index on email' : 'no index on email', 12, tTop, { size: 11, font: MONO, color: mode === 'tree' ? COL.ink2 : COL.muted });

    // the table, below
    const gTop = tTop + 2 * lvlGap + 44, cellW = Math.min(34, (w - 40) / cols), gx = w / 2 - cols * cellW / 2;
    text(ctx, `users table · ${fmt(R)} rows, in the order they were added`, gx, gTop - 14, { size: 11, font: MONO });
    const readUpTo = mode === 'scan' ? Math.min(R - 1, Math.floor(clamp(f.t / IX_SCAN) * R)) : -1;
    const found = mode === 'scan' ? readUpTo >= target : step >= 3;
    for (let i = 0; i < R; i++) {
      const x = gx + (i % cols) * cellW, y = gTop + Math.floor(i / cols) * 20, isT = i === target;
      rr(ctx, x + 1.5, y, cellW - 3, 15, 3);
      const read = i <= readUpTo;
      ctx.fillStyle = isT && found ? COL.accent : read ? rgba(COL.ink2, .35) : COL.node; ctx.fill();
      ctx.strokeStyle = isT && found ? COL.accent : COL.hair2; ctx.stroke();
    }
    if (mode === 'tree' && step >= 3) {
      const lp = posOf(2, path[2]), tx = gx + (target % cols) * cellW + cellW / 2, ty = gTop + Math.floor(target / cols) * 20;
      const g = ease(clamp((f.t - 3 * IX_LEVEL) / .5)); ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
      line(ctx, { x: lp.x, y: lp.y + nodeH / 2 }, { x: lerp(lp.x, tx, g), y: lerp(lp.y + nodeH / 2, ty, g) }); ctx.setLineDash([]); ctx.lineWidth = 1;
    }
    if (mode === 'scan' && readUpTo < R - 1) { const i = readUpTo + 1, x = gx + (i % cols) * cellW, y = gTop + Math.floor(i / cols) * 20; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; rr(ctx, x + 1.5, y, cellW - 3, 15, 3); ctx.stroke(); ctx.lineWidth = 1; }

    if (!wantStats) return null;
    const reads = mode === 'scan' ? readUpTo + 1 : Math.min(4, step + 1);
    return `<span>${mode === 'scan' ? 'rows checked' : 'pages read'} ${Math.max(0, reads)}</span>` + (found ? `<span class="pass">found nina@example.com</span>` : '') + (mode === 'scan' && found && readUpTo < R - 1 ? '<span>still scanning: another row could match</span>' : '');
  }
};
function ixMode(f) { return f.def.scenarios[f.ctrl.scenario ?? Object.keys(f.def.scenarios)[0]].mode; }
