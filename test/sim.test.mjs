// Asserts the numbers each diagram is meant to show, so a figure can't drift from its text.
// Usage: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const ctx = vm.createContext({});
vm.runInContext(`const TIN = 0.55, TOUT = 0.5;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)); const lerp = (a, b, f) => a + (b - a) * f;
${readFileSync(root + 'src/sim.js', 'utf8')}
globalThis.api = { simulate, peakSpan, peakCap };`, ctx);
const { simulate, peakSpan } = ctx.api;
const L = JSON.parse(readFileSync(root + 'lessons/rate-limiting.json', 'utf8'));
const run = (id, lim) => { const f = L.figures[id]; return simulate(f.scene, lim ?? f.scene.limiter, []); };
const peak = sim => peakSpan(sim.okTimes).best;

test('no limit: user requests time out too, not only the script', () => {
  const s = run('no-limit');
  const users = s.reqs.filter(q => q.client !== 'bot' && q.timedOut).length;
  assert.ok(users > 0, 'some user requests time out');
});
test('fixed window: never more than 5 in one calendar second', () => {
  const s = run('fixed-window'); const per = {};
  for (const t of s.okTimes) per[Math.floor(t)] = (per[Math.floor(t)] || 0) + 1;
  assert.ok(Math.max(...Object.values(per)) <= 5);
});
test('window edge: fixed window lets 10 through in under a second', () => assert.equal(peak(run('window-edge')), 10));
test('sliding log: no 1 s span holds more than 5', () => assert.equal(peak(run('sliding-log')), 5));
test('sliding counter: close to the log, well under the fixed window', () => { const p = peak(run('sliding-counter')); assert.ok(p >= 5 && p <= 7, `peak ${p}`); });
test('token bucket: first 8 of the burst of 12 pass', () => {
  const s = run('token-bucket'); const burst = s.reqs.filter(q => q.t < 1.5);
  assert.equal(burst.length, 12); assert.equal(burst.filter(q => q.ok).length, 8);
});
test('leaky bucket: output never faster than 4 a second, and the overflow is rejected', () => {
  const s = run('leaky-bucket'); const out = s.reqs.filter(q => q.ok).map(q => q.t + q.delay).sort((a, b) => a - b);
  for (let i = 1; i < out.length; i++) assert.ok(out[i] - out[i - 1] >= 0.25 - 1e-9);
  assert.ok(s.reqs.some(q => !q.ok));
});
test('distributed: per-server counters allow 18, a shared counter allows 6', () => {
  const f = L.figures.distributed;
  assert.equal(peak(run('distributed', { ...f.scene.limiter, scope: 'node' })), 18);
  assert.equal(peak(run('distributed', { ...f.scene.limiter, scope: 'shared' })), 6);
});
