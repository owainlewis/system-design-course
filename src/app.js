const SPEC = JSON.parse(document.getElementById('lesson-spec').textContent);
const COURSE = JSON.parse(document.getElementById('course-spec').textContent);
const $ = id => document.getElementById(id);
const FLAT = document.documentElement.hasAttribute('data-flat');
const lessonHref = slug => FLAT ? `${slug}.html` : `/${slug}/`;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TIN = 0.55, TOUT = 0.5;
// Figures play slower than real time so the eye can follow each request.
const SPEED = 0.7;
const ALGOS = [['fixed', 'Fixed window'], ['log', 'Sliding log'], ['counter', 'Sliding counter'], ['token', 'Token bucket'], ['leaky', 'Leaky bucket']];
const ALGO_NAME = Object.fromEntries([['none', 'No limit'], ...ALGOS]);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const md = s => esc(s)
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, f) => a + (b - a) * f;
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOut = x => 1 - Math.pow(1 - x, 3);



/* ================= PAGE FROM SPEC ================= */
const FIGS = [];
const KINDS = {};
const kindOf = f => KINDS[f.def.kind || 'ratelimit'];
let figNo = 0;
function blockHTML(b) {
  if (b.p) return `<p>${md(b.p)}</p>`;
  if (b.h3) return `<h3>${md(b.h3)}</h3>`;
  if (b.list) return `<ul class="list">${b.list.map(x => `<li>${md(x)}</li>`).join('')}</ul>`;
  if (b.code) return `<figure><pre class="code">${esc(b.code)}</pre>${b.caption ? `<figcaption>${md(b.caption)}</figcaption>` : ''}</figure>`;
  if (b.table) return `<div class="tbl"><table><thead><tr>${b.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.table.rows.map(r => `<tr>${r.map(c => `<td>${md(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (b.figure) {
    const n = ++figNo, def = SPEC.figures[b.figure];
    FIGS.push({ id: b.figure, n, def, t: 0, playing: !REDUCED, ctrl: { ...(def.ctrl || {}), extras: [] } });
    return `<figure id="fig-${b.figure}"><div class="fig">${def.controls ? `<div class="ctls" data-ctls></div>` : ''}<canvas role="img" aria-label="${esc(b.caption)}"></canvas><div data-extra></div>
      <div class="fig-bar"><div class="stats" data-stats></div><div class="acts"><button data-play>${REDUCED ? 'Play' : 'Pause'}</button><button data-replay>Replay</button></div></div></div>
      <figcaption><b>Figure ${n}.</b> ${md(b.caption)}</figcaption></figure>`;
  }
  return '';
}
function host(u) { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } }
function buildPage() {
  document.title = SPEC.title;
  const all = COURSE.parts.flatMap(p => p.lessons.map(([slug, title]) => ({ slug, title, part: p.title })));
  const idx = all.findIndex(l => l.slug === SPEC.slug);
  $('brand').href = FLAT ? 'index.html' : '/';
  $('brand').innerHTML = `${esc(COURSE.title)}<span>${all.length} lessons</span>`;
  $('crumb').innerHTML = `${esc(SPEC.part)}<span>·</span>Lesson ${idx + 1} of ${all.length}`;
  buildSidebar(all, idx);
  const ready = new Set(COURSE.ready || []);
  const prev = all.slice(0, idx).reverse().find(l => ready.has(l.slug)), next = all.slice(idx + 1).find(l => ready.has(l.slug));
  $('pager').innerHTML = (prev ? `<a href="${lessonHref(prev.slug)}"><small>Previous</small>${esc(prev.title)}</a>` : '') + (next ? `<a class="nx" href="${lessonHref(next.slug)}"><small>Next</small>${esc(next.title)}</a>` : '');
  $('title').textContent = SPEC.title;
  $('dek').textContent = SPEC.summary;
  $('meta').textContent = `${SPEC.minutes} minute read · ${SPEC.sections.reduce((n, s) => n + s.blocks.filter(b => b.figure).length, 0)} interactive diagrams`;
  $('body').innerHTML = SPEC.sections.map(s => `<section id="${s.id}"><h2>${md(s.heading)}</h2>${s.blocks.map(b => b.figure || b.table ? blockHTML(b) : `<div class="col">${blockHTML(b)}</div>`).join('')}</section>`).join('')
    + `<section id="references"><h2>References</h2><ul class="refs col">${SPEC.references.map(r => `<li><a href="${r.url}" target="_blank" rel="noopener">${esc(r.label)}</a><span class="host">${host(r.url)}</span><span>${md(r.note)}</span></li>`).join('')}</ul></section>`;
  $('toc').innerHTML = `<p>On this page</p>` + [...SPEC.sections, { id: 'references', heading: 'References' }].map(s => `<a href="#${s.id}">${esc(s.heading.replace(/: .*$/, ''))}</a>`).join('');
  FIGS.forEach(f => {
    f.el = $('fig-' + f.id); f.cv = f.el.querySelector('canvas'); f.statsEl = f.el.querySelector('[data-stats]');
    f.el.querySelector('[data-play]').onclick = e => { f.playing = !f.playing; e.target.textContent = f.playing ? 'Pause' : 'Play'; };
    f.el.querySelector('[data-replay]').onclick = () => { f.t = 0; if (!f.playing) { f.playing = true; f.el.querySelector('[data-play]').textContent = 'Pause'; } };
    f.extraEl = f.el.querySelector('[data-extra]');
    kindOf(f).init?.(f);
    if (!f.playing) f.t = kindOf(f).period(f) * (f.def.still ?? .48);
    renderControls(f);
  });
}

/* ================= COURSE SIDEBAR ================= */
const CHEV = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.5 2l3 3-3 3"/></svg>';
function buildSidebar(all, cur) {
  let open; try { open = JSON.parse(localStorage.getItem('sdv-open') || 'null'); } catch { open = null; }
  if (!Array.isArray(open)) open = [];
  const curPart = all[cur]?.part;
  if (!open.includes(curPart)) open.push(curPart);
  let n = 0;
  $('parts').innerHTML = COURSE.parts.map(p => `<div class="part${open.includes(p.title) ? ' open' : ''}" data-part="${esc(p.title)}">
    <button aria-expanded="${open.includes(p.title)}">${CHEV}<span>${esc(p.title)}</span><span class="n">${p.lessons.length}</span></button>
    <ol>${p.lessons.map(([slug, title]) => { n++; const num = `<i>${String(n).padStart(2, '0')}</i><span>${esc(title)}</span>`;
      return `<li data-q="${esc(title.toLowerCase())}">${(COURSE.ready || []).includes(slug) ? `<a href="${lessonHref(slug)}"${slug === SPEC.slug ? ' aria-current="page"' : ''}>${num}</a>` : `<span class="soon" title="Coming soon">${num}</span>`}</li>`; }).join('')}</ol></div>`).join('') + '<p class="none" hidden>No lessons match.</p>';
  $('count').textContent = `${COURSE.parts.length} parts · ${all.length} lessons`;
  const save = () => { try { localStorage.setItem('sdv-open', JSON.stringify([...document.querySelectorAll('.part.open')].map(e => e.dataset.part))); } catch {} };
  document.querySelectorAll('.part > button').forEach(b => b.onclick = () => { const p = b.parentElement; p.classList.toggle('open'); b.setAttribute('aria-expanded', p.classList.contains('open')); save(); });
  $('find').oninput = e => {
    const q = e.target.value.trim().toLowerCase(); let any = false;
    document.querySelectorAll('.part').forEach(p => {
      let hits = 0; p.querySelectorAll('li').forEach(li => { const m = !q || li.dataset.q.includes(q) || p.dataset.part.toLowerCase().includes(q); li.hidden = !m; hits += m; });
      p.hidden = !!q && !hits; if (q && hits) p.classList.add('open'); any ||= hits > 0;
      if (!q) p.classList.toggle('open', p.dataset.part === curPart || savedOpen().includes(p.dataset.part));
    });
    document.querySelector('.side .none').hidden = any;
  };
  const savedOpen = () => { try { return JSON.parse(localStorage.getItem('sdv-open') || '[]'); } catch { return []; } };
  const setNav = on => { document.body.classList.toggle('nav-open', on); $('menu').setAttribute('aria-expanded', on); };
  $('menu').onclick = () => setNav(!document.body.classList.contains('nav-open'));
  $('scrim').onclick = () => setNav(false);
  addEventListener('keydown', e => { if (e.key === 'Escape') setNav(false); if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); setNav(true); $('find').focus(); } });
  requestAnimationFrame(() => { const a = document.querySelector('.part li a[aria-current]'), sd = $('side'); if (a) sd.scrollTop += a.getBoundingClientRect().top - sd.getBoundingClientRect().top - sd.clientHeight / 3; });
}

/* ================= CONTROLS ================= */
function renderControls(f) {
  const box = f.el.querySelector('[data-ctls]'); if (!box) return;
  box.innerHTML = f.def.controls.map(c => {
    if (c.type === 'toggle') return `<div class="ctl"><span>${c.label}</span><div class="seg">${c.options.map(([v, l]) => `<button data-k="${c.key}" data-v="${v}" aria-pressed="${String(f.ctrl[c.key]) === String(v)}">${l}</button>`).join('')}</div></div>`;
    if (c.type === 'algo') return `<div class="ctl"><div class="seg">${ALGOS.map(([v, l]) => `<button data-k="algo" data-v="${v}" aria-pressed="${f.ctrl.algo === v}">${l}</button>`).join('')}</div></div>`;
    if (c.type === 'range') return `<div class="ctl"><label for="r-${f.id}-${c.key}">${c.label}</label><input type="range" id="r-${f.id}-${c.key}" data-k="${c.key}" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${f.ctrl[c.key]}"><output>${f.ctrl[c.key]}</output></div>`;
    if (c.type === 'action') return `<div class="ctl">${c.actions.map(([a, l]) => `<button data-act="${a}">${l}</button>`).join('')}</div>`;
    if (c.type === 'burst') return `<div class="ctl"><button class="primary" data-burst>${c.label}</button><button data-clear>Clear</button></div>`;
    return '';
  }).join('');
  box.querySelectorAll('[data-k][data-v]').forEach(b => b.onclick = () => { f.ctrl[b.dataset.k] = isNaN(b.dataset.v) ? b.dataset.v : +b.dataset.v; f.t = 0; kindOf(f).change?.(f, b.dataset.k); renderControls(f); });
  box.querySelectorAll('[data-act]').forEach(b => b.onclick = () => kindOf(f).action?.(f, b.dataset.act));
  box.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { f.ctrl[r.dataset.k] = +r.value; r.nextElementSibling.textContent = r.value; });
  box.querySelectorAll('[data-burst]').forEach(b => b.onclick = () => {
    const at = Math.min(f.t + .05, f.def.scene.period - .7);
    f.ctrl.extras = [...f.ctrl.extras.filter(e => Math.abs(e.at - at) > .3), { at, count: 10, spread: .33 }].slice(-6);
  });
  box.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { f.ctrl.extras = []; });
}
function limFor(f) {
  const base = f.def.scene.limiter;
  if (f.def.playground) return paramsFor(f.ctrl.algo, f.ctrl.limit, base);
  const lim = { ...base }; if (f.ctrl.scope) lim.scope = f.ctrl.scope; return lim;
}
const simFor = f => simulate(f.def.scene, limFor(f), f.def.playground ? f.ctrl.extras : []);

