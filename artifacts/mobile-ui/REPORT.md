最新统一预览、材料管理和截图审查说明见 [本轮报告](../ui-review/审查说明.md)。日常只使用 http://localhost:5173/；下面旧报告中的双端口说明已被替代。

最新：首页与 Share 入口修复、实际预览和重启命令见 [本轮报告](entry-fix/REPORT.md)。

# Re:Material 移动端改版检查

最新一轮见 [Explore / Share 第二轮报告与实际预览](round-two/REPORT.md)，包含重启命令、四张主要截图及 320 / 393 / 402px 检查结果。下文保留第一轮记录。

在原项目内修改组件与共享样式，保留英文界面、现有材料数据、API、积分与 A/B 流程。未改动后端、数据库结构或上传数量规则。

## 截图

Explore、Share、详情截图来自现有本地服务和材料记录；登录态 Profile 来自隔离测试数据库的 `mobile_review` 账号，余额为真实注册奖励 2 credits。

| 页面 | 402 × 874 | 393 × 852 | 320 × 740 |
| --- | --- | --- | --- |
| Explore | [截图](explore-402.png) | [截图](explore-393.png) | [截图](explore-320.png) |
| Share Material | [截图](share-402.png) | [截图](share-393.png) | [截图](share-320.png) |
| Profile（登录） | [截图](profile-402.png) | [截图](profile-393.png) | [截图](profile-320.png) |
| 材料详情 | [截图](detail-402.png) | [截图](detail-393.png) | [截图](detail-320.png) |

同目录的 `*-bottom.png` 是滚动到底部后的截图；`*-test-*.png` 是隔离测试数据下的补充截图。布局测量见 [live-checks.json](live-checks.json)。

## 实际改动

- `frontend/src/main.tsx`：移除全局品牌栏；主页面底部导航与深入流程分离；Explore 搜索、横滑分类、独立筛选面板、单一材料列表与紧凑任务提示；Profile 头像、自然余额和统一列表。
- `frontend/src/deposits.tsx`：Share 三步进度、草稿恢复入口、待存放材料的唯一 Continue；表单及存放操作的底部位置。
- `frontend/src/reservations.tsx`：大图、状态与积分、分组元数据、固定 Reserve 和确认操作；修复进入确认路由后等待 15 秒轮询才加载的依赖问题。
- `frontend/src/fulfillment.tsx`：统一返回图标、Hub 和完成操作的位置。
- `frontend/src/reviews.tsx`：统一返回图标与 Profile 审核入口的右尖括号。
- `frontend/src/app-ui.css`（新增）：统一手机画布、安全区、动态高度、字号、圆角、图标、导航、筛选面板与固定操作。由原入口加载，未建立第二套应用。
- `tests/mobile-ui.spec.mjs`（新增）：三个尺寸的四页面布局、搜索筛选、草稿恢复、A/B 入口与 Profile 入口检查。
- `tests/browser.spec.mjs`、`deposits.spec.mjs`、`reservations.spec.mjs`、`fulfillment.spec.mjs`、`reviews.spec.mjs`：同步已删除品牌栏、移动到详情的编号、任务提示及筛选应用方式的断言；积分检查仍验证 API 返回值，原流程结果检查保留。
- `scripts/capture-mobile.mjs`（新增）：使用项目现有 Playwright/Edge 对本地服务截图和测量，不更改用户材料或积分。

## 布局与交互

- 三个尺寸下四页面均无横向溢出，文档宽度等于视口宽度。
- Explore 首排照片顶部约 297px，无需滚动即可看到。材料顺序仍由现有接口按最近存放时间返回。
- 主页面保留稳定底部导航；详情没有主导航，底部主操作分别停在 874 / 852 / 740px 视口底部。
- 主页面使用文档自然纵向滚动，无固定 874px 高度。横滑只用于分类和材料照片；筛选是独立模态面板。
- 1440px 桌面检查：App 宽 402px，左侧 519px，居中。触屏手机使用全宽；安全区取设备 env 值，不再人为增加 59px 顶部空白。
- 已逐张查看四页面在三个尺寸的截图，并检查滚动后底部操作。
- 搜索、分类、筛选选择/清除/应用、材料详情、草稿 Continue、待存放 Continue、预约及 Profile 各入口有浏览器点击验证。

## 照片与后续细调

检查结果：TypeScript `tsc --noEmit` 与 Vite 生产构建通过；现有后端测试 38/38 通过。完整浏览器回归 13/14 通过，一项 A 端草稿提示断言遇到开发热更新而失败；停止源码编辑后，A 端两项测试及三尺寸 UI 测试复查 3/3 通过。全部 14 个浏览器用例均已有通过记录。测试执行于临时数据库，不使用现有用户记录进行预约、领取或加分。

- 前后端一致：材料照片 1–9 张，摆放照片 1–3 张；未改上传规则。
- 现有数据中两条 cotton canvas 记录使用相同照片，另有 Test foam 色块记录。保留原数据，未重复填充图片；数据清理应由后续单独确认。
- Hub 地址、开放时间、路线和 Zone 照片仍为原有待确认内容，没有编造地点信息。
- 浏览器插件初始化失败后使用了项目现有 Playwright + Edge。已完成浏览器截图和交互检查，但没有物理 iPhone Safari 的地址栏收缩、刘海安全区和真实摄像头实机检查；摄像头回归使用已有模拟视频与拒绝授权测试。
- 后续可在实机上微调键盘弹出时的固定操作位置、长材料名换行及真实 Hub 导引照片。
