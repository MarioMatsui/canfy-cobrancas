import { createRequire } from 'node:module';

process.env.NODE_ENV ||= 'production';
process.env.PORT ||= '4020';
process.env.HOSTNAME ||= '0.0.0.0';

const require = createRequire(import.meta.url);
require('../.next/standalone/server.js');