/* ================= DRAWING ================= */
let COL = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement), g = k => cs.getPropertyValue(k).trim();
  COL = { bg: g('--bg'), fig: g('--fig'), node: g('--node'), ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), hair: g('--hair'), hair2: g('--hair-2'), accent: g('--accent'), red: g('--red'), amber: g('--amber'), s0: g('--s0'), s1: g('--s1'), s2: g('--s2'), s3: g('--s3'), s4: g('--s4'), s5: g('--s5') };
}
function rgba(hex, a) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
function mix(a, b, f) { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const c = k => Math.round(lerp(pa >> k & 255, pb >> k & 255, f)); return '#' + [16, 8, 0].map(k => c(k).toString(16).padStart(2, '0')).join(''); }
const SANS = '"IBM Plex Sans", -apple-system, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
function toneOf(client) { return SPEC.clients[client]?.kind === 'bot' ? COL.amber : COL.ink2; }

function fitCanvas(cv, heightFor) {
  const w = cv.parentElement.clientWidth || 600, h = heightFor(w), dpr = Math.min(2, devicePixelRatio || 1);
  if (cv._w !== w || cv._h !== h || cv._d !== dpr) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px'; cv._w = w; cv._h = h; cv._d = dpr; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function text(ctx, s, x, y, o = {}) {
  ctx.font = `${o.weight || 400} ${o.size || 12}px ${o.font || SANS}`;
  ctx.fillStyle = o.color || COL.muted; ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
  ctx.fillText(s, x, y);
}
function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function dot(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function bez(p0, p3, f, vertical) {
  const d = vertical ? (p3.y - p0.y) * .5 : (p3.x - p0.x) * .5;
  const p1 = vertical ? { x: p0.x, y: p0.y + d } : { x: p0.x + d, y: p0.y }, p2 = vertical ? { x: p3.x, y: p3.y - d } : { x: p3.x - d, y: p3.y };
  const u = 1 - f; return { x: u*u*u*p0.x + 3*u*u*f*p1.x + 3*u*f*f*p2.x + f*f*f*p3.x, y: u*u*u*p0.y + 3*u*u*f*p1.y + 3*u*f*f*p2.y + f*f*f*p3.y };
}
function strokeBez(ctx, p0, p3, vertical) { ctx.beginPath(); for (let i = 0; i <= 28; i++) { const p = bez(p0, p3, i / 28, vertical); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke(); }

function icon(ctx, kind, x, y, color) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.scale(.85, .85); ctx.beginPath();
  if (kind === 'user') { ctx.arc(0, -4, 3.6, 0, Math.PI * 2); ctx.moveTo(-6.5, 8); ctx.quadraticCurveTo(-6.5, 1.5, 0, 1.5); ctx.quadraticCurveTo(6.5, 1.5, 6.5, 8); }
  else if (kind === 'bot') { ctx.moveTo(-6, -2); ctx.lineTo(-1, 2); ctx.lineTo(-6, 6); ctx.moveTo(1, 6); ctx.lineTo(7, 6); ctx.rect(-9, -8, 18, 17); }
  else if (kind === 'app') { ctx.arc(-3, 0, 4, 0, Math.PI * 2); ctx.moveTo(1, 0); ctx.lineTo(9, 0); ctx.moveTo(6, 0); ctx.lineTo(6, 3.5); ctx.moveTo(8.5, 0); ctx.lineTo(8.5, 3); }
  else if (kind === 'server') { ctx.rect(-8, -8, 16, 7); ctx.rect(-8, 1, 16, 7); ctx.moveTo(-5, -4.5); ctx.lineTo(-3.5, -4.5); ctx.moveTo(-5, 4.5); ctx.lineTo(-3.5, 4.5); }
  else if (kind === 'balancer') { ctx.moveTo(-8, 0); ctx.lineTo(-1, 0); ctx.lineTo(7, -6); ctx.moveTo(-1, 0); ctx.lineTo(7, 0); ctx.moveTo(-1, 0); ctx.lineTo(7, 6); }
  else if (kind === 'browser') { ctx.rect(-9, -7, 18, 14); ctx.moveTo(-9, -3); ctx.lineTo(9, -3); ctx.moveTo(-6.5, -5); ctx.lineTo(-6, -5); ctx.moveTo(-4, -5); ctx.lineTo(-3.5, -5); }
  else if (kind === 'globe') { ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -8); ctx.ellipse(0, 0, 3.5, 8, 0, -Math.PI / 2, Math.PI * 1.5); }
  else if (kind === 'book') { ctx.rect(-7, -8, 14, 16); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.moveTo(-4, 4); ctx.lineTo(1, 4); }
  else if (kind === 'store') { ctx.ellipse(0, -6, 8, 2.8, 0, 0, Math.PI * 2); ctx.moveTo(-8, -6); ctx.lineTo(-8, 6); ctx.ellipse(0, 6, 8, 2.8, 0, Math.PI, 0, true); ctx.lineTo(8, -6); ctx.moveTo(-8, 0); ctx.ellipse(0, 0, 8, 2.8, 0, Math.PI, 0, true); }
  ctx.stroke(); ctx.restore();
}
function node(ctx, x, y, kind, label, sub, o = {}) {
  const w = 44, h = 40;
  rr(ctx, x - w / 2, y - h / 2, w, h, 7); ctx.fillStyle = COL.node; ctx.fill();
  ctx.strokeStyle = o.stroke || COL.hair2; ctx.lineWidth = o.stroke ? 1.4 : 1; ctx.stroke();
  icon(ctx, kind, x, y, o.tone || COL.ink2);
  if (label) text(ctx, label, x, y + h / 2 + 13, { align: 'center', size: 12, color: COL.ink2 });
  if (sub) text(ctx, sub, x, y + h / 2 + 28, { align: 'center', size: 11, font: MONO, color: o.subColor || COL.muted });
}
function tag(ctx, x, y, s, full) {
  ctx.font = `500 11px ${MONO}`; const w = ctx.measureText(s).width + 10;
  rr(ctx, x - w / 2, y - 9, w, 18, 4); ctx.fillStyle = COL.node; ctx.fill(); ctx.strokeStyle = full ? COL.red : COL.hair2; ctx.lineWidth = 1; ctx.stroke();
  text(ctx, s, x, y + .5, { align: 'center', size: 11, font: MONO, weight: 500, color: full ? COL.red : COL.ink2 });
}

