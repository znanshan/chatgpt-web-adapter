# Event Observation Live Findings 003 — passive page: no token stream, bulk state sync

Status: `EVIDENCE`（有界实机观测；刻画"专用页面被动观看另一浏览器驱动的生成"时的真实传输形态，回填监控层 contract 依据）

## 观测场景与方法

实例 R04（专用 Chrome，conversation 6a995ec5）。生成由**用户自己的浏览器**在同一账号同一会话驱动（Bridge 零发送、零 browserless HTTP 读）。专用页面先空闲显示已完成内容；用户提示"刷新可看到"后，在 observer 持 debugger 状态下重载会话页，页面随即挂上进行中的生成。

采集：characterization recorder session `char-r04-xstream-1788520888`（约 5.4 分钟，2650 事件 / 511 342 bytes / 150 DOM 采样，本地存档 `.tmp/evidence-r04-xstream-20260904.json`，非 Git）；外部 4 秒采样器记录尾消息长度与 stop 控件（只记长度，不记内容）。

## 观察到的阶段序列（同一次生成）

| 阶段 | 时间窗口 | 观测事实 |
| --- | --- | --- |
| 空闲 | 采集前段 | 页面显示已完成消息 6..10（5 个 turn DOM），stop=false |
| 重载入流 | 刷新后 | 页面出现进行中状态：`stop=true`，尾消息进入流式更新 |
| 生成中（约 4–5 分钟） | | recorder DOM 采样 113 次中 108 次 `stop=true`（turns=5 恒定）；尾消息长度在小范围波动（666–686，疑似 thinking/状态标签计时器）；无 SSE event/path 令牌 |
| 内容到账 | 结束前 ~13 秒 | 尾消息长度 686 → **9258**（一次跳变，非逐 token 增长） |
| 完成 | 跳变后 ~10 秒 | `stop=false`（持续 4 次采样确认） |

## 传输形态结论

1. **被动页收不到 token 级流**：整个窗口内页面响应 mime 无一条 `text/event-stream`（349 application/javascript / 72 application/json / 无 SSE），也无 chatgpt 域 WebSocket 帧（仅 1 条 third-party `other_origin` WS，created+3 帧、298–371 bytes 心跳型）。token 流只发给**提交面**（提交页自身；finding 001/002 的 `text/event-stream` 记录均出自页面自己提交的回合）。
2. **被动页靠周期性大响应同步**：生成期间观测到 14 次 ~222 KB 的 loadingFinished（约每 10–15 秒一次，编码字节 119KB–236KB，空闲期为零）；内容以"跳变"形式出现在两次同步之间，最后一次同步（1788521162073）携带完成全文。这解释了"刷新后能看到、且能看到在动、但非逐字流"。
3. **生成状态对已加载页面可观测**：刷新加载的页面在生成期间 DOM stop 控件在场（recorder 探针 108/113 `stop=true`），结束转 `stop=false`——监控所需的"是否在生成/是否完成"判据可由页面 DOM 独立得到。
4. **中途开始的流不会自动挂到空闲页**：页面需重新加载/导航才会订阅进行中的生成（印证用户提示"看不到就刷新"）。这精化了主计划"外部变动捕获"规则：期望在飞回合时专用页面应主动（重新）加载目标会话；**被动视图的完成判据不能用流静止（finding 001/002 的判据只适用于提交面观测）**，而应是"批量同步停止 + DOM stop 控件释放 + 内容稳定"的合取。

## 开放项

- 归因同步端点：为 chatgpt 域大响应记录 content-free 的 URL path（不含 query）与响应体量，识别 ~222KB 状态同步的具体接口与 cadence 是否确定。
- 完成后的尾部行为：内容到账后是否还有一次收敛同步、stop 释放与 DOM 稳定时间差是否可作为通用完成窗口。
- 提交面 SSE 令牌结构（`/message/*`）的实机验证仍待一次页面自己提交的回合（recorder 的 `Network.streamResourceContent` SSE 路径捕获已就绪）。
