// Generates public/og.png (1200x630) from the latest snapshot numbers.
// Runs in prebuild (after sync-data), so the image always matches the data.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const latest = JSON.parse(
  readFileSync(join(here, '..', 'public', 'data', 'latest.json'), 'utf8'),
);
const dental = latest.kinds.dental;
const gp = latest.kinds.gp;
const nf = new Intl.NumberFormat('hu-HU');
const HU_MONTHS = ['január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
const [y, m] = latest.month.split('-').map(Number);
const monthLabel = `${y}. ${HU_MONTHS[m - 1]}`;
const pop = nf.format(
  dental.national.populationVacant + dental.national.populationDissolved
  + gp.national.populationVacant + gp.national.populationDissolved,
);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#0b1016"/>
  <rect x="0" y="0" width="1200" height="6" fill="#4fd6c2"/>
  <text x="80" y="120" font-family="Helvetica, Arial, sans-serif" font-size="26"
    letter-spacing="8" font-weight="700" fill="#4fd6c2">PRAXISTÉRKÉP</text>
  <text x="80" y="215" font-family="Helvetica, Arial, sans-serif" font-size="68"
    font-weight="800" fill="#e9eef5">Hol a fogorvos?</text>
  <text x="80" y="295" font-family="Helvetica, Arial, sans-serif" font-size="68"
    font-weight="800" fill="#e9eef5">Hol a háziorvos?</text>
  <text x="80" y="400" font-family="Helvetica, Arial, sans-serif" font-size="56"
    font-weight="800" fill="#ff7a59">${dental.national.vacant}</text>
  <text x="80" y="436" font-family="Helvetica, Arial, sans-serif" font-size="24"
    fill="#9aa8bb">betöltetlen fogorvosi körzet</text>
  <text x="460" y="400" font-family="Helvetica, Arial, sans-serif" font-size="56"
    font-weight="800" fill="#ff7a59">${gp.national.vacant}</text>
  <text x="460" y="436" font-family="Helvetica, Arial, sans-serif" font-size="24"
    fill="#9aa8bb">betöltetlen háziorvosi körzet</text>
  <text x="840" y="400" font-family="Helvetica, Arial, sans-serif" font-size="56"
    font-weight="800" fill="#ffb454">${pop}</text>
  <text x="840" y="436" font-family="Helvetica, Arial, sans-serif" font-size="24"
    fill="#9aa8bb">érintett lakos</text>
  <text x="80" y="545" font-family="Helvetica, Arial, sans-serif" font-size="24"
    fill="#64748b">Hivatalos NEAK-adatok · ${monthLabel} · havonta frissül</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(here, '..', 'public', 'og.png'));
console.log('og.png generated for', latest.month);
