// Checks every figure in every lesson is well formed for its kind, and asserts the numbers the text relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { checkLesson } from '../scripts/check.mjs';

const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(root + p, 'utf8');
const ctx = vm.createContext({});
const kinds = readdirSync(root + 'src/kinds').filter(f => f.endsWith('.js')).sort();
vm.runInContext(`const KINDS = {}; const TIN = 0.55, TOUT = 0.5;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)); const lerp = (a, b, f) => a + (b - a) * f;
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
${read('src/sim.js')}
${kinds.map(k => read('src/kinds/' + k)).join('\n')}
globalThis.api = { KINDS, calcRun, tlEnd, tlSpans, caSimulate, shSimulate, qSimulate, tpSimulate };
globalThis.lookup = name => eval(name);`, ctx);
export const api = ctx.api, lookup = ctx.lookup;
const course = JSON.parse(read('course.json'));
const slugs = readdirSync(root + 'lessons').filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
export const lesson = s => JSON.parse(read(`lessons/${s}.json`));

const validators = {
  flow(fig) {
    const ids = new Set(fig.actors.map(a => a.id));
    assert.equal(ids.size, fig.actors.length, 'actor ids are unique');
    const scenarios = fig.scenarios ? Object.values(fig.scenarios) : [{ steps: fig.steps, state: fig.state }];
    for (const sc of scenarios) {
      assert.ok(sc.steps.length > 0, 'has steps');
      for (const s of sc.steps) {
        assert.ok(ids.has(s.from) && ids.has(s.to), `step "${s.label}" uses known actors`);
        for (const k of Object.keys(s.set || {})) assert.ok(ids.has(k), `step "${s.label}" sets a known actor`);
      }
      for (const k of Object.keys(sc.state || {})) assert.ok(ids.has(k), 'state is on a known actor');
    }
  },
  timeline(fig) {
    const scenarios = fig.scenarios ? Object.values(fig.scenarios) : [{ rows: fig.rows }];
    for (const sc of scenarios) for (const r of sc.rows) for (const s of api.tlSpans(r)) assert.ok(s.d > 0 && s.s >= 0, `span in "${r.label}" has a start and a length`);
  },
  bars(fig) {
    const sets = fig.sets ? Object.values(fig.sets).map(s => s.items) : [fig.items];
    for (const items of sets) for (const it of items) assert.ok(it.value > 0, `${it.label} has a positive value`);
  },
  queue(fig) {
    const scenes = fig.scenarios ? Object.values(fig.scenarios).map(s => s.scene) : [fig.scene];
    for (const sc of scenes) { assert.ok(sc.consumers >= 1 && sc.work > 0, 'has consumers and work'); for (const g of sc.schedule) assert.ok(g.to > g.from && g.rate > 0, 'schedule segment is valid'); }
  },
  topic(fig) {
    const scenes = fig.scenarios ? Object.values(fig.scenarios).map(s => s.scene) : [fig.scene];
    for (const sc of scenes) {
      assert.ok(['queue', 'pubsub', 'log'].includes(sc.mode), `mode ${sc.mode} is known`);
      if (sc.mode === 'log') { const m = api.tpSimulate(sc); assert.ok(m.parts.filter(p => p.length).length >= 2, 'keys spread over at least two partitions'); }
      else assert.ok(sc.targets.length >= 2, 'has targets');
    }
  },
  calc(fig) {
    for (const c of fig.controls || []) if (c.type === 'range') assert.ok(fig.ctrl[c.key] >= c.min && fig.ctrl[c.key] <= c.max, `${c.key} starts inside its range`);
    // Every combination of slider ends must still give finite numbers.
    const ranges = (fig.controls || []).filter(c => c.type === 'range');
    for (const end of ['min', 'max']) {
      const ctrl = { ...fig.ctrl }; ranges.forEach(c => ctrl[c.key] = c[end]);
      for (const r of api.calcRun(fig, ctrl).out) assert.ok(Number.isFinite(r.v), `${r.label} is finite at ${end}`);
    }
  }
};

