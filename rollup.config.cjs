const { babel } = require('@rollup/plugin-babel');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const copy = require('rollup-plugin-copy');

module.exports = {
	input: 'scripts/index.cjs',
	output: [
		{
			file: 'dist/index.js', // ES module
			format: 'es',
			sourcemap: true,
		},
		{
			file: 'dist/index.cjs', // CommonJS
			format: 'cjs',
			exports: 'default',
			sourcemap: true,
		},
	],
	plugins: [
		resolve(),
		commonjs(),
		babel({
			babelHelpers: 'bundled',
			presets: [['@babel/preset-env', { targets: { node: '18' } }]],
		}),
		copy({
			targets: [{ src: 'scripts/types.d.ts', dest: 'dist' }],
		}),
	],
};
