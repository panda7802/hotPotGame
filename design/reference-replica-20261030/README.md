# 四套原稿界面实现

已接入 01 市井朱红、04 奶油黏土、08 青瓷雅韵、09 宣纸朱印，代码入口为 app/HotPot/assets/scripts/core/HotPotGame.ts。

- review.html：原稿与52个实际运行状态，可点击放大。
- runtime/verification.json：四主题交互检查通过，页面无脚本错误。
- source/a-clean-01.png：本轮使用内置 ImageGen 清理的原稿数据底板，最终提示词见 source/a-clean-01-final-prompt.json。
- exports/HotPot-reference-1489-20261030/wechatgame：最终开发者工具导入目录（位于仓库根目录）。

验证：Cocos Creator 3.8.8 网页与微信正式构建、TypeScript、移动端共享纹理性能和存档回归通过。客户端 3,790,215 字节；资源分包 1,959,763 字节，每包均低于 2,000,000 字节，总计低于 4,000,000 字节。

限制：本次没有手机扫码真机验证，也没有发布或部署云函数。页面采用原稿图集与实时交互叠加，动态图鉴、地区列表、压缩清晰度和屏幕比例仍与效果稿存在差异；不承诺像素级一致。
