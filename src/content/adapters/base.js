/* Chaoxing Pilot — 适配器基类与注册表
   新增平台只需实现同一组方法，然后在 registry 里注册：
     id, name, match(location), scan(), applyAnswer(q, ans), isAnswered(q),
     selfCheck(), submit(), detectRoot() */
(function () {
  'use strict';
  const CXP = window.CXP;
  CXP.adapters = CXP.adapters || {};
  CXP.adaptersRegistry = [];

  CXP.registerAdapter = function (adapter) {
    CXP.adapters[adapter.id] = adapter;
    CXP.adaptersRegistry.push(adapter);
    return adapter;
  };

  /** 当前页面命中哪个适配器（考虑 iframe：逐层向上问一句） */
  CXP.pickAdapter = function (loc = location) {
    for (const a of CXP.adaptersRegistry) {
      try { if (a.match(loc)) return a; } catch (_) {}
    }
    return null;
  };

  CXP.adapterBase = {
    /** 卷面容器；找不到返回 null */
    detectRoot() { return document.body; },
    /** 是否处于考试/答题页 */
    onExamPage() { return !!this.detectRoot() && this.scan().length > 0; },
    /** 题目列表 -> Question[] */
    scan() { return []; },
    /** 已作答？ */
    isAnswered() { return false; },
    /** 写入答案 */
    async applyAnswer() { return false; },
    /** 漏题自检 */
    selfCheck() { return { total: 0, unanswered: [] }; },
    /** 交卷（默认不实现） */
    submit() { return false; },
  };
})();
