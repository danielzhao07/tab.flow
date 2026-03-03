import { useState, useEffect } from 'react';
import { getTopDomains, type DomainStat } from '@/lib/api-client';
import { getFrecencyMap } from '@/lib/frecency';
import type { TabInfo } from '@/lib/types';

interface LocalDomainStat { domain: string; visits: number; }

interface AnalyticsBarProps {
  tabs?: TabInfo[];
  onSwitch?: () => void;
}

/** Domains to always exclude from the "Today" bar */
const BLOCKED_DOMAINS = new Set([
  'newtab', 'new-tab', 'extensions', 'settings', 'flags',
  'localhost', '127.0.0.1',
]);

/** URL prefixes that should never appear in frecency counting */
function isInternalUrl(url: string): boolean {
  return /^(chrome|edge|brave|about|chrome-extension|moz-extension):\/\//i.test(url);
}

/** Titles that are unhelpful — raw URLs, "New Tab", empty */
function isBadTitle(title: string): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (t === 'new tab' || t === 'newtab' || t === 'new_tab') return true;
  // Looks like a URL
  if (/^https?:\/\//i.test(t)) return true;
  return false;
}

/**
 * Extract a clean, human-readable label for a domain.
 * Prefers a good tab title; falls back to a prettified domain name.
 */
function labelForDomain(domain: string, tabs: TabInfo[]): string {
  // Find the best tab title — skip tabs whose title is a URL or "New Tab"
  const matching = tabs.filter((t) => {
    try { return new URL(t.url).hostname.replace('www.', '') === domain; } catch { return false; }
  });

  for (const tab of matching) {
    if (!isBadTitle(tab.title)) {
      // Clean common suffixes: " - Google Search", " | Reddit", etc.
      let title = tab.title;
      title = title
        .replace(/\s*[-–—|·]\s*(google\s*search|search|reddit|youtube|github|linkedin|x|twitter)$/i, '')
        .replace(/\s*[-–—|·]\s*[^-–—|·]{0,20}$/, ''); // strip " - SiteName" suffix
      if (title.length > 1) return title;
      return tab.title.split(/\s*[-–—|·]\s*/)[0] || tab.title;
    }
  }

  // No good tab title — prettify the domain name
  return prettifyDomain(domain);
}

/** Turn "docs.google.com" → "Google Docs", "github.com" → "GitHub", etc. */
function prettifyDomain(domain: string): string {
  const BRANDS: Record<string, string> = {
    'google.com': 'Google', 'docs.google.com': 'Google Docs',
    'mail.google.com': 'Gmail', 'drive.google.com': 'Google Drive',
    'calendar.google.com': 'Google Calendar', 'meet.google.com': 'Google Meet',
    'maps.google.com': 'Google Maps', 'photos.google.com': 'Google Photos',
    'youtube.com': 'YouTube', 'music.youtube.com': 'YouTube Music',
    'github.com': 'GitHub', 'gist.github.com': 'GitHub Gist',
    'gmail.com': 'Gmail', 'reddit.com': 'Reddit', 'old.reddit.com': 'Reddit',
    'stackoverflow.com': 'Stack Overflow', 'twitter.com': 'Twitter', 'x.com': 'X',
    'linkedin.com': 'LinkedIn', 'facebook.com': 'Facebook', 'instagram.com': 'Instagram',
    'amazon.com': 'Amazon', 'netflix.com': 'Netflix', 'spotify.com': 'Spotify',
    'slack.com': 'Slack', 'discord.com': 'Discord', 'notion.so': 'Notion',
    'figma.com': 'Figma', 'vercel.com': 'Vercel', 'netlify.com': 'Netlify',
    'medium.com': 'Medium', 'dev.to': 'DEV', 'twitch.tv': 'Twitch',
    'wikipedia.org': 'Wikipedia', 'en.wikipedia.org': 'Wikipedia',
    'chat.openai.com': 'ChatGPT', 'openai.com': 'OpenAI',
    'claude.ai': 'Claude', 'anthropic.com': 'Anthropic',
    'leetcode.com': 'LeetCode', 'hackerrank.com': 'HackerRank',
    'codepen.io': 'CodePen', 'codesandbox.io': 'CodeSandbox',
    'npm.io': 'npm', 'npmjs.com': 'npm', 'pypi.org': 'PyPI',
    'aws.amazon.com': 'AWS', 'console.aws.amazon.com': 'AWS Console',
    'portal.azure.com': 'Azure', 'cloud.google.com': 'Google Cloud',
    'jira.atlassian.com': 'Jira', 'confluence.atlassian.com': 'Confluence',
    'trello.com': 'Trello', 'asana.com': 'Asana',
    'outlook.live.com': 'Outlook', 'outlook.office.com': 'Outlook',
    'zoom.us': 'Zoom', 'teams.microsoft.com': 'Teams',
  };

  if (BRANDS[domain]) return BRANDS[domain];

  // Try without leading subdomain: e.g. "app.slack.com" → check "slack.com"
  const parts = domain.split('.');
  if (parts.length > 2) {
    const base = parts.slice(-2).join('.');
    if (BRANDS[base]) return BRANDS[base];
  }

  // Capitalize the main name: "ciena.wd5.myworkdayjobs.com" → "Myworkdayjobs"
  // Use the second-to-last segment (SLD) for most multi-part domains
  const sld = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return sld.charAt(0).toUpperCase() + sld.slice(1);
}

