'use strict';

const guideNodeIds=phases.flatMap((phase,p)=>phase.map((_,i)=>mechanicId(p,i)));
let guidePhase=0,guideIndex=0,guideSeat=0,guideWorkId=null;
let docView='guide',traitGroup='all',selectedTrait=null;
const traitIsActive=entry=>Object.hasOwn(activeTraitEffects,entry.name);
const orderedTraits=[...traitCatalog].sort((a,b)=>Number(traitIsActive(b))-Number(traitIsActive(a)));

function resetGuide(){guidePhase=0;guideIndex=0;guideSeat=0;guideWorkId=null;docView='guide';updateDocView();resetGuidePreview();}

function updateDocView(){
  const isGuide=docView==='guide';
  $('#doc-heading').textContent=isGuide?'炎帝陵攻略':'特质图鉴';
  $('#doc-subtitle').textContent=isGuide?'Doc / 选择副本':'Doc / 队员资料';
  $('#guide-head-actions').hidden=!isGuide;
  $('#doc-guide').hidden=!isGuide;
  $('#doc-traits').hidden=isGuide;
  for(const button of $$('[data-doc-view]'))button.setAttribute('aria-pressed',String(button.dataset.docView===docView));
}
for(const button of $$('[data-doc-view]'))button.onclick=()=>{
  if(docView===button.dataset.docView)return;
  docView=button.dataset.docView;
  updateDocView();$('.guide').scrollTop=0;
  if(docView==='guide')drawGuide();
  else {resetGuidePreview();drawTraitCatalog();}
};

function renderTraitDetail(entry){
  const article=$('#trait-detail');article.replaceChildren();
  article.dataset.group=entry?.group??'';
  if(!entry){element(article,'p','没有匹配的特质。');return;}
  const header=element(article,'header',null),title=element(header,'div',null);
  element(title,'small',traitCatalogGroups[entry.group],'trait-kind');
  element(title,'h3',entry.name);
  const active=traitIsActive(entry);
  const tag=element(header,'span',active?'已生效':'效果待接入','trait-status');
  tag.dataset.live=String(active);
  element(article,'h4',active?'当前效果':'设计效果');
  element(article,'p',activeTraitEffects[entry.name]??entry.effect,'trait-effect');
  element(article,'h4',entry.tradeoff?'可利用的场景':'使用建议');
  element(article,'p',entry.hint,'trait-hint');
}

function drawTraitCatalog(){
  const query=$('#trait-search').value.trim().toLowerCase();
  const onlyActive=$('#trait-active-only').checked;
  const results=orderedTraits.filter(entry=>(traitGroup==='all'||entry.group===traitGroup)&&(!onlyActive||traitIsActive(entry))&&
    `${entry.name} ${activeTraitEffects[entry.name]??entry.effect} ${entry.hint}`.toLowerCase().includes(query));
  const entry=results.find(item=>item.id===selectedTrait)??results[0];
  selectedTrait=entry?.id??null;
  for(const button of $$('[data-trait-group]'))button.setAttribute('aria-pressed',String(button.dataset.traitGroup===traitGroup));
  $('#trait-count').textContent=`显示 ${results.length} / ${traitCatalog.length} 项`;
  const list=$('#trait-list');list.replaceChildren();list.scrollTop=0;
  for(const item of results){
    const row=element(list,'li',null);
    const button=element(row,'button',null);button.type='button';
    button.dataset.traitId=item.id;button.dataset.group=item.group;
    button.setAttribute('aria-pressed',String(item.id===selectedTrait));
    element(button,'strong',item.name);
    element(button,'small',traitIsActive(item)?'已生效':traitCatalogGroups[item.group]);
    button.onclick=()=>{
      selectedTrait=item.id;
      for(const option of list.querySelectorAll('button'))option.setAttribute('aria-pressed',String(option===button));
      renderTraitDetail(item);
    };
  }
  renderTraitDetail(entry);
}
for(const button of $$('[data-trait-group]'))button.onclick=()=>{traitGroup=button.dataset.traitGroup;drawTraitCatalog();};
$('#trait-search').addEventListener('input',drawTraitCatalog);
$('#trait-active-only').addEventListener('change',drawTraitCatalog);

