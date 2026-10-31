import {BlockInputEvents,Color,Label,Node,Rect,resources,Sprite,SpriteFrame,Texture2D,UITransform,Vec3} from 'cc';
import {getPageTheme,PageStyle} from '../data/PageTheme';
import {drawRoundRect,hex,makeLabel,transform} from './HotPotUi';
import {fitReferenceContent,referenceSource} from './HotPotReferenceLayout';

export type Box=[number,number,number,number];
export type ArtPage='rank'|'profile'|'picker'|'win1'|'win2'|'win3'|'collection'|'detail'|'achievements'|'region'|'revive'|'restart';
export function place(node:Node,box:Box,height:number):void{
  transform(node,box[2]*720,box[3]*height);
  node.setPosition((box[0]+box[2]/2-.5)*720,(.5-box[1]-box[3]/2)*height);
}
/** Original artwork is a shared texture; all data and hit regions remain live. */
export function art(parent:Node,page:ArtPage|'shell'|'first'|'background',box:Box,height:number,style=getPageTheme().id,crop:Box=[0,0,1,1]):Node{
  const node=new Node('ReferenceArtwork_'+page);parent.addChild(node);place(node,box,height);
  if(box[0]<0){transform(node,(parent.getComponent(UITransform)?.width||720)*box[2],height*box[3]);node.setPosition(0,0)}
  const source=referenceSource(page,style);
  const key='reference/'+source.group+'-0'+source.style;
  resources.load(key+'/texture',Texture2D,(error,texture)=>{
    if(error||!texture||!node.isValid)return;
    const x=source.x/source.width*texture.width,y=source.y/source.height*texture.height;
    const w=source.w/source.width*texture.width,h=source.h/source.height*texture.height;
    const frame=new SpriteFrame();frame.texture=texture;
    frame.rect=new Rect(Math.round(x+crop[0]*w),Math.round(y+crop[1]*h),Math.max(1,Math.floor(crop[2]*w)),Math.max(1,Math.floor(crop[3]*h)));
    const image=node.addComponent(Sprite);image.sizeMode=Sprite.SizeMode.CUSTOM;image.spriteFrame=frame;
    const slice=(node as any).nineSlice;
    if(slice){
      frame.insetTop=Math.round(slice.top/1280*frame.rect.height);
      frame.insetBottom=Math.round(slice.bottom/1280*frame.rect.height);
      frame.insetLeft=52;frame.insetRight=52;image.type=Sprite.Type.SLICED;
    }
    node.on(Node.EventType.NODE_DESTROYED,()=>frame.destroy());
  });
  return node;
}
export function hit(parent:Node,name:string,box:Box,height:number,action:()=>void):Node{
  const node=new Node(name);parent.addChild(node);place(node,box,height);
  node.on(Node.EventType.TOUCH_END,()=>{if(!(node as any).referenceDisabled)action()});return node;
}
export function text(parent:Node,value:string,box:Box,height:number,size=28,color=getPageTheme().ink,bold=false):Label{
  const label=makeLabel(parent,value,size,color,Vec3.ZERO,box[2]*720,box[3]*height,true);
  place(label.node,box,height);
  if(box[0]<0){transform(label.node,(parent.getComponent(UITransform)?.width||100)*box[2],height*box[3]);label.node.setPosition(0,0)}
  label.fontFamily='serif';label.isBold=bold;return label;
}
export function patch(parent:Node,page:ArtPage,box:Box,height:number,crop:Box,style=getPageTheme().id):void{
  art(parent,page,box,height,style,crop);
}
export function fullOverlay(parent:Node,name:string,height:number,contentHeight=height):{overlay:Node,panel:Node}{
  const overlay=new Node(name);parent.addChild(overlay);transform(overlay,720,height);overlay.addComponent(BlockInputEvents);
  drawRoundRect(overlay,720,height,0,getPageTheme().id===1?getPageTheme().dark:getPageTheme().panel);
  const panel=new Node('PlayerPanel');overlay.addChild(panel);transform(panel,720,contentHeight);
  (panel as any).referenceHeight=contentHeight;fitReferenceContent(panel,contentHeight);return {overlay,panel};
}
export function pageHeight(node:Node):number{
  for(let parent:Node|null=node;parent;parent=parent.parent){
    if((parent as any).referenceHeight)return (parent as any).referenceHeight;
  }
  return node.getComponent(UITransform)?.height||1280;
}
export function plainColor(value:string){return hex(value)}

/** Blend only a live data field, matching its four neighboring source colors. */
export function blendField(parent:Node,box:Box,height:number,corners:number[][]):void{
  const node=new Node('LiveFieldMaterial');parent.addChild(node);place(node,box,height);
  const width=box[2]*720,h=box[3]*height,g=drawRoundRect(node,width,h,0,'#FFFFFF');g.clear();
  for(let y=0;y<8;y++)for(let x=0;x<24;x++){
    const u=(x+.5)/24,v=(y+.5)/8;
    const rgb=[0,1,2].map(i=>Math.round((corners[0][i]*(1-u)+corners[1][i]*u)*(1-v)+(corners[2][i]*(1-u)+corners[3][i]*u)*v));
    g.fillColor=new Color(rgb[0],rgb[1],rgb[2],255);g.rect(-width/2+x*width/24,-h/2+(7-y)*h/8,width/24+.2,h/8+.2);g.fill();
  }
}
