'use strict';

const shortRestMinutes=10, shortRestEnergy=14, shortRestPressure=8;
const incidentPullStress=12, raidMediationMinutes=15;
const incidentRules={
  wipe:{title:'灭团后互相指责',story:'两人对刚才灭团的原因各执一词，复盘变成争论。',affinity:9,pressure:12},
  handoff:{title:'交接争吵',story:'双方都认为对方漏了口令，语音里的争论还没有结束。',affinity:10,pressure:14},
  couple:{title:'CP 当众吵了起来',story:'两人把私下的不满带进队伍，开始在群里互相指责。',affinity:10,pressure:16},
  enemy:{title:'仇人翻起旧账',story:'两人又翻起上次的争执，表示现在很难继续一起配合。',affinity:8,pressure:18},
  message:{title:'群聊里的误会',story:'一条模棱两可的回复被理解成了嘲讽，两人来找经理说明情况。',affinity:8,pressure:9},
  schedule:{title:'为排班争了起来',story:'两人对新排班的解释不同，开始质疑对方是否愿意配合。',affinity:8,pressure:10},
};

function pullEnergyCost(minutes){return 4+minutes*25/60;}
function wipeStress(member,repeated){return repeated&&!pressureOf(member).traits.includes('逆风耐心')?20:8;}

function teamIncident(){
  const record=campaign.incident;
  if(!record)return null;
  const roster=rosterMembers(),members=record.names.map(name=>roster.get(name));
  return members.every(Boolean)?{members,rule:incidentRules[record.kind]}:null;
}
function incidentParticipants(team){
  const incident=teamIncident();
  return incident?.members.every(member=>team.includes(member))?incident.members.map(member=>member.name):[];
}
const pickMember=items=>items[Math.floor(combatRandom()*items.length)];

function openTeamIncident(kind,members,at){
  const rule=incidentRules[kind],[first,second]=members;
  campaign.incident={kind,names:members.map(member=>member.name)};
  campaign.lastIncidentAttempt=campaign.attempts;
  changeAffinity(first,second,-rule.affinity);changeAffinity(second,first,-rule.affinity);
  members.forEach(member=>changePressure(member,rule.pressure,at));
  latestAffinityEvent=`${first.name}和${second.name}发生「${rule.title}」，双向好感各降 ${rule.affinity}。`;
  addMessage('team',`${latestAffinityEvent} ${rule.story} 两人各增加 ${rule.pressure} 压力。`);
  return `${rule.title} · ${first.name} / ${second.name}`;
}

function rollRaidIncident(team,final,repeated,at){
  const session=sessionForToday();
  if(session?.incidentRaised||teamIncident()||campaign.attempts<2||
    (campaign.lastIncidentAttempt!==undefined&&campaign.attempts-campaign.lastIncidentAttempt<3))return null;
  const {couples,enemies}=relationshipPairs(team);
  const hasRelatedPair=couples.length>0||enemies.length>0;
  const highPressure=team.some(member=>pressureOf(member).value>=75);
  const likelihood=.26+(repeated ? .16 : 0)+(highPressure ? .12 : 0)+(hasRelatedPair ? .12 : 0);
  if(combatRandom()>=likelihood)return null;
  if(session)session.incidentRaised=true;
  if(enemies.length&&combatRandom()<.7)return openTeamIncident('enemy',pickMember(enemies),at);
  if(couples.length&&combatRandom()<.7)return openTeamIncident('couple',pickMember(couples),at);
  const responsible=team[final.slot];
  return openTeamIncident(final.key==='chain'||final.key==='cone'?'handoff':'wipe',
    [responsible,pickMember(team.filter(member=>member!==responsible))],at);
}

function rollManagementIncident(){
  if(calendar.finished||calendar.hour<14||campaign.lastIncidentDay===calendar.day||teamIncident())return;
  const team=[...rosterMembers().values()];
  if(team.length<2)return;
  campaign.lastIncidentDay=calendar.day;
  const {couples,enemies}=relationshipPairs(team);
  if(combatRandom()>=(couples.length||enemies.length ? .5 : .32))return;
  if(enemies.length)return openTeamIncident('enemy',pickMember(enemies),campaignHour());
  if(couples.length)return openTeamIncident('couple',pickMember(couples),campaignHour());
  const first=pickMember(team), second=pickMember(team.filter(member=>member!==first));
  openTeamIncident(calendar.day<8?'message':'schedule',[first,second],campaignHour());
}

function canMediate(mode,incident=teamIncident()){
  if(!incident||calendar.finished||raidPlayback.active||showingResolve)return false;
  return mode==='raid'?canUseRaidBreak(raidMediationMinutes)&&incident.members.every(gameOnline):!calendarLocked()&&campaign.minutes===0;
}

function mediateTeamIncident(mode){
  const incident=teamIncident();
  if(!canMediate(mode,incident))return;
  const inRaid=mode==='raid',minutes=inRaid?raidMediationMinutes:120;
  const affinityRecovery=inRaid?12:15,pressureRecovery=inRaid?18:24;
  const [first,second]=incident.members;
  delete campaign.incident;
  changeAffinity(first,second,affinityRecovery);changeAffinity(second,first,affinityRecovery);
  const at=campaignHour()+minutes/60;
  for(const member of incident.members)changePressure(member,-pressureRecovery,at);
  if(inRaid){ensureRaidSession();advanceRaidMinutes(minutes);}
  else advanceCalendar('mediate');
  latestAffinityEvent=`${first.name}和${second.name}完成调解，双向好感各 +${affinityRecovery}，压力各 −${pressureRecovery}。`;
  const message=`调解用时 ${inRaid?'15 分钟':'2 小时'} · ${latestAffinityEvent}`;
  addMessage('team',message);
  appendCookEvent(message);
  renderCalendar();drawVoice();persistCrystal();
}

