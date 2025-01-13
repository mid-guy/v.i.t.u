const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
	mode: 'development',
	devtool: 'source-map',
	entry: {
		bundle: './src/index.js',
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		publicPath: '/',
		filename: '[name].[contenthash:8].js',
		clean: true,
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				exclude: /node_modules/,
				use: {
					loader: 'babel-loader',
					options: {
						presets: ['@babel/preset-env', '@babel/preset-react'],
						// plugins: ['@mg/babel-plugin-v.i.t.u'],
						// plugins: ['./babel-plugin-transform-r-if.js'],
						plugins: ['../../scripts/index.cjs'],
					},
				},
			},
		],
	},
	devServer: {
		hot: true,
		/**
		 * @open = --open/package.json
		 */
		open: true,
		compress: true,
	},
	plugins: [
		new HtmlWebpackPlugin({
			template: './public/index.html',
			filename: 'index.html',
		}),
		// new WebpackManifestPlugin({
		// 	fileName: 'asset-manifest.json',
		// 	publicPath: publicUrlOrPath,
		// 	generate: (seed, files, entrypoints) => {
		// 		const manifestFiles = files.reduce((manifest, file) => {
		// 			manifest[file.name] = file.path;
		// 			return manifest;
		// 		}, seed);
		// 		const entrypointFiles = entrypoints.main.filter(
		// 			(fileName) => !fileName.endsWith('.map')
		// 		);
		// 		return {
		// 			files: manifestFiles,
		// 			entrypoints: entrypointFiles,
		// 		};
		// 	},
		// }),
		// new WebpackManifestPlugin({
		// 	fileName: 'asset-manifest.json',
		// 	publicPath: '',
		// }),
		// new GenerateSW({
		// 	// these options encourage the ServiceWorkers to get in there fast
		// 	// and not allow any straggling "old" SWs to hang around
		// 	clientsClaim: true,
		// 	skipWaiting: true,
		// }),
	],
	optimization: {
		minimize: true, // Enable code minimization
		minimizer: [
			new TerserPlugin({
				terserOptions: {
					parse: {
						// We want terser to parse ecma 8 code. However, we don't want it
						// to apply any minification steps that turns valid ecma 5 code
						// into invalid ecma 5 code. This is why the 'compress' and 'output'
						// sections only apply transformations that are ecma 5 safe
						// https://github.com/facebook/create-react-app/pull/4234
						ecma: 8,
					},
					compress: {
						ecma: 5,
						warnings: false,
						// Disabled because of an issue with Uglify breaking seemingly valid code:
						// https://github.com/facebook/create-react-app/issues/2376
						// Pending further investigation:
						// https://github.com/mishoo/UglifyJS2/issues/2011
						comparisons: false,
						// Disabled because of an issue with Terser breaking valid code:
						// https://github.com/facebook/create-react-app/issues/5250
						// Pending further investigation:
						// https://github.com/terser-js/terser/issues/120
						inline: 2,
					},
					mangle: {
						safari10: true,
					},
					// Added for profiling in devtools
					keep_classnames: false,
					keep_fnames: false,
					output: {
						ecma: 5,
						comments: false,
						// Turned on because emoji and regex is not minified properly using default
						// https://github.com/facebook/create-react-app/issues/2488
						ascii_only: true,
					},
				},
			}),
		],
		splitChunks: {
			chunks: 'all', // Split all chunks, including dynamic imports
			maxInitialRequests: 6, // No limit on number of requests
			minSize: 5000, // Minimum size before splitting (this can be adjusted)
			cacheGroups: {
				vendor: {
					test: /[\\/]node_modules[\\/]/, // Target node_modules for vendor chunk
					name(module) {
						// Extract the package name from node_modules path
						const packageName = module.context.match(
							/[\\/]node_modules[\\/](.*?)([\\/]|$)/
						)[1];
						return `vendor.${packageName.replace('@', '')}`; // Create a unique chunk for each vendor
					},
				},
			},
		},
	},
};
