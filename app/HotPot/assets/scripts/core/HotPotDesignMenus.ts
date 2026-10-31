import {Label,Node,sys} from 'cc';
import {getPageTheme,PageStyle,PAGE_THEMES} from '../data/PageTheme';
import {regionPath} from '../data/PlayerData';
import {achievementEntries} from '../data/CollectionData';
import {HotPotReferenceShell} from './HotPotReferenceShell';
import {designButton,designFooter,designHeader,designHit,designIcon,designImage,designNode,designOnBackground,designOverlay,designSurface,designText} from './HotPotDesignUi';

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
    const {panel}=designOverlay(this.node,name,this.viewportHeight);designHeader(panel,title,back);return panel;
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
    designText(card,'本机玩家',[146,20,456,52],34,t.ink,true,true);
    designText(card,address,[146,76,456,60],24,t.muted,false,true);
    designText(card,'一锅烟火，收藏日常好滋味',[146,138,456,30],23,t.muted,false,true);
    const stats=designNode(p,'ProfileStats',[40,494,640,124]);designSurface(stats);
    const open=(action:()=>void)=>{close();action()};
    const values=[String(this.designStats().total),state.progress.discovered.length+' / 50',String(achievementEntries(state).filter(a=>a.unlocked).length)];
    ['累计通关','食材发现','已获成就'].forEach((caption,i)=>{
      designText(stats,values[i],[i*213+8,12,197,54],38,t.accent,true);
      designText(stats,caption,[i*213+8,70,197,38],23,t.muted);
    });
    const entries:Array<[string,string,string,()=>void]>=[['book','食材图鉴','Button_食材图鉴',()=>this.showCollection()],['trophy','我的成就','Button_我的成就',()=>this.showCollection('achievements')],['rank','地域榜单','Button_地域排行榜',()=>this.showRegionPicker([],true)],['pin','所在地选择','Button_选择地区',()=>this.showRegionPicker([])],['palette','页面换肤','Button_页面风格',()=>this.showPageStyles()]];
    entries.forEach(([icon,caption,name,action],i)=>{
      const row=designNode(p,name,[40,638+i*78,640,68]);designSurface(row);designHit(row,()=>open(action));
      const circle=designNode(row,'IconCircle',[28,6,56,56]);designSurface(circle,t.panel,28,'',false);designIcon(circle,icon,[10,10,36,36]);
      designText(row,caption,[116,2,420,64],30,t.ink,true,true);designIcon(row,'arrow',[584,21,26,26],t.muted);
    });
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
      designText(card,(theme.id<10?'0':'')+theme.id+' · '+theme.name,[16,14,276,40],27,t.ink,true,true);
      designImage(card,'StyleThumbnail','reference/shell-0'+theme.id,[87,62,136,242]);
      for(let n=0;n<6;n++){
        const icon=designNode(card,'ThumbnailIngredient',[99+n%3*34,145+Math.floor(n/3)*34,30,30]);
        this.addIngredientImage(icon,['beef','shrimp','corn','mushroom','toufu','vegetable'][n] as any,false,30,30);
      }
      if(selected){const mark=designNode(card,'SelectedMark',[254,8,46,46]);designSurface(mark,t.accent,23,t.card,false);designText(mark,'✓',[0,0,46,46],28,t.onAccent,true)}
      designHit(card,()=>{this.previewPageStyle(theme.id);this.dismissPlayerMenu('StyleOverlay');this.showPageStyles()});
    });
    designText(p,'点击预览风格，确认后应用',[80,990,560,52],24,designOnBackground());
    designButton(p,'Button_取消换肤','取消',[52,1124,298,80],()=>this.cancelPageStyle(),true);
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
    const back=()=>{this.dismissPlayerMenu('RegionOverlay');this.showPlayerProfile()},p=this.designPage('RegionOverlay','地域榜单',back);if(!p)return;
    const service=this.playerService!,t=getPageTheme(),selected=service.state.profile.regionCodes;
    const tabs=designNode(p,'RankTabs',[40,290,640,82]);designSurface(tabs,t.panel);
    ['全国','省内','市内'].forEach((caption,i)=>designButton(tabs,'RankScope_'+i,caption,[8+i*210,8,204,66],()=>{
      if(i>0&&!selected[i-1]){this.showToast('请先选择所在地',t.accent);return}
      this.dismissPlayerMenu('RegionOverlay');this.showDesignRanking(i);
    },scope!==i));
    designText(p,'第三关通关次数 · 为家乡添一席',[60,392,600,40],24,designOnBackground());
    let regions=service.regions;
    if(scope>0){regions=regions.find(n=>n.code===selected[0])?.children||[];if(scope>1)regions=regions.find(n=>n.code===selected[1])?.children||[]}
    const content=designNode(p,'RankingRows',[40,450,640,660]);
    const render=()=>{
      if(!content.isValid)return;for(const child of content.children.slice()){child.removeFromParent();child.destroy()}
      const rows=service.sortedRegions(regions).filter(r=>service.regionCount(r.code)>0);
      if(!rows.length){
        const empty=designNode(content,'EmptyRanking',[0,0,640,640]);designSurface(empty);
        const circle=designNode(empty,'EmptyIcon',[240,74,160,160]);designSurface(circle,t.panel,80,'',false);designIcon(circle,'rank',[36,36,88,88]);
        designText(empty,'榜单还在等第一锅',[50,268,540,60],34,t.ink,true);
        designText(empty,'完成第三关，\n为家乡点亮第一份成绩。',[50,346,540,106],26,t.muted);
        designButton(empty,'Button_回去开锅','回去开锅',[42,508,556,80],()=>this.dismissPlayerMenu('RegionOverlay'));return;
      }
      rows.slice(0,3).forEach((region,i)=>{
        const row=designNode(content,'RankRow_'+region.code,[0,i*165,640,147]);designSurface(row);
        designText(row,String(i+1),[20,45,44,48],32,t.accent,true);
        const avatar=designNode(row,'Avatar',[80,32,82,82]);designSurface(avatar,t.panel,41,t.edge,false);this.addIngredientImage(avatar,['beef','shrimp','corn'][i] as any,false,70,70);
        designText(row,region.name,[184,24,280,56],32,t.ink,true,true);
        designText(row,['全国榜','省内榜','市内榜'][scope],[184,82,280,35],23,t.muted,false,true);
        designText(row,service.regionCount(region.code)+' 次',[476,44,146,58],30,t.accent,true);
      });
      const own=selected[scope],rank=rows.findIndex(r=>r.code===own),self=designNode(content,'MyRegionRank',[0,530,640,130]);designSurface(self,t.panel);
      designText(self,'我的家乡',[24,14,300,35],23,t.muted,false,true);
      designText(self,rank<0?'未上榜':'第 '+(rank+1)+' 名',[414,14,200,35],23,t.muted);
      designText(self,regions.find(r=>r.code===own)?.name||'尚未选择地区',[24,62,390,46],29,t.ink,true,true);
      designText(self,(own?service.regionCount(own):0)+' 次',[440,62,170,46],29,t.accent,true);
    };render();void service.refreshLeaderboard().then(render).catch(()=>{});
    designFooter(p,'返回我的',back);
  }
}
