import {
  ImportBibleRequestSchema,
  type ImportBibleRequestDto,
} from './bible.dto';

const LANGUAGE_CODES: Readonly<Record<string, string>> = {
  italian: 'it',
  italiano: 'it',
  english: 'en',
  inglese: 'en',
  spanish: 'es',
  spagnolo: 'es',
  french: 'fr',
  francese: 'fr',
  german: 'de',
  tedesco: 'de',
  portuguese: 'pt',
  portoghese: 'pt',
};

function attribute(source: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(
    source,
  );
  return match?.[2]?.trim() || undefined;
}

function decodeXmlText(value: string): string {
  const withoutMarkup = value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '');
  return withoutMarkup
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#([0-9]+);/g, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function identity(fileName: string, rootAttributes: string) {
  const baseName = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^bible[\s_-]*/i, '')
    .trim();
  const parts = baseName.split(/[\s_-]+/).filter(Boolean);
  const finalPart = parts.at(-1) ?? 'XML';
  const abbreviation =
    finalPart.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 32) || 'XML';
  const languageName = parts[0]?.toLowerCase() ?? '';
  const declaredName = attribute(rootAttributes, 'biblename');
  return {
    locale: LANGUAGE_CODES[languageName] ?? 'und',
    name: declaredName ?? (parts.join(' ') || 'Imported XML Bible'),
    abbreviation: abbreviation.toUpperCase(),
  };
}

/** Parses the Zefania XMLBIBLE shape used by Bible_Italian_LND.xml. */
export function parseXmlBible(
  xml: string,
  fileName = 'Bible_XML.xml',
): ImportBibleRequestDto {
  const rootStart = xml.search(/<XMLBIBLE\b/i);
  if (rootStart < 0) throw new Error('XMLBIBLE root element not found');
  const normalized = xml.slice(rootStart);
  const rootMatch = /<XMLBIBLE\b([^>]*)>/i.exec(normalized);
  if (!rootMatch) throw new Error('Invalid XMLBIBLE root element');

  const verses: Array<{
    book: string;
    bookOrder: number;
    chapter: number;
    verse: number;
    text: string;
  }> = [];
  const bookPattern = /<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi;
  for (const bookMatch of normalized.matchAll(bookPattern)) {
    const bookOrder = Number(attribute(bookMatch[1], 'bnumber'));
    const book = attribute(bookMatch[1], 'bname');
    if (!book || !Number.isInteger(bookOrder)) continue;
    const chapterPattern = /<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi;
    for (const chapterMatch of bookMatch[2].matchAll(chapterPattern)) {
      const chapter = Number(attribute(chapterMatch[1], 'cnumber'));
      if (!Number.isInteger(chapter)) continue;
      const versePattern = /<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi;
      for (const verseMatch of chapterMatch[2].matchAll(versePattern)) {
        const verse = Number(attribute(verseMatch[1], 'vnumber'));
        const text = decodeXmlText(verseMatch[2]);
        if (!Number.isInteger(verse) || !text) continue;
        verses.push({ book, bookOrder, chapter, verse, text });
      }
    }
  }
  if (!verses.length) throw new Error('XMLBIBLE does not contain any verses');
  return ImportBibleRequestSchema.parse({
    translation: identity(fileName, rootMatch[1]),
    verses,
  });
}
