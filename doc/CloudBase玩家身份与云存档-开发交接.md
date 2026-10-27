# CloudBase 玩家身份、地区保存与云存档

日期：2026-10-15。开发分支：`codex/cloudbase-player-save`。基线：`f1509dbea642439a0abf86131f8f272c8095ed12`。

2026-10-23 新增 [每日进入与第三关失败规则](每日关卡重置说明.md)。每天首次进入从第一关开始，第三关失败后重试当前第三关，在四簇、双环、菱形分布间切换并重新排列食材。`state.playDate` 随云存档保存，当前函数响应 `playSessionVersion: 3`，兼容旧种子布局恢复；需先部署最新函数再构建客户端。本次仅完成本地代码、函数包和测试，尚未远程部署每日规则及新牌阵。

2026-10-20 已在源码中加入 [图鉴与成就](图鉴与成就开发说明.md)：13种食材图鉴、14项成就，复用现有图片；`state.progress` 随原云存档保存。新版 `hotpotPlayerDev` 已部署成功，小游戏实际调用 `load` 返回 `ok: true`、`progressVersion: 1`。尚未构建或发布新版小游戏；下一步由用户在 Cocos 图形界面重新构建客户端。以下真实联调及构建体积记录属于10月15日旧版验收。

后台地址、查询玩家、人工修改地区与重置进度、更新地区选项的步骤，见 [CloudBase 后台手动操作指南](CloudBase后台手动操作指南.md)。

Cocos 图形界面打包见 [Cocos 图形界面构建云开发版](Cocos图形界面构建云开发版.md)。已新增项目构建扩展和完整导入配置，首次需用户手动新建任务并导入；未改写正在运行的编辑器任务列表。扩展与 CLI 共用构建后处理，仅准备本地云函数文件，不自动部署或发布。扩展通过隔离目录逻辑测试；未操作编辑器进行 GUI 实测。

## 当前环境与隔离范围

用户已同意在小游戏所属腾讯云账号下创建独立微信云开发环境，并手动完成创建。

- 小游戏 AppID：`wx943cc2d81ec6f820`，名称“锅里捞啥”。
- 所属腾讯云账号：`100053731772`。
- 新环境名称：`cloud1`，环境 ID：`cloud1-d2gc9q7cobffff893`，微信体验版。微信 CLI 已成功列举该环境。
- 开发云函数固定为 `hotpotPlayerDev`，集合固定为 `hotpot_players_dev`。2026-10-15 已核对并纠正为 ADMINONLY；客户端直接读取已实测拒绝。
- 地区数据使用随包副本，与服务端校验数据保持一致。`regionsFileId` 留空，不跨账号读取旧环境私有文件。
- `allowSharedEnvironment: false`。旧环境 `hotpot-d9g7g17ifb99bdd1b` 仍受发布环境保护，不作为当前客户端目标。
- 原 `main` 分支、旧 `build/wechatgame` 目录、已归档发布 ZIP 不覆盖、不发布。用户原有 `settings/v2/packages/engine.json` 修改不纳入本任务提交。
- 测试构建目录固定为 `app/HotPot/build/wechatgame-cloud-dev`；构建与部署脚本只允许当前开发分支。

## 当前完成状态

**玩家身份、地区保存与云存档已在真实微信开发者工具中完成端到端联调。**

- 玩家档案显示编号前8位 `a21b12d4` 和“已同步到云端”。初始档案同步为云版本1。
- 在游戏地区选择器实际选择“江苏省→南京市→鼓楼区”，云端读回地区代码 `320000/320100/320106`，云版本2。
- 正常拿取一张牛肉后，云端读回 `removedIds: [L1T9]`、`tray: [beef]`，云版本3，与游戏17/18张棋盘一致。
- 双重备份当前开发存档并比对已同步后，仅隔离 cloud1 当前玩家的本机缓存，确认该键不存在，再关闭/重新打开项目。游戏从云端恢复同一地区、17/18张棋盘和一张牛肉；新建本机缓存为版本3、dirty=false。未清除旧环境或其他用户缓存，也没有将备份预先写回活动缓存。
- 集合实际初始权限为 PRIVATE。按已要求的仅管理端权限修正为 ADMINONLY 并保存后，真实客户端直接读取同一文档返回 `-502003`，云函数读取仍成功。
- 权限收紧后，继续正常拿取一张虾，云端成功保存为版本4，`removedIds: [L1T9,L1T12]`、`tray: [beef,shrimp]`。最终档案显示完整测试地区、“2张已拿取 · 云版本4”和“已同步到云端”。
- 修正档案版本号仅在打开时显示的旧值：同步变化时，版本号和存档摘要会实时刷新。

