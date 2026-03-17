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

  // 0. Check cross-domain semantic category (AI Chats, Social, etc.)
  const catCounts = new Map<string, { count: number; label: string }>();
  for (const tab of tabs) {
    const cat = getDomainSemanticCategory(getDomain(tab.url));
    if (cat) {
      const entry = catCounts.get(cat.category) ?? { count: 0, label: cat.label };
      entry.count++;
      catCounts.set(cat.category, entry);
    }
  }
  const topCat = [...catCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  // Use semantic category if it covers most tabs AND tabs span multiple domains
  if (topCat && topCat[1].count >= tabs.length * 0.6) {
    const domains = new Set(tabs.map((t) => getDomain(t.url)));
    if (domains.size >= 2) return topCat[1].label;
  }

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

  // 4. Domain fallback — qualify with content type when possible
  const domainCounts = new Map<string, number>();
  for (const tab of tabs) {
    const d = getDomain(tab.url);
    if (d) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  let topDomain = '';
  let topDomainCount = 0;
  for (const [d, c] of domainCounts) { if (c > topDomainCount) { topDomain = d; topDomainCount = c; } }
  // Search engine tabs get "Search" instead of the engine name
  if (isSearchEngineDomain(topDomain)) return 'Search';
  const domainName = getGroupTitle(topDomain);
  // Try to qualify with content type (e.g. "GitHub Issues", "YouTube Videos")
  const contentTypes = tabs.map((t) => detectContentType(t.url)).filter(Boolean) as string[];
  const ctCounts = new Map<string, number>();
  for (const ct of contentTypes) ctCounts.set(ct, (ctCounts.get(ct) ?? 0) + 1);
  const topCT = [...ctCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topCT && topCT[1] >= tabs.length * 0.5) return `${domainName} ${topCT[0]}`;
  // If tabs span multiple domains, try semantic category label
  if (topCat && topCat[1].count >= tabs.length * 0.4) return topCat[1].label;
  return domainName;
}

// ── Smart group suggestions ──────────────────────────────────────────────────

// Words that are too generic to form a meaningful cluster label
const STOP_WORDS = new Set([
  // 3-letter connectors, pronouns, auxiliary verbs
  'the', 'and', 'for', 'but', 'not', 'nor', 'yet', 'via', 'per',
  'you', 'her', 'him', 'his', 'its', 'our', 'she', 'who', 'all', 'one',
  'are', 'was', 'has', 'had', 'can', 'did', 'got', 'get', 'may', 'let',
  'how', 'why', 'any', 'few', 'own', 'ago', 'now', 'too', 'off', 'out',
  'are', 'ask', 'use', 'set', 'put', 'try', 'run', 'say', 'see', 'lot',
  'way', 'day', 'man', 'men', 'two', 'due', 'new', 'old', 'big', 'top',
  // 4-letter connectors and articles
  'this', 'that', 'with', 'from', 'into', 'over', 'under', 'about', 'through',
  'which', 'what', 'when', 'where', 'have', 'will', 'would', 'could', 'should',
  'they', 'them', 'their', 'your', 'mine', 'just', 'like', 'also', 'here',
  'then', 'than', 'most', 'some', 'more', 'much', 'each', 'such', 'been',
  'does', 'done', 'were', 'have', 'make', 'take', 'give', 'keep', 'said',
  'says', 'know', 'want', 'need', 'look', 'come', 'goes', 'went', 'came',
  // 5+-letter common words that bleed through
  'these', 'those', 'other', 'after', 'again', 'while', 'there', 'where',
  'every', 'never', 'still', 'always', 'first', 'second', 'third', 'being',
  'going', 'using', 'since', 'until', 'might', 'shall', 'ought', 'below',
  'above', 'along', 'among', 'right', 'think', 'thing', 'world', 'place',
  'great', 'large', 'small', 'before', 'between', 'around', 'during', 'across',
  // Time / academic temporal words (prevent "Winter", "Fall" as group names)
  'today', 'yesterday', 'tomorrow', 'daily', 'weekly', 'monthly',
  'week', 'month', 'year', 'time', 'days', 'hours', 'minutes',
  'winter', 'spring', 'summer', 'fall', 'autumn',
  'semester', 'term', 'lecture', 'section', 'midterm', 'final',
  'exam', 'assignment', 'quiz', 'chapter', 'module', 'unit', 'lab',
  // Generic content/web noise
  'home', 'page', 'site', 'next', 'back', 'open', 'sign', 'view', 'show',
  'find', 'help', 'info', 'search', 'close', 'login', 'with', 'from',
  'part', 'step', 'full', 'free', 'best', 'news', 'post', 'read', 'blog',
  'click', 'link', 'links', 'here', 'more', 'load', 'tabs', 'list', 'items',
  'update', 'latest', 'recent', 'review', 'guide', 'learn', 'start',
  'download', 'install', 'overview', 'getting', 'started',
  // Web UI / accessibility chrome (prevent "Accessibility Links" etc.)
  'accessibility', 'accessible', 'navigation', 'navigate', 'menu', 'main',
  'footer', 'header', 'sidebar', 'toggle', 'dropdown', 'modal', 'popup',
  'banner', 'cookie', 'cookies', 'consent', 'accept', 'reject', 'skip',
  'button', 'buttons', 'input', 'inputs', 'form', 'submit', 'cancel',
  'preferences', 'settings', 'results', 'showing', 'found', 'loading',
  // Generic web page titles / structure
  'content', 'course', 'index', 'welcome', 'dashboard', 'profile',
  'window', 'document', 'online', 'official', 'untitled', 'error',
  'account', 'general', 'community', 'detail', 'details', 'explore',
  'popular', 'trending', 'featured', 'recommended', 'related',
]);

/**
 * Synonym groups for label deduplication.
 * Words in the same group are considered equivalent when checking for similar labels.
 * Each word maps to a canonical form (the first entry in its group).
 */
const LABEL_SYNONYMS: Record<string, string> = (() => {
  const groups = [
    ['video', 'videos', 'youtube', 'watch', 'stream', 'streaming'],
    ['social', 'reddit', 'twitter', 'facebook', 'instagram', 'threads', 'bluesky'],
    ['chat', 'chats', 'messaging', 'messages', 'conversation', 'conversations'],
    ['code', 'coding', 'programming', 'development', 'dev'],
    ['docs', 'documentation', 'reference', 'manual', 'wiki'],
    ['music', 'audio', 'spotify', 'soundcloud', 'songs'],
    ['shop', 'shopping', 'store', 'marketplace', 'ecommerce'],
    ['mail', 'email', 'inbox', 'gmail', 'outlook'],
    ['school', 'education', 'university', 'courses', 'academic'],
    ['news', 'articles', 'headlines'],
    ['design', 'figma', 'canva'],
    ['ai', 'artificial', 'intelligence', 'claude', 'chatgpt', 'gemini', 'copilot'],
  ];
  const map: Record<string, string> = {};
  for (const group of groups) {
    const canonical = group[0];
    for (const word of group) map[word] = canonical;
  }
  return map;
})();

/** Normalize a label's words to canonical synonyms for dedup comparison */
function labelFingerprint(label: string): Set<string> {
  const words = label.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(words.map((w) => LABEL_SYNONYMS[w] ?? w));
}

// ── Education & academic detection ──────────────────────────────────────────

/** Hostname substrings that indicate educational / LMS platforms */
const EDUCATION_PATTERNS = [
  'learn', 'canvas', 'blackboard', 'brightspace', 'moodle', 'piazza',
  'gradescope', 'crowdmark', 'eclass', 'mycourses', 'd2l', 'courseware',
  'lms', 'edx', 'coursera', 'udemy', 'khanacademy',
];

/** Course code pattern: 2-5 uppercase letters followed by 3-4 digits (e.g. CS 246, MATH 135, ECE 105A) */
const COURSE_CODE_REGEX = /\b([A-Z]{2,5})\s*(\d{3,4}[A-Z]?)\b/g;

// ── Domain semantic categories (cross-domain grouping) ──────────────────────
// Maps domains to high-level categories so tabs from different sites that serve
// the same purpose (e.g. Claude + ChatGPT → "AI Chats") can be grouped together.
const DOMAIN_SEMANTIC_CATEGORY: Record<string, { category: string; label: string }> = {
  // AI
  'claude.ai': { category: 'ai', label: 'AI Chats' },
  'chat.openai.com': { category: 'ai', label: 'AI Chats' },
  'chatgpt.com': { category: 'ai', label: 'AI Chats' },
  'gemini.google.com': { category: 'ai', label: 'AI Chats' },
  'bard.google.com': { category: 'ai', label: 'AI Chats' },
  'perplexity.ai': { category: 'ai', label: 'AI Chats' },
  'huggingface.co': { category: 'ai', label: 'AI Chats' },
  'poe.com': { category: 'ai', label: 'AI Chats' },
  'copilot.microsoft.com': { category: 'ai', label: 'AI Chats' },

  // Dev
  'github.com': { category: 'dev', label: 'Dev' },
  'gitlab.com': { category: 'dev', label: 'Dev' },
  'bitbucket.org': { category: 'dev', label: 'Dev' },
  'stackoverflow.com': { category: 'dev', label: 'Dev' },
  'developer.mozilla.org': { category: 'dev', label: 'Dev Docs' },
  'npmjs.com': { category: 'dev', label: 'Dev' },
  'pypi.org': { category: 'dev', label: 'Dev' },
  'codepen.io': { category: 'dev', label: 'Dev' },
  'codesandbox.io': { category: 'dev', label: 'Dev' },
  'replit.com': { category: 'dev', label: 'Dev' },

  // Social
  'twitter.com': { category: 'social', label: 'Social' },
  'x.com': { category: 'social', label: 'Social' },
  'instagram.com': { category: 'social', label: 'Social' },
  'facebook.com': { category: 'social', label: 'Social' },
  'reddit.com': { category: 'social', label: 'Social' },
  'tiktok.com': { category: 'social', label: 'Social' },
  'linkedin.com': { category: 'social', label: 'Social' },
  'snapchat.com': { category: 'social', label: 'Social' },

  // Video / Streaming
  'youtube.com': { category: 'video', label: 'Videos' },
  'twitch.tv': { category: 'video', label: 'Streaming' },
  'netflix.com': { category: 'video', label: 'Streaming' },
  'hulu.com': { category: 'video', label: 'Streaming' },
  'disneyplus.com': { category: 'video', label: 'Streaming' },
  'primevideo.com': { category: 'video', label: 'Streaming' },
  'vimeo.com': { category: 'video', label: 'Videos' },

  // Shopping
  'amazon.com': { category: 'shopping', label: 'Shopping' },
  'amazon.ca': { category: 'shopping', label: 'Shopping' },
  'amazon.co.uk': { category: 'shopping', label: 'Shopping' },
  'ebay.com': { category: 'shopping', label: 'Shopping' },
  'etsy.com': { category: 'shopping', label: 'Shopping' },

  // News
  'nytimes.com': { category: 'news', label: 'News' },
  'theguardian.com': { category: 'news', label: 'News' },
  'bbc.com': { category: 'news', label: 'News' },
  'bbc.co.uk': { category: 'news', label: 'News' },
  'cnn.com': { category: 'news', label: 'News' },
  'techcrunch.com': { category: 'news', label: 'Tech News' },
  'theverge.com': { category: 'news', label: 'Tech News' },
  'wired.com': { category: 'news', label: 'Tech News' },
  'news.ycombinator.com': { category: 'news', label: 'Tech News' },

  // Music
  'spotify.com': { category: 'music', label: 'Music' },
  'soundcloud.com': { category: 'music', label: 'Music' },
  'music.apple.com': { category: 'music', label: 'Music' },
  'music.youtube.com': { category: 'music', label: 'Music' },

  // Communication
  'discord.com': { category: 'comms', label: 'Chat' },
  'slack.com': { category: 'comms', label: 'Chat' },
  'whatsapp.com': { category: 'comms', label: 'Chat' },
  'telegram.org': { category: 'comms', label: 'Chat' },
  'teams.microsoft.com': { category: 'comms', label: 'Chat' },
  'meet.google.com': { category: 'comms', label: 'Chat' },
  'zoom.us': { category: 'comms', label: 'Chat' },

  // Productivity
  'docs.google.com': { category: 'docs', label: 'Documents' },
  'notion.so': { category: 'docs', label: 'Documents' },
  'drive.google.com': { category: 'docs', label: 'Documents' },
  'sheets.google.com': { category: 'docs', label: 'Spreadsheets' },
  'onedrive.live.com': { category: 'docs', label: 'Documents' },
  'figma.com': { category: 'design', label: 'Design' },
  'miro.com': { category: 'design', label: 'Design' },
};

function getDomainSemanticCategory(domain: string): { category: string; label: string } | null {
  if (DOMAIN_SEMANTIC_CATEGORY[domain]) return DOMAIN_SEMANTIC_CATEGORY[domain];
  const parts = domain.split('.');
  if (parts.length > 2) {
    const base = parts.slice(-2).join('.');
    if (DOMAIN_SEMANTIC_CATEGORY[base]) return DOMAIN_SEMANTIC_CATEGORY[base];
  }
  return null;
}

// ── URL content-type detection ──────────────────────────────────────────────
// Detects what kind of content a tab is showing based on URL path patterns.
const URL_CONTENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/issues?\/?(\d+)?$/, label: 'Issues' },
  { pattern: /\/pulls?\/?(\d+)?$|\/merge_requests?/, label: 'PRs' },
  { pattern: /\/commits?\/|\/commit\//, label: 'Commits' },
  { pattern: /\/blob\/|\/tree\/|\/file\//, label: 'Code' },
  { pattern: /\/docs?\/?|\/documentation\/?|\/reference\/?|\/api-docs\/?/, label: 'Docs' },
  { pattern: /\/wiki\/?/, label: 'Wiki' },
  { pattern: /\/guide\/?|\/tutorial\/?|\/learn\/?|\/getting-started/, label: 'Tutorials' },
  { pattern: /\/watch\?|\/shorts\//, label: 'Videos' },
  { pattern: /\/playlist/, label: 'Playlists' },
  { pattern: /\/search\?/, label: 'Search' },
  { pattern: /\/product\/|\/item\/|\/dp\//, label: 'Products' },
  { pattern: /\/settings|\/account|\/preferences/, label: 'Settings' },
];

function detectContentType(url: string): string | null {
  try {
    const path = new URL(url).pathname.toLowerCase() + new URL(url).search.toLowerCase();
    for (const { pattern, label } of URL_CONTENT_PATTERNS) {
      if (pattern.test(path)) return label;
    }
  } catch { /* invalid URL */ }
  return null;
}

/** Domains where tabs are search results — don't group by domain unless searches share keywords */
const SEARCH_ENGINE_DOMAINS = new Set([
  'google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'baidu.com',
  'yandex.com', 'ecosia.org', 'startpage.com', 'brave.com', 'search.brave.com',
]);

function isSearchEngineDomain(domain: string): boolean {
  if (SEARCH_ENGINE_DOMAINS.has(domain)) return true;
  // Handle subdomains like www.google.com, search.yahoo.com
  const parts = domain.split('.');
  if (parts.length > 2) {
    const base = parts.slice(-2).join('.');
    if (SEARCH_ENGINE_DOMAINS.has(base)) return true;
  }
  return false;
}

/** Common acronyms that look like course codes but aren't */
const COURSE_CODE_EXCLUSIONS = new Set([
  'HTTP', 'HTML', 'HTTPS', 'JSON', 'AJAX', 'REST', 'CORS', 'SMTP', 'IMAP',
  'UUID', 'UTF', 'ASCII', 'ANSI', 'IEEE', 'JPEG', 'MPEG', 'WOFF', 'WEBP',
  'RGBA', 'CMYK', 'HDMI', 'USB', 'BIOS', 'WIFI', 'ISBN', 'ISSN',
]);

// ── Helper functions for improved suggestions ────────────────────────────────

/**
 * Extract the trailing brand/site attribution that cleanTitle() strips.
 * e.g. "Chat - Claude" → "claude", "Fix bug · GitHub" → "github"
 */
function extractBrandSuffix(title: string): string | null {
  const match = title.match(/\s*[\|·•\-–—]\s*([A-Z][^|\-]{1,25})$/);
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * Returns true if the hostname looks like an educational / LMS platform.
 */
function isEducationDomain(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return EDUCATION_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Extract valid course codes from a string (e.g. "CS 246", "MATH 135").
 * Filters out false positives like HTTP 404, HTML 5, etc.
 */
function extractCourseCodes(text: string): string[] {
  const codes: string[] = [];
  const upperText = text.toUpperCase();
  let m: RegExpExecArray | null;
  const re = new RegExp(COURSE_CODE_REGEX.source, 'g');
  while ((m = re.exec(upperText)) !== null) {
    const prefix = m[1];
    if (!COURSE_CODE_EXCLUSIONS.has(prefix)) {
      codes.push(`${prefix} ${m[2]}`);
    }
  }
  return codes;
}

/**
 * Returns a semantic category label for a domain.
 * For well-known domains, returns the brand name via getGroupTitle().
 * For education platforms, returns "School".
 * Otherwise returns the capitalized first segment of the hostname.
 */
function getDomainCategory(domain: string): string {
  // Check well-known brands first
  if (DOMAIN_NAME_HINTS[domain]) return DOMAIN_NAME_HINTS[domain];
  const parts = domain.split('.');
  if (parts.length > 2) {
    const baseDomain = parts.slice(-2).join('.');
    if (DOMAIN_NAME_HINTS[baseDomain]) return DOMAIN_NAME_HINTS[baseDomain];
  }
  // Education platforms get "School" label
  if (isEducationDomain(domain)) return 'School';
  // Fallback
  return getGroupTitle(domain);
}

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
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w));
}

function titleKeywords(title: string): string[] {
  return titleWords(title).filter((w) => !STOP_WORDS.has(w));
}

/** Adjacent keyword pairs from a title (both words must be ≥3 chars, non-stop) */
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

interface CandidateGroup {
  label: string;
  tabIds: Set<number>;
  score: number;
}

/**
 * Suggests tab groups using parallel candidate generation + scoring + set-cover selection.
 * Generates domain, academic, bigram, unigram, and brand candidates in parallel,
 * then selects the best non-overlapping suggestions. At most 6 suggestions returned.
 * @param descriptions Optional map of tabId → meta description text for richer context
 */
export function getSmartSuggestions(tabs: TabInfo[], existingTitles: Set<string>, descriptions?: Record<number, string>): SmartSuggestion[] {
  if (tabs.length < 2) return [];

  const textForTab = (tab: TabInfo): string => {
    const desc = descriptions?.[tab.tabId];
    return desc ? `${tab.title} ${desc}` : tab.title;
  };

  const candidates: CandidateGroup[] = [];

  // ── 1. Domain candidates (with content-type qualification) ──────────────
  const domainMap = new Map<string, TabInfo[]>();
  for (const tab of tabs) {
    const d = getDomain(tab.url);
    if (d) {
      const list = domainMap.get(d) ?? [];
      list.push(tab);
      domainMap.set(d, list);
    }
  }
  for (const [domain, domTabs] of domainMap) {
    if (domTabs.length < 2) continue;
    // Skip search engine domains — grouping unrelated searches by engine is unhelpful
    if (isSearchEngineDomain(domain)) continue;
    const baseName = getDomainCategory(domain);
    const isKnownBrand = !!DOMAIN_NAME_HINTS[domain] ||
      (domain.split('.').length > 2 && !!DOMAIN_NAME_HINTS[domain.split('.').slice(-2).join('.')]);
    // Try to qualify domain name with content type (e.g. "GitHub Issues" instead of "GitHub")
    const contentTypes = domTabs.map((t) => detectContentType(t.url)).filter(Boolean) as string[];
    const contentCounts = new Map<string, number>();
    for (const ct of contentTypes) contentCounts.set(ct, (contentCounts.get(ct) ?? 0) + 1);
    const dominantContent = [...contentCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    // Use qualified name if most tabs share the same content type
    const label = dominantContent && dominantContent[1] >= domTabs.length * 0.5
      ? `${baseName} ${dominantContent[0]}`
      : baseName;
    candidates.push({
      label,
      tabIds: new Set(domTabs.map((t) => t.tabId)),
      score: domTabs.length * (isKnownBrand ? 1.3 : 1.1),
    });
  }

  // ── 1b. Cross-domain semantic category candidates ─────────────────────
  // Group tabs from different domains that share a semantic purpose (AI, Dev, Social, etc.)
  const categoryMap = new Map<string, { label: string; tabs: TabInfo[] }>();
  for (const tab of tabs) {
    const d = getDomain(tab.url);
    const cat = getDomainSemanticCategory(d);
    if (!cat) continue;
    let entry = categoryMap.get(cat.category);
    if (!entry) {
      entry = { label: cat.label, tabs: [] };
      categoryMap.set(cat.category, entry);
    }
    entry.tabs.push(tab);
  }
  for (const [, { label, tabs: catTabs }] of categoryMap) {
    if (catTabs.length < 2) continue;
    // Only useful as cross-domain: skip if all tabs are from the same domain
    // (the domain candidate above already handles single-domain groups)
    const domains = new Set(catTabs.map((t) => getDomain(t.url)));
    if (domains.size < 2) continue;
    candidates.push({
      label,
      tabIds: new Set(catTabs.map((t) => t.tabId)),
      score: catTabs.length * 1.35,
    });
  }

  // ── 2. Academic / course code candidates ───────────────────────────────
  const courseTabs: TabInfo[] = [];
  for (const tab of tabs) {
    const codes = extractCourseCodes(tab.title);
    if (codes.length > 0) {
      courseTabs.push(tab);
    } else if (isEducationDomain(getDomain(tab.url))) {
      // Also include LMS tabs that may not have explicit course codes in titles
      courseTabs.push(tab);
    }
  }
  if (courseTabs.length >= 2) {
    candidates.push({
      label: 'Courses',
      tabIds: new Set(courseTabs.map((t) => t.tabId)),
      score: courseTabs.length * 1.4,
    });
  }

  // ── 3. Brand suffix candidates ─────────────────────────────────────────
  // Group tabs by the brand name that cleanTitle() would strip
  const brandMap = new Map<string, TabInfo[]>();
  for (const tab of tabs) {
    const brand = extractBrandSuffix(tab.title);
    if (brand && brand.length >= 3 && !STOP_WORDS.has(brand)) {
      const list = brandMap.get(brand) ?? [];
      list.push(tab);
      brandMap.set(brand, list);
    }
  }
  for (const [brand, brandTabs] of brandMap) {
    if (brandTabs.length < 2) continue;
    candidates.push({
      label: capitalize(brand),
      tabIds: new Set(brandTabs.map((t) => t.tabId)),
      score: brandTabs.length * 1.3,
    });
  }

  // ── 4. Bigram candidates (most specific keyword clusters) ──────────────
  const bigramMap = new Map<string, Set<number>>();
  for (const tab of tabs) {
    const text = textForTab(tab);
    // Include brand suffix as extra keyword signal
    const brand = extractBrandSuffix(tab.title);
    const fullText = brand ? `${text} ${brand}` : text;
    for (const bg of new Set(titleBigrams(fullText))) {
      const ids = bigramMap.get(bg) ?? new Set();
      ids.add(tab.tabId);
      bigramMap.set(bg, ids);
    }
  }
  for (const [bigram, ids] of bigramMap) {
    if (ids.size < 2) continue;
    candidates.push({
      label: capitalize(bigram),
      tabIds: ids,
      score: ids.size * 1.5,
    });
  }

  // ── 5. Unigram candidates ──────────────────────────────────────────────
  const wordMap = new Map<string, Set<number>>();
  for (const tab of tabs) {
    const text = textForTab(tab);
    const brand = extractBrandSuffix(tab.title);
    const fullText = brand ? `${text} ${brand}` : text;
    for (const w of new Set(titleKeywords(fullText))) {
      const ids = wordMap.get(w) ?? new Set();
      ids.add(tab.tabId);
      wordMap.set(w, ids);
    }
  }
  for (const [word, ids] of wordMap) {
    if (ids.size < 2) continue;
    candidates.push({
      label: capitalize(word),
      tabIds: ids,
      score: ids.size * 1.0,
    });
  }

  // ── 6. URL path segment candidates ─────────────────────────────────────
  const pathMap = new Map<string, Set<number>>();
  for (const tab of tabs) {
    try {
      const segments = new URL(tab.url).pathname
        .split('/')
        .filter((s) => s.length >= 3 && !/^\d+$/.test(s));
      for (const seg of new Set(segments)) {
        const clean = seg.replace(/[-_]/g, ' ').toLowerCase();
        if (!STOP_WORDS.has(clean) && clean.length >= 3) {
          const ids = pathMap.get(clean) ?? new Set();
          ids.add(tab.tabId);
          pathMap.set(clean, ids);
        }
      }
    } catch { /* ignore invalid URLs */ }
  }
  for (const [seg, ids] of pathMap) {
    if (ids.size < 2) continue;
    candidates.push({
      label: capitalize(seg),
      tabIds: ids,
      score: ids.size * 1.2,
    });
  }

  // ── Overlap-based selection ───────────────────────────────────────────
  // Sort by score descending. Instead of exclusive claiming (which starves later
  // candidates when the pool is large), accept every candidate unless it heavily
  // overlaps with an already-accepted suggestion. This ensures obvious groups
  // (domain, brand, semantic) are always surfaced even when generic text candidates
  // also match the same tabs.
  candidates.sort((a, b) => b.score - a.score);

  const results: SmartSuggestion[] = [];

  for (const candidate of candidates) {
    if (results.length >= 8) break;

    const tabIdArray = [...candidate.tabIds];
    if (tabIdArray.length < 2) continue;

    // Skip if label matches or is synonym-similar to an existing Chrome tab group
    const candFPEarly = labelFingerprint(candidate.label);
    let matchesExisting = false;
    for (const title of existingTitles) {
      if (candidate.label.toLowerCase() === title) { matchesExisting = true; break; }
      const existFP = labelFingerprint(title);
      for (const w of candFPEarly) {
        if (existFP.has(w)) { matchesExisting = true; break; }
      }
      if (matchesExisting) break;
    }
    if (matchesExisting) continue;

    // Skip if label is similar to an already-accepted suggestion:
    // - exact match, shared keyword, or synonym match
    // e.g. "Python" & "Python Docs", "YouTube" & "Videos", "Claude" & "AI Chats"
    const candFP = labelFingerprint(candidate.label);
    const isSimilarLabel = results.some((r) => {
      const rFP = labelFingerprint(r.label);
      // Any shared canonical word → too similar
      for (const w of candFP) {
        if (rFP.has(w)) return true;
      }
      return false;
    });
    if (isSimilarLabel) continue;

    // Skip if >70% of this candidate's tabs are already covered by a single
    // existing suggestion (it's essentially a subset / duplicate of that group)
    const isRedundant = results.some((r) => {
      const rSet = new Set(r.tabIds);
      const overlap = tabIdArray.filter((id) => rSet.has(id)).length;
      return overlap > tabIdArray.length * 0.7;
    });
    if (isRedundant) continue;

    results.push({ label: candidate.label, tabIds: tabIdArray });
  }

  return results;
}

// ── Add-to-group suggestions ────────────────────────────────────────────────

export interface GroupAddSuggestion {
  groupId: number;
  groupTitle: string;
  groupColor: string;
  tabIds: number[];
}

/**
 * Suggests ungrouped tabs that should be added to existing groups based on
 * keyword overlap between the tab's title/description and the group's members.
 */
export function getGroupAddSuggestions(
  ungroupedTabs: TabInfo[],
  groupedTabs: TabInfo[],
  descriptions?: Record<number, string>,
): GroupAddSuggestion[] {
  if (ungroupedTabs.length === 0 || groupedTabs.length === 0) return [];

  const textForTab = (tab: TabInfo): string => {
    const desc = descriptions?.[tab.tabId];
    return desc ? `${tab.title} ${desc}` : tab.title;
  };

  // Build keyword frequency map per group (from member tabs + group title)
  // Only "characteristic" keywords — those appearing in ≥2 members or in the group title — are used for matching.
  // This prevents a single noisy tab from polluting the group's keyword fingerprint.
  const groups = new Map<number, { title: string; color: string; memberCount: number; keywordFreq: Map<string, number>; titleKw: Set<string> }>();
  for (const tab of groupedTabs) {
    if (!tab.groupId) continue;
    let g = groups.get(tab.groupId);
    if (!g) {
      g = {
        title: tab.groupTitle || '',
        color: tab.groupColor || 'cyan',
        memberCount: 0,
        keywordFreq: new Map(),
        titleKw: new Set(titleKeywords(tab.groupTitle || '')),
      };
      groups.set(tab.groupId, g);
    }
    g.memberCount++;
    for (const w of new Set(titleKeywords(textForTab(tab)))) {
      g.keywordFreq.set(w, (g.keywordFreq.get(w) ?? 0) + 1);
    }
  }

  // Match each ungrouped tab against each group's *characteristic* keyword set
  // Characteristic = appears in ≥2 group members OR is in the group title
  const candidates = new Map<number, number[]>(); // groupId → tabIds
  for (const tab of ungroupedTabs) {
    const tabKw = new Set(titleKeywords(textForTab(tab)));
    for (const [gid, g] of groups) {
      // Build the characteristic keyword set for this group
      const charKw = new Set<string>();
      for (const [w, freq] of g.keywordFreq) {
        if (freq >= Math.max(2, Math.ceil(g.memberCount * 0.4))) charKw.add(w);
      }
      // Group title keywords are always characteristic
      for (const w of g.titleKw) charKw.add(w);

      // Need at least 2 overlapping characteristic keywords, OR 1 if the group title keyword overlaps
      let overlap = 0;
      let titleOverlap = 0;
      for (const w of tabKw) {
        if (charKw.has(w)) {
          overlap++;
          if (g.titleKw.has(w)) titleOverlap++;
        }
      }
      const meetsThreshold = titleOverlap >= 1 || overlap >= 2;
      if (meetsThreshold) {
        const list = candidates.get(gid) ?? [];
        list.push(tab.tabId);
        candidates.set(gid, list);
      }
    }
  }

  // Build results sorted by candidate count
  const results: GroupAddSuggestion[] = [];
  for (const [gid, tabIds] of candidates) {
    const g = groups.get(gid)!;
    results.push({ groupId: gid, groupTitle: g.title, groupColor: g.color, tabIds });
  }
  results.sort((a, b) => b.tabIds.length - a.tabIds.length);
  return results.slice(0, 4);
}

// ── Find related tabs for inclusive grouping ─────────────────────────────────

/**
 * Given a set of "seed" tabs and a label, finds other ungrouped tabs that
 * should also belong in the same group. Uses domain, brand suffix, title
 * keywords, and semantic category signals.
 */
export function findRelatedTabs(
  seedTabs: TabInfo[],
  allTabs: TabInfo[],
  label: string,
): number[] {
  if (seedTabs.length === 0) return [];
  const seedIds = new Set(seedTabs.map((t) => t.tabId));
  const ungrouped = allTabs.filter((t) => !t.groupId && !seedIds.has(t.tabId));
  if (ungrouped.length === 0) return [];

  // Build signals from seed tabs
  const seedDomains = new Set(seedTabs.map((t) => getDomain(t.url)).filter(Boolean));
  const seedBrands = new Set(
    seedTabs.map((t) => extractBrandSuffix(t.title)?.toLowerCase()).filter(Boolean) as string[]
  );
  const labelKw = new Set(titleKeywords(label));

  // Collect characteristic keywords from seed titles (words appearing in ≥2 seed tabs or in label)
  const kwFreq = new Map<string, number>();
  for (const tab of seedTabs) {
    for (const w of new Set(titleKeywords(tab.title))) {
      kwFreq.set(w, (kwFreq.get(w) ?? 0) + 1);
    }
  }
  const charKw = new Set<string>();
  for (const w of labelKw) charKw.add(w);
  for (const [w, freq] of kwFreq) {
    if (freq >= Math.min(2, seedTabs.length)) charKw.add(w);
  }

  // Seed semantic categories
  const seedCategories = new Set(
    seedTabs.map((t) => getDomainSemanticCategory(getDomain(t.url))?.category).filter(Boolean) as string[]
  );

  const related: number[] = [];
  for (const tab of ungrouped) {
    const domain = getDomain(tab.url);
    const brand = extractBrandSuffix(tab.title)?.toLowerCase();
    const tabKw = new Set(titleKeywords(tab.title));
    const tabCat = getDomainSemanticCategory(domain)?.category;

    // Signal 1: same domain as any seed tab
    if (domain && seedDomains.has(domain)) { related.push(tab.tabId); continue; }

    // Signal 2: same brand suffix
    if (brand && seedBrands.has(brand)) { related.push(tab.tabId); continue; }

    // Signal 3: same semantic category (e.g. AI, Dev, Social)
    if (tabCat && seedCategories.has(tabCat)) { related.push(tab.tabId); continue; }

    // Signal 4: keyword overlap — at least 1 label keyword match or 2+ characteristic keywords
    let kwOverlap = 0;
    let labelMatch = 0;
    for (const w of tabKw) {
      if (charKw.has(w)) kwOverlap++;
      if (labelKw.has(w)) labelMatch++;
    }
    if (labelMatch >= 1 || kwOverlap >= 2) { related.push(tab.tabId); continue; }
  }

  return related;
}
