'use strict';

const jobs = {
  blast: ['火神爆裂','近身撤离口令',6,[0,1,4,5,6,7],'reaction','退到外圈，确认击退落点。'],
  roar: ['灼热咆哮／热风','治疗交接',2,[2,3],'coordination','被点者隔离热风，另一治疗接管团血。'],
  cone: ['烈焰焚烧','换坦与面向',1,[0,1],'execution','确认一仇后交接，保持扇形向外。'],
  charge: ['深红旋风','观察冲锋起点',6,[0,1,2,3,4,5,6,7],'reaction','首领离场。报出来向，八席分散躲开路径。'],
  nails: ['火狱之楔','分组集火与停手',5,[4,5,6,7],'technique','首领离场。先分配目标，再错开击破团伤。'],
  inferno: ['地狱之火炎','安排全队减伤',3,[0,1,2,3],'coordination','按残留楔数预留护盾与恢复。'],
  lava: ['地火喷发','引导落点',7,[1,2,3,4,5,6,7],'reaction','随机非一仇成员带出预警。'],
  pillars: ['光辉炎柱','确认安全路线',4,[0,1,2,3,4,5,6,7],'execution','观察火柱空隙，保持安全通道。'],
  chain: ['火狱之锁','连线距离报点',0,[0,1,4,5,6,7],'coordination','一仇与点名输出协调距离，减少持续伤害。'],
  end: ['地狱之火炎（狂暴）','最后爆发口令',4,[4,5,6,7],'technique','截止前统一爆发，检查剩余生命。'],
};
const phases = [
  ['blast','roar','cone','charge','nails','inferno'],
  ['roar','lava','pillars','chain','cone','blast','charge','nails','inferno'],
  ['lava','roar','chain','pillars','cone','blast','end'],
];
// Work keys are stable across saves; phase/occurrence distinguish repeated casts.
const supportingJobs={
  blast:[['确认落点',1,[0,1,4,5],'execution']],
  roar:[['引导安全走位',6,[4,5,6,7],'reaction']],
  cone:[['补外部减伤',3,[2,3],'coordination']],
  charge:[['确认冲锋结束',7,[4,5,6,7],'execution']],
  nails:[['先遣组转火',4,[4,5,6,7],'technique'],['第二组停手',7,[4,5,6,7],'execution'],['引爆后抬血',2,[2,3],'reaction']],
  inferno:[['全屏伤害后恢复',2,[2,3],'reaction']],
  lava:[['指出备用路线',6,[4,5,6,7],'coordination']],
  pillars:[['报安全集合点',6,[0,1,2,3,4,5,6,7],'reaction']],
  chain:[['连线持续伤害照顾',3,[2,3],'reaction']],
  end:[['集中资源转火',5,[4,5,6,7],'technique']],
};
function mechanicId(p,i){return `${p}-${i}`;}
function assignments(p,i,randomize=false){
  const key=phases[p][i],base=jobs[key],works=[[base[1],base[2],base[3],base[4]],...supportingJobs[key]];
  return works.map(([task,recommended,allowed,stat],n)=>{
    const id=mechanicId(p,i)+(n?'#'+n:'');
    const unlocked=(campaign.discovery[mechanicId(p,i)]??0)>=30;
    const slot=unlocked?(campaign.plan[id]??recommended):randomize?allowed[Math.floor(combatRandom()*allowed.length)]:null;
    return {id,task,allowed,stat,slot};
  });
}
function newCampaign() {
  return { plan:{},discovery:{},gil:0,revision:1,attempts:0,minutes:0,best:0,clear:false,mastery:{},last:null,seed:Math.floor(Math.random()*4294967296) };
}
let campaign = newCampaign();
let feedFrame=null, broadcastReady=false;
const raidPlayback = {active:false,index:-1,timer:null};
const eventStepMs=950;
const preparationSeconds=120, maximumPullMinutes=20;
const combatStepWeight=(key,p)=>key==='roar'?20:key==='cone'?6+2*p:key==='end'?0:12;
// Spread the combat checks over 18 game minutes without changing how many attacks each check covers.
const timelineWeight=(key,p)=>key==='end'?8:combatStepWeight(key,p);
const totalTimelineWeight=phases.reduce((total,phase,p)=>total+phase.reduce((sum,key)=>sum+timelineWeight(key,p),0),0);
const timelineSeconds=weight=>Math.round(weight*(maximumPullMinutes*60-preparationSeconds)/totalTimelineWeight);

