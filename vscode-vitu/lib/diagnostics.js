'use strict';

const { genRangeToSrc } = require('./virtual');

// Everything the editor shows for one file, in source coordinates:
//   { start, end, message, category, source, code?, unnecessary?, deprecated? }
// `category` is 'error' | 'warning' | 'suggestion'. Shared by the extension
// and the tests so both see exactly the same list.
function collectDiagnostics(service, fileName, v) {
	const out = v.problems.map((p) => ({
		start: p.start,
		end: p.end,
		message: p.message,
		category: 'error',
		source: 'vitu',
	}));
	if (!v.hasDirectives) return out;

	const ts = service.ts;
	// Syntax errors are only ours inside a directive expression; the built-in
	// server already reports the rest of the file.
	const raw = [
		...service.ls.getSyntacticDiagnostics(fileName).map((d) => [d, true]),
		...service.ls.getSemanticDiagnostics(fileName).map((d) => [d, false]),
	];
	const seen = new Set();
	for (const [d, directiveOnly] of raw) {
		if (d.start == null) continue;
		const m = genRangeToSrc(v, d.start, d.start + (d.length || 1), directiveOnly);
		if (!m) continue;
		// An r-if condition is generated twice, so its errors come twice.
		const key = `${m.start}:${m.end}:${d.code}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const directive = directiveMessage(ts, d, m.role);
		out.push({
			start: m.start,
			end: m.end,
			message: directive || ts.flattenDiagnosticMessageText(d.messageText, '\n'),
			category:
				d.category === ts.DiagnosticCategory.Error
					? 'error'
					: d.category === ts.DiagnosticCategory.Warning
						? 'warning'
						: 'suggestion',
			source: directive ? 'vitu' : 'ts',
			code: directive ? undefined : d.code,
			unnecessary: !!d.reportsUnnecessary,
			deprecated: !!d.reportsDeprecated,
		});
	}
	return out;
}

// A rejected argument of the `__vitu*` helpers would read "Argument of type
// 'string' is not assignable to parameter of type 'boolean | undefined'",
// which talks about code the user never wrote. Say it in directive terms.
const ARGUMENT_NOT_ASSIGNABLE = 2345;

function directiveMessage(ts, d, role) {
	if (!role || d.code !== ARGUMENT_NOT_ASSIGNABLE) return null;
	const head = typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText;
	const match = /^Argument of type '(.*)' is not assignable to parameter/.exec(head);
	const type = match ? match[1] : 'this value';
	const got = match ? `'${type}'` : type;
	if (role === 'r-for') {
		return `r-for expects an array, got ${got}. Convert it first, e.g. Array.from(...).`;
	}
	return `${role} expects a boolean, got ${got}. Compare explicitly, e.g. ${role}={value !== undefined} or ${role}={list.length > 0}.`;
}

module.exports = { collectDiagnostics };
