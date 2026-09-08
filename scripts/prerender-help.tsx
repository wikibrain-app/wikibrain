// Pre-render the public help page (zh-TW and en) to static HTML after `vite build`, so crawlers and AI search engines
// get the full content (SEO / AEO / GEO). The SPA still takes over in the browser; nothing else changes.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes, StaticRouter } from 'react-router';
import { LangProvider, type Lang } from '../web/src/i18n/index';
import Help from '../web/src/pages/Help';
import Landing from '../web/src/pages/Landing';
import Legal from '../web/src/pages/Legal';
import { legalDocs } from '../web/src/pages/legal/content';
import Compare from '../web/src/pages/Compare';
import { compareDocs } from '../web/src/pages/compare/content';
import * as zhTW from '../web/src/pages/help/zh-TW';
import * as en from '../web/src/pages/help/en';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'web', 'dist');
const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) { console.error('web/dist/index.html not found; run vite build first'); process.exit(1); }
const index = readFileSync(indexPath, 'utf8');
const appUrl = (process.env.APP_URL ?? 'https://example.com').replace(/\/$/, '');
const name = 'WikiBrain';

const meta: Record<Lang, { title: string; description: string; htmlLang: string }> = {
  'zh-TW': { title: `${name} 說明 — Karpathy LLM Wiki 模式的託管實作`, description: 'WikiBrain 把你的來源交給 AI agent 編纂成持久、互相連結的 Markdown wiki；Cursor、Claude、ChatGPT 透過 MCP 讀寫同一座 wiki。三層架構、Ingest／Query／Lint、書目與 Zotero、開源可自架。', htmlLang: 'zh-Hant-TW' },
  en: { title: `${name} Help — a hosted Karpathy LLM Wiki`, description: 'WikiBrain has an AI agent compile your sources into a persistent, interlinked Markdown wiki that Cursor, Claude and ChatGPT read and write through MCP. Three layers, Ingest / Query / Lint, bibliography and Zotero, open source and self-hostable.', htmlLang: 'en' },
};
const jsonLd = (lang: Lang) => JSON.stringify({
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name, applicationCategory: 'ProductivityApplication', operatingSystem: 'Web',
  description: meta[lang].description, url: appUrl, inLanguage: lang === 'en' ? 'en' : 'zh-Hant',
  offers: [
    { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Pro', price: '6', priceCurrency: 'USD', billingIncrement: 'P1M' },
  ],
  license: 'https://www.gnu.org/licenses/agpl-3.0.html',
});

for (const lang of ['zh-TW', 'en'] as Lang[]) for (const page of (lang === 'en' ? en : zhTW).pages) {
  const path = page.slug === 'start' ? '/help' : `/help/${page.slug}`;
  const markup = renderToStaticMarkup(createElement(StaticRouter, { location: path }, createElement(LangProvider, { initial: lang }, createElement(Routes, null, createElement(Route, { path: '/help', element: createElement(Help, { signedIn: false }) }), createElement(Route, { path: '/help/:page', element: createElement(Help, { signedIn: false }) })))));
  const other = lang === 'en' ? 'zh-TW' : 'en';
  const title = page.slug === 'start' ? meta[lang].title : `${page.title} — ${name} ${lang === 'en' ? 'Help' : '說明'}`;
  const description = page.slug === 'start' ? meta[lang].description : page.lede;
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description.replace(/"/g, '&quot;')}">`,
    `<link rel="canonical" href="${appUrl}${path}${lang === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="${meta[lang].htmlLang}" href="${appUrl}${path}${lang === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="${meta[other].htmlLang}" href="${appUrl}${path}${other === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="x-default" href="${appUrl}${path}">`,
    `<meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description.replace(/"/g, '&quot;')}"><meta property="og:url" content="${appUrl}${path}"><meta property="og:image" content="${appUrl}/help/${lang}/home.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${jsonLd(lang)}</script>`,
    ...(page.slug === 'plans' ? [`<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: (lang === 'en' ? en : zhTW).faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) })}</script>`] : []),
  ].join('\n    ');
  let html = index.replace(/<title>[^<]*<\/title>/, head).replace('<html lang="zh-Hant">', `<html lang="${meta[lang].htmlLang}">`);
  html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
  const out = join(dist, `help.${page.slug}${lang === 'en' ? '.en' : ''}.html`);
  writeFileSync(out, html);
  console.log(`prerendered ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}

// Legal pages (/privacy, /terms), both languages.
for (const lang of ['zh-TW', 'en'] as Lang[]) for (const doc of legalDocs) {
  const path = `/${doc.slug}`;
  const markup = renderToStaticMarkup(createElement(StaticRouter, { location: path }, createElement(LangProvider, { initial: lang }, createElement(Routes, null, createElement(Route, { path, element: createElement(Legal, { slug: doc.slug, signedIn: false }) })))));
  const other = lang === 'en' ? 'zh-TW' : 'en';
  const title = `${doc.title[lang]} — ${name}`;
  const description = lang === 'en' ? `${doc.title.en} of the WikiBrain hosted service (wikibrain.app).` : `WikiBrain 託管服務（wikibrain.app）的${doc.title['zh-TW']}。`;
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<link rel="canonical" href="${appUrl}${path}${lang === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="${meta[lang].htmlLang}" href="${appUrl}${path}${lang === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="${meta[other].htmlLang}" href="${appUrl}${path}${other === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="x-default" href="${appUrl}${path}">`,
    `<meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${appUrl}${path}">`,
  ].join('\n    ');
  let html = index.replace(/<title>[^<]*<\/title>/, head).replace('<html lang="zh-Hant">', `<html lang="${meta[lang].htmlLang}">`);
  html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
  const out = join(dist, `legal.${doc.slug}${lang === 'en' ? '.en' : ''}.html`);
  writeFileSync(out, html);
  console.log(`prerendered ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}

// Comparison pages (/compare and /compare/<slug>): content marketing for people searching "X vs Y".
for (const lang of ['zh-TW', 'en'] as Lang[]) for (const doc of [null, ...compareDocs]) {
  const path = doc ? `/compare/${doc.slug}` : '/compare';
  const markup = renderToStaticMarkup(createElement(StaticRouter, { location: path }, createElement(LangProvider, { initial: lang }, createElement(Routes, null, createElement(Route, { path: '/compare', element: createElement(Compare, { signedIn: false }) }), createElement(Route, { path: '/compare/:slug', element: createElement(Compare, { signedIn: false }) })))));
  const other = lang === 'en' ? 'zh-TW' : 'en';
  const title = doc ? `${doc.title[lang]} — ${name}` : (lang === 'en' ? `Compare WikiBrain with NotebookLM, Obsidian and Hjarni — ${name}` : `WikiBrain 與 NotebookLM、Obsidian、Hjarni 的比較 — ${name}`);
  const description = doc ? doc.lede[lang] : (lang === 'en' ? 'Honest, dated comparisons: when to choose the other tool, when to choose WikiBrain, and the trade-offs we admit.' : '誠實、有查證日期的比較：什麼時候該選對方、什麼時候該選 WikiBrain、我們承認的取捨。');
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description.replace(/"/g, '&quot;')}">`,
    `<link rel="canonical" href="${appUrl}${path}${lang === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="${meta[lang].htmlLang}" href="${appUrl}${path}${lang === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="${meta[other].htmlLang}" href="${appUrl}${path}${other === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="x-default" href="${appUrl}${path}">`,
    `<meta property="og:type" content="article"><meta property="og:title" content="${title}"><meta property="og:description" content="${description.replace(/"/g, '&quot;')}"><meta property="og:url" content="${appUrl}${path}">`,
  ].join('\n    ');
  let html = index.replace(/<title>[^<]*<\/title>/, head).replace('<html lang="zh-Hant">', `<html lang="${meta[lang].htmlLang}">`);
  html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
  const out = join(dist, `compare${doc ? '.' + doc.slug : ''}${lang === 'en' ? '.en' : ''}.html`);
  writeFileSync(out, html);
  console.log(`prerendered ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}

// Landing page for signed-out visitors (served by Express for GET / when no session cookie is present).
for (const lang of ['zh-TW', 'en'] as Lang[]) {
  const markup = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(LangProvider, { initial: lang }, createElement(Routes, null, createElement(Route, { path: '/', element: createElement(Landing) })))));
  const other = lang === 'en' ? 'zh-TW' : 'en';
  const title = lang === 'en' ? `${name} — an AI compiles your sources into a wiki` : `${name} — AI 替你把來源編成 wiki`;
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${meta[lang].description.replace(/"/g, '&quot;')}">`,
    `<link rel="canonical" href="${appUrl}/${lang === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="${meta[lang].htmlLang}" href="${appUrl}/${lang === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="${meta[other].htmlLang}" href="${appUrl}/${other === 'en' ? '?lang=en' : ''}">`,
    `<link rel="alternate" hreflang="x-default" href="${appUrl}/">`,
    `<meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${meta[lang].description.replace(/"/g, '&quot;')}"><meta property="og:url" content="${appUrl}/"><meta property="og:image" content="${appUrl}/help/${lang}/home.png">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<script type="application/ld+json">${jsonLd(lang)}</script>`,
  ].join('\n    ');
  let html = index.replace(/<title>[^<]*<\/title>/, head).replace('<html lang="zh-Hant">', `<html lang="${meta[lang].htmlLang}">`);
  html = html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`);
  const out = join(dist, `landing${lang === 'en' ? '.en' : ''}.html`);
  writeFileSync(out, html);
  console.log(`prerendered ${out} (${(html.length / 1024).toFixed(0)} KB)`);
}
