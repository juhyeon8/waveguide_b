(function (global) {
  'use strict';

  function waveNumber(lambda) { return 2 * Math.PI / lambda; }

  function cutoffInfo(lambda, a) {
    var cutoffLambda = 2 * a;
    var evanescent = lambda > cutoffLambda;
    var k = 2 * Math.PI / lambda;
    var kc = Math.PI / a;
    var kappa = null, kguide = null;
    if (evanescent) kappa = Math.sqrt(kc * kc - k * k);
    else kguide = Math.sqrt(k * k - kc * kc);
    return { cutoffLambda: cutoffLambda, evanescent: evanescent,
             kappa: kappa, kguide: kguide };
  }

  function theoryCurve(lambda, a, x0, xs) {
    var info = cutoffInfo(lambda, a);
    var out = [];
    for (var i = 0; i < xs.length; i++) {
      var dx = xs[i] - x0;
      out.push(info.evanescent ? Math.exp(-info.kappa * dx) : 1);
    }
    return out;
  }

  function fitExponential(ampArr, xStart, xEnd) {
    var sumXX = 0, sumXY = 0, sumX = 0, sumY = 0, cnt = 0;
    for (var x = xStart; x <= xEnd; x++) {
      if (ampArr[x] < 1e-10) continue;
      var lv = Math.log(ampArr[x]);
      sumXX += x * x; sumXY += x * lv; sumX += x; sumY += lv; cnt++;
    }
    if (cnt < 2) return 0;
    var denom = cnt * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-12) return 0;
    var slope = (cnt * sumXY - sumX * sumY) / denom;
    return -slope;
  }

  // 닫힌 해: 도파관 모드 합 (N=∞ 극한)
  // 중심 선원(y=y0=yBot+a/2) → 홀수 모드만 기여 (sin(nπ/2) = ±1)
  // 반환 필드는 영상 합 방식과 동일 규격 (H₀⁽¹⁾ 기반, 1/4 인수 없음)
  // 참조: G_wg = (i/2a) Σ sin_y·sin_y0·e^{ik_zn|dx|}/k_zn,  코드 값 = (4/i)G_wg
  function computeModeField(Nx, Ny, y0, a, lambda, x0, nMax) {
    var re = new Float32Array(Nx * Ny);
    var im = new Float32Array(Nx * Ny);
    var k = 2 * Math.PI / lambda;
    var yBot = y0 - a / 2;
    var jBot = Math.round(yBot), jTop = Math.round(y0 + a / 2);
    var span = jTop - jBot;

    for (var n = 1; n <= nMax; n += 2) {
      var kc_n = n * Math.PI / a;
      // sin(nπ/2) for odd n: n=1→+1, n=3→-1, n=5→+1, ...
      var sinNpi2 = (((n - 1) / 2) % 2 === 0) ? 1 : -1;
      var k2 = k * k, kc2 = kc_n * kc_n;
      var propagating = k2 > kc2;
      var kzn = propagating ? Math.sqrt(k2 - kc2) : 0;
      var kappan = propagating ? 0 : Math.sqrt(kc2 - k2);

      // sin_y 룩업 테이블 (sin 반복 연산 절감)
      var sinY = new Float32Array(span + 1);
      for (var jj = 0; jj <= span; jj++)
        sinY[jj] = Math.sin(n * Math.PI * jj / span);

      for (var i = 0; i < Nx; i++) {
        var dx = Math.abs(i - x0);
        var base = i * Ny;
        var fRe, fIm;

        if (propagating) {
          // 기여: (2/(a·k_zn))·sin(nπ/2)·sin_y·(cos(k_zn·dx) + i·sin(k_zn·dx))
          var amp = 2 / (a * kzn) * sinNpi2;
          fRe = amp * Math.cos(kzn * dx);
          fIm = amp * Math.sin(kzn * dx);
        } else {
          // 기여: -(2/(a·κ_n))·sin(nπ/2)·sin_y·exp(-κ_n·dx)  [순 허수부]
          var expD = Math.exp(-kappan * dx);
          fRe = 0;
          fIm = -(2 / (a * kappan)) * sinNpi2 * expD;
        }

        for (var j = jBot; j <= jTop; j++) {
          var sy = sinY[j - jBot];
          var idx = base + j;
          re[idx] += fRe * sy;
          im[idx] += fIm * sy;
        }
      }
    }
    return { re: re, im: im, Nx: Nx, Ny: Ny };
  }

  var API = { waveNumber: waveNumber, cutoffInfo: cutoffInfo, theoryCurve: theoryCurve,
              fitExponential: fitExponential, computeModeField: computeModeField };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { global.WG = global.WG || {}; Object.assign(global.WG, API); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
