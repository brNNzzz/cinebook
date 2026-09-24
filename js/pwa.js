/**
 * CineBook - Camada PWA
 * ---------------------------------------------------------------------------
 * Responsável por:
 *   1. Registrar o service worker
 *   2. Exibir o botão "Instalar app" quando o navegador permitir
 *   3. Avisar quando uma nova versão do site estiver disponível
 *   4. Mostrar instruções de instalação no iPhone/iPad (o Safari não oferece
 *      o prompt automático, a instalação é manual pelo menu Compartilhar)
 *
 * Não depende de nenhuma biblioteca e não altera nada do app existente:
 * todo o CSS é injetado num <style> próprio e os elementos ficam fora do
 * fluxo da página (position: fixed).
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  var SW_PATH = '/sw.js';
  var DISMISS_KEY = 'cinebook_pwa_dismissed_until';
  var DISMISS_DAYS = 14;

  // =========================================================================
  // 1. Registro do service worker
  // =========================================================================

  if (!('serviceWorker' in navigator)) return;

  var swRegistration = null;
  var refreshing = false;
  // Só recarrega na troca de versão se a página JÁ era controlada por um
  // service worker (atualização). Na primeira visita não precisa recarregar.
  var hadController = !!navigator.serviceWorker.controller;

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register(SW_PATH)
      .then(function (reg) {
        swRegistration = reg;

        // Já existe uma versão nova esperando (usuário abriu outra aba antes)
        if (reg.waiting && navigator.serviceWorker.controller) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        reg.addEventListener('updatefound', function () {
          var incoming = reg.installing;
          if (!incoming) return;

          incoming.addEventListener('statechange', function () {
            // "installed" + já existe um controller = é uma ATUALIZAÇÃO,
            // não a primeira instalação.
            // A versão nova agora assume sozinha (skipWaiting no sw.js) e a
            // página recarrega uma vez — não precisa mais do aviso.
            if (
              incoming.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              incoming.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(function (err) {
        console.warn('[PWA] Falha ao registrar o service worker:', err);
      });
  });

  // Recarrega uma única vez quando o SW novo assume o controle.
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (refreshing || !hadController) return;
    refreshing = true;
    window.location.reload();
  });

  // =========================================================================
  // 2. Estilos da interface do PWA
  // =========================================================================

  function injectStyles() {
    if (document.getElementById('pwa-styles')) return;

    var css = [
      '#pwa-install-btn, #pwa-update-toast {',
      '  position: fixed;',
      '  z-index: 9990;',
      '  font-family: inherit;',
      '  opacity: 0;',
      '  transform: translateY(18px);',
      '  transition: opacity .28s ease, transform .28s ease;',
      '}',
      '#pwa-install-btn.pwa-visible, #pwa-update-toast.pwa-visible {',
      '  opacity: 1;',
      '  transform: translateY(0);',
      '}',

      /* ---- botão instalar ---- */
      '#pwa-install-btn {',
      '  right: 20px;',
      '  bottom: calc(20px + env(safe-area-inset-bottom, 0px));',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 9px;',
      '  padding: 12px 20px;',
      '  border: 0;',
      '  border-radius: 9999px;',
      '  cursor: pointer;',
      '  font-size: .9rem;',
      '  font-weight: 700;',
      '  color: #041018;',
      '  background: linear-gradient(90deg, #1ed5a9 0%, #01b4e4 100%);',
      '  box-shadow: 0 8px 28px rgba(0,0,0,.45), 0 0 20px rgba(30,213,169,.22);',
      '}',
      '#pwa-install-btn:hover { transform: translateY(-3px); }',
      '#pwa-install-btn svg { width: 17px; height: 17px; flex: 0 0 auto; }',
      '#pwa-install-btn .pwa-close {',
      '  margin-left: 4px;',
      '  padding-left: 10px;',
      '  border-left: 1px solid rgba(4,16,24,.25);',
      '  font-size: 1.05rem;',
      '  line-height: 1;',
      '  opacity: .65;',
      '}',
      '#pwa-install-btn .pwa-close:hover { opacity: 1; }',

      /* ---- toast de atualização ---- */
      '#pwa-update-toast {',
      '  left: 50%;',
      '  bottom: calc(22px + env(safe-area-inset-bottom, 0px));',
      '  margin-left: -170px;',
      '  width: 340px;',
      '  max-width: calc(100vw - 32px);',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 14px;',
      '  padding: 14px 16px;',
      '  border: 1px solid rgba(255,255,255,.1);',
      '  border-radius: 14px;',
      '  background: #132238;',
      '  color: #fff;',
      '  font-size: .88rem;',
      '  box-shadow: 0 16px 40px rgba(0,0,0,.6);',
      '}',
      '#pwa-update-toast span { flex: 1; line-height: 1.45; }',
      '#pwa-update-toast button {',
      '  flex: 0 0 auto;',
      '  padding: 8px 16px;',
      '  border: 0;',
      '  border-radius: 9999px;',
      '  cursor: pointer;',
      '  font: inherit;',
      '  font-weight: 700;',
      '  color: #041018;',
      '  background: linear-gradient(90deg, #1ed5a9 0%, #01b4e4 100%);',
      '}',

      /* ---- modal de instruções do iOS ---- */
      '#pwa-ios-sheet {',
      '  position: fixed;',
      '  inset: 0;',
      '  z-index: 9991;',
      '  display: flex;',
      '  align-items: flex-end;',
      '  justify-content: center;',
      '  padding: 18px;',
      '  background: rgba(3,8,15,.72);',
      '  backdrop-filter: blur(3px);',
      '}',
      '#pwa-ios-sheet .pwa-card {',
      '  width: 100%;',
      '  max-width: 420px;',
      '  padding: 22px;',
      '  border: 1px solid rgba(255,255,255,.1);',
      '  border-radius: 18px;',
      '  background: #0f1c2e;',
      '  color: #fff;',
      '}',
      '#pwa-ios-sheet h3 { margin: 0 0 10px; font-size: 1.05rem; }',
      '#pwa-ios-sheet p { margin: 0 0 8px; font-size: .88rem; color: #94a3b8; line-height: 1.6; }',
      '#pwa-ios-sheet button {',
      '  margin-top: 14px;',
      '  width: 100%;',
      '  padding: 11px;',
      '  border: 0;',
      '  border-radius: 9999px;',
      '  cursor: pointer;',
      '  font: inherit;',
      '  font-weight: 700;',
      '  color: #041018;',
      '  background: linear-gradient(90deg, #1ed5a9 0%, #01b4e4 100%);',
      '}',

      '@media (max-width: 520px) {',
      '  #pwa-install-btn { right: 14px; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); padding: 10px 15px; font-size: .8rem; gap: 7px; }',
      '  #pwa-install-btn svg { width: 15px; height: 15px; }',
      '  #pwa-install-btn .pwa-close { padding-left: 8px; margin-left: 2px; }',
      '}',
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'pwa-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // =========================================================================
  // 3. Helpers
  // =========================================================================

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isDismissed() {
    try {
      var until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      return Date.now() < until;
    } catch (e) {
      return false;
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000)
      );
    } catch (e) {
      /* modo privado: só ignora */
    }
  }

  function reveal(el) {
    requestAnimationFrame(function () {
      el.classList.add('pwa-visible');
    });
  }

  function remove(el) {
    if (!el) return;
    el.classList.remove('pwa-visible');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 300);
  }

  // =========================================================================
  // 4. Botão de instalação (Chrome, Edge, Android)
  // =========================================================================

  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (isStandalone() || isDismissed()) return;
    showInstallButton();
  });

  function showInstallButton() {
    if (document.getElementById('pwa-install-btn')) return;
    injectStyles();

    var btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Instalar o CineBook como aplicativo');
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>' +
      '<span>Instalar app</span>' +
      '<span class="pwa-close" role="button" aria-label="Agora não">&times;</span>';

    btn.addEventListener('click', function (ev) {
      // Clique no "x" apenas dispensa
      if (ev.target.classList.contains('pwa-close')) {
        ev.stopPropagation();
        dismiss();
        remove(btn);
        return;
      }
      if (!deferredPrompt) return;

      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome === 'dismissed') dismiss();
        deferredPrompt = null;
        remove(btn);
      });
    });

    document.body.appendChild(btn);
    reveal(btn);
  }

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    remove(document.getElementById('pwa-install-btn'));
  });

  // =========================================================================
  // 5. Aviso de nova versão
  // =========================================================================

  function showUpdateToast(worker) {
    if (document.getElementById('pwa-update-toast')) return;
    injectStyles();

    var toast = document.createElement('div');
    toast.id = 'pwa-update-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<span>Nova versão do CineBook disponível.</span>' +
      '<button type="button">Atualizar</button>';

    toast.querySelector('button').addEventListener('click', function () {
      worker.postMessage({ type: 'SKIP_WAITING' });
      remove(toast);
    });

    document.body.appendChild(toast);
    reveal(toast);
  }

  // =========================================================================
  // 6. iOS: instruções manuais (Safari não dispara beforeinstallprompt)
  // =========================================================================

  function isIOS() {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  function isSafari() {
    var ua = navigator.userAgent;
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  }

  window.addEventListener('load', function () {
    if (!isIOS() || !isSafari() || isStandalone() || isDismissed()) return;

    // Espera um pouco para não competir com o carregamento do catálogo.
    setTimeout(function () {
      injectStyles();

      var sheet = document.createElement('div');
      sheet.id = 'pwa-ios-sheet';
      sheet.innerHTML =
        '<div class="pwa-card">' +
        '<h3>Instalar o CineBook</h3>' +
        '<p>No iPhone e iPad a instalação é manual, em dois toques:</p>' +
        '<p>1. Toque no botão <strong>Compartilhar</strong> na barra do Safari.</p>' +
        '<p>2. Escolha <strong>Adicionar à Tela de Início</strong>.</p>' +
        '<button type="button">Entendi</button>' +
        '</div>';

      sheet.querySelector('button').addEventListener('click', function () {
        dismiss();
        if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
      });

      sheet.addEventListener('click', function (ev) {
        if (ev.target === sheet) {
          dismiss();
          sheet.parentNode.removeChild(sheet);
        }
      });

      document.body.appendChild(sheet);
    }, 2500);
  });
})();
