import {Label,Node,Sprite,screen,view} from 'cc';
import {PageStyle,getPageTheme,setPageTheme} from '../data/PageTheme';
import {CONFIRMED_SHELLS} from '../data/ConfirmedShells';
import {HotPotLegacyGame} from './HotPotLegacyGame';
import {Box,art,hit,place,text} from './HotPotReferenceArt';
import {drawRoundRect,hex,opacity,refreshPageMaterials,ToolType,transform} from './HotPotUi';
import {referenceArea,fitReferenceBackdrop,fitReferenceContent} from './HotPotReferenceLayout';

const slots:Record<PageStyle,number[]>={1:[.136,.255,.375,.495,.615,.735,.855],4:[.114,.243,.371,.499,.627,.755,.882],8:[.152,.267,.384,.500,.616,.731,.848],9:[.113,.242,.371,.5,.629,.758,.887]};

/** Confirmed artwork surrounds live tiles; only the quiet middle stretches. */
export abstract class HotPotReferenceShell extends HotPotLegacyGame {
  protected referenceLayout=true;
  private refBackground:Node|null=null;
  private refMeter!:Node;
  private referenceRoot!:Node;
  private screenBackground!:Node;
  private screenBackdrop:Node|null=null;
  private firstLevelBottom!:Node;
  private shellKey='';
  private shellHeight=1280;

  private refreshReferenceViewport():void{
    this.scheduleOnce(()=>{
      if(!this.node.isValid)return;
      this.viewportHeight=view.getVisibleSize().height;
      drawRoundRect(this.screenBackground,720,this.viewportHeight,0,getPageTheme().panel);
      if(this.screenBackdrop)fitReferenceBackdrop(this.screenBackdrop);
      this.positionReferenceShell();
      const toast=this.node.getChildByName('DesignToast');if(toast)fitReferenceContent(toast,1280);
      for(const overlay of this.node.children){
        if(!overlay.name.endsWith('Overlay'))continue;
        transform(overlay,720,this.viewportHeight);
        const panel=overlay.getChildByName('PlayerPanel')||overlay.getChildByName('ResultPanel');
        if(panel&&(panel as any).referenceHeight)fitReferenceContent(panel,(panel as any).referenceHeight);
        const backdrop=overlay.getChildByName('FullBleedBackground');if(backdrop)fitReferenceBackdrop(backdrop);
        const scrim=overlay.getChildByName('ModalScrim');
        if(scrim)drawRoundRect(scrim,720,this.viewportHeight,0,(overlay as any).designModal?'#101B19A8':getPageTheme().panel);
      }
    });
  }
  onDestroy():void{screen.off('window-resize',this.refreshReferenceViewport,this);super.onDestroy()}

