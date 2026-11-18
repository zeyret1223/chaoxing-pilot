/* Chaoxing Pilot — 设置页逻辑 */
const DEFAULTS = {
  enabled: true,
  mode: 'manual',
  overwrite: false,
  useBank: true,
  useLLM: true,
  threshold: 0.82,
  delayMin: 1200,
  delayMax: 3200,
  scanInterval: 800,
  essayMinChars: 120,
  saveToBank: false,
  apiBase: 'https://api.deepseek.com',
  apiModel: 'deepseek-chat',
  apiKey: '',
  apiTemperature: 0.2,
};

const $ = (id) => document.getElementById(id);
const KEY = 'cxp.settings';
const BANK = 'cxp.bank';

async function loadSettings() {
  const got = await chrome.storage.local.get(KEY);
  const s = Object.assign({}, DEFAULTS, got[KEY] || {});
  $('ver').textContent = 'v' + (chrome.runtime.getManifest().version || '');
  $('mode').value = s.mode;
  $('enabled').value = String(s.enabled);
  $('overwrite').value = String(s.overwrite);
  $('threshold').value = s.threshold;
  $('thresholdVal').textContent = Number(s.threshold).toFixed(2);
  $('delayMin').value = s.delayMin;
  $('delayMax').value = s.delayMax;
  $('essayMinChars').value = s.essayMinChars;
  $('saveToBank').value = String(s.saveToBank);
  $('apiBase').value = s.apiBase;
  $('apiModel').value = s.apiModel;
  $('apiKey').value = s.apiKey || '';
  $('apiTemperature').value = s.apiTemperature;
  return s;
}

async function saveSettings() {
  const next = {
    mode: $('mode').value,
    enabled: $('enabled').value === 'true',
    overwrite: $('overwrite').value === 'true',
    threshold: Number($('threshold').value),
    delayMin: Number($('delayMin').value),
    delayMax: Number($('delayMax').value),
    essayMinChars: Number($('essayMinChars').value),
    saveToBank: $('saveToBank').value === 'true',
    apiBase: $('apiBase').value.trim(),
    apiModel: $('apiModel').value.trim(),
    apiKey: $('apiKey').value.trim(),
    apiTemperature: Number($('apiTemperature').value),
  };
  if (next.delayMax < next.delayMin) next.delayMax = next.delayMin + 600;
  await chrome.storage.local.set({ [KEY]: next });
  $('saved').textContent = '已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
  setTimeout(() => ($('saved').textContent = ''), 2400);
  return next;
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ---------- 题库 ---------- */
async function refreshBank() {
  const got = await chrome.storage.local.get(BANK);
  const items = (got[BANK] && got[BANK].items) || [];
  $('bankTotal').textContent = items.length;
  const byType = {};
  items.forEach((it) => (byType[it.type || 'unknown'] = (byType[it.type || 'unknown'] || 0) + 1));
  $('bankTypes').textContent = Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(' · ') || '（空题库：先导入，或打开「LLM 结果写回题库」边用边攒）';
}

/** 与 content/bank.js 同构的极简导入（设置页不加载 content script） */
function normalizeKey(s) {
  return String(s)
    .replace(/姓\s*名[:：]?\s*[\u4e00-\u9fa5·]{2,6}/g, ' ')
    .replace(/学\s*号[:：]?\s*[0-9A-Za-z]{6,20}/g, ' ')
    .replace(/[\u200b-\u200f\ufeff]/g, '')
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[，。、；：？！“”‘’（）《》【】·—…,.;:?!"'()\[\]{}<>\-_\s]/g, '');
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
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
  const iStem = hasHeader ? Math.max(head.findIndex((h) => /stem|question|题目|题干/.test(h)), 0) : 0;
  const iAns = hasHeader ? Math.max(head.findIndex((h) => /answer|答案/.test(h)), 1) : 1;
  const iType = hasHeader ? head.findIndex((h) => /type|题型/.test(h)) : 2;
  return body
    .filter((r) => r.length > Math.max(iStem, iAns))
    .map((r) => ({
      stem: (r[iStem] || '').trim(),
      answer: (r[iAns] || '').trim(),
      type: iType >= 0 ? (r[iType] || '').trim() || undefined : undefined,
    }))
    .filter((r) => r.stem && r.answer);
}

function parseAny(text) {
  text = text.trim();
  if (!text) return [];
  if (text[0] === '{' || text[0] === '[') {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.data)) return data.data;
    return Object.entries(data).map(([stem, answer]) => ({ stem, answer: String(answer) }));
  }
  return parseCSV(text);
}

