import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const roots = ["src", "public"];
const bad = /netlify-identity|netlify\.identity|gotrue(-js)?(?!@supabase)/i;

function scan(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) scan(p);
    else if (/\.(js|ts|jsx|tsx|html)$/i.test(p)) {
      const s = fs.readFileSync(p, "utf8");
      if (bad.test(s)) {
        console.error(`❌ Netlify Identity reference found in: ${p}`);
        process.exit(1);
      }
    }
  }
}

roots
  .map(r => path.join(projectRoot, r))
  .filter(fs.existsSync)
  .forEach(scan);

console.log("✅ No Netlify Identity references found.");
