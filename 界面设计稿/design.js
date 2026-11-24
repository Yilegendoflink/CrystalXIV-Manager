'use strict';

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const pages = { home: $('#home'), selection: $('#selection'), desktop: $('#desktop') };
const playingCrystal = new URLSearchParams(location.search).has('play');
const appInfo = {
  doc: ['Doc', '队伍攻略与机制分工'],
  qo: ['QO', '队伍消息与成员管理'],
  cook: ['Cook', '观战、语音与指挥'],
  nge: ['NGE', '新闻及固定队招募'],
  manual: ['基本玩法.txt', 'Crystal 记事本 · 只读'],
};
const opened = new Set();
const appWindows = new Map();
const windowStack = [];
let activeApp = null;
const daySlots = [10, 12, 14, 16, 18, 20, 22, 24];
const recruitEndHours = daySlots.map(hour => hour + 2);
const defaultAvailability = [20,22,24];
const timeText = hour => `${String(hour % 24).padStart(2, '0')}:00`;
const activityTime = hour => `${hour >= 24 ? '次日 ' : ''}${timeText(hour)}`;
const windowEndText = hour => hour === 24 ? '24:00' : activityTime(hour);
const timeWindowText = (start, end) => `${activityTime(start)}–${start >= 24 ? timeText(end) : windowEndText(end)}`;
const slotText = hour => timeWindowText(hour, hour + 2);
const absoluteHour = () => (calendar.day - 1) * 24 + calendar.hour;
let calendar = { day: 7, hour: 18, finished: false };
function randomValue() { return playingCrystal ? combatRandom() : Math.random(); }
const energy = new Map();
const pressures = new Map();
const pressureChecks = [];
const affinityValues = new Map();
let latestAffinityEvent = '';
let previousWipe = null;
let appointmentStart = 20;
let appointmentEnd = 24;
const pressureResults = {
  faith: { label: '坚定信念', reset: 40, factor: 1.10, traits: ['读秒专注', '带练耐心', '逆风耐心'] },
  collapse: { label: '精神崩溃', reset: 70, factor: 0.70, traits: ['害怕背锅', '交接迟疑', '下意识沉默'] },
};

function element(parent, tag, value, className) {
  const node = document.createElement(tag);
  if (value !== null) node.textContent = value;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function showPage(page) {
  closeMenu();
  Object.entries(pages).forEach(([key, node]) => { node.hidden = key !== page; });
  window.scrollTo(0, 0);
  pages[page].querySelector('h1').focus({ preventScroll: true });
}

function enterDesktop(mode) {
  if (playingCrystal && !enterCampaign(mode)) return;
  if ($('#save-dialog').open) $('#save-dialog').close();
  if (!playingCrystal) {
    campaign=newCampaign();
    resetScenario(mode === 'new' ? { day: 1, hour: 10, finished: false } : { day: 7, hour: 18, finished: false }, mode === 'new');
    if(mode==='continue')campaign.discovery={'0-0':100,'0-1':90,'0-2':60,'0-3':35,'0-4':0};
  }
  renderCalendar();
  showPage('desktop');
  showApp(null);
}

function setMenu(open) {
  $('#crystal-menu').hidden = !open;
  $('#crystal-start').setAttribute('aria-expanded', String(open));
}

function closeMenu() { setMenu(false); }

function renderTasks() {
  const tabs = $('#task-tabs');
  tabs.replaceChildren();
  for (const key of opened) {
    const button = element(tabs, 'button', appInfo[key][0]);
    button.type = 'button';
    button.dataset.task = key;
    button.setAttribute('aria-pressed', String(key === activeApp));
    if (key === 'qo') decorateUnread(button, totalQoUnread());
  }
}

function raiseApp(key) {
  if (activeApp === key) return;
  const previous = windowStack.indexOf(key);
  if (previous !== -1) windowStack.splice(previous,1);
  windowStack.push(key);
  activeApp = key;
  windowStack.forEach((name,index) => {
    const frame = appWindows.get(name);
    frame.style.zIndex = index + 10;
    frame.classList.toggle('is-active',name===key);
  });
  if (key === 'qo') readQoCurrent();
  renderTasks();
}

function dismissApp(key, close = false) {
  if (!key) return;
  const frame = appWindows.get(key);
  frame.hidden = true;
  frame.classList.remove('is-active');
  const index = windowStack.indexOf(key);
  if (index !== -1) windowStack.splice(index,1);
  if (close) opened.delete(key);
  if (activeApp === key) {
    activeApp = null;
    const front = windowStack.at(-1);
    if (front) {
      raiseApp(front);
      appWindows.get(front).querySelector('.window-title').focus({preventScroll:true});
    } else $('#desk-title').focus({preventScroll:true});
  }
  renderTasks();
}

function showApp(key) {
  closeMenu();
  if (!key) { dismissApp(activeApp); return; }
  const frame = appWindows.get(key);
  frame.hidden = false;
  if(!frame.classList.contains('is-maximized'))moveWindow(frame,frame.offsetLeft,frame.offsetTop);
  opened.add(key);
  raiseApp(key);
  if (key === 'doc') drawGuide();
  if (key === 'cook' && playingCrystal) showRaidBroadcast();
  if (key === 'qo') { readQoCurrent();drawQoSessions(); drawThread(); }
  frame.querySelector('.window-title').focus({ preventScroll: true });
}

$('#choose-mode').addEventListener('click', () => showPage('selection'));
$('#crystal-start').addEventListener('click', () => setMenu($('#crystal-menu').hidden));

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-home')) showPage('home');
  if (button.dataset.enter) enterDesktop(button.dataset.enter);
  if (button.hasAttribute('data-select')) {
    $('#save-dialog').close();
    showPage('selection');
  }
  if (button.hasAttribute('data-save-menu')) {
    closeMenu();
    $('#save-feedback').textContent = '';
    $('#save-dialog').showModal();
  }
  if (button.hasAttribute('data-calendar')) {
    renderCalendar();
    $('#calendar-dialog').showModal();
  }
  if (button.dataset.app) showApp(button.dataset.app);
  if (button.dataset.task) {
    if (button.dataset.task === activeApp) dismissApp(activeApp);
    else showApp(button.dataset.task);
  }
  if (!button.closest('.crystal-menu') && button.id !== 'crystal-start') closeMenu();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#crystal-menu').hidden) {
    closeMenu();
    $('#crystal-start').focus();
  }
});

$('#save-import').addEventListener('click', () => {
  if (playingCrystal) return importCampaign();
  $('#save-feedback').textContent = '导入入口示意 · 正式版在这里选择 JSON 存档并验证版本。';
});
$('#save-export').addEventListener('click', () => {
  if (playingCrystal) return exportCampaign();
  $('#save-feedback').textContent = '导出入口示意 · 正式版在这里下载所选槽位的备份。';
});

let drag;
function moveWindow(frame, left, top) {
  const minY = parseInt(getComputedStyle(pages.desktop).getPropertyValue('--manager-clearance'),10);
  const maxX = Math.max(7, pages.desktop.clientWidth - frame.offsetWidth - 7);
  const maxY = Math.max(minY, pages.desktop.clientHeight - frame.offsetHeight - 52);
  frame.style.setProperty('--window-left', `${Math.min(maxX, Math.max(7, left))}px`);
  frame.style.setProperty('--window-top', `${Math.min(maxY, Math.max(minY, top))}px`);
}
function buildAppWindows(){
  const holder = $('#app-windows'), template = $('#window-bar');
  $$('[data-app-panel]').forEach((panel,index) => {
    const key=panel.dataset.appPanel,[title,caption]=appInfo[key];
    const frame=element(holder,'section',null,'app-window');
    frame.id='app-'+key;
    frame.dataset.app=key;
    frame.style.setProperty('--window-offset',`${index*24}px`);
    frame.hidden=true;
    const bar=template.cloneNode(true);
    bar.id='window-bar-'+key;
    const heading=bar.querySelector('#window-title');
    heading.removeAttribute('id');
    heading.id='window-title-'+key;heading.className='window-title';heading.textContent=title;
    frame.setAttribute('aria-labelledby',heading.id);
    const subheading=bar.querySelector('#window-caption');
    subheading.removeAttribute('id');subheading.className='window-caption';subheading.textContent=caption;
    const [min,max,close]=bar.querySelectorAll('button');
    for(const button of [min,max,close])button.removeAttribute('id');
    min.onclick=()=>dismissApp(key);
    close.onclick=()=>dismissApp(key,true);
    max.onclick=()=>{
      const state=frame.classList.toggle('is-maximized');
      max.setAttribute('aria-pressed',String(state));
      max.setAttribute('aria-label',state?'还原窗口':'最大化');
      max.title=state?'还原窗口':'最大化';
    };
    frame.append(bar,panel);panel.hidden=false;
    frame.addEventListener('focusin',()=>raiseApp(key));
    frame.addEventListener('pointerdown',()=>raiseApp(key));
    if(key==='qo')frame.addEventListener('pointerup',event=>{
      if(!event.target.closest('.qo-nav')&&activeApp==='qo')drawQoSessions();
    });
    bar.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.target.closest('button')||frame.classList.contains('is-maximized'))return;
      drag={frame,id:event.pointerId,x:event.clientX,y:event.clientY,left:frame.offsetLeft,top:frame.offsetTop};
    });
    appWindows.set(key,frame);
  });
  template.remove();
  holder.hidden=false;
}
window.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId) return;
  if (event.buttons === 0) { drag = null; return; }
  moveWindow(drag.frame,drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
});
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('pointercancel', () => { drag = null; });
window.addEventListener('resize',()=>{
  for(const frame of appWindows.values())if(!frame.hidden&&!frame.classList.contains('is-maximized'))moveWindow(frame,frame.offsetLeft,frame.offsetTop);
});

