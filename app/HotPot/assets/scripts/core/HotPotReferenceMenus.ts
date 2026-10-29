import {Label,Node,sys,Vec3} from 'cc';
import {REFERENCE_CLEAN_STYLES,REFERENCE_PATCH_COLORS} from '../data/ReferenceAssets';
import {PageStyle,getPageTheme} from '../data/PageTheme';
import {regionPath} from '../data/PlayerData';
import {achievementEntries} from '../data/CollectionData';
import {HotPotReferenceShell} from './HotPotReferenceShell';
import {ArtPage,Box,art,blendField,fullOverlay,hit,patch,text} from './HotPotReferenceArt';
import {drawRoundRect,hex,transform} from './HotPotUi';

/** Full-page compositions are taken from the approved art, not recolored dialogs. */
export abstract class HotPotReferenceMenus extends HotPotReferenceShell {
  private referenceOriginalStyle:PageStyle|null=null;
  private referenceTime=Date.now();

  protected referenceStats():{total:number,daily:number,hours:string,runs:string[],date:string,milliseconds:number}{
    const date=this.playerService?.state.playDate||'';
    let stats:any={total:0,daily:0,milliseconds:0,runs:[],date};
    try{const saved=JSON.parse(sys.localStorage.getItem('hotpot.reference.stats.v1')||'null');if(saved&&Number.isFinite(saved.total))stats={...stats,...saved}}catch{}
    if(stats.date!==date){stats.daily=0;stats.date=date}
    stats.milliseconds+=Math.max(0,Date.now()-this.referenceTime);this.referenceTime=Date.now();
    stats.hours=(stats.milliseconds/3600000).toFixed(1)+'小时';
    try{sys.localStorage.setItem('hotpot.reference.stats.v1',JSON.stringify(stats))}catch{}
    return stats;
  }

  protected recordReferenceWin():void{
    const stats=this.referenceStats(),run=this.runId||stats.date+':'+this.levelIndex+':'+this.levelData.layoutSeed;
    if(stats.runs.includes(run))return;
    stats.total++;stats.daily++;stats.runs=[...stats.runs,run].slice(-100);
    try{sys.localStorage.setItem('hotpot.reference.stats.v1',JSON.stringify(stats))}catch{}
  }

  protected referencePage(name:string,page:ArtPage):Node|null{
    if(!this.playerService||!this.levelData||this.hasPlayerMenu()||(this.locked&&!this.gameEnded))return null;
    const {panel}=fullOverlay(this.node,name,this.viewportHeight);
    art(panel,page,[0,0,1,1],this.viewportHeight);
    return panel;
  }

  /** Match the photographed paper/lacquer under each live data field. */
  protected referenceField(panel:Node,page:ArtPage,box:Box,value:string,size=28,dark=false):Label{
    const id=getPageTheme().id;
    const paper:Box=page==='profile'&&id===1&&dark?[.86,.32,.035,.024]
      :page==='profile'&&id===8?[.15,.25,.025,.025]
      :page==='profile'&&id===9?[.15,.43,.04,.02]
      :page==='profile'&&id===4?[.16,.40,.04,.025]
      :[.85,.40,.035,.022];
    // Runtime uses a data-cleared version of this exact illustration.
    if(!REFERENCE_CLEAN_STYLES.includes(id)){
      const point:Box=page==='profile'?(id===1&&dark?[.87,.30,.001,.001]:id===8?[.85,.25,.001,.001]:[.43,.44,.001,.001]):[.67,.39,.001,.001];
      const colors=REFERENCE_PATCH_COLORS[id+'-'+page+'-'+box.map(v=>v.toFixed(4)).join(',')];
      if(colors)blendField(panel,box,this.viewportHeight,colors);else patch(panel,page,box,this.viewportHeight,point);
    }
    const label=text(panel,value,box,this.viewportHeight,size,dark?'#FFF0D6':getPageTheme().ink,true);
    if(!dark&&/^[0-9/.]+$/.test(value)&&size>=29)label.color=hex(id===4?getPageTheme().success:getPageTheme().accent);
    label.node.name='LiveData_'+value;return label;
  }

