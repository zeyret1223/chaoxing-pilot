/* Chaoxing Pilot — 主流程：扫描 → 题库 → LLM → 作答 → 自检 → 交卷策略 */
(function () {
  'use strict';
  const CXP = window.CXP;
  const isTop = window.top === window;

  const state = {
    phase: 'idle',          // idle | running | paused
    settings: null,
    adapter: null,
    stats: { total: 0, done: 0, hit: 0, llm: 0, miss: 0, error: 0 },
    journal: [],
    llmCache: new Map(),
    stopFlag: false,
  };

  function emitState() {
    CXP.bus.emit('state', state.phase);
  }
  function emitStats() {
    CXP.bus.emit('stats', state.stats);
  }

  /* ---------------- 单题求解 ---------------- */
  async function solveQuestion(q) {
    const s = state.settings;
    const cacheKey = CXP.norm.normalize(q.stem) + '|' + q.type;

    if (s.useBank) {
      const hit = await CXP.bank.lookup(q.stem, { threshold: s.threshold, type: q.type });
      if (hit) return { answer: hit.answer, confidence: hit.score, source: 'bank', reason: `题库匹配 ${(hit.score * 100).toFixed(0)}%` };
    }

    if (s.useLLM) {
      if (state.llmCache.has(cacheKey)) return state.llmCache.get(cacheKey);
      const res = await CXP.llm.ask(q, s);
      if (res) state.llmCache.set(cacheKey, res);
      return res;
    }
    return null;
  }

  async function answerOne(q, { interactive = true } = {}) {
    const alreadyDone = state.adapter.isAnswered(q);
    if (alreadyDone && !state.settings.overwrite) {
      CXP.log(`第 ${q.index} 题已作答，跳过`, 'debug');
      return { skipped: true };
    }

    let res = null;
    try {
      res = await solveQuestion(q);
    } catch (e) {
      CXP.log(`第 ${q.index} 题求解失败：${e.message}`, 'error');
      state.stats.error++;
      emitStats();
      state.journal.push({ index: q.index, stem: q.stem.slice(0, 60), status: 'error', error: e.message });
      return { error: e.message };
    }

    if (!res || !res.answer) {
      CXP.log(`第 ${q.index} 题未命中：${q.stem.slice(0, 28)}…`, 'warn');
      state.stats.miss++;
      emitStats();
      state.journal.push({ index: q.index, stem: q.stem.slice(0, 60), status: 'miss' });
      return { miss: true };
    }

    // 拟人：先“看题”停顿，再落笔
    if (interactive) await CXP.sleep(CXP.randNormal(300, 900));

    try {
      await state.adapter.applyAnswer(q, res);
    } catch (e) {
      CXP.log(`第 ${q.index} 题写入失败：${e.message}`, 'error');
      state.stats.error++;
      emitStats();
      state.journal.push({ index: q.index, stem: q.stem.slice(0, 60), status: 'error', error: e.message });
      return { error: e.message };
    }

    if (res.source === 'llm') state.stats.llm++;
    else state.stats.hit++;
    if (!alreadyDone) state.stats.done++;
    emitStats();

    const conf = res.confidence != null ? ` ${(res.confidence * 100).toFixed(0)}%` : '';
    CXP.log(`第 ${q.index} 题 → ${res.answer}（${res.source}${conf}）${res.reason ? ' · ' + res.reason : ''}`, 'ok');
    state.journal.push({ index: q.index, stem: q.stem.slice(0, 60), type: q.type, answer: res.answer, source: res.source, confidence: res.confidence, status: 'ok' });

    if (state.settings.saveToBank && res.source === 'llm' && q.type !== 'essay') {
      await CXP.bank.put(q.stem, res.answer, q.type, 'llm');
    }
    return { ok: true, res };
  }

  /* ---------------- 扫描与循环 ---------------- */
  function rescan() {
    const qs = state.adapter.scan();
    state.stats.total = qs.length;
    if (qs.length) state.stats.done = qs.filter((q) => state.adapter.isAnswered(q)).length;
    emitStats();
    return qs;
  }

  async function runLoop() {
    if (state.phase === 'running') return;
    state.phase = 'running';
    state.stopFlag = false;
    emitState();
    CXP.log('开始作答…', 'warn');

    const s = state.settings;
    let rounds = 0;
    let advances = 0;
    while (!state.stopFlag && rounds < 60) {
      rounds++;
      const qs = rescan();
      if (!qs.length) {
        CXP.log('没扫到题目，等待页面渲染…', 'warn');
        await CXP.sleep(1500);
        if (rounds > 3) break;
        continue;
      }
      for (const q of qs) {
        if (state.stopFlag) break;
        const r = await answerOne(q);
        if (r && (r.ok || r.skipped)) {
          await CXP.sleep(CXP.randNormal(s.delayMin, s.delayMax));
        } else {
          await CXP.sleep(CXP.randNormal(300, 900));
        }
      }
      rescan();
      const check = state.adapter.selfCheck();
      if (check.unanswered.length) {
        CXP.log(`第 ${rounds} 轮结束，仍有未作答：${check.unanswered.join(',')}，再补一轮`, 'warn');
        await CXP.sleep(CXP.randNormal(800, 1600));
        continue;
      }
      // 一屏一题 / 分页作业：本屏答完了就翻到下一屏
      const moved = state.adapter.advance ? state.adapter.advance() : false;
      if (!moved) break;
      advances++;
      CXP.log(`本屏已答完，翻到第 ${advances + 1} 屏…`, 'info');
      await CXP.sleep(CXP.randNormal(1200, 2200));
    }

    state.phase = 'paused';
    emitState();
    await finish(rounds);
  }

  async function finish(rounds) {
    const check = state.adapter.selfCheck();
    if (check.unanswered.length) {
      CXP.log(`作答结束，仍有 ${check.unanswered.length} 题没答：${check.unanswered.join(',')}`, 'warn');
    } else {
      CXP.log(`全部 ${check.total} 题已作答（${rounds} 轮），按当前策略处理交卷`, 'ok');
    }

    const mode = state.settings.mode;
    if (mode === 'auto') {
      CXP.log('策略③：自动交卷中…', 'warn');
      try { await state.adapter.submit({ confirm: true }); CXP.log('已提交交卷', 'ok'); }
      catch (e) { CXP.log(`交卷失败：${e.message}`, 'error'); }
    } else if (mode === 'semi') {
      const ask = window.confirm(`Chaoxing Pilot：作答完成（${check.total - check.unanswered.length}/${check.total}）。\n现在交卷吗？`);
      if (ask) {
        try { await state.adapter.submit({ confirm: true }); CXP.log('已提交交卷', 'ok'); }
        catch (e) { CXP.log(`交卷失败：${e.message}`, 'error'); }
      } else {
        CXP.log('已取消交卷，等你手动点', 'warn');
      }
    } else {
      CXP.log('策略①：只作答不交卷，请自行核对后提交', 'ok');
    }
  }

  /* ---------------- 面板动作 ---------------- */
  async function onAction(act) {
    switch (act) {
      case 'start':
        if (state.phase === 'running') {
          state.stopFlag = true;
          CXP.log('已请求暂停', 'warn');
        } else {
          runLoop();
        }
        break;
      case 'step': {
        const qs = rescan();
        const next = qs.find((q) => !state.adapter.isAnswered(q));
        if (!next) return CXP.log('没有未作答的题了', 'warn');
        await answerOne(next);
        break;
      }
      case 'check': {
        const r = state.adapter.selfCheck();
        CXP.log(r.unanswered.length ? `漏题：${r.unanswered.join(',')}` : `自检通过：${r.total}/${r.total}`, r.unanswered.length ? 'warn' : 'ok');
        break;
      }
      case 'diagnose': {
        const d = state.adapter.diagnose ? state.adapter.diagnose() : { msg: '当前适配器没有诊断信息' };
        CXP.log(d.msg, d.ok ? 'ok' : 'error');
        break;
      }
      case 'export':
        CXP.download(`cxp-journal-${Date.now()}.json`, JSON.stringify({ stats: state.stats, journal: state.journal }, null, 2));
        CXP.log('日志已导出', 'ok');
        break;
      case 'submit': {
        if (!window.confirm('确认交卷？此操作不可撤销。')) return;
        try { await state.adapter.submit({ confirm: true }); CXP.log('已提交交卷', 'ok'); }
        catch (e) { CXP.log(`交卷失败：${e.message}`, 'error'); }
        break;
      }
      default:
        break;
    }
  }

  /* ---------------- 快捷键 ---------------- */
  function bindHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (!e.altKey || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      const map = { s: 'start', n: 'step', c: 'check', p: 'fold' };
      const act = map[k];
      if (!act) return;
      e.preventDefault();
      if (act === 'fold') return CXP.panel.toggle();
      onAction(act);
    }, true);
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    CXP.__debug = localStorage.getItem('cxp.debug') === '1';
    state.adapter = CXP.pickAdapter(location);
    if (!state.adapter) return;

    state.settings = await CXP.getSettings();
    if (!state.settings.enabled) return;
    CXP.bus.on('settings', (s) => {
      state.settings = s;
      CXP.panel.setMode(s.mode);
    });

    // 只在真正有题目的那一帧显示面板
    const probe = await CXP.waitFor(() => (state.adapter.scan().length ? state.adapter.scan() : null), { timeout: 20000, interval: 600 });
    if (!probe) {
      CXP.debug('本帧未发现题目，静默待命（可能是 iframe 外壳）');
      return;
    }

    CXP.panel.mount();
    CXP.panel.setMode(state.settings.mode);
    CXP.bus.on('panel:action', onAction);
    bindHotkeys();

    // 工具栏弹窗 / 后台转发过来的动作
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg && msg.type === 'engine:action') {
          onAction(msg.action);
          sendResponse({ ok: true });
          return true;
        }
        return false;
      });
    } catch (_) {}

    const d = state.adapter.diagnose ? state.adapter.diagnose() : {};
    CXP.log(`就绪：${d.msg || '已识别到题目'}`, 'ok');
    CXP.log(`策略：${({ manual: '①只作答', semi: '②答完问交卷', auto: '③自动交卷' })[state.settings.mode]}；题库 ${state.settings.useBank ? '开' : '关'}，LLM ${state.settings.useLLM ? '开' : '关'}`, 'info');
    rescan();
    emitState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  CXP.engine = { boot, runLoop, answerOne, onAction, state, rescan };
})();