function visibleDiscovery(id){
  if(raidPlayback.active){
    const steps=campaign.last?.steps??[];
    const index=steps.findIndex(step=>mechanicId(step.p,step.i)===id);
    if(index>raidPlayback.index&&steps[index].discovery)return steps[index].discovery.before;
  }
  return campaign.discovery[id]??null;
}

function guideTitle(key,p){return jobs[key][0]+(key==='nails'?` · ${p===0?4:8} 根`:'');}
function guideButton(parent,label,attribute,value,pressed,select){
  const button=element(parent,'button',label);
  button.type='button';button.dataset[attribute]=value;
  button.setAttribute('aria-pressed',String(pressed));
  button.onclick=()=>{select();refreshGuideFocus(button);};
  return button;
}
function refreshGuideFocus(previous=document.activeElement){
  const guide=$('.guide');
  const keyed=guide.contains(previous)&&Object.entries(previous.dataset).find(([key])=>key.startsWith('guide'));
  drawGuide();
  if(keyed)$$('.guide button').find(button=>button.dataset[keyed[0]]===keyed[1])?.focus({preventScroll:true});
}
function refreshOpenGuide(){if(docView==='guide'&&appWindows.has('doc')&&!appWindows.get('doc').hidden)refreshGuideFocus();}

function drawGuide(){
  if(docView!=='guide')return;
  const tabs=$('#guide-tabs'),rows=$('#guide-rows'),team=lineup();
  tabs.replaceChildren();rows.replaceChildren();
  $('#guide-revision').textContent=`攻略修订 ${campaign.revision}`;
  $('#guide-count').textContent=`已遇见 ${guideNodeIds.filter(id=>visibleDiscovery(id)!==null).length}/${guideNodeIds.length}`;
  phases.forEach((phase,p)=>{
    const discovered=phase.filter((_,i)=>visibleDiscovery(mechanicId(p,i))!==null).length;
    const tab=guideButton(tabs,`P${p+1}`,'guidePhase',p,p===guidePhase,()=>{guidePhase=p;guideIndex=0;guideWorkId=null;});
    element(tab,'small',`${discovered}/${phase.length}`);
  });
  phases[guidePhase].forEach((key,i)=>{
    const progress=visibleDiscovery(mechanicId(guidePhase,i));
    const item=element(rows,'li',null);item.dataset.known=String(progress!==null);
    const button=guideButton(item,null,'guideNode',i,i===guideIndex,()=>{guideIndex=i;guideWorkId=null;});
    element(button,'span',String(i+1).padStart(2,'0'),'guide-order');
    element(button,'b',progress===null?'未知机制':guideTitle(key,guidePhase));
    element(button,'small',progress===null?'—':`${progress}%`);
  });

  const key=phases[guidePhase][guideIndex],id=mechanicId(guidePhase,guideIndex),progress=visibleDiscovery(id);
  const known=progress!==null, canAssign=progress>=30, canSeeStat=progress>=60, canSeeTarget=progress>=90;
  const works=canAssign?assignments(guidePhase,guideIndex):[];
  const work=works.find(item=>item.id===guideWorkId)??works[0];
  guideWorkId=work?.id??null;
  $('#guide-position').textContent=`P${guidePhase+1} / 第 ${guideIndex+1} 项`;
  $('#guide-mechanic').textContent=known?guideTitle(key,guidePhase):'未知机制';
  $('#guide-percent').textContent=known?`${progress}%`:'—';
  $('#guide-progress').value=progress??0;
  $$('#guide-unlocks li').forEach(mark=>{mark.dataset.ready=String(progress>=Number(mark.dataset.unlock));});
  $('#guide-brief').textContent=known?jobs[key][5]:'';
  $('#guide-empty').textContent=known?'':'进入战斗遇见此机制后，解锁演示';
  $('#guide-empty').hidden=known;
  $('#guide-transport').hidden=!known;
  setGuidePreview(known?{key,id,p:guidePhase}:null);

  const duties=$('#guide-work');duties.replaceChildren();
  if(canAssign){
    const heading=element(duties,'header',null);
    element(heading,'h4','机制分工');
    const defaults=guideButton(heading,'恢复推荐','guideDefaults','yes',false,()=>{
      works.forEach(item=>delete campaign.plan[item.id]);campaign.revision++;persistCrystal();
    });
    defaults.removeAttribute('aria-pressed');
    defaults.disabled=!works.some(item=>Object.hasOwn(campaign.plan,item.id));
    for(const item of works){
      const button=guideButton(duties,null,'guideWork',item.id,item===work,()=>{guideWorkId=item.id;guideSeat=item.slot;});
      element(button,'strong',item.task);
      element(button,'span',seats[item.slot].role+' '+(team[item.slot]?displayName(team[item.slot]):'空缺'));
    }
    if(new Set(works.map(item=>item.slot)).size<works.length)element(duties,'p','同窗兼任 · 每项冲突使动作率降低 8 个百分点','guide-warning');
    const previous=guideIndex>0&&visibleDiscovery(mechanicId(guidePhase,guideIndex-1))>=30?assignments(guidePhase,guideIndex-1)[0].slot:null;
    if(previous===works[0].slot)element(duties,'p','连续主责 · 动作率降低 6 个百分点','guide-warning');
  }else element(duties,'p',known?'探明度达到 30% 后可安排分工。目前从符合职责的席位中随机选人。':'初见时记录为 0%。再次打到这里时，由全队资质、应变和存活时长决定成长。','guide-note');

  const seatGrid=$('#guide-seats');seatGrid.replaceChildren();
  team.forEach((member,seat)=>{
    const button=guideButton(seatGrid,null,'guideSeat',seat,seat===guideSeat,()=>{guideSeat=seat;});
    const title=element(button,'span',null,'guide-seat-title');
    chip(title,seats[seat].role);element(title,'b',member?displayName(member):'空缺');
    if(canSeeStat){
      const check=primaryCheck(guidePhase,key,seat,progress);
      element(button,'small',recruitAttributes[check.stat]+(canSeeTarget?` ${check.target}`:''));
    }
    if(work?.slot===seat)button.dataset.assigned='true';
  });

  const member=team[guideSeat],profile=$('#guide-member');profile.replaceChildren();
  const title=element(profile,'header',null);
  element(title,'strong',seats[guideSeat].role+' '+(member?displayName(member):'空缺'));
  if(member)element(title,'small','基础 / 当前发挥');
  if(member){
    const check=canSeeStat?primaryCheck(guidePhase,key,guideSeat,progress):null;
    const stats=element(profile,'dl',null,'guide-stats');
    for(const [stat,label] of Object.entries(recruitAttributes)){
      const row=element(stats,'div',null);row.dataset.primary=String(check?.stat===stat);
      element(row,'dt',label);
      const base=baseFieldStat(member,guideSeat,stat);
      element(row,'dd',String(base));
      element(row,'dd',stat==='aptitude'?'—':String(Math.round(fieldStat(member,guideSeat,stat))));
    }
    if(check&&canSeeTarget){
      const effective=fieldStat(member,guideSeat,check.stat);
      const line=element(profile,'p',`主考 ${recruitAttributes[check.stat]} ${check.target}${progress===100?`（原 ${check.original}）`:''} · ${effective>=check.target?'达到要求':'低于要求'}`,'guide-target');
      line.dataset.met=String(effective>=check.target);
    }
  }else element(profile,'p','可在 QO 安排该席位的首发。','guide-note');
  if(work){
    if(canSeeStat)element(profile,'p',`${work.task}考察${recruitAttributes[work.stat]}${canSeeTarget?` ${workRequirement(guidePhase,progress)}`:''}。`,'guide-note');
    const allowed=work.allowed.includes(guideSeat);
    const button=guideButton(profile,work.slot===guideSeat?'当前负责人':allowed?'指定为负责人':'该席位无法负责此项','guideAssign','yes',false,()=>{
      campaign.plan[work.id]=guideSeat;campaign.revision++;persistCrystal();toast('分工已更新，下一把生效。');
    });
    button.removeAttribute('aria-pressed');
    button.disabled=work.slot===guideSeat||!allowed||!member;
  }
}

