'use strict';
// 소스 y₀ 일반화 — 검증 게이트 (렌더 전 콘솔 PASS용)
const { generateImages } = require('../images.js');
const { computeModeField, cutoffInfo, fitExponential } = require('../physics.js');
const { makeField, computeField, addComplex } = require('../field.js');
const { modeCoefficient } = require('../render.js');
const { buildHankelTable } = require('../hankel.js');

const Nx = 520, Ny = 220, y0 = 110, x0 = 130;

let pass = 0, fail = 0;
function gate(name, ok, detail) {
  if (ok) { console.log('  PASS - ' + name + (detail ? '\n         ' + detail : '')); pass++; }
  else { console.log('  FAIL - ' + name + (detail ? '\n         ' + detail : '')); fail++; }
}

// ───────── 기존 구현 사본 (회귀 대조용) ─────────
function generateImagesOld(geometry, N, x0, y0, a) {
  var imgs = [];
  for (var m = 1; m <= N; m++) {
    var sign = (m % 2 === 0) ? 1 : -1;
    imgs.push({ x: x0, y: y0 + m * a, sign: sign });
    imgs.push({ x: x0, y: y0 - m * a, sign: sign });
  }
  if (geometry === 'B') {
    var mirrored = [{ x: -x0, y: y0, sign: -1 }];
    for (var i = 0; i < imgs.length; i++) mirrored.push({ x: -x0, y: imgs[i].y, sign: -imgs[i].sign });
    imgs = imgs.concat(mirrored);
  }
  return imgs;
}
function computeModeFieldOld(Nx, Ny, y0, a, lambda, x0, nMax) {
  var re = new Float32Array(Nx * Ny), im = new Float32Array(Nx * Ny);
  var k = 2 * Math.PI / lambda, yBot = y0 - a / 2;
  var jBot = Math.round(yBot), jTop = Math.round(y0 + a / 2), span = jTop - jBot;
  for (var n = 1; n <= nMax; n += 2) {
    var kc_n = n * Math.PI / a;
    var sinNpi2 = (((n - 1) / 2) % 2 === 0) ? 1 : -1;
    var k2 = k * k, kc2 = kc_n * kc_n;
    var propagating = k2 > kc2;
    var kzn = propagating ? Math.sqrt(k2 - kc2) : 0;
    var kappan = propagating ? 0 : Math.sqrt(kc2 - k2);
    var sinY = new Float32Array(span + 1);
    for (var jj = 0; jj <= span; jj++) sinY[jj] = Math.sin(n * Math.PI * jj / span);
    for (var i = 0; i < Nx; i++) {
      var dx = Math.abs(i - x0), base = i * Ny, fRe, fIm;
      if (propagating) {
        var amp = 2 / (a * kzn) * sinNpi2;
        fRe = amp * Math.cos(kzn * dx); fIm = amp * Math.sin(kzn * dx);
      } else {
        var expD = Math.exp(-kappan * dx);
        fRe = 0; fIm = -(2 / (a * kappan)) * sinNpi2 * expD;
      }
      for (var j = jBot; j <= jTop; j++) {
        var sy = sinY[j - jBot], idx = base + j;
        re[idx] += fRe * sy; im[idx] += fIm * sy;
      }
    }
  }
  return { re: re, im: im, Nx: Nx, Ny: Ny };
}

// ───────── 헬퍼 ─────────
function ySrcOf(a, hRatio) { return (y0 - a / 2) + hRatio * a; }

function buildTotal(a, lam, N, hRatio) {
  const ys = ySrcOf(a, hRatio);
  const k = 2 * Math.PI / lam;
  const rMax = Math.hypot(Nx + x0, Ny + N * a) + 10;
  const table = buildHankelTable(k, rMax);
  const inc = computeField(makeField(Nx, Ny), [{ x: x0, y: ys, sign: 1 }], table);
  const scat = computeField(makeField(Nx, Ny), generateImages('A', N, x0, y0, a, ys), table);
  return addComplex(makeField(Nx, Ny), inc, scat);
}

// main.js plateWallAvg 사본
function plateWallAvg(field, aCell) {
  const jTop = Math.round(y0 + aCell / 2), jBot = Math.round(y0 - aCell / 2);
  let s = 0, cnt = 0;
  const xFrom = Math.max(0, x0 - 10), xTo = Math.min(field.Nx - 1, x0 + 10);
  for (let xi = xFrom; xi <= xTo; xi++) {
    for (const j of [jTop, jBot]) {
      const idx = xi * field.Ny + j;
      s += Math.hypot(field.re[idx], field.im[idx]); cnt++;
    }
  }
  return cnt > 0 ? s / cnt : 0;
}

// n=1..3 계수의 피크를 공통 기준(최댓값=1)으로 규격화
function modeRatios(total, a) {
  const peaks = [1, 2, 3].map(n => {
    const c = modeCoefficient(total, y0, a, n);
    let m = 0;
    for (let x = x0 + 20; x < Nx; x++) if (c[x] > m) m = c[x];
    return m;
  });
  const norm = Math.max(...peaks);
  return peaks.map(p => p / norm);
}

