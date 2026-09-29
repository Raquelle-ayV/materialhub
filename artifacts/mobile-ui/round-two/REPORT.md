# Explore / Share 第二轮实现与实际预览

本轮直接修改现有 React 项目。上一轮改动已保留；没有新建应用、静态设计方案或另一套业务版本。

## 实际可操作预览

- 前端：[http://localhost:5173/](http://localhost:5173/)
- 后端：`http://localhost:3001`，由前端代理 `/api`。
- 两个开发服务已在运行，本轮复用它们，未停止服务。已在 Edge 浏览器实际打开前端并操作真实 DOM。
- 普通桌面窗口中 App 宽 402px；1440px 视口时左边距 519px。页面是运行中的 React 应用，不是截图。
- 本机 Node 没有加入当前终端 PATH，因此提供可自动找到现有 Node 的启动脚本。

服务停止后，在项目目录分别打开两个 PowerShell 终端：

```powershell
# 终端一：后端
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 server
```

```powershell
# 终端二：前端
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 client
```

保持两个终端开启。若系统已有 Node 24+ / npm，也可分别运行原有的 `npm run dev:server` 和 `npm run dev:client`。

Chrome / Edge：打开预览 → F12 → Ctrl+Shift+M → 设备选择 **Responsive** → 宽度 **402**、高度 **874**、缩放 **100%**。这里设置的是 CSS 视口，不需要另乘设备像素比。关闭设备工具栏后，桌面预览仍居中限制为 402px。

## 四张主要截图

| 页面 | 截图 |
| --- | --- |
| Explore 首屏，402 × 874 | [Explore](explore.png) |
| Explore 向下滚动 | [More to explore](explore-more.png) |
| 已有材料、已到 Hub 的 Share | [Share](share.png) |
| 登录后的 Profile | [Profile](profile.png) |

Explore 截图使用当前开发服务的实际材料。Share/Profile 使用同一套组件和 API、隔离测试数据库中的 `share_review` 账号；照片与材料信息取自已有 cotton canvas 记录，经真实表单上传和登记得到进度，没有在开发数据库中新增材料或账号。真实预览请登录你自己的现有账号查看其进度。

## 本轮行为

- New arrivals 为横滑区：默认完整显示两张卡，最多放四条最新记录；材料较少时留出其余记录给下方区域。当前 5 条非 Demo 记录分为 3 + 2，不按图片复制或凑数。
- 标题右侧 44px 点击区域内使用细线右尖括号，进入 `/materials`。完整列表保留接口原有 `deposited_at DESC, id DESC` 排序及原有示例记录；首页不使用带 `is_demo` 标记的示例填充。
- More to explore 是其余记录的两列列表；和 New arrivals 按 ID 不重叠。数量不足时如实显示空提示，不复制材料。
- 首页卡片保留照片、名称、数量。去掉重复 Available、条件和 1 credit；非可领取状态仍单独显示。详情和预约确认页继续显示真实的 1 credit 要求。
- 最近浏览只存 `rematerial.recent-material-ids`，最多 6 个 ID，去重且最近打开的在前。成功打开详情才记录，刷新保留；无记录不渲染。首页放在材料列表之后，不推迟首屏材料。
- 最近浏览用详情接口重新获取名称、照片、库存和状态；刷新、窗口重新获得焦点和既有 15 秒刷新都会更新。不可读取的记录不显示；不读取旧状态快照，也不宣称跨浏览器/跨设备同步。
- Share 的三张步骤卡始终可见：当前步骤为主按钮，已完成步骤可查看，未满足前置条件的步骤为禁用按钮并说明原因。
- 通过服务端返回的 `arrived_at`、`verified_zone_id`、`deposit_status` 决定恢复入口。草稿回表单；未到 Hub 回导引；已到 Hub 回扫码；已通过 Zone 验证回摆放；已完成可查看记录。
- 没有登记时步骤二、三不能进入。步骤卡本身不确认存放、不发积分，最终完成仍走原后端校验。现有多个待办仍可从 Profile 进入各自记录。

## 照片规则核对

这是两个上传环节，数字无冲突：

1. **材料信息照片 1–9 张**：`AddInformation` 中 `PhotoUpload max={9}`，表单 `photo_ids`；服务端 `validate()` 调用 `imageIds(..., 9, ...)`，存入 `material_photos` 的 `kind='material'`。
2. **摆放照片 1–3 张**：`DepositPage` 中 `PhotoUpload max={3}`，独立 `placement_photos` 状态；提交 `/deposits/:id/placement` 的 `photo_ids` 存为 `kind='placement'`。编辑时可暂存 0 张，但 `/confirm` 最终要求至少 1 张、最多 3 张。

未改变这些数量、Zone QR 检查、材料编号或标签步骤。原 A 端是显示编号并要求贴签，不存在额外手输编号字段；本轮未虚构新校验。注册仍奖励 2 credits，存放完成仍一次性 +1，预约/领取与退回退款全部沿用原实现，不新增卖家定价或按数量变价。

## 尺寸与交互

| 尺寸 | 搜索框高度 | 首排两卡 | 横向溢出 | 底部操作 |
| --- | --- | --- | --- | --- |
| 402 × 874 | 48px | 20–194px、208–382px；照片从 284px 开始 | 无 | 导航/详情操作可用 |
| 393 × 852 | 48px | 两张完整并排 | 无 | 导航/详情操作可用 |
| 320 × 740 | 48px | 16–154px、166–304px | 无 | 可自然滚动至最后一步/按钮 |

布局测量和真实服务检查记录：[live-checks.json](live-checks.json)。

已在真实预览点击搜索、完整列表入口、材料卡和登录预约入口，并用横向滚轮验证横滑；没有通过静态截图代替交互。隔离浏览器测试验证了登录后的 Reserve 确认、草稿退出后恢复、到 Hub 后退出/刷新恢复、非法提前 confirm 被拒绝，以及已浏览材料从 Available 更新为 Reserved。

## 实际修改文件

最终验证结果：`tsc --noEmit` 通过；Vite 生产构建通过；`node --test tests/*.test.mjs` 38/38 通过；完整 `playwright test` 15/15 通过。浏览器测试使用临时数据库，开发服务的现有用户、材料、预约和积分没有被测试修改。

- `frontend/src/main.tsx`：Explore 分区、简化卡片和最近浏览渲染。
- `frontend/src/recent-materials.ts`（新增）：本浏览器 ID 记录、去重、数量限制和异常存储降级。
- `frontend/src/reservations.tsx`：详情成功加载后记录浏览 ID。
- `frontend/src/deposits.tsx`：三张持久步骤卡与真实进度按钮；完成记录回看。
- `frontend/src/app-ui.css`：48px 搜索、紧凑间距、双卡横滑、最近浏览和统一步骤卡。
- `scripts/start-dev.ps1`（新增）：可直接重启前后端，兼容本机 Node 不在 PATH 的情况。
- `scripts/capture-mobile.mjs`：真实服务点击/测量，仅输出两张 Explore 主要截图。
- `tests/explore-share.spec.mjs`（新增）：最近浏览持久化/去重/状态更新、Share 恢复、前置条件、登录截图与三尺寸检查。
- `tests/browser.spec.mjs`、`tests/mobile-ui.spec.mjs`、`tests/deposits.spec.mjs`、`tests/reservations.spec.mjs`、`tests/fulfillment.spec.mjs`：同步 New arrivals 标题和真实记录不足时的空状态断言。

## 范围外与未完成项

本轮没有保留未完成的产品功能。仍未做物理 iPhone Safari 的触摸/键盘/安全区实机测试；浏览器中的扫码回归使用项目已有模拟视频。最近浏览只在当前浏览器保存，不跨设备。

现有 `xxx`、重复 cotton canvas 和 Test foam 色块来自原数据。未重命名、删除或替换这些用户记录；后续数据清理需单独处理。带明确 Demo 标记的记录不出现在首页两个材料区。
