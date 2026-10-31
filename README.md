# Xiaoxin T3 Code · 小新定制版

**当前推荐正式版：Mac C31。** 修复新建会话回复不显示、运行详情卡住与空白草稿断连误报，并保留现有定制功能。

[下载当前推荐版 · macOS Apple Silicon](https://github.com/labixiaoxins/xiaoxin-t3code/releases/latest) · [C31 更新与已知限制](docs/community/c31/RELEASE.zh.md) · [English](README.en.md)

默认主线为 `main`。C31 是本社区分支的发行编号，内嵌官方版本标记仍为 0.1.5；不是上游 T3 的新版本号。

## 下载与使用

- **Mac Apple Silicon：** 从上方下载页获取 `Xiaoxin-T3-Code-C31-macOS-arm64.zip`，核对页面提供的 SHA-256。
- **Windows x64：** [C31-W1 测试版](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031) · [Windows 源码与示意图](https://github.com/labixiaoxins/xiaoxin-t3code/tree/community/windows-c31-w1)。Windows 测试版与 Mac 正式推荐版分别发布。
- 替换 Mac 应用前请结束任务并退出 T3，保留旧应用供回退。不要删除或重置聊天、登录和配置目录；各模型使用你自己的 CLI 与登录。
- Mac 包为 ad-hoc 签名，尚未经过 Apple 公证。适用平台、安装方法和验证范围见 C31 说明。

## 保留的工作台功能

- 跨模型额度常显、用量与费用入口。
- 产物预览、图片修改意见与版本对比。
- 任务步骤、侧栏进度、审批与工作状态中文显示。
- 中文设置、搜索、字体及输入框调整。
- macOS 界面和平台功能、磁盘管理与已有工作流。

## 验证与已知事项

当前下载包的应用文件与维护者在用 C31 逐文件一致。相同应用已经通过 Mac 新会话第一轮、同会话第二轮无需刷新回复，以及先前失败会话读回验证；本次发布副本另通过隔离启动、签名、ZIP 完整性和文件哈希核对。

233 个相关测试、20 项 React Compiler 检查、7 个包类型检查通过。源码仍有格式、lint 和 knip 遗留项，全部列在 [C31 说明](docs/community/c31/RELEASE.zh.md)。当前推荐发行状态不代表所有供应商、所有尺寸或所有场景均已验证。

## 历史与来源

旧版本仅保留作历史和回退参考，日常下载请使用页面顶部的当前推荐版。

[全部历史发行](https://github.com/labixiaoxins/xiaoxin-t3code/releases) · [C30 更新记录](docs/community/c30/RELEASE.zh.md) · [C29 更新记录](docs/community/c29/RELEASE.zh.md) · [C28 更新记录](docs/community/C28.md) · [上游 T3 Code](https://github.com/pingdotgg/t3code)
