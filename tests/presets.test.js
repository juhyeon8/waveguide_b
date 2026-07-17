'use strict';
// 프리셋 4종 — 검증 게이트 (렌더 전 콘솔 PASS용)
// PRESETS 는 main.js 원문에서 뽑아 쓴다 (사본을 두면 어긋날 수 있으므로)
const fs = require('fs'), path = require('path');
const { generateImages } = require('../images.js');
const { cutoffInfo, fitExponential } = require('../physics.js');
const { makeField, computeField, addComplex } = require('../field.js');
const { modeCoefficient } = require('../render.js');
const { buildHankelTable } = require('../hankel.js');
const ROOT = path.join(__dirname, '..');

const Nx = 520, Ny = 220, y0 = 110, x0 = 130;

const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const m = /var PRESETS = (\[[\s\S]*?\n  \]);/.exec(src);
if (!m) { console.log('FAIL - main.js 에서 PRESETS 를 못 읽음'); process.exit(1); }
const PRESETS = eval(m[1]);
// 슬라이더 범위도 index.html 에서 직접 읽는다
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
function sliderRange(id) {
  const t = new RegExp('<input[^>]*id="' + id + '"[^>]*>').exec(html)[0];
  return { min: +/min="([^"]*)"/.exec(t)[1], max: +/max="([^"]*)"/.exec(t)[1] };
}
const RANGE = { lambda: sliderRange('lambda'), aGap: sliderRange('aGap'), nImg: sliderRange('nImg') };
console.log('슬라이더 범위 (index.html 에서 읽음):', JSON.stringify(RANGE));

let pass = 0, fail = 0;
function gate(name, ok, detail) {
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' - ' + name + (detail ? '\n         ' + detail : ''));
  ok ? pass++ : fail++;
}
const f4 = v => v.toFixed(4);

function build(a, lam, N, hr) {
  const ys = (y0 - a / 2) + hr * a;
  const table = buildHankelTable(2 * Math.PI / lam, Math.hypot(Nx + x0, Ny + N * a) + 10);
  const inc = computeField(makeField(Nx, Ny), [{ x: x0, y: ys, sign: 1 }], table);
  const scat = computeField(makeField(Nx, Ny), generateImages('A', N, x0, y0, a, ys), table);
  return addComplex(makeField(Nx, Ny), inc, scat);
}
function wallAvg(f, a) {
  const jT = Math.round(y0 + a / 2), jB = Math.round(y0 - a / 2);
  let s = 0, c = 0;
  for (let xi = x0 - 10; xi <= x0 + 10; xi++)
    for (const j of [jT, jB]) { const i = xi * Ny + j; s += Math.hypot(f.re[i], f.im[i]); c++; }
  return s / c;
}
function modePeaks(tot, a) {
  return [1, 2, 3].map(n => {
    const c = modeCoefficient(tot, y0, a, n);
    let mx = 0;
    for (let x = x0 + 20; x < Nx; x++) if (c[x] > mx) mx = c[x];
    return mx;
  });
}
function ratios(tot, a) {
  const peaks = modePeaks(tot, a);
  const nrm = Math.max(...peaks);
  return peaks.map(p => p / nrm);
}
// main.js computeFitInterval 과 동일
const fitWin = arr => ({ s: x0 + 20, e: Math.min(x0 + 70, arr.length - 1) });

// main.js applyPreset 과 동일하게 슬라이더 격자(step 0.001)로 스냅한 값을 검증한다
const snap = v => Math.round(v * 1000) / 1000;
const results = PRESETS.map(p => {
  const a = p.aCell, lam = Math.round(p.lamOverA * a), hr = snap(p.yOverA);
  const tot = build(a, lam, p.N, hr);
  return { p, a, lam, hr, tot, r: ratios(tot, a), wall: wallAvg(tot, a) };
});

console.log('\n=== 게이트 P1: 실제 λ/a · y₀/a 비율이 목표와 일치 ===');
results.forEach(({ p, a, lam, hr }) => {
  const actualLam = lam / a;
  const ok = Math.abs(actualLam - p.lamOverA) < 0.01 && Math.abs(hr - p.yOverA) < 0.001;
  gate(p.label + ' 비율', ok,
    'a=' + a + '셀(' + (a / 10).toFixed(1) + 'cm)  λ=' + lam + '셀(' + (lam / 10).toFixed(1) + 'cm)  ' +
    'λ/a = ' + actualLam.toFixed(4) + ' (목표 ' + p.lamOverA + ')   y₀/a = ' + hr.toFixed(4) +
    ' (목표 ' + p.yOverA.toFixed(4) + ', 슬라이더 격자로 스냅)');
});

console.log('\n=== 게이트 P2: 슬라이더 범위 안 ===');
results.forEach(({ p, a, lam }) => {
  const ok = lam >= RANGE.lambda.min && lam <= RANGE.lambda.max &&
             a >= RANGE.aGap.min && a <= RANGE.aGap.max &&
             p.N >= RANGE.nImg.min && p.N <= RANGE.nImg.max;
  gate(p.label + ' λ·a·N 모두 슬라이더 범위 내', ok,
    'λ=' + lam + '∈[' + RANGE.lambda.min + ',' + RANGE.lambda.max + ']  a=' + a +
    '∈[' + RANGE.aGap.min + ',' + RANGE.aGap.max + ']  N=' + p.N +
    '∈[' + RANGE.nImg.min + ',' + RANGE.nImg.max + ']');
});

