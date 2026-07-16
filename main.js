(function () {
  'use strict';
  var W = window.WG;
  var Nx = 520, Ny = 220, y0 = 110;
  var x0Const = 130;

  var state = { lambda: 160, a: 64, N: 12, phase: 0, dPhi: 0.15, paused: false, modeInfinity: false };

  var table = null, incident = null, scattered = null, total = null, scale = 1;
  var cachedAmp = null, cachedMode = null, fitInterval = null, measKappa = null;
  var fadedImgs = [];

  var el = function (id) { return document.getElementById(id); };
  var cvInc = el('cvInc'), cvScat = el('cvScat'), cvTot = el('cvTot'), cvGraph = el('cvGraph');
  var wraps = { inc: cvInc.parentNode, scat: cvScat.parentNode, tot: cvTot.parentNode, graph: cvGraph.parentNode };
  [cvInc, cvScat, cvTot].forEach(function (c) { c.width = Nx; c.height = Ny; });
  cvGraph.width = Nx; cvGraph.height = 120;
  var gInc = cvInc.getContext('2d'), gScat = cvScat.getContext('2d'),
      gTot = cvTot.getContext('2d'), gGraph = cvGraph.getContext('2d');

  function geom() { return { Nx: Nx, Ny: Ny, y0: y0, a: state.a, x0: x0Const, mmPerCell: 2 }; }

  function plateWallAvg(field, y0pos, aCell, x0pos) {
    var fNy = field.Ny, re = field.re, im = field.im;
    var jTop = Math.round(y0pos + aCell / 2);
    var jBot = Math.round(y0pos - aCell / 2);
    var s = 0, cnt = 0;
    var xFrom = Math.max(0, x0pos - 10), xTo = Math.min(field.Nx - 1, x0pos + 10);
    for (var xi = xFrom; xi <= xTo; xi++) {
      var idxT = xi * fNy + jTop, idxB = xi * fNy + jBot;
      s += Math.sqrt(re[idxT] * re[idxT] + im[idxT] * im[idxT]);
      s += Math.sqrt(re[idxB] * re[idxB] + im[idxB] * im[idxB]);
      cnt += 2;
    }
    return cnt > 0 ? s / cnt : 0;
  }

  // 창 [x0+20, x0+70]: 근접장(0~20셀)과 noise floor(x0+80~ 이후) 사이의 sweet spot
  // N=40 기준으로 검증됨 — N 부족 시 κ 오차 >20%가 되어 경고가 표시됨
  function computeFitInterval(amp, x0pos) {
    var xStart = x0pos + 20;
    var xEnd = Math.min(x0pos + 70, amp.length - 1);
    return { xStart: xStart, xEnd: xEnd, valid: (xEnd - xStart) >= 10 };
  }

  // N=∞ 표시용 — m이 클수록 희미해지는 영상 점 목록 (alpha 페이드아웃)
  function buildFadedImages() {
    var imgs = [], N_disp = 40;
    for (var m = 1; m <= N_disp; m++) {
      var sign = (m % 2 === 0) ? 1 : -1;
      var alpha = Math.max(0.05, 1 - m / (N_disp + 1));
      imgs.push({ x: x0Const, y: y0 + m * state.a, sign: sign, alpha: alpha });
      imgs.push({ x: x0Const, y: y0 - m * state.a, sign: sign, alpha: alpha });
    }
    return imgs;
  }

  function rebuildTable() {
    var k = 2 * Math.PI / state.lambda;
    var rMax = Math.hypot(Nx + x0Const, Ny + state.N * state.a) + 10;
    table = W.buildHankelTable(k, rMax);
  }

  function recomputeAll() {
    rebuildTable();
    incident = W.computeField(W.makeField(Nx, Ny), [{ x: x0Const, y: y0, sign: 1 }], table);
    if (state.modeInfinity) {
      total = W.computeModeField(Nx, Ny, y0, state.a, state.lambda, x0Const, 41);
      scattered = W.subtractComplex(W.makeField(Nx, Ny), total, incident);
      fadedImgs = buildFadedImages();
    } else {
      scattered = W.computeField(W.makeField(Nx, Ny),
        W.generateImages('A', state.N, x0Const, y0, state.a), table);
      total = W.addComplex(W.makeField(Nx, Ny), incident, scattered);
      fadedImgs = [];
    }
    afterFieldsSet();
  }

  function afterFieldsSet() {
    cachedAmp = W.centerlineAmplitude(total, y0);
    cachedMode = W.modeCoefficient(total, y0, state.a);
    var max = 1e-9;
    for (var i = 0; i < cachedAmp.length; i++) if (cachedAmp[i] > max) max = cachedAmp[i];
    scale = max * 0.55;

    var info = W.cutoffInfo(state.lambda, state.a);
    if (info.evanescent) {
      fitInterval = computeFitInterval(cachedMode, x0Const);
      measKappa = (fitInterval && fitInterval.valid)
        ? W.fitExponential(cachedMode, fitInterval.xStart, fitInterval.xEnd)
        : null;
    } else {
      fitInterval = null;
      measKappa = null;
    }

    var wallAvg = plateWallAvg(total, y0, state.a, x0Const);
    var wallNote = state.modeInfinity
      ? '도체판 위 |E| 평균: ' + wallAvg.toFixed(6) + '  (N=∞ → 이론값 0)'
      : '도체판 위 |E| 평균: ' + wallAvg.toFixed(4) + '  (N ↑ → 0에 수렴)';
    el('plateInfo').textContent = wallNote;

    W.updateOverlays(wraps, geom());
    syncLabels();
  }

  function syncLabels() {
    var lamMm = state.lambda * 2, aMm = state.a * 2;
    el('lambdaVal').textContent = lamMm + ' mm';
    el('aVal').textContent = aMm + ' mm  (2a = ' + (aMm * 2) + ' mm)';
    el('nVal').textContent = state.modeInfinity ? '∞ (모드 합)' : state.N + ' 쌍';

    var freqHz = 3e11 / lamMm;
    var freqStr = freqHz >= 1e9
      ? (freqHz / 1e9).toFixed(2) + ' GHz'
      : Math.round(freqHz / 1e6) + ' MHz';
    el('freqInfo').textContent = '자유공간 주파수 f = c/λ:  ' + freqStr;

    var info = W.cutoffInfo(state.lambda, state.a);
    el('cutoffBadge').textContent = info.evanescent
      ? '차단: λ > 2a → 지수 감쇠'
      : '전파: λ < 2a → 모드 진행';
    el('kappaInfo').textContent = info.evanescent
      ? '이론 κ = ' + (info.kappa / 2).toFixed(4) + ' /mm'
      : 'k_guide = ' + (info.kguide / 2).toFixed(4) + ' /mm';

    if (info.evanescent) {
      if (!fitInterval) {
        el('kappaCompare').textContent = '(구간 범위 밖 — λ 또는 a 조정 필요)';
        el('kappaCompare').style.color = '';
      } else if (!fitInterval.valid) {
        el('kappaCompare').textContent = '⚠ 구간 불충분 (< 10셀) — N 증가 권장';
        el('kappaCompare').style.color = '#f4a261';
      } else if (measKappa !== null) {
        var ratio = measKappa / info.kappa;
        var pct = (ratio * 100).toFixed(1);
        var measStr = (measKappa / 2).toFixed(4);
        el('kappaCompare').textContent = '측정 κ = ' + measStr + ' /mm  (' + pct + '%)';
        el('kappaCompare').style.color = (ratio >= 0.80 && ratio <= 1.20) ? '' : '#f4a261';
        if (ratio < 0.80 || ratio > 1.20)
          el('kappaCompare').textContent += '  ⚠ N 증가 권장';
      }
    } else {
      el('kappaCompare').textContent = '';
      el('kappaCompare').style.color = '';
    }
  }

  function render() {
    if (!state.paused) state.phase += state.dPhi;
    W.drawField(gInc, incident, scale, state.phase);
    W.drawField(gScat, scattered, scale, state.phase);
    W.drawField(gTot, total, scale, state.phase);
    var g = geom();
    if (state.modeInfinity) W.drawExternalMask(gTot, g);  // ③에만, N=∞일 때만
    W.drawPlates(gInc, g); W.drawPlates(gScat, g); W.drawPlates(gTot, g);
    var orig = { x: x0Const, y: y0 };
    var imgs = state.modeInfinity ? fadedImgs : W.generateImages('A', state.N, x0Const, y0, state.a);
    W.drawSourceDots(gInc, [], orig, g);
    W.drawSourceDots(gScat, imgs, null, g);
    W.drawSourceDots(gTot, imgs, orig, g);
    var info = W.cutoffInfo(state.lambda, state.a);
    W.drawGraph(gGraph, cachedMode, x0Const, info.evanescent ? info.kappa : null, g);
    requestAnimationFrame(render);
  }

  el('lambda').addEventListener('input', function (e) {
    state.lambda = +e.target.value / 2;  // mm → 셀
    recomputeAll();
  });
  el('aGap').addEventListener('input', function (e) {
    state.a = +e.target.value / 2;       // mm → 셀
    recomputeAll();
  });
  el('nImg').addEventListener('input', function (e) {
    state.N = +e.target.value; recomputeAll(); el('nImg').value = state.N;
  });
  el('modeInf').addEventListener('change', function (e) {
    state.modeInfinity = e.target.checked;
    el('nImg').disabled = state.modeInfinity;
    el('modeInfCaption').style.display = state.modeInfinity ? 'block' : 'none';
    recomputeAll();
  });
  el('speed').addEventListener('input', function (e) {
    state.dPhi = +e.target.value;
    el('speedVal').textContent = (+e.target.value).toFixed(2) + ' rad/f';
  });
  el('pauseBtn').addEventListener('click', function () {
    state.paused = !state.paused;
    el('pauseBtn').textContent = state.paused ? '▶ 재개' : '⏸ 일시정지';
  });

  recomputeAll();
  requestAnimationFrame(render);
})();
