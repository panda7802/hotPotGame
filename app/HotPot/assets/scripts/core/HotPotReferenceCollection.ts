import {EditBox,Graphics,Label,Mask,Node,ScrollView,Vec3} from 'cc';
import {getPageTheme} from '../data/PageTheme';
import {REFERENCE_AUX_LAYOUTS} from '../data/ReferenceAssets';
import {INGREDIENTS,IngredientType,getIngredient} from '../data/GameData';
import {achievementEntries,INGREDIENT_STORIES} from '../data/CollectionData';
import {regionPath,RegionNode} from '../data/PlayerData';
import {HotPotReferenceMenus} from './HotPotReferenceMenus';
import {ArtPage,Box,art,fullOverlay,hit,patch,place,text,pageHeight} from './HotPotReferenceArt';
import {referenceHeight} from './HotPotReferenceLayout';
import {drawFoodTile,drawRoundRect,hex,transform} from './HotPotUi';

/** Live collections, real progress and real province/city/county choices. */
export abstract class HotPotReferenceCollection extends HotPotReferenceMenus {
  private referenceScroll={ingredients:0,achievements:0};
  private referenceTab:'ingredients'|'achievements'='ingredients';

  protected referenceAux(name:string,page:ArtPage):Node|null{
    if([4,8].includes(getPageTheme().id)||REFERENCE_AUX_LAYOUTS[getPageTheme().id])return this.referencePage(name,page);
    if(!this.playerService||!this.levelData||this.hasPlayerMenu())return null;
    const h=referenceHeight('shell',getPageTheme().id);
    const {panel}=fullOverlay(this.node,name,this.viewportHeight,h);
    art(panel,'shell',[0,0,1,1],h);
    const paper=new Node('PaperContent');panel.addChild(paper);
    place(paper,[.045,.16,.91,.73],h);
    drawRoundRect(paper,655,.73*h,24,getPageTheme().panel,getPageTheme().edge,4);
    text(panel,{collection:'食材图鉴',detail:'食材详情',achievements:'我的成就',region:'选择所在地',revive:'托盘满啦',restart:'重新开始？'}[page]||'',
      [.15,.17,.70,.07],h,38,getPageTheme().ink,true);
    return panel;
  }

  private paper(parent:Node,box:Box):Node{
    const h=pageHeight(parent),n=new Node('LivePaper');parent.addChild(n);place(n,box,h);
    drawRoundRect(n,box[2]*720,box[3]*h,2,getPageTheme().panel);return n;
  }

  protected referenceButton(parent:Node,name:string,caption:string,box:Box,action:()=>void):Node{
    const h=pageHeight(parent),n=hit(parent,name,box,h,action);
    // Use the ornate action from the approved result art, keeping its real frame.
    const id=getPageTheme().id;
    const crop:Box=id===1?[.14,.585,.72,.065]:id===4?[.16,.515,.68,.055]:id===8?[.12,.63,.76,.077]:[.18,.565,.64,.07];
    art(n,'win1',[-.5,-.5,1,1],box[3]*h,id,crop);
    // Only the label area is replaced; illustrated corners, shadows and frame stay.
    const cover=new Node('ButtonLabelCover');n.addChild(cover);
    drawRoundRect(cover,box[2]*720*.64,box[3]*h*.58,4,getPageTheme().accent);
    const label=text(n,caption,[-.42,-.35,.84,.7],box[3]*h,27,getPageTheme().onAccent,true);
    label.node.setPosition(0,0);return n;
  }

  private scroll(parent:Node,name:string,box:Box,contentHeight:number,offset=0):Node{
    const h=pageHeight(parent),viewport=new Node(name);parent.addChild(viewport);place(viewport,box,h);
    viewport.addComponent(Mask);
    const content=new Node(name==='CollectionViewport'?'CollectionContent':'RegionContent');viewport.addChild(content);
    transform(content,box[2]*720,contentHeight).setAnchorPoint(.5,1);
    content.setPosition(0,box[3]*h/2+offset);
    const view=viewport.addComponent(ScrollView);view.content=content;view.horizontal=false;view.vertical=true;view.elastic=false;view.inertia=true;view.cancelInnerEvents=true;
    return content;
  }

