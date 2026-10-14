const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 6, 'Expected all six application scripts');
for (const [i, script] of scripts.entries()) {
  new vm.Script(script[2], {filename: `inline-${i}.js`});
}
assert.ok(html.includes("KEY='svoi-temp-workouts-v1'"), 'Keep the journal storage key');
assert.ok(!/qaClock|svoi-temp-qa|qa-next-day|audit-fixture/.test(html), 'No QA fixtures in the site');
assert.ok(!/<script[^>]*\bsrc\s*=|<link[^>]*rel=["']stylesheet/i.test(html), 'The site remains self-contained');
assert.ok(fs.existsSync(path.join(root, '.nojekyll')), 'Disable Jekyll for the static site');
console.log('Site checks passed: six scripts, original storage key, no QA code, self-contained HTML.');
