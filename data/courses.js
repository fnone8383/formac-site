/**
 * Lista oficial de cursos e preços — usada pelo BACKEND para validar toda
 * cobrança antes de mandar para a NexusPag. Isso impede que alguém abra o
 * DevTools do navegador e altere o preço antes de finalizar a compra: o
 * servidor nunca confia no valor que vem do front-end, sempre confere aqui.
 *
 * Mantenha esta lista sincronizada com "COURSES" em public/index.html
 * sempre que criar, remover ou alterar o preço de um curso.
 */
const COURSES = {
  "vigilante":            { name: "Formação de Vigilante",            price: 1590.00, lessons: 32 },
  "reciclagem-vigilante": { name: "Reciclagem de Vigilante",           price: 550.00,  lessons: 12 },
  "escolta-armada":       { name: "Escolta Armada",                   price: 890.00,  lessons: 18 },
  "transporte-valores":   { name: "Transporte de Valores",            price: 840.00,  lessons: 18 },
  "seguranca-pessoal":    { name: "Segurança Pessoal Privada",        price: 1140.00, lessons: 24 },
  "instrutor-armamento":  { name: "Instrutor de Armamento e Tiro",    price: 2300.00, lessons: 40 },
  "brigadista":           { name: "Brigadista",                       price: 320.00,  lessons: 8  },
  "bombeiro-civil":       { name: "Bombeiro Civil",                   price: 2190.00, lessons: 60 },
  "primeiros-socorros":   { name: "Primeiros Socorros",               price: 220.00,  lessons: 8  }
};

module.exports = COURSES;