function layout(w, h, sim) {
  const portrait = w < 600, nodes = sim.nodes;
  const chartH = portrait ? 76 : 84, chart = { x: 58, y: h - chartH - 26, w: w - 58 - 20, h: chartH };
  const top = 22, bottom = chart.y - 40;
  const ids = [...new Set(sim.scene.traffic.map(t => t.client))];
  const L = { portrait, chart, clients: {}, nodes: [] };
  if (!portrait) {
    const cy = (top + bottom) / 2, edge = Math.max(56, w * .08);
    ids.forEach((id, i) => { const n = ids.length; L.clients[id] = { x: edge, y: n === 1 ? cy : lerp(top + 24, bottom - 24, i / (n - 1)) }; });
    if (nodes > 1) {
      L.lb = { x: w * .28, y: cy };
      for (let i = 0; i < nodes; i++) L.nodes.push({ x: w * .52, y: lerp(top + 30, bottom - 36, i / (nodes - 1)) });
      L.store = { x: w * .72, y: bottom - 20 }; L.server = { x: w - edge, y: cy };
    } else {
      const gw = clamp(w * .36, 240, 320), gh = clamp(bottom - top - 16, 170, 216);
      L.gate = { x: w * .5, y: cy, w: gw, h: gh }; L.entry = { x: L.gate.x - gw / 2, y: cy }; L.exit = { x: L.gate.x + gw / 2, y: cy };
      L.server = { x: w - edge, y: cy };
    }
  } else {
    const cx = w / 2;
    ids.forEach((id, i) => { const n = ids.length; L.clients[id] = { x: n === 1 ? cx : lerp(48, w - 48, i / (n - 1)), y: top + 22 }; });
    if (nodes > 1) {
      L.lb = { x: cx, y: top + 112 };
      for (let i = 0; i < nodes; i++) L.nodes.push({ x: lerp(60, w - 60, i / (nodes - 1)), y: top + 208 });
      L.store = { x: cx, y: top + 300 }; L.server = { x: cx, y: bottom - 22 };
      L.store.x = w - 46; L.store.y = top + 300;
    } else {
      const gw = Math.min(w - 32, 330), gh = 176;
      L.gate = { x: cx, y: top + 96 + gh / 2, w: gw, h: gh }; L.entry = { x: cx, y: L.gate.y - gh / 2 }; L.exit = { x: cx, y: L.gate.y + gh / 2 };
      L.server = { x: cx, y: bottom - 22 };
    }
  }
  return L;
}
const heightFor = (w, n = 1) => w < 600 ? 580 : Math.max(Math.round(clamp(w * .5, 380, 440)), 64 * (n - 1) + 228);

