// Asserts what the DNS, load balancing and consistent hashing figures are meant to show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(root + p, 'utf8');
const ctx = vm.createContext({});
vm.runInContext(`const KINDS = {}; const TIN = 0.55, TOUT = 0.5;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)); const lerp = (a, b, f) => a + (b - a) * f;
${read('src/sim.js')}
${read('src/kinds/lb.js')}
${read('src/kinds/ring.js')}
globalThis.api = { lbSimulate, ringAssign };`, ctx);
const { lbSimulate, ringAssign } = ctx.api;
const lesson = s => JSON.parse(read(`lessons/${s}.json`));

/* ---------- load balancing ---------- */
const LB = lesson('load-balancing').figures;
const lat = (sim, from = 0) => sim.reqs.filter(q => !q.failed && q.t >= from).map(q => q.latency).sort((a, b) => a - b);
const p95 = xs => xs[Math.floor(xs.length * .95)];

test('one server: response times climb as the queue builds', () => {
  const s = lbSimulate(LB['one-server'].scene), early = lat(s).slice(0, 5), late = s.reqs.filter(q => q.t > 6).map(q => q.latency);
  assert.ok(Math.min(...late) > 3 * Math.max(...early), `early ${Math.max(...early)}, late ${Math.min(...late)}`);
});
test('round robin, equal servers: each gets a third, p95 under 1 s', () => {
  const s = lbSimulate(LB['round-robin'].scene), n = s.reqs.length;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(s.jobs[i].length - n / 3) <= 1);
  assert.ok(p95(lat(s)) < 1);
});
test('least connections beats round robin when one server is slow', () => {
  const rr = p95(lat(lbSimulate(LB['round-robin-slow'].scene))), lc = p95(lat(lbSimulate(LB['least-connections'].scene)));
  assert.ok(lc * 2 < rr, `rr ${rr}, least ${lc}`);
  const s = lbSimulate(LB['least-connections'].scene);
  assert.ok(s.jobs[2].length < s.jobs[0].length * .7, 'slow server gets fewer requests');
});
test('health check: errors only between the failure and its detection', () => {
  const sc = LB['health-check'].scene, s = lbSimulate(sc), H = sc.health;
  const errs = s.reqs.filter(q => q.failed);
  assert.ok(errs.length > 0);
  for (const q of errs) assert.ok(q.end >= H.down - 1e-9 && q.end <= H.down + H.detect + 0.5, `error at ${q.end}`);
  assert.ok(!s.reqs.some(q => q.server === H.server && q.t + 0.45 > H.down + H.detect), 'nothing sent after detection');
});

/* ---------- consistent hashing ---------- */
const keys = Array.from({ length: 100 }, (_, i) => `key-${i + 1}`);
const moved = (a, b) => keys.filter(k => a.owner[k] !== b.owner[k]).length;
const CH = lesson('consistent-hashing').figures;

test('hash mod N: going from 4 to 5 servers moves most keys', () => {
  const m = moved(ringAssign(keys, ['A', 'B', 'C', 'D'], 'mod', 1), ringAssign(keys, ['A', 'B', 'C', 'D', 'E'], 'mod', 1));
  assert.ok(m >= 70, `moved ${m}`);
});
test('ring: adding a server moves about a fifth, and only to the new server', () => {
  const salt = CH.ring.salt, a = ringAssign(keys, ['A', 'B', 'C', 'D'], 'ring', 1, salt), b = ringAssign(keys, ['A', 'B', 'C', 'D', 'E'], 'ring', 1, salt);
  const m = moved(a, b); assert.ok(m >= 12 && m <= 28, `moved ${m}`);
  for (const k of keys) if (a.owner[k] !== b.owner[k]) assert.equal(b.owner[k], 'E');
});
test('ring: removing a server moves only its keys', () => {
  const a = ringAssign(keys, ['A', 'B', 'C', 'D'], 'ring', 1), b = ringAssign(keys, ['A', 'B', 'C'], 'ring', 1);
  for (const k of keys) if (a.owner[k] !== b.owner[k]) assert.equal(a.owner[k], 'D');
});
test('virtual nodes even out the load', () => {
  const spread = v => { const o = ringAssign(keys, ['A', 'B', 'C', 'D'], 'ring', v).owner, c = {}; for (const k of keys) c[o[k]] = (c[o[k]] || 0) + 1; return Math.max(...Object.values(c)) / 25; };
  assert.ok(spread(1) > 1.5, `1 position: ${spread(1)}`);
  assert.ok(spread(100) < 1.35, `100 positions: ${spread(100)}`);
});

/* ---------- DNS ---------- */
test('DNS: a cold lookup asks root, then .com, then the domain, in that order', () => {
  const steps = lesson('dns').figures['first-lookup'].steps.filter(s => s.from === 'resolver' && s.to !== 'laptop').map(s => s.to);
  assert.deepEqual(steps, ['root', 'tld', 'auth']);
});

/* ---------- vertical and horizontal scaling ---------- */
const VH = lesson('vertical-and-horizontal').figures;
test('scaling: one fast server and three ordinary ones both keep up with 15 requests a second', () => {
  for (const k of ['up', 'out']) assert.ok(p95(lat(lbSimulate(VH.shapes.scenarios[k].scene))) < 1, k);
});
test('scaling: losing the only server fails far more requests than losing one of three', () => {
  const errs = k => lbSimulate(VH.failure.scenarios[k].scene).reqs.filter(q => q.failed).length;
  assert.ok(errs('up') > 4 * errs('out'), `one server ${errs('up')}, one of three ${errs('out')}`);
});
