'use strict';

const innateTraits = [
  '夜猫子', '情圣', '早起党', '集中两小时', '慢热', '准点主义', '独立复盘', '地图记忆', '听口令', '安静守位',
  '习惯老搭档', '喜新', '稳健手', '抢进度', '开怪先对表', '只听关键句', '乐于带新人', '好胜', '救场本能', '专职型',
  '临时补位派', '公平敏感', '不爱被点名', '气氛担当', '等消息焦虑', '独处充电', '情绪共鸣', '旧队友多', '阶段练习派', '怕准备不足',
];
const recruitAttributes = { execution:'执行', coordination:'协作', reaction:'应变', technique:'手法', aptitude:'资质' };
const recruitGrades = {
  standard: { label: '不低', minimum: 65, extra: 2 },
  high: { label: '偏高', minimum: 90, maximum: 95, extra: 4 },
};

function rollRecruitAttributes(post, random) {
  const high = recruitGrades.high;
  const attribute = post.attribute;
  const minimum = post.minimum ?? 0;
  const keys = Object.keys(recruitAttributes);
  const roll = (min, max) => min + Math.floor(random() * (max - min + 1));
  for (let i = keys.length - 1; i > 0; i--) {
    const j = roll(0, i);
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }

  // A regular floor applies to a regular attribute. A high requirement uses one of the two strengths.
  const strengths = keys.filter(key => key !== attribute).slice(0, attribute && minimum >= high.minimum ? 1 : 2);
  if (attribute && minimum >= high.minimum) strengths.push(attribute);

  const scores = {};
  let remaining = roll(280, 350);
  for (const key of strengths) {
    scores[key] = roll(key === attribute ? Math.max(minimum, high.minimum) : high.minimum, high.maximum);
    remaining -= scores[key];
  }
  const regular = keys.filter(key => !strengths.includes(key));
  const floor = key => key === attribute ? minimum : 0;
  const ceiling = high.minimum - 1;
  regular.forEach((key, index) => {
    const later = regular.slice(index + 1);
    const min = Math.max(floor(key), remaining - later.length * ceiling);
    const max = Math.min(ceiling, remaining - later.reduce((sum, other) => sum + floor(other), 0));
    scores[key] = roll(min, max);
    remaining -= scores[key];
  });
  return scores;
}
const forumDiscussions = [
  ['雾桥旅人','闲聊','打完本才发现一直开着麦','我在报换坦的时候，猫在门外叫了三次。队友以为我换了警报音。','河畔散步：至少你的警报音每次都准时。'],
  ['墨水没干','求助','复盘怎么记才不用每把暂停','我现在只记失败机制和第一个出错动作。还有什么是值得回头补的？','盐饼：再记一下当时是谁负责报点，下一场好复查。'],
  ['沿岸低鸣','攻略','把火柱口令缩成了四个字','先报安全侧再说集合点。我们队少了几次因为口令太长造成的停顿。','咸橘：双方先确认方位，短口令才有用。'],
  ['冬眠的锅','闲聊','周末打完打算去钓鱼','有谁也喜欢打完本就关语音，在河边坐一会？','十点以前：钓不到也不要紧。'],
  ['深夜茶炉','交流','凌晨队第一次按约定收队','以前总说最后一把，结果谁都不敢先走。今晚定两点，反而三把打得很专心。','纸袋灯：写明结束时间确实有用。'],
  ['绢灯','求助','候补需要学哪一套站位','我可能补 D2 或 D4。没进首发时，提前练两个站位有必要吗？','秋舟：先问清大家用的方位图。'],
  ['雁字旧章','交流','新坦第一次负责面向','以前我只跟着换坦，现在自己负责面向，发现最难的是同时听两个人讲话。','薄雾渡口：主报点留一个就好。'],
  ['纸杯半满','记录','今天终于把两个楔错开打掉','我们约好先停一拍再转火，治疗说终于有空把全队抬起来了。','黑糖面包：这个可以写进攻略。'],
  ['木匣旅人','闲聊','偏好十点收队的也来留个名','隔天还得早起，有两小时的队伍已经很满足。','半格温度：我也是，只要稳定出勤就行。'],
  ['褪色徽记','交流','我的录像里全是读条最后半秒','有人习惯提前动吗？想找个不贪刀的打法。','浮木：先找每段必须移动的那个点。'],
];
const forumRecruitPosts = [
  {title:'周末白天缺一名 ST 看门', author:'小河骑士', tag:'玩家招募', text:'下午练双坦交接，先约一段，愿意在开打前对口令就行。', reply:'石苔：周日下午有空，发一下时段。'},
  {title:'找一位 H1 一起练团血轴', author:'盐烤面包', tag:'玩家招募', text:'晚上八点后常在线。我们想先练头两段，卡住就复盘。', reply:'薄荷汽水：我可以带已有的团减记录。'},
  {title:'凌晨档找远程输出和机动候补', author:'夜港巡灯', tag:'玩家招募', text:'通常 22:00 后集合，截止点先写好，进度不限。', reply:'暖色贝壳：能打到两点，先看一下打法。'},
];
function populateDiscussions() {
  const topics = [...forumDiscussions];
  const posts = [];
  while (posts.length < 8) {
    const [author, tag, title, text, reply] = topics.splice(Math.floor(Math.random() * topics.length), 1)[0];
    posts.push({title, author, tag, text, reply});
  }
  return posts;
}
