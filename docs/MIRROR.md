# 双仓同步（GitHub ⇄ Gitee）

本仓库同时镜像到两处：

- GitHub：https://github.com/zeyret1223/chaoxing-pilot
- Gitee：https://gitee.com/zeyret/chaoxing-pilot

## 当前配置：一条命令推两端

`origin` 被配成了 **一个 fetch 地址 + 两个 push 地址**：

```
origin  https://github.com/zeyret1223/chaoxing-pilot.git  (fetch)
origin  https://github.com/zeyret1223/chaoxing-pilot.git  (push)   ← 第 1 个
origin  https://gitee.com/zeyret/chaoxing-pilot.git       (push)   ← 第 2 个
```

所以日常只需要：

```powershell
git add -A
git commit -m "改了什么"
git push          # 同时推到 GitHub 和 Gitee
```

查看当前配置：`git remote -v`

## 为什么不做「双向自动同步」

严格意义的双向（GitHub 改了自动进 Gitee，Gitee 改了自动进 GitHub）**能配，但不建议**，原因很实际：

| 方案 | 能双向吗 | 代价 |
|---|---|---|
| 本地 `git push` 双推（**当前采用**） | 单向写、两端同源 | 需要你在一台机器上推；不会冲突 |
| Gitee「仓库镜像」拉取模式（定时从 GitHub 拉） | GitHub → Gitee 自动 | 只有单向；Gitee 上的改动会被覆盖 |
| Gitee「仓库镜像」推送模式（定时推到 GitHub） | Gitee → GitHub 自动 | 需要在 Gitee 绑定 GitHub 账号；同样单向 |
| 两个方向都开 | 名义双向 | **两边各自定时推/拉，会互相覆盖**：A 端刚拉完，B 端又推过去，冲突只能人工修；force-push 有丢提交风险 |
| GitHub Actions / Gitee Go 互推 | 可双向 | 需要两端各放一个 token；冲突同样要手工解决 |

一句话：**双向自动同步在 git 里本质是"两个写者轮流向对方强推"**。除非两边都只由同一台机器写，否则一定会在某个时刻打架。

## 想更省事：让 Gitee 侧也自动跟上

1. 打开 https://gitee.com/zeyret/chaoxing-pilot/settings#mirror （仓库 → 管理 → 仓库镜像管理）
2. 「新建镜像」→ 方向选 **拉取（Pull）** → 填 GitHub 仓库地址
   - 公开仓库不需要填 GitHub 密码/Token；私有仓库才需要
3. 保存后，Gitee 会定期从 GitHub 拉取；也可以在页面上点「立即同步」

这样：GitHub 是唯一写入口（你用 `git push` 写），Gitee 自动跟随。**这是最稳的"镜像"形态**。

## 常见问题

**Q：Gitee 上改了东西，会不会被 GitHub 覆盖？**
会。拉取镜像模式下 Gitee 是只读的副本，本地强推/定时覆盖都会盖掉。要改就在本地改，然后 `git push`。

**Q：两边提交历史不一致了怎么办？**
```powershell
git fetch origin
git log --oneline --graph --all -20     # 先看清楚分叉
# 一般做法：以 GitHub 为准
git push --force-with-lease gitee main   # 用 GitHub 覆盖 Gitee（比 --force 安全）
```

**Q：换一台电脑怎么恢复这套配置？**
```powershell
git clone https://github.com/zeyret1223/chaoxing-pilot.git
cd chaoxing-pilot
git remote set-url --add --push origin https://github.com/zeyret1223/chaoxing-pilot.git
git remote set-url --add --push origin https://gitee.com/zeyret/chaoxing-pilot.git
```

（`git clone` 只会拿到一个 push 地址，所以第二条命令要重跑一次。）

**Q：Release 里的 zip 会同步到 Gitee 吗？**
不会。Release / 附件属于平台侧功能，只存在于 GitHub。Gitee 上有「发行版」但需要单独创建——不过 Gitee 的发行版支持直接上传文件，需要的话我可以再发一份。
