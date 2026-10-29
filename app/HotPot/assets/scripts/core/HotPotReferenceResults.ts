import {Graphics,Node,Tween,Vec3} from 'cc';
import {HotPotReferenceCollection} from './HotPotReferenceCollection';
import {ArtPage,Box,art,hit,place,text} from './HotPotReferenceArt';
import {getPageTheme} from '../data/PageTheme';
import {drawRoundRect,transform} from './HotPotUi';

export abstract class HotPotReferenceResults extends HotPotReferenceCollection {
  protected endGame(won:boolean):void{
    if(won&&!this.gameEnded)this.recordReferenceWin();
    super.endGame(won);
    if(!won)return;
    const overlay=this.node.getChildByName('ResultOverlay'),panel=overlay?.getChildByName('ResultPanel');if(!panel)return;
    Tween.stopAllByTarget(panel);panel.setPosition(0,0);panel.setScale(1,1,1);
    for(const n of panel.children.slice()){n.removeFromParent();n.destroy()}
    panel.getComponent(Graphics)?.clear();
    delete (panel as any).pageSkin;
    const id=getPageTheme().id,h=this.viewportHeight;
    const page=('win'+(this.levelIndex+1)) as ArtPage;
    const bounds:Box=id===1?[.12,.14,.78,.59]:id===4?[.10,.19,.80,.48]:id===8?[.075,.20,.85,.51]:[.08,.135,.84,.525];
    art(panel,page,bounds,h,id,bounds);
    const nextY=id===1?.585:id===4?.515:id===8?.63:.565;
    const final=this.levelIndex===2;
    hit(panel,final?'Button_再来一轮':'Button_下一关',final&&(id===8||id===9)?[.51,nextY,.41,.09]:[.12,nextY,.76,.085],h,()=>this.nextLevel());
    hit(panel,'Button_返回游戏',final&&(id===8||id===9)?[.07,nextY,.42,.09]:[.13,nextY+.095,.74,.08],h,()=>this.nextLevel());
    hit(panel,'MenuClose',[.81,bounds[1],.13,.10],h,()=>this.nextLevel());
  }

  protected drawFailurePanel(panel:Node):void{
    const id=getPageTheme().id,h=this.viewportHeight;
    const bounds:Box=id===4?[.07,.22,.86,.49]:[.04,.18,.92,.65];
    art(panel,'revive',bounds,h,id,bounds);
    const y=id===4?.52:.62;
    const revive=hit(panel,this.reviveUsed?'Button_免费复活已用完':'Button_免费复活，继续捞',[.12,y,.76,.08],h,()=>this.revive());
    (revive as any).referenceDisabled=this.reviveUsed;
    if(this.reviveUsed){
      const disabled=new Node('UsedRevive');panel.addChild(disabled);place(disabled,[.14,y,.72,.075],h);
      drawRoundRect(disabled,.72*720,.075*h,22,getPageTheme().disabled);
      text(panel,'免费复活已用完',[.16,y,.68,.075],h,28,getPageTheme().muted,true);
    }
    hit(panel,'Button_重新开始',[.12,y+.09,.76,.085],h,()=>this.showRestartConfirmation());
    hit(panel,'MenuClose',[.84,.20,.12,.09],h,()=>this.dismissOverlay());
  }

  protected showRestartConfirmation():void{
    if(!this.levelData||this.hasPlayerMenu()||(this.locked&&!this.gameEnded)||this.node.getChildByName('RestartConfirmOverlay'))return;
    const panel=this.referenceAux('RestartConfirmOverlay','restart');if(!panel)return;
    const h=this.viewportHeight,id=getPageTheme().id;
    const cancel=()=>this.dismissRestartConfirmation();
    const top=id===4?.51:.63;
    hit(panel,'Button_继续当前游戏',[.12,top,.76,.08],h,cancel);
    hit(panel,'Button_确定重新开始',[.12,top+.09,.76,.085],h,()=>{cancel();this.dismissOverlay();this.restartLevel()});
    hit(panel,'MenuClose',[0,0,.18,.15],h,cancel);
  }
}
