const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const h=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});for(const id of ['tracker-core','habits-core','coach-core','game-core'])vm.runInContext(h.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],ctx);
const T=ctx.Tracker,W=ctx.WorkoutTools,G=ctx.WorkoutGame;
function filled(date='2026-10-13',type='lower'){const s=T.newSession(date,type);for(const [id,e]of Object.entries(s.exercises))for(const x of e.sets){if(id==='lunges'){x.left=8;x.right=8;}else x.reps=8;}s.completed=true;s.updatedAt=1;return s;}
const journal=(...ss)=>({version:1,sessions:Object.fromEntries(ss.map(s=>[s.date+':'+s.type,s]))}),plain=x=>JSON.parse(JSON.stringify(x));
test('An explicitly recorded zero load has a record date and agrees with the zero shown in its graph',()=>{
 const s=filled();s.exercises.squats.sets[0].weight=0;const d=journal(s),r=T.records(d).squats;assert.equal(r.weight,0);assert.equal(r.weightDate,'2026-10-13');assert.equal(T.records(d).bridge.weightDate,null);assert.equal(W.series(d,'squats','weight','2026-10-01','2026-10-13')[0].value,0);
});
function mainHandler(event){const a=h.indexOf("$('main').addEventListener('"+event+"',event=>{"),b=h.indexOf(event==='input'?"\n      $('main').addEventListener('change'":'\n      function updateScreenButton',a);assert.ok(a>=0&&b>a);return h.slice(a,b);}
function uiEnv(s){const env={T,W,data:journal(s),selected:s.date,session:()=>env.data.sessions[s.date+':'+s.type],type:()=>s.type,focusDraft:null,coachKey:()=>s.date+':'+s.type,save:()=>true,summary(){},updateWorkout(){},motivation(){},render(){},toast(){},Date:{now:()=>100},$:()=>({addEventListener:(e,fn)=>env.handler=fn})};return env;}
test('Editing a result after importing a future timestamp remains newer and survives reimporting the old copy',()=>{
 const s=filled(),old=plain(journal(s));s.updatedAt=1000;old.sessions[s.date+':'+s.type].updatedAt=1000;const env=uiEnv(s);vm.runInNewContext(mainHandler('input'),env);env.handler({target:{id:'',dataset:{exercise:'squats',set:'0',field:'reps'},value:'9',validity:{valid:true},closest:()=>null,removeAttribute(){}}});
 assert.ok(s.updatedAt>1000);assert.equal(T.merge(env.data,old).sessions[s.date+':'+s.type].exercises.squats.sets[0].reps,9);
});
test('Changing the number of sets also stays newer than an imported timestamp',()=>{
 const s=filled();s.updatedAt=1000;const old=plain(journal(s)),env=uiEnv(s);vm.runInNewContext(mainHandler('change'),env);env.handler({target:{dataset:{target:'abs'},value:'4'}});assert.ok(s.updatedAt>1000);assert.equal(T.merge(env.data,old).sessions[s.date+':'+s.type].exercises.abs.target,4);
});
test('Floor and hanging charts use different sets and combine both workout types by date',()=>{
 const s=filled();s.exercises.abs.sets=[{reps:20,weight:0},{reps:8,weight:0},{reps:6,weight:0}];const d=journal(s);
 assert.equal(W.series(d,'abs','reps','2026-10-01','2026-10-13','floor')[0].value,20);assert.equal(W.series(d,'abs','reps','2026-10-01','2026-10-13','hang')[0].value,8);assert.equal(W.series(d,'abs','reps','2026-10-01','2026-10-13')[0].value,20);
});
test('Separate abs records preserve source data and do not create a record from a weight-only set',()=>{
 assert.equal(typeof W.statRecords,'function');const s=filled();s.exercises.abs.sets=[{reps:20,weight:0},{reps:8,weight:0},{reps:null,weight:30}];s.completed=false;const d=journal(s),before=JSON.stringify(d),r=W.statRecords(d);assert.equal(r['abs-floor'].reps,20);assert.equal(r['abs-hang'].reps,8);assert.equal(r['abs-hang'].weight,0);assert.equal(r['abs-hang'].weightDate,s.date);assert.equal(JSON.stringify(d),before);
});
const goal=(variant)=>({id:'g-abs',kind:'exercise',exerciseId:'abs',metric:'reps',target:10,startDate:'2026-10-01',endDate:'2026-10-31',deleted:false,updatedAt:1,...(variant===undefined?{}:{variant})});
test('A hanging goal is not reached by floor repetitions and its variant survives a backup; legacy goals stay combined',()=>{
 const s=filled();s.exercises.abs.sets=[{reps:20,weight:null},{reps:8,weight:null},{reps:6,weight:null}];const d={...journal(s),goals:{'g-abs':goal('hang')}},restored=T.readBackup(JSON.stringify(d));assert.equal(restored.goals['g-abs'].variant,'hang');assert.equal(W.goalProgress(restored,restored.goals['g-abs'],'2026-10-13').value,8);assert.equal(W.goalProgress(restored,restored.goals['g-abs'],'2026-10-13').reached,false);assert.equal(W.goalProgress(d,goal(),'2026-10-13').value,20);assert.throws(()=>T.validateGoal(goal('bad'),'g-abs'));
});
test('After two closed days the next training is Thursday; unfinished today is offered when reviewing yesterday',()=>{
 assert.equal(typeof W.nextPlanned,'function');const upper=filled('2026-10-12','upper'),lower=filled();assert.deepEqual(plain(W.nextPlanned(journal(upper,lower),'2026-10-13','2026-10-13')),{date:'2026-10-15',type:'upper'});lower.completed=false;assert.deepEqual(plain(W.nextPlanned(journal(upper,lower),'2026-10-12','2026-10-13')),{date:'2026-10-13',type:'lower'});
});
test('Two finished days survive restore with 200 XP and a streak of two, and reimport never duplicates rewards',()=>{
 const d=journal(filled('2026-10-12','upper'),filled()),restored=T.readBackup(JSON.stringify(d));const state=G.summarize(restored,'2026-10-13');assert.equal(state.xp,200);assert.equal(state.streak,2);assert.equal(G.summarize(T.merge(restored,restored),'2026-10-13').xp,200);
});

