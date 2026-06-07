import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCHOLAR_ID = 'tMZ30p8AAAAJ';
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT_DIR, 'data', 'scholar-stats.json');
const SOURCE_URL = `https://scholar.google.com/citations?user=${SCHOLAR_ID}&hl=en`;

const html = await fetchScholarProfile(SOURCE_URL);
const citations = parseScholarCitations(html);

if (citations === null) {
  throw new Error('Could not find Google Scholar citation count in the profile page.');
}

const existing = await readExistingStats();
const stats = {
  scholarId: SCHOLAR_ID,
  citations,
  updated: new Date().toISOString(),
  source: 'Google Scholar',
  sourceUrl: `https://scholar.google.com/citations?user=${SCHOLAR_ID}`
};

if (existing && existing.citations === stats.citations && existing.source === stats.source) {
  stats.updated = existing.updated;
}

await writeFile(OUTPUT_PATH, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
console.log(`Google Scholar citations: ${stats.citations}`);

async function fetchScholarProfile(url) {
  const response = await fetch(url, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`Google Scholar returned HTTP ${response.status}`);
  }

  return response.text();
}

async function readExistingStats() {
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, 'utf8'));
  } catch (error) {
    return null;
  }
}

function parseScholarCitations(html) {
  const patterns = [
    /id="gsc_rsb_st"[\s\S]*?Citations[\s\S]*?<td[^>]*class="[^"]*gsc_rsb_std[^"]*"[^>]*>\s*([\d,]+)\s*<\/td>/i,
    /<td[^>]*class="[^"]*gsc_rsb_std[^"]*"[^>]*>\s*([\d,]+)\s*<\/td>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;

    const value = Number.parseInt(match[1].replace(/,/g, ''), 10);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}
