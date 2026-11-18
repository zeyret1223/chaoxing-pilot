/* Chaoxing Pilot — 页面内悬浮面板（Shadow DOM，避免被站点样式影响） */
(function () {
  'use strict';
  const CXP = window.CXP;

  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  .wrap { position: fixed; right: 16px; top: 96px; width: 320px; z-index: 2147483600;
          background: #101216; color: #e6e8ee; border: 1px solid #2a2f3a; border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0,0,0,.45); overflow: hidden; font-size: 12px; }
  .hd { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: move;
        background: linear-gradient(180deg,#1a1e26,#141821); border-bottom: 1px solid #232833; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; }
  .dot.run { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
  .dot.err { background: #ef4444; }
  .ttl { font-weight: 600; font-size: 12px; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mini { background: none; border: 0; color: #9aa4b2; cursor: pointer; font-size: 13px; padding: 2px 6px; }
  .mini:hover { color: #fff; }
  .bd { padding: 10px; display: block; }
  .wrap.collapsed .bd { display: none; }
  .stat { display: flex; gap: 6px; margin-bottom: 8px; }
  .stat div { flex: 1; background: #171b23; border: 1px solid #232833; border-radius: 8px; padding: 6px; text-align: center; }
  .stat b { display: block; font-size: 14px; color: #7dd3fc; }
  .stat span { color: #8792a2; font-size: 10px; }
  .row { display: flex; gap: 6px; margin-bottom: 6px; }
  button.act { flex: 1; padding: 7px 6px; border-radius: 8px; border: 1px solid #2c3444; background: #1b2029;
               color: #dfe5ee; cursor: pointer; font-size: 12px; }
  button.act:hover { background: #232a36; }
  button.act.primary { background: #1d4ed8; border-color: #2563eb; color: #fff; }
  button.act.primary:hover { background: #2563eb; }
  button.act.danger { border-color: #7f1d1d; color: #fca5a5; }
  select, input[type=number] { background: #171b23; color: #dfe5ee; border: 1px solid #2c3444; border-radius: 6px; padding: 4px; font-size: 11px; }
  .log { max-height: 132px; overflow: auto; margin-top: 6px; border-top: 1px solid #232833; padding-top: 6px; }
  .log p { margin: 0 0 3px; line-height: 1.45; color: #aab3c0; word-break: break-all; }
  .log p.ok { color: #86efac; }
  .log p.warn { color: #fcd34d; }
  .log p.err { color: #fca5a5; }
  .hint { color: #6b7280; font-size: 10px; margin-top: 6px; line-height: 1.5; }
  `;

  const panel = {
    root: null,
    host: null,
    el: {},
    collapsed: false,

    mount() {
      if (this.host && document.documentElement.contains(this.host)) return this;
      const host = document.createElement('div');
      host.id = 'cxp-panel-host';
      host.style.cssText = 'all:initial;position:fixed;z-index:2147483600;';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CSS;
      const wrap = document.createElement('div');
      wrap.className = 'wrap';
      wrap.innerHTML = `
        <div class="hd">
          <div class="dot"></div>
          <div class="ttl">Chaoxing Pilot <span style="color:#5b6472">v${CXP.VERSION}</span></div>
          <button class="mini" data-act="fold" title="折叠/展开 (Alt+Shift+P)">▾</button>
        </div>
        <div class="bd">
          <div class="stat">
            <div><b data-k="total">0</b><span>题目</span></div>
            <div><b data-k="done">0</b><span>已作答</span></div>
            <div><b data-k="hit">0</b><span>题库命中</span></div>
            <div><b data-k="llm">0</b><span>LLM</span></div>
          </div>
          <div class="row">
            <select data-k="mode" title="交卷策略">
              <option value="manual">① 只作答（人工交卷）</option>
              <option value="semi">② 答完提示 + 一键交卷</option>
              <option value="auto">③ 答完全自动交卷</option>
            </select>
          </div>
          <div class="row">
            <button class="act primary" data-act="start">开始 (⇧⌥S)</button>
            <button class="act" data-act="step">下一题 (⇧⌥N)</button>
          </div>
          <div class="row">
            <button class="act" data-act="check">漏题自检 (⇧⌥C)</button>
            <button class="act" data-act="diagnose">诊断</button>
          </div>
          <div class="row">
            <button class="act" data-act="export">导出日志</button>
            <button class="act danger" data-act="submit">交卷</button>
          </div>
          <div class="log" data-k="log"></div>
          <div class="hint">题库 → LLM 兜底 → 拟人节奏。面板可拖动；所有动作都在本地执行。</div>
        </div>`;
      shadow.append(style, wrap);
      document.documentElement.appendChild(host);

      this.host = host;
      this.root = shadow;
      this.wrap = wrap;
      this.el = {
        dot: wrap.querySelector('.hd .dot'),
        total: wrap.querySelector('[data-k=total]'),
        done: wrap.querySelector('[data-k=done]'),
        hit: wrap.querySelector('[data-k=hit]'),
        llm: wrap.querySelector('[data-k=llm]'),
        mode: wrap.querySelector('[data-k=mode]'),
        log: wrap.querySelector('[data-k=log]'),
      };

      this.bindEvents();
      this.makeDraggable();
      return this;
    },

    bindEvents() {
      this.root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'fold') return this.toggle();
        CXP.bus.emit('panel:action', act);
      });
      this.el.mode.addEventListener('change', () => {
        CXP.setSettings({ mode: this.el.mode.value });
        this.log(`交卷策略 → ${this.el.mode.options[this.el.mode.selectedIndex].text}`, 'warn');
      });
      CXP.bus.on('log', ({ msg, level }) => this.log(msg, level));
      CXP.bus.on('stats', (s) => this.setStats(s));
      CXP.bus.on('state', (state) => this.setState(state));
    },

    makeDraggable() {
      const hd = this.wrap.querySelector('.hd');
      let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
      hd.addEventListener('mousedown', (e) => {
        if (e.target.closest('[data-act]')) return;
        dragging = true;
        const r = this.wrap.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const nx = Math.max(0, ox + e.clientX - sx);
        const ny = Math.max(0, oy + e.clientY - sy);
        this.wrap.style.left = nx + 'px';
        this.wrap.style.top = ny + 'px';
        this.wrap.style.right = 'auto';
      });
      window.addEventListener('mouseup', () => (dragging = false));
    },

    toggle() {
      this.wrap.classList.toggle('collapsed');
      this.collapsed = this.wrap.classList.contains('collapsed');
      this.wrap.querySelector('[data-act=fold]').textContent = this.collapsed ? '▸' : '▾';
    },

    setState(state) {
      this.el.dot.className = 'dot' + (state === 'running' ? ' run' : state === 'error' ? ' err' : '');
      const btn = this.wrap.querySelector('[data-act=start]');
      btn.textContent = state === 'running' ? '暂停 (⇧⌥S)' : '开始 (⇧⌥S)';
    },

    setStats(s) {
      const set = (k, v) => { if (this.el[k]) this.el[k].textContent = v; };
      if (s.total != null) set('total', s.total);
      if (s.done != null) set('done', s.done);
      if (s.hit != null) set('hit', s.hit);
      if (s.llm != null) set('llm', s.llm);
    },

    setMode(mode) {
      if (this.el.mode) this.el.mode.value = mode;
    },

    log(msg, level = 'info') {
      if (!this.el.log) return;
      const p = document.createElement('p');
      p.className = level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : level === 'error' || level === 'err' ? 'err' : '';
      const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      p.textContent = `${t}  ${msg}`;
      this.el.log.appendChild(p);
      this.el.log.scrollTop = this.el.log.scrollHeight;
      while (this.el.log.childElementCount > 200) this.el.log.firstElementChild.remove();
    },
  };

  CXP.panel = panel;
})();
