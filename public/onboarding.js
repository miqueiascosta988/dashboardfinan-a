/* Onboarding interativo do SM Financial: balões com seta, destaque do campo e passeio por todo o dashboard.
   Usa só o que o app já tem (switchTab, modais, planos). Não grava nada além de "tutorial concluído". */
(function (root) {
  'use strict';
  var BRAND_ACC = '#D4AF4F';

  // ───────── utilitários de busca ─────────
  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function byText(sel, re, closest) {
    var a = document.querySelectorAll(sel);
    for (var i = 0; i < a.length; i++) { if (re.test((a[i].textContent || '').replace(/\s+/g, ' '))) return closest ? (a[i].closest(closest) || a[i]) : a[i]; }
    return null;
  }
  var nav = function (id) { return function () { return $('#nav [data-tab="' + id + '"]') || $('#nav [data-tabs~="' + id + '"]'); }; };
  var sub = function (id) { return function () { return $('.subnav-btn[onclick*="\'' + id + '\'"]'); }; };
  var card = function (re) { return function () { return byText('#main .card-title', re, '.card'); }; };
  var btn = function (re) { return function () { return byText('#main button, #main a.btn-add', re); }; };
  var main = function (s) { return function () { return $('#main ' + s); }; };
  var field = function (label) {
    return function () {
      var g = document.querySelectorAll('#modal-body .form-group');
      for (var i = 0; i < g.length; i++) { var l = g[i].querySelector('.form-label'); if (l && l.textContent.trim().toLowerCase().indexOf(label.toLowerCase()) === 0) return g[i]; }
      return null;
    };
  };
  var modalBtn = function (cls) { return function () { return $('#modal-body .' + cls); }; };
  var isPJ = function () { try { return state.profile_type === 'PJ'; } catch (e) { return false; } };
  var locked = function (id) {
    try { var i = PLUS_ONLY_TABS[id]; return !!(i && !meetsTier(i.tier || 'plus')); } catch (e) { return false; }
  };

  // ───────── roteiro ─────────
  // S(seção, aba, alvo, título, texto, opções)  opções: side, modal (abre o formulário), when, click
  function S(sec, tab, sel, title, text, o) { o = o || {}; o.sec = sec; o.tab = tab; o.sel = sel; o.title = title; o.text = text; return o; }
  var SECS = { intro: 'Boas-vindas', inicio: 'Início', dinheiro: 'Meu dinheiro', docs: 'Documentos', trabalho: 'Trabalho e renda', planejar: 'Planejar', dividas: 'Dívidas e crédito', patrimonio: 'Patrimônio', plano: 'Plano', fim: 'Pronto' };

  function build() {
    var pj = isPJ(), L = [];
    var openTx = function (t) { return function () { openTransactionModal(t); }; };
    function add(s) { if (!s.when || s.when()) L.push(s); }

    // Boas-vindas e topo
    add(S('intro', null, null, 'Bem-vindo ao SM Financial!', 'Vou te mostrar cada área do aplicativo, campo por campo, com setas e balões. Leva uns minutos. Use os botões, ou as setas ← → do teclado. Pode sair quando quiser (Esc).', { center: true }));
    add(S('intro', null, null, 'Prefere ver em vídeo?', 'Se alguma explicação deste tutorial não ficar clara, temos um onboarding em vídeo que explica melhor cada funcionalidade do dashboard. Ele também é enviado por e-mail, junto com o link do aplicativo, assim que a compra é confirmada.', { center: true, video: true }));
    add(S('intro', null, '#profile-toggle', pj ? 'Pessoal ou Empresa' : 'Pessoal ou Empresa', 'Alterne entre Pessoa Física e Empresa. As categorias, os relatórios e o vocabulário do app mudam conforme o modo escolhido.'));
    add(S('intro', null, '#period-display', 'Período', 'Clique para abrir o calendário e escolher o mês (ou um intervalo). Todas as telas mostram só o que acontece no período escolhido.'));
    add(S('intro', null, '#notif-btn', 'Sino de avisos', 'Aqui aparecem alertas úteis: orçamento estourando, contas a vencer, metas perto de bater e dicas para o seu caso. O número vermelho mostra quantos avisos importantes existem.'));
    add(S('intro', null, '#theme-toggle', 'Tema claro e escuro', 'Troque entre tema claro e escuro. O app lembra a sua escolha.'));
    add(S('intro', null, '#btn-export', 'Exportar seus dados', 'Baixe tudo em JSON (cópia completa) ou as transações em CSV para abrir em planilha. Seus dados são seus.'));
    add(S('intro', null, '#plan-badge', 'Seu plano', 'Mostra o plano atual (Free, Basic, Plus, Pro ou Business). A aba Plano explica o que cada um libera.'));
    add(S('intro', null, '#help-btn', 'Ajuda sempre à mão', 'O botão ? abre a Central de Ajuda com um guia de cada função. O botão 🎓 Tutorial refaz este passeio quando você quiser.'));

    // Início
    add(S('inicio', 'dashboard', nav('dashboard'), 'Início', 'É a sua central de comando: tudo o que importa do mês, em um relance. Vamos olhar cada parte.'));
    add(S('inicio', 'dashboard', main('.hero-card'), pj ? 'Patrimônio da empresa' : 'Saldo patrimonial', 'O que você tem (dinheiro, bens, investimentos) menos o que deve. É o número que mostra se a sua vida financeira está crescendo ou encolhendo.'));
    add(S('inicio', 'dashboard', main('#wk-card'), 'Plano da semana', 'Toda semana o app escolhe de 1 a 3 missões com base nos seus números: pagar a dívida mais cara, segurar um gasto, rever uma assinatura. Marque as que você fizer e veja quantos meses faltam para quitar tudo. A mesma lista chega no seu e-mail às segundas.'));
    add(S('inicio', 'dashboard', main('.kpi-grid .kpi:nth-child(1)'), pj ? 'Faturamento' : 'Renda', 'Tudo o que entrou no período: salário, extras, rendimentos.'));
    add(S('inicio', 'dashboard', main('.kpi-grid .kpi:nth-child(2)'), 'Despesas', 'Tudo o que saiu no período. Compare com a renda para ver se está gastando mais do que ganha.'));
    add(S('inicio', 'dashboard', main('.kpi-grid .kpi:nth-child(3)'), 'Resultado', 'Renda menos despesas. Verde significa que sobrou dinheiro; vermelho, que faltou.'));
    add(S('inicio', 'dashboard', main('.kpi-grid .kpi:nth-child(4)'), 'Taxa de economia', 'A fatia da renda que você consegue guardar. Quanto maior, mais rápido você alcança as suas metas.'));
    add(S('inicio', 'dashboard', card(/Gastos por categoria/), 'Gastos por categoria', 'Mostra para onde o dinheiro vai: moradia, alimentação, transporte e assim por diante. Ótimo para achar o que dá para cortar.'));
    add(S('inicio', 'dashboard', card(/Renda vs Despesa/), 'Renda contra despesa', 'Compara, mês a mês, o que entra e o que sai. Ajuda a ver tendências.'));
    add(S('inicio', 'dashboard', card(/Comparativo Mensal/), 'Comparativo mensal', 'Este mês contra o anterior: renda, despesas e resultado lado a lado.'));
    add(S('inicio', 'dashboard', card(/Saúde Financeira/), 'Nota de saúde financeira', 'Uma nota de 0 a 100 que resume sua reserva, dívidas, economia e gastos fixos. Clique na aba Saúde Financeira para ver como melhorar.'));
    add(S('inicio', 'dashboard', card(/Pensando em comprar/), 'Pensando em comprar algo?', 'Simule o impacto de uma compra no seu orçamento antes de gastar.'));
    add(S('inicio', 'dashboard', main('.subnav'), 'Abas desta área', 'Cada grupo do menu tem abas. Aqui você alterna entre Visão Geral e Saúde Financeira.'));
    add(S('inicio', 'saude', main('.section-title'), 'Saúde Financeira', 'A nota detalhada, indicador por indicador, com um plano de ação para cada um.'));
    add(S('inicio', 'saude', card(/Plano de ação por indicador/), 'Plano de ação', 'Para cada ponto fraco, o app diz o que fazer primeiro. Comece pelo que mais pesa na nota.'));

    // Meu dinheiro
    add(S('dinheiro', 'receitas', nav('receitas'), 'Meu dinheiro', 'Aqui você registra o que entra e o que sai, define limites e controla assinaturas.'));
    add(S('dinheiro', 'receitas', main('.section-title'), pj ? 'Faturamento' : 'Renda', 'A lista de tudo o que entrou no período. Cada linha mostra descrição, categoria, data e valor. Clique numa linha para editar.'));
    add(S('dinheiro', 'receitas', btn(/\+ Novo/), 'Cadastrar uma receita', 'Clique em + Novo para registrar uma entrada. Vou abrir o formulário e explicar cada campo (nada será salvo agora).'));
    add(S('dinheiro', 'receitas', field('Data'), 'Data', 'Dia do mês em que aconteceu, no formato DD/MM. Ex.: 05/10.', { modal: true, open: openTx('income') }));
    add(S('dinheiro', 'receitas', field('Categoria'), 'Categoria', 'Agrupa os lançamentos para os gráficos e relatórios funcionarem. Escolha a que melhor combina.', { modal: true, open: openTx('income') }));
    add(S('dinheiro', 'receitas', field('Descrição'), 'Descrição', 'Um nome que você reconheça depois. Ex.: Salário, Freelance de design.', { modal: true, open: openTx('income') }));
    add(S('dinheiro', 'receitas', field('Valor'), 'Valor', 'Quanto entrou, em reais. Use o ponto ou a vírgula para os centavos.', { modal: true, open: openTx('income') }));
    add(S('dinheiro', 'receitas', field('Recorrente'), 'Recorrente?', 'Marque Sim se isso se repete todo mês (salário, aluguel recebido). O app usa isso nas projeções e no cálculo dos gastos fixos.', { modal: true, open: openTx('income') }));
    add(S('dinheiro', 'receitas', modalBtn('btn-save'), 'Salvar', 'Grava o lançamento e atualiza todos os gráficos na hora. Agora vou fechar o formulário sem salvar.', { modal: true, open: openTx('income') }));
    add(S('dinheiro', 'receitas', '#tx-search', 'Busca', 'Digite parte da descrição ou da categoria para achar um lançamento rápido.'));
    add(S('dinheiro', 'receitas', btn(/Excluir tudo/), 'Excluir tudo', 'Apaga todos os lançamentos desta lista. O app pede confirmação antes. Use com cuidado.'));
    add(S('dinheiro', 'despesas', main('.section-title'), 'Despesas', 'Funciona igual à renda, mas para o que saiu. Registre cada gasto com categoria, valor e data.'));
    add(S('dinheiro', 'despesas', btn(/\+ Novo/), 'Cadastrar uma despesa', 'Os campos são os mesmos da receita. Marque Recorrente nas contas fixas (aluguel, internet, escola).'));
    add(S('dinheiro', 'despesas', btn(/🔀/), 'Dividir despesa', 'Reparte um gasto com outras pessoas e mostra quanto cada um deve. Recurso do plano Plus.'));
    add(S('dinheiro', 'orcamento', main('.section-title'), 'Orçamento por categoria', 'Defina quanto quer gastar em cada categoria. As barras mudam de cor conforme você se aproxima do limite.'));
    add(S('dinheiro', 'orcamento', btn(/Editar limites/), 'Editar limites', 'Clique para definir o limite mensal de cada categoria. Você recebe avisos ao chegar perto.'));
    add(S('dinheiro', 'assinaturas', main('.section-title'), 'Assinaturas', 'Todos os serviços que cobram todo mês: streaming, aplicativos, academia. O total mostra quanto eles pesam no seu orçamento.'));
    add(S('dinheiro', 'assinaturas', btn(/\+ Nova/), 'Cadastrar assinatura', 'Clique em + Nova. Os campos são: nome, categoria, valor mensal e cor.'));
    add(S('dinheiro', 'assinaturas', field('Nome'), 'Nome', 'O nome do serviço. Ex.: Netflix, Academia.', { modal: true, open: function () { openSubModal(); } }));
    add(S('dinheiro', 'assinaturas', field('Categoria'), 'Categoria', 'O tipo do serviço. Ex.: Streaming, Saúde.', { modal: true, open: function () { openSubModal(); } }));
    add(S('dinheiro', 'assinaturas', field('Valor mensal'), 'Valor mensal', 'Quanto é cobrado por mês. O app soma tudo para você ver o custo total.', { modal: true, open: function () { openSubModal(); } }));
    add(S('dinheiro', 'assinaturas', field('Cor'), 'Cor', 'Só para deixar a lista mais fácil de reconhecer.', { modal: true, open: function () { openSubModal(); } }));
    add(S('dinheiro', 'assinaturas', card(/Radar de Vazamento/), 'Radar de vazamento', 'Aponta assinaturas repetidas ou pouco usadas que valem cancelar ou negociar.'));
    add(S('dinheiro', 'openfinance', card(/Importar novo extrato/), 'Importar extrato do banco', 'Envie o extrato em OFX ou CSV. As transações entram no seu histórico com categoria sugerida, sem digitar nada.'));

    // Documentos
    add(S('docs', 'documentos', nav('documentos'), 'Documentos', 'Faturas, boletos, holerites e extratos num só lugar. O app lê o documento no seu aparelho e já preenche os dados.'));
    add(S('docs', 'documentos', main('.scan-trigger-btn'), 'Escanear boleto ou QR Code', 'Aponte a câmera para o boleto ou QR Code. O app lê o valor e o vencimento e cadastra para você.'));
    add(S('docs', 'documentos', btn(/Upload manual/), 'Enviar arquivo', 'Escolha o tipo e envie o arquivo (PDF ou foto). Você confere os dados antes de confirmar.'));
    add(S('docs', 'documentos', main('.doc-type-btn'), 'Tipo de documento', 'Boleto, fatura de cartão, holerite, empréstimo, extrato, assinatura ou imposto. Escolher o tipo certo ajuda o app a ler melhor.'));

    // Trabalho e renda
    add(S('trabalho', 'perfilrenda', nav('perfilrenda'), 'Trabalho e renda', 'Reserva de emergência sob medida e previsão da sua renda, de acordo com o seu tipo de trabalho.', { when: function () { return !pj; } }));
    add(S('trabalho', 'perfilrenda', card(/Renda dos últimos 6 meses/), 'Renda dos últimos 6 meses', 'Mostra se a sua renda é estável ou varia. Isso define o tamanho da reserva que você precisa.', { when: function () { return !pj && !locked('perfilrenda'); } }));
    add(S('trabalho', 'perfilrenda', card(/Reserva de emergência/), 'Reserva de emergência', 'Quanto guardar para imprevistos, calculado para o seu perfil de trabalho. Quem tem renda variável precisa de uma reserva maior.', { when: function () { return !pj && !locked('perfilrenda'); } }));
    add(S('trabalho', 'perfilrenda', btn(/Alterar/), 'Alterar vínculo de trabalho', 'Mudou de emprego ou virou autônomo? Altere aqui para o app recalcular tudo.', { when: function () { return !pj && !locked('perfilrenda'); } }));

    // Planejar
    add(S('planejar', 'agenda', nav('agenda'), 'Planejar', 'Agenda, metas, projeção e estratégia: onde você organiza o futuro.'));
    add(S('planejar', 'agenda', btn(/\+ Novo evento/), 'Agenda financeira', 'Cadastre vencimentos e compromissos. O calendário mostra o que vence em cada dia.'));
    add(S('planejar', 'agenda', main('.ag-tab'), 'Calendário, Assistente e Planos', 'Alterne entre o calendário, o assistente (que responde dúvidas) e os planos montados para você.'));
    add(S('planejar', 'metas', main('.section-title'), 'Metas financeiras', 'Objetivos como viagem, reserva ou carro. Cada meta mostra a barra de progresso e o prazo estimado.'));
    add(S('planejar', 'metas', btn(/\+ Nova meta/), 'Criar uma meta', 'Clique em + Nova meta. Vou mostrar os campos.'));
    add(S('planejar', 'metas', field('Emoji'), 'Emoji', 'Um ícone para você reconhecer a meta de longe.', { modal: true, open: function () { openGoalModal(); } }));
    add(S('planejar', 'metas', field('Nome'), 'Nome', 'O que você quer conquistar. Ex.: Comprar carro, Reserva de emergência.', { modal: true, open: function () { openGoalModal(); } }));
    add(S('planejar', 'metas', field('Valor total'), 'Valor total', 'Quanto você precisa juntar no total.', { modal: true, open: function () { openGoalModal(); } }));
    add(S('planejar', 'metas', field('Já acumulado'), 'Já acumulado', 'Quanto você já tem guardado para essa meta. Pode ser zero.', { modal: true, open: function () { openGoalModal(); } }));
    add(S('planejar', 'metas', field('Aporte mensal'), 'Aporte mensal', 'Quanto pretende guardar por mês. Com isso o app calcula em quantos meses você chega lá.', { modal: true, open: function () { openGoalModal(); } }));
    add(S('planejar', 'projecao', main('.scenario-pill'), 'Projeção', 'Simula o seu patrimônio no futuro em três cenários: conservador, base e otimista.', { when: function () { return !locked('projecao'); } }));
    add(S('planejar', 'estrategia', main('#cs-card'), 'Consultor de estratégia', 'Converse com o consultor do seu jeito, por exemplo: "quero quitar o cartão até janeiro, recebo o 13º em novembro e dezembro e tenho férias em janeiro". Ele pergunta só o que faltar e monta o plano mês a mês. Salvando o plano, o valor do mês aparece no Plano da semana.', { when: function () { return !locked('estrategia'); } }));
    add(S('planejar', 'estrategia', card(/Simulador de Cenários/), 'Simulador de cenários', 'Mexa nos controles (renda, corte de gastos, valor extra) e veja na hora o efeito no seu resultado.', { when: function () { return !locked('estrategia'); } }));
    add(S('planejar', 'insights', main('.section-title'), 'Insights', 'Análises automáticas dos seus dados: tendências, gastos fora do padrão e sugestões.', { when: function () { return !locked('insights'); } }));

    // Dívidas e crédito
    add(S('dividas', 'dividas', nav('dividas'), 'Dívidas e crédito', 'Tudo para entender o que você deve e sair do aperto, na ordem certa.'));
    add(S('dividas', 'dividas', main('.section-title'), 'Controle de dívidas', 'A lista de tudo o que você deve, com saldo, juros e parcela de cada uma.'));
    add(S('dividas', 'dividas', btn(/\+ Nova dívida/), 'Cadastrar uma dívida', 'Clique em + Nova dívida. Estes são os campos:'));
    add(S('dividas', 'dividas', field('Nome'), 'Nome', 'Identifique a dívida. Ex.: Cartão Banco X, Financiamento do carro.', { modal: true, open: function () { openDebtModal(); } }));
    add(S('dividas', 'dividas', field('Categoria'), 'Categoria', 'O tipo da dívida (cartão, empréstimo, financiamento...). É obrigatória porque cada tipo tem regras e saídas diferentes.', { modal: true, open: function () { openDebtModal(); } }));
    add(S('dividas', 'dividas', field('Saldo devedor'), 'Saldo devedor', 'Quanto falta pagar hoje, e não o valor original.', { modal: true, open: function () { openDebtModal(); } }));
    add(S('dividas', 'dividas', field('Juros'), 'Juros ao mês', 'A taxa mensal cobrada. Está no contrato ou no app do banco. Com ela o app mostra quanto você paga de verdade.', { modal: true, open: function () { openDebtModal(); } }));
    add(S('dividas', 'dividas', field('Parcelas restantes'), 'Parcelas restantes', 'Quantas parcelas ainda faltam.', { modal: true, open: function () { openDebtModal(); } }));
    add(S('dividas', 'dividas', field('Valor mensal'), 'Valor mensal', 'O valor da parcela que você paga por mês.', { modal: true, open: function () { openDebtModal(); } }));
    add(S('dividas', 'dividas', card(/Simulação de antecipação/), 'Simulação de antecipação', 'Veja quanto você economiza em juros se pagar uma dívida antes do prazo.'));
    add(S('dividas', 'dividas', btn(/Entender e simular quitação/), 'Entender e simular quitação', 'Abre um passo a passo para simular a quitação daquela dívida e ver o que compensa.'));
    add(S('dividas', 'dividas', btn(/Negociar/), 'Negociar', 'Gera uma mensagem pronta para você pedir desconto ou novo prazo ao credor.'));
    add(S('dividas', 'alivio', main('.section-title'), 'Central de Alívio', 'Reúne o plano para aliviar suas dívidas: raio-x, ordem de pagamento e roteiro de negociação.', { when: function () { return !locked('alivio'); } }));
    add(S('dividas', 'resolver', main('.section-title'), 'Resolver dívidas', 'Compara estratégias de quitação e mostra a mais barata para o seu caso.', { when: function () { return !locked('resolver'); } }));
    add(S('dividas', 'credito', main('.section-title'), 'Crédito e nome sujo', 'Um passo a passo para limpar o nome e conseguir crédito em melhores condições.', { when: function () { return !locked('credito'); } }));

    // Patrimônio
    add(S('patrimonio', 'patrimonio', nav('patrimonio'), 'Patrimônio', 'O que você tem e o que você deve, para saber quanto realmente vale.'));
    add(S('patrimonio', 'patrimonio', card(/Ativos/), 'Ativos', 'O que você tem: conta, imóvel, veículo, investimentos.'));
    add(S('patrimonio', 'patrimonio', card(/Passivos/), 'Passivos', 'O que você deve. As dívidas cadastradas entram aqui sozinhas.'));
    add(S('patrimonio', 'patrimonio', btn(/\+ Novo/), 'Cadastrar um ativo', 'Clique em + Novo. São só dois campos: nome e valor.'));
    add(S('patrimonio', 'patrimonio', field('Nome'), 'Nome', 'O que é o bem. Ex.: Apartamento, Poupança.', { modal: true, open: function () { openAssetModal('assets'); } }));
    add(S('patrimonio', 'patrimonio', field('Valor'), 'Valor', 'Quanto vale hoje. O saldo patrimonial do Início usa esse número.', { modal: true, open: function () { openAssetModal('assets'); } }));
    add(S('patrimonio', 'investir', main('.section-title'), 'Investimentos', 'Seu perfil de investidor e onde investir com base na situação atual do mercado.', { when: function () { return !locked('investir'); } }));
    add(S('patrimonio', 'cambio', card(/Conversor rápido/), 'Câmbio', 'Converta moedas com a cotação do dia. Útil para viagens e rendimentos em outra moeda.', { when: function () { return !locked('cambio'); } }));

    // Plano
    add(S('plano', 'plano', nav('plano'), 'Plano', 'Aqui você vê o plano atual e compara o que cada plano libera.'));
    add(S('plano', 'plano', main('.pricing-grid'), 'Comparar planos', 'Cada cartão lista o que está incluso e os limites. Você pode começar de graça e assinar quando precisar de mais.'));
    add(S('plano', 'plano', main('.pricing-card.current'), 'Seu plano atual', 'O cartão destacado é o seu plano de hoje.'));

    // Fim
    add(S('fim', 'dashboard', null, 'Tudo pronto!', 'Esse foi o passeio completo. Um bom primeiro passo: registre uma receita e uma despesa e volte ao Início para ver tudo se atualizar. Para rever este guia, use o botão 🎓 Tutorial no topo.', { center: true, last: true }));
    return L;
  }

  // ───────── estado e interface ─────────
  var ST = { on: false, i: 0, steps: [], dir: 1, prevTab: 'dashboard', root: null, lock: false };
  var CSS = ''
    + '#ob-root{position:fixed;inset:0;z-index:10050;pointer-events:none;font-family:var(--font-body,system-ui,sans-serif)}'
    + '#ob-root .ob-b{position:fixed;background:transparent;pointer-events:auto}'
    + '#ob-root .ob-hole{position:fixed;border:3px solid ' + BRAND_ACC + ';border-radius:12px;box-shadow:0 0 0 9999px rgba(8,16,28,.66);pointer-events:none;transition:left .25s ease,top .25s ease,width .25s ease,height .25s ease;animation:obpulse 1.6s ease-in-out infinite}'
    + '#ob-root .ob-full{position:fixed;inset:0;background:rgba(8,16,28,.66);pointer-events:auto}'
    + '@keyframes obpulse{50%{border-color:rgba(212,175,79,.45)}}'
    + '#ob-root .ob-bub{position:fixed;pointer-events:auto;width:min(360px,calc(100vw - 24px));background:var(--card,#fff);color:var(--ink,#101B2D);border:1px solid var(--border,#E3E8EF);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:16px 16px 14px;animation:obin .22s ease both}'
    + '#ob-root .ob-bub.center{left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 24px))}'
    + '@keyframes obin{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}'
    + '#ob-root .ob-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}'
    + '#ob-root .ob-tag{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--gold,#AD8A2A)}'
    + '#ob-root .ob-x{background:none;border:0;color:var(--ink-3,#8A94A6);font-size:18px;line-height:1;cursor:pointer;padding:4px 6px}'
    + '#ob-root .ob-title{font-weight:800;font-size:17px;line-height:1.25;margin-bottom:6px;font-family:var(--font-display,inherit)}'
    + '#ob-root .ob-text{font-size:14px;line-height:1.55;color:var(--ink-2,#4A5668);overflow-wrap:anywhere}'
    + '#ob-root .ob-bar{height:4px;border-radius:2px;background:var(--border,#E3E8EF);margin:12px 0;overflow:hidden}'
    + '#ob-root .ob-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--teal,#16324F),' + BRAND_ACC + ');border-radius:2px;transition:width .25s}'
    + '#ob-root .ob-act{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}'
    + '#ob-root .ob-act .l{display:flex;gap:6px;align-items:center}'
    + '#ob-root .ob-btn{font:inherit;font-weight:700;font-size:13.5px;border-radius:10px;padding:9px 16px;cursor:pointer;border:1px solid var(--border,#E3E8EF);background:var(--card-alt,#EAEFF5);color:var(--ink,#101B2D)}'
    + '#ob-root .ob-btn.p{background:var(--teal,#16324F);border-color:var(--teal,#16324F);color:#fff}'
    + '#ob-root .ob-vid{display:inline-block;margin-top:10px;text-decoration:none}'
    + '#ob-root .ob-btn.g{background:none;border:0;color:var(--ink-3,#8A94A6);font-weight:600;padding:9px 6px}'
    + '#ob-root .ob-btn:focus-visible,#ob-root .ob-x:focus-visible{outline:3px solid ' + BRAND_ACC + ';outline-offset:2px}'
    + '#ob-root .ob-tail{position:absolute;width:0;height:0;border:12px solid transparent;animation:obbob 1s ease-in-out infinite}'
    + '#ob-root .ob-tail.up{top:-23px;border-bottom:13px solid ' + BRAND_ACC + ';border-top-width:0}'
    + '#ob-root .ob-tail.down{bottom:-23px;border-top:13px solid ' + BRAND_ACC + ';border-bottom-width:0;animation-name:obbobd}'
    + '#ob-root .ob-tail.left{left:-23px;border-right:13px solid ' + BRAND_ACC + ';border-left-width:0;animation-name:obbobl}'
    + '#ob-root .ob-tail.right{right:-23px;border-left:13px solid ' + BRAND_ACC + ';border-right-width:0;animation-name:obbobr}'
    + '@keyframes obbob{50%{transform:translateY(-5px)}}@keyframes obbobd{50%{transform:translateY(5px)}}@keyframes obbobl{50%{transform:translateX(-5px)}}@keyframes obbobr{50%{transform:translateX(5px)}}'
    + '@media (prefers-reduced-motion:reduce){#ob-root .ob-hole,#ob-root .ob-tail,#ob-root .ob-bub{animation:none;transition:none}}'
    + '@media (max-width:640px){#ob-root .ob-text{font-size:13.5px}#ob-root .ob-btn{padding:10px 14px}}';

  function ensureRoot() {
    if (!$('#ob-style')) { var s = document.createElement('style'); s.id = 'ob-style'; s.textContent = CSS; document.head.appendChild(s); }
    var r = document.createElement('div'); r.id = 'ob-root'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'Tour interativo do aplicativo');
    document.body.appendChild(r); return r;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function closeAnyModal() { try { if ($('#modal-overlay.open')) closeModal(); } catch (e) {} }
  function find(step) { try { var e = typeof step.sel === 'function' ? step.sel() : (step.sel ? $(step.sel) : null); return e && e.getClientRects().length ? e : null; } catch (err) { return null; } }

  async function prepare(step) {
    if (!step.modal) closeAnyModal();
    if (step.tab && typeof currentTab !== 'undefined' && currentTab !== step.tab) { closeAnyModal(); try { switchTab(step.tab); } catch (e) {} await wait(260); }
    if (step.modal && !$('#modal-overlay.open')) { try { step.open(); } catch (e) {} await wait(120); }
    if (step.center) return null;
    var el = null;
    for (var n = 0; n < 10 && !el; n++) { el = find(step); if (!el) await wait(80); }
    return el;
  }

  function videoLink(step) {
    if (!step.video) return '';
    var u = ''; try { u = (typeof appConfig !== 'undefined' && appConfig && appConfig.onboardingVideoUrl) || ''; } catch (e) {}
    return /^https:\/\//.test(u) ? '<a class="ob-btn p ob-vid" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">▶ Assistir ao vídeo</a>' : '<div class="ob-text" style="margin-top:8px"><b>Confira a caixa de entrada do seu e-mail de compra.</b></div>';
  }
  function place(step, el, bub, hole, tail) {
    var vw = innerWidth, vh = innerHeight, m = 12, pad = 8, gap = 28;
    var r = el.getBoundingClientRect();
    var hl = Math.max(4, r.left - pad), ht = Math.max(4, r.top - pad);
    var hw = Math.min(vw - 8, r.right + pad) - hl, hh = Math.min(vh - 8, r.bottom + pad) - ht;
    hole.style.cssText = 'left:' + hl + 'px;top:' + ht + 'px;width:' + hw + 'px;height:' + hh + 'px';
    var bw = bub.offsetWidth, bh = bub.offsetHeight;
    var room = { down: vh - (ht + hh) - m, up: ht - m, right: vw - (hl + hw) - m, left: hl - m };
    var fit = { down: room.down >= bh + gap, up: room.up >= bh + gap, right: room.right >= bw + gap, left: room.left >= bw + gap };
    var order = step.side && step.side !== 'auto' ? [step.side] : ['down', 'up', 'right', 'left'];
    var side = null; order.forEach(function (s) { if (!side && fit[s]) side = s; });
    if (!side) ['down', 'up', 'right', 'left'].forEach(function (s) { if (!side && fit[s]) side = s; });
    var cx = hl + hw / 2, cy = ht + hh / 2, left, top;
    bub.style.translate = ''; bub.style.transform = '';
    if (side === 'down' || side === 'up') {
      left = Math.max(m, Math.min(cx - bw / 2, vw - bw - m)); top = side === 'down' ? ht + hh + gap : ht - bh - gap;
      tail.className = 'ob-tail ' + (side === 'down' ? 'up' : 'down'); tail.style.left = Math.max(18, Math.min(cx - left - 12, bw - 42)) + 'px'; tail.style.top = '';
    } else if (side === 'right' || side === 'left') {
      top = Math.max(m, Math.min(cy - bh / 2, vh - bh - m)); left = side === 'right' ? hl + hw + gap : hl - bw - gap;
      tail.className = 'ob-tail ' + (side === 'right' ? 'left' : 'right'); tail.style.top = Math.max(18, Math.min(cy - top - 12, bh - 42)) + 'px'; tail.style.left = '';
    } else {   // sem espaço ao redor (elemento grande): balão ancorado embaixo, sem seta
      left = Math.max(m, (vw - bw) / 2); top = vh - bh - m; tail.className = 'ob-tail'; tail.style.display = 'none';
      if (top < ht + hh && top + bh > ht) { top = ht > bh + m ? ht - bh - m : top; }
    }
    if (side) tail.style.display = '';
    bub.style.left = left + 'px'; bub.style.top = Math.max(m, top) + 'px';
  }

  async function show(i, dir) {
    if (!ST.on || ST.lock) return; ST.lock = true;
    try {
      var guard = 0, step, el;
      while (i >= 0 && i < ST.steps.length) {
        step = ST.steps[i]; el = await prepare(step);
        if (step.center || el) break;
        i += dir; if (++guard > 80) break;
      }
      if (i < 0) i = 0;
      if (i >= ST.steps.length) { ST.lock = false; return finish(true); }
      ST.i = i; step = ST.steps[i]; var root = ST.root, total = ST.steps.length;
      root.innerHTML = '';
      var full = document.createElement('div'); full.className = 'ob-full'; full.style.background = step.center ? 'rgba(8,16,28,.66)' : 'transparent'; root.appendChild(full);
      var hole = document.createElement('div'); hole.className = 'ob-hole'; if (step.center) hole.style.display = 'none'; root.appendChild(hole);
      var bub = document.createElement('div'); bub.className = 'ob-bub' + (step.center ? ' center' : '');
      var pct = Math.round(((i + 1) / total) * 100), first = i === 0, last = i === total - 1;
      bub.innerHTML = '<div class="ob-tail"></div>'
        + '<div class="ob-top"><span class="ob-tag">' + esc(SECS[step.sec] || '') + ' · ' + (i + 1) + '/' + total + '</span><button class="ob-x" data-a="stop" aria-label="Fechar tour" title="Fechar (Esc)">✕</button></div>'
        + '<div class="ob-title">' + esc(step.title) + '</div><div class="ob-text">' + esc(step.text) + '</div>' + videoLink(step)
        + '<div class="ob-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>'
        + '<div class="ob-act"><div class="l">' + (first ? '<button class="ob-btn g" data-a="stop">Pular tour</button>' : '<button class="ob-btn" data-a="back">← Voltar</button><button class="ob-btn g" data-a="skip" title="Ir para a próxima área">Pular área</button>') + '</div>'
        + '<button class="ob-btn p" data-a="next" id="ob-next">' + (last ? 'Concluir ✓' : first ? 'Começar →' : 'Próximo →') + '</button></div>';
      root.appendChild(bub);
      var tail = bub.querySelector('.ob-tail');
      if (!step.center && el) {
        try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' }); } catch (e) {}
        await wait(60); place(step, el, bub, hole, tail);
      } else { tail.style.display = 'none'; }
      ST.el = el; ST.cur = step;
      var nx = $('#ob-next'); if (nx) nx.focus({ preventScroll: true });
    } finally { ST.lock = false; }
  }

  function reflow() { if (ST.on && ST.cur && ST.el && !ST.cur.center) { var b = ST.root.querySelector('.ob-bub'), h = ST.root.querySelector('.ob-hole'), t = ST.root.querySelector('.ob-tail'); if (b && h && t && ST.el.isConnected) place(ST.cur, ST.el, b, h, t); } }
  var rf = 0; function onResize() { cancelAnimationFrame(rf); rf = requestAnimationFrame(reflow); }

  function next() { show(ST.i + 1, 1); }
  function back() { show(ST.i - 1, -1); }
  function skipArea() { var s = ST.steps[ST.i].sec, j = ST.i + 1; while (j < ST.steps.length && ST.steps[j].sec === s) j++; show(Math.min(j, ST.steps.length - 1), 1); }
  function onClick(e) { var b = e.target.closest && e.target.closest('[data-a]'); if (!b || !ST.root || !ST.root.contains(b)) return; var a = b.dataset.a; if (a === 'next') { if (ST.i >= ST.steps.length - 1) finish(true); else next(); } else if (a === 'back') back(); else if (a === 'skip') skipArea(); else if (a === 'stop') finish(false); }
  function onKey(e) {
    if (!ST.on) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.a) return; e.preventDefault(); if (ST.i >= ST.steps.length - 1) finish(true); else next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  }

  function finish(done) {
    if (!ST.on) return; ST.on = false;
    closeAnyModal();
    document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true);
    if (ST.root) { ST.root.removeEventListener('click', onClick); ST.root.remove(); ST.root = null; }
    try { if (typeof gtMarkDone === 'function' && !(typeof DEMO !== 'undefined' && DEMO.on)) gtMarkDone(); } catch (e) {}
    try { switchTab(done ? 'dashboard' : (ST.prevTab || 'dashboard')); } catch (e) {}
    if (done) { try { showToast('Tour concluído ✔', 'success'); } catch (e) {} }
  }

  function start() {
    if (ST.on) return;
    try { closeHelpPanel(); } catch (e) {}
    try { closeWelcome(); } catch (e) {}
    closeAnyModal();
    ST.on = true; ST.i = 0; ST.prevTab = (typeof currentTab !== 'undefined' && currentTab) || 'dashboard'; ST.steps = build(); ST.root = ensureRoot();
    ST.root.addEventListener('click', onClick); document.addEventListener('keydown', onKey, true); window.addEventListener('resize', onResize); window.addEventListener('scroll', onResize, true);
    try { window.scrollTo({ top: 0 }); } catch (e) {}
    show(0, 1);
  }

  root.Onboard = { start: start, stop: function () { finish(false); }, isOn: function () { return ST.on; }, state: function () { return { i: ST.i, total: ST.steps.length, title: ST.cur && ST.cur.title, sec: ST.cur && ST.cur.sec }; }, _build: build };
})(window);
