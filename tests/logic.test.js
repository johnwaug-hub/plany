// Plany logic tests -- run with:  npm test
//
// app.js is one big browser script, so instead of importing it these tests
// pull the pure functions they need straight out of the source and run them
// in Node. Dates are evaluated in Arizona time (Plany's home time zone),
// which is where the UTC off-by-one bugs showed up.
process.env.TZ = 'America/Phoenix';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');

// Return the full source of `function name(...) { ... }` by brace matching.
function extractFunction(name) {
    const start = SRC.search(new RegExp('^(async )?function ' + name + '\\(', 'm'));
    if (start < 0) throw new Error('function not found: ' + name);
    let i = SRC.indexOf('{', start), depth = 0;
    for (; i < SRC.length; i++) {
        const c = SRC[i];
        if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return SRC.slice(start, i + 1);
    }
    throw new Error('unbalanced braces in ' + name);
}
// Return a top-level `const NAME = ...;` statement (may span lines).
function extractConst(name) {
    const m = SRC.match(new RegExp('^const ' + name + ' = [\\s\\S]*?;\\s*$', 'm'));
    if (!m) throw new Error('const not found: ' + name);
    return m[0].replace(/^const /, 'var ');
}

const ctx = vm.createContext({ console, Date, Set, Map, JSON, String, Number, Math, RegExp, Array, Object, parseInt, isNaN });
vm.runInContext([
    extractConst('NO_SCHOOL_EVENT_TYPES'),
    extractConst('NO_SCHOOL_TITLE_RE'),
    extractConst('SCHOOL_DAY_EVENT_TYPES'),
    extractConst('SCHOOL_ACTIVITY_TITLE_RE'),
    ...['formatDate', 'addDays', 'getWeekStart', 'isNoSchoolEvent', 'countSchoolDaysLeft',
        'escHtml', 'jsArg', 'safeImgUrl'].map(extractFunction)
].join('\n'), ctx);
const f = (name) => ctx[name];

test('formatDate uses the local date, not UTC', () => {
    assert.equal(f('formatDate')(new Date(2026, 9, 1, 22, 30)), '2026-10-01');   // 10:30 pm AZ = next day in UTC
});

test('getWeekStart: Monday for weekdays, and Sunday starts the NEXT week (house rule)', () => {
    const ws = (y, m, d) => f('formatDate')(f('getWeekStart')(new Date(y, m, d)));
    assert.equal(ws(2026, 8, 23), '2026-09-21');   // Wed -> Mon
    assert.equal(ws(2026, 8, 21), '2026-09-21');   // Mon -> itself
    assert.equal(ws(2026, 8, 26), '2026-09-21');   // Sat -> same week's Mon
    assert.equal(ws(2026, 8, 27), '2026-09-28');   // Sun -> the Monday after
});

test('isNoSchoolEvent: types and whole-word titles', () => {
    const nse = (title, type) => f('isNoSchoolEvent')({ title, type });
    assert.equal(nse('Labor Day', 'holiday'), true);
    assert.equal(nse('Winter Break', 'event'), true);
    assert.equal(nse('Spring Break', ''), true);
    assert.equal(nse('Conferences - No School', 'conference'), true);
    assert.equal(nse('New Teacher Induction', 'event'), true);
    assert.equal(nse('Professional Learning Day', 'event'), true);
});

test('isNoSchoolEvent: school activities are never days off', () => {
    const nse = (title, type) => f('isNoSchoolEvent')({ title, type });
    assert.equal(nse('Donuts with Dads Breakfast', 'event'), false);
    assert.equal(nse('Veterans Day Assembly', 'assembly'), false);
    assert.equal(nse('Veterans Day assembly', 'event'), false);
    assert.equal(nse('Breakout session', 'event'), false);
    assert.equal(nse('Book Fair', 'event'), false);
    assert.equal(nse('First Day of School', 'first-day'), false);
    assert.equal(nse('Last Day', 'last-day'), false);
});

test('countSchoolDaysLeft counts weekdays minus no-school days (first/last day count)', () => {
    const ev = [
        { title: 'First Day', type: 'first-day', startDate: '2026-08-05' },
        { title: 'Donuts with Dads Breakfast', type: 'event', startDate: '2026-08-06' },
        { title: 'Labor Day', type: 'holiday', startDate: '2026-09-07' },
        { title: 'Fall Break', type: 'break', startDate: '2026-10-05', endDate: '2026-10-09' },
        { title: 'Last Day', type: 'last-day', startDate: '2026-10-16' }
    ];
    // Aug 5 (Wed) .. Oct 16 (Fri) = 53 weekdays; minus Labor Day and a 5-day break = 47
    assert.equal(f('countSchoolDaysLeft')(new Date(2026, 7, 5), new Date(2026, 9, 16), ev), 47);
    // Time of day on the start date doesn't matter
    assert.equal(f('countSchoolDaysLeft')(new Date(2026, 7, 5, 18, 0), new Date(2026, 9, 16), ev), 47);
});

test('escHtml escapes markup and quotes; null/undefined become empty', () => {
    assert.equal(f('escHtml')(`<img src=x onerror="a('b')">`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;');
    assert.equal(f('escHtml')(null), '');
    assert.equal(f('escHtml')(undefined), '');
});

test('jsArg makes a string safe inside an inline onclick', () => {
    const out = f('jsArg')(`O'Brien');alert(1);//"`);
    assert.ok(!out.includes("'") && !out.includes('"') && !out.includes('<'));
    // Decoding the HTML entities gives back a valid JSON string literal
    const decoded = out.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.equal(JSON.parse(decoded), `O'Brien');alert(1);//"`);
});

test('safeImgUrl only allows https and inline images', () => {
    assert.equal(f('safeImgUrl')('javascript:alert(1)'), '');
    assert.equal(f('safeImgUrl')('http://example.com/a.png'), '');
    assert.equal(f('safeImgUrl')('https://example.com/a.png'), 'https://example.com/a.png');
    assert.equal(f('safeImgUrl')('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    assert.equal(f('safeImgUrl')('data:text/html;base64,AAAA'), '');
});
