const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

async function newCtx(browser) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const localhostHits = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1:8090)/, (route) => {
    const u = route.request().url();
    if (/localhost|127\.0\.0\.1:8000/.test(u)) localhostHits.push(u);
    return route.abort();
  });
  return { ctx, localhostHits };
}

const dump = (page) => page.evaluate(() => ({
  users: JSON.parse(localStorage.getItem('cinebook_registered_users') || '[]'),
  session: JSON.parse(localStorage.getItem('cinebook_user') || 'null'),
  all: Object.keys(localStorage).map(k => localStorage.getItem(k)).join('\n'),
}));

async function loginVia(page, id, pw, next) {
  await page.goto(BASE + '/login.html' + (next ? `?next=${next}` : ''), { waitUntil: 'domcontentloaded' });
  await page.fill('#loginEmailInput', id);
  await page.fill('#loginPasswordInput', pw);
  await page.click('#cineLoginForm button[type="submit"]');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

  console.log('\n=== 1. Contas antigas (senha em texto) são convertidas ===');
  const { ctx, localhostHits } = await newCtx(browser);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + '/offline.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('cinebook_registered_users', JSON.stringify([
      { id: 1, name: 'pedro', email: 'pedro@cinebook.com', password: '123456', avatar: '🍿', createdAt: 'Conta Demo' },
      { id: 2, name: 'maria', email: 'maria@exemplo.com', password: 'Maria2024', avatar: '🎬', preferredCategories: ['drama'], createdAt: '01/09/2026' },
    ]));
    localStorage.setItem('cinebook_user', JSON.stringify({ id: 2, name: 'maria', email: 'maria@exemplo.com', password: 'Maria2024' }));
  });
  await page.goto(BASE + '/login.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => CineAuth.ready);
  let d = await dump(page);
  !d.users.some(u => u.email === 'pedro@cinebook.com') ? pass('conta pública pedro/123456 removida') : fail('demo ainda existe');
  const maria = d.users.find(u => u.email === 'maria@exemplo.com');
  maria && maria.passwordHash && !('password' in maria) ? pass('senha antiga da maria virou hash PBKDF2 (' + maria.passwordIterations + ' iterações)') : fail('maria: ' + JSON.stringify(maria));
  d.session && !('password' in d.session) ? pass('sessão não guarda mais a senha') : fail('sessão: ' + JSON.stringify(d.session));
  !d.all.includes('Maria2024') && !d.all.includes('123456') ? pass('nenhuma senha em texto em todo o localStorage') : fail('senha em texto encontrada');

  console.log('\n=== 2. Login com a conta convertida ===');
  await page.evaluate(() => localStorage.removeItem('cinebook_user'));
  await loginVia(page, 'maria@exemplo.com', 'errada123');
  await page.waitForSelector('#loginErrorBox:visible');
  const err1 = await page.textContent('#loginErrorBox');
  err1.includes('incorretos') ? pass('senha errada: "' + err1 + '"') : fail('erro: ' + err1);
  await loginVia(page, 'nao@existe.com', 'Qualquer123');
  await page.waitForSelector('#loginErrorBox:visible');
  (await page.textContent('#loginErrorBox')) === err1 ? pass('conta inexistente dá a mesma mensagem (não revela quem tem conta)') : fail('mensagens diferentes');
  await loginVia(page, 'MARIA', 'Maria2024');
  await page.waitForURL(/index\.html/, { timeout: 15000 });
  d = await dump(page);
  d.session && d.session.email === 'maria@exemplo.com' && !Object.keys(d.session).some(k => /password/i.test(k)) ? pass('entrou pelo nome de usuário; sessão sem senha/hash') : fail('sessão: ' + JSON.stringify(d.session));

  console.log('\n=== 3. Limite de tentativas ===');
  await page.evaluate(() => localStorage.removeItem('cinebook_user'));
  for (let i = 0; i < 5; i++) {
    await loginVia(page, 'maria@exemplo.com', 'Errada' + i + 'x');
    await page.waitForSelector('#loginErrorBox:visible');
  }
  await loginVia(page, 'maria@exemplo.com', 'Maria2024');
  await page.waitForSelector('#loginErrorBox:visible');
  const lockMsg = await page.textContent('#loginErrorBox');
  /Muitas tentativas/.test(lockMsg) ? pass('6ª tentativa (mesmo certa) bloqueada: "' + lockMsg + '"') : fail('lock: ' + lockMsg);
  await page.evaluate(() => localStorage.removeItem('cinebook_login_attempts'));

  console.log('\n=== 4. Cadastro ===');
  await page.goto(BASE + '/cadastro.html', { waitUntil: 'domcontentloaded' });
  const fillSignup = async (pw) => {
    await page.fill('#usernameInput', 'joao');
    await page.fill('#emailInput', 'joao@exemplo.com');
    await page.fill('#passwordInput', pw);
    await page.fill('#passwordConfirmInput', pw);
    await page.click('#submitBtn');
  };
  await fillSignup('12345678');
  await page.waitForSelector('#registerErrorBox:visible');
  const e1 = await page.textContent('#registerErrorBox');
  /números|comum/.test(e1) ? pass('senha 12345678 recusada: "' + e1 + '"') : fail('e1: ' + e1);
  await fillSignup('abcdefgh');
  await page.waitForSelector('#registerErrorBox:visible');
  const e2 = await page.textContent('#registerErrorBox');
  /letras e números/.test(e2) ? pass('senha só com letras recusada') : fail('e2: ' + e2);
  await fillSignup('Cinema2026!');
  await page.waitForSelector('#step2Categories', { state: 'visible', timeout: 15000 });
  await page.click('#btnSkipOnboarding');
  await page.waitForURL(/index\.html/, { timeout: 15000 });
  d = await dump(page);
  const joao = d.users.find(u => u.email === 'joao@exemplo.com');
  joao && joao.passwordHash && joao.passwordSalt && !('password' in joao) ? pass('conta nova salva só com hash + sal') : fail('joao: ' + JSON.stringify(joao));
  joao && Array.isArray(joao.preferredCategories) && joao.passwordHash ? pass('escolher categorias depois não apagou o hash') : fail('prefs/hash');
  !d.all.includes('Cinema2026!') ? pass('senha nova não aparece em lugar nenhum do localStorage') : fail('senha em texto!');
  d.session && d.session.email === 'joao@exemplo.com' && !JSON.stringify(d.session).includes('passwordHash') ? pass('já entra logado após o cadastro') : fail('sessão pós cadastro');
  const maria2 = d.users.find(u => u.email === 'maria@exemplo.com');
  maria2 && maria2.passwordHash ? pass('cadastrar outra conta não mexeu na da maria') : fail('maria sumiu');

  console.log('\n=== 5. Perfil exige login e troca de senha exige a atual ===');
  await page.evaluate(() => localStorage.removeItem('cinebook_user'));
  await page.goto(BASE + '/perfil.html', { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/login\.html\?next=perfil\.html/, { timeout: 10000 });
  pass('perfil sem login manda para o login (não cria mais o "Pedro Silva")');
  d = await dump(page);
  !d.session ? pass('nenhuma sessão falsa criada') : fail('sessão criada: ' + JSON.stringify(d.session));
  await page.fill('#loginEmailInput', 'joao@exemplo.com');
  await page.fill('#loginPasswordInput', 'Cinema2026!');
  await page.click('#cineLoginForm button[type="submit"]');
  await page.waitForURL(u => new URL(u).pathname.endsWith('/perfil.html'), { timeout: 15000 });
  pass('depois do login volta para o perfil');
  const submitProfile = async (current, next) => {
    await page.evaluate(({ current, next }) => {
      document.getElementById('editNameInput').value = 'joao';
      document.getElementById('editCurrentPasswordInput').value = current;
      document.getElementById('editPasswordInput').value = next;
      document.getElementById('editProfileForm').requestSubmit();
    }, { current, next });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('profileFeedbackBox')).display !== 'none', null, { timeout: 15000 });
    return page.textContent('#profileFeedbackBox');
  };
  let fb = await submitProfile('', 'Novinha2026');
  /senha atual/i.test(fb) ? pass('sem senha atual: "' + fb + '"') : fail('fb1: ' + fb);
  fb = await submitProfile('ErradaDemais1', 'Novinha2026');
  /incorreta/.test(fb) ? pass('senha atual errada recusada') : fail('fb2: ' + fb);
  fb = await submitProfile('Cinema2026!', 'Novinha2026');
  /sucesso/i.test(fb) ? pass('troca com a senha atual certa: ok') : fail('fb3: ' + fb);
  const loginResults = await page.evaluate(async () => [
    (await CineAuth.login('joao', 'Cinema2026!')).ok,
    (await CineAuth.login('joao', 'Novinha2026')).ok,
  ]);
  !loginResults[0] && loginResults[1] ? pass('senha antiga não entra mais, a nova entra') : fail('logins: ' + loginResults);
  d = await dump(page);
  !d.all.includes('Novinha2026') ? pass('senha trocada também só como hash') : fail('senha em texto após troca');

  console.log('\n=== 6. Login pelo modal da página inicial ===');
  await page.evaluate(() => { localStorage.removeItem('cinebook_user'); localStorage.removeItem('cinebook_login_attempts'); });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof handleLoginSubmit === 'function');
  const modalOk = await page.evaluate(async () => {
    document.getElementById('loginEmail').value = 'maria@exemplo.com';
    document.getElementById('loginPassword').value = 'Maria2024';
    await handleLoginSubmit({ preventDefault() {} });
    return JSON.parse(localStorage.getItem('cinebook_user'));
  });
  modalOk && modalOk.email === 'maria@exemplo.com' ? pass('modal de login usa a mesma verificação por hash') : fail('modal: ' + JSON.stringify(modalOk));

  console.log('\n=== 7. Nada vai para "localhost:8000" quando o site não é servido por ele ===');
  localhostHits.length === 0 ? pass('nenhuma requisição (nem a senha) enviada ao localhost do visitante') : fail('requisições: ' + localhostHits.join(', '));
  errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));

  await browser.close();
  console.log('\n=== fim ===');
})();
