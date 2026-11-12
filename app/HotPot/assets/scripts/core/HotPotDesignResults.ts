import {Graphics,Node,Tween} from 'cc';
import {getPageTheme} from '../data/PageTheme';
import {HotPotDesignCollection} from './HotPotDesignCollection';
import {designButton,designHit,designIcon,designNode,designOverlay,designSurface,designText} from './HotPotDesignUi';
import {fitReferenceContent} from './HotPotReferenceLayout';
import {transform} from './HotPotUi';
import {paintVictoryArt} from './HotPotVictoryArt';

export abstract class HotPotDesignResults extends HotPotDesignCollection {
  protected endGame(won:boolean):void {
    if(this.node.getChildByName('ResultOverlay'))return;
    if(won&&!this.gameEnded)this.recordDesignWin();
    // Keep the existing score, checkpoint, sound and revival rules.
    super.endGame(won);
    const overlay=this.node.getChildByName('ResultOverlay'),panel=overlay?.getChildByName('ResultPanel');if(!overlay||!panel)return;
    (overlay as any).designModal=true;Tween.stopAllByTarget(panel);transform(panel,720,1280);(panel as any).referenceHeight=1280;fitReferenceContent(panel,1280);
    if(!won)return;
    for(const child of panel.children.slice()){child.removeFromParent();child.destroy()}
    panel.getComponent('cc.Graphics')?.destroy();delete (panel as any).pageSkin;
    const final=this.levelIndex===2,t=getPageTheme(),height=714;
    const body=designNode(panel,'WinDialog',[28,(1280-height)/2,664,height]);designSurface(body);
    // One no-text image per theme; all three stages keep live data and controls.
    const artwork=designNode(body,'VictoryArtwork_0'+t.id,[0,0,664,height]);
    const loading=designText(body,'庆功盛宴准备中…',[74,170,516,80],28,t.muted);
    const caption=designText(body,final?'满 堂 鲜 香':'开 锅 大 吉',[184,12,296,38],22,t.ink);
    caption.node.name='VictoryCaption';
    const title=designText(body,final?'全部通关！':'第 '+(this.levelIndex+1)+' 关完成',[58,363,548,62],48,t.ink,true);
    title.node.name='VictoryTitle';title.lineHeight=60;
    const subtitle=designText(body,final?'千层食材尽收锅底，小馆因你热闹非凡。':this.levelIndex===0?'第一锅鲜香，稳稳拿下。':'热锅练手，越捞越顺手。',[52,428,560,30],24,t.muted);
    subtitle.node.name='VictorySubtitle';subtitle.lineHeight=28;
    const stats=designNode(body,'DialogStats',[90,466,484,50]);designSurface(stats,t.panel,24,t.edge,false);
    const summary=designText(stats,this.levelData.config.title+'   '+this.levelData.total+' 块已清空',[10,2,464,46],25,t.ink,true);
    summary.node.name='VictoryStats';summary.lineHeight=32;
    const next=()=>this.nextLevel();
    const primary=designButton(body,final?'Button_再来一轮':'Button_下一关',final?'再来一轮':'下一关',[74,532,516,62],next);
    const secondary=designButton(body,'Button_返回游戏','返回游戏',[74,615,516,62],next,true);
    const surfaces=[stats,primary,secondary];
    let pending=false;
    const load=()=>{
      if(pending)return;pending=true;
      loading.string='庆功盛宴准备中…';
      paintVictoryArt(artwork,t.id,()=>{
        loading.node.destroy();
        surfaces.forEach(node=>{const graphics=node.getComponent(Graphics);if(graphics)graphics.enabled=false});
        (body as any).victoryArtworkReady=true;
      },()=>{pending=false;loading.string='点击重试庆功盛宴';});
    };
    designHit(loading.node,()=>{if(!artwork.getComponent('cc.Sprite'))load()});load();
  }
  protected drawFailurePanel(panel:Node):void {
    transform(panel,720,1280);(panel as any).referenceHeight=1280;
    const t=getPageTheme(),body=designNode(panel,'ReviveDialog',[56,239,608,802]);designSurface(body);
    const adRevive=this.levelIndex===2&&this.reviveUsed;
    const exhausted=this.reviveUsed&&!adRevive;
    const circle=designNode(body,'WarningCircle',[238,46,132,132]);designSurface(circle,t.panel,66);designIcon(circle,'warning',[30,30,72,72]);
    designButton(body,'MenuClose','×',[526,16,64,64],()=>this.dismissOverlay(),true);
    designText(body,'托盘满啦',[42,202,524,74],44,t.ink,true);
    designText(body,exhausted?'本局的免费复活已使用，\n重新开锅，再试一次吧。':adRevive?'看完激励视频，将前三张移入寄存区，\n腾出三格，继续捞！':'把前三张食材移入寄存区，\n腾出三格，继续捞！',[42,294,524,104],27,t.muted);
    this.tray.slice(0,3).forEach((type,i)=>{
      const card=designNode(body,'ReservedPreview_'+i,[134+i*118,422,104,100]);designSurface(card,t.panel,14);
      this.addIngredientImage(card,type,false,94,90);
    });
    designText(body,adRevive?'本局免费次数已用 · 每次看完视频可复活':'每局免费复活一次 · 无需广告',[42,542,524,46],23,t.muted);
    const name=exhausted?'Button_免费复活已用完':adRevive?'Button_看视频复活':'Button_免费复活，继续捞';
    const caption=exhausted?'免费复活已用完':adRevive?'▶  看视频复活':'↻  免费复活，继续捞';
    designButton(body,name,caption,[42,600,524,84],()=>{void this.revive()},false,exhausted);
    designButton(body,'Button_重新开始','重新开始',[42,706,524,84],()=>this.showRestartConfirmation(),true);
  }
  protected showRestartConfirmation():void {
    if(!this.levelData||this.hasPlayerMenu()||(this.locked&&!this.gameEnded)||this.node.getChildByName('RestartConfirmOverlay'))return;
    this.rewardedVideo.cancel();
    const {panel}=designOverlay(this.node,'RestartConfirmOverlay',this.viewportHeight,true),t=getPageTheme();
    const body=designNode(panel,'RestartDialog',[56,320,608,640]);designSurface(body);
    const cancel=()=>this.dismissRestartConfirmation();designButton(body,'MenuClose','×',[526,16,64,64],cancel,true);
    const circle=designNode(body,'RestartCircle',[238,38,132,132]);designSurface(circle,t.panel,66);designIcon(circle,'refresh',[30,30,72,72]);
    designText(body,'重新开锅？',[42,188,524,70],44,t.ink,true);
    designText(body,this.gameEnded?'本局已结束，重新抽取食材开锅。\n道具次数和免费复活机会将重置。':'保留本关食材，只重新排列布局。\n本关进度、道具和复活机会将重置。',[42,272,524,94],27,t.muted);
    designText(body,'当前关卡   第 '+(this.levelIndex+1)+' 关 · '+this.levelData.config.title,[42,382,524,44],25,t.ink,true);
    designButton(body,'Button_继续当前游戏','继续当前游戏',[42,448,524,80],cancel);
    designButton(body,'Button_确定重新开始','↻  确定重新开始',[42,550,524,80],()=>{cancel();this.dismissOverlay();this.restartLevel()},true);
  }
  protected showToast(message:string,_color:string):void {
    const toast=this.toastLabel?.node.parent;if(!toast)return;
    let layer=this.node.getChildByName('DesignToast');
    if(!layer){layer=new Node('DesignToast');this.node.addChild(layer);transform(layer,720,1280)}
    fitReferenceContent(layer,1280);layer.setSiblingIndex(this.node.children.length-1);
    if(toast.parent!==layer)toast.setParent(layer);
    transform(toast,576,90);toast.setPosition(0,-58);designSurface(toast,'#183C32EF',20,'#C6AB6A',false);
    transform(this.toastLabel.node,528,76);this.toastLabel.node.setPosition(0,0);this.toastLabel.fontSize=28;this.toastLabel.lineHeight=39;
    this.toastLabel.fontFamily='Microsoft YaHei, sans-serif';
    super.showToast(message,'#FFF5DC');
  }
  protected toggleSound():void {
    super.toggleSound();this.showToast(this.soundEnabled?'声音已开启':'声音已关闭',getPageTheme().accent);
  }
}
