const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const h=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});
for(const id of ['tracker-core','coach-core'])vm.runInContext(h.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],ctx);
const T=ctx.Tracker,W=ctx.WorkoutTools;
function finished(date,type='upper',reps=8){const s=T.newSession(date,type);for(const [id,e]of Object.entries(s.exercises))for(const set of e.sets){if(id==='lunges'){set.left=reps;set.right=reps;}else set.reps=reps;}s.completed=true;s.updatedAt=1;return s;}
const data=(...ss)=>({version:1,sessions:Object.fromEntries(ss.map(s=>[s.date+':'+s.type,s]))});
const previous=(...args)=>{assert.equal(typeof W.previousExerciseSession,'function','Abs-specific comparison rule is missing');return W.previousExerciseSession(...args);};
test('Abs uses the preceding workout date across upper and lower while other exercises retain their type',()=>{
 const upper=finished('2026-10-12'),lower=finished('2026-10-13','lower');upper.updatedAt=99999;const d=data(upper,lower);
 assert.equal(previous(d,'2026-10-15','upper','abs').date,'2026-10-13');assert.equal(previous(d,'2026-10-15','upper','pullups').date,'2026-10-12');
 assert.equal(previous(data(upper),'2026-10-13','lower','abs').date,'2026-10-12');assert.equal(previous(data(upper),'2026-10-13','lower','squats'),null);
});
test('Abs ignores unfinished, current and future workouts and uses a deterministic latest entry for a tied date',()=>{
 const upper=finished('2026-10-12'),lower=finished('2026-10-12','lower'),draft=finished('2026-10-13','lower'),current=finished('2026-10-15'),future=finished('2026-10-16','lower');lower.updatedAt=2;draft.completed=false;
 assert.equal(previous(data(upper,lower,draft,current,future),'2026-10-15','upper','abs').type,'lower');assert.equal(previous(data(current,future),'2026-10-15','upper','abs'),null);
});
test('Floor and hanging results remain matched to their exact set number in the preceding day',()=>{
 const a=finished('2026-10-12'),b=finished('2026-10-13','lower');b.exercises.abs.sets=[{reps:20,weight:null},{reps:8,weight:null},{reps:6,weight:null}];const d=data(a,b),before=JSON.stringify(d),p=previous(d,'2026-10-15','upper','abs');
 assert.equal(W.compareSet(p,'abs',0,{reps:22}).deltas.reps,2);assert.equal(W.compareSet(p,'abs',1,{reps:10}).deltas.reps,2);assert.equal(W.compareSet(p,'abs',2,{reps:7}).deltas.reps,1);assert.equal(JSON.stringify(d),before);
});
test('A hanging set absent in the preceding day stays new instead of borrowing a floor set or an older day',()=>{
 const a=finished('2026-10-12'),b=finished('2026-10-13','lower');b.exercises.abs.target=1;b.exercises.abs.sets=b.exercises.abs.sets.slice(0,1);const p=previous(data(a,b),'2026-10-15','upper','abs');
 assert.equal(W.compareSet(p,'abs',1,{reps:10}).state,'new-set');assert.equal(W.compareSet(p,'abs',1,{reps:10}).previous,null);
});
