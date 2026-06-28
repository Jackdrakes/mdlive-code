const esbuild = require('esbuild');

const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  minify: false,
};

const watch = process.argv.includes('--watch');

async function build() {
  if (watch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log('[watch] watching for changes...');
  } else {
    await esbuild.build(config);
    console.log('[build] compiled to out/extension.js');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
