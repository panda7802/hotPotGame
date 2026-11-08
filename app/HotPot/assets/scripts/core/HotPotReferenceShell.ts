import {Graphics,Label,Node,screen,UITransform,view} from 'cc';
import {PageStyle,getPageTheme,setPageTheme} from '../data/PageTheme';
import {HotPotLegacyGame} from './HotPotLegacyGame';
import {hit,text} from './HotPotReferenceArt';
import {drawRoundRect,hex,opacity,refreshPageMaterials,ToolType,transform} from './HotPotUi';
import {referenceArea,fitReferenceBackdrop,fitReferenceContent} from './HotPotReferenceLayout';
import {gameArtNode,paintGameArt,paintGameBackdrop,GameArtRole} from './HotPotGameArt';
import {gameInterfaceLayout,GameBox} from './HotPotGameLayout';
import {GAME_ART_RECTS} from '../data/GameInterfaceAssets';
import {
  designSurface,designText,fitDesignPage,paintBackpackIcon,paintThemeHeaderButton,
  paintToolIcon,TOOL_ICON_SIZE,
} from './HotPotDesignUi';

const TOOLBAR_PLATES = {
  1:{fill:'#204C3E',bag:'#913729',edge:'#D2A35E',ink:'#FFF4D5',bagInk:'#FFF4D5',radius:19},
  4:{fill:'#FFF3D9',bag:'#E3EEC7',edge:'#D8AF77',ink:'#653C22',bagInk:'#385638',radius:32},
  8:{fill:'#FAF6E4',bag:'#DCEADC',edge:'#9FB6A1',ink:'#264E40',bagInk:'#264E40',radius:30},
  9:{fill:'#FAEED6',bag:'#F1D8C2',edge:'#BA905E',ink:'#362A21',bagInk:'#7E3426',radius:8},
};

/** Independent transparent artwork over one full-bleed scene; all gameplay remains live. */
export abstract class HotPotReferenceShell extends HotPotLegacyGame {
  protected referenceLayout=true;
  private referenceRoot!:Node;
  private screenBackground!:Node;
  private screenBackdrop:Node|null=null;
  private firstLevelBottom!:Node;
  private brand!:Node;
  private boardArt!:Node;
  private stageArt!:Node;
  private trayArt!:Node;
  private giftArt!:Node;
  private refMeter!:Node;
  private shellHeight=1280;
  private meterBox:GameBox=[100,260,495,13];

