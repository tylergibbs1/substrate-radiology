const webpack = require('webpack');
const { merge } = require('webpack-merge');
const path = require('path');

const pkg = require('./../package.json');
const webpackCommon = require('./../../../.webpack/webpack.base.js');

const ROOT_DIR = path.join(__dirname, './../');
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const ENTRY = { app: `${SRC_DIR}/index.ts` };

module.exports = (env, argv) => {
  const commonConfig = webpackCommon(env, argv, { SRC_DIR, DIST_DIR, ENTRY });

  return merge(commonConfig, {
    optimization: {
      minimize: true,
      sideEffects: false,
    },
    output: {
      path: ROOT_DIR,
      library: 'substrate-mode',
      libraryTarget: 'umd',
      libraryExport: 'default',
      filename: pkg.main,
    },
    externals: [
      /\b(vtk.js)/,
      /\b(dcmjs)/,
      /\b(gl-matrix)/,
      /^@ohif/,
      /^@cornerstonejs/,
      /^@substrate/,
    ],
    plugins: [
      new webpack.optimize.LimitChunkCountPlugin({
        maxChunks: 1,
      }),
    ],
  });
};
