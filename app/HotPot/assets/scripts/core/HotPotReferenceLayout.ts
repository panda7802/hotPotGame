import {Node, sys, view} from 'cc';
import {REFERENCE_AUX_LAYOUTS} from '../data/ReferenceAssets';
import {PageStyle} from '../data/PageTheme';

const pages = {rank:0, profile:1, picker:2, win1:3, win2:4, win3:5,
  collection:0, detail:1, achievements:2, region:3, revive:4, restart:5};
const layouts: Record<number, any> = {
  1:{width:1151,height:1367,cols:[[0,383],[388,378],[771,380]],rows:[[0,638],[643,724]]},
  4:{width:941,height:1672,cols:[[0,312],[318,307],[631,310]],rows:[[0,835],[839,833]]},
  8:{width:1151,height:1366,cols:[[0,387],[396,362],[772,379]],rows:[[0,629],[634,732]]},
  9:{width:941,height:1672,cols:[[0,312],[318,307],[631,310]],rows:[[0,834],[839,833]]},
};

/** Use the same source rectangle for the picture, data fields and hit targets. */
export function referenceSource(page:string, style:PageStyle) {
  if(page==='background')return {group:'bg',style,width:720,height:1280,x:0,y:0,w:720,h:1280};
  if(page==='shell'||page==='first')return {group:page,style,width:720,height:1280,x:0,y:0,w:720,h:1280};
  const group=['rank','profile','picker'].includes(page)||page.startsWith('win')?'a':'b';
  const actual=group==='b'&&![4,8].includes(style)&&!REFERENCE_AUX_LAYOUTS[style]?8:style;
  const shape=group==='a'?layouts[actual]:REFERENCE_AUX_LAYOUTS[actual]||
    (actual===4?{width:1152,height:1366,cols:[[0,382],[386,381],[771,381]],rows:[[0,680],[685,681]]}
      :{width:941,height:1672,cols:[[0,309],[316,308],[632,309]],rows:[[0,834],[839,833]]});
  const i=pages[page as keyof typeof pages],col=shape.cols[i%3],row=shape.rows[i<3?0:1];
  return {group,style:actual,width:shape.width,height:shape.height,x:col[0],y:row[0],w:col[1],h:row[1]};
}

export function referenceHeight(page:string, style:PageStyle):number {
  const source=referenceSource(page,style);
  return 720*source.h/source.w;
}

export interface ReferenceArea {width:number;height:number;left:number;right:number;top:number;bottom:number}

/** All values are design units; WeChat window/menu metrics arrive in CSS pixels. */
export function referenceArea():ReferenceArea {
  const visible=view.getVisibleSize(),safe=sys.getSafeAreaRect(false);
  const area={width:visible.width,height:visible.height,left:Math.max(0,safe.x),
    right:Math.max(0,visible.width-safe.x-safe.width),top:Math.max(0,visible.height-safe.y-safe.height),bottom:Math.max(0,safe.y)};
  const wx=(globalThis as any).wx;
  try {
    if(wx){
      const info=wx.getWindowInfo?.()||wx.getSystemInfoSync?.();
      if(info?.windowWidth>0&&info?.windowHeight>0){
        const sx=visible.width/info.windowWidth,sy=visible.height/info.windowHeight,s=info.safeArea;
        if(s){area.left=Math.max(area.left,s.left*sx);area.right=Math.max(area.right,(info.windowWidth-s.right)*sx);
          area.top=Math.max(area.top,s.top*sy);area.bottom=Math.max(area.bottom,(info.windowHeight-s.bottom)*sy)}
        const menu=wx.getMenuButtonBoundingClientRect?.();
        if(menu?.height>0&&menu.bottom>0)area.top=Math.max(area.top,(menu.bottom+8)*sy);
      }
    }
  }catch{/* Older hosts still have the engine safe area. */}
  return area;
}

export function referenceFit(height:number,area:ReferenceArea) {
  const width=Math.max(1,area.width-area.left-area.right),availableHeight=Math.max(1,area.height-area.top-area.bottom);
  return {scale:Math.min(width/720,availableHeight/height),x:(area.left-area.right)/2,y:(area.bottom-area.top)/2};
}

/** Scale the whole composition once so text and touch bounds follow the artwork. */
export function fitReferenceContent(node:Node,height:number):void {
  const fit=referenceFit(height,referenceArea());
  node.setScale(fit.scale,fit.scale,1);node.setPosition(fit.x,fit.y);
}

/** Decorative scenery covers the viewport; interactive content keeps its aspect. */
export function fitReferenceBackdrop(node:Node):void {
  const visible=view.getVisibleSize(),scale=Math.max(visible.width/720,visible.height/1280);
  node.setScale(scale,scale,1);node.setPosition(0,0);
}
