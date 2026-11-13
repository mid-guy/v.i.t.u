'use strict';

const path = require('path');
const ts = require('typescript');
const { buildVirtual, srcOffsetToGen } = require('../lib/virtual');
const { collectDiagnostics } = require('../lib/diagnostics');
const { createVituService } = require('../lib/service');

// test/fixture only holds a strict tsconfig.json; sources are given inline.
const fixtureDir = path.join(__dirname, 'fixture');
const service = createVituService(fixtureDir);
let version = 0;

// Runs `source` through the same pipeline as the extension and returns what
// the editor would show, in source coordinates.
function check(source, ext = 'tsx') {
	const fileName = path.join(fixtureDir, 'Case.' + ext);
	const v = buildVirtual(source);
	service.upsert(fileName, v.text, ++version);

	const diagnostics = () =>
		collectDiagnostics(service, fileName, v).map((d) => ({
			message: d.message,
			text: source.slice(d.start, d.end),
		}));

	// Generated offset for the position `offset` characters into `needle`.
	const at = (needle, offset = 0) =>
		srcOffsetToGen(v, source.indexOf(needle) + offset);

	const hover = (needle, offset = 0) => {
		const info = service.ls.getQuickInfoAtPosition(fileName, at(needle, offset));
		return info ? ts.displayPartsToString(info.displayParts) : null;
	};

	// Completion names with the cursor right after `needle`.
	const completions = (needle) => {
		const info = service.ls.getCompletionsAtPosition(
			fileName,
			at(needle, needle.length),
			{}
		);
		return info ? info.entries.map((e) => e.name) : [];
	};

	return { v, diagnostics, at, hover, completions };
}

module.exports = { check, fixtureDir };