const seats = [
  { role: 'MT', name: '白脊', gender: '男', pressure: 48, job: '首领朝向与首次接管' },
  { role: 'ST', name: '榆桥', gender: '男', pressure: 52, job: '换坦与团减补位' },
  { role: 'H1', name: '澄灯', gender: '女', pressure: 86, job: '团血恢复与治疗交接' },
  { role: 'H2', name: '稻穗', gender: '女', pressure: 78, job: '预防盾与地火减伤' },
  { role: 'D1', name: '静弦', gender: '男', pressure: 57, job: '第一组近战输出' },
  { role: 'D2', name: '纸短', gender: '女', pressure: 42, job: '第二组近战与转火' },
  { role: 'D3', name: '踏水', gender: '男', pressure: 34, job: '远端报点与补位' },
  { role: 'D4', name: '一页雨', gender: '女', pressure: 48, job: '远端爆发窗口' },
];
const reserve = { role: 'H2', name: '雀斑', gender: '女', pressure: 45, job: '预防盾与地火减伤' };
const threads = {
  team: [
    ['稻', '稻穗 · H2', '16:34', '挑战第一晚要加班，H2 需要找人顶一下。'],
    ['澄', '澄灯 · H1', '16:36', '收到。我可以提前进语音，和替补过一遍减伤。'],
    ['雀', '雀斑 · 候补', '16:40', '我 20:00 后有空，打到两点可以提前约。'],
    ['踏', '踏水 · D3', '16:41', '我开了模拟直播，进本后我负责报转火。'],
  ],
  backup: [
    ['雀', '雀斑 · 候补', '16:40', '我可以接 H2，确认后发我减伤分工就行。'],
  ],
};
const starterMessages = Object.fromEntries(Object.entries(threads).map(([key, value]) => [key, [...value]]));
const joined = new Map();
const rosterLimit = 12;
let recruitedStart = false;
const selectedStarters = new Map();
let backupMember = null;
let currentThread = 'team';
let memberIndex = 3;

function lineup() {
  const roster = rosterMembers();
  return seats.map((seat, index) => {
    const selected = roster.get(selectedStarters.get(seat.role));
    if (selected) return selected;
    if (!recruitedStart && index === 3 && backupMember) return backupMember;
    return [...roster.values()].find(member => member.role === seat.role) ?? null;
  });
}
function readyCount() { return lineup().filter(member => member && member !== seats[3]).length; }
function readyText() { return `${readyCount()}/8 已确认`; }
function rosterSize() { return rosterMembers().size; }
function available(member,hour=calendar.hour) { return Boolean(member) && (member.hours ?? defaultAvailability).includes(hour); }
function availabilityText(member){
  const hours=daySlots.filter(hour=>available(member,hour)), spans=[];
  for(const hour of hours){
    const previous=spans.at(-1);
    if(previous?.[1]===hour)previous[1]+=2;
    else spans.push([hour,hour+2]);
  }
  return `${hours.length*2} 小时${spans.length?' · '+spans.map(([start,end])=>timeWindowText(start,end)).join(' / '):''}`;
}
function energyOf(member) { return energy.get(member.name) ?? 100; }
function energyLabel(value) { return value === 0 ? '完全疲劳' : value <= 50 ? '疲劳' : '正常'; }
function pressureOf(member) { return pressures.get(member.name) ?? { value: member.pressure, until: 0, mood: null, traits: [] }; }
function campaignHour() { return absoluteHour()+(playingCrystal&&typeof campaign!=='undefined'?campaign.minutes/60:0); }
function moodOf(member) {
  const state = pressureOf(member);
  return state.until > campaignHour() ? pressureResults[state.mood] : null;
}
function battleFactor(member) {
  return (0.60 + 0.004 * energyOf(member)) * (pressureOf(member).value < 30 ? 0.80 : 1) *
    (moodOf(member)?.factor ?? 1) * ((pressureOf(member).encouragedUntil ?? 0) > campaignHour() ? 1.10 : 1);
}

function changePressure(member, amount, at) {
  const state = pressureOf(member);
  const value = Math.max(0, Math.min(100, state.value + amount));
  if (value < 100) {
    pressures.set(member.name, { ...state, value });
    recordPressureChange(member,state.value,value);
    return;
  }
  const mood = randomValue() < 0.5 ? 'collapse' : 'faith';
  const result = pressureResults[mood];
  const trait = result.traits[Math.floor(randomValue() * result.traits.length)];
  pressures.set(member.name, { ...state, value: result.reset, until: at + 48, mood, traits: [...new Set([...state.traits, trait])] });
  const check = { name: member.name, role: member.role, mood, label: result.label, trait, at };
  pressureChecks.push(check);
  queueResolveFilm(check);
  recordPressureChange(member,state.value,100,result.reset);
}

function trialPressure(result, at) {
  if (result === 'progress') {
    previousWipe = null;
    for (const member of lineup()) changePressure(member, raidStress.progress, at);
    return `推进新机制，全队压力降低 ${-raidStress.progress}。`;
  }
  const attempts = result === 'repeat' ? 4 : 1;
  for (let index = 0; index < attempts; index++) {
    for (const member of lineup()) changePressure(member, wipeStress(member,previousWipe==='火狱之楔'), at);
    previousWipe = '火狱之楔';
  }
  return `在火狱之楔团灭 ${attempts} 把，已按是否连续失败结算压力。`;
}

function duringAppointment() {
  const session=playingCrystal&&typeof campaign!=='undefined'?sessionForToday():null;
  return !session?.ended && !calendar.finished && calendar.day >= 8 && calendar.hour >= appointmentStart && calendar.hour < (session?.end??appointmentEnd);
}
function gameOnline(member) {
  return Boolean(member) && duringAppointment() && member !== seats[3] && lineup().includes(member) && available(member);
}
function rosterMembers() { return recruitedStart ? joined : new Map([...seats.filter(member=>!removedVeterans.has(member.name)).map(member => [member.name, member]), ...joined]); }

function affinity(from, to) { return affinityValues.get(from.name)?.get(to.name) ?? 50; }

function setAffinity(from, to, value) {
  if (from.name === to.name) return;
  if (!affinityValues.has(from.name)) affinityValues.set(from.name, new Map());
  affinityValues.get(from.name).set(to.name, Math.max(0, Math.min(100, value)));
}

function changeAffinity(from, to, delta) {
  const before = affinity(from, to);
  setAffinity(from, to, before + delta);
  return `${from.name}→${to.name} ${before}→${affinity(from, to)}`;
}

function seedAffinity() {
  affinityValues.clear();
  latestAffinityEvent = '';
  if (recruitedStart) return;
  setAffinity(seats[0], seats[2], 82);
  setAffinity(seats[2], seats[0], 78);
  setAffinity(seats[2], seats[4], 23);
  setAffinity(seats[4], seats[2], 54);
}

function relationshipKind(first, second) {
  const forward = affinity(first, second), reverse = affinity(second, first);
  if (forward < 20 || reverse < 20) return 'enemy';
  if (first.gender && second.gender && first.gender !== second.gender && forward >= 80 && reverse >= 80) return 'cp';
  return 'regular';
}

function relationshipPairs(members) {
  const couples = [], enemies = [];
  members.forEach((first, index) => {
    for (const second of members.slice(index + 1)) {
      const kind = relationshipKind(first, second);
      if (kind === 'cp') couples.push([first, second]);
      if (kind === 'enemy') enemies.push([first, second]);
    }
  });
  return { couples, enemies };
}

