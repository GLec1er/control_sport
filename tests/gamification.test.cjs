const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const ctx = vm.createContext({});
for (const id of ['tracker-core', 'habits-core', 'coach-core', 'game-core']) {
  const script = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'));
  if (script) vm.runInContext(script[1], ctx);
}
const T = ctx.Tracker, G = ctx.WorkoutGame;
function journal(rows) {
  return {version:1, sessions:Object.fromEntries(rows.map(([date, type, completed=true]) => {
    const s = T.newSession(date, type);
    for (const [id, e] of Object.entries(s.exercises)) for (const set of e.sets) {
      if (id === 'lunges') {set.left=8; set.right=8;} else set.reps=8;
    }
    s.completed=completed;
    return [date + ':' + type, s];
  }))};
}
const game = () => {assert.ok(G, 'Gamification has not been implemented'); return G;};

// Catch counting a filled draft as a completed workout.
test('Only completed workouts earn experience', () => {
  const profile = game().summarize(journal([['2026-10-05','upper'], ['2026-10-06','lower',false]]), '2026-10-06');
  assert.equal(profile.workouts, 1);
  assert.equal(profile.xp, 100);
  assert.equal(profile.level, 1);
  assert.equal(profile.levelXp, 100);
  assert.equal(profile.toNextLevel, 200);
});

// Catch double awards on reload, repeated completion or backup import.
test('Reopening or merging the same completed workout does not multiply XP', () => {
  const data = journal([['2026-10-05','upper']]);
  const before = game().summarize(data, '2026-10-05');
  const restored = T.merge(data, T.readBackup(JSON.stringify(data)));
  const after = G.summarize(restored, '2026-10-05');
  assert.equal(after.xp, 100);
  assert.equal(G.reward(before, after).xp, 0);
  assert.equal(G.reward(before, after).badges.length, 0);
});

// Catch granting the weekly bonus for four sessions that miss a planned day.
test('The weekly bonus requires all four planned dates and is granted once', () => {
  const rows = [['2026-10-05','upper'],['2026-10-05','lower'],['2026-10-06','lower'],['2026-10-08','upper']];
  const before = game().summarize(journal(rows), '2026-10-09');
  assert.equal(before.xp, 400);
  const challenge = G.challenge(journal(rows), '2026-10-09');
  assert.equal(challenge.count, 3);
  assert.equal(challenge.done, false);
  const after = G.summarize(journal([...rows,['2026-10-09','lower']]), '2026-10-09');
  assert.equal(after.xp, 700);
  assert.equal(after.fullWeeks.length, 1);
  assert.equal(G.reward(before, after).workoutXp, 100);
  assert.equal(G.reward(before, after).weekXp, 200);
  assert.equal(G.reward(before, after).xp, 300);
});

// Catch confusing calendar dates with workout slots or resetting today's pending workout.
test('The streak skips rest days and gives the current training day time to finish', () => {
  const data = journal([['2026-10-05','upper'],['2026-10-06','lower'],['2026-10-08','upper'],['2026-10-09','lower']]);
  assert.equal(game().summarize(data, '2026-10-11').streak, 4);
  assert.equal(G.summarize(data, '2026-10-12').streak, 4);
  assert.equal(G.summarize(data, '2026-10-13').streak, 0);
  assert.equal(G.summarize(journal([['2026-10-12','upper']]), '2026-10-12').streak, 1);
});

// Catch a boundary that skips a level or loses XP inside the next level.
test('Level progression handles the exact boundary and a combined weekly reward', () => {
  const rows = [['2026-10-05','upper'],['2026-10-06','lower'],['2026-10-08','upper']];
  const before = game().summarize(journal(rows.slice(0,2)), '2026-10-08');
  const third = G.summarize(journal(rows), '2026-10-08');
  assert.equal(third.xp, 300);
  assert.equal(third.level, 2);
  assert.equal(third.levelXp, 0);
  assert.equal(G.reward(before, third).levelUp, true);
  const fourth = G.summarize(journal([...rows,['2026-10-09','lower']]), '2026-10-09');
  assert.equal(fourth.xp, 600);
  assert.equal(fourth.level, 3);
});

// Catch achievements unlocking from drafts or failing to recognize historical workouts.
test('Achievements recognize existing history and reveal only newly earned badges', () => {
  const empty = game().summarize(journal([]), '2026-10-11');
  const first = G.summarize(journal([['2026-10-05','upper']]), '2026-10-11');
  assert.deepEqual(Array.from(G.reward(empty, first).badges, b => b.id), ['first']);
  const mixed = G.summarize(journal([['2026-10-05','upper'],['2026-10-06','lower']]), '2026-10-11');
  assert.deepEqual(Array.from(G.reward(first, mixed).badges, b => b.id), ['balance']);
  assert.equal(mixed.badges.find(b => b.id === 'five').unlocked, false);
  assert.equal(mixed.badges.find(b => b.id === 'five').progress, 2);
});

// Catch grouping December and January as separate training weeks.
test('Weekly rewards work across a year boundary', () => {
  const data = journal([['2026-12-28','upper'],['2026-12-29','lower'],['2026-12-31','upper'],['2027-01-01','lower']]);
  const profile = game().summarize(data, '2027-01-02');
  assert.equal(profile.xp, 600);
  assert.equal(G.challenge(data, '2027-01-01', '2027-01-02').done, true);
  assert.equal(profile.streak, 4);
});