function sessionForToday(){return campaign.session?.day===calendar.day?campaign.session:null;}
function ensureRaidSession(){
  return sessionForToday()??(campaign.session={day:calendar.day,end:appointmentEnd,originalEnd:appointmentEnd,elapsed:0,nextDecision:120,decision:false,ended:false});
}
function sharedAttendanceEnd(){
  const team=lineup();
  return daySlots.find(hour=>hour>=calendar.hour&&!team.every(member=>available(member,hour)))??recruitEndHours.at(-1);
}
function remainingRaidMinutes(){
  const end=Math.min(sessionForToday()?.end??appointmentEnd,sharedAttendanceEnd());
  return Math.max(0,(end-calendar.hour)*60-campaign.minutes);
}
function raidClockLabel(){
  const minutes=calendar.hour*60+campaign.minutes,h=Math.floor(minutes/60);
  return `第 ${calendar.day} 天 · ${activityTime(h).slice(0,-2)}${String(minutes%60).padStart(2,'0')}`;
}
function appendCookEvent(text, time=raidClockLabel()){
  const log=$('#cook-event-feed');
  const row=element(log,'li',null);
  element(row,'time',time);
  element(row,'span',text);
  while(log.children.length>80)log.firstElementChild.remove();
  log.scrollTop=log.scrollHeight;
}
function cookClockTime(hour, elapsedSeconds=0){
  const minute=(Math.round(hour*60)+Math.floor(elapsedSeconds/60))%1440;
  return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
}
function resetCookPlayback(){
  clearTimeout(raidPlayback.timer);raidPlayback.active=false;raidPlayback.index=-1;
  clearTimeout(revealTimer);resolveQueue.length=0;
  if(showingResolve)$('#resolve-film').close();
  showingResolve=false;
  $('#cook-event-feed').replaceChildren();element($('#cook-event-feed'),'li','队伍准备中。');
  feedFrame?.remove();feedFrame=null;broadcastReady=false;
  $('#stream-offline').hidden=false;
}
function advanceRaidMinutes(minutes){
  const session=sessionForToday();
  session.elapsed+=minutes;
  const elapsed=campaign.minutes+minutes;
  if(elapsed>=120)advanceCalendar('wait',undefined,true);
  campaign.minutes=elapsed%120;
  if(calendar.day!==session.day||calendar.finished){
    session.ended=true;session.decision=false;
    if(!raidPlayback.active)appendCookEvent('达到 02:00 的活动截止，本晚已收队。','02:00');
    return;
  }
  if(campaign.minutes>0)updateRecruitments();
  if(session.elapsed>=session.nextDecision || remainingRaidMinutes()<maximumPullMinutes)session.decision=true;
}
function canUseRaidBreak(minutes){
  const session=sessionForToday();
  return !session?.ended&&!campaign.clear&&!raidPlayback.active&&!showingResolve&&duringAppointment()&&
    remainingRaidMinutes()>=minutes&&lineup().every(gameOnline);
}
function canReviewPull(){
  const log=campaign.last;
  if(!log||log.clear||log.reviewed)return false;
  const day=Number.isFinite(log.started)?Math.floor((log.started-10)/24)+1:sessionForToday()?.day;
  return day===calendar.day&&canUseRaidBreak(5);
}
function canDelayShift(){
  const session=sessionForToday();
  return Boolean(session&&session.end<sharedAttendanceEnd());
}
function refreshCookControls(){
  const session=sessionForToday();
  const panel=$('#cook-shift');
  panel.hidden=!(session?.decision&&!session.ended&&!campaign.clear&&!raidPlayback.active);
  $('#cook-shift-note').textContent=session
    ?`已用 ${session.elapsed} 分钟 · 原预约至 ${windowEndText(session.originalEnd)} · 当前预约至 ${windowEndText(session.end)}`:'';
  $('[data-shift=delay]').disabled=!canDelayShift();
  $('[data-shift=normal]').textContent=remainingRaidMinutes()<maximumPullMinutes?'按计划收队':'按计划继续';
  $('#cook-stop').hidden=!session||session.ended||campaign.clear||Boolean(session.decision);
  $('#cook-stop').disabled=raidPlayback.active||showingResolve;
  $('#cook-skip').hidden=!raidPlayback.active;
  $('#cook-review').disabled=!canReviewPull();
  $('#cook-short-rest').disabled=!canUseRaidBreak(shortRestMinutes);
  $('#stream-start-raid').disabled=Boolean(challengeBlock())||showingResolve;
}
function finishShift(message){
  const session=sessionForToday();
  if(!session||session.ended||raidPlayback.active)return;
  session.ended=true;session.decision=false;
  appendCookEvent(message);notifyResult('战报','本次开荒收队',message);
  const team=lineup().filter(Boolean);
  teamDialogue([[team[0],'辛苦了，我先下了。'],[team[2],'下次先进语音，把今天卡的那段再顺一下。']]);
  renderCalendar();drawVoice();persistCrystal();
}
for(const button of $$('[data-shift]'))button.onclick=()=>{
  const session=sessionForToday(),choice=button.dataset.shift;
  if(!session?.decision||session.ended||raidPlayback.active||showingResolve)return;
  if(choice==='early'){finishShift('经理决定提前收队。');return;}
  if(choice==='normal'&&remainingRaidMinutes()<maximumPullMinutes){
    const remaining=remainingRaidMinutes();
    const byAttendance=sharedAttendanceEnd()<session.end;
    if(remaining)advanceRaidMinutes(remaining);
    if(!session.ended)finishShift(byAttendance?'全队共同出勤时间已结束，队伍收队。':'已到约定时间，八席按计划收队。');
    else {renderCalendar();drawVoice();persistCrystal();}
    return;
  }
  if(choice==='delay'){
    if(!canDelayShift())return;
    session.end+=2;
    appendCookEvent('八席档期已确认，延后至 '+windowEndText(session.end)+' 收队。');
  }else appendCookEvent('按当前预约继续开荒。');
  session.decision=false;
  while(session.nextDecision<=session.elapsed)session.nextDecision+=120;
  renderCalendar();drawVoice();persistCrystal();
};
$('#cook-stop').onclick=()=>finishShift('经理决定在本把结算后收队。');
$('#cook-review').onclick=()=>{
  const log=campaign.last;
  if(!canReviewPull())return;
  ensureRaidSession();
  const failed=log.steps.at(-1),members=lineup().filter(gameOnline),at=campaignHour()+5/60;
  log.reviewed=true;
  const improvement=[];
  for(const member of members){
    const page=campaign.mastery[member.name]??={};
    const entry=page[failed.key]??={s:20,m:0,o:15};
    improvement.push(Math.min(8,100-entry.m));
    entry.m=Math.min(100,entry.m+8);
    changePressure(member,3,at);
  }
  advanceRaidMinutes(5);
  appendCookEvent(`复盘 ${failed.title} · 5 分钟 · 在场 ${members.length} 人机制熟练度 +8、压力 +3。`);
  notifyResult('战报',`复盘 · ${failed.title}`,`5 分钟 · 在场 ${members.length} 人 · 机制熟练度 +${effectRange(improvement)} · 压力 +3`,at);
  teamDialogue([[members[log.steps.at(-1).slot],'我看明白刚才为什么乱了。下把按复盘说的来。']],at);
  renderCalendar();drawVoice();showRaidBroadcast();persistCrystal();
};
function combatRandom() {
  campaign.seed=(Math.imul(1664525,campaign.seed)+1013904223)>>>0;
  return campaign.seed/4294967296;
}
function rollCombat(){return Math.floor(combatRandom()*100);}
const veteranStats=[[78,76,73,68],[76,77,70,66],[77,72,76,66],[74,68,72,64],[71,60,65,83],[74,67,73,77],[80,79,73,74],[73,70,64,80]];
function baseFieldStat(member,seat,key) {
  const column={execution:0,coordination:1,reaction:2,technique:3}[key];
  return member[key]??(key==='aptitude'?70:veteranStats[seat][column]);
}
function fieldStat(member,seat,key) {return baseFieldStat(member,seat,key)*battleFactor(member);}

