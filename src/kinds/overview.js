/* Overview: a gentle, beginner-friendly visual tour of how a web app grows
   from one server to a cache and multiple servers behind a load balancer.
   Pure function of f.t so it works with pause, replay, speed, and scrubbing. */
const OV_PERIOD = 8;

const OV_STAGES = {
  basic: {
    label: '1. Basic app',
    note: 'one server and one database handle every request',
    slug: 'how-a-request-travels',
    caption: 'Start simple: a browser sends a request to one web server, which asks the database and replies.'
  },
  cache: {
    label: '2. Add a cache',
    note: 'most reads bounce back fast from memory',
    slug: 'caching',
    caption: 'A cache keeps popular answers in fast memory so most requests never wait on the database.'
  },
  scale: {
    label: '3. Scale out',
    note: 'a load balancer shares traffic across three servers',
    slug: 'load-balancing',
    caption: 'As traffic grows, a load balancer spreads requests across several servers sharing a cache and database.'
  }
};

function ovStage(f) { return f.ctrl.stage || 'basic'; }

// Deterministic packet schedule for each stage so visuals repeat seamlessly.
function ovPackets(stage) {
  const out = [];
  if (stage === 'basic') {
    for (let i = 0; i < 5; i++) out.push({ id: i, t0: i * (OV_PERIOD / 5), dur: 3.2, hit: false, srv: 0 });
  } else if (stage === 'cache') {
    const pattern = [true, true, false, true, true, true, false, true];
    for (let i = 0; i < pattern.length; i++) out.push({ id: i, t0: i * (OV_PERIOD / pattern.length), dur: pattern[i] ? 2.1 : 3.3, hit: pattern[i], srv: 0 });
  } else {
    const hits = [true, false, true, true, true, false, true, true, true, true, false, true];
    for (let i = 0; i < hits.length; i++) out.push({ id: i, t0: i * (OV_PERIOD / hits.length), dur: hits[i] ? 2.5 : 3.4, hit: hits[i], srv: i % 3 });
  }
  return out;
}

function ovDrawTrail(ctx, ptAt, prog, color) {
  for (let k = 3; k >= 1; k--) {
    const p = ptAt(prog - k * 0.022);
    if (!p) continue;
    dot(ctx, p.x, p.y, 2.8 - k * 0.45, rgba(color, 0.24 - k * 0.055));
  }
  const head = ptAt(prog);
  if (head) packet(ctx, head.x, head.y, 3.6, color);
}

