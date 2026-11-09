import {BlockInputEvents,Graphics,Label,Mask,Node,resources,ScrollView,Sprite,SpriteFrame,Texture2D,UITransform} from 'cc';
import {getPageTheme,PageStyle} from '../data/PageTheme';
import {hex,transform} from './HotPotUi';
import type {ToolType} from './HotPotUi';
import {fitReferenceBackdrop,fitReferenceContent,referenceArea} from './HotPotReferenceLayout';
import {paintGameArt} from './HotPotGameArt';
import {gameInterfaceLayout} from './HotPotGameLayout';
import {GAME_ART_RECTS} from '../data/GameInterfaceAssets';

/** Pixel coordinates measured from the top left of the approved 720×1280 canvas. */
export type DesignRect=[number,number,number,number];
export function designNode(parent:Node,name:string,box:DesignRect):Node {
  if((parent as any).designPage){
    const band=box[1]>=1124?'DesignFooter':box[1]>=280?'DesignBody':'DesignHeader';
    parent=parent.getChildByName(band)!;
    box=[box[0],box[1]-(band==='DesignFooter'?1124:band==='DesignBody'?280:0),box[2],box[3]];
  }
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

/** Inlays for personal pages, drawn independently of their text and icons. */
export function designPersonalSurface(
  node: Node, fill: string, radius = designRadius(), edge = getPageTheme().edge, shadow = true,
): void {
  const style = getPageTheme().id;
  const g = designSurface(node, fill, radius, edge, shadow);
  if (style === 4) return;
  const {width, height} = node.getComponent(UITransform)!;
  const x = width / 2 - 6, y = height / 2 - 6;
  if (style === 9) {
    g.lineWidth = 1.2;
    g.strokeColor = hex('#AE764A91');
    for (const side of [-1, 1]) {
      g.moveTo(side * (x - 14), y);
      g.lineTo(side * x, y);
      g.lineTo(side * x, y - 14);
      g.moveTo(side * (x - 14), -y);
      g.lineTo(side * x, -y);
      g.lineTo(side * x, -y + 14);
    }
    g.stroke();
    return;
  }
  g.lineWidth = style === 1 ? 1.2 : 1.8;
  g.strokeColor = hex(style === 1 ? '#E7C68598' : '#FFFFE9D9');
  g.roundRect(-x, -y, x * 2, y * 2, Math.max(1, Math.min(radius - 6, y - 1)));
  g.stroke();
  if (style === 1) {
    g.fillColor = hex('#F0D19A');
    for (const side of [-1, 1]) {
      g.circle(side * (x - 6), y - 6, 2);
      g.circle(side * (x - 6), -y + 6, 2);
    }
    g.fill();
  }
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
export function designHeader(panel:Node,title:string):void {
  const t=getPageTheme();
  // Reuse the gameplay atlas: the header contains no baked-in controls.
  const brand=designNode(panel,'MenuBrand',[102,18,516,178]);
  paintGameArt(brand,'brand',t.id);
  const plaque=designNode(panel,'MenuTitlePlaque',[150,214,420,52]);
  paintGameArt(plaque,'stage',t.id);
  designText(panel,title,[185,218,350,44],30,t.id===9?t.onAccent:t.accent,true);
}

/** Small themed controls below the title; never resize the brand to fit. */
export function paintThemeHeaderButton(node:Node,caption:string,icon:string,c=1):void {
  const t=getPageTheme(),paper=t.id===1?t.dark:t.id===8?'#FFFAE7':t.card;
  const ink=t.id===1?t.onAccent:t.ink,gold=t.id===8?'#B99450':t.edge;
  const glyphInk=t.id===1?t.light:t.id===9?t.accent:t.id===8?'#264E40':t.accent;
  const ui=node.getComponent(UITransform)!,w=ui.width,h=54*c;
  const radius=t.id===9?8:h/2;
  const sprite=node.getComponent(Sprite);if(sprite)sprite.enabled=false;
  (node as any).gameArtKey='theme-header:'+t.id;
  let plate=node.getChildByName('HeaderPlate');
  if(!plate){plate=new Node('HeaderPlate');node.addChild(plate);plate.addComponent(UITransform);plate.addComponent(Graphics);plate.setSiblingIndex(0)}
  plate.active=true;transform(plate,w,h);plate.setPosition(0,0);
  const g=plate.getComponent(Graphics)!;g.clear();
  g.fillColor=hex('#6D63492A');g.roundRect(-w/2,-h/2-3,w,h,radius);g.fill();
  g.fillColor=hex(paper);g.strokeColor=hex(gold);g.lineWidth=2;
  g.roundRect(-w/2,-h/2,w,h,radius);g.fill();g.stroke();
  g.strokeColor=hex(t.id===8?'#E4D8AD':t.line);g.lineWidth=1;
  g.roundRect(-w/2+4,-h/2+4,w-8,h-8,Math.max(3,radius-4));g.stroke();
  let glyph=node.getChildByName('HeaderIcon');
  if(!glyph){glyph=new Node('HeaderIcon');node.addChild(glyph);glyph.addComponent(UITransform);glyph.addComponent(Graphics)}
  transform(glyph,40,40);
  glyph.setPosition(-w*.29,0);glyph.setScale(Math.max(.9,c),Math.max(.9,c),1);
  paintThemeHeaderIcon(glyph,icon,glyphInk,paper,gold);
  let label=node.getChildByName('HeaderCaption')?.getComponent(Label);
  if(!label){label=designText(node,caption,[0,0,72,44],26,'#264E40',true);label.node.name='HeaderCaption'}
  label.string=caption;label.fontSize=26*c;label.lineHeight=36*c;
  label.color=hex(ink);
  transform(label.node,w*.55,44*c);label.node.setPosition(w*.13,0);
}

/** Filled silhouettes survive downscaling to a 320px-wide phone. */
function paintThemeHeaderIcon(node:Node,icon:string,ink:string,paper:string,gold:string):void {
  const g=node.getComponent(Graphics)!;g.clear();
  g.fillColor=hex(ink);g.strokeColor=hex(ink);
  g.lineWidth=3.2;g.lineJoin=Graphics.LineJoin.ROUND;g.lineCap=Graphics.LineCap.ROUND;
  const polygon=(points:number[][])=>{
    points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));
    g.close();g.fill();g.stroke();
  };
  if(icon==='book'){
    polygon([[-18,14],[-7,14],[0,10],[7,14],[18,14],[18,-13],[7,-13],[0,-17],[-7,-13],[-18,-13]]);
    g.fillColor=hex(paper);g.strokeColor=hex(paper);g.lineWidth=1;
    polygon([[-14,10],[-8,10],[-3,7],[-3,-11],[-8,-9],[-14,-9]]);
    polygon([[3,7],[8,10],[14,10],[14,-9],[8,-9],[3,-11]]);
    g.strokeColor=hex(gold);g.lineWidth=1.8;
    for(const side of [-1,1])for(const y of [4,-2]){g.moveTo(side*6,y);g.lineTo(side*12,y+1);g.stroke()}
  }else if(icon==='settings'){
    const points:number[][]=[];
    for(let i=0;i<32;i++){
      const angle=Math.PI*2*(i+.5)/32,r=i%4===0||i%4===3?14:19;
      points.push([Math.cos(angle)*r,Math.sin(angle)*r]);
    }
    g.lineWidth=1;polygon(points);
    g.fillColor=hex(paper);g.circle(0,0,8);g.fill();
    g.strokeColor=hex(gold);g.lineWidth=1.5;g.circle(0,0,8);g.stroke();
  }else if(icon==='profile'){
    g.circle(0,9,7);g.fill();
    g.roundRect(-13,-15,26,16,8);g.fill();
  }else{
    g.lineWidth=5;g.moveTo(-3,12);g.lineTo(-16,0);g.lineTo(-3,-12);g.stroke();
    g.moveTo(-15,0);g.lineTo(17,0);g.stroke();
  }
}

