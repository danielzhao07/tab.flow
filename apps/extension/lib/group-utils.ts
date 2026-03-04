import type { TabInfo } from '@/lib/types';

export function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

// Well-known domains → human-friendly short names
const DOMAIN_NAME_HINTS: Record<string, string> = {
  // Video / Media
  'youtube.com': 'YouTube', 'youtu.be': 'YouTube',
  'netflix.com': 'Netflix', 'twitch.tv': 'Twitch',
  'vimeo.com': 'Vimeo', 'hulu.com': 'Hulu',
  'disneyplus.com': 'Disney+', 'primevideo.com': 'Prime Video',
  'music.youtube.com': 'YT Music',

  // Social
  'twitter.com': 'Twitter', 'x.com': 'X',
  'facebook.com': 'Facebook', 'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn', 'reddit.com': 'Reddit',
  'tiktok.com': 'TikTok', 'pinterest.com': 'Pinterest',
  'discord.com': 'Discord', 'slack.com': 'Slack',
  'whatsapp.com': 'WhatsApp', 'telegram.org': 'Telegram',
  'snapchat.com': 'Snapchat',

  // Google services (subdomains before base domain so exact match wins)
  'mail.google.com': 'Gmail',
  'docs.google.com': 'Google Docs',
  'drive.google.com': 'Google Drive',
  'sheets.google.com': 'Google Sheets',
  'slides.google.com': 'Google Slides',
  'calendar.google.com': 'Calendar',
  'meet.google.com': 'Google Meet',
  'maps.google.com': 'Google Maps',
  'photos.google.com': 'Photos',
  'news.google.com': 'Google News',
  'cloud.google.com': 'Google Cloud',
  'gemini.google.com': 'Gemini',
  'gmail.com': 'Gmail',
  'google.com': 'Google',

  // Microsoft
  'outlook.live.com': 'Outlook', 'outlook.com': 'Outlook',
  'teams.microsoft.com': 'Teams',
  'office.com': 'Office',
  'microsoft.com': 'Microsoft',
  'onedrive.live.com': 'OneDrive',

  // Apple
  'music.apple.com': 'Apple Music',
  'icloud.com': 'iCloud',
  'apple.com': 'Apple',

  // Dev / Tech
  'github.com': 'GitHub', 'gitlab.com': 'GitLab',
  'bitbucket.org': 'Bitbucket',
  'stackoverflow.com': 'Stack Overflow',
  'developer.mozilla.org': 'MDN',
  'npmjs.com': 'npm', 'pypi.org': 'PyPI',
  'news.ycombinator.com': 'Hacker News',
  'vercel.com': 'Vercel', 'netlify.com': 'Netlify',
  'heroku.com': 'Heroku',
  'codepen.io': 'CodePen', 'codesandbox.io': 'CodeSandbox',
  'replit.com': 'Replit',
  'jira.atlassian.com': 'Jira',
  'confluence.atlassian.com': 'Confluence',

  // AI
  'chat.openai.com': 'ChatGPT', 'openai.com': 'OpenAI',
  'claude.ai': 'Claude', 'anthropic.com': 'Anthropic',
  'bard.google.com': 'Gemini',
  'perplexity.ai': 'Perplexity',
  'huggingface.co': 'HuggingFace',

  // Productivity
  'notion.so': 'Notion', 'obsidian.md': 'Obsidian',
  'figma.com': 'Figma', 'airtable.com': 'Airtable',
  'trello.com': 'Trello', 'asana.com': 'Asana',
  'miro.com': 'Miro', 'linear.app': 'Linear',
  'monday.com': 'Monday', 'dropbox.com': 'Dropbox',

  // Shopping
  'amazon.com': 'Amazon', 'amazon.ca': 'Amazon',
  'amazon.co.uk': 'Amazon', 'amazon.de': 'Amazon',
  'ebay.com': 'eBay', 'etsy.com': 'Etsy',

  // Music
  'spotify.com': 'Spotify', 'soundcloud.com': 'SoundCloud',

  // News
  'nytimes.com': 'NY Times', 'theguardian.com': 'Guardian',
  'bbc.com': 'BBC', 'bbc.co.uk': 'BBC',
  'cnn.com': 'CNN', 'techcrunch.com': 'TechCrunch',
  'theverge.com': 'The Verge', 'wired.com': 'Wired',
};

