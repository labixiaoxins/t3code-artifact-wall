# T3 Code · 小新定制版

基于 [T3 Code](https://github.com/pingdotgg/t3code) **官方 v0.1.1** 的个人定制分支。当前推荐 **C11 · 2026-10-24**，包含中文界面、成果面板、跨模型运行概览、续聊历史回看及额度常显。

**[下载当前推荐版本](https://github.com/labixiaoxins/t3code-artifact-wall/releases/latest)** · [安装与使用](docs/community/README.md) · [本版改动](docs/community/CHANGELOG.md)

这是独立社区分支，不代表 T3 Tools。下载包是工作台软件，**不含账号、订阅、API 密钥、聊天、项目、私人模型通道或配对凭据**。使用者需登录自己的模型账号，遵守对应平台规则。

## 当前功能

- **任务概览**：侧栏顶部“正在进行”汇总跨模型任务及子任务；最近访问、历史与归档、项目工具收进明确入口。
- **成果与历史**：成果面板、成果检查信息、续聊历史只读回看、草稿持久化与恢复提示。
- **额度常显**：聊天顶部显示主要账号的剩余额度，可选账号、窗口与顺序，默认 3 项、最多 4 项。只显示提供方实际支持的数据，无接口或失败时不伪造余额。
- **保留修复**：设置页大段留白修复、时间线及右面板切换 React #301 修复、中英文界面与导航优化。

## 直接使用

1. 在 [Releases](https://github.com/labixiaoxins/t3code-artifact-wall/releases/latest) 下载 `T3-Code-Xiaoxin-C11-macOS-arm64.zip`。当前仅提供 **Apple 芯片 Mac** 安装包，应用声明最低系统 macOS 13；没有 Windows、Intel Mac 或 Linux 安装包。
2. 解压后将 `T3 Code (Alpha).app` 放入“应用程序”。已有 T3 请先按[升级说明](docs/community/README.md#已有-t3-如何升级)备份并完全退出旧版，只运行一份应用。
3. 打开应用，在“设置 → 模型通道”连接自己的账号，再添加自己的项目。额度获取到可用数据后才会显示，可从聊天顶部额度入口打开“常显设置”。

本包使用社区临时签名，**没有 Apple 开发者公证**。首次打开可能需要在“系统设置 → 隐私与安全性”确认“仍要打开”。签名完整性校验通过不代表 Apple 公证，不需要关闭系统整体安全检查。

## 范围与限制

- 这是本机已验收的 **C11 定制版**，不追踪最新 nightly。官方更新可能覆盖定制；本包不带官方自动更新配置，请从本仓库更新。
- Codex、Claude、Grok、Antigravity 等额度取决于账号和提供方接口。Antigravity 可能是 Claude/GPT 共享周窗口，不是 Gemini 独享余额。APIyi、WorkBuddy、豆包没有通用余额覆盖。
- “常驻项目”按项目工作区提供；未包含此前未安装的 C6 单项常驻试验。T3 Notch/刘海、Nowdex、私人 Grok 网关、本机设备服务不在本包内。
- 接收者电脑上的首次登录、所有模型真实调用、跨系统构建及远程/设备控制仍需接收者验收。[查看验证范围](docs/community/README.md#验证范围)。

## 开发与许可

源码已同步为 v0.1.1 + C11 定制状态；分享包 ASAR 与正式 C11 相同，只移除了包外构建标记中的本机路径并重新临时签名。构建方式见[社区说明](docs/community/README.md#从源码运行)。

保留上游 [MIT License](LICENSE) 及第三方许可。[官方原始 README](README.upstream.md) 供参考，其中官方安装命令下载的是官方版本。