const f4 = v => v.toFixed(4);

console.log('\n=== 게이트 1: 회귀 (h=a/2 → 기존 결과와 동일) ===');
{
  const a = 64, lam = 160, N = 12;   // main.js 기본 상태 (2a=128 < λ=160 → 차단, κ 측정 유효)
  const ys = ySrcOf(a, 0.5);
  gate('ySrc = y0 (중앙)', Math.abs(ys - y0) < 1e-12, 'ySrc=' + ys + ', y0=' + y0);

  // 영상 배열: 위치·부호 집합이 동일한가
  let same = true, detail = '';
  for (const n of [1, 2, 3, 5, 12, 40]) {
    const key = arr => arr.map(o => o.x + ',' + o.y + ',' + o.sign).sort().join(' | ');
    const a1 = key(generateImages('A', n, x0, y0, a, ys));
    const a2 = key(generateImagesOld('A', n, x0, y0, a));
    if (a1 !== a2) { same = false; detail = 'N=' + n + ' 불일치'; break; }
  }
  gate('영상 배열 불변 (A, N=1·2·3·5·12·40)', same, detail || '위치·부호 집합 완전 일치');

  let sameB = true;
  for (const n of [1, 3, 4]) {
    const key = arr => arr.map(o => o.x + ',' + o.y + ',' + o.sign).sort().join(' | ');
    if (key(generateImages('B', n, x0, y0, a, ys)) !== key(generateImagesOld('B', n, x0, y0, a))) sameB = false;
  }
  gate('영상 배열 불변 (B, 끝벽 미러 포함)', sameB);

  // ySrc 생략 시에도 동일해야 (기본값 = 중앙)
  const keyf = arr => arr.map(o => o.x + ',' + o.y + ',' + o.sign).sort().join(' | ');
  gate('ySrc 생략 = 중앙 기본값',
       keyf(generateImages('A', 12, x0, y0, a)) === keyf(generateImagesOld('A', 12, x0, y0, a)));

  // 영상 합 장
  const k = 2 * Math.PI / lam;
  const table = buildHankelTable(k, Math.hypot(Nx + x0, Ny + N * a) + 10);
  const sortByY = arr => arr.slice().sort((p, q) => (p.y - q.y) || (p.sign - q.sign));
  function fieldMaxDiff(A, B) {
    const fa = computeField(makeField(Nx, Ny), A, table);
    const fb = computeField(makeField(Nx, Ny), B, table);
    let d = 0, v = 0;
    for (let i = 0; i < fa.re.length; i++) {
      d = Math.max(d, Math.abs(fa.re[i] - fb.re[i]), Math.abs(fa.im[i] - fb.im[i]));
      v = Math.max(v, Math.abs(fb.re[i]), Math.abs(fb.im[i]));
    }
    return { d: d, v: v };
  }
  const newImgs = generateImages('A', N, x0, y0, a, ys);
  const oldImgs = generateImagesOld('A', N, x0, y0, a);
  // 합산 순서를 양쪽 동일하게 맞추면 비트 단위로 같아야 함 (집합이 같으므로)
  const sorted = fieldMaxDiff(sortByY(newImgs), sortByY(oldImgs));
  gate('산란장 불변 (영상 합, 합산 순서 통일)', sorted.d === 0,
       '최대 절대차 = ' + sorted.d + '  (장 최대 |값| = ' + f4(sorted.v) + ')');
  // 배열 순서 그대로면 float32 누적 순서 차이만큼만 달라야 함 (~1 ULP)
  const raw = fieldMaxDiff(newImgs, oldImgs);
  const ulp = raw.v * 1.2e-7;
  gate('산란장 순서차 = float32 반올림 수준', raw.d <= 4 * ulp,
       '최대 절대차 = ' + raw.d.toExponential(3) + '  (float32 1 ULP ≈ ' + ulp.toExponential(3) + ')');

  // 모드 합 장
  // factor-2 수정을 반영: 새 모드합은 기존의 정확히 2배여야 한다 (모양·위상 불변)
  const mNew = computeModeField(Nx, Ny, y0, a, lam, x0, 41, ys);
  const mOld = computeModeFieldOld(Nx, Ny, y0, a, lam, x0, 41);
  let maxDm = 0, maxVm = 0;
  for (let i = 0; i < mNew.re.length; i++) {
    maxDm = Math.max(maxDm, Math.abs(mNew.re[i] - 2 * mOld.re[i]), Math.abs(mNew.im[i] - 2 * mOld.im[i]));
    maxVm = Math.max(maxVm, Math.abs(2 * mOld.re[i]), Math.abs(2 * mOld.im[i]));
  }
  const relm = maxVm > 0 ? maxDm / maxVm : 0;
  gate('모드 합 장 = 기존 × 2 (factor-2 수정만 반영, 짝수 모드 기여 무시가능)', relm < 1e-6,
       '최대 절대차 = ' + maxDm.toExponential(3) + ',  상대차 = ' + relm.toExponential(3));

  // κ
  const totNew = addComplex(makeField(Nx, Ny),
    computeField(makeField(Nx, Ny), [{ x: x0, y: ys, sign: 1 }], table),
    computeField(makeField(Nx, Ny), sortByY(newImgs), table));
  const totOld = addComplex(makeField(Nx, Ny),
    computeField(makeField(Nx, Ny), [{ x: x0, y: y0, sign: 1 }], table),
    computeField(makeField(Nx, Ny), sortByY(oldImgs), table));
  const kNew = fitExponential(modeCoefficient(totNew, y0, a, 1), x0 + 20, x0 + 70);
  const kOld = fitExponential(modeCoefficient(totOld, y0, a, 1), x0 + 20, x0 + 70);
  gate('측정 κ 불변', Math.abs(kNew - kOld) < 1e-12, 'κ_new = ' + f4(kNew) + ', κ_old = ' + f4(kOld));
}