地区选择已改为固定标题/底部按钮、中间纵向滚动的卡片列表，取消分页。省、市、区县名称使用随包的 ZCOOL KuaiLe 字形子集（173字，31744字节）；拖动取消卡片点击，避免误选。完整开源字体及许可证留在 `doc/res/fonts`，新增地区名称后运行 `tools/subset-region-font.py` 重新裁剪。

独立开发构建通过 `tools/wechat-cloud-dev.build.json` 启用遮罩模块，不修改用户原有 `engine.json`。构建验证检查实际引擎的 Mask / ScrollView 导出，防止裁剪缺失导致列表初始化失败。

最新独立构建大小 3796100 字节（低于4 MB），构建摘要 `a7188606fa06`；没有上传、发布或合并发布分支。新地区页面完成类型/构建检查，修复遮罩裁剪后尚未完成模拟器滑动验收。用户最新要求仅写代码，已停止浏览器和开发工具操作；下次界面联调需遵守这一要求。

### 验收证据与测试边界

证据位于本地忽略目录 `.codex-work/cloudbase-dev`：

- `native-profile-connected.jpg`：真实玩家编号和首次云同步。
- `native-cloud-restore-ready.jpg`：隔离本机开发存档后恢复的一张牛肉棋盘。
- `native-final-profile.jpg`：最终地区、玩家编号及版本4同步状态。
- `native-adminonly-confirmed.png`：新环境和开发集合的 ADMINONLY 已保存状态。
- `dev-player-cache-before-restore.json`：恢复测试前开发缓存的本地备份；另在本机 `hotpot.validation.backup.v1:cloud1-d2gc9q7cobffff893` 保留备份。当前活动存档是后续版本4，不能自动用版本3备份覆盖它。

三关936次稳定拿牌、坏存档、地区层级、身份隔离、事务冲突、重试去重、断网队列和同步期间操作的本地测试已通过。最新 UI 修正通过托盘/真实保存钩子检查与项目 TypeScript 检查。跨真实手机设备、第二个真实微信账号、真机断网和双设备并发仍需后续验收；相关本地模拟测试不能替代真机结论。

### 已解决的接入问题

云函数首次运行曾缺少 `./generated/PlayerData`，现将生成模块放到函数根目录，加入入口加载检查，已重部署并通过真实调用。游戏随后曾因微信开发者工具缓存的旧分包继续请求 hotpot 环境，产生 `-501000 Environment not found`；官方 CLI 只清编译缓存并 close/open 重载后解决。`verify-cloud-build.cjs` 检查实际构建里的环境、AppID、cloud 标志与函数目录，并在启动时打印环境及构建摘要。客户端诊断提取嵌套错误码，不记录原始微信身份或令牌。

用户已明确允许接管电脑，且本人完成 Codex MCP 客户端授权。后续联调使用开发者工具官方 `wechatide-skill` 的读取、截图、触摸和运行时接口；未代点安全授权，也未读取或保存访问令牌。

### 旧环境接入排查记录

旧 `hotpot` 环境属于腾讯云账号 `814252020`，小游戏已经绑定 `100053731772`。腾讯云官网账号绑定页面明确返回账号冲突，未完成换绑；这与管理员微信、个人/企业主体类型无关。用户后续选择新建原生微信云环境，未解绑或迁移旧资源。

旧环境曾按此前授权新增 `hotpotPlayerDev`（ID `lam-hbbxul1p`）与 `hotpot_players_dev`（ADMINONLY）；函数无微信身份时实际返回 `IDENTITY_REQUIRED`。旧 Dev 资源保留，不自动删除。原地区文件和原有其他资源未修改。