function combatAffinityEvent(result, participants, actor, at=campaignHour(), log) {
  if (result === 'none') return;
  if (result === 'rescue') {
    const rescuer = actor ?? participants[0];
    const observers = [...rosterMembers().values()].filter(member => member.name !== rescuer.name);
    observers.forEach(member => changeAffinity(member, rescuer, 6));
    latestAffinityEvent = `${rescuer.name}成功救场，其他 ${observers.length} 名队员对其好感 +6。`;
    notifyResult('队务','救场后好感上升',latestAffinityEvent,at,log);
    teamDialogue([[participants.find(member=>member!==rescuer),`${displayName(rescuer)}，刚才那下补得及时，谢了。`]],at,log);
  } else if (result === 'injury') {
    const target = actor ?? participants[4];
    const healers = participants.filter(member => member.role.startsWith('H') && member.name !== target.name);
    const changes = healers.map(healer => changeAffinity(healer, target, -5));
    latestAffinityEvent = `${target.name}吃到意外伤害。${changes.join('、')}。`;
    notifyResult('队务','意外受伤',latestAffinityEvent,at,log);
    teamDialogue([[healers[0],`${displayName(target)}，那一下我得临时抬你。下把提前挪一步试试。`]],at,log);
  } else {
    const first = participants[Math.floor(randomValue() * participants.length)];
    const peers = participants.filter(member => member.name !== first.name);
    const second = peers[Math.floor(randomValue() * peers.length)];
    if (randomValue() < 0.5) {
      changeAffinity(first, second, 4);
      changeAffinity(second, first, 4);
      latestAffinityEvent = `${first.name}与${second.name}配合顺利，好感各 +4。`;
      teamDialogue([[first,'刚才那段配合得挺顺，下把也按这个来。'],[second,'行，我记住那个点了。']],at,log);
    } else {
      latestAffinityEvent = `语音沟通出现摩擦。${changeAffinity(first, second, -6)}。`;
      teamDialogue([[first,'刚才那句我没听明白，你是让我先动吗？'],[second,'我是说等我报点，没说清楚，下把重来。']],at,log);
    }
    notifyResult('队务','语音互动',latestAffinityEvent,at,log);
  }
}

function settleRelationshipPressure(participants, start, ticks = 4, log) {
  const { couples, enemies } = relationshipPairs(participants);
  if (!couples.length && !enemies.length) return '';
  const coupled = new Set(couples.flat().map(member => member.name));
  const conflicted = new Set(enemies.flat().map(member => member.name));
  for (let tick = 1; tick <= ticks; tick++) {
    for (const member of participants) {
      const coupleChange = couples.length ? coupled.has(member.name) ? -2 : 2 : 0;
      const change = coupleChange + (conflicted.has(member.name) ? 6 : 0);
      if (change) changePressure(member, change, start + tick / 2);
    }
  }
  if (couples.length) {
    const [first, second] = couples[0];
    const reminder=randomValue()<.5?'刚才那段你跟着我走就好。':'这段我们下把还一起处理吧。';
    teamDialogue([[first,reminder],[second,'好，我留意你那边。']],start+ticks/2,log);
  }
  if (enemies.length) {
    const [first, second] = enemies[0];
    const complaint=randomValue()<.5?'报点能不能一人说完再接？':'这段先让别人转述口令吧。';
    teamDialogue([[first,complaint],[second,'可以，等分工写清楚再打。']],start+ticks/2,log);
  }
  const lines=participants.map(member=>{
    const delta=ticks*((couples.length?(coupled.has(member.name)?-2:2):0)+(conflicted.has(member.name)?6:0));
    return delta?`${member.name} ${delta>0?'+':''}${delta}`:'';
  }).filter(Boolean);
  if(lines.length)notifyResult('队务','同场关系压力',lines.join(' · '),start+ticks/2,log);
  return ` 同场关系 · ${couples.length} 对 CP、${enemies.length} 对仇人。`;
}

const relationshipPerson = $('#relationship-person');
function drawRelationships() {
  const roster = rosterMembers();
  const selected = roster.get(relationshipPerson.value) ?? lineup()[memberIndex] ?? roster.values().next().value;
  relationshipPerson.replaceChildren();
  for (const member of roster.values()) {
    const option = element(relationshipPerson, 'option', `${member.role} ${member.name}`);
    option.value = member.name;
  }
  relationshipPerson.value = selected?.name ?? '';
  const rows = $('#relationship-rows');
  rows.replaceChildren();
  if (!selected) {
    $('#relationship-summary').textContent = '入队后可查看队员之间的好感。';
    $('#relationship-event').textContent = '';
    return;
  }
  for (const other of roster.values()) {
    if (other.name === selected.name) continue;
    const row = element(rows, 'tr', null);
    const kind = relationshipKind(selected, other);
    row.dataset.kind = kind;
    row.dataset.member = other.name;
    const name = element(row, 'th', `${other.role} ${other.name}`);
    name.scope = 'row';
    element(row, 'td', String(affinity(selected, other)));
    element(row, 'td', String(affinity(other, selected)));
    element(row, 'td', kind === 'cp' ? 'CP' : kind === 'enemy' ? '仇人' : '—');
  }
  const { couples, enemies } = relationshipPairs([...roster.values()]);
  $('#relationship-summary').textContent = `队内关系 · ${couples.length} 对 CP · ${enemies.length} 对仇人`;
  $('#relationship-event').textContent = latestAffinityEvent;
}

relationshipPerson.addEventListener('change', drawRelationships);
$('#qo-relationships').addEventListener('click', () => {
  drawRelationships();
  $('#relationships-dialog').showModal();
});

function challengeBlock() {
  if (playingCrystal && typeof campaign !== 'undefined' && campaign.clear) return '炎帝陵已首通。';
  if (playingCrystal && typeof campaign !== 'undefined') {
    if (raidPlayback.active) return '本把进行中。';
    if (sessionForToday()?.decision) return '请先决定本晚的收队安排。';
    if (sessionForToday()?.ended) return '本晚已收队。';
  }
  if (calendar.finished) return '本轮挑战已结束。';
  if (calendar.day < 8) return '准备阶段 · 第 8 天解锁挑战。';
  if (readyCount() < 8) return `目前 ${readyCount()}/8 席就绪，请从 NGE 招齐八个位置。`;
  if (!duringAppointment()) return `本时段未预约，本日约定为 ${timeWindowText(appointmentStart,appointmentEnd)}。`;
  const missing = lineup().filter(member => !available(member));
  if(missing.length)return `本时段无法出勤 · ${missing.map(member=>member.role).join('、')}`;
  return playingCrystal&&remainingRaidMinutes()<maximumPullMinutes?`开怪需预留 ${maximumPullMinutes} 分钟共同出勤时间。`:'';
}

function calendarLocked() {
  if(!playingCrystal||typeof campaign==='undefined')return false;
  const session=sessionForToday();
  return raidPlayback.active||Boolean(session&&!session.ended&&!campaign.clear);
}

function renderCalendar() {
  const phase = calendar.finished ? '已收官' : calendar.day < 8 ? '准备阶段' : '挑战阶段';
  const stamp = playingCrystal&&typeof campaign!=='undefined'?raidClockLabel():`第 ${calendar.day} 天 · ${activityTime(calendar.hour)}`;
  $('#calendar-phase').textContent = `${phase} · ${stamp} · 共 21 天`+(playingCrystal&&typeof campaign!=='undefined'&&campaign.minutes?' · 本段已用 '+campaign.minutes+'/120 分钟':'');
  const slots = $('#calendar-slots');
  const starters=lineup();
  slots.replaceChildren();
  for (const hour of daySlots) {
    const slot = element(slots, 'li', slotText(hour));
    const attendance=starters.filter(member=>member!==seats[3]&&available(member,hour)).length;
    slot.dataset.fullTeam=String(attendance===seats.length);
    element(slot,'small',`${attendance}/${seats.length} 可出勤`);
    if (!calendar.finished && hour === calendar.hour) slot.setAttribute('aria-current', 'time');
    if (hour >= 20) slot.dataset.evening = 'true';
  }
  const block = challengeBlock();
  const tired = lineup().filter(member => member && energyOf(member) <= 50).map(member => member.role);
  $('#challenge-note').textContent = block || `八席均可出战。${tired.length ? `疲劳席位 · ${tired.join('、')}` : '八席精力正常。'}`;
  const arrivalCount = lineup().filter(gameOnline).length;
  const attendance = playingCrystal&&typeof campaign!=='undefined'&&raidPlayback.active?'本把进行中 · 指挥与事件播报已同步':playingCrystal&&typeof campaign!=='undefined'&&campaign.clear?'已首通 · 可查看本把战报与回放':duringAppointment() ? `游戏及语音到场 ${arrivalCount}/8 · ${arrivalCount === 8 ? '等待经理开怪' : '等待缺席席位'}`
    : `开荒预约 ${timeWindowText(appointmentStart,appointmentEnd)} · 约定结束后离开游戏和语音`;
  $('#calendar-attendance').textContent = attendance;
  $('#stream-attendance').textContent = attendance;
  $('#cook-clock').textContent = stamp;
  const target = $('#talk-member');
  const selected = target.value || seats[2].name;
  target.replaceChildren();
  for (const member of rosterMembers().values()) {
    const option = element(target, 'option', `${member.role} ${member.name} · 压力 ${pressureOf(member).value}`);
    option.value = member.name;
  }
  if (rosterMembers().has(selected)) target.value = selected;
  $('#raid-outcome').disabled = Boolean(block);
  $('#raid-relationship').disabled = Boolean(block);
  $('#stream-start-raid').disabled = Boolean(block);
  const locked=calendarLocked();
  const session=typeof campaign==='undefined'?null:sessionForToday();
  const end=session&&!session.ended?session.end:appointmentEnd;
  $('#desk-context').textContent = calendar.finished?'挑战已结束':calendar.day<8?'下一步 · 组建队伍':`开荒预约 · ${timeWindowText(appointmentStart,end)}`;
  $('#session-start').disabled = calendar.finished || locked;
  $('#session-end').disabled = calendar.finished || locked;
  renderPromotion();
  $$('[data-clock-action]').forEach(button => {
    button.disabled = calendar.finished || (button.dataset.clockAction === 'raid' ? Boolean(block) : Boolean(locked)) ||
      (button.dataset.clockAction === 'promote' && !promotionTarget()) || (button.dataset.clockAction === 'talk' && !target.value);
  });
  $('#open-recruit').disabled = calendar.finished;
  $('#qo-confirm').disabled = calendar.finished;
  if(playingCrystal&&typeof campaign!=='undefined')refreshCookControls();
  if(typeof renderOperations==='function')renderOperations();
  if(typeof renderManagerTool==='function')renderManagerTool(phase,locked);
  renderRecruitCountdowns();
}

