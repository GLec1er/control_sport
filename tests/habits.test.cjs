const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const ctx=vm.createContext({});
for(const id of ['tracker-core','habits-core','coach-core','game-core']){
  const script=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));
  if(script)vm.runInContext(script[1],ctx);
}
const T=ctx.Tracker,H=ctx.DailyHabits,G=ctx.WorkoutGame;
const empty=()=>({version:1,sessions:{}});
function finished(){
  const s=T.newSession('2026-10-05','upper');
  for(const e of Object.values(s.exercises))for(const set of e.sets)set.reps=8;
  s.completed=true;
  return {version:1,sessions:{'2026-10-05:upper':s}};
}
const habits=()=>{assert.ok(H,'Daily habits have not been implemented');return H;};

// Catch a migration that loses old workout data or cannot open old backups.
test('Old backups open with empty habits and retain completed workouts',()=>{
  const loaded=T.readBackup(JSON.stringify(finished()));
  assert.equal(loaded.sessions['2026-10-05:upper'].completed,true);
  assert.ok(loaded.habits,'Backup must initialize the daily habits');
  assert.ok(loaded.morningPlan,'Backup must initialize the personal routine');
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.habits)),{});
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.morningPlan)),{items:[],updatedAt:0});
});

// Catch silently dropping habit marks and the personal routine on reload/export.
test('Backup round trips both daily marks and the morning routine',()=>{
  const data={...finished(),habits:{'2026-10-05':{morning:{done:true,updatedAt:10},creatine:{done:true,updatedAt:11}}},morningPlan:{items:['Мой первый пункт','Мой второй пункт'],updatedAt:12}};
  const restored=T.readBackup(JSON.stringify(data));
  assert.equal(restored.habits?.['2026-10-05']?.morning.done,true);
  assert.equal(restored.habits?.['2026-10-05']?.creatine.done,true);
  assert.deepEqual(Array.from(restored.morningPlan?.items||[]),['Мой первый пункт','Мой второй пункт']);
});

// Catch malformed habit data bypassing the backup validation boundary.
test('Malformed habit dates, marks and routine values are rejected',()=>{
  for(const extra of [
    {habits:{'2026-02-30':{morning:{done:true,updatedAt:1}}}},
    {habits:{'2026-10-05':{morning:{done:'yes',updatedAt:1}}}},
    {habits:{'2026-10-05':{creatine:{done:true,updatedAt:-1}}}},
    {morningPlan:{items:[42],updatedAt:1}}
  ])assert.throws(()=>T.readBackup(JSON.stringify({...empty(),...extra})));
});

// Catch merging a whole date row and overwriting a different habit or a newer correction.
test('Import merges each habit independently and preserves the newer routine',()=>{
  const local={...empty(),habits:{'2026-10-05':{morning:{done:false,updatedAt:30},creatine:{done:true,updatedAt:10}}},morningPlan:{items:['Новый комплекс'],updatedAt:30}};
  const incoming={...empty(),habits:{'2026-10-05':{morning:{done:true,updatedAt:20},creatine:{done:false,updatedAt:40}},'2026-10-06':{morning:{done:true,updatedAt:40}}},morningPlan:{items:['Старый комплекс'],updatedAt:20}};
  const merged=T.merge(local,incoming);
  assert.equal(merged.habits['2026-10-05'].morning.done,false);
  assert.equal(merged.habits['2026-10-05'].creatine.done,false);
  assert.equal(merged.habits['2026-10-06']?.morning.done,true);
  assert.equal(merged.morningPlan.items[0],'Новый комплекс');
  assert.equal(local.habits['2026-10-05'].creatine.done,true);
});

// Catch accepting the after-workout mark before a workout is completed.
test('The creatine mark becomes available after a completed workout',()=>{
  const H=habits();
  assert.equal(H.state(empty(),'2026-10-05').canCreatine,false);
  assert.throws(()=>H.set(empty(),'2026-10-05','creatine',true,1));
  const marked=H.set(finished(),'2026-10-05','creatine',true,1);
  assert.equal(H.state(marked,'2026-10-05').creatine,true);
  assert.equal(H.state(marked,'2026-10-06').creatine,false);
  assert.equal(G.summarize(marked,'2026-10-05').xp,100);
});

// Catch marks leaking into another day, or morning being blocked on a recovery day.
test('Morning marks are daily and work on recovery days',()=>{
  const marked=habits().set(empty(),'2026-10-11','morning',true,1);
  assert.equal(H.state(marked,'2026-10-11').morning,true);
  assert.equal(H.state(marked,'2026-10-12').morning,false);
  assert.equal(H.state(marked,'2026-10-11').creatine,false);
});

// Catch XP multiplying when the same morning is checked again or imported twice.
test('Morning earns XP once per date and corrections recalculate it',()=>{
  const first=habits().set(empty(),'2026-10-11','morning',true,1);
  const repeated=H.set(first,'2026-10-11','morning',true,2);
  assert.equal(G.summarize(repeated,'2026-10-11').xp,20);
  assert.equal(G.summarize(repeated,'2026-10-11').mornings,1);
  const cleared=H.set(repeated,'2026-10-11','morning',false,3);
  assert.equal(G.summarize(cleared,'2026-10-11').xp,0);
});

// Catch counting seven toggles as seven mornings or losing the habit achievement in history.
test('Seven separate mornings unlock the morning achievement',()=>{
  let data=empty();
  for(const date of ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11'])data=habits().set(data,date,'morning',true,1);
  const p=G.summarize(T.readBackup(JSON.stringify(data)),'2026-10-11');
  assert.equal(p.xp,140);
  assert.equal(p.workouts,0);
  assert.equal(p.mornings,7);
  assert.equal(p.badges.find(b=>b.id==='morning-seven')?.unlocked,true);
});

// Catch labeling a morning reward as workout experience.
test('Morning rewards are separate from workout rewards',()=>{
  const before=G.summarize(empty(),'2026-10-11');
  const data={...empty(),habits:{'2026-10-11':{morning:{done:true,updatedAt:1}}}};
  const after=G.summarize(data,'2026-10-11');
  const reward=G.reward(before,after);
  assert.equal(reward.xp,20);
  assert.equal(reward.morningXp,20);
  assert.equal(reward.workoutXp,0);
});

// Catch empty lines becoming checklist items or oversized routine data being saved.
test('A personal routine normalizes lines and rejects oversized entries',()=>{
  const data=habits().setPlan(empty(),'  Первый пункт  \n\n Второй пункт ',1);
  assert.deepEqual(Array.from(data.morningPlan.items),['Первый пункт','Второй пункт']);
  assert.throws(()=>H.setPlan(data,'x'.repeat(121),2));
  assert.throws(()=>H.setPlan(data,Array(31).fill('Пункт').join('\n'),2));
  assert.equal(H.setPlan(data,'',2).morningPlan.items.length,0);
});
