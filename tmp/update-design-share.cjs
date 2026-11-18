'use strict';
const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'../design/all-pages-ninepatch-20261030');
function replace(file,a,b){const p=path.join(root,file),s=fs.readFileSync(p,'utf8');if(!s.includes(a))throw Error('Missing target '+file+' '+a);fs.writeFileSync(p,s.replaceAll(a,b))}
replace('screen.js',"['palette','页面换肤','picker']","['palette','页面换肤','picker'],['share','分享给好友','toast-share-web']");
replace('screen.js',"const icon=n=>", "paths.share='M18 8a3 3 0 1 0-3-3 3 3 0 0 0 3 3ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 10l6-4M9 14l6 4';\nconst icon=n=>");
replace('screen.js',"'toast-style-saved':['profile','palette','页面风格已更新']", "'toast-style-saved':['profile','palette','页面风格已更新'],'toast-share-web':['profile','share','请在微信内打开后分享']");
replace('catalog.js',"window.CORE_STATES=core.map", "core.push(['toast-share-web','分享 · 网页环境提示','提示']);\nwindow.CORE_STATES=core.map");
fs.appendFileSync(path.join(root,'polish.css'),'\n.menu-list{gap:12px}.menu-row{min-height:76px}.compact .menu-list{gap:8px}.compact .menu-row{min-height:60px;padding:5px 22px;font-size:26px}.compact .menu-icon{width:42px;height:42px;font-size:27px}\n');
replace('render.cjs',"['revive','revive-used'].includes(s.id)","['revive','revive-used','profile','cloud-conflict','account-choice','cloud-confirm','save-error-dialog','toast-saved','toast-restored','toast-save-error','toast-style-saved','toast-share-web'].includes(s.id)");
replace('finish.cjs','1308','1320');replace('finish.cjs','109 个画面','110 个画面');
replace('verify.cjs',"locator('.menu-row').count(),5", "locator('.menu-row').count(),6");replace('verify.cjs',"locator('.card').count(),109", "locator('.card').count(),110");
replace('README.md','59 个页面、弹框与状态','60 个页面、弹框与状态');replace('README.md','109 个独立画面','110 个独立画面');replace('README.md','1,308','1,320');replace('README.md','换肤五个入口','换肤及分享六个入口');replace('页面与弹框清单.md','换肤五个入口','换肤、分享六个入口');replace('页面与弹框清单.md','恢复所选进度、保存失败提示','恢复所选进度、保存失败提示；网页分享提示（微信内调用系统分享面板，不另造系统界面）');
fs.appendFileSync(path.join(root,'README.md'),'\n旧版 UI 评审稿已清理。`source-art/` 保留 11 份原始背景、外框与食材图集；历史运行验证记录集中保存在工作区 `.codex-work/ui-runtime-evidence-20261030`。当前游戏的运行验证目录和宣传封面单独保留。\n');
console.log('Design-only share entry added; 110 states per theme.');
