import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { attachCoop } from './socket.js';

const root = resolve(process.env.STATIC_DIR || fileURLToPath(new URL('../dist/', import.meta.url)));
try {
  await readFile(resolve(root, 'index.html'));
} catch (error) {
  console.error(`Cannot read ${resolve(root, 'index.html')} (${error.code}). Run npm run build and include dist/ in the image. Check file permissions and volume mounts.`);
  process.exit(1);
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.md': 'text/plain; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    response.end(content);
  } catch (error) {
    if (error instanceof URIError) { response.writeHead(400).end('Bad request'); return; }
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR') {
      console.warn(`Static file not found: ${request.url} (root: ${root})`);
      response.writeHead(404).end('Not found');
      return;
    }
    console.error(`Static file read failed: ${request.url} (${error.code || error.message}, root: ${root})`);
    response.writeHead(500).end('Static file read failed; check server logs');
  }
});
attachCoop(server);
server.listen(Number(process.env.PORT || 5173), '0.0.0.0', () => console.log(`NULL SECTOR + coop: http://localhost:${server.address().port} (static: ${root})`));
