# Guia completo — colocar o FORMAC Formação no ar, de graça e com segurança

Este guia parte do zero. No final, o site estará publicado em uma URL
pública, com HTTPS automático, banco de dados real, login seguro (senhas
com hash, nunca em texto puro) e o checkout Pix funcionando de verdade.

Tempo estimado: 45-60 minutos na primeira vez.

---

## Parte 1 — Preparar as ferramentas (só na primeira vez)

1. **GitHub** — crie uma conta grátis em https://github.com
2. **Git** — baixe em https://git-scm.com/download/win e instale com as opções padrão. Depois de instalar, abra o **"Git Bash"** pelo menu Iniciar.
3. **Node.js** — baixe a versão **LTS** em https://nodejs.org e instale com as opções padrão.

---

## Parte 2 — Criar o banco de dados (MongoDB Atlas, gratuito para sempre)

1. Acesse **https://www.mongodb.com/cloud/atlas/register** e crie uma conta grátis.
2. Ele vai te guiar para criar um **Cluster** — escolha a opção **"M0 Free"** (gratuita para sempre, sem limite de tempo).
3. Escolha a região mais próxima do Brasil disponível e clique em criar. Leva 1-3 minutos para ficar pronto.
4. Em **"Security" → "Database Access"**, clique em "Add New Database User":
   - Username: `formac`
   - Password: clique em "Autogenerate Secure Password" e **copie/guarde essa senha**
   - Em "Database User Privileges", deixe "Read and write to any database"
5. Em **"Security" → "Network Access"**, clique em "Add IP Address" → **"Allow Access from Anywhere"** (`0.0.0.0/0`). Isso é necessário porque o Render tem IP variável no plano free.
6. Volte para **"Database" → "Connect"** → **"Drivers"** → escolha "Node.js". Copie a string de conexão, algo como:
   ```
   mongodb+srv://formac:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
7. Troque `<password>` pela senha que você copiou no passo 4, e adicione `/formac` antes do `?` para nomear o banco:
   ```
   mongodb+srv://formac:SUA_SENHA@cluster0.xxxxx.mongodb.net/formac?retryWrites=true&w=majority
   ```
   Essa é a sua `MONGODB_URI` — cole no arquivo `.env` (já tem o campo pronto lá).

---

## Parte 3 — Gerar a senha do administrador (com segurança)

A senha do admin não fica em texto puro em nenhum lugar — nem no código,
nem no `.env`. Você gera um "hash" (uma versão embaralhada e irreversível)
e só o hash fica salvo.

1. Descompacte o `formac-formacao-completo.zip` em uma pasta, ex: `C:\formac-deploy`.
2. Abra o **Git Bash** dentro dessa pasta e rode:
   ```bash
   npm install
   npm run gen-admin-hash "SuaSenhaForteAqui123!"
   ```
   (troque pela senha que você realmente vai usar, com letras, números e símbolo)
3. Ele vai imprimir uma linha assim:
   ```
   ADMIN_PASSWORD_HASH=$2a$12$Xy8k...longa string...
   ```
4. Copie essa linha inteira para o seu `.env`, substituindo o valor que já está lá.
5. No mesmo `.env`, defina também `ADMIN_EMAIL` com o e-mail que você vai usar para entrar no painel.

Guarde a senha original (a de texto puro) em um gerenciador de senhas —
depois de gerar o hash, não tem como recuperá-la a partir dele.

---

## Parte 4 — Colocar o projeto no GitHub

1. No GitHub, **"New repository"** → nome `formac-formacao` → marque **Private** → "Create repository" (deixe todas as outras opções desmarcadas).

2. No Git Bash, dentro da pasta do projeto:
   ```bash
   git init
   git add .
   git commit -m "Primeira versão do site FORMAC Formação"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/formac-formacao.git
   git push -u origin main
   ```

3. **Confira no site do GitHub que o arquivo `.env` NÃO aparece na lista** de arquivos do repositório. Se aparecer, pare e me avise.

---

## Parte 5 — Hospedar de graça no Render.com

1. Acesse **https://render.com** → crie a conta (pode entrar com GitHub).
2. **"New +" → "Web Service"** → selecione o repositório `formac-formacao`.
3. Preencha:
   - **Name:** `formac-formacao`
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. Em **"Environment Variables"**, adicione cada linha do seu `.env` (menos `PORT`, que o Render define sozinho):

   | Key | Value |
   |---|---|
   | `MONGODB_URI` | (a string completa da Parte 2) |
   | `JWT_SECRET` | (a string aleatória do seu `.env`) |
   | `ADMIN_EMAIL` | (o e-mail que você escolheu) |
   | `ADMIN_PASSWORD_HASH` | (o hash gerado na Parte 3) |
   | `NEXUSPAG_SECRET_KEY` | (sua chave `nxp_live_...`) |
   | `NEXUSPAG_WEBHOOK_SECRET` | (sua chave `nxps_...`) |
   | `NEXUSPAG_API_BASE_URL` | `https://nexuspag.com` |
   | `NEXUSPAG_SHOP_ID` | `jorgeluisvieiraenes14@gmail.com` |
   | `COOKIE_SECURE` | `true` |

