import {Node, Rect, Size, Sprite, SpriteFrame,
  Texture2D, UITransform} from 'cc';

export const CLIENT_BUILD = '20261029-memory2';
const CELL_WIDTH = 112;
const CELL_HEIGHT = 104;
let frames: SpriteFrame[] | null = null;

/** Build both tile faces once; no canvas or per-tile Graphics buffers. */
export function createTilePixels(): Uint8Array {
  const pixels = new Uint8Array(CELL_WIDTH * 2 * CELL_HEIGHT * 4);
  for (let state = 0; state < 2; state++) {
    const colors = state
      ? [[75, 43, 23, 28], [102, 87, 70, 255],
        [117, 105, 84, 255], [140, 135, 123, 255]]
      : [[75, 43, 23, 28], [185, 154, 114, 255],
        [213, 190, 153, 255], [255, 245, 223, 255]];
    for (let y = 0; y < CELL_HEIGHT; y++) {
      for (let x = 0; x < CELL_WIDTH; x++) {
        const result = [0, 0, 0, 0];
        for (const sx of [0.25, 0.75]) {
          for (const sy of [0.25, 0.75]) {
            const px = (x + sx) / CELL_WIDTH * 110.4 - 55.2;
            const py = 47.6 - (y + sy) / CELL_HEIGHT * 101.2;
            const sample = [0, 0, 0, 0];
            for (let layer = 0; layer < 4; layer++) {
              const inset = [1, 0, 0, 1.5][layer];
              const offset = [-7, -4, 0, 1][layer];
              const dx = Math.max(0, Math.abs(px) - (43.2 - inset));
              const dy = Math.max(0,
                Math.abs(py - offset) - (33.6 - inset));
              if (dx * dx + dy * dy > 144) {
                continue;
              }
              const color = colors[layer];
              const alpha = color[3] / 255;
              for (let c = 0; c < 3; c++) {
                sample[c] = color[c] * alpha + sample[c] * (1 - alpha);
              }
              sample[3] = alpha + sample[3] * (1 - alpha);
            }
            if (Math.abs(py - 43.6) < 0.5 && Math.abs(px) < 42.2) {
              const highlight = state ? [140, 139, 133] : [255, 252, 242];
              sample.splice(0, 4, ...highlight, 1);
            }
            for (let c = 0; c < 4; c++) {
              result[c] += sample[c] / 4;
            }
          }
        }
        const at = (y * CELL_WIDTH * 2 + state * CELL_WIDTH + x) * 4;
        for (let c = 0; c < 3; c++) {
          pixels[at + c] = result[3] ? result[c] / result[3] : 0;
        }
        pixels[at + 3] = Math.round(result[3] * 255);
      }
    }
  }
  return pixels;
}

/** All board, tray and reserve faces share this tiny GPU texture. */
export function drawSharedTile(
  node: Node, width: number, height: number, blocked: boolean,
): void {
  if (!frames) {
    const texture = new Texture2D();
    texture.reset({width: CELL_WIDTH * 2, height: CELL_HEIGHT});
    texture.uploadData(createTilePixels());
    texture.addRef();
    frames = [0, 1].map((index) => {
      const frame = new SpriteFrame();
      frame.texture = texture;
      frame.rect = new Rect(index * CELL_WIDTH, 0, CELL_WIDTH, CELL_HEIGHT);
      frame.originalSize = new Size(CELL_WIDTH, CELL_HEIGHT);
      frame.addRef();
      return frame;
    });
  }
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
  sprite.spriteFrame = frames[blocked ? 1 : 0];
}
