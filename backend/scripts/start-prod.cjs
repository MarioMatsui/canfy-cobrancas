'use strict';
/**
 * The Nest SWC build can emit dist/main.js or dist/src/main.js depending
 * on compiler configuration. Do not assume one layout when booting in PM2
 * or in the Docker runtime image.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const candidates = ['dist/main.js', 'dist/src/main.js'].map(file => path.join(root, file));

function resolveEntrypoint() {
  const emitted = candidates
    .filter(file => fs.existsSync(file))
    .map(file => ({ file, modifiedAt: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  if (!emitted.length) {
    throw new Error(
      'Build NestJS nao encontrado: execute npm run build no diretorio backend e verifique dist/main.js ou dist/src/main.js.',
    );
  }
  return emitted[0].file;
}

if (require.main === module) {
  const entrypoint = resolveEntrypoint();
  console.info('[backend] Starting from ' + entrypoint);
  require(entrypoint);
}

module.exports = { resolveEntrypoint };
