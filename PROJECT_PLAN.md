# Re:Material 功能型 MVP 项目计划

> 状态（2026-09-23）：A 端、B 端浏览/预约/取消/过期均保留；本轮接通 Pickup Guide → Zone 相机扫码 → 材料编号确认 → 领取、问题报告及领取后 24 小时整笔退回。
> 本节为当前交付事实，优先于下文完整 MVP 路线图。发布者报告处理已补全；收藏、兴趣推荐等仍未实现。
> 英文界面、402px 移动端画布及原有用户、材料、积分与上传图片均保留；本轮不做双语、视觉大改、演示图片或部署。

## 本轮新增：认证入口与发布者报告处理

- Login / Create Account 页面隐藏全局顶部右侧的访客 Log in 链接；表单提交按钮、其他页面登录入口、已登录 credits 与导航不变。
- Profile 与 My Posts 显示 Action required 和待处理报告数量。对应材料报告卡展示 Needs Review、原因、说明、问题照片、报告时间，以及 This material is temporarily hidden from Explore.
- Review and relist 仅供材料发布者操作。可修改当前可用数量、Condition、Notes 和 1–3 张 placement photo；可保留当前摆放图，或上传本人的新图。必须确认已到 Hub 实地检查。数量表示货架当前实际可用总量，不包括仍由领取者持有的数量，不能把旧库存再加一次；无可用材料应选择 Remove material。
- 提交以 SQLite BEGIN IMMEDIATE 原子设置实际库存、Available、资料、摆放照片与 issue resolved / relisted。版本校验防止旧表单覆盖期间发生的退回等变化。原 initial_quantity、编号、入库时间、旧照片和审计记录保留。
- Remove material 需要第二次确认；沿用数据库 closed 状态，界面显示 Removed / Archived，设置 closed_at，不删除材料或图片，不提供撤销归档入口。旧领取者仍可按原 24 小时规则退回，但不会使归档材料重新上架。
- 重新上架/移除均以报告 ID 防重；重复请求不再次改库存、状态或积分，已处理报告不能切换处理结果。旧报告重放不会覆盖后来预约或新报告。
- B 的预约状态继续为 Issue Reported，显示 Issue resolved — relisted / Issue resolved — removed。B 的 1 credit 仍在提交报告时立即释放一次，A 处理不消费、不返还、不奖励积分。
- 仅使用现有用户页面提示，不创建复杂通知中心、管理员后台、短信或邮件。旧 Demo 材料归属于不可登录的演示账户，没有真实发布者；报告后继续 Needs Review/隐藏，不转交普通用户处理。
- v6 只为 material_photos 新增可空 review_issue_id，区分每次审核后的摆放照片批次；不迁移或删除既有图片。显示最新确认批次，旧存放/退回/审核照片保留。
- 本轮最终验证：后端 **38/38**、浏览器 **13/13**，TypeScript --noEmit 与 Vite 生产构建通过。包含全部原 A/B 回归和新增报告权限、数量/照片校验、版本冲突、事务回滚、重新上架/归档、防重复、刷新/重启持久化及演示归属测试；浏览器实际操作两种处理流程并核对 B 结果。新增测试使用独立临时 SQLite 和 uploads；未用真实用户/材料/图片做测试。截图保存在 test-results/review-*.png。

人工验证：

1. 退出登录，分别打开 /login、/register，确认顶部没有重复 Log in，表单按钮仍正常；回 Explore 确认顶部访客登录入口存在。
2. B 对 A 的真实材料报告问题；A 登录后在 Profile / My Posts 检查 Action required、数量及报告完整内容。
3. Review and relist → 核实并修改数量、Condition、Notes、摆放图 → 勾选在 Hub 检查 → Confirm relist。检查 Explore 恢复，A/B 积分不再变化，B 显示 Issue resolved — relisted。
4. 对另一条问题材料选择 Remove material → 先 Keep material 验证取消 → 再 Yes, remove material。检查 Removed / Archived、Explore 隐藏，B 显示 Issue resolved — removed。
5. 刷新/重新登录确认处理结果保留；用非发布者账户不能打开处理页面或提交处理。

## 已保留的 A/B 交付边界

- 保留 SQLite Explore、照片详情、搜索、Category / Condition / Availability 筛选、Recently Added 和按最新可用材料推荐。预约数量继续只允许 1 或 2；整条材料锁定，预约时不预扣 stock_quantity。
- 预约仍冻结 1 credit；取消释放，24 小时到期正式消费。到期处理继续在服务启动、每 30 秒及 API 请求前运行。
- Profile → My Reservations → Active reservation 可进入 Pickup Guide，包含 Hub 位置/开放时间明确占位、路线图/现场照片占位、预约数量、Zone、编号和最新 placement photo。
- I’m at the Hub 打开相机；只允许相机扫描，无手动 Zone 输入。复用 /zone-codes。错误 QR 留在扫码页面，业务状态/库存/积分不变；正确 QR 的验证保存在 SQLite。
- Check Material 展示摆放图、名称、编号、预约数量、尺寸、Condition、Zone。用户手输完整 M001 格式标签编号，错误编号不改业务数据；正确后询问 Does this material match the listing?。为支持材料缺失/拿错且无法读到标签的情况，也提供直接问题报告入口，但仍要求正确 Zone。
- Yes, take this material 使用 BEGIN IMMEDIATE 事务：预约 Collected，扣本次数量，剩余大于 0 时材料 Available、否则 Collected；balance −1 / held −1 是结算原冻结积分，可用积分不会再扣一次。唯一结算流水和终态检查保证重复领取不重复记账。Pickup completed → Done 回 Explore。
- 报告原因：Material is missing、Wrong material、Damaged、Does not match the listing、Other。Other 必须说明，其余选填；问题照片 0–3 张。提交事务使预约 Issue Reported、材料 Needs Review（数据库沿用 unavailable）、释放被冻结的 1 credit 一次，并写 A 端 Activity。My Posts 显示原因，材料记录可查看说明和照片；B 端可查看 Open 状态。
- **问题库存规则：保留 stock_quantity，不扣减、不补加；冻结整条记录的可预约性（available quantity 为 0），Explore 所有筛选均隐藏 Needs Review。** 缺失/损坏的实际数量无法在报告时可靠确定，不能把未核实数量重新开放。报告结束预约，不再过期扣分。保持暂停，直到发布者按文首的新处理流程实地核实并重新上架或归档。
- Collected 后 24 小时内显示 Return Material，按 completed_at 起算，服务端在开始、扫码、保存照片和最终确认时检查期限；截止时刻及之后拒绝，打开页面不能延长期限。仅支持退回本次整笔 collected_quantity。
- Return Guide → 重新扫描原 Zone（验证与领取独立）→ 上传 1–3 张新摆放照片 → 确认放回正确位置。退回草稿、扫码和照片关联保存到数据库，可刷新/重新登录恢复；确认勾选需重新做。标签输入不自动填充，Check Material 重开后需再次输入。
- 退回事务：Collected → Returned、库存增加本次 collected_quantity、更新当前 placement photo、balance +1 返还一次；不增加 A 存放奖励。重复点击、刷新、重放请求均不再次增加库存/积分。旧摆放照片及文件保留，只把最新一次确认的摆放照片作为当前展示。
- **退回交叉状态：后来存在有效预约时保持 Reserved；已有 Needs Review 或 Closed 时继续保持锁定。** 只恢复退回数量，不取消后来预约，不重新开放异常材料。正常无其他锁定时恢复 Available。My Posts 和 Explore 从共用 SQLite 读取，页面重新进入/获得焦点刷新，列表也定时刷新（10–15 秒；不是推送）。
- v5 仅新增 issue_reports.reason_label、issue_photos、return_photos，复用既有 reservations / returns / 流水表和唯一约束，不重建数据库、不删除/重写既有图片。五种英文原因通过新增 reason_label 区分，兼容原 reason 枚举。

