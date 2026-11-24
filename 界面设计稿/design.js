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
};
const opened = new Set();
const appWindows = new Map();
const windowStack = [];
let activeApp = null;
let toastTimer;
const daySlots = [10, 12, 14, 16, 18, 20, 22, 24];
const timeText = hour => `${String(hour % 24).padStart(2, '0')}:00`;
const activityTime = hour => `${hour >= 24 ? '次日 ' : ''}${timeText(hour)}`;
const windowEndText = hour => hour === 24 ? '24:00' : activityTime(hour);
const slotText = hour => `${activityTime(hour)}–${hour >= 24 ? timeText(hour + 2) : windowEndText(hour + 2)}`;
const absoluteHour = () => (calendar.day - 1) * 24 + calendar.hour;
let calendar = { day: 7, hour: 18, finished: false };
function randomValue() { return playingCrystal ? combatRandom() : Math.random(); }
const energy = new Map();
const pressures = new Map();
const pressureChecks = [];
const affinityValues = new Map();
let latestAffinityEvent = '';
let previousWipe = null;
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

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2700);
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
function available(member) { return (member.hours ?? [20, 22, 24]).includes(calendar.hour); }
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
    return;
  }
  const mood = randomValue() < 0.5 ? 'collapse' : 'faith';
  const result = pressureResults[mood];
  const trait = result.traits[Math.floor(randomValue() * result.traits.length)];
  pressures.set(member.name, { ...state, value: result.reset, until: at + 48, mood, traits: [...new Set([...state.traits, trait])] });
  const check = { name: member.name, role: member.role, mood, label: result.label, trait };
  pressureChecks.push(check);
  queueResolveFilm(check);
}

function trialPressure(result, at) {
  if (result === 'progress') {
    previousWipe = null;
    for (const member of lineup()) changePressure(member, -12, at);
    return '推进新机制，全队压力 −12。';
  }
  const attempts = result === 'repeat' ? 4 : 1;
  for (let index = 0; index < attempts; index++) {
    const increase = previousWipe === '火狱之楔' ? 20 : 8;
    for (const member of lineup()) changePressure(member, increase, at);
    previousWipe = '火狱之楔';
  }
  return `在火狱之楔团灭 ${attempts} 把，已按是否连续失败结算压力。`;
}

