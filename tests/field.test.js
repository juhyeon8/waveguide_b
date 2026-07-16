'use strict';
const assert = require('assert');
const { buildHankelTable, besselJ0, besselY0 } = require('../hankel.js');
const { generateImages } = require('../images.js');
const { cutoffInfo } = require('../physics.js');
const { makeField, addOneSource, computeField, addComplex } = require('../field.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   - ' + name); pass++; }
  catch (e) { console.log('  FAIL - ' + name + '\n         ' + e.message); fail++; }
}
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) < tol, (m || '') + ' ' + a + ' vs ' + b);

const Nx = 80, Ny = 80, X0 = 40, Y0 = 40, A = 16;
const k = 2 * Math.PI / 40;
const table = buildHankelTable(k, Math.hypot(Nx, Ny) * 4);
const amp = (f, i, j) => Math.hypot(f.re[i * Ny + j], f.im[i * Ny + j]);

test('중첩 항등: 전체 = 입사 + 산란 (복소 덧셈)', () => {
  const inc = computeField(makeField(Nx, Ny), [{ x: X0, y: Y0, sign: 1 }], table);
  const sc = computeField(makeField(Nx, Ny), generateImages('A', 6, X0, Y0, A), table);
  const tot = addComplex(makeField(Nx, Ny), inc, sc);
  const i = 55, j = 40, idx = i * Ny + j;
  near(tot.re[idx], inc.re[idx] + sc.re[idx], 1e-6, 're');
  near(tot.im[idx], inc.im[idx] + sc.im[idx], 1e-6, 'im');
});

test('증분: addOneSource 반복 == computeField 한 번', () => {
  const srcs = generateImages('A', 4, X0, Y0, A);
  const a1 = computeField(makeField(Nx, Ny), srcs, table);
  const a2 = makeField(Nx, Ny);
  for (const s of srcs) addOneSource(a2, s, table);
  near(amp(a1, 50, 40), amp(a2, 50, 40), 1e-6, '동일');
});

test('탭 A: N이 클수록 도체판 위 |E_total|가 더 작아짐(수렴)', () => {
  const jWall = Y0 + A / 2;
  function wallAmp(Npairs) {
    const inc = computeField(makeField(Nx, Ny), [{ x: X0, y: Y0, sign: 1 }], table);
    const sc = computeField(makeField(Nx, Ny), generateImages('A', Npairs, X0, Y0, A), table);
    const tot = addComplex(makeField(Nx, Ny), inc, sc);
    let s = 0; for (let i = X0 - 10; i <= X0 + 10; i++) s += amp(tot, i, jWall);
    return s / 21;
  }
  assert.ok(wallAmp(12) < wallAmp(2), '영상 늘면 경계조건 더 만족');
});

// ── 보완 사항 1: 차단 영역 N=40 κ 수렴성 테스트 (±25%) ──
test('차단 영역 N=40 κ 수렴성: 측정 κ ≈ 이론 κ (±25%)', () => {
  // λ=160, a=64: 이론 차단 상태. 전체 격자 Nx=520, y0=110
  const NX = 520, NY = 220, Y0c = 110, A64 = 64, X0c = 130;
  const LAM = 160;
  const kc = 2 * Math.PI / LAM;
  const bigTable = buildHankelTable(kc, Math.hypot(NX, NY) + NY * 40 + 10);

  const inc = computeField(makeField(NX, NY), [{ x: X0c, y: Y0c, sign: 1 }], bigTable);
  const sc = computeField(makeField(NX, NY), generateImages('A', 40, X0c, Y0c, A64), bigTable);
  const tot = addComplex(makeField(NX, NY), inc, sc);

  // 중심선(j=Y0c) 진폭 추출
  const ampArr = new Float32Array(NX);
  for (let i = 0; i < NX; i++) {
    const idx = i * NY + Y0c;
    ampArr[i] = Math.hypot(tot.re[idx], tot.im[idx]);
  }

  // 소스 오른쪽 x0+30 ~ x0+70 구간: 근거리(near-field)와 배경(background)을 모두 피함
  const xStart = X0c + 30, xEnd = X0c + 70;
  let sumXX = 0, sumXY = 0, sumX = 0, sumY = 0, cnt = 0;
  for (let x = xStart; x <= xEnd; x++) {
    if (ampArr[x] < 1e-10) continue;
    const lv = Math.log(ampArr[x]);
    sumXX += x * x; sumXY += x * lv; sumX += x; sumY += lv; cnt++;
  }
  const measuredKappa = -(cnt * sumXY - sumX * sumY) / (cnt * sumXX - sumX * sumX);

  const theoryKappa = cutoffInfo(LAM, A64).kappa;
  const ratio = measuredKappa / theoryKappa;
  console.log('    측정 κ=' + measuredKappa.toFixed(5) + ' 이론 κ=' + theoryKappa.toFixed(5) +
              ' 비율=' + ratio.toFixed(3));
  assert.ok(ratio >= 0.75 && ratio <= 1.25,
    'κ 비율이 ±25% 벗어남: ' + ratio.toFixed(3));
});

// ── 보완 사항 2: 탭 B 경계조건 — 허용오차 5% (진폭 최대값 대비) ──
test('탭 B: x=0 평면에서 |E_total| ≈ 0 (진폭 max 대비 5%)', () => {
  const x0b = 24;
  const inc = computeField(makeField(Nx, Ny), [{ x: x0b, y: Y0, sign: 1 }], table);
  const sc = computeField(makeField(Nx, Ny), generateImages('B', 8, x0b, Y0, A), table);
  const tot = addComplex(makeField(Nx, Ny), inc, sc);

  // 전체 격자 최대 진폭 측정
  let maxAmp = 1e-12;
  for (let i = 0; i < Nx; i++)
    for (let j = 0; j < Ny; j++) { const a = amp(tot, i, j); if (a > maxAmp) maxAmp = a; }

  // x=0 열 평균 진폭
  let s = 0; for (let j = 4; j < Ny - 4; j++) s += amp(tot, 0, j);
  const avgAtWall = s / (Ny - 8);
  const relErr = avgAtWall / maxAmp;
  console.log('    x=0 평균=' + avgAtWall.toFixed(6) + ' max=' + maxAmp.toFixed(6) +
              ' 상대오차=' + (relErr * 100).toFixed(2) + '%');
  assert.ok(relErr < 0.05, 'x=0 경계 상대오차 5% 초과: ' + (relErr * 100).toFixed(2) + '%');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
