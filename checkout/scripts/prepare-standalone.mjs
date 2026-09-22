import { access, cp, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standaloneDir = path.join(root, '.next', 'standalone');
const staticDir = path.join(root, '.next', 'static');
const publicDir = path.join(root, 'public');

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standaloneDir))) {
  throw new Error(
    'Standalone output not found. Ensure next.config.mjs has output: "standalone" and that next build completed successfully.',
  );
}

if (!(await exists(staticDir))) {
  throw new Error('Next.js static output not found at .next/static.');
}

const standaloneNextDir = path.join(standaloneDir, '.next');
const standaloneStaticDir = path.join(standaloneNextDir, 'static');
const standalonePublicDir = path.join(standaloneDir, 'public');

await mkdir(standaloneNextDir, { recursive: true });

await rm(standaloneStaticDir, { recursive: true, force: true });
await cp(staticDir, standaloneStaticDir, { recursive: true });

await rm(standalonePublicDir, { recursive: true, force: true });
if (await exists(publicDir)) {
  await cp(publicDir, standalonePublicDir, { recursive: true });
}

console.log('Standalone checkout prepared with public/ and .next/static assets.');
