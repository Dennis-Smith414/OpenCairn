const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// Async on purpose: execSync blocks the event loop, so a stalled adb froze the
// whole Jest worker and jest.setTimeout could never fire. Here Node SIGKILLs the
// child at timeoutMs and the loop stays free.
async function adb(args, { timeoutMs = 15000, retries = 2, backoffMs = 750, label = '' } = {}) {
	let lastErr;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const { stdout } = await execFileAsync('adb', args, {
				timeout: timeoutMs,
				killSignal: 'SIGKILL',
				encoding: 'utf8',
			});
			return stdout;
		} catch (err) {
			lastErr = err;
			console.warn(
				`[adb${label ? ':' + label : ''}] attempt ${attempt + 1}/${retries + 1} failed for ` +
					`"adb ${args.join(' ')}"${err.killed ? ' (timed out, killed)' : ''}: ${err.message}`,
			);
			if (attempt < retries) await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
		}
	}
	throw new Error(`adb ${args.join(' ')} failed after ${retries + 1} attempts: ${lastErr.message}`);
}

module.exports = { adb };
