# Ceará Planejados · Orçamentos

App (PWA) para gerar orçamentos em PDF de móveis planejados, no mesmo modelo visual do sistema da HR Mármores e Granitos.

## Estrutura

```
index.html      → estrutura da página
styles.css       → estilos
app.js           → lógica (itens, totais, histórico, geração do PDF)
manifest.json    → configuração do PWA (nome, ícones, tela cheia)
sw.js            → service worker (funciona offline / instala como app)
icons/           → ícones do app (gerados a partir do logo)
```

## Comprovante de pagamento

Aba **Comprovante** no topo do app. Dois jeitos de usar:

- **A partir de um orçamento:** no histórico, toque em **Comprovante** (ou, logo depois de gerar o PDF do orçamento, em "Criar comprovante deste orçamento"). Cliente, serviço, nº do orçamento e total já vêm preenchidos; informe o valor recebido.
- **Avulso:** preencha tudo manualmente na aba Comprovante.

Se o mesmo orçamento já tem comprovantes, o app soma o que foi pago antes e mostra o saldo certo. O CNPJ da empresa é configurado em `app.js` (campo `cnpj` em `EMPRESA`); enquanto estiver vazio ele não aparece no PDF.

## Como publicar no GitHub Pages

1. Crie um repositório novo no GitHub (ex: `ceara-planejados-orcamentos`)
2. Suba todos os arquivos desta pasta para a raiz do repositório
3. Vá em **Settings → Pages**
4. Em "Branch", selecione `main` (ou `master`) e pasta `/ (root)`
5. Salve. Em alguns minutos o link ficará disponível, algo como:
   `https://SEU-USUARIO.github.io/ceara-planejados-orcamentos/`

## Instalar como app no celular

Depois de publicado, abra o link no Chrome do celular → menu (⋮) → **"Adicionar à tela inicial"** / **"Instalar app"**. Ele passa a abrir como um app normal, com ícone próprio.

## Observações

- O histórico de orçamentos fica salvo no próprio navegador/aparelho (localStorage) — não é enviado pra nenhum servidor.
- O PDF é gerado no próprio celular (biblioteca jsPDF), sem precisar de internet depois que o app carregou uma vez (graças ao service worker).
