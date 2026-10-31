import {Color,Node, Rect, resources,Size, Sprite, SpriteFrame,
  Texture2D, UITransform} from 'cc';

import {getPageTheme, PageStyle} from '../data/PageTheme';

export const CLIENT_BUILD = '20261030-confirmed-ui';
const CELL_WIDTH = 112;
const CELL_HEIGHT = 104;
const frameCache = new Map<PageStyle, SpriteFrame[]>();
const paintedFrames=new Map<PageStyle,SpriteFrame>();

/** One 448×104 atlas contains the four original-style illustrated tile faces. */
export function loadReferenceTileSkins(done:()=>void):void{
  resources.load('reference/tiles/texture',Texture2D,(error,texture)=>{
    if(!error&&texture){
      ([1,4,8,9] as PageStyle[]).forEach((id,index)=>{
        const frame=new SpriteFrame();frame.texture=texture;
        frame.rect=new Rect(index*texture.width/4,0,texture.width/4,texture.height);
        frame.originalSize=new Size(CELL_WIDTH,CELL_HEIGHT);frame.addRef();paintedFrames.set(id,frame);
      });
    }
    done();
  });
}

function rgb(value: string): number[] {
  return [1, 3, 5].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
}

/** Build both tile faces once; no canvas or per-tile Graphics buffers. */
export function createTilePixels(): Uint8Array {
  const theme = getPageTheme();
  const radius = theme.id === 4 ? 16 : theme.id === 9 ? 8 : 12;
  const pixels = new Uint8Array(CELL_WIDTH * 2 * CELL_HEIGHT * 4);
  for (let state = 0; state < 2; state++) {
    const colors = [[75, 43, 23, 28],
      [...rgb(theme.tileSide), 255], [...rgb(theme.tileEdge), 255],
      [...rgb(theme.tileFace), 255]].map((color, layer) =>
        state && layer ? color.map((v, i) => i === 3 ? v : Math.round(v * .52)) : color);
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
              const dx = Math.max(0, Math.abs(px) - (55.2 - radius - inset));
              const dy = Math.max(0,
                Math.abs(py - offset) - (45.6 - radius - inset));
              if (dx * dx + dy * dy > radius * radius) {
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
  const style = getPageTheme().id;
  let frames = frameCache.get(style);
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
    frameCache.set(style, frames);
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
  sprite.spriteFrame = paintedFrames.get(style)||frames[blocked ? 1 : 0];
  sprite.color=paintedFrames.has(style)&&blocked?new Color(130,126,116,255):Color.WHITE;
}
