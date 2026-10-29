import importlib.util
import json
from pathlib import Path

root = Path(__file__).parent
renderer = Path('C:/Users/panda/.codex/plugins/cache/openai-curated-remote/creative-production/0.1.25/scripts/review_renderer.py')
spec = importlib.util.spec_from_file_location('review_renderer', renderer)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
themes = [(1,'市井朱红'),(4,'奶油黏土'),(8,'青瓷雅韵'),(9,'宣纸朱印')]
pages = [('gameplay-level3','第三关实际牌阵'),('profile','我的小馆'),('picker','页面换肤'),('ranking','地域排行榜'),('collection','50种食材图鉴'),('detail','食材详情'),('achievements','我的成就'),('restart','重开确认'),('revive','免费复活'),('win-level1','第一关完成'),('win-level2','第二关完成'),('win-level3','第三关全部完成')]
items = []
for theme,name in themes:
    for prefix,title in pages:
        image = f'runtime/{prefix}-{theme}.png'
        if not (root / image).exists():
            raise RuntimeError(f'Missing screenshot: {image}')
        items.append({'src':image,'href':image,'title':f'{theme} {name} · {title}','route':'Cocos 3.8.8 local web build','caption':'实际运行截图；离线示例数据'})
(root / 'review-manifest.json').write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
print(module.build_review_html(root,items,{'preset':'image-wall','title':'锅里捞啥 · 四主题实际运行截图','minTileWidth':280,'showPrompts':False,'showCaptions':True}))
