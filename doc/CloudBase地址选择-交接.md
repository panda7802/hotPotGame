# CloudBase 地址选择交接（2026-09-30）

## 当前状态

地址数据已生成，用户已通过 CloudBase 控制台上传单文件 regions.json，并提供下述 File ID。尚未接入游戏代码，没有部署云函数、创建玩家数据库，也没有完成普通玩家下载验证。

- GitHub： https://github.com/panda7802/hotPotGame ，分支 main。
- 小游戏 AppID：wx943cc2d81ec6f820。
- CloudBase 环境 ID：hotpot-d9g7g17ifb99bdd1b。
- 实际云存储路径：res/regions.json（不是之前建议的 regions/v1/，不需要改动）。
- File ID：

```text
cloud://hotpot-d9g7g17ifb99bdd1b.686f-hotpot-d9g7g17ifb99bdd1b-1252911381/res/regions.json
```

这些 ID 用于接入，不是密钥。不要把 AppSecret、SecretId、SecretKey 等提交到仓库。

## 已完成的改动

- 创建单文件树形数据：exports/cloudbase-regions/regions/v1/regions.json。
- doc/res/regions.json 为用户保存的同内容副本，交接时已核对一致。
- 全国 34 个省级行政单位加“海外”，共 35 个顶层节点。
- 只有江苏省有下一级：13 个设区市、95 个县级行政区（55 区、19 县、21 县级市）。
- 海外不分国家；其他省级行政单位不展开；港澳台单独列在省级选项中。
- 每项有字符串 code、name；有下级才有 children。叶节点不带 children。OVERSEAS 是业务代码。
- 已验证 JSON 解析、代码唯一、父子代码关系、行政单位数量与叶节点结构。文件 UTF-8 无 BOM，5560 字节。
- provinces.json 和 jiangsu.json 是初始双文件方案，已被 regions.json 替代，仅留作历史参考，不需要上传或在 APP 中读取。
- 文件放在 exports/doc 目录，不进入 Cocos assets 构建资源，不影响当前游戏包体。

## 下一台电脑继续操作

1. 克隆仓库，或在已有仓库确认本地修改已妥善保存后执行 git pull --ff-only origin main。
2. 用 Cocos Creator 3.8.8 打开 app/HotPot，等待导入，场景为 assets/scene/main.scene。不要打开仓库根目录作为 Creator 项目。
3. 微信开发者工具登录对当前 AppID 有权限的微信账号，进入上述 CloudBase 环境。
4. 先确认云存储读取权限。最后一张用户截图显示“仅创建者及管理员可读写”；用户尚未确认修改。应仅允许地址文件被玩家读取，禁止客户端写入，不要公开其他私人文件。按实际控制台权限模式配置，不能假定已完成。
5. 在源码中接入云环境初始化、wx.cloud.downloadFile 下载、文件读取和 JSON 解析、本地缓存、失败重试。File ID 使用上面的完整字符串，不使用临时下载链接。云端文件内容仍需读取验证，本次只核对了本地副本。
6. 实现逐级选择：Array.isArray(item.children) && item.children.length > 0 时展示下级，否则完成选择。选择新的上级时清空之前选择的下级。
7. 地址选择界面的入口和展示方式、是否保存到玩家档案、是否需要云端保存，尚未确定，实施前需与用户确认。这是手动选择地区，无需为了该功能添加定位权限。
8. 使用普通玩家身份验证文件可读且不可写；测试海外、非江苏省、江苏市县、回退切换、首次离线、缓存可用和下载失败场景。
9. 修改完成后重新构建并确认完整导出目录小于 4,000,000 字节，再进行真机预览。构建脚本为 app/HotPot/tools/build-wechat.ps1；需按新电脑位置指定 CreatorPath/WeChatCliPath。

上一轮提交 a070048 已归档当前小游戏构建优化、截图和 exports/HotPot-wechatgame-under4MB.zip；地址功能尚未包含在该 ZIP 内。当前任务不重新构建游戏、不自动发布微信版本。

## 数据来源和时间

江苏名称及市县归属依据江苏省政府人口区划页，截至 2025-12-31，页面发布于 2026-05-12：
https://www.jiangsu.gov.cn/col/col88749/index.html

基础代码提取自公开数据集（港澳台省级代码补齐）：
https://github.com/modood/Administrative-divisions-of-China
https://raw.githubusercontent.com/modood/Administrative-divisions-of-China/master/dist/pca-code.json

生成日期为 2026-09-30，不表示这是官方2026年新发布的代码表。已按官方95个县级行政区名单排除苏州工业园区等非独立县级行政区功能区。后续更新需要重新核对区划变化。
