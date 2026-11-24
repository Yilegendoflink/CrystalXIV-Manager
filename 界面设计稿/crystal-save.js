'use strict';

let storageDB, storageReady=false, runningCampaign=false, selectedSlot=1;
let lastWritten='', saveQueue=Promise.resolve(), saveConflict=false;
const slots=new Map();
const legacySlots=new Map();
const recruitSurchargeByMinimum = new Map([
  [70, 2], [80, 4],
  ...Object.values(recruitGrades).map(({minimum, extra}) => [minimum, extra]),
]);
function captureCampaign(){
  return {
    game:'ff-crystal',version:1,time:new Date().toISOString(),
    data:{campaign,calendar,energy:[...energy],pressures:[...pressures],pressureChecks,previousWipe,appointmentStart,appointmentEnd,
      affinities:[...affinityValues].map(([name,row])=>[name,[...row]]),latestAffinityEvent,
      candidates:[...candidateFiles.values()],joined:[...joined.values()],backup:backupMember?.name??null,
      recruitedStart,starters:[...selectedStarters],
      qo:{nicknames:[...qoNicknames],requests:[...qoRequests.values()],removedVeterans:[...removedVeterans],unread:[...qoUnread],sort:$('#qo-sort').value},
      posts:boards.recruit,messages:threads,commands:commandLog}
  };
}
function validateCampaign(save){
  const d=save?.data,c=d?.campaign;
  if(save?.game!=='ff-crystal'||save.version!==1||!c||!Number.isInteger(c.seed)||!Number.isInteger(c.minutes)||c.minutes<0||c.minutes>=120||
     !Number.isInteger(d.calendar?.day)||d.calendar.day<1||d.calendar.day>21||![...daySlots,26].includes(d.calendar.hour)||
     !validActivityWindow(d.appointmentStart??20,d.appointmentEnd)||!c.plan||!c.mastery||
     !['energy','pressures','pressureChecks','affinities','candidates','joined','posts','commands'].every(k=>Array.isArray(d[k]))||
     !Array.isArray(d.messages?.team)||!Array.isArray(d.messages?.backup))throw new Error('存档格式或版本不兼容。');
  if(!Number.isSafeInteger(c.attempts)||c.attempts<0||!Number.isSafeInteger(c.revision)||c.revision<1||
    !Number.isInteger(c.best)||c.best<0||c.best>22||typeof c.clear!=='boolean'||typeof d.calendar.finished!=='boolean'||
    d.commands.some(msg=>typeof msg!=='string'))throw new Error('挑战记录损坏。');
  if(c.session!==undefined&&(!c.session||!Number.isInteger(c.session.day)||c.session.day<8||c.session.day>21||
    !recruitEndHours.includes(c.session.end)||!recruitEndHours.includes(c.session.originalEnd)||
    !Number.isInteger(c.session.elapsed)||c.session.elapsed<0||!Number.isInteger(c.session.nextDecision)||
    c.session.nextDecision<120||typeof c.session.decision!=='boolean'||typeof c.session.ended!=='boolean'))throw new Error('开荒时段记录损坏。');
  if(c.discovery!==undefined&&(!c.discovery||Array.isArray(c.discovery)||typeof c.discovery!=='object'||
    Object.entries(c.discovery).some(([id,value])=>!guideNodeIds.includes(id)||!Number.isFinite(value)||value<0||value>100)))throw new Error('机制探明记录无效。');
  if(c.gil!==undefined&&(!Number.isSafeInteger(c.gil)||c.gil<0))throw new Error('Gil 余额无效。');
  for(const [key,slot] of Object.entries(c.plan)){
    const parts=/^(\d+)-(\d+)(?:#(\d+))?$/.exec(key);
    const mechanic=parts&&phases[parts[1]]?.[parts[2]];
    const allowed=mechanic&&(parts[3]?supportingJobs[mechanic][Number(parts[3])-1]?.[2]:jobs[mechanic][3]);
    if(!allowed?.includes(slot))throw new Error('攻略职责数据无效。');
  }
  for(const member of [...d.candidates,...d.joined])if(!member||typeof member.name!=='string'||!seats.some(m=>m.role===member.role)||
    (member.hours!==undefined&&(!Array.isArray(member.hours)||member.hours.some(hour=>!daySlots.includes(hour)))))throw new Error('队员档案无效。');
  const qo=d.qo;
  if(qo!==undefined && (!qo || !Array.isArray(qo.removedVeterans)||new Set(qo.removedVeterans).size!==qo.removedVeterans.length||
    qo.removedVeterans.some(name=>!seats.some(member=>member.name===name))||
    !Array.isArray(qo.nicknames)||qo.nicknames.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||typeof row[1]!=='string'||row[1].length>14)||
    !Array.isArray(qo.requests)||qo.requests.some(item=>!item||typeof item.name!=='string'||!['start','support'].includes(item.kind)||!['pending','accepted','declined'].includes(item.state))))throw new Error('QO 队务记录无效。');
  const veterans=d.recruitedStart?[]:seats.filter(member=>!qo?.removedVeterans.includes(member.name));
  const existingCount = veterans.length;
  if((d.recruitedStart!==undefined&&typeof d.recruitedStart!=='boolean')||
    existingCount+d.joined.length>rosterLimit||new Set(d.joined.map(m=>m.name)).size!==d.joined.length||
    (d.backup&&!d.joined.some(m=>m.name===d.backup&&m.role==='H2'))||
    (d.starters!==undefined&&(!Array.isArray(d.starters)||d.starters.some(entry=>
      !Array.isArray(entry)||entry.length!==2||![...d.joined,...veterans].some(member=>member.role===entry[0]&&member.name===entry[1])
    ))))throw new Error('队伍名单无效。');
  if(Object.entries(d.messages).some(([key,rows])=>
    (!['team','backup'].includes(key)&&!key.startsWith('dm:'))||!Array.isArray(rows)||
    rows.some(row=>!Array.isArray(row)||row.length!==4||row.some(value=>typeof value!=='string'))))throw new Error('会话记录无效。');
  if(qo?.unread!==undefined&&(!Array.isArray(qo.unread)||qo.unread.some(row=>!Array.isArray(row)||row.length!==2||
    typeof row[0]!=='string'||!Object.hasOwn(d.messages,row[0])||!Number.isSafeInteger(row[1])||row[1]<1||row[1]>d.messages[row[0]].length)))throw new Error('QO 未读记录无效。');
  if(qo?.sort!==undefined&&!['default','unread'].includes(qo.sort))throw new Error('QO 会话排序无效。');
  if(!d.energy.every(row=>Array.isArray(row)&&typeof row[0]==='string'&&Number.isFinite(row[1])&&row[1]>=0&&row[1]<=100))throw new Error('精力记录无效。');
  for(const member of Object.values(c.mastery)){
    if(!member||typeof member!=='object'||Object.entries(member).some(([k,m])=>!Object.hasOwn(jobs,k)||!m||!['s','m','o'].every(a=>Number.isFinite(m[a])&&m[a]>=0&&m[a]<=100)))throw new Error('机制熟练度无效。');
  }
  for(const [name,record] of d.pressures)if(typeof name!=='string'||!Number.isFinite(record?.value)||record.value<0||record.value>100||!Number.isFinite(record.until)||(record.encouragedUntil!==undefined&&!Number.isFinite(record.encouragedUntil))||![null,'faith','collapse'].includes(record.mood)||!Array.isArray(record.traits)||record.traits.some(t=>typeof t!=='string'))throw new Error('队员状态无效。');
  for(const [name,rows] of d.affinities)if(typeof name!=='string'||!Array.isArray(rows)||rows.some(r=>!Array.isArray(r)||r.length!==2))throw new Error('好感记录无效。');
  for(const post of d.posts){
    if(!post||typeof post.title!=='string')throw new Error('招募记录无效。');
    if(!post.batches)continue;
    const roles=recruitSeats(post);
    if(!Array.isArray(roles)||!roles.length||new Set(roles).size!==roles.length||roles.some(role=>!Object.hasOwn(recruitmentNames,role))||!Number.isFinite(post.due)||post.due<0||
      !Array.isArray(post.batches)||post.batches.some(batch=>!Array.isArray(batch)||batch.some(m=>!m||!d.candidates.some(c=>c.name===m.name&&roles.includes(c.role))))||
      (post.batches.length&&(!Number.isInteger(post.batchIndex)||!post.batches[post.batchIndex])))throw new Error('招募记录无效。');
    if(post.endHour!==undefined&&!validActivityWindow(post.hour,post.endHour))throw new Error('招募档期无效。');
    if(post.duration!==undefined&&(
      !daySlots.includes(post.hour)||!Array.isArray(post.traits)||![0,3].includes(post.traits.length)||
      new Set(post.traits).size!==post.traits.length||post.traits.some(trait=>!innateTraits.includes(trait))||
      (post.attribute ? !Object.hasOwn(recruitAttributes,post.attribute)||!recruitSurchargeByMinimum.has(post.minimum) : post.minimum!==0)||
      post.duration!==4+(post.traits.length?2:0)+(recruitSurchargeByMinimum.get(post.minimum)??0)
    ))throw new Error('招募条件无效。');
  }
  const log=c.last;
  if(log&&(!Array.isArray(log.names)||log.names.length!==8||!Array.isArray(log.steps)||!log.steps.length||
    log.steps.some(s=>!s||phases[s.p]?.[s.i]!==s.key||!Number.isInteger(s.slot)||s.slot<0||s.slot>7||(s.work&&!Array.isArray(s.work)))))throw new Error('战报无效。');
  const normalized=structuredClone(save);
  normalized.data.campaign.gil??=0;
  if(c.discovery===undefined){
    const reached=Math.max(c.best,log?.steps.length??0);
    normalized.data.campaign.discovery=Object.fromEntries(guideNodeIds.slice(0,reached).map(id=>[
      id,Object.keys(c.plan).some(work=>work===id||work.startsWith(id+'#'))?30:0
    ]));
  }
  delete normalized.data.campaign.call;
  normalized.data.commands=normalized.data.commands.filter(msg=>!/^提醒(?:换坦|转火)(?:（下把）)?$/.test(msg));
  return normalized;
}
function restoreCampaign(save){
  const {data:d}=validateCampaign(save);
  resetScenario(d.calendar, d.recruitedStart === true);campaign=d.campaign;
  for(const entry of d.energy)energy.set(...entry);
  for(const entry of d.pressures)pressures.set(...entry);
  pressureChecks.push(...d.pressureChecks);
  affinityValues.clear();for(const [name,row] of d.affinities)affinityValues.set(name,new Map(row));
  latestAffinityEvent=d.latestAffinityEvent;previousWipe=d.previousWipe;appointmentStart=d.appointmentStart??20;appointmentEnd=d.appointmentEnd;
  applyAppointmentWindow();
  for(const c of d.candidates)candidateFiles.set(c.name,c);
  for(const m of d.joined)joined.set(m.name,candidateFiles.get(m.name)??(m.name===reserve.name?reserve:m));
  backupMember=joined.get(d.backup)??null;
  for(const [role,name] of d.starters??[])selectedStarters.set(role,name);
  boards.recruit=d.posts;
  for(const post of boards.recruit)if(post.batches)post.batches=post.batches.map(batch=>batch.map(m=>candidateFiles.get(m.name)));
  for(const key of Object.keys(threads))if(key.startsWith('dm:'))delete threads[key];
  for(const [key,rows] of Object.entries(d.messages))threads[key]=rows;
  qoRequests.clear();qoUnread.clear();
  for(const name of d.qo?.removedVeterans??[])removedVeterans.add(name);
  for(const [name,nickname] of d.qo?.nicknames??[])qoNicknames.set(name,nickname);
  for(const item of d.qo?.requests??[])qoRequests.set(item.kind+':'+item.name,item);
  for(const [thread,count] of d.qo?.unread??[])qoUnread.set(thread,count);
  $('#qo-sort').value=d.qo?.sort??'default';
  commandLog.splice(0,commandLog.length,...d.commands);
  for(const msg of commandLog.slice(0,8).reverse())appendCookEvent('指挥 · '+msg);
  drawThread();syncLineup();drawForum();
}
function transact(key,edit){
  return new Promise((resolve,reject)=>{
    const tx=storageDB.transaction('saves',edit?'readwrite':'readonly'),store=tx.objectStore('saves'),req=store.get(key);
    let result,reason;
    req.onsuccess=()=>{try{result=edit?edit(req.result):req.result;if(edit)store.put(result,key);}catch(error){reason=error;tx.abort();}};
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(reason??tx.error);
  });
}
function saveUI(){
  const rec=slots.get(selectedSlot), card=$('.continue-card');
  const legacy=!rec&&legacySlots.has(selectedSlot);
  card.querySelector('h2').textContent=rec||legacy?'炎帝陵':'尚无存档';
  card.querySelector('.eyebrow').textContent='本地存档 '+selectedSlot;
  card.querySelector('p:not(.eyebrow)').textContent=rec?'第 '+rec.head.data.calendar.day+' 天 · 已开 '+rec.head.data.campaign.attempts+' 把':legacy?'历史版本 · 三段试玩进度':'选择副本，开始一轮挑战。';
  card.querySelector('button').disabled=(!rec&&!legacy)||!storageReady;
  const rows=$$('.save-slots>div');
  rows.forEach((row,i)=>{
    const item=slots.get(i+1),button=row.querySelector('button');
    const older=legacySlots.has(i+1);
    row.querySelector('strong').textContent=item||older?'炎帝陵':'空白';
    row.querySelector('small').textContent=item?'第 '+item.head.data.calendar.day+' 天 · '+new Date(item.head.time).toLocaleDateString('zh-CN'):older?'历史版本 · 可继续':'可创建新档';
    button.textContent=item||older?'读取':'新建';button.disabled=!storageReady;
    delete button.dataset.enter;delete button.dataset.select;button.dataset.slot=i+1;
  });
  $('#save-export').disabled=!rec&&!runningCampaign;
}
function persistCrystal(){
  if(!playingCrystal||!storageReady||!runningCampaign||saveConflict)return;
  const head=structuredClone(captureCampaign()),content=JSON.stringify(head.data);
  if(content===lastWritten)return;
  lastWritten=content;const slot=selectedSlot;
  saveQueue=saveQueue.then(async()=>{
    if(saveConflict)return;
    const record={head,revision:(slots.get(slot)?.revision??0)+1};
    if(storageDB)await transact('crystal-'+slot,existing=>{
      if((existing?.revision??0)!==record.revision-1){saveConflict=true;throw new Error('其他窗口已保存，请刷新后读取。');}
      return {...record,previous:existing?.head};
    });
    slots.set(slot,record);
    if(storageDB)await transact('crystal-active',()=>slot);
    saveUI();
  }).catch(error=>{lastWritten='';toast(error.message||'保存失败，请导出当前进度。');});
}
function enterCampaign(mode){
  if(!storageReady){toast('正在读取本地存档。');return false;}
  if(mode==='continue'&&!slots.has(selectedSlot)&&legacySlots.has(selectedSlot)){location.href='../index.html?classic&slot='+selectedSlot;return false;}
  if(mode==='continue'&&!slots.has(selectedSlot))return false;
  if(mode==='new'&&slots.has(selectedSlot)&&!confirm('在当前槽位开始新挑战？已有进度将存为上一份。'))return false;
  if(mode==='continue')restoreCampaign(slots.get(selectedSlot).head);
  else {campaign=newCampaign();resetScenario({day:1,hour:10,finished:false}, true);commandLog.length=0;}
  runningCampaign=true;lastWritten=mode==='continue'?JSON.stringify(captureCampaign().data):'';persistCrystal();
  if(mode==='continue'&&storageDB){const slot=selectedSlot;saveQueue=saveQueue.then(()=>transact('crystal-active',()=>slot)).catch(()=>toast('无法记住最近使用的槽位。'));}
  return true;
}
function exportCampaign(){
  const head=runningCampaign?captureCampaign():slots.get(selectedSlot)?.head;
  if(!head)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(head)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='Crystal-'+selectedSlot+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function importCampaign(){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=async()=>{
    try{
      const file=input.files[0];if(!file)return;
      if(file.size>16*1024*1024)throw new Error('文件过大。');
      const head=validateCampaign(JSON.parse(await file.text()));
      if(slots.has(selectedSlot)&&!confirm('将这份备份载入当前存档槽？'))return;
      restoreCampaign(head);runningCampaign=true;lastWritten='';persistCrystal();await saveQueue;
      if(saveConflict)return;
      $('#save-dialog').close();showPage('desktop');showApp('doc');
    }catch(error){$('#save-feedback').textContent=error.message;}
  };input.click();
}
async function bootCrystal(){
  document.documentElement.classList.add('playing-crystal');
  document.title='FF职业固定队经理2026 · Crystal';
  $('#raid-outcome').closest('label').hidden=true;$('#raid-relationship').closest('label').hidden=true;
  $('#stream-start-raid').textContent='开怪';$('[data-clock-action=raid]').textContent='前往指挥并开怪';
  const old=element($('#save-dialog'),'a','打开旧版存档与三段试玩','legacy-link');old.href='../index.html?classic';
  const resume=element($('#save-dialog'),'button','恢复上一份','plain');resume.type='button';
  resume.onclick=async()=>{
    await saveQueue;if(!storageDB)return;
    const previous=(await transact('crystal-'+selectedSlot))?.previous;
    if(!previous){$('#save-feedback').textContent='当前槽位没有上一份备份。';return;}
    restoreCampaign(previous);runningCampaign=true;lastWritten='';persistCrystal();await saveQueue;
    $('#save-dialog').close();showPage('desktop');showApp('doc');
  };
  saveUI();
  try{
    storageDB=await new Promise((resolve,reject)=>{
      const req=indexedDB.open('ff-static-team-manager',1);
      req.onupgradeneeded=()=>req.result.createObjectStore('saves');req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
    });
    for(let slot=1;slot<=3;slot++){
      const record=await transact('crystal-'+slot);if(record){validateCampaign(record.head);slots.set(slot,record);}
      if(await transact('slot-'+slot))legacySlots.set(slot,true);
    }
    selectedSlot=await transact('crystal-active')??await transact('active-slot')??1;
  }catch(error){
    const notice=element($('.launch-bar'),'span','本地存档不可用，请在本次游戏结束前导出 JSON。','pill');
    notice.setAttribute('role','status');
    if(storageDB)saveConflict=true;
  }
  storageReady=true;saveUI();
  document.addEventListener('click',async e=>{
    const b=e.target.closest('[data-slot]');
    if(b){
      await saveQueue;selectedSlot=Number(b.dataset.slot);runningCampaign=false;saveUI();
      if(slots.has(selectedSlot)||legacySlots.has(selectedSlot))enterDesktop('continue');else{$('#save-dialog').close();showPage('selection');}
    }else queueMicrotask(persistCrystal);
  });
  document.addEventListener('change',()=>queueMicrotask(persistCrystal));
  document.addEventListener('submit',()=>queueMicrotask(persistCrystal));
}
if(playingCrystal)bootCrystal();
