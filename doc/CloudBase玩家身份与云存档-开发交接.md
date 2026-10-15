# CloudBase 玩家身份、地区保存与云存档

日期：2026-10-15。开发分支：`codex/cloudbase-player-save`。基线：`f1509dbea642439a0abf86131f8f272c8095ed12`。

## 当前环境与隔离范围

用户已同意在小游戏所属腾讯云账号下创建独立微信云开发环境，并手动完成创建。

- 小游戏 AppID：`wx943cc2d81ec6f820`，名称“锅里捞啥”。
- 所属腾讯云账号：`100053731772`。
- 新环境名称：`cloud1`，环境 ID：`cloud1-d2gc9q7cobffff893`，微信体验版。微信 CLI 已成功列举该环境。
- 开发云函数固定为 `hotpotPlayerDev`，集合固定为 `hotpot_players_dev`。2026-10-15 用户确认已按“仅管理员可读写 / ADMINONLY”的操作要求创建集合；尚未独立读取云端权限配置。
- 地区数据使用随包副本，与服务端校验数据保持一致。`regionsFileId` 留空，不跨账号读取旧环境私有文件。
- `allowSharedEnvironment: false`。旧环境 `hotpot-d9g7g17ifb99bdd1b` 仍受发布环境保护，不作为当前客户端目标。
- 原 `main` 分支、旧 `build/wechatgame` 目录、已归档发布 ZIP 不覆盖、不发布。用户原有 `settings/v2/packages/engine.json` 修改不纳入本任务提交。
- 测试构建目录固定为 `app/HotPot/build/wechatgame-cloud-dev`；构建与部署脚本只允许当前开发分支。

## 当前完成状态

代码、共享校验规则和本地验证已完成，包括三关936次稳定拿牌、存档往返、身份隔离、事务版本冲突、重试去重、断网队列和同步期间继续操作。新增验证确认新环境不读取旧环境地区文件。

**新环境已真实通过 regions 与 load 调用：微信身份校验和数据库档案读取成功；游戏界面中的连接仍失败，地区保存和云恢复尚未验收。**

2026-10-15 微信 CLI 部署返回 `hotpotPlayerDev: success true`（10个文件，23.7 KB），随后列举新环境函数可见该名称。独立 Cocos 构建完成，大小3758271字节，低于4 MB。构建没有打开或接管用户界面。部署成功、本地验证与重新编译后的本地恢复，均不能单独证明云恢复已通过。

此前 Cocos 浏览器预览已验证“江苏→南京→鼓楼”选择与刷新恢复；微信开发者工具中拿取一张牛肉后重新编译也已恢复17/18张棋盘和一张托盘。这些都是本地恢复证据。

用户在新环境实际点击连接仍未取得玩家编号，日志外层错误码为 `-1`。按只读 `regions` 调用进一步诊断，平台返回内层 `-504002`，明确为 `Cannot find module './generated/PlayerData'`。因此云函数部署命令成功并不代表运行入口可用。已将生成模块移到函数根目录，并加入入口加载检查和嵌套错误码提取测试；修正版已再次部署，CLI 返回 success true（10个文件、23.6 KB），开发构建已更新。随后用户在微信开发者工具执行相同 regions 调用，截图明确显示“云端诊断 true undefined”（ok 为 true、无业务错误码），证明模块修复后的真实调用和身份校验成功；该接口不读写数据库，不能由此推断玩家档案或云恢复已通过。诊断日志只输出错误码与白名单原因，不输出原始身份或令牌。

后续用户直接执行同环境 `load`，实际返回 `ok: true`、玩家编号（前8位 `a21b12d4`）与 `revision: 0`，证明身份和数据库读取链路可用。游戏内重新连接仍只报 `-1`，因此继续核对游戏实际调用参数与平台失败说明，不再要求更换账号、重建环境或集合。控制台直接调用成功不能代替游戏中的保存与云恢复验收。

临时拦截游戏实际 callFunction 后，用户截图确认游戏内 load 和 regions 请求仍指向旧 hotpot 环境，平台返回 `-501000 Environment not found`；这与控制台指定 cloud1 的成功调用形成明确区别。本机独立构建内的 CLOUD_CONFIG 已核实指向 cloud1，因此后续排查开发者工具编译缓存或实际打开目录，不重建云资源。新增 verify-cloud-build.cjs 核对构建内实际环境声明、AppID、cloud 标志和函数根目录，并在启动时打印目标环境与构建摘要，便于识别旧包。

用户随后授权接管电脑。已使用官方 CLI cache --clean compile 只清该开发项目编译缓存，然后 close/open 重载项目；没有清除 storage、auth、file 或云端数据。原生桌面点击未产生可见反馈，改用开发者工具自带 wechatide 调试接口；当前停在首次 Codex MCP 客户端授权弹窗，必须由用户本人允许，未代点或更改安全设置。

### 旧环境接入排查记录

旧 `hotpot` 环境属于腾讯云账号 `814252020`，小游戏已经绑定 `100053731772`。腾讯云官网账号绑定页面明确返回账号冲突，未完成换绑；这与管理员微信、个人/企业主体类型无关。用户后续选择新建原生微信云环境，未解绑或迁移旧资源。

旧环境曾按此前授权新增 `hotpotPlayerDev`（ID `lam-hbbxul1p`）与 `hotpot_players_dev`（ADMINONLY）；函数无微信身份时实际返回 `IDENTITY_REQUIRED`。旧 Dev 资源保留，不自动删除。原地区文件和原有其他资源未修改。

CloudBase“身份认证→登录方式→小程序认证”曾误进入微搭低代码代开发授权，用户未最终授权并取消。不得再次使用该入口替代小游戏原生云开发。官方文档说明代开发涉及版本管理限制。用户希望自行操作电脑；后续只提供界面步骤，后台 CLI、代码修改与构建不接管鼠标或切换窗口。

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
