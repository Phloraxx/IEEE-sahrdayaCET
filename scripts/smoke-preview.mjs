const base = new URL(process.env.PREVIEW_BASE || 'https://preview-ieee-website-rcffnz-4ymcbv.ieeesahrdaya.com');
const pbBase = new URL(process.env.PUBLIC_POCKETBASE_URL || 'https://db.ieeesahrdaya.com');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'IEEE-Sahrdaya-preview-smoke/1.0' },
  });
  return { res, text: await res.text() };
}

function internalLinks(html, currentUrl) {
  const links = new Set();
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], currentUrl);
      if (url.origin !== base.origin) continue;
      if (/\.(?:css|js|mjs|png|jpe?g|webp|svg|ico|woff2?|ttf|mp4|webm|mov|pdf)$/i.test(url.pathname)) continue;
      if (/^\/(?:api|pb|admin)(?:\/|$)/.test(url.pathname)) continue;
      links.add(url.pathname.replace(/\/+$/, '') || '/');
    } catch {}
  }
  return links;
}

async function waitForPreview() {
  let last = '';
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const { res, text } = await get(new URL('/blog', base));
      last = `${res.status} ${res.url}`;
      if (res.ok && !text.includes('No published stories yet')) return;
    } catch (err) {
      last = String(err);
    }
    console.log(`[wait] preview not ready (${attempt}/30): ${last}`);
    await sleep(10_000);
  }
  throw new Error(`Preview never became ready: ${last}`);
}

await waitForPreview();

const pbUrl = new URL('/api/collections/blogs/records', pbBase);
pbUrl.searchParams.set('filter', 'published = true');
pbUrl.searchParams.set('sort', '-published_at,-created');
pbUrl.searchParams.set('perPage', '100');
pbUrl.searchParams.set('fields', 'id,title,slug');
const pb = await fetch(pbUrl).then((r) => {
  if (!r.ok) throw new Error(`PocketBase published list failed: ${r.status}`);
  return r.json();
});
const published = Array.isArray(pb.items) ? pb.items : [];
if (published.length === 0) throw new Error('PocketBase reports zero published blogs');

const required = new Map([
  ['/', 'home'],
  ['/blog', 'blog archive'],
]);
for (const post of published) required.set(`/blog/${post.slug}`, `blog: ${post.title}`);

const queue = [...required.keys()];
const seen = new Set();
const failures = [];
const checks = [];
const maxPages = 150;

while (queue.length && seen.size < maxPages) {
  const path = queue.shift();
  if (!path || seen.has(path)) continue;
  seen.add(path);
  const url = new URL(path, base);
  try {
    const { res, text } = await get(url);
    checks.push({ path, status: res.status, finalUrl: res.url });
    if (!res.ok) {
      failures.push(`${path}: HTTP ${res.status}`);
      continue;
    }
    if (path === '/blog' && text.includes('No published stories yet')) {
      failures.push('/blog: rendered the false empty state');
    }
    const post = published.find((item) => `/blog/${item.slug}` === path);
    if (post && !text.toLowerCase().includes(String(post.title).trim().toLowerCase())) {
      failures.push(`${path}: article title missing from SSR HTML`);
    }
    for (const next of internalLinks(text, res.url)) {
      if (!seen.has(next)) queue.push(next);
    }
  } catch (err) {
    failures.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

for (const [path, label] of required) {
  if (!seen.has(path)) failures.push(`${path}: required page not checked (${label})`);
}

console.log(`\nPreview: ${base.origin}`);
console.log(`Published blogs expected: ${published.length}`);
console.log(`Public pages checked: ${checks.length}`);
for (const row of checks.sort((a, b) => a.path.localeCompare(b.path))) {
  console.log(`${row.status} ${row.path}${row.finalUrl !== new URL(row.path, base).href ? ` -> ${row.finalUrl}` : ''}`);
}

if (failures.length) {
  console.error(`\nFAILURES (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('\nAll crawled public preview pages passed.');
