import {BlockInputEvents,Graphics,Label,Mask,Node,resources,ScrollView,Sprite,SpriteFrame,Texture2D,UITransform} from 'cc';
import {getPageTheme,PageStyle} from '../data/PageTheme';
import {hex,transform} from './HotPotUi';
import {fitReferenceBackdrop,fitReferenceContent} from './HotPotReferenceLayout';
import {CONFIRMED_SHELLS} from '../data/ConfirmedShells';

/** Pixel coordinates measured from the top left of the approved 720×1280 canvas. */
export type DesignRect=[number,number,number,number];
export function designNode(parent:Node,name:string,box:DesignRect):Node {
  const p=parent.getComponent(UITransform),n=new Node(name);parent.addChild(n);
  transform(n,box[2],box[3]);
  n.setPosition(box[0]+box[2]/2-(p?.width||720)*(p?.anchorX??.5),
    (p?.height||1280)*(1-(p?.anchorY??.5))-box[1]-box[3]/2);
  return n;
}
export function designRadius(style=getPageTheme().id):number{return {1:14,4:34,8:22,9:8}[style]}
export function designOnBackground():string {return getPageTheme().id===1?'#FFF0CE':getPageTheme().ink}

/** Native vectors and system text replace the old low resolution six-page atlases. */
export function designSurface(n:Node,fill=getPageTheme().card,radius=designRadius(),border=getPageTheme().edge,shadow=true):Graphics {
  const {width:w,height:h}=n.getComponent(UITransform)!;
  radius=Math.min(radius,Math.max(0,Math.min(w,h)/2-1));
  const g=n.getComponent(Graphics)||n.addComponent(Graphics);g.clear();
  if(shadow){g.fillColor=hex(getPageTheme().id===1?'#0D261FCC':'#51321C28');g.roundRect(-w/2,-h/2-5,w,h,radius);g.fill()}
  g.fillColor=hex(fill);g.roundRect(-w/2,-h/2,w,h,radius);g.fill();
  if(border){g.strokeColor=hex(border);g.lineWidth=getPageTheme().id===9?1:2;g.roundRect(-w/2+1,-h/2+1,w-2,h-2,Math.max(0,radius-1));g.stroke()}
  return g;
}
export function designText(parent:Node,value:string,box:DesignRect,size=28,color=getPageTheme().ink,bold=false,left=false):Label {
  const n=designNode(parent,'Text_'+value.slice(0,18),box),label=n.addComponent(Label);
  label.string=value;label.fontSize=size;label.lineHeight=Math.round(size*1.45);
  label.color=hex(color);label.isBold=bold;label.enableWrapText=true;
  label.horizontalAlign=left?Label.HorizontalAlign.LEFT:Label.HorizontalAlign.CENTER;
  label.verticalAlign=Label.VerticalAlign.CENTER;label.overflow=Label.Overflow.SHRINK;
  label.fontFamily=[8,9].includes(getPageTheme().id)?'KaiTi, STKaiti, serif':'Microsoft YaHei, sans-serif';
  return label;
}
export function designHit(n:Node,action:()=>void,disabled=false):Node {
  (n as any).referenceDisabled=disabled;
  n.on(Node.EventType.TOUCH_END,()=>{if(!(n as any).referenceDisabled)action()});return n;
}
export function designButton(parent:Node,name:string,caption:string,box:DesignRect,action:()=>void,secondary=false,disabled=false):Node {
  const t=getPageTheme(),n=designNode(parent,name,box);designHit(n,action,disabled);
  designSurface(n,disabled?t.disabled:secondary?t.card:t.accent);
  const label=designText(n,caption,[14,4,box[2]-28,box[3]-8],30,disabled?t.muted:secondary?t.ink:t.onAccent,true);
  label.node.name='Label';return n;
}
export function designImage(parent:Node,name:string,key:string,box:DesignRect):Node {
  const n=designNode(parent,name,box);
  resources.load(key+'/texture',Texture2D,(error,texture)=>{
    if(error||!texture||!n.isValid)return;
    const frame=new SpriteFrame();frame.texture=texture;
    const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=frame;
    n.on(Node.EventType.NODE_DESTROYED,()=>frame.destroy());
  });return n;
}
export function designHeader(panel:Node,title:string,back:()=>void):void {
  const t=getPageTheme(),l=CONFIRMED_SHELLS[t.id],head={1:246,4:232,8:226,9:214}[t.id];
  const clip=designNode(panel,'IllustratedHeader',[0,0,720,head]);clip.addComponent(Mask);
  designImage(clip,'Brand','reference/shell-0'+t.id,[0,0,720,1280]);
  designText(panel,title,l.level as DesignRect,30,t.id===9?'#FFF0CE':t.accent,true);
  for(const [name,x,caption,icon] of [['MenuBack',45,'返回','back'],['MenuClose',599,'关闭','close']] as const){
    const button=designNode(panel,name,[x,65,83,106]);designSurface(button,t.id===1?'#59391F':t.card,undefined,t.edge);
    designIcon(button,icon,[24,14,35,35],t.id===1?'#FFE0A0':t.ink);
    designText(button,caption,[5,59,73,32],23,t.id===1?'#FFE0A0':t.ink,true);designHit(button,back);
  }
}
export function designOverlay(parent:Node,name:string,viewport:number,modal=false):{overlay:Node,panel:Node} {
  const overlay=new Node(name);parent.addChild(overlay);transform(overlay,720,viewport);overlay.addComponent(BlockInputEvents);
  const scrim=designNode(overlay,'ModalScrim',[0,0,720,viewport]);
  designSurface(scrim,modal?'#101B19A8':getPageTheme().id===1?getPageTheme().dark:getPageTheme().panel,0,'',false);
  if(!modal){const backdrop=designImage(overlay,'FullBleedBackground','reference/bg-0'+getPageTheme().id,[0,0,720,1280]);fitReferenceBackdrop(backdrop)}
  const panel=new Node('PlayerPanel');overlay.addChild(panel);transform(panel,720,1280);
  (panel as any).referenceHeight=1280;(overlay as any).designModal=modal;fitReferenceContent(panel,1280);
  if(!modal)designImage(panel,'PageBackground','reference/bg-0'+getPageTheme().id,[0,0,720,1280]);
  return {overlay,panel};
}
export function designScroll(parent:Node,name:string,box:DesignRect,height:number,offset=0):{content:Node,view:ScrollView} {
  const viewport=designNode(parent,name,box);viewport.addComponent(Mask);
  const content=new Node(name==='CollectionViewport'?'CollectionContent':'RegionContent');viewport.addChild(content);
  const actualHeight=Math.max(box[3],height);transform(content,box[2],actualHeight).setAnchorPoint(.5,1);
  content.setPosition(0,box[3]/2+Math.max(0,Math.min(offset,actualHeight-box[3])));
  const view=viewport.addComponent(ScrollView);view.content=content;view.horizontal=false;view.vertical=true;view.elastic=false;view.inertia=true;view.cancelInnerEvents=true;
  return {content,view};
}
export function designFooter(panel:Node,caption:string,action:()=>void,name='Button_返回我的',primary=false):Node {
  return designButton(panel,name,caption,[52,1124,616,80],action,!primary);
}
export function designIcon(parent:Node,type:string,box:DesignRect,color=getPageTheme().accent):Node {
  const n=designNode(parent,'Icon_'+type,box),g=n.addComponent(Graphics),s=Math.min(box[2],box[3])/24;
  g.strokeColor=hex(color);g.fillColor=hex(color);g.lineWidth=1.8*s;g.lineCap=Graphics.LineCap.ROUND;g.lineJoin=Graphics.LineJoin.ROUND;
  const line=(points:number[][],close=false)=>{points.forEach(([x,y],i)=>i?g.lineTo((x-12)*s,(12-y)*s):g.moveTo((x-12)*s,(12-y)*s));if(close)g.close();g.stroke()};
  if(type==='book'){line([[4,4],[18,4],[18,20],[4,20],[4,4]]);line([[8,4],[8,20]]);line([[11,8],[15,8]])}
  else if(type==='pin'){g.circle(0,3*s,6*s);g.stroke();g.circle(0,3*s,2*s);g.stroke();line([[7,13],[12,21],[17,13]])}
  else if(type==='trophy'){line([[7,3],[17,3],[17,10],[15,14],[9,14],[7,10]],true);line([[7,5],[3,5],[3,9],[7,12]]);line([[17,5],[21,5],[21,9],[17,12]]);line([[12,14],[12,20]]);line([[8,21],[16,21]])}
  else if(type==='palette'){g.circle(0,0,9*s);g.stroke();for(const [x,y] of [[-4,4],[3,5],[-5,-2],[3,-3]]){g.circle(x*s,y*s,1.3*s);g.fill()}}
  else if(type==='share'){line([[12,16],[12,3]]);line([[7,8],[12,3],[17,8]]);line([[5,12],[5,21],[19,21],[19,12]])}
  else if(type==='back'){line([[14,5],[7,12],[14,19]]);line([[7,12],[21,12]])}
  else if(type==='close'){line([[5,5],[19,19]]);line([[19,5],[5,19]])}
  else if(type==='warning'){line([[12,3],[22,21],[2,21]],true);line([[12,9],[12,14]]);g.circle(0,-5*s,.8*s);g.fill()}
  else if(type==='check')line([[5,12],[10,17],[20,6]]);
  else if(type==='refresh'){line([[20,5],[20,11],[14,11]]);line([[4,19],[4,13],[10,13]]);g.arc(0,0,7*s,.25,2.7,false);g.stroke();g.arc(0,0,7*s,3.4,5.85,false);g.stroke()}
  else if(type==='rank'){line([[3,21],[3,10],[8,10],[8,21]]);line([[10,21],[10,3],[15,3],[15,21]]);line([[17,21],[17,13],[22,13],[22,21]])}
  else line([[8,5],[16,12],[8,19]]);
  return n;
}
