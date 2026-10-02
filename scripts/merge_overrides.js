import fs from 'fs';
const overridesPath = 'scripts/overrides.json';
const existing = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf8')) : {};
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
Object.assign(existing, input);
fs.writeFileSync(overridesPath, JSON.stringify(existing, null, 1));
console.log(`merged ${Object.keys(input).length}, total overrides: ${Object.keys(existing).length}`);
