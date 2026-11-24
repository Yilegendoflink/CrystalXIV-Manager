'use strict';

const qoNicknames = new Map();
const qoRequests = new Map();
const removedVeterans = new Set();
const qoUnread = new Map();

function resetQo() {
  qoNicknames.clear();
  qoRequests.clear();
  removedVeterans.clear();
  qoUnread.clear();
  $('#qo-search').value = '';
  $('#qo-sort').value = 'default';
}

function displayName(member) {
  return qoNicknames.get(member.name) || member.name;
}

function chatName(label) {
  const [name, ...parts] = label.split(' · ');
  return [qoNicknames.get(name) || name, ...parts].join(' · ');
}

function directMember() {
  if (currentThread === 'backup') return rosterMembers().get(reserve.name);
  return currentThread.startsWith('dm:') ? rosterMembers().get(currentThread.slice(3)) : null;
}

function qoThreadFor(member) {
  return !recruitedStart && member.name === reserve.name ? 'backup' : 'dm:' + member.name;
}

function switchQoThread(key) {
  currentThread = key;
  readQoCurrent();
  drawQoSessions();
  drawThread();
}

function totalQoUnread() {
  return [...qoUnread.values()].reduce((total,count)=>total+count,0);
}

function decorateUnread(parent,count) {
  parent.querySelector('.qo-unread')?.remove();
  if(count) {
    const badge = element(parent,'span',count>99?'99+':String(count),'qo-unread');
    badge.setAttribute('aria-label',count+' 条未读消息');
  }
}

function drawQoBadges() {
  for(const button of $$('.shortcuts [data-app=qo], #crystal-menu [data-app=qo], [data-task=qo]')){
    decorateUnread(button,totalQoUnread());
    if(button.closest('.shortcuts'))button.setAttribute('aria-label',totalQoUnread()?'打开 QO，'+totalQoUnread()+' 条未读消息':'打开 QO');
  }
}

function readingQo(thread) {
  return !pages.desktop.hidden && activeApp==='qo' && currentThread===thread && !document.hidden;
}

function readQoCurrent() {
  if(!readingQo(currentThread)||!qoUnread.delete(currentThread))return;
  const selected = $$('[data-thread]').find(item=>item.dataset.thread===currentThread);
  if(selected)decorateUnread(selected,0);
  drawQoBadges();
  if(playingCrystal&&typeof persistCrystal==='function')persistCrystal();
}

function receiveQo(thread,row) {
  threads[thread] ??= [];
  threads[thread].push(row);
  if(!readingQo(thread))qoUnread.set(thread,(qoUnread.get(thread)??0)+1);
}

function refreshMemberRequests(member) {
  if (calendar.finished) return;
  if (pressureOf(member).value >= 75 && !qoRequests.has('support:' + member.name)) {
    qoRequests.set('support:' + member.name, {name:member.name, kind:'support', state:'pending'});
    const key = qoThreadFor(member);
    receiveQo(key,[member.name[0],member.name,'刚刚','我现在压力有点高，能找个时段聊聊吗？']);
  }
  if (!lineup().includes(member) && !qoRequests.has('start:' + member.name)) {
    qoRequests.set('start:' + member.name, {name:member.name, kind:'start', state:'pending'});
    const key = qoThreadFor(member);
    receiveQo(key,[member.name[0],member.name,'刚刚',`我想试试首发 ${member.role}，能让我上场吗？`]);
  }
}

function refreshQoInbox() {
  for(const member of rosterMembers().values())refreshMemberRequests(member);
  drawQoBadges();
  if(opened.has('qo')){drawQoSessions();drawThread();}
}

function drawQoSessions() {
  const list = $('#qo-direct-list');
  const query = $('#qo-search').value.trim().toLowerCase();
  const group = $('[data-thread=team]'), backup = $('[data-thread=backup]');
  list.replaceChildren(group,backup);
  for (const member of rosterMembers().values()) {
    if (qoThreadFor(member)==='backup') continue;
    if (query && !`${member.name} ${displayName(member)} ${member.role}`.toLowerCase().includes(query)) continue;
    const button = element(list,'button',null,'conversation');
    button.type = 'button';
    button.dataset.thread = qoThreadFor(member);
    element(button,'span',displayName(member)[0],'mini-avatar');
    const title = element(button,'span',null);
    element(title,'strong',displayName(member));
    const request = [...qoRequests.values()].some(item => item.name === member.name && item.state === 'pending');
    const last = threads[button.dataset.thread]?.at(-1);
    element(title,'small',request ? '有待回应的诉求' : last?.[3] ?? member.role);
  }
  group.hidden = Boolean(query && !'炎帝陵固定队 群聊'.includes(query));
  backup.hidden = recruitedStart || Boolean(query && !`${reserve.name} ${displayName(reserve)}`.toLowerCase().includes(query));
  backup.querySelector('strong').textContent=displayName(reserve);
  backup.querySelector('small').textContent = [...qoRequests.values()].some(item=>item.name===reserve.name&&item.state==='pending')
    ? '有待回应的诉求' : 'H2 候补';
  const buttons = [...list.children];
  if($('#qo-sort').value==='unread')buttons.sort((a,b)=>(qoUnread.get(b.dataset.thread)??0)-(qoUnread.get(a.dataset.thread)??0));
  list.append(...buttons);
  for (const item of buttons) {
    const selected = item.dataset.thread === currentThread;
    item.classList.toggle('selected',selected);
    item.setAttribute('aria-pressed',String(selected));
    decorateUnread(item,qoUnread.get(item.dataset.thread)??0);
  }
}

