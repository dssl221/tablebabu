import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

function origin(value, label) {
  if (!value) throw new Error(`${label} is required; deploy the backend first.`);
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.origin !== value || /[\s<>"']/.test(value)) throw new Error(`${label} must be an exact HTTPS origin, without a path or trailing slash.`);
  return value;
}
const app = origin(process.env.TABLEBABU_APP_ORIGIN, 'TABLEBABU_APP_ORIGIN');
const site = origin(process.env.URL || process.env.TABLEBABU_SITE_ORIGIN, 'URL or TABLEBABU_SITE_ORIGIN');
if (app === site) throw new Error('Application and Netlify origins must differ to avoid redirect loops.');
execFileSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], { stdio: 'inherit', env: { ...process.env, APP_ORIGIN: site } });
const routes = ['/contact', '/get-started', '/login', '/signup', '/onboarding', '/dashboard', '/control-room', '/r', '/legal'];
await writeFile('out/_redirects', routes.flatMap(route => [`${route} ${app}${route} 302!`, `${route}/* ${app}${route}/:splat 302!`]).join('\n') + '\n');
// Static pages use script hashes instead of the Node app's per-request nonce.
const hashes = new Set();
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/\bsrc\s*=/i.test(match[1])) hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
      }
    }
  }
}
await scan('out');
await writeFile('out/_headers', `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' ${[...hashes].join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'\n/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
await writeFile('out/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
await writeFile('out/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site}/</loc></url></urlset>\n`);
console.log(`Website built. Application navigation redirects to ${app}.`);
