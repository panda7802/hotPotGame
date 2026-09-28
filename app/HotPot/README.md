# 火锅叠叠消 V0.1

基于 **Cocos Creator 3.8.8 + TypeScript** 的竖屏叠层点选三消 MVP。

## 运行

1. 使用 Cocos Creator 3.8.8 打开本目录。
2. 等待首次资源导入完成。
3. 打开 `assets/scene/main.scene`，点击预览。

顶部左右箭头可直接切换 10 个测试关卡。发亮牌可点击，变暗牌表示仍被上层覆盖。

## 微信小游戏

保存并关闭 Cocos Creator 后，在 PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\build-wechat.ps1 -Open
```

脚本会生成 `build/wechatgame/`，并调用本机微信开发者工具。若工具的“服务端口”已开启，脚本会自动载入项目；否则会打开入口页，此时选择“导入项目”并选中该构建目录。默认 AppId 只用于本地调试；真机预览或上传时使用 `-AppId 'wx你的小游戏AppId'`。详细说明见 `../../doc/火锅叠叠消-微信小游戏运行说明.md`。

## 代码位置

- `assets/scripts/core/HotPotGame.ts`：场景 UI、点击、托盘、三消、胜负和动画。
- `assets/scripts/data/GameData.ts`：食材、10 关配置、可复现牌堆与遮挡关系生成。
- `assets/resources/ingredients/`：6 种食材的透明 PNG 图片。
- `assets/resources/backgrounds/`：无雾气的整页、棋盘和右下角静态火锅背景资源。
- `assets/resources/audio/`：背景音乐、三消、过关和失败的 MP3 音频。
- `tools/validate-levels.cjs`：关卡结构与可解路径验证。
- `tools/build-wechat.ps1`：构建微信小游戏并可直接用微信开发者工具打开。
- `../../doc/火锅叠叠消-项目文件说明.md`：完整的目录与文件用途说明。
- `../../doc/火锅叠叠消-手动开发指南.md`：手动修改代码、关卡、图片、音频和刷新构建的具体步骤。

## 食材图片映射

| 编号 | 文件 | 食材 |
| --- | --- | --- |
| 01 | `beef.png` | 牛肉 |
| 02 | `shrimp.png` | 鲜虾 |
| 03 | `vegetable.png` | 青菜 |
| 04 | `mushroom.png` | 蘑菇 |
| 05 | `corn.png` | 玉米 |
| 06 | `fish.png` | 鱼片 |

正式美术可直接覆盖对应的同名 PNG。微信小游戏版本建议统一使用 `384 × 288`、保持 4:3 比例和透明背景，避免主包被原始大图撑大。

## V0.1 内容

- 720 × 1280 竖屏布局
- 6 种食材的透明 PNG 美术
- 2～4 层的几何覆盖判定
- 点击入托盘、同类自动排序、三个自动消除
- 7 格托盘、胜利/失败面板、重新开始
- 10 个数据驱动测试关卡（18～78 张牌）
- 首次触摸后循环播放背景音乐，并播放三消、过关和失败音效

订单、火锅特殊牌、道具和存档未纳入 V0.1。原 3D Hello World 素材已不被主场景引用，不会进入按场景引用构建的正式包。