function qoButton(parent, title, run, style = 'plain') {
  const button = element(parent,'button',title,style);
  button.type = 'button';
  button.onclick = run;
  return button;
}

function runQoTalk(member, mode) {
  $('#talk-member').value = member.name;
  $('#talk-type').value = mode;
  return advanceCalendar('talk');
}

function answerRequest(member, request, accept) {
  if (request.state !== 'pending' || !rosterMembers().has(member.name)) return;
  if(accept && calendar.finished){toast('本轮挑战已经结束。');return;}
  if (accept && request.kind === 'support' && !runQoTalk(member,'listen')) return;
  if (accept && request.kind === 'start') selectedStarters.set(member.role,member.name);
  request.state = accept ? 'accepted' : 'declined';
  addMessage(qoThreadFor(member), accept
    ? (request.kind==='support' ? '已经留出时间安抚，先按自己的节奏来。' : `已把你安排到 ${member.role} 首发，开团前再核对档期。`)
    : '收到，这次暂不安排。');
  if(accept){
    const reply=request.kind==='support'?'好，谢谢你。我先把刚才那把放一放。':'收到，我会按这个席位准备。';
    appendChatRows(qoThreadFor(member),[[member.name[0],member.name,messageClock(campaignHour()),reply]]);
    if(request.kind==='start')notifyResult('队务','首发安排更新',`${member.role} · ${displayName(member)}`);
  }
  syncLineup();
}

function drawPrivateActions(member) {
  const actions = $('#qo-talk-actions');
  actions.hidden = !member;
  const requestBox = $('#qo-request');
  requestBox.replaceChildren();
  const items = member ? [...qoRequests.values()].filter(item => item.name===member.name && item.state==='pending') : [];
  requestBox.hidden = !items.length;
  for (const request of items) {
    const row = element(requestBox,'div',null,'qo-request-row');
    element(row,'strong',request.kind==='support'?'希望找时间谈谈':'希望担任首发');
    qoButton(row,request.kind==='support'?'安排安抚 · 2 小时':'同意首发',()=>answerRequest(member,request,true));
    qoButton(row,'暂不安排',()=>answerRequest(member,request,false));
  }
}

function drawGroupSettings() {
  const list = $('#qo-settings-list');
  list.replaceChildren();
  $('#qo-settings-count').textContent = `经理管理 · ${rosterSize()}/${rosterLimit} 人 · ${readyText()}`;
  for (const member of rosterMembers().values()) {
    const row = element(list,'div',null,'qo-setting-row');
    row.dataset.member = member.name;
    const identity = element(row,'div',null);
    chip(identity,member.role);
    element(identity,'strong',' '+displayName(member));
    const label = element(row,'label',null);
    element(label,'span','群内外号');
    const nickname = element(label,'input',null);
    nickname.maxLength=14; nickname.value=qoNicknames.get(member.name)??''; nickname.placeholder=member.name;
    const buttons = element(row,'div',null,'qo-setting-buttons');
    qoButton(buttons,'保存外号',()=>{
      const value=nickname.value.trim();
      if(value) qoNicknames.set(member.name,value); else qoNicknames.delete(member.name);
      syncLineup();drawGroupSettings();toast('群内外号已更新。');
    });
    const isStarter = lineup().includes(member) && member!==seats[3];
    const promote = qoButton(buttons,isStarter?'首发':'设首发',()=>{
      selectedStarters.set(member.role,member.name);
      teamDialogue([[member,`收到，这次我来打 ${member.role}。`]]);
      notifyResult('队务','首发安排更新',`${member.role} · ${displayName(member)}`);
      syncLineup();drawGroupSettings();
    });
    promote.disabled = isStarter || member===seats[3] || calendar.finished;
    const kick=qoButton(buttons,'移出群聊',()=>{
      const wasChatting = currentThread===qoThreadFor(member);
      if(releaseRecruit(member)) {
        if(wasChatting) switchQoThread('team');
        notifyResult('队务','队员已移出',`${displayName(member)} · 队伍 ${rosterSize()}/${rosterLimit} 人 · 首发 ${readyCount()}/8 席`);
        teamDialogue([[lineup().find(Boolean),'我看到了新名单。下次开团前再确认一下补位。']]);
        drawGroupSettings();
      }
    },'plain qo-danger');
    kick.disabled=calendar.finished;
  }
  if (!list.children.length) element(list,'p','群内暂时没有成员。');
}

