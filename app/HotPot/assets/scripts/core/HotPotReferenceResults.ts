import {Graphics,Mask,Node,Tween,Vec3} from 'cc';
import {HotPotReferenceCollection} from './HotPotReferenceCollection';
import {ArtPage,Box,art,fullOverlay,hit,place,text} from './HotPotReferenceArt';
import {getPageTheme} from '../data/PageTheme';
import {drawRoundRect,transform} from './HotPotUi';

export abstract class HotPotReferenceResults extends HotPotReferenceCollection {
  protected endGame(won:boolean):void{
    if(won&&!this.gameEnded)this.recordReferenceWin();
    super.endGame(won);
    const overlay=this.node.getChildByName('ResultOverlay'),panel=overlay?.getChildByName('ResultPanel');if(!panel)return;
    Tween.stopAllByTarget(panel);panel.setPosition(0,0);panel.setScale(1,1,1);
    if(!won)return;
    for(const n of panel.children.slice()){n.removeFromParent();n.destroy()}
    panel.getComponent(Graphics)?.clear();
    delete (panel as any).pageSkin;
    const id=getPageTheme().id,h=this.viewportHeight;
    const page=('win'+(this.levelIndex+1)) as ArtPage;
    const bounds:Box=id===1?[.12,.14,.78,.59]:id===4?[.10,.19,.80,.48]:id===8?[.075,.20,.85,.51]:[.08,.135,.84,.525];
    const picture=art(panel,page,bounds,h,id,bounds);
    if(id===9)this.clipPicture(picture,bounds,[.08,.17,.84,.49],h,[.875,.18,.055]);
    const nextY=id===1?.585:id===4?.515:id===8?.63:.565;
    const final=this.levelIndex===2;
    hit(panel,final?'Button_再来一轮':'Button_下一关',final&&(id===8||id===9)?[.51,nextY,.41,.09]:[.12,nextY,.76,.085],h,()=>this.nextLevel());
    hit(panel,'Button_返回游戏',final&&(id===8||id===9)?[.07,nextY,.42,.09]:[.13,nextY+.095,.74,.08],h,()=>this.nextLevel());
    hit(panel,'MenuClose',[.81,bounds[1],.13,.10],h,()=>this.nextLevel());
  }

  protected drawFailurePanel(panel:Node):void{
    const id=getPageTheme().id,h=this.viewportHeight;
    const bounds:Box=id===1?[.065,.205,.88,.50]:id===4?[.10,.22,.80,.58]:id===8?[.06,.17,.88,.55]:[.04,.17,.92,.58];
    const picture=art(panel,'revive',bounds,h,id,bounds);
    if(id===4)this.clipPicture(picture,bounds,[.10,.30,.80,.50],h,[.50,.31,.19]);
    const y=id===1?.568:id===4?.595:id===8?.55:.58;
    const revive=hit(panel,this.reviveUsed?'Button_免费复活已用完':'Button_免费复活，继续捞',[.12,y,.76,.08],h,()=>this.revive());
    (revive as any).referenceDisabled=this.reviveUsed;
    if(this.reviveUsed){
      const disabled=new Node('UsedRevive');panel.addChild(disabled);place(disabled,[.14,y,.72,.075],h);
      drawRoundRect(disabled,.72*720,.075*h,22,getPageTheme().disabled);
      text(panel,'免费复活已用完',[.16,y,.68,.075],h,28,getPageTheme().muted,true);
    }
    hit(panel,'Button_重新开始',[.12,y+.08,.76,.075],h,()=>this.showRestartConfirmation());
    hit(panel,'MenuClose',[.84,.20,.12,.09],h,()=>this.dismissOverlay());
  }

  protected showRestartConfirmation():void{
    if(!this.levelData||this.hasPlayerMenu()||(this.locked&&!this.gameEnded)||this.node.getChildByName('RestartConfirmOverlay'))return;
    const h=this.viewportHeight,id=getPageTheme().id;
    const {panel}=fullOverlay(this.node,'RestartConfirmOverlay',h);
    drawRoundRect(panel,720,h,0,'#29150FAA');
    const bounds:Box=id===1?[.065,.205,.88,.48]:id===4?[.10,.22,.80,.58]:id===8?[.06,.17,.88,.53]:[.04,.17,.92,.58];
    const picture=art(panel,'restart',bounds,h,id,bounds);
    if(id===4)this.clipPicture(picture,bounds,[.10,.30,.80,.50],h,[.50,.31,.19]);
    const cancel=()=>this.dismissRestartConfirmation();
    const top=id===1?.53:id===4?.595:id===8?.53:.58;
    hit(panel,'Button_继续当前游戏',[.12,top,.76,.08],h,cancel);
    hit(panel,'Button_确定重新开始',[.12,top+.08,.76,.075],h,()=>{cancel();this.dismissOverlay();this.restartLevel()});
    hit(panel,'MenuClose',[0,0,.18,.15],h,cancel);
  }

  /** Keep illustrated corners while excluding the mock board around a dialog. */
  private clipPicture(picture:Node,bounds:Box,body:Box,h:number,circle?:number[]):void{
    const maskNode=new Node('DialogArtMask');picture.parent!.addChild(maskNode);
    transform(maskNode,720,h);
    picture.setParent(maskNode);
    const mask=maskNode.addComponent(Mask);mask.type=Mask.Type.GRAPHICS_STENCIL;
    const g=mask.subComp as Graphics;
    g.clear();
    g.roundRect((body[0]-.5)*720,(.5-body[1]-body[3])*h,body[2]*720,body[3]*h,26);g.fill();
    if(circle){g.ellipse((circle[0]-.5)*720,(.5-circle[1])*h,circle[2]*720,circle[2]*h);g.fill()}
  }
}