### 上一轮验证与人工验收（本轮新增结果见文首）

后端重新执行 **30/30 通过**，覆盖原 19 项回归与新增领取/问题/退回：正确/错误扫码、错误编号、部分/全部领取、重复领取、五类报告、唯一释放、超时退回、重复退回、后来预约/审核/关闭锁定、越权/照片归属、事务回滚，以及重启/重新登录持久化。故意注入的五类回滚错误日志是测试用例的预期输出。

最终结果：后端 **30/30**，浏览器 **10/10**（原 7 项 + 本轮 3 项），TypeScript --noEmit 与 Vite 生产构建均通过。浏览器确认扫码错误不放行、正确扫码后完整页面跳转、错误编号、领取成功、重复领取/退回、报告隐藏、重新登录恢复领取时间/报告/退回照片；包括 UI 双击和额外请求重放。修复了路由切换时旧预约状态导致成功页被重定向的问题，并明确关联报告原因的 label/select。最终全套无重试通过；此前首次页面加载超时在完整重跑中消除。

测试隔离：后端使用 OS 临时目录独立 SQLite；新增测试同时使用独立 uploads。Playwright 在 13001/15173 启动独立临时 SQLite 和 uploads，不复用真实预览。相机测试将错误/正确 QR 图像作为浏览器相机视频输入，由应用实际 getUserMedia + ZXing 解码，再操作页面完成领取/报告/退回；不是以接口调用代替扫码。API 仅用于测试准备、读取断言和重复请求重放。截图在 test-results/，包括 320/402/1440px 的 Check Material 和 402px 指引、退回、报告、A 端 Needs Review。

人工验收：

1. A 账户按原流程存放至少 2 units；B 账户预约其中 1 unit。
2. Profile → My Reservations → Active → View pickup guide，查看占位信息与摆放照片。在另一屏打开 localhost:5173/zone-codes。
3. I’m at the Hub → 允许相机，先扫错误 Zone（留在扫码页），再扫正确 Zone → Check Material。先输入错误编号，再输入材料标签正确编号。
4. Yes, take this material → Pickup completed → Done。检查 B 预约 Collected、A 库存少 1、B held 清零且 available 不再次下降；刷新/重新登录状态和领取时间不变。
5. 24 小时内打开该预约 → Return Material → Return Guide → 扫原 Zone → 上传新照片 → 勾选整笔放回 → Confirm return。My Reservations 显示 Returned，库存恢复、返还 1 credit。重复操作不增加第二次。
6. 另建一笔预约，扫码/核对后 No, report a problem → 选择原因（Other 必填说明）→ 可选照片 → 提交。检查 Issue Reported / Open、积分释放、Explore 搜不到该材料，A 的 My Posts 显示 Needs Review 和原因。
7. 24 小时截止边界由独立后端测试推进测试数据库时间验证，不修改真实数据等待或伪造时间。

### 未完成且本轮停止范围

- 真实 Hub 地址、开放时间、路线和现场照片仍明确占位。
- 管理员后台未开发；真实发布者已可处理报告，旧演示账户材料没有可登录的发布者，继续保持 Needs Review。
- 收藏/分享、兴趣推荐、Activity 已读管理、部分数量退回属于后续范围。
- 不启用双语，不改视觉系统，不生成新演示图片，不部署。

## 1. 项目范围与验收环境

交付目标是前端与简单后端均可运行、A/B 两条核心流程能真实走通的功能型 MVP，以 localhost 本地运行和演示为主要验收方式。账户、库存、预约、图片和积分应持久化，不能仅靠页面跳转或浏览器假数据模拟完成。

首版包含注册登录、材料登记与存放、搜索与推荐、部分数量预约与领取、取消与过期、问题上报与提供者处理、领取后退回、收藏分享、个人记录及站内活动通知。保留未来部署能力，目前不要求生产级云部署、短信、邮箱验证、正式对象存储或复杂管理员后台。不包含现金支付、聊天、多校区管理或复杂 AI 推荐。

参考资料保留在 `references`：A 端放材料流程、B 端拿材料流程及老师要求图。首页与 Explore 合并，底部导航使用 `Explore`、`Share Material`、`Profile`。文档继续用中文解释，但页面标题、字段、按钮、状态、提示、校验与错误信息全部使用英文。

Material Hub 的真实校内位置、开放时间、教室/区域照片和路线图尚未提供，使用明确标记的英文占位内容及占位图，不虚构真实地点。最终素材与视觉风格不阻塞基础开发。

## 2. 已确认的产品规则

### 2.1 账户、数量与积分

| 项目 | 已确认规则 |
| --- | --- |
| 注册与登录 | Username + Password；不使用手机号、邮箱、验证码或找回密码。Username 唯一，密码哈希存储 |
| 注册积分 | 注册成功一次性获得 2 credits；同一账户重复注册或重复请求不能重复奖励 |
| A 端奖励 | 每条材料完成一次存放奖励 1 credit，与数量无关；登记、扫码、退回均不增加存放奖励 |
| 预约数量 | 一条材料记录包含多个相同 Unit；用户预约时选择数量，可领取部分或全部 |
| 预约成本 | 每次预约固定 1 credit，不按数量计费；确认预约成功后冻结，正常领取后正式使用 |
| 预约锁定 | 有效预约期间锁定整条材料记录，即使只预约部分数量，其他用户也不能预约该记录 |
| 保留时间 | 从预约成功时起 24 小时，按服务端时间计算；必须在截止时间前确认领取 |
| 部分领取 | 确认领取后扣减本次领取数量；剩余数量大于 0 时重新 Available，全部领取后材料 Collected |
| 领取前取消 | 主动取消或不合适放回后取消，立即释放冻结的 1 credit，材料恢复 Available；在 A 端 Activity 通知提供者 |
| 预约过期 | 预约 Expired，冻结的 1 credit 正式扣除，材料恢复 Available；必须生成流水 |
| 问题上报 | 有效预约转 Issue reported，释放冻结的 1 credit，材料 Unavailable；提供者检查后恢复或结束记录 |
| 领取后退回 | 领取完成后 24 小时内，退回本次实际领取的数量并确认后返还 1 credit；每次已完成预约最多一条 Return |
| 现金价格 | 不显示现金价格，详情和预约页显示 1 credit；购买/参考链接是资料字段 |
| 本人材料 | 保留原规划：用户不能预约自己发布的材料 |