function affinityTone(value) {
  return value >= 80 ? 'close' : value < 20 ? 'hostile' : value >= 60 ? 'friendly' : value < 40 ? 'strained' : 'neutral';
}

function drawProfileGraph(panel, member) {
  const graph = element(panel,'div',null,'qo-network');
  graph.setAttribute('aria-label','双向好感关系图');
  const others = [...rosterMembers().values()].filter(other=>other.name!==member.name);
  element(graph,'strong',displayName(member),'qo-node qo-node-center');
  const readout = element(panel,'p',others.length?'点外围成员查看双向好感。':'其他队员入队后显示双向好感。','qo-network-readout');
  others.forEach((other,index)=>{
    const angle=2*Math.PI*index/others.length-Math.PI/2;
    const x=50+37*Math.cos(angle), y=50+35*Math.sin(angle);
    const outgoing=affinity(member,other),incoming=affinity(other,member);
    for (const [value,kind] of [[outgoing,'out'],[incoming,'in']]) {
      const line=element(graph,'span',null,'qo-edge '+affinityTone(value)+' '+kind);
      line.style.width=Math.hypot(x-50,y-50)+'%';
      line.style.setProperty('--angle',angle+'rad');
      line.setAttribute('aria-hidden','true');
    }
    const node=qoButton(graph,displayName(other),()=>{
      const kind=relationshipKind(member,other);
      readout.textContent=`${displayName(member)} → ${displayName(other)} ${outgoing} · 反向 ${incoming}`+(kind==='cp'?' · CP':kind==='enemy'?' · 仇人':'');
    },'qo-node');
    node.style.left=x+'%';node.style.top=y+'%';
    node.setAttribute('aria-label',`${displayName(other)}，去向 ${outgoing}，来向 ${incoming}`);
    node.title=`去向 ${outgoing} · 来向 ${incoming}`;
  });
  if(others.length)element(panel,'p','实线是对外好感，虚线是对方的好感。紫为亲密，绿为友好，米白为普通，橙为紧张，红为敌对。','qo-legend');
}

function openMemberProfile(member) {
  const body=$('#qo-profile-body');
  body.replaceChildren();
  element(body,'h3',displayName(member)+' · '+member.role);
  const stats=element(body,'div',null,'qo-profile-stats');
  const row=veteranStats[seats.findIndex(seat=>seat.role===member.role)];
  const fallback={execution:row[0],coordination:row[1],reaction:row[2],technique:row[3],aptitude:70};
  for(const [key,label] of Object.entries(recruitAttributes)) {
    const value=element(stats,'div',null);
    element(value,'small',label);element(value,'strong',String(member[key]??fallback[key]));
  }
  const pressure=pressureOf(member);
  element(body,'p',`每日可用 ${availabilityText(member)}`);
  element(body,'p',`精力 ${Math.round(energyOf(member))} · 压力 ${pressure.value} · 实战发挥 ${Math.round(battleFactor(member)*100)}%`);
  if (pressure.encouragedUntil > campaignHour()) {
    element(body,'p',`受鼓励 · 实战发挥 +10% · 剩余约 ${Math.ceil(pressure.encouragedUntil-campaignHour())} 小时`);
  }
  const traits = member.traits ?? (member.trait ? [member.trait] : []);
  element(body,'p','天生特质 · '+(traits.join('、')||'暂无记录'));
  element(body,'p','压力特质 · '+(pressure.traits.join('、')||'暂无记录'));
  drawProfileGraph(body,member);
  qoButton(body,'发起私聊',()=>{
    $('#qo-profile-dialog').close();
    switchQoThread(qoThreadFor(member));
    $('#qo-message').focus();
  },'action');
  $('#qo-profile-dialog').showModal();
}

function initQo() {
  $('#qo-search').addEventListener('input',drawQoSessions);
  $('#qo-sort').addEventListener('change',drawQoSessions);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden||activeApp!=='qo')return;
    readQoCurrent();
    drawQoSessions();
  });
  $('#qo-settings').onclick=()=>{drawGroupSettings();$('#qo-settings-dialog').showModal();};
  for(const button of $$('[data-qo-talk]'))button.onclick=()=>{
    const member=directMember();
    if(!member || !runQoTalk(member,button.dataset.qoTalk)) return;
    const request=qoRequests.get('support:'+member.name);
    if(request?.state==='pending' && button.dataset.qoTalk==='listen') request.state='accepted';
    const listened=button.dataset.qoTalk==='listen';
    addMessage(currentThread,listened?'先缓一缓。刚才哪里让你最难受，我们慢慢说。':'你刚才有几个处理做得很好。下一把继续按自己的节奏来。');
    appendChatRows(currentThread,[[member.name[0],member.name,messageClock(campaignHour()),listened?'谢谢你听我说。我好一点了。':'好，我再试试。']]);
    drawQoSessions();
    drawThread();
  };
}