// MT, ST, H1/H2, D1/D2, D3/D4. Later phases raise the baseline by two points per phase.
const primaryChecks={
  blast: [['execution',70],['reaction',68],['reaction',68],['reaction',74],['execution',66]],
  roar: [['execution',68],['coordination',68],['coordination',76],['execution',70],['reaction',68]],
  cone: [['execution',78],['execution',74],['coordination',74],['execution',66],['execution',66]],
  charge: Array(5).fill(['reaction',70]),
  nails: [['coordination',66],['coordination',70],['reaction',72],['technique',76],['technique',76]],
  inferno: [['coordination',76],['coordination',74],['coordination',76],['execution',66],['execution',66]],
  lava: [['execution',68],['reaction',70],['reaction',72],['reaction',72],['reaction',74]],
  pillars: [['execution',70],['execution',70],['execution',72],['execution',74],['execution',72]],
  chain: [['coordination',76],['execution',68],['reaction',72],['coordination',74],['coordination',74]],
  end: Array(5).fill(['technique',72]),
};
function lowerRequirement(target,progress){return progress===100?target*8/10:target;}
function primaryCheck(p,key,seat,progress){
  const [stat,base]=primaryChecks[key][[0,1,2,2,3,3,4,4][seat]];
  const original=base+p*2;
  return {stat,original,target:lowerRequirement(original,progress)};
}
function workRequirement(p,progress){return lowerRequirement(70+p*2,progress);}
function discoveryLearningFactor(team){
  const learning=team.reduce((total,member,seat)=>total+
    .7*baseFieldStat(member,seat,'aptitude')+.3*baseFieldStat(member,seat,'reaction'),0)/team.length;
  return Math.max(.75,Math.min(1.25,1+(learning-64)/125));
}
function discoveryBaseGain(progress){
  if(progress<30)return 16-(16-5.3)*progress/30;
  if(progress<60)return 5.3-(progress-30)*.055;
  return 3.65-(progress-60)*.025;
}
function recordDiscovery(p,i,survivalFraction,learningFactor){
  const id=mechanicId(p,i),before=campaign.discovery[id]??null;
  const gain=before===null?0:discoveryBaseGain(before)*survivalFraction*learningFactor;
  const after=Math.min(100,Math.round(((before??0)+gain)*100)/100);
  campaign.discovery[id]=after;
  return {before,after};
}

