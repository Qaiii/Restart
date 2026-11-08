# dsh-restart

DeepSeek Harness 桌面版的重启插件：侧边栏「更多」菜单里一行 **重启**，加上输入框命令 **`/restart`**，两条入口走同一个受保护的重启动作。

- **菜单**：侧边栏底部 `⋮`（更多）菜单 → 「重启 / Restart」。
- **命令**：输入 `/restart` 回车即可；它作为**客户端命令贡献**出现在 `/` 斜杠菜单的「指令」区，格式与内置命令一致：图标 + 本地化名称（重启）+ `restart` 别名 + 说明。执行不提交消息，失败（例如有任务在跑）会在输入框上方弹出一条本地化提示。
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

## 多语言

界面文案跟随 UI 语言（Settings → General → Language，未设置时用浏览器语言），覆盖 web client 内置的 8 种语言：`en`、`zh`、`ja`、`es`、`fr`、`de`、`ru`、`pt`。

- 侧边栏「更多」菜单里的行文案（重启 / Restart / 再起動 / Reiniciar / Redémarrer / Neustart / Перезапуск / Reiniciar）、「重启中…」「重启失败：」以及各类失败原因；
- `/` 菜单里 `/restart` 行的名称、别名与说明由浏览器半每帧按当前语言生成；浏览器仍会把当前语言 POST 到 `/api/dsh-restart/locale`，Host 用它本地化路由返回的错误文案；
- `/restart` 的错误文案（忙碌、已在重启、非桌面版、非 Windows、助手启动失败）按同一语言给出；
- 插件列表里的标题与描述（`locale/*.json`，8 个文件）；
- `/restart` 成功后的会话执行记录（不带固定文案，由客户端渲染本地化的「已执行」）。

命令名 `restart` 本身是 DSH 命令语法要求的小写 ASCII，缩写形式 `/restart` 不变，只是描述和提示语本地化。

多语言文案分别放在两处：浏览器半的 `client.js` 字典（经 `ctx.locale.register`）与 Host 半的 `messages.js` 表（命令描述与错误文案）。

## 行为与保护

- 仅在 **Windows 桌面版**（Electron 宿主）可用；纯 `dsh web` / CLI 里执行 `/restart` 会返回错误文案，不会重启。
- **有任务正在运行**（任意会话的 Agent 处于 running）时拒绝重启，返回「有 N 个任务正在运行，已取消重启」。
- 重启进行中再次触发返回「重启已在进行中」。
- 强制结束主进程：正在进行的 turn 会被中断；会话日志按事件落盘，重启后会话仍在。
- 重启助手拉起失败时**不会**再启动第二个实例（避免单实例锁/端口冲突），失败信息写入日志，可手动重开应用。

## 实现

- `index.js`（Host 半）：只注册两个路由 `POST /api/dsh-restart/restart`、`POST /api/dsh-restart/locale`；重启路由与侧边栏行共用一个 `requestRestart()`，依次做平台判定、忙碌守卫、拉起 helper，成功后 1.2s 让宿主进程退出。斜杠命令由浏览器半注册（`commandUi.register`），因此不需要 Host 命令目录，也能获得图标与本地化展示面。
- `messages.js`：Host 侧 8 种语言的命令描述与错误文案表，`normalizeLanguage()` 把 `zh-CN`、`pt-BR` 之类归一到受支持的语言。
- `restart.js`：`detectHost()` 判定宿主；`buildHelperSource()` 生成一个自包含的 Node 脚本；`spawnRestartHelper()` 以 `ELECTRON_RUN_AS_NODE=1`、detached 方式拉起它，并先确认 helper 存活 400ms 才算重启已排期。
- helper 时序：500ms 后 `SIGKILL` Electron 主进程 → 等主进程消失（最多 10s，未消失则放弃、绝不拉起新实例）→ 结束残留宿主进程 → 等 500ms 让单实例锁释放 → 以去掉 `ELECTRON_RUN_AS_NODE` 的环境启动应用（最多重试 3 次）。
- `client.js`（浏览器半）：往 `sidebar.panellist.actions` 注册一行 `MenuItemButton`；通过 `ctx.commandUi.register` 注册 `/restart` 客户端命令贡献（图标 `IconRefreshOutlineRegular`、本地化 label/description；label 与命令名不同，菜单会自动把 `restart` 显示为别名），动作 POST 重启路由；失败时用输入框上方的瞬态 toast（挂在 `conversation.input.overlay`）展示本地化错误；8 种语言的字典通过 `ctx.locale.register` 注册，并监听语言变化上报给 Host。

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

已知限制：DeepSeek Harness 桌面版 Windows 标题栏那个原生菜单（application / edit）由 Electron 主进程写死，插件无法往里加项，所以菜单入口放在侧边栏「更多」菜单；命令名只接受小写，写作 `/restart`。


