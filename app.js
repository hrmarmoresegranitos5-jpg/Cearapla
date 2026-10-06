(function(){
  "use strict";

  var LOGO_B64 = null; // carregado dinamicamente de icons/logo.png
  var logoPromise = null;
  var EMPRESA = {
    nome: "Ceará Planejados",
    slogan: "Móveis Planejados",
    endereco: "Av. Joaquim Ribeiro, nº 398, Centro, Pilão Arcado - BA",
    telefone: "(74) 99963-3270",
    cnpj: "" // preencha aqui o CNPJ (ex: "00.000.000/0001-00"); se ficar vazio, não aparece no comprovante
  };

  var LS_KEY = "cp_orcamentos_v1";
  var itemSeq = 0;
  var ultimoOrc = null;

  function fmtBRL(v){
    return "R$ " + (v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function parseNum(str){
    if(!str) return 0;
    str = String(str).replace(/[^\d,.-]/g,'').replace(/\.(?=\d{3},)/g,'').replace(',', '.');
    var n = parseFloat(str);
    return isNaN(n) ? 0 : n;
  }
  function toast(msg){
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, 2200);
  }
  function todayISO(){
    var d = new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function todayBR(){
    var d = new Date();
    return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();
  }

  // ---------- ITENS ----------
  function addItem(desc, valor){
    itemSeq++;
    var id = 'it'+itemSeq;
    var wrap = document.getElementById('itensWrap');
    var div = document.createElement('div');
    div.className = 'item';
    div.id = id;
    div.innerHTML =
      '<div class="item-top"><span>Item '+ (wrap.children.length+1) +'</span>'+
      '<button type="button" class="rm">remover</button></div>'+
      '<label>Descrição detalhada</label>'+
      '<textarea class="it-desc" placeholder="Ex: Guarda-roupa 6 portas, MDF branco TX, com espelho na porta central, puxadores em alumínio escovado, medindo 2,40m x 2,10m...">'+(desc||'')+'</textarea>'+
      '<label>Valor (R$)</label>'+
      '<input type="text" class="it-valor" inputmode="decimal" placeholder="0,00" value="'+(valor!=null? String(valor).replace('.',',') : '')+'">';
    wrap.appendChild(div);
    div.querySelector('.rm').addEventListener('click', function(){
      div.remove();
      renumberItems();
      calcTotals();
    });
    div.querySelector('.it-valor').addEventListener('input', calcTotals);
    calcTotals();
  }
  function renumberItems(){
    var wrap = document.getElementById('itensWrap');
    Array.prototype.forEach.call(wrap.children, function(div, i){
      div.querySelector('.item-top span').textContent = 'Item ' + (i+1);
    });
  }
  function getItens(){
    var wrap = document.getElementById('itensWrap');
    var out = [];
    Array.prototype.forEach.call(wrap.children, function(div){
      var desc = div.querySelector('.it-desc').value.trim();
      var valor = parseNum(div.querySelector('.it-valor').value);
      if(desc || valor) out.push({desc:desc, valor:valor});
    });
    return out;
  }

  function calcTotals(){
    var itens = getItens();
    var bruto = itens.reduce(function(s,i){ return s + i.valor; }, 0);
    var pct = parseFloat(document.getElementById('descontoPct').value) || 0;
    var desc = bruto * (pct/100);
    var liquido = bruto - desc;
    document.getElementById('totBruto').textContent = fmtBRL(bruto);
    document.getElementById('totDesc').textContent = '- ' + fmtBRL(desc);
    document.getElementById('totLiquido').textContent = fmtBRL(liquido);
    return {bruto:bruto, desc:desc, liquido:liquido, pct:pct};
  }

  document.getElementById('btnAddItem').addEventListener('click', function(){ addItem(); });
  document.getElementById('descontoPct').addEventListener('input', calcTotals);

  // ---------- LIMPAR ----------
  document.getElementById('btnNovo').addEventListener('click', function(){
    if(!confirm('Limpar todos os campos do orçamento atual?')) return;
    document.getElementById('cliNome').value = '';
    document.getElementById('cliTel').value = '';
    document.getElementById('validade').value = 7;
    document.getElementById('descontoPct').value = 10;
    document.getElementById('itensWrap').innerHTML = '';
    document.getElementById('pdfCard').style.display = 'none';
    addItem();
    calcTotals();
  });

  // ---------- HISTÓRICO ----------
  function getHistorico(){
    try{ return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveHistorico(list){
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  }
  function nextNumero(list){
    var n = list.length ? Math.max.apply(null, list.map(function(o){return o.numero||0;})) + 1 : 1;
    return n;
  }
  function renderHistorico(){
    var list = getHistorico().slice().reverse();
    var wrap = document.getElementById('histWrap');
    document.getElementById('histCount').textContent = list.length;
    if(!list.length){
      wrap.innerHTML = '<div class="empty">Nenhum orçamento salvo ainda</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach(function(o){
      var row = document.createElement('div');
      row.className = 'hist';
      row.innerHTML =
        '<div><div class="h-name">#'+String(o.numero).padStart(4,'0')+' · '+(o.cliente||'Sem nome')+'</div>'+
        '<div class="h-meta">'+o.dataBR+' · '+fmtBRL(o.liquido)+'</div></div>'+
        '<div class="h-actions"><button type="button" class="b-reabrir">Reabrir</button>'+
        '<button type="button" class="b-rec">Comprovante</button></div>';
      row.querySelector('.b-reabrir').addEventListener('click', function(){ reabrirOrcamento(o); });
      row.querySelector('.b-rec').addEventListener('click', function(){ abrirRecDoOrcamento(o); });
      wrap.appendChild(row);
    });
  }
  function reabrirOrcamento(o){
    document.getElementById('cliNome').value = o.cliente || '';
    document.getElementById('cliTel').value = o.telefone || '';
    document.getElementById('validade').value = o.validadeDias || 7;
    document.getElementById('descontoPct').value = o.pct || 10;
    document.getElementById('itensWrap').innerHTML = '';
    (o.itens||[]).forEach(function(i){ addItem(i.desc, i.valor); });
    if(!(o.itens||[]).length) addItem();
    calcTotals();
    window.scrollTo({top:0, behavior:'smooth'});
    toast('Orçamento #' + String(o.numero).padStart(4,'0') + ' carregado');
  }

  // ---------- MONTAR PDF (jsPDF) ----------
  function montarDoc(numero, cliente, telefone, validadeDias, itens, t){
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
    doc.text('Data: ' + todayBR(), pageW-marginX, y+12, {align:'right'});
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
    y += 18;

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

  // ---------- GERAR ----------
  function gerarPDF(){
    var cliente = document.getElementById('cliNome').value.trim();
    var telefone = document.getElementById('cliTel').value.trim();
    var validadeDias = parseInt(document.getElementById('validade').value) || 7;
    var itens = getItens();

    if(!cliente){ toast('Informe o nome do cliente'); document.getElementById('cliNome').focus(); return; }
    if(!itens.length){ toast('Adicione ao menos 1 item'); return; }

    var t = calcTotals();
    var list = getHistorico();
    var numero = nextNumero(list);

    Promise.resolve(logoPromise).then(function(){
      var doc = montarDoc(numero, cliente, telefone, validadeDias, itens, t);
      var fname = 'orcamento-' + String(numero).padStart(4,'0') + '-' + cliente.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '.pdf';

      var blob = doc.output('blob');
      var url = URL.createObjectURL(blob);

      // tenta baixar automaticamente (clique síncrono de âncora)
      try{
        var a = document.createElement('a');
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }catch(e){}

      // sempre mostra também o botão manual
      var pdfCard = document.getElementById('pdfCard');
      var pdfLink = document.getElementById('pdfLink');
      pdfLink.href = url;
      pdfLink.setAttribute('download', fname);
      pdfCard.style.display = 'block';
      pdfCard.scrollIntoView({behavior:'smooth', block:'start'});

      ultimoOrc = {
        numero: numero, cliente: cliente, liquido: t.liquido, itens: itens
      };
      list.push({
        numero: numero,
        cliente: cliente,
        telefone: telefone,
        validadeDias: validadeDias,
        pct: t.pct,
        bruto: t.bruto,
        desc: t.desc,
        liquido: t.liquido,
        itens: itens,
        dataISO: todayISO(),
        dataBR: todayBR()
      });
      saveHistorico(list);
      renderHistorico();
      toast('PDF gerado: orçamento #' + String(numero).padStart(4,'0'));
    });
  }

  function carregarLogoBase64(){
    return new Promise(function(resolve){
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function(){
        try{
          var canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          var dataUrl = canvas.toDataURL('image/png');
          LOGO_B64 = dataUrl.split(',')[1];
        }catch(e){ LOGO_B64 = null; }
        resolve();
      };
      img.onerror = function(){ resolve(); };
      img.src = 'icon-512.png?v=2';
    });
  }

  document.getElementById('btnPdf').addEventListener('click', gerarPDF);

  // =====================================================================
  // COMPROVANTE DE PAGAMENTO
  // =====================================================================
  var REC_KEY = "cp_comprovantes_v1";
  var REC_OBS_PADRAO = "A ser pago na entrega e instalação do serviço";
  var recAntTocado = false;
  var recOrigemPadrao = document.getElementById('recOrigem').textContent;

  function $(id){ return document.getElementById(id); }
  function pad4(n){ return String(n).padStart(4,'0'); }
  function numParaCampo(v){ return (Math.round(v*100)/100).toFixed(2).replace('.',','); }
  function isoParaBR(iso){
    var p = String(iso||'').split('-');
    return p.length===3 ? p[2]+'/'+p[1]+'/'+p[0] : iso;
  }
  var MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  function isoPorExtenso(iso){
    var p = String(iso||'').split('-');
    if(p.length!==3) return iso;
    return p[2]+' de '+MESES[parseInt(p[1],10)-1]+' de '+p[0];
  }
  function esc(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ---------- abas ----------
  function showView(v){
    var rec = (v==='rec');
    $('viewOrc').hidden = rec;
    $('barOrc').hidden = rec;
    $('viewRec').hidden = !rec;
    $('barRec').hidden = !rec;
    Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab'), function(b){
      b.classList.toggle('active', b.getAttribute('data-view') === v);
    });
    window.scrollTo({top:0});
  }
  Array.prototype.forEach.call(document.querySelectorAll('#tabs .tab'), function(b){
    b.addEventListener('click', function(){ showView(b.getAttribute('data-view')); });
  });

  // ---------- histórico ----------
  function getRecs(){
    try{ return JSON.parse(localStorage.getItem(REC_KEY)) || []; }
    catch(e){ return []; }
  }
  function saveRecs(list){ localStorage.setItem(REC_KEY, JSON.stringify(list)); }
  function nextRecNumero(list){
    return list.length ? Math.max.apply(null, list.map(function(r){ return r.numero||0; })) + 1 : 1;
  }
  function pagoAntesDoOrc(orc){
    orc = String(orc||'').replace(/\D/g,'').replace(/^0+/,'');
    if(!orc) return 0;
    return getRecs().reduce(function(s,r){
      var o = String(r.orc||'').replace(/\D/g,'').replace(/^0+/,'');
      return o===orc ? s + (r.valor||0) : s;
    }, 0);
  }

  // ---------- cálculo ----------
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
    return {total:total, valor:valor, ant:ant, pago:pago, saldo:saldo};
  }
  ['recTotal','recValor','recAnterior'].forEach(function(id){ $(id).addEventListener('input', recCalc); });
  $('recAnterior').addEventListener('input', function(){ recAntTocado = true; });
  $('recOrc').addEventListener('input', function(){
    if(recAntTocado) return;
    var p = pagoAntesDoOrc($('recOrc').value);
    $('recAnterior').value = p > 0 ? numParaCampo(p) : '';
    recCalc();
  });

  // ---------- a partir de um orçamento ----------
  function servicoDoOrcamento(o){
    var it = (o.itens||[])[0];
    var linha = it && it.desc ? it.desc.split('\n')[0].trim() : '';
    if(!linha) return '';
    if(linha === linha.toUpperCase()) linha = linha.charAt(0) + linha.slice(1).toLowerCase();
    return linha.length > 40 ? linha.slice(0,40).trim() : linha;
  }
  function abrirRecDoOrcamento(o){
    limparRec(true);
    var numero = pad4(o.numero);
    var ant = pagoAntesDoOrc(numero);
    $('recCliente').value = o.cliente || '';
    $('recServico').value = servicoDoOrcamento(o);
    $('recOrc').value = numero;
    $('recTotal').value = numParaCampo(o.liquido || 0);
    if(ant > 0){
      $('recAnterior').value = numParaCampo(ant);
      $('recTipo').value = 'Parcela';
    }
    $('recOrigem').textContent = 'Baseado no orçamento #' + numero + '. O total veio do valor à vista (' + fmtBRL(o.liquido||0) + '); se vocês fecharam outro valor, ajuste o total.';
    recCalc();
    showView('rec');
    $('recValor').focus();
  }
  $('btnRecDoOrc').addEventListener('click', function(){
    if(ultimoOrc) abrirRecDoOrcamento(ultimoOrc);
  });

  // ---------- limpar ----------
  function limparRec(silencioso){
    if(!silencioso && !confirm('Limpar todos os campos do comprovante atual?')) return;
    ['recCliente','recServico','recOrc','recTotal','recValor','recAnterior'].forEach(function(id){ $(id).value=''; });
    $('recTipo').selectedIndex = 0;
    $('recForma').selectedIndex = 0;
    $('recData').value = todayISO();
    $('recObs').value = REC_OBS_PADRAO;
    $('recOrigem').textContent = recOrigemPadrao;
    $('recPdfCard').style.display = 'none';
    recAntTocado = false;
    recCalc();
  }
  $('btnRecNovo').addEventListener('click', function(){ limparRec(false); });

  // ---------- histórico na tela ----------
  function renderRecs(){
    var list = getRecs().slice().reverse();
    var wrap = $('recHistWrap');
    $('recHistCount').textContent = list.length;
    if(!list.length){
      wrap.innerHTML = '<div class="empty">Nenhum comprovante salvo ainda</div>';
      return;
    }
    wrap.innerHTML = '';
    list.forEach(function(r){
      var row = document.createElement('div');
      row.className = 'hist';
      row.innerHTML =
        '<div><div class="h-name">REC-'+pad4(r.numero)+' · '+esc(r.cliente||'Sem nome')+'</div>'+
        '<div class="h-meta">'+esc(isoParaBR(r.dataISO))+' · '+fmtBRL(r.valor)+' · saldo '+fmtBRL(r.saldo>0?r.saldo:0)+'</div></div>'+
        '<div class="h-actions"><button type="button" class="b-pdf">PDF</button></div>';
      row.querySelector('.b-pdf').addEventListener('click', function(){ baixarRec(r, true); });
      wrap.appendChild(row);
    });
  }

  // ---------- PDF do comprovante ----------
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

  function nomeArquivoRec(r){
    return 'comprovante-' + pad4(r.numero) + '-' + String(r.cliente).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '.pdf';
  }

  function baixarRec(r, soBaixar){
    Promise.resolve(logoPromise).then(function(){
      var doc = montarComprovante(r);
      var fname = nomeArquivoRec(r);
      var url = URL.createObjectURL(doc.output('blob'));
      try{
        var a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }catch(e){}
      var card = $('recPdfCard'), link = $('recPdfLink');
      link.href = url; link.setAttribute('download', fname);
      card.style.display = 'block';
      if(soBaixar){ showView('rec'); }
      card.scrollIntoView({behavior:'smooth', block:'start'});
    });
  }

  // ---------- gerar ----------
  function gerarComprovante(){
    var cliente = $('recCliente').value.trim();
    var servico = $('recServico').value.trim();
    var c = recCalc();
    if(!cliente){ toast('Informe o nome do cliente'); $('recCliente').focus(); return; }
    if(!servico){ toast('Informe o serviço'); $('recServico').focus(); return; }
    if(c.total <= 0){ toast('Informe o valor total do serviço'); $('recTotal').focus(); return; }
    if(c.valor <= 0){ toast('Informe o valor deste lançamento'); $('recValor').focus(); return; }
    if(c.pago > c.total + 0.004){ toast('O valor pago passa do total do serviço'); $('recValor').focus(); return; }

    var list = getRecs();
    var orc = $('recOrc').value.replace(/\D/g,'');
    var r = {
      numero: nextRecNumero(list),
      cliente: cliente,
      servico: servico,
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
    renderRecs();
    baixarRec(r, false);
    toast('Comprovante gerado: REC-' + pad4(r.numero));
  }
  $('btnRecPdf').addEventListener('click', gerarComprovante);

  // init
  addItem();
  calcTotals();
  renderHistorico();
  $("recData").value = todayISO();
  recCalc();
  renderRecs();
  logoPromise = carregarLogoBase64();
})();