function resolveCampaignPull(){
  if(challengeBlock())return;
  showApp('cook');
  ensureRaidSession();
  raidPlayback.active=true;raidPlayback.index=-1;
  const team=lineup(), beforeChecks=pressureChecks.length;
  const learningFactor=discoveryLearningFactor(team);
  const log={number:++campaign.attempts,revision:campaign.revision,names:team.map(m=>m.name),steps:[],clear:false,
    partyStart:team.map(member=>({pressure:pressureOf(member).value,energy:energyOf(member)}))};
  let hp=100, residual=0, lastOwner=-1, strain=0;
  let partyHp=Array(8).fill(100), combatSeconds=0, progressWeight=0;
  let attackClock=0;
  const clampQ=v=>Math.min(98,Math.max(12,Math.round(v)));
  outer: for(const [p,phase] of phases.entries())for(const [i,key] of phase.entries()){
    const [title,task]=jobs[key],works=assignments(p,i,true),slot=works[0].slot,person=team[slot];
    const progress=campaign.discovery[mechanicId(p,i)]??0;
    const unavailable=key==='charge'||key==='nails'||key==='inferno';
    const seconds=timelineSeconds(progressWeight+timelineWeight(key,p))-timelineSeconds(progressWeight);
    progressWeight+=timelineWeight(key,p);
    attackClock=unavailable?0:attackClock+combatStepWeight(key,p);
    const autos=Math.floor(attackClock/4);attackClock%=4;
    const practice=team.map(m=>{
      const page=campaign.mastery[m.name]??={};
      return page[key]??={s:20,m:0,o:15};
    });
    const caller=works.reduce((sum,w,index)=>{
      const worker=team[w.slot],partner=team[works[index===0?1:0].slot];
      const owned=pressureOf(worker).traits;
      let rating=fieldStat(worker,w.slot,w.stat);
      if(w.stat==='coordination'&&owned.includes('交接迟疑')&&affinity(worker,partner)<50)rating*=.65;
      if(index>0&&w.stat==='execution'&&owned.includes('下意识沉默'))rating*=1.15;
      return sum+rating;
    },0)/works.length;
    const conflicts=works.length-new Set(works.map(w=>w.slot)).size;
    const traits=pressureOf(person).traits;
    const traitBonus=(traits.includes('读秒专注')?18:0)-(traits.includes('下意识沉默')?22:0);
    const teamMargin=team.reduce((sum,m,j)=>{
      const {stat,target}=primaryCheck(p,key,j,progress);
      return sum+fieldStat(m,j,stat)-target;
    },0)/8;
    const coordination=clampQ(80+.65*(caller-workRequirement(p,progress))+.16*teamMargin+.22*practice[slot].m-2*p-(lastOwner===slot?6:0)-8*conflicts+traitBonus);
    const roll=rollCombat(), correct=roll<coordination;
    const chargeHits=[];
    if(key==='charge')for(let j=0;j<8;j++){
      const {stat,target}=primaryCheck(p,key,j,progress);
      const dodge=clampQ(82+.42*(fieldStat(team[j],j,stat)-target)+.2*practice[j].m+(correct?5:-5));
      if(rollCombat()>=dodge) chargeHits.push(j);
    }
    if(key==='nails'){
      const count=p===0?4:8;
      residual=Math.max(0,Math.ceil(count*(1-(caller+practice[slot].o*.25+(correct?16:0))/lowerRequirement(90+p*5,progress))));
    }
    const defense=team.slice(0,4).reduce((sum,m,j)=>sum+fieldStat(m,j,'coordination')+.42*practice[j].s,0)/4;
    const loss=chargeHits.length;
    const survival=clampQ(97+.28*(defense-lowerRequirement(74,progress))-p-(correct?0:8)-loss*3-(key==='inferno'?residual*8:0)-strain-autos*.5);
    const defenseRoll=rollCombat();
    const fatal=key!=='end' && defenseRoll>=survival && (key==='inferno'||loss>=3||strain>=4);
    const success=correct&&defenseRoll<survival;
    const output=team.slice(4).reduce((sum,m,j)=>sum+fieldStat(m,j+4,'technique')*(.88+.0012*practice[j+4].o),0)/4;
    if(!unavailable && key!=='end') hp-=Math.max(0,output/75*(correct?6.95:5.40));
    if(key==='end') hp-=output/75*(correct?4:2);
    const exposure=practice.map((_,j)=>fatal?(j===slot?.48:.76):chargeHits.includes(j)?.72:1);
    combatSeconds+=fatal?Math.round(seconds*Math.max(...exposure)):seconds;
    const survivedSeconds=exposure.map(fraction=>seconds*fraction);
    const survivalFraction=seconds?survivedSeconds.reduce((sum,value)=>sum+value,0)/(team.length*seconds):1;
    const discovery=recordDiscovery(p,i,survivalFraction,learningFactor);
    practice.forEach((m,j)=>{
      const aptitude=team[j].aptitude??70;
      const coaching=success&&traits.includes('带练耐心')&&j===works[1].slot&&j!==slot&&m.m<50?1.6:1;
      for(const axis of ['s','m','o']){
        const base=axis==='m'?8:axis==='s'&&j<4||axis==='o'&&j>=4?7:5;
        m[axis]=Math.min(100,m[axis]+Math.max(1,Math.round(base*coaching*(.55+aptitude*.009)*exposure[j]*(1-m[axis]/125))));
      }
    });
    strain=success?Math.max(0,strain-1):Math.min(7,strain+2);
    lastOwner=slot;
    const partyHit=partyHp.map((previous,seat)=>{
      if(fatal||(key==='end'&&hp>0))return 0;
      const incoming=(seat===0?autos*3:0)+(chargeHits.includes(seat)?32:0)+(key==='inferno'?21+residual*9:2)+(!correct?9+(seat===slot?10:0):0);
      return Math.max(1,previous-incoming);
    });
    const healing=defenseRoll<survival?10:3;
    partyHp=partyHit.map(value=>value===0?0:Math.min(100,value+healing));
    const step={p,i,key,title,slot,task,work:works.map(w=>({slot:w.slot,task:w.task})),conflicts,autos,coordination,roll,survival,defenseRoll,correct,success,fatal,hp:Math.max(0,Math.ceil(hp)),partyHit,partyHp,seconds:combatSeconds,loss,chargeHits,residual,unavailable,discovery};
    log.steps.push(step);
    if(hp<=0){log.clear=true;break outer;}
    if(fatal||key==='end')break outer;
  }
  const final=log.steps.at(-1);
  const fresh=log.steps.length>campaign.best;
  const signature=final.p+'-'+final.key,repeated=previousWipe===signature;
  const minutes=Math.ceil((preparationSeconds+combatSeconds)/60);
  log.minutes=minutes;log.reviewed=false;
  log.started=campaignHour();
  const at=log.started+minutes/60;
  const hit=log.steps.find(s=>s.chargeHits.length);
  if(hit)combatAffinityEvent('injury',team,team[hit.chargeHits[0]],at,log);
  else if(log.steps.some(s=>!s.correct&&s.defenseRoll<s.survival))combatAffinityEvent('rescue',team,team[2],at,log);
  const ticks=Math.floor((campaign.minutes+minutes)/30)-Math.floor(campaign.minutes/30);
  if(ticks)settleRelationshipPressure(team,at-ticks/2,ticks,log);
  const unresolved=incidentParticipants(team);
  log.energyCost=pullEnergyCost(minutes);
  for(const m of team){
    energy.set(m.name,Math.max(0,energyOf(m)-log.energyCost));
    const traits=pressureOf(m).traits;
    const stress=log.clear?-20:fresh?-12:wipeStress(m,repeated);
    const overcame=traits.includes('逆风耐心')&&log.steps.some(s=>s.success&&s.p+'-'+s.key===previousWipe);
    const conflict=unresolved.includes(m.name)?incidentPullStress:0;
    changePressure(m,stress+conflict-(overcame?10:0)+(!log.clear&&!final.correct&&team[final.slot]===m&&traits.includes('害怕背锅')?22:0),at);
  }
  if(unresolved.length)log.unresolved=unresolved;
  stageBattleConversation(log,team,fresh,repeated,at);
  if(!log.clear)log.incident=rollRaidIncident(team,final,repeated,at,log);
  const title=log.clear?`第 ${log.number} 把 · 炎帝陵首通`:`第 ${log.number} 把 · P${final.p+1} ${final.title}团灭`;
  const conflictNote=unresolved.length?`\n争执未处理 · ${unresolved.join('、')}各加 ${incidentPullStress} 压力。`:'';
  const usedEnergy=effectRange(team.map((member,index)=>log.partyStart[index].energy-energyOf(member)));
  notifyResult('战报',title,`用时 ${minutes} 分钟 · 首领剩余 ${final.hp}% · 精力消耗 ${usedEnergy}${conflictNote}`,at,log);
  previousWipe=log.clear?null:signature;
  campaign.best=Math.max(campaign.best,log.steps.length);
  campaign.last=log;campaign.clear=log.clear;
  advanceRaidMinutes(minutes);
  renderCalendar();drawVoice();showRaidBroadcast();persistCrystal();
  playCookEvents(log,pressureChecks.length-beforeChecks);
}
function showRaidBroadcast(){
  const log=campaign.last;
  const live=raidPlayback.active;
  const box=$('#raid-report');box.replaceChildren();
  $('#stream-offline').hidden=live;
  if(feedFrame)feedFrame.hidden=!live;
  if(!log){
    $('#stream-stage').textContent='待开怪';
    $('#stream-overlay').textContent=`炎帝陵 · 完整一把 ${maximumPullMinutes} 分钟`;
    element(box,'p','遇见机制后，Doc 会记录该项并开始积累探明度。');return;
  }
  $('#stream-overlay').textContent='第 '+log.number+' 把 · 攻略修订 '+log.revision;
  if(live){
    const current=log.steps[raidPlayback.index];
    $('#stream-stage').textContent=current?`P${current.p+1} · ${current.title}`:'开怪准备';
    element(box,'p','本把结束后可查看完整战报。');
  }else{
    const final=log.steps.at(-1);
    $('#stream-stage').textContent=log.clear?'首通':`P${final.p+1} · ${final.title}`;
    const summary=element(box,'details',null);
    element(summary,'summary','第 '+log.number+' 把战报 · '+(log.clear?'首通':final.title)+' · 首领剩余 '+final.hp+'%'+(log.minutes?' · '+log.minutes+' 分钟':'')+(log.reviewed?' · 已复盘':''));
    for(const step of log.steps){
      const delegates=(step.work??[step]).map(w=>w.task+' '+log.names[w.slot]).join('、');
      const row=element(summary,'p','P'+(step.p+1)+' '+step.title+' ｜ '+delegates+' ｜ 动作 '+step.roll+'/'+step.coordination+' · 生存 '+step.defenseRoll+'/'+step.survival+' · 普攻 '+(step.autos??0)+' 次'+(step.key==='charge'?' · 命中 '+step.loss+' 人':'')+(step.key==='nails'?' · 残楔 '+step.residual:''));
      row.className=step.success?'passed':'missed';
    }
  }
  if(live&&!feedFrame){
    feedFrame=document.createElement('iframe');feedFrame.title='炎帝陵战斗画面';feedFrame.src='../index.html?screen';
    $('.stream-frame').prepend(feedFrame);
  }
  syncCookFrame();
}
function syncCookFrame(){
  const log=campaign.last;
  if(!broadcastReady||!feedFrame||!log)return;
  const index=raidPlayback.active?Math.max(0,raidPlayback.index):log.steps.length-1;
  feedFrame.contentWindow.postMessage({type:'crystal-replay',log,index,done:!raidPlayback.active},'*');
}
function finishCookPlayback(log,checks){
  clearTimeout(raidPlayback.timer);
  raidPlayback.active=false;
  raidPlayback.index=log.steps.length-1;
  syncCookFrame();
  appendCookEvent(log.clear?'炎帝陵已首通。':`团灭 · ${log.steps.at(-1).title} · 本把用时 ${log.minutes} 分钟。`);
  if(log.unresolved?.length)appendCookEvent(`争执未处理 · ${log.unresolved.join('、')}各增加 ${incidentPullStress} 压力。`);
  if(log.incident)appendCookEvent(`队务事件 · ${log.incident}，可在 Cook 或 QO 处理。`);
  if(checks)appendCookEvent(`触发 ${checks} 次压力检定。`);
  if(!sessionForToday()&&campaign.session?.ended)appendCookEvent('达到 02:00 的活动截止，本晚已收队。','02:00');
  if(publishRaidMessages(log))persistCrystal();
  renderCalendar();drawVoice();showRaidBroadcast();refreshOpenGuide();nextResolve();
}
function announceCookStep(log,step){
  const time=cookClockTime(log.started,preparationSeconds+step.seconds);
  const warning=step.fatal?' · 团灭':step.loss?' · '+step.loss+' 人中招':step.success?' · 顺利执行':' · 出现失误';
  const intel=step.discovery;
  const update=intel?.before===null?' · 初见，已记入 Doc':intel?.after>intel?.before?` · 探明度 ${intel.before}% → ${intel.after}%`:'';
  appendCookEvent(`P${step.p+1} ${step.title} · ${log.names[step.slot]}负责${warning}${update}`,time);
  return time;
}
function playCookEvents(log,checks){
  clearTimeout(raidPlayback.timer);
  raidPlayback.index=-1;
  const tick=()=>{
    if(!raidPlayback.active||campaign.last!==log)return;
    const step=log.steps[++raidPlayback.index];
    if(!step){finishCookPlayback(log,checks);return;}
    $('#cook-clock').textContent=`本把 · ${announceCookStep(log,step)}`;
    renderManagerClock();
    $('#stream-stage').textContent=`P${step.p+1} · ${step.title}`;
    drawCookParty();
    syncCookFrame();
    refreshOpenGuide();
    raidPlayback.timer=setTimeout(tick,eventStepMs);
  };
  appendCookEvent('第 '+log.number+' 把开怪，分工已锁定。',cookClockTime(log.started));
  tick();
}
$('#cook-skip').onclick=()=>{
  if(!raidPlayback.active)return;
  const log=campaign.last;
  for(const step of log.steps.slice(raidPlayback.index+1))announceCookStep(log,step);
  finishCookPlayback(log,resolveQueue.length);
};
window.addEventListener('message',e=>{
  if(feedFrame&&e.source===feedFrame.contentWindow&&e.data?.type==='crystal-ready'){
    broadcastReady=true;syncCookFrame();
  }
});