function restRaidTeam(){
  if(!playingCrystal){
    const message='短休 · 10 分钟';
    commandLog.unshift(message);
    appendCookEvent('指挥 · '+message);addMessage('team',`Cook 指挥：${message}。`);
    toast('已记录提示，并同步到 QO。');
    return;
  }
  if(!canUseRaidBreak(shortRestMinutes))return;
  ensureRaidSession();
  const at=campaignHour()+shortRestMinutes/60;
  for(const member of lineup().filter(gameOnline)){
    energy.set(member.name,Math.min(100,energyOf(member)+shortRestEnergy));
    changePressure(member,-shortRestPressure,at);
  }
  advanceRaidMinutes(shortRestMinutes);
  const message=`全队短休 · ${shortRestMinutes} 分钟 · 精力最多恢复 ${shortRestEnergy}，压力 −${shortRestPressure}。`;
  commandLog.unshift(message);appendCookEvent(message);addMessage('team',message);
  renderCalendar();drawVoice();persistCrystal();
}
$('#cook-short-rest').onclick=restRaidTeam;

function nextPullRisks(team){
  const names=incidentParticipants(team);
  const crossesTick=campaign.minutes%30+maximumPullMinutes>=30;
  const {couples,enemies}=crossesTick?relationshipPairs(team):{couples:[],enemies:[]};
  const coupled=new Set(couples.flat()),hostile=new Set(enemies.flat());
  return team.map(member=>{
    const state=pressureOf(member);
    const increase=wipeStress(member,Boolean(previousWipe))+(names.includes(member.name)?incidentPullStress:0)+
      (state.traits.includes('害怕背锅')?22:0)+(hostile.has(member)?6:0)+(couples.length&&!coupled.has(member)?2:0);
    return {name:displayName(member),pressure:state.value,increase};
  }).filter(risk=>risk.pressure+risk.increase>=100);
}

function requestRaidPull(fromCalendar){
  if(challengeBlock()||showingResolve)return;
  if(fromCalendar&&nextPullRisks(lineup()).length){
    showApp('cook');
    $('#stream-start-raid').focus();
    return;
  }
  resolveCampaignPull();
}

function renderIncidentCard(box,mode,incident){
  box.hidden=!incident||(mode==='raid'&&raidPlayback.active);
  box.replaceChildren();
  if(box.hidden)return;
  const {rule,members}=incident;
  element(box,'strong',`待调解 · ${rule.title}`);
  element(box,'p',members.map(member=>displayName(member)).join(' / ')+' · '+rule.story);
  const bothOnRaid=incidentParticipants(lineup()).length>0;
  element(box,'small',bothOnRaid?`两人同场且争执未解决时，每把结束各额外加 ${incidentPullStress} 压力。`:'双方再次同场时，争执会影响当把结算的压力。');
  const actions=element(box,'div',null,'incident-actions');
  const button=qoButton(actions,mode==='raid'?'调解 · 15 分钟':'调解 · 2 小时',()=>mediateTeamIncident(mode));
  button.disabled=!canMediate(mode,incident);
  if(mode==='raid')qoButton(actions,'打开 QO',()=>showApp('qo'));
  else if(canMediate('raid',incident))qoButton(actions,'去 Cook 处理',()=>showApp('cook'));
  else if(button.disabled&&!calendar.finished&&!raidPlayback.active){
    element(box,'small',calendarLocked()?'收队后可安排两小时调解。':'到下一个完整时段可安排调解。');
  }
}

function renderOperations(){
  const note=$('#cook-risk-note');
  note.hidden=true;
  if(!playingCrystal)return;
  const pull=$('#stream-start-raid'),calendarPull=$('[data-clock-action=raid]');
  pull.textContent='开怪';pull.removeAttribute('aria-describedby');
  calendarPull.textContent='前往指挥并开怪';
  const incident=teamIncident();
  renderIncidentCard($('#cook-incident'),'raid',incident);
  renderIncidentCard($('#qo-incident'),'office',incident);
  if(challengeBlock()||showingResolve)return;
  const team=lineup(), risks=nextPullRisks(team), tired=team.filter(member=>energyOf(member)<=50).length;
  note.hidden=!risks.length&&!tired;
  if(note.hidden)return;
  pull.setAttribute('aria-describedby',note.id);
  if(risks.length){
    pull.textContent='冒险开怪';
    calendarPull.textContent='前往 Cook 查看风险';
  }
  note.dataset.pressure=String(Boolean(risks.length));
  note.textContent=risks.length?`团灭可能触发压力检定 · ${risks.map(risk=>`${risk.name}（${risk.pressure}，可能 +${risk.increase}）`).join('、')}`:`${tired} 人已进入疲劳。短休 ${shortRestMinutes} 分钟可恢复 ${shortRestEnergy} 精力。`;
}