/**
 * Returns a human-friendly group title for a domain.
 * Checks an exact lookup table first, then the base domain (strips one subdomain level),
 * then falls back to capitalising the first segment.
 */
export function getGroupTitle(domain: string): string {
  if (!domain) return '';
  // Exact match
  if (DOMAIN_NAME_HINTS[domain]) return DOMAIN_NAME_HINTS[domain];
  // Try base domain (e.g. docs.google.com → google.com)
  const parts = domain.split('.');
  if (parts.length > 2) {
    const baseDomain = parts.slice(-2).join('.');
    if (DOMAIN_NAME_HINTS[baseDomain]) return DOMAIN_NAME_HINTS[baseDomain];
  }
  // Fallback: capitalise first segment
  const first = parts[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : domain;
}

// ── Smart group naming ──────────────────────────────────────────────────────

/**
 * Generate a smart group name by analyzing tab titles, URLs, and optional meta descriptions.
 * Priority: shared bigram → shared keyword → description keywords → URL path segment → domain.
 * @param tabs The tabs to name the group for
 * @param descriptions Optional map of tabId → meta description / h1 text from the page
 */
export function getSmartGroupName(tabs: TabInfo[], descriptions?: Record<number, string>): string {
  if (tabs.length === 0) return '';
  if (tabs.length === 1) return getGroupTitle(getDomain(tabs[0].url));

  // Combine title + description into a single text per tab for richer keyword extraction
  const textForTab = (tab: TabInfo): string => {
    const desc = descriptions?.[tab.tabId];
    return desc ? `${tab.title} ${desc}` : tab.title;
  };

  // 1. Try shared bigrams across tab titles + descriptions (most descriptive)
  const bigramCounts = new Map<string, number>();
  for (const tab of tabs) {
    for (const bg of new Set(titleBigrams(textForTab(tab)))) {
      bigramCounts.set(bg, (bigramCounts.get(bg) ?? 0) + 1);
    }
  }
  const bestBigram = [...bigramCounts.entries()]
    .filter(([, c]) => c >= 2 && c >= tabs.length * 0.4)
    .sort((a, b) => b[1] - a[1])[0];
  if (bestBigram) return capitalize(bestBigram[0]);

  // 2. Try shared keywords across titles + descriptions
  const wordCounts = new Map<string, number>();
  for (const tab of tabs) {
    for (const w of new Set(titleKeywords(textForTab(tab)))) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
  }
  const bestWord = [...wordCounts.entries()]
    .filter(([, c]) => c >= 2 && c >= tabs.length * 0.4)
    .sort((a, b) => b[1] - a[1])[0];
  if (bestWord) return capitalize(bestWord[0]);

  // 3. Try shared URL path segments (e.g. /docs/, /api/, /learn/)
  const pathSegCounts = new Map<string, number>();
  for (const tab of tabs) {
    try {
      const segments = new URL(tab.url).pathname.split('/').filter((s) => s.length >= 3 && !/^\d+$/.test(s));
      for (const seg of new Set(segments)) {
        const clean = seg.replace(/[-_]/g, ' ').toLowerCase();
        if (!STOP_WORDS.has(clean) && clean.length >= 3) {
          pathSegCounts.set(clean, (pathSegCounts.get(clean) ?? 0) + 1);
        }
      }
    } catch { /* ignore invalid URLs */ }
  }
  const bestSeg = [...pathSegCounts.entries()]
    .filter(([, c]) => c >= 2 && c >= tabs.length * 0.4)
    .sort((a, b) => b[1] - a[1])[0];
  if (bestSeg) return capitalize(bestSeg[0]);

  // 4. Domain fallback — use the most common domain
  const domainCounts = new Map<string, number>();
  for (const tab of tabs) {
    const d = getDomain(tab.url);
    if (d) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  let topDomain = '';
  let topCount = 0;
  for (const [d, c] of domainCounts) { if (c > topCount) { topDomain = d; topCount = c; } }
  return getGroupTitle(topDomain);
}

// ── Smart group suggestions ──────────────────────────────────────────────────

// Words that are too generic to form a meaningful cluster label
const STOP_WORDS = new Set([
  // Short connectors (most filtered by length ≥4 already)
  'this', 'that', 'with', 'from', 'into', 'over', 'under', 'about', 'through',
  'which', 'what', 'when', 'where', 'have', 'will', 'would', 'could', 'should',
  'they', 'them', 'their', 'your', 'mine', 'just', 'like', 'also', 'here',
  'then', 'than', 'most', 'some', 'more', 'much', 'each', 'such', 'been',
  'does', 'done', 'were', 'been', 'have', 'make', 'take', 'give', 'keep',
  // Web/UI noise
  'home', 'page', 'site', 'next', 'back', 'open', 'sign', 'view', 'show',
  'find', 'help', 'info', 'search', 'close', 'login', 'with', 'from',
  // Content noise
  'part', 'step', 'full', 'free', 'best', 'news', 'post', 'read', 'blog',
]);

function capitalize(s: string): string {
  return s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Strip trailing site attribution like "- GitHub", "| Reddit", "· Hacker News" */
function cleanTitle(title: string): string {
  return title.replace(/\s*[\|·•\-–—]\s*[A-Z][^|\-]{1,25}$/, '').trim() || title;
}

function titleWords(title: string): string[] {
  return cleanTitle(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w));
}

function titleKeywords(title: string): string[] {
  return titleWords(title).filter((w) => !STOP_WORDS.has(w));
}

/** Adjacent keyword pairs from a title (both words must be ≥4 chars, non-stop) */
function titleBigrams(title: string): string[] {
  const words = titleWords(title);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    if (!STOP_WORDS.has(a) && !STOP_WORDS.has(b)) bigrams.push(`${a} ${b}`);
  }
  return bigrams;
}

export interface SmartSuggestion {
  label: string;
  tabIds: number[];
}

/**
 * Suggests tab groups smarter than pure-domain clustering.
 * Priority: bigram keyword clusters → unigram keyword clusters → domain fallback.
 * Tabs already in a group are excluded. At most 4 suggestions returned.
 * @param descriptions Optional map of tabId → meta description text for richer context
 */
export function getSmartSuggestions(tabs: TabInfo[], existingTitles: Set<string>, descriptions?: Record<number, string>): SmartSuggestion[] {
  // Build inverted indexes using titles + descriptions
  const bigramMap = new Map<string, TabInfo[]>();
  const wordMap = new Map<string, TabInfo[]>();

  for (const tab of tabs) {
    const text = descriptions?.[tab.tabId] ? `${tab.title} ${descriptions[tab.tabId]}` : tab.title;
    for (const bg of new Set(titleBigrams(text))) {
      const list = bigramMap.get(bg) ?? [];
      list.push(tab);
      bigramMap.set(bg, list);
    }
    for (const w of new Set(titleKeywords(text))) {
      const list = wordMap.get(w) ?? [];
      list.push(tab);
      wordMap.set(w, list);
    }
  }

  const used = new Set<number>();
  const results: SmartSuggestion[] = [];

  const tryAdd = (label: string, matching: TabInfo[]) => {
    if (results.length >= 4) return;
    if (existingTitles.has(label.toLowerCase())) return;
    const fresh = matching.filter((t) => !used.has(t.tabId));
    if (fresh.length < 2) return;
    results.push({ label, tabIds: fresh.map((t) => t.tabId) });
    for (const t of fresh) used.add(t.tabId);
  };

  // 1. Bigrams (most specific — e.g. "React Hooks", "Machine Learning")
  [...bigramMap.entries()]
    .filter(([, ts]) => ts.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([bg, ts]) => tryAdd(capitalize(bg), ts));

  // 2. Unigrams (e.g. "React", "Python", "Figma")
  [...wordMap.entries()]
    .filter(([, ts]) => ts.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([w, ts]) => tryAdd(capitalize(w), ts));

  // 3. Domain fallback for tabs not claimed above
  const remaining = tabs.filter((t) => !used.has(t.tabId));
  const domainMap = new Map<string, TabInfo[]>();
  for (const tab of remaining) {
    const d = getDomain(tab.url);
    if (d) { const list = domainMap.get(d) ?? []; list.push(tab); domainMap.set(d, list); }
  }
  [...domainMap.entries()]
    .filter(([, ts]) => ts.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([d, ts]) => tryAdd(getGroupTitle(d), ts));

  return results;
}