// All animation state lives outside the pressure model. Revealing a queued card never draws another outcome.
const resolveQueue=[];
let showingResolve=false,revealed=false,revealTimer;
function queueResolveFilm(event){
  resolveQueue.push({...event});
  if(!showingResolve)queueMicrotask(nextResolve);
}
function drawFace(event,canvas=$('#resolve-face')){
  const ctx=canvas.getContext('2d'),hash=[...event.name].reduce((n,c)=>n+c.codePointAt(0),0);
  const hair=['#504153','#51332f','#333e53','#714e48'][hash%4];
  const cloth=event.role.startsWith('H')?'#779e85':event.role.startsWith('D')?'#b66f60':'#697fba';
  const palette={'#':'#282535',h:hair,f:'#d39a81',s:'#a97570',l:'#efbc94',w:'#efe0bd',c:cloth};
  const grid=['     ######     ','   ##hhhhhh##   ','  #hhhhhhhhhh#  ','  #hhhhlhhhhh#  ',' #hhhhllllhhh#  ',' #hhfllllllhh#  ','  #fl##ll##lf#  ','  #fl#wllw#lf#  ','   #lllllsll#   ','   #fllssllf#   ','    #fllllf#    ','    ##ssss##    ','  ##ccwwwwcc##  ',' #ccccwccwcccc# ','#ccccccwwcccccc#','################'];
  ctx.clearRect(0,0,40,40);
  grid.forEach((row,y)=>[...row].forEach((value,x)=>{if(palette[value]){ctx.fillStyle=palette[value];ctx.fillRect(4+2*x,4+2*y,2,2);}}));
  ctx.fillStyle=cloth;ctx.fillRect(8+hash%5,11,5,2);
  if(['MT','ST'].includes(event.role)){
    ctx.fillStyle='#535c79';ctx.fillRect(9,8,21,4);ctx.fillStyle='#e4bf88';ctx.fillRect(15,9,8,2);
  }else if(event.role.startsWith('H')){
    ctx.fillStyle='#e1d9be';ctx.fillRect(8,10,3,12);ctx.fillRect(9,8,17,3);
    ctx.fillStyle='#88b6a3';ctx.fillRect(9,12,4,4);
  }else{ctx.fillStyle=hair;ctx.fillRect(28,12,4,11+hash%5);}
}
function nextResolve(){
  if(showingResolve||raidPlayback.active||!resolveQueue.length)return;
  const item=resolveQueue[0],dialog=$('#resolve-film');
  showingResolve=true;revealed=false;dialog.dataset.state='test';
  drawFace(item);
  interfaceNote(110,.3);
  $('#resolve-heading').textContent=item.name+'的信念正在经受考验……';
  $('#resolve-trait').textContent='';$('#resolve-change').textContent='';$('#resolve-next').textContent='揭晓';
  dialog.showModal();$('#resolve-next').focus();
  revealTimer=setTimeout(revealResolve,1200);
}
function revealResolve(){
  if(!showingResolve||revealed)return;
  clearTimeout(revealTimer);revealed=true;
  const item=resolveQueue[0],result=pressureResults[item.mood];
  $('#resolve-film').dataset.state=item.mood;
  $('#resolve-heading').textContent=result.label;
  if(item.mood==='faith'){interfaceNote(392,.34);interfaceNote(587,.46,'triangle',.12);}
  else{interfaceNote(117,.35,'sawtooth');interfaceNote(73,.4,'triangle',.09);}
  $('#resolve-trait').textContent=item.name+' 获得「'+item.trait+'」';
  if(activeTraitEffects[item.trait])element($('#resolve-trait'),'small',activeTraitEffects[item.trait]);
  $('#resolve-change').textContent='压力 '+result.reset+' · 实战属性 '+(item.mood==='faith'?'+10%':'−30%')+' · 持续两天';
  if(!item.preview){
    notifyResult('队务',`${item.name} · ${result.label}`,`${$('#resolve-change').textContent} · 获得「${item.trait}」`,item.at);
    if(playingCrystal)persistCrystal();
  }
  $('#resolve-next').textContent=resolveQueue.length>1?'下一位':'继续';
}
function advanceResolve(){
  if(!revealed){revealResolve();return;}
  clearTimeout(revealTimer);resolveQueue.shift();showingResolve=false;$('#resolve-film').close();nextResolve();refreshCookControls();renderOperations();
}
$('#resolve-next').onclick=advanceResolve;
$('#resolve-film').addEventListener('cancel',e=>{e.preventDefault();advanceResolve();});