  protected buildShell():void{
    this.screenBackground=new Node('ReferenceScreenBackground');this.node.addChild(this.screenBackground);
    drawRoundRect(this.screenBackground,720,this.viewportHeight,0,getPageTheme().panel);
    this.screenBackdrop=art(this.screenBackground,'background',[0,0,1,1],1280);
    this.screenBackdrop.name='FullBleedBackground';fitReferenceBackdrop(this.screenBackdrop);
    this.referenceRoot=new Node('ReferenceShell');this.node.addChild(this.referenceRoot);transform(this.referenceRoot,720,1280);
    screen.on('window-resize',this.refreshReferenceViewport,this);
    this.firstLevelBottom=new Node('FirstLevelBottom');this.referenceRoot.addChild(this.firstLevelBottom);
    this.levelLabel=text(this.referenceRoot,'',[.25,.14,.5,.045],1280,29);this.levelLabel.node.name='ReferenceLevel';
    this.levelLabel.fontFamily='Microsoft YaHei, sans-serif';this.levelLabel.isBold=true;
    this.progressLabel=text(this.referenceRoot,'',[.2,.18,.6,.035],1280,24);this.progressLabel.node.name='ReferenceProgress';
    this.progressLabel.fontFamily='Microsoft YaHei, sans-serif';
    this.refMeter=new Node('ReferenceProgressMeter');this.referenceRoot.addChild(this.refMeter);
    const profile=hit(this.referenceRoot,'Button_我的',[.02,.035,.17,.12],1280,()=>this.showCollection());
    hit(this.referenceRoot,'Button_设置',[.81,.035,.17,.12],1280,()=>this.showPlayerProfile());
    this.profileButtonLabel=text(profile,'',[0,0,0,0],1280,1);
    this.board=new Node('Board');this.referenceRoot.addChild(this.board);transform(this.board,680,830);
    this.trayNode=new Node('Tray');this.referenceRoot.addChild(this.trayNode);transform(this.trayNode,680,100);
    this.reserveNode=new Node('ReviveReserve');this.referenceRoot.addChild(this.reserveNode);transform(this.reserveNode,560,90);this.reserveNode.active=false;
    this.toolBar=new Node('ToolBar');this.referenceRoot.addChild(this.toolBar);
    (['undo','bomb','shuffle'] as ToolType[]).forEach(type=>{
      const action=()=>type==='undo'?this.useUndoTool():type==='bomb'?this.useBombTool():this.useShuffleTool();
      const button=hit(this.toolBar,'ReferenceTool_'+type,[0,0,.25,.13],1280,action);
      const badge=new Node('UsesBadge');button.addChild(badge);transform(badge,32,32);
      const count=text(badge,'1',[-.5,-.5,1,1],32,22,'#FFF8E7',true);count.node.name='Label';
      count.fontFamily='Arial';count.lineHeight=28;count.verticalAlign=Label.VerticalAlign.CENTER;
      this.toolButtons.set(type,button);
    });
    hit(this.referenceRoot,'Button_重新开始',[0,0,1,1],1280,()=>this.showRestartConfirmation());
    const sound=hit(this.referenceRoot,'Button_声音',[0,0,1,1],1280,()=>this.toggleSound());
    this.soundButtonLabel=text(sound,'',[0,0,0,0],1280,1);
    const toast=new Node('ToastBackground');this.referenceRoot.addChild(toast);drawRoundRect(toast,640,56,18,'#182B25E8');opacity(toast,0);
    this.toastLabel=text(toast,'',[-.5,-.5,1,1],56,24,'#FFF4DF');opacity(this.toastLabel.node,0);
    this.foodTransitionLayer=new Node('FoodTransitionLayer');this.referenceRoot.addChild(this.foodTransitionLayer);transform(this.foodTransitionLayer,720,1280);
    this.positionReferenceShell();
  }

