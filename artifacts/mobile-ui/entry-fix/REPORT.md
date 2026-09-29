# 首页与 Share 入口修复

本轮直接修改现有 React 项目；上一轮改动已在当前源码中。没有回退项目，没有修改后端业务代码。

## 实际运行地址

- 主预览：http://localhost:5173/ （原数据，API http://localhost:3001/api/health）。
- 独立演示：http://localhost:5174/ （相同组件，独立 SQLite、上传文件及浏览记录；API 3002）。20 条不同示例材料供多屏滚动，其中新增 16 条使用明确标注的材料插图，不冒充真实材料照片。预设浏览记录仅存在于演示源与演示存储键中。
- 已用 Edge/Playwright 实际打开两个地址、点击检查并截图。服务保持运行，但关闭开发进程后需要重启。

在项目目录打开两个 PowerShell 终端，分别执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 server
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 client
```

可选独立演示另开终端：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 demo
```

脚本支持 PATH 中的 Node，也支持本机已有的 Codex Node 路径。Chrome/Edge 按 F12，再按 Ctrl+Shift+M，选择 Responsive，输入宽 402、高 874，缩放 100%。普通桌面窗口的真实 App 居中且最大宽 402px。

## 根因及入口

旧 Share 逻辑在没有待存放记录时回退到 `deposits[0]`，把最后一条已完成记录绑定为首页任务；三个步骤又共用完成状态链接，因而进入 Material Confirmed。本轮移除了该绑定。

| 按钮 | 目标与行为 |
| --- | --- |
| Add material | `/deposit/new?fresh=1`：新的空白表单。旧完成记录不影响此入口；有草稿时 Share 另显示 Continue draft。 |
| View guide | `/hub`：共享原有 Hub 指南内容，无需材料或登录。 |
| I'm at the Hub | `/deposit/drop-off`：一条待存放记录直接进入 `/deposits/:id/scan`；多条先选择；没有记录显示提示和 Add material。已经验证 Zone 的记录恢复到原有编码/摆放步骤。 |

到场只调用现有 arrive 接口，不确认上架、不改变库存、不发积分。完成仍受现有 Zone、材料编码/贴纸、摆放照片和一次性积分校验控制。原 A/B 流程与每件 1 credit、注册 2 credits、上架奖励和退款规则均未改动。

## 首页

- 只保留条件显示的 Recently viewed 与 Recommended；没有真实浏览记录时前者不占空间。
- 最近浏览记录材料 ID，去重、最新在前、刷新保留；状态从当前 API 更新。首页显示最多 8 条，右侧 chevron 打开完整记录（本地最多 100 条）。
- 小卡片横滑并露出下一张，隐藏原生滚动条，支持触控、横向滚轮及聚焦容器后的左右方向键。材料链接可 Tab 访问。
- 推荐使用现有可领取接口的时间排序，全部两列向下展示；没有个性化逻辑、没有复制填充。常规卡只显示图片、名称与数量；最近浏览中的状态例外仍标出。
- More filters 与分类同一行，搜索保留胶囊形与原点击区域。

## 验证结果

- TypeScript 检查与 Vite 生产构建通过。
- 后端测试 38/38；完整浏览器测试 15/15。
- 已完成上架账号仍可新增；新表单不会被旧材料覆盖；草稿入口独立。
- 未登记材料可看指南；空待存放列表进入提示界面，刷新后记录数及积分不变。
- 单条直接扫码、多条选择、退出恢复、已扫码继续摆放均验证；未满足条件不能确认完成。
- 搜索、筛选、详情、预约、A/B 扫码及积分/退款回归通过。
- 主预览与演示预览均检查 402×874、393×852、320×740：无文档横向溢出；Share 最后按钮可滚动到导航上方。
- 演示验证推荐可浏览超过三屏，最近浏览键盘和横向滚轮可滚动、滚动条隐藏；图片解码全部成功；无页面脚本错误。
- 桌面 1440px 检查 App 宽 402px。
- 两张最终截图已打开目视复查：[首页（独立演示）](home.png)、[Share（主预览）](share.png)。测量见 [checks.json](checks.json)。

## 修改文件

- `frontend/src/main.tsx`：首页结构、卡片、浏览历史与入口路由。
- `frontend/src/deposits.tsx`：独立 Share 入口、公共指南、待存放选择、空态及新表单。
- `frontend/src/app-ui.css`：横滑小卡、两列推荐、同排筛选及 Share 三张卡。
- `frontend/src/recent-materials.ts`、`frontend/src/demo-preview.ts`：浏览记录与隔离演示标记。
- `scripts/demo-server.mjs`、`scripts/start-dev.ps1`、`.gitignore`：同项目独立演示服务、启动脚本及本地数据排除。
- `scripts/capture-mobile.mjs`：两张截图与三尺寸检查。
- `tests/explore-share.spec.mjs`：新增入口回归与真实浏览记录测试；替换旧版布局测试 `tests/mobile-ui.spec.mjs`。相关既有浏览器用例同步新的首页标题和入口，保留业务断言。
- 本报告及入口报告链接。

## 限制与后续

前后端上传规则核对：材料信息照片 1–9 张、摆放照片 1–3 张，是不同字段和上传环节，本轮未改规则。现有 Hub 地址、时间与路线仍有原始占位说明，未编造。浏览器移动视口验证不等于真实 iPhone Safari/安全区/摄像头实机测试；这些仍需实机确认。演示插图仅用于布局和滚动演示，主预览保留原照片。