for (const slug of slugs) {
  test(`${slug}: every figure is well formed`, () => {
    const l = lesson(slug);
    assert.deepEqual(checkLesson(l), [], 'passes the writing rules');
    assert.ok(course.parts.some(p => p.lessons.some(([s]) => s === slug)), 'listed in course.json');
    for (const [id, fig] of Object.entries(l.figures)) {
      assert.ok(api.KINDS[fig.kind || 'ratelimit'] || !fig.kind, `${id}: kind "${fig.kind}" exists`);
      validators[fig.kind]?.(fig);
    }
    const used = l.sections.flatMap(s => s.blocks.filter(b => b.figure).map(b => b.figure));
    for (const id of Object.keys(l.figures)) assert.ok(used.includes(id), `${id} is used in the text`);
  });
}

/* ---------- numbers the text states ---------- */
const end = rows => api.tlEnd(rows);
test('request path: first visit 160 ms, repeat visit 70 ms', () => {
  const f = lesson('how-a-request-travels').figures.waterfall.scenarios;
  assert.equal(end(f.first.rows), 160); assert.equal(end(f.repeat.rows), 70);
  const c = lesson('how-a-request-travels').figures.playground, out = api.calcRun(c, c.ctrl).env;
  assert.equal(out.first, 160); assert.equal(out.repeat, 70);
});
test('latency numbers: 100 ns memory vs 500,000 ns datacenter round trip is 5,000 times', () => {
  const items = lesson('latency-numbers').figures.numbers.items, v = l => items.find(i => i.label === l).value;
  assert.equal(v('Round trip in one datacenter') / v('Main memory reference'), 5000);
  assert.equal(v('California to Netherlands and back') / v('L1 cache reference'), 3e8);
});
test('TCP and TLS: round trips before the request match the notes', () => {
  const sc = lesson('tcp-and-tls').figures.handshakes.scenarios;
  const before = s => s.steps.slice(0, s.steps.findIndex(x => x.label.includes('GET /'))).filter(x => x.from === 'client').length;
  assert.equal(before(sc.tls12), 3); assert.equal(before(sc.tls13), 2); assert.equal(before(sc.zero), 1);
});
test('HTTP: HTTP/2 beats one HTTP/1.1 connection; on loss HTTP/3 delays only the lost stream', () => {
  const v = lesson('http').figures.versions.scenarios, l = lesson('http').figures.loss.scenarios;
  assert.ok(end(v.h2.rows) < end(v.h1x3.rows) && end(v.h1x3.rows) < end(v.h1.rows));
  const fin = (rows, name) => end([rows.find(r => r.label === name)]);
  assert.ok(fin(l.h3.rows, 'style.css') < fin(l.h3.rows, 'photo-1.jpg'));
  assert.equal(fin(l.h2.rows, 'style.css'), fin(l.h2.rows, 'photo-1.jpg'));
});
test("estimates: Little's law example gives 400 requests in progress", () => assert.equal(2000 * 0.2, 400));

