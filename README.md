# Xiaoxin T3 Code · 小新定制版

**当前 Windows 测试版：C31-W1。** 沿用官方简洁布局，保留额度、任务进度、产物反馈和中文工作台。Mac 正式推荐版继续由 `main` 维护。

[下载 Windows 测试版](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031) · [Windows 说明与限制](docs/community/windows-c31-w1/RELEASE.zh.md) · [Mac 正式版](https://github.com/labixiaoxins/xiaoxin-t3code/releases/latest) · [English](README.en.md)

C31-W1 是社区测试编号，内嵌官方版本标记仍为 0.1.5。本分支维护 Windows 测试界面。

<a id="feature-showcase"></a>

<!-- showcase:overview -->

![Windows 工作台总览：额度与任务进度](assets/community/showcase/03-task-progress.png)

_功能布局示意，全部为示例内容；不作为实机验收截图。_

## 特色功能，看图了解

图片直接展示，点击可放大。总览、额度、任务和产物图为布局示意；上下文与模型菜单为组件预览；费用、磁盘与设置图为已公开的隔离环境截图。部分图来自之前版本，用于展示保留的功能，具体来源随图标注。

<!-- showcase:allowances -->

### 跨模型额度常显

把常用模型的剩余额度放在右上角，展开查看各账号、窗口与重置时间。不同供应商的时间窗口各自保留。

![跨模型额度常显与展开详情](assets/community/showcase/02-allowances.png)

_Windows 布局示意、示例数值；实际窗口以供应商返回为准。_

<!-- showcase:progress -->

### 任务步骤与侧栏进度

侧栏直接看到完成数和当前阶段，运行面板查看完整步骤，区分执行中、等待确认与已完成。

![任务步骤与侧栏进度](assets/community/showcase/03-task-progress.png)

_Windows 布局示意；任务和进度均为示例，Mac 保留 macOS 外观。_

<!-- showcase:artifacts -->

### 产物预览、图片对比与修改意见

集中查看产物，比较原图与修改预览。修改意见先整理为草稿，由你发送后继续处理。

![产物预览、版本对比和图片反馈草稿](assets/community/showcase/04-artifacts-feedback.png)

_Windows 功能布局示意，使用合成图片；不代表图中的返工已经实际执行。_

<!-- showcase:context -->

### 长会话上下文

优先显示上下文占用和续聊操作，需要时再展开运行细节。

![紧凑的上下文面板与续聊操作](assets/community/c28/03-context.png)

_已有源码组件预览，使用示例数据；外围输入框是预览框架。_

<!-- showcase:models -->

### 更紧凑的模型选择

保留模型搜索、收藏和切换，减少模型菜单底部的常驻设置。

![模型搜索、收藏与紧凑选择菜单](assets/community/c28/04-model-picker.png)

_已有源码组件预览；可选模型以实际通道为准。_

<!-- showcase:usage -->

### 用量、费用与令牌各自清楚

按时间和模型查看用量，费用模式与令牌模式使用各自的指标和占比。

![费用、模型占比和令牌明细](assets/community/c28/01-cost.png)

_C28 隔离环境实拍，使用合成用量；金额为 API 估算，不是订阅账单或扣款记录。_

<!-- showcase:storage -->

### 有范围的磁盘整理

按磁盘和类别查看工作区、依赖、构建产物与日志，先检查和预览具体计划，再处理符合条件的项目。

![按类别检查磁盘占用与整理计划](assets/community/c28/02-storage.png)

_C28 隔离环境实拍，目录为测试数据；占用不等于可释放量。归档执行器目前支持 macOS。_

<!-- showcase:settings -->

### 中文设置与清晰的功能分区

中文分类、搜索和动态说明覆盖日常设置，也可切换英文；外观和字体等调整继续保留。

![中文设置与功能分区](docs/community/c30/settings-zh.png)

_C30 已公开的隔离环境截图，作为现有中文设置的展示。_

## 下载与使用

- 下载 `Xiaoxin-T3-C31-W1-win-x64.zip`，解压到固定文件夹，用 `Start-Xiaoxin-T3.cmd` 启动。程序与窗口配置使用独立测试数据目录。
- Codex CLI 至少需要 0.159.0；本机验证使用独立的官方 0.166.0，没有替换全局 CLI。其他供应商使用你自己的 CLI 与登录。
- [Windows 下载与完整说明](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031) · [Mac 正式推荐版](https://github.com/labixiaoxins/xiaoxin-t3code/releases/latest)。

## 验证与已知事项

Windows 程序、SQLite 和服务端已在 Windows 11 x64 启动验证；通过连接 Windows 后端的浏览器界面，第一轮与同会话第二轮回复均无需刷新显示。原生 Windows 窗口观感、缩放和全部供应商仍待进一步验收。

Mac 专用外盘归档/恢复 worker 与刘海工具尚未移植到 Windows。这里的磁盘、设置截图来自已公开的 Mac 隔离环境，作为对应功能的展示；具体可用范围以 Windows 发布说明为准。

## 历史与来源

[全部历史发行](https://github.com/labixiaoxins/xiaoxin-t3code/releases) · [Mac 主线](https://github.com/labixiaoxins/xiaoxin-t3code/tree/main) · [上游 T3 Code](https://github.com/pingdotgg/t3code)