async function importRows(rows) {
  const got = await chrome.storage.local.get(BANK);
  const bank = got[BANK] || { version: 1, items: [] };
  const index = new Map(bank.items.map((it) => [it.key, it]));
  let added = 0, updated = 0;
  for (const r of rows) {
    const stem = r.stem || r.question || r.title || r.题目;
    const answer = r.answer ?? r.答案 ?? r.result ?? r.正确答案;
    if (!stem || answer == null) continue;
    const key = normalizeKey(stem);
    const item = {
      id: Math.random().toString(36).slice(2, 10),
      stem: String(stem).slice(0, 500),
      key,
      answer: String(answer).trim(),
      type: r.type || 'single',
      source: 'import',
      updatedAt: Date.now(),
    };
    if (index.has(key)) { Object.assign(index.get(key), { answer: item.answer, updatedAt: Date.now() }); updated++; }
    else { bank.items.push(item); index.set(key, item); added++; }
  }
  await chrome.storage.local.set({ [BANK]: bank });
  return { added, updated, total: bank.items.length };
}

/* ---------- 事件 ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await refreshBank();

  $('threshold').addEventListener('input', () => ($('thresholdVal').textContent = Number($('threshold').value).toFixed(2)));
  $('save').addEventListener('click', saveSettings);
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveSettings(); } });

  $('testLLM').addEventListener('click', async () => {
    await saveSettings();
    $('llmResult').textContent = '测试中…';
    const res = await chrome.runtime.sendMessage({
      type: 'llm:chat',
      payload: { messages: [{ role: 'user', content: '只回复两个字：可用' }], opts: { maxTokens: 16 } },
    });
    $('llmResult').textContent = res && res.ok ? `连通：${(res.data.content || '').trim().slice(0, 40)}` : `失败：${(res && res.error) || '未知错误'}`;
  });

  $('importBtn').addEventListener('click', async () => {
    const file = $('importFile').files[0];
    if (!file) return ($('importLog').textContent = '先选一个文件');
    const text = await file.text();
    try {
      const rows = parseAny(text);
      const r = await importRows(rows);
      $('importLog').textContent = `解析 ${rows.length} 行 → 新增 ${r.added}，更新 ${r.updated}，现共 ${r.total} 条`;
      await refreshBank();
    } catch (e) {
      $('importLog').textContent = '解析失败：' + e.message;
    }
  });

  $('importPaste').addEventListener('click', async () => {
    try {
      const rows = parseAny($('importText').value);
      const r = await importRows(rows);
      $('importLog').textContent = `解析 ${rows.length} 行 → 新增 ${r.added}，更新 ${r.updated}，现共 ${r.total} 条`;
      await refreshBank();
    } catch (e) {
      $('importLog').textContent = '解析失败：' + e.message;
    }
  });

  $('exportJson').addEventListener('click', async () => {
    const got = await chrome.storage.local.get(BANK);
    download(`cxp-bank-${Date.now()}.json`, JSON.stringify(got[BANK] || { version: 1, items: [] }, null, 2), 'application/json');
  });

  $('exportCsv').addEventListener('click', async () => {
    const got = await chrome.storage.local.get(BANK);
    const items = (got[BANK] && got[BANK].items) || [];
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = ['stem,answer,type'].concat(items.map((it) => [esc(it.stem), esc(it.answer), esc(it.type)].join(',')));
    download(`cxp-bank-${Date.now()}.csv`, '\ufeff' + lines.join('\r\n'), 'text/csv');
  });

  $('clearBank').addEventListener('click', async () => {
    if (!confirm('确认清空题库？此操作不可撤销。')) return;
    await chrome.storage.local.set({ [BANK]: { version: 1, items: [] } });
    await refreshBank();
    $('importLog').textContent = '题库已清空';
  });
});
