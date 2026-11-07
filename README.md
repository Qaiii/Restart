# dsh-restart

DeepSeek Harness 桌面版的重启插件：侧边栏「更多」菜单里一行 **重启**，加上输入框命令 **`/restart`**，两条入口走同一个受保护的重启动作。

- **菜单**：侧边栏底部 `⋮`（更多）菜单 → 「重启 / Restart」。
- **命令**：输入 `/restart` 回车，会话里只出现一条命令结果「正在重启 DSH…」，不会变成模型消息；该命令同时出现在 `/` 斜杠菜单的 Commands 区。
- 重启 = 结束旧的桌面版进程树，等单实例锁释放后拉起同一个可执行文件，窗口自动回来。

## 安装（桌面版）

从 GitHub 仓库安装：

```powershell
dsh plugin --profile desktop add -w github:Qaiii/Restart
```

或：侧边栏 **Plugins → Add plugin**，spec 填 `https://github.com/Qaiii/Restart`（安装并启用 bundle）。

本地开发拷贝（直接链接本目录）：

```powershell
dsh plugin --profile desktop add -w D:\CodeProject\Deepseek-Harness-Plugins\ReStart
```

安装后浏览器半通常需要刷新一次页面才会出现菜单行。

## 用法

1. 侧边栏 `⋮` → 「重启」。
2. 输入框输入 `/restart` 回车。

## 行为与保护

- 仅在 **Windows 桌面版**（Electron 宿主）可用；纯 `dsh web` / CLI 里执行 `/restart` 会返回错误文案，不会重启。
- **有任务正在运行**（任意会话的 Agent 处于 running）时拒绝重启，返回「有 N 个任务正在运行，已取消重启」。
- 重启进行中再次触发返回「重启已在进行中」。
- 强制结束主进程：正在进行的 turn 会被中断；会话日志按事件落盘，重启后会话仍在。
- 重启助手拉起失败时**不会**再启动第二个实例（避免单实例锁/端口冲突），失败信息写入日志，可手动重开应用。

## 实现

- `index.js`（Host 半）：注册 `/restart` 命令与 `POST /api/dsh-restart/restart` 路由；两者共用一个 `requestRestart()`，依次做平台判定、忙碌守卫、拉起 helper，成功后 1.2s 让宿主进程退出。
- `restart.js`：`detectHost()` 判定宿主；`buildHelperSource()` 生成一个自包含的 Node 脚本；`spawnRestartHelper()` 以 `ELECTRON_RUN_AS_NODE=1`、detached 方式拉起它，并先确认 helper 存活 400ms 才算重启已排期。
- helper 时序：500ms 后 `SIGKILL` Electron 主进程 → 等主进程消失（最多 10s，未消失则放弃、绝不拉起新实例）→ 结束残留宿主进程 → 等 500ms 让单实例锁释放 → 以去掉 `ELECTRON_RUN_AS_NODE` 的环境启动应用（最多重试 3 次）。
- `client.js`（浏览器半）：只往 `sidebar.panellist.actions` 注册一行 `MenuItemButton`，POST 上面的路由；失败时把错误文案换到该行上，菜单保持打开以便重试。

## 日志

助手把每一步追加到：

```
%TEMP%\dsh-restart.log
```

重启没有成功时先看这里。

## 开发

无构建、无依赖：

```powershell
node --check index.js; node --check restart.js; node --check client.js
node --test --test-isolation=none tests/*.test.mjs
```

已知限制：DSH 桌面版 Windows 标题栏那个原生菜单（application / edit）由 Electron 主进程写死，插件无法往里加项，所以菜单入口放在侧边栏「更多」菜单；命令名只接受小写，写作 `/restart`。