### 2.2 A2 字段与图片

| 英文字段 | 要求 |
| --- | --- |
| Material name | 必填 |
| Category | 必选，七个类别见 2.3 |
| Custom category name | Category 为 Other 时必填；仍归入 Other Zone |
| Quantity | 必填，首版以同一 Unit 的正整数计数；例如 2 sheets |
| Unit | 必填，同一记录保持相同单位 |
| Dimensions / specifications | 必填；难以填写尺寸的小物品可明确选择 Not applicable，保存为独立标记，不要求伪造尺寸 |
| Color | 必填，用于展示与筛选 |
| Condition | 必填，材料使用状态，与库存状态分开 |
| Material photos | 必填，1–9 张，第一张为封面图 |
| Purchase / reference link | 选填，允许安全的网页链接 |
| Notes | 选填，参与关键词搜索 |

| 图片用途 | 数量 | 格式与大小 | 获取方式 |
| --- | --- | --- | --- |
| A2 材料图片 | 1–9 张，第一张为封面 | JPG、JPEG、PNG、WebP，单张最大 10MB | 拍照或相册选择 |
| A6 摆放照片 | 1–3 张，完成存放前必须上传成功 | JPG、JPEG、PNG、WebP，单张最大 10MB | 现场拍照或相册选择 |
| 正式退回的新摆放照片 | 1–3 张，确认退回前必须上传成功，不复用旧照片提交 | 首版复用摆放照片的格式和大小限制 | 拍照或相册选择 |

首版不支持视频。前后端均校验文件实际类型、大小、数量和图片归属；支持预览、移除、排序、失败重试。A6 和退回照片用于帮助后续用户在 Zone 内寻找材料，不代替实物编号核对。具体 Condition、Color、Unit 选项可在开发时配置为英文选项或输入控件，不改变必填规则。

### 2.3 Category、Zone 与实体标签

七个类别分别对应同名 Zone。Other 的自定义类别名称不创建新 Zone。二维码包含区域识别文本，不是网页链接；以下后缀作为首版稳定标识规划。

| Category / Zone | QR 内容 |
| --- | --- |
| Board & Foam | `REMATERIAL\|ZONE\|BOARD_FOAM` |
| Paper & Sheet | `REMATERIAL\|ZONE\|PAPER_SHEET` |
| Fabric & Textile | `REMATERIAL\|ZONE\|FABRIC_TEXTILE` |
| Wood | `REMATERIAL\|ZONE\|WOOD` |
| Plastic & Acrylic | `REMATERIAL\|ZONE\|PLASTIC_ACRYLIC` |
| Cables, Buttons & Small Items | `REMATERIAL\|ZONE\|CABLES_BUTTONS_SMALL_ITEMS` |
| Other | `REMATERIAL\|ZONE\|OTHER` |

表格中的竖线为 Markdown 转义，真实二维码内容例如 `REMATERIAL|ZONE|BOARD_FOAM`，不含反斜线。每个 Zone 一个二维码；A 端按 Category 对应的 Zone 校验，B 端按预约材料区域校验，退回按本次领取时的原 Zone 校验。

只允许相机扫码，不提供手动输入 Zone code 的替代方式。错误或未知二维码提示正确 Zone 并禁止继续；拒绝相机权限时使用英文提示用户开启权限后重试。材料编号输入与 Zone QR 校验是不同步骤。

材料编号由服务端依次生成，格式为 M001、M002、M003，保持唯一且不复用。数字至少三位，超过三位自然扩展，避免编号耗尽。Material Hub 提供空白标签，A 用户按页面显示的编号手写并贴在材料或包装上；至少写完整材料编号，可附材料简称和数量。单个材料不使用独立二维码。部分领取或退回不生成新材料编号，剩余材料和退回材料沿用同一编号。

## 3. 完整 MVP 页面路线图（是否已交付以文首为准）

路由为实施规划，可在开发时调整。A 端只有三个总体阶段：`Add information` → `Go to the Hub` → `Drop off material`。七页不代表七个进度步骤，A4 和 A6 的三段指引也不是新的总体阶段。

### 3.1 A 端——材料提供者

| 页面 / 规划路由 | 内容 | 操作与去向 |
| --- | --- | --- |
| A1 Share Material `/deposit` | 三个可展开阶段，每项包含说明与按钮，后续按钮按进度解锁 | Start now → A2；Navigate to hub → A4；Start drop-off → A5，已有有效区域验证时恢复 A6 |
| A2 Add Information `/deposit/new` | 顶部材料图片区，下方 2.2 中全部字段；顶部进度显示第一阶段 | Next 保存登记并进入 A3；新登记生成唯一编号，编辑保存保持原编号 |
| A3 Material Recorded `/deposits/:id` | M001 等编号、图片和全部已填信息、Ready for drop-off，明确尚未入库且未得积分 | Edit information → A2；View drop-off guide → A4；I’m at the Hub 记录到达并进入 A5；有效扫码进度恢复规则见 4.1 |
| A4 Drop-off Guide `/deposits/:id/guide` | 三段图文：前往 Material Hub 的位置/路线；找到同名 Zone 的区域照片；认识 Zone QR 及扫码说明 | I’m at the Hub 完成第二阶段并进入 A5；已有有效验证时进入 A6 |
| A5 Scan Zone `/scan`（存放任务） | 相机扫码区，显示目标 Zone，权限提示和重试 | 扫描正确 Zone 后保存验证并直接进入 A6；不入库、不奖励 |
| A6 Place Material `/deposits/:id/place` | 已确认 Zone；① 从 Hub 获取空白标签并手写编号贴好；② 放上货架；③ 拍摄摆放照片；1–3 张上传区 | Edit information 可返回修改；Confirm drop-off 在区域验证和照片校验成功后完成入库，奖励 1 credit → A7 |
| A7 Material Confirmed `/deposits/:id/success` | 庆祝图标、成功提示、编号、名称、数量、+1 credit earned，材料现在可领取 | Done → Explore 首页 |

### 3.2 B 端——材料领取者