/** Header/footer use screen width; only the middle composition fits its space. */
export function fitDesignPage(panel:Node):void {
  if(!(panel as any).designPage)return;
  const area=referenceArea(),scale=area.width/720,h=area.height/scale;
  const top=(area.systemTop??area.top)/scale+8,bottom=area.bottom/scale;
  transform(panel,720,h);panel.setScale(scale,scale,1);panel.setPosition(0,0);
  const header=panel.getChildByName('DesignHeader')!,body=panel.getChildByName('DesignBody')!,footer=panel.getChildByName('DesignFooter')!;
  header.setPosition(0,h/2-top-140);
  let bodyTop=top+280;
  {
    const art=GAME_ART_RECTS[getPageTheme().id].brand;
    const l=gameInterfaceLayout(area,false,false,art[2]/art[3]);
    header.setPosition(0,h/2-140);
    const position=(node:Node,box:DesignRect)=>{transform(node,box[2],box[3]);node.setPosition(box[0]+box[2]/2-360,140-box[1]-box[3]/2)};
    const brand=header.getChildByName('MenuBrand');if(brand)position(brand,l.brand);
    const plaque=header.getChildByName('MenuTitlePlaque');if(plaque)position(plaque,l.stage);
    const title=header.children.find(n=>n.name.startsWith('Text_')||n.name==='Button_食材图鉴');
    if(title){position(title,[l.stage[0]+12,l.stage[1]+2,l.stage[2]-24,l.stage[3]-4]);const label=title.getComponent(Label)!;label.fontSize=26*l.c;label.lineHeight=38*l.c}
    for(const [name,box] of [['HeaderBack',l.collection],['HeaderSettings',l.settings]] as const){const button=header.getChildByName(name);if(button){position(button,box);paintThemeHeaderButton(button,name==='HeaderBack'?'返回':'设置',name==='HeaderBack'?'back':'settings',l.c)}}
    bodyTop=l.settings[1]+l.settings[3]+18;
  }
  const footerTop=h-bottom-124;
  const available=Math.max(1,footerTop-24-bodyTop),s=Math.min(1,available/832);
  body.setScale(s,s,1);body.setPosition(0,h/2-bodyTop-available/2);
  footer.setPosition(0,h/2-footerTop-78);
}
export function designOverlay(parent:Node,name:string,viewport:number,modal=false,background?:string):{overlay:Node,panel:Node} {
  const overlay=new Node(name);parent.addChild(overlay);transform(overlay,720,viewport);overlay.addComponent(BlockInputEvents);
  const scrim=designNode(overlay,'ModalScrim',[0,0,720,viewport]);
  designSurface(scrim,modal?'#101B19A8':getPageTheme().id===1?getPageTheme().dark:getPageTheme().panel,0,'',false);
  if(!modal){const backdrop=designImage(overlay,'FullBleedBackground',background||'reference/bg-0'+getPageTheme().id,[0,0,720,1280]);fitReferenceBackdrop(backdrop)}
  const panel=new Node('PlayerPanel');overlay.addChild(panel);transform(panel,720,1280);
  (panel as any).referenceHeight=1280;(overlay as any).designModal=modal;
  if(modal)fitReferenceContent(panel,1280);
  else{
    for(const [name,height] of [['DesignHeader',280],['DesignBody',832],['DesignFooter',156]] as const){
      const layer=new Node(name);panel.addChild(layer);transform(layer,720,height);
    }
    (panel as any).designPage=true;fitDesignPage(panel);
  }
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
export function designFooter(panel:Node,caption:string,action:()=>void,name='Button_返回',primary=true):Node {
  return designButton(panel,name,caption==='返回'?'←  返回':caption,[52,1124,616,80],action,!primary);
}
const backpackStyles = new WeakMap<Node, PageStyle>();

export const TOOL_ICON_SIZE = 56;
const toolIconStyles = new WeakMap<Node, string>();

/** Draw on a square canvas so the same symbol fits cards and the game toolbar. */
export function paintToolIcon(node: Node, tool: ToolType, style: PageStyle): void {
  const key = tool + ':' + style;
  if (toolIconStyles.get(node) === key) return;
  toolIconStyles.set(node, key);
  const g = node.getComponent(Graphics) || node.addComponent(Graphics);
  const colors = {
    1: {gold: '#FFD177', green: '#80BBA1', rim: '#754520'},
    4: {gold: '#FFC160', green: '#78AE54', rim: '#86502A'},
    8: {gold: '#E8BE71', green: '#81B49A', rim: '#4F6956'},
    9: {gold: '#E7B678', green: '#C75C46', rim: '#753F2D'},
  }[style];
  g.clear();
  g.lineCap = Graphics.LineCap.ROUND;
  g.lineJoin = Graphics.LineJoin.ROUND;
  const stroke = (color: string, width: number) => {
    g.strokeColor = hex(color);
    g.lineWidth = width;
    g.stroke();
  };
  const fill = (color: string) => { g.fillColor = hex(color); g.fill(); };
  const arrow = (path: () => void, color: string) => {
    path();
    stroke(colors.rim, 10);
    path();
    stroke(color, 6.5);
  };
  if (tool === 'undo') {
    arrow(() => {
      g.moveTo(-3, -17);
      g.lineTo(5, -17);
      g.bezierCurveTo(24, -17, 25, 10, 5, 10);
      g.lineTo(-20, 10);
      g.moveTo(-10, 20);
      g.lineTo(-20, 10);
      g.lineTo(-10, 0);
    }, colors.gold);
  } else if (tool === 'shuffle') {
    arrow(() => {
      g.moveTo(-20, -2);
      g.bezierCurveTo(-15, 15, 3, 18, 20, 12);
      g.moveTo(13, 21);
      g.lineTo(20, 12);
      g.lineTo(9, 7);
    }, colors.gold);
    arrow(() => {
      g.moveTo(20, 2);
      g.bezierCurveTo(15, -15, -3, -18, -20, -12);
      g.moveTo(-13, -21);
      g.lineTo(-20, -12);
      g.lineTo(-9, -7);
    }, colors.green);
  } else {
    g.circle(-5, -6, 18);
    fill('#272C37');
    g.circle(-5, -6, 18);
    stroke(colors.rim, 2.4);
    g.circle(-8, -3, 13);
    fill('#485461');
    g.moveTo(-17, -5);
    g.quadraticCurveTo(-15, 3, -9, 5);
    stroke('#DDE7DF', 3.5);
    g.roundRect(1, 9, 10, 8, 3);
    fill(colors.gold);
    g.moveTo(7, 16);
    g.bezierCurveTo(8, 25, 16, 16, 18, 21);
    stroke(colors.rim, 3.7);
    g.moveTo(18, 17); g.lineTo(18, 27);
    g.moveTo(13, 22); g.lineTo(24, 22);
    stroke('#ED873C', 3.5);
    g.circle(18, 22, 3);
    fill('#FFE59C');
  }
}

/** A 48-unit silhouette with a different material and front closure for each skin. */
export function paintBackpackIcon(node: Node, style: PageStyle): void {
  if (backpackStyles.get(node) === style) return;
  backpackStyles.set(node, style);
  const g = node.getComponent(Graphics) || node.addComponent(Graphics);
  const palette = {
    1: {body: '#21594A', flap: '#A83828', pocket: '#34705C', ink: '#4C2C19', trim: '#EAB866', light: '#F6CD83', radius: 7},
    4: {body: '#F2A95F', flap: '#FFE1AA', pocket: '#F6BD78', ink: '#A55A2F', trim: '#669247', light: '#FFF5D5', radius: 11},
    8: {body: '#A2C6B4', flap: '#F1F4DD', pocket: '#B8D4C5', ink: '#3D6E5D', trim: '#4A826B', light: '#FFF9DF', radius: 10},
    9: {body: '#DFC096', flap: '#F5E8CC', pocket: '#E9D0AD', ink: '#5C3C29', trim: '#A23629', light: '#FFF2D4', radius: 4},
  }[style];
  const stroke = (color: string, width: number) => {
    g.strokeColor = hex(color);
    g.lineWidth = width;
    g.stroke();
  };
  const fill = (color: string) => { g.fillColor = hex(color); g.fill(); };
  const rounded = (x: number, y: number, w: number, h: number, r: number, color: string, edge = palette.ink) => {
    g.roundRect(x, y, w, h, r);
    fill(color);
    stroke(edge, 1.6);
  };
  g.clear();
  g.lineCap = Graphics.LineCap.ROUND;
  g.lineJoin = Graphics.LineJoin.ROUND;
  rounded(-7, 10, 14, 12, 5, palette.trim);
  rounded(-21, -15, 11, 22, 5, palette.pocket);
  rounded(10, -15, 11, 22, 5, palette.pocket);
  rounded(-17, -20, 34, 36, palette.radius, palette.body);
  rounded(-12, -15, 24, 15, style === 9 ? 2 : 5, palette.pocket);
  if (style === 9) {
    g.moveTo(-16, 11); g.lineTo(16, 11); g.lineTo(12, 2);
    g.lineTo(0, -5); g.lineTo(-12, 2); g.close();
    fill(palette.flap); stroke(palette.ink, 1.6);
    rounded(-4, -8, 8, 8, 1, palette.trim);
    g.moveTo(-2, -4); g.lineTo(2, -4); stroke(palette.light, 1.1);
  } else {
    rounded(-16, 1, 32, 14, 6, palette.flap);
    g.moveTo(-11, 11); g.lineTo(11, 11); stroke(palette.light, 1.6);
    if (style === 1) {
      for (const x of [-9, 4]) rounded(x, -5, 5, 11, 1.5, palette.trim);
    } else if (style === 4) {
      g.moveTo(-5, 0); g.quadraticCurveTo(-4, 8, 7, 7);
      g.quadraticCurveTo(5, -2, -5, 0); g.close(); fill(palette.trim);
      g.moveTo(-5, -2); g.lineTo(3, 4); stroke(palette.ink, 1.5);
    } else {
      g.moveTo(0, -10); g.quadraticCurveTo(-8, -9, -8, -4);
      g.quadraticCurveTo(-3, -5, 0, -8); g.quadraticCurveTo(3, -5, 8, -4);
      g.quadraticCurveTo(8, -9, 0, -10); fill(palette.trim);
      g.moveTo(0, -8); g.quadraticCurveTo(-4, -4, 0, -1);
      g.quadraticCurveTo(4, -4, 0, -8); fill(palette.trim);
    }
  }
}

export function designIcon(parent:Node,type:string,box:DesignRect,color=getPageTheme().accent):Node {
  const n=designNode(parent,'Icon_'+type,box),g=n.addComponent(Graphics),s=Math.min(box[2],box[3])/24;
  g.strokeColor=hex(color);g.fillColor=hex(color);g.lineWidth=1.8*s;g.lineCap=Graphics.LineCap.ROUND;g.lineJoin=Graphics.LineJoin.ROUND;
  const line=(points:number[][],close=false)=>{points.forEach(([x,y],i)=>i?g.lineTo((x-12)*s,(12-y)*s):g.moveTo((x-12)*s,(12-y)*s));if(close)g.close();g.stroke()};
  if(type==='book'){line([[4,4],[18,4],[18,20],[4,20],[4,4]]);line([[8,4],[8,20]]);line([[11,8],[15,8]])}
  else if(type==='pin'){g.circle(0,3*s,6*s);g.stroke();g.circle(0,3*s,2*s);g.stroke();line([[7,13],[12,21],[17,13]])}
  else if(type==='trophy'){line([[7,3],[17,3],[17,10],[15,14],[9,14],[7,10]],true);line([[7,5],[3,5],[3,9],[7,12]]);line([[17,5],[21,5],[21,9],[17,12]]);line([[12,14],[12,20]]);line([[8,21],[16,21]])}
  else if(type==='gift'){line([[3,8],[21,8],[21,20],[3,20]],true);line([[3,12],[21,12]]);line([[12,8],[12,20]]);line([[12,8],[7,7],[6,4],[9,3],[12,8],[15,3],[18,4],[17,7],[12,8]])}
  else if(type==='palette'){g.circle(0,0,9*s);g.stroke();for(const [x,y] of [[-4,4],[3,5],[-5,-2],[3,-3]]){g.circle(x*s,y*s,1.3*s);g.fill()}}
  else if(type==='share'){line([[12,16],[12,3]]);line([[7,8],[12,3],[17,8]]);line([[5,12],[5,21],[19,21],[19,12]])}
  else if(type==='community'){line([[3,4],[21,4],[21,16],[12,16],[6,21],[6,16],[3,16]],true);for(const x of [-5,0,5]){g.circle(x*s,2*s,.9*s);g.fill()}}
  else if(type==='back'){line([[14,5],[7,12],[14,19]]);line([[7,12],[21,12]])}
  else if(type==='close'){line([[5,5],[19,19]]);line([[19,5],[5,19]])}
  else if(type==='warning'){line([[12,3],[22,21],[2,21]],true);line([[12,9],[12,14]]);g.circle(0,-5*s,.8*s);g.fill()}
  else if(type==='check')line([[5,12],[10,17],[20,6]]);
  else if(type==='refresh'){line([[20,5],[20,11],[14,11]]);line([[4,19],[4,13],[10,13]]);g.arc(0,0,7*s,.25,2.7,false);g.stroke();g.arc(0,0,7*s,3.4,5.85,false);g.stroke()}
  else if(type==='settings'){g.circle(0,0,6*s);g.stroke();g.circle(0,0,2*s);g.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;g.moveTo(Math.cos(a)*6*s,Math.sin(a)*6*s);g.lineTo(Math.cos(a)*9*s,Math.sin(a)*9*s);g.stroke()}}
  else if(type==='rank'){line([[3,21],[3,10],[8,10],[8,21]]);line([[10,21],[10,3],[15,3],[15,21]]);line([[17,21],[17,13],[22,13],[22,21]])}
  else line([[8,5],[16,12],[8,19]]);
  return n;
}
