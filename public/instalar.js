/* Guia de instalação do app (PWA) para qualquer navegador. Lógica pura, testável em Node.
   Onde o navegador oferece a instalação com um clique (Chrome, Edge, Samsung Internet, Android), o app usa o aviso nativo.
   Nos demais (iPhone/iPad, Safari, Firefox...), mostra o passo a passo certo. */
(function (root) {
  'use strict';
  function detect(ua, platform, maxTouch) {
    ua = String(ua || ''); platform = String(platform || ''); maxTouch = +maxTouch || 0;
    var ios = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && maxTouch > 1);
    var android = /Android/i.test(ua);
    var mobile = ios || android || /Mobile/i.test(ua);
    var browser = 'outro';
    if (/SamsungBrowser/i.test(ua)) browser = 'samsung';
    else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'opera';
    else if (/FxiOS|Firefox/i.test(ua)) browser = 'firefox';
    else if (/CriOS|Chrome\//.test(ua)) browser = 'chrome';
    else if (/Safari\//.test(ua) || /AppleWebKit/.test(ua)) browser = 'safari';
    return { ios: ios, android: android, mobile: mobile, browser: browser };
  }
  function guide(d) {
    var t = 'Instalar o SM Financial', s;
    if (d.ios) {
      if (d.browser === 'safari') s = ['Toque no botão Compartilhar (quadrado com seta para cima), na barra do Safari.', 'Role e toque em “Adicionar à Tela de Início”.', 'Toque em “Adicionar”. O ícone do SM Financial aparece na tela inicial.'];
      else s = ['Toque no botão Compartilhar (ou nos três pontinhos) do navegador.', 'Toque em “Adicionar à Tela de Início”.', 'Se a opção não aparecer, abra este endereço no Safari e repita os passos.'];
    } else if (d.android) {
      if (d.browser === 'samsung') s = ['Toque no menu (três linhas), no canto da tela.', 'Toque em “Adicionar página a” e depois em “Tela inicial”.', 'Confirme em “Adicionar”.'];
      else if (d.browser === 'firefox') s = ['Toque no menu (três pontinhos).', 'Toque em “Instalar” (ou “Adicionar à tela inicial”).', 'Confirme em “Adicionar”.'];
      else s = ['Toque no menu do navegador (três pontinhos).', 'Toque em “Instalar app” ou “Adicionar à tela inicial”.', 'Confirme em “Instalar”.'];
    } else {
      if (d.browser === 'safari') s = ['No menu superior do Safari, clique em “Arquivo”.', 'Clique em “Adicionar ao Dock…” (Safari 17 ou mais novo).', 'Confirme em “Adicionar”.'];
      else if (d.browser === 'firefox') s = ['O Firefox para computador ainda não instala aplicativos.', 'Abra este endereço no Chrome ou no Edge para instalar, ou salve nos favoritos (Ctrl+D) para abrir rápido.'];
      else s = ['Procure o ícone de instalação na barra de endereço (computador com tela, ou uma seta com “Instalar”).', 'Se não aparecer, abra o menu do navegador (três pontinhos) e escolha “Instalar SM Financial” ou “Aplicativos > Instalar este site como aplicativo”.', 'Confirme em “Instalar”.'];
    }
    return { titulo: t, passos: s };
  }
  function isStandalone(win) {
    try { return !!((win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) || (win.navigator && win.navigator.standalone === true)); } catch (e) { return false; }
  }
  var api = { detect: detect, guide: guide, isStandalone: isStandalone };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Instalar = api;
})(typeof self !== 'undefined' ? self : this);
