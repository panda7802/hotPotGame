# CloudBase 玩家身份、地区保存与云存档

日期：2026-10-14。开发分支：`codex/cloudbase-player-save`。基线：`f1509dbea642439a0abf86131f8f272c8095ed12`。

## 隔离范围

用户已明确选择沿用环境 `hotpot-d9g7g17ifb99bdd1b`，允许新增 `hotpotPlayerDev` 云函数及 `hotpot_players_dev` 集合，只读原地区文件，不修改原有资源。

- 小游戏 AppID：`wx943cc2d81ec6f820`。
- 地区 File ID：`cloud://hotpot-d9g7g17ifb99bdd1b.686f-hotpot-d9g7g17ifb99bdd1b-1252911381/res/regions.json`。
- 原 `main` 分支、旧 `build/wechatgame` 目录、已归档发布 ZIP 不覆盖、不发布。
- 测试构建目录固定为 `app/HotPot/build/wechatgame-cloud-dev`；新脚本拒绝在其他分支部署。
- 客户端和云函数限制使用上述 Dev 名称。共用原环境必须显式设置 `allowSharedEnvironment: true`，未授权配置会被拒绝。
- 原地区文件继续保持原权限即可：客户端可直接读取时直接下载；无权限时由新增云函数只读下载后返回地区选项。两条路径失败时使用随包副本。

## 当前完成状态

代码、共享存档校验规则、云函数源码、部署脚本和本地验证已完成。Cocos 浏览器预览已实际验证“江苏→南京→鼓楼”选择与刷新恢复，以及拿牌后棋盘/托盘恢复；无运行时错误。

**云函数与集合尚未确认真实部署，微信身份与跨设备云恢复尚待真实账号联调。** 现有微信开发者工具 CLI 连接超时，Codex 浏览器中的腾讯云控制台仍需要用户登录。模拟测试不能替代这些步骤。

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

云函数只接受 `load`、`save`、`regions` 三种操作。身份取自 `wx-server-sdk.getWXContext()`，验证 AppID、环境与指定集合；客户端传来的 openid/playerId/env 无法改写目标档案。对外只返回玩家编号，不返回原始 OpenID。

存档含：关卡编号、棋盘版本、每张食材种类、已拿取牌 ID、托盘、寄存区、复活状态、阶段领奖记录、道具次数、最后一次撤回快照、进行中/失败/胜利状态。恢复时由原关卡生成牌位和遮挡关系，再恢复食材与操作状态。

每次拿牌结算、三消逻辑结算、撤回、炸、翻锅完成、复活、重开和切关后立即写本地缓存。云端延迟约1.5秒合并同步；进入后台/回到前台/点击档案中的同步也会尝试补传。退出时若飞牌或翻锅动画尚未完成，保留前一个稳定存档，避免保存未结算状态。

本地键含开发环境和确认后的玩家编号，游客单独保存；必须先联网确认身份才能读取该账号的私有缓存。启动时无法确认身份会进入本机玩家，重新连接后可恢复账号存档，不把前一微信账号的缓存绑定给下一账号。本机玩家的地区和进度不会自动迁移到账号；连接后可以明确选择把当前这锅保存到账号。

## 并发与重试

写入在单文档事务内校验 `expectedRevision`：相同请求编号重试返回已有结果，版本落后则返回冲突，不覆盖云端。两台设备发生冲突时，在游戏中选择“使用云端进度”或“保留本机进度”；地区和棋盘作为同一版本一起保留。上传过程中发生新的拿牌会继续留在本地，上一请求成功后用新版本再上传。

共享 `PlayerData.ts` 会检查存档版本、牌总数、食材总数、剩余食材三张守恒、托盘是否已结算、道具上限、复活/寄存、阶段领奖与对局状态。这里只用于可靠云存档，不作为联网排行榜或付费奖励的防作弊验证。

## 云端部署

1. 登录腾讯云 CloudBase 控制台，确认环境为 `hotpot-d9g7g17ifb99bdd1b`；确认该环境可供本 AppID 调用。
2. 检查是否已有 `hotpotPlayerDev` 和 `hotpot_players_dev`；若是其他用途的同名资源，先核对，不覆盖其他资源。
3. 在文档型云数据库中新建集合 `hotpot_players_dev`，仅该新集合设置“仅管理员可读写”，或自定义 `{ "read": false, "write": false }`。源码中的 `cloudfunctions/database.rules.json` 是配置参考，文件存在不等于云端已应用。
4. 新建 Node.js 云函数 `hotpotPlayerDev`，入口为 `index.main`，建议使用控制台提供的 Node.js18 或更新运行时。上传整个 `app/HotPot/cloudfunctions/hotpotPlayerDev`（不上传 node_modules），安装 npm 依赖并部署。云端超时建议20秒；客户端单次等待8秒，超时会保存本地并允许重试。
5. 原 `res/regions.json` 无需覆盖、移动或开放权限。云函数读取该文件，无法读取时游戏仍能使用随包地区副本。

可以通过已登录的微信开发者工具部署：

```powershell
$env:COCOS_CREATOR_388 = 'D:\ProgramData\cocos\editor\Creator\3.8.8'
node .\app\HotPot\tools\prepare-cloud.cjs
powershell -ExecutionPolicy Bypass -File .\app\HotPot\tools\deploy-cloud-dev.ps1 -CreatorRoot $env:COCOS_CREATOR_388
```

CLI只指定上传 `hotpotPlayerDev`，不上传小游戏版本、不部署其他云函数。集合权限仍需通过控制台确认。控制台单独测试 `{"action":"load"}` 时通常没有真实微信身份，返回 `IDENTITY_REQUIRED` 符合预期；真实登录必须从小游戏调用验证。

部署前运行 `prepare-cloud.cjs`，由客户端配置生成云函数设置，并将 `GameData.ts`、`PlayerData.ts` 编译到 `generated/`。地区副本同时写入客户端资源和云函数目录。地区数据更新时应一起更新这两份规则数据。

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

- [微信云函数服务端 SDK](https://github.com/wechat-miniprogram/wx-server-sdk)
- [CloudBase 数据库事务](https://docs.cloudbase.net/database/transaction)
- [CloudBase 数据库权限配置](https://cloud.tencent.com/document/product/876/128959)
- [微信小游戏云开发部署示例](https://github.com/wechat-miniprogram/minigame-demo/blob/master/CLOUD_README.md)