console.log('\n=== 게이트 P3: ① 완전차단 — mode1 차단·지수감쇠, κ ∈ 80~120%, 경고 미발생 ===');
{
  const { p, a, lam, tot } = results[0];
  const info = cutoffInfo(lam, a);
  gate('① mode1 차단 조건 (λ > 2a)', info.evanescent,
       'λ=' + lam + ', 2a=' + (2 * a) + ' → ' + (info.evanescent ? '차단' : '전파'));

  const c1 = modeCoefficient(tot, y0, a, 1);
  const w = fitWin(c1);
  const meas = fitExponential(c1, w.s, w.e);
  const pct = meas / info.kappa * 100;
  gate('① 측정 κ ∈ 이론 80~120% → 경고 미발생', pct >= 80 && pct <= 120,
       '측정 κ = ' + f4(meas * 10) + ' /cm, 이론 κ = ' + f4(info.kappa * 10) + ' /cm  (' + pct.toFixed(1) + '%)');

  // 지수감쇠 확인 — 단조 감소하는가
  let mono = true;
  for (let x = w.s; x < w.e; x++) if (c1[x + 1] > c1[x] * 1.02) { mono = false; break; }
  gate('① mode1 이 피팅 구간에서 단조 지수감쇠', mono,
       '|c1| ' + f4(c1[w.s]) + ' → ' + f4(c1[w.e]) + '  (' + (c1[w.e] / c1[w.s]).toFixed(3) + '배)');
}

console.log('\n=== 게이트 P4: ② 단일모드 — mode1 전파(≈상수), mode2·3 바닥 ===');
{
  const { a, lam, tot, r } = results[1];
  gate('② mode1 전파 조건 (λ < 2a)', !cutoffInfo(lam, a).evanescent,
       'λ=' + lam + ', 2a=' + (2 * a));
  const c1 = modeCoefficient(tot, y0, a, 1);
  let mn = Infinity, mx = 0;
  for (let x = x0 + 40; x < Nx - 40; x++) { if (c1[x] < mn) mn = c1[x]; if (c1[x] > mx) mx = c1[x]; }
  gate('② mode1 ≈ 상수 (전파)', (mx - mn) / mx < 0.30,
       '|c1| 변동폭 = ' + ((mx - mn) / mx * 100).toFixed(1) + '%  (min ' + f4(mn) + ', max ' + f4(mx) + ')');
  gate('② mode2·3 바닥', r[1] < 0.1 && r[2] < 0.1,
       'mode1=' + f4(r[0]) + '  mode2=' + f4(r[1]) + '  mode3=' + f4(r[2]));
}

console.log('\n=== 게이트 P5: ③ 2모드 — mode2 계수 유의미 (≳0.1) ===');
{
  const { r } = results[2];
  gate('③ mode2 계수 유의미', r[1] >= 0.1,
       'mode1=' + f4(r[0]) + '  mode2=' + f4(r[1]) + '  mode3=' + f4(r[2]) +
       '   [이론 결합 sin(nπ/4) = 0.707, 1.000, 0.707]');
}

console.log('\n=== 게이트 P6: ④ 3모드 — mode3 부각 ===');
{
  const { r } = results[3];
  gate('④ mode3 계수 부각', r[2] >= 0.1,
       'mode1=' + f4(r[0]) + '  mode2=' + f4(r[1]) + '  mode3=' + f4(r[2]) +
       '   [이론 결합 sin(nπ/6) = 0.500, 0.866, 1.000]');
}

console.log('\n=== 게이트 P7: 전 프리셋 도체판 |E| 평균 충분히 작음 ===');
// 절대값 문턱은 무의미하다 — 프리셋마다 장의 진폭 스케일이 다르다(①은 차단 감쇠, ③④는 전파).
// 경계조건 만족도 = 벽 위 잔차 / 도파관 안 장 세기 (무차원).
// 기준은 '가장 센 모드'의 계수 — ③④ 는 소스가 비중앙이라 mode1 이 약하고 mode2·3 이 에너지를 나른다.
results.forEach(({ p, wall, a, tot }) => {
  const peaks = modePeaks(tot, a);
  const ref = Math.max(...peaks);
  const dom = peaks.indexOf(ref) + 1;
  const rel = wall / ref;
  const at40 = wallAvg(build(a, Math.round(p.lamOverA * a), 40, p.yOverA), a);
  gate(p.label + ' 경계조건 (벽 잔차 / 도파관 내 장)', rel < 0.15,
       '|E|벽 = ' + f4(wall) + ' / 최강 모드 |c' + dom + '| = ' + f4(ref) +
       ' → ' + (rel * 100).toFixed(1) + '%' +
       '   (N=40 이면 |E|벽 ' + f4(at40) + ' → N=' + p.N + ' 이 ' +
       ((1 - wall / at40) * 100).toFixed(0) + '% 개선)');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