5. Clique em **"Create Web Service"**. Acompanhe os logs — quando aparecer
   `✅ Conectado ao MongoDB` e `✅ FORMAC Formação rodando em...`, está pronto.

6. Sua URL pública vai ser algo como `https://formac-formacao.onrender.com`,
   já com HTTPS automático e gratuito.

> ⚠️ **Plano gratuito do Render:** o site "dorme" após 15 minutos sem
> visitas, e demora ~30-50s para acordar na próxima visita. Não afeta o
> pagamento em si (o webhook da NexusPag chega e é processado assim que o
> servidor acordar), mas se isso incomodar, o plano pago ($7/mês) resolve.

---

## Parte 6 — Conectar o webhook da NexusPag

1. No painel da NexusPag: **Integrações → Webhooks**.
2. Configure a URL de endpoint:
   ```
   https://formac-formacao.onrender.com/api/checkout/webhook
   ```
   (troque pela URL real que o Render te deu)
3. Salve.

---

## Parte 7 — Checklist final antes de divulgar

- [ ] Testei login como aluno (cadastro novo) e como admin, e ambos funcionam
- [ ] Rotacionei a secret key e o webhook secret da NexusPag (passaram por um chat) e atualizei no Render
- [ ] Fiz um teste real de Pix de R$1,00 e confirmei que o curso libera sozinho
- [ ] O repositório do GitHub está como **Private**
- [ ] Conferi que `.env` não está no GitHub
- [ ] Guardei a senha do admin em um gerenciador de senhas

## O que já está protegido por padrão neste projeto

- Senhas de alunos e do admin: nunca em texto puro, sempre com hash (bcrypt)
- Sessão de login: cookie `httpOnly` (não pode ser lido/roubado via JavaScript malicioso), `secure` (só trafega em HTTPS) e assinado com JWT
- Preço dos cursos: sempre validado no servidor — não dá para alterar pelo navegador
- Limite de tentativas de login/cadastro (30 a cada 15 min) e de checkout (20 a cada 15 min) por IP
- Cabeçalhos de segurança (helmet) contra alguns ataques comuns de navegador
- Assinatura HMAC do webhook validada exatamente como a NexusPag documenta

## Se algo der errado

- **Erro de conexão com MongoDB nos logs do Render:** confira se copiou a `MONGODB_URI` certa (com a senha, sem `<` `>`) e se liberou "Allow Access from Anywhere" na Parte 2.
- **Login não funciona:** confira `ADMIN_EMAIL` e `ADMIN_PASSWORD_HASH` no Render — copie de novo do resultado do `npm run gen-admin-hash`.
- **Pix não é criado:** confira as 4 variáveis da NexusPag, sem espaços extras.
- **Pagamento não libera o curso:** confira a URL do webhook na Parte 6.

Me manda um print do log de erro (aba "Logs" no Render) que eu ajudo a resolver.

---

## Custo disso tudo

| Item | Custo |
|---|---|
| GitHub (repositório privado) | Grátis |
| MongoDB Atlas (M0) | Grátis para sempre |
| Render (hospedagem + HTTPS) | Grátis (com "sono" após 15 min sem uso) |
| NexusPag | Taxa deles por transação |
| **Total mensal** | **R$ 0,00** |
