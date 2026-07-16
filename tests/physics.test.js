'use strict';
const assert = require('assert');
const { waveNumber, cutoffInfo, theoryCurve, fitExponential } = require('../physics.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   - ' + name); pass++; }
  catch (e) { console.log('  FAIL - ' + name + '\n         ' + e.message); fail++; }
}
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) < tol, (m || '') + ' ' + a + ' vs ' + b);

test('waveNumber = 2π/λ', () => near(waveNumber(100), 2 * Math.PI / 100, 1e-12));

test('차단: λ>2a → evanescent, κ 값', () => {
  const a = 64, lam = 160;             // 2a=128, λ>128
  const info = cutoffInfo(lam, a);
  assert.strictEqual(info.cutoffLambda, 128);
  assert.ok(info.evanescent);
  const k = 2 * Math.PI / lam, kc = Math.PI / a;
  near(info.kappa, Math.sqrt(kc * kc - k * k), 1e-9, 'κ');
  assert.strictEqual(info.kguide, null);
});

test('전파: λ<2a → propagating, kguide 값', () => {
  const a = 64, lam = 96;              // 2a=128, λ<128
  const info = cutoffInfo(lam, a);
  assert.ok(!info.evanescent);
  const k = 2 * Math.PI / lam, kc = Math.PI / a;
  near(info.kguide, Math.sqrt(k * k - kc * kc), 1e-9, 'kguide');
  assert.strictEqual(info.kappa, null);
});

test('theoryCurve: 차단은 지수 감쇠', () => {
  const a = 64, lam = 160, x0 = 130;
  const xs = [x0, x0 + 50, x0 + 100];
  const curve = theoryCurve(lam, a, x0, xs);
  const kappa = cutoffInfo(lam, a).kappa;
  near(curve[0], 1, 1e-9, 'x0에서 1');
  near(curve[1], Math.exp(-kappa * 50), 1e-9, '50칸');
  assert.ok(curve[2] < curve[1] && curve[1] < curve[0], '단조 감소');
});

test('fitExponential: 순수 지수 감쇠에서 κ 복원 (5% 이내)', () => {
  const kappa = 0.03;
  const arr = new Float32Array(300);
  for (let i = 100; i < 280; i++) arr[i] = Math.exp(-kappa * (i - 100));
  const measured = fitExponential(arr, 100, 200);
  near(measured, kappa, kappa * 0.05, 'κ');
});

test('fitExponential: 유효 점 < 2이면 0 반환', () => {
  const arr = new Float32Array(10);  // 모두 0 → log 계산 불가
  near(fitExponential(arr, 5, 5), 0, 1e-9, '단일 점');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
