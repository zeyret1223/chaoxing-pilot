/* Chaoxing Pilot — Service Worker：LLM 转发（避开页面 CORS）、设置默认值、消息路由 */
const DEFAULTS = {
  'cxp.settings': {
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
  },
};

chrome.runtime.onInstalled.addListener(async () => {
  const got = await chrome.storage.local.get('cxp.settings');
  if (!got['cxp.settings']) await chrome.storage.local.set(DEFAULTS);
  chrome.action.setBadgeBackgroundColor({ color: '#1d4ed8' });
});

/** 统一的 OpenAI 兼容 chat/completions 转发 */
async function chat({ messages, opts = {} }) {
  const got = await chrome.storage.local.get('cxp.settings');
  const s = Object.assign({}, DEFAULTS['cxp.settings'], got['cxp.settings'] || {});
  if (!s.apiKey) return { ok: false, error: '未配置 API Key' };

  const base = String(s.apiBase || '').replace(/\/+$/, '');
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model || s.apiModel || 'deepseek-chat',
        messages,
        temperature: opts.temperature ?? s.apiTemperature ?? 0.2,
        max_tokens: opts.maxTokens || 1200,
        stream: false,
      }),
      signal: controller.signal,
    });
    const raw = await resp.text();
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status} ${raw.slice(0, 300)}` };
    let json;
    try { json = JSON.parse(raw); } catch (_) { return { ok: false, error: `返回非 JSON：${raw.slice(0, 200)}` }; }
    const content = json?.choices?.[0]?.message?.content ?? '';
    const usage = json?.usage || null;
    return { ok: true, data: { content, usage, model: json?.model } };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? '请求超时' : e.message };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'llm:chat') {
    chat(msg.payload).then(sendResponse);
    return true; // 异步响应
  }
  if (msg?.type === 'bank:stats') {
    chrome.storage.local.get('cxp.bank').then((got) => {
      const items = got['cxp.bank']?.items || [];
      sendResponse({ ok: true, total: items.length });
    });
    return true;
  }
  if (msg?.type === 'panel:toggle') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'panel:toggle' }).catch(() => {});
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});