let soundContext;
function interfaceNote(hz,length,wave='triangle',offset=0){
  if(soundContext?.state!=='running')return;
  const at=soundContext.currentTime+offset,osc=soundContext.createOscillator(),gain=soundContext.createGain();
  osc.type=wave;osc.frequency.value=hz;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.045,at+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,at+length);osc.connect(gain).connect(soundContext.destination);osc.start(at);osc.stop(at+length+.01);
}
$('#crystal-sound').onclick=async()=>{
  try{
    soundContext??=new AudioContext();
    if($('#crystal-sound').getAttribute('aria-pressed')==='true')await soundContext.suspend();else await soundContext.resume();
    const on=soundContext.state==='running';
    $('#crystal-sound').setAttribute('aria-pressed',String(on));$('#crystal-sound').textContent=on?'音效开':'音效关';
  }catch{toast('当前设备无法开启音效。');}
};
document.addEventListener('click',e=>{if(e.target.closest('button'))interfaceNote(310,.065);});
for(const button of $$('[data-film-preview]'))button.onclick=()=>{
  const mood=button.dataset.filmPreview,member=lineup()[2]??seats[2],result=pressureResults[mood];
  queueResolveFilm({name:member.name,role:member.role,mood,label:result.label,trait:result.traits[0],preview:true});
};
