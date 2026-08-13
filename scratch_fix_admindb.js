const fs = require('fs');
const filePath = 'e:\\ilara-main (3)\\ilara-main\\src\\server\\auth\\whatsappChallenge.ts';
let content = fs.readFileSync(filePath, 'utf8');
content = content.replace(/adminDb\./g, 'adminDb!.');
fs.writeFileSync(filePath, content);
console.log('Fixed adminDb');
