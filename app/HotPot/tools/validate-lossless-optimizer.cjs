'use strict';
const assert = require('assert');
const {compactShader} = require('./optimize-wechat-lossless.cjs');
const macro = '#define INC(x) ' + '\\' + '\n (x + 1)';
const cases = [
  '#define FOO (x)\nvec4 main () { return vec4 (1.0); }',
  macro + '\nvoid main () {}',
  'float f = a + +b;',
  '// comment\nvoid main () { }',
  'float x = 0xFFu;\nfloat y = 1.e-3;',
  '#if A\n#if B\nvoid main () {}\n#endif\n#endif',
  'int line = __LINE__;\nvoid main () {}',
];
for (const source of cases) {
  const result = compactShader(source);
  assert.strictEqual(compactShader(result), result, 'Formatting must be idempotent');
  if (source.includes(macro)) assert(result.includes(macro), 'Macro continuation must remain adjacent');
  const directives = source.split('\n').filter(line => line.trimStart().startsWith('#'));
  assert.deepStrictEqual(result.split('\n').filter(line => line.trimStart().startsWith('#')), directives);
}
console.log('Shader formatting: macro lines/continuations, unary operators, comments, literals and idempotency: OK');
