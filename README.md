# FORMAC Formação — projeto completo

Site + autenticação real + banco de dados + checkout Pix via NexusPag.

**Comece pelo `DEPLOY.md`** — é o passo a passo completo, do zero até o
site no ar, de graça.

## Estrutura

```
formac-deploy/
├── public/index.html     ← o site (front-end)
├── server.js              ← servidor: site + API + autenticação + NexusPag
├── models/                ← esquemas do MongoDB (User, Order)
├── data/courses.js        ← lista oficial de cursos e preços (fonte da verdade)
├── scripts/gerar-hash-admin.js  ← gera a senha do admin com segurança
├── package.json
├── .env                    ← suas credenciais (NÃO subir para o Git)
└── .gitignore
```

## Rodar localmente

```bash
npm install
npm run gen-admin-hash "SuaSenha123!"   # cole o resultado no .env
npm start
```

Abra http://localhost:3000

## Documentação completa

Veja **`DEPLOY.md`** para o guia passo a passo de hospedagem gratuita
(MongoDB Atlas + Render.com), configuração do webhook da NexusPag e
checklist de segurança.
