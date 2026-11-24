'use strict';

const pressureMotionTime=2900;
const pressureFillTime=720;
const pressureMotionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const pressureChanges=new Map();
const pressureEffects=new Map();
const pressureMeters=new WeakMap();
let pressureFlushQueued=false,pressureExpiryTimer;

function pressurePlaybackActive(){return typeof raidPlayback!=='undefined'&&raidPlayback.active;}

function visiblePressure(member){
  if(pressurePlaybackActive()){
    const log=campaign.last;
    const opening=log?.partyStart?.[log.names.indexOf(member.name)];
    if(opening)return opening.pressure;
  }
  return pressureOf(member).value;
}

function recordPressureChange(member,from,peak,to=peak){
  if(from===peak&&peak===to)return;
  const path=pressureChanges.get(member.name)??[from];
  for(const value of [from,peak,to])if(path.at(-1)!==value)path.push(value);
  pressureChanges.set(member.name,path);
  if(pressurePlaybackActive()||pressureFlushQueued)return;
  pressureFlushQueued=true;
  queueMicrotask(()=>{pressureFlushQueued=false;releasePressureEffects();});
}

function releasePressureEffects(){
  if(pressurePlaybackActive()||(typeof resolveQueue!=='undefined'&&resolveQueue.length))return;
  const now=performance.now();
  for(const [name,path] of pressureChanges){
    let rise=0,fall=0;
    for(let i=1;i<path.length;i++){
      const difference=path[i]-path[i-1];
      if(difference>0)rise+=difference;
      else fall-=difference;
    }
    pressureEffects.set(name,{path,rise,fall,started:now});
  }
  pressureChanges.clear();
  refreshPressureMeters();
  schedulePressureExpiry();
}

function schedulePressureExpiry(){
  clearTimeout(pressureExpiryTimer);
  const now=performance.now();
  for(const [name,effect] of pressureEffects)if(now-effect.started>=pressureMotionTime)pressureEffects.delete(name);
  if(!pressureEffects.size)return;
  const first=Math.min(...[...pressureEffects.values()].map(effect=>effect.started));
  pressureExpiryTimer=setTimeout(()=>{schedulePressureExpiry();refreshPressureMeters();},Math.max(1,first+pressureMotionTime-now));
}

function resetPressureEffects(){
  pressureChanges.clear();pressureEffects.clear();clearTimeout(pressureExpiryTimer);
}

function mountPressureMeter(parent,member,size='regular'){
  const root=element(parent,'span',null,`pressure-meter pressure-meter-${size}`);
  root.dataset.member=member.name;
  const readout=element(root,'span',null,'pressure-readout');
  element(readout,'span','压力','pressure-label');
  const value=element(readout,'strong',null,'pressure-value');
  const band=element(readout,'span',null,'pressure-status');band.hidden=true;
  const deltas=element(readout,'span',null,'pressure-deltas');
  const rise=element(deltas,'span',null,'pressure-delta pressure-rise');
  const fall=element(deltas,'span',null,'pressure-delta pressure-fall');
  const track=element(root,'span',null,'pressure-track');
  track.setAttribute('role','meter');track.setAttribute('aria-label',`${member.name}的压力`);
  track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
  const fill=element(track,'span',null,'pressure-fill');
  const flare=element(track,'span',null,'pressure-flare');
  const sparks=element(track,'span',null,'pressure-sparks');
  const meter={root,member,value,band,rise,fall,track,fill,flare,sparks,effect:null,animations:[]};
  pressureMeters.set(root,meter);
  paintPressureMeter(meter);
}

function refreshPressureMeters(){
  for(const root of $$('.pressure-meter')){
    const meter=pressureMeters.get(root);
    if(meter)paintPressureMeter(meter);
  }
}

function paintPressureMeter(meter){
  const {root,member,value,band,rise,fall,track,fill,flare,sparks}=meter;
  const pressure=visiblePressure(member);
  const status=pressure>=85?'高压':pressure<30?'低压':'';
  root.dataset.band=pressure>=85?'high':pressure<30?'low':'normal';
  value.textContent=String(pressure);band.textContent=status;band.hidden=!status;
  track.setAttribute('aria-valuenow',String(pressure));
  track.setAttribute('aria-valuetext',status?`${pressure}，${status}`:String(pressure));
  fill.style.width=`${pressure}%`;

  const change=pressurePlaybackActive()?undefined:pressureEffects.get(member.name);
  const age=change?performance.now()-change.started:pressureMotionTime;
  const effect=age<pressureMotionTime?change:null;
  if(meter.effect===effect){if(!effect)rise.hidden=fall.hidden=true;return;}
  meter.effect=effect;
  meter.animations.forEach(animation=>animation.cancel());meter.animations=[];
  rise.hidden=!effect?.rise;fall.hidden=!effect?.fall;
  if(!effect){delete root.dataset.motion;return;}
  const {path}=effect;
  rise.textContent=`↑ +${Math.round(effect.rise*10)/10}`;fall.textContent=`↓ −${Math.round(effect.fall*10)/10}`;
  root.dataset.motion=effect.rise?(effect.fall?'mixed':'rise'):'fall';
  const left=Math.min(...path),right=Math.max(...path);
  flare.style.left=`${left}%`;flare.style.width=`${right-left}%`;
  if(pressureMotionPreference.matches)return;
  const launch=(node,frames,duration,easing)=>{
    if(age>=duration)return;
    const animation=node.animate(frames,{duration,easing});
    animation.currentTime=age;meter.animations.push(animation);
  };
  launch(fill,path.map(amount=>({width:`${amount}%`})),pressureFillTime,'ease-out');
  launch(flare,[{opacity:.88},{opacity:.5,offset:.38},{opacity:0}],950,'ease-out');
  launch(sparks,path.map((amount,i)=>({left:`${Math.max(2,Math.min(98,amount))}%`,opacity:i===path.length-1?0:.95})),1000,'steps(9,end)');
}
