const { babel } = require('@rollup/plugin-babel');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const copy = require('rollup-plugin-copy');

module.exports = {
	input: 'scripts/index.js',
	output: [
		{
			file: 'dist/index.js', // ES module
			format: 'es',
			sourcemap: true,
		},
		{
			file: 'dist/index.cjs', // CommonJS
			format: 'cjs',
			sourcemap: true,
		},
	],
	plugins: [
		resolve(),
		commonjs(),
		babel({
			babelHelpers: 'bundled',
			presets: ['@babel/preset-env'],
		}),
		copy({
			targets: [{ src: 'src/types.d.ts', dest: 'dist' }],
		}),
	],
};
