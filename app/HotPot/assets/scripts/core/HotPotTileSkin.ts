import {Color, Node, resources, Sprite, Texture2D, UITransform} from 'cc';
import {getPageTheme} from '../data/PageTheme';
import {paintGameArt} from './HotPotGameArt';

export const CLIENT_BUILD = '20261104-victory-mobile';

/** Warm the actual illustrated atlas; the retired tile sheet was never drawn. */
export function loadReferenceTileSkins(done: () => void): void {
  resources.load('game-ui/style-01/texture', Texture2D, () => done());
}

/** Board, tray and reserve use the same original illustrated atlas and tint. */
export function drawSharedTile(
  node: Node, width: number, height: number, blocked: boolean,
): void {
  const style = getPageTheme().id;
  const face = node.getChildByName('FoodTileSkin') || new Node('FoodTileSkin');
  if (!face.parent) {
    node.addChild(face);
    face.setSiblingIndex(0);
  }
  face.setPosition(0, -3 * height / 91.2);
  const ui = face.getComponent(UITransform) || face.addComponent(UITransform);
  ui.setContentSize(width, height * 101.2 / 91.2);
  const sprite = face.getComponent(Sprite) || face.addComponent(Sprite);
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  paintGameArt(face, 'tile', style);
  sprite.color = blocked ? new Color(130, 126, 116, 255) : Color.WHITE;
}
