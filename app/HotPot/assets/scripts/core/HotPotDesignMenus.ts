import {Label,Node,sys} from 'cc';
import {getPageTheme,PageStyle,PAGE_THEMES} from '../data/PageTheme';
import {regionPath} from '../data/PlayerData';
import {achievementEntries} from '../data/CollectionData';
import {INGREDIENTS} from '../data/GameConfig';
import {HotPotReferenceShell} from './HotPotReferenceShell';
import {designButton,designFooter,designHeader,designHit,designIcon,designImage,designNode,designOnBackground,designOverlay,designScroll,designSurface,designText,fitDesignPage} from './HotPotDesignUi';

export abstract class HotPotDesignMenus extends HotPotReferenceShell {
  private designOriginalStyle:PageStyle|null=null;

  protected designStats():{total:number,daily:number,runs:string[],date:string} {
    const date=this.playerService?.state.playDate||'';
    let stats={total:0,daily:0,runs:[] as string[],date};
    try{const saved=JSON.parse(sys.localStorage.getItem('hotpot.reference.stats.v1')||'null');if(saved&&Number.isFinite(saved.total))stats={...stats,...saved}}catch{}
    if(stats.date!==date){stats.daily=0;stats.date=date}return stats;
  }
  protected recordDesignWin():void {
    const stats=this.designStats(),key=this.runId||stats.date+':'+this.levelIndex+':'+this.levelData.layoutSeed;
    if(stats.runs.includes(key))return;stats.total++;stats.daily++;stats.runs=[...stats.runs,key].slice(-100);
    try{sys.localStorage.setItem('hotpot.reference.stats.v1',JSON.stringify(stats))}catch{}
  }
  protected designPage(name:string,title:string,back:()=>void):Node|null {
    if(!this.playerService||!this.levelData||this.hasPlayerMenu()||(this.locked&&!this.gameEnded))return null;
    const {panel}=designOverlay(this.node,name,this.viewportHeight);designHeader(panel,title);
    designHit(designNode(panel,'HeaderBack',[22,204,132,88]),back);
    if(name!=='PlayerOverlay')designHit(designNode(panel,'HeaderSettings',[566,204,132,88]),()=>{this.dismissPlayerMenu(name);this.showPlayerProfile()});
    fitDesignPage(panel);
    return panel;
  }
  /** Rare cloud-choice dialogs use the same safe canvas as the normal pages. */
  protected makePlayerMenu(name:string,height:number):Node|null {
    if(!this.playerService||!this.levelData||this.hasPlayerMenu()||(this.locked&&!this.gameEnded))return null;
    const {panel}=designOverlay(this.node,name,this.viewportHeight,true);
    const actual=Math.min(1100,Math.max(520,height));
    designSurface(designNode(panel,'CloudDialogBody',[56,(1280-actual)/2,608,actual]));
    designButton(panel,'MenuClose','×',[580,(1280-actual)/2+16,64,64],()=>this.dismissPlayerMenu(name),true);
    return panel;
  }
  protected showPlayerProfile():void {
    const close=()=>this.dismissPlayerMenu('PlayerOverlay'),p=this.designPage('PlayerOverlay','我的小馆',close);if(!p)return;
    const service=this.playerService!,state=service.state,t=getPageTheme();void service.refreshRuntimeConfig();
    const address=regionPath(service.regions,state.profile.regionCodes).map(r=>r.name).join(' · ')||'尚未选择地区';
    const card=designNode(p,'ProfileCard',[40,290,640,184]);designSurface(card);
    const avatar=designNode(card,'Avatar',[30,44,96,96]);designSurface(avatar,t.panel,48,t.edge,false);this.addIngredientImage(avatar,'toufu',false,82,82);
    designText(card,service.playerId?'玩家 '+service.playerId.slice(0,8):'本机玩家',[146,20,456,52],34,t.ink,true,true);
    designText(card,address,[146,76,456,60],24,t.muted,false,true);
    designText(card,'一锅烟火，收藏日常好滋味',[146,138,456,30],23,t.muted,false,true);
    const stats=designNode(p,'ProfileStats',[40,494,640,124]);designSurface(stats);
    const open=(action:()=>void)=>{close();action()};
    const values=[String(this.designStats().total),state.progress.discovered.length+' / '+INGREDIENTS.length,String(achievementEntries(state).filter(a=>a.unlocked).length)];
    ['累计通关','食材发现','已获成就'].forEach((caption,i)=>{
      designText(stats,values[i],[i*213+8,12,197,54],38,t.accent,true);
      designText(stats,caption,[i*213+8,70,197,38],23,t.muted);
    });
    const entries:Array<[string,string,string,()=>void]>=[['trophy','我的成就','Button_我的成就',()=>this.showCollection('achievements')],['rank','地域榜单','Button_地域排行榜',()=>this.showRegionPicker([],true)],['pin','所在地选择','Button_选择地区',()=>this.showRegionPicker([])],['palette','页面换肤','Button_页面风格',()=>this.showPageStyles()]];
    entries.forEach(([icon,caption,name,action],i)=>{
      const row=designNode(p,name,[40,638+i*78,640,68]);designSurface(row);designHit(row,()=>open(action));
      const circle=designNode(row,'IconCircle',[28,6,56,56]);designSurface(circle,t.panel,28,'',false);designIcon(circle,icon,[10,10,36,36]);
      designText(row,caption,[116,2,420,64],30,t.ink,true,true);designIcon(row,'arrow',[584,21,26,26],t.muted);
    });
    const club=designNode(p,'Button_游戏圈',[40,950,640,68]);designSurface(club);
    designHit(club,()=>{void this.openGameClub()});
    const clubIcon=designNode(club,'IconCircle',[28,6,56,56]);designSurface(clubIcon,t.panel,28,'',false);
    designIcon(clubIcon,'community',[10,10,36,36]);
    designText(club,'游戏圈',[116,2,420,64],30,t.ink,true,true);
    designIcon(club,'arrow',[584,21,26,26],t.muted);
    this.playerStatusLabel=designText(p,service.statusText,[50,1024,440,80],20,designOnBackground(),false,true);
    designButton(p,'Button_重试同步','重试同步',[502,1038,168,56],()=>{void this.retryPlayerCloud()},true);
    designFooter(p,'←  返回游戏',close,'Button_继续游戏',true);
  }
  protected showPageStyles():void {
    const p=this.designPage('StyleOverlay','页面换肤',()=>this.cancelPageStyle());if(!p)return;
    if(this.designOriginalStyle===null)this.designOriginalStyle=getPageTheme().id;
    const t=getPageTheme();
    PAGE_THEMES.forEach((theme,i)=>{
      const selected=theme.id===t.id,card=designNode(p,'PageStyle_'+theme.id,[40+(i%2)*330,290+Math.floor(i/2)*346,310,324]);
      designSurface(card,undefined,undefined,selected?t.accent:t.edge);
      // Selection is a real label above the card, never baked into its texture.
      designText(card,theme.name,[16,14,276,40],27,t.ink,true,true);
      designImage(card,'StyleThumbnail','reference/shell-0'+theme.id,[87,62,136,242]);
      for(let n=0;n<6;n++){
        const icon=designNode(card,'ThumbnailIngredient',[99+n%3*34,145+Math.floor(n/3)*34,30,30]);
        this.addIngredientImage(icon,['beef','shrimp','corn','mushroom','toufu','vegetable'][n] as any,false,30,30);
      }
      if(selected){const mark=designNode(card,'SelectedMark',[254,8,46,46]);designSurface(mark,t.accent,23,t.card,false);designText(mark,'✓',[0,0,46,46],28,t.onAccent,true)}
      designHit(card,()=>{this.previewPageStyle(theme.id);this.dismissPlayerMenu('StyleOverlay');this.showPageStyles()});
    });
    designText(p,'点击预览风格，确认后应用',[80,990,560,52],24,designOnBackground());
    designButton(p,'Button_返回','←  返回',[52,1124,298,80],()=>this.cancelPageStyle(),true);
    designButton(p,'Button_应用所选风格','✓  使用此款',[370,1124,298,80],()=>{
      this.selectPageStyle(getPageTheme().id);this.designOriginalStyle=null;this.dismissPlayerMenu('StyleOverlay');this.showPlayerProfile();
    });
  }
  protected discardPageStylePreview():void {
    if(this.designOriginalStyle!==null)this.previewPageStyle(this.designOriginalStyle);this.designOriginalStyle=null;
  }
  protected cancelPageStyle():void {
    this.discardPageStylePreview();this.dismissPlayerMenu('StyleOverlay');this.showPlayerProfile();
  }
  protected showDesignRanking(scope=0):void {
    const service=this.playerService!,t=getPageTheme(),selected=service.state.profile.regionCodes;
    const province=service.regions.find(region=>region.code===selected[0]);
    const city=province?.children?.find(region=>region.code===selected[1]);
    const available=[true,!!province?.children?.length,!!city?.children?.length];
    if(!available[scope])scope=0;
    const back=()=>{this.dismissPlayerMenu('RegionOverlay');this.showPlayerProfile()},p=this.designPage('RegionOverlay','地域榜单',back);if(!p)return;
    const tabs=designNode(p,'RankTabs',[40,290,640,82]);designSurface(tabs,t.panel);
    ['全国','省内','市内'].forEach((caption,i)=>designButton(tabs,'RankScope_'+i,caption,[8+i*210,8,204,66],()=>{
      this.dismissPlayerMenu('RegionOverlay');this.showDesignRanking(i);
    },scope!==i,!available[i]));
    designText(p,'第三关通关次数 · 为家乡添一席',[50,382,450,34],24,designOnBackground());
    designButton(p,'Button_重试榜单','重试同步',[510,372,160,38],()=>{
      void this.retryPlayerCloud().then(()=>{if(p.isValid)render()});
    },true);
    const status=designText(p,service.leaderboardText,[50,414,620,28],18,designOnBackground());
    const regions=scope===0?service.regions:scope===1?province!.children!:city!.children!;
    const table=designNode(p,'RankingRows',[40,450,640,492]);designSurface(table);
    designText(table,'排名',[12,10,96,48],25,t.ink,true);
    designText(table,'地区',[112,10,278,48],25,t.ink,true);
    designText(table,'通关次数',[398,10,228,48],25,t.ink,true);
    const self=designNode(p,'MyRegionRank',[40,962,640,138]);designSurface(self,t.panel,undefined,t.accent);
    designText(self,'我的家乡',[20,8,310,36],24,t.accent,true,true);
    const ownName=designText(self,'',[20,65,280,48],30,t.ink,true,true);
    const ownRank=designText(self,'',[330,8,290,36],24,t.accent,true);
    const ownCount=designText(self,'',[334,65,284,48],30,t.accent,true);
    const render=()=>{
      if(!table.isValid)return;
      const previous=table.getChildByName('RankingViewport');previous?.removeFromParent();previous?.destroy();
      status.string=service.leaderboardText;
      const rows=service.sortedRegions(regions).filter(r=>service.regionCount(r.code)>0);
      const {content}=designScroll(table,'RankingViewport',[8,62,624,422],Math.max(422,rows.length*70));
      if(!rows.length){
        const empty=designNode(content,'EmptyRanking',[0,0,624,422]);
        designIcon(empty,'rank',[268,60,88,88]);
        designText(empty,'暂无地区成绩',[50,190,524,60],32,t.ink,true);
        designText(empty,'完成第三关，为家乡添一席。',[40,266,544,64],25,t.muted);
      }
      rows.forEach((region,i)=>{
        const row=designNode(content,'RankRow_'+region.code,[0,i*70,624,64]);designSurface(row,t.card,12,t.line,false);
        const colors=['#D4A438','#AAB9B9','#BD8553'];
        const medal=designNode(row,'RankMedal',[26,8,48,48]);
        if(i<3)designSurface(medal,colors[i],24,t.edge,false);
        designText(medal,String(i+1),[0,0,48,48],28,i<3?'#FFFFFF':t.ink,true);
        designText(row,region.name,[114,6,278,52],28,t.ink,true,true);
        designText(row,service.regionCount(region.code).toLocaleString()+' 次',[398,6,218,52],28,t.accent,true);
      });
      const own=selected[scope],rank=rows.findIndex(region=>region.code===own);
      ownName.string=regions.find(region=>region.code===own)?.name||'尚未选择地区';
      ownRank.string=rank<0?'未上榜':'第 '+(rank+1)+' 名';
      ownCount.string=(own?service.regionCount(own):0).toLocaleString()+' 次';
    };render();void service.refreshLeaderboard().then(render).catch(()=>{});
    designFooter(p,'返回',back);
  }
}
