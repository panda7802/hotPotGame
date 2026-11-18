import importlib.util
import json
from pathlib import Path

root = Path(__file__).parent
renderer = Path('C:/Users/panda/.codex/plugins/cache/openai-curated-remote/creative-production/0.1.25/scripts/review_renderer.py')
spec = importlib.util.spec_from_file_location('review_renderer', renderer)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
themes = [('01', '市井朱红'), ('04', '奶油黏土'), ('08', '青瓷雅韵'), ('09', '宣纸朱印')]
sections = [('A', '榜单 / 我的 / 换肤 / 第一关完成 / 第二关完成 / 第三关全部完成'), ('B', '食材图鉴 / 鲜虾详情 / 我的成就 / 所在地 / 失败复活 / 重新开始确认')]
items = []
missing = []
for number, name in themes:
    for group, caption in sections:
        image = root / f'style-{number}/{group}.png'
        if not image.exists() or image.stat().st_size == 0:
            missing.append(str(image.relative_to(root)))
            continue
        items.append({'id': f'{number}-{group}', 'title': f'{int(number)} {name} · {caption}', 'src': f'style-{number}/{group}.png', 'href': f'style-{number}/{group}.png', 'route': 'built-in image_gen', 'caption': caption, 'promptFile': f'style-{number}/prompts.json'})
(root / 'review-manifest.json').write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
(root / 'delivery-status.json').write_text(json.dumps({'completedSheets': len(items), 'completedScreenConcepts': 6*len(items), 'missingSheets': missing, 'note': '01 B and 09 B each failed twice due to network errors; written layouts are in each style folder. All four core A sheets are complete.'}, ensure_ascii=False, indent=2), encoding='utf-8')
page = module.build_review_html(root, items, {'preset': 'image-wall', 'title': '锅里捞啥 · 1 / 4 / 8 / 9 子页面设计', 'showCaptions': True, 'showPrompts': False, 'minTileWidth': 280})
print(page)
