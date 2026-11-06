import {_decorator,Color,Component,Graphics,Label,Node,UITransform} from 'cc';
import {getPageTheme,PageStyle} from '../data/PageTheme';

const {ccclass}=_decorator;
type GlowKind='tile'|'card'|'portrait';
const color=(value:string)=>new Color().fromHEX(value);
type RGB=[number,number,number];
interface PremiumPalette {
  paper:string;tile:string;glaze:string;edge:string;inner:string;seal:string;
  low:RGB;rise:RGB;flow:RGB;light:RGB;rim:RGB;tileRadius:number;cardRadius:number;
}
const PALETTES:Record<PageStyle,PremiumPalette>={
  1:{paper:'#FFF0CF',tile:'#F9DF9B',glaze:'#315E48',edge:'#B98A39',inner:'#FFF0BE',seal:'#9F4B29',
    low:[46,91,72],rise:[49,49,37],flow:[20,72,49],light:[255,230,155],rim:[255,205,102],tileRadius:14,cardRadius:18},
  4:{paper:'#FFF6DF',tile:'#FFE3A7',glaze:'#E2B16E',edge:'#D69A45',inner:'#FFF4CE',seal:'#B97730',
    low:[209,151,83],rise:[37,46,43],flow:[180,106,47],light:[255,249,212],rim:[255,220,123],tileRadius:18,cardRadius:28},
  8:{paper:'#FFF2CB',tile:'#F9E7B1',glaze:'#C8DCC0',edge:'#C49845',inner:'#FFF6CE',seal:'#B88D3E',
    low:[148,181,151],rise:[45,31,18],flow:[54,133,110],light:[255,248,203],rim:[255,224,132],tileRadius:14,cardRadius:20},
  9:{paper:'#FFF4DE',tile:'#F7DEB0',glaze:'#D8C294',edge:'#AA7D3C',inner:'#FFF2CE',seal:'#A72E23',
    low:[196,176,134],rise:[32,35,34],flow:[143,70,47],light:[255,244,199],rim:[255,214,134],tileRadius:7,cardRadius:9},
};
const rgba=(rgb:RGB,alpha:number)=>new Color(rgb[0],rgb[1],rgb[2],alpha);
function layer(parent:Node,name:string):Graphics{
  const node=new Node(name);parent.addChild(node);node.addComponent(UITransform);
  return node.addComponent(Graphics);
}

/** Legacy component ID retained; all four themes share the vector animation. */
@ccclass('HotPotCeladonGlow')
export class HotPotCeladonGlow extends Component {
  private base!:Graphics;
  private flow!:Graphics;
  private light!:Graphics;
  private w=0;
  private h=0;
  private kind:GlowKind='tile';
  private blocked=false;
  private clock=0;
  private pending=0;
  private phase=0;
  private style:PageStyle=8;
  private palette:PremiumPalette=PALETTES[8];
  private badge:Node|null=null;
  public animationFrame=0;

