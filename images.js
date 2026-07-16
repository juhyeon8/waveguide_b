(function (global) {
  'use strict';

  function generateImages(geometry, N, x0, y0, a) {
    var imgs = [];
    for (var m = 1; m <= N; m++) {
      var sign = (m % 2 === 0) ? 1 : -1;       // (−1)^m
      imgs.push({ x: x0, y: y0 + m * a, sign: sign });
      imgs.push({ x: x0, y: y0 - m * a, sign: sign });
    }
    if (geometry === 'B') {
      // 끝벽(x=0) 미러: 원본 + 세로영상 전부를 x=−x0 로 반사, 부호 반전
      var mirrored = [{ x: -x0, y: y0, sign: -1 }];   // 원본의 미러
      for (var i = 0; i < imgs.length; i++) {
        mirrored.push({ x: -x0, y: imgs[i].y, sign: -imgs[i].sign });
      }
      imgs = imgs.concat(mirrored);
    }
    return imgs;
  }

  var API = { generateImages: generateImages };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else { global.WG = global.WG || {}; Object.assign(global.WG, API); }
})(typeof globalThis !== 'undefined' ? globalThis : this);