// The diagram is a schematic of the selected mechanic, independent of the live combat camera.
const guideCanvas=$('#guide-arena'),guideCtx=guideCanvas.getContext('2d');
const reducedGuideMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const guidePositions=[[200,53],[162,70],[157,146],[243,146],[169,113],[231,113],[113,150],[287,150]];
const guideScenes={
  blast:['首领抬手','近身范围击退','全队退到外圈'],
  roar:['治疗被点名','热风周期扩散','被点者远离人群'],
  cone:['首领朝向一仇','正面扇形扫过','双坦交接，队伍避开正面'],
  charge:['首领到达场边','直线冲锋','八席分散躲避冲锋线'],
  nails:['火狱之楔出现','输出按分组集火','错开击破后抬血'],
  inferno:['首领腾空','全场火焰落地','坦疗覆盖伤害'],
  lava:['非一仇队员被点名','脚下地火喷发','将预警带到队伍外侧'],
  pillars:['地面出现多处预警','炎柱同时爆发','从预警之间穿过'],
  chain:['一仇与输出连线','连线距离影响层数','连线双方靠近处理'],
  end:['确认首领残余血量','全队交出最后爆发','狂暴结算'],
};
let guidePreview=null,guideFrame=0,guideElapsed=0,guideDrawnAt=null,guideBeat=-1,guidePaused=false;