function duringAppointment() {
  const session=playingCrystal&&typeof campaign!=='undefined'?sessionForToday():null;
  return !session?.ended && !calendar.finished && calendar.day >= 8 && calendar.hour >= 20 && calendar.hour < (session?.end??appointmentEnd);
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

function combatAffinityEvent(result, participants, actor) {
  if (result === 'none') return;
  if (result === 'rescue') {
    const rescuer = actor ?? participants[0];
    const observers = [...rosterMembers().values()].filter(member => member.name !== rescuer.name);
    observers.forEach(member => changeAffinity(member, rescuer, 6));
    latestAffinityEvent = `${rescuer.name}成功救场，其他 ${observers.length} 名队员对其好感 +6。`;
  } else if (result === 'injury') {
    const target = actor ?? participants[4];
    const healers = participants.filter(member => member.role.startsWith('H') && member.name !== target.name);
    const changes = healers.map(healer => changeAffinity(healer, target, -5));
    latestAffinityEvent = `${target.name}吃到意外伤害。${changes.join('、')}。`;
  } else {
    const first = participants[Math.floor(randomValue() * participants.length)];
    const peers = participants.filter(member => member.name !== first.name);
    const second = peers[Math.floor(randomValue() * peers.length)];
    if (randomValue() < 0.5) {
      changeAffinity(first, second, 4);
      changeAffinity(second, first, 4);
      latestAffinityEvent = `${first.name}与${second.name}配合顺利，好感各 +4。`;
    } else {
      latestAffinityEvent = `语音沟通出现摩擦。${changeAffinity(first, second, -6)}。`;
    }
  }
}

function settleRelationshipPressure(participants, start, ticks = 4) {
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
    const interaction = randomValue() < 0.5 ? '互相提醒了一次走位。' : '希望下一次继续同组。';
    addMessage('team', `${first.name}和${second.name}${interaction}`);
  }
  if (enemies.length) {
    const [first, second] = enemies[0];
    const interaction = randomValue() < 0.5 ? '为报点顺序发生了争执。' : '希望暂时由第三人转述交接。';
    addMessage('team', `${first.name}和${second.name}${interaction}`);
  }
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
    if (duringAppointment() && remainingRaidMinutes() < maximumPullMinutes) return '距预约结束时间不足以开下一把。';
  }
  if (calendar.finished) return '本轮挑战已结束。';
  if (calendar.day < 8) return '准备阶段 · 第 8 天解锁挑战。';
  if (readyCount() < 8) return `目前 ${readyCount()}/8 席就绪，请从 NGE 招齐八个位置。`;
  if (!duringAppointment()) return `本时段未预约，晚间约定为 20:00–${windowEndText(appointmentEnd)}。`;
  const missing = lineup().filter(member => !available(member));
  return missing.length ? `本时段无法出勤 · ${missing.map(member => member.role).join('、')}` : '';
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
  slots.replaceChildren();
  for (const hour of daySlots) {
    const slot = element(slots, 'li', slotText(hour));
    if (!calendar.finished && hour === calendar.hour) slot.setAttribute('aria-current', 'time');
    if (hour >= 20) slot.dataset.evening = 'true';
  }
  const block = challengeBlock();
  const tired = lineup().filter(member => member && energyOf(member) <= 50).map(member => member.role);
  $('#challenge-note').textContent = block || `八席均可出战。${tired.length ? `疲劳席位 · ${tired.join('、')}` : '八席精力正常。'}`;
  const arrivalCount = lineup().filter(gameOnline).length;
  const attendance = playingCrystal&&typeof campaign!=='undefined'&&raidPlayback.active?'本把进行中 · 指挥与事件播报已同步':playingCrystal&&typeof campaign!=='undefined'&&campaign.clear?'已首通 · 可查看本把战报与回放':duringAppointment() ? `游戏及语音到场 ${arrivalCount}/8 · ${arrivalCount === 8 ? '等待经理开怪' : '等待缺席席位'}`
    : `晚间预约 20:00–${windowEndText(appointmentEnd)} · 约定结束后离开游戏和语音`;
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
  $('#desk-context').textContent = calendar.finished?'挑战已结束':calendar.day<8?'下一步 · 组建队伍':`开荒预约 · 20:00–${windowEndText(sessionForToday()?.end??appointmentEnd)}`;
  $('#session-end').disabled = calendar.finished || locked;
  renderPromotion();
  $$('[data-clock-action]').forEach(button => {
    button.disabled = calendar.finished || (button.dataset.clockAction === 'raid' ? Boolean(block) : Boolean(locked)) ||
      (button.dataset.clockAction === 'promote' && !promotionTarget()) || (button.dataset.clockAction === 'talk' && !target.value);
  });
  $('#open-recruit').disabled = calendar.finished;
  $('#qo-confirm').disabled = calendar.finished;
  if(playingCrystal&&typeof campaign!=='undefined')refreshCookControls();
  if(typeof renderManagerTool==='function')renderManagerTool(phase,locked);
  renderRecruitCountdowns();
}