| 页面 / 规划路由 | 内容 | 操作与去向 |
| --- | --- | --- |
| B1 Explore Materials `/` | 搜索框、分类入口；内容依次为 Your Active Tasks、New Arrivals、Recommended for You；底部导航 | 搜索框/分类 → B2；材料卡 → B3；任务卡按 3.4 恢复 |
| B2 Search Results `/materials` | 匹配材料列表，大图、名称、简短信息；Category、Condition、Color、Available quantity、Zone 筛选 | 点击材料卡 → B3；保留搜索与筛选条件 |
| B3 Material Details `/materials/:id` | 图片、名称、编号、尺寸、颜色、Condition、当前库存数量/单位、库存状态、Zone、购买链接、Notes、1 credit；收藏分享 | Reserve → B4，不能直接预约；只有 Available 且有库存可预约 |
| B4 Confirm Reservation `/materials/:id/reserve` | 材料名称、编号、当前数量与 Quantity to collect 选择；24 小时保留、固定 1 credit 和冻结说明 | Confirm reservation 校验数量及积分后锁整条材料、冻结 1 credit → B5；Cancel → B3，无预约或积分变动 |
| B5 Reservation Confirmed `/reservations/:id` | 成功提示、图片、名称、编号、本次预约数量、截止时间、Material Hub 位置和 Zone | View pickup guide → B6；I’m at the Hub → B7；Cancel reservation 可主动取消并返回 My Reservations |
| B6 Pickup Guide `/reservations/:id/guide` | 三段图文：前往 Hub、找到所属 Zone、找到并扫描 Zone QR | I’m at the Hub → B7 |
| B7 Scan Zone `/scan`（领取任务） | 相机扫码确认预约材料的 Zone | 正确 Zone → B8；错误提示正确 Zone，不放行；扫码不完成领取 |
| B8 Check Material `/reservations/:id/check` | 摆放照片、材料摘要（名称、编号、本次数量/单位、尺寸、Condition 与库存状态）；未预填的完整编号输入框 | 提示 Enter the code shown on the material label.；编号匹配后才能点击 Confirm pickup，服务端再验证后 → B9；Not suitable → B10 取消模式；Report a problem → 问题上报 |
| B9 Pickup Completed `/reservations/:id/success` | 本次领取成功、领取数量及正式使用 1 credit；剩余数量与材料状态按库存显示，不把部分领取误写为整条 Collected | Done → Explore；Return material → B10 正式退回模式，入口先检查退回资格 |
| B10 Leave It Here `/reservations/:id/cancel`（领取前模式） | 放回原位置、保留编号标签、编号及本次数量；说明释放冻结 1 credit | 用户确认已放回后 Cancel reservation；预约 Cancelled、库存数量不扣减、材料 Available、释放冻结 → My Reservations |
| B10 Return Material `/reservations/:id/return`（领取后模式） | 本次实际领取数量、原 Zone、退回时限与返还已消费 1 credit 的说明；扫码、放回并上传 1–3 张新摆放照片 | 正确原 Zone、上传与资格校验完成后 Confirm return；预约 Returned、恢复本次数量、返还 1 credit → My Reservations |

B10 两种模式可复用布局组件，但必须有独立的资格校验、文案、接口和记账事件。正式退回不是取消有效预约，不能显示“释放冻结积分”。B9 和 My Reservations 的退回入口进入同一正式退回流程。

### 3.3 账户、活动与问题处理

| 页面 / 规划路由 | 内容与操作 |
| --- | --- |
| Register `/register`、Log in `/login` | Username、Password、显示密码、校验与提交、页面切换；成功后回原流程；注册一次性 2 credits |
| Profile `/me` | Username、Available credits / Held credits / Total credits、My Posts、My Reservations、Favorites、Activity、Credit history、Log out |
| My Posts `/me/posts` | 本人的材料编号、当前数量与状态、存放进度；完成入库后核心信息不可编辑；问题材料可进入检查处理 |
| My Reservations `/me/reservations` | 本次数量、状态、截止时间、领取时间及退回截止时间；有效预约可继续/取消，Collected 且符合时限的预约可 Return material，Returned 显示结果 |
| Report a Problem `/reservations/:id/problem` | 原因为 Material not found、Wrong item、Material damaged、Other；提交后 Issue reported、释放冻结 1 credit、材料 Unavailable，回 My Reservations |
| Activity `/me/activity` | 站内活动与状态通知：取消、问题上报、领取及退回等关联材料/预约；支持已读状态，不发短信、邮件或系统推送 |
| Check Report `/me/posts/:id/issues` | A 用户现场检查，Still available → Available；No longer available → 结束记录；记录处理结果，不能编辑已锁定核心材料信息 |
| Favorites `/me/favorites` | 账户持久化收藏列表，可取消收藏、进入材料详情；材料不可用时仍展示真实状态 |
| Credit History `/me/credits` | 奖励、冻结、释放、消费、过期扣除、退回返还的金额、时间、关联记录与余额 |

### 3.4 首页、搜索、推荐与分享

Active Tasks 区域标题使用 `Your Active Tasks`，横向滑动卡片可同时展示多条 A/B 任务。有效 B 端预约优先，按剩余时间升序；A 端待存放任务在其后。B 卡包含图片、名称、编号、Reserved for pickup 和剩余时间或截止时间，点击进入 B5；A 卡包含图片、名称、编号、Ready for drop-off，点击进入 A3 恢复入口。终结任务不再显示为有效待办，保留在个人历史。

首页接着显示 New Arrivals（按首次完成入库时间从新到旧）和 Recommended for You。推荐优先展示与用户最近浏览、搜索或收藏类别相同的 Available 材料，同类别按最新入库排序；无历史时展示最新可用材料，不使用或宣称 AI 推荐。退回不重置首次入库时间。搜索覆盖 Material name 和 Notes，筛选支持 Category、Condition、Color、Available quantity、Zone；数量筛选以当前可预约数量为准。

收藏按用户账户保存，可在个人页查看。分享优先调用手机系统分享，不支持时复制当前材料链接；用户取消系统分享不算业务失败。收藏和分享不改变库存、预约或积分。localhost 演示生成当前环境链接，未来部署使用部署地址，不虚构公网链接。

## 4. 流程、恢复与异常

### 4.1 A 端三阶段与恢复

首页 → A1 → A2 → Next → A3 → A4（已到 Hub 可跳过）→ I’m at the Hub → A5 → 正确 Zone → A6 → Confirm drop-off → A7 → Done → Explore。

| 阶段 | 完成条件 | 持久化与按钮 |
| --- | --- | --- |
| Add information | A2 保存成功并进入 A3 | 登记生成编号，解锁 Navigate to hub；此时不入库、不奖励 |
| Go to the Hub | 在 A3/A4 点击 I’m at the Hub | 保存到达标记，解锁 Start drop-off；只查看指引不算到达 |
| Drop off material | A6 Confirm drop-off 成功 | 保存完成时间、材料 Available、奖励 1 credit；扫码本身不完成阶段 |