function ovRipple(ctx, pt, age, color) {
  if (age < 0 || age > 0.55) return;
  const f = easeOut(age / 0.55);
  ctx.save();
  ctx.strokeStyle = rgba(color, (1 - f) * 0.5);
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(pt.x, pt.y, 22 + f * 18, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function ovLegend(ctx, items, rightX, y) {
  ctx.font = `500 11px ${SANS}`;
  let x = rightX;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const tw = ctx.measureText(it.label).width;
    text(ctx, it.label, x, y, { align: 'right', size: 11, weight: 500, color: it.textColor || COL.muted });
    dot(ctx, x - tw - 8, y, 3.5, it.dotColor);
    x -= tw + 26;
  }
}

KINDS.overview = {
  period: () => OV_PERIOD,
  init(f) {
    f.ctrl.stage ??= 'basic';
    if (!f.def.controls) {
      f.def.controls = [{ type: 'toggle', key: 'stage', label: '', options: Object.entries(OV_STAGES).map(([k, v]) => [k, v.label]) }];
      f.el.querySelector('.fig').insertAdjacentHTML('afterbegin', '<div class="ctls" data-ctls></div>');
    }
  },
  change(f) {
    const st = OV_STAGES[ovStage(f)];
    const cap = f.el.querySelector('figcaption span');
    const link = f.el.querySelector('figcaption a');
    if (cap && st) cap.textContent = st.caption;
    if (link && st) { link.href = lessonHref(st.slug); link.textContent = 'Read lesson →'; }
  },
  draw(f, wantStats) {
    const stage = ovStage(f), now = f.t;
    const { ctx, w, h } = fitCanvas(f.cv, ww => ww < 440 ? 416 : 356);
    const vert = w < 440;
    const cy = h * 0.49;

    // Build clean, spacious node coordinates per stage
    let U, LB, S = [], CA, DB;
    if (!vert) {
      const m = Math.max(58, w * 0.11);
      if (stage === 'basic') {
        U = { x: m + 12, y: cy };
        S = [{ x: w * 0.5, y: cy }];
        DB = { x: w - m - 12, y: cy };
      } else if (stage === 'cache') {
        U = { x: m, y: cy };
        S = [{ x: w * 0.44, y: cy }];
        CA = { x: w - m - 4, y: h * 0.28 };
        DB = { x: w - m - 4, y: h * 0.72 };
      } else {
        U = { x: Math.max(46, w * 0.085), y: cy };
        LB = { x: w * 0.31, y: cy };
        S = [0, 1, 2].map(i => ({ x: w * 0.58, y: lerp(h * 0.21, h * 0.77, i / 2) }));
        CA = { x: w - m, y: h * 0.28 };
        DB = { x: w - m, y: h * 0.72 };
      }
    } else {
      const cx = w / 2;
      if (stage === 'basic') {
        U = { x: cx, y: 54 };
        S = [{ x: cx, y: h * 0.48 }];
        DB = { x: cx, y: h - 76 };
      } else if (stage === 'cache') {
        U = { x: cx, y: 50 };
        S = [{ x: cx, y: h * 0.44 }];
        CA = { x: w * 0.28, y: h - 76 };
        DB = { x: w * 0.72, y: h - 76 };
      } else {
        U = { x: cx, y: 42 };
        LB = { x: cx, y: 126 };
        S = [0, 1, 2].map(i => ({ x: lerp(62, w - 62, i / 2), y: 222 }));
        CA = { x: w * 0.29, y: h - 68 };
        DB = { x: w * 0.71, y: h - 68 };
      }
    }

    // Soft curved pipes
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COL.hair2;
    if (stage === 'basic') {
      strokeBez(ctx, U, S[0], vert);
      strokeBez(ctx, S[0], DB, vert);
    } else if (stage === 'cache') {
      strokeBez(ctx, U, S[0], vert);
      ctx.strokeStyle = rgba(COL.accent, 0.45);
      strokeBez(ctx, S[0], CA, vert);
      ctx.strokeStyle = COL.hair2;
      strokeBez(ctx, S[0], DB, vert);
    } else {
      strokeBez(ctx, U, LB, vert);
      S.forEach(s => {
        ctx.strokeStyle = COL.hair2;
        strokeBez(ctx, LB, s, vert);
        ctx.strokeStyle = rgba(COL.accent, 0.36);
        strokeBez(ctx, s, CA, vert);
        ctx.strokeStyle = rgba(COL.hair2, 0.78);
        strokeBez(ctx, s, DB, vert);
      });
    }
    ctx.lineWidth = 1;

    // Gentle animated requests & responses (wrapping seamlessly around OV_PERIOD)
    const pkts = ovPackets(stage);
    const ripples = [];

    for (const q of pkts) {
      let age = (now - q.t0) % OV_PERIOD;
      if (age < 0) age += OV_PERIOD;
      if (age > q.dur) continue;
      const p = age / q.dur;
      const srv = S[q.srv];
      const target = q.hit && CA ? CA : DB;
      const colOut = stage === 'basic' || q.hit ? COL.accent : COL.s2;
      const colBack = q.hit ? COL.accent : COL.s2;

      const legs = LB
        ? [[U, LB], [LB, srv], [srv, target], [target, srv], [srv, LB], [LB, U]]
        : [[U, srv], [srv, target], [target, srv], [srv, U]];
      const ptAt = u => {
        if (u < 0 || u > 1) return null;
        const scaled = u * legs.length;
        const idx = Math.min(legs.length - 1, Math.floor(scaled));
        const local = ease(clamp(scaled - idx));
        return bez(legs[idx][0], legs[idx][1], local, vert);
      };

      const returning = p >= 0.5;
      const hitAge = age - q.dur * 0.5;
      if (hitAge >= 0 && hitAge < 0.55) {
        ripples.push({ pt: target, age: hitAge, color: stage === 'basic' || q.hit ? COL.accent : COL.s2 });
      }
      ovDrawTrail(ctx, ptAt, p, returning ? colBack : colOut);
    }

    // Draw arrival ripples behind nodes
    ripples.forEach(rp => ovRipple(ctx, rp.pt, rp.age, rp.color));

    // Clean legend at top-right on desktop
    if (!vert) {
      const ly = 20;
      if (stage === 'basic') {
        ovLegend(ctx, [
          { label: 'request', dotColor: COL.accent, textColor: COL.accent },
          { label: 'response', dotColor: COL.s2, textColor: COL.muted }
        ], w - 16, ly);
      } else {
        ovLegend(ctx, [
          { label: 'fast cache hit', dotColor: COL.accent, textColor: COL.accent },
          { label: 'database read', dotColor: COL.s2, textColor: COL.muted }
        ], w - 16, ly);
      }
    }

    // Draw nodes cleanly on top
    node(ctx, U.x, U.y, 'browser', stage === 'scale' ? 'Users' : 'Browser');
    if (LB) node(ctx, LB.x, LB.y, 'balancer', 'Load balancer', null, { tone: COL.accent, stroke: COL.accent });
    S.forEach((s, i) => node(ctx, s.x, s.y, 'server', S.length > 1 ? `Server ${i + 1}` : 'Web server'));
    if (CA) node(ctx, CA.x, CA.y, 'store', 'Cache', 'fast memory', { tone: COL.accent, stroke: COL.accent, subColor: COL.accent });
    node(ctx, DB.x, DB.y, 'store', 'Database', 'disk storage');

    if (!wantStats) return null;
    const st = OV_STAGES[stage];
    if (stage === 'basic') return `<span class="pass">1 server</span><span>${st.note}</span>`;
    if (stage === 'cache') return `<span class="pass">~75% cache hits</span><span>${st.note}</span>`;
    return `<span class="pass">3 servers + cache</span><span>${st.note}</span>`;
  }
};
