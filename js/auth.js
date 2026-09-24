/**
 * CineBook - Contas locais com senha protegida
 * ---------------------------------------------------------------------------
 * Enquanto o site roda sem servidor próprio (Netlify), as contas ficam no
 * navegador de cada pessoa. Este módulo garante que a SENHA NUNCA fica salva:
 * só um hash PBKDF2-SHA256 com "sal" aleatório por conta (Web Crypto API).
 *
 * - Cadastro, login e troca de senha passam todos por aqui.
 * - Contas antigas (senha em texto) são convertidas para hash sozinhas na
 *   primeira vez que qualquer página com este script abre.
 * - A conta de demonstração pública (pedro / 123456) não é mais criada e é
 *   removida se ainda estiver com a senha padrão.
 * - A sessão ("cinebook_user") guarda só nome, e-mail, avatar e preferências.
 * - Depois de 5 senhas erradas seguidas, o login daquela conta fica travado
 *   por 60 segundos.
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const USERS_KEY = 'cinebook_registered_users';
  const SESSION_KEY = 'cinebook_user';
  const ATTEMPTS_KEY = 'cinebook_login_attempts';

  // OWASP (2023) recomenda 600.000 iterações para PBKDF2-HMAC-SHA256.
  const PBKDF2_ITERATIONS = 600000;
  const MAX_FAILED_ATTEMPTS = 5;
  const LOCK_MS = 60 * 1000;

  // Campos que nunca podem sair do registro da conta (nem ir para a sessão).
  const SECRET_FIELDS = ['password', 'passwordHash', 'passwordSalt', 'passwordAlgo', 'passwordIterations', 'password_hash'];

  const COMMON_PASSWORDS = new Set([
    '12345678', '123456789', '1234567890', 'password', 'password1', 'senha123', 'senha1234',
    'qwerty123', 'qwertyuiop', 'abc12345', 'abcd1234', '11111111', '00000000', 'iloveyou',
    'admin123', 'cinebook', 'cinebook123', 'mudar123', 'brasil123', '87654321'
  ]);

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  function hasCrypto() {
    return !!(global.crypto && global.crypto.subtle && global.crypto.getRandomValues);
  }

  function toB64(bytes) {
    let bin = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  function fromB64(b64) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  /** Compara sem parar no primeiro caractere diferente. */
  function safeEqual(a, b) {
    const x = String(a || '');
    const y = String(b || '');
    let diff = x.length ^ y.length;
    const len = Math.max(x.length, y.length);
    for (let i = 0; i < len; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
    return diff === 0;
  }

  function norm(txt) {
    return String(txt || '').trim().toLowerCase();
  }

  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // -------------------------------------------------------------------------
  // Hash de senha
  // -------------------------------------------------------------------------

  async function deriveHash(password, saltBytes, iterations) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(String(password)), { name: 'PBKDF2' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
      keyMaterial,
      256
    );
    return toB64(bits);
  }

  async function hashPassword(password) {
    if (!hasCrypto()) {
      throw new Error('Seu navegador bloqueou a criptografia desta página. Abra o site pelo endereço https:// para criar ou acessar a conta.');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return {
      passwordAlgo: 'PBKDF2-SHA256',
      passwordIterations: PBKDF2_ITERATIONS,
      passwordSalt: toB64(salt),
      passwordHash: await deriveHash(password, salt, PBKDF2_ITERATIONS)
    };
  }

  async function verifyPassword(password, record) {
    if (!record) return false;
    if (record.passwordHash && record.passwordSalt) {
      if (!hasCrypto()) return false;
      const computed = await deriveHash(password, fromB64(record.passwordSalt), record.passwordIterations || PBKDF2_ITERATIONS);
      return safeEqual(computed, record.passwordHash);
    }
    // Conta antiga, ainda com senha em texto (será convertida no login).
    if (typeof record.password === 'string') return safeEqual(password, record.password);
    return false;
  }

  /** Regras de senha para contas novas e troca de senha. Devolve o erro ou null. */
  function validateNewPassword(password, { name, email } = {}) {
    const p = String(password || '');
    if (p.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
    if (p.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
    if (/^\d+$/.test(p)) return 'A senha não pode ser só de números.';
    if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) return 'Use letras e números na senha.';
    if (COMMON_PASSWORDS.has(p.toLowerCase())) return 'Essa senha é muito comum. Escolha outra.';
    const lower = p.toLowerCase();
    if ((name && lower === norm(name)) || (email && (lower === norm(email) || lower === norm(email).split('@')[0]))) {
      return 'A senha não pode ser igual ao seu nome ou e-mail.';
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Registro de contas
  // -------------------------------------------------------------------------

  function isPublicDemoAccount(u) {
    return u && norm(u.email) === 'pedro@cinebook.com' && u.password === '123456';
  }

  /** Lista de contas deste navegador (nunca cria conta de exemplo). */
  function getUsers() {
    const list = readJSON(USERS_KEY, []);
    if (!Array.isArray(list)) return [];
    const cleaned = list.filter(u => u && u.email && !isPublicDemoAccount(u));
    if (cleaned.length !== list.length) writeJSON(USERS_KEY, cleaned);
    return cleaned;
  }

  function saveUsers(list) {
    writeJSON(USERS_KEY, list);
  }

  function findUser(identifier) {
    const id = norm(identifier);
    return getUsers().find(u => norm(u.email) === id || norm(u.name) === id) || null;
  }

  /** Só os dados que podem ficar na sessão (nada de senha ou hash). */
  function toSessionUser(u) {
    if (!u) return null;
    const out = {};
    Object.keys(u).forEach(k => {
      if (!SECRET_FIELDS.includes(k)) out[k] = u[k];
    });
    return out;
  }

  function setSession(user) {
    const clean = toSessionUser(user);
    if (clean) writeJSON(SESSION_KEY, clean);
    return clean;
  }

  function getSession() {
    const s = readJSON(SESSION_KEY, null);
    return s && (s.email || s.name) ? s : null;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  /** Converte senhas antigas em texto para hash e limpa a sessão. */
  async function migrateLegacyAccounts() {
    // A sessão nunca deveria ter tido senha — remove se tiver.
    const session = readJSON(SESSION_KEY, null);
    if (session && SECRET_FIELDS.some(f => f in session)) {
      if (isPublicDemoAccount(session)) localStorage.removeItem(SESSION_KEY);
      else setSession(session);
    }
    // Sessão de exemplo que o perfil criava sozinho para quem nem tinha
    // entrado ("Pedro Silva"): não é conta de ninguém.
    if (session && norm(session.email) === 'pedro@cinebook.com' && session.name === 'Pedro Silva' && session.createdAt === '26/08/2026') {
      localStorage.removeItem(SESSION_KEY);
    }

    if (!hasCrypto()) return;
    const list = getUsers();
    let changed = false;
    for (const u of list) {
      if (typeof u.password === 'string' && !u.passwordHash) {
        Object.assign(u, await hashPassword(u.password));
        delete u.password;
        changed = true;
      }
    }
    if (changed) {
      // Relê para não sobrescrever uma conta criada enquanto convertia.
      const fresh = getUsers();
      list.forEach(converted => {
        const idx = fresh.findIndex(f => norm(f.email) === norm(converted.email));
        if (idx >= 0 && typeof fresh[idx].password === 'string') fresh[idx] = converted;
      });
      saveUsers(fresh);
    }
  }

  // -------------------------------------------------------------------------
  // Limite de tentativas
  // -------------------------------------------------------------------------

  function lockRemainingMs(identifier) {
    const all = readJSON(ATTEMPTS_KEY, {});
    const entry = all[norm(identifier)];
    if (!entry || !entry.lockedUntil) return 0;
    return Math.max(0, entry.lockedUntil - Date.now());
  }

  function registerFailure(identifier) {
    const all = readJSON(ATTEMPTS_KEY, {});
    const key = norm(identifier);
    const entry = all[key] || { count: 0 };
    entry.count += 1;
    if (entry.count >= MAX_FAILED_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOCK_MS;
      entry.count = 0;
    }
    all[key] = entry;
    writeJSON(ATTEMPTS_KEY, all);
  }

  function clearFailures(identifier) {
    const all = readJSON(ATTEMPTS_KEY, {});
    delete all[norm(identifier)];
    writeJSON(ATTEMPTS_KEY, all);
  }

  // -------------------------------------------------------------------------
  // Fluxos públicos
  // -------------------------------------------------------------------------

  /**
   * Cadastro local. Devolve { ok, user, error }.
   * extra: avatar, preferredCategories, id, createdAt...
   */
  async function register({ name, email, password, ...extra }) {
    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim();
    if (!cleanName || !cleanEmail) return { ok: false, error: 'Preencha nome de usuário e e-mail.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return { ok: false, error: 'Digite um e-mail válido.' };
    const pwError = validateNewPassword(password, { name: cleanName, email: cleanEmail });
    if (pwError) return { ok: false, error: pwError };

    const list = getUsers();
    if (list.some(u => norm(u.email) === norm(cleanEmail) || norm(u.name) === norm(cleanName))) {
      return { ok: false, error: 'Já existe uma conta com este e-mail ou nome de usuário. Faça login ou use outro.' };
    }

    let secret;
    try {
      secret = await hashPassword(password);
    } catch (err) {
      return { ok: false, error: err.message };
    }

    const record = {
      id: extra.id || Date.now(),
      avatar: '🍿',
      createdAt: new Date().toLocaleDateString('pt-BR'),
      ...extra,
      name: cleanName,
      email: cleanEmail,
      ...secret
    };
    delete record.password;
    list.push(record);
    saveUsers(list);
    return { ok: true, user: toSessionUser(record) };
  }

  /** Login local. Devolve { ok, user, error }. */
  async function login(identifier, password) {
    const id = String(identifier || '').trim();
    const locked = lockRemainingMs(id);
    if (locked > 0) {
      return { ok: false, error: `Muitas tentativas erradas. Tente de novo em ${Math.ceil(locked / 1000)} segundos.` };
    }

    const user = findUser(id);
    // Mesma mensagem para "conta não existe" e "senha errada": não revela
    // quais e-mails têm conta.
    const genericError = 'E-mail/usuário ou senha incorretos.';
    if (!user) {
      registerFailure(id);
      return { ok: false, error: genericError };
    }

    let valid = false;
    try {
      valid = await verifyPassword(password, user);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    if (!valid) {
      registerFailure(id);
      return { ok: false, error: genericError };
    }

    clearFailures(id);

    // Conta antiga com senha em texto: converte agora.
    if (typeof user.password === 'string') {
      try {
        const secret = await hashPassword(password);
        const list = getUsers();
        const idx = list.findIndex(u => norm(u.email) === norm(user.email));
        if (idx >= 0) {
          delete list[idx].password;
          Object.assign(list[idx], secret);
          saveUsers(list);
        }
      } catch (_) {}
    }
    return { ok: true, user: toSessionUser(user) };
  }

  /** Atualiza dados do perfil (sem mexer na senha). */
  function updateProfile(email, changes) {
    const list = getUsers();
    const idx = list.findIndex(u => norm(u.email) === norm(email));
    const safeChanges = toSessionUser(changes || {});
    delete safeChanges.email;
    if (idx >= 0) {
      Object.assign(list[idx], safeChanges);
      saveUsers(list);
      return toSessionUser(list[idx]);
    }
    return null;
  }

  /** Troca de senha: exige a senha atual. Devolve { ok, error }. */
  async function changePassword(email, currentPassword, newPassword) {
    const list = getUsers();
    const idx = list.findIndex(u => norm(u.email) === norm(email));
    if (idx < 0) return { ok: false, error: 'Conta não encontrada neste navegador.' };
    const locked = lockRemainingMs(email);
    if (locked > 0) return { ok: false, error: `Muitas tentativas erradas. Tente de novo em ${Math.ceil(locked / 1000)} segundos.` };

    let valid = false;
    try {
      valid = await verifyPassword(currentPassword, list[idx]);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    if (!valid) {
      registerFailure(email);
      return { ok: false, error: 'A senha atual está incorreta.' };
    }
    clearFailures(email);

    const pwError = validateNewPassword(newPassword, { name: list[idx].name, email: list[idx].email });
    if (pwError) return { ok: false, error: pwError };

    let secret;
    try {
      secret = await hashPassword(newPassword);
    } catch (err) {
      return { ok: false, error: err.message };
    }
    delete list[idx].password;
    Object.assign(list[idx], secret);
    saveUsers(list);
    return { ok: true };
  }

  /** Só aceita voltar para páginas do próprio site depois do login. */
  function safeNextPage(next) {
    const fallback = 'index.html?login=true';
    const allowed = ['index.html', 'perfil.html', 'detalhes.html'];
    if (!next) return fallback;
    try {
      const url = new URL(String(next), global.location.origin + '/');
      if (url.origin !== global.location.origin) return fallback;
      const page = url.pathname.split('/').pop();
      return allowed.includes(page) ? page + url.search + url.hash : fallback;
    } catch (_) {
      return fallback;
    }
  }

  const CineAuth = {
    PBKDF2_ITERATIONS,
    hashPassword,
    verifyPassword,
    validateNewPassword,
    getUsers,
    findUser,
    register,
    login,
    logout,
    updateProfile,
    changePassword,
    toSessionUser,
    setSession,
    getSession,
    migrateLegacyAccounts,
    safeNextPage
  };

  global.CineAuth = CineAuth;

  // Converte contas antigas assim que qualquer página com este script abre.
  CineAuth.ready = migrateLegacyAccounts().catch(err => console.warn('[CineAuth] migração:', err));
})(typeof window !== 'undefined' ? window : globalThis);
