// Ícones placeholder (1x1 preto) só pra estrutura do .pkpass validar.
// TODO produto: substituir por ícones reais da marca (29x29/58x58/160x50).
const { writeFileSync } = require('fs');
const { join } = require('path');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const dir = join(__dirname, '..', 'assets', 'easyticket.pass');
for (const name of ['icon.png', 'icon@2x.png', 'logo.png']) {
  writeFileSync(join(dir, name), png);
  console.log('wrote', name);
}
