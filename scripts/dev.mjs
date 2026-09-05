import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

const python = existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3';
const sidecar = spawn(python, ['scripts/yfinance_server.py'], {
  stdio: 'inherit',
  env: process.env,
});
const web = spawn('node_modules/.bin/vinext', ['dev'], {
  stdio: 'inherit',
  env: process.env,
});

sidecar.on('error', (error) => {
  console.warn(`Yahoo Finance fallback unavailable: ${error.message}`);
  console.warn('TRACE will continue with cached market snapshots.');
});
sidecar.on('exit', (code) => {
  if (code && !web.killed) {
    console.warn(
      'Yahoo Finance fallback stopped; cached snapshots remain available.',
    );
  }
});

const stop = () => {
  sidecar.kill('SIGTERM');
  web.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
web.on('exit', (code) => {
  sidecar.kill('SIGTERM');
  process.exit(code ?? 0);
});