test('Import handler restores both days and the new goal variant, rejects a bad file without overwriting the journal',async()=>{
 const d=T.readBackup(JSON.stringify(journal(filled('2026-10-12','upper'),filled()))),incoming={...plain(d),goals:{'g-abs':goal('hang')}},env={T,data:d,captureUiDrafts:()=>null,save:()=>true,render(){},toast:m=>env.messages.push(m),messages:[],$:()=>({addEventListener:(event,fn)=>env.importFile=fn})};
 const a=h.indexOf("$('import-file').addEventListener('change'"),b=h.indexOf("\n      window.addEventListener('storage'",a);vm.runInNewContext(h.slice(a,b),env);
 const event=text=>({target:{files:[{size:text.length,text:async()=>text}],value:'test'}});await env.importFile(event(JSON.stringify(incoming)));assert.equal(Object.keys(env.data.sessions).length,2);assert.equal(env.data.goals['g-abs'].variant,'hang');const before=JSON.stringify(env.data);await env.importFile(event('{broken'));assert.equal(JSON.stringify(env.data),before);assert.ok(env.messages.some(m=>m.startsWith('Не удалось загрузить')));
});
test('Export function serializes a valid complete journal and only reports preparation',()=>{
 const d=T.readBackup(JSON.stringify({...journal(filled('2026-10-12','upper'),filled()),goals:{'g-abs':goal('hang')}})),env={W,data:d,today:'2026-10-13',save:()=>true,renderBackup(){},toast:m=>env.message=m,Blob:class{constructor(parts){env.serialized=parts.join('');}},URL:{createObjectURL:()=> 'blob:qa',revokeObjectURL(){}},setTimeout(){},document:{createElement:()=>({click(){env.clicked=true;},remove(){}}),body:{appendChild(){}}}};
 const a=h.indexOf('      function exportBackup(){'),b=h.indexOf('      function goalTitle(',a);vm.runInNewContext(h.slice(a,b)+'\nexportBackup();',env);const restored=T.readBackup(env.serialized);assert.equal(Object.keys(restored.sessions).length,2);assert.equal(restored.goals['g-abs'].variant,'hang');assert.equal(env.clicked,true);assert.match(env.message,/подготовлена/);
});
test('Unreadable stored data is protected from an automatic overwrite',()=>{
 const nodes={},node=id=>nodes[id]||(nodes[id]={classList:{add(){},remove(){}}}),env={T,data:T.readBackup('{"version":1,"sessions":{}}'),KEY:'svoi-temp-workouts-v1',saveBlocked:false,$:node,localStorage:{getItem:()=>'{broken',setItem:()=>{env.written=true;}}};
 const a=h.indexOf('      function storageError('),b=h.indexOf('      let focusDraft=',a);vm.runInNewContext(h.slice(a,b)+'\nthis.didSave=save();',env);assert.equal(env.saveBlocked,true);assert.equal(env.didSave,false);assert.equal(env.written,undefined);assert.equal(nodes['storage-alert'].hidden,false);
});
test('Midnight while editing wellness keeps the selected day but removes the stale today label in training mode',()=>{
 const s=filled(),header={textContent:'Низ тела · 13 октября · сегодня'},env={T:{...T,localDate:()=> '2026-10-14'},today:'2026-10-13',selected:'2026-10-13',view:'workout',override:null,data:{wellness:{}},focusDraft:null,session:()=>s,coachKey:()=>s.date+':'+s.type,type:()=>s.type,label:()=> 'Низ тела',fmt:x=>x,invalidInputs:()=>false,renderWeek(){},summary(){},motivation(){},renderRest(){},render(){},$:id=>id==='reward-dialog'?{open:false}:null,document:{activeElement:{matches:()=>true},querySelectorAll:()=>[],querySelector:selector=>selector==='.training-heading .eyebrow'?header:null}};
 const a=h.indexOf('      function syncToday(){'),b=h.indexOf('      function chooseDate(',a);vm.runInNewContext(h.slice(a,b)+'\nsyncToday();',env);assert.equal(env.today,'2026-10-14');assert.equal(env.selected,'2026-10-13');assert.equal(header.textContent,'Низ тела · 2026-10-13');
});

