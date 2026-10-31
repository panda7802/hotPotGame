import {Node,Rect,resources,Sprite,SpriteFrame,Texture2D,UITransform,view} from 'cc';
import {PageStyle} from '../data/PageTheme';
import {GAME_ART_RECTS} from '../data/GameInterfaceAssets';

export type GameArtRole='brand'|'panel'|'settings'|'gift'|'tile'|'slot'|'tray'|'undo'|'bomb'|'shuffle'|'restart'|'sound'|'stage';
const textures=new Map<PageStyle,Promise<Texture2D>>();
const frames=new Map<string,SpriteFrame>();
function texture(style:PageStyle):Promise<Texture2D>{
  let pending=textures.get(style);
  if(!pending){pending=new Promise((resolve,reject)=>resources.load('game-ui/style-0'+style+'/texture',Texture2D,(error,value)=>error?reject(error):resolve(value)));textures.set(style,pending)}
  return pending;
}
export function preloadGameArt(done:()=>void):void{
  Promise.all(([1,4,8,9] as PageStyle[]).map(texture)).then(()=>done()).catch(error=>{console.error('[Game UI] Cannot load artwork',error);done()});
}
/** Shared immutable frames: no per-tile texture, and no stale theme callback. */
export function paintGameArt(node:Node,role:GameArtRole,style:PageStyle,sliced=false):void{
  const key=style+':'+role+':'+sliced;
  if((node as any).gameArtKey===key){
    const face=sliced?node.getChildByName('SlicedArtwork'):null;
    const image=node.getComponent(Sprite)?.spriteFrame?.texture;
    if(face&&image){const ratio=image.width/1024,ui=node.getComponent(UITransform)!;face.getComponent(UITransform)!.setContentSize(ui.width*ratio,ui.height*ratio)}
    return;
  }
  (node as any).gameArtKey=key;
  const sprite=node.getComponent(Sprite)||node.addComponent(Sprite);
  sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=null;
  texture(style).then(image=>{
    if(!node.isValid||(node as any).gameArtKey!==key)return;
    // Metadata stays in master-atlas coordinates; runtime textures are compact.
    const ratio=image.width/1024;
    let frame=frames.get(key);
    if(!frame){
      const box=GAME_ART_RECTS[style][role];frame=new SpriteFrame();frame.texture=image;
      frame.rect=new Rect(Math.round(box[0]*ratio),Math.round(box[1]*ratio),Math.round(box[2]*ratio),Math.round(box[3]*ratio));
      if(sliced){const inset=Math.min(box[2],box[3])*ratio*(role==='tray'?.28:.19);frame.insetLeft=inset;frame.insetRight=inset;frame.insetTop=inset;frame.insetBottom=inset}
      frame.addRef();frames.set(key,frame);
    }
    sprite.type=sliced?Sprite.Type.SLICED:Sprite.Type.SIMPLE;sprite.spriteFrame=frame;
    if(sliced){
      // Counter-scale the nine-slice renderer so compression doesn't thin the rims.
      const face=node.getChildByName('SlicedArtwork')||gameArtNode(node,'SlicedArtwork');
      const ui=node.getComponent(UITransform)!;face.getComponent(UITransform)!.setContentSize(ui.width*ratio,ui.height*ratio);
      face.setScale(1/ratio,1/ratio,1);face.setPosition(0,0);
      const rendered=face.getComponent(Sprite)||face.addComponent(Sprite);rendered.sizeMode=Sprite.SizeMode.CUSTOM;rendered.type=Sprite.Type.SLICED;rendered.spriteFrame=frame;sprite.enabled=false;
    }
  }).catch(error=>console.error('[Game UI] '+key,error));
}
export function gameArtNode(parent:Node,name:string):Node{
  const node=new Node(name);parent.addChild(node);node.addComponent(UITransform);return node;
}

const backdrops=new Map<PageStyle,Promise<Texture2D>>();
/** A single unbroken scene, covering the viewport with its original aspect ratio. */
export function paintGameBackdrop(node:Node,style:PageStyle):void{
  const key='backdrop:'+style;(node as any).gameArtKey=key;
  let pending=backdrops.get(style);
  if(!pending){pending=new Promise((resolve,reject)=>resources.load('game-ui/bg-0'+style+'/texture',Texture2D,(error,image)=>error?reject(error):resolve(image)));backdrops.set(style,pending)}
  pending.then(image=>{
    if(!node.isValid||(node as any).gameArtKey!==key)return;
    let frame=frames.get(key);if(!frame){frame=new SpriteFrame();frame.texture=image;frame.addRef();frames.set(key,frame)}
    const visible=view.getVisibleSize(),scale=Math.max(visible.width/image.width,visible.height/image.height);
    node.getComponent(UITransform)!.setContentSize(image.width*scale,image.height*scale);node.setPosition(0,0);node.setScale(1,1,1);
    const sprite=node.getComponent(Sprite)||node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;
  }).catch(error=>console.error('[Game UI] '+key,error));
}
