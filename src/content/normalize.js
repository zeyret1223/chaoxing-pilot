/* Chaoxing Pilot — 文本归一化：去水印、全半角、相似度
   超星卷面会铺满「姓名 钟无咎 / 学号 2544010105」水印，且水印会插进题干文字流，
   所以匹配前必须先把水印和干扰字符洗掉，否则题库永远匹配不上。 */
(function () {
  'use strict';
  const CXP = window.CXP;

  const ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

  // 会出现在卷面上的水印/元信息片段
  const WATERMARK_RULES = [
    /姓\s*名\s*[:：]?\s*[\u4e00-\u9fa5·]{2,6}/g,
    /学\s*号\s*[:：]?\s*[0-9A-Za-z]{6,20}/g,
    /班\s*级\s*[:：]?\s*[\u4e00-\u9fa5A-Za-z0-9-]{2,20}/g,
    /[\u4e00-\u9fa5·]{2,4}\s*[0-9]{8,12}/g,     // 姓名紧贴学号
    /(^|\D)[0-9]{8,12}(?=\D|$)/g,               // 孤立学号数字串
    /得分\s*[:：]?\s*[0-9.]+/g,
    /第\s*[0-9]+\s*页\s*共\s*[0-9]+\s*页/g,
  ];

  /** 去掉水印：先按「姓名/学号」把该字符串整串清掉，再兜底规则 + 高频重复短词 */
  function stripWatermark(input) {
    if (!input) return '';
    let s = String(input).replace(ZERO_WIDTH, '');

    // 1) 先把卷面主人的姓名 / 学号抽出来，然后在全文中删掉它的每一次出现
    const names = new Set();
    const ids = new Set();
    let m;
    const nameRe = /姓\s*名\s*[:：]?\s*([\u4e00-\u9fa5·]{2,6})/g;
    while ((m = nameRe.exec(s))) names.add(m[1]);
    const idRe = /学\s*号\s*[:：]?\s*([0-9A-Za-z]{6,20})/g;
    while ((m = idRe.exec(s))) ids.add(m[1]);

    // 2) 规则清洗
    for (const re of WATERMARK_RULES) s = s.replace(re, ' ');

    // 3) 该姓名的残留（卷面水印会把它重复几十次）
    for (const n of names) if (n) s = s.split(n).join(' ');
    for (const id of ids) if (id) s = s.split(id).join(' ');

    // 4) 仍然重复 ≥3 次的 2~4 字中文块视为水印
    const counts = new Map();
    for (const w of s.match(/[\u4e00-\u9fa5]{2,4}/g) || []) counts.set(w, (counts.get(w) || 0) + 1);
    for (const [word, n] of counts) if (n >= 3) s = s.split(word).join(' ');

    return s.replace(/\s+/g, ' ').trim();
  }

  /** 归一化：NFKC + 小写 + 去掉空白与标点，只留中文/字母/数字 */
  function normalize(input) {
    let s = stripWatermark(input);
    try { s = s.normalize('NFKC'); } catch (_) {}
    s = s
      .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .toLowerCase()
      .replace(/[，。、；：？！“”‘’（）《》【】·—…,.;:?!"'()\[\]{}<>\-_/\\|@#$%^&*+=~`\s]/g, '');
    return s;
  }

  const JUDGE_TRUE = ['正确', '对', '是', '√', 'true', 't', 'yes', 'y', 'a'];
  const JUDGE_FALSE = ['错误', '错', '否', '×', 'x', 'false', 'f', 'no', 'n', 'b'];

  /** 判断题型：单选 / 多选 / 判断 / 填空 / 简答 */
  function guessType(typeText, optionCount, stem) {
    const t = normalize(typeText);
    if (/多选|多项|不定项/.test(t)) return 'multiple';
    if (/判断/.test(t)) return 'judge';
    if (/填空/.test(t)) return 'fill';
    if (/简答|论述|问答|名词解释|分析/.test(t)) return 'essay';
    if (/单选|单项/.test(t)) return 'single';
    if (optionCount === 0) return /简答|论述|说明|分析/.test(stem || '') ? 'essay' : 'fill';
    if (optionCount === 2) {
      const s = normalize(stem);
      if (/^.{0,40}$/.test(s)) return 'judge';
    }
    if (optionCount >= 5) return 'single';
    return 'single';
  }

  function bigrams(s) {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    if (s.length === 1) out.add(s);
    return out;
  }

  /** Dice 系数：0~1 */
  function dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = bigrams(a);
    const B = bigrams(b);
    let inter = 0;
    for (const g of A) if (B.has(g)) inter++;
    return (2 * inter) / (A.size + B.size);
  }

  /** 综合相似度：Dice 为主，容忍“题干带括号/序号”造成的长度差 */
  function similarity(a, b) {
    const d = dice(a, b);
    if (!a || !b) return d;
    const contain = a.includes(b) || b.includes(a) ? Math.min(a.length, b.length) / Math.max(a.length, b.length) : 0;
    return Math.max(d, contain * 0.95);
  }

  /* ---- 极性（否定）检测 ----
     "不被载脂蛋白激活的酶有" 与 "能被载脂蛋白激活的酶有" 只差一个字，Dice 高达 0.9，
     但答案完全相反。这类题必须拒绝匹配，否则题库会把学生坑死。 */
  const NEG_MARKERS = ['不', '非', '无', '未', '除外', '不包括', '不属于', '不正确', '错误', '无关'];

  function polarityMarkers(raw) {
    const s = stripWatermark(raw);
    return NEG_MARKERS.filter((w) => s.includes(w));
  }

  function negationConflict(a, b) {
    const A = polarityMarkers(a);
    const B = polarityMarkers(b);
    if (!A.length && !B.length) return false;
    // 有任意一侧出现否定标记而另一侧没有 → 视为语义相反
    return (A.length === 0) !== (B.length === 0);
  }

  function toJudge(answer) {    const a = normalize(answer);
    if (JUDGE_TRUE.includes(a)) return true;
    if (JUDGE_FALSE.includes(a)) return false;
    return null;
  }

  function lettersOf(answer) {
    const s = String(answer || '').toUpperCase().replace(/[^A-Z]/g, '');
    return Array.from(new Set(s.split(''))).sort();
  }

  CXP.norm = { stripWatermark, normalize, guessType, dice, similarity, toJudge, lettersOf, negationConflict, polarityMarkers };
})();