  private refreshReferenceViewport():void{
    this.scheduleOnce(()=>{
      if(!this.node.isValid)return;
      this.viewportHeight=view.getVisibleSize().height;
      drawRoundRect(this.screenBackground,720,this.viewportHeight,0,getPageTheme().panel);
      if(this.screenBackdrop)paintGameBackdrop(this.screenBackdrop,getPageTheme().id);
      this.positionReferenceShell();
      const toast=this.node.getChildByName('DesignToast');if(toast)fitReferenceContent(toast,1280);
      for(const overlay of this.node.children){
        if(!overlay.name.endsWith('Overlay'))continue;
        transform(overlay,720,this.viewportHeight);
        const panel=overlay.getChildByName('PlayerPanel')||overlay.getChildByName('ResultPanel');
        if(panel&&(panel as any).designPage)fitDesignPage(panel);
        else if(panel&&(panel as any).referenceHeight)fitReferenceContent(panel,(panel as any).referenceHeight);
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
    this.screenBackdrop=gameArtNode(this.screenBackground,'FullBleedBackground');paintGameBackdrop(this.screenBackdrop,getPageTheme().id);
    this.referenceRoot=new Node('ReferenceShell');this.node.addChild(this.referenceRoot);transform(this.referenceRoot,720,1280);
    screen.on('window-resize',this.refreshReferenceViewport,this);
    this.firstLevelBottom=gameArtNode(this.referenceRoot,'FirstLevelBottom');
    this.brand=gameArtNode(this.referenceRoot,'BrandArtwork');
    this.boardArt=gameArtNode(this.referenceRoot,'BoardArtwork');
    this.stageArt=gameArtNode(this.referenceRoot,'StageArtwork');
    this.trayArt=gameArtNode(this.referenceRoot,'TrayToolArtwork');
    this.giftArt=gameArtNode(this.referenceRoot,'GiftArtwork');
    this.levelLabel=text(this.referenceRoot,'',[0,0,1,.05],1280,29);this.levelLabel.node.name='ReferenceLevel';
    this.levelLabel.fontFamily='Microsoft YaHei, sans-serif';this.levelLabel.isBold=true;
    this.progressLabel=text(this.referenceRoot,'',[0,0,1,.04],1280,24);this.progressLabel.node.name='ReferenceProgress';
    this.progressLabel.fontFamily='Microsoft YaHei, sans-serif';
    this.refMeter=gameArtNode(this.referenceRoot,'ReferenceProgressMeter');
    const settings=hit(this.referenceRoot,'Button_设置',[0,0,.1,.1],1280,()=>this.showPlayerProfile());
    this.profileButtonLabel=text(settings,'',[0,0,0,0],1280,1);this.profileButtonLabel.node.active=false;
    const library=hit(this.referenceRoot,'Button_食材图鉴',[0,0,.1,.1],1280,()=>this.showCollection());
    const libraryLabel=text(library,'图鉴',[-.5,-.5,1,1],24,21,getPageTheme().ink,true);
    libraryLabel.node.name='LibraryLabel';
    this.board=gameArtNode(this.referenceRoot,'Board');
    this.trayNode=gameArtNode(this.referenceRoot,'Tray');
    this.reserveNode=gameArtNode(this.referenceRoot,'ReviveReserve');this.reserveNode.active=false;
    this.toolBar=gameArtNode(this.referenceRoot,'ToolBar');
    (['undo','bomb','shuffle'] as ToolType[]).forEach(type=>{
      const action=()=>type==='undo'?this.useUndoTool():type==='bomb'?this.useBombTool():this.useShuffleTool();
      const button=hit(this.toolBar,'ReferenceTool_'+type,[0,0,1,1],1280,action);
      const label=text(button,{undo:'撤回',bomb:'炸',shuffle:'翻锅'}[type],[0,0,1,.1],1280,30,'#FFF4D8',true);label.node.name='ToolLabel';label.fontFamily='Microsoft YaHei, sans-serif';
      const badge=gameArtNode(button,'UsesBadge');
      const count=text(badge,'1',[0,0,1,1],40,25,'#FFF8E7',true);count.node.name='Label';
      count.fontFamily='Arial';this.toolButtons.set(type,button);
    });
    this.makeGameControl('Button_重新开始','重新开始',()=>this.showRestartConfirmation());
    const sound=this.makeGameControl('Button_声音','声音：开',()=>this.toggleSound());
    this.soundButtonLabel=sound.getChildByName('Label')!.getComponent(Label)!;
    const muted=gameArtNode(sound,'MutedMark');muted.active=false;
    const toast=gameArtNode(this.referenceRoot,'ToastBackground');drawRoundRect(toast,640,56,18,'#182B25E8');opacity(toast,0);
    this.toastLabel=text(toast,'',[-.5,-.5,1,1],56,24,'#FFF4DF');opacity(this.toastLabel.node,0);
    this.foodTransitionLayer=gameArtNode(this.referenceRoot,'FoodTransitionLayer');
    this.positionReferenceShell();
  }
  private makeGameControl(name:string,caption:string,action:()=>void):Node{
    const button=hit(this.referenceRoot,name,[0,0,1,1],1280,action);
    const label=text(button,caption,[0,0,1,.1],1280,29,'#FFF4DF',true);label.node.name='Label';
    label.fontFamily='Microsoft YaHei, sans-serif';return button;
  }
  private positionBox(node:Node,b:GameBox):void{
    transform(node,b[2],b[3]);node.setScale(1,1,1);node.setPosition(b[0]+b[2]/2-360,this.shellHeight/2-b[1]-b[3]/2);
  }
  private positionArt(node:Node,role:GameArtRole,b:GameBox,style:PageStyle,sliced=false,contain=false):void{
    if(contain){const source=GAME_ART_RECTS[style][role],s=Math.min(b[2]/source[2],b[3]/source[3]);
      b=[b[0]+(b[2]-source[2]*s)/2,b[1]+(b[3]-source[3]*s)/2,source[2]*s,source[3]*s]}
    this.positionBox(node,b);paintGameArt(node,role,style,sliced);
  }
  private positionToolbarPlate(button:Node,box:GameBox,style:PageStyle,bag=false):void{
    this.positionBox(button,box);
    const material=TOOLBAR_PLATES[style];
    const plate=button.getChildByName('ToolPlate')||gameArtNode(button,'ToolPlate');
    plate.setSiblingIndex(0);
    transform(plate,box[2],box[3]*.82);
    designSurface(plate,bag?material.bag:material.fill,material.radius,material.edge);
  }
  protected positionReferenceShell():void{
    if(!this.referenceRoot||!this.levelLabel)return;
    const t=getPageTheme(),first=this.levelIndex===0;
    const brandArt=GAME_ART_RECTS[t.id].brand;
    const backpack=this.levelIndex===2;
    const l=gameInterfaceLayout(referenceArea(),first,this.reserve.length>0,brandArt[2]/brandArt[3],backpack);
    this.shellHeight=l.h;transform(this.referenceRoot,720,l.h);this.referenceRoot.setPosition(0,0);this.referenceRoot.setScale(l.scale,l.scale,1);
    transform(this.foodTransitionLayer,720,l.h);
    this.positionArt(this.brand,'brand',l.brand,t.id,false,true);
    this.positionArt(this.boardArt,'panel',l.board,t.id,true);
    this.positionArt(this.stageArt,'stage',l.stage,t.id);
    this.positionArt(this.trayArt,'tray',l.tray,t.id,true);
    this.positionArt(this.giftArt,'gift',[l.meter[0]+l.meter[2]+14,l.meter[1]-22*l.c,54*l.c,52*l.c],t.id,false,true);
    const settings=this.referenceRoot.getChildByName('Button_设置')!;
    const library=this.referenceRoot.getChildByName('Button_食材图鉴')!;
    this.positionBox(library,l.collection);
    const libraryLabel=library.getChildByName('LibraryLabel')!;
    transform(libraryLabel,112*l.c,32*l.c);libraryLabel.setPosition(0,-33*l.c);
    libraryLabel.getComponent(Label)!.color=hex(t.ink);
    libraryLabel.getComponent(Label)!.fontSize=26*l.c;
    this.positionBox(settings,l.settings);
    paintThemeHeaderButton(settings,'设置','settings',l.c);
    paintThemeHeaderButton(library,'图鉴','book',l.c);
    library.active=false;
    libraryLabel.active=false;
    const book=library.getChildByName('CollectionBook');if(book)book.active=false;
    this.positionBox(this.levelLabel.node,[l.stage[0]+18,l.stage[1]+2,l.stage[2]-36,l.stage[3]-4]);
    this.levelLabel.fontSize=26*l.c;this.levelLabel.lineHeight=40*l.c;this.levelLabel.color=hex(t.id===9?'#FFF0CE':t.id===1?'#365842':t.ink);
    this.positionBox(this.progressLabel.node,l.progress);this.progressLabel.fontSize=24*l.c;this.progressLabel.lineHeight=30*l.c;
    this.progressLabel.color=hex(t.id===1?'#FFF0CE':t.ink);
    this.meterBox=l.meter;this.updateReferenceMeter();
    const tiles=this.levelData?.tiles;
    if(tiles?.length){
      // Original coordinates and blocker graph are unchanged; stable bounds include removed tiles.
      const ts=this.levelData.config.tileScale||1;
      const minX=Math.min(...tiles.map(tile=>tile.x))-55.2*ts,maxX=Math.max(...tiles.map(tile=>tile.x))+55.2*ts;
      const minY=Math.min(...tiles.map(tile=>tile.y))-50.6*ts,maxY=Math.max(...tiles.map(tile=>tile.y))+50.6*ts;
      transform(this.board,maxX-minX,maxY-minY).setAnchorPoint(-minX/(maxX-minX),-minY/(maxY-minY));
      const s=Math.min(1,l.play[2]/(maxX-minX),l.play[3]/(maxY-minY));
      this.board.setScale(s,s,1);this.board.setPosition(l.play[0]+l.play[2]/2-360-(minX+maxX)/2*s,l.h/2-l.play[1]-l.play[3]/2-(minY+maxY)/2*s);
    }
    const innerWidth=l.tray[2]-40,spacing=innerWidth/7,trayScale=spacing/94;
    this.trayNode.setPosition(l.tray[0]+l.tray[2]/2-360,l.h/2-l.tray[1]-l.tray[3]/2);
    this.trayNode.setScale(trayScale,trayScale,1);
    for(const slot of this.trayNode.children.filter(n=>n.name.startsWith('TraySlot_'))){
      const graphics=slot.getComponent(Graphics);if(graphics)graphics.enabled=false;
      const height=Math.min(94,(l.tray[3]-24)/trayScale);transform(slot,86,height);
      const face=slot.getChildByName('SlotArtwork')||gameArtNode(slot,'SlotArtwork');transform(face,86,height);face.setPosition(0,0);paintGameArt(face,'slot',t.id);slot.active=true;
    }
    this.reserveNode.setPosition(0,l.h/2-l.tray[1]+64);
    const material=TOOLBAR_PLATES[t.id];
    (['undo','bomb','shuffle'] as ToolType[]).forEach((type,i)=>{
      const button=this.toolButtons.get(type)!,b=l.tools[i];
      this.positionToolbarPlate(button,b,t.id);
      const icon=button.getChildByName('ToolIcon')||gameArtNode(button,'ToolIcon');
      const scale=Math.min(b[2]*.42,b[3]*.64)/TOOL_ICON_SIZE;
      transform(icon,TOOL_ICON_SIZE,TOOL_ICON_SIZE);
      icon.setScale(scale,scale,1);icon.setPosition(-b[2]*.23,0);
      paintToolIcon(icon,type,t.id);
      const label=button.getChildByName('ToolLabel')!;
      transform(label,b[2]*.50,b[3]*.6);label.setPosition(b[2]*.22,-2*l.c);
      const component=label.getComponent(Label)!;
      component.fontSize=30*l.c;component.lineHeight=40*l.c;
      component.overflow=Label.Overflow.SHRINK;component.color=hex(material.ink);
      const badge=button.getChildByName('UsesBadge')!;
      badge.setSiblingIndex(button.children.length-1);
      const badgeSize=34*l.c;
      drawRoundRect(badge,badgeSize,badgeSize,badgeSize/2,'#AD412D','#FFF0CA',1.5);
      badge.setPosition(b[2]/2-badgeSize*.58,b[3]*.40);
      const count=badge.getChildByName('Label')!;transform(count,badgeSize,badgeSize);count.setPosition(0,0);
      count.getComponent(Label)!.fontSize=24*l.c;
    });
    const inventory=this.toolBar.getChildByName('Button_背包')||(
      backpack ? hit(this.toolBar,'Button_背包',[0,0,1,1],1280,()=>this.showInventoryTools()) : null
    );
    if(inventory){
      inventory.active=backpack;
      if(backpack){
        const box=l.tools[3];
        this.positionToolbarPlate(inventory,box,t.id,true);
        const icon=inventory.getChildByName('InventoryIcon')||gameArtNode(inventory,'InventoryIcon');
        const iconSize=Math.min(box[2]*.41,box[3]*.62);
        transform(icon,48,48);
        icon.setPosition(-box[2]*.23,0);
        icon.setScale(iconSize/48,iconSize/48,1);
        paintBackpackIcon(icon,t.id);
        const label=inventory.getChildByName('InventoryLabel')?.getComponent(Label)
          ||designText(inventory,'背包',[0,0,box[2],box[3]],28*l.c,t.ink,true);
        label.node.name='InventoryLabel';
        transform(label.node,box[2]*.54,box[3]);
        label.node.setPosition(box[2]*.21,0);
        label.color=hex(material.bagInk);
        label.fontSize=30*l.c;label.lineHeight=40*l.c;
      }
    }
    for(const [i,name] of ['Button_重新开始','Button_声音'].entries()){
      const button=this.referenceRoot.getChildByName(name)!,b=l.controls[i];this.positionArt(button,i===0?'restart':'sound',b,t.id);
      const label=button.getChildByName('Label')!;transform(label,148,b[3]*.75);label.setPosition(43,0);
      const component=label.getComponent(Label)!;component.fontSize=27*l.c;component.lineHeight=38*l.c;component.color=hex('#FFF4DF');
    }
    this.firstLevelBottom.active=first;this.toolBar.active=!first;this.updateSoundMark();
  }
  private updateReferenceMeter():void{
    if(!this.refMeter)return;
    const b=this.meterBox;this.positionBox(this.refMeter,b);
    const g=drawRoundRect(this.refMeter,b[2],b[3],b[3]/2,'#F1E4C8','#CDAF75',1);
    const value=this.levelData?Math.max(0,this.clearedTileCount()/this.levelData.total):0;
    if(value>0){g.fillColor=hex('#78A44D');g.roundRect(-b[2]/2,-b[3]/2,Math.max(1,b[2]*value),b[3],Math.min(b[3]/2,b[2]*value/2));g.fill()}
  }
  protected previewPageStyle(style:PageStyle):void{
    setPageTheme(style);refreshPageMaterials(this.board);refreshPageMaterials(this.trayNode);refreshPageMaterials(this.reserveNode);
    if(this.screenBackdrop)paintGameBackdrop(this.screenBackdrop,style);
    this.positionReferenceShell();this.updateToolButtons();this.refreshReferenceViewport();
  }
  protected updateProgress():void{
    super.updateProgress();
    if(this.levelLabel)this.levelLabel.string='第 '+(this.levelIndex+1)+' 关 · '+this.levelData.config.title;
    if(this.isInventoryAssisted()&&this.progressLabel)
      this.progressLabel.string='道具辅助  |  '+this.progressLabel.string;
    if(this.refMeter)this.updateReferenceMeter();
  }
  private updateSoundMark():void{
    const sound=this.referenceRoot?.getChildByName('Button_声音'),mark=sound?.getChildByName('MutedMark');if(!mark)return;
    const b=sound!.getComponent(UITransform)!;transform(mark,46,46);mark.setPosition(-b.width*.28,0);mark.active=!this.soundEnabled;
    const g=mark.getComponent(Graphics)||mark.addComponent(Graphics);g.clear();g.strokeColor=hex('#9D281D');g.lineWidth=6;g.moveTo(-17,-17);g.lineTo(17,17);g.stroke();
  }
  protected toggleSound():void{super.toggleSound();this.updateSoundMark()}
  protected showInventoryTools():void {}
  protected updateToolButtons():void{
    if(this.toolBar)this.toolBar.active=this.levelIndex>0;
    for(const type of ['undo','bomb','shuffle'] as ToolType[]){
      const button=this.toolButtons.get(type);if(!button)continue;
      const disabled=this.levelIndex===0||!(this.unlimitedTools[type]||this.toolUses[type]>0);
      (button as any).referenceDisabled=disabled;
      const icon=button.getChildByName('ToolIcon');if(icon)opacity(icon,disabled?150:255);
      const label=button.getChildByName('UsesBadge')?.getChildByName('Label')?.getComponent(Label);
      if(label)label.string=this.levelIndex>0?(this.unlimitedTools[type]?'∞':String(this.toolUses[type])):'0';
    }
  }
  protected renderTray():void{super.renderTray();this.positionReferenceShell()}
  protected renderReserve():void{super.renderReserve();this.positionReferenceShell()}
  protected loadLevel(index:number,persist=true,restored?:any):void{super.loadLevel(index,persist,restored);this.positionReferenceShell()}
}
