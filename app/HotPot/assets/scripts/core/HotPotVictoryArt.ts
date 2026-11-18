import {assetManager,Node,Sprite,SpriteFrame,Texture2D} from 'cc';
import {PageStyle} from '../data/PageTheme';

/** Each theme has its own local WeChat subpackage, loaded only on victory. */
export function paintVictoryArt(node:Node,style:PageStyle,ready:()=>void,failed:()=>void):void {
  const bundleName='victory-0'+style;
  assetManager.loadBundle(bundleName,(error,bundle)=>{
    if(!node.isValid)return;
    if(error||!bundle){console.error('[Victory] Cannot load feast',bundleName,error);failed();return}
    bundle.load('win/texture',Texture2D,(error,texture)=>{
      if(!node.isValid)return;
      if(error||!texture){console.error('[Victory] Cannot load feast image',bundleName,error);failed();return}
      const frame=new SpriteFrame();frame.texture=texture;
      const image=node.addComponent(Sprite);image.sizeMode=Sprite.SizeMode.CUSTOM;image.spriteFrame=frame;
      node.on(Node.EventType.NODE_DESTROYED,()=>frame.destroy());ready();
    });
  });
}
