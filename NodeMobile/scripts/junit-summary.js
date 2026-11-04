// Renders JUnit XML files as a markdown table for $GITHUB_STEP_SUMMARY.
// Usage: node scripts/junit-summary.js <title> <file.xml>...
const fs = require('fs');

const [title, ...files] = process.argv.slice(2);
const attr = (s, k) => (s.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
const unesc = s => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

let tests = 0, failures = 0, errors = 0, skipped = 0, time = 0;
const failed = [];
for (const f of files) {
	if (!fs.existsSync(f)) continue;
	const xml = fs.readFileSync(f, 'utf8');
	const root = xml.match(/<testsuites[^>]*>/);
	if (root) {
		tests += +attr(root[0], 'tests') || 0;
		failures += +attr(root[0], 'failures') || 0;
		errors += +attr(root[0], 'errors') || 0;
		time += +attr(root[0], 'time') || 0;
	}
	for (const m of xml.matchAll(/<testcase([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
		const body = m[2] || '';
		if (/<skipped/.test(body)) skipped++;
		const fail = body.match(/<failure[^>]*?(?:message="([^"]*)")?[^>]*>/);
		if (fail) failed.push({ name: unesc(attr(m[1], 'name') || ''), msg: unesc((fail[1] || '').split('\n')[0]).slice(0, 300) });
	}
}

const bad = failures + errors;
let out = `### ${title}: ${bad ? 'FAILED' : 'passed'}\n\n`;
out += `| Tests | Passed | Failed | Skipped | Time |\n|---|---|---|---|---|\n`;
out += `| ${tests} | ${tests - bad - skipped} | ${bad} | ${skipped} | ${time.toFixed(1)}s |\n`;
if (failed.length) {
	out += `\n**Failures**\n\n`;
	for (const f of failed) out += `- \`${f.name}\`: ${f.msg}\n`;
}
process.stdout.write(out + '\n');
