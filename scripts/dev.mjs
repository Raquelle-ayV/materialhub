import { spawn } from 'node:child_process';
import { importSamples } from './import-samples.mjs';
console.log('Unified preview samples:', await importSamples());
const children = [spawn(process.execPath, ['--watch', 'backend/src/server.mjs'], { stdio: 'inherit' }), spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost'], { stdio: 'inherit' })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code; }
for (const child of children) { child.on('error', error => { console.error(error); stop(1); }); child.on('exit', code => stop(code ?? 0)); }
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
