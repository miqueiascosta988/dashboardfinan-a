/* Perfil, idioma e tutoriais em vídeo do SM Financial.
   - I18N: seletor PT/EN/ES (menus, perfil e tutoriais). O conteúdo interno das telas segue em português.
   - Perfil: dados da conta, idioma, trocar e-mail/senha (exige a senha atual) e exclusão pelo suporte (WhatsApp).
   - Tutor: onboarding em módulos de vídeo curtos (1 a 3 min) + botão "Tutorial desta aba" em cada tela.
   Não grava nada além de preferências (idioma e aulas vistas). */
(function (root) {
  'use strict';
  var LANGS = [{ id: 'pt', flag: 'PT', name: 'Português' }, { id: 'en', flag: 'EN', name: 'English' }, { id: 'es', flag: 'ES', name: 'Español' }];
  var LS_LANG = 'sm-lang';

  // ───────── dicionário: chave = texto em português ─────────
  var D = {
    // áreas do menu
    'Início': ['Home', 'Inicio'], 'Meu dinheiro': ['My money', 'Mi dinero'], 'Documentos': ['Documents', 'Documentos'],
    'Trabalho e renda': ['Work & income', 'Trabajo e ingresos'], 'Fiscal e caixa': ['Tax & cash', 'Fiscal y caja'], 'Planejar': ['Planning', 'Planificación'],
    'Dívidas e crédito': ['Debt & credit', 'Deudas y crédito'], 'Patrimônio': ['Net worth', 'Patrimonio'], 'Plano': ['Subscription', 'Plan'],
    // telas
    'Visão Geral': ['Overview', 'Visión general'], 'Saúde Financeira': ['Financial health', 'Salud financiera'],
    'Salário & Renda': ['Salary & income', 'Salario e ingresos'], 'Renda': ['Income', 'Ingresos'], 'Faturamento': ['Revenue', 'Facturación'],
    'Benefícios & Renda': ['Benefits & income', 'Beneficios e ingresos'], 'Mesada & Renda': ['Allowance & income', 'Mesada e ingresos'],
    'Pró-labore & Lucros': ['Owner pay & profits', 'Pro-labore y utilidades'], 'Vencimentos & Renda': ['Pay & income', 'Haberes e ingresos'],
    'Recursos recebidos': ['Funds received', 'Recursos recibidos'], 'Receita': ['Revenue', 'Ingresos'], 'Receita de serviços': ['Service revenue', 'Ingresos por servicios'], 'Vendas': ['Sales', 'Ventas'],
    'Despesas': ['Expenses', 'Gastos'], 'Custos': ['Costs', 'Costos'], 'Orçamento': ['Budget', 'Presupuesto'], 'Orçamento base': ['Base budget', 'Presupuesto base'],
    'Assinaturas': ['Subscriptions', 'Suscripciones'], 'Ferramentas & SaaS': ['Tools & SaaS', 'Herramientas y SaaS'], 'Extratos Bancários': ['Bank statements', 'Extractos bancarios'],
    'Perfil de Renda': ['Income profile', 'Perfil de ingresos'], 'Renda & Reserva': ['Income & reserve', 'Ingresos y reserva'], 'Simulador CLT': ['Employee pay simulator', 'Simulador laboral (CLT)'],
    'Impostos': ['Taxes', 'Impuestos'], 'MEI & Impostos': ['MEI & taxes', 'MEI e impuestos'], 'MEI & DAS': ['MEI & DAS', 'MEI y DAS'], 'Simples Nacional': ['Simples Nacional', 'Simples Nacional'],
    'Impostos & Pró-labore': ['Taxes & owner pay', 'Impuestos y pro-labore'], 'Tributos (Lucro Real)': ['Taxes (Real Profit)', 'Tributos (Lucro Real)'], 'Tributos (Presumido)': ['Taxes (Presumed Profit)', 'Tributos (Lucro Presunto)'],
    'Prestação de contas': ['Accountability', 'Rendición de cuentas'], 'Runway & Burn': ['Runway & burn', 'Runway y burn'],
    'Fiscal': ['Tax', 'Fiscal'], 'Fluxo de Caixa': ['Cash flow', 'Flujo de caja'], 'Caixa & Reserva': ['Cash & reserve', 'Caja y reserva'], 'Reforma Tributária': ['Tax reform', 'Reforma tributaria'],
    'Agenda & IA': ['Agenda & AI', 'Agenda e IA'], 'Metas': ['Goals', 'Metas'], 'Metas & Reserva': ['Goals & reserve', 'Metas y reserva'], 'Projeção': ['Projection', 'Proyección'],
    'Estratégia': ['Strategy', 'Estrategia'], 'Insights': ['Insights', 'Insights'], 'Dívidas': ['Debts', 'Deudas'], 'Calculadora de dívidas': ['Debt calculator', 'Calculadora de deudas'],
    'Central de Alívio': ['Relief center', 'Centro de alivio'], 'Resolver Dívidas': ['Solve debts', 'Resolver deudas'], 'Crédito & Nome Sujo': ['Credit & bad credit record', 'Crédito y nombre sucio'],
    'Investimentos': ['Investments', 'Inversiones'], 'Câmbio': ['Exchange', 'Cambio'],
    // cabeçalho
    'Exportar': ['Export', 'Exportar'], 'Instalar': ['Install', 'Instalar'], 'Tutorial': ['Tutorial', 'Tutorial'], 'Perfil': ['Profile', 'Perfil'], 'Sair': ['Log out', 'Salir'],
    'Pessoal': ['Personal', 'Personal'], 'Empresa': ['Company', 'Empresa']
  };
  // textos da interface do Perfil e dos tutoriais: [pt, en, es]
  var S = {
    profileTitle: ['Meu perfil', 'My profile', 'Mi perfil'],
    profileSub: ['Seus dados, idioma, segurança e ajuda em um só lugar.', 'Your details, language, security and help in one place.', 'Tus datos, idioma, seguridad y ayuda en un solo lugar.'],
    account: ['Conta', 'Account', 'Cuenta'], name: ['Nome', 'Name', 'Nombre'], email: ['E-mail', 'Email', 'Correo electrónico'], accType: ['Tipo de conta', 'Account type', 'Tipo de cuenta'],
    personal: ['Pessoal', 'Personal', 'Personal'], business: ['Empresa', 'Company', 'Empresa'], since: ['Cliente desde', 'Customer since', 'Cliente desde'], seePlan: ['Ver meu plano', 'View my plan', 'Ver mi plan'],
    language: ['Idioma', 'Language', 'Idioma'], langDesc: ['Escolha o idioma dos menus, do perfil e dos tutoriais.', 'Choose the language of the menus, profile and tutorials.', 'Elige el idioma de los menús, del perfil y de los tutoriales.'],
    langNote: ['O conteúdo interno das telas (relatórios, cálculos e textos de ajuda) ainda está em português. Estamos traduzindo por etapas.', 'The content inside each screen (reports, calculations and help text) is still in Portuguese. We are translating in stages.', 'El contenido interno de las pantallas (informes, cálculos y textos de ayuda) sigue en portugués. Lo estamos traduciendo por etapas.'],
    langSaved: ['Idioma alterado.', 'Language changed.', 'Idioma cambiado.'],
    security: ['Segurança', 'Security', 'Seguridad'], secDesc: ['Para sua proteção, pedimos a senha atual antes de qualquer mudança.', 'For your protection, we ask for your current password before any change.', 'Para tu protección, pedimos tu contraseña actual antes de cualquier cambio.'],
    changeEmail: ['Alterar e-mail', 'Change email', 'Cambiar correo'], newEmail: ['Novo e-mail', 'New email', 'Nuevo correo'], curPass: ['Senha atual', 'Current password', 'Contraseña actual'],
    changePass: ['Alterar senha', 'Change password', 'Cambiar contraseña'], newPass: ['Nova senha', 'New password', 'Nueva contraseña'], newPass2: ['Confirmar nova senha', 'Confirm new password', 'Confirmar nueva contraseña'],
    passRules: ['Mínimo de 8 caracteres, com maiúscula, minúscula e número.', 'At least 8 characters, with upper case, lower case and a number.', 'Mínimo 8 caracteres, con mayúscula, minúscula y número.'],
    saveEmail: ['Enviar confirmação', 'Send confirmation', 'Enviar confirmación'], savePass: ['Salvar nova senha', 'Save new password', 'Guardar nueva contraseña'],
    emailSent: ['Enviamos um link de confirmação para o novo e-mail. O e-mail só muda depois que você clicar nele.', 'We sent a confirmation link to the new email. The email only changes after you click it.', 'Enviamos un enlace de confirmación al nuevo correo. El correo solo cambia cuando hagas clic en él.'],
    passChanged: ['Senha alterada com sucesso.', 'Password changed successfully.', 'Contraseña cambiada con éxito.'],
    errCurPass: ['Senha atual incorreta.', 'Current password is incorrect.', 'La contraseña actual es incorrecta.'],
    errNeedCur: ['Informe a senha atual.', 'Enter your current password.', 'Introduce tu contraseña actual.'],
    errEmail: ['Informe um e-mail válido e diferente do atual.', 'Enter a valid email different from the current one.', 'Introduce un correo válido y distinto del actual.'],
    errRules: ['A nova senha não atende às regras de segurança.', 'The new password does not meet the security rules.', 'La nueva contraseña no cumple las reglas de seguridad.'],
    errMatch: ['As senhas não coincidem.', 'The passwords do not match.', 'Las contraseñas no coinciden.'],
    errSame: ['A nova senha precisa ser diferente da atual.', 'The new password must be different from the current one.', 'La nueva contraseña debe ser distinta de la actual.'],
    errLock: ['Muitas tentativas. Aguarde 30 segundos e tente de novo.', 'Too many attempts. Wait 30 seconds and try again.', 'Demasiados intentos. Espera 30 segundos e inténtalo de nuevo.'],
    errGeneric: ['Não foi possível concluir agora. Tente novamente.', 'Could not complete this now. Please try again.', 'No se pudo completar ahora. Inténtalo de nuevo.'],
    demoOff: ['Indisponível na demonstração.', 'Not available in the demo.', 'No disponible en la demostración.'],
    privacy: ['Privacidade e meus dados', 'Privacy and my data', 'Privacidad y mis datos'], privacyDesc: ['Baixe seus dados e veja quem acessou sua conta.', 'Download your data and see who accessed your account.', 'Descarga tus datos y mira quién accedió a tu cuenta.'], open: ['Abrir', 'Open', 'Abrir'],
    delTitle: ['Excluir minha conta', 'Delete my account', 'Eliminar mi cuenta'],
    delDesc: ['A exclusão é feita com ajuda do nosso suporte, para confirmar que é você. Apaga a conta e todos os dados cadastrados e não pode ser desfeita. Baixe seus dados antes, se quiser guardá-los.', 'Deletion is handled with our support team, to confirm it is you. It erases the account and all registered data and cannot be undone. Download your data first if you want to keep it.', 'La eliminación se hace con ayuda de nuestro soporte, para confirmar que eres tú. Borra la cuenta y todos los datos registrados y no se puede deshacer. Descarga tus datos antes si quieres conservarlos.'],
    delBtn: ['Pedir exclusão pelo WhatsApp do suporte', 'Request deletion via support WhatsApp', 'Pedir eliminación por WhatsApp del soporte'],
    delMsg: ['Olá! Quero solicitar a exclusão da minha conta no SM Financial. Sei que a exclusão apaga todos os meus dados e não pode ser desfeita.', 'Hello! I would like to request the deletion of my SM Financial account. I understand that it erases all my data and cannot be undone.', '¡Hola! Quiero solicitar la eliminación de mi cuenta de SM Financial. Sé que borra todos mis datos y no se puede deshacer.'],
    delAlt: ['Segundo contato', 'Second contact', 'Segundo contacto'],
    help: ['Ajuda e tutoriais', 'Help and tutorials', 'Ayuda y tutoriales'], helpDesc: ['Aulas em vídeo curtas (1 a 3 minutos), por área do app.', 'Short video lessons (1 to 3 minutes), by area of the app.', 'Lecciones en video cortas (1 a 3 minutos), por área de la app.'],
    openTutor: ['Abrir tutoriais em vídeo', 'Open video tutorials', 'Abrir tutoriales en video'], progress: ['aulas vistas', 'lessons watched', 'lecciones vistas'],
    tutorTitle: ['Tutoriais em vídeo', 'Video tutorials', 'Tutoriales en video'], tutorIntro: ['Escolha uma área. Cada aula tem de 1 a 3 minutos.', 'Pick an area. Each lesson is 1 to 3 minutes long.', 'Elige un área. Cada lección dura de 1 a 3 minutos.'],
    lesson: ['aula', 'lesson', 'lección'], watch: ['Assistir', 'Watch', 'Ver'], lessons: ['aulas', 'lessons', 'lecciones'], min: ['min', 'min', 'min'],
    back: ['Voltar', 'Back', 'Volver'], next: ['Próxima aula', 'Next lesson', 'Siguiente lección'], markSeen: ['Marcar como vista', 'Mark as watched', 'Marcar como vista'], seen: ['Vista', 'Watched', 'Vista'],
    soon: ['Vídeo em produção. Enquanto isso, veja o resumo abaixo.', 'Video in production. Meanwhile, see the summary below.', 'Video en producción. Mientras tanto, mira el resumen abajo.'],
    whereIs: ['Onde fica', 'Where to find it', 'Dónde está'], whatYouSee: ['O que você vai ver', 'What you will see', 'Qué verás'], goThere: ['Ir para esta tela', 'Go to this screen', 'Ir a esta pantalla'],
    tabTut: ['Tutorial desta aba', 'Tutorial for this tab', 'Tutorial de esta pestaña'], close: ['Fechar', 'Close', 'Cerrar'], oldTour: ['Tour com balões (versão anterior)', 'Balloon tour (previous version)', 'Tour con globos (versión anterior)'],
    subtitles: ['Os vídeos têm legendas na tela.', 'The videos have on-screen captions.', 'Los videos tienen subtítulos en pantalla.']
  };
  var MOD = {
    welcome: ['Primeiros passos', 'Getting started', 'Primeros pasos'], 'g-inicio': ['Início', 'Home', 'Inicio'], 'g-dinheiro': ['Meu dinheiro', 'My money', 'Mi dinero'], 'g-docs': ['Documentos', 'Documents', 'Documentos'],
    'g-trabalho': ['Trabalho e renda', 'Work & income', 'Trabajo e ingresos'], 'g-fiscal': ['Fiscal e caixa', 'Tax & cash', 'Fiscal y caja'], 'g-planejar': ['Planejar', 'Planning', 'Planificación'],
    'g-dividas': ['Dívidas e crédito', 'Debt & credit', 'Deudas y crédito'], 'g-patrim': ['Patrimônio', 'Net worth', 'Patrimonio'], 'g-plano': ['Plano', 'Subscription', 'Plan']
  };
  var MICON = { welcome: '👋', 'g-inicio': '🏠', 'g-dinheiro': '💳', 'g-docs': '📄', 'g-trabalho': '💼', 'g-fiscal': '🧾', 'g-planejar': '🎯', 'g-dividas': '🧩', 'g-patrim': '🏦', 'g-plano': '⭐' };

  // ───────── idioma ─────────
  var lang = 'pt';
  function idx(l) { return l === 'en' ? 1 : l === 'es' ? 2 : 0; }
  function getLang() { return lang; }
  function s(key) { var e = S[key]; return e ? e[idx(lang)] : key; }
  function tr(pt) { if (lang === 'pt' || pt == null) return pt; var e = D[pt]; return e ? e[idx(lang) - 1] : pt; }
  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function readLang() { try { var v = localStorage.getItem(LS_LANG); if (v && LANGS.some(function (l) { return l.id === v; })) return v; } catch (e) {} return null; }
  function applyDom() {
    var d = root.document; if (!d) return;
    d.documentElement.setAttribute('lang', lang === 'pt' ? 'pt-BR' : lang);
    Array.prototype.forEach.call(d.querySelectorAll('[data-i18n]'), function (el) {
      var k = el.getAttribute('data-i18n'), t = el.getAttribute('data-i18n-title');
      if (!el.hasAttribute('data-i18n-pt')) el.setAttribute('data-i18n-pt', el.textContent);
      var base = k || el.getAttribute('data-i18n-pt');
      var txt = S[base] ? s(base) : tr(base);
      var ic = el.getAttribute('data-i18n-icon'); el.textContent = (ic ? ic + ' ' : '') + txt;
      if (t) { el.setAttribute('title', S[t] ? s(t) : tr(t)); }
    });
  }
  function setLang(l, silent) {
    if (!LANGS.some(function (x) { return x.id === l; })) return;
    lang = l; try { localStorage.setItem(LS_LANG, l); } catch (e) {}
    try { if (typeof prefsPush === 'function') prefsPush('lang', l); } catch (e) {}
    applyDom();
    try { if (typeof renderNav === 'function') renderNav(); } catch (e) {}
    try { if (typeof renderCurrentTab === 'function' && document.getElementById('main') && !document.getElementById('app-screen').hidden) renderCurrentTab(); } catch (e) {}
    if (!silent) { try { showToast(s('langSaved'), 'success'); } catch (e) {} }
  }
  function initLang() { lang = readLang() || 'pt'; /* padrão: português; só muda quando a pessoa escolhe */ applyDom(); }

  // ───────── conteúdo das aulas ─────────
  // Textos "O que você vai ver" vêm das descrições que o próprio app já exibe (Central de Ajuda e telas de plano).
  var L = [
    { m: 'welcome', id: 'boas-vindas', tabs: [], min: 2, t: ['Bem-vindo ao SM Financial', 'Welcome to SM Financial', 'Bienvenido a SM Financial'], d: 'Uma visão geral do aplicativo: o menu, o painel Início e como começar com o seu caminho em 3 passos: reunir seus dados, ver sua situação e seguir o plano.' },
    { m: 'welcome', id: 'perfil-e-idioma', tabs: ['perfil'], min: 1, t: ['Perfil, idioma e segurança', 'Profile, language and security', 'Perfil, idioma y seguridad'], d: 'Como trocar o idioma, alterar e-mail e senha com confirmação e pedir a exclusão da conta pelo suporte.' },
    { m: 'g-inicio', id: 'dashboard', tabs: ['dashboard'], min: 2, t: ['Visão Geral', 'Overview', 'Visión general'], d: 'Sua central de comando: saldo patrimonial, receitas e despesas do período, gráfico por categorias, comparativo mensal e score de saúde financeira.' },
    { m: 'g-inicio', id: 'saude', tabs: ['saude'], min: 1, t: ['Saúde Financeira', 'Financial health', 'Salud financiera'], d: 'Score de 0 a 100 em 5 critérios: reserva, dívidas, economia, gastos fixos e investimentos, com diagnóstico e recomendações.' },
    { m: 'g-dinheiro', id: 'receitas', tabs: ['receitas'], min: 1, t: ['Renda', 'Income', 'Ingresos'], d: 'Registre salário, freelance e rendimentos com valor, categoria, data e recorrência. Filtre e busque por período.' },
    { m: 'g-dinheiro', id: 'despesas', tabs: ['despesas'], min: 1, t: ['Despesas', 'Expenses', 'Gastos'], d: 'Controle cada gasto com categoria, valor e data, identifique padrões de consumo e descubra para onde o dinheiro vai.' },
    { m: 'g-dinheiro', id: 'orcamento', tabs: ['orcamento'], min: 1, t: ['Orçamento', 'Budget', 'Presupuesto'], d: 'Defina limites mensais por categoria. Barras de progresso mostram o consumo e há alertas ao se aproximar do limite.' },
    { m: 'g-dinheiro', id: 'assinaturas', tabs: ['assinaturas'], min: 1, t: ['Assinaturas', 'Subscriptions', 'Suscripciones'], d: 'Controle serviços recorrentes (streaming, apps, academia), veja o custo total mensal e identifique cortes possíveis.' },
    { m: 'g-dinheiro', id: 'openfinance', tabs: ['openfinance'], min: 1, t: ['Extratos Bancários', 'Bank statements', 'Extractos bancarios'], d: 'Importe transações de contas bancárias e sincronize dados de diferentes instituições.' },
    { m: 'g-docs', id: 'documentos', tabs: ['documentos'], min: 1, t: ['Central de Documentos', 'Document center', 'Centro de documentos'], d: 'Faça upload de faturas, holerites e extratos. A organização é automática por tipo e período, para consulta rápida.' },
    { m: 'g-docs', id: 'holerite', tabs: [], min: 2, t: ['Como enviar o holerite', 'How to send your payslip', 'Cómo enviar tu nómina'], d: 'Passo a passo do envio do holerite e de como o valor líquido entra na sua renda.', video: '/tutorial/holerite.mp4', poster: '/tutorial/holerite.jpg' },
    { m: 'g-trabalho', id: 'perfilrenda', tabs: ['perfilrenda'], min: 1, t: ['Perfil de Renda', 'Income profile', 'Perfil de ingresos'], d: 'Reserva de emergência sob medida, renda para planejar e histórico de renda por vínculo de trabalho.' },
    { m: 'g-trabalho', id: 'simuladorclt', tabs: ['simuladorclt'], min: 1, t: ['Simulador CLT', 'Employee pay simulator', 'Simulador laboral (CLT)'], d: 'Simule férias, 13º salário e rescisão com INSS, IRRF e descontos previstos em lei, lendo seus holerites em PDF.' },
    { m: 'g-trabalho', id: 'obrigacoes', tabs: ['obrigacoes'], min: 1, t: ['Impostos (MEI e autônomo)', 'Taxes (MEI and freelancers)', 'Impuestos (MEI y autónomos)'], d: 'Limite anual do MEI, DAS e provisão de impostos para autônomos.' },
    { m: 'g-fiscal', id: 'regimepj', tabs: ['regimepj'], min: 2, t: ['Painel do regime tributário', 'Tax regime panel', 'Panel del régimen tributario'], d: 'Impostos, limites e obrigações específicos do tipo da sua empresa.' },
    { m: 'g-fiscal', id: 'fiscal', tabs: ['fiscal'], min: 2, t: ['Fiscal', 'Tax', 'Fiscal'], d: 'Gestão de impostos, DAS e obrigações fiscais para o seu CNPJ.' },
    { m: 'g-fiscal', id: 'fluxo', tabs: ['fluxo'], min: 2, t: ['Fluxo de Caixa', 'Cash flow', 'Flujo de caja'], d: 'Projeção detalhada de entradas e saídas do caixa da sua empresa.' },
    { m: 'g-fiscal', id: 'caixapj', tabs: ['caixapj'], min: 2, t: ['Caixa & Reserva', 'Cash & reserve', 'Caja y reserva'], d: 'Reserva de caixa sob medida, faturamento versus custos e leitura da sazonalidade da empresa.' },
    { m: 'g-fiscal', id: 'reforma', tabs: ['reforma'], min: 2, t: ['Reforma Tributária', 'Tax reform', 'Reforma tributaria'], d: 'Checklist e acompanhamento da Reforma Tributária para a sua empresa.' },
    { m: 'g-planejar', id: 'agenda', tabs: ['agenda'], min: 1, t: ['Agenda & IA', 'Agenda & AI', 'Agenda e IA'], d: 'Sua agenda financeira: contas, lembretes e o plano da semana.' },
    { m: 'g-planejar', id: 'metas', tabs: ['metas'], min: 1, t: ['Metas', 'Goals', 'Metas'], d: 'Crie objetivos financeiros com barras de progresso, prazo estimado e contribuições mensais sugeridas.' },
    { m: 'g-planejar', id: 'projecao', tabs: ['projecao'], min: 1, t: ['Projeção', 'Projection', 'Proyección'], d: 'Simule cenários futuros de saldo e patrimônio com base nas suas receitas e despesas reais.' },
    { m: 'g-planejar', id: 'estrategia', tabs: ['estrategia'], min: 1, t: ['Estratégia & Consultoria', 'Strategy & advice', 'Estrategia y asesoría'], d: 'Consultoria personalizada em fases, dicas contextuais e simulador de decisões financeiras.' },
    { m: 'g-planejar', id: 'insights', tabs: ['insights'], min: 1, t: ['Insights', 'Insights', 'Insights'], d: 'Análises avançadas, detecção de anomalias de gastos e recomendações automáticas baseadas nos seus dados.' },
    { m: 'g-dividas', id: 'dividas', tabs: ['dividas'], min: 1, t: ['Dívidas', 'Debts', 'Deudas'], d: 'Cadastre empréstimos, financiamentos e parcelas. Veja juros acumulados, saldo devedor e simule antecipações.' },
    { m: 'g-dividas', id: 'calcdivida', tabs: ['calcdivida'], min: 1, t: ['Calculadora de dívidas', 'Debt calculator', 'Calculadora de deudas'], d: 'Simule quitação e antecipação das suas dívidas e compare cenários.' },
    { m: 'g-dividas', id: 'alivio', tabs: ['alivio'], min: 1, t: ['Central de Alívio', 'Relief center', 'Centro de alivio'], d: 'Raio-X da dívida, plano de alívio, roteiro de renegociação, caçador de assinaturas, auditor de holerite e cartão de progresso.' },
    { m: 'g-dividas', id: 'resolver', tabs: ['resolver'], min: 2, t: ['Resolver Dívidas', 'Solve debts', 'Resolver deudas'], d: 'Plano de quitação, comparação de estratégias, financiar x juntar, troca de dívidas e guia de crédito com condições especiais.' },
    { m: 'g-dividas', id: 'credito', tabs: ['credito'], min: 1, t: ['Crédito & Nome Sujo', 'Credit & bad credit record', 'Crédito y nombre sucio'], d: 'Tamanho da dívida, plano para limpar o nome, programas de renegociação e onde conseguir crédito.' },
    { m: 'g-patrim', id: 'patrimonio', tabs: ['patrimonio'], min: 1, t: ['Patrimônio', 'Net worth', 'Patrimonio'], d: 'Registre imóveis, veículos e investimentos e acompanhe a evolução do seu patrimônio líquido ao longo do tempo.' },
    { m: 'g-patrim', id: 'investir', tabs: ['investir'], min: 1, t: ['Investimentos', 'Investments', 'Inversiones'], d: 'Perfil de investidor, ordem de prioridades e onde investir com base na Selic atual e na sua situação.' },
    { m: 'g-patrim', id: 'cambio', tabs: ['cambio'], min: 1, t: ['Câmbio Multi-moeda', 'Multi-currency exchange', 'Cambio multimoneda'], d: 'Conversor de moedas em tempo real para viagens, investimentos internacionais e importações.' },
    { m: 'g-plano', id: 'plano', tabs: ['plano'], min: 1, t: ['Plano e assinatura', 'Plan and subscription', 'Plan y suscripción'], d: 'Gerencie sua assinatura, compare os planos e desbloqueie recursos premium.' }
  ];
  var MODULES = ['welcome', 'g-inicio', 'g-dinheiro', 'g-docs', 'g-trabalho', 'g-fiscal', 'g-planejar', 'g-dividas', 'g-patrim', 'g-plano'];
  function lessonTitle(l) { return l.t[idx(lang)]; }
  function lessonsOf(m) { return L.filter(function (l) { return l.m === m; }); }
  function lessonFor(tab) { for (var i = 0; i < L.length; i++) { if (L[i].tabs.indexOf(tab) >= 0) return L[i]; } return null; }
  function lessonById(id) { for (var i = 0; i < L.length; i++) { if (L[i].id === id) return L[i]; } return null; }
  function videoUrl(l) { return l.video || '/tutorial/' + l.id + '.mp4'; }
  function posterUrl(l) { return l.poster || '/tutorial/' + l.id + '.jpg'; }

  // ───────── aulas vistas ─────────
  var seenSet = {};
  function seenKey() { try { return typeof fxKey === 'function' ? fxKey('tut') : 'sm-tut'; } catch (e) { return 'sm-tut'; } }
  function loadSeen() { try { seenSet = JSON.parse(localStorage.getItem(seenKey()) || '{}') || {}; } catch (e) { seenSet = {}; } }
  function saveSeen() { try { localStorage.setItem(seenKey(), JSON.stringify(seenSet)); } catch (e) {} try { if (typeof prefsPush === 'function') prefsPush('tut', seenSet); } catch (e) {} }
  function markSeen(id, on) { if (on === false) delete seenSet[id]; else seenSet[id] = 1; saveSeen(); }
  function seenCount() { return L.filter(function (l) { return seenSet[l.id]; }).length; }
  function adoptSeen(obj) { if (obj && typeof obj === 'object') { seenSet = Object.assign({}, obj, seenSet); } }

  // ───────── onde fica (a partir do menu real) ─────────
  function whereOf(l) {
    try {
      if (!l.tabs.length) return '';
      var g = typeof navGroupOf === 'function' ? navGroupOf(l.tabs[0]) : null;
      if (!g) return '';
      var kid = g.kids.filter(function (k) { return k.id === l.tabs[0]; })[0];
      var a = tr(g.label), b = kid ? tr(kid.label) : '';
      return g.kids.length > 1 && b ? a + ' › ' + b : a;
    } catch (e) { return ''; }
  }
  function tabAvailable(id) { try { return getAvailableTabs().some(function (t) { return t.id === id; }); } catch (e) { return false; } }

  // ───────── modal dos tutoriais ─────────
  var tutState = { view: 'list', lesson: null };
  function ensureStyle() {
    if (!root.document || root.document.getElementById('perfil-style')) return;
    var st = root.document.createElement('style'); st.id = 'perfil-style';
    st.textContent = '.pf-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}.pf-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}' +
      '.pf-kv{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;font-size:14px}.pf-kv b{color:var(--ink-3,#667);font-weight:600}' +
      '.pf-lang{display:flex;gap:8px;flex-wrap:wrap}.pf-lang button{padding:9px 16px;border-radius:999px;border:1.5px solid var(--border,#d7dbe2);background:var(--card,#fff);color:var(--ink,#111);font:600 13.5px inherit;font-family:inherit;cursor:pointer}.pf-lang button.on{border-color:var(--gold,#AD8A2A);background:var(--teal-wash,#f6efdb)}' +
      '.pf-msg{font-size:13px;margin-top:8px;min-height:18px}.pf-msg.err{color:var(--expense,#b3261e)}.pf-msg.ok{color:var(--income,#1a7f4b)}' +
      '.pf-danger{border:1px solid var(--expense,#b3261e)}.pf-note{font-size:12.5px;color:var(--ink-3,#667);margin-top:8px}' +
      '.tut-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:9px 12px;border:1px solid var(--border,#d7dbe2);border-radius:12px;background:var(--card,#fff);font-size:13px}.tut-bar button{font:700 12.5px inherit;font-family:inherit;padding:6px 12px;border-radius:999px;border:1px solid var(--gold,#AD8A2A);background:transparent;color:var(--ink,#111);cursor:pointer}' +
      '.tut-mod{border:1px solid var(--border,#d7dbe2);border-radius:12px;padding:12px 14px;margin-bottom:10px}.tut-mod h4{margin:0 0 6px;font-size:15px}.tut-les{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:8px 6px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;border-top:1px solid var(--border-subtle,#eceff3)}.tut-les:hover{background:var(--teal-wash,#f6efdb)}.tut-les .m{margin-left:auto;font-size:12px;color:var(--ink-3,#667);white-space:nowrap}.tut-ck{width:18px;text-align:center;color:var(--income,#1a7f4b);font-weight:800}' +
      '.tut-soon{padding:22px 14px;border:1.5px dashed var(--border,#d7dbe2);border-radius:12px;text-align:center;font-size:14px;color:var(--ink-2,#445);background:var(--card,#fff)}.tut-where{font-size:13px;color:var(--ink-3,#667);margin:8px 0}@media(max-width:560px){.pf-kv{grid-template-columns:1fr}}';
    root.document.head.appendChild(st);
  }
  function listHtml() {
    var h = '<div class="occ-b-desc" style="margin-bottom:12px">' + esc(s('tutorIntro')) + ' ' + esc(s('subtitles')) + '</div>';
    MODULES.forEach(function (m) {
      var ls = lessonsOf(m).filter(function (l) { return !l.tabs.length || l.tabs.some(tabAvailable) || l.tabs.indexOf('perfil') >= 0; });
      if (!ls.length) return;
      h += '<div class="tut-mod"><h4>' + MICON[m] + ' ' + esc(MOD[m][idx(lang)]) + ' · ' + ls.length + ' ' + esc(ls.length === 1 ? s('lesson') : s('lessons')) + '</h4>';
      ls.forEach(function (l) { h += '<button class="tut-les" onclick="Tutor.lesson(\'' + l.id + '\')"><span class="tut-ck">' + (seenSet[l.id] ? '✓' : '') + '</span><span>' + esc(lessonTitle(l)) + '</span><span class="m">~' + l.min + ' ' + esc(s('min')) + '</span></button>'; });
      h += '</div>';
    });
    h += '<div class="pf-row" style="margin-top:6px"><button class="btn-sm" onclick="closeModal();setTimeout(function(){Onboard.start()},300)">🧭 ' + esc(s('oldTour')) + '</button></div>';
    h += '<div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">' + esc(s('close')) + '</button></div>';
    return h;
  }
  function lessonHtml(l, videoOk) {
    var where = whereOf(l), next = nextOf(l);
    var h = '<button class="btn-sm" onclick="Tutor.list()">← ' + esc(s('back')) + '</button>';
    h += '<div style="margin-top:12px">';
    if (videoOk) h += '<video controls playsinline preload="metadata" poster="' + esc(posterUrl(l)) + '" style="width:100%;border-radius:10px;background:#000" aria-label="' + esc(lessonTitle(l)) + '" onended="Tutor.markSeen(\'' + l.id + '\')"><source src="' + esc(videoUrl(l)) + '" type="video/mp4"></video>';
    else h += '<div class="tut-soon">🎬 ' + esc(s('soon')) + '</div>';
    h += '</div>';
    h += '<div class="occ-b-title" style="margin-top:12px">' + esc(s('whatYouSee')) + '</div><div class="occ-b-desc">' + esc(l.d) + '</div>';
    if (where) h += '<div class="tut-where">📍 ' + esc(s('whereIs')) + ': <b>' + esc(where) + '</b></div>';
    h += '<div class="pf-row" style="margin-top:10px">';
    if (l.tabs.length && l.tabs[0] !== 'perfil' && tabAvailable(l.tabs[0])) h += '<button class="btn-add" onclick="closeModal();switchTab(\'' + l.tabs[0] + '\')">' + esc(s('goThere')) + '</button>';
    if (l.tabs[0] === 'perfil') h += '<button class="btn-add" onclick="closeModal();Perfil.open()">' + esc(s('goThere')) + '</button>';
    h += '<button class="btn-sm" onclick="Tutor.toggleSeen(\'' + l.id + '\')">' + (seenSet[l.id] ? '✓ ' + esc(s('seen')) : esc(s('markSeen'))) + '</button>';
    if (next) h += '<button class="btn-sm" onclick="Tutor.lesson(\'' + next.id + '\')">' + esc(s('next')) + ' →</button>';
    h += '</div><div class="modal-actions"><button class="btn-cancel" onclick="closeModal()">' + esc(s('close')) + '</button></div>';
    return h;
  }
  function nextOf(l) {
    var flat = []; MODULES.forEach(function (m) { lessonsOf(m).forEach(function (x) { if (!x.tabs.length || x.tabs.some(tabAvailable) || x.tabs.indexOf('perfil') >= 0) flat.push(x); }); });
    var i = flat.indexOf(l); return i >= 0 && i < flat.length - 1 ? flat[i + 1] : null;
  }
  function checkVideo(url) {
    if (!root.fetch) return Promise.resolve(false);
    return root.fetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (r) { var t = (r.headers && r.headers.get('content-type')) || ''; return r.ok && /video|octet/i.test(t); }).catch(function () { return false; });
  }
  var Tutor = {
    open: function (target) {
      ensureStyle(); loadSeen();
      var l = target && lessonById(target);
      if (l) return Tutor.lesson(l.id);
      if (target && MODULES.indexOf(target) >= 0) { var f = lessonsOf(target)[0]; if (f) return Tutor.lesson(f.id); }
      Tutor.list();
    },
    list: function () { tutState = { view: 'list' }; openModal('🎬 ' + s('tutorTitle'), listHtml()); },
    lesson: function (id) {
      var l = lessonById(id); if (!l) return Tutor.list();
      tutState = { view: 'lesson', lesson: id };
      openModal('🎬 ' + lessonTitle(l), lessonHtml(l, false));
      checkVideo(videoUrl(l)).then(function (ok) { if (ok && tutState.lesson === id && document.getElementById('modal-overlay').classList.contains('open')) { document.getElementById('modal-body').innerHTML = lessonHtml(l, true); } });
    },
    markSeen: function (id) { markSeen(id, true); },
    toggleSeen: function (id) { markSeen(id, !seenSet[id]); var l = lessonById(id); if (l) { var v = document.querySelector('#modal-body video'); document.getElementById('modal-body').innerHTML = lessonHtml(l, !!v); } },
    // botão "Tutorial desta aba": inserido logo abaixo do menu interno da tela atual
    decorate: function (tab) {
      var d = root.document, main = d && d.getElementById('main'); if (!main) return;
      Array.prototype.forEach.call(main.querySelectorAll('.tut-bar'), function (n) { n.remove(); });
      var l = lessonFor(tab); if (!l) return; ensureStyle();
      var bar = d.createElement('div'); bar.className = 'tut-bar'; bar.setAttribute('data-tut', l.id);
      bar.innerHTML = '<span>🎬 <b>' + esc(s('tabTut')) + '</b> · ' + esc(lessonTitle(l)) + ' · ~' + l.min + ' ' + esc(s('min')) + '</span><button type="button" onclick="Tutor.lesson(\'' + l.id + '\')">▶ ' + esc(s('watch')) + '</button>' + (seenSet[l.id] ? '<span class="tut-ck">✓</span>' : '');
      var sub = main.querySelector('.subnav');
      if (sub && sub.nextSibling) sub.parentNode.insertBefore(bar, sub.nextSibling); else if (sub) sub.parentNode.appendChild(bar); else main.insertBefore(bar, main.firstChild);
    },
    lessons: function () { return L.slice(); }, modules: function () { return MODULES.slice(); }, lessonFor: lessonFor
  };

  // ───────── perfil ─────────
  var tries = { n: 0, until: 0 };
  function isDemo() { try { return !!(DEMO && DEMO.on); } catch (e) { return false; } }
  function emailNow() { try { return (currentUser && currentUser.email) || ''; } catch (e) { return ''; } }
  function supportNumbers() { try { if (Array.isArray(CHAT_WHATSAPP_NUMBERS) && CHAT_WHATSAPP_NUMBERS.length) return CHAT_WHATSAPP_NUMBERS; } catch (e) {} return []; }
  function waLink(n) {
    var id = ''; try { id = currentUser && currentUser.id ? currentUser.id : ''; } catch (e) {}
    var msg = s('delMsg') + '\n\n' + s('email') + ': ' + (emailNow() || '-') + (id ? '\nID: ' + id : '');
    return 'https://wa.me/' + n.phone + '?text=' + encodeURIComponent(msg);
  }
  function passOk(p) { return p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p); }
  function say(id, msg, kind) { var el = root.document.getElementById(id); if (el) { el.className = 'pf-msg ' + (kind || ''); el.textContent = msg || ''; } }
  function locked() { if (Date.now() < tries.until) { return true; } return false; }
  function fail() { tries.n++; if (tries.n >= 3) { tries.until = Date.now() + 30000; tries.n = 0; } }
  async function confirmPassword(pass) {
    if (!(sb && currentUser)) return { ok: false, msg: s('errGeneric') };
    if (locked()) return { ok: false, msg: s('errLock') };
    if (!pass) return { ok: false, msg: s('errNeedCur') };
    var r; try { r = await sb.auth.signInWithPassword({ email: emailNow(), password: pass }); } catch (e) { return { ok: false, msg: s('errGeneric') }; }
    if (r && r.error) { fail(); return { ok: false, msg: locked() ? s('errLock') : s('errCurPass') }; }
    tries.n = 0; return { ok: true };
  }
  var Perfil = {
    open: function () { ensureStyle(); try { switchTab('perfil'); } catch (e) {} },
    setLang: function (l) { setLang(l); },
    render: function () {
      ensureStyle(); loadSeen();
      var demo = isDemo(), nm = '', since = '';
      try { nm = state.name || ''; } catch (e) {}
      try { if (currentUser && currentUser.created_at) since = new Date(currentUser.created_at).toLocaleDateString(lang === 'pt' ? 'pt-BR' : lang === 'es' ? 'es' : 'en-GB'); } catch (e) {}
      var isPJ = false; try { isPJ = state.profile_type === 'PJ'; } catch (e) {}
      var dis = demo ? ' disabled' : '';
      var nums = supportNumbers();
      var h = '<div class="section-header animate-in"><div><div class="section-title">👤 ' + esc(s('profileTitle')) + '</div><div class="section-desc">' + esc(s('profileSub')) + '</div></div></div>';
      h += '<div class="pf-grid">';
      h += '<div class="card animate-in"><div class="card-title">' + esc(s('account')) + '</div><div class="pf-kv" style="margin-top:10px"><b>' + esc(s('name')) + '</b><span>' + esc(nm || '-') + '</span><b>' + esc(s('email')) + '</b><span>' + esc(demo ? 'demo@smfinancial' : (emailNow() || '-')) + '</span><b>' + esc(s('accType')) + '</b><span>' + esc(isPJ ? s('business') : s('personal')) + '</span>' + (since ? '<b>' + esc(s('since')) + '</b><span>' + esc(since) + '</span>' : '') + '</div><div class="pf-row" style="margin-top:12px"><button class="btn-sm" onclick="switchTab(\'plano\')">' + esc(s('seePlan')) + '</button></div></div>';
      h += '<div class="card animate-in" id="pf-lang"><div class="card-title">🌐 ' + esc(s('language')) + '</div><div class="occ-b-desc" style="margin:8px 0 10px">' + esc(s('langDesc')) + '</div><div class="pf-lang" role="radiogroup" aria-label="' + esc(s('language')) + '">' + LANGS.map(function (l) { return '<button type="button" role="radio" aria-checked="' + (l.id === lang) + '" class="' + (l.id === lang ? 'on' : '') + '" data-lang="' + l.id + '" onclick="Perfil.setLang(\'' + l.id + '\')">' + l.flag + ' · ' + esc(l.name) + '</button>'; }).join('') + '</div><div class="pf-note">' + esc(s('langNote')) + '</div></div>';
      h += '<div class="card animate-in" id="pf-email"><div class="card-title">✉️ ' + esc(s('changeEmail')) + '</div><div class="occ-b-desc" style="margin:8px 0 10px">' + esc(s('secDesc')) + '</div>' +
        '<div class="form-group"><label class="form-label" for="pf-new-email">' + esc(s('newEmail')) + '</label><input class="form-input" id="pf-new-email" type="email" autocomplete="email"' + dis + '></div>' +
        '<div class="form-group"><label class="form-label" for="pf-email-pass">' + esc(s('curPass')) + '</label><input class="form-input" id="pf-email-pass" type="password" autocomplete="current-password"' + dis + '></div>' +
        '<button class="btn-add" id="pf-email-btn" onclick="Perfil.changeEmail()"' + dis + '>' + esc(s('saveEmail')) + '</button><div class="pf-msg" id="pf-email-msg" role="status">' + (demo ? esc(s('demoOff')) : '') + '</div></div>';
      h += '<div class="card animate-in" id="pf-pass"><div class="card-title">🔑 ' + esc(s('changePass')) + '</div><div class="occ-b-desc" style="margin:8px 0 10px">' + esc(s('passRules')) + '</div>' +
        '<div class="form-group"><label class="form-label" for="pf-cur-pass">' + esc(s('curPass')) + '</label><input class="form-input" id="pf-cur-pass" type="password" autocomplete="current-password"' + dis + '></div>' +
        '<div class="form-group"><label class="form-label" for="pf-new-pass">' + esc(s('newPass')) + '</label><input class="form-input" id="pf-new-pass" type="password" autocomplete="new-password"' + dis + '></div>' +
        '<div class="form-group"><label class="form-label" for="pf-new-pass2">' + esc(s('newPass2')) + '</label><input class="form-input" id="pf-new-pass2" type="password" autocomplete="new-password"' + dis + '></div>' +
        '<button class="btn-add" id="pf-pass-btn" onclick="Perfil.changePassword()"' + dis + '>' + esc(s('savePass')) + '</button><div class="pf-msg" id="pf-pass-msg" role="status">' + (demo ? esc(s('demoOff')) : '') + '</div></div>';
      h += '<div class="card animate-in"><div class="card-title">🛡️ ' + esc(s('privacy')) + '</div><div class="occ-b-desc" style="margin:8px 0 10px">' + esc(s('privacyDesc')) + '</div><button class="btn-sm" onclick="openPrivacyModal()">' + esc(s('open')) + '</button></div>';
      h += '<div class="card animate-in"><div class="card-title">🎬 ' + esc(s('help')) + '</div><div class="occ-b-desc" style="margin:8px 0 10px">' + esc(s('helpDesc')) + '</div><div class="pf-row"><button class="btn-add" onclick="Tutor.open()">' + esc(s('openTutor')) + '</button><span class="occ-b-desc">' + seenCount() + '/' + L.length + ' ' + esc(s('progress')) + '</span></div></div>';
      h += '<div class="card animate-in pf-danger" id="pf-del"><div class="card-title" style="color:var(--expense,#b3261e)">⚠️ ' + esc(s('delTitle')) + '</div><div class="occ-b-desc" style="margin:8px 0 10px">' + esc(s('delDesc')) + '</div><div class="pf-row">' +
        nums.map(function (n, i) { return '<a class="btn-sm" style="text-decoration:none;border-color:var(--expense,#b3261e);color:var(--expense,#b3261e)" target="_blank" rel="noopener" href="' + esc(waLink(n)) + '">' + (i === 0 ? esc(s('delBtn')) : esc(s('delAlt')) + ' · ' + esc(n.display)) + '</a>'; }).join('') + '</div><div class="pf-note"><a href="#" onclick="openPrivacyModal();return false">' + esc(s('privacy')) + '</a></div></div>';
      h += '</div>';
      return h;
    },
    changeEmail: async function () {
      if (isDemo()) return say('pf-email-msg', s('demoOff'), 'err');
      var ne = String((document.getElementById('pf-new-email') || {}).value || '').trim().toLowerCase(), pw = (document.getElementById('pf-email-pass') || {}).value || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ne) || ne === emailNow().toLowerCase()) return say('pf-email-msg', s('errEmail'), 'err');
      var btn = document.getElementById('pf-email-btn'); if (btn) btn.disabled = true; say('pf-email-msg', '…');
      var c = await confirmPassword(pw);
      if (!c.ok) { if (btn) btn.disabled = false; return say('pf-email-msg', c.msg, 'err'); }
      var r; try { r = await sb.auth.updateUser({ email: ne }); } catch (e) { r = { error: e }; }
      if (btn) btn.disabled = false;
      if (r && r.error) return say('pf-email-msg', s('errGeneric'), 'err');
      document.getElementById('pf-new-email').value = ''; document.getElementById('pf-email-pass').value = '';
      say('pf-email-msg', s('emailSent'), 'ok');
    },
    changePassword: async function () {
      if (isDemo()) return say('pf-pass-msg', s('demoOff'), 'err');
      var cur = (document.getElementById('pf-cur-pass') || {}).value || '', p1 = (document.getElementById('pf-new-pass') || {}).value || '', p2 = (document.getElementById('pf-new-pass2') || {}).value || '';
      if (!cur) return say('pf-pass-msg', s('errNeedCur'), 'err');
      if (!passOk(p1)) return say('pf-pass-msg', s('errRules'), 'err');
      if (p1 !== p2) return say('pf-pass-msg', s('errMatch'), 'err');
      if (p1 === cur) return say('pf-pass-msg', s('errSame'), 'err');
      var btn = document.getElementById('pf-pass-btn'); if (btn) btn.disabled = true; say('pf-pass-msg', '…');
      var c = await confirmPassword(cur);
      if (!c.ok) { if (btn) btn.disabled = false; return say('pf-pass-msg', c.msg, 'err'); }
      var r; try { r = await sb.auth.updateUser({ password: p1 }); } catch (e) { r = { error: e }; }
      if (btn) btn.disabled = false;
      if (r && r.error) return say('pf-pass-msg', s('errGeneric'), 'err');
      ['pf-cur-pass', 'pf-new-pass', 'pf-new-pass2'].forEach(function (i) { var el = document.getElementById(i); if (el) el.value = ''; });
      say('pf-pass-msg', s('passChanged'), 'ok');
    }
  };

  function hookPrefs(cloud) { if (cloud) { if (cloud.lang && LANGS.some(function (l) { return l.id === cloud.lang; }) && !readLang()) { lang = cloud.lang; try { localStorage.setItem(LS_LANG, lang); } catch (e) {} } if (cloud.tut) adoptSeen(cloud.tut); } }

  root.I18N = { LANGS: LANGS, dict: D, strings: S, get: getLang, set: setLang, tr: tr, s: s, apply: applyDom, init: initLang, hookPrefs: hookPrefs };
  root.Perfil = Perfil; root.Tutor = Tutor;
  if (root.document) { if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', initLang); else initLang(); }
})(typeof window !== 'undefined' ? window : this);
