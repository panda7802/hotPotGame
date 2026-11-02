# 本机保留的导出文件

最新微信包为 `HotPot-level3-wechat-fix-20261102/` 及同名 ZIP，
版本 `20261102-level3-wechat-fix`。导入其 `wechatgame` 文件夹。
客户端 **3,939,405 字节**；包含三造型、888 张、50 层，以及未开始旧第三关自动更新。
附带配套 `cloudfunctions/hotpotPlayerDev`，使用云存档时应同步更新。
源码构建目录 `app/HotPot/build/wechatgame-cloud-dev` 同样已重建。
以下为旧包记录，不能用来检查本次第三关改动。

最新测试包为 `HotPot-tray-fix-20261102/` 及同名 ZIP，版本 `20261102-tray-insertion-smooth`。

微信开发者工具导入 `HotPot-tray-fix-20261102/wechatgame`。包含当前全屏菜单与榜单功能，以及本次食材落槽闪烁、插入让位顺序修复。
完整客户端 **3,920,683 字节**，小于 4,000,000 字节。导入说明、运行检查与逐文件校验值在交付目录中。
尚未微信真机验收，未上传或发布小游戏，未部署云函数。详见 [修复记录](../doc/食材入槽闪烁与插入顺序修复-2026-11-02.md)。

另保留：

- `HotPot-four-style-ui-4mb-20261031/` 和同名 ZIP：2026-10-31 客户端备份，版本 `20261031-four-style-game-ui`。
- `cloudbase-player-dev/`、`cloudbase-regions/`：云开发配套资料。

更早的 UI 试验包、同版本目录与 ZIP 备份及旧体积报告已清理。`exports/` 内新包由 `.gitignore` 忽略。