function resetGuidePreview(){
  cancelAnimationFrame(guideFrame);guideFrame=0;guidePreview=null;guideDrawnAt=null;guideBeat=-1;
}
function setGuidePreview(next){
  if(next?.id!==guidePreview?.id||guideBeat===-1){
    resetGuidePreview();guidePreview=next;guideElapsed=0;guidePaused=reducedGuideMotion.matches;
    paintGuideArena(next,0);
  }
  if(next&&!guidePaused&&!guideFrame)guideFrame=requestAnimationFrame(animateGuide);
}
function animateGuide(now){
  guideFrame=0;
  if(!guidePreview||guidePaused||!guideCanvas.getClientRects().length){guideDrawnAt=null;return;}
  if(guideDrawnAt===null)guideDrawnAt=now;
  if(now-guideDrawnAt>=32){
    guideElapsed=(guideElapsed+Math.min(100,now-guideDrawnAt))%6000;
    guideDrawnAt=now;paintGuideArena(guidePreview,guideElapsed);
  }
  guideFrame=requestAnimationFrame(animateGuide);
}
$('#guide-animate').onclick=()=>{
  guidePaused=!guidePaused;guideDrawnAt=null;
  $('#guide-animate').textContent=guidePaused?'播放':'暂停';
  if(!guidePaused&&!guideFrame)guideFrame=requestAnimationFrame(animateGuide);
};
reducedGuideMotion.addEventListener('change',event=>{
  if(event.matches&&!guidePaused&&guidePreview)$('#guide-animate').click();
});