已到 Hub 但未扫码，重新进入仍保持第三阶段已解锁。已扫码但未确认存放，重新进入直接恢复 A6，无需再次扫码。首页 A 卡的链接仍指向 A3，由 A3 的恢复判定在有有效 Zone 验证时直接转入 A6；这同时保留统一入口和已扫码进度恢复。用户仍可主动返回查看 A3 或编辑 A2。

Confirm drop-off 前允许修改同一材料，编号不变；修改 Category 清除原 Zone 验证并按新类别要求重新扫码，到达 Hub 标记保留；只改名称、数量、尺寸、颜色等信息保留验证。确认存放后锁定核心字段，库存数量只能由领取/退回事务变更，不能通过 A 端编辑绕过。

### 4.2 B 端预约与领取

Explore → Search Results / Material Details → Reserve → Confirm Reservation 中选择数量 → Confirm reservation → Reservation Confirmed → Pickup Guide（已到 Hub 可跳过）→ Scan Zone → Check Material → 手动输入标签完整编号 → Confirm pickup → Pickup Completed。

预约数量必须是 1 至当前库存数量内的整数。预约时不扣减库存数量，但锁整条记录；确认领取时扣减本次预约数量并保存实际领取数量。预约后首版不支持临时更改数量，需要变更时先取消再重新预约。每次正常完成预约固定消费 1 credit。

B8 组合确认方式已确定：Zone QR 验证区域，摆放照片用于寻找，手写编号输入用于最后实物核对。输入框初始为空，不自动填入编号，匹配完整编号后才能提交；服务端不能只相信按钮已启用。页面显示摘要编号不等于自动完成核对。

刷新、重新登录或后台恢复不能重新计算 24 小时。服务端检查预约有效且未过期、操作者正确、Zone 匹配、编号匹配、数量足够，才完成领取。部分领取后预约为 Collected，但材料仍可为 Available；两者不可混淆。

### 4.3 取消、过期与问题上报

领取前主动取消可以从 B5 或 My Reservations 发起，无需到现场；释放冻结 1 credit，材料 Available，产生 A 端站内 Activity。B8 Not suitable 先进入 B10 提示放回并保留标签，确认后再取消，同样释放冻结积分且不扣减数量。

超过预约成功时间 24 小时仍未领取/取消，服务端使预约 Expired，正式扣除被冻结的 1 credit，材料恢复 Available。后台定时处理与请求前到期检查共用同一事务逻辑；客户端倒计时不是最终依据。截止时间及以后不能通过取消、领取或问题上报绕过已发生的过期扣除。

B8 提供 Report a problem。有效预约提交问题后，原子写入 Issue reported、释放冻结 1 credit、材料 Unavailable 和 A 端活动通知；预约结束，不能继续领取或被后续到期任务扣分。A 用户现场检查后 Still available 解除问题暂停，No longer available 结束材料记录。问题及处理历史保留，不引入管理员审核或外部通知。

### 4.4 正式退回

My Reservations / B9 → Return material → 检查本次预约 Collected、领取完成后仍在 24 小时内且未退回 → 返回原 Zone → 相机扫描原 Zone QR → 放回本次实际领取数量并保留编号 → 上传 1–3 张新的摆放照片 → Confirm return → 预约 Returned、库存恢复、返还 1 credit → My Reservations。

退回窗口以 completed_at 为起点，和预约的保留期限分别计算；发起与确认时都由服务端检查仍在 24 小时内，不能通过提前打开页面无限延长窗口。首版退回本次实际领取的全部数量，不另外引入部分退回。退回理由可记录为不符合预期或不再需要。

一个已完成预约最多一条 Return 记录，重复进入复用该记录。退回的扫码验证独立于领取时的验证，不得直接沿用旧扫码结果。未确认退回的草稿不改变库存或积分。确认时退回状态、数量恢复、预约 Returned、返还 1 credit、最新摆放照片和活动记录在同一事务中完成。重试返回已有结果，不重复恢复数量或积分，不再次给 A 用户存放奖励。

正常无其他占用/问题的退回使材料重新 Available，A 端同步显示退回活动、数量与状态。部分领取允许同一材料后续被再次预约，退回与新预约/问题状态的交叉边界见第 10 节，不能用无条件覆盖状态破坏整条材料锁定。

### 4.5 可恢复错误

- 相机权限拒绝：提示开启权限后 Retry；无手动 Zone code 输入，也不提供假扫码完成业务的路径。
- 错误 Zone 或非法 QR：提示正确区域并阻止继续；例如 `Please scan the QR code for Board & Foam.`。
- 材料编号为空/不匹配：Confirm pickup 不可用；服务端拒绝不匹配请求，提示 `The material code does not match your reservation.`。
- 图片超限、格式错误或上传失败：英文说明原因，保留其他内容并可重试；必需照片未成功上传不能确认存放/退回。
- 网络超时：先查询当前任务结果，再安全重试；不因刷新重复登记、领取、奖励、释放或返还。
- 积分不足、数量无效、材料不再 Available、预约已失效：给出英文反馈并刷新状态；并发失败者不冻结积分。
- 退回超时、预约不是 Collected 或已退回：不能创建重复退回；已完成请求重放返回原结果。

## 5. 手机端与本地演示

单列布局覆盖 320–430 px，较宽屏幕居中展示。关键操作固定在易触达位置，处理安全区域、软键盘和底部导航遮挡；交互目标至少 44 × 44 px，不单靠颜色表达状态。材料卡长标题可换行，横向滚动仅用于 Active Tasks 等明确设计的容器，页面本身不横向溢出。

上传支持相机与相册，显示预览、进度和重试；扫码必须真实调用相机。localhost 演示需使用允许相机访问的浏览器环境；手机访问开发机的普通局域网 HTTP 地址不等同于手机 localhost，手机实机扫码验证应配置可访问的本地安全上下文，不能因此增加手动扫码替代入口。该项为开发环境设置，不要求生产云部署。

演示可使用虚构且标注为 Demo 的材料、测试账户及实际编码的七个 Zone QR，扫码应读取真实二维码内容。Material Hub 素材可显示 `Location to be confirmed`、`Opening hours to be confirmed`、`Placeholder — zone photo` 等明确占位文案。演示测试数据和地图素材可以占位，业务成功、积分、库存与相机扫码不能用静态占位代替。

## 6. 数据结构与状态

数据库内部 ID 与可见材料编号分开，所有数量/金额/状态由服务端校验，时间统一保存并按界面时区展示。以下为完整 MVP 数据职责基线；当前交付范围以文首为准，未接通实体不表示功能已经上线。

### 6.1 实体规划

