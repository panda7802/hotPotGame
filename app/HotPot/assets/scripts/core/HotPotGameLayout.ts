export interface GameViewport {width:number;height:number;left:number;right:number;top:number;bottom:number;systemTop?:number;menuBottom?:number}
export type GameBox=[number,number,number,number];
/** Only positions depend on the safe area. The scene itself always fills the screen. */
export function gameInterfaceLayout(area:GameViewport,first:boolean,reserve:boolean){
  const scale=area.width/720,h=area.height/scale;
  const safeTop=area.top/scale,safeBottom=area.bottom/scale;
  const c=Math.min(1,Math.max(.64,(h-safeTop-safeBottom)/1330));
  const left=Math.max(22,area.left/scale+12),right=Math.max(22,area.right/scale+12),width=720-left-right;
  const logoTop=Math.max(18,(area.systemTop??area.top)/scale+12),logoHeight=175*c;
  const brand:GameBox=[360-282*c,logoTop,510*c,logoHeight];
  const settings:GameBox=[628,Math.max(logoTop+26*c,(area.menuBottom??0)/scale+10),80*c,80*c];
  const stage:GameBox=[360-258*c,logoTop+logoHeight+7*c,516*c,48*c];
  const progress:GameBox=[80,stage[1]+stage[3]+7*c,560,29*c];
  const meter:GameBox=[100,progress[1]+progress[3]+9*c,495,13*c];
  const controlsY=h-safeBottom-18-82*c;
  const controls:GameBox[]=[[76,controlsY,262,82*c],[382,controlsY,262,82*c]];
  const toolsY=controlsY-22*c-112*c;
  const trayY=(first?controlsY:toolsY)-20*c-120*c;
  const boardTop=meter[1]+meter[3]+30*c,boardEnd=trayY-20*c;
  const board:GameBox=[left,boardTop,width,Math.max(140,boardEnd-boardTop)];
  const tray:GameBox=[left-8,trayY,width+16,120*c];
  const toolWidth=(width-24)/3;
  const tools:GameBox[]=[0,1,2].map(i=>[left+i*(toolWidth+12),toolsY,toolWidth,112*c] as GameBox);
  const play:GameBox=[left+28,boardTop+26,width-56,Math.max(80,board[3]-52-(reserve?108:0))];
  return {scale,h,c,brand,settings,stage,progress,meter,controls,tools,tray,board,play,safeTop,safeBottom};
}
