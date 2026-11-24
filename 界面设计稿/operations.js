'use strict';

const shortRestMinutes=10, shortRestEnergy=14, shortRestPressure=8;
const incidentPullStress=12, incidentTeamStress=5;
const raidStress={wipe:14,repeated:26,progress:-6,clear:-20};
const incidentRules={
  wipe:{title:'灭团后互相指责',story:'两人对刚才灭团的原因各执一词，复盘变成争论。',affinity:9,pressure:12,raidMinutes:15},
  handoff:{title:'交接争吵',story:'双方都认为对方漏了口令，语音里的争论还没有结束。',affinity:10,pressure:14,raidMinutes:10},
  couple:{title:'CP 当众吵了起来',story:'两人把私下的不满带进队伍，开始在群里互相指责。',affinity:10,pressure:16,raidMinutes:15},
  enemy:{title:'仇人翻起旧账',story:'两人又翻起上次的争执，表示现在很难继续一起配合。',affinity:8,pressure:18,raidMinutes:15},
  message:{title:'群聊里的误会',story:'一条模棱两可的回复被理解成了嘲讽，两人来找经理说明情况。',affinity:8,pressure:9,raidMinutes:10},
  schedule:{title:'为排班争了起来',story:'两人对新排班的解释不同，开始质疑对方是否愿意配合。',affinity:8,pressure:10,raidMinutes:10},
};
const incidentLines={
  wipe:['刚才那下到底谁来喊？我完全没听见口令。','我喊了，但好几个人同时在说。先看一下这段录像吧。'],
  handoff:['不是说等我接住再走吗？你刚才先动了。','我以为你已经接过去了。下把你确认完再喊我。'],
  couple:['你有意见可以前面跟我说，别当着大家的面说我。','我刚才急了。我们先缓一下，等打完再聊。'],
  enemy:['上次这个交接就没说清，怎么还是老样子？','别翻上次的事。把这次谁先动说清楚就行。'],
  message:['你刚才那个「行吧」是在说我吗？','我在回上面的时间，没在说你。可能我回得太短了。'],
  schedule:['怎么又改时间？我之前说过那段不方便。','我以为那只是候选时段。我们等经理把最终时间定下来吧。'],
};
const battleIncidents=[
  {title:'语音突然断续',pressure:6,lines:['刚才口令断了几句，我只听见后半截。','收到。下把我把关键口令再报一遍。']},
  {title:'有人看错站位标记',pressure:8,lines:['我刚才认错了地上的标，站过去才反应过来。','下把开怪前我们按方位再对一下。']},
  {title:'机制提示不同步',pressure:7,lines:['我这边的提示跟你报点没对上，刚才差点提前走。','先统一听语音，打完再看提示怎么回事。']},
  {title:'临时被电话打断',pressure:9,lines:['刚才突然来电话，我分神了一下。现在已经处理好了。','行，缓一下。下把开怪前喊一声。']},
];

function pullEnergyCost(minutes){return 4+minutes*25/60;}
function wipeStress(member,repeated){return repeated&&!pressureOf(member).traits.includes('逆风耐心')?raidStress.repeated:raidStress.wipe;}

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

function openTeamIncident(kind,members,at,log){
  const rule=incidentRules[kind],[first,second]=members;
  campaign.incident={kind,names:members.map(member=>member.name)};
  campaign.lastIncidentAttempt=campaign.attempts;
  const pressureBefore=members.map(member=>pressureOf(member).value);
  const affinityChanges=[changeAffinity(first,second,-rule.affinity),changeAffinity(second,first,-rule.affinity)];
  members.forEach(member=>changePressure(member,rule.pressure,at));
  latestAffinityEvent=`${first.name}和${second.name}发生「${rule.title}」，双向好感各降 ${rule.affinity}。`;
  const pressureChanges=members.map((member,i)=>`${member.name} ${pressureBefore[i]}→${pressureOf(member).value}`);
  notifyResult('队务',rule.title,`好感 · ${affinityChanges.join('，')}\n压力 · ${pressureChanges.join('，')}`,at,log);
  teamDialogue([[first,incidentLines[kind][0]],[second,incidentLines[kind][1]]],at,log);
  return `${rule.title} · ${first.name} / ${second.name}`;
}