| 实体 | 主要字段 | 约束与用途 |
| --- | --- | --- |
| User | id、username、password_hash、created_at | username 唯一；没有邮箱、手机号字段；注册奖励按 user_id 唯一 |
| Session | id、user_id、token_hash、expires_at | 登录态由后端验证，退出失效 |
| Material | id、display_code、owner_id、name、category_id、custom_category_name、initial_quantity、stock_quantity、unit、dimensions_spec、dimensions_not_applicable、color、condition、notes、reference_url、zone_id、status、recorded_at、deposited_at、closed_at、version | display_code 唯一顺序生成；initial_quantity 为首次入库数量，stock_quantity 为当前在库数量；入库后库存不能直接编辑；不保存“每件价格” |
| Category | id、name、zone_id、sort_order | 固定七类，一一对应同名 Zone；Other 名称附在 Material 上 |
| Hub | id、name、location_text、opening_hours、map_media_id、is_placeholder | name 为 Material Hub，未确定信息明确占位 |
| Zone | id、hub_id、name、qr_key、reference_media_id | 七条固定区域，qr_key 唯一，严格识别 QR 格式和目标区域 |
| MaterialCodeSequence | next_value | 数据库事务生成 M001 等，不使用“先查最大值再加一”的无保护操作 |
| Media | id、uploader_id、storage_key、mime_type、size_bytes、created_at | 本地持久化文件，后端类型/大小及所有权校验 |
| MaterialPhoto | id、material_id、media_id、kind、deposit_id、return_id、sort_order、created_at | kind 为 material / placement；材料图 1–9 张；每次存放或退回关联 1–3 张摆放图，保留来源与历史 |
| Deposit | id、material_id、user_id、status、arrived_at、verified_zone_id、zone_verified_at、reward_points、confirmed_at | 每个材料一次成功入库，奖励固定 1；Category 变化使区域验证失效；多图关联不用单一 placement_photo_id |
| Reservation | id、material_id、user_id、status、reserved_quantity、collected_quantity、unit_snapshot、zone_id_snapshot、cost_points、created_at、expires_at、verified_zone_id、zone_verified_at、material_code_verified_at、completed_at、return_deadline_at、cancelled_at、cancel_reason | cost_points 固定 1；同一材料最多一个有效 Reserved 预约；保留本次数量和原 Zone；退回数量依据 collected_quantity，不依据当前库存 |
| Return | id、reservation_id、user_id、quantity、reason、status、verified_zone_id、zone_verified_at、created_at、confirmed_at | reservation_id 唯一，最多一条；quantity 等于本次 collected_quantity；Draft / Confirmed，图片关联 MaterialPhoto；不产生 Deposit 奖励 |
| IssueReport | id、reservation_id、material_id、reporter_id、reason、notes、status、created_at、resolved_at、resolved_by、resolution | 原因固定四项；有效上报结束预约并暂停材料；记录提供者 Still available / No longer available 的处理 |
| Activity | id、recipient_id、actor_id、type、material_id、reservation_id、return_id、issue_id、created_at、read_at、event_key | 站内活动通知；event_key 防重，支持 My Posts / Activity |
| Favorite | user_id、material_id、created_at | 用户/材料联合唯一，账户持久化 |
| InterestEvent | id、user_id、event_type、category_id、material_id、search_term、created_at | 记录浏览、搜索对应类别及收藏兴趣以做简单推荐；无可归属类别的搜索不伪造类别 |
| CreditAccount | user_id、balance、held、updated_at | 可用积分 = balance − held；balance ≥ held ≥ 0 |
| CreditEntry | id、user_id、type、balance_delta、held_delta、balance_after、held_after、deposit_id、reservation_id、return_id、issue_id、operation_key、created_at | 每个业务事件唯一流水，冻结和释放也记账，关联对象可追溯 |
| InventoryEntry | id、material_id、type、quantity_delta、quantity_after、deposit_id、reservation_id、return_id、operation_key、created_at | 记录首次入库、领取扣减、退回增加，业务唯一，便于验证数量不重复变化 |

材料核心字段包括名称、类别/自定义类别、初始数量/单位、规格、颜色、Condition、展示照片和资料；入库后 A 端锁定。系统仍可通过库存事务和问题处理更新 stock_quantity、状态与新的摆放照片。

### 6.2 库存与预约状态分离

stock_quantity 表示当前在库数量，预约时不预扣。可预约数量仅在材料 Available 时等于 stock_quantity；Reserved、Unavailable、Closed、Collected 或待存放时为 0。不得把锁定后的 0 可预约数量误存为 0 在库数量。

| 事件 | Material 状态/数量 | Reservation 状态 |
| --- | --- | --- |
| A2 登记 | Ready for drop-off，保存申报数量，未进入公共库存 | 无 |
| A5 扫码 | 仍 Ready for drop-off | 无 |
| A6 确认存放 | Available，stock_quantity = initial_quantity | 无 |
| B4 预约成功 | Reserved，锁整条记录，stock_quantity 不变 | Reserved，保存 reserved_quantity |
| B7 扫码 | 仍 Reserved，数量不变 | 仍 Reserved |
| B8 确认部分领取 | stock_quantity 减 collected_quantity，剩余 > 0 时 Available | Collected |
| B8 确认全部领取 | stock_quantity = 0，Collected | Collected |
| 领取前取消/不合适放回取消 | Available，数量不变 | Cancelled |
| 24 小时预约过期 | Available，数量不变 | Expired |
| 有效预约上报问题 | Unavailable，数量暂不改动 | Issue reported |
| A 端 Still available | Available，恢复现有库存可预约性 | 原 Issue reported 历史保留 |
| A 端 No longer available | Closed，结束记录，不再可预约；原数量保留审计，不作为可用库存 | 原 Issue reported 历史保留 |
| 正常确认退回 | stock_quantity 加本次 collected_quantity，Available；交叉状态例外见第 10 节 | Returned |

Expired、Cancelled、Issue reported、Returned 是预约记录状态，不应把它们混作材料库存枚举。Reserved for pickup 为首页有效预约展示文案。A/B 共用 Material、Zone 和编号；A 端显示当前数量与活动，部分领取不能把尚有库存的材料误显示为全部领取。

数量例：入库 2 sheets，预约 1 sheet 时整条记录 Reserved；领取后库存 1 sheet、材料 Available、本次预约 Collected、消费 1 credit；退回本次 1 sheet 后库存 2 sheets、本次预约 Returned、返还 1 credit。另一个后续预约有自己的数量、1 credit 流水和唯一 Return 记录。

### 6.3 积分流水

| 事件 / 建议类型 | balance 变化 | held 变化 | 可用积分变化 |
| --- | --- | --- | --- |
| 注册成功 / registration_reward | +2 | 0 | +2 |
| A6 首次存放 / deposit_reward | +1 | 0 | +1 |
| 预约成功 / reservation_hold | 0 | +1 | −1 |
| 主动取消 / cancellation_release | 0 | −1 | +1 |
| 不合适放回取消 / cancellation_release | 0 | −1 | +1 |
| 问题上报 / issue_release | 0 | −1 | +1 |
| 正常领取 / pickup_spend | −1 | −1 | 0，预约时已从可用余额冻结 |
| 预约过期 / expiry_spend | −1 | −1 | 0，冻结金额正式扣除 |
| 正式退回 / return_refund | +1 | 0 | +1，返还已消费积分 |

