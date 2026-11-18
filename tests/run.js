#!/usr/bin/env node
/* 极简测试跑器：不引框架，直接 node tests/run.js */
const files = ['match.test.js', 'adapter.test.js'];

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, label, extra) {
  if (cond) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}${extra ? ` \x1b[90m(${extra})\x1b[0m` : ''}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  \x1b[31m✗ ${label}\x1b[0m${extra ? ` \x1b[90m(${extra})\x1b[0m` : ''}`);
  }
}

(async () => {
  for (const f of files) {
    console.log(`\n▸ ${f}`);
    try {
      await require(`./${f}`)(assert);
    } catch (e) {
      fail++;
      failures.push(`${f}: ${e.message}`);
      console.log(`  \x1b[31m✗ 异常退出：${e.message}\x1b[0m`);
      console.log(e.stack);
    }
  }
  console.log(`\n汇总：\x1b[32m${pass} 通过\x1b[0m / \x1b[${fail ? 31 : 32}m${fail} 失败\x1b[0m`);
  if (fail) {
    console.log('失败项：');
    failures.forEach((x) => console.log('  - ' + x));
    process.exit(1);
  }
})();
