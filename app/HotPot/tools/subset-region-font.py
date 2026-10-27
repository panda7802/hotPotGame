"""Rebuild the bundled region font after editing doc/res/regions.json.

Requires fonttools (pip install fonttools). The full upstream font stays outside
the Cocos assets directory so it never enters the WeChat package.
"""
import json
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[3]
source = root / 'doc/res/fonts/ZCOOLKuaiLe-Regular.ttf'
output = root / 'app/HotPot/assets/resources/fonts/HotPotRegion.ttf'
regions = json.loads(
    (root / 'doc/res/regions.json').read_text(encoding='utf-8-sig')
)

def names(nodes):
    """递归收集地区名称，供字体子集保留全部地区文字。"""
    return ''.join(
        node['name'] + names(node.get('children', [])) for node in nodes
    )

text = names(regions) + '选择地区'
font = TTFont(source)
missing = set(map(ord, text)) - set(font.getBestCmap())
if missing:
    raise ValueError(
        'Font lacks region characters: ' + ''.join(map(chr, sorted(missing)))
    )
options = subset.Options()
options.name_IDs = ['*']  # Preserve upstream copyright and license metadata.
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
output.parent.mkdir(parents=True, exist_ok=True)
font.save(output)
print(
    f'Region font: {len(set(text))} characters, {output.stat().st_size} bytes'
)