function findTabForDomain(domain: string, tabs: TabInfo[]): TabInfo | undefined {
  return tabs.find((t) => {
    try { return new URL(t.url).hostname.replace('www.', '') === domain; } catch { return false; }
  });
}

export function AnalyticsBar({ tabs = [], onSwitch }: AnalyticsBarProps) {
  const [domains, setDomains] = useState<DomainStat[]>([]);
  const [localDomains, setLocalDomains] = useState<LocalDomainStat[]>([]);

  useEffect(() => {
    getTopDomains(3).then(setDomains).catch(() => {});
    getFrecencyMap().then((map) => {
      const counts = new Map<string, number>();
      for (const [url, entry] of map) {
        try {
          if (isInternalUrl(url)) continue;
          const d = new URL(url).hostname.replace('www.', '');
          if (!d || BLOCKED_DOMAINS.has(d)) continue;
          counts.set(d, (counts.get(d) ?? 0) + entry.visitCount);
        } catch { /* ignore */ }
      }
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([domain, visits]) => ({ domain, visits }));
      setLocalDomains(sorted);
    }).catch(() => {});
  }, []);

  // Filter out blocked domains from cloud results too
  const cleanDomains = domains.filter((d) => !BLOCKED_DOMAINS.has(d.domain));
  const showCloud = cleanDomains.length > 0;
  const showLocal = !showCloud && localDomains.length > 0;
  if (!showCloud && !showLocal) return null;

  const items = showCloud
    ? cleanDomains.map((d) => ({ key: d.domain, label: labelForDomain(d.domain, tabs) }))
    : localDomains.map((d) => ({ key: d.domain, label: labelForDomain(d.domain, tabs) }));

  return (
    <div className="flex items-center gap-2 overflow-hidden flex-nowrap">
      <span className="text-[9px] text-white/15 uppercase tracking-wider shrink-0">Today</span>
      {items.map((item, i) => (
        <span key={item.key} className="flex items-center gap-2 shrink-0">
          {i > 0 && <span className="text-white/10 text-[9px]">·</span>}
          <button
            className="text-[10px] text-white/35 truncate max-w-[160px] hover:text-white/65 transition-colors cursor-pointer"
            style={{ background: 'none', border: 'none', padding: 0 }}
            onClick={() => {
              const match = findTabForDomain(item.key, tabs);
              if (match) {
                chrome.runtime.sendMessage({ type: 'switch-tab', payload: { tabId: match.tabId } });
              } else {
                chrome.runtime.sendMessage({ type: 'open-url', payload: { url: 'https://' + item.key } });
              }
              onSwitch?.();
            }}
          >
            {item.label}
          </button>
        </span>
      ))}
    </div>
  );
}