  configure(width:number,height:number,kind:GlowKind,blocked:boolean):void{
    if(!this.base){this.base=layer(this.node,'PearlBase');this.flow=layer(this.node,'MovingGlaze');this.light=layer(this.node,'FlowingLight')}
    const style=getPageTheme().id;
    if(this.w===width&&this.h===height&&this.kind===kind&&this.blocked===blocked&&this.style===style)return;
    this.style=style;this.palette=PALETTES[style];
    this.w=width;this.h=height;this.kind=kind;this.blocked=blocked;
    const key=this.node.parent?.name||'';
    this.phase=Array.from(key).reduce((sum,c)=>sum+c.charCodeAt(0),0)%29/29;
    this.paintBase();this.paintLight();
  }
  update(dt:number):void{
    if(this.blocked||getPageTheme().id!==this.style)return;
    this.clock+=Math.min(dt,.1);this.pending+=dt;
    // A slow shimmer needs only 20 redraws/sec. Inactive nodes stop automatically.
    if(this.pending<.05)return;
    this.pending=0;
    // Scrolled-out collection cards do not rebuild geometry.
    const parent=this.node.parent;
    if(this.kind==='card'&&parent?.parent?.parent){
      const viewport=parent.parent.parent.getComponent(UITransform);
      if(viewport){const card=parent.getComponent(UITransform)!.getBoundingBoxToWorld(),view=viewport.getBoundingBoxToWorld();
        if(card.y>view.y+view.height||card.y+card.height<view.y)return}
    }
    this.paintLight();
  }
  private paintBase():void{
    const p=this.palette,g=this.base,w=this.w-6,h=this.h-6,r=this.kind==='tile'?p.tileRadius:p.cardRadius;
    g.clear();
    g.fillColor=color(this.blocked?'#8E927D':p.paper);
    g.roundRect(-w/2,-h/2,w,h,r);g.fill();
    const bottom=this.kind==='card'?-h/2+48:-h/2+4;
    const top=h/2-4,inner=w-8;
    g.fillColor=color(this.blocked?'#818C78':this.kind==='tile'?p.tile:p.glaze);
    g.roundRect(-inner/2,bottom,inner,top-bottom,r-4);g.fill();
    if(!this.blocked&&this.kind!=='tile'){
      const radius=r-4,hh=top-bottom;
      for(let i=0;i<24;i++){
        const t=(i+.5)/24,y=bottom+hh*i/24,dy=hh/24;
        const edge=Math.max(0,radius-Math.min(y-bottom,top-y-dy));
        const inset=radius-Math.sqrt(Math.max(0,radius*radius-edge*edge));
        const pearl=Math.sin(t*Math.PI);
        g.fillColor=new Color(Math.round(p.low[0]+pearl*p.rise[0]),Math.round(p.low[1]+pearl*p.rise[1]),Math.round(p.low[2]+pearl*p.rise[2]),255);
        g.rect(-inner/2+inset,y,inner-inset*2,dy+.15);g.fill();
      }
    }
    // Translucent nested glazes give the base a soft pearl depth.
    for(let i=0;i<6;i++){
      g.fillColor=color(this.blocked?'#DEE0C306':'#FFF9DB0D');
      const inset=i*3;g.roundRect(-inner/2+inset,bottom+inset,inner-inset*2,top-bottom-inset*2,Math.max(3,r-4-inset));g.fill();
    }
    g.strokeColor=color(this.blocked?'#AC9E70':p.edge);g.lineWidth=this.kind==='tile'?2.5:2;
    g.roundRect(-w/2,-h/2,w,h,r);g.stroke();
    g.strokeColor=color(this.blocked?'#C7BB8E':p.inner);g.lineWidth=1.2;
    g.roundRect(-w/2+4,-h/2+4,w-8,h-8,r-3);g.stroke();
    if(this.kind==='tile'){
      if(!this.badge){
        this.badge=new Node('PremiumSeal');this.node.addChild(this.badge);
        this.badge.addComponent(UITransform).setContentSize(22,22);
        this.badge.addComponent(Graphics);
        const labelNode=new Node('PremiumSealText');this.badge.addChild(labelNode);labelNode.addComponent(UITransform).setContentSize(20,20);
        const label=labelNode.addComponent(Label);label.string='珍';label.fontSize=14;label.lineHeight=19;label.color=color('#FFF6DA');label.fontFamily='KaiTi, STKaiti, serif';label.horizontalAlign=Label.HorizontalAlign.CENTER;label.verticalAlign=Label.VerticalAlign.CENTER;
      }
      const seal=this.badge.getComponent(Graphics)!;seal.clear();seal.fillColor=color(p.seal);seal.circle(0,0,11);seal.fill();seal.strokeColor=color(p.inner);seal.lineWidth=1;seal.circle(0,0,9);seal.stroke();
      this.badge.setPosition(w/2-8,h/2-6);
      this.badge.active=!this.blocked;
    }else if(this.badge)this.badge.active=false;
  }
  private paintLight():void{
    const p=this.palette,g=this.light;g.clear();this.animationFrame++;
    this.flow.clear();
    if(this.blocked)return;
    const w=this.w-18,h=this.h-18,left=-w/2,right=w/2;
    const low=-h/2+(this.kind==='card'?44:2),high=h/2-3;
    const time=this.clock+this.phase*4.8,pulse=.5+.5*Math.sin(time*Math.PI/2.4);
    if(this.kind!=='tile')this.paintMovingGlaze(time,left,right,low,high);
    // Three long, gently drifting strands stay behind the food and above its label.
    for(let strand=0;strand<3;strand++){
      const tile=this.kind==='tile';
      g.lineWidth=(tile?1.2:3.8)+strand*.3;
      g.strokeColor=rgba(p.light,Math.round((tile?65+pulse*70:110+pulse*85)*(1-strand*.16)));
      for(let i=0;i<=26;i++){
        const u=i/26,x=left+u*w;
        const curve=tile
          ?.08+strand*.13+u*.56+.07*Math.sin(u*5.2+time*.55+strand)
          :.14+strand*.15+u*.35+.14*Math.sin(u*5+time*1.3+strand);
        const y=low+(high-low)*curve;
        if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
      }g.stroke();
    }
    // A broad diagonal sweep, clipped to the inner rectangle (and off the text).
    const travel=((time/5.6)%1)*w*3-w*1.5,band=w*.18;
    for(let i=0;i<18;i++){
      const y=low+(high-low)*i/18,dy=(high-low)/18+.4;
      const center=travel+(y-low)*.5;
      for(let j=-2;j<=2;j++){
        const x=Math.max(left,center+j*band*.35),end=Math.min(right,center+(j+1)*band*.35);
        if(end<=x)continue;
        g.fillColor=new Color(255,253,226,Math.round((3-Math.abs(j))*(this.kind==='tile'?12:21)));
        g.rect(x,y,end-x,Math.min(dy,high-y));g.fill();
      }
    }
    // Warm rim breathes without enlarging the tile or its hit target.
    const radius=this.kind==='tile'?p.tileRadius:p.cardRadius;
    g.strokeColor=rgba(p.rim,Math.round(12+pulse*22));g.lineWidth=8;
    g.roundRect(-this.w/2+7,-this.h/2+7,this.w-14,this.h-14,Math.max(3,radius-5));g.stroke();
    g.strokeColor=rgba(p.rim,Math.round(45+pulse*95));g.lineWidth=2+pulse;
    g.roundRect(-this.w/2+5,-this.h/2+5,this.w-10,this.h-10,Math.max(3,radius-3));g.stroke();
    for(let i=0;i<3;i++){
      const x=i===0?left+5:i===1?right-5:left+w*.73;
      const y=i===0?high-5:i===1?low+8:high-9;
      const brightness=Math.max(0,Math.sin(time*1.3+i*2.1));
      g.strokeColor=new Color(255,250,216,Math.round(brightness*180));g.lineWidth=1;
      const size=(this.kind==='tile'?2:3.5)*(0.5+brightness*.5);
      g.moveTo(x-size,y);g.lineTo(x+size,y);g.moveTo(x,y-size);g.lineTo(x,y+size);g.stroke();
    }
  }

