/* 题库匹配 / 去水印 / 极性 回归测试：不依赖 DOM，直接跑 normalize + bank */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'content');

function loadModules() {
  const store = {};
  global.window = global;
  global.chrome = {
    storage: {
      local: {
        get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : store),
        set: async (o) => Object.assign(store, o),
      },
    },
  };
  for (const f of ['util.js', 'normalize.js', 'bank.js']) {
    // eslint-disable-next-line no-eval
    (0, eval)(fs.readFileSync(path.join(SRC, f), 'utf8'));
  }
  return window.CXP;
}

module.exports = async function run(assert) {
  const CXP = loadModules();
  const { norm, bank } = CXP;

  const dirty = '姓名：钟无咎 学号：2544010105 参与酮体氧化的酶是 钟无咎 2544010105 钟无咎 2544010105 钟无咎 2544010105 得分：5.0';
  assert(norm.stripWatermark(dirty) === '参与酮体氧化的酶是', '水印应被完全清除（含重复姓名与学号）', norm.stripWatermark(dirty));
  assert(norm.normalize('１分子软脂酸彻底氧化净生成多少分子ＡＴＰ') === '1分子软脂酸彻底氧化净生成多少分子atp', '全角应转半角并小写');

  assert(norm.guessType('(单选题, 5.0 分)', 5, '') === 'single', '单选题识别');
  assert(norm.guessType('(判断题, 2.0 分)', 2, '') === 'judge', '判断题识别');
  assert(norm.guessType('(简答题, 10.0 分)', 0, '') === 'essay', '简答题识别');

  assert(JSON.stringify(norm.lettersOf('a, c')) === '["A","C"]', '字母解析（小写+分隔符）');
  assert(norm.toJudge('√') === true && norm.toJudge('错') === false, '判断题答案归一');

  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sample-bank.json'), 'utf8'));
  const imported = await bank.upsertMany(rows);
  assert(imported.total === rows.length, `题库导入 ${rows.length} 条`, JSON.stringify(imported));

  const cases = [
    ['参与酮体氧化的酶是', 'A'],
    ['参与酮体氧化的酶是 姓名 钟无咎 学号 2544010105 钟无咎 2544010105', 'A'],
    ['１分子软脂酸彻底氧化净生成多少分子ＡＴＰ', 'D'],
    ['LDL 受体最丰富的器官是', 'D'],
    ['不被载脂蛋白激活的酶有', null],
  ];
  for (const [stem, expect] of cases) {
    const hit = await bank.lookup(stem, { threshold: 0.82, type: 'single' });
    const got = hit ? hit.answer : null;
    assert(got === expect, `匹配「${stem.slice(0, 20)}」→ ${got}（期望 ${expect}）`);
  }
};
