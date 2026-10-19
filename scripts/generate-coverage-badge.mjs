import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const summaryPath = path.resolve(rootDir, 'coverage/coverage-summary.json');
const distCoverageDir = path.resolve(rootDir, 'dist/coverage');
const publicCoverageDir = path.resolve(rootDir, 'public/coverage');
const badgesDir = path.resolve(rootDir, 'badges');

if (!fs.existsSync(summaryPath)) {
  console.warn('⚠️ No coverage-summary.json found at:', summaryPath);
  process.exit(0);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
const total = summary.total;
const linePct = total && total.lines ? Math.round(total.lines.pct) : 0;
const stmtPct = total && total.statements ? Math.round(total.statements.pct) : 0;
const funcPct = total && total.functions ? Math.round(total.functions.pct) : 0;
const branchPct = total && total.branches ? Math.round(total.branches.pct) : 0;

let colorName = 'red';
let colorHex = '#e05d44';

if (linePct >= 80) {
  colorName = 'brightgreen';
  colorHex = '#4c1';
} else if (linePct >= 70) {
  colorName = 'green';
  colorHex = '#97ca00';
} else if (linePct >= 60) {
  colorName = 'yellowgreen';
  colorHex = '#a4a61d';
} else if (linePct >= 50) {
  colorName = 'yellow';
  colorHex = '#dfb317';
} else if (linePct >= 40) {
  colorName = 'orange';
  colorHex = '#fe7d37';
}

const badgeJson = {
  schemaVersion: 1,
  label: 'coverage',
  message: `${linePct}%`,
  color: colorName,
};

const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="104" height="20" role="img" aria-label="coverage: ${linePct}%">
  <title>coverage: ${linePct}%</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="104" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="61" height="20" fill="#555"/>
    <rect x="61" width="43" height="20" fill="${colorHex}"/>
    <rect width="104" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="315" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="510">coverage</text>
    <text x="315" y="140" transform="scale(.1)" fill="#fff" textLength="510">coverage</text>
    <text aria-hidden="true" x="815" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="330">${linePct}%</text>
    <text x="815" y="140" transform="scale(.1)" fill="#fff" textLength="330">${linePct}%</text>
  </g>
</svg>`;

// Ensure target directories exist
[distCoverageDir, publicCoverageDir, badgesDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Write badge files
fs.writeFileSync(path.join(badgesDir, 'coverage.svg'), badgeSvg);
fs.writeFileSync(path.join(publicCoverageDir, 'badge.svg'), badgeSvg);
fs.writeFileSync(path.join(publicCoverageDir, 'badge.json'), JSON.stringify(badgeJson, null, 2));

if (fs.existsSync(distCoverageDir)) {
  fs.writeFileSync(path.join(distCoverageDir, 'badge.svg'), badgeSvg);
  fs.writeFileSync(path.join(distCoverageDir, 'badge.json'), JSON.stringify(badgeJson, null, 2));
}

// Copy full coverage report to dist/coverage if dist exists
const coverageDir = path.resolve(rootDir, 'coverage');
if (fs.existsSync(coverageDir) && fs.existsSync(path.resolve(rootDir, 'dist'))) {
  fs.cpSync(coverageDir, distCoverageDir, { recursive: true });
  console.log(`✅ Bundled coverage report and badges to dist/coverage (${linePct}%)`);
} else {
  console.log(`✅ Generated coverage badges (${linePct}%)`);
}