console.log('\n=== 게이트 2: h=a/2 → mode2 계수 ≈ 0 ===');
{
  const a = 100, lam = 80, N = 40;   // λ/a=0.8 → mode1·2 전파
  const r = modeRatios(buildTotal(a, lam, N, 0.5), a);
  gate('mode2 계수 ≈ 0 (짝수 모드 미여기)', r[1] < 0.01,
       'mode1=' + f4(r[0]) + '  mode2=' + f4(r[1]) + '  mode3=' + f4(r[2]) + '   [이론 결합 sin(nπ/2) = 1, 0, 1]');
}

console.log('\n=== 게이트 3: h=a/4 → mode2 유의미 (≳0.1) ===');
{
  const a = 100, lam = 80, N = 40;
  const r = modeRatios(buildTotal(a, lam, N, 0.25), a);
  gate('mode2 계수 유의미', r[1] >= 0.1,
       'mode1=' + f4(r[0]) + '  mode2=' + f4(r[1]) + '  mode3=' + f4(r[2]) + '   [이론 결합 sin(nπ/4) = 0.707, 1.000, 0.707]');

  const avgs = [5, 10, 20, 40].map(n => plateWallAvg(buildTotal(a, lam, n, 0.25), a));
  const mono = avgs.every((v, i) => i === 0 || v < avgs[i - 1]);
  gate('도체판 |E| 평균이 N↑ 에서 0 수렴', mono && avgs[3] < avgs[0],
       'N=5 → ' + f4(avgs[0]) + ',  N=10 → ' + f4(avgs[1]) + ',  N=20 → ' + f4(avgs[2]) + ',  N=40 → ' + f4(avgs[3]));
}

console.log('\n=== 게이트 4: h=a/6 → mode3 부각 ===');
{
  const a = 100, lam = 55, N = 40;   // λ/a=0.55 → mode1·2·3 전파
  const r = modeRatios(buildTotal(a, lam, N, 1 / 6), a);
  gate('mode3 계수 부각', r[2] >= 0.1,
       'mode1=' + f4(r[0]) + '  mode2=' + f4(r[1]) + '  mode3=' + f4(r[2]) + '   [이론 결합 sin(nπ/6) = 0.500, 0.866, 1.000]');
}

console.log('\n=== 게이트 5: 각 h 에서 경계조건 (N=40) ===');
{
  const a = 100, lam = 80, N = 40;
  const incPeak = 1.0;   // 기준 스케일 — 입사파 근접장 |H₀| 수준
  for (const [label, hr] of [['a/2', 0.5], ['a/4', 0.25], ['a/6', 1 / 6], ['a/3', 1 / 3]]) {
    const w = plateWallAvg(buildTotal(a, lam, N, hr), a);
    gate('h=' + label + ' 도체판 |E| 평균 충분히 작음', w < 0.05, '|E|평균 = ' + f4(w));
  }
}

console.log('\n=== 게이트 6: 유한 영상합 → N=∞ 모드합 수렴 (지시서 4번) ===');
{
  // 전파 모드의 |cn| 은 x에 무관 → 넓은 구간 평균으로 비교
  function avgC(field, a, n) {
    const c = modeCoefficient(field, y0, a, n);
    let s = 0, cnt = 0;
    for (let x = x0 + 40; x < Nx - 40; x++) { s += c[x]; cnt++; }
    return s / cnt;
  }
  const cases = [[64, 96, 0.5, 1], [100, 80, 0.25, 1], [100, 80, 0.25, 2]];
  for (const [a, lam, hr, n] of cases) {
    const mv = avgC(computeModeField(Nx, Ny, y0, a, lam, x0, 81, ySrcOf(a, hr)), a, n);
    const iv = avgC(buildTotal(a, lam, 160, hr), a, n);
    const ratio = iv / mv;
    gate('a=' + a + ' λ=' + lam + ' h/a=' + hr.toFixed(3) + ' n=' + n + ' → 영상합 ≡ 모드합',
         Math.abs(ratio - 1) < 0.05,
         '영상합(N=160) |cn| = ' + f4(iv) + ',  모드합 |cn| = ' + f4(mv) + ',  비율 = ' + ratio.toFixed(4));
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
