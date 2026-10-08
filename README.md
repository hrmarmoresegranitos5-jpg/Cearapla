# Ceará Planejados - Orçamentos e Comprovantes

Aplicativo (PWA) para fazer orçamentos e comprovantes de pagamento em PDF, pensado para ser simples de usar.

## Como usar

Na tela inicial há quatro botões grandes:

- **Fazer um orçamento:** passo a passo em 4 telas (cliente, itens, valores, conferir). No fim, o PDF é gerado e dá para enviar pelo WhatsApp.
- **Fazer um comprovante:** passo a passo em 3 telas (quem pagou, quanto foi pago, conferir).
- **Ver o que já fiz:** orçamentos e comprovantes antigos, com busca por nome. Cada um tem "Ver PDF e enviar" e, em "Mais opções", corrigir, copiar para outro cliente, fazer comprovante e apagar.
- **Quanto falta receber:** lista de quem ainda deve, com o total. Cada cliente tem o botão "Registrar novo pagamento".

Em **Mais opções** ficam a cópia de segurança e os itens guardados.

## Detalhes

- Os valores aceitam "13400", "13.400" ou "13.400,50" e o app mostra o valor por extenso embaixo do campo.
- "Corrigir este orçamento" mantém o mesmo número e atualiza o registro. "Copiar para outro cliente" cria um orçamento novo com os mesmos itens.
- Se o mesmo orçamento já tem comprovantes, o app soma o que foi pago antes e calcula o que falta.
- O app avisa quando faz mais de 30 dias que não é feita uma cópia de segurança.
- O CNPJ da empresa é configurado em `app.js` (campo `cnpj` em `EMPRESA`); enquanto estiver vazio, ele não aparece no comprovante.

## Como publicar (GitHub Pages)

1. Suba todos os arquivos para o repositório.
2. Em Settings > Pages, escolha a branch `main` e a pasta `/ (root)`.
3. Abra o endereço no celular e use "Adicionar à tela inicial".

Quando atualizar os arquivos, altere o número da versão em `CACHE_NAME` no `sw.js` para os celulares pegarem a versão nova.