注册奖励以账户为唯一业务对象，存放奖励以 Deposit 为对象；预约的取消/过期/领取/上报只允许一个有效终结事件；退回返还以 Return / Reservation 为唯一对象。即使请求更换幂等键，也不能绕过业务唯一约束。

示例：注册后 balance/held/available = 2/0/2；预约后 2/1/1；正常领取或过期后 1/0/1；领取前取消或上报后 2/0/2；领取后正式退回后 2/0/2。退回不增加 A 端奖励，Still available / No longer available 不产生额外积分变化。

## 7. 前端、简单后端与一致性

### 7.1 实施规划

沿用 React + TypeScript 前端、Node.js + Express 简单后端、SQLite 数据库规划。上传保存至本地持久化目录，数据库保存文件标识；存储路径和 API 地址可配置，保留未来同源部署与替换存储的能力。组件库与视觉细节可在开发时选择，不阻塞数据和业务流程。

| 目录 | 职责 |
| --- | --- |
| frontend/src/pages/ | A/B 页面、Profile、Activity、问题与退回页面 |
| frontend/src/components/ | 移动容器、导航、三阶段折叠项、任务卡、材料卡、上传、相机扫码、反馈 |
| frontend/src/features/ | auth、materials、deposits、reservations、returns、issues、credits、favorites |
| frontend/src/services/ | API、上传、会话与错误处理 |
| backend/src/routes/ | 路由、英文错误响应与输入校验 |
| backend/src/services/ | 数量、预约、积分、退回、上报事务 |
| backend/src/db/ | 表、迁移、索引与种子数据 |
| backend/src/jobs/ | 预约到期处理，复用事务服务 |
| backend/src/storage/ | 可配置的本地上传存储适配 |
| shared/ | 状态、类型、字段校验和产品常量，不包含密钥 |
| references/、tests/ | 原始资料；关键事务与流程验证 |

### 7.2 API 职责规划

| 接口组 | 职责 |
| --- | --- |
| /api/auth/register、login、logout、me | Username/Password、会话与一次性 2 credits |
| /api/materials、/api/materials/:id | 搜索、五类筛选、详情与可预约数量 |
| /api/explore、/api/me/tasks | New Arrivals、简单推荐、有序 Active Tasks |
| /api/deposits、/api/deposits/:id | 登记、唯一编号、读取和入库前编辑；Category 变化清除验证 |
| /api/deposits/:id/arrive、confirm | 到达持久化；校验 Zone 和 1–3 张照片后入库奖励 |
| /api/zones/verify | 解析相机结果，按 deposit/reservation/return 任务分别保存正确 Zone 验证 |
| /api/reservations、/api/reservations/:id | 数量选择、锁整条材料、冻结 1 credit、24 小时截止与读取 |
| /api/reservations/:id/pickup、cancel | 编号和区域核验后扣数量/消费；有效预约取消释放；到期检查先行 |
| /api/reservations/:id/issues | 有效预约问题上报、释放积分、暂停材料和活动通知 |
| /api/materials/:id/issues/:issueId/resolve | 仅提供者可记录现场检查结果，恢复或结束材料 |
| /api/reservations/:id/return、/api/returns/:id/confirm | 唯一退回记录、时限和原 Zone、新照片、数量恢复与返还 |
| /api/me/favorites、/api/interests | 账户收藏、最近类别兴趣；不触发库存或积分 |
| /api/me/posts、reservations、activities、credits | 个人记录、活动已读与积分流水 |
| /api/uploads | 类型/大小校验、文件保存、业务关联验证 |

读取使用 GET；创建、确认等业务动作使用 POST；资料编辑、收藏和已读可选用 PATCH/PUT/DELETE。接口精确命名在实施中统一，不能改变已确认的业务含义。

### 7.3 事务、幂等与权限

注册创建账户、积分账户和 +2 流水；入库状态/数量、存放记录与 +1 奖励；预约锁定、预约记录与冻结；领取数量扣减、预约完成与消费；取消/过期/问题上报的状态与积分；退回确认、恢复数量、Returned 与返还，都各自在数据库事务中完成，活动与库存流水同事务写入。

使用唯一约束、状态条件更新和事务防止并发：一条材料最多一个 Reserved 预约，库存非负，金额非负；同一预约终结动作竞争只有一个成功。服务端在写操作及相关查询前检查 expires_at，到期任务可安全重复运行，重启后继续清理；退回确认同样检查 return_deadline_at。返回成功结果后刷新不会再次记账。

所有操作验证当前用户拥有对应存放/预约/退回记录；提供者只能处理自己的材料问题。账户余额、奖励金额、编号、状态和库存不能由客户端任意指定。会话、密码哈希、请求来源检查及上传安全校验保留简单可靠实现，配置兼容本地验收和未来部署。

## 8. 开发顺序与阶段验收

以下保留完整 MVP 的阶段规划；基础、A 流程及 B 预约/领取/报告/整笔退回已经完成，其他子项以文首未完成清单为准。

| 阶段 | 工作 | 阶段验收 |
| --- | --- | --- |
| 1 | 搭建前后端、SQLite、配置、英文移动页面壳与本地启动说明 | localhost 前后端可连通、数据库持久化；320–430 px 基础布局可用，上传路径和相机演示环境明确 |
| 2 | 数据表、共享状态/校验、账户会话、积分与库存事务基础 | Username 注册登录正常，一次性 2 credits，重复请求与账户重名不重复奖励 |
| 3 | A 端登记、编号、图片、七 Zone 扫码、恢复编辑和入库 | 七页三阶段走通，Category 修改重新扫码，照片必传，入库仅奖励 1 credit |
| 4 | Explore、Active Tasks、搜索筛选、详情、收藏分享和简单推荐 | 五项筛选、Notes 搜索、任务排序、收藏持久化及分享回退可用 |
| 5 | B 端预约数量、整条锁定、现场组合核对与部分/全部领取 | 固定 1 credit，成功起 24 小时；扫码+照片引导+手输编号，数量和跨端状态正确 |
| 6 | 取消、到期扣分、问题上报与 A 端处理、活动通知 | 各类积分流水、Available/Unavailable/Closed 状态与恢复真实生效 |
| 7 | 正式退回、原 Zone 复扫、新照片、数量恢复与返还 | 24 小时窗口、唯一 Return、事务幂等、不重复奖励；按第 10 节已确认规则保留新预约和异常状态 |
| 8 | 并发/异常验证、手机体验和英文文案复核 | 重复请求不改两次库存/积分；错误提示与重试、权限和跨用户限制正确 |
| 9 | 演示数据、可扫描二维码、本地运行和演示脚本 | A/B 正常路径、部分领取、取消、过期、上报处理与退回均可演示；素材占位明确 |

