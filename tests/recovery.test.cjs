const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});
for(const id of ['tracker-core','habits-core','coach-core','game-core'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],ctx);
const T=ctx.Tracker,W=ctx.WorkoutTools,G=ctx.WorkoutGame,plain=x=>JSON.parse(JSON.stringify(x));
const empty=()=>({version:1,sessions:{}}),date='2026-10-14';
function ready(){return {...empty(),recovery:{[date]:{checks:[true,true,true],completed:false,updatedAt:10}}};}
function finished(day,type){const s=T.newSession(day,type);for(const [id,e]of Object.entries(s.exercises))for(const set of e.sets){if(id==='lunges'){set.left=8;set.right=8;}else set.reps=8;}s.completed=true;s.updatedAt=1;return s;}

test('An old journal gains an empty recovery map without losing its two finished workouts',()=>{
 const upper=finished('2026-10-12','upper'),lower=finished('2026-10-13','lower'),data=T.readBackup(JSON.stringify({version:1,sessions:{'2026-10-12:upper':upper,'2026-10-13:lower':lower}}));
 assert.ok(data.recovery,'Missing recovery state in a restored journal');assert.deepEqual(plain(data.recovery),{});assert.equal(data.sessions['2026-10-12:upper'].exercises.pushups.sets[0].reps,8);assert.equal(G.summarize(data,date).xp,200);
});
test('Checking recovery tasks changes only their date and does not finish the day automatically',()=>{
 assert.equal(typeof W.setRecoveryStep,'function');const data=empty(),before=JSON.stringify(data);let out=W.setRecoveryStep(data,date,0,true,20);assert.deepEqual(plain(out.recovery[date].checks),[true,false,false]);assert.equal(out.recovery[date].completed,false);assert.equal(JSON.stringify(data),before);
 out=W.setRecoveryStep(out,date,1,true,21);out=W.setRecoveryStep(out,date,2,true,22);assert.equal(out.recovery[date].completed,false);assert.deepEqual(plain(W.recoveryState(out,'2026-10-17').checks),[false,false,false]);assert.equal(G.summarize(out,date).xp,0);
});
test('Closing recovery requires all three marks and rejects a training date or a future day',()=>{
 assert.equal(typeof W.finishRecovery,'function');assert.throws(()=>W.finishRecovery(empty(),date,date,50));assert.throws(()=>W.finishRecovery(empty(),'2026-10-15','2026-10-15',50));const future={...empty(),recovery:{'2026-10-17':{checks:[true,true,true],completed:false,updatedAt:1}}};assert.throws(()=>W.finishRecovery(future,'2026-10-17',date,50));const out=W.finishRecovery(ready(),date,date,50);assert.equal(out.recovery[date].completed,true);assert.equal(W.finishRecovery(out,date,date,51),out);
});
test('Recovery gives 15 XP once while workout count, full-week reward and training streak stay unchanged',()=>{
 assert.equal(typeof W.finishRecovery,'function');const base=ready(),upper=finished('2026-10-12','upper'),lower=finished('2026-10-13','lower');base.sessions={'2026-10-12:upper':upper,'2026-10-13:lower':lower};const before=G.summarize(base,date),out=W.finishRecovery(base,date,date,20),after=G.summarize(out,date),reward=G.reward(before,after);
 assert.equal(after.xp,215);assert.equal(after.recoveries,1);assert.equal(after.workouts,2);assert.equal(after.streak,2);assert.deepEqual(plain(after.fullWeeks),[]);assert.equal(reward.xp,15);assert.equal(reward.recoveryXp,15);assert.equal(reward.workoutXp,0);assert.equal(reward.morningXp,0);assert.equal(reward.weekXp,0);assert.equal(G.reward(after,G.summarize(W.finishRecovery(out,date,date,30),date)).xp,0);
});
test('A repeated backup import does not duplicate recovery rewards or completed dates',()=>{
 const raw={...empty(),recovery:{[date]:{checks:[true,true,true],completed:true,updatedAt:20}}},restored=T.readBackup(JSON.stringify(raw));assert.ok(restored.recovery,'Recovery disappeared from the backup');assert.deepEqual(plain(restored.recovery),raw.recovery);const out=T.merge(restored,restored);assert.equal(G.summarize(out,date).xp,15);assert.equal(G.summarize(out,date).recoveries,1);
});
test('Future completed recovery copied from another device earns XP only when its date arrives',()=>{
 const data={...empty(),recovery:{[date]:{checks:[true,true,true],completed:true,updatedAt:1},'2026-10-17':{checks:[true,true,true],completed:true,updatedAt:2}}};assert.equal(G.summarize(data,date).xp,15);assert.equal(G.summarize(data,'2026-10-17').xp,30);
});
test('Correcting a recovery checkbox reopens the day and recalculates rather than farming experience',()=>{
 assert.equal(typeof W.finishRecovery,'function');const closed=W.finishRecovery(ready(),date,date,20),open=W.setRecoveryStep(closed,date,1,false,30);assert.equal(open.recovery[date].completed,false);assert.equal(G.summarize(open,date).xp,0);const readyAgain=W.setRecoveryStep(open,date,1,true,40),closedAgain=W.finishRecovery(readyAgain,date,date,50);assert.equal(G.summarize(closedAgain,date).xp,15);
});
test('An edit after a future imported timestamp survives reimport of an older completed recovery day',()=>{
 assert.equal(typeof W.setRecoveryStep,'function');const old={...empty(),recovery:{[date]:{checks:[true,true,true],completed:true,updatedAt:1000}}},edit=W.setRecoveryStep(old,date,0,false,20);assert.ok(edit.recovery[date].updatedAt>1000);assert.equal(T.merge(edit,T.readBackup(JSON.stringify(old))).recovery[date].completed,false);assert.equal(old.recovery[date].completed,true);
});
test('Malformed recovery copies are rejected instead of silently losing or accepting their entries',()=>{
 for(const recovery of [[],{[date]:{checks:[true,true],completed:false,updatedAt:1}},{[date]:{checks:[true,1,true],completed:false,updatedAt:1}},{[date]:{checks:[true,false,true],completed:true,updatedAt:1}},{[date]:{checks:[true,true,true],completed:true,updatedAt:-1}},{'2026-10-15':{checks:[true,true,true],completed:true,updatedAt:1}},{'2026-02-30':{checks:[true,true,true],completed:true,updatedAt:1}}])assert.throws(()=>T.readBackup(JSON.stringify({...empty(),recovery})));
});
test('Recovery input rejects invalid task indexes, non-boolean marks and invalid dates',()=>{
 assert.equal(typeof W.setRecoveryStep,'function');for(const [day,index,done]of [[date,-1,true],[date,3,true],[date,.5,true],[date,0,1],['2026-10-15',0,true],['bad',0,true]])assert.throws(()=>W.setRecoveryStep(empty(),day,index,done,20));
});
test('Wellness on a recovery day can be saved without a workout and survives the backup',()=>{
 const out=W.setWellness(empty(),date,4,'Спокойный день',20),restored=T.readBackup(JSON.stringify(out));assert.equal(restored.wellness[date].rating,4);assert.equal(restored.wellness[date].note,'Спокойный день');assert.throws(()=>W.setWellness(empty(),'2026-10-15',4,'',21));assert.throws(()=>W.setWellness(empty(),date,6,'',21));
});
test('A recovery-only change prompts a backup and later corrections require another copy',()=>{
 const data={...empty(),recovery:{[date]:{checks:[true,false,false],completed:false,updatedAt:20}}};assert.equal(W.backupStatus(data,30).dirty,true);assert.equal(W.backupStatus(data,30).due,true);const exported=W.prepareBackup(data,30);assert.equal(W.backupStatus(exported,31).dirty,false);assert.equal(typeof W.setRecoveryStep,'function');assert.equal(W.backupStatus(W.setRecoveryStep(exported,date,0,false,40),41).dirty,true);
});

