const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});
for(const id of ['tracker-core','habits-core','coach-core','game-core'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],ctx);
const T=ctx.Tracker,W=ctx.WorkoutTools,G=ctx.WorkoutGame,plain=x=>JSON.parse(JSON.stringify(x)),today='2026-10-15',key=today+':upper';
function session(date,type='upper',reps=8,completed=true){const s=T.newSession(date,type);for(const [id,e]of Object.entries(s.exercises))for(const set of e.sets){if(id==='lunges'){set.left=reps;set.right=reps;}else set.reps=reps;}s.completed=completed;return s;}
const journal=(...rows)=>({version:1,sessions:Object.fromEntries(rows.map(s=>[s.date+':'+s.type,s]))});
function improved(){const a=session('2026-10-12'),b=session(today);b.exercises.pullups.sets[0].reps=10;return journal(a,b);}
const records=(data,id=key)=>{assert.equal(typeof W.recordTimeline,'function','Missing record comparison at finish');return W.recordTimeline(data)[id];};

test('A saved current workout compares against earlier days, excluding itself and a higher future result',()=>{
 const data=improved();data.sessions['2026-10-19:upper']=session('2026-10-19','upper',99);const before=JSON.stringify(data),rows=records(data);
 assert.deepEqual(plain(rows.map(r=>({key:r.key,metric:r.metric,before:r.before,value:r.value,delta:r.delta,previousDate:r.previousDate}))),[{key:'pullups',metric:'reps',before:8,value:10,delta:2,previousDate:'2026-10-12'}]);assert.equal(JSON.stringify(data),before);
});
test('First entries and equal or lower results are not broken records',()=>{
 const a=session('2026-10-12'),b=session(today);assert.equal(records(journal(a),'2026-10-12:upper').length,0);assert.equal(records(journal(a,b)).length,0);b.exercises.pullups.sets[0].reps=7;assert.equal(records(journal(a,b)).length,0);
});
test('The previous all-time maximum is used instead of just the last workout',()=>{
 const a=session('2026-10-05'),b=session('2026-10-12'),c=session(today);a.exercises.pullups.sets[0].reps=15;c.exercises.pullups.sets[0].reps=12;assert.equal(records(journal(a,b,c)).length,0);
});
test('Floor and hanging abs compare separately across upper and lower days',()=>{
 const a=session('2026-10-13','lower'),b=session(today);a.exercises.abs.sets[0].reps=40;a.exercises.abs.sets[1].reps=12;b.exercises.abs.sets[0].reps=30;b.exercises.abs.sets[1].reps=14;
 const rows=records(journal(a,b));assert.deepEqual(plain(rows.map(r=>[r.key,r.metric,r.before,r.value])),[['abs-hang','reps',12,14]]);
});
test('Known zero load can be beaten, missing load cannot, and weight without repetitions never qualifies',()=>{
 const a=session('2026-10-12'),b=session(today);a.exercises.raises.sets[0].weight=0;b.exercises.raises.sets[0].weight=2;b.exercises.pullups.sets[0].weight=6;
 assert.deepEqual(plain(records(journal(a,b)).map(r=>[r.key,r.metric,r.before,r.value])),[['raises','weight',0,2]]);
 b.exercises.raises.sets[0].reps=null;assert.equal(records(journal(a,b)).length,0);
});
test('Lunge records keep each leg separate and do not treat the sum as a record',()=>{
 const a=session('2026-10-13','lower'),b=session('2026-10-16','lower');b.exercises.lunges.sets[0].left=10;
 assert.deepEqual(plain(records(journal(a,b),'2026-10-16:lower').map(r=>[r.key,r.metric,r.before,r.value])),[['lunges','left',8,10]]);
});
test('Same-date workouts share the baseline of earlier dates regardless of insertion order',()=>{
 const a=session('2026-10-12'),b=session(today),c=session(today,'lower');b.exercises.abs.sets[0].reps=10;c.exercises.abs.sets[0].reps=12;
 assert.equal(typeof W.recordTimeline,'function');assert.deepEqual(plain(W.recordTimeline(journal(a,b,c))),plain(W.recordTimeline(journal(c,b,a))));
});
test('Only a completed record workout earns a single 25 XP bonus and restored copies cannot multiply it',()=>{
 const data=improved(),b=data.sessions[key];b.completed=false;const before=G.summarize(data,today);assert.equal(before.recordWorkouts,0);b.completed=true;const after=G.summarize(data,today);
 assert.equal(after.recordWorkouts,1);assert.equal(after.recordXp,25);assert.equal(after.xp,225);assert.equal(G.reward(before,after).recordXp,25);assert.equal(G.reward(before,after).xp,125);
 const merged=T.merge(data,T.readBackup(JSON.stringify(data)));assert.equal(G.summarize(merged,today).xp,225);assert.equal(G.reward(after,G.summarize(merged,today)).xp,0);
});
test('Several records in one workout give one bonus and three different exercises unlock the triple medal',()=>{
 const data=improved(),b=data.sessions[key];b.exercises.elevated.sets[0].reps=9;b.exercises.raises.sets[0].reps=12;
 const profile=G.summarize(data,today);assert.equal(profile.recordXp,25);assert.equal(profile.badges.find(b=>b.id==='record-first')?.unlocked,true);assert.equal(profile.badges.find(b=>b.id==='record-triple')?.unlocked,true);
 const legs=journal(session('2026-10-13','lower'),session('2026-10-16','lower'));legs.sessions['2026-10-16:lower'].exercises.lunges.sets[0]={left:10,right:10,weight:2};legs.sessions['2026-10-13:lower'].exercises.lunges.sets[0].weight=0;assert.equal(G.summarize(legs,'2026-10-16').badges.find(b=>b.id==='record-triple')?.unlocked,false);
});
test('Five record workouts earn their medal and later records do not erase historical awards',()=>{
 const rows=[session('2026-10-01'),...['2026-10-05','2026-10-08','2026-10-12','2026-10-15','2026-10-19'].map((date,i)=>{const s=session(date);s.exercises.pullups.sets[0].reps=9+i;return s;})],p=G.summarize(journal(...rows),'2026-10-19');
 assert.equal(p.recordWorkouts,5);assert.equal(p.recordXp,125);assert.equal(p.badges.find(b=>b.id==='record-five')?.unlocked,true);
});
test('Reopening an unfinished corrected workout removes its bonus and reclosing restores rather than accumulates XP',()=>{
 const data=improved(),b=data.sessions[key];assert.equal(G.summarize(data,today).xp,225);b.completed=false;assert.equal(G.summarize(data,today).xp,100);b.completed=true;assert.equal(G.summarize(data,today).xp,225);
});
test('A completed future workout and future morning do not award XP before their day arrives',()=>{
 const data=improved();data.habits={[today]:{morning:{done:true,updatedAt:1}}};const p=G.summarize(data,'2026-10-14');assert.equal(p.workouts,1);assert.equal(p.mornings,0);assert.equal(p.recordXp,0);assert.equal(p.xp,100);assert.equal(G.summarize(data,today).xp,245);
});
test('The finish receipt shows the old and new record with a 125 XP total, including after reopening it',()=>{
 const start=html.indexOf('      function recordHighlights('),end=html.indexOf('      function renderTraining(',start);assert.ok(start>=0,'Missing finish record highlights');const data=improved(),env={T,W,G,data,today,fmt:date=>date,label:t=>t,numberText:String};vm.runInNewContext(html.slice(start,end),env);
 const first=env.workoutReceipt(data.sessions[key]);assert.match(first,/8[\s\S]*?→[\s\S]*?10/);assert.match(first,/\+125 XP/);assert.match(first,/25 XP/);assert.equal(env.workoutReceipt(data.sessions[key]),first);
 data.sessions[key].completed=false;assert.equal(env.recordHighlights(data.sessions[key]),'');
});
test('Finishing a saved draft gives its record reward once and a repeated finish emits no second celebration',()=>{
 const data=improved(),s=data.sessions[key];s.completed=false;const awards=[],env={T,G,W,data,today,session:()=>s,invalidInputs:()=>false,coachKey:()=>key,save:()=>true,render(){},showReward:before=>awards.push(G.reward(before,G.summarize(data,today))),toast(){}};
 const a=html.indexOf('      function finishWorkout(){'),b=html.indexOf('      function handleCoachClick(',a);vm.runInNewContext(html.slice(a,b)+'\nfinishWorkout();finishWorkout();',env);assert.equal(awards.length,1);assert.equal(awards[0].xp,125);assert.equal(awards[0].recordXp,25);
});
test('The finish dialog celebrates records and separates the record bonus from the base workout reward',()=>{
 const a=html.indexOf('      function recordHighlights('),b=html.indexOf('      function workoutReceipt(',a);assert.ok(a>=0,'Missing finish record highlights');const data=improved(),s=data.sessions[key];s.completed=false;const before=G.summarize(data,today);s.completed=true;
 const content={innerHTML:''},dialog={showModal(){this.open=true;}},env={T,W,G,data,today,selected:today,session:()=>s,fmt:date=>date,numberText:String,$:id=>({'reward-content':content,'reward-dialog':dialog})[id],gameIcon:()=>'',medal:()=>'',xpMeter:()=>'',creatineReminder:()=>'',wellnessEditor:()=>''};
 vm.runInNewContext(html.slice(a,b),env);const start=html.indexOf('      function showReward('),end=html.indexOf('      function motivation()',start);vm.runInNewContext(html.slice(start,end),env);env.showReward(before,true);assert.equal(dialog.open,true);assert.match(content.innerHTML,/\+125/);assert.match(content.innerHTML,/Рекорды: \+25 XP/);assert.match(content.innerHTML,/8[\s\S]*?→[\s\S]*?10/);
 env.showReward(G.summarize(data,today),true,'morning');assert.doesNotMatch(content.innerHTML,/record-celebration/);
});
