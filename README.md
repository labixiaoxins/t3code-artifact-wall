# Xiaoxin T3 Code · 小新定制版

**当前推荐正式版：Mac C31。** 修复新建会话回复不显示、运行详情卡住与空白草稿断连误报，并保留现有定制功能。

[下载当前推荐版 · macOS Apple Silicon](https://github.com/labixiaoxins/xiaoxin-t3code/releases/latest) · [C31 更新与已知限制](docs/community/c31/RELEASE.zh.md) · [English](README.en.md)

默认主线为 `main`。C31 是本社区分支的发行编号，内嵌官方版本标记仍为 0.1.5；不是上游 T3 的新版本号。

<a id="feature-showcase"></a>

<!-- showcase:overview -->

![Mac 工作台总览：额度、图片反馈与任务进度](assets/community/showcase/01-workbench-overview.png)

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

- **Mac Apple Silicon：** 从上方下载页获取 `Xiaoxin-T3-Code-C31-macOS-arm64.zip`，核对页面提供的 SHA-256。
- **Windows x64：** [C31-W1 测试版](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031) · [Windows 源码与示意图](https://github.com/labixiaoxins/xiaoxin-t3code/tree/community/windows-c31-w1)。Windows 测试版与 Mac 正式推荐版分别发布。
- 替换 Mac 应用前请结束任务并退出 T3，保留旧应用供回退。不要删除或重置聊天、登录和配置目录；各模型使用你自己的 CLI 与登录。
- Mac 包为 ad-hoc 签名，尚未经过 Apple 公证。适用平台、安装方法和验证范围见 C31 说明。

## 验证与已知事项

当前下载包的应用文件与维护者在用 C31 逐文件一致。相同应用已经通过 Mac 新会话第一轮、同会话第二轮无需刷新回复，以及先前失败会话读回验证；本次发布副本另通过隔离启动、签名、ZIP 完整性和文件哈希核对。

233 个相关测试、20 项 React Compiler 检查、7 个包类型检查通过。源码仍有格式、lint 和 knip 遗留项，全部列在 [C31 说明](docs/community/c31/RELEASE.zh.md)。当前推荐发行状态不代表所有供应商、所有尺寸或所有场景均已验证。

## 历史与来源

旧版本仅保留作历史和回退参考，日常下载请使用页面顶部的当前推荐版。

[全部历史发行](https://github.com/labixiaoxins/xiaoxin-t3code/releases) · [C30 更新记录](docs/community/c30/RELEASE.zh.md) · [C29 更新记录](docs/community/c29/RELEASE.zh.md) · [C28 更新记录](docs/community/C28.md) · [上游 T3 Code](https://github.com/pingdotgg/t3code)