test('When a future rest day arrives the finish button activates without clearing an edited wellness note',()=>{
 const day='2026-10-17',text={value:'Черновик'},quest={outerHTML:''},data={...empty(),recovery:{[day]:{checks:[true,true,true],completed:false,updatedAt:1}},wellness:{}};
 const env={T:{...T,localDate:()=>day},W,data,today:'2026-10-16',selected:day,view:'workout',override:null,focusDraft:null,session:()=>null,coachKey:()=>day+':rest',type:()=> 'rest',nextTraining:()=> '2026-10-19',label:()=> 'Восстановление',fmt:x=>x,wellnessEditor:()=>text.value,invalidInputs:()=>false,renderWeek(){},summary(){},motivation(){},renderRest(){},render(){text.value='';},$:id=>id==='reward-dialog'?{open:false}:null,document:{activeElement:{matches:()=>true},querySelectorAll:()=>[],querySelector:selector=>selector==='.recovery-quest'?quest:null}};
 const ui=html.indexOf('      function recoveryQuestHtml(){')>=0?html.indexOf('      function recoveryQuestHtml(){'):html.indexOf('      function recoveryPanel(){'),uiEnd=html.indexOf('      function renderWorkout(){',ui),a=html.indexOf('      function syncToday(){'),b=html.indexOf('      function chooseDate(',a);
 vm.runInNewContext(html.slice(ui,uiEnd),env);quest.outerHTML=env.recoveryPanel();assert.match(quest.outerHTML.match(/<button[^>]*id="recovery-finish"[^>]*>/)[0],/disabled/);vm.runInNewContext(html.slice(a,b)+'\nsyncToday();',env);assert.equal(env.today,day);assert.doesNotMatch(quest.outerHTML.match(/<button[^>]*id="recovery-finish"[^>]*>/)[0],/disabled/);assert.equal(text.value,'Черновик');
});
