# 四主题珍藏庆功弹框

当前运行资源已按用户要求压缩为 **720×774 JPEG、质量 84、4:4:4 色度采样**，四张合计 688,657 字节。原始 PNG 保留作设计源文件，不进入客户端。当前效果见 `runtime-mobile-overview.jpg`，验证见 `mobile-verification.json`、`runtime-mobile-checks.json`、`wechat-preview-mobile.json`，压缩设置及资源清单见 `production-assets.json`。

日期：2026-11-04。按用户提供的第一关完成弹框截图设计，使用内置 image_gen 工具生成。

效果图：`jade-feast-v1.png`；完整提示词：`prompt.txt`。

沿用米白、青瓷绿、金色边饰与上下两级按钮。上方以满溢青瓷火锅、夸张食材、飞溅汤汁、蒸汽及金星表现通关庆祝氛围。保留完成关卡、清空食材数量、下一关与返回游戏文案。

V1/V2 为审阅阶段设计稿，保留在 design 目录；四主题运行接入结果见下文“四主题代码接入”。

## V2：珍藏庆功宴

效果图：`jade-feast-v2.png`；完整提示词：`prompt-v2.txt`。使用内置 image_gen 编辑 V1，保留其余布局和文案，移除右上角关闭按钮，加入帝王蟹、蓝龙虾、松茸和黑松露。

四种珍藏食材以 `../hidden-ingredients-20261103/` 中对应原图作为参考，保持已有造型及蓝龙虾的蓝金配色，直接融合进火锅盛宴。V1 原图继续保留。

## 四主题代码接入

按用户确认的“四套主题通关弹框，覆盖三关”接入。`background-01/04/08/09.png` 是供代码动态叠加文字的无字原图，分别对应市井朱红、奶油黏土、青瓷雅韵与宣纸朱印。`production-prompts.json` 保存内置 image_gen 完整提示词，`production-assets.json` 保存资源尺寸、分包名称及 RGBA 像素校验结果。

运行资源位于 `app/HotPot/assets/victory` 的四个独立主题分包。三关复用各自主题底图，标题、统计与按钮为真实 Cocos 文字和点击区域。运行实拍拼图见 `runtime-overview.png`，验收与交付见 `doc/四主题珍藏通关弹框-2026-11-04.md`。
