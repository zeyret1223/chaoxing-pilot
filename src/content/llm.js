/* Chaoxing Pilot — LLM 兜底：构造 prompt、调用后台转发、解析结构化答案 */
(function () {
  'use strict';
  const CXP = window.CXP;

  const SYSTEM = `你是一个严谨的应试答题引擎。你会收到一道中文选择题/判断题/填空题/简答题。
要求：
1. 只输出一个 JSON 对象，不要 markdown 代码块，不要多余文字。
2. JSON 结构：{"type":"single|multiple|judge|fill|essay","answer":"...","confidence":0-1,"reason":"一句话依据"}
3. 选择题 answer 用大写字母，多个字母相连如 "ACD"；判断题 answer 只能是 "正确" 或 "错误"；填空/简答 answer 是作答文本本身（简答题按要求的字数写完整、分点作答，不要出现“以下是答案”之类的口水话）。
4. 不确定时给最可能的答案，并降低 confidence。`;

  function buildUserPrompt(q, { essayMinChars = 120 } = {}) {
    const optText = q.options.map((o) => `${o.letter}. ${o.text}`).join('\n');
    const typeHint = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题', essay: '简答题' }[q.type] || '题目';
    const parts = [`题型：${typeHint}`, `题干：${q.stem}`];
    if (optText) parts.push(`选项：\n${optText}`);
    if (q.type === 'essay') parts.push(`作答要求：不少于 ${essayMinChars} 字，分 2~4 点，语言平实。`);
    if (q.type === 'fill') parts.push('若有多个空，用「；」分隔，顺序与题干一致。');
    return parts.join('\n');
  }

  function extractJSON(text) {
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced ? fenced[1] : text;
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { return JSON.parse(body.slice(start, end + 1)); } catch (_) { return null; }
  }

  function sanitize(raw, q) {
    if (!raw) return null;
    let answer = raw.answer;
    if (Array.isArray(answer)) answer = answer.join('');
    if (answer == null) return null;
    answer = String(answer).trim();
    if (!answer) return null;

    let type = raw.type || q.type;
    if (q.type === 'judge') {
      const j = CXP.norm.toJudge(answer);
      answer = j === null ? answer : j ? '正确' : '错误';
      type = 'judge';
    } else if (type === 'single' || type === 'multiple') {
      const letters = CXP.norm.lettersOf(answer);
      if (!letters.length) return null;
      answer = letters.join('');
      type = letters.length > 1 ? 'multiple' : 'single';
    }
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? 0.6)));
    return { answer, type, confidence, reason: String(raw.reason || '').slice(0, 200), source: 'llm' };
  }

  async function ask(q, settings) {
    if (!settings.useLLM) return null;
    if (!settings.apiKey) throw new Error('未填写 API Key（设置页 → 模型接口）');
    const messages = [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildUserPrompt(q, settings) },
    ];
    const res = await chrome.runtime.sendMessage({
      type: 'llm:chat',
      payload: { messages, opts: { temperature: settings.apiTemperature ?? 0.2 } },
    });
    if (!res || !res.ok) throw new Error((res && res.error) || '后台调用失败');
    const json = extractJSON(res.data && res.data.content);
    const out = sanitize(json, q);
    if (!out) {
      // 解析失败：退化为把整段文本当答案（填空/简答场景常见）
      if (q.type === 'fill' || q.type === 'essay') {
        const plain = String(res.data && res.data.content || '').replace(/```[\s\S]*?```/g, '').trim();
        if (plain) return { answer: plain.slice(0, 1200), type: q.type, confidence: 0.4, reason: '未返回 JSON，按原文作答', source: 'llm' };
      }
      throw new Error('模型返回无法解析');
    }
    return out;
  }

  CXP.llm = { ask, buildUserPrompt, extractJSON, sanitize, SYSTEM };
})();