function advanceCalendar(action, post = action === 'promote' ? promotionTarget() : undefined, fromRaid = false) {
  if (calendar.finished || (action === 'raid' && challengeBlock())) return;
  if (playingCrystal && action === 'raid') {
    const fromCalendar=$('#calendar-dialog').open;
    if (fromCalendar) $('#calendar-dialog').close();
    requestRaidPull(fromCalendar);
    return;
  }
  if(!fromRaid&&calendarLocked()){
    toast('开荒中，请在 Cook 内复盘、短休或收队。');return;
  }
  if(playingCrystal && campaign.minutes>0 && action!=='wait'){toast('本时段已开怪，推进到下一时段后可安排此行动。');return;}
  if (action === 'promote' && !post) return;
  const before = lineup().filter(gameOnline).length;
  const checkCount = pressureChecks.length;
  const at = absoluteHour() + 2;
  let feedback = { wait: '已推进到下一时段。', intel: '已分析下一段副本情报。', scout: '候选档案已核实。', mediate:'已花两小时调解队内争执。' }[action];
  if (action === 'promote') {
    post.due -= 2;
    feedback = `已为「${post.title}」挂游戏招募。消耗 2 小时，招募额外推进 2 小时。`;
  }
  if (action === 'raid') {
    const participants = lineup();
    for (const member of participants) energy.set(member.name, Math.max(0, energyOf(member) - 50));
    combatAffinityEvent($('#raid-relationship').value, participants);
    const social = settleRelationshipPressure(participants, absoluteHour());
    const event = trialPressure($('#raid-outcome').value, at);
    const remaining = energyOf(participants[0]);
    feedback = `${event} MT 精力 ${remaining}/100 · ${energyLabel(remaining)}。${social}`;
  } else if (action === 'talk') {
    const member = rosterMembers().get($('#talk-member').value);
    if (!member) return;
    const oldPressure = pressureOf(member).value;
    const mode = $('#talk-type').value;
    changePressure(member, mode === 'listen' ? -16 : 8, at);
    if (mode === 'encourage') pressures.set(member.name,{...pressureOf(member),encouragedUntil:at+24});
    feedback = `已消耗两小时与${displayName(member)}对谈，压力 ${oldPressure} → ${pressureOf(member).value}。`+(mode==='encourage'?' 实战发挥提高 10%，持续 24 游戏小时。':'');
    notifyResult('队务',`${displayName(member)} · ${mode==='listen'?'安抚':'对谈'}完成`,feedback,at);
  }
  if (calendar.hour === daySlots.at(-1)) {
    if (calendar.day === 21) {
      calendar.hour += 2;
      calendar.finished = true;
    } else {
      calendar.day++;
      calendar.hour = 10;
      energy.clear();
      feedback += ' 次日 10:00，队员精力已恢复。';
    }
  } else calendar.hour += 2;
  const after = lineup().filter(gameOnline).length;
  if (before === 0 && after > 0) {
    feedback += ` ${after} 席已到场，等待指挥。`;
    if(!fromRaid){
      const present=lineup().filter(gameOnline);
      teamDialogue([[present[0],'我上线了，先去开荒语音等。'],[present[1],'我也到了。人齐以后喊一声。']],absoluteHour());
    }
  }
  if (before > 0 && after === 0) feedback += ' 到约定结束时间，队员已离开游戏与语音。';
  if (pressureChecks.length > checkCount) feedback += ` ${pressureChecks.length - checkCount} 次压力检定可在 Cook 查看。`;
  $('#calendar-feedback').textContent = feedback;
  if (playingCrystal && typeof campaign !== 'undefined') campaign.minutes = 0;
  updateRecruitments();
  if(playingCrystal&&!fromRaid&&action!=='mediate')rollManagementIncident();
  renderCalendar();
  drawVoice();
  return true;
}

$$('[data-clock-action]').forEach(button => button.addEventListener('click', () => advanceCalendar(button.dataset.clockAction)));
function applyAppointmentWindow(){
  $('#session-start').value=String(appointmentStart);
  appointmentEnd=setWindowEnd($('#session-end'),appointmentStart,appointmentEnd);
}
$('#session-start').addEventListener('change',event=>{
  appointmentStart=Number(event.target.value);
  applyAppointmentWindow();
  renderCalendar();drawVoice();
});
$('#session-end').addEventListener('change', event => {
  appointmentEnd=Number(event.target.value);
  renderCalendar();
  drawVoice();
});
$('#stream-start-raid').addEventListener('click', () => {
  if (challengeBlock()) return;
  advanceCalendar('raid');
  if (!playingCrystal) toast($('#calendar-feedback').textContent);
});

function chip(parent, role) {
  const className = role.startsWith('H') ? ' heal' : role.startsWith('D') ? ' dps' : '';
  return element(parent, 'span', role, `role-chip${className}`);
}

function addMessage(thread,text) {
  threads[thread]??=[];
  threads[thread].push(['经','经理',messageClock(campaignHour()),text]);
  refreshChat(thread);
}

function drawThread() {
  const target = $('#qo-messages');
  target.replaceChildren();
  const team = currentThread === 'team';
  const member = directMember();
  $('#qo-thread-title').textContent = team ? '炎帝陵固定队' : member ? displayName(member) : currentThread === 'backup' ? '雀斑' : currentThread.slice(3);
  $('#qo-thread-note').textContent = team ? `队伍群聊 · 预约 ${timeWindowText(appointmentStart,appointmentEnd)}` : member ? `私聊 · ${member.role}` : '历史私聊';
  const meter=$('#qo-thread-pressure');
  meter.replaceChildren();meter.hidden=!member;
  if(member)mountPressureMeter(meter,member);
  $('#qo-ready').hidden = !team;
  $('#qo-pin').hidden = !team;
  for (const [avatar, name, time, text] of threads[currentThread] ?? []) {
    const row = element(target, 'article', null, name === '经理' ? 'message manager' : 'message');
    element(row, 'span', avatar, 'mini-avatar');
    const content = element(row, 'div', null);
    const meta = element(content, 'div', null, 'message-meta');
    element(meta, 'strong', chatName(name));
    element(meta, 'time', time);
    element(content, 'p', text);
  }
  if (!target.children.length) element(target,'p','暂无消息。','qo-empty');
  drawPrivateActions(member);
  target.scrollTop = target.scrollHeight;
}

function drawMembers() {
  const parent = $('#qo-members');
  const team = lineup();
  parent.replaceChildren();
  team.forEach((member, index) => {
    const role = seats[index].role;
    const item = element(parent, 'li', null);
    const button = element(item, 'button', null);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(index === memberIndex));
    chip(button, role);
    element(button, 'strong', member ? displayName(member) : '空缺');
    element(button, 'small', recruitedStart ? member ? '首发' : '待招募' : index === 3 ? backupMember ? '替补' : '请假' : '已确认');
    button.addEventListener('click', () => { memberIndex = index; if(member)openMemberProfile(member);else{ drawMembers(); $('#qo-members').querySelectorAll('button')[index].focus(); } });
    if(member)mountPressureMeter(item,member,'compact');
  });
  const detail = $('#qo-member-detail');
  const member = team[memberIndex];
  detail.replaceChildren();
  element(detail, 'strong', `${seats[memberIndex].role} ${member ? displayName(member) : '空缺'}`);
  if (recruitedStart) {
    const eligible = [...joined.values()].filter(player => player.role === seats[memberIndex].role);
    if (!eligible.length) {
      const link = element(detail, 'button', '去 NGE 招募', 'plain');
      link.type = 'button'; link.dataset.app = 'nge';
      link.onclick = () => {
        setRecruitSeats([seats[memberIndex].role]);
        currentBoard = 'recruit'; postIndex = 0; drawForum();
      };
      return;
    }
    element(detail, 'p', '点成员查看资料。首发与名单在群聊设置中管理。');
    return;
  }
  element(detail, 'span', memberIndex === 3 && !backupMember ? '临时请假 · 候补雀斑可出席' : member.job);
}

function releaseRecruit(member) {
  if (!confirm(`将${member.name}移出队伍？`)) return;
  qoUnread.delete(qoThreadFor(member));
  joined.delete(member.name);
  if (member === backupMember) backupMember = null;
  if (!recruitedStart && seats.includes(member)) removedVeterans.add(member.name);
  if (selectedStarters.get(member.role) === member.name) selectedStarters.delete(member.role);
  syncLineup();
  drawForum();
  return true;
}

