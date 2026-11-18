# 页面校准：把选择器对准你的学习通版本

学习通改版是**唯一**会让插件失灵的东西。校准步骤 3 分钟。

## 1. 打开卷面，按 F12 → Console，粘贴以下代码

```js
(() => {
  const cands = ['.questionLi', '.TiMu', '.questionItem', '.ans-question', '.exam-question', '.mark_item', '[data-questionid]'];
  console.log('%c== 1. 容器候选 ==', 'color:#4c8bf5;font-weight:700');
  for (const s of cands) {
    const n = document.querySelectorAll(s).length;
    if (n) console.log(`  ${s}  →  ${n} 个`);
  }
  const box = cands.map((s) => [s, document.querySelectorAll(s)]).filter(([, l]) => l.length).sort((a, b) => b[1].length)[0];
  if (!box) return console.warn('没找到任何容器：题目可能在跨域 iframe 里，先确认当前 frame');

  const q = box[1][0];
  console.log('%c== 2. 第一题的内部结构 ==', 'color:#4c8bf5;font-weight:700');
  console.log(q.outerHTML.slice(0, 1500));

  console.log('%c== 3. 选项候选 ==', 'color:#4c8bf5;font-weight:700');
  for (const s of ['.answerList li', '.mark_letter li', '.optionList li', '.option-item', 'li']) {
    const n = q.querySelectorAll(s).length;
    if (n) console.log(`  ${s}  →  ${n} 个`, Array.from(q.querySelectorAll(s)).slice(0, 6).map((e) => e.innerText.replace(/\s+/g, ' ').slice(0, 24)));
  }

  console.log('%c== 4. 题干候选 ==', 'color:#4c8bf5;font-weight:700');
  for (const s of ['.Zy_TItle', '.qtContent', '.question-title', '.stem', '.title', '.colorDeep', '.fontLabel', 'h3']) {
    const n = q.querySelectorAll(s).length;
    if (n) console.log(`  ${s}  →  ${n} 个`, q.querySelector(s).innerText.replace(/\s+/g, ' ').slice(0, 60));
  }

  console.log('%c== 5. 作答输入框 ==', 'color:#4c8bf5;font-weight:700');
  for (const s of ['textarea', 'input[type=text]', '.answerText', '[contenteditable=true]']) {
    const n = q.querySelectorAll(s).length;
    if (n) console.log(`  ${s}  →  ${n} 个`);
  }

  console.log('%c== 6. 点一个选项，看选中态加在哪 ==', 'color:#c9a227;font-weight:700');
  console.log('在页面上手动点一个选项，然后执行 window.__lastClick 查看变化；或直接看 devtools Elements 里 li 的 class');
})();
```

## 2. 对照输出改 `src/content/adapters/chaoxing.js`

文件顶部就是这张表，改完保存，扩展会自动重新加载：

```js
const SEL = {
  question: ['.questionLi', ...],   // ← 第 1 步命中的那个选择器放最前面
  type: ['.mark_name', ...],        // ← 题型文字（含「单选题/多选题」）
  stem: ['.Zy_TItle', ...],         // ← 第 4 步命中的那个
  options: ['.answerList li', ...], // ← 第 3 步命中的那个
  answerInput: ['textarea', ...],   // ← 第 5 步
};
```

## 3. 回卷面点面板「诊断」

```
容器 .questionLi × 20，解析题目 20，题型 {"single":20}
```

数字和卷面题量一致 = 校准完成。差一两个通常是有一道题的 `li` 结构不同，看第 2 步的 `outerHTML` 单独加个选择器。

## 常见坑

| 现象 | 原因 | 处理 |
|---|---|---|
| 解析题目 0 | 题目在 iframe 里 | 确认 `manifest.json` 的 `matches` 覆盖了该 iframe 域名；console 左上角切换 frame 再跑探针 |
| 选项 0 个，题干一长串 | 选项不是 `li` | 把命中的选择器加进 `SEL.options` |
| 点了没反应 | 组件只监听 `pointerdown`，或选中态不是 class | `chosen()` 里补上你的站点用的类名（如 `curr`、`is-checked`） |
| 已作答被判成未作答 | 同上 | 同上 |
| 判断题总选错 | 选项文字不是「正确/错误」而是「√/×」「T/F」 | `applyAnswer` 里的 `want` 数组加词 |
| 题干混进水印 | 水印不在「姓名/学号」格式里 | `src/content/normalize.js` 的 `WATERMARK_RULES` 加一条正则 |
