const WIKI_RE = /\[\[([^\]]+)\]\]/g;

export function extractWikiLinks(text: string): string[] {
  const labels: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(WIKI_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    labels.push(m[1].trim());
  }
  return labels;
}

export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Resolve [[Label]] to a topic key. Checks:
 * 1. Exact key match (e.g. [[character:aldric]] → "character:aldric")
 * 2. Suffix match after colon (e.g. [[Aldric]] → "character:aldric")
 */
export function resolveWikiLink(label: string, topicKeys: string[]): string | null {
  const normalized = normalizeLabel(label);
  if (topicKeys.includes(normalized)) return normalized;
  for (const key of topicKeys) {
    const i = key.indexOf(':');
    if (i !== -1 && key.slice(i + 1) === normalized) return key;
  }
  return null;
}