  /** Broad translucent ribbons translate across the glaze, behind the fixed food. */
  private paintMovingGlaze(time:number,left:number,right:number,low:number,high:number):void {
    const g=this.flow,w=right-left,h=high-low;
    // Clip the ribbons inside the rounded art area, leaving the name band clear.
    const planes=[[1,0,right],[-1,0,-left],[0,1,high],[0,-1,-low],
      [1,1,right+high-10],[-1,1,-left+high-10],
      [1,-1,right-low-10],[-1,-1,-left-low-10]];
    const clip=(input:number[][]):number[][]=>{
      let points=input;
      for(const [a,b,limit] of planes){
        const next:number[][]=[];
        if(!points.length)break;
        let previous=points[points.length-1],pd=a*previous[0]+b*previous[1]-limit;
        for(const point of points){
          const d=a*point[0]+b*point[1]-limit;
          if((d<=0)!==(pd<=0)){
            const t=pd/(pd-d);next.push([previous[0]+(point[0]-previous[0])*t,previous[1]+(point[1]-previous[1])*t]);
          }
          if(d<=0)next.push(point);
          previous=point;pd=d;
        }
        points=next;
      }
      return points;
    };
    const phase=time/4.8,angle=phase*Math.PI*2;
    for(const jade of [false,true]){
      const travel=(phase+(jade?.45:0))%1;
      for(let ribbon=-1;ribbon<=1;ribbon++)for(let edge=0;edge<4;edge++){
        const half=h*(.25-edge*.052),points:number[][]=[];
        const center=(u:number)=>low+h*((travel+ribbon)*1.2+u*.72+.16*Math.sin(u*5+angle+(jade?1.7:0)));
        for(let i=0;i<=18;i++){const u=i/18;points.push([left+w*u,center(u)+half])}
        for(let i=18;i>=0;i--){const u=i/18;points.push([left+w*u,center(u)-half])}
        const visible=clip(points);if(visible.length<3)continue;
        g.fillColor=jade?rgba(this.palette.flow,14+edge*8):rgba(this.palette.light,24+edge*12);
        visible.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.close();g.fill();
      }
    }
  }
}

export function paintPremiumGlow(parent:Node,width:number,height:number,kind:GlowKind,premium=true,blocked=false):void{
  let node=parent.getChildByName('CeladonPremiumGlow');
  if(!premium){if(node)node.active=false;return}
  if(!node){node=new Node('CeladonPremiumGlow');parent.addChild(node);node.addComponent(UITransform);node.addComponent(HotPotCeladonGlow)}
  node.active=true;node.setSiblingIndex(kind==='tile'?1:parent.getComponent(Graphics)?0:1);
  node.getComponent(UITransform)!.setContentSize(width,height);
  node.getComponent(HotPotCeladonGlow)!.configure(width,height,kind,blocked);
}
