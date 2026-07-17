'use strict';
// UI 배선 테스트 — index.html 의 스크립트들을 최소 DOM/canvas 스텁 위에서 실제로 실행한다.
// 브라우저 없이 런타임 에러·이벤트 배선·슬라이더 동기화를 잡는다.
// (물리값 자체는 ysrc.test.js / presets.test.js 가 검증)
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   - ' + name); pass++; }
  catch (e) { console.log('  FAIL - ' + name + '\n         ' + e.message); fail++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ── index.html 에서 id·슬라이더 초기값·프리셋 버튼을 읽어온다 ──
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const initialValue = {};
for (const m of html.matchAll(/<input[^>]*id="([^"]+)"[^>]*>/g)) {
  const v = /value="([^"]*)"/.exec(m[0]);
  if (v) initialValue[m[1]] = v[1];
}

// ── DOM / canvas 스텁 ──
let drawCalls = 0;
function makeCtx() {
  const target = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => { drawCalls++; },
    measureText: () => ({ width: 10 }),
    canvas: { width: 520, height: 220 }
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => { drawCalls++; }),
    set: () => true
  });
}
const listeners = {};
function makeEl(id) {
  const el = {
    id, style: {}, textContent: '', innerHTML: '', className: '',
    value: initialValue[id], checked: false, disabled: false, width: 0, height: 0,
    getContext: () => makeCtx(),
    addEventListener: (ev, fn) => { (listeners[id] = listeners[id] || {})[ev] = fn; },
    appendChild: () => {}, removeChild: () => {},
    getElementsByClassName: () => []
  };
  el.parentNode = { getElementsByClassName: () => [], appendChild: () => {}, removeChild: () => {} };
  return el;
}
const elCache = {};
const byClass = { preset: [] };
for (const m of html.matchAll(/<button class="preset"[^>]*data-preset="(\d)"[^>]*>([\s\S]*?)<\/button>/g)) {
  const b = makeEl('preset' + m[1]);
  b.className = 'preset';
  b.getAttribute = k => (k === 'data-preset' ? m[1] : null);
  b._label = m[2].replace(/<br>/g, ' ').trim();
  b.addEventListener = (ev, fn) => { b['_' + ev] = fn; };
  byClass.preset.push(b);
}
const document = {
  getElementsByClassName: c => byClass[c] || [],
  getElementById: id => {
    if (!ids.includes(id)) throw new Error('index.html 에 없는 id 참조: ' + id);
    return elCache[id] || (elCache[id] = makeEl(id));
  },
  createElement: () => makeEl('_new')
};
let frames = 0;
const fakeGlobal = {};
const rafStub = fn => { if (frames++ < 3) fn(); };

// ── index.html 이 로드하는 순서 그대로 ──
const SCRIPTS = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);

// vm.runInContext 는 이 워크로드에서 20~35배 느리다(전역 프록시). new Function 은 메인 컨텍스트에
// 컴파일되어 전속력이고, 그 안에선 module 이 정의되지 않아 각 파일이 브라우저와 같은
// global.WG 분기를 탄다 — 더 빠르면서 더 충실하다.
function loadScript(file) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  new Function('globalThis', 'window', 'document', 'requestAnimationFrame', src)
    (fakeGlobal, fakeGlobal, document, rafStub);
}

test('index.html 의 <script> 6개를 순서대로 로드 (문법·초기화 에러 없음)', () => {
  assert(SCRIPTS.length === 6, '스크립트 ' + SCRIPTS.length + '개 (6개 예상): ' + SCRIPTS);
  SCRIPTS.forEach(loadScript);
  assert(fakeGlobal.WG && typeof fakeGlobal.WG.computeField === 'function',
         '브라우저 분기(global.WG)가 채워지지 않음');
});

test('초기 렌더가 실제로 캔버스에 그린다', () => {
  assert(drawCalls > 0, 'draw 호출 0회');
  assert(frames > 0, 'requestAnimationFrame 미호출');
});

