/**
 * Namespaced tag convention for contact segmentation.
 * Tags are plain strings in the existing `tags` attribute — shared
 * with the email outreach system — using a `prefix:value` format,
 * e.g. "ind:fintech", "svc:paid-media", "rel:prospect".
 *
 * Chip styles stay within the brand palette (gold/amber/navy/charcoal/mist).
 */

export const TAG_PREFIXES: Record<string, { label: string; chip: string }> = {
  ind: { label: "Industry", chip: "bg-navy text-white" },
  svc: { label: "Service interest", chip: "bg-gold/15 text-amber" },
  size: { label: "Company size", chip: "bg-charcoal/10 text-charcoal" },
  tier: { label: "Tier", chip: "bg-gold text-navy" },
  rel: { label: "Relationship", chip: "bg-amber/15 text-amber" },
  loc: { label: "Location", chip: "bg-white text-charcoal border border-line" },
  lang: { label: "Language", chip: "bg-charcoal text-mist" },
};

const PREFIX_ORDER = Object.keys(TAG_PREFIXES);

export function tagPrefix(tag: string): string {
  const i = tag.indexOf(":");
  return i === -1 ? "" : tag.slice(0, i);
}

export function tagChipClass(tag: string): string {
  return (
    TAG_PREFIXES[tagPrefix(tag)]?.chip ??
    "bg-charcoal/5 text-warmgray border border-line"
  );
}

/** "Ind: FinTech " → "ind:fintech"; spaces inside values become hyphens. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s*:\s*/g, ":")
    .replace(/\s+/g, "-");
}

/** Sort: known prefixes in defined order, then unknown, alphabetical within. */
export function sortTags(tags: string[]): string[] {
  return [...tags].sort((a, b) => {
    const pa = PREFIX_ORDER.indexOf(tagPrefix(a));
    const pb = PREFIX_ORDER.indexOf(tagPrefix(b));
    const ra = pa === -1 ? PREFIX_ORDER.length : pa;
    const rb = pb === -1 ? PREFIX_ORDER.length : pb;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });
}
