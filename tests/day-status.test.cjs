const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});
for(const id of ['tracker-core','habits-core','coach-core'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],ctx);
const T=ctx.Tracker,H=ctx.DailyHabits,W=ctx.WorkoutTools,empty=()=>({version:1,sessions:{}}),rest='2026-10-14',upper='2026-10-15';
function workout(date,type,completed=true){const s=T.newSession(date,type);for(const [id,e]of Object.entries(s.exercises))for(const set of e.sets){if(id==='lunges'){set.left=8;set.right=8;}else set.reps=8;}s.completed=completed;return s;}
function trained(date=upper,type='upper'){const s=workout(date,type);let data={...empty(),sessions:{[date+':'+type]:s}};data=H.set(data,date,'morning',true);return H.set(data,date,'creatine',true);}
function recovered(){let data=H.set(empty(),rest,'morning',true);for(let i=0;i<3;i++)data=W.setRecoveryStep(data,rest,i,true);return W.finishRecovery(data,rest,rest);}

test('A training day closes only after the workout is explicitly finished, morning and creatine are marked',()=>{
 assert.equal(typeof W.dayStatus,'function','Missing daily completion status');
 let data=trained();assert.equal(W.dayStatus(data,upper,upper).complete,true);assert.equal(W.dayStatus(data,upper,upper).total,3);
 data.sessions[upper+':upper'].completed=false;const state=W.dayStatus(data,upper,upper);assert.equal(state.complete,false);assert.equal(state.done,2);assert.equal(state.tasks.find(t=>t.id==='upper').done,false);
});
test('A rest day needs the morning and closed recovery quest, with no creatine task',()=>{
 assert.equal(typeof W.dayStatus,'function');let data=recovered();assert.equal(W.dayStatus(data,rest,rest).complete,true);assert.equal(W.dayStatus(data,rest,rest).total,2);
 data.recovery[rest].completed=false;assert.equal(W.dayStatus(data,rest,rest).complete,false);assert.equal(W.dayStatus(data,rest,rest).done,1);
});
test('Empty and partially filled workouts cannot report a completed day',()=>{
 assert.equal(typeof W.dayStatus,'function');assert.equal(W.dayStatus(empty(),upper,upper).done,0);let data=trained();data.sessions[upper+':upper'].exercises.pushups.sets[0].reps=null;assert.equal(W.dayStatus(data,upper,upper).complete,false);
});
test('Marks from another date do not close the selected day',()=>{
 assert.equal(typeof W.dayStatus,'function');const data=trained('2026-10-12');assert.equal(W.dayStatus(data,upper,upper).done,0);assert.equal(W.dayStatus(data,rest,rest).done,0);
});
test('Removing a daily mark or recovery mission reopens its daily flag',()=>{
 assert.equal(typeof W.dayStatus,'function');const data=trained();assert.equal(W.dayStatus(H.set(data,upper,'morning',false),upper,upper).complete,false);assert.equal(W.dayStatus(H.set(data,upper,'creatine',false),upper,upper).complete,false);
 assert.equal(W.dayStatus(W.setRecoveryStep(recovered(),rest,0,false),rest,rest).complete,false);
});
test('A future imported day cannot be celebrated early but a past finished day stays closed',()=>{
 assert.equal(typeof W.dayStatus,'function');const data=trained();assert.equal(W.dayStatus(data,upper,rest).complete,false);assert.equal(W.dayStatus(data,upper,rest).future,true);assert.equal(W.dayStatus(data,upper,'2026-10-16').complete,true);
});
test('An alternate workout cannot replace the scheduled workout in the daily flag',()=>{
 assert.equal(typeof W.dayStatus,'function');const data=trained(upper,'lower'),state=W.dayStatus(data,upper,upper);assert.equal(state.complete,false);assert.equal(state.tasks.find(t=>t.id==='upper').done,false);assert.equal(state.tasks.find(t=>t.id==='lower').done,true);
});
test('A started extra workout also needs a finish and creatine, while an untouched empty session adds no task',()=>{
 assert.equal(typeof W.dayStatus,'function');let data=recovered(),s=T.newSession(rest,'upper');data.sessions[rest+':upper']=s;assert.equal(W.dayStatus(data,rest,rest).complete,true);
 s.exercises.pushups.sets[0].reps=8;assert.equal(W.dayStatus(data,rest,rest).total,4);assert.equal(W.dayStatus(data,rest,rest).complete,false);
 data.sessions[rest+':upper']=workout(rest,'upper');assert.equal(W.dayStatus(data,rest,rest).complete,false);data=H.set(data,rest,'creatine',true);assert.equal(W.dayStatus(data,rest,rest).complete,true);
});
test('Optional wellness and goals do not block the flag, and deriving it leaves the saved journal unchanged',()=>{
 assert.equal(typeof W.dayStatus,'function');const data=recovered(),before=JSON.stringify(data);assert.equal(W.dayStatus(data,rest,rest).complete,true);assert.equal(JSON.stringify(data),before);
 const restored=T.readBackup(JSON.stringify(data));assert.equal(W.dayStatus(restored,rest,rest).complete,true);
});
test('A save failure replaces the relaxing message with a warning immediately, and a later successful save clears it',()=>{
 const classes=new Set(),panel={classList:{toggle(){}},innerHTML:''},status={classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c)}},alert={},env={T,W,data:recovered(),selected:rest,today:rest,KEY:'qa',saveBlocked:false,dayStatusContent:'',$:id=>({'day-status':panel,'save-status':status,'storage-alert':alert})[id],fmt:()=> '14 октября',localStorage:{getItem:()=>null,setItem(){throw Error('Quota');}}};
 const a=html.indexOf('      function renderDayStatus(){'),b=html.indexOf('      function gameIcon(',a),s=html.indexOf('      function storageError('),e=html.indexOf('      let focusDraft=',s);
 vm.runInNewContext(html.slice(a,b)+html.slice(s,e)+'\nrenderDayStatus();',env);assert.match(panel.innerHTML,/можно спокойно отдыхать/);
 assert.equal(env.save(),false);assert.match(panel.innerHTML,/day-status-warning/);assert.doesNotMatch(panel.innerHTML,/можно спокойно отдыхать/);
 env.localStorage.setItem=()=>{};assert.equal(env.save(),true);assert.doesNotMatch(panel.innerHTML,/day-status-warning/);assert.match(panel.innerHTML,/можно спокойно отдыхать/);
});