## 9. 关键验收场景

1. Username + Password 注册成功仅奖励 2 credits；同名重复注册、请求重放不能创建重复奖励。无手机号、邮箱、验证码或找回密码入口，所有界面文案英文。
2. A2 必填字段缺失不能保存；Other 缺自定义类别名不能保存；Not applicable 能合法保存小物品规格。材料图 1–9 张、第一张封面；边界数量、10MB 上限、格式及视频拒绝有效。
3. 编号从 M001 依次生成且并发唯一；返回修改不换号。七类对应七个同名 Zone，Other 自定义名称不改变 Zone；单件材料只使用手写编号标签。
4. A1 仅三阶段折叠项；A2 保存完成阶段一，到达按钮完成阶段二并解锁 Start drop-off，只有 Confirm drop-off 完成阶段三。登记和扫码均不入库、不奖励。
5. 到达标记重进保留；A 卡入口 A3 对已验证记录恢复 A6。修改 Category 清除验证，其他资料修改保留；入库后核心资料不可编辑。
6. A6 必须 1–3 张有效摆放照片；扫码错误、相机拒绝、未上传不能确认。成功库存 Available、奖励恰好 1 credit，A7 Done 回 Explore。
7. Active Tasks 横向多卡，B 任务按剩余时间优先、A 任务随后，卡片入口分别 A3/B5；首页顺序正确，领取/取消/过期任务退出有效待办。
8. 搜索覆盖名称和 Notes；五项筛选可组合；New Arrivals 按首次入库时间；推荐按兴趣类别和入库时间，无历史回退最新 Available 材料，不出现 AI 宣称。
9. 收藏账户持久化，Profile 可查看；系统分享不可用时复制材料链接；收藏分享不变动库存或积分。
10. Reserve 必经 B4；选择 1 至当前库存数量，0、超库存或非法数量被拒绝。B4 Cancel 无业务变化；确认成功才冻结 1 credit、开始 24 小时并锁整条记录。
11. 两个用户即使各只预约一部分，同一材料也仅一人成功，失败者不被冻结积分；重新登录不重置截止时间。
12. 正确 Zone 进入 B8 但不领取；摆放照片仅寻找辅助；输入框为空，提示为 Enter the code shown on the material label.；空或错误完整编号不能 Confirm pickup，直接调用接口也被拒绝。
13. 入库 2 sheets：预约 1 sheet 时材料 Reserved；领取后库存 1、材料 Available、本次预约 Collected，消费 1 credit。领取全部时库存 0、材料 Collected。A 端数量和状态同步。
14. 主动取消立即释放冻结 1 credit、数量不变、材料 Available、A 端有 Activity；B8 不合适要求先放回并保留标签后再取消。
15. 预约超时 Expired、正式扣除冻结 1 credit、材料 Available；取消/领取/到期竞争只结算一次；重启后到期任务仍正确。
16. 四种问题原因均可提交；有效上报后 Issue reported、释放 1 credit、材料 Unavailable、A 端收到站内通知；Still available 恢复，No longer available 结束记录；已上报预约不再被到期扣分。
17. 退回仅允许 Collected 预约在领取后 24 小时内；B9/My Reservations 均可进入，必须重新扫描原 Zone、放回本次实际数量、上传 1–3 张新照片。超时确认不能成功。
18. 退回恢复本次 collected_quantity，预约 Returned，返还已消费 1 credit，A 端收到退回活动；返回 My Reservations。领取前取消和正式退回使用不同积分文案。
19. 同一预约重复发起/点击/刷新退回只有一条 Return，一次库存增加和一次退款；A 端不新增存放奖励。旧扫码、旧摆放照片及其他用户图片不能绕过退回校验。
20. 新预约期间旧用户退回只增加库存，新预约不变且材料保持 Reserved，待新预约结束才开放新增库存；问题期间退回保持 Unavailable，A 处理前不能预约；无新占用或异常时恢复 Available。库存增加、旧预约 Returned、Return 确认及返还 1 credit 同事务，只成功一次。
21. 320 px 与常见手机宽度下，键盘、长表单、图片上传、扫码、任务横滑和底部按钮可操作。真实 Hub 素材可占位，但本地持久化、事务和相机扫码实际工作。

当前已验证账户、A 全流程、B 预约/领取/报告/整笔退回；完整路线图中未交付的收藏分享和兴趣推荐不包含在通过的测试数字中。

## 10. 剩余边界、占位内容与下一步

### 10.1 是否存在真正阻塞开发的产品问题

此前关于注册积分、英文界面、必填字段、图片、现场核对方式、材料编号、Zone、A 端恢复、部分领取、过期扣分、上报、退回、筛选、收藏与分享的待确认项均已解决。可以开始阶段 1–6 的基础和核心流程开发，不需要等待真实素材。

退回交叉状态已确认：只增加本次实际退回的库存数量，并修改旧预约自己的状态、数量和退款记录，不能覆盖后来产生的新预约或异常状态。没有新预约或异常时恢复 Available；有新的有效预约时继续 Reserved，不取消、不修改新预约，新增库存等待该预约结束后开放；存在 Issue reported / Unavailable 时正常记录数量但保持不可预约，直到 A 用户处理。已结束记录也不得被旧退回无条件重新开放。每个预约只能成功退回和退款一次，库存增加、旧预约 Returned、Return 确认及返还 1 credit 必须在同一事务中完成，按材料当前状态更新。始终保持一条材料最多一个有效预约。当前无阻塞第一阶段开发的产品问题。

首页 A 卡指向 A3 与已扫码直接恢复 A6 已在 4.1 通过“统一恢复入口 + 进度判定”协调，不需要再作为待确认问题。退回窗口在发起和确认时均检查，是“24 小时内允许退回”的一致实施约束。

### 10.2 开发中可用的占位值

- 真实位置、开放时间、路线示意、教室和 Zone 照片：英文明确占位，后续替换，不虚构真实地点。
- 最终视觉风格、图标及非业务性文案细节：先用统一英文和基础设计样式。
- 演示账户和材料：使用明确的 Demo 数据；正式数量、状态和积分仍由业务操作产生。
- Condition / Color / Unit 的具体英文选项、推荐历史窗口与同优先级排序细节：作为可配置的实施参数，不增加产品审批关卡。

图片必传数量、积分金额、24 小时时限、材料编号格式、Zone 映射、状态和核对方式已经确定，不能用占位规则替代。

### 10.3 后续范围（本轮不执行）

本轮补全发布者报告处理与认证页重复入口后停止，保留 B 端领取、问题报告、24 小时整笔退回。后续需另行确定是否实现收藏分享及兴趣推荐；真实 Hub 素材待提供。不自动继续双语、视觉改造或部署。