  protected showCollection(tab:'ingredients'|'achievements'='ingredients',entry?:any):void{
    const page=tab==='ingredients'?'collection':'achievements';
    const p=this.referenceAux('CollectionOverlay',page);if(!p)return;
    this.referenceTab=tab;
    const h=pageHeight(p),id=getPageTheme().id,t=getPageTheme(),state=this.playerService!.state;
    const top=tab==='achievements'?.22:id===4?.27:.26,bottom=id===4?.91:.865;
    this.paper(p,[.04,top,.92,bottom-top]);
    const titleTaps={count:entry?.headingTaps||0,food:entry?.ingredientTaps||0};
    hit(p,'CollectionHeading',[.1,.01,.8,.14],h,()=>titleTaps.count++);
    const saveOffset=()=>{const c=p.getChildByName('CollectionViewport')?.getChildByName('CollectionContent');if(c)this.referenceScroll[tab]=Math.max(0,c.position.y-(bottom-top)*h/2)};
    const returnTo=()=>{saveOffset();this.dismissPlayerMenu('CollectionOverlay');this.showPlayerProfile()};
    const change=(next:'ingredients'|'achievements')=>{saveOffset();this.dismissPlayerMenu('CollectionOverlay');this.showCollection(next)};
    if(tab==='ingredients'){
      const counter=(id===4?[.34,.215,.40,.045]:[.26,.205,.48,.045]) as Box;this.paper(p,counter);
      text(p,'已发现 '+state.progress.discovered.length+' / 50',counter,h,27,t.ink,true);
      const content=this.scroll(p,'CollectionViewport',[.055,top,.89,bottom-top],Math.ceil(50/3)*236,this.referenceScroll.ingredients);
      INGREDIENTS.forEach((item,i)=>{
        const known=state.progress.discovered.includes(item.id),card=new Node('IngredientCard_'+item.id);content.addChild(card);
        card.setPosition((i%3-1)*214,-120-Math.floor(i/3)*236);transform(card,204,226);
        drawFoodTile(card,198,215,!known);
        const icon=new Node('CollectionIngredient');card.addChild(icon);icon.setPosition(0,32);
        if(known)this.addIngredientImage(icon,item.id,false,178,155);
        else text(icon,'?',[-.5,-.5,1,1],140,64,t.muted).node.setPosition(0,0);
        const label=text(card,known?item.name:'未发现',[-.45,-.15,.9,.25],100,28,t.ink,true);label.node.setPosition(0,-79);
        card.on(Node.EventType.TOUCH_END,()=>{saveOffset();this.dismissPlayerMenu('CollectionOverlay');this.showIngredientDetail(item.id)});
      });
      hit(p,'Button_食材图鉴',[.1,.1,.8,.08],h,()=>{
        if(titleTaps.count>=this.playerService!.runtimeConfig.collectionHeadingTaps&&++titleTaps.food>=this.playerService!.runtimeConfig.collectionIngredientTaps){this.dismissPlayerMenu('CollectionOverlay');this.showBackdoor()}
      });
    }else{
      const entries=achievementEntries(state);
      const content=this.scroll(p,'CollectionViewport',[.055,top,.89,bottom-top],entries.length*300,this.referenceScroll.achievements);
      entries.forEach((item,i)=>{
        const card=new Node('Achievement_'+item.id);content.addChild(card);card.setPosition(0,-146-i*300);transform(card,635,276);
        // Every achievement reuses the illustrated card and medal in the reference.
        art(card,'achievements',[-.5,-.5,1,1],276,id,[.055,.235,.89,.235]);
        const fill=new Node('AchievementTextPaper');card.addChild(fill);fill.setPosition(56,0);drawRoundRect(fill,450,232,8,t.panel);
        const title=text(card,item.title,[-.28,-.42,.74,.21],276,30,t.ink,true);title.node.setPosition(62,81);
        const desc=text(card,item.description,[-.28,-.11,.74,.29],276,23,t.muted);desc.node.setPosition(62,20);
        const bar=new Node('AchievementProgress');card.addChild(bar);bar.setPosition(36,-70);const g=drawRoundRect(bar,340,10,5,t.line);
        const w=Math.min(1,item.current/item.target)*340;if(w){g.fillColor=hex(t.success);g.roundRect(-170,-5,w,10,4);g.fill()}
        const count=text(card,item.current+'/'+item.target,[-.5,-.5,1,1],40,22,t.ink);count.node.setPosition(230,-70);transform(count.node,92,35);
      });
    }
    hit(p,'Button_返回我的',[.18,id===4?.925:.89,.64,.075],h,returnTo);
    hit(p,'MenuClose',[0,0,.18,.13],h,returnTo);
  }

