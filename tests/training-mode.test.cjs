const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const h=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});
for(const id of ['tracker-core','coach-core'])vm.runInContext(h.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],ctx);
const T=ctx.Tracker,W=ctx.WorkoutTools;
const step=(...args)=>{assert.equal(typeof W.stepReps,'function','Quick repetition controls are missing');return W.stepReps(...args);};
test('Quick repetition controls start an empty set only when adding and stay within valid limits',()=>{
 assert.equal(step(null,1),1);assert.equal(step(null,-1),null);assert.equal(step(1,-1),1);assert.equal(step(9999,1),9999);assert.equal(step(8,1),9);assert.equal(step(8,-1),7);
});
test('Quick repetition controls reject invalid saved values and unsupported directions',()=>{
 assert.equal(typeof W.stepReps,'function');
 for(const value of [0,-1,2.5,10000,'8',NaN])assert.throws(()=>step(value,1));for(const direction of [0,2,-2])assert.throws(()=>step(8,direction));
});
test('The dedicated layout stays scoped to a workout, even with a legacy enabled focus setting',()=>{
 const match=h.match(/function trainingActive\(\)\{([^}]*)\}/);assert.ok(match,'Dedicated workout layout is missing');
 for(const [view,type,focus,expected]of [['workout','upper',true,true],['workout','lower',true,true],['workout','rest',true,false],['progress','upper',true,false],['workout','upper',false,false]]){
  assert.equal(vm.runInNewContext('('+match[0]+')()', {view,type:()=>type,focusMode:()=>focus}),expected);
 }
});
function coachHandler(env){const a=h.indexOf('      function handleCoachClick('),b=h.indexOf('      function handleCoachChange(',a);assert.ok(a>=0&&b>a);vm.runInNewContext(h.slice(a,b)+'\nthis.handle=handleCoachClick;',env);return env.handle;}
function switchEnv(){const s=T.newSession('2026-10-13','lower'),draft={key:'2026-10-13:lower:squats:0',values:{reps:12,weight:2}},env={W,data:T.readBackup(JSON.stringify({version:1,sessions:{'2026-10-13:lower':s}})),focusDraft:draft,view:'workout',save:()=>true,render:()=>{},focusMode:()=>!!env.data.settings.focus,invalidInputs:()=>false,toast:m=>env.messages.push(m),messages:[],window:{scrollTo(){}},document:{getElementById:()=>null},$:()=>null};return {env,draft};}
test('Entering and leaving training preserves an unrecorded set without counting it as completed',()=>{
 const {env,draft}=switchEnv(),handle=coachHandler(env);assert.equal(handle({dataset:{focus:'true'}},{}),true);assert.equal(env.data.settings.focus,true);assert.equal(env.focusDraft,draft);assert.equal(T.stats(env.data.sessions['2026-10-13:lower']).filled,0);
 handle({dataset:{focus:'false'}},{});assert.equal(env.data.settings.focus,false);assert.equal(env.focusDraft,draft);assert.equal(T.stats(env.data.sessions['2026-10-13:lower']).filled,0);
});
test('Entering training from the journal keeps invalid visible values available for correction',()=>{
 const {env}=switchEnv();env.invalidInputs=()=>true;const handle=coachHandler(env);handle({dataset:{focus:'true'}},{});assert.equal(env.data.settings.focus,false);assert.ok(env.messages.some(m=>m.includes('Исправь')));
});

test('Updating recorded totals does not replace an unsaved focus comparison with empty saved values',()=>{
 const s=T.newSession('2026-10-13','lower'),node=()=>({style:{},classList:{toggle(){}}}),updates=[];
 const env={T,data:{version:1,sessions:{}},session:()=>s,$:()=>node(),invalidInputs:()=>false,document:{querySelector:()=>null},updateSetComparison:(...v)=>updates.push(v)};
 const a=h.indexOf('      function updateWorkout(){'),b=h.indexOf('      function renderRecords()',a);vm.runInNewContext(h.slice(a,b)+'\nupdateWorkout();',env);
 assert.equal(updates.length,0,'Focus comparisons are based on the visible draft, not empty saved sets');
});

test('Training uses its own rest panel and keeps a timer from another workout out of the dedicated screen',()=>{
 const a=h.indexOf('      function renderRest(){'),b=h.indexOf('      function tickRest(){',a);
 for(const [training,key,expected]of [[true,'2026-10-13:lower',false],[true,'2026-10-12:upper',false],[false,'2026-10-13:lower',true]]){
  const dock={},env={data:{restTimer:{status:'running',sessionKey:key,endsAt:999999,remaining:90}},trainingActive:()=>training,coachKey:()=> '2026-10-13:lower',$:()=>dock,document:{body:{classList:{toggle(){}}}},short:x=>x,label:x=>x,tickRest:()=>{}};
  vm.runInNewContext(h.slice(a,b)+'\nrenderRest();',env);assert.equal(!dock.hidden,expected);
 }
});
