#!/usr/bin/env node
/**
 * Roda todos os testes do CineBook no navegador (Playwright).
 *
 *   cd tests && npm install && npx playwright install chromium && npm test
 *
 * Sobe um servidor local com o site na porta 8090, executa cada arquivo
 * *.test.js e mostra um resumo. Nenhum teste acessa a internet: TMDB,
 * Google Books e Open Library são simulados dentro de cada teste.
 *
 * O teste "atualizacao-do-app" simula quem tinha a versão antiga instalada.
 * É opcional (RUN_SW_UPGRADE=1): precisa do histórico do Git e de acesso à
 * internet, e a troca de service worker depende de tempo.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8090);
const SWSIM_PORT = 8092;
const BASE_COMMIT = '8981054';
const SHOTS = path.join(__dirname, 'screenshots');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8'
};

/** Servidor estático simples (como o Netlify, sem os redirecionamentos). */
function serve(rootDir, port) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(rootDir, urlPath);
    if (!file.startsWith(path.resolve(rootDir) + path.sep) && file !== path.resolve(rootDir)) {
      res.writeHead(403); return res.end();
    }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (err2, data) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          return res.end('<h1>404</h1>');
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

function runTest(file, env) {
  return new Promise(resolve => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(__dirname, file)], { cwd: SHOTS, env: { ...process.env, ...env } });
    let out = '';
    child.stdout.on('data', d => { out += d; process.stdout.write(d); });
    child.stderr.on('data', d => { out += d; process.stderr.write(d); });
    child.on('close', code => resolve({
      file, code,
      passed: (out.match(/^\s*PASS\s/mg) || []).length,
      failed: (out.match(/^\s*FAIL\s/mg) || []).length,
      secs: ((Date.now() - started) / 1000).toFixed(1)
    }));
  });
}

function prepareUpgradeSimulation() {
  try {
    execSync(`git -C "${ROOT}" cat-file -e ${BASE_COMMIT}^{commit}`, { stdio: 'ignore' });
  } catch (_) {
    return null;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinebook-swsim-'));
  fs.mkdirSync(path.join(dir, 'old'));
  execSync(`git -C "${ROOT}" archive ${BASE_COMMIT} | tar -x -C "${path.join(dir, 'old')}"`);
  fs.cpSync(ROOT, path.join(dir, 'new'), { recursive: true, filter: (src) => !/[\\/](\.git|node_modules|tests[\\/]screenshots)([\\/]|$)/.test(src) });
  fs.symlinkSync(path.join(dir, 'old'), path.join(dir, 'current'));
  return dir;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const only = process.argv.slice(2);
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => !only.length || only.some(o => f.includes(o)))
    .sort();

  const server = await serve(ROOT, PORT);
  console.log(`Site em http://127.0.0.1:${PORT} — ${files.length} arquivos de teste\n`);

  const results = [];
  for (const file of files) {
    console.log(`\n────────── ${file} ──────────`);
    if (file.startsWith('atualizacao-do-app')) {
      // Opcional: depende de rede e de tempo (troca de service worker), por
      // isso só roda quando pedido: RUN_SW_UPGRADE=1 npm test
      const dir = process.env.RUN_SW_UPGRADE ? prepareUpgradeSimulation() : null;
      if (!dir) {
        console.log(process.env.RUN_SW_UPGRADE
          ? '  (pulado: precisa do histórico completo do Git)'
          : '  (pulado: teste opcional — rode com RUN_SW_UPGRADE=1)');
        results.push({ file, code: 0, passed: 0, failed: 0, secs: '0', skipped: true });
        continue;
      }
      // Servidor do Python aqui: ele fecha cada conexão ao terminar (como um
      // servidor comum), o que deixa a troca de service worker previsível.
      const sim = spawn('python3', ['-m', 'http.server', String(SWSIM_PORT), '--bind', '127.0.0.1', '--directory', path.join(dir, 'current')], { stdio: 'ignore' });
      await new Promise(r => setTimeout(r, 800));
      results.push(await runTest(file, { SWSIM_DIR: dir, SWSIM_URL: `http://127.0.0.1:${SWSIM_PORT}`, BASE_URL: `http://127.0.0.1:${PORT}` }));
      sim.kill();
      fs.rmSync(dir, { recursive: true, force: true });
      continue;
    }
    results.push(await runTest(file, { BASE_URL: `http://127.0.0.1:${PORT}` }));
  }
  server.close();

  console.log('\n══════════ Resumo ══════════');
  let failedFiles = 0;
  results.forEach(r => {
    const ok = !r.skipped && r.code === 0 && r.failed === 0 && r.passed > 0;
    if (!ok && !r.skipped) failedFiles++;
    console.log(`${r.skipped ? '⏭ ' : ok ? '✅' : '❌'} ${r.file.padEnd(40)} ${String(r.passed).padStart(3)} ok  ${String(r.failed).padStart(2)} falhas  ${r.secs}s`);
  });
  const total = results.reduce((a, r) => a + r.passed, 0);
  console.log(`\n${total} verificações passaram; ${failedFiles} arquivo(s) com falha.`);
  process.exit(failedFiles ? 1 : 0);
})();
