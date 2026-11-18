/* 适配器回归测试：用 jsdom 搭一份「类超星」卷面，验证 解析 → 点击 → 输入 → 自检 全链路
   注意：这是结构级测试，真实页面选择器仍需在真题页用面板「诊断」校准。 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'content');

const HTML = `<!DOCTYPE html><html><body>
<div id="exam">
  <div class="questionLi">
    <h3 class="mark_name">(单选题, 5.0 分)</h3>
    <div class="Zy_TItle"><span>参与酮体氧化的酶是</span></div>
    <ul class="answerList">
      <li><span class="num_option">A</span><div class="answer_p">乙酰乙酰硫激酶</div></li>
      <li><span class="num_option">B</span><div class="answer_p">HMG-CoA还原酶</div></li>
      <li><span class="num_option">C</span><div class="answer_p">乙酰CoA羧化酶</div></li>
      <li><span class="num_option">D</span><div class="answer_p">HMG-CoA裂解酶</div></li>
      <li><span class="num_option">E</span><div class="answer_p">HMG-CoA合酶</div></li>
    </ul>
  </div>
  <div class="questionLi">
    <h3 class="mark_name">(判断题, 2.0 分)</h3>
    <div class="Zy_TItle"><span>酮体是肝内生成肝外利用</span></div>
    <ul class="answerList">
      <li><span class="num_option">A</span><div class="answer_p">正确</div></li>
      <li><span class="num_option">B</span><div class="answer_p">错误</div></li>
    </ul>
  </div>
  <div class="questionLi">
    <h3 class="mark_name">(简答题, 10.0 分)</h3>
    <div class="Zy_TItle"><span>简述酮体的生成与利用</span></div>
    <textarea class="answerText"></textarea>
  </div>
</div>
<script>
  document.addEventListener('click', (e) => {
    const li = e.target.closest ? e.target.closest('li') : null;
    if (!li) return;
    Array.from(li.parentElement.children).forEach((c) => c.classList.remove('cur'));
    li.classList.add('cur');
  }, true);
</script>
</body></html>`;

module.exports = async function run(assert) {
  let JSDOM;
  try {
    ({ JSDOM } = require('jsdom'));
  } catch (_) {
    assert(true, '跳过适配器测试（未安装 jsdom，执行 npm i 后再跑）');
    return;
  }

  const dom = new JSDOM(HTML, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://mooc1-api.chaoxing.com/exam-ans/mooc2/exam/preview' });
  const { window } = dom;
  const store = {};
  window.chrome = { storage: { local: { get: async (k) => (typeof k === 'string' ? { [k]: store[k] } : store), set: async (o) => Object.assign(store, o) } } };
  global.window = window;

  for (const f of ['util.js', 'normalize.js', 'typer.js', 'adapters/base.js', 'adapters/chaoxing.js']) {
    window.eval(fs.readFileSync(path.join(SRC, f), 'utf8'));
  }

  const CXP = window.CXP;
  const a = CXP.pickAdapter(window.location);
  assert(!!a && a.id === 'chaoxing', '适配器按域名命中 chaoxing');

  const qs = a.scan();
  assert(qs.length === 3, '解析出 3 道题', String(qs.length));
  assert(qs[0].type === 'single' && qs[0].options.length === 5, '单选题 5 个选项');
  assert(qs[1].type === 'judge', '判断题识别');
  assert(qs[2].type === 'essay', '简答题识别');
  assert(qs[1].options[0].text === '正确', '判断题选项文本去掉字母前缀', qs[1].options[0].text);

  const before = a.selfCheck();
  assert(before.unanswered.length === 3, '初始自检 3 题未作答', JSON.stringify(before));

  await a.applyAnswer(qs[0], { answer: 'A', type: 'single' });
  assert(a.isAnswered(qs[0]), '单选点击后 isAnswered 为真');

  await a.applyAnswer(qs[1], { answer: '正确', type: 'judge' });
  assert(a.isAnswered(qs[1]), '判断题「正确」映射到对应选项');

  await a.applyAnswer(qs[2], { answer: '酮体在肝线粒体由乙酰CoA生成，肝外组织氧化利用。', type: 'essay' });
  const ta = window.document.querySelector('textarea');
  assert(ta.value.length > 10, '简答题逐字键入写入 textarea', `len=${ta.value.length}`);

  const after = a.selfCheck();
  assert(after.unanswered.length === 0, '最终自检无漏题', JSON.stringify(after));

  // 翻屏能力：一屏一题 / 分页作业
  assert(a.advance() === false, '没有「下一题」时不乱翻页');
  let nextClicks = 0;
  let submitClicks = 0;
  const nextBtn = window.document.createElement('button');
  nextBtn.className = 'nextBtn';
  nextBtn.textContent = '下一题';
  nextBtn.addEventListener('click', () => nextClicks++);
  window.document.body.appendChild(nextBtn);

  const submitBtn = window.document.createElement('button');
  submitBtn.textContent = '交卷';
  submitBtn.addEventListener('click', () => submitClicks++);
  window.document.body.appendChild(submitBtn);

  assert(a.advance() === true, '存在「下一题」时返回 true');
  assert(nextClicks === 1, '「下一题」恰好被点击一次（不重复触发）', `clicked=${nextClicks}`);
  assert(submitClicks === 0, '翻页永远不会误点「交卷」', `submitClicks=${submitClicks}`);
};