function drawFig(f) {
  const sim = simFor(f), now = f.t, { ctx, w, h } = fitCanvas(f.cv, w => heightFor(w, new Set(f.def.scene.traffic.map(t => t.client)).size)), L = layout(w, h, sim), P = sim.P, vert = L.portrait;
  const views = viewsAt(sim, now), st = stats(sim, now);

  // links
  ctx.lineWidth = 1; ctx.strokeStyle = COL.hair2;
  const firstHop = sim.nodes > 1 ? L.lb : L.entry;
  Object.values(L.clients).forEach(c => strokeBez(ctx, c, firstHop, vert));
  if (sim.nodes > 1) L.nodes.forEach(n => { strokeBez(ctx, L.lb, n, vert); strokeBez(ctx, n, L.server, vert); });
  else { strokeBez(ctx, L.exit, L.server, vert); if (!sim.limited) line(ctx, L.entry, L.exit); }
  if (sim.nodes > 1 && !sim.perNode) { ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = COL.accent; L.nodes.forEach(n => line(ctx, n, L.store)); ctx.restore(); }

  if (sim.nodes === 1 && sim.limited) drawGate(ctx, L.gate, views[0], sim, now, vert);
  for (const off of [0, P]) for (const q of sim.reqs) drawReq(ctx, q, now + off, sim, L, vert);
  if (sim.overload && sim.reqs.some(q => q.timedOut && now >= q.failAt && now < q.failAt + .7)) text(ctx, 'timed out', L.server.x - 44, L.server.y + 34, { align: 'right', size: 10.5, font: MONO, weight: 500, color: COL.red });
  for (const [id, c] of Object.entries(L.clients)) { const cl = SPEC.clients[id]; node(ctx, c.x, c.y, cl.kind, cl.label, null, { tone: toneOf(id) }); }

  if (sim.nodes > 1) {
    node(ctx, L.lb.x, L.lb.y, 'balancer', 'Load balancer');
    L.nodes.forEach((n, i) => {
      const hit = sim.reqs.some(q => q.node === i && !q.ok && now >= q.t && now < q.t + .15);
      node(ctx, n.x, n.y, 'server', `API ${i + 1}`, null, { stroke: hit ? COL.red : null });
      if (sim.perNode) { const v = views[i]; tag(ctx, n.x + (vert ? 0 : 46), n.y - (vert ? 34 : 0), `${v.est}/${v.limit}`, v.est >= v.limit); }
    });
    if (!sim.perNode) { const v = views[0]; node(ctx, L.store.x, L.store.y, 'store', 'Shared counter', null, { tone: COL.accent, stroke: COL.accent }); tag(ctx, L.store.x + 46, L.store.y, `${v.est}/${v.limit}`, v.est >= v.limit); }
    else { ctx.globalAlpha = .35; node(ctx, L.store.x, L.store.y, 'store', 'Shared counter', 'not used'); ctx.globalAlpha = 1; }
  } else if (!sim.limited) { const m = { x: L.gate.x, y: L.gate.y }; text(ctx, 'No rate limiter', m.x, vert ? m.y : m.y - 14, { align: 'center', size: 12, color: COL.muted, base: vert ? 'middle' : 'bottom' }); }

  const hot = sim.overload && st.wait > .6;
  node(ctx, L.server.x, L.server.y, 'server', sim.nodes > 1 ? 'Database' : 'API server', sim.overload ? (hot ? `wait ${fmt(st.wait, 1)} s` : `${sim.scene.server.capacity} req/s max`) : null, { stroke: hot ? COL.red : null, subColor: hot ? COL.red : null });

  drawChart(ctx, L.chart, sim, now);
  return { sim, st };
}

