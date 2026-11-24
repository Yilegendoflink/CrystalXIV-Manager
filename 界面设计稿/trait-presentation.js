'use strict';

const traitsByName=new Map(traitCatalog.map(entry=>[entry.name,entry]));
const cookTraitStage=document.querySelector('#cook-trait-stage');
const traitTooltip=document.createElement('div');
traitTooltip.id='member-trait-tooltip';traitTooltip.className='member-trait-tooltip';traitTooltip.setAttribute('role','tooltip');traitTooltip.hidden=true;
let traitAnchor=null,traitTooltipPinned=false,traitPulseTimer,traitPulseTones=new Map(),settlementTraits=[];

function hideTraitTooltip(){
  if(traitAnchor){traitAnchor.removeAttribute('aria-describedby');traitAnchor.setAttribute('aria-expanded','false');}
  traitAnchor=null;traitTooltipPinned=false;traitTooltip.hidden=true;
}
function placeTraitTooltip(){
  if(!traitAnchor)return;
  if(!traitAnchor.isConnected){hideTraitTooltip();return;}
  const rect=traitAnchor.getBoundingClientRect(),width=traitTooltip.offsetWidth,height=traitTooltip.offsetHeight;
  if(!rect.width||rect.bottom<0||rect.top>innerHeight){hideTraitTooltip();return;}
  traitTooltip.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-width-8))}px`;
  const top=rect.bottom+7+height<=innerHeight?rect.bottom+7:rect.top-height-7;
  traitTooltip.style.top=`${Math.max(8,top)}px`;
}
function showTraitTooltip(button,name,pin=false){
  if(traitTooltipPinned&&!pin&&traitAnchor!==button)return;
  if(traitAnchor!==button)hideTraitTooltip();
  const entry=traitsByName.get(name),effect=Object.hasOwn(activeTraitEffects,name)?activeTraitEffects[name]:undefined;
  const host=button.closest('dialog')??document.body;
  if(traitTooltip.parentElement!==host)host.append(traitTooltip);
  traitAnchor=button;traitTooltipPinned=pin||traitTooltipPinned;
  traitTooltip.replaceChildren();
  traitTooltip.dataset.group=entry?.group??'innate';
  element(traitTooltip,'strong',name);
  element(traitTooltip,'small',effect?'已生效':entry?'效果待接入':'暂无说明');
  element(traitTooltip,'p',effect??entry?.effect??'这项特质暂无公开效果说明。');
  traitTooltip.hidden=false;
  button.setAttribute('aria-describedby',traitTooltip.id);button.setAttribute('aria-expanded','true');
  placeTraitTooltip();
}
function mountTraitBadges(parent,names){
  for(const name of names){
    const button=element(parent,'button',name,'member-trait-badge');
    button.type='button';button.dataset.group=traitsByName.get(name)?.group??'innate';
    button.setAttribute('aria-expanded','false');
    button.onpointerenter=()=>showTraitTooltip(button,name);
    button.onpointerleave=()=>{if(!traitTooltipPinned&&traitAnchor===button&&document.activeElement!==button)hideTraitTooltip();};
    button.onfocus=()=>showTraitTooltip(button,name);
    button.onblur=()=>{if(!traitTooltipPinned&&traitAnchor===button&&!button.matches(':hover'))hideTraitTooltip();};
    button.onclick=()=>{
      if(traitTooltipPinned&&traitAnchor===button)hideTraitTooltip();
      else showTraitTooltip(button,name,true);
    };
  }
}
function mountProfileTraits(parent,member,pressureTraits){
  const section=element(parent,'section',null,'profile-traits');
  element(section,'h4','队员特质');
  const groups=[['天生特质',member.traits??(member.trait?[member.trait]:[])],['压力特质',pressureTraits]];
  for(const [label,names] of groups){
    const row=element(section,'div',null,'profile-trait-row');
    element(row,'span',label,'profile-trait-label');
    const badges=element(row,'div',null,'profile-trait-badges');
    if(names.length)mountTraitBadges(badges,names);
    else element(badges,'small','暂无记录');
  }
}
document.addEventListener('pointerdown',event=>{if(traitAnchor&&!traitAnchor.contains(event.target))hideTraitTooltip();});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&traitAnchor){event.preventDefault();event.stopImmediatePropagation();hideTraitTooltip();}
},true);
document.addEventListener('close',event=>{if(traitAnchor&&event.target.contains(traitAnchor))hideTraitTooltip();},true);
document.addEventListener('scroll',placeTraitTooltip,true);
window.addEventListener('resize',placeTraitTooltip);

function recordTraitTrigger(triggers,member,trait,effect,tone='boon'){
  triggers.push({member:member.name,trait,effect,tone});
}
function traitTriggerText(trigger){return `${trigger.member}「${trigger.trait}」发动 · ${trigger.effect}`;}
function appendTraitEvents(triggers,time){
  for(const trigger of triggers??[])appendCookEvent(traitTriggerText(trigger),time).dataset.traitTone=trigger.tone;
}
function decorateTraitPulse(card,member){
  const tone=traitPulseTones.get(member);
  if(tone)card.dataset.traitTone=tone;
  else delete card.dataset.traitTone;
}
function renderTraitPulses(){
  for(const card of $$('#cook-party .cook-party-card'))decorateTraitPulse(card,card.dataset.member);
}
function showTraitTriggers(triggers,duration=1250){
  if(!triggers?.length)return;
  clearTimeout(traitPulseTimer);traitPulseTones.clear();cookTraitStage.replaceChildren();
  for(const trigger of triggers)if(traitPulseTones.get(trigger.member)!=='curse')traitPulseTones.set(trigger.member,trigger.tone);
  for(const trigger of triggers.slice(0,3)){
    const row=element(cookTraitStage,'div',null,'cook-trait-flash');row.dataset.traitTone=trigger.tone;
    element(row,'strong',`${trigger.member} · ${trigger.trait}发动`);
    element(row,'span',trigger.effect);
  }
  if(triggers.length>3)element(cookTraitStage,'small',`另有 ${triggers.length-3} 项，见实时事件`);
  cookTraitStage.hidden=false;renderTraitPulses();
  traitPulseTimer=setTimeout(clearTraitPulse,duration);
}
function clearTraitPulse(){
  clearTimeout(traitPulseTimer);traitPulseTones.clear();cookTraitStage.hidden=true;renderTraitPulses();
}
function showSettlementTraits(){
  if(raidPlayback.active||showingResolve||resolveQueue.length||!settlementTraits.length)return;
  showTraitTriggers(settlementTraits,2400);settlementTraits=[];
}
function resetTraitPresentation(){
  hideTraitTooltip();clearTraitPulse();settlementTraits=[];
}