/* ---------- caching ---------- */
const ca = scene => { const m = api.caSimulate(scene); return { hit: m.reqs.filter(q => q.hit).length / m.reqs.length, db: m.dbQueries, stale: m.reqs.filter(q => q.stale).length }; };
test('caching: popular keys give a much higher hit ratio than even reads with the same cache', () => {
  const sc = lesson('caching').figures.playground.scene;
  const skewed = ca(sc), even = ca({ ...sc, skew: 0 }), none = ca({ ...sc, capacity: 0 });
  assert.ok(skewed.hit > 1.8 * even.hit, `skewed ${skewed.hit}, even ${even.hit}`); assert.equal(none.hit, 0);
});
test('eviction: LRU keeps the hot key that FIFO evicts, and a scan flushes LRU', () => {
  const c = lesson('cache-eviction').figures;
  assert.ok(ca(c.compare.scenarios.lru.scene).hit > ca(c.compare.scenarios.fifo.scene).hit);
  const m = api.caSimulate(c.scan.scene), after = m.reqs.slice(10);
  assert.equal(after[0].hit, false); assert.equal(after[1].hit, false);
});
test('invalidation: delete on write removes stale reads; coalescing turns a stampede into one read per expiry', () => {
  const c = lesson('cache-invalidation').figures;
  assert.ok(ca(c.stale.scenarios.ttl.scene).stale > 5); assert.equal(ca(c.stale.scenarios.delete.scene).stale, 0);
  const herd = ca(c.stampede.scenarios.herd.scene).db, one = ca(c.stampede.scenarios.one.scene).db;
  assert.ok(herd > 10 * one, `herd ${herd}, coalesced ${one}`);
});

/* ---------- data ---------- */
const busiest = scene => { const m = api.shSimulate(scene); return Math.max(...m.counts) / (m.reqs.length / m.N); };
test('sharding: growing IDs pile onto one shard by range but not by hash; a hot key overloads one shard anyway', () => {
  const f = lesson('sharding').figures;
  assert.ok(busiest(f.even.scenarios.range.scene) < 1.5 && busiest(f.even.scenarios.hash.scene) < 1.5);
  assert.ok(busiest(f.sequential.scenarios.range.scene) > 3.9, 'all on one shard');
  assert.ok(busiest(f.sequential.scenarios.hash.scene) < 1.5);
  assert.ok(busiest(f['hot-key'].scene) > 1.8);
});
test('consensus: a majority of 5 is 3, and 4 servers tolerate no more failures than 3', () => {
  const c = lesson('consensus').figures.playground, run = n => api.calcRun(c, { n }).out.map(r => r.v);
  assert.equal(run(5)[0], 3); assert.equal(run(5)[1], 2); assert.equal(run(4)[1], run(3)[1]);
});
test('replication: W + R > N means reads overlap the latest write', () => {
  const c = lesson('replication').figures.playground;
  assert.equal(api.calcRun(c, { n: 3, w: 2, r: 2 }).out[1].v, 1); assert.equal(api.calcRun(c, { n: 3, w: 2, r: 1 }).out[1].v, 0);
});

/* ---------- async and messaging ---------- */
const q = scene => { const m = api.qSimulate(scene); return { maxq: Math.max(...m.samples.map(x => x.q)), blocked: Math.max(...m.samples.map(x => x.b)), rejected: m.msgs.filter(x => x.rejected).length, wait: Math.max(...m.msgs.filter(x => x.wait != null).map(x => x.wait)), lost: m.msgs.filter(x => x.start == null && !x.rejected && !x.shed).length }; };
test('message queues: a burst queues up and drains with nothing lost; more consumers keep the queue short', () => {
  const f = lesson('message-queues').figures, burst = q(f.burst.scene);
  assert.ok(burst.maxq >= 10, `queue peaks at ${burst.maxq}`); assert.equal(burst.lost, 0); assert.equal(burst.rejected, 0);
  assert.ok(q({ ...f.playground.scene, consumers: 4 }).maxq < burst.maxq / 2);
});
test('backpressure: a limit of 8 is never exceeded; reject refuses messages, block makes the producer wait', () => {
  const sc = lesson('backpressure').figures.full.scenarios, grow = q(sc.grow.scene), rej = q(sc.reject.scene), blk = q(sc.block.scene);
  assert.ok(grow.maxq > 8 && grow.wait > rej.wait);
  assert.ok(rej.maxq <= 8 && rej.rejected > 0); assert.ok(blk.maxq <= 8 && blk.rejected === 0 && blk.blocked > 0);
  for (const r of [grow, rej, blk]) assert.equal(r.lost, 0);
});
test('pub/sub: a queue delivers each message once, a topic once per subscriber', () => {
  const sc = lesson('pub-sub').figures.fanout.scenarios, a = api.tpSimulate(sc.queue.scene), b = api.tpSimulate(sc.topic.scene);
  assert.equal(a.msgs.reduce((n, m) => n + m.to.length, 0), a.msgs.length);
  assert.equal(b.msgs.reduce((n, m) => n + m.to.length, 0), b.msgs.length * 3);
});
test('event logs: one key always lands in one partition, and a late group still reads every event', () => {
  const sc = lesson('event-logs').figures.log.scenarios.replay.scene, m = api.tpSimulate(sc);
  const parts = new Map(); m.msgs.forEach(x => { parts.set(x.key, (parts.get(x.key) || new Set()).add(x.part)); });
  for (const s of parts.values()) assert.equal(s.size, 1);
  const late = m.reads[1].flat(); assert.equal(late.length, m.msgs.length); assert.ok(Math.min(...late) >= 5);
  assert.ok(Math.max(...late) < sc.period, 'the late group catches up before the loop ends');
});

