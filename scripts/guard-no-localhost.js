import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function listFiles(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (['node_modules', 'dist', 'build', '.netlify'].includes(f)) continue;
      listFiles(p, acc);
    } else if (/\.(t|j)sx?$/.test(f)) {
      acc.push(p);
    }
  }
  return acc;
}

const srcDir = path.join(projectRoot, 'src');
const files = listFiles(srcDir);
const offenders = [];

for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  // Skip files that only contain localhost in regex patterns or comments (security checks)
  const lines = text.split('\n');
  let hasHardcodedLocalhost = false;

  for (const line of lines) {
    // Skip regex patterns and comments that check for localhost
    if (/^\s*\/\//.test(line)) continue;
    if (/\/.*localhost.*\//.test(line)) continue;
    if (/\(.*localhost.*\)/.test(line) && /test\(/.test(line)) continue;

    // Check for actual localhost URLs
    if (/['"]https?:\/\/localhost/.test(line) || /['"]https?:\/\/127\.0\.0\.1/.test(line)) {
      hasHardcodedLocalhost = true;
      break;
    }
  }

  if (hasHardcodedLocalhost) {
    offenders.push(f);
  }
}

if (offenders.length) {
  console.error('\n❌ Build blocked: "localhost" found in source files:\n' + offenders.map(x => ' - ' + x).join('\n'));
  process.exit(1);
} else {
  console.log('✅ No localhost references in src/');
}