CloudBase“身份认证→登录方式→小程序认证”曾误进入微搭低代码代开发授权，用户未最终授权并取消。不得再次使用该入口替代小游戏原生云开发。官方文档说明代开发涉及版本管理限制。用户此前曾要求自行操作，随后已明确允许接管电脑；以最新授权为准。

旧环境部署和账号冲突的截图保存在本地忽略目录 `.codex-work/cloudbase-dev`，仅作为旧环境排查记录。

## 玩家档案和存档

一个玩家对应 `hotpot_players_dev` 的一个文档，内容为：

```text
playerId          APPID + OPENID 的 SHA-256 截取32位，用作文档ID
_openid           由云函数从平台上下文取得，绝不采用客户端提供的身份
revision          云版本号，每次成功修改递增
state.profile     regionCodes（完整地区路径，允许未填写）
state.save        当前局完整存档，或 null
updatedAt         服务端时间
lastMutationId    最近成功请求的编号，用于网络重试去重
```

云函数只接受 `load`、`save`、`regions` 三种操作。入口通过官方 `@cloudbase/node-sdk.parseContext(context)` 解析平台传入的本次调用上下文，读取其中的 `WX_OPENID` / `WX_APPID`，不回退到进程中可能残留的微信身份；SDK仅承担服务端数据库和文件访问。验证 AppID、运行环境与指定集合；客户端传来的 openid/playerId/env 无法改写目标档案。对外只返回玩家编号，不返回原始 OpenID。环境可从平台运行环境变量读取，玩家身份绝不从事件参数或残留进程变量读取。

存档含：关卡编号、棋盘版本、每张食材种类、已拿取牌 ID、托盘、寄存区、复活状态、阶段领奖记录、道具次数、最后一次撤回快照、进行中/失败/胜利状态。恢复时由原关卡生成牌位和遮挡关系，再恢复食材与操作状态。

每次拿牌结算、三消逻辑结算、撤回、炸、翻锅完成、复活、重开和切关后立即写本地缓存。云端延迟约1.5秒合并同步；进入后台/回到前台/点击档案中的同步也会尝试补传。退出时若飞牌或翻锅动画尚未完成，保留前一个稳定存档，避免保存未结算状态。

本地键含开发环境和确认后的玩家编号，游客单独保存；必须先联网确认身份才能读取该账号的私有缓存。启动时无法确认身份会进入本机玩家，重新连接后可恢复账号存档，不把前一微信账号的缓存绑定给下一账号。本机玩家的地区和进度不会自动迁移到账号；连接后可以明确选择把当前这锅保存到账号。

## 并发与重试

写入在单文档事务内校验 `expectedRevision`：相同请求编号重试返回已有结果，版本落后则返回冲突，不覆盖云端。两台设备发生冲突时，在游戏中选择“使用云端进度”或“保留本机进度”；地区和棋盘作为同一版本一起保留。上传过程中发生新的拿牌会继续留在本地，上一请求成功后用新版本再上传。

共享 `PlayerData.ts` 会检查存档版本、牌总数、食材总数、剩余食材三张守恒、托盘是否已结算、道具上限、复活/寄存、阶段领奖与对局状态。这里只用于可靠云存档，不作为联网排行榜或付费奖励的防作弊验证。

## 云端部署

1. 在小游戏的微信开发者工具中打开“云开发”，确认顶部环境为 `cloud1`；环境 ID 必须是 `cloud1-d2gc9q7cobffff893`。不要再次接入旧账号环境或微搭代开发。
2. 数据库仅使用新集合 `hotpot_players_dev`，权限应为“仅管理员可读写 / ADMINONLY”，或自定义 `{ "read": false, "write": false }`。源码中的 `cloudfunctions/database.rules.json` 是规则参考，文件存在不代表云端已经应用。
3. 检查是否存在同名其他用途的函数；仅部署本分支 `hotpotPlayerDev`，入口 `index.main`，远程安装锁定的 npm 依赖。不更改套餐或购买资源。
4. 新环境不需要创建地区文件。客户端和云函数都使用准备脚本生成的随包地区副本。

通过已登录且开启服务端口的微信开发者工具部署：