function drawGate(ctx, g, v, sim, now, vert) {
  const x0 = g.x - g.w / 2, y0 = g.y - g.h / 2;
  rr(ctx, x0, y0, g.w, g.h, 8); ctx.fillStyle = COL.node; ctx.fill();
  const rej = sim.reqs.some(q => !q.ok && now >= q.t && now < q.t + .16);
  ctx.strokeStyle = rej ? COL.red : COL.hair2; ctx.lineWidth = rej ? 1.4 : 1; ctx.stroke();
  text(ctx, 'Rate limiter', x0 + 14, y0 + 18, { size: 12, weight: 600, color: COL.ink });
  text(ctx, ALGO_NAME[v.type] || '', x0 + g.w - 14, y0 + 18, { size: 12, align: 'right', color: COL.muted });
  ctx.strokeStyle = COL.hair; ctx.lineWidth = 1; line(ctx, { x: x0, y: y0 + 34 }, { x: x0 + g.w, y: y0 + 34 });
  const ix = x0 + 16, iw = g.w - 32, iy = y0 + 46, ih = g.h - 58, cx = g.x;

  if (v.type === 'fixed') {
    const n = v.limit, gap = 6, cw = Math.min(26, (iw - (n - 1) * gap) / n), tot = n * cw + (n - 1) * gap, sx = cx - tot / 2, cy = iy + 30, full = v.count >= n;
    for (let i = 0; i < n; i++) { rr(ctx, sx + i * (cw + gap), cy - cw / 2, cw, cw, 4); if (i < v.count) { ctx.fillStyle = full ? COL.red : COL.accent; ctx.fill(); } else { ctx.strokeStyle = COL.hair2; ctx.stroke(); } }
    text(ctx, `${v.count} of ${n} used this second`, cx, cy + cw / 2 + 16, { align: 'center', size: 12, color: full ? COL.red : COL.ink2 });
    const by = iy + ih - 12; ctx.fillStyle = COL.hair; ctx.fillRect(ix, by, iw, 2); ctx.fillStyle = COL.ink2; ctx.fillRect(ix, by, iw * v.frac, 2);
    text(ctx, 'window', ix, by - 10, { size: 11, font: MONO });
    text(ctx, v.frac < .08 ? 'reset' : `resets in ${fmt((1 - v.frac) * v.window, 1)} s`, ix + iw, by - 10, { align: 'right', size: 11, font: MONO, color: v.frac < .08 ? COL.accent : COL.muted });
  }
  if (v.type === 'log' || v.type === 'counter') {
    const ty = iy + 22, span = 2, X = t => ix + iw - (now - t) / span * iw;
    ctx.strokeStyle = COL.hair2; line(ctx, { x: ix, y: ty }, { x: ix + iw, y: ty });
    ctx.fillStyle = rgba(COL.accent, .08); ctx.fillRect(X(now - 1), ty - 14, iw / 2, 28);
    ctx.strokeStyle = rgba(COL.accent, .6); ctx.strokeRect(X(now - 1) + .5, ty - 14 + .5, iw / 2 - 1, 27);
    sim.okTimes.filter(t => t <= now && t > now - span).forEach(t => dot(ctx, X(t), ty, 3, t > now - 1 ? COL.accent : COL.hair2));
    sim.reqs.filter(q => !q.ok && q.t <= now && q.t > now - span).forEach(q => { const x = X(q.t); ctx.strokeStyle = COL.red; ctx.lineWidth = 1.3; line(ctx, { x: x - 3, y: ty - 3 }, { x: x + 3, y: ty + 3 }); line(ctx, { x: x + 3, y: ty - 3 }, { x: x - 3, y: ty + 3 }); ctx.lineWidth = 1; });
    text(ctx, '2 s ago', ix, ty + 25, { size: 10.5, font: MONO });
    text(ctx, 'last 1 s', X(now - .5), ty + 25, { size: 10.5, font: MONO, align: 'center', color: COL.accent });
    text(ctx, 'now', ix + iw, ty + 25, { size: 10.5, font: MONO, align: 'right' });
    if (v.type === 'log') {
      const full = v.times.length >= v.limit;
      text(ctx, `${v.times.length} of ${v.limit} in the last second`, cx, iy + ih - 32, { align: 'center', size: 12, color: full ? COL.red : COL.ink2 });
      text(ctx, `stored: ${v.times.length} timestamps`, cx, iy + ih - 12, { align: 'center', size: 11, font: MONO });
    } else {
      const bx = ix + 52, bw = iw - 52, unit = bw / (v.limit * 1.6), y1 = iy + ih - 50, y2 = y1 + 16;
      text(ctx, 'last s', ix, y1, { size: 10.5, font: MONO });
      ctx.fillStyle = COL.hair; ctx.fillRect(bx, y1 - 4, v.prev * unit, 8);
      ctx.fillStyle = rgba(COL.accent, .5); ctx.fillRect(bx, y1 - 4, v.prev * (1 - v.f) * unit, 8);
      text(ctx, 'this s', ix, y2, { size: 10.5, font: MONO });
      ctx.fillStyle = COL.accent; ctx.fillRect(bx, y2 - 4, v.cur * unit, 8);
      const lx = bx + v.limit * unit; ctx.save(); ctx.strokeStyle = COL.ink2; ctx.setLineDash([2, 3]); line(ctx, { x: lx, y: y1 - 9 }, { x: lx, y: y2 + 9 }); ctx.restore();
      text(ctx, `${fmt(v.prev)} × ${fmt(1 - v.f, 2)} + ${v.cur} = ${fmt(v.est, 1)} of ${v.limit}`, cx, iy + ih - 10, { align: 'center', size: 11.5, font: MONO, color: v.est >= v.limit ? COL.red : COL.ink2 });
    }
  }
  if (v.type === 'token') {
    const C = v.capacity, cols = Math.ceil(C / 2), rows = C > cols ? 2 : 1, r = Math.min(9, (iw - 40) / cols / 2.7), pitch = r * 2.7;
    const bw = cols * pitch + 14, bh = rows * pitch + 12, bx = cx - bw / 2, by = iy + ih - bh - 22;
    ctx.strokeStyle = COL.ink2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by - 4); ctx.stroke(); ctx.lineWidth = 1;
    for (let i = 0; i < C; i++) {
      const row = rows === 2 ? (i < cols ? 1 : 0) : 0, col = i % cols, x = bx + 7 + pitch / 2 + col * pitch, y = by + 6 + pitch / 2 + row * pitch;
      const fill = clamp(v.tokens - i);
      if (fill >= 1) dot(ctx, x, y, r, COL.accent);
      else { ctx.strokeStyle = COL.hair2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); if (fill > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x - r, y + r - 2 * r * fill, 2 * r, 2 * r * fill); ctx.clip(); dot(ctx, x, y, r, rgba(COL.accent, .45)); ctx.restore(); } }
    }
    if (v.tokens < C - 1e-6) { const fy = lerp(iy, by + 2, easeOut(v.tokens % 1)); dot(ctx, cx, fy, 3, rgba(COL.accent, .3 + .7 * (v.tokens % 1))); }
    text(ctx, `+${v.rate} tokens/s`, cx + 10, iy + 2, { size: 11, font: MONO, color: COL.accent });
    text(ctx, `${fmt(Math.floor(v.tokens + 1e-6))} of ${C} tokens`, cx, by + bh + 14, { align: 'center', size: 12, color: v.tokens < 1 ? COL.red : COL.ink2 });
  }
  if (v.type === 'leaky') {
    const Q = v.size, ty = iy + ih / 2 - 6, th = 26, sw = iw / Q;
    rr(ctx, ix, ty - th / 2, iw, th, 4); ctx.strokeStyle = COL.ink2; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = COL.hair; for (let i = 1; i < Q; i++) line(ctx, { x: ix + i * sw, y: ty - th / 2 + 5 }, { x: ix + i * sw, y: ty + th / 2 - 5 });
    const full = v.queue.length >= Q;
    text(ctx, `queue ${v.queue.length} of ${Q}`, ix, ty - th / 2 - 11, { size: 12, color: full ? COL.red : COL.ink2 });
    text(ctx, `out ${v.rate}/s`, ix + iw, ty - th / 2 - 11, { size: 11, font: MONO, align: 'right', color: COL.accent });
    text(ctx, 'requests wait here instead of failing', cx, ty + th / 2 + 18, { align: 'center', size: 11.5 });
    g.tube = { x: ix, y: ty, w: iw, sw };
  }
}

