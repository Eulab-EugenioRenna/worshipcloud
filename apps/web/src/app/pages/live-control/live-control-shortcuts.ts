const SECTION_SHORTCUTS: Readonly<Record<string, string>> = {
  Intro: 'I',
  'Pre-Chorus': 'P',
  Chorus: 'C',
  Bridge: 'B',
  Tag: 'T',
  Ending: 'E',
};

export function songSectionShortcut(
  sectionType: unknown,
  verseNumber: number,
): string {
  if (sectionType === 'Verse')
    return verseNumber >= 1 && verseNumber <= 9 ? String(verseNumber) : '';
  return typeof sectionType === 'string'
    ? (SECTION_SHORTCUTS[sectionType] ?? '')
    : '';
}
