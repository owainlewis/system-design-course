/* Ring: keys spread over servers, by hash mod N or by consistent hashing.
   Figure def: { kind: 'ring', keys, servers: ['A', ...], mode: 'mod' | 'ring', vnodes, script: [{ at, act: 'add' | 'remove' }], period }
   Controls may set ctrl.mode and ctrl.vnodes, and offer add/remove actions. */
const RING_NAMES = 'ABCDEFGH'.split('');
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
const unit = s => hash32(s) / 4294967296;

// Pure assignment: which server owns each key. Shared with the tests.
function ringAssign(keys, servers, mode, vnodes, salt = '') {
  const owner = {};
  if (mode === 'mod') { keys.forEach(k => owner[k] = servers[hash32(k) % servers.length]); return { owner, points: [] }; }
  const points = [];
  servers.forEach(s => { for (let v = 0; v < vnodes; v++) points.push({ at: unit(`${salt}${s}#${v}`), s }); });
  points.sort((a, b) => a.at - b.at);
  keys.forEach(k => { const u = unit(k); const p = points.find(p => p.at >= u) || points[0]; owner[k] = p.s; });
  return { owner, points };
}

KINDS.ring = {
  period: f => f.def.period || 8,
  init(f) {
    const d = f.def;
    f.keys = Array.from({ length: d.keys || 100 }, (_, i) => `key-${i + 1}`);
    f.ctrl.mode ??= d.mode || 'ring'; f.ctrl.vnodes ??= d.vnodes || 1;
    f.servers = [...d.servers]; f.base = [...d.servers];
    f.assign = ringAssign(f.keys, f.servers, f.ctrl.mode, f.ctrl.vnodes, f.def.salt); f.prev = null; f.moved = new Set(); f.changedAt = -1e9; f.lastT = 0;
  },
  apply(f, servers, highlight = true) {
    const next = ringAssign(f.keys, servers, f.ctrl.mode, f.ctrl.vnodes, f.def.salt);
    f.prev = highlight ? f.assign : null;
    f.moved = new Set(highlight ? f.keys.filter(k => f.assign.owner[k] !== next.owner[k]) : []);
    f.servers = servers; f.assign = next; f.changedAt = performance.now();
  },
  change(f) { KINDS.ring.apply(f, f.servers, false); f.manual = !!f.def.controls?.some(c => c.type === 'action'); },
  action(f, a) {
    f.manual = true;
    if (a === 'add' && f.servers.length < 8) KINDS.ring.apply(f, [...f.servers, RING_NAMES.find(n => !f.servers.includes(n))]);
    if (a === 'remove' && f.servers.length > 2) KINDS.ring.apply(f, f.servers.slice(0, -1));
  },
  draw(f, wantStats) {
    // scripted add/remove, unless the reader has taken over
    if (f.def.script && !f.manual) {
      if (f.t < f.lastT) KINDS.ring.apply(f, [...f.base], false);
      for (const st of f.def.script) if (f.lastT < st.at && f.t >= st.at) KINDS.ring.action(f, st.act), f.manual = false;
      f.lastT = f.t;
    }
    const portrait = (f.cv.parentElement.clientWidth || 600) < 600, mode = f.ctrl.mode;
    const N = f.servers.length, perRow = 12, pitch = 8.5;
    const counts = Object.fromEntries(f.servers.map(s => [s, 0])); f.keys.forEach(k => counts[f.assign.owner[k]]++);
    const maxRows = Math.max(3, Math.ceil(Math.max(...Object.values(counts), ...(f.prev ? Object.values(countOf(f.prev.owner)) : [0])) / perRow));
    const boxH = 30 + maxRows * pitch + 8, boxW = perRow * pitch + 24;
    const { ctx, w, h } = fitCanvas(f.cv, ww => ww < 600 ? 300 + Math.ceil(8 / 2) * (boxH + 10) : Math.max(330, 40 + Math.ceil(8 / Math.max(1, Math.floor((ww * .56) / (boxW + 12)))) * (boxH + 12)));
    const age = (performance.now() - f.changedAt) / 1000, mv = ease(clamp(age / .9));

    // left: the ring, or the formula
    const R = portrait ? Math.min(w * .32, 112) : Math.min(h * .36, w * .17), cx = portrait ? w / 2 : Math.max(R + 40, w * .22), cy = portrait ? R + 34 : h / 2;
    if (mode === 'ring') {
      ctx.strokeStyle = COL.hair2; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      const ang = u => -Math.PI / 2 + u * Math.PI * 2, P = (u, r) => ({ x: cx + Math.cos(ang(u)) * r, y: cy + Math.sin(ang(u)) * r });
      const pts = f.assign.points;
      // ownership arcs: from the previous point to each point, in that point's server colour
      pts.forEach((p, i) => { const prev = pts[(i - 1 + pts.length) % pts.length]; let a0 = prev.at, a1 = p.at; if (a1 <= a0) a1 += 1; ctx.strokeStyle = serverColor(p.s, f); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R, ang(a0), ang(a1)); ctx.stroke(); });
      ctx.lineWidth = 1;
      f.keys.forEach(k => { const p = P(unit(k), R - 10); dot(ctx, p.x, p.y, 2, f.moved.has(k) && age < 3 ? COL.accent : serverColor(f.assign.owner[k], f)); });
      const few = pts.length <= 12;
      pts.forEach(p => { const q = P(p.at, R); if (few) { rr(ctx, q.x - 6, q.y - 6, 12, 12, 3); ctx.fillStyle = COL.node; ctx.fill(); ctx.strokeStyle = serverColor(p.s, f); ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1; const l = P(p.at, R + 18); text(ctx, p.s, l.x, l.y, { align: 'center', size: 12, weight: 600, color: COL.ink }); } else { const a = P(p.at, R - 4), b = P(p.at, R + 4); ctx.strokeStyle = serverColor(p.s, f); line(ctx, a, b); } });
      text(ctx, 'each key goes to the next', cx, cy - 8, { align: 'center', size: 11.5 });
      text(ctx, 'server clockwise', cx, cy + 8, { align: 'center', size: 11.5 });
    } else {
      text(ctx, 'server = hash(key) mod N', cx, cy - 22, { align: 'center', size: 13, font: MONO, color: COL.ink });
      text(ctx, `N = ${N}`, cx, cy + 10, { align: 'center', size: 26, font: SANS, weight: 600, color: COL.ink });
      text(ctx, 'change N and most keys get a new server', cx, cy + 40, { align: 'center', size: 11.5 });
    }

    // right: one box per server, holding its keys
    const areaX = portrait ? 16 : Math.max(cx + R + 48, w * .44), areaW = w - areaX - 16, areaY = portrait ? cy + R + 40 : 24;
    const cols = Math.max(1, Math.floor((areaW + 12) / (boxW + 12)));
    const bw = Math.min(boxW + 40, (areaW - (cols - 1) * 12) / cols);
    const boxAt = s => { const i = f.servers.indexOf(s); return { x: areaX + (i % cols) * (bw + 12), y: areaY + Math.floor(i / cols) * (boxH + 12) }; };
    const slot = (s, idx) => { const b = boxAt(s); return { x: b.x + 12 + (idx % perRow) * pitch + pitch / 2, y: b.y + 34 + Math.floor(idx / perRow) * pitch }; };
    f.servers.forEach(s => {
      const b = boxAt(s); rr(ctx, b.x, b.y, bw, boxH, 6); ctx.fillStyle = COL.node; ctx.fill(); ctx.strokeStyle = COL.hair2; ctx.stroke();
      ctx.fillStyle = serverColor(s, f); ctx.fillRect(b.x + 12, b.y + 12, 8, 8);
      text(ctx, `Server ${s}`, b.x + 26, b.y + 16.5, { size: 12, weight: 500, color: COL.ink });
      text(ctx, `${counts[s]}`, b.x + bw - 12, b.y + 16.5, { align: 'right', size: 11.5, font: MONO, color: COL.muted });
    });
    // place keys: index within their server, in key order
    const idxNow = {}, idxPrev = {}; const cNow = {}, cPrev = {};
    f.keys.forEach(k => { const o = f.assign.owner[k]; idxNow[k] = cNow[o] = (cNow[o] ?? -1) + 1; if (f.prev) { const po = f.prev.owner[k]; idxPrev[k] = cPrev[po] = (cPrev[po] ?? -1) + 1; } });
    f.keys.forEach(k => {
      const o = f.assign.owner[k], to = slot(o, idxNow[k]);
      let p = to;
      if (f.prev && mv < 1 && f.prev.owner[k] !== o) {
        const po = f.prev.owner[k]; const from = f.servers.includes(po) ? slot(po, idxPrev[k]) : { x: to.x, y: to.y - 30 };
        p = { x: lerp(from.x, to.x, mv), y: lerp(from.y, to.y, mv) };
      }
      const hot = f.moved.has(k) && age < 3;
      dot(ctx, p.x, p.y, hot ? 3 : 2.6, hot ? COL.accent : serverColor(o, f));
    });

    if (!wantStats) return null;
    const avg = f.keys.length / N, mx = Math.max(...Object.values(counts));
    const movedTxt = f.prev ? `<span class="pass">moved ${f.moved.size} of ${f.keys.length} keys (${Math.round(f.moved.size / f.keys.length * 100)}%)</span>` : `<span>${f.keys.length} keys</span>`;
    return movedTxt + `<span>${N} servers</span><span class="${mx / avg > 1.5 ? 'bad' : ''}">busiest server ${fmt(mx / avg, 2)}x the average</span>`;
  }
};
function countOf(owner) { const c = {}; for (const k in owner) c[owner[k]] = (c[owner[k]] || 0) + 1; return c; }
function serverColor(s, f) { const i = RING_NAMES.indexOf(s); return COL['s' + (i % 6)] || COL.ink2; }
