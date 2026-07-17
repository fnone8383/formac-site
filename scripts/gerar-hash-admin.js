/**
 * Gera o hash bcrypt da sua senha de administrador, para colocar no .env
 * como ADMIN_PASSWORD_HASH. A senha em texto puro nunca é salva em
 * nenhum lugar — só o hash, que não pode ser "desconvertido" de volta
 * para a senha original.
 *
 * Uso:
 *   npm install
 *   node scripts/gerar-hash-admin.js "SuaSenhaForteAqui123!"
 */
const bcrypt = require("bcryptjs");

const senha = process.argv[2];
if (!senha) {
  console.log("Uso: node scripts/gerar-hash-admin.js \"SuaSenhaAqui\"");
  process.exit(1);
}
if (senha.length < 8) {
  console.log("⚠️  Use uma senha com pelo menos 8 caracteres.");
}

const hash = bcrypt.hashSync(senha, 12);
console.log("\nCopie a linha abaixo para o seu .env:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
