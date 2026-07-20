(function(){
  "use strict";

  var LOGO_B64 = null; // carregado dinamicamente de icons/logo.png
  var logoPromise = null;
  var EMPRESA = {
    nome: "Ceará Planejados",
    slogan: "Móveis Planejados",
    endereco: "Av. Joaquim Ribeiro, nº 398, Centro, Pilão Arcado - BA",
    telefone: "(74) 99963-3270"
  };

  var LS_KEY = "cp_orcamentos_v1";
  var itemSeq = 0;

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
        '<button type="button">Reabrir</button>';
      row.querySelector('button').addEventListener('click', function(){ reabrirOrcamento(o); });
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
      var blockH = Math.max(descLines.length * 5.6, 7) + 4;

      if(y + blockH > 275){
        doc.addPage();
        y = 18;
      }

      doc.setFont('helvetica','bold');
      doc.setFontSize(11.5);
      doc.setTextColor(goldRGB[0],goldRGB[1],goldRGB[2]);
      doc.text(String(idx+1)+'.', marginX, y);

      doc.setFont('helvetica','normal');
      doc.setTextColor(darkRGB[0],darkRGB[1],darkRGB[2]);
      doc.setFontSize(11.5);
      doc.text(descLines, marginX+6, y);

      doc.setFont('helvetica','bold');
      doc.setTextColor(darkRGB[0],darkRGB[1],darkRGB[2]);
      doc.text(fmtBRL(item.valor), pageW-marginX, y, {align:'right'});

      y += blockH;
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
      img.src = 'icons/icon-512.png';
    });
  }

  document.getElementById('btnPdf').addEventListener('click', gerarPDF);

  // init
  addItem();
  calcTotals();
  renderHistorico();
  logoPromise = carregarLogoBase64();
})();