const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const h=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});
for(const id of ['tracker-core','coach-core'])vm.runInContext(h.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],ctx);
const T=ctx.Tracker,W=ctx.WorkoutTools;
const previous=(...args)=>{assert.equal(typeof W.previousSession,'function','Previous session comparison is missing');return W.previousSession(...args);};
const compare=(...args)=>{assert.equal(typeof W.compareSet,'function','Per-set comparison is missing');return W.compareSet(...args);};
function finished(date,type='upper',reps=8){const s=T.newSession(date,type);for(const [id,e]of Object.entries(s.exercises))for(const set of e.sets){if(T.exercises[id].sides){set.left=reps;set.right=reps;}else set.reps=reps;}s.completed=true;return s;}
const journal=(...sessions)=>({version:1,sessions:Object.fromEntries(sessions.map(s=>[s.date+':'+s.type,s]))});

test('Baseline is the nearest earlier completed session of the same type, not the last edited record',()=>{
  const old=finished('2026-10-08'),last=finished('2026-10-12'),lower=finished('2026-10-13','lower'),draft=finished('2026-10-14'),current=finished('2026-10-15'),future=finished('2026-10-19');old.updatedAt=999999;last.updatedAt=1;draft.completed=false;
  assert.equal(previous(journal(old,last,lower,draft,current,future),'2026-10-15','upper').date,'2026-10-12');
});
test('First lower day has no same-type baseline',()=>{
  const upper=finished('2026-10-12');assert.equal(previous(journal(upper),'2026-10-13','lower'),null);assert.equal(compare(null,'squats',0,{reps:10,weight:null}).state,'first');
  const lower=finished('2026-10-13','lower');assert.equal(previous(journal(upper,lower),'2026-10-16','lower').date,'2026-10-13');
});
test('Second set compares against the previous second set rather than the best set',()=>{
  const s=finished('2026-10-12');s.exercises.pullups.sets[0]={reps:15,weight:0};s.exercises.pullups.sets[1]={reps:8,weight:2};
  const r=compare(s,'pullups',1,{reps:10,weight:2});assert.equal(r.state,'matched');assert.equal(r.previous.reps,8);assert.equal(r.deltas.reps,2);assert.equal(r.deltas.weight,0);assert.equal(r.load,'same');
});
test('Lunge differences keep both legs and load changes separate',()=>{
  const s=finished('2026-10-13','lower');s.exercises.lunges.sets[1]={left:10,right:9,weight:8};
  const r=compare(s,'lunges',1,{left:12,right:8,weight:10});assert.equal(r.deltas.left,2);assert.equal(r.deltas.right,-1);assert.equal(r.deltas.weight,2);assert.equal(r.load,'changed');
});
test('An added fourth set has no result in the latest three-set workout',()=>{
  const old=finished('2026-10-08'),last=finished('2026-10-12');old.exercises.abs.target=4;old.exercises.abs.sets.push({reps:30,weight:null});
  const r=compare(previous(journal(old,last),'2026-10-15','upper'),'abs',3,{reps:20,weight:null});assert.equal(r.state,'new-set');assert.equal(r.previous,null);assert.equal(r.date,'2026-10-12');
});
test('Blank or invalid current values do not invent a decline or a zero load',()=>{
  const s=finished('2026-10-12');s.exercises.pushups.sets[0].weight=0;
  const blank=compare(s,'pushups',0,{reps:null,weight:null});assert.equal(blank.deltas.reps,null);assert.equal(blank.deltas.weight,null);assert.equal(blank.load,'unknown');
  const invalid=compare(s,'pushups',0,{reps:0,weight:-1});assert.equal(invalid.deltas.reps,null);assert.equal(invalid.deltas.weight,null);
  const zero=compare(s,'pushups',0,{reps:8,weight:0});assert.equal(zero.deltas.weight,0);assert.equal(zero.load,'same');
});
test('Comparison preserves data and rounds decimal load differences without changing repetitions',()=>{
  const s=finished('2026-10-12');s.exercises.raises.sets[0].weight=0.2;const current={reps:10,weight:0.3};
  const r=compare(s,'raises',0,current);assert.equal(r.deltas.weight,0.1);r.previous.weight=99;assert.equal(s.exercises.raises.sets[0].weight,0.2);assert.equal(current.reps,10);
});
test('Daily graph can fall while the all-time record stays at the higher earlier result',()=>{
  const a=finished('2026-10-08'),b=finished('2026-10-12'),c=finished('2026-10-15');a.exercises.pullups.sets[0].reps=12;b.exercises.pullups.sets[0].reps=9;c.exercises.pullups.sets[0].reps=11;const data=journal(a,b,c);
  assert.deepEqual(Array.from(W.series(data,'pullups','reps','2026-10-01','2026-10-31'),p=>p.value),[12,9,11]);assert.equal(T.records(data).pullups.reps,12);
});

test('Visible invalid input clears the old repetition difference without overwriting the saved set',()=>{
  const prior=finished('2026-10-12'),s=T.newSession('2026-10-15','upper');
  prior.exercises.pullups.sets[1]={reps:8,weight:2};s.exercises.pullups.sets[1]={reps:10,weight:2};
  const fields=[{dataset:{field:'reps'},value:'0'},{dataset:{field:'weight'},value:'2'}],results=[];
  const node=()=>({style:{},classList:{toggle(){}}}),tile={...node(),querySelector:()=>node(),querySelectorAll:()=>fields};
  const env={T,data:journal(prior,s),session:()=>s,$:()=>node(),invalidInputs:()=>true,document:{querySelector:q=>q==='[data-tile="pullups-1"]'?tile:null},updateSetComparison:(id,index,values)=>{if(id==='pullups'&&index===1)results.push(compare(prior,id,index,values));}};
  const start=h.indexOf('      function updateWorkout(){'),end=h.indexOf('      function renderRecords()',start);
  vm.runInNewContext(h.slice(start,end)+'\nupdateWorkout();',env);
  assert.equal(results[0].deltas.reps,null,'An invalid visible zero must not show the old +2 delta');assert.equal(results[0].deltas.weight,0);
  fields[1].value='3';vm.runInNewContext(h.slice(start,end)+'\nupdateWorkout();',env);
  assert.equal(results[1].deltas.reps,null);assert.equal(results[1].deltas.weight,1);
  assert.equal(s.exercises.pullups.sets[1].reps,10);assert.equal(s.exercises.pullups.sets[1].weight,2);
});
