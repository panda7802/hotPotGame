import {BlockInputEvents,Color,Label,Node,Rect,resources,Sprite,SpriteFrame,Texture2D,UITransform,Vec3} from 'cc';
import {REFERENCE_AUX_LAYOUTS} from '../data/ReferenceAssets';
import {getPageTheme,PageStyle} from '../data/PageTheme';
import {drawRoundRect,hex,makeLabel,transform} from './HotPotUi';

export type Box=[number,number,number,number];
export type ArtPage='rank'|'profile'|'picker'|'win1'|'win2'|'win3'|'collection'|'detail'|'achievements'|'region'|'revive'|'restart';
const index:Record<ArtPage,number>={rank:0,profile:1,picker:2,win1:3,win2:4,win3:5,collection:0,detail:1,achievements:2,region:3,revive:4,restart:5};
export function place(node:Node,box:Box,height:number):void{
  transform(node,box[2]*720,box[3]*height);
  node.setPosition((box[0]+box[2]/2-.5)*720,(.5-box[1]-box[3]/2)*height);
}
/** Original artwork is a shared texture; all data and hit regions remain live. */
export function art(parent:Node,page:ArtPage|'shell',box:Box,height:number,style=getPageTheme().id,crop:Box=[0,0,1,1]):Node{
  const node=new Node('ReferenceArtwork_'+page);parent.addChild(node);place(node,box,height);
  if(box[0]<0){transform(node,(parent.getComponent(UITransform)?.width||720)*box[2],height*box[3]);node.setPosition(0,0)}
  const group=page==='shell'?'shell':index[page]<3&&['rank','profile','picker'].includes(page)||page.startsWith('win')?'a':'b';
  const actual=group==='b'&&![4,8].includes(style)&&!REFERENCE_AUX_LAYOUTS[style]?8:style;
  const key='reference/'+group+'-0'+actual;
  resources.load(key+'/texture',Texture2D,(error,texture)=>{
    if(error||!texture||!node.isValid)return;
    let x=0,y=0,w=texture.width,h=texture.height;
    if(page!=='shell'){
      const i=index[page];
      const a:any={1:{width:1151,height:1367,cols:[[0,383],[388,378],[771,380]],rows:[[0,638],[643,724]]},
        4:{width:941,height:1672,cols:[[0,312],[318,307],[631,310]],rows:[[0,835],[839,833]]},
        8:{width:1151,height:1366,cols:[[0,387],[396,362],[772,379]],rows:[[0,629],[634,732]]},
        9:{width:941,height:1672,cols:[[0,312],[318,307],[631,310]],rows:[[0,834],[839,833]]}};
      const shape=group==='a'?a[actual]:REFERENCE_AUX_LAYOUTS[actual]|| (actual===4?{width:1152,height:1366,cols:[[0,382],[386,381],[771,381]],rows:[[0,680],[685,681]]}
        :{width:941,height:1672,cols:[[0,309],[316,308],[632,309]],rows:[[0,834],[839,833]]});
      x=shape.cols[i%3][0]/shape.width*texture.width;
      y=shape.rows[i<3?0:1][0]/shape.height*texture.height;
      w=shape.cols[i%3][1]/shape.width*texture.width;
      h=shape.rows[i<3?0:1][1]/shape.height*texture.height;
    }
    const frame=new SpriteFrame();frame.texture=texture;
    frame.rect=new Rect(Math.round(x+crop[0]*w),Math.round(y+crop[1]*h),Math.max(1,Math.floor(crop[2]*w)),Math.max(1,Math.floor(crop[3]*h)));
    const image=node.addComponent(Sprite);image.sizeMode=Sprite.SizeMode.CUSTOM;image.spriteFrame=frame;
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
export function fullOverlay(parent:Node,name:string,height:number):{overlay:Node,panel:Node}{
  const overlay=new Node(name);parent.addChild(overlay);transform(overlay,720,height);overlay.addComponent(BlockInputEvents);
  const panel=new Node('PlayerPanel');overlay.addChild(panel);transform(panel,720,height);return {overlay,panel};
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
