import {Label,Node,Sprite,sys,Vec3} from 'cc';
import {PageStyle,getPageTheme,setPageTheme} from '../data/PageTheme';
import {HotPotLegacyGame} from './HotPotLegacyGame';
import {Box,art,hit,place,text} from './HotPotReferenceArt';
import {drawFoodTile,drawRoundRect,hex,opacity,refreshPageMaterials,ToolType,transform} from './HotPotUi';

const layout:Record<PageStyle,{tray:number,tools:number,badge:number,level:number,progress:number,bar:number,slots:number[]}>={
  1:{tray:.721,tools:.845,badge:.794,level:.167,progress:.204,bar:.222,slots:[.136,.255,.375,.495,.615,.735,.855]},
  4:{tray:.766,tools:.877,badge:.848,level:.156,progress:.188,bar:.216,slots:[.114,.243,.371,.499,.627,.755,.882]},
  8:{tray:.730,tools:.842,badge:.812,level:.152,progress:.187,bar:.207,slots:[.152,.267,.384,.500,.616,.731,.848]},
  9:{tray:.766,tools:.875,badge:.846,level:.144,progress:.182,bar:.199,slots:[.113,.242,.371,.5,.629,.758,.887]},
};

/** The original illustrated shell surrounds real, independently playable tiles. */
export abstract class HotPotReferenceShell extends HotPotLegacyGame {
  protected referenceLayout=true;
  private refBackground:Node|null=null;
  private refMeter:Node|null=null;
  private shellTools:Node|null=null;

  protected buildShell():void{
    const h=this.viewportHeight;
    this.refBackground=art(this.node,'shell',[0,0,1,1],h);
    this.refBackground.name='WarmBackground';
    this.levelLabel=text(this.node,'',[.25,.14,.50,.045],h,29);
    this.levelLabel.node.name='ReferenceLevel';
    this.progressLabel=text(this.node,'',[.20,.18,.60,.035],h,24);
    this.progressLabel.node.name='ReferenceProgress';
    this.refMeter=new Node('ReferenceProgressMeter');this.node.addChild(this.refMeter);
    const profile=hit(this.node,'Button_我的',[.02,.035,.17,.12],h,()=>this.showCollection());
    hit(this.node,'Button_设置',[.81,.035,.17,.12],h,()=>this.showPlayerProfile());
    this.profileButtonLabel=text(profile,'',[0,0,0,0],h,1);
    this.board=new Node('Board');this.node.addChild(this.board);transform(this.board,680,830);
    this.trayNode=new Node('Tray');this.node.addChild(this.trayNode);
    this.reserveNode=new Node('ReviveReserve');this.node.addChild(this.reserveNode);this.reserveNode.active=false;
    this.toolBar=new Node('ToolBar');this.node.addChild(this.toolBar);this.shellTools=this.toolBar;
    (['undo','bomb','shuffle'] as ToolType[]).forEach((type,i)=>{
      const action=()=>type==='undo'?this.useUndoTool():type==='bomb'?this.useBombTool():this.useShuffleTool();
      const button=hit(this.toolBar,'ReferenceTool_'+type,[.09+i*.28,.78,.23,.13],h,action);
      const badge=new Node('UsesBadge');button.addChild(badge);
      const count=text(badge,'1',[-.5,-.5,1,1],40,26,'#FFF8E7',true);count.node.name='Label';
      this.toolButtons.set(type,button);
    });
    hit(this.node,'Button_重新开始',[.24,.925,.30,.06],h,()=>this.showRestartConfirmation());
    const sound=hit(this.node,'Button_声音',[.56,.925,.25,.06],h,()=>this.toggleSound());
    this.soundButtonLabel=text(sound,'',[0,0,0,0],h,1);
    const toast=new Node('ToastBackground');this.node.addChild(toast);
    toast.setPosition(0,-h*.10);drawRoundRect(toast,640,56,18,'#182B25E8');opacity(toast,0);
    this.toastLabel=text(toast,'',[-.5,-.5,1,1],56,24,'#FFF4DF');opacity(this.toastLabel.node,0);
    this.foodTransitionLayer=new Node('FoodTransitionLayer');this.node.addChild(this.foodTransitionLayer);transform(this.foodTransitionLayer,720,h);
    this.positionReferenceShell();
  }