  protected showPlayerProfile():void{
    const p=this.referencePage('PlayerOverlay','profile');if(!p)return;
    const id=getPageTheme().id,h=this.viewportHeight,state=this.playerService!.state;
    const address=regionPath(this.playerService!.regions,state.profile.regionCodes).map(n=>n.name).join(' · ')||'尚未选择地区';
    const complete=state.progress.completedLevels.length,found=state.progress.discovered.length;
    const stats=this.referenceStats();
    const achieved=achievementEntries(state).filter(a=>a.unlocked).length;
    const open=(action:()=>void)=>{this.dismissPlayerMenu('PlayerOverlay');action()};
    const buttons:Record<PageStyle,Box[]>={
      1:[[.08,.51,.40,.18],[.52,.51,.40,.18],[.08,.70,.40,.18],[.52,.70,.40,.18]],
      4:[[.07,.51,.86,.10],[.07,.62,.86,.10],[.07,.73,.86,.10],[.07,.83,.86,.10]],
      8:[[.06,.43,.44,.20],[.52,.43,.44,.20],[.06,.65,.44,.20],[.52,.65,.44,.20]],
      9:[[.06,.53,.88,.075],[.06,.61,.88,.075],[.06,.69,.88,.075],[.06,.77,.88,.075]],
    };
    const actions=[()=>this.showCollection(),()=>this.showCollection('achievements'),()=>this.showRegionPicker([]),()=>this.showPageStyles()];
    const names=['Button_食材图鉴','Button_我的成就','Button_选择地区','Button_页面风格'];
    buttons[id].forEach((box,i)=>hit(p,names[i],box,h,()=>open(actions[i])));
    // Each reference has its own arrangement and live profile summary.
    if(id===1){
      this.referenceField(p,'profile',[.40,.266,.39,.055],'本机玩家',29,true);
      this.referenceField(p,'profile',[.40,.326,.39,.045],address,22,true);
      this.referenceField(p,'profile',[.24,.435,.15,.04],String(stats.total),34);
      this.referenceField(p,'profile',[.58,.435,.21,.04],found+'/50',32);
      hit(p,'Button_声音',[.27,.89,.50,.08],h,()=>this.toggleSound());
    }else if(id===4){
      this.referenceField(p,'profile',[.25,.447,.09,.036],String(this.levelIndex+1),30);
      this.referenceField(p,'profile',[.65,.447,.09,.036],String(stats.daily),30);
    }else if(id===8){
      this.referenceField(p,'profile',[.28,.244,.45,.035],'本机玩家',29);
      this.referenceField(p,'profile',[.20,.28,.65,.027],address,20);
      this.referenceField(p,'profile',[.17,.35,.25,.04],complete+' 关',29);
      this.referenceField(p,'profile',[.58,.35,.29,.04],stats.hours,29);
    }else{
      this.referenceField(p,'profile',[.22,.367,.56,.027],address,20);
      this.referenceField(p,'profile',[.10,.437,.25,.032],String(stats.total),30);
      this.referenceField(p,'profile',[.39,.437,.25,.032],String(found),30);
      this.referenceField(p,'profile',[.68,.437,.25,.032],String(achieved),30);
      hit(p,'Button_云存档',[.18,.87,.65,.07],h,()=>{void this.playerService!.flush().then(()=>this.showToast(this.playerService!.statusText,'#477345'))});
    }
    hit(p,'MenuClose',[0,0,.19,.13],h,()=>this.dismissPlayerMenu('PlayerOverlay'));
    hit(p,'Button_继续游戏',[.05,.92,.9,.075],h,()=>this.dismissPlayerMenu('PlayerOverlay'));
    // The leaderboard remains directly reachable without altering the art cards.
    const statsBox:Box=id===1?[.08,.39,.84,.11]:id===4?[.10,.41,.79,.09]:id===8?[.13,.32,.74,.08]:[.06,.41,.88,.10];
    hit(p,'Button_地域排行榜',statsBox,h,()=>open(()=>this.showRegionPicker([],true)));
  }

  protected showPageStyles():void{
    const p=this.referencePage('StyleOverlay','picker');if(!p)return;
    if(this.referenceOriginalStyle===null)this.referenceOriginalStyle=getPageTheme().id;
    const id=getPageTheme().id,h=this.viewportHeight;
    const top=id===8?.105:id===1?.25:id===4?.225:.21;
    const cardH=id===8?.345:id===1?.255:id===4?.27:.28;
    [1,4,8,9].forEach((value,i)=>hit(p,'PageStyle_'+value,
      [.045+(i%2)*.49,top+Math.floor(i/2)*(cardH+.028),.445,cardH],h,()=>{
        this.previewPageStyle(value as PageStyle);this.dismissPlayerMenu('StyleOverlay');this.showPageStyles();
      }));
    const apply:Box=id===1?[.10,.85,.80,.10]:id===4?[.08,.845,.84,.075]:id===8?[.08,.86,.84,.105]:[.54,.83,.42,.08];
    hit(p,'Button_应用所选风格',apply,h,()=>{
      this.selectPageStyle(getPageTheme().id);this.referenceOriginalStyle=null;
      this.dismissPlayerMenu('StyleOverlay');this.showPlayerProfile();
    });
    hit(p,'MenuClose',[0,0,.20,.13],h,()=>this.cancelPageStyle());
    if(id===4)hit(p,'Button_返回我的',[.16,.94,.68,.055],h,()=>this.cancelPageStyle());
  }

  protected cancelPageStyle():void{
    this.discardPageStylePreview();this.dismissPlayerMenu('StyleOverlay');this.showPlayerProfile();
  }

