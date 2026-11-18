/* Chaoxing Pilot — 拟人化输入：逐字键入 + 停顿抖动 + 标点后小憩
   简答题要“看起来像人打的”，所以不能一次性 setValue，要有 input 事件节奏。 */
(function () {
  'use strict';
  const CXP = window.CXP;

  function nativeSet(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  const PAUSE_AFTER = {
    '，': [140, 380], ',': [140, 380],
    '。': [220, 520], '.': [180, 420],
    '；': [160, 400], ';': [160, 400],
    '：': [120, 300], ':': [120, 300],
    '\n': [260, 620],
  };

  /**
   * 逐字输入
   * @param {HTMLElement} el textarea / input / contenteditable
   * @param {string} text
   * @param {{minDelay?:number,maxDelay?:number,onProgress?:Function,shouldStop?:Function}} opt
   */
  async function humanType(el, text, opt = {}) {
    if (!el) return false;
    const minDelay = opt.minDelay ?? 28;
    const maxDelay = opt.maxDelay ?? 120;
    const str = String(text || '');
    el.focus();
    nativeSet(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));

    let buf = '';
    for (let i = 0; i < str.length; i++) {
      if (opt.shouldStop && opt.shouldStop()) break;
      const ch = str[i];
      buf += ch;
      nativeSet(el, buf);

      el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));

      if (opt.onProgress && i % 10 === 0) opt.onProgress(i / str.length);

      const pause = PAUSE_AFTER[ch];
      if (pause) await CXP.sleep(CXP.randNormal(pause[0], pause[1]));
      else await CXP.sleep(CXP.randNormal(minDelay, maxDelay));
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  CXP.typer = { humanType, nativeSet };
})();
