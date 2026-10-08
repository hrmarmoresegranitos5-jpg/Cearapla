(function(){
  "use strict";

  var LOGO_B64 = null;
  var logoPromise = null;
  var EMPRESA = {
    nome: "Ceará Planejados",
    slogan: "Móveis Planejados",
    endereco: "Av. Joaquim Ribeiro, nº 398, Centro, Pilão Arcado - BA",
    telefone: "(74) 99963-3270",
    cnpj: "" // preencha aqui o CNPJ (ex: "00.000.000/0001-00"); se ficar vazio, não aparece no comprovante
  };

  var LS_KEY  = "cp_orcamentos_v1";
  var REC_KEY = "cp_comprovantes_v1";
  var MOD_KEY = "cp_modelos_v1";
  var BK_KEY  = "cp_backup_ultimo";
  var REC_OBS_PADRAO = "A ser pago na entrega e instalação do serviço";
  var MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  var itemSeq = 0, ultimoOrc = null, editando = null;
  var orcFeito = false, recFeito = false, orcStep = 1, recStep = 1;
  var screen = 'home', histTab = 'orc', recAntTocado = false;
  var lastOrcFile = null, lastOrcTel = '', lastOrcMsg = '';
  var lastRecFile = null, lastRecTel = '', lastRecMsg = '';
  var clientesTel = {};

  function $(id){ return document.getElementById(id); }
  function pad4(n){ return String(n).padStart(4,'0'); }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fmtBRL(v){
    return "R$ " + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  // aceita "13400", "13.400", "13.400,50", "13400,5"
  function parseNum(str){
    if(!str) return 0;
    var s = String(str).replace(/[^\d,.]/g,'');
    if(!s) return 0;
    if(s.indexOf(',') >= 0){ s = s.replace(/\./g,'').replace(',','.'); }
    else if(/^\d{1,3}(\.\d{3})+$/.test(s)){ s = s.replace(/\./g,''); }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
  function numParaCampo(v){ return (Math.round(v*100)/100).toFixed(2).replace('.',','); }
  function todayISO(){
    var d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function todayBR(){
    var d = new Date();
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  }
  function isoParaBR(iso){
    var p = String(iso||'').split('-');
    return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso;
  }
  function isoPorExtenso(iso){
    var p = String(iso||'').split('-');
    if(p.length!==3) return iso;
    return p[2]+' de '+MESES[parseInt(p[1],10)-1]+' de '+p[0];
  }
  function slug(s){
    return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  }
  function primeiraLinha(s){
    var l = String(s||'').split('\n')[0].trim();
    return l.length > 60 ? l.slice(0,60).trim() + '...' : l;
  }

  var toastT = null;
  function toast(msg, warn){
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (warn ? ' warn' : '');
    clearTimeout(toastT);
    toastT = setTimeout(function(){ t.className = 'toast'; }, warn ? 4500 : 3200);
  }
  function aviso(msg, el){ toast(msg, true); if(el){ try{ el.focus(); }catch(e){} } }

  // janela de pergunta com botões grandes
  function modal(o){
    return new Promise(function(resolve){
      $('mTitulo').textContent = o.titulo || '';
      $('mTexto').textContent = o.texto || '';
      var inp = $('mInput');
      inp.hidden = !o.input;
      inp.value = o.valor || '';
      var box = $('mBtns');
      box.innerHTML = '';
      o.buttons.forEach(function(b){
        var bt = document.createElement('button');
        bt.type = 'button';
        bt.className = 'big ' + (b.kind || '');
        bt.textContent = b.label;
        bt.addEventListener('click', function(){
          $('modal').hidden = true;
          resolve(o.input ? {v:b.value, texto:inp.value} : b.value);
        });
        box.appendChild(bt);
      });
      $('modal').hidden = false;
      if(o.input) setTimeout(function(){ inp.focus(); }, 50);
    });
  }
  function confirmar(titulo, texto, okLabel, perigo){
    return modal({titulo:titulo, texto:texto, buttons:[
      {label:okLabel, value:true, kind: perigo ? 'danger' : 'primary'},
      {label:'Não, voltar', value:false}
    ]});
  }

  // ---------- armazenamento ----------
  function lerLS(k){ try{ return JSON.parse(localStorage.getItem(k)) || []; }catch(e){ return []; } }
  function getHistorico(){ return lerLS(LS_KEY); }
  function saveHistorico(l){ localStorage.setItem(LS_KEY, JSON.stringify(l)); }
  function getRecs(){ return lerLS(REC_KEY); }
  function saveRecs(l){ localStorage.setItem(REC_KEY, JSON.stringify(l)); }
  function getModelos(){ return lerLS(MOD_KEY); }
  function saveModelos(l){ localStorage.setItem(MOD_KEY, JSON.stringify(l)); }
  function nextNumero(list){
    return list.length ? Math.max.apply(null, list.map(function(o){ return o.numero||0; })) + 1 : 1;
  }

  // mostra "= R$ 13.400,00" embaixo dos campos de valor
  function refreshPreviews(){
    Array.prototype.forEach.call(document.querySelectorAll('.money'), function(i){
      var p = i.nextSibling;
      if(p && p.className === 'preview'){
        var v = parseNum(i.value);
        p.textContent = v ? '= ' + fmtBRL(v) : '';
      }
    });
  }
  function bindMoney(inp){
    var p = document.createElement('div');
    p.className = 'preview';
    inp.parentNode.insertBefore(p, inp.nextSibling);
    inp.addEventListener('input', refreshPreviews);
  }


  // =====================================================================
  // NAVEGAÇÃO
  // =====================================================================
  var TITULOS = {home:'Ceará Planejados', orc:'Fazer orçamento', rec:'Fazer comprovante', hist:'O que já fiz', abertos:'Quanto falta receber', mais:'Mais opções'};
  var TELAS = ['home','orc','rec','hist','abertos','mais'];

  function show(name, noPush){
    screen = name;
    TELAS.forEach(function(s){ $('scr-'+s).hidden = (s !== name); });
    $('btnBack').hidden = (name === 'home');
    $('topTitle').textContent = TITULOS[name];
    if(name === 'home') renderHome();
    if(name === 'hist') renderHist();
    if(name === 'abertos') renderAbertos();
    if(name === 'mais') renderModelosLista();
    updateBar();
    window.scrollTo(0,0);
    if(!noPush){ try{ history.pushState({s:name}, ''); }catch(e){} }
  }
  window.addEventListener('popstate', function(e){
    show((e.state && e.state.s) || 'home', true);
  });
  function updateBar(){
    var mostrar = false;
    if(screen === 'orc' && orcStep <= 4){
      mostrar = true;
      $('btnPrev').textContent = orcStep === 1 ? '‹ Início' : '‹ Voltar';
      $('btnNext').textContent = orcStep === 4 ? '✔ Gerar PDF' : 'Continuar ›';
    } else if(screen === 'rec' && recStep <= 3){
      mostrar = true;
      $('btnPrev').textContent = recStep === 1 ? '‹ Início' : '‹ Voltar';
      $('btnNext').textContent = recStep === 3 ? '✔ Gerar comprovante' : 'Continuar ›';
    }
    $('bar').hidden = !mostrar;
    document.body.classList.toggle('has-bar', mostrar);
  }

  // =====================================================================
  // ORÇAMENTO (passo a passo)
  // =====================================================================
  var ORC_TIT = ['', 'Quem é o cliente?', 'O que vai no orçamento?', 'Valores e prazos', 'Confira e gere o PDF', 'Orçamento pronto!'];

  function goOrc(n){
    orcStep = n;
    for(var i=1;i<=5;i++) $('orcStep'+i).hidden = (i !== n);
    $('orcPasso').textContent = n <= 4 ? 'Passo ' + n + ' de 4' : '';
    $('orcProgBar').style.width = (n >= 5 ? 100 : n*25) + '%';
    $('orcTitulo').textContent = ORC_TIT[n];
    if(n === 3) calcTotals();
    if(n === 4) renderResumoOrc();
    updateBar();
    window.scrollTo(0,0);
  }

  function addItem(desc, valor){
    itemSeq++;
    var wrap = $('itensWrap');
    var div = document.createElement('div');
    div.className = 'card item';
    div.innerHTML =
      '<div class="item-top"><b class="item-num">Item '+(wrap.children.length+1)+'</b>'+
      '<button type="button" class="link danger rm">✖ Tirar este item</button></div>'+
      '<label>O que é? Descreva o móvel</label>'+
      '<textarea class="it-desc" placeholder="Ex: Guarda-roupa 6 portas, MDF branco, com espelho na porta do meio..."></textarea>'+
      '<label>Valor (R$)</label>'+
      '<input type="text" class="it-valor money" inputmode="decimal" placeholder="Ex: 3500">'+
      '<button type="button" class="link it-save">💾 Guardar este item para usar de novo</button>';
    wrap.appendChild(div);
    div.querySelector('.it-desc').value = desc || '';
    div.querySelector('.it-valor').value = valor ? numParaCampo(valor) : '';
    bindMoney(div.querySelector('.it-valor'));
    div.querySelector('.rm').addEventListener('click', function(){
      if(wrap.children.length === 1){
        div.querySelector('.it-desc').value = '';
        div.querySelector('.it-valor').value = '';
      } else { div.remove(); renumberItems(); }
      calcTotals();
    });
    div.querySelector('.it-save').addEventListener('click', function(){ salvarModelo(div); });
    div.querySelector('.it-valor').addEventListener('input', calcTotals);
    calcTotals();
  }
  function renumberItems(){
    Array.prototype.forEach.call($('itensWrap').children, function(div, i){
      div.querySelector('.item-num').textContent = 'Item ' + (i+1);
    });
  }
  function getItens(){
    var out = [];
    Array.prototype.forEach.call($('itensWrap').children, function(div){
      var desc = div.querySelector('.it-desc').value.trim();
      var valor = parseNum(div.querySelector('.it-valor').value);
      if(desc || valor) out.push({desc:desc, valor:valor});
    });
    return out;
  }
  function calcTotals(){
    var bruto = getItens().reduce(function(s,i){ return s + i.valor; }, 0);
    var pct = parseFloat($('descontoPct').value) || 0;
    var desc = bruto * (pct/100);
    var liquido = bruto - desc;
    $('totBruto').textContent = fmtBRL(bruto);
    $('totDesc').textContent = '- ' + fmtBRL(desc);
    $('totLiquido').textContent = fmtBRL(liquido);
    refreshPreviews();
    return {bruto:bruto, desc:desc, liquido:liquido, pct:pct};
  }
  $('btnAddItem').addEventListener('click', function(){
    addItem();
    var itens = $('itensWrap').children;
    itens[itens.length-1].querySelector('.it-desc').focus();
  });
  $('descontoPct').addEventListener('input', calcTotals);

  function novoOrc(){
    ['cliNome','cliTel','condPagto','condPrazo','condGarantia'].forEach(function(id){ $(id).value = ''; });
    $('validade').value = 7;
    $('descontoPct').value = 10;
    $('itensWrap').innerHTML = '';
    editando = null; orcFeito = false;
    $('orcAviso').hidden = true;
    addItem();
    goOrc(1);
  }
  function hasDraftOrc(){
    return !orcFeito && ($('cliNome').value.trim() || getItens().length > 0);
  }
  function iniciarOrc(){
    if(!hasDraftOrc()){ novoOrc(); show('orc'); return; }
    modal({titulo:'Você já começou um orçamento', texto:'O que deseja fazer?', buttons:[
      {label:'▶ Continuar de onde parei', value:'c', kind:'primary'},
      {label:'🆕 Começar um novo do zero', value:'n'}
    ]}).then(function(v){
      if(v === 'c') show('orc');
      else { novoOrc(); show('orc'); }
    });
  }
  function carregarOrc(o, dup){
    novoOrc();
    $('cliNome').value = dup ? '' : (o.cliente || '');
    $('cliTel').value = dup ? '' : (o.telefone || '');
    $('validade').value = o.validadeDias || 7;
    $('descontoPct').value = (o.pct != null ? o.pct : 10);
    $('condPagto').value = o.pagto || '';
    $('condPrazo').value = o.prazo || '';
    $('condGarantia').value = o.garantia || '';
    $('itensWrap').innerHTML = '';
    (o.itens || []).forEach(function(i){ addItem(i.desc, i.valor); });
    if(!(o.itens || []).length) addItem();
    editando = dup ? null : o.numero;
    var av = $('orcAviso');
    av.textContent = dup
      ? 'Cópia do orçamento nº ' + pad4(o.numero) + '. Escreva o nome do novo cliente.'
      : 'Você está corrigindo o orçamento nº ' + pad4(o.numero) + '. Ao gerar o PDF, ele será atualizado (o número continua o mesmo).';
    av.hidden = false;
    calcTotals();
    show('orc');
    goOrc(1);
  }
  function editarOrc(o, dup){
    if(!hasDraftOrc()){ carregarOrc(o, dup); return; }
    confirmar('Descartar o orçamento em andamento?', 'Você tem um orçamento começado. Se continuar, ele será apagado.', 'Sim, descartar e abrir', true)
      .then(function(ok){ if(ok) carregarOrc(o, dup); });
  }

  function orcPrev(){
    if(orcStep === 1) show('home'); else goOrc(orcStep - 1);
  }
  function orcNext(){
    if(orcStep === 1){
      if(!$('cliNome').value.trim()){ aviso('Escreva o nome do cliente para continuar.', $('cliNome')); return; }
      goOrc(2);
    } else if(orcStep === 2){
      var itens = getItens();
      if(!itens.length){ aviso('Descreva o móvel e coloque o valor para continuar.'); return; }
      for(var i=0;i<itens.length;i++){
        if(!itens[i].desc){ aviso('O item ' + (i+1) + ' está sem descrição.'); return; }
        if(!itens[i].valor){ aviso('O item ' + (i+1) + ' está sem valor.'); return; }
      }
      goOrc(3);
    } else if(orcStep === 3){
      goOrc(4);
    } else if(orcStep === 4){
      gerarPDF();
    }
  }

  function renderResumoOrc(){
    var itens = getItens(), t = calcTotals();
    var tel = $('cliTel').value.trim();
    var h = '<div class="sum-row"><span>Cliente</span><b>' + esc($('cliNome').value.trim()) + '</b></div>';
    if(tel) h += '<div class="sum-row"><span>Telefone</span><b>' + esc(tel) + '</b></div>';
    itens.forEach(function(i, k){
      h += '<div class="sum-item"><span>' + (k+1) + '. ' + esc(primeiraLinha(i.desc) || 'Item') + '</span><b>' + fmtBRL(i.valor) + '</b></div>';
    });
    h += '<div class="sum-row"><span>Valor total</span><b>' + fmtBRL(t.bruto) + '</b></div>';
    h += '<div class="sum-row"><span>Desconto à vista (' + t.pct + '%)</span><b>- ' + fmtBRL(t.desc) + '</b></div>';
    [['Pagamento', $('condPagto').value], ['Prazo de entrega', $('condPrazo').value], ['Garantia', $('condGarantia').value]].forEach(function(p){
      if(p[1].trim()) h += '<div class="sum-row"><span>' + p[0] + '</span><b>' + esc(p[1].trim()) + '</b></div>';
    });
    h += '<div class="sum-row"><span>Validade</span><b>' + (parseInt($('validade').value) || 7) + ' dias</b></div>';
    h += '<div class="sum-total"><span>Total à vista</span><span>' + fmtBRL(t.liquido) + '</span></div>';
    $('resumoOrc').innerHTML = h;
  }

  function salvarModelo(div){
    var desc = div.querySelector('.it-desc').value.trim();
    var valor = parseNum(div.querySelector('.it-valor').value);
    if(!desc){ aviso('Descreva o móvel primeiro.'); return; }
    modal({titulo:'Guardar este item', texto:'Dê um nome para encontrar depois.', input:true, valor: primeiraLinha(desc).slice(0,40), buttons:[
      {label:'💾 Guardar', value:'ok', kind:'primary'},
      {label:'Cancelar', value:'x'}
    ]}).then(function(r){
      if(r.v !== 'ok' || !r.texto.trim()) return;
      var l = getModelos();
      l.push({nome:r.texto.trim(), desc:desc, valor:valor});
      saveModelos(l); renderModelos();
      toast('Item guardado! Use em "Usar um item que você já guardou".');
    });
  }
  function renderModelos(){
    var l = getModelos(), sel = $('modeloSel');
    $('modeloBox').hidden = !l.length;
    sel.innerHTML = '<option value="">Escolha um item guardado...</option>';
    l.forEach(function(m, i){
      var op = document.createElement('option');
      op.value = i;
      op.textContent = m.nome + (m.valor ? ' - ' + fmtBRL(m.valor) : '');
      sel.appendChild(op);
    });
  }
  $('btnModeloUsar').addEventListener('click', function(){
    var i = $('modeloSel').value;
    var m = i === '' ? null : getModelos()[i];
    if(!m){ aviso('Escolha um item da lista primeiro.'); return; }
    if(!getItens().length) $('itensWrap').innerHTML = '';
    addItem(m.desc, m.valor);
    $('modeloSel').value = '';
    toast('Item colocado na lista.');
  });
  function renderModelosLista(){
    var l = getModelos(), wrap = $('modelosLista');
    if(!l.length){
      wrap.innerHTML = '<div class="empty">Você ainda não guardou nenhum item. Ao fazer um orçamento, toque em "Guardar este item para usar de novo".</div>';
      return;
    }
    wrap.innerHTML = '';
    l.forEach(function(m, i){
      var row = document.createElement('div');
      row.className = 'sum-row';
      row.innerHTML = '<span><b style="color:var(--ink)">' + esc(m.nome) + '</b><br>' + (m.valor ? fmtBRL(m.valor) : '') + '</span>' +
        '<button type="button" class="link danger">🗑️ Apagar</button>';
      row.querySelector('button').addEventListener('click', function(){
        confirmar('Apagar este item guardado?', m.nome, 'Sim, apagar', true).then(function(ok){
          if(!ok) return;
          var l2 = getModelos(); l2.splice(i, 1); saveModelos(l2);
          renderModelos(); renderModelosLista();
          toast('Item apagado.');
        });
      });
      wrap.appendChild(row);
    });
  }

  // ---------- gerar PDF do orçamento ----------
  // ---------- MONTAR PDF (jsPDF) ----------
  function montarDoc(numero, cliente, telefone, validadeDias, itens, t, extras){
    extras = extras || {};
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({unit:'mm', format:'a4'});
    var pageW = 210, marginX = 16;
    var y = 16;
    var goldRGB = [180,140,60];
    var darkRGB = [30,32,36];
    var mutedRGB = [110,116,124];

    if(LOGO_B64){
      try{ doc.addImage('data:image/png;base64,'+LOGO_B64, 'PNG', marginX, y-2, 22, 22); }catch(e){}
    }
    doc.setFont('helvetica','bold');
    doc.setFontSize(18);
    doc.setTextColor(darkRGB[0],darkRGB[1],darkRGB[2]);
    doc.text(EMPRESA.nome, marginX+26, y+6);
    doc.setFont('helvetica','normal');
    doc.setFontSize(11);
    doc.setTextColor(mutedRGB[0],mutedRGB[1],mutedRGB[2]);
    doc.text(EMPRESA.slogan, marginX+26, y+12);
    doc.text(EMPRESA.endereco, marginX+26, y+17.5);
    doc.text('Tel/WhatsApp: ' + EMPRESA.telefone, marginX+26, y+22.5);

    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.setTextColor(goldRGB[0],goldRGB[1],goldRGB[2]);
    doc.text('ORÇAMENTO Nº ' + String(numero).padStart(4,'0'), pageW-marginX, y+6, {align:'right'});
    doc.setFont('helvetica','normal');
    doc.setFontSize(11);
    doc.setTextColor(mutedRGB[0],mutedRGB[1],mutedRGB[2]);
    doc.text('Data: ' + (extras.dataBR || todayBR()), pageW-marginX, y+12, {align:'right'});
    doc.text('Válido por ' + validadeDias + ' dias', pageW-marginX, y+17.5, {align:'right'});

    y += 30;
    doc.setDrawColor(goldRGB[0],goldRGB[1],goldRGB[2]);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, pageW-marginX, y);
    y += 8;

    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.setTextColor(darkRGB[0],darkRGB[1],darkRGB[2]);
    doc.text('Cliente', marginX, y);
    y += 6.5;
    doc.setFont('helvetica','normal');
    doc.setFontSize(12);
    doc.text(cliente, marginX, y);
    if(telefone){
      doc.setTextColor(mutedRGB[0],mutedRGB[1],mutedRGB[2]);
      doc.setFontSize(11.5);
      doc.text(telefone, marginX, y+6);
      y += 6;
    }
    y += 10;

    doc.setFont('helvetica','bold');
    doc.setFontSize(12);
    doc.setTextColor(darkRGB[0],darkRGB[1],darkRGB[2]);
    doc.text('Itens do orçamento', marginX, y);
    y += 4;
    doc.setDrawColor(225,225,225);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageW-marginX, y);
    y += 6;

    var colDescW = 132;

    itens.forEach(function(item, idx){
      var descLines = doc.splitTextToSize(item.desc || '(sem descrição)', colDescW);
      var lineH = 5.6;

      // garante espaço para pelo menos o cabeçalho do item (número + valor) antes de começar
      if(y + lineH + 4 > 275){
        doc.addPage();
        y = 18;
      }

      doc.setFont('helvetica','bold');
      doc.setFontSize(11.5);
      doc.setTextColor(goldRGB[0],goldRGB[1],goldRGB[2]);
      doc.text(String(idx+1)+'.', marginX, y);

      doc.setFont('helvetica','bold');
      doc.setTextColor(darkRGB[0],darkRGB[1],darkRGB[2]);
      doc.text(fmtBRL(item.valor), pageW-marginX, y, {align:'right'});

      doc.setFont('helvetica','normal');
      doc.setTextColor(darkRGB[0],darkRGB[1],darkRGB[2]);
      doc.setFontSize(11.5);

      // desenha a descrição linha a linha, quebrando a página apenas quando necessário
      descLines.forEach(function(line){
        if(y + lineH > 275){
          doc.addPage();
          y = 18;
        }
        doc.text(line, marginX+6, y);
        y += lineH;
      });

      y += 4;
      doc.setDrawColor(240,240,240);
      doc.setLineWidth(0.2);
      doc.line(marginX, y-3, pageW-marginX, y-3);
    });

    y += 4;
    if(y > 250){ doc.addPage(); y = 18; }

    doc.setDrawColor(goldRGB[0],goldRGB[1],goldRGB[2]);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, pageW-marginX, y);
    y += 8;

    doc.setFont('helvetica','normal');
    doc.setFontSize(12);
    doc.setTextColor(mutedRGB[0],mutedRGB[1],mutedRGB[2]);
    doc.text('Total (parcelado)', marginX, y);
    doc.text(fmtBRL(t.bruto), pageW-marginX, y, {align:'right'});
    y += 6.5;

    doc.text('Desconto à vista (' + t.pct + '%)', marginX, y);
    doc.text('- ' + fmtBRL(t.desc), pageW-marginX, y, {align:'right'});
    y += 8;

    doc.setFillColor(250,244,228);
    doc.rect(marginX-2, y-6, (pageW-marginX*2)+4, 12, 'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(15);
    doc.setTextColor(goldRGB[0],goldRGB[1],goldRGB[2]);
    doc.text('TOTAL À VISTA', marginX, y+2);
    doc.text(fmtBRL(t.liquido), pageW-marginX, y+2, {align:'right'});
    y += 14;
    [['Condições de pagamento', extras.pagto], ['Prazo de entrega', extras.prazo], ['Garantia', extras.garantia]].forEach(function(p){
      if(!p[1]) return;
      doc.setFont('helvetica','normal'); doc.setFontSize(11.5);
      var ls = doc.splitTextToSize(p[1], pageW - marginX*2 - 50);
      if(y + ls.length*5.6 > 270){ doc.addPage(); y = 18; }
      doc.setFont('helvetica','bold'); doc.setTextColor(darkRGB[0],darkRGB[1],darkRGB[2]);
      doc.text(p[0] + ':', marginX, y);
      doc.setFont('helvetica','normal');
      ls.forEach(function(l, i){ doc.text(l, marginX + 50, y + i*5.6); });
      y += ls.length*5.6 + 2;
    });
    y += 4;
    if(y > 275){ doc.addPage(); y = 18; }

    doc.setFont('helvetica','italic');
    doc.setFontSize(10.5);
    doc.setTextColor(mutedRGB[0],mutedRGB[1],mutedRGB[2]);
    doc.text('Orçamento válido por ' + validadeDias + ' dias a partir da data de emissão. Valores sujeitos a alteração após esse prazo.', marginX, y, {maxWidth: pageW-marginX*2});

    doc.setFont('helvetica','normal');
    doc.setFontSize(10);
    doc.setTextColor(160,160,160);
    doc.text(EMPRESA.nome + ' · ' + EMPRESA.endereco + ' · ' + EMPRESA.telefone, pageW/2, 290, {align:'center'});

    return doc;
  }

  function gerarPDF(){
    var cliente = $('cliNome').value.trim();
    var telefone = $('cliTel').value.trim();
    var validadeDias = parseInt($('validade').value) || 7;
    var itens = getItens();
    if(!cliente){ goOrc(1); aviso('Escreva o nome do cliente.', $('cliNome')); return; }
    if(!itens.length){ goOrc(2); aviso('Coloque ao menos um item.'); return; }

    var t = calcTotals();
    var list = getHistorico();
    var idx = -1;
    if(editando != null){
      for(var i=0;i<list.length;i++){ if(list[i].numero === editando){ idx = i; break; } }
    }
    var numero = idx >= 0 ? editando : nextNumero(list);
    var rec = {
      numero: numero,
      cliente: cliente,
      telefone: telefone,
      validadeDias: validadeDias,
      pct: t.pct,
      bruto: t.bruto,
      desc: t.desc,
      liquido: t.liquido,
      itens: itens,
      pagto: $('condPagto').value.trim(),
      prazo: $('condPrazo').value.trim(),
      garantia: $('condGarantia').value.trim(),
      dataISO: idx >= 0 ? list[idx].dataISO : todayISO(),
      dataBR: idx >= 0 ? list[idx].dataBR : todayBR()
    };
    if(idx >= 0) list[idx] = rec; else list.push(rec);
    saveHistorico(list);
    editando = null;
    orcFeito = true;
    entregarOrc(rec).then(function(){
      toast('Pronto! Orçamento nº ' + pad4(numero) + ' gerado.');
    });
  }

  // gera o arquivo, baixa e mostra a tela "pronto"
  function entregarOrc(o){
    return Promise.resolve(logoPromise).then(function(){
      var doc = montarDoc(o.numero, o.cliente, o.telefone || '', o.validadeDias || 7, o.itens || [],
        {bruto:o.bruto, desc:o.desc, liquido:o.liquido, pct:o.pct},
        {pagto:o.pagto, prazo:o.prazo, garantia:o.garantia, dataBR:o.dataBR});
      var fname = 'orcamento-' + pad4(o.numero) + '-' + slug(o.cliente) + '.pdf';
      var blob = doc.output('blob');
      var url = URL.createObjectURL(blob);
      try{ lastOrcFile = new File([blob], fname, {type:'application/pdf'}); }catch(e){ lastOrcFile = null; }
      lastOrcTel = o.telefone || '';
      lastOrcMsg = 'Olá, ' + String(o.cliente).split(' ')[0] + '! Segue o orçamento nº ' + pad4(o.numero) + ' da ' + EMPRESA.nome + '.';
      ultimoOrc = o;
      try{
        var a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }catch(e){}
      $('pdfLink').href = url;
      $('pdfLink').setAttribute('download', fname);
      $('orcDoneTxt').textContent = 'Orçamento nº ' + pad4(o.numero) + ' de ' + o.cliente + ' pronto!';
      show('orc');
      goOrc(5);
    });
  }

  // =====================================================================
  // COMPROVANTE (passo a passo)
  // =====================================================================
  var REC_TIT = ['', 'Quem pagou?', 'Quanto foi pago?', 'Confira e gere o comprovante', 'Comprovante pronto!'];

  function goRec(n){
    recStep = n;
    for(var i=1;i<=4;i++) $('recStep'+i).hidden = (i !== n);
    $('recPasso').textContent = n <= 3 ? 'Passo ' + n + ' de 3' : '';
    $('recProgBar').style.width = (n >= 4 ? 100 : Math.round(n*100/3)) + '%';
    $('recTitulo').textContent = REC_TIT[n];
    if(n === 2) recCalc();
    if(n === 3) renderResumoRec();
    updateBar();
    window.scrollTo(0,0);
  }

  function recCalc(){
    var total = parseNum($('recTotal').value);
    var valor = parseNum($('recValor').value);
    var ant   = parseNum($('recAnterior').value);
    var pago  = ant + valor;
    var saldo = total - pago;
    $('recTotTotal').textContent = fmtBRL(total);
    $('recTotPago').textContent  = fmtBRL(pago);
    $('recTotSaldo').textContent = fmtBRL(saldo > 0 ? saldo : 0);
    $('recTotSaldo').classList.toggle('quitado', total > 0 && Math.abs(saldo) <= 0.004);
    refreshPreviews();
    return {total:total, valor:valor, ant:ant, pago:pago, saldo:saldo};
  }
  ['recTotal','recValor','recAnterior'].forEach(function(id){ $(id).addEventListener('input', recCalc); });
  $('recAnterior').addEventListener('input', function(){ recAntTocado = true; });

  function pagoAntesDoOrc(orc){
    orc = String(orc||'').replace(/\D/g,'').replace(/^0+/,'');
    if(!orc) return 0;
    return getRecs().reduce(function(s,r){
      var o = String(r.orc||'').replace(/\D/g,'').replace(/^0+/,'');
      return o === orc ? s + (r.valor||0) : s;
    }, 0);
  }
  $('recOrc').addEventListener('input', function(){
    if(recAntTocado) return;
    var p = pagoAntesDoOrc($('recOrc').value);
    $('recAnterior').value = p > 0 ? numParaCampo(p) : '';
    recCalc();
  });

  function novoRec(){
    ['recCliente','recServico','recOrc','recTotal','recValor','recAnterior'].forEach(function(id){ $(id).value = ''; });
    $('recTipo').selectedIndex = 0;
    $('recForma').selectedIndex = 0;
    $('recData').value = todayISO();
    $('recObs').value = REC_OBS_PADRAO;
    $('recOrigem').hidden = true;
    recAntTocado = false; recFeito = false;
    recCalc();
    goRec(1);
  }
  function hasDraftRec(){
    return !recFeito && ($('recCliente').value.trim() || $('recTotal').value.trim() || $('recValor').value.trim());
  }
  function iniciarRec(){
    if(!hasDraftRec()){ novoRec(); show('rec'); return; }
    modal({titulo:'Você já começou um comprovante', texto:'O que deseja fazer?', buttons:[
      {label:'▶ Continuar de onde parei', value:'c', kind:'primary'},
      {label:'🆕 Começar um novo do zero', value:'n'}
    ]}).then(function(v){
      if(v === 'c') show('rec');
      else { novoRec(); show('rec'); }
    });
  }
  function descartarRecSe(fn){
    if(!hasDraftRec()){ fn(); return; }
    confirmar('Descartar o comprovante em andamento?', 'Você tem um comprovante começado. Se continuar, ele será apagado.', 'Sim, descartar e abrir', true)
      .then(function(ok){ if(ok) fn(); });
  }

  function servicoDoOrcamento(o){
    var it = (o.itens||[])[0];
    var linha = it && it.desc ? it.desc.split('\n')[0].trim() : '';
    if(!linha) return '';
    if(linha === linha.toUpperCase()) linha = linha.charAt(0) + linha.slice(1).toLowerCase();
    return linha.length > 40 ? linha.slice(0,40).trim() : linha;
  }
  function abrirRecDoOrcamento(o){
    descartarRecSe(function(){
      novoRec();
      var numero = pad4(o.numero);
      var ant = pagoAntesDoOrc(numero);
      $('recCliente').value = o.cliente || '';
      $('recServico').value = servicoDoOrcamento(o);
      $('recOrc').value = numero;
      $('recTotal').value = numParaCampo(o.liquido || 0);
      if(ant > 0){ $('recAnterior').value = numParaCampo(ant); $('recTipo').value = 'Parcela'; }
      $('recOrigem').textContent = 'Os dados vieram do orçamento nº ' + numero + '. O total é o valor à vista (' + fmtBRL(o.liquido||0) + '). Se vocês fecharam outro valor, corrija o total.';
      $('recOrigem').hidden = false;
      recCalc();
      show('rec');
      goRec(2);
      $('recValor').focus();
    });
  }
  function abrirRecDoSaldo(r){
    descartarRecSe(function(){
      novoRec();
      $('recCliente').value = r.cliente;
      $('recServico').value = r.servico;
      $('recOrc').value = r.orc || '';
      $('recTotal').value = numParaCampo(r.total);
      $('recAnterior').value = numParaCampo(r.total - r.saldo);
      $('recTipo').value = 'Parcela';
      $('recOrigem').textContent = 'Novo pagamento de ' + r.cliente + '. Falta receber ' + fmtBRL(r.saldo) + '.';
      $('recOrigem').hidden = false;
      recCalc();
      show('rec');
      goRec(2);
      $('recValor').focus();
    });
  }

  function recPrev(){
    if(recStep === 1) show('home'); else goRec(recStep - 1);
  }
  function validarRecPasso1(){
    if(!$('recCliente').value.trim()){ goRec(1); aviso('Escreva o nome do cliente.', $('recCliente')); return false; }
    if(!$('recServico').value.trim()){ goRec(1); aviso('Escreva qual foi o serviço.', $('recServico')); return false; }
    return true;
  }
  function validarRecPasso2(){
    var c = recCalc();
    if(c.total <= 0){ goRec(2); aviso('Coloque o valor total do serviço.', $('recTotal')); return false; }
    if(c.valor <= 0){ goRec(2); aviso('Coloque quanto o cliente está pagando agora.', $('recValor')); return false; }
    if(c.pago > c.total + 0.004){ goRec(2); aviso('O valor pago passa do total do serviço. Confira os valores.', $('recValor')); return false; }
    return true;
  }
  function recNext(){
    if(recStep === 1){ if(validarRecPasso1()) goRec(2); }
    else if(recStep === 2){ if(validarRecPasso2()) goRec(3); }
    else if(recStep === 3){ gerarComprovante(); }
  }

  function renderResumoRec(){
    var c = recCalc();
    var h = '<div class="sum-row"><span>Cliente</span><b>' + esc($('recCliente').value.trim()) + '</b></div>' +
      '<div class="sum-row"><span>Serviço</span><b>' + esc($('recServico').value.trim()) + '</b></div>' +
      '<div class="sum-row"><span>Como pagou</span><b>' + esc($('recForma').value) + '</b></div>' +
      '<div class="sum-row"><span>Data</span><b>' + esc(isoParaBR($('recData').value || todayISO())) + '</b></div>';
    if(c.ant > 0.004) h += '<div class="sum-row"><span>Já pago antes</span><b>' + fmtBRL(c.ant) + '</b></div>';
    h += '<div class="sum-row"><span>Total do serviço</span><b>' + fmtBRL(c.total) + '</b></div>';
    h += '<div class="sum-row"><span>' + (c.saldo <= 0.004 ? 'Situação' : 'Falta pagar') + '</span><b>' + (c.saldo <= 0.004 ? 'Quitado ✔' : fmtBRL(c.saldo)) + '</b></div>';
    h += '<div class="sum-total"><span>Pago agora</span><span>' + fmtBRL(c.valor) + '</span></div>';
    $('resumoRec').innerHTML = h;
  }

  function gerarComprovante(){
    if(!validarRecPasso1() || !validarRecPasso2()) return;
    var c = recCalc();
    var list = getRecs();
    var orc = $('recOrc').value.replace(/\D/g,'');
    var r = {
      numero: nextNumero(list),
      cliente: $('recCliente').value.trim(),
      servico: $('recServico').value.trim(),
      orc: orc ? pad4(orc) : '',
      tipo: $('recTipo').value,
      forma: $('recForma').value,
      dataISO: $('recData').value || todayISO(),
      total: c.total,
      valor: c.valor,
      anterior: c.ant,
      saldo: Math.max(c.saldo, 0),
      obs: $('recObs').value.trim()
    };
    list.push(r);
    saveRecs(list);
    recFeito = true;
    entregarRec(r).then(function(){
      toast('Pronto! Comprovante REC-' + pad4(r.numero) + ' gerado.');
    });
  }

  function entregarRec(r){
    return Promise.resolve(logoPromise).then(function(){
      var doc = montarComprovante(r);
      var fname = 'comprovante-' + pad4(r.numero) + '-' + slug(r.cliente) + '.pdf';
      var blob = doc.output('blob');
      var url = URL.createObjectURL(blob);
      try{ lastRecFile = new File([blob], fname, {type:'application/pdf'}); }catch(e){ lastRecFile = null; }
      atualizarClientes();
      lastRecTel = clientesTel[r.cliente] || '';
      lastRecMsg = 'Olá! Segue o comprovante de pagamento REC-' + pad4(r.numero) + ' (' + fmtBRL(r.valor) + ') referente a ' + r.servico + ' - ' + EMPRESA.nome + '.';
      try{
        var a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }catch(e){}
      $('recPdfLink').href = url;
      $('recPdfLink').setAttribute('download', fname);
      $('recDoneTxt').textContent = 'Comprovante REC-' + pad4(r.numero) + ' de ' + r.cliente + ' pronto!';
      show('rec');
      goRec(4);
    });
  }
  function pdfTxt(s){ return String(s).replace(/\u2014|\u2013/g,'-'); }

  function montarComprovante(r){
    var jsPDF = window.jspdf.jsPDF;
    var temAnt = r.anterior > 0.004;
    var extra = temAnt ? 42 : 0;              // altura de uma linha extra na tabela (em "px" do layout)
    var k = 182/723;                          // escala do layout (px) para mm
    var CT = 42, CB = 800 + extra;            // topo e base do cartão no layout
    var ox = 14 - 102*k, oy = 14 - CT*k;
    var pageH = 14 + (CB-CT)*k + 14;
    var doc = new jsPDF({unit:'mm', format:[210, pageH]});

    function X(px){ return ox + px*k; }
    function Yy(px){ return oy + px*k; }
    function S(px){ return px*k; }
    function rgb(hex){ return [parseInt(hex.substr(1,2),16), parseInt(hex.substr(3,2),16), parseInt(hex.substr(5,2),16)]; }
    function fill(hex){ var c=rgb(hex); doc.setFillColor(c[0],c[1],c[2]); }
    function stroke(hex,w){ var c=rgb(hex); doc.setDrawColor(c[0],c[1],c[2]); doc.setLineWidth(w*k); }
    function color(hex){ var c=rgb(hex); doc.setTextColor(c[0],c[1],c[2]); }
    function font(bold,size){ doc.setFont('helvetica', bold?'bold':'normal'); doc.setFontSize(size*k*72/25.4); }

    // texto com espaçamento entre letras; align: 'l' | 'r' | 'c'
    function txt(s, px, py, o){
      o = o || {};
      s = pdfTxt(s);
      font(o.b, o.size||12);
      color(o.c||'#000000');
      if(o.maxW){
        var cortou = false;
        while(doc.getTextWidth(s) > o.maxW*k && s.length > 4){ s = s.slice(0,-2); cortou = true; }
        if(cortou) s = s.replace(/\s+$/,'') + '...';
      }
      var cs = (o.cs||0)*k;
      if(!cs){
        doc.text(s, X(px), Yy(py), {align: o.a==='r' ? 'right' : (o.a==='c' ? 'center' : 'left')});
        return doc.getTextWidth(s);
      }
      var total = 0, i, ws = [];
      for(i=0;i<s.length;i++){ ws.push(doc.getTextWidth(s.charAt(i))); total += ws[i] + (i<s.length-1 ? cs : 0); }
      var x = X(px);
      if(o.a==='r') x -= total; else if(o.a==='c') x -= total/2;
      for(i=0;i<s.length;i++){ doc.text(s.charAt(i), x, Yy(py)); x += ws[i] + cs; }
      return total;
    }
    function hline(x1,py,x2,hex,w){ stroke(hex,w||1); doc.line(X(x1),Yy(py),X(x2),Yy(py)); }
    function rbox(x1,y1,x2,y2,rad,strokeHex,fillHex,w){
      var style = fillHex ? (strokeHex ? 'FD' : 'F') : 'S';
      if(fillHex) fill(fillHex);
      if(strokeHex) stroke(strokeHex,w||1);
      doc.roundedRect(X(x1),Yy(y1),S(x2-x1),S(y2-y1),S(rad),S(rad),style);
    }

    var GOLD='#C9A02C', GD='#6B5316';

    // sombra suave + cartão
    rbox(95,CT+6,832,CB+14,26,null,'#F1F1F1');
    rbox(99,CT+3,828,CB+8,24,null,'#E9E9E9');
    rbox(102,CT,825,CB,22,null,'#FFFFFF');

    // cabeçalho escuro (cantos de cima arredondados, de baixo retos)
    rbox(102,CT,825,172,22,null,'#000000');
    fill('#000000'); doc.rect(X(102),Yy(130),S(723),S(42),'F');
    fill(GOLD); doc.rect(X(102),Yy(172),S(723),S(6),'F');

    // logo
    if(LOGO_B64){
      try{ doc.addImage('data:image/png;base64,'+LOGO_B64,'PNG',X(144),Yy(63),S(84),S(84)); }catch(e){}
      rbox(144,63,228,147,14,'#6B5316',null,1.2);
    }
    txt(EMPRESA.nome, 248, 100, {b:1,size:26,c:'#E8BE4A'});
    txt(EMPRESA.slogan.toUpperCase(), 248, 122, {size:9.5,c:'#CDBF94',cs:3.6});
    txt('COMPROVANTE', 782, 84, {size:9,c:'#CDBF94',cs:3.4,a:'r'});
    txt('REC-'+pad4(r.numero), 782, 110, {b:1,size:22,c:'#FFFFFF',a:'r'});
    txt(isoPorExtenso(r.dataISO), 782, 130, {size:11.5,c:'#E2DAC0',a:'r'});

    // faixa "pagamento recebido"
    fill('#FBF4DC'); doc.rect(X(102),Yy(184),S(723),S(48),'F');
    hline(102,232,825,'#E8D9A6',1);
    rbox(160,196,334,222,13,null,'#1E8A42');
    txt('PAGAMENTO RECEBIDO', 247, 213, {b:1,size:9.5,c:'#FFFFFF',cs:1.6,a:'c'});
    txt(r.tipo+' - '+r.cliente+' - '+r.servico+' · '+r.forma, 352, 214, {size:12.5,c:'#333333',maxW:430});

    // informações
    txt('INFORMAÇÕES', 144, 278, {b:1,size:10.5,c:GD,cs:3.2});
    hline(144,290,783,GOLD,1.8);
    var info = [
      [144,'CLIENTE', r.cliente, 318],
      [472,'SERVIÇO', r.servico, 318],
      [144,'DATA DO LANÇAMENTO', isoParaBR(r.dataISO), 371],
      [472,'Nº DO ORÇAMENTO', r.orc ? '#'+r.orc : '-', 371]
    ];
    info.forEach(function(i){
      txt(i[1], i[0], i[3], {size:9,c:'#666666',cs:1.4});
      var v = pdfTxt(i[2]);
      font(1,15);
      var maxW = 300*k;
      while(doc.getTextWidth(v) > maxW && v.length > 4){ v = v.slice(0,-2); }
      if(v !== pdfTxt(i[2])) v = v.trim() + '...';
      txt(v, i[0], i[3]+20, {b:1,size:15,c:'#111111'});
    });

    // valor deste lançamento
    rbox(144,414,783,524,20,'#D4AE3E','#FBF1D2',1.6);
    txt('VALOR DESTE LANÇAMENTO', 173, 449, {b:1,size:9.5,c:'#8A6D1E',cs:2.2});
    txt(fmtBRL(r.valor), 173, 495, {b:1,size:38,c:GD});
    txt('VALOR TOTAL DO SERVIÇO', 753, 458, {b:1,size:8.5,c:'#8A6D1E',cs:1.8,a:'r'});
    txt(fmtBRL(r.total), 753, 490, {b:1,size:22,c:'#8A6D1E',a:'r'});

    // tabela
    rbox(144,552,783,584,8,null,'#000000');
    txt('DATA', 166, 573, {b:1,size:9,c:'#E8BE4A',cs:2.4});
    txt('DESCRIÇÃO', 266, 573, {b:1,size:9,c:'#E8BE4A',cs:2.4});
    txt('VALOR', 761, 573, {b:1,size:9,c:'#E8BE4A',cs:2.4,a:'r'});
    var ry = 615;
    if(temAnt){
      txt('Pagamentos anteriores', 266, ry, {size:12.5,c:'#111111'});
      txt('+ '+fmtBRL(r.anterior), 761, ry, {b:1,size:13,c:'#16803A',a:'r'});
      hline(144,ry+18,783,'#E6D9B0',1);
      ry += 42;
    }
    txt(isoParaBR(r.dataISO), 166, ry, {size:12.5,c:'#444444'});
    txt(r.tipo+' - '+r.cliente+' - '+r.servico+' · '+r.forma, 266, ry, {size:12.5,c:'#111111',maxW:365});
    txt('+ '+fmtBRL(r.valor), 761, ry, {b:1,size:13,c:'#16803A',a:'r'});
    hline(144,ry+18,783,'#D9C48A',1.2);

    // saldo restante
    var sy = 652 + extra;
    var quitado = r.saldo <= 0.004;
    rbox(144,sy,783,sy+80,14,'#E3A92A','#FFF0C4',1.8);
    fill('#E3A92A'); doc.roundedRect(X(144),Yy(sy),S(8),S(80),S(4),S(4),'F');
    txt('SALDO RESTANTE', 172, sy+28, {b:1,size:10,c:'#222222',cs:1.8});
    txt(fmtBRL(quitado ? 0 : r.saldo), 172, sy+58, {b:1,size:22,c:quitado?'#16803A':'#B45309'});
    var aviso = quitado ? 'Serviço quitado. Obrigado pela confiança!' : (r.obs || '');
    if(aviso){
      font(0,12);
      var linhas = doc.splitTextToSize(pdfTxt(aviso), 300*k);
      var ly = sy + 34 - (linhas.length-1)*9;
      linhas.slice(0,2).forEach(function(l,i){
        txt(l, 760, ly + i*18, {size:12,c:quitado?'#16803A':'#7A4E00',a:'r'});
      });
    }

    // rodapé
    var fy = 752 + extra;
    hline(144,fy,783,'#E3D4A0',1);
    var w = txt(EMPRESA.nome, 144, fy+23, {b:1,size:10.5,c:GD});
    txt(' · '+EMPRESA.telefone, 144 + w/k, fy+23, {size:10.5,c:'#777777'});
    txt(EMPRESA.endereco.replace('Centro, ','Centro · '), 782, fy+23, {size:10.5,c:'#777777',a:'r'});
    if(EMPRESA.cnpj){ txt('CNPJ: '+EMPRESA.cnpj, 144, fy+39, {size:10.5,c:'#777777'}); }

    return doc;
  }

  // =====================================================================
  // CLIENTES E WHATSAPP
  // =====================================================================
  function atualizarClientes(){
    clientesTel = {};
    var nomes = [];
    getHistorico().forEach(function(o){
      if(!o.cliente) return;
      if(nomes.indexOf(o.cliente) < 0) nomes.push(o.cliente);
      if(o.telefone) clientesTel[o.cliente] = o.telefone;
    });
    getRecs().forEach(function(r){ if(r.cliente && nomes.indexOf(r.cliente) < 0) nomes.push(r.cliente); });
    var dl = $('cliList');
    dl.innerHTML = '';
    nomes.sort().forEach(function(n){
      var op = document.createElement('option'); op.value = n; dl.appendChild(op);
    });
  }
  $('cliNome').addEventListener('input', function(){
    var tel = clientesTel[this.value];
    if(tel && !$('cliTel').value.trim()) $('cliTel').value = tel;
  });

  function compartilhar(file, texto, tel){
    if(file && navigator.canShare && navigator.canShare({files:[file]})){
      navigator.share({files:[file], text:texto}).catch(function(){});
      return;
    }
    var d = String(tel||'').replace(/\D/g,'');
    if(d && d.length <= 11) d = '55' + d;
    window.open('https://wa.me/' + d + '?text=' + encodeURIComponent(texto), '_blank');
    toast('O WhatsApp abriu. Anexe o PDF que foi baixado.');
  }

  // =====================================================================
  // O QUE JÁ FIZ
  // =====================================================================
  function setHistTab(t){
    histTab = t;
    $('tabOrc').className = t === 'orc' ? 'on' : '';
    $('tabRec').className = t === 'rec' ? 'on' : '';
    $('histWrap').hidden = (t !== 'orc');
    $('recHistWrap').hidden = (t !== 'rec');
    renderHist();
  }
  $('tabOrc').addEventListener('click', function(){ setHistTab('orc'); });
  $('tabRec').addEventListener('click', function(){ setHistTab('rec'); });
  $('histBusca').addEventListener('input', function(){ renderHist(); });

  function toggleMais(row){
    var m = row.querySelector('.rc-more'), b = row.querySelector('.b-more');
    m.hidden = !m.hidden;
    b.textContent = m.hidden ? 'Mais opções ▾' : 'Fechar opções ▴';
  }

  function renderHist(){
    atualizarClientes();
    var todosO = getHistorico(), todosR = getRecs();
    $('tabOrc').textContent = 'Orçamentos (' + todosO.length + ')';
    $('tabRec').textContent = 'Comprovantes (' + todosR.length + ')';
    var q = $('histBusca').value.trim().toLowerCase();
    function bate(x){ return !q || String(x.cliente||'').toLowerCase().indexOf(q) >= 0; }

    var wo = $('histWrap'), wr = $('recHistWrap');
    var lo = todosO.slice().reverse().filter(bate), lr = todosR.slice().reverse().filter(bate);

    wo.innerHTML = '';
    if(!lo.length) wo.innerHTML = '<div class="empty">' + (todosO.length ? 'Nenhum orçamento com esse nome.' : 'Você ainda não fez nenhum orçamento.') + '</div>';
    lo.forEach(function(o){
      var row = document.createElement('div');
      row.className = 'rowcard';
      row.innerHTML =
        '<div class="rc-top"><div><div class="rc-name">' + esc(o.cliente || 'Sem nome') + '</div>' +
        '<div class="rc-meta">Orçamento nº ' + pad4(o.numero) + ' · ' + esc(o.dataBR) + '</div></div>' +
        '<div class="rc-val">' + fmtBRL(o.liquido) + '</div></div>' +
        '<button type="button" class="big primary b-pdf">📄 Ver PDF e enviar</button>' +
        '<button type="button" class="link center b-more">Mais opções ▾</button>' +
        '<div class="rc-more" hidden>' +
        '<button type="button" class="big b-edit">✏️ Corrigir este orçamento</button>' +
        '<button type="button" class="big b-dup">📋 Copiar para outro cliente</button>' +
        '<button type="button" class="big b-rec">🧾 Fazer comprovante</button>' +
        '<button type="button" class="big danger b-del">🗑️ Apagar este orçamento</button></div>';
      row.querySelector('.b-pdf').addEventListener('click', function(){ entregarOrc(o); });
      row.querySelector('.b-more').addEventListener('click', function(){ toggleMais(row); });
      row.querySelector('.b-edit').addEventListener('click', function(){ editarOrc(o, false); });
      row.querySelector('.b-dup').addEventListener('click', function(){ editarOrc(o, true); });
      row.querySelector('.b-rec').addEventListener('click', function(){ abrirRecDoOrcamento(o); });
      row.querySelector('.b-del').addEventListener('click', function(){
        confirmar('Apagar este orçamento?', 'Orçamento nº ' + pad4(o.numero) + ' de ' + (o.cliente || 'Sem nome') + '. Não dá para desfazer.', 'Sim, apagar', true).then(function(ok){
          if(!ok) return;
          saveHistorico(getHistorico().filter(function(x){ return x.numero !== o.numero; }));
          renderHist();
          toast('Orçamento apagado.');
        });
      });
      wo.appendChild(row);
    });

    wr.innerHTML = '';
    if(!lr.length) wr.innerHTML = '<div class="empty">' + (todosR.length ? 'Nenhum comprovante com esse nome.' : 'Você ainda não fez nenhum comprovante.') + '</div>';
    lr.forEach(function(r){
      var row = document.createElement('div');
      row.className = 'rowcard';
      row.innerHTML =
        '<div class="rc-top"><div><div class="rc-name">' + esc(r.cliente || 'Sem nome') + '</div>' +
        '<div class="rc-meta">Comprovante REC-' + pad4(r.numero) + ' · ' + esc(isoParaBR(r.dataISO)) + '</div></div>' +
        '<div class="rc-val">' + fmtBRL(r.valor) + '</div></div>' +
        '<div class="rc-sub ' + (r.saldo > 0.004 ? 'falta' : 'ok') + '">' + (r.saldo > 0.004 ? 'Falta receber ' + fmtBRL(r.saldo) : 'Quitado ✔') + '</div>' +
        '<button type="button" class="big primary b-pdf">📄 Ver PDF e enviar</button>' +
        '<button type="button" class="link center b-more">Mais opções ▾</button>' +
        '<div class="rc-more" hidden>' +
        '<button type="button" class="big danger b-del">🗑️ Apagar este comprovante</button></div>';
      row.querySelector('.b-pdf').addEventListener('click', function(){ entregarRec(r); });
      row.querySelector('.b-more').addEventListener('click', function(){ toggleMais(row); });
      row.querySelector('.b-del').addEventListener('click', function(){
        confirmar('Apagar este comprovante?', 'REC-' + pad4(r.numero) + ' de ' + (r.cliente || 'Sem nome') + '. O que falta receber desse serviço será refeito. Não dá para desfazer.', 'Sim, apagar', true).then(function(ok){
          if(!ok) return;
          saveRecs(getRecs().filter(function(x){ return x.numero !== r.numero; }));
          renderHist();
          toast('Comprovante apagado.');
        });
      });
      wr.appendChild(row);
    });
  }

  // =====================================================================
  // QUANTO FALTA RECEBER
  // =====================================================================
  function calcAbertos(){
    var g = {}, ordem = [];
    getRecs().forEach(function(r){
      var k = r.orc ? 'o' + r.orc : 'c' + String(r.cliente).toLowerCase() + '|' + String(r.servico).toLowerCase();
      if(!g[k]) ordem.push(k);
      g[k] = r;
    });
    return ordem.map(function(k){ return g[k]; }).filter(function(r){ return r.saldo > 0.004; });
  }
  function renderAbertos(){
    var ab = calcAbertos(), soma = 0, wrap = $('abertosWrap');
    wrap.innerHTML = '';
    if(!ab.length) wrap.innerHTML = '<div class="empty">🎉 Ninguém está devendo no momento.</div>';
    ab.forEach(function(r){
      soma += r.saldo;
      var row = document.createElement('div');
      row.className = 'rowcard';
      row.innerHTML =
        '<div class="rc-top"><div><div class="rc-name">' + esc(r.cliente) + '</div>' +
        '<div class="rc-meta">' + esc(r.servico) + (r.orc ? ' · orçamento nº ' + esc(r.orc) : '') + '</div>' +
        '<div class="rc-meta">Total do serviço: ' + fmtBRL(r.total) + '</div></div>' +
        '<div class="rc-val">' + fmtBRL(r.saldo) + '</div></div>' +
        '<button type="button" class="big primary">➕ Registrar novo pagamento</button>';
      row.querySelector('button').addEventListener('click', function(){ abrirRecDoSaldo(r); });
      wrap.appendChild(row);
    });
    $('abertosTotal').textContent = fmtBRL(soma);
  }

  // =====================================================================
  // INÍCIO E CÓPIA DE SEGURANÇA
  // =====================================================================
  function renderHome(){
    var ab = calcAbertos(), soma = ab.reduce(function(s,r){ return s + r.saldo; }, 0);
    $('homeAbertosTxt').textContent = ab.length
      ? fmtBRL(soma) + ' · ' + ab.length + (ab.length > 1 ? ' clientes' : ' cliente')
      : 'Ninguém devendo no momento';
    var temDados = getHistorico().length + getRecs().length > 0;
    var ultimo = localStorage.getItem(BK_KEY);
    var velho = true;
    if(ultimo){
      var d = new Date(ultimo + 'T00:00:00');
      velho = (Date.now() - d.getTime()) / 86400000 > 30;
    }
    $('bkBanner').hidden = !(temDados && velho);
  }

  $('btnExport').addEventListener('click', function(){
    var data = {app:'cearapla', versao:1, exportadoEm:todayISO(), orcamentos:getHistorico(), comprovantes:getRecs(), modelos:getModelos()};
    var url = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'}));
    var a = document.createElement('a');
    a.href = url; a.download = 'cearapla-copia-' + todayISO() + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    localStorage.setItem(BK_KEY, todayISO());
    toast('Cópia guardada! Procure o arquivo em "Downloads".');
  });
  $('btnImport').addEventListener('click', function(){ $('fileImport').click(); });
  $('fileImport').addEventListener('change', function(){
    var inp = this, f = inp.files[0];
    if(!f) return;
    var rd = new FileReader();
    rd.onload = function(){
      var d = null;
      try{ d = JSON.parse(rd.result); }catch(e){}
      if(!d || d.app !== 'cearapla' || !Array.isArray(d.orcamentos) || !Array.isArray(d.comprovantes)){
        aviso('Esse arquivo não é uma cópia do aplicativo.'); inp.value = ''; return;
      }
      confirmar('Recuperar esta cópia?',
        'Hoje o celular tem ' + getHistorico().length + ' orçamentos e ' + getRecs().length + ' comprovantes. A cópia tem ' + d.orcamentos.length + ' e ' + d.comprovantes.length + '. Ao recuperar, o que está no celular será trocado pela cópia.',
        'Sim, recuperar', true).then(function(ok){
        inp.value = '';
        if(!ok) return;
        saveHistorico(d.orcamentos); saveRecs(d.comprovantes); saveModelos(Array.isArray(d.modelos) ? d.modelos : []);
        renderModelos(); renderModelosLista();
        toast('Cópia recuperada com sucesso!');
      });
    };
    rd.readAsText(f);
  });

  // =====================================================================
  // LIGAÇÕES DOS BOTÕES
  // =====================================================================
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function(b){
    b.addEventListener('click', function(){
      var g = b.getAttribute('data-go');
      if(g === 'orc') iniciarOrc();
      else if(g === 'rec') iniciarRec();
      else if(g === 'hist'){ setHistTab(histTab); show('hist'); }
      else show(g);
    });
  });
  $('btnBack').addEventListener('click', function(){ show('home'); });
  $('btnPrev').addEventListener('click', function(){ if(screen === 'orc') orcPrev(); else recPrev(); });
  $('btnNext').addEventListener('click', function(){ if(screen === 'orc') orcNext(); else recNext(); });
  $('btnDoneHomeOrc').addEventListener('click', function(){ show('home'); });
  $('btnDoneHomeRec').addEventListener('click', function(){ show('home'); });
  $('btnShareOrc').addEventListener('click', function(){ compartilhar(lastOrcFile, lastOrcMsg, lastOrcTel); });
  $('btnShareRec').addEventListener('click', function(){ compartilhar(lastRecFile, lastRecMsg, lastRecTel); });
  $('btnRecDoOrc').addEventListener('click', function(){ if(ultimoOrc) abrirRecDoOrcamento(ultimoOrc); });
  $('scr-orc').addEventListener('input', function(){ orcFeito = false; });
  $('scr-rec').addEventListener('input', function(){ recFeito = false; });

  function carregarLogoBase64(){
    return new Promise(function(resolve){
      var img = new Image();
      img.onload = function(){
        try{
          var canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          LOGO_B64 = canvas.toDataURL('image/png').split(',')[1];
        }catch(e){ LOGO_B64 = null; }
        resolve();
      };
      img.onerror = function(){ resolve(); };
      img.src = 'icon-512.png?v=2';
    });
  }

  // ---------- início ----------
  ['recTotal','recValor','recAnterior'].forEach(function(id){ bindMoney($(id)); });
  $('recData').value = todayISO();
  addItem();
  calcTotals();
  recCalc();
  renderModelos();
  atualizarClientes();
  goOrc(1);
  goRec(1);
  try{ history.replaceState({s:'home'}, ''); }catch(e){}
  show('home', true);
  logoPromise = carregarLogoBase64();
})();