  protected discardPageStylePreview():void{
    if(this.referenceOriginalStyle!==null)this.previewPageStyle(this.referenceOriginalStyle);
    this.referenceOriginalStyle=null;
  }

  protected showReferenceRanking(scope=0):void{
    const p=this.referencePage('RegionOverlay','rank');if(!p)return;
    const service=this.playerService!,h=this.viewportHeight,id=getPageTheme().id;
    const selected=service.state.profile.regionCodes;
    let regions=service.regions;
    if(scope>0){const province=regions.find(n=>n.code===selected[0]);regions=province?.children||[];if(scope>1)regions=regions.find(n=>n.code===selected[1])?.children||[]}
    const ys=id===1?[.350,.463,.576]:id===4?[.340,.475,.612]:id===8?[.357,.506,.656]:[.338,.497,.656];
    const labels:Array<{name:Label,count:Label}>=[];
    for(let i=0;i<3;i++){
      const name=this.referenceField(p,'rank',[id===4?.46:.35,ys[i],id===4?.34:.40,.038],'',27);
      const count=this.referenceField(p,'rank',[id===4?.64:.77,ys[i]+(id===9?0:id===4?.032:.040),.14,.035],'',28);
      labels.push({name,count});
      if(id===1)this.referenceField(p,'rank',[.35,ys[i]+.038,.30,.035],['全国榜','省内榜','市内榜'][scope],18);
    }
    const own=selected[scope]||selected[selected.length-1];
    const selfRank=text(p,'—',[.065,id===1?.888:id===4?.824:id===8?.835:.802,.14,.06],h,31);
    const ownCount=this.referenceField(p,'rank',[id===4?.64:.77,id===1?.897:id===4?.842:id===8?.852:.802,.14,.04],'',27);
    if(id===8)patch(p,'rank',[.055,.832,.16,.062],h,[.67,.91,.001,.001]);
    if(id===1)patch(p,'rank',[.055,.888,.16,.06],h,[.10,.95,.001,.001]);
    selfRank.node.setSiblingIndex(p.children.length-1);
    if(id!==9){
      this.referenceField(p,'rank',[id===4?.46:.29,id===1?.862:id===4?.81:.825,.43,.04],'本机玩家',24);
      this.referenceField(p,'rank',[id===4?.46:.29,id===1?.917:id===4?.867:.878,.43,.035],addressOf(service.regions,selected),19);
    }else{
      patch(p,'rank',[.35,.68,.30,.038],h,[.60,.74,.001,.001]);
      text(p,'地域通关',[.35,.68,.30,.038],h,21,getPageTheme().muted);
    }
    const extra:Array<{name:Label,count:Label}>=[];
    if(id===1){
      patch(p,'rank',[.22,.667,.74,.143],h,[.72,.74,.001,.001]);
      for(let i=0;i<3;i++)extra.push({name:text(p,'',[.22,.671+i*.046,.49,.034],h,22,'#FFF0D6'),count:text(p,'',[.80,.671+i*.046,.14,.034],h,22,'#FFF0D6')});
    }
    const render=()=>{
      const rows=service.sortedRegions(regions);
      [...labels,...extra].forEach((pair,i)=>{pair.name.string=rows[i]?.name||'暂无地区';pair.count.string=rows[i]?String(service.regionCount(rows[i].code)):'0'});
      const place=rows.findIndex(n=>n.code===own);selfRank.string=place<0?'—':String(place+1);
      ownCount.string=String(own?service.regionCount(own):0);
    };
    render();
    const tabY=id===1?.253:id===4?.232:id===8?.252:.220;
    const tabH=.06,tabW=.30,firstX=id===1?.065:.045;
    ['全国','省内','市内'].forEach((name,i)=>{
      const box:Box=[firstX+i*.31,tabY,tabW,tabH];
      const tab=hit(p,'RankScope_'+i,box,h,()=>{
        if(i>0&&!selected[i-1]){this.showToast('请先选择所在地','#A3613B');return}
        this.dismissPlayerMenu('RegionOverlay');this.showReferenceRanking(i);
      });
      if(scope===0)return;
      const sourceX=firstX+(i===scope?0:.31);
      art(tab,'rank',[-.5,-.5,1,1],tabH*h,id,[sourceX,tabY,tabW,tabH]);
      art(tab,'rank',[-.36,-.3,.72,.60],tabH*h,id,[sourceX+.025,tabY+.025,.001,.001]);
      text(tab,name,[-.45,-.4,.90,.80],tabH*h,28,i===scope?getPageTheme().onAccent:getPageTheme().ink,true);
    });
    hit(p,'MenuClose',[0,0,.18,.12],h,()=>{this.dismissPlayerMenu('RegionOverlay');this.showPlayerProfile()});
    void service.refreshLeaderboard().then(()=>{if(p.isValid)render()});
  }
}

function addressOf(regions:any[],codes:string[]):string{
  return regionPath(regions,codes).map(n=>n.name).join(' · ')||'未选择地区';
}
