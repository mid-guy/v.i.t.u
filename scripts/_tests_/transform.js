import { createRequire } from 'node:module';
import { transformSync } from '@babel/core';

const require = createRequire(import.meta.url);
const plugin = require('../index.cjs');

// Runs the plugin alone, leaving JSX in the output so tests read like source.
export function transform(code) {
	const result = transformSync(code, {
		configFile: false,
		babelrc: false,
		compact: true,
		plugins: ['@babel/plugin-syntax-jsx', plugin],
	});
	return result.code;
}
