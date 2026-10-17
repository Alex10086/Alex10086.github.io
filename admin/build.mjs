import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = path.join(root, 'admin/dist');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['admin/ui/app.js'],
  outdir,
  bundle: true,
  format: 'esm',
  target: ['es2022'],
  minify: true,
  legalComments: 'linked',
  assetNames: 'assets/[name]-[hash]',
  loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' },
  logLevel: 'info',
});
await copyFile(path.join(root, 'admin/ui/index.html'), path.join(outdir, 'index.html'));
console.log('私人后台已构建至 admin/dist；不会包含在 Hexo 的 dist 中。');
