import {Node,Tween} from 'cc';
import {getPageTheme} from '../data/PageTheme';
import {HotPotDesignCollection} from './HotPotDesignCollection';
import {designButton,designIcon,designNode,designOverlay,designSurface,designText} from './HotPotDesignUi';
import {fitReferenceContent} from './HotPotReferenceLayout';
import {transform} from './HotPotUi';

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
    const final=this.levelIndex===2,t=getPageTheme(),height=final?792:750;
    const body=designNode(panel,'WinDialog',[56,(1280-height)/2,608,height]);designSurface(body);
    const next=()=>this.nextLevel();designButton(body,'MenuClose','×',[526,16,64,64],next,true);
    designText(body,final?'满 堂 鲜 香':'开 锅 大 吉',[80,40,448,40],23,t.accent);
    const types=this.levelIndex===0?['toufu','beef','mushroom']:this.levelIndex===1?['corn','shrimp','mushroom']:['shrimp','mushroom','beef'];
    types.forEach((type,i)=>{const icon=designNode(body,'WinIngredient_'+i,[108+i*118,110+(i===1?-14:0),156,156]);this.addIngredientImage(icon,type as any,false,156,156)});
    designText(body,final?'全部通关！':'第 '+(this.levelIndex+1)+' 关完成',[42,282,524,72],44,t.ink,true);
    designText(body,final?'千层食材尽收锅底，\n小馆因你热闹非凡。':this.levelIndex===0?'第一锅鲜香，稳稳拿下。':'热锅练手，越捞越顺手。',[42,368,524,final?94:72],27,t.muted);
    const offset=final?26:0,stats=designNode(body,'DialogStats',[42,440+offset,524,74]);designSurface(stats,t.panel,20,t.edge,false);
    designText(stats,this.levelData.config.title+'   '+this.levelData.total+' 块已清空',[14,8,496,58],26,t.ink,true);
    designButton(body,final?'Button_再来一轮':'Button_下一关',final?'↻  再来一轮':'下一关',[42,536+offset,524,84],next);
    designButton(body,'Button_返回游戏','返回游戏',[42,642+offset,524,84],next,true);
  }
  protected drawFailurePanel(panel:Node):void {
    transform(panel,720,1280);(panel as any).referenceHeight=1280;
    const t=getPageTheme(),body=designNode(panel,'ReviveDialog',[56,239,608,802]);designSurface(body);
    const circle=designNode(body,'WarningCircle',[238,46,132,132]);designSurface(circle,t.panel,66);designIcon(circle,'warning',[30,30,72,72]);
    designButton(body,'MenuClose','×',[526,16,64,64],()=>this.dismissOverlay(),true);
    designText(body,'托盘满啦',[42,202,524,74],44,t.ink,true);
    designText(body,this.reviveUsed?'本局的免费复活已使用，\n重新开锅，再试一次吧。':'把前三张食材移入寄存区，\n腾出三格，继续捞！',[42,294,524,104],27,t.muted);
    this.tray.slice(0,3).forEach((type,i)=>{
      const card=designNode(body,'ReservedPreview_'+i,[134+i*118,422,104,100]);designSurface(card,t.panel,14);
      this.addIngredientImage(card,type,false,94,90);
    });
    designText(body,'每局免费复活一次 · 无需广告',[42,542,524,46],23,t.muted);
    designButton(body,this.reviveUsed?'Button_免费复活已用完':'Button_免费复活，继续捞',this.reviveUsed?'免费复活已用完':'↻  免费复活，继续捞',[42,600,524,84],()=>this.revive(),false,this.reviveUsed);
    designButton(body,'Button_重新开始','重新开始',[42,706,524,84],()=>this.showRestartConfirmation(),true);
  }
  protected showRestartConfirmation():void {
    if(!this.levelData||this.hasPlayerMenu()||(this.locked&&!this.gameEnded)||this.node.getChildByName('RestartConfirmOverlay'))return;
    const {panel}=designOverlay(this.node,'RestartConfirmOverlay',this.viewportHeight,true),t=getPageTheme();
    const body=designNode(panel,'RestartDialog',[56,320,608,640]);designSurface(body);
    const cancel=()=>this.dismissRestartConfirmation();designButton(body,'MenuClose','×',[526,16,64,64],cancel,true);
    const circle=designNode(body,'RestartCircle',[238,38,132,132]);designSurface(circle,t.panel,66);designIcon(circle,'refresh',[30,30,72,72]);
    designText(body,'重新开锅？',[42,188,524,70],44,t.ink,true);
    designText(body,'重新开始后，本关进度将清空，\n道具次数和免费复活机会将重置。',[42,272,524,94],27,t.muted);
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
