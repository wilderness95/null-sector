import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('../server/index.js', import.meta.url));

test('server exits with an actionable error if static index is absent', async () => {
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: '0', STATIC_DIR: fileURLToPath(new URL('./', import.meta.url)) },
  });
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.equal(code, 1);
  assert.match(errors, /index\.html \(ENOENT\)/);
  assert.match(errors, /npm run build/);
});

test('server serves root and reports missing paths instead of masking them', async t => {
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, PORT: '0', STATIC_DIR: fileURLToPath(new URL('../', import.meta.url)) },
  });
  t.after(() => child.kill());
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const url = await new Promise((resolve, reject) => {
    child.stdout.on('data', data => {
      const match = data.toString().match(/http:\/\/localhost:\d+/);
      if (match) resolve(match[0]);
    });
    child.on('exit', code => reject(new Error(`Server exited: ${code}: ${errors}`)));
    child.on('error', reject);
  });
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /NULL SECTOR/);
  assert.equal((await fetch(`${url}/nonexistent-file`)).status, 404);
  assert.equal((await fetch(`${url}/%ZZ`)).status, 400);
});