  protected positionReferenceShell():void{
    if(!this.referenceRoot||!this.levelLabel)return;
    const t=getPageTheme(),l=CONFIRMED_SHELLS[t.id],first=this.levelIndex===0;
    const area=referenceArea(),width=Math.max(1,area.width-area.left-area.right),available=Math.max(1,area.height-area.top-area.bottom);
    const fit=Math.min(width/720,available/1080),h=available/fit;this.shellHeight=h;
    transform(this.referenceRoot,720,h);this.referenceRoot.setScale(fit,fit,1);this.referenceRoot.setPosition((area.left-area.right)/2,(area.bottom-area.top)/2);
    transform(this.foodTransitionLayer,720,h);
    const start=first?l.firstStart:l.start,bottom=1280-start,key=t.id+':'+first;
    if(key!==this.shellKey){
      if(this.refBackground){this.refBackground.removeFromParent();this.refBackground.destroy()}
      this.refBackground=art(this.referenceRoot,first?'first':'shell',[0,0,1,1],h,t.id);
      this.refBackground.name='WarmBackground';this.refBackground.setSiblingIndex(0);this.shellKey=key;
      // Corners, sign, tray and controls keep their size. Only the central strip stretches.
      (this.refBackground as any).nineSlice={top:l.top+64,bottom:bottom+64};
    }
    transform(this.refBackground!,720,h);this.refBackground!.setPosition(0,0);
    const rect=(n:Node,b:number[])=>place(n,[b[0]/720,b[1]/h,b[2]/720,b[3]/h],h);
    rect(this.levelLabel.node,l.level);this.levelLabel.color=hex(t.id===9?'#FFF0CE':t.accent);
    rect(this.progressLabel.node,l.progress);this.progressLabel.color=hex(t.id===1?'#FFF0CE':t.ink);
    // Fit the actual board without changing coordinates, coverage or the save seed.
    const tiles=this.levelData?.tiles;
    if(tiles?.length){
      const tileScale=this.levelData.config.tileScale||1;
      const minX=Math.min(...tiles.map(tile=>tile.x))-55.2*tileScale,maxX=Math.max(...tiles.map(tile=>tile.x))+55.2*tileScale;
      const minY=Math.min(...tiles.map(tile=>tile.y))-45.6*tileScale,maxY=Math.max(...tiles.map(tile=>tile.y))+45.6*tileScale;
      transform(this.board,maxX-minX,maxY-minY).setAnchorPoint(-minX/(maxX-minX),-minY/(maxY-minY));
      const top=l.top+48,end=h-bottom-(this.reserve.length?174:44);
      const scale=Math.min(1,588/(maxX-minX),Math.max(80,end-top)/(maxY-minY));
      this.board.setScale(scale,scale,1);this.board.setPosition(-(minX+maxX)/2*scale,h/2-(top+end)/2-(minY+maxY)/2*scale);
    }
    const sourceDelta=start-l.start,trayY=h-1280+sourceDelta+(l.tray[0]+l.tray[1])/2,ss=slots[t.id];
    this.trayNode.setPosition((ss[3]-.5)*720,h/2-trayY);
    const trayScale=(ss[6]-ss[0])*720/(6*94);this.trayNode.setScale(trayScale,trayScale,1);
    this.reserveNode.setPosition(0,h/2-trayY+114);
    (['undo','bomb','shuffle'] as ToolType[]).forEach((type,i)=>{
      const button=this.toolButtons.get(type)!,[bx,by]=l.badges[i];
      const sourceY=by+46,sourceX=bx-66;
      const target=[sourceX-83,h-1280+sourceY-64,166,128];rect(button,target);
      const badge=button.getChildByName('UsesBadge')!;
      // These coordinates are the measured centers of the illustrated red circles.
      badge.setPosition(bx-sourceX,sourceY-by);
    });
    rect(this.referenceRoot.getChildByName('Button_重新开始')!,[185,h-1280+1148,205,74]);
    rect(this.referenceRoot.getChildByName('Button_声音')!,[395,h-1280+1148,155,74]);
    for(const name of ['Button_我的','Button_设置']){
      const n=this.referenceRoot.getChildByName(name)!;rect(n,[name==='Button_我的'?20:584,48,116,140]);
    }
    this.firstLevelBottom.active=first;this.toolBar.active=!first;
    this.updateReferenceMeter();
  }
  protected previewPageStyle(style:PageStyle):void{
    setPageTheme(style);refreshPageMaterials(this.board);this.shellKey='';
    this.screenBackdrop?.destroy();this.screenBackdrop=art(this.screenBackground,'background',[0,0,1,1],1280,style);
    this.screenBackdrop.name='FullBleedBackground';fitReferenceBackdrop(this.screenBackdrop);
    this.positionReferenceShell();this.updateToolButtons();this.refreshReferenceViewport();
  }
  protected updateProgress():void{
    super.updateProgress();
    if(this.levelLabel)this.levelLabel.string='第 '+(this.levelIndex+1)+' 关 · '+this.levelData.config.title;
    if(this.refMeter)this.updateReferenceMeter();
  }
  private updateReferenceMeter():void{
    if(!this.refMeter)return;
    const b=CONFIRMED_SHELLS[getPageTheme().id].meter,h=this.shellHeight;
    this.refMeter.setPosition(b[0]+b[2]/2-360,h/2-b[1]-b[3]/2);
    const g=drawRoundRect(this.refMeter,b[2],b[3],b[3]/2,'#EFDFBD');
    const value=this.levelData?Math.max(0,this.clearedTileCount()/this.levelData.total):0;
    if(value>0){g.fillColor=hex('#67974C');g.roundRect(-b[2]/2,-b[3]/2,Math.max(1,b[2]*value),b[3],Math.min(b[3]/2,b[2]*value/2));g.fill()}
  }
  protected updateToolButtons():void{
    if(this.toolBar)this.toolBar.active=this.levelIndex>0;
    for(const type of ['undo','bomb','shuffle'] as ToolType[]){
      const button=this.toolButtons.get(type);if(!button)continue;
      (button as any).referenceDisabled=this.levelIndex===0||!(this.unlimitedTools[type]||this.toolUses[type]>0);
      const label=button.getChildByName('UsesBadge')?.getChildByName('Label')?.getComponent(Label);
      if(label)label.string=this.levelIndex>0?(this.unlimitedTools[type]?'∞':String(this.toolUses[type])):'0';
    }
  }
  protected renderTray():void{super.renderTray();for(const n of this.trayNode.children)if(n.name.startsWith('TraySlot_'))n.active=false}
  protected renderReserve():void{super.renderReserve();this.positionReferenceShell()}
  protected loadLevel(index:number,persist=true,restored?:any):void{super.loadLevel(index,persist,restored);this.positionReferenceShell()}
}