  protected showIngredientDetail(type:IngredientType):void{
    const p=this.referenceAux('CollectionDetailOverlay','detail');if(!p)return;
    const h=pageHeight(p),t=getPageTheme(),item=getIngredient(type),known=this.playerService!.state.progress.discovered.includes(type);
    const back=()=>{this.dismissPlayerMenu('CollectionDetailOverlay');this.showCollection(this.referenceTab)};
    if(type==='shrimp'&&known&&([4,8].includes(t.id)||REFERENCE_AUX_LAYOUTS[t.id])){
      hit(p,'Button_返回图鉴',[.08,.885,.84,.09],h,back);hit(p,'MenuClose',[0,0,.18,.13],h,back);return;
    }
    this.paper(p,[.08,.16,.84,.72]);
    text(p,known?'已发现':'尚未发现',[.27,.17,.46,.055],h,28,t.accent,true);
    const icon=new Node('IngredientPortrait');p.addChild(icon);place(icon,[.16,.245,.68,.35],h);
    drawFoodTile(icon,410,.32*h);
    if(known)this.addIngredientImage(icon,type,false,390,.30*h);else text(icon,'?',[-.5,-.5,1,1],180,100,t.muted).node.setPosition(0,0);
    text(p,known?item.name:'神秘食材',[.18,.61,.64,.06],h,38,t.ink,true);
    text(p,known?INGREDIENT_STORIES[type].story:'在游戏中拿取这份食材即可点亮。',[.13,.70,.74,.14],h,27,t.ink);
    this.referenceButton(p,'Button_返回图鉴','返回图鉴',[.12,.895,.76,.065],back);hit(p,'MenuClose',[0,0,.18,.13],h,back);
  }

  protected showRegionPicker(codes:string[],leaderboard=false,_query=''):void{
    if(leaderboard){this.showReferenceRanking();return}
    const p=this.referenceAux('RegionOverlay','region');if(!p)return;
    const h=pageHeight(p),t=getPageTheme(),all=this.playerService!.regions;
    const selected=(codes.length?codes:this.playerService!.state.profile.regionCodes).slice();
    this.paper(p,[.055,.22,.89,.65]);
    let lists:RegionNode[][]=[all,all.find(n=>n.code===selected[0])?.children||[],[]];
    lists[2]=lists[1].find(n=>n.code===selected[1])?.children||[];
    ['省份','城市','区县'].forEach((name,col)=>{
      text(p,name,[.07+col*.30,.245,.26,.045],h,26,t.ink,true);
      const content=this.scroll(p,'RegionViewport_'+col,[.065+col*.30,.30,.27,.50],lists[col].length*78);
      lists[col].forEach((region,i)=>{
        const row=new Node('Region_'+region.code);content.addChild(row);row.setPosition(0,-42-i*78);transform(row,186,72);
        drawRoundRect(row,186,70,12,selected[col]===region.code?t.accent:t.card,t.edge,1);
        const label=text(row,region.name,[-.5,-.5,1,1],70,25,selected[col]===region.code?t.onAccent:t.ink);label.node.setPosition(0,0);transform(label.node,174,62);
        row.on(Node.EventType.TOUCH_END,()=>{const next=selected.slice(0,col);next[col]=region.code;this.dismissPlayerMenu('RegionOverlay');this.showRegionPicker(next)});
      });
    });
    text(p,regionPath(all,selected).map(n=>n.name).join(' · ')||'请选择所在地',[.07,.825,.86,.04],h,22,t.muted);
    const back=()=>{this.dismissPlayerMenu('RegionOverlay');this.showPlayerProfile()};
    this.referenceButton(p,'Button_取消','取消',[.07,.91,.39,.065],back);
    this.referenceButton(p,'Button_保存地区','保存地区',[.53,.91,.40,.065],()=>{
      if(selected.length!==3){this.showToast('请完整选择省、市、区县',t.accent);return}
      this.playerService!.setRegion(selected);back();this.showToast('地区已保存',t.success);
    });
    hit(p,'MenuClose',[0,0,.18,.13],h,back);
  }
}
