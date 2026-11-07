export interface GameViewport {width:number;height:number;left:number;right:number;top:number;bottom:number;systemTop?:number;menuBottom?:number}
export type GameBox=[number,number,number,number];
/** Only positions depend on the safe area. The scene itself always fills the screen. */
export function gameInterfaceLayout(area:GameViewport,first:boolean,reserve:boolean,brandAspect=801/342,backpack=false){
  const scale=area.width/720,h=area.height/scale;
  const safeTop=area.top/scale,safeBottom=area.bottom/scale;
  const c=Math.min(1,Math.max(.64,(h-safeTop-safeBottom)/1330));
  const left=Math.max(22,area.left/scale+12),right=Math.max(22,area.right/scale+12),width=720-left-right;
  const logoTop=Math.max(18,(area.systemTop??area.top)/scale+12,
    (area.menuBottom??0)/scale+10);
  // The same title box is used on gameplay and menus, with its native aspect.
  const brandWidth=480*c;
  const brand:GameBox=[360-brandWidth/2,logoTop+5*c,brandWidth,brandWidth/brandAspect];
  const rowTop=brand[1]+brand[3]+8*c,touchHeight=Math.max(100,44/scale);
  const collection:GameBox=[left,rowTop,132,touchHeight];
  const settings:GameBox=[720-right-132,rowTop,132,touchHeight];
  const stage:GameBox=[360-185*c,rowTop+(touchHeight-54*c)/2,370*c,54*c];
  const progress:GameBox=[80,settings[1]+settings[3]+7*c,560,29*c];
  const meter:GameBox=[100,progress[1]+progress[3]+9*c,495,13*c];
  const controlsY=h-safeBottom-18-82*c;
  const controls:GameBox[]=[[76,controlsY,262,82*c],[382,controlsY,262,82*c]];
  const toolsY=controlsY-22*c-112*c;
  const trayY=(first?controlsY:toolsY)-20*c-120*c;
  const boardTop=meter[1]+meter[3]+30*c,boardEnd=trayY-20*c;
  const board:GameBox=[left,boardTop,width,Math.max(140,boardEnd-boardTop)];
  const tray:GameBox=[left-8,trayY,width+16,120*c];
  const toolCount=backpack?4:3;
  const toolWidth=(width-(toolCount-1)*12)/toolCount;
  const tools:GameBox[]=Array.from({length:toolCount},(_,i)=>[left+i*(toolWidth+12),toolsY,toolWidth,112*c]);
  const play:GameBox=[left+28,boardTop+26,width-56,Math.max(80,board[3]-52-(reserve?108:0))];
  return {scale,h,c,brand,collection,settings,stage,progress,meter,controls,tools,tray,board,play,safeTop,safeBottom};
}
