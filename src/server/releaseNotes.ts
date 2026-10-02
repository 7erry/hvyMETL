/** Latest release block parsed from RELEASE.md (heading + body markdown). */
export type LatestReleaseNotes = {
  heading: string;
  body: string;
};

/** Parse every `## hvyMETL x.y.z` section in RELEASE.md (newest first). */
export function parseAllReleaseSections(markdown: string): LatestReleaseNotes[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trimStart();
  if (!normalized) return [];

  const sections: LatestReleaseNotes[] = [];
  const headingPattern = /^##\s+(hvyMETL\s+[\d.]+)\s*\n+/gim;
  const matches = [...normalized.matchAll(headingPattern)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const heading = match[1]?.trim() ?? '';
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    let body = normalized.slice(bodyStart, bodyEnd).trim();
    body = body.replace(/\n---\s*$/, '').trim();
    if (heading && body) sections.push({ heading, body });
  }

  return sections;
}

/**
 * Returns the first `## hvyMETL x.y.z` section in RELEASE.md (newest release at top).
 */
export function parseLatestReleaseSection(markdown: string): LatestReleaseNotes | null {
  return parseAllReleaseSections(markdown)[0] ?? null;
}

/** Major semver segment from package version (e.g. `5.1.34` → `5`). */
export function majorVersionFromSemver(version: string): number | null {
  const major = Number.parseInt(version.split('.')[0] ?? '', 10);
  return Number.isFinite(major) ? major : null;
}

/**
 * Combine all releases in a major line (e.g. every `5.x`) into one markdown document for the version dialog.
 */
export function buildMajorVersionReleaseMarkdown(markdown: string, majorVersion: number): string | null {
  const prefix = `${majorVersion}.`;
  const sections = parseAllReleaseSections(markdown).filter((section) => {
    const semver = section.heading.match(/hvyMETL\s+([\d.]+)/i)?.[1];
    return Boolean(semver?.startsWith(prefix));
  });

  if (sections.length === 0) return null;

  const intro = `Highlights from **${sections.length}** release${sections.length === 1 ? '' : 's'} on the **${majorVersion}.x** line (newest first).`;
  const blocks = sections.map((section) => {
    const version = section.heading.replace(/^hvyMETL\s+/i, '').trim();
    return `### ${version}\n\n${section.body}`;
  });

  return [intro, '', ...blocks].join('\n\n');
}