$('.qo-nav').addEventListener('click', event => {
  const button = event.target.closest('[data-thread]');
  if (button) {
    switchQoThread(button.dataset.thread);
    $$('[data-thread]').find(item=>item.dataset.thread===currentThread)?.focus({preventScroll:true});
  }
});

$('#qo-compose').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#qo-message');
  const text = input.value.trim();
  if (!text) return;
  addMessage(currentThread,text);
  input.value = '';
  input.focus();
});

$('#qo-confirm').addEventListener('click', () => {
  const previous = backupMember;
  const possible = [...joined.values()].find(member => member.role === 'H2');
  if (backupMember) backupMember = null;
  else if (possible) backupMember = possible;
  else if (rosterSize() < rosterLimit) { backupMember = reserve; joined.set(reserve.name, reserve); }
  else { toast(`队伍已满 ${rosterLimit} 人，需要空出一个名额。`); return; }
  const message = backupMember ? `${backupMember.name}已确认补 H2，开怪前和澄灯对一次减伤。` : `已撤销${previous.name}的首发安排，H2 回到待确认。`;
  if(backupMember)recruitmentDialogue(backupMember);
  else teamDialogue([[previous,'这次先退回候补，有需要再叫我。']]);
  syncLineup();
  notifyResult('队务','H2 首发调整',message);
});

const channelLabels = { raid: '开荒语音', review: '双治疗复盘', reserve: '候补待命' };
let currentChannel = 'raid';
let muted = false;

function voiceLocation(member) {
  if (!member) return null;
  if (calendar.day >= 8) return gameOnline(member) ? 'raid' : null;
  if (recruitedStart) return lineup().includes(member) ? 'raid' : 'reserve';
  if (member === seats[3]) return null;
  if (member === seats[2]) return 'review';
  if (member === reserve || joined.has(member.name)) return 'reserve';
  return 'raid';
}

function drawCookParty(){
  const list=$('#cook-party');
  list.replaceChildren();
  const live=playingCrystal&&typeof campaign!=='undefined'&&raidPlayback.active&&campaign.last?.partyStart?campaign.last:null;
  const members=live?live.names.map(name=>rosterMembers().get(name)).filter(Boolean):lineup().filter(gameOnline);
  if(!members.length){element(list,'p','到预约时间后，这里会显示在场队员。');return;}
  for(const member of members){
    const card=element(list,'article',null,'cook-party-card'),title=element(card,'header',null);
    chip(title,member.role);element(title,'strong',member.name);
    card.dataset.member=member.name;
    decorateTraitPulse(card,member.name);
    const opening=live?.partyStart[live.names.indexOf(member.name)];
    const elapsed=live ? Math.min(live.minutes*60,preparationSeconds+(live.steps[raidPlayback.index]?.seconds??0)) : 0;
    const stamina=Math.round(opening?Math.max(0,opening.energy-pullEnergyCost(elapsed/60)):energyOf(member));
    mountPressureMeter(card,member);
    const row=element(card,'div',null,'cook-party-meter energy');
    if(stamina<=50)row.dataset.warning='true';
    element(row,'span','精力');element(row,'strong',String(stamina));
    const bar=element(row,'progress',null);bar.max=100;bar.value=stamina;
    bar.setAttribute('aria-label',member.name+'的精力');
  }
}

function drawVoice() {
  const grid = $('#cook-roster');
  $('#cook-channel-title').textContent = channelLabels[currentChannel];
  const waiting = recruitedStart ? joined : new Map([[reserve.name, reserve], ...joined]);
  const review = recruitedStart ? [] : [seats[2]].filter(member => rosterMembers().has(member.name) && voiceLocation(member) === 'review');
  const reserves = [...waiting.values()].filter(member => voiceLocation(member) === 'reserve');
  $('#cook-count').textContent = `${lineup().filter(member => voiceLocation(member) === 'raid').length} 人`;
  $('[data-channel=review] small').textContent = `${review.length} 人`;
  $('[data-channel=reserve] small').textContent = `${reserves.length} 人`;
  const members = currentChannel === 'raid' ? lineup().filter(Boolean) : currentChannel === 'review' ? review : reserves;
  const active = members.find(member => voiceLocation(member) === currentChannel && member.role !== 'D4')?.name;
  $('#cook-speaker').textContent = active ? `${active}发言中` : '暂无发言';
  $('.speaking').dataset.off = String(!active);
  const log = $('#cook-pressure-log');
  log.hidden = pressureChecks.length === 0;
  $('#cook-pressure-summary').textContent = `压力检定 · ${pressureChecks.length} 次`;
  const events = $('#cook-pressure-events');
  events.replaceChildren();
  for (const { name, label, trait } of [...pressureChecks].reverse()) element(events, 'li', `${name} · ${label} · ${trait}`);
  const high = lineup().find(member => member && visiblePressure(member) >= 85);
  const low = lineup().find(member => member && visiblePressure(member) < 30);
  $('#cook-advice').textContent = high ? `${high.role} ${high.name}压力偏高，日程中可安排对谈。`
    : low ? `${low.role} ${low.name}压力偏低，可通过对谈明确下一把目标。` : '查看精力和临时状态，决定下一时段的安排。';
  if(traitAnchor&&grid.contains(traitAnchor))hideTraitTooltip();
  grid.replaceChildren();
  if (members.length === 0) element(grid, 'p', '当前频道无人。', 'voice-empty');
  for (const member of members) {
    const location = voiceLocation(member);
    const speaking = member.name === active;
    const state = pressureOf(member);
    const mood = moodOf(member);
    const card = element(grid, 'article', null, 'voice-card');
    if(typeof drawFace==='function'){
      const avatar=element(card,'canvas',null,'crew-face');
      avatar.width=avatar.height=40;avatar.setAttribute('aria-hidden','true');drawFace(member,avatar);
    }
    card.dataset.speaking = speaking;
    chip(card, member.role);
    element(card, 'strong', ` ${member.name}`);
    const presence = location === currentChannel
      ? speaking ? '正在发言' : member.role === 'D4' ? '已连线 · 静音' : '已连线'
      : location ? `在${channelLabels[location]}` : member === seats[3] ? '请假 · 未进频道' : '未连线';
    element(card, 'p', `${gameOnline(member) ? '游戏已到场' : '游戏离线'} · ${presence}`);
    mountPressureMeter(card,member);
    const remaining = energyOf(member);
    element(card, 'p', `精力 ${Math.round(remaining)}/100 · ${energyLabel(remaining)}`, remaining <= 50 ? 'energy-low' : undefined);
    element(card, 'p', `实战发挥 ${Math.round(battleFactor(member) * 100)}%`);
    if (mood) element(card, 'p', `${mood.label} · 剩 ${Math.ceil(state.until - absoluteHour())} 小时`, 'mood-label');
    if(state.traits.length)mountTraitBadges(element(card,'span',null,'voice-traits'),state.traits);
  }
  refreshQoInbox();
  drawCookParty();
}

