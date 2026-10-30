import {Label,Node,Sprite,sys,Vec3,screen,view} from 'cc';
import {PageStyle,getPageTheme,setPageTheme} from '../data/PageTheme';
import {HotPotLegacyGame} from './HotPotLegacyGame';
import {Box,art,hit,place,text} from './HotPotReferenceArt';
import {drawFoodTile,drawRoundRect,hex,opacity,refreshPageMaterials,ToolType,transform} from './HotPotUi';
import {fitReferenceBackdrop,fitReferenceContent} from './HotPotReferenceLayout';
import {designButton} from './HotPotDesignUi';

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
  private referenceRoot!:Node;
  private screenBackground!:Node;
  private screenBackdrop:Node|null=null;
  private firstLevelBottom!:Node;
  private firstLevelStyle:PageStyle|null=null;

  private refreshReferenceViewport():void{
    this.scheduleOnce(()=>{
      if(!this.node.isValid)return;
      this.viewportHeight=view.getVisibleSize().height;
      drawRoundRect(this.screenBackground,720,this.viewportHeight,0,getPageTheme().id===1?getPageTheme().dark:getPageTheme().panel);
      if(this.screenBackdrop)fitReferenceBackdrop(this.screenBackdrop);
      fitReferenceContent(this.referenceRoot,1280);
      const toast=this.node.getChildByName('DesignToast');if(toast)fitReferenceContent(toast,1280);
      for(const overlay of this.node.children){
        if(!overlay.name.endsWith('Overlay'))continue;
        transform(overlay,720,this.viewportHeight);
        const panel=overlay.getChildByName('PlayerPanel')||overlay.getChildByName('ResultPanel');
        if(panel&&(panel as any).referenceHeight)fitReferenceContent(panel,(panel as any).referenceHeight);
        const backdrop=overlay.getChildByName('FullBleedBackground');if(backdrop)fitReferenceBackdrop(backdrop);
        const scrim=overlay.getChildByName('ModalScrim');
        const designModal=(overlay as any).designModal;
        if(scrim)drawRoundRect(scrim,720,this.viewportHeight,0,designModal===true?'#101B19A8':designModal===false?(getPageTheme().id===1?getPageTheme().dark:getPageTheme().panel):'#29150FAA');
        if(designModal===undefined&&overlay.getChildByName('PlayerPanel'))drawRoundRect(overlay,720,this.viewportHeight,0,getPageTheme().id===1?getPageTheme().dark:getPageTheme().panel);
      }
    });
  }

  onDestroy():void{
    screen.off('window-resize',this.refreshReferenceViewport,this);
    super.onDestroy();
  }

  protected buildShell():void{
    this.screenBackground=new Node('ReferenceScreenBackground');this.node.addChild(this.screenBackground);
    drawRoundRect(this.screenBackground,720,this.viewportHeight,0,getPageTheme().id===1?getPageTheme().dark:getPageTheme().panel);
    this.screenBackdrop=art(this.screenBackground,'background',[0,0,1,1],1280);
    this.screenBackdrop.name='FullBleedBackground';fitReferenceBackdrop(this.screenBackdrop);
    this.referenceRoot=new Node('ReferenceShell');this.node.addChild(this.referenceRoot);transform(this.referenceRoot,720,1280);
    fitReferenceContent(this.referenceRoot,1280);
    screen.on('window-resize',this.refreshReferenceViewport,this);
    const h=1280;
    this.refBackground=art(this.referenceRoot,'shell',[0,0,1,1],h);
    this.refBackground.name='WarmBackground';
    this.firstLevelBottom=new Node('FirstLevelBottom');this.referenceRoot.addChild(this.firstLevelBottom);transform(this.firstLevelBottom,720,1280);
    this.levelLabel=text(this.referenceRoot,'',[.25,.14,.50,.045],h,29);
    this.levelLabel.node.name='ReferenceLevel';
    this.levelLabel.fontFamily='Microsoft YaHei, sans-serif';this.levelLabel.isBold=true;
    this.progressLabel=text(this.referenceRoot,'',[.20,.18,.60,.035],h,24);
    this.progressLabel.node.name='ReferenceProgress';
    this.progressLabel.fontFamily='Microsoft YaHei, sans-serif';
    this.refMeter=new Node('ReferenceProgressMeter');this.referenceRoot.addChild(this.refMeter);
    const profile=hit(this.referenceRoot,'Button_我的',[.02,.035,.17,.12],h,()=>this.showCollection());
    hit(this.referenceRoot,'Button_设置',[.81,.035,.17,.12],h,()=>this.showPlayerProfile());
    this.profileButtonLabel=text(profile,'',[0,0,0,0],h,1);
    this.board=new Node('Board');this.referenceRoot.addChild(this.board);transform(this.board,680,830);
    this.trayNode=new Node('Tray');this.referenceRoot.addChild(this.trayNode);
    transform(this.trayNode,680,100);
    this.reserveNode=new Node('ReviveReserve');this.referenceRoot.addChild(this.reserveNode);this.reserveNode.active=false;
    transform(this.reserveNode,560,90);
    this.toolBar=new Node('ToolBar');this.referenceRoot.addChild(this.toolBar);this.shellTools=this.toolBar;
    (['undo','bomb','shuffle'] as ToolType[]).forEach((type,i)=>{
      const action=()=>type==='undo'?this.useUndoTool():type==='bomb'?this.useBombTool():this.useShuffleTool();
      const button=hit(this.toolBar,'ReferenceTool_'+type,[.09+i*.28,.78,.23,.13],h,action);
      const badge=new Node('UsesBadge');button.addChild(badge);
      const count=text(badge,'1',[-.5,-.5,1,1],40,26,'#FFF8E7',true);count.node.name='Label';
      this.toolButtons.set(type,button);
    });
    hit(this.referenceRoot,'Button_重新开始',[.24,.925,.30,.06],h,()=>this.showRestartConfirmation());
    const sound=hit(this.referenceRoot,'Button_声音',[.56,.925,.25,.06],h,()=>this.toggleSound());
    this.soundButtonLabel=text(sound,'',[0,0,0,0],h,1);
    const toast=new Node('ToastBackground');this.referenceRoot.addChild(toast);
    toast.setPosition(0,-h*.10);drawRoundRect(toast,640,56,18,'#182B25E8');opacity(toast,0);
    this.toastLabel=text(toast,'',[-.5,-.5,1,1],56,24,'#FFF4DF');opacity(this.toastLabel.node,0);
    this.foodTransitionLayer=new Node('FoodTransitionLayer');this.referenceRoot.addChild(this.foodTransitionLayer);transform(this.foodTransitionLayer,720,h);
    this.positionReferenceShell();
  }

  protected positionReferenceShell():void{
    if(!this.refBackground||!this.board||!this.levelLabel)return;
    const h=1280,t=getPageTheme(),l=layout[t.id];
    place(this.levelLabel.node,[.24,l.level-.018,.52,.036],h);
    this.levelLabel.color=hex(t.id===9?'#FFF0CE':t.id===1?t.accent:t.ink);
    place(this.progressLabel.node,[.16,l.progress-.014,.68,.03],h);
    this.progressLabel.color=hex(t.id===1?'#FFF0CE':t.ink);
    const tiles=this.levelData?.tiles;
    if(tiles?.length){
      const tileScale=this.levelData.config.tileScale||1;
      const minX=Math.min(...tiles.map(tile=>tile.x))-55.2*tileScale,maxX=Math.max(...tiles.map(tile=>tile.x))+55.2*tileScale;
      const minY=Math.min(...tiles.map(tile=>tile.y))-45.6*tileScale,maxY=Math.max(...tiles.map(tile=>tile.y))+45.6*tileScale;
      const top=326,bottom=l.tray*h-(this.reserve.length?178:64);
      const scale=Math.min(1,612/(maxX-minX),(bottom-top)/(maxY-minY));
      this.board.setScale(scale,scale,1);this.board.setPosition(-(minX+maxX)/2*scale,h/2-(top+bottom)/2-(minY+maxY)/2*scale);
    }
    this.trayNode.setPosition((l.slots[3]-.5)*720,(.5-l.tray)*h);
    const trayScale=(l.slots[6]-l.slots[0])*720/(6*94);this.trayNode.setScale(trayScale,trayScale,1);
    this.reserveNode.setPosition(0,(.5-l.tray)*h+110);
    (['undo','bomb','shuffle'] as ToolType[]).forEach((type,i)=>{
      const button=this.toolButtons.get(type)!;
      place(button,[.085+i*.28,l.tools-.065,.25,.13],h);
      const badge=button.getChildByName('UsesBadge')!;
      const bx=t.id===1?[.310,.563,.823]:t.id===4?[.331,.609,.889]:t.id===8?[.301,.574,.853]:[.33,.61,.89];
      badge.setPosition((bx[i]-(.21+i*.28))*720,(l.tools-l.badge)*h);
    });
    this.updateReferenceMeter();
    this.updateFirstLevelAppearance();
  }

  private updateFirstLevelAppearance():void{
    if(!this.firstLevelBottom)return;
    const first=this.levelIndex===0,style=getPageTheme().id;
    this.firstLevelBottom.active=first;
    if(this.shellTools)this.shellTools.active=!first;
    for(const name of ['Button_重新开始','Button_声音']){const button=this.referenceRoot.getChildByName(name);if(button)button.active=!first}
    if(this.firstLevelStyle!==style){
      for(const child of this.firstLevelBottom.children.slice()){child.removeFromParent();child.destroy()}
      // The old tool pictures are baked into the shell. Cover that lower strip
      // with the same theme's clean scenery rather than showing unusable tools.
      const top={1:990,4:1056,8:1000,9:1056}[style],box:Box=[0,top/1280,1,1-top/1280];
      const picture=art(this.firstLevelBottom,'background',box,1280,style,box);picture.name='FirstLevelLowerArt';
      designButton(this.firstLevelBottom,'Button_重新开始','↻  重新开始',[52,1124,298,80],()=>this.showRestartConfirmation(),true);
      designButton(this.firstLevelBottom,'Button_声音','声音',[370,1124,298,80],()=>this.toggleSound(),true);
      this.firstLevelStyle=style;
    }
  }

  protected previewPageStyle(style:PageStyle):void{
    setPageTheme(style);
    refreshPageMaterials(this.board);
    this.refBackground?.destroy();
    this.refBackground=art(this.referenceRoot,'shell',[0,0,1,1],1280,style);
    this.refBackground.setSiblingIndex(0);this.refBackground.name='WarmBackground';
    this.screenBackdrop?.destroy();this.screenBackdrop=art(this.screenBackground,'background',[0,0,1,1],1280,style);
    this.screenBackdrop.name='FullBleedBackground';fitReferenceBackdrop(this.screenBackdrop);
    this.positionReferenceShell();this.updateToolButtons();
    this.refreshReferenceViewport();
  }

  protected updateProgress():void{
    super.updateProgress();
    if(this.levelLabel)this.levelLabel.string='第 '+(this.levelIndex+1)+' 关 · '+this.levelData.config.title;
    if(this.refMeter)this.updateReferenceMeter();
  }

  private updateReferenceMeter():void{
    if(!this.refMeter)return;
    const l=layout[getPageTheme().id],h=1280;
    this.refMeter.setPosition(0,(.5-l.bar)*h);
    const g=drawRoundRect(this.refMeter,322,10,5,'#D6C7A8');
    const total=this.levelData?.total||1;
    const value=this.levelData?Math.max(0,this.clearedTileCount()/total):0;
    if(value>0){g.fillColor=hex('#49934D');g.roundRect(-161,-5,Math.max(1,322*value),10,4);g.fill()}
  }

  protected updateToolButtons():void{
    if(this.shellTools)this.shellTools.active=this.levelIndex>0;
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

  protected renderReserve():void{
    super.renderReserve();
    this.positionReferenceShell();
  }

  protected loadLevel(index:number,persist=true,restored?:any):void{
    super.loadLevel(index,persist,restored);
    if(this.shellTools)this.shellTools.active=this.levelIndex>0;
    this.positionReferenceShell();
  }
}
