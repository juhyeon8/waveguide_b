'use strict';
const assert = require('assert');
const { colorForValue, centerlineAmplitude, modeCoefficient } = require('../render.js');
const { makeField } = require('../field.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   - ' + name); pass++; }
  catch (e) { console.log('  FAIL - ' + name + '\n         ' + e.message); fail++; }
}

test('colorForValue: +포화=빨강, −포화=파랑, 0=흰색', () => {
  assert.deepStrictEqual(colorForValue(1, 1), { r: 255, g: 0, b: 0 });
  assert.deepStrictEqual(colorForValue(-1, 1), { r: 0, g: 0, b: 255 });
  assert.deepStrictEqual(colorForValue(0, 1), { r: 255, g: 255, b: 255 });
});
test('colorForValue: scale 초과는 포화 클램프', () => {
  assert.deepStrictEqual(colorForValue(5, 1), { r: 255, g: 0, b: 0 });
});
test('centerlineAmplitude: |E| = hypot(re,im)', () => {
  const f = makeField(4, 3);           // Nx=4, Ny=3
  // i=2, j=1 에 (re=3, im=4) 넣으면 |E|=5
  f.re[2 * 3 + 1] = 3; f.im[2 * 3 + 1] = 4;
  const amp = centerlineAmplitude(f, 1);
  assert.strictEqual(amp.length, 4);
  assert.ok(Math.abs(amp[2] - 5) < 1e-9, '|E|@i=2 = 5');
  assert.ok(Math.abs(amp[0]) < 1e-9, '빈 칸 0');
});

test('modeCoefficient: 순수 n=1 모드에서 진폭 균일', () => {
  const Nx = 6, Ny = 20, y0 = 10, a = 8;
  const f = makeField(Nx, Ny);
  const jBot = Math.round(y0 - a / 2), jTop = Math.round(y0 + a / 2);
  const span = jTop - jBot;
  for (let i = 0; i < Nx; i++) {
    for (let j = jBot; j <= jTop; j++) {
      f.re[i * Ny + j] = Math.sin(Math.PI * (j - jBot) / span);
    }
  }
  const result = modeCoefficient(f, y0, a);
  assert.strictEqual(result.length, Nx);
  assert.ok(result[0] > 0, '양수 진폭');
  for (let i = 1; i < Nx; i++) {
    assert.ok(Math.abs(result[i] - result[0]) < 1e-6, 'x=' + i + '에서 균일');
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