$$('[data-channel]').forEach(button => button.addEventListener('click', () => {
  currentChannel = button.dataset.channel;
  $$('[data-channel]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  drawVoice();
}));

$('#cook-mute').addEventListener('click', () => {
  muted = !muted;
  $('#cook-mute').setAttribute('aria-pressed', String(muted));
  $('#cook-mute').textContent = muted ? '麦克风 · 静音' : '麦克风 · 开启';
});

function syncLineup() {
  $('#qo-ready').textContent = readyText();
  $('#stream-ready').textContent = readyText();
  const candidate = [...joined.values()].find(member => member.role === 'H2');
  $('#tray-ready').textContent = `${readyCount()}/8 就绪`;
  $('#desk-ready').textContent = recruitedStart ? `${readyText()} · 队伍 ${rosterSize()}/${rosterLimit} 人` : backupMember ? `8/8 已确认 · ${backupMember.name}补 H2` : '7/8 已确认 · H2 候补待定';
  $('#qo-pin').textContent = recruitedStart ? '群公告 · 通过 NGE 发帖招齐八席，在这里调整首发。' : backupMember ? `群公告 · ${backupMember.name}补 H2，开怪前对一次减伤。` : '群公告 · 先确认 H2，进语音后对一次换坦口令。';
  $('#qo-confirm').hidden = recruitedStart;
  $('#qo-confirm').textContent = backupMember ? `撤销${backupMember.name}补位` : `确认${candidate?.name ?? reserve.name}补位`;
  $('#qo-roster-size').textContent = `队伍 ${rosterSize()}/${rosterLimit} 人`;
  const starters = lineup();
  const reserves = [...joined.values()].filter(member => !starters.includes(member));
  const reserveList = $('#qo-reserves');
  reserveList.hidden = reserves.length === 0;
  reserveList.textContent = reserves.length ? '候补' : '';
  for (const member of reserves) {
    const row=element(reserveList,'span',null,'qo-reserve-row');
    const button = element(row,'button',displayName(member),'plain');
    button.type = 'button';
    button.onclick = () => openMemberProfile(member);
    mountPressureMeter(row,member,'compact');
  }
  drawMembers();
  if (activeApp === 'qo') { drawQoSessions(); drawThread(); }
  drawVoice();
  renderCalendar();
  if(typeof refreshOpenGuide==='function')refreshOpenGuide();
}

const boards = {
  general: populateDiscussions(),
  news: [
    { title: '炎帝陵本周开放', tag: '公告', text: '首个可选副本聚焦八席配合。P1 与 P2 均包含冲锋与火狱之楔，P3 以狂暴收尾。' },
    { title: '开荒建议：先对减伤分工', tag: '攻略', text: '团队承伤高时先查看 Cook 的压力与疲劳，再对照战报决定复盘生存还是练机制。' },
    { title: '招募须知：先确认共同档期', tag: '置顶', text: '发帖前标明下一次开团时间。候选资料会显示意向席位、可出勤时间和试训状态。' },
  ],
  recruit: [
    { title: '挑战首晚招募 H2 候补', tag: '进行中', text: '20:00 时段前确认替补。雀斑已在 QO 联系经理。' },
  ],
};
const exampleRecruitPosts = [...boards.recruit];
const recruitmentNames = {
  MT: ['锅铃', '霁山', '石梁', '晨山', '长堤', '雪峰', '夜潮'], ST: ['柴桩', '岚舟', '蒲苇', '雁爪', '回岭', '节竹', '流石'],
  H1: ['晚汐', '回港', '连溪', '镜砂', '夜泉', '凉雨', '照影'], H2: ['雀斑', '逆潮', '夕雨', '霜杏', '青栀', '若叶', '霞帆'],
  D1: ['拾漆', '青枝', '篆烟', '冬角', '行木', '长灯', '栉风'], D2: ['赤羽', '寒岸', '余墨', '白脐', '松子', '临风', '一舟'],
  D3: ['回舟', '绀石', '秋原', '羊城', '暗石', '亭午', '墨川'], D4: ['渔火', '石纹', '空山', '碎叶', '银湍', '石花', '沙弦'],
};
const candidateFiles = new Map();
let currentBoard = 'news';
let postIndex = 0;

function resetScenario(next, empty = false) {
  resetNotices();
  resetPressureEffects();
  resetTraitPresentation();
  if(typeof resetCookPlayback==='function')resetCookPlayback();
  if(typeof resetGuide==='function')resetGuide();
  calendar = next;
  resetQo();
  recruitedStart = empty;
  selectedStarters.clear();
  energy.clear();
  pressures.clear();
  pressureChecks.length = 0;
  seedAffinity();
  previousWipe = null;
  appointmentStart=20;appointmentEnd=24;
  applyAppointmentWindow();
  $('#raid-outcome').value = 'progress';
  $('#raid-relationship').value = 'none';
  $('#talk-type').value = 'listen';
  joined.clear();
  backupMember = null;
  candidateFiles.clear();
  boards.recruit = empty ? [] : [...exampleRecruitPosts];
  currentBoard = 'news';
  postIndex = 0;
  for (const key of Object.keys(threads)) {
    if (key.startsWith('dm:')) delete threads[key];
    else threads[key] = empty ? [] : [...starterMessages[key]];
  }
  if (empty) threads.team.push(['经', '经理', '10:00', '固定队开始筹备。先去 NGE 发布招募帖。']);
  $('[data-thread=backup]').hidden = empty;
  currentThread = 'team';
  $$('[data-thread]').forEach(button => {
    const selected = button.dataset.thread === 'team';
    button.setAttribute('aria-pressed', String(selected));
    button.classList.toggle('selected', selected);
  });
  $('#calendar-feedback').textContent = '';
  for (const frame of appWindows.values()) {
    frame.hidden = true;
    frame.classList.remove('is-active');
  }
  opened.clear();windowStack.length=0;activeApp=null;renderTasks();
  drawThread();
  syncLineup();
  drawForum();
}

function arrivalText(hour) {
  const total = Math.round(hour*60), day = Math.floor(total/1440)+1;
  const minute = total%1440, slot = Math.floor(minute/60);
  const clock = timeText(slot).slice(0,-2)+String(minute%60).padStart(2,'0');
  if (slot < 2) return `第 ${day - 1} 天 · 次日 ${clock}`;
  return slot < 10 ? `第 ${day} 天 ${clock} 到期，10:00 可查看` : `第 ${day} 天 ${clock}`;
}

function recruitSeats(post) { return post.roles===undefined?[post.seat]:post.roles; }
function validActivityWindow(start,end) {return daySlots.includes(start)&&recruitEndHours.includes(end)&&start<end;}

function weightedChoice(items,weight){
  let cursor=randomValue()*items.reduce((sum,item)=>sum+weight(item),0);
  return items.find(item=>(cursor-=weight(item))<0)??items.at(-1);
}

function recruitAvailability(post){
  const required=daySlots.filter(slot=>slot>=post.hour&&slot<(post.endHour??post.hour+2));
  const fits=availabilityProfiles.filter(profile=>profile.periods>=required.length);
  const feasibleTraits=(post.traits??[]).filter(trait=>!availabilityTraits.has(trait)||fits.some(profile=>profile.trait===trait));
  const locked=feasibleTraits[Math.floor(randomValue()*feasibleTraits.length)];
  const profiles=availabilityTraits.has(locked)?fits.filter(profile=>profile.trait===locked):fits;
  const profile=weightedChoice(profiles,item=>item.weight);
  const windows=daySlots.map((_,i)=>daySlots.slice(i,i+profile.periods)).filter(window=>
    window.length===profile.periods&&required.every(slot=>window.includes(slot)));
  const hours=weightedChoice(windows,window=>window.includes(20)?window.includes(22)?window.includes(24)?14:9:6:window.includes(22)?4:1);
  const traits=[...new Set([profile.trait,locked].filter(Boolean))];
  if(!traits.length)traits.push(generalInnateTraits[Math.floor(randomValue()*generalInnateTraits.length)]);
  if(traits.length===1&&randomValue()<.4){
    const pool=generalInnateTraits.filter(trait=>!traits.includes(trait));
    traits.push(pool[Math.floor(randomValue()*pool.length)]);
  }
  return {hours,traits,adjustment:profile.adjustment};
}

function createCandidate(post, seat) {
  const names = recruitmentNames[seat];
  const taken = name => candidateFiles.has(name) || rosterMembers().has(name) || (name === reserve.name && !recruitedStart);
  const unused = names.filter(name => !taken(name));
  const ordinal = Math.floor(randomValue() * names.length);
  let sequence = candidateFiles.size + 1;
  let name = unused[ordinal % unused.length] ?? `${names[ordinal]}·${sequence}`;
  while (taken(name)) name = `${names[ordinal]}·${++sequence}`;
  const {hours,traits,adjustment}=recruitAvailability(post);
  const candidate = {
    role: seat, name, gender: ordinal % 2 === 0 ? '女' : '男', pressure: 40 + ordinal,
    hours,
    ...rollRecruitAttributes(post, randomValue, adjustment), revealed: false, contact: ordinal % 2 === 0,
    traits, trait: traits.join('、'), job: `${seat} 招募队员`,
  };
  candidateFiles.set(name, candidate);
  return candidate;
}

function activePosts() { return boards.recruit.filter(post => Array.isArray(post.batches)); }
function promotionTarget() { return activePosts()[Number($('#promote-post').value)] ?? null; }
function renderPromotion() {
  const select = $('#promote-post');
  const value = select.value;
  select.replaceChildren();
  activePosts().forEach((post,i) => { element(select,'option',`${post.title} · ${recruitSeats(post).join(' / ')}`).value = i; });
  if (value && activePosts()[Number(value)]) select.value = value;
  if (!activePosts().length) element(select,'option','暂无生效招募帖').value = '';
  select.disabled = calendar.finished || !activePosts().length;
}

function updateRecruitments() {
  const now=Math.round(campaignHour()*60);
  let updated=false;
  const firstBatches=[];
  for (const post of activePosts()) {
    const roles = recruitSeats(post);
    while (!calendar.finished && Math.round(post.due*60) <= now) {
      const count = 2 + Math.floor(randomValue() * 4);
      const offset = post.batches.reduce((total,batch)=>total+batch.length,0);
      const candidates = Array.from({ length: count }, (_,i) => createCandidate(post, roles[(offset+i)%roles.length]));
      if(!post.batches.length)firstBatches.push(`${post.title} · ${roles.join(' / ')} · ${count} 人`);
      post.batches.push(candidates);
      post.batchIndex = post.batches.length - 1;
      post.due += post.duration ?? 6;
      updated=true;
    }
  }
  if(firstBatches.length)notifyResult('招募','首批候选已到',firstBatches.join('\n'));
  if ((updated||calendar.finished) && currentBoard === 'recruit') drawForum();
}

function enroll(candidate) {
  if (calendar.finished || joined.has(candidate.name) || rosterSize() >= rosterLimit) return;
  joined.set(candidate.name, candidate);
  if (!recruitedStart && !backupMember && candidate.role === 'H2') backupMember = candidate;
  recruitmentDialogue(candidate);
  syncLineup();
  drawForum();
  notifyResult('招募',`${candidate.role} ${candidate.name} 已入队`,`队伍 ${rosterSize()}/${rosterLimit} 人 · 首发 ${readyCount()}/8 席`);
}

function addRecruitCountdown(parent,index,compact=false) {
  const box=element(parent,compact?'span':'section',null,compact?'recruit-queue':'recruit-ticket');
  box.dataset.recruitCountdown=index;
  const caption=element(box,'span',null,'recruit-countdown-caption');
  if(!compact)element(caption,'small',null,'recruit-countdown-label');
  element(caption,'strong',null,'recruit-countdown-clock');
  const meter=element(box,'progress',null,'recruit-progress');
  meter.setAttribute('aria-label','招募批次进度');
  if(!compact)element(box,'small',null,'recruit-countdown-due');
}

function renderRecruitCountdowns() {
  const promote=$('#forum-detail [data-recruit-promote]');
  if(promote)promote.disabled=calendar.finished||calendarLocked()||(playingCrystal&&campaign.minutes>0);
  for(const box of $$('[data-recruit-countdown]')){
    const post=boards.recruit[Number(box.dataset.recruitCountdown)];
    if(!post?.batches)continue;
    const remaining=Math.max(0,Math.round((post.due-campaignHour())*60));
    const clock=box.querySelector('.recruit-countdown-clock');
    const label=box.querySelector('.recruit-countdown-label');
    const due=box.querySelector('.recruit-countdown-due');
    const meter=box.querySelector('progress');
    const duration=(post.duration??6)*60;
    clock.textContent=calendar.finished?'已停止':`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
    meter.max=duration;meter.value=Math.max(0,duration-remaining);
    if(label)label.textContent=post.batches.length?'距下一批候选':'距首批候选';
    if(due)due.textContent=calendar.finished?'本轮招募已停止':`${arrivalText(post.due)} · 每批 ${duration/60} 小时`;
    box.dataset.finished=String(calendar.finished);
  }
}

function drawForum() {
  const list = $('#forum-posts');
  const posts = currentBoard === 'recruit' ? [...boards.recruit,...forumRecruitPosts] : boards[currentBoard];
  list.replaceChildren();
  $('#board-title').textContent = `${{news:'游戏新闻',general:'玩家交流',recruit:'固定队招募'}[currentBoard]} · ${posts.length} 个主题`;
  $$('[data-board]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.board === currentBoard)));
  posts.forEach((topicData, index) => {
    const {title,tag,author,batches}=topicData;
    const button = element(list, 'button', null, 'forum-post');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(postIndex === index));
    const topic = element(button,'span',null,'topic-title');
    element(topic,'strong',title);
    element(topic,'small',batches?`${recruitSeats(topicData).join(' / ')} · ${batches.length?`已到 ${batches.length} 批`:'等待首批'}`:author??'NGE 站务');
    if(batches)addRecruitCountdown(button,index,true);
    else element(button,'small',tag);
    button.addEventListener('click', () => {
      postIndex = index;
      drawForum();
      list.querySelectorAll('button')[index].focus();
    });
  });
  const panel = $('#forum-detail');
  if(traitAnchor&&panel.contains(traitAnchor))hideTraitTooltip();
  panel.replaceChildren();
  const post = posts[postIndex];
  if (!post) {renderRecruitCountdowns();return;}
  element(panel, 'h2', post.title);
  element(panel,'p',post.author ?? (post.batches ? '经理 · 我的帖子' : 'NGE 站务'),'forum-byline');
  element(panel, 'p', post.text);
  if (post.reply) {
    const reply = element(panel,'div',null,'forum-reply');
    element(reply,'strong','1 楼');
    element(reply,'p',post.reply);
  }
  if (!post.batches) {renderRecruitCountdowns();return;}
  const positions=element(panel,'div',null,'recruit-post-roles');
  for(const role of recruitSeats(post))chip(positions,role);
  addRecruitCountdown(panel,postIndex);
  const filters=[post.traits?.length?`锁定其一 ${post.traits.join('、')}`:'',post.attribute?`${recruitAttributes[post.attribute]} ≥ ${post.minimum}`:''].filter(Boolean);
  if(filters.length)element(panel,'p',filters.join(' · '));
  const actions=element(panel,'div',null,'recruit-post-actions');
  const promote = element(actions,'button','挂游戏招募 · 2 小时','action');
  promote.type = 'button';
  promote.dataset.recruitPromote='';
  promote.onclick = () => advanceCalendar('promote',post);
  renderRecruitCountdowns();
  if (!post.batches.length) {
    const clock = element(actions, 'button', '打开日程', 'plain');
    clock.type = 'button';
    clock.dataset.calendar = '';
    return;
  }
  const batchSelector = element(panel, 'select', null, 'batch-picker');
  batchSelector.setAttribute('aria-label', '候选批次');
  post.batches.forEach((batch, index) => {
    const option = element(batchSelector, 'option', `第 ${index + 1} 批 · ${batch.length} 人`);
    option.value = index;
  });
  batchSelector.value = post.batchIndex;
  batchSelector.addEventListener('change', () => {
    post.batchIndex = Number(batchSelector.value);
    drawForum();
    panel.querySelector('select').focus();
  });
  for (const candidate of post.batches[post.batchIndex]) {
    const row = element(panel, 'div', null, 'candidate');
    const body = element(row, 'div', null);
    chip(body,candidate.role);
    element(body,'strong',candidate.name);
    element(body, 'small', `每日可用 ${availabilityText(candidate)}`);
    element(body, 'small', candidate.revealed
      ? `执行 ${candidate.execution}` : `执行约 ${Math.max(0,candidate.execution - 7)}–${Math.min(100,candidate.execution + 7)} · 特质待核实`);
    if (candidate.revealed) {
      mountTraitBadges(element(body,'span',null,'voice-traits'),candidate.traits??(candidate.trait?[candidate.trait]:[]));
      element(body, 'small', `协作 ${candidate.coordination} · 应变 ${candidate.reaction} · 手法 ${candidate.technique} · 资质 ${candidate.aptitude}`);
      const total = Object.keys(recruitAttributes).reduce((sum,key) => sum + candidate[key], 0);
      element(body, 'small', `总能力 ${total}`);
    }
    const actions = element(row, 'div', null, 'candidate-actions');
    const hired = joined.has(candidate.name);
    const addAction = (label, className, disabled, handler) => {
      const button = element(actions, 'button', label, className);
      button.type = 'button';
      button.disabled = disabled;
      button.addEventListener('click', handler);
    };
    if (!candidate.revealed && !hired) {
      addAction('调查 · 2 小时', 'plain', calendar.finished || (playingCrystal && campaign.minutes>0), () => {
        candidate.revealed = true;
        const batch = post.batchIndex;
        advanceCalendar('scout');
        post.batchIndex = batch;
        drawForum();
        toast(`${candidate.name}的档案已核实，时间推进 2 小时。`);
      });
      addAction('人脉核实', 'plain', !candidate.contact, () => {
        candidate.revealed = true;
        drawForum();
        toast(`${candidate.name}的旧队友已确认其能力与特质。`);
      });
    }
    addAction(hired ? '已入队' : rosterSize() >= rosterLimit ? '队伍已满' : '招入', 'action', hired || rosterSize() >= rosterLimit || calendar.finished, () => enroll(candidate));
  }
}

$$('[data-board]').forEach(button => button.addEventListener('click', () => {
  currentBoard = button.dataset.board;
  postIndex = 0;
  drawForum();
}));

$('#calendar-recruit').addEventListener('click', () => {
  $('#calendar-dialog').close();
  currentBoard = 'recruit';
  postIndex = 0;
  drawForum();
  showApp('nge');
});

$('#open-recruit').addEventListener('click', () => {
  if(calendar.finished)return;
  renderRecruitEstimate();$('#recruit-dialog').showModal();
});
$('#cancel-recruit').addEventListener('click', () => $('#recruit-dialog').close());
const recruitForm = $('#recruit-form');
const traitOptions = $('#recruit-trait-options');
const roleOptions = $('#recruit-role-options');
const recruitStart = recruitForm.elements.startHour;
const recruitEnd = recruitForm.elements.endHour;
for(const [select,options,defaultHour] of [[recruitStart,daySlots,20],[recruitEnd,recruitEndHours,22],[$('#session-start'),daySlots,20],[$('#session-end'),recruitEndHours,24]]){
  for(const hour of options){
    const option=element(select,'option',options===recruitEndHours?windowEndText(hour):activityTime(hour));
    option.value=hour;option.defaultSelected=hour===defaultHour;
  }
}
function setWindowEnd(select,start,end){
  for(const option of select.options)option.hidden=option.disabled=Number(option.value)<=start;
  if(!validActivityWindow(start,end))end=start+2;
  select.value=String(end);
  return end;
}
for(const [group,roles] of [['坦克',['MT','ST']],['治疗',['H1','H2']],['输出',['D1','D2','D3','D4']]]){
  const section=element(roleOptions,'div',null,'recruit-role-group');
  element(section,'strong',group);
  const cards=element(section,'div',null,'recruit-role-cards');
  for(const role of roles){
    const label=element(cards,'label',null,'recruit-role-card');
    const input=element(label,'input',null);
    input.type='checkbox';input.name='seat';input.value=role;input.defaultChecked=role==='H2';
    chip(label,role);
  }
}
function setRecruitSeats(roles){
  for(const input of roleOptions.querySelectorAll('input'))input.checked=roles.includes(input.value);
  renderRecruitEstimate();
}
$('#recruit-all-roles').onclick=()=>{
  const selected=new FormData(recruitForm).getAll('seat');
  setRecruitSeats(selected.length===seats.length?[]:seats.map(member=>member.role));
};
for (const [key, {label, minimum, extra}] of Object.entries(recruitGrades)) {
  element(recruitForm.elements.quality, 'option', `${label} · ≥${minimum} · +${extra} 小时`).value = key;
}
for (const trait of innateTraits) {
  const label = element(traitOptions,'label',null);
  const input = element(label,'input',null);
  input.type = 'checkbox'; input.name = 'trait'; input.value = trait;
  element(label,'span',trait);
}
function recruitConditions() {
  const form = new FormData(recruitForm);
  const traits = form.getAll('trait');
  const attribute = form.get('attribute');
  const grade = attribute ? recruitGrades[form.get('quality')] : null;
  return {traits,attribute,minimum:grade?.minimum ?? 0,duration:4+(traits.length ? 2 : 0)+(grade?.extra ?? 0)};
}
function renderRecruitEstimate() {
  const start=Number(recruitStart.value);
  const end=setWindowEnd(recruitEnd,start,Number(recruitEnd.value));
  $('#recruit-window-length').textContent=`${end-start} 小时`;
  recruitForm.elements.quality.disabled = !recruitForm.elements.attribute.value;
  const {traits,duration} = recruitConditions();
  const hint=end-start>6?'候选人会具有「无所事事」。':end-start>4?'候选人来自普通和长档期队员。':'候选人会覆盖所选档期。';
  $('#recruit-availability-hint').textContent=hint+(end-start>4&&traits.includes('时间紧张')?' 本档期从其余锁定特质中抽选。':'');
  const roles=new FormData(recruitForm).getAll('seat');
  for (const checkbox of traitOptions.querySelectorAll('input')) checkbox.disabled = traits.length >= 3 && !checkbox.checked;
  const incomplete = traits.length !== 0 && traits.length !== 3;
  recruitForm.querySelector('[type=submit]').disabled = incomplete||!roles.length;
  $('#recruit-seat-count').textContent=`已选 ${roles.length} / ${seats.length} 席`;
  $('#recruit-all-roles').textContent=roles.length===seats.length?'清空':'全选';
  $('#recruit-extra').textContent=duration===4?'选填':`+${duration-4} 小时`;
  $('#recruit-hours').textContent=`${duration} 小时`;
  $('#recruit-eta').textContent=!roles.length?'至少选择一个席位':incomplete?`再选 ${3-traits.length} 项特质，或清空选择。`:`首批预计 · ${arrivalText(campaignHour()+duration)}`;
}
recruitForm.addEventListener('change',renderRecruitEstimate);
renderRecruitEstimate();
$('#recruit-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const roles = form.getAll('seat');
  const title = form.get('title').trim();
  const hour = Number(form.get('startHour'));
  const endHour = Number(form.get('endHour'));
  const conditions = recruitConditions();
  if (!title || !validActivityWindow(hour,endHour) || !roles.length || roles.some(role=>!Object.hasOwn(recruitmentNames,role)) || (conditions.traits.length && conditions.traits.length !== 3) || calendar.finished) return;
  boards.recruit.unshift({title,tag:'等待首批',text:`目标档期 ${timeWindowText(hour,endHour)}`,roles,hour,endHour,...conditions,due:campaignHour()+conditions.duration,batches:[],batchIndex:0});
  currentBoard = 'recruit';
  postIndex = 0;
  $('#recruit-dialog').close();
  drawForum();
  renderPromotion();
  refreshManagerTargets();
  toast(`招募帖已发布，第一批在 ${conditions.duration} 个游戏小时后到期。`);
});

const commandLog = [];

const pictograms = {
  doc: ['..AAAAA..','..ABBBBA.','..ACCCBA.','..ABBBBA.','..ACCCBA.','..ABBBBA.','..ACCABA.','..ABBBBA.','..AAAAAA.'],
  manual: ['.AAAAAA..','.ABBBACA.','.ABBBCCCA','.ABBBBBBA','.ABDDDBBA','.ABBBBDBA','.ABDDDBBA','.ABBBBBBA','.AAAAAAAA'],
  crystal: ['....A....','...ABA...','..ABBBA..','.ABBCBBA.','ABBCDCBBA','.ABDCDDA.','..ADCDA..','...ADA...','....A....'],
  qo: ['.AAAAAAA.','ABBBBBBBA','ABBBBBBBA','ABCACACBA','ABBBBBBBA','.ABBBBBA.','..ABA.A..','..AA.....','.........'],
  cook: ['..AAAAA..','.ABBBBBA.','ABBBCBBBA','ABCBCBCBA','ABCBCBCBA','ABCBCBCBA','.ABBACBA.','...AABBA.','.....AA..'],
  nge: ['.AAAAAAAA','.ABBBBBBA','.ABCAAABA','.ABCCCABA','.ABABBABA','.ABCAAABA','.ABBBBBA.','.AAAAAA..','.........'],
};
const iconColors = {
  doc: ['#493347','#f0d4aa','#ae715b','#8d6356'],
  manual: ['#4b394b','#f5e4cb','#a6bb96','#a16f64'],
  crystal: ['#38293f','#a875ac','#f4c482','#ce8292'],
  qo: ['#6a3d44','#e7ab83','#fff1cf','#bd735c'],
  cook: ['#314b56','#86bbaa','#e9e4bc','#496b6e'],
  nge: ['#62503f','#bdb285','#fff2ce','#819278'],
};

for (const canvas of $$('[data-icon]')) {
  const id = canvas.dataset.icon;
  const context = canvas.getContext('2d');
  pictograms[id].forEach((row, y) => [...row].forEach((pixel, x) => {
    const color = iconColors[id]['ABCD'.indexOf(pixel)];
    if (!color || x > 8) return;
    context.fillStyle = color;
    context.fillRect(3 + x * 2, 3 + y * 2, 2, 2);
  }));
}

function paintWallpaper() {
  const canvas = $('#wallpaper');
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  const tiles = context.createImageData(width, height);
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const color = (a, b, mix, x, y) => mix * 16 > matrix[(y & 3) * 4 + (x & 3)] ? b : a;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let shade = color([31, 35, 57], [117, 71, 81], Math.max(0, (y - 22) / 156), x, y);
      const ridge = 150 + Math.floor(Math.sin(x * .023) * 13 + Math.sin(x * .051 + 2) * 6);
      if (y > ridge) shade = color([44, 41, 61], [77, 57, 71], (y - ridge) / 104, x, y);
      const foreground = 206 + Math.sin(x * .018 + 2) * 21 + Math.sin(x * .043) * 9;
      if (y > foreground) shade = color([30, 28, 46], [55, 39, 55], (y - foreground) / 40, x, y);
      tiles.data.set([...shade, 255], (y * width + x) * 4);
    }
  }
  context.putImageData(tiles, 0, 0);
  function shape(points, tint) {
    context.fillStyle = tint;
    context.beginPath();
    points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
    context.fill();
  }
  for (let index = 0; index < 34; index++) {
    context.fillStyle = index % 5 === 0 ? '#edb49e' : '#8e7690';
    context.fillRect(8 + ((index * 71) % 460), 11 + ((index * 37) % 116), 1 + (index % 5 === 0), 1);
  }
  shape([[117,204],[179,191],[229,195],[270,180],[340,198],[373,220],[182,233]], '#382c46');
  shape([[166,211],[205,201],[235,205],[288,193],[335,210],[349,223],[212,231]], '#503b53');
  function crystal(x, y, scale, tone) {
    const facet = (points, tint) => shape(points.map(([dx, dy]) => [x + dx * scale, y + dy * scale]), tint);
    facet([[-13,0],[-25,-48],[-5,-86],[19,-106],[32,-71],[24,-8],[7,5]], '#352d48');
    facet([[-13,-3],[-20,-47],[-1,-81],[15,-97],[11,-54],[5,0]], tone[0]);
    facet([[15,-97],[27,-71],[19,-10],[5,0],[11,-54]], tone[1]);
    facet([[-20,-47],[-1,-81],[15,-97],[11,-54]], tone[2]);
    facet([[11,-54],[23,-66],[19,-20],[15,-12]], '#f0be8a');
    facet([[-12,-41],[6,-48],[3,-35],[-8,-30]], '#e99b92');
  }
  crystal(220, 200, .56, ['#82598c','#61446e','#be829d']);
  crystal(307, 201, .72, ['#936584','#60486b','#daa09a']);
  crystal(259, 217, 1.21, ['#ad6b8c','#6b4c7d','#eeaa99']);
  shape([[193,228],[232,220],[257,226],[291,220],[332,227],[318,236],[254,242]], '#614556');
  for (const [x, y] of [[211,129],[245,71],[307,114],[278,78],[293,146],[178,173]]) {
    context.fillStyle = '#f8caa0';
    context.fillRect(x, y, 1, 5);
    context.fillRect(x - 2, y + 2, 5, 1);
  }
}

buildAppWindows();
initQo();
paintWallpaper();
seedAffinity();
drawThread();
syncLineup();
drawForum();