function advanceCalendar(action, post = action === 'promote' ? promotionTarget() : undefined, fromRaid = false) {
  if (calendar.finished || (action === 'raid' && challengeBlock())) return;
  if (playingCrystal && action === 'raid') {
    if ($('#calendar-dialog').open) $('#calendar-dialog').close();
    resolveCampaignPull();
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
  let feedback = { wait: '已推进到下一时段。', intel: '已分析下一段副本情报。', scout: '候选档案已核实。' }[action];
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
  if (before === 0 && after > 0) feedback += ` ${after} 席已到场，等待指挥。`;
  if (before > 0 && after === 0) feedback += ' 到约定结束时间，队员已离开游戏与语音。';
  if (pressureChecks.length > checkCount) feedback += ` ${pressureChecks.length - checkCount} 次压力检定可在 Cook 查看。`;
  $('#calendar-feedback').textContent = feedback;
  if (playingCrystal && typeof campaign !== 'undefined') campaign.minutes = 0;
  updateRecruitments();
  renderCalendar();
  drawVoice();
  return true;
}

$$('[data-clock-action]').forEach(button => button.addEventListener('click', () => advanceCalendar(button.dataset.clockAction)));
$('#session-end').addEventListener('change', event => {
  appointmentEnd = Number(event.target.value);
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

function addMessage(thread, text, incoming = true) {
  if(incoming)receiveQo(thread,['队','队务','刚刚',text]);
  else {
    threads[thread] ??= [];
    threads[thread].push(['经','经理','刚刚',text]);
  }
  drawQoBadges();
  if(opened.has('qo'))drawQoSessions();
  if (thread === currentThread) drawThread();
}

function drawThread() {
  const target = $('#qo-messages');
  target.replaceChildren();
  const team = currentThread === 'team';
  const member = directMember();
  $('#qo-thread-title').textContent = team ? '炎帝陵固定队' : member ? displayName(member) : currentThread === 'backup' ? '雀斑' : currentThread.slice(3);
  $('#qo-thread-note').textContent = team ? '队伍群聊 · 预定晚间开荒' : member ? `私聊 · ${member.role} · 压力 ${pressureOf(member).value}` : '历史私聊';
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
  addMessage(currentThread, text, false);
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
  addMessage('team', message);
  syncLineup();
  toast(message);
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
    const opening=live?.partyStart[live.names.indexOf(member.name)];
    const elapsed=live ? Math.min(live.minutes*60,120+(live.steps[raidPlayback.index]?.seconds??0)) : 0;
    const pressure=opening?.pressure??pressureOf(member).value;
    const stamina=Math.round(opening?Math.max(0,opening.energy-elapsed*25/3600):energyOf(member));
    for(const [label,value,kind] of [['压力',pressure,'pressure'],['精力',stamina,'energy']]){
      const row=element(card,'div',null,'cook-party-meter '+kind);
      if(kind==='pressure'?value>=85||value<30:value<=50)row.dataset.warning='true';
      element(row,'span',label);element(row,'strong',String(value));
      const bar=element(row,'progress',null);bar.max=100;bar.value=value;
      bar.setAttribute('aria-label',member.name+'的'+label);
    }
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
  const high = lineup().find(member => member && pressureOf(member).value >= 85);
  const low = lineup().find(member => member && pressureOf(member).value < 30);
  $('#cook-advice').textContent = high ? `${high.role} ${high.name}压力偏高，日程中可安排对谈。`
    : low ? `${low.role} ${low.name}压力偏低，可通过对谈明确下一把目标。` : '查看精力和临时状态，决定下一时段的安排。';
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
    const pressure = element(card, 'div', null, `pressure${state.value >= 85 ? ' high' : ''}`);
    element(pressure, 'span', '压力');
    element(pressure, 'strong', `${state.value}${state.value < 30 ? ' 低' : state.value >= 85 ? ' 高' : ''}`);
    const meter = element(card, 'progress', null);
    meter.value = state.value;
    meter.max = 100;
    meter.setAttribute('aria-label', `${member.name}的压力`);
    const remaining = energyOf(member);
    element(card, 'p', `精力 ${Math.round(remaining)}/100 · ${energyLabel(remaining)}`, remaining <= 50 ? 'energy-low' : undefined);
    element(card, 'p', `实战发挥 ${Math.round(battleFactor(member) * 100)}%`);
    if (mood) element(card, 'p', `${mood.label} · 剩 ${Math.ceil(state.until - absoluteHour())} 小时`, 'mood-label');
    if (state.traits.length) element(card, 'p', `特质 · ${state.traits.join('、')}`);
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

$('#cook-rest').addEventListener('click', () => {
  addMessage('team', 'Cook 状态提示：建议大家先短休，再确认减伤分工。');
  toast('短休建议已出现在 QO 群聊。');
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
    const button = element(reserveList,'button',displayName(member),'plain');
    button.type = 'button';
    button.onclick = () => openMemberProfile(member);
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
  appointmentEnd = 24;
  $('#session-end').value = '24';
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

function createCandidate(post, seat) {
  const names = recruitmentNames[seat];
  const taken = name => candidateFiles.has(name) || rosterMembers().has(name) || (name === reserve.name && !recruitedStart);
  const unused = names.filter(name => !taken(name));
  const ordinal = Math.floor(randomValue() * names.length);
  let sequence = candidateFiles.size + 1;
  let name = unused[ordinal % unused.length] ?? `${names[ordinal]}·${sequence}`;
  while (taken(name)) name = `${names[ordinal]}·${++sequence}`;
  const preferred = post.traits?.length ? post.traits : innateTraits;
  const firstTrait = preferred[Math.floor(randomValue() * preferred.length)];
  const another = innateTraits.filter(trait => trait !== firstTrait);
  const traits = randomValue() < .4 ? [firstTrait, another[Math.floor(randomValue()*another.length)]] : [firstTrait];
  const hours = ordinal < 2 ? [20, 22, 24] : ordinal < 4 ? [20, 22] : ordinal < 6 ? [22, 24] : [14, 20];
  if (post.hour !== undefined && !hours.includes(post.hour)) hours.push(post.hour);
  const candidate = {
    role: seat, name, gender: ordinal % 2 === 0 ? '女' : '男', pressure: 40 + ordinal,
    hours: hours.sort((a,b) => a-b),
    ...rollRecruitAttributes(post, randomValue), revealed: false, contact: ordinal % 2 === 0,
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
  for (const post of activePosts()) {
    const roles = recruitSeats(post);
    while (!calendar.finished && Math.round(post.due*60) <= now) {
      const count = 2 + Math.floor(randomValue() * 4);
      const offset = post.batches.reduce((total,batch)=>total+batch.length,0);
      const candidates = Array.from({ length: count }, (_,i) => createCandidate(post, roles[(offset+i)%roles.length]));
      post.batches.push(candidates);
      post.batchIndex = post.batches.length - 1;
      post.due += post.duration ?? 6;
      updated=true;
    }
  }
  if ((updated||calendar.finished) && currentBoard === 'recruit') drawForum();
}

function enroll(candidate) {
  if (calendar.finished || joined.has(candidate.name) || rosterSize() >= rosterLimit) return;
  joined.set(candidate.name, candidate);
  if (!recruitedStart && !backupMember && candidate.role === 'H2') backupMember = candidate;
  addMessage('team', `NGE 招募：${candidate.role} ${candidate.name}已入队。`);
  syncLineup();
  drawForum();
  toast(`${candidate.name}已入队，队伍 ${rosterSize()}/${rosterLimit} 人。`);
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
    element(body, 'small', candidate.hours.map(slotText).join(' / '));
    element(body, 'small', candidate.revealed
      ? `执行 ${candidate.execution} · 特质 ${candidate.trait}` : `执行约 ${Math.max(0,candidate.execution - 7)}–${Math.min(100,candidate.execution + 7)} · 特质待核实`);
    if (candidate.revealed) {
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
  recruitForm.elements.quality.disabled = !recruitForm.elements.attribute.value;
  const {traits,duration} = recruitConditions();
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
  const time = form.get('time').trim();
  const hour = daySlots.find(value => slotText(value) === time);
  const conditions = recruitConditions();
  if (!title || hour === undefined || !roles.length || roles.some(role=>!Object.hasOwn(recruitmentNames,role)) || (conditions.traits.length && conditions.traits.length !== 3) || calendar.finished) return;
  boards.recruit.unshift({title,tag:'等待首批',text:`目标档期 ${time}`,roles,hour,...conditions,due:campaignHour()+conditions.duration,batches:[],batchIndex:0});
  currentBoard = 'recruit';
  postIndex = 0;
  $('#recruit-dialog').close();
  drawForum();
  renderPromotion();
  refreshManagerTargets();
  toast(`招募帖已发布，第一批在 ${conditions.duration} 个游戏小时后到期。`);
});

const commandLog = [];

$('#cook-short-rest').addEventListener('click', event => {
  const message = event.currentTarget.textContent;
  if (playingCrystal) {
    if (!canUseRaidBreak(10)) return;
    const at=campaignHour()+10/60;
    lineup().filter(gameOnline).forEach(member => changePressure(member, -5, at));
    advanceRaidMinutes(10);
    renderCalendar();drawVoice();
  }
  commandLog.unshift(message);
  appendCookEvent('指挥 · '+message);
  addMessage('team', `Cook 指挥：${message}。`);
  if(playingCrystal)persistCrystal();
  toast('已记录提示，并同步到 QO。');
});

const pictograms = {
  doc: ['..AAAAA..','..ABBBBA.','..ACCCBA.','..ABBBBA.','..ACCCBA.','..ABBBBA.','..ACCABA.','..ABBBBA.','..AAAAAA.'],
  crystal: ['....A....','...ABA...','..ABBBA..','.ABBCBBA.','ABBCDCBBA','.ABDCDDA.','..ADCDA..','...ADA...','....A....'],
  qo: ['.AAAAAAA.','ABBBBBBBA','ABBBBBBBA','ABCACACBA','ABBBBBBBA','.ABBBBBA.','..ABA.A..','..AA.....','.........'],
  cook: ['..AAAAA..','.ABBBBBA.','ABBBCBBBA','ABCBCBCBA','ABCBCBCBA','ABCBCBCBA','.ABBACBA.','...AABBA.','.....AA..'],
  nge: ['.AAAAAAAA','.ABBBBBBA','.ABCAAABA','.ABCCCABA','.ABABBABA','.ABCAAABA','.ABBBBBA.','.AAAAAA..','.........'],
};
const iconColors = {
  doc: ['#493347','#f0d4aa','#ae715b','#8d6356'],
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