function paintGuideArena(preview,elapsed){
  const ctx=guideCtx,beat=Math.floor(elapsed/2000),pulse=(elapsed%2000)/2000;
  const polygon=(points,fill,stroke)=>{
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(Math.round(x),Math.round(y)):ctx.moveTo(Math.round(x),Math.round(y)));ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}
  };
  const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);};
  const octagon=(x,y,r)=>[[x-r*.42,y-r],[x+r*.42,y-r],[x+r,y-r*.42],[x+r,y+r*.42],[x+r*.42,y+r],[x-r*.42,y+r],[x-r,y+r*.42],[x-r,y-r*.42]];
  const arena=[[78,20],[322,20],[353,51],[353,169],[322,200],[78,200],[47,169],[47,51]];
  rect(0,0,400,220,'#201e2e');polygon(arena,'#2c2b3e',preview?'#a78077':'#565365');
  ctx.save();ctx.clip();
  for(let x=48;x<354;x+=16)rect(x,20,1,181,'#3c384c');
  for(let y=24;y<200;y+=16)rect(45,y,310,1,'#3c384c');
  rect(199,20,2,180,'#50475c');rect(47,109,306,1,'#50475c');
  const danger=beat===1?'#9a493e':'#603c46',edge=beat===1?'#f4ad77':'#bb785f';
  const zone=(x,y,r)=>polygon(octagon(x,y,r),danger,edge);
  const party=guidePositions.map(point=>point.slice());
  const move=(seat,x,y)=>{
    const point=party[seat],amount=beat===0?pulse*.4:beat===1?.4+pulse*.6:1;
    point[0]+=(x-point[0])*amount;point[1]+=(y-point[1])*amount;
  };
  const key=preview?.key;
  if(key==='blast'){
    zone(200,101,beat===1?52+pulse*9:48);
    for(const [i,[x,y]] of guidePositions.entries())move(i,200+(x-200)*1.6,105+(y-105)*1.5);
  }
  if(key==='roar'){move(2,84,74);zone(...party[2],beat===1?34+10*pulse:29);}
  if(key==='cone'){
    const surge=beat===1&&(pulse*(preview.p+1))%1<.65;
    polygon([[198,101],[277,28],[127,28]],surge?'#9a493e':'#603c46',surge?'#f4ad77':'#bb785f');
    move(0,144,63);move(1,208,51);
  }
  if(key==='charge'){
    polygon([[48,83],[352,83],[352,122],[48,122]],danger,edge);
    move(4,126,65);move(5,268,63);
  }
  if(key==='nails'){
    const nails=[[98,65],[302,65],[98,159],[302,159],[112,108],[288,108],[200,50],[200,162]].slice(0,preview.p===0?4:8);
    nails.forEach(([x,y],i)=>{
      if(beat===2&&i<Math.floor(pulse*nails.length+1))zone(x,y,16);
      else polygon([[x,y-11],[x+6,y],[x,y+8],[x-6,y]],'#c37b9a','#ffd0a0');
    });
    for(let i=4;i<8;i++){const [x,y]=nails[i-4];move(i,x+(x<200?20:-20),y+13);}
  }
  if(key==='inferno'||key==='end')polygon(arena,danger,edge);
  if(key==='lava'){move(7,321,152);zone(...party[7],beat===1?22+pulse*6:19);}
  if(key==='pillars'){
    [[125,63],[223,61],[295,113],[131,154],[208,157]].forEach(([x,y])=>zone(x,y,beat===1?24:20));
    move(2,166,155);move(3,258,150);move(6,92,123);move(7,277,161);
  }
  if(key==='chain'){
    move(7,222,67);ctx.beginPath();ctx.moveTo(...party[0]);ctx.lineTo(...party[7]);ctx.strokeStyle=edge;ctx.lineWidth=2;ctx.stroke();ctx.lineWidth=1;
  }
  if(preview&&key!=='nails'){
    const x=key==='charge'?(beat===0?56:beat===1?56+pulse*288:344):200;
    const y=key==='inferno'&&beat===0?67:101;
    polygon([[x-23,y+4],[x-12,y-7],[x+3,y-8],[x+9,y-13],[x+17,y-13],[x+23,y-5],[x+18,y+8],[x-11,y+8]],'#e27d68','#2a2131');
    rect(x+14,y-8,3,2,'#ffe3a7');
  }
  if(preview)party.forEach(([x,y],i)=>{
    const color=i<2?'#aebbea':i<4?'#a6d0ab':'#f0b697';
    rect(x-4,y-5,8,10,'#231f30');rect(x-3,y-4,6,7,color);
    ctx.fillStyle='#f6e6cb';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText(seats[i].role,Math.round(x),Math.round(y+14));
  });
  ctx.restore();
  if(preview&&guideBeat!==beat){
    guideBeat=beat;$('#guide-beat').textContent=`${beat+1} / 3 · ${guideScenes[key][beat]}`;
    $('#guide-animate').textContent=guidePaused?'播放':'暂停';
  }
}
