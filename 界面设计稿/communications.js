'use strict';

const resultNotices=[];
const noticeStack=document.querySelector('#notice-stack');
const noticeButton=document.querySelector('#desktop-notices');
let tipCard;

function messageClock(at){
  const minutes=Math.round(at*60),hour=Math.floor(minutes/60)%24;
  return `${String(hour).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}
function resultTime(at){return `第 ${Math.floor((at-10)/24)+1} 天 · ${messageClock(at)}`;}
function effectRange(values){
  const first=Math.round(Math.min(...values)*10)/10,last=Math.round(Math.max(...values)*10)/10;
  return first===last?String(first):`${first}–${last}`;
}

function writeNoticeContent(parent,notice){
  const meta=element(parent,'div',null,'notice-meta');
  element(meta,'span',notice.source);
  if(notice.time)element(meta,'time',notice.time);
  element(parent,'strong',notice.title);
  if(notice.detail)element(parent,'p',notice.detail);
}
function showNotice(notice,isResult=true){
  const card=element(noticeStack,'article',null,'notice-card');
  card.dataset.source=notice.source;
  writeNoticeContent(card,notice);
  if(isResult){
    const close=element(card,'button','×','notice-close');close.type='button';close.setAttribute('aria-label','关闭这条通知');
    close.onclick=()=>card.remove();
    const shown=[...noticeStack.querySelectorAll('.notice-card:not(.notice-tip)')];
    if(shown.length>3)shown[0].remove();
  }else{
    tipCard?.remove();tipCard=card;card.classList.add('notice-tip');
  }
  setTimeout(()=>card.remove(),isResult?7600:2700);
}
function toast(message){showNotice({source:'操作提示',title:message,detail:'',time:''},false);}

function recordNotice(notice,popup){
  resultNotices.unshift(notice);
  if(popup){noticeButton.dataset.new='true';noticeButton.setAttribute('aria-label','通知记录，有新通知');showNotice(notice);}
  if($('#notice-dialog').open)drawNoticeHistory();
}
function notifyResult(source,title,detail,at=campaignHour(),log){
  const notice={source,title,detail,time:resultTime(at)};
  if(log)(log.pendingNotices??=[]).push(notice);
  else recordNotice(notice,true);
}
function resetNotices(history=[]){
  resultNotices.length=0;
  for(const notice of history)resultNotices.push(notice);
  noticeButton.removeAttribute('data-new');noticeButton.setAttribute('aria-label','查看通知记录');noticeStack.replaceChildren();
  if($('#notice-dialog').open)$('#notice-dialog').close();
}
function drawNoticeHistory(){
  const list=$('#notice-history');list.replaceChildren();
  if(!resultNotices.length){element(list,'li','暂无结算通知。');return;}
  for(const notice of resultNotices)writeNoticeContent(element(list,'li',null),notice);
}
noticeButton.onclick=()=>{
  noticeButton.removeAttribute('data-new');noticeButton.setAttribute('aria-label','查看通知记录');drawNoticeHistory();$('#notice-dialog').showModal();
};

function refreshChat(thread){
  drawQoBadges();
  if(opened.has('qo'))drawQoSessions();
  if(thread===currentThread)drawThread();
}
function appendChatRows(thread,rows){
  if(!rows.length)return;
  for(const row of rows)receiveQo(thread,row);
  refreshChat(thread);
}
function teamDialogue(lines,at=campaignHour(),log){
  const time=messageClock(at);
  const rows=lines.filter(([member,text])=>member&&text).map(([member,text])=>[member.name[0],member.name,time,text]);
  if(log)(log.pendingChat??=[]).push(...rows);
  else appendChatRows('team',rows);
}
function publishRaidMessages(log,popup=true){
  if(!log?.pendingNotices&&!log?.pendingChat)return false;
  for(const notice of log.pendingNotices??[])recordNotice(notice,popup);
  appendChatRows('team',log.pendingChat??[]);
  delete log.pendingNotices;delete log.pendingChat;
  return true;
}

function recruitmentDialogue(member){
  const others=[...rosterMembers().values()].filter(person=>person!==member);
  const peer=others.find(person=>person.role!==member.role&&person.role[0]===member.role[0])??others.at(-1);
  const intro=member.role==='MT'?'来了。我主坦，开团前先跟副坦对一下换仇。':
    member.role==='ST'?'大家好，我来补副坦。减伤怎么分，开打前叫我对一下。':
    member.role.startsWith('H')?`大家好，我打 ${member.role}。到时候跟另一个治疗先对一下抬血。`:
    `报到，我打 ${member.role}。攻略发一下，我先看站位和转火。`;
  const reply=peer?.role[0]===member.role[0]?'好，进语音以后我们先对一下分工。':'欢迎！先看一下日程，等人齐了再约开荒。';
  teamDialogue([[member,intro],[peer,reply]]);
}

const mechanicReplies={
  blast:'我贴首领太近了。下把看到它抬手，我先往外撤。',
  roar:'热风还在跳。被点的治疗先出去，另一个留中间接团血。',
  cone:'刚才首领转得太快。下把接到一仇的时候我喊一声。',
  charge:'它是从场边过来的。下把先看清方向再散。',
  nails:'楔子打得太挤了。我们先分组，再错开击破。',
  inferno:'落地那下没撑住。下把把团减留到这里。',
  lava:'地火点名后别往人群里跑。下把先给被点的人留路。',
  pillars:'炎柱中间有空隙。下把先确认安全点再过去。',
  chain:'锁链出来后我们分太开了。下把我先报距离。',
  end:'打到狂暴了。前面的安全窗口还能多打几下。',
};
function stageBattleConversation(log,team,fresh,repeated,at){
  const final=log.steps.at(-1),lead=team[final.slot];
  const partner=team.find(member=>member!==lead&&member.role.startsWith('H'));
  const first=log.clear?'过了！最后那段还以为要重来。':fresh?`这把打到「${final.title}」了，先记一下刚才看到的。`:
    repeated?'还是卡在刚才那段。我们先说清楚下一把谁报点。':`停一下，我想对一下「${final.title}」的处理。`;
  const reply=log.clear?'辛苦了！我先把这次的打法记下来。':mechanicReplies[final.key];
  teamDialogue([[lead,first],[partner,reply]],at,log);
}

function legacyNotice(row){
  if(row[1]!=='队务')return null;
  const text=row[3];
  const source=/^NGE 招募[：:]/.test(text)?'招募':/^(第 \d+ 把止于|炎帝陵首通|全队短休)/.test(text)?'战报':
    /^(调解用时)|发生「.+」.*好感.*压力|已移出队伍，首发名单已更新/.test(text)?'队务':null;
  return source?{source,title:'旧档结算',detail:text,time:''}:null;
}
