/**
 * 契约回归测试：`npm run test:contract`
 *
 * 覆盖三件事：
 *   1. 干净数据能通过（schema 与类型一致）
 *   2. 脏数据能被修复而不是炸掉（模型输出必然不干净）
 *   3. 修复结果仍然满足 schema（否则后端以为合规、前端却渲染不出）
 *
 * 改完 prompt/system-prompt.md 或 schema 后建议跑一遍。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import Ajv from 'ajv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const outfile = path.join(root, '.cache/contract-entry.cjs');
await esbuild.build({
  entryPoints: [path.join(root, 'test/entry.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile,
  logLevel: 'warning',
});

const { normalizeDrawingDoc, sampleDrawing } = require(outfile);

let pass = 0;
let fail = 0;
const check = (cond, name, extra) => {
  if (cond) {
    pass += 1;
    console.log(`  PASS ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${extra === undefined ? '' : ` (实际: ${extra})`}`);
  }
};

console.log('\n[1] 干净输入');
let result = normalizeDrawingDoc(JSON.parse(JSON.stringify(sampleDrawing)));
check(result.doc !== null, 'doc 非空');
check(result.doc?.steps.length === 7, '步骤数 = 7', result.doc?.steps.length);
check(!result.issues.some((i) => i.level === 'error'), '无 error 级问题');

console.log('\n[2] 脏输入（围栏 / 缺 id / 重复 id / 超界 / 非法 r / 零长线 / 未知 kind）');
const dirty =
  '模型说：好的，结果如下\n```json\n' +
  JSON.stringify({
    meta: { title: '测试件', width: 920, height: 660, confidence: 3 },
    steps: [
      {
        id: 's1',
        title: '  ',
        primitives: [
          { kind: 'line', lineType: '粗实线', x1: -500, y1: 300, x2: 5000, y2: 300 },
          { kind: 'line', lineType: 'thick', x1: 100, y1: 100, x2: 100, y2: 100 },
          { kind: 'circle', lineType: 'thick', cx: 460, cy: 330, r: -5 },
          { kind: 'circle', lineType: 'thick', cx: 460, cy: 330, r: 80 },
          { kind: 'spline', d: 'M0 0L9 9' },
        ],
      },
      {
        id: 's1',
        title: '重复步骤 id',
        primitives: [
          { id: 'x', kind: 'circle', lineType: 'center', cx: 460, cy: 330, r: 100 },
          { id: 'x', kind: 'arc', lineType: 'thick', cx: 460, cy: 330, r: 60, startAngle: 90 },
          { id: 'y', kind: 'dimension', from: { x: '380', y: 330 }, to: { x: 540, y: 330 }, offset: 0 },
        ],
      },
      { id: 's3', title: '空步骤', primitives: [] },
    ],
  }) +
  '\n```';

result = normalizeDrawingDoc(dirty);
const doc = result.doc;
check(doc !== null, '仍能产出 doc');
check(doc?.steps.length === 2, '空步骤被跳过 → 2 步', doc?.steps.length);
check(doc?.steps[0].title === '第 1 步', '空白 title 补默认值', doc?.steps[0].title);
check(doc?.steps[0].primitives.length === 2, '非法图元被丢弃后剩 2 个', doc?.steps[0].primitives.length);
check(doc?.steps[0].primitives[0].lineType === 'thick', '中文线型归一化', doc?.steps[0].primitives[0].lineType);
check(doc?.steps[0].primitives[0].x1 === 40, '超界坐标夹到安全区', doc?.steps[0].primitives[0].x1);
check(doc?.meta.confidence === 1, 'confidence 夹到 [0,1]', doc?.meta.confidence);
const ids = [];
doc?.steps.forEach((s) => s.primitives.forEach((p) => ids.push(p.id)));
check(new Set(ids).size === ids.length, 'id 全局唯一', ids.join(','));
check(result.issues.some((i) => i.message.includes('未知图元')), '记录未知 kind');
check(result.issues.some((i) => i.fixed), '记录自动修复项');

console.log('\n[3] 异常输入');
check(normalizeDrawingDoc('完全不是 JSON').doc === null, '纯文本 → null');
check(normalizeDrawingDoc({ steps: [] }).doc === null, '空 steps → null');
check(normalizeDrawingDoc(null).doc === null, 'null → null');

console.log('\n[4] JSON Schema');
const ajv = new Ajv({ strict: false });
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schema/drawing-doc.schema.json'), 'utf8'));
const validate = ajv.compile(schema);
check(validate(sampleDrawing) === true, '示例数据符合 schema', JSON.stringify(validate.errors?.[0]));
const badDoc = {
  version: '1.0',
  meta: { title: 'x', width: 920, height: 660 },
  steps: [{ id: 's', title: 't', primitives: [{ id: 'a', kind: 'circle', cx: 1, cy: 1, r: 0 }] }],
};
check(validate(badDoc) === false, 'r=0 的圆被 schema 拒绝');

console.log('\n[5] 清洗后仍满足 schema');
check(validate(doc) === true, '脏数据清洗后可通过 schema', JSON.stringify(validate.errors?.[0]));

console.log(`\n结果：${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
