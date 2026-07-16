'use strict';
const assert = require('assert');
const { generateImages } = require('../images.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log('  ok   - ' + name); pass++; }
  catch (e) { console.log('  FAIL - ' + name + '\n         ' + e.message); fail++; }
}

const X0 = 130, Y0 = 110, A = 64;

test('A: N쌍이면 2N개 영상', () => {
  assert.strictEqual(generateImages('A', 5, X0, Y0, A).length, 10);
});
test('A: 첫 영상쌍은 y0±a, 부호 −1 (첫 반사)', () => {
  const im = generateImages('A', 1, X0, Y0, A);
  const ys = im.map(o => o.y).sort((p, q) => p - q);
  assert.deepStrictEqual(ys, [Y0 - A, Y0 + A]);
  assert.ok(im.every(o => o.sign === -1), '첫 반사는 부호 반전');
  assert.ok(im.every(o => o.x === X0), 'A는 같은 x');
});
test('A: m=2 영상 부호 +1', () => {
  const im = generateImages('A', 2, X0, Y0, A);
  const m2 = im.filter(o => Math.abs(o.y - Y0) === 2 * A);
  assert.ok(m2.length === 2 && m2.every(o => o.sign === 1));
});
test('B: 원본 미러(−x0, y0, −1) 포함', () => {
  const im = generateImages('B', 3, X0, Y0, A);
  assert.ok(im.some(o => o.x === -X0 && o.y === Y0 && o.sign === -1));
});
test('B: x=0 에서 전체(원본+영상) 반대칭 → 미러가 항상 존재', () => {
  const im = generateImages('B', 4, X0, Y0, A);
  const all = [{ x: X0, y: Y0, sign: 1 }].concat(im);
  for (const s of all) {
    assert.ok(all.some(o => o.x === -s.x && o.y === s.y && o.sign === -s.sign),
      '미러 없음: ' + JSON.stringify(s));
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