  private positionReferenceShell():void{
    if(!this.refBackground||!this.board||!this.levelLabel)return;
    const h=this.viewportHeight,t=getPageTheme(),l=layout[t.id];
    place(this.levelLabel.node,[.24,l.level-.018,.52,.036],h);
    this.levelLabel.color=hex(t.id===9?'#FFF0CE':t.id===1?t.accent:t.ink);
    place(this.progressLabel.node,[.16,l.progress-.014,.68,.03],h);
    this.progressLabel.color=hex(t.id===1?'#FFF0CE':t.ink);
    this.board.setPosition(0,(.5-.475)*h);
    const scale=Math.min(1,(l.tray-.28)*h/830);
    this.board.setScale(scale,scale,1);
    this.trayNode.setPosition((l.slots[3]-.5)*720,(.5-l.tray)*h);
    this.trayNode.setScale((l.slots[6]-l.slots[0])*720/(6*94),1,1);
    this.reserveNode.setPosition(0,(.5-l.tray)*h+110);
    (['undo','bomb','shuffle'] as ToolType[]).forEach((type,i)=>{
      const button=this.toolButtons.get(type)!;
      place(button,[.085+i*.28,l.tools-.065,.25,.13],h);
      const badge=button.getChildByName('UsesBadge')!;
      const bx=t.id===1?[.310,.563,.823]:t.id===4?[.321,.599,.879]:t.id===8?[.301,.574,.853]:[.32,.60,.88];
      badge.setPosition((bx[i]-(.21+i*.28))*720,(l.tools-l.badge)*h);
    });
    this.updateReferenceMeter();
  }

  protected previewPageStyle(style:PageStyle):void{
    setPageTheme(style);
    refreshPageMaterials(this.board);
    this.refBackground?.destroy();
    this.refBackground=art(this.node,'shell',[0,0,1,1],this.viewportHeight,style);
    this.refBackground.setSiblingIndex(0);this.refBackground.name='WarmBackground';
    this.positionReferenceShell();this.updateToolButtons();
  }

  protected updateProgress():void{
    super.updateProgress();
    if(this.levelLabel)this.levelLabel.string='第 '+(this.levelIndex+1)+' 关 · '+this.levelData.config.title;
    if(this.refMeter)this.updateReferenceMeter();
  }

  private updateReferenceMeter():void{
    if(!this.refMeter)return;
    const l=layout[getPageTheme().id],h=this.viewportHeight;
    this.refMeter.setPosition(0,(.5-l.bar)*h);
    const g=drawRoundRect(this.refMeter,322,10,5,'#D6C7A8');
    const total=this.levelData?.total||1;
    const value=this.levelData?Math.max(0,this.clearedTileCount()/total):0;
    if(value>0){g.fillColor=hex('#49934D');g.roundRect(-161,-5,Math.max(1,322*value),10,4);g.fill()}
  }

  protected updateToolButtons():void{
    for(const type of ['undo','bomb','shuffle'] as ToolType[]){
      const button=this.toolButtons.get(type);if(!button)continue;
      const allowed=this.levelIndex>0&&(this.unlimitedTools[type]||this.toolUses[type]>0);
      (button as any).referenceDisabled=!allowed;
      const label=button.getChildByName('UsesBadge')?.getChildByName('Label')?.getComponent(Label);
      if(label)label.string=this.levelIndex>0?(this.unlimitedTools[type]?'∞':String(this.toolUses[type])):'0';
    }
  }

  protected renderTray():void{
    super.renderTray();
    for(const child of this.trayNode.children)if(child.name.startsWith('TraySlot_'))child.active=false;
  }

  protected loadLevel(index:number,persist=true,restored?:any):void{
    super.loadLevel(index,persist,restored);
    if(this.shellTools)this.shellTools.active=true;
    this.positionReferenceShell();
  }
}
