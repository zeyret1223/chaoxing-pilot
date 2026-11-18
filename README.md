# Chaoxing Pilot · 学习通答题助手

> 仓库镜像：GitHub [zeyret1223/chaoxing-pilot](https://github.com/zeyret1223/chaoxing-pilot) · Gitee [zeyret/chaoxing-pilot](https://gitee.com/zeyret/chaoxing-pilot)
> 双仓同步做法见 [docs/MIRROR.md](docs/MIRROR.md)；安装包见 [Releases](https://github.com/zeyret1223/chaoxing-pilot/releases)

一个 Chrome / Edge 扩展（Manifest V3），用于**学习通（超星）考试页**的自动化作答：
识别题目 → 本地题库优先 → LLM 兜底 → 拟人化节奏落笔 → 漏题自检 → 按策略决定是否交卷。

> 设计取向：**默认只作答、不交卷**。交卷是一次不可撤销的动作，所以策略①是默认值。

---

## 特性

| 能力 | 说明 |
|---|---|
| 题型覆盖 | 单选 / 多选 / 判断 / 填空 / 简答（简答按目标字数生成并**逐字键入**） |
| 双答案源 | 本地题库（精确 + Dice 模糊匹配）+ OpenAI 兼容 LLM 兜底，可三级降级 |
| 去水印归一化 | 卷面上的「姓名 / 学号 / 重复短词」水印在匹配前被清洗，避免题库命中率被水印拖死 |
| 拟人节奏 | 逐题间隔正态抖动、落笔前"看题"停顿、标点后小憩、简答逐字输入 |
| 漏题自检 | 每轮结束重扫一遍，未作答的题号打日志并自动补答（最多 6 轮） |
| 交卷策略 | ① 只作答（默认）② 答完弹窗问 ③ 自动交卷 |
| 题库管理 | CSV / JSON / 学小易导出格式导入，JSON+CSV 导出，LLM 结果可选写回题库 |
| 面板 | Shadow DOM 悬浮面板，可拖动 / 折叠，实时显示 题目数 / 已作答 / 题库命中 / LLM 次数 |
| 快捷键 | `Alt+Shift+S` 开始暂停 · `N` 下一题 · `C` 自检 · `P` 折叠 |

## 安装（开发者模式加载）

1. 下载或克隆本仓库；
2. 打开 `edge://extensions` 或 `chrome://extensions`，打开右上角「开发人员模式」；
3. 点「加载解压缩的扩展」，选择仓库根目录（含 `manifest.json` 的那一层）；
4. 打开学习通考试页，右上角会出现面板；
5. 首次使用先到「扩展详情 → 扩展选项」里填 API Key（可选，只用题库则不用填）。

## 使用

1. 进入考试页（`mooc1-api.chaoxing.com/exam-ans/...` 这类页面）；
2. 面板点「诊断」——确认 `解析题目 N` 的数字和卷面题量一致；
3. 选交卷策略，点「开始」；
4. 面板逐题打印 `第 N 题 → A（bank 92%）` 这样的日志；
5. 答完按策略处理：① 自己核对后点交卷；② 弹窗问你要不要交；③ 直接交。

## 设置项说明

| 项 | 默认 | 说明 |
|---|---|---|
| 交卷策略 | ① 只作答 | 见上表 |
| 模糊匹配阈值 | 0.82 | 越高越严格；题干改写多就降到 0.75 |
| 逐题间隔 | 1200–3200ms | 正态分布抖动，不是固定 sleep |
| 简答目标字数 | 120 | 模型生成长度；键入速度另有抖动 |
| LLM 结果写回题库 | 关 | 打开后 LLM 答过的题会入库，下次直接命中 |
| Base URL / 模型 | `api.deepseek.com` / `deepseek-chat` | 任何 OpenAI 兼容端点都行 |

## 题库格式

```csv
stem,answer,type
参与酮体氧化的酶是,A,single
LDL受体最丰富的器官是,D,single
```

```json
[
  { "stem": "参与酮体氧化的酶是", "answer": "A", "type": "single" },
  { "stem": "体内活性硫酸根是指", "answer": "PAPS", "type": "single" }
]
```

也接受 `{ "题干": "答案" }` 扁平映射，以及学小易导出的 `{"data":[{question,answer}]}` / `{"items":[...]}` 结构。

`answer` 约定：选择题字母串（`A` / `ACD`），判断题 `正确`/`错误`，填空简答为文本。

## 项目结构

```
manifest.json
src/
  background.js              # Service Worker：LLM 转发（绕开页面 CORS）
  content/
    util.js                  # 命名空间、事件总线、DOM/睡眠工具、默认设置
    normalize.js             # 去水印、全半角归一、Dice 相似度、否定极性、题型推断
    bank.js                  # 题库存储 / 模糊匹配 / 导入导出
    llm.js                   # prompt 构造 + JSON 解析 + 兜底
    typer.js                 # 拟人逐字输入
    adapters/base.js         # 适配器契约与注册表
    adapters/chaoxing.js     # 学习通/超星 DOM 解析与作答
    panel.js / panel.css     # Shadow DOM 悬浮面板
    main.js                  # 主流程：扫描→求解→作答→自检→交卷策略
  options/                   # 设置页（含题库管理）
  popup/                     # 工具栏弹窗
tests/                       # 回归测试（匹配链路 + jsdom 卷面）
  match.test.js              # 去水印 / 归一化 / 模糊匹配 / 否定极性
  adapter.test.js            # 类超星 DOM：解析→点击→输入→自检
  run.js                     # 极简跑器
scripts/pack.ps1             # 打包 zip（供商店或分发）
scripts/publish.ps1          # git init + gh repo create 一键发布
docs/COST.md                 # 成本估算
docs/PROBE.md                # 页面选择器校准指南（改版后照它改）
data/sample-bank.json        # 示例题库（生化 20 题）
```

## 测试

```powershell
npm i          # 只装 jsdom（devDependency）
npm test
```

当前 24 项断言全绿：去水印（含重复姓名/学号）、全角转半角、题型推断、题库导入与模糊匹配、
**否定极性拦截**（「不被载脂蛋白激活的酶」不会命中「能被载脂蛋白激活的酶」）、
以及 jsdom 卷面上的 解析→单选点击→判断题映射→简答逐字键入→漏题自检 全链路。

## 版本适配（学习通改版时看这个）

见 [docs/PROBE.md](docs/PROBE.md)：一段 console 探针会把「容器 / 题干 / 选项 / 输入框」的候选选择器命中数打出来，
照着改 `src/content/adapters/chaoxing.js` 顶部的 `SEL` 即可，其它文件不用动。

## 扩展新平台

在 `src/content/adapters/` 新建一个文件，实现同一组方法后注册：

```js
CXP.registerAdapter({
  id: 'yuketang',
  name: '雨课堂',
  match: (loc) => /yuketang\.cn$/.test(loc.hostname),
  scan() { /* return [{index,type,stem,options,inputs,el}] */ },
  isAnswered(q) {},
  async applyAnswer(q, ans) {},
  selfCheck() {},
  async submit() {},
});
```

再加进 `manifest.json` 的 `content_scripts.js` 与 `matches` 即可。`main.js` 完全不用改。

## 已知限制

- 学习通不同版本的 DOM 有差异。适配器里每个字段都给了多组候选选择器 + 兜底启发式，但**新版本仍可能需要调 `adapters/chaoxing.js` 的 `SEL`**。面板「诊断」会打印当前命中的容器选择器与解析结果，先看它。
- 听力题、图片题、公式题（图片渲染的选择题）不解析；这类题会记为「未命中」。
- 若页面把题目放在跨域 iframe 里且 iframe 不在匹配范围内，需要补 `matches` 的域名。
- `host_permissions` 用了 `*://*/*` 以便支持任意自建/第三方 OpenAI 兼容端点；想收紧就改成只留自己的 API 域名。

## 许可

MIT，见 [LICENSE](LICENSE)。

## 免责声明

本项目是浏览器自动化/前端逆向的学习示例。使用者需自行确认所在学校与课程的学术规范；作者不对使用后果负责。