function drawReq(ctx, q, lt, sim, L, vert) {
  const t0 = q.t - TIN; if (lt < t0) return;
  const multi = sim.nodes > 1, D = multi ? L.nodes[q.node] : L.entry, C = L.clients[q.client];
  let p, color = toneOf(q.client), alpha = 1, label = null, ring = false;
  const inPath = f => multi ? (f < .55 ? bez(C, L.lb, f / .55, vert) : bez(L.lb, D, (f - .55) / .45, vert)) : bez(C, D, f, vert);
  if (lt < q.t) p = inPath(ease((lt - t0) / TIN));
  else if (!q.ok) {
    const dt = lt - q.t; if (dt > .8) return;
    const dir = vert ? { x: (q.id % 2 ? 1 : -1) * 1.1, y: .15 } : { x: -.7, y: (q.id % 2 ? 1 : -1) * .45 };
    const D0 = multi ? { x: D.x - (vert ? 0 : 22), y: D.y - (vert ? 20 : 0) } : D;
    p = { x: D0.x + dir.x * 56 * easeOut(dt / .8), y: D0.y + dir.y * 56 * easeOut(dt / .8) + 80 * dt * dt };
    color = COL.red; alpha = 1 - dt / .8; if (dt < .5 && q.id % 3 === 0) label = '429';
  } else {
    const rel = q.t + q.delay;
    if (lt < rel) {
      const tube = L.gate?.tube; if (!tube) return;
      const idx = (rel - lt) * sim.lim.rate, settle = clamp((lt - q.t) / .18);
      p = { x: lerp(D.x, tube.x + tube.w - tube.sw * (idx + .5), ease(settle)), y: lerp(D.y, tube.y, ease(settle)) };
      color = COL.ink2; ring = true;
    } else if (lt < q.ready) {
      const f = (lt - rel) / TOUT;
      if (multi) p = bez(D, L.server, ease(f), vert);
      else { const g = L.gate, from = q.delay > 0 && g.tube ? { x: g.tube.x + g.tube.w, y: g.tube.y } : D;
        p = f < .35 ? { x: lerp(from.x, L.exit.x, f / .35), y: lerp(from.y, L.exit.y, f / .35) } : bez(L.exit, L.server, ease((f - .35) / .65), vert); }
      color = sim.limited ? COL.accent : color;
    } else {
      const S = L.server;
      if (sim.overload) {
        const endWait = q.start ?? q.failAt;
        if (lt < endWait) {
          const idx = (endWait - lt) * sim.scene.server.capacity, row = Math.floor(idx / 12), col = idx % 12;
          p = vert ? { x: S.x - 44 + col * 8, y: S.y - 40 - row * 8 } : { x: S.x - 34 - col * 8, y: S.y - 10 - row * 8 };
          color = q.timedOut ? mix(toneOf(q.client), COL.red, clamp((lt - q.ready) / sim.scene.server.timeout)) : toneOf(q.client);
        } else if (q.timedOut) { const dt = lt - q.failAt; if (dt > .7) return; p = { x: S.x - 34, y: S.y + 24 * dt + 120 * dt * dt }; color = COL.red; alpha = 1 - dt / .7;  }
        else { const dt = lt - q.start; if (dt > .18) return; p = { x: lerp(S.x - 30, S.x - 22, dt / .18), y: S.y }; alpha = 1 - dt / .18; }
      } else { const dt = lt - q.ready; if (dt > .15) return; p = { x: lerp(S.x - 30, S.x - 22, dt / .15), y: S.y }; alpha = 1 - dt / .15; color = sim.limited ? COL.accent : color; }
    }
  }
  if (!p) return;
  ctx.globalAlpha = alpha;
  if (ring) { ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
  else dot(ctx, p.x, p.y, 3, color);
  if (label && vert) text(ctx, label, p.x + (q.id % 2 ? 6 : -6), p.y - 8, { align: q.id % 2 ? 'left' : 'right', size: 10.5, font: MONO, weight: 500, color: COL.red });
  else if (label) text(ctx, label, p.x - 6, p.y - 8, { align: 'right', size: 10.5, font: MONO, weight: 500, color: COL.red });
  ctx.globalAlpha = 1;
}

function drawChart(ctx, c, sim, now) {
  const bin = .25, n = Math.ceil(sim.P / bin), up = new Array(n).fill(0), dn = new Array(n).fill(0);
  sim.reqs.forEach(q => {
    if (sim.overload) { if (q.start != null && q.start <= now) up[Math.floor(q.start / bin)]++; if (q.timedOut && q.failAt <= now) dn[Math.floor(q.failAt / bin)]++; }
    else { const tt = q.t + q.delay; if (q.ok && tt <= now) up[Math.floor(tt / bin)]++; if (!q.ok && q.t <= now) dn[Math.floor(q.t / bin)]++; }
  });
  const mid = c.y + c.h * .6, sc = Math.min((c.h * .6 - 4) / Math.max(4, ...up), (c.h * .4 - 2) / Math.max(4, ...dn)), bw = c.w / n;
  ctx.strokeStyle = COL.hair2; line(ctx, { x: c.x, y: mid + .5 }, { x: c.x + c.w, y: mid + .5 });
  const upCol = sim.limited ? COL.accent : COL.ink2;
  for (let i = 0; i < n; i++) {
    const bx = c.x + i * bw + bw * .22, ww = Math.max(1, bw * .56);
    if (up[i]) { ctx.fillStyle = upCol; ctx.fillRect(bx, mid - up[i] * sc, ww, up[i] * sc); }
    if (dn[i]) { ctx.fillStyle = COL.red; ctx.fillRect(bx, mid + 1, ww, dn[i] * sc); }
  }
  if (sim.limited) { const y = Math.round(mid - limitOf(sim.lim) * bin * sc) + .5; ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = COL.ink2; line(ctx, { x: c.x, y }, { x: c.x + c.w, y }); ctx.restore(); text(ctx, `limit`, c.x + c.w, y - 8, { align: 'right', size: 10.5, font: MONO }); }
  const px = c.x + now / sim.P * c.w; ctx.strokeStyle = rgba(COL.ink, .35); line(ctx, { x: px, y: c.y - 2 }, { x: px, y: c.y + c.h + 2 });
  text(ctx, sim.overload ? 'served' : 'passed', c.x - 8, mid - 10, { align: 'right', size: 10.5, font: MONO, color: upCol });
  text(ctx, sim.overload ? 'timeout' : '429', c.x - 8, mid + 10, { align: 'right', size: 10.5, font: MONO, color: COL.red });
  for (let s = 0; s <= sim.P; s += sim.P > 8 ? 2 : 1) text(ctx, s + 's', c.x + s / sim.P * c.w, c.y + c.h + 12, { align: 'center', size: 10.5, font: MONO });
}

function statsHTML(sim, st) {
  const pc = peakCap(sim.lim);
  const it = (k, v, cls = '') => `<span class="${cls}">${k} ${v}</span>`;
  if (sim.overload) return it('sent', `${st.sent}/s`) + it('served', `${st.served}/s`) + it('timed out', st.timedOutTotal, st.timedOutTotal ? 'bad' : '') + it('oldest wait', `${fmt(st.wait, 1)} s`, st.wait > 1 ? 'bad' : '');
  return it('sent', `${st.sent}/s`) + it('passed', `${st.passed}/s`, 'pass') + it('rejected', `${st.rejected}/s`, st.rejected ? 'bad' : '') + it('peak in any 1 s', `${st.peak} (${pc.label})`, st.peak > pc.cap ? 'bad' : '');
}

KINDS.ratelimit = {
  period: f => f.def.scene.period,
  draw: (f, wantStats) => { const { sim, st } = drawFig(f); return wantStats ? statsHTML(sim, st) : null; }
};

/* ================= LOOP ================= */
function visible(el) { const r = el.getBoundingClientRect(); return r.bottom > -40 && r.top < innerHeight + 40; }
let last = performance.now(), lastStats = 0;
function frame(ms) {
  const dt = Math.min(.05, (ms - last) / 1000); last = ms;
  const doStats = ms - lastStats > 160; if (doStats) lastStats = ms;
  for (const f of FIGS) {
    if (!f.drawn || visible(f.el)) {
      const K = kindOf(f), P = K.period(f);
      if (f.playing && f.drawn) f.t = (f.t + dt * SPEED * (f.def.speed ?? 1)) % P;
      const h = K.draw(f, doStats || !f.statsHTML); f.drawn = true;
      if (h != null && h !== f.statsHTML) { f.statsEl.innerHTML = h; f.statsHTML = h; }
    }
  }
  requestAnimationFrame(frame);
}
function tocSpy() {
  const links = [...document.querySelectorAll('.toc a')]; let cur = links[0];
  for (const a of links) { const s = document.querySelector(a.getAttribute('href')); if (s && s.getBoundingClientRect().top < innerHeight * .3) cur = a; }
  links.forEach(a => a.classList.toggle('on', a === cur));
}

function boot() {
buildPage(); readColors();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { readColors(); FIGS.forEach(f => f.cv._w = 0); });
addEventListener('scroll', tocSpy, { passive: true }); tocSpy();
document.fonts?.ready.then(() => FIGS.forEach(f => f.cv._w = 0));
requestAnimationFrame(frame);
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot); else setTimeout(boot);