```powershell
$env:COCOS_CREATOR_388 = 'D:\ProgramData\cocos\editor\Creator\3.8.8'
node .\app\HotPot\tools\prepare-cloud.cjs
powershell -ExecutionPolicy Bypass -File .\app\HotPot\tools\deploy-cloud-dev.ps1 -CreatorRoot $env:COCOS_CREATOR_388
```

CLI 固定上传该函数绝对路径，目标环境来自开发配置，不上传小游戏版本。部署脚本兼容 Windows PowerShell 对 stderr 进度输出的处理，再根据完整输出和退出码判定失败。控制台单独测试 `{"action":"load"}` 没有真实微信身份，返回 `IDENTITY_REQUIRED` 符合预期；真实身份必须从小游戏调用验证。

部署前运行 `prepare-cloud.cjs`，由客户端配置生成云函数设置，并将 `GameData.ts`、`PlayerData.ts` 编译到云函数根目录（`GameData.js`、`PlayerData.js`）。地区副本同时写入客户端资源和云函数目录，源数据位于 `doc/res/regions.json`，更新时应一起生成。

## 构建和验收

```powershell
powershell -ExecutionPolicy Bypass -File .\app\HotPot\tools\build-cloud-dev.ps1 -CreatorPath 'D:\ProgramData\cocos\editor\Creator\3.8.8\CocosCreator.exe'
```

导入 `app/HotPot/build/wechatgame-cloud-dev` 到微信开发者工具。`game.json` 会设置 `cloud: true`，`project.config.json` 指向独立云函数源码目录。旧发布构建入口在此开发分支会拒绝输出 `build/wechatgame`。

真实验收需要：

- 同一微信账号进入游戏显示玩家编号，选择江苏市县/海外/其他省份后数据库记录正确。
- 拿牌、三消、道具和复活后确认“已同步到云端”；关闭重开恢复相同棋盘、托盘、寄存和道具。
- 同一微信账号换设备或清除客户端缓存后能恢复云存档；另一微信账号不能看到原玩家档案。
- 断网操作仍保存本地，联网后补传；如果启动时离线，重新连接后选择当前本机局或已有账号局。
- 两台设备同时修改同一存档，出现选择面板，两个选项均能完成同步。
- 普通客户端直接读取/写入 Dev 玩家集合被拒绝，云函数读写正常；原地区文件、其他集合和云函数保持不变。
- 检查新增 OpenID、手动地区与游戏进度的隐私说明后，才考虑将功能合入发布分支。

本地检查：

```powershell
$env:COCOS_CREATOR_388 = 'D:\ProgramData\cocos\editor\Creator\3.8.8'
node .\app\HotPot\tools\validate-levels.cjs
node .\app\HotPot\tools\validate-tray-animation.cjs
node .\app\HotPot\tools\validate-player-save.cjs
node "$env:COCOS_CREATOR_388\resources\app.asar.unpacked\node_modules\typescript\bin\tsc" --noEmit --skipLibCheck -p .\app\HotPot\tsconfig.json
```

`skipLibCheck` 跳过 Creator 自带引擎声明中的已有错误，仍检查项目源码。新增存档测试覆盖三关936次稳定拿牌、恢复、翻锅分布、坏存档、地区父子关系、身份隔离、原文件只读、版本冲突、重试去重、同步中继续操作、存储损坏和禁用云配置。

## 官方资料

- [CloudBase 账号与已有环境关联FAQ](https://cloud.tencent.com/document/faq/876/57380)
- [微搭扫码认证的第三方代开发与版本管理限制](https://cloud.tencent.com/document/product/1301/86886)
- [微信云函数服务端 SDK](https://github.com/wechat-miniprogram/wx-server-sdk)
- [CloudBase 实例复用与身份残留说明](https://docs.cloudbase.net/cloud-function/instance)
- [CloudBase Node SDK 上下文解析](https://docs.cloudbase.net/api-reference/server/node-sdk/env)
- [CloudBase 数据库事务](https://docs.cloudbase.net/database/transaction)
- [CloudBase 数据库权限配置](https://cloud.tencent.com/document/product/876/128959)
- [微信小游戏云开发部署示例](https://github.com/wechat-miniprogram/minigame-demo/blob/master/CLOUD_README.md)
