'use strict';

const managerTime=$('#manager-time');
const managerJumps=$('#manager-jumps');
const jumpToggle=$('#manager-jump');
const managerAdvance=$('#manager-advance');
const managerNumber=new Intl.NumberFormat('zh-CN');
const managerReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const finalOfficeHour=20*24+daySlots.at(-1);
let managerClockAnimation;

function renderManagerClock(){
  let {day,hour}=calendar;
  let minutes=playingCrystal?campaign.minutes:0;
  const log=raidPlayback.active?campaign.last:null;
  if(log){
    const step=log.steps[raidPlayback.index];
    day=Math.floor((log.started-10)/24)+1;
    const elapsed=Math.round((log.started-(day-1)*24)*60)+(step?2+Math.floor(step.seconds/60):0);
    hour=Math.floor(elapsed/60);minutes=elapsed%60;
  }else{
    hour+=Math.floor(minutes/60);minutes%=60;
  }
  const time=timeText(hour).slice(0,-2)+String(minutes).padStart(2,'0');
  $('#manager-day').textContent=`第 ${day} 天${hour>=24?' · 次日凌晨':''}`;
  if(managerTime.textContent===time)return;
  managerTime.textContent=time;managerTime.dateTime=time;
  if(!managerReducedMotion.matches&&managerTime.getClientRects().length){
    managerClockAnimation?.cancel();
    managerClockAnimation=managerTime.animate([
      {opacity:.55,transform:'translateY(3px)',color:'#fff6d3'},
      {opacity:1,transform:'translateY(0)',color:'#ffe1af'}
    ],{duration:220,easing:'ease-out'});
  }
}

function nextRaidHour(){
  return Math.max(7*24+20,(calendar.day-1)*24+(calendar.hour<20?20:44));
}

function nextOfficeHour(hour){
  const day=Math.floor((hour-10)/24);
  return day*24+(daySlots.find(slot=>slot>=hour-day*24)??34);
}

function officeStamp(hour){
  const day=Math.floor((hour-10)/24);
  return `第 ${day+1} 天 · ${activityTime(hour-day*24)}`;
}

function managerTargets(){
  const recruit=activePosts().reduce((earliest,post)=>!earliest||post.due<earliest.due?post:earliest,null);
  return {
    raid:{hour:nextRaidHour()},
    recruit:{hour:recruit?nextOfficeHour(recruit.due):null,post:recruit},
    morning:{hour:calendar.day*24+10}
  };
}

function jumpAvailable(hour){
  return !calendarLocked()&&!calendar.finished&&Number.isFinite(hour)&&hour>absoluteHour()&&hour<=finalOfficeHour;
}

function refreshManagerTargets(){
  const targets=managerTargets();
  $('#fast-forward').disabled=!jumpAvailable(targets.raid.hour);
  for(const button of $$('[data-time-target]')){
    const key=button.dataset.timeTarget,{hour}=targets[key];
    button.disabled=!jumpAvailable(hour);
    button.querySelector('strong').textContent=hour===null?'暂无招募帖':hour>finalOfficeHour?'本轮无后续':officeStamp(hour);
  }
  jumpToggle.disabled=Object.values(targets).every(({hour})=>!jumpAvailable(hour));
  if(jumpToggle.disabled)setManagerJump(false);
}

function renderManagerTool(phase,locked){
  renderManagerClock();
  $('#manager-phase').textContent=locked?(sessionForToday()?.decision&&!raidPlayback.active?'待决定收队':'开荒进行中'):phase;
  $('.manager-tool').dataset.raid=String(locked);
  $('#manager-gil').textContent=managerNumber.format(campaign.gil);
  managerAdvance.querySelector('span').textContent=locked?'去 Cook':'下一时段';
  managerAdvance.disabled=calendar.finished&&!locked;
  managerAdvance.title=locked?'打开 Cook 指挥台':calendar.finished?'本轮挑战已结束':'推进到下一活动时段';
  refreshManagerTargets();
}

function setManagerJump(open,restoreFocus=false){
  managerJumps.hidden=!open;
  jumpToggle.setAttribute('aria-expanded',String(open));
  if(open)managerJumps.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  else if(restoreFocus&&!jumpToggle.disabled)jumpToggle.focus({preventScroll:true});
}

function fastForwardCalendar(target){
  if(!jumpAvailable(target))return false;
  while(absoluteHour()<target&&!calendar.finished){
    if(!advanceCalendar('wait'))return false;
  }
  if(playingCrystal)persistCrystal();
  return true;
}

managerAdvance.onclick=()=>{
  if(calendarLocked())return showApp('cook');
  if(advanceCalendar('wait'))toast($('#calendar-feedback').textContent);
};
jumpToggle.onclick=()=>setManagerJump(managerJumps.hidden,!managerJumps.hidden);
$('#fast-forward').onclick=()=>fastForwardCalendar(nextRaidHour());
managerJumps.addEventListener('click',event=>{
  const button=event.target.closest('[data-time-target]');
  if(!button||button.disabled)return;
  const {hour,post}=managerTargets()[button.dataset.timeTarget];
  setManagerJump(false,true);
  if(!fastForwardCalendar(hour))return;
  if(post){
    currentBoard='recruit';postIndex=boards.recruit.indexOf(post);drawForum();showApp('nge');
  }
  toast(`已推进至 ${officeStamp(hour)}。`);
});
document.addEventListener('click',event=>{
  if(!managerJumps.hidden&&!event.target.closest('#manager-jump, #manager-jumps'))setManagerJump(false);
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!managerJumps.hidden)setManagerJump(false,true);
});
