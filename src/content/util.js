/* Chaoxing Pilot — 基础工具：命名空间、事件总线、睡眠、DOM 助手、下载 */
(function () {
  'use strict';
  const CXP = (window.CXP = window.CXP || {});
  CXP.VERSION = '0.1.0';

  /* ---- 事件总线 ---- */
  const handlers = new Map();
  CXP.bus = {
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt).add(fn);
      return () => handlers.get(evt).delete(fn);
    },
    emit(evt, payload) {
      (handlers.get(evt) || []).forEach((fn) => {
        try { fn(payload); } catch (e) { console.warn('[CXP] handler error', e); }
      });
    },
  };

  CXP.log = function (msg, level = 'info') {
    if (level === 'debug' && !CXP.__debug) return;
    console.log('%c[CXP]', 'color:#4c8bf5', msg);
    CXP.bus.emit('log', { msg, level, t: Date.now() });
  };
  CXP.debug = function (msg) { CXP.log(msg, 'debug'); };

  /* ---- 时间 ---- */
  CXP.sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  CXP.rand = (min, max) => Math.round(min + Math.random() * (max - min));
  /** 正态抖动，比均匀分布更像人：均值 (min+max)/2 */
  CXP.randNormal = function (min, max) {
    const mean = (min + max) / 2;
    const sd = Math.max(1, (max - min) / 6);
    let v = mean;
    for (let i = 0; i < 4; i++) v += (Math.random() + Math.random() + Math.random() + Math.random() - 2) * sd;
    return Math.round(Math.min(max, Math.max(min, v)));
  };

  /* ---- DOM ---- */
  CXP.$ = (sel, root = document) => root.querySelector(sel);
  CXP.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  CXP.text = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');

  CXP.waitFor = function (fn, { timeout = 15000, interval = 300 } = {}) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        let v = null;
        try { v = fn(); } catch (_) { v = null; }
        if (v) return resolve(v);
        if (Date.now() - t0 > timeout) return resolve(null);
        setTimeout(tick, interval);
      };
      tick();
    });
  };

  /** 点击一个元素，补齐指针事件序列，兼容只监听 pointer/mouse 的组件。
      注意：只触发一次 click —— 既不能漏（只监听 click 的组件），也不能重（"下一题"被点两次会跳题）。 */
  CXP.hardClick = function (el) {
    if (!el) return false;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
    const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    try { el.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch (_) {}
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    try { el.dispatchEvent(new PointerEvent('pointerup', opts)); } catch (_) {}
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', opts));
    return true;
  };

  /** 在整页（含 iframe）里按文本找按钮/可点元素 */
  CXP.findByText = function (keywords, { root = document, tags = 'button,a,div,span,li' } = {}) {
    const list = CXP.$$(tags, root);
    const kw = (Array.isArray(keywords) ? keywords : [keywords]).map((k) => k.replace(/\s/g, ''));
    for (const el of list) {
      const t = CXP.text(el).replace(/\s/g, '');
      if (!t || t.length > 30) continue;
      if (kw.some((k) => t.includes(k))) {
        // 只取最内层命中，避免点到外层容器
        const inner = Array.from(el.children).some((c) => CXP.text(c).replace(/\s/g, '').includes(kw[0]));
        if (!inner) return el;
      }
    }
    return null;
  };

  /* ---- 杂项 ---- */
  CXP.uid = () => Math.random().toString(36).slice(2, 10);
  CXP.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  CXP.escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  CXP.download = function (filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  /* ---- 配置 ---- */
  CXP.DEFAULTS = {
    enabled: true,
    mode: 'manual',            // manual | semi | auto  —— 交卷策略
    overwrite: false,          // 已作答的题是否覆盖
    useBank: true,
    useLLM: true,
    threshold: 0.82,           // 题库模糊匹配阈值
    delayMin: 1200,            // 逐题间隔下限 ms
    delayMax: 3200,
    scanInterval: 800,         // 轮询新题目的间隔
    essayMinChars: 120,        // 简答目标字数
    saveToBank: false,         // LLM 结果自动入库
    apiBase: 'https://api.deepseek.com',
    apiModel: 'deepseek-chat',
    apiKey: '',
    apiTemperature: 0.2,
  };

  CXP.getSettings = async function () {
    const got = await chrome.storage.local.get('cxp.settings');
    return Object.assign({}, CXP.DEFAULTS, got['cxp.settings'] || {});
  };
  CXP.setSettings = async function (patch) {
    const cur = await CXP.getSettings();
    const next = Object.assign({}, cur, patch);
    await chrome.storage.local.set({ 'cxp.settings': next });
    CXP.bus.emit('settings', next);
    return next;
  };
})();
