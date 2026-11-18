/* Chaoxing Pilot — 学习通/超星 考试页适配器
   线上页面（mooc1-api.chaoxing.com/exam-ans/mooc2/exam/preview、mooc1.chaoxing.com/mooc2/exam/...）
   DOM 结构在不同版本里差异不小，所以每个字段都给了一串候选选择器 + 启发式兜底，
   识别不到时把诊断信息打到面板，别默默空跑。 */
(function () {
  'use strict';
  const CXP = window.CXP;
  const { text, $$, $ } = CXP;

  const SEL = {
    question: ['.questionLi', '.TiMu', '.questionItem', '.ans-question', '.exam-question', '.mark_item', '[data-questionid]'],
    type: ['.mark_name', '.newType', '.type_txt', '.quesType', '.question-type'],
    stem: ['.Zy_TItle', '.qtContent', '.question-title', '.stem', '.title', '.colorDeep', '.fontLabel', 'h3'],
    options: ['.answerList li', '.mark_letter li', 'ul.mark_letter > li', '.optionList li', '.option-item', '.answerList .clearfix'],
    optionLetter: ['.num_option', '.option-letter', '.letter', 'i', 'b', 'em', 'span.num'],
    answerInput: ['textarea', 'input[type="text"]', '.answerText', '[contenteditable="true"]'],
    submitBtn: ['.completeBtn', '#confirmSub', '.btnSubmit', '.subBtn'],
  };

  const LETTER_RE = /^([A-Za-z])[.、．)）\s]/;

  function pickContainer() {
    let best = null;
    let bestCount = 0;
    for (const sel of SEL.question) {
      const list = $$(sel);
      if (list.length > bestCount) {
        bestCount = list.length;
        best = { selector: sel, list };
      }
    }
    return best;
  }

  function parseOptions(container) {
    let nodes = [];
    for (const sel of SEL.options) {
      const found = $$(sel, container);
      if (found.length >= 2) { nodes = found; break; }
    }
    if (!nodes.length) {
      // 兜底：容器内带 A/B/C 标签或 radio 的 li
      nodes = $$('li', container).filter((li) => {
        const t = text(li);
        return /^[A-Za-z][.、．)）]/.test(t) || li.querySelector('input[type="radio"],input[type="checkbox"]') || li.querySelector('.num_option');
      });
    }

    const options = [];
    nodes.forEach((el, i) => {
      let letter = '';
      let letterFromNode = false;
      for (const s of SEL.optionLetter) {
        const node = $(s, el);
        const t = text(node);
        if (/^[A-Za-z]$/.test(t)) { letter = t.toUpperCase(); letterFromNode = true; break; }
        const stripped = t.replace(/[^A-Za-z]/g, '');
        if (stripped.length === 1 && t.length <= 3) { letter = stripped.toUpperCase(); letterFromNode = true; break; }
      }
      let body = text(el);
      if (letterFromNode && body.startsWith(letter)) {
        // 标号是独立节点（如 <span class="num_option">A</span>），文本拼接后会粘在题干前
        body = body.slice(1).replace(/^[.、．)）:：\s]+/, '').trim();
      }
      if (!letter) {
        const m = body.match(LETTER_RE);
        if (m) letter = m[1].toUpperCase();
      }
      if (!letter) letter = String.fromCharCode(65 + i);
      // 去掉行首的字母标号，留下纯选项文本
      body = body.replace(/^\s*[A-Za-z][.、．)）]\s*/, '').trim();
      if (body) options.push({ letter, text: body, el });
    });
    return options;
  }

  function parseStem(container, options, typeText) {
    for (const sel of SEL.stem) {
      const node = $(sel, container);
      let t = text(node);
      if (!t) continue;
      t = t.replace(typeText || '', '').trim();
      if (t.length >= 2) return t;
    }
    // 兜底：整块文本减去选项文本与题型标记
    let t = text(container);
    t = t.replace(typeText || '', '');
    for (const o of options) if (o.text) t = t.replace(o.text, '');
    return t.replace(/\s+/g, ' ').trim().slice(0, 400);
  }

  function chosen(el) {
    if (!el) return false;
    const cls = String(el.className || '').split(/\s+/);
    if (cls.some((c) => ['cur', 'checked', 'active', 'selected', 'on', 'curr'].includes(c))) return true;
    if (el.getAttribute && el.getAttribute('aria-checked') === 'true') return true;
    const input = el.querySelector && el.querySelector('input[type="radio"],input[type="checkbox"]');
    if (input && input.checked) return true;
    const inner = el.querySelector && el.querySelector('.cur,.checked,.active,.selected');
    if (inner) return true;
    return false;
  }

  function answerInputOf(container) {
    for (const sel of SEL.answerInput) {
      const list = $$(sel, container);
      if (list.length) return list;
    }
    return [];
  }

  const adapter = CXP.registerAdapter({
    id: 'chaoxing',
    name: '学习通 / 超星',
    match(loc) { return /(^|\.)chaoxing\.(com|cn)$/.test(loc.hostname); },
    detectRoot() {
      const picked = pickContainer();
      return picked ? picked.list[0].parentElement : null;
    },

    scan() {
      const picked = pickContainer();
      if (!picked) return [];
      const questions = [];
      picked.list.forEach((container, i) => {
        const typeText = (SEL.type.map((s) => text($(s, container))).find((t) => t) || '');
        const options = parseOptions(container);
        const stem = parseStem(container, options, typeText);
        if (!stem && !options.length) return;
        const type = CXP.norm.guessType(typeText, options.length, stem);
        const inputs = answerInputOf(container);
        questions.push({
          index: i + 1,
          el: container,
          type,
          typeText,
          stem,
          options,
          inputs,
        });
      });
      return questions;
    },

    isAnswered(q) {
      if (q.type === 'fill' || q.type === 'essay') {
        return q.inputs.some((el) => (el.value || el.innerText || '').trim().length > 0);
      }
      return q.options.some((o) => chosen(o.el));
    },

    async applyAnswer(q, ans) {
      const { answer } = ans;
      if (q.type === 'fill' || q.type === 'essay') {
        const inputs = q.inputs;
        if (!inputs.length) throw new Error('找不到作答输入框');
        const blanks = String(answer).split(/[；;]/).map((s) => s.trim()).filter(Boolean);
        if (q.type === 'fill' && blanks.length > 1 && blanks.length === inputs.length) {
          for (let i = 0; i < inputs.length; i++) {
            await CXP.typer.humanType(inputs[i], blanks[i], { minDelay: 24, maxDelay: 90 });
          }
        } else {
          await CXP.typer.humanType(inputs[0], String(answer), {
            minDelay: q.type === 'essay' ? 20 : 30,
            maxDelay: q.type === 'essay' ? 150 : 90,
          });
        }
        return true;
      }

      // 判断题：把答案映射到选项文本
      if (q.type === 'judge') {
        const target = CXP.norm.toJudge(answer);
        if (target === null) throw new Error(`判断题答案无法识别：${answer}`);
        const want = target ? ['正确', '对', '是', '√', 'true'] : ['错误', '错', '否', '×', 'false'];
        const opt = q.options.find((o) => {
          const t = CXP.norm.normalize(o.text);
          return want.some((w) => t === CXP.norm.normalize(w) || t.includes(CXP.norm.normalize(w)));
        });
        if (!opt) throw new Error('判断题选项未匹配');
        CXP.hardClick(opt.el);
        return true;
      }

      const letters = CXP.norm.lettersOf(answer);
      if (!letters.length) throw new Error(`选择题答案无法识别：${answer}`);
      let clicked = 0;
      for (const L of letters) {
        const opt = q.options.find((o) => o.letter === L);
        if (!opt) continue;
        if (q.type === 'multiple') {
          if (!chosen(opt.el)) { CXP.hardClick(opt.el); clicked++; }
        } else {
          CXP.hardClick(opt.el);
          clicked++;
        }
        await CXP.sleep(CXP.rand(120, 360));
      }
      if (!clicked) throw new Error('没有可点击的选项');
      return true;
    },

    selfCheck() {
      const qs = this.scan();
      const unanswered = qs.filter((q) => !this.isAnswered(q)).map((q) => q.index);
      return { total: qs.length, unanswered };
    },

    /**
     * 翻屏 / 翻页：一屏一题的卷子（或分页加载的作业）用得到。
     * 只认「下一题 / 继续答题 / 下一页」，绝不碰「交卷」。
     * @returns {boolean} 是否真的翻页了
     */
    advance() {
      const RE = /^(下一题|下一題|下一道|继续答题|繼續答題|下一页|下一頁|>>>|＞＞＞)$/;
      const cand = CXP.$$('button,a,div,span,li').filter((el) => {
        const t = CXP.text(el).replace(/\s+/g, '');
        if (!t || t.length > 8) return false;
        if (/交卷|提交/.test(t)) return false;
        return RE.test(t) || /^下一题/.test(t);
      });
      const btn = cand.find((el) => !el.disabled && !/disabled|gray|forbid/i.test(el.className || ''));
      if (!btn) return false;
      CXP.hardClick(btn);
      return true;
    },

    /** 交卷：默认只在明确调用时执行一次，并处理二次确认 */    async submit({ confirm = true } = {}) {
      let btn = SEL.submitBtn.map((s) => $(s)).find(Boolean);
      if (!btn) btn = CXP.findByText(['交卷', '提交试卷', '提交']);
      if (!btn) throw new Error('找不到交卷按钮');
      CXP.hardClick(btn);
      if (!confirm) return true;
      await CXP.sleep(600);
      const dlgBtn = CXP.findByText(['确认交卷', '确定交卷', '继续交卷', '确定', '确认']);
      if (dlgBtn) { CXP.hardClick(dlgBtn); return true; }
      return '已点击交卷，未发现确认弹窗';
    },

    /** 面板诊断用 */
    diagnose() {
      const picked = pickContainer();
      if (!picked) return { ok: false, msg: '未找到题目容器（可能不在考试页，或页面尚未渲染）' };
      const qs = this.scan();
      const types = {};
      qs.forEach((q) => (types[q.type] = (types[q.type] || 0) + 1));
      return {
        ok: qs.length > 0,
        msg: `容器 ${picked.selector} × ${picked.list.length}，解析题目 ${qs.length}，题型 ${JSON.stringify(types)}`,
      };
    },
  });

  CXP.chaoxing = adapter;
})();