test('main.js 가 찾는 id 가 모두 index.html 에 있다', () => {
  const want = [...fs.readFileSync(path.join(DIR, 'main.js'), 'utf8').matchAll(/el\('([^']+)'\)/g)]
    .map(m => m[1]);
  const missing = [...new Set(want)].filter(id => !ids.includes(id));
  assert(missing.length === 0, '없는 id: ' + missing.join(', '));
});

test('모든 정보 라벨이 채워진다 (빈 문자열 없음)', () => {
  for (const id of ['lambdaVal', 'aVal', 'ySrcVal', 'nVal', 'cutoffBadge', 'freqInfo', 'plateInfo'])
    assert(elCache[id] && elCache[id].textContent.length > 0, id + ' 이 비어 있음');
  assert(elCache['modeDiag'].innerHTML.indexOf('mode 1') >= 0, 'modeDiag 에 mode 1 없음');
  assert(elCache['modeDiag'].innerHTML.indexOf('mode 3') >= 0, 'modeDiag 에 mode 3 없음');
});

function fire(id, value, ev) {
  const fn = listeners[id] && listeners[id][ev || 'input'];
  if (!fn) throw new Error(id + ' 에 ' + (ev || 'input') + ' 리스너가 없음');
  fn({ target: { value: value, checked: value } });
}

test('λ·a·N·y₀ 슬라이더 input 이 에러 없이 처리된다', () => {
  fire('aGap', '100'); fire('lambda', '80'); fire('nImg', '40'); fire('ySrc', '0.25');
  assert(/8\.0 cm/.test(elCache['lambdaVal'].textContent), 'λ 라벨: ' + elCache['lambdaVal'].textContent);
  assert(/λ\/a=0\.80/.test(elCache['lambdaVal'].textContent), 'λ/a 비율 미표시');
  assert(/y₀\/a=0\.250/.test(elCache['ySrcVal'].textContent), 'y₀ 라벨: ' + elCache['ySrcVal'].textContent);
});

test('소스가 중앙이 아니면 mode2 가 여기된다 (h=a/4 → 결합 1.000)', () => {
  const h = elCache['modeDiag'].innerHTML;
  assert(/mode 2<\/b> · 결합 1\.000/.test(h), 'mode2 결합이 1.000 이 아님:\n' + h);
});

test('벽 사이 중앙으로 버튼 → y₀/a=0.5, mode2 가 마디로 죽는다', () => {
  listeners['centerBtn']['click']();
  assert(/y₀\/a=0\.500/.test(elCache['ySrcVal'].textContent), elCache['ySrcVal'].textContent);
  assert(elCache['ySrc'].value === 0.5, '슬라이더 위치 미동기화: ' + elCache['ySrc'].value);
  assert(/mode 2<\/b> · 결합 0\.000 — 여기되지 않음/.test(elCache['modeDiag'].innerHTML),
         'mode2 가 마디로 죽지 않음');
});

test('N=∞ 모드합 토글 on/off', () => {
  fire('modeInf', true, 'change');
  assert(/∞/.test(elCache['nVal'].textContent), 'nVal: ' + elCache['nVal'].textContent);
  assert(elCache['nImg'].disabled === true, 'N=∞ 인데 N 슬라이더가 안 잠김');
  fire('modeInf', false, 'change');
  assert(elCache['nImg'].disabled === false, 'N=∞ 해제인데 N 슬라이더가 잠긴 채');
});

test('hRatio 방식: a 를 바꿔도 소스가 벽 안 같은 상대위치에 머문다', () => {
  fire('ySrc', '0.95');
  for (const a of ['160', '48', '160']) {
    fire('aGap', a);
    assert(/y₀\/a=0\.950/.test(elCache['ySrcVal'].textContent),
           'a=' + a + ' 에서 비율이 틀어짐: ' + elCache['ySrcVal'].textContent);
  }
});

test('프리셋 버튼 4개가 존재하고 클릭 시 슬라이더 4개가 모두 동기화된다', () => {
  assert(byClass.preset.length === 4, '프리셋 버튼 ' + byClass.preset.length + '개 (4개 예상)');
  const src = fs.readFileSync(path.join(DIR, 'main.js'), 'utf8');
  const PRESETS = eval(/var PRESETS = (\[[\s\S]*?\n  \]);/.exec(src)[1]);
  byClass.preset.forEach((btn, i) => {
    btn._click();
    const p = PRESETS[i];
    const wantLam = Math.round(p.lamOverA * p.aCell);
    const wantHr = Math.round(p.yOverA * 1000) / 1000;
    assert(+elCache['lambda'].value === wantLam, p.label + ' λ 슬라이더 ' + elCache['lambda'].value + ' ≠ ' + wantLam);
    assert(+elCache['aGap'].value === p.aCell, p.label + ' a 슬라이더 ' + elCache['aGap'].value + ' ≠ ' + p.aCell);
    assert(+elCache['ySrc'].value === wantHr, p.label + ' y₀ 슬라이더 ' + elCache['ySrc'].value + ' ≠ ' + wantHr);
    assert(+elCache['nImg'].value === p.N, p.label + ' N 슬라이더 ' + elCache['nImg'].value + ' ≠ ' + p.N);
    assert(elCache['modeInf'].checked === false, p.label + ' 적용 후 N=∞ 가 켜져 있음');
  });
});

test('프리셋 클릭 시 그 버튼만 active 표시', () => {
  byClass.preset.forEach(btn => {
    btn._click();
    const active = byClass.preset.filter(b => b.className.indexOf('active') >= 0);
    assert(active.length === 1 && active[0] === btn,
           btn._label + ' 클릭인데 active = ' + active.map(b => b._label).join(','));
  });
});

test('① 완전차단 프리셋에서 mode1 κ 경고가 뜨지 않는다', () => {
  byClass.preset[0]._click();
  const line = /<div class="mode-diag m1[^"]*"><b>mode 1<\/b>([^<]*)</.exec(elCache['modeDiag'].innerHTML);
  assert(line, 'mode1 진단 줄을 못 찾음');
  assert(line[1].indexOf('⚠') < 0, 'κ 경고 발생: ' + line[1].trim());
  assert(/차단 κ: 측정/.test(line[1]), '차단 κ 측정이 표시되지 않음: ' + line[1].trim());
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
