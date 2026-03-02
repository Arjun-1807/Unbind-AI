#!/usr/bin/env node
import { main } from '../src/index.js';

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write('\n' + (err.message || String(err)) + '\n');
  process.exit(1);
});
