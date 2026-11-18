/* Chaoxing Pilot — 工具栏弹窗 */
const KEY = 'cxp.settings';
const $ = (id) => document.getElementById(id);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendToPage(msg) {
  const tab = await activeTab();
  if (!tab || !tab.id) return { ok: false, error: '没有活动标签页' };
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (e) {
    return { ok: false, error: '页面没有注入插件（不是学习通考试页，或需要刷新）' };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const got = await chrome.storage.local.get(KEY);
  const s = Object.assign({ enabled: true, mode: 'manual' }, got[KEY] || {});
  $('mode').value = s.mode || 'manual';
  $('enabled').value = String(s.enabled !== false);

  const tab = await activeTab();
  const onChaoxing = /chaoxing\.(com|cn)$/.test(new URL(tab && tab.url ? tab.url : 'http://x').hostname || '');
  $('dot').className = 'dot' + (s.enabled !== false && onChaoxing ? ' on' : '');
  if (!onChaoxing) $('hint').textContent = '当前页不是学习通，面板不会出现。';

  const persist = async () => {
    const cur = (await chrome.storage.local.get(KEY))[KEY] || {};
    await chrome.storage.local.set({ [KEY]: Object.assign({}, cur, { mode: $('mode').value, enabled: $('enabled').value === 'true' }) });
  };
  $('mode').addEventListener('change', persist);
  $('enabled').addEventListener('change', persist);

  $('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

  $('start').addEventListener('click', async () => {
    await persist();
    const res = await sendToPage({ type: 'engine:action', action: 'start' });
    $('hint').textContent = res && res.ok ? '已发送「开始」到页面' : ((res && res.error) || '发送失败');
    setTimeout(() => window.close(), 700);
  });
});