/* ---------- reliability ---------- */
test('timeouts: no timeout waits 10 s; a 1 s timeout and one retry finish in 1.35 s; 3 layers of 3 attempts give 27 calls', () => {
  const f = lesson('timeouts-and-retries').figures;
  assert.equal(end(f.timeout.scenarios.none.rows), 10000); assert.equal(end(f.timeout.scenarios.retry.rows), 1350);
  assert.equal(api.calcRun(f.amplify, f.amplify.ctrl).out[0].v, 27);
  const starts = sc => sc.rows.map(r => r.spans.map(s => s.s)), fixed = starts(f.jitter.scenarios.fixed), jit = starts(f.jitter.scenarios.jitter);
  assert.equal(new Set(fixed.map(r => r.join())).size, 1, 'fixed backoff keeps clients in step');
  assert.equal(new Set(jit.map(r => r[1])).size, jit.length, 'jitter spreads the first retry');
});
test('load shedding: serving everything wastes most work; shedding or a limit keeps every answer in time', () => {
  const sc = lesson('load-shedding').figures.shed.scenarios;
  const useful = s => { const m = api.qSimulate(s); const done = m.msgs.filter(x => x.start != null); return { ok: done.filter(x => x.wait <= s.deadline).length, late: done.filter(x => x.wait > s.deadline).length }; };
  const all = useful(sc.all.scene), old = useful(sc.old.scene), lim = useful(sc.limit.scene);
  assert.ok(all.late > all.ok, `late ${all.late}, in time ${all.ok}`);
  assert.equal(old.late, 0); assert.equal(lim.late, 0); assert.ok(old.ok > all.ok && lim.ok > all.ok);
});
test('health checks: faster checks lose fewer requests', () => {
  const sc = lesson('health-checks').figures.detect.scenarios;
  assert.ok(sc.fast.scene.health.detect < sc.slow.scene.health.detect);
});
test('observability: p99 is over 7 times the average; 100 calls at 1% slow each make 63% of requests slow', () => {
  const f = lesson('observability').figures, v = l => f.percentiles.items.find(i => i.label === l).value;
  assert.ok(v('p99') / v('Average') > 7);
  assert.equal(Math.round(api.calcRun(f.tail, f.tail.ctrl).out[0].v), 63);
});
test('SLOs: 99.9% allows under 9 hours a year and 99.999% about 5 minutes; 14.4 burn rate spends 2% in an hour', () => {
  const items = lesson('slos').figures.nines.items, v = l => items.find(i => i.label === l).value;
  assert.ok(v('99.9%') < 9 * 3600 && v('99.9%') > 8 * 3600); assert.equal(Math.round(v('99.999%') / 60), 5);
  assert.ok(Math.abs(14.4 / (30 * 24) - 0.02) < 1e-9);
});
