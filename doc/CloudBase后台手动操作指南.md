# 锅里捞啥：CloudBase 后台手动操作指南

适用日期：2026-10-15。当前是开发环境；这里的后台是腾讯云 CloudBase 控制台。

2026-10-20 新增图鉴与成就，见 [开发及升级说明](图鉴与成就开发说明.md)。请先部署新版 `hotpotPlayerDev` 再构建客户端；玩家永久记录位于 `state.progress`，重置对局时保留它。

## 1. 后台地址与账号

- [打开当前环境后台](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gc9q7cobffff893#/overview)
- [打开云函数管理](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gc9q7cobffff893#/cloud-function/overview)
- [打开玩家集合](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gc9q7cobffff893#/db/doc/collection/flexdb/tnt-dqlekvzck/hotpot_players_dev)
- [腾讯云环境列表备用入口](https://console.cloud.tencent.com/tcb/platform/env)

若直达集合链接失效，从环境后台点击「数据库 → 文档型数据库 → hotpot_players_dev」。若跳到登录页，登录后重新打开环境地址。

| 核对项 | 当前值 |
| --- | --- |
| 腾讯云账号 ID | `100053731772` |
| 环境名 | `cloud1` |
| 环境 ID | `cloud1-d2gc9q7cobffff893` |
| 小游戏 AppID | `wx943cc2d81ec6f820` |
| 云函数 | `hotpotPlayerDev` |
| 玩家集合 | `hotpot_players_dev` |
| 集合权限 | 无权限（ADMINONLY），仅管理端/云函数可访问 |

也可以在已导入开发项目的微信开发者工具中点击「云开发」，选择同一环境。环境列表为空时，先核对账号和环境 ID。旧 `hotpot-d9g7g17ifb99bdd1b` 属于另一账号，当前开发版不使用它。不要进入微搭代开发授权，也不需要重新绑定小游戏或提供密钥。

## 2. 找到一个玩家

1. 在游戏里打开「档案」，记录「玩家编号」的前 8 位。
2. 打开后台的 `hotpot_players_dev` 集合，找到 `playerId` 以这 8 位开头的记录。若有多个同前缀记录，应核对完整编号。
3. 每位玩家一条文档；文档 `_id` 与完整 `playerId` 相同。只有真实进入开发版并连接云端的玩家才会产生记录。

需要完整编号时，在**小游戏开发者工具的调试器 Console** 执行下面的只读命令。它仅输出玩家编号和云版本：

```javascript
wx.cloud.callFunction({
  name: 'hotpotPlayerDev',
  config: {env: 'cloud1-d2gc9q7cobffff893'},
  data: {action: 'load'},
  success: r => console.log('玩家档案', JSON.stringify({
    ok: r.result.ok,
    code: r.result.code,
    playerId: r.result.player && r.result.player.playerId,
    revision: r.result.player && r.result.player.revision
  })),
  fail: e => console.error(e.errCode, e.errMsg)
});
```

找到完整编号后，可在集合的查询条件中使用 `{"playerId":"完整的32位编号"}`。不要把微信 OpenID 当作游戏显示的玩家编号；无需复制或公开 `_openid`。

## 3. 字段怎么看

| 字段 | 含义 / 能否手动调整 |
| --- | --- |
| `_id`、`playerId`、`_openid` | 身份及归属；保留原值，不手动改 |
| `revision` | 存档版本号；每次手动修改也应在原值上加 1 |
| `state.profile.regionCodes` | 地区代码路径，可以按下一节修改 |
| `state.save` | 完整棋盘存档；清空时设为 JSON `null`，不可随意改其中一项 |
| `state.progress` | 图鉴和成就永久记录；重置当前对局时保留 |
| `updatedAt` | 数字类型的 Unix 毫秒时间戳 |
| `lastMutationId` | 最近一次修改标记；人工修改也应换一个新标记 |

当前未保存昵称、头像和手机号。新增任意数据库字段不会自动出现在游戏里；云函数下一次保存也可能移除这些额外字段。

## 4. 手动修改玩家地区

日常改自己的地区，直接使用游戏里的「档案 → 选择地区 → 逐级点选」即可自动保存。后台调整按以下步骤：

1. 先让该玩家在游戏中等待「已同步到云端」，然后关闭该账号所有设备上的游戏。
2. 在后台打开对应文档，使用导出功能或复制完整 JSON，保存一份修改前备份；记录原 `revision`。
3. 编辑 `state.profile.regionCodes`，保持数组类型。代码必须来自 [地区源文件](res/regions.json)，且是从省到末级的完整路径。
4. **在同一次文档保存中**，把 `revision` 从原值加 1，把 `updatedAt` 更新为当前毫秒时间戳，把 `lastMutationId` 换成唯一标记，例如 `admin-20261015-region-01`（每次使用不同值）。保留其他字段。
5. 保存后重新打开文档，核对代码、版本号和字段类型，再让玩家重新进入游戏，核对档案中的地区及同步状态。

示例：将地区改成「江苏省 / 南京市 / 鼓楼区」，只把地区数组设为：

```json
["320000", "320100", "320106"]
```

若原 `revision` 是 `4`，本次应改为数字 `5`。清除已选地区可设为 `[]`。不要只填 `["320000"]`：江苏目前有城市和区县，存档校验要求选到末级；只有没有下级的省份节点可以单独保存。

获取当前时间戳可在本机 PowerShell 执行：

```powershell
[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
```

如果玩家仍在线，手动改动可能与本机待同步进度冲突。出现「发现两份不同进度」时，选择「使用云端进度」才会采用本次后台修改；「保留本机进度」会覆盖为本机版本。不要通过减少版本号解决冲突。

## 5. 重置某位玩家的对局

1. 按上一节要求先同步、关闭游戏并备份目标文档。
2. 只把 `state.save` 改为 JSON `null`，保留 `state.profile.regionCodes`，这样地区不丢失。
3. 同一次保存时递增 `revision`，更新数字类型的 `updatedAt` 和唯一 `lastMutationId`。
4. 玩家重新进入游戏后会从第 1 关开始，并自动生成新的对局存档。此后 `state.save` 再次有内容是正常现象。

不要通过只改 `levelIndex`、`tray`、`removedIds` 或食材种类来跳关；它们必须与关卡、棋盘版本和三消数量守恒一致。需要恢复备份时，先核对同一玩家，在关闭游戏后恢复备份里的 **`state`**，但使用当前版本号加 1、新时间戳、新修改标记；不要把整份旧文档的版本号倒退写回。

## 6. 调整地区选项及卡通字体

普通游戏代码/文案修改后，可直接使用 [Cocos 图形界面构建指南](Cocos图形界面构建云开发版.md) 中的独立任务打包。首次需要新建任务并导入配置；输出目录存在不代表任务已经出现在编辑器面板。

地区数据当前随游戏和云函数一起打包，**后台存储中没有可直接编辑生效的地区文件**。当前数据为全国省级选项、江苏完整市区县及海外入口；其他省份还没有完整城市区县。

修改顺序：

1. 编辑仓库 `doc/res/regions.json`。格式是节点数组，每个节点有 `code`、`name`，下级放在 `children` 数组里。代码不能重复；层级最多三级。
2. 优先新增节点或改显示名称。已用于玩家档案的代码和父子关系应保持稳定；删除或改动这些代码，需要另行迁移已有玩家地区。
3. 地区名称使用随包卡通字体。新增名称后运行字形裁剪脚本，避免新字显示为空白。完整字体和许可证在 `doc/res/fonts`，不会把完整字体装入小游戏包。
4. 同步生成客户端与服务端地区副本，重新部署开发云函数，再构建开发小游戏。**仅修改 JSON 或仅更新云函数，不会刷新已经发布的游戏包。**

在仓库目录 `D:\codeX\create` 中执行：

```powershell
# 首次需要为当前 Python 安装字体裁剪工具
python -m pip install fonttools
python .\app\HotPot\tools\subset-region-font.py

$env:COCOS_CREATOR_388 = 'D:\ProgramData\cocos\editor\Creator\3.8.8'
node .\app\HotPot\tools\prepare-cloud.cjs

# 部署开发云函数（不是上传小游戏）
powershell -ExecutionPolicy Bypass -File .\app\HotPot\tools\deploy-cloud-dev.ps1 -CreatorRoot $env:COCOS_CREATOR_388

# 输出独立开发构建
powershell -ExecutionPolicy Bypass -File .\app\HotPot\tools\build-cloud-dev.ps1 -CreatorPath 'D:\ProgramData\cocos\editor\Creator\3.8.8\CocosCreator.exe'
```

脚本要求分支为 `codex/cloudbase-player-save`。在微信开发者工具打开 `D:\codeX\create\app\HotPot\build\wechatgame-cloud-dev` 查看效果。不要覆盖原来的 `build/wechatgame`。构建不等于发布，此操作没有上传审核或发布小游戏。

开发构建脚本会读取 `app/HotPot/tools/wechat-cloud-dev.build.json`，仅为本次构建启用滚动区域需要的遮罩模块，保留原引擎设置文件。如果手动使用 Cocos 构建，请导入该构建配置；否则裁剪掉 Mask 后会出现 Error 3804、地区列表空白。构建验证会检查 Mask / ScrollView 导出。

字体来源：[Google Fonts / ZCOOL KuaiLe](https://github.com/google/fonts/tree/main/ofl/zcoolkuaile)，按 SIL OFL 1.1 保留许可证及字体内版权信息。裁剪工具发现字库缺字会报错，应先补充合适字体，再构建。

## 7. 维护云函数与权限

- 查看日志：进入「云函数 → hotpotPlayerDev → 日志」，对应操作时间排查。
- 代码修改优先使用上一节部署脚本，它会生成根目录的 `GameData.js`、`PlayerData.js`、`settings.json`、`regions.json`。不要直接修改生成文件，否则下次准备脚本会覆盖。
- 手动上传 ZIP 时，入口和这两个 JS 模块必须位于 ZIP 根目录；入口为 `index.main`，安装 `package.json` / 锁文件声明的依赖。旧 `exports/cloudbase-player-dev/hotpotPlayerDev.zip` 是导出时的快照，源码改动后需重新生成包，不能拿旧 ZIP 代替新代码。
- 集合「权限设置」保持 **无权限（ADMINONLY）**。游戏经过云函数读写；不需要给客户端开放直接读写权限。
- 后台直接测试 `{"action":"load"}` 没有真实微信身份，返回 `IDENTITY_REQUIRED` 正常。实际身份必须从小游戏调用，不要通过填写伪造 OpenID 绕过身份检查。

| 现象 | 排查方式 |
| --- | --- |
| 环境列表为空 | 核对账号 `100053731772`，使用上方当前环境直达地址，或小游戏工具的云开发入口 |
| `-501000 Environment not found` | 核对请求环境 ID；若日志还显示旧 hotpot，清除开发工具的「编译缓存」并关闭/重新打开开发项目，保留存储缓存 |
| `Cannot find module` | 重新准备并部署函数；检查根目录的 `PlayerData.js`、`GameData.js`，不要沿用旧 generated 子目录结构 |
| `DATABASE_UNAVAILABLE` | 检查当前环境、集合名、文档归属字段是否被修改以及函数日志 |
| `INVALID_STATE` / 地区不生效 | 检查地区是否为完整末级路径，客户端和服务端地区副本是否一致，存档字段是否被单独改坏 |
| 后台改后游戏仍是原数据 | 先重进游戏；若有存档冲突选择云端版本；检查是否编辑了别的玩家/旧环境，及是否递增 revision |

更多开发机制和已完成验收见 [玩家开发交接](CloudBase玩家身份与云存档-开发交接.md)。
