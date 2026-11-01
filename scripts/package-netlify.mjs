import { mkdir, readFile, writeFile, copyFile, cp } from 'node:fs/promises';
import path from 'node:path';

// Explicit allowlists: never copy local credentials, databases, uploads or logs.
const root = process.cwd();
const destination = path.join(root, 'artifacts', `netlify-package-${Date.now()}`);
const website = path.join(destination, 'website');
const backend = path.join(destination, 'backend');
async function copy(relative, target, renamed = relative) {
  const output = path.join(target, renamed);
  await mkdir(path.dirname(output), { recursive: true });
  await copyFile(path.join(root, relative), output);
}
await mkdir(website, { recursive: true });
await mkdir(backend, { recursive: true });
for (const directory of ['src', 'prisma', 'public', 'tests']) {
  await cp(path.join(root, directory), path.join(backend, directory), { recursive: true });
}
for (const file of ['package.json', 'package-lock.json', 'server.ts', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'postcss.config.mjs', 'Dockerfile', '.dockerignore', '.gitignore', 'README.md', 'SECURITY.md', 'INDIA-COMPLIANCE.md', 'vitest.config.ts', 'playwright.config.ts']) {
  await copy(file, backend);
}
// Deployment/admin scripts only; no temporary scripts or local database payloads.
for (const file of ['create-platform-admin.ts', 'create-restaurant.ts']) await copy(`scripts/${file}`, backend);
await writeFile(path.join(backend, '.env.example'), 'DATABASE_URL="postgresql://USER:PASSWORD@DB_HOST:5432/tablebabu?schema=public"\nAPP_ORIGIN="https://app.YOUR-DOMAIN.example"\nPORT=3000\nTRUST_PROXY=0\nORDER_DIAGNOSTICS=0\n');
for (const file of ['src/app/page.tsx', 'src/app/home.module.css', 'src/app/globals.css', 'src/components/home-interactions.tsx', 'src/components/platform-cards.tsx', 'src/components/platform-cards.module.css', 'src/components/legal-links.tsx', 'src/lib/legal.ts', 'src/lib/public-origin.ts', 'src/lib/site-content.ts', 'src/lib/festival-themes.ts', 'src/components/festival-banner.tsx', 'postcss.config.mjs', 'tsconfig.json', 'next-env.d.ts']) await copy(file, website);
for (const file of ['restaurant.webp', 'lassi.webp', 'biryani.webp', 'CREDITS.md', 'product/dashboard.webp', 'product/menu-management.webp', 'product/customer-menu.webp', 'product/README.md']) await copy(`public/images/${file}`, website);
// Backend-bound navigation must be a full document navigation, not a Next RSC fetch.
for (const file of ['src/app/page.tsx', 'src/components/home-interactions.tsx', 'src/components/platform-cards.tsx', 'src/components/legal-links.tsx']) {
  const location = path.join(website, file);
  let source = await readFile(location, 'utf8');
  source = source.replace('import Link from "next/link";', '').replace(/<Link\b/g, '<a').replace(/<\/Link>/g, '</a>');
  if (file === 'src/app/page.tsx') {
    source = source.replace('import { readHomepage } from "@/server/site-content";', 'import { defaultSiteContent } from "@/lib/site-content";\nconst readHomepage = async (_preview: boolean) => defaultSiteContent;');
    source = source.replaceAll('(await searchParams).preview === "1"', 'false');
  }
  await writeFile(location, source);
}
await writeFile(path.join(website, 'src/app/layout.tsx'), 'import "./globals.css";\nexport default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }\n');
await copy('deployment/netlify/build.mjs', website, 'build.mjs');
await copy('deployment/netlify/netlify.toml', website, 'netlify.toml');
await writeFile(path.join(website, 'next.config.mjs'), 'export default { output: "export", trailingSlash: true, poweredByHeader: false, images: { unoptimized: true }, turbopack: { root: process.cwd() } };\n');
const original = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const dependencies = {};
const devDependencies = {};
for (const name of ['next', 'react', 'react-dom', 'lucide-react', 'zod']) dependencies[name] = original.dependencies[name];
for (const name of ['@tailwindcss/postcss', 'tailwindcss', 'typescript', '@types/node', '@types/react', '@types/react-dom']) devDependencies[name] = original.devDependencies[name];
await writeFile(path.join(website, 'package.json'), JSON.stringify({ name: 'tablebabu-netlify-website', version: '1.0.0', private: true, type: 'module', scripts: { build: 'node build.mjs' }, engines: { node: '>=24' }, dependencies, devDependencies }, null, 2));
const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
lock.name = 'tablebabu-netlify-website';
Object.assign(lock.packages[''], { name: lock.name, dependencies, devDependencies });
await writeFile(path.join(website, 'package-lock.json'), JSON.stringify(lock, null, 2));
await writeFile(path.join(website, '.gitignore'), 'node_modules/\n.next/\nout/\n.env*\n');
await copy('deployment/netlify/README.md', destination, 'README.md');
console.log(destination);
