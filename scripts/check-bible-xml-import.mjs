import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { parseXmlBible } = require('../packages/shared/dto/dist/src/index.js');

const fixture = `\uFEFF<?xml version="1.0"?>
<XMLBIBLE biblename="Test Bible">
  <BIBLEBOOK bnumber="1" bname="Genesi">
    <CHAPTER cnumber="1"><VERS vnumber="1">Cielo &amp; terra</VERS></CHAPTER>
  </BIBLEBOOK>
</XMLBIBLE>`;
const parsedFixture = parseXmlBible(fixture, 'Bible_Italian_TST.xml');
if (
  parsedFixture.translation.locale !== 'it' ||
  parsedFixture.translation.abbreviation !== 'TST' ||
  parsedFixture.verses[0]?.text !== 'Cielo & terra'
) {
  throw new Error('The XMLBIBLE fixture was not parsed correctly');
}

const lndPath = 'Bible_Italian_LND.xml';
if (existsSync(lndPath)) {
  const parsedLnd = parseXmlBible(readFileSync(lndPath, 'utf8'), lndPath);
  const books = new Set(parsedLnd.verses.map((verse) => verse.book));
  if (
    parsedLnd.translation.locale !== 'it' ||
    parsedLnd.translation.abbreviation !== 'LND' ||
    parsedLnd.verses.length !== 31_102 ||
    books.size !== 66
  ) {
    throw new Error('Bible_Italian_LND.xml was not parsed completely');
  }
  console.log(
    JSON.stringify({
      ok: true,
      translation: parsedLnd.translation,
      verses: parsedLnd.verses.length,
      books: books.size,
    }),
  );
} else {
  console.log(JSON.stringify({ ok: true, fixture: 'XMLBIBLE' }));
}