test('An unrelated screen refresh preserves unsaved wellness text without saving it as a journal entry',()=>{
 const text={value:'Черновик после тренировки'},status={},panel={dataset:{wellnessDate:'2026-10-13'},getClientRects:()=>[{}],querySelector:selector=>selector==='textarea'?text:selector==='input:checked'?null:selector==='.wellness-save-status'?status:null,querySelectorAll:()=>[],contains:()=>false},env={view:'workout',editingGoalId:null,goalFormBaseline:null,data:{wellness:{}},document:{activeElement:null,body:{classList:{toggle(){}}},querySelectorAll:selector=>selector==='.wellness-card'||selector.startsWith('.wellness-card[')?[panel]:[]},$:()=>null,trainingActive:()=>false,renderWeek(){},summary(){},renderWorkout(){text.value='';},motivation(){},renderRest(){}};
 const a=h.indexOf('      function render('),b=h.indexOf('      function syncToday(){',a),helpers=h.indexOf('      function captureUiDrafts(){');vm.runInNewContext((helpers>=0?h.slice(helpers,a):'')+h.slice(a,b)+'\nconst d=typeof captureUiDrafts===\'function\'?captureUiDrafts():true;render(d);',env);assert.equal(text.value,'Черновик после тренировки');assert.equal(env.data.wellness['2026-10-13'],undefined);
});

test('A background refresh preserves a dirty goal form instead of restoring its saved target',()=>{
 const values={'goal-kind':'exercise','goal-exercise':'abs-hang','goal-metric':'reps','goal-target':'12','goal-start':'2026-10-13','goal-end':'2026-10-31'},fields=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value}])),env={view:'goals',editingGoalId:'g-abs',goalFormBaseline:{editingGoalId:'g-abs',values:{...values,'goal-target':'10'}},data:{wellness:{}},document:{activeElement:null,body:{classList:{toggle(){}}},querySelectorAll:()=>[]},$:id=>id==='goal-form'?{}:fields[id]||null,trainingActive:()=>false,renderWeek(){},summary(){},renderGoals(){fields['goal-target'].value='10';},updateGoalFields(){},motivation(){},renderRest(){}};
 const a=h.indexOf('      function render('),b=h.indexOf('      function syncToday(){',a),helpers=h.indexOf('      function captureUiDrafts(){');vm.runInNewContext((helpers>=0?h.slice(helpers,a):'')+h.slice(a,b)+'\nconst d=typeof captureUiDrafts===\'function\'?captureUiDrafts():true;render(d);',env);assert.equal(fields['goal-target'].value,'12');
});

test('At midnight goal cards refresh their period status while the goal editor keeps its unsaved input',()=>{
 const s=filled(),g={...goal('hang'),startDate:'2026-10-13',endDate:'2026-10-13'},list={innerHTML:'До цели: 2'},target={value:'12'},env={T:{...T,localDate:()=> '2026-10-14'},W,today:'2026-10-13',selected:'2026-10-13',view:'goals',override:null,data:{...journal(s),wellness:{},goals:{'g-abs':g}},focusDraft:null,session:()=>s,coachKey:()=>s.date+':'+s.type,type:()=>s.type,label:()=> 'Низ тела',fmt:x=>x,short:x=>x,escape:x=>x,goalTitle:()=> 'Пресс на турнике',goalUnit:()=> 'повт.',medal:()=>'',invalidInputs:()=>false,renderWeek(){},summary(){},motivation(){},renderRest(){},render(){},$:id=>id==='reward-dialog'?{open:false}:id==='goal-target'?target:null,document:{activeElement:{matches:()=>true},querySelectorAll:()=>[],querySelector:selector=>selector==='.goal-list'?list:null}};
 const c=h.indexOf('      function goalCardsHtml(){'),d=h.indexOf('      function renderGoals(){',c),a=h.indexOf('      function syncToday(){'),b=h.indexOf('      function chooseDate(',a);vm.runInNewContext((c>=0?h.slice(c,d):'')+h.slice(a,b)+'\nsyncToday();',env);assert.match(list.innerHTML,/Период закончился/);assert.equal(target.value,'12');
});
