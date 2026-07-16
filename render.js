(function (global) {
  'use strict';

  function colorForValue(v, scale) {
    var t = v / scale;
    if (t > 1) t = 1; else if (t < -1) t = -1;
    if (t >= 0) {
      var c = Math.round(255 * (1 - t));
      return { r: 255, g: c, b: c };       // 흰→빨강
    }
    var d = Math.round(255 * (1 + t));
    return { r: d, g: d, b: 255 };          // 흰→파랑
  }

  function centerlineAmplitude(field, j) {
    var Nx = field.Nx, Ny = field.Ny, re = field.re, im = field.im;
    var out = new Float32Array(Nx);
    for (var i = 0; i < Nx; i++) {
      var idx = i * Ny + j;
      out[i] = Math.sqrt(re[idx] * re[idx] + im[idx] * im[idx]);
    }
    return out;
  }

  // n=1 도파관 모드 계수: E(x,j)를 sin(π(j−jBot)/span)에 투영
  // 차단 시 |c1(x)| ∝ exp(−κx), 전파 시 ≈ 상수
  function modeCoefficient(field, y0, a) {
    var Nx = field.Nx, Ny = field.Ny, re = field.re, im = field.im;
    var jBot = Math.round(y0 - a / 2);
    var jTop = Math.round(y0 + a / 2);
    var span = jTop - jBot;
    if (span < 1) return new Float32Array(Nx);
    var out = new Float32Array(Nx);
    for (var i = 0; i < Nx; i++) {
      var sumRe = 0, sumIm = 0;
      for (var j = jBot; j <= jTop; j++) {
        var w = Math.sin(Math.PI * (j - jBot) / span);
        var idx = i * Ny + j;
        sumRe += re[idx] * w;
        sumIm += im[idx] * w;
      }
      out[i] = Math.sqrt(sumRe * sumRe + sumIm * sumIm) / span;
    }
    return out;
  }

  // 복소장 → 캔버스: 인스턴스값 = re·cosφ + im·sinφ (외향파 규약: φ 증가시 파면이 바깥으로)
  // j 뒤집기: 화면 y는 위로 증가하도록 (j=0이 화면 아래)
  function drawField(ctx, field, scale, phase) {
    var Nx = field.Nx, Ny = field.Ny, re = field.re, im = field.im;
    var img = ctx.createImageData(Nx, Ny);
    var d = img.data, c = Math.cos(phase), s = Math.sin(phase);
    for (var i = 0; i < Nx; i++) {
      for (var j = 0; j < Ny; j++) {
        var idx = i * Ny + j;
        var v = re[idx] * c + im[idx] * s;
        var col = colorForValue(v, scale);
        var p = ((Ny - 1 - j) * Nx + i) * 4;   // j 뒤집기
        d[p] = col.r; d[p + 1] = col.g; d[p + 2] = col.b; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function drawPlates(ctx, geom) {
    var Nx = geom.Nx, Ny = geom.Ny, y0 = geom.y0, a = geom.a;
    var yTop = Ny - 1 - (y0 + a / 2);   // 캔버스 y (위=0)
    var yBot = Ny - 1 - (y0 - a / 2);

    // 도파관 내부 옅은 밴드
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, yTop, Nx, yBot - yTop);

    // 도체판 선
    ctx.strokeStyle = '#9aa6d8'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yTop); ctx.lineTo(Nx, yTop);
    ctx.moveTo(0, yBot); ctx.lineTo(Nx, yBot);
    ctx.stroke();

    // 가로 눈금 (캔버스 하단 — 위 패널과 같은 x 위치 표시)
    var mmPerCell = geom.mmPerCell || 2;
    var cellsPerTick = 50;   // 100 mm 간격
    var markY1 = Ny - 13, markY2 = Ny - 5;
    ctx.strokeStyle = '#3a4270'; ctx.lineWidth = 1;
    for (var cx = 0; cx < Nx; cx += cellsPerTick) {
      ctx.beginPath(); ctx.moveTo(cx, markY1); ctx.lineTo(cx, markY2); ctx.stroke();
    }
  }

  function drawSourceDots(ctx, sources, original, geom) {
    var Ny = geom.Ny;
    function dot(x, y, fill, alpha) {
      if (x < 0 || x >= geom.Nx) return;
      var cy = Ny - 1 - y;
      ctx.globalAlpha = (alpha !== undefined) ? alpha : 1;
      ctx.beginPath(); ctx.arc(x, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (var i = 0; i < sources.length; i++) {
      dot(sources[i].x, sources[i].y,
          sources[i].sign > 0 ? '#ff6b6b' : '#5b9bff',
          sources[i].alpha);
    }
    if (original) dot(original.x, original.y, '#ffd479');
  }

  // modeArr: Float32Array of |c1(x)|,  x0pos: 소스 x위치 (= 정규화 기준)
  // kappaThy: 이론 κ(셀⁻¹) | null,  geom: {Nx, mmPerCell, ...}
  // 가로축은 ①②③ 패널과 동일한 픽셀 매핑 (x셀 = x픽셀)
  function drawGraph(ctx, modeArr, x0pos, kappaThy, geom) {
    var W = geom.Nx, H = 120;
    ctx.clearRect(0, 0, W, H);
    if (!modeArr) return;

    // 정규화 기준: x0pos 이후 최댓값
    var baseline = 1e-9;
    for (var bx = x0pos; bx < modeArr.length; bx++) {
      if (modeArr[bx] > baseline) baseline = modeArr[bx];
    }
    if (baseline < 1e-10) return;

    // y 매핑 (하단 16px을 눈금용으로 확보)
    function toY(v) {
      var c = v < 0 ? 0 : v > 1.1 ? 1.1 : v;
      return (H - 18) - c / 1.1 * (H - 30);
    }

    // x0 위치 수직 점선 마커
    ctx.strokeStyle = 'rgba(255,212,121,0.30)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(x0pos, 2); ctx.lineTo(x0pos, H - 18);
    ctx.stroke(); ctx.setLineDash([]);

    // 이론 곡선 (점선, 차단 모드에서만)
    if (kappaThy) {
      var normAtRef = modeArr[x0pos] / baseline;
      ctx.strokeStyle = '#ffd479'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var t = x0pos; t < W; t++) {
        var tv = normAtRef * Math.exp(-kappaThy * (t - x0pos));
        if (t === x0pos) ctx.moveTo(t, toY(tv));
        else ctx.lineTo(t, toY(tv));
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // 측정 곡선 (실선)
    ctx.strokeStyle = '#7fd6ff'; ctx.lineWidth = 1.8; ctx.beginPath();
    var first = true;
    for (var m = x0pos; m < W; m++) {
      var mv = modeArr[m] / baseline;
      if (first) { ctx.moveTo(m, toY(mv)); first = false; }
      else ctx.lineTo(m, toY(mv));
    }
    ctx.stroke();

    // 가로 눈금 (①②③ 패널과 동일 x 위치)
    var mmPerCell = geom.mmPerCell || 2;
    var cellsPerTick = 50;
    var markY1 = H - 13, markY2 = H - 5;
    ctx.strokeStyle = '#3a4270'; ctx.lineWidth = 1;
    for (var cx = 0; cx < W; cx += cellsPerTick) {
      ctx.beginPath(); ctx.moveTo(cx, markY1); ctx.lineTo(cx, markY2); ctx.stroke();
    }
  }

  // N=∞ 모드 전용: ③ 전체장에서 도파관 외부를 "계산 영역 밖"으로 마스킹
  // 모드 합은 내부 전용 함수이므로 외부를 계산하지 않음을 시각적으로 명시
  function drawExternalMask(ctx, geom) {
    var Nx = geom.Nx, Ny = geom.Ny, y0 = geom.y0, a = geom.a;
    var yTop = Ny - 1 - (y0 + a / 2);   // 캔버스 y — 위 도체판
    var yBot = Ny - 1 - (y0 - a / 2);   // 캔버스 y — 아래 도체판

    ctx.fillStyle = 'rgba(20,24,40,0.72)';
    if (yTop > 0) ctx.fillRect(0, 0, Nx, yTop);
    if (yBot < Ny) ctx.fillRect(0, yBot, Nx, Ny - yBot);

    ctx.save();
    ctx.fillStyle = 'rgba(160,170,210,0.75)';
    ctx.font = '11px "Segoe UI","Malgun Gothic",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (yTop > 14) ctx.fillText('계산 영역 밖', Nx / 2, yTop / 2);
    if (Ny - yBot > 14) ctx.fillText('계산 영역 밖', Nx / 2, yBot + (Ny - yBot) / 2);
    ctx.restore();
  }

  // wrappers: { inc, scat, tot, graph } — .cv-wrap 요소들
  // 도체판·mm 라벨을 HTML span으로 관리 (캔버스 CSS 스케일에 무관하게 선명)
  function updateOverlays(wrappers, geom) {
    var Nx = geom.Nx, Ny = geom.Ny, y0 = geom.y0, a = geom.a;
    var mmPerCell = geom.mmPerCell || 2;
    var cellsPerTick = 50;

    function clear(w) {
      var els = w.getElementsByClassName('cv-label');
      while (els.length) els[0].parentNode.removeChild(els[0]);
    }

    function mkSpan(w, text, leftPct, topPct, center, color) {
      var s = document.createElement('span');
      s.className = 'cv-label' + (center ? ' cv-label-center' : '');
      s.style.left = leftPct.toFixed(2) + '%';
      s.style.top = topPct.toFixed(2) + '%';
      s.style.color = color;
      s.textContent = text;
      w.appendChild(s);
    }

    var yTop = Ny - 1 - (y0 + a / 2);
    var yBot = Ny - 1 - (y0 - a / 2);
    var markY = Ny - 13;

    [wrappers.inc, wrappers.scat, wrappers.tot].forEach(function (w) {
      clear(w);
      mkSpan(w, '도체판', 4 / Nx * 100, (yTop - 13) / Ny * 100, false, '#9aa6d8');
      mkSpan(w, '도체판', 4 / Nx * 100, (yBot + 2) / Ny * 100, false, '#9aa6d8');
      mkSpan(w, 'mm', 4 / Nx * 100, (markY - 12) / Ny * 100, false, '#6a74a0');
      for (var cx = cellsPerTick; cx < Nx; cx += cellsPerTick) {
        var mm = cx * mmPerCell;
        if (mm % 200 === 0)
          mkSpan(w, mm + '', cx / Nx * 100, (markY - 12) / Ny * 100, true, '#6a74a0');
      }
    });

    var Hg = 120, markYg = Hg - 13;
    clear(wrappers.graph);
    mkSpan(wrappers.graph, 'mm', 4 / Nx * 100, (markYg - 12) / Hg * 100, false, '#6a74a0');
    for (var gx = cellsPerTick; gx < Nx; gx += cellsPerTick) {
      var gmm = gx * mmPerCell;
      if (gmm % 200 === 0)
        mkSpan(wrappers.graph, gmm + '', gx / Nx * 100, (markYg - 12) / Hg * 100, true, '#6a74a0');
    }
  }

  var API = { colorForValue: colorForValue, centerlineAmplitude: centerlineAmplitude,
              modeCoefficient: modeCoefficient,
              drawField: drawField, drawPlates: drawPlates,
              drawSourceDots: drawSourceDots, drawGraph: drawGraph,
              drawExternalMask: drawExternalMask,
              updateOverlays: updateOverlays };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { global.WG = global.WG || {}; Object.assign(global.WG, API); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
