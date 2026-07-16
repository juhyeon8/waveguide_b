'use strict';
const assert = require('assert');
const { besselJ0, besselY0, hankel0, buildHankelTable } = require('../hankel.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   - ' + name); pass++; }
  catch (e) { console.log('  FAIL - ' + name + '\n         ' + e.message); fail++; }
}
const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) < tol, (msg || '') + ' ' + a + ' vs ' + b);

test('J0 알려진 값', () => {
  near(besselJ0(0), 1, 1e-6, 'J0(0)');
  near(besselJ0(1), 0.7651976866, 2e-4, 'J0(1)');
  near(besselJ0(2), 0.2238907791, 2e-4, 'J0(2)');
  near(besselJ0(5), -0.1775967713, 2e-4, 'J0(5)');
});
test('Y0 알려진 값', () => {
  near(besselY0(1), 0.0882569642, 2e-4, 'Y0(1)');
  near(besselY0(2), 0.5103756726, 2e-4, 'Y0(2)');
  near(besselY0(5), -0.3085176252, 2e-4, 'Y0(5)');
});
test('hankel0 = J0 + iY0', () => {
  const h = hankel0(2);
  near(h.re, besselJ0(2), 1e-9, 're');
  near(h.im, besselY0(2), 1e-9, 'im');
});

test('룩업 테이블이 직접 계산과 일치(보간)', () => {
  const k = 0.1, rMax = 300;
  const tb = buildHankelTable(k, rMax);
  function lookup(r) {
    const f = (k * r) / tb.dx; let i = f | 0; if (i >= tb.n) i = tb.n - 1;
    const t = f - i;
    return { re: tb.re[i] + (tb.re[i + 1] - tb.re[i]) * t,
             im: tb.im[i] + (tb.im[i + 1] - tb.im[i]) * t };
  }
  for (const r of [20, 55, 130, 250]) {
    const lo = lookup(r);
    near(lo.re, besselJ0(k * r), 5e-4, 're@' + r);
    near(lo.im, besselY0(k * r), 5e-4, 'im@' + r);
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
