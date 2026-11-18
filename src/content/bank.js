/* Chaoxing Pilot — 本地题库：存储、模糊匹配、导入导出
   存储结构：chrome.storage.local['cxp.bank'] = { version, items: [Item] }
   Item = { id, stem, key, type, answer, source, updatedAt }
     answer 约定：选择=字母串("A"/"ACD")，判断="正确"/"错误"，填空/简答=文本 */
(function () {
  'use strict';
  const CXP = window.CXP;
  const KEY = 'cxp.bank';
  const { normalize, similarity, lettersOf } = CXP.norm;

  let cache = null;      // { items: [...] }
  let cacheAt = 0;

  async function load(force = false) {
    if (cache && !force && Date.now() - cacheAt < 5000) return cache;
    const got = await chrome.storage.local.get(KEY);
    const bank = got[KEY] || { version: 1, items: [] };
    if (!Array.isArray(bank.items)) bank.items = [];
    cache = bank;
    cacheAt = Date.now();
    return bank;
  }

  async function save(bank) {
    cache = bank;
    cacheAt = Date.now();
    await chrome.storage.local.set({ [KEY]: bank });
    return bank;
  }

  async function clear() {
    await save({ version: 1, items: [] });
  }

  function makeItem(stem, answer, type = 'single', source = 'manual') {
    return {
      id: CXP.uid(),
      stem: String(stem).slice(0, 500),
      key: normalize(stem),
      type,
      answer,
      source,
      updatedAt: Date.now(),
    };
  }

  /** 写入或更新（按归一化 key 去重） */
  async function upsertMany(rows, { source = 'import' } = {}) {
    const bank = await load();
    const index = new Map(bank.items.map((it) => [it.key, it]));
    let added = 0;
    let updated = 0;
    for (const r of rows) {
      const stem = r.stem || r.question || r.title || r.题目;
      const answer = r.answer ?? r.答案 ?? r.result ?? r.正确答案;
      if (!stem || answer == null || String(answer).trim() === '') continue;
      const item = makeItem(stem, String(answer).trim(), r.type || CXP.norm.guessType('', 0, stem), r.source || source);
      if (index.has(item.key)) {
        const old = index.get(item.key);
        Object.assign(old, { answer: item.answer, type: item.type, source: item.source, updatedAt: Date.now() });
        updated++;
      } else {
        bank.items.push(item);
        index.set(item.key, item);
        added++;
      }
    }
    await save(bank);
    return { added, updated, total: bank.items.length };
  }

  async function put(stem, answer, type, source) {
    return upsertMany([{ stem, answer, type, source }], { source });
  }

  /**
   * 查询：先精确 key，再模糊。返回 { answer, score, item } 或 null
   * 注意「否定极性」：一字之差（能/不能）会把答案聊反，模糊匹配前先挡掉。
   */
  async function lookup(stem, { threshold = 0.82, type = null } = {}) {
    const bank = await load();
    if (!bank.items.length) return null;
    const key = normalize(stem);
    if (!key) return null;

    const exact = bank.items.find((it) => it.key === key);
    if (exact && !CXP.norm.negationConflict(stem, exact.stem)) return { answer: exact.answer, score: 1, item: exact };

    let best = null;
    let bestScore = 0;
    for (const it of bank.items) {
      if (type && it.type && it.type !== type && !(it.type === 'single' && type === 'judge')) continue;
      if (!it.key) continue;
      if (CXP.norm.negationConflict(stem, it.stem)) continue;
      // 长度差太大直接跳过，省 90% 的算力
      const ratio = Math.min(it.key.length, key.length) / Math.max(it.key.length, key.length);
      if (ratio < 0.55) continue;
      const s = similarity(key, it.key);
      if (s > bestScore) {
        bestScore = s;
        best = it;
      }
    }
    if (best && bestScore >= threshold) return { answer: best.answer, score: bestScore, item: best };
    return null;
  }

  /* ---------------- 导入解析 ---------------- */

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',' || c === '\t') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const hasHeader = head.some((h) => /stem|question|题目|题干|answer|答案/.test(h));
    const body = hasHeader ? rows.slice(1) : rows;

    const idx = (names, fallback) => {
      if (!hasHeader) return fallback;
      const i = head.findIndex((h) => names.some((n) => h.includes(n)));
      return i >= 0 ? i : fallback;
    };
    const iStem = idx(['stem', 'question', '题目', '题干'], 0);
    const iAns = idx(['answer', '答案', '正确答案'], 1);
    const iType = idx(['type', '题型'], 2);

    return body
      .filter((r) => r.length > Math.max(iStem, iAns))
      .map((r) => ({ stem: (r[iStem] || '').trim(), answer: (r[iAns] || '').trim(), type: (r[iType] || '').trim() || undefined }))
      .filter((r) => r.stem && r.answer);
  }

  function parseJSON(text) {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.items)) return data.items;
    if (data && Array.isArray(data.data)) return data.data;       // 学小易/常见题库导出
    if (data && typeof data === 'object') {
      // { "题干": "答案" } 的扁平映射
      return Object.entries(data).map(([stem, answer]) => ({ stem, answer: typeof answer === 'string' ? answer : JSON.stringify(answer) }));
    }
    return [];
  }

  /** 自动识别格式：JSON / CSV / TSV / 学小易导出的 JSON */
  async function importText(text, { filename = '' } = {}) {
    const trimmed = text.trim();
    let rows;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) rows = parseJSON(trimmed);
    else if (/\.(json)$/i.test(filename)) rows = parseJSON(trimmed);
    else rows = parseCSV(trimmed);
    const res = await upsertMany(rows, { source: 'import' });
    return Object.assign(res, { parsed: rows.length });
  }

  function exportJSON() {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items: (cache && cache.items) || [] }, null, 2);
  }

  function exportCSV() {
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = ['stem,answer,type'];
    for (const it of (cache && cache.items) || []) lines.push([esc(it.stem), esc(it.answer), esc(it.type)].join(','));
    return '\ufeff' + lines.join('\r\n');
  }

  async function stats() {
    const bank = await load(true);
    const byType = {};
    for (const it of bank.items) byType[it.type || 'unknown'] = (byType[it.type || 'unknown'] || 0) + 1;
    return { total: bank.items.length, byType };
  }

  CXP.bank = { load, save, clear, put, upsertMany, lookup, importText, exportJSON, exportCSV, stats, lettersOf };
})();
