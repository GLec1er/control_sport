const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),ctx=vm.createContext({});
for(const id of ['tracker-core','habits-core','coach-core'])vm.runInContext(html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'))[1],ctx);
const T=ctx.Tracker,W=ctx.WorkoutTools,plain=x=>JSON.parse(JSON.stringify(x)),from='2026-10-01',to='2026-10-15';
function row(date,type='upper',reps=8){const s=T.newSession(date,type);for(const [id,e]of Object.entries(s.exercises))for(const set of e.sets){if(id==='lunges'){set.left=reps;set.right=reps+2;}else set.reps=reps;}s.updatedAt=1;return s;}
const journal=(...rows)=>({version:1,sessions:Object.fromEntries(rows.map(s=>[s.date+':'+s.type,s]))});
const overview=(d,scope='all',metric='reps',a=from,b=to)=>{assert.equal(typeof W.overview,'function','Missing overview graph data');return W.overview(d,scope,metric,a,b);};

test('Overview includes all exercise series without duplicating combined abs and uses a sorted shared timeline',()=>{
 const data=journal(row('2026-10-15','upper',10),row('2026-10-13','lower',9),row('2026-10-12','upper',8)),out=overview(data);
 assert.equal(out.series.length,10);assert.equal(out.series.some(s=>s.key==='abs'),false);assert.deepEqual(plain(out.dates),['2026-10-12','2026-10-13','2026-10-15']);assert.deepEqual(plain(out.series.find(s=>s.key==='pullups').points),[{date:'2026-10-12',value:8},{date:'2026-10-15',value:10}]);assert.equal(out.sessions,3);assert.equal(out.sets,50);
});
test('Upper and lower filters separate sessions, including abs recorded on the other type',()=>{
 const data=journal(row('2026-10-12','upper',8),row('2026-10-13','lower',30)),upper=overview(data,'upper'),lower=overview(data,'lower');assert.equal(upper.series.some(s=>s.key==='squats'),false);assert.equal(lower.series.some(s=>s.key==='pushups'),false);assert.deepEqual(plain(upper.series.find(s=>s.key==='abs-floor').points),[{date:'2026-10-12',value:8}]);assert.deepEqual(plain(lower.series.find(s=>s.key==='abs-floor').points),[{date:'2026-10-13',value:30}]);assert.equal(upper.sessions,1);assert.equal(lower.sets,16);
});
test('Period bounds exclude future and older results while retaining completed sets in an active workout',()=>{
 const data=journal(row('2026-09-30'),row('2026-10-12'),row('2026-10-15'),row('2026-10-19'));data.sessions['2026-10-15:upper'].exercises.abs.sets[2].reps=null;const out=overview(data,'all','reps','2026-10-15',to);assert.deepEqual(plain(out.dates),['2026-10-15']);assert.equal(out.sessions,1);assert.equal(out.sets,16);assert.equal(out.series.find(s=>s.key==='pullups').points[0].value,8);
});
test('Missing weight stays absent, explicit zero is plotted and weight-only sets do not create graph points',()=>{
 const a=row('2026-10-12'),b=T.newSession('2026-10-15','upper');a.exercises.pullups.sets[0].weight=0;a.exercises.raises.sets[0].weight=6;b.exercises.raises.sets[0].weight=12;const out=overview(journal(a,b),'all','weight');assert.deepEqual(plain(out.series.map(s=>s.key)),['pullups','raises']);assert.deepEqual(plain(out.series.find(s=>s.key==='pullups').points),[{date:'2026-10-12',value:0}]);assert.deepEqual(plain(out.dates),['2026-10-12']);assert.equal(out.sessions,1);
});
test('Lunges use the smaller leg and abs variants retain their own set values',()=>{
 const a=row('2026-10-13','lower');a.exercises.abs.sets[0].reps=40;a.exercises.abs.sets[1].reps=15;const out=overview(journal(a));assert.equal(out.series.find(s=>s.key==='lunges').points[0].value,8);assert.equal(out.series.find(s=>s.key==='abs-floor').points[0].value,40);assert.equal(out.series.find(s=>s.key==='abs-hang').points[0].value,15);
});
test('An empty period has no invented points, and deriving the graph leaves old backups unchanged',()=>{
 const data=journal(row('2026-10-12')),before=JSON.stringify(data),out=overview(data,'lower');assert.equal(out.series.length,0);assert.deepEqual(plain(out.dates),[]);assert.equal(out.sessions,0);assert.equal(JSON.stringify(data),before);const restored=T.readBackup(JSON.stringify(data));assert.deepEqual(plain(overview(restored)),plain(overview(data)));
});
test('Overview rejects unsupported scope, metric and reversed or malformed dates',()=>{
 assert.equal(typeof W.overview,'function');for(const args of [['bad','reps',from,to],['all','bad',from,to],['all','reps','2026-10-16',to],['all','reps','bad',to]])assert.throws(()=>W.overview(journal(),...args));
});
function ui(extra={}){
 const start=html.indexOf('      function progressModeHtml('),end=html.indexOf('      const monthEnd=',start);assert.ok(start>=0,'Missing overview graph UI');const main={innerHTML:''},env={T,W,data:journal(row('2026-10-12'),row('2026-10-13','lower',12),row('2026-10-15','upper',10)),today:to,chartMode:'overview',chartScope:'all',chartMetric:'reps',chartRange:'30',chartExercise:'pullups',hiddenChartSeries:new Set(),window:{innerWidth:1000},$:id=>id==='main'?main:null,escape:String,short:d=>d.slice(5),fmt:d=>d,numberText:String,...extra};vm.runInNewContext(html.slice(start,end),env);return {env,main};
}
test('All lines use the same date coordinates, and a one-point or zero-load series has finite geometry',()=>{
 const {env}=ui(),svg=env.multiChartSvg([{key:'pullups',name:'Pull',points:[{date:'2026-10-12',value:5},{date:'2026-10-15',value:6}]},{key:'squats',name:'Squat',points:[{date:'2026-10-13',value:0},{date:'2026-10-15',value:10}]}],'кг',['2026-10-12','2026-10-13','2026-10-15']);
 const xs=[...svg.matchAll(/<circle[^>]*cx="([^"]+)"[^>]*data-date="2026-10-15"/g)].map(m=>m[1]);assert.equal(xs.length,2);assert.equal(xs[0],xs[1]);assert.doesNotMatch(svg,/NaN|Infinity/);assert.doesNotMatch(env.multiChartSvg([{key:'pullups',name:'Pull',points:[{date:to,value:0}]}],'кг',[to]),/NaN|Infinity/);
});
test('Hiding a line removes its SVG series and table column without discarding the other exercises',()=>{
 const {env,main}=ui({hiddenChartSeries:new Set(['pullups'])});env.renderProgress();assert.doesNotMatch(main.innerHTML,/<g data-series="pullups"/);assert.match(main.innerHTML,/<g data-series="pushups"/);assert.match(main.innerHTML,/data-chart-series="pullups"[^>]*aria-pressed="false"/);env.hiddenChartSeries.clear();env.renderProgress();assert.match(main.innerHTML,/<g data-series="pullups"/);
});
test('Empty scope and all-hidden lines explain their state while single-exercise mode still works',()=>{
 const {env,main}=ui({data:journal()});env.renderProgress();assert.match(main.innerHTML,/Пока нет результатов/);env.data=journal(row('2026-10-12'));env.hiddenChartSeries=new Set(W.statChoices(false).map(d=>d.key));env.renderProgress();assert.match(main.innerHTML,/Все линии скрыты/);env.chartMode='single';env.renderProgress();assert.match(main.innerHTML,/id="chart-exercise"/);assert.match(main.innerHTML,/График прогресса: Подтягивания/);
});