function rollRaidIncident(team,final,repeated,at,log){
  const session=sessionForToday();
  if(session?.incidentRaised||teamIncident()||campaign.attempts<2||
    (campaign.lastIncidentAttempt!==undefined&&campaign.attempts-campaign.lastIncidentAttempt<3))return null;
  const {couples,enemies}=relationshipPairs(team);
  const hasRelatedPair=couples.length>0||enemies.length>0;
  const highPressure=team.some(member=>pressureOf(member).value>=75);
  const likelihood=.26+(repeated ? .16 : 0)+(highPressure ? .12 : 0)+(hasRelatedPair ? .12 : 0);
  if(combatRandom()>=likelihood)return null;
  if(session)session.incidentRaised=true;
  if(enemies.length&&combatRandom()<.7)return openTeamIncident('enemy',pickMember(enemies),at,log);
  if(couples.length&&combatRandom()<.7)return openTeamIncident('couple',pickMember(couples),at,log);
  const responsible=team[final.slot];
  return openTeamIncident(final.key==='chain'||final.key==='cone'?'handoff':'wipe',
    [responsible,pickMember(team.filter(member=>member!==responsible))],at,log);
}

function settleRaidUnexpectedEvent(team,final,repeated,at,log){
  const gap=campaign.incidentGap??0;
  const highPressure=team.some(member=>pressureOf(member).value>=75);
  const likelihood=.16+(repeated ? .08 : 0)+(highPressure ? .08 : 0);
  if(gap<2&&combatRandom()>=likelihood){campaign.incidentGap=gap+1;return null;}
  campaign.incidentGap=0;

  const conflict=log.clear?null:rollRaidIncident(team,final,repeated,at,log);
  const event=conflict?null:pickMember(battleIncidents);
  const pressure=event?.pressure??incidentTeamStress;
  for(const member of team)changePressure(member,pressure,at);
  log.incidentPressure=pressure;
  log.incidentNeedsMediation=Boolean(conflict);
  if(conflict)return conflict;

  const first=pickMember(team), second=pickMember(team.filter(member=>member!==first));
  notifyResult('战报',`意外 · ${event.title}`,`全队各增加 ${pressure} 压力。`,at,log);
  teamDialogue([[first,event.lines[0]],[second,event.lines[1]]],at,log);
  return event.title;
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

function mediationPlan(incident){
  const inRaid=calendarLocked();
  const minutes=inRaid?incident.rule.raidMinutes:120;
  const label=inRaid?`${minutes} 分钟`:'2 小时';
  let reason='';
  if(calendar.finished)reason='本轮挑战已结束。';
  else if(raidPlayback.active)reason='本把战斗结算后可调解。';
  else if(showingResolve)reason='压力检定结束后可调解。';
  else if(inRaid){
    if(!incident.members.every(gameOnline))reason='双方到场后可调解，也可以收队后再安排。';
    else if(!canUseRaidBreak(minutes))reason=`当前共同出勤时间不足 ${label}，可收队后安排调解。`;
  }else if(campaign.minutes>0)reason='推进到下一个完整时段后可调解。';
  return {inRaid,minutes,label,reason};
}

function mediateTeamIncident(){
  const incident=teamIncident();
  if(!incident)return;
  const {inRaid,minutes,label,reason}=mediationPlan(incident);
  if(reason){toast(reason);renderOperations();return;}
  const affinityRecovery=inRaid?12:15,pressureRecovery=inRaid?18:24;
  const [first,second]=incident.members;
  delete campaign.incident;
  const pressureBefore=incident.members.map(member=>pressureOf(member).value);
  const affinityChanges=[changeAffinity(first,second,affinityRecovery),changeAffinity(second,first,affinityRecovery)];
  const at=campaignHour()+minutes/60;
  for(const member of incident.members)changePressure(member,-pressureRecovery,at);
  if(inRaid){ensureRaidSession();advanceRaidMinutes(minutes);}
  else advanceCalendar('mediate');
  latestAffinityEvent=`${first.name}和${second.name}完成调解，双向好感各 +${affinityRecovery}，压力各 −${pressureRecovery}。`;
  const message=`调解用时 ${label} · ${latestAffinityEvent}`;
  const pressureChanges=incident.members.map((member,i)=>`${member.name} ${pressureBefore[i]}→${pressureOf(member).value}`);
  notifyResult('队务','调解完成',`用时 ${label}\n好感 · ${affinityChanges.join('，')}\n压力 · ${pressureChanges.join('，')}`,at);
  teamDialogue([[first,'刚才我的语气也有点冲。下次我先把话说完整。'],[second,'好，这事先翻篇。我们下把照说好的处理。']],at);
  appendCookEvent(message);
  renderCalendar();drawVoice();persistCrystal();
}

function restRaidTeam(){
  if(!playingCrystal){
    const message='短休 · 10 分钟';
    commandLog.unshift(message);
    appendCookEvent('指挥 · '+message);teamDialogue([[lineup().find(Boolean),'我去倒杯水，回来就位。']]);
    toast('已记录提示，并同步到 QO。');
    return;
  }
  if(!canUseRaidBreak(shortRestMinutes))return;
  ensureRaidSession();
  const at=campaignHour()+shortRestMinutes/60;
  const members=lineup().filter(gameOnline);
  const recovered=[],relieved=[];
  for(const member of members){
    const energyBefore=energyOf(member),pressureBefore=pressureOf(member).value;
    energy.set(member.name,Math.min(100,energyBefore+shortRestEnergy));
    changePressure(member,-shortRestPressure,at);
    recovered.push(energyOf(member)-energyBefore);relieved.push(pressureBefore-pressureOf(member).value);
  }
  advanceRaidMinutes(shortRestMinutes);
  const message=`全队短休 · ${shortRestMinutes} 分钟 · 精力最多恢复 ${shortRestEnergy}，压力 −${shortRestPressure}。`;
  commandLog.unshift(message);appendCookEvent(message);
  notifyResult('战报','全队短休',`用时 ${shortRestMinutes} 分钟 · 精力恢复 ${effectRange(recovered)} · 压力减少 ${effectRange(relieved)}`,at);
  teamDialogue([[members[0],'我去接杯水，回来就位。'],[members[2],'好，我顺便把刚才的减伤轴看一眼。']],at);
  renderCalendar();drawVoice();persistCrystal();
}
$('#cook-short-rest').onclick=restRaidTeam;

function nextPullRisks(team){
  const names=incidentParticipants(team);
  const crossesTick=campaign.minutes%30+maximumPullMinutes>=30;
  const {couples,enemies}=crossesTick?relationshipPairs(team):{couples:[],enemies:[]};
  const coupled=new Set(couples.flat()),hostile=new Set(enemies.flat());
  const expectedIncidentStress=(campaign.incidentGap??0)>=2?incidentTeamStress:0;
  return team.map(member=>{
    const state=pressureOf(member);
    const increase=wipeStress(member,Boolean(previousWipe))+expectedIncidentStress+(names.includes(member.name)?incidentPullStress:0)+
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

function renderIncidentCard(box,incident,plan){
  box.hidden=!incident||(box.id==='cook-incident'&&raidPlayback.active);
  box.replaceChildren();
  if(box.hidden)return;
  const {rule,members}=incident;
  element(box,'strong',`待调解 · ${rule.title}`);
  element(box,'p',members.map(member=>displayName(member)).join(' / ')+' · '+rule.story);
  const bothOnRaid=incidentParticipants(lineup()).length>0;
  element(box,'small',bothOnRaid?`两人同场且争执未解决时，每把结束各额外加 ${incidentPullStress} 压力。`:'双方再次同场时，争执会影响当把结算的压力。');
  const actions=element(box,'div',null,'incident-actions');
  const button=qoButton(actions,`调解 · ${plan.label}`,mediateTeamIncident);
  button.disabled=Boolean(plan.reason);
  if(plan.reason)element(box,'small',plan.reason);
}

function renderOperations(){
  const note=$('#cook-risk-note');
  note.hidden=true;
  if(!playingCrystal)return;
  const pull=$('#stream-start-raid'),calendarPull=$('[data-clock-action=raid]');
  pull.textContent='开怪';pull.removeAttribute('aria-describedby');
  calendarPull.textContent='前往指挥并开怪';
  const incident=teamIncident();
  const plan=incident?mediationPlan(incident):null;
  renderIncidentCard($('#cook-incident'),incident,plan);
  renderIncidentCard($('#qo-incident'),incident,plan);
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
