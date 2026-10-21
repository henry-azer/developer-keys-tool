import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * `npm run dev` only: stands in for the Developer Keys host so the UI can be built
 * without installing the certificate. Stores the (still encrypted) vault in
 * web/.developer-keys.json. Never part of the production build.
 */
function devHost(): Plugin {
  const file = process.env.DEVELOPER_KEYS_DEV_FILE ?? '.developer-keys.json';
  let helloKey: Buffer | null = null;
  const etagOf = (b: Buffer) => `"${createHash('sha256').update(b).digest('hex').slice(0, 32)}"`;
  const body = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  const send = (res: ServerResponse, status: number, data?: string | Buffer, headers: Record<string, string> = {}) => {
    res.writeHead(status, headers);
    res.end(data);
  };

  // Runs the claude CLI in an empty temp folder with tools off (shell: true finds the npm .cmd shim on Windows).
  const cli = (args: string[], stdin: string | null, timeout: number) =>
    new Promise<{ stdout: string; stderr: string }>((resolveRun) => {
      const cwd = resolve(tmpdir(), 'developer-keys-smart-add');
      mkdirSync(cwd, { recursive: true });
      const child = spawn('claude', args, { cwd, shell: true, timeout });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', () => resolveRun({ stdout, stderr }));
      child.on('close', () => resolveRun({ stdout, stderr }));
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    });

  return {
    name: 'developer-keys-dev-host',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        if (url.pathname === '/api/health') return send(res, 200, JSON.stringify({ app: 'Developer Keys', version: 'dev' }));
        if (url.pathname === '/api/vault' && req.method === 'GET') {
          if (!existsSync(file)) return send(res, 404);
          const b = readFileSync(file);
          return send(res, 200, b.toString(), { 'Content-Type': 'application/json', ETag: etagOf(b) });
        }
        if (url.pathname === '/api/vault' && req.method === 'PUT') {
          const b = await body(req);
          const current = existsSync(file) ? etagOf(readFileSync(file)) : null;
          const wanted = req.headers['if-none-match'] === '*' ? null : (req.headers['if-match'] ?? '');
          if (current !== wanted) return send(res, 412, undefined, current ? { ETag: current } : {});
          writeFileSync(file, b);
          return send(res, 204, undefined, { ETag: etagOf(b) });
        }
        if (url.pathname === '/api/vault' && req.method === 'DELETE') {
          if (existsSync(file)) unlinkSync(file);
          helloKey = null;
          return send(res, 204);
        }
        // Windows Hello stand-in: keeps the vault key in memory and "asks for the gesture" with a short wait.
        if (url.pathname === '/api/hello' && req.method === 'GET') {
          return send(res, 200, JSON.stringify({ available: true, enabled: helloKey !== null }), { 'Content-Type': 'application/json' });
        }
        if (url.pathname === '/api/hello' && req.method === 'PUT') {
          helloKey = await body(req);
          await new Promise((r) => setTimeout(r, 1200));
          return send(res, 204);
        }
        if (url.pathname === '/api/hello/unlock' && req.method === 'POST') {
          await new Promise((r) => setTimeout(r, 1200));
          if (!helloKey) return send(res, 422, JSON.stringify({ detail: 'Windows Hello isn’t turned on for this vault.' }), { 'Content-Type': 'application/json' });
          return send(res, 200, helloKey, { 'Content-Type': 'application/octet-stream' });
        }
        if (url.pathname === '/api/hello' && req.method === 'DELETE') {
          helloKey = null;
          return send(res, 204);
        }
        if (url.pathname === '/api/backups' && req.method === 'POST') {
          mkdirSync('.dev-backups', { recursive: true });
          const path = `.dev-backups/${url.searchParams.get('name') ?? 'developer-keys'}-${Date.now()}.dkbackup`;
          writeFileSync(path, await body(req));
          return send(res, 200, JSON.stringify({ path }), { 'Content-Type': 'application/json' });
        }
        // Smart add through the Claude Code CLI, like the real host.
        if (url.pathname === '/api/ai/status') {
          const r = await cli(['auth', 'status'], null, 15_000);
          let available = false;
          try {
            available = !!JSON.parse(r.stdout).loggedIn;
          } catch {
            /* not installed, or no JSON */
          }
          return send(res, 200, JSON.stringify({ available, reason: available ? null : 'Claude Code isn’t available' }), {
            'Content-Type': 'application/json',
          });
        }
        if (url.pathname === '/api/ai/ask' && req.method === 'POST') {
          const prompt = (await body(req)).toString('utf8');
          const r = await cli(['-p', '--tools', '""', '--no-session-persistence', '--strict-mcp-config', '--output-format', 'json'], prompt, 120_000);
          try {
            const out = JSON.parse(r.stdout);
            if (out.is_error) return send(res, 502, JSON.stringify({ detail: out.result }), { 'Content-Type': 'application/json' });
            return send(res, 200, JSON.stringify({ text: out.result }), { 'Content-Type': 'application/json' });
          } catch {
            return send(res, 502, JSON.stringify({ detail: r.stderr || 'Claude Code didn’t answer' }), { 'Content-Type': 'application/json' });
          }
        }
        if (url.pathname === '/api/backups/auto' && req.method === 'PUT') {
          mkdirSync('.dev-backups', { recursive: true });
          const path = '.dev-backups/Developer Keys auto-backup.dkvault';
          writeFileSync(path, await body(req));
          return send(res, 200, JSON.stringify({ path }), { 'Content-Type': 'application/json' });
        }
        if (url.pathname === '/api/backups/open-folder' && req.method === 'POST') {
          const dir = resolve('.dev-backups');
          mkdirSync(dir, { recursive: true });
          const opener = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
          spawn(opener, [dir], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
          return send(res, 204);
        }
        send(res, 404);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devHost()],
  server: { port: Number(process.env.DEVELOPER_KEYS_DEV_PORT ?? 5199), strictPort: true },
});
