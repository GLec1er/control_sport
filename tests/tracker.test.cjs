const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const file = path.join(__dirname, '../index.html');
const html = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const context = vm.createContext({});
const script = html.match(/<script id="tracker-core">([\s\S]*?)<\/script>/);
if (script) vm.runInContext(script[1], context);
const core = context.Tracker;
const session = (date, type, exercises, completed = false, updatedAt = 1) => ({ date, type, exercises, completed, updatedAt });

test('The requested upper/lower schedule includes recovery days', () => {
  assert.ok(core, 'Tracker core has not been implemented');
  assert.equal(core.scheduledType('2026-10-12'), 'upper');
  assert.equal(core.scheduledType('2026-10-13'), 'lower');
  assert.equal(core.scheduledType('2026-10-14'), 'rest');
  assert.equal(core.scheduledType('2026-10-15'), 'upper');
  assert.equal(core.scheduledType('2026-10-16'), 'lower');
  assert.equal(core.scheduledType('2026-10-17'), 'rest');
  assert.equal(core.scheduledType('2026-10-18'), 'rest');
});

test('Week navigation stays correct across year boundaries', () => {
  assert.ok(core, 'Tracker core has not been implemented');
  assert.equal(JSON.stringify(core.weekDates('2027-01-01')), JSON.stringify(['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']));
});

test('Personal records use a single set, keep weight separate and combine abs from both days', () => {
  assert.ok(core, 'Tracker core has not been implemented');
  const data = { sessions: {
    '2026-10-12:upper': session('2026-10-12','upper',{pushups:{target:4,sets:[{reps:12,weight:0},{reps:9,weight:5}]},abs:{target:3,sets:[{reps:20,weight:null}]}}),
    '2026-10-13:lower': session('2026-10-13','lower',{abs:{target:3,sets:[{reps:25,weight:0}]},lunges:{target:3,sets:[{left:11,right:9,weight:8},{left:10,right:12,weight:6}]}})
  }};
  const records = core.records(data);
  assert.equal(records.pushups.reps, 12);
  assert.equal(records.pushups.weight, 5);
  assert.equal(records.abs.reps, 25);
  assert.equal(records.lunges.left, 11);
  assert.equal(records.lunges.right, 12);
});

test('A lunge set is complete only when both legs have repetitions', () => {
  assert.ok(core, 'Tracker core has not been implemented');
  const workout = core.newSession('2026-10-13','lower');
  assert.equal(core.stats(workout).total, 16);
  assert.equal(core.stats(workout).filled, 0);
  workout.exercises.lunges.sets[0].left = 10;
  assert.equal(core.stats(workout).filled, 0);
  workout.exercises.lunges.sets[0].right = 10;
  assert.equal(core.stats(workout).filled, 1);
});

test('Backup round trip keeps recorded data and rejects invalid values', () => {
  assert.ok(core, 'Tracker core has not been implemented');
  const data = {version:1,sessions:{'2026-10-12:upper':core.newSession('2026-10-12','upper')}};
  data.sessions['2026-10-12:upper'].exercises.pushups.sets[0].reps = 15;
  const restored = core.readBackup(JSON.stringify(data));
  assert.equal(restored.sessions['2026-10-12:upper'].exercises.pushups.sets[0].reps,15);
  data.sessions['2026-10-12:upper'].exercises.pushups.sets[0].reps = -5;
  assert.throws(() => core.readBackup(JSON.stringify(data)));
  assert.throws(() => core.readBackup('{"version":99,"sessions":{}}'));
  assert.throws(() => core.readBackup('{"version":1,"sessions":{"2026-02-30:upper":{}}}'));
});

test('Import preserves other dates and uses the newer record for conflicts', () => {
  assert.ok(core, 'Tracker core has not been implemented');
  const first = core.newSession('2026-10-12','upper');
  first.updatedAt = 2;
  first.exercises.pushups.sets[0].reps = 12;
  const newer = core.newSession('2026-10-12','upper');
  newer.updatedAt = 3;
  newer.exercises.pushups.sets[0].reps = 18;
  const separate = core.newSession('2026-10-13','lower');
  const merged = core.merge({version:1,sessions:{'2026-10-12:upper':first,'2026-10-13:lower':separate}}, {version:1,sessions:{'2026-10-12:upper':newer}});
  assert.equal(Object.keys(merged.sessions).length,2);
  assert.equal(merged.sessions['2026-10-12:upper'].exercises.pushups.sets[0].reps,18);
  const olderMerge = core.merge(merged,{version:1,sessions:{'2026-10-12:upper':first}});
  assert.equal(olderMerge.sessions['2026-10-12:upper'].exercises.pushups.sets[0].reps,18);
});
