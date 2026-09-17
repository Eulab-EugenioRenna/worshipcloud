import {
  BiblePassageSchema,
  BiblePassageTranslationSchema,
  BibleTranslationSchema,
  type AuthPrincipalDto,
  type BiblePassageDto,
  type BiblePassageTranslationDto,
  type BibleImportCommandDto,
  type BibleSearchQueryDto,
  type BibleTranslationDto,
  type CreateBiblePassageRequestDto,
  type CreateBibleTranslationRequestDto,
  type DomainEventPayloadDto,
  type GenerateBiblePassageTranslationRequestDto,
  type ImportBibleVersesRequestDto,
  type ImportBibleRequestDto,
  type ImportBibleResponseDto,
  type ImportSourceDto,
} from '@worship/shared-dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { TranslationService } from '../translations/translation.service';
import { Prisma } from '../../generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { ImportSourcesService } from '../import-sources/import-sources.service';

@Injectable()
export class BibleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
    private readonly translations: TranslationService,
    private readonly importSources: ImportSourcesService,
  ) {}

  listImportSources(): ImportSourceDto[] {
    return this.importSources.list('Bible');
  }

  async listTranslations(
    userId: string,
    organizationId: string,
  ): Promise<BibleTranslationDto[]> {
    await this.requireMembership(userId, organizationId);
    const translations = await this.prisma.bibleTranslation.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return translations.map((translation) =>
      this.translationToDto(translation),
    );
  }

  async createTranslation(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: CreateBibleTranslationRequestDto,
  ): Promise<BibleTranslationDto> {
    await this.requireLibraryEditor(principal.userId, organizationId);
    try {
      const translation = await this.prisma.bibleTranslation.create({
        data: { organizationId, ...input },
      });
      await this.publish(
        'bible.translation.created',
        principal.userId,
        organizationId,
        translation.id,
        { title: translation.name },
      );
      return this.translationToDto(translation);
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException(
          'A translation with this abbreviation already exists',
        );
      throw error;
    }
  }

  async importRemote(
    principal: AuthPrincipalDto,
    organizationId: string,
    command: BibleImportCommandDto,
  ): Promise<ImportBibleResponseDto> {
    await this.requireLibraryEditor(principal.userId, organizationId);
    const input: ImportBibleRequestDto =
      'translation' in command
        ? command
        : await this.importSources.loadBible(command);
    const translation = await this.prisma.$transaction(async (transaction) => {
      const record = await transaction.bibleTranslation.upsert({
        where: {
          organizationId_abbreviation: {
            organizationId,
            abbreviation: input.translation.abbreviation,
          },
        },
        create: { organizationId, ...input.translation },
        update: input.translation,
      });
      for (let offset = 0; offset < input.verses.length; offset += 1000) {
        const chunk = input.verses.slice(offset, offset + 1000);
        const values = Prisma.join(
          chunk.map(
            (verse) => Prisma.sql`(
            ${randomUUID()}, ${record.id}, ${verse.book}, ${verse.bookOrder},
            ${verse.chapter}, ${verse.verse}, ${verse.text}
          )`,
          ),
        );
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "BibleVerse" ("id", "translationId", "book", "bookOrder", "chapter", "verse", "text")
          VALUES ${values}
          ON CONFLICT ("translationId", "book", "chapter", "verse")
          DO UPDATE SET "bookOrder" = EXCLUDED."bookOrder", "text" = EXCLUDED."text"
        `);
      }
      return record;
    });
    await this.publish(
      'bible.verses.imported',
      principal.userId,
      organizationId,
      translation.id,
      { title: `Imported ${input.verses.length} Bible verses` },
    );
    return {
      translation: this.translationToDto(translation),
      importedVerses: input.verses.length,
    };
  }

  async importVerses(
    principal: AuthPrincipalDto,
    organizationId: string,
    translationId: string,
    input: ImportBibleVersesRequestDto,
  ): Promise<void> {
    await this.requireLibraryEditor(principal.userId, organizationId);
    await this.requireTranslation(organizationId, translationId);
    await this.prisma.$transaction(
      input.verses.map((verse) =>
        this.prisma.bibleVerse.upsert({
          where: {
            translationId_book_chapter_verse: {
              translationId,
              book: verse.book,
              chapter: verse.chapter,
              verse: verse.verse,
            },
          },
          create: { translationId, ...verse },
          update: { bookOrder: verse.bookOrder, text: verse.text },
        }),
      ),
    );
    await this.publish(
      'bible.verses.imported',
      principal.userId,
      organizationId,
      translationId,
      { title: `Imported ${input.verses.length} Bible verses` },
    );
  }

  async search(
    userId: string,
    organizationId: string,
    query: BibleSearchQueryDto,
  ): Promise<BiblePassageDto> {
    await this.requireMembership(userId, organizationId);
    const parsed = this.parseReference(query.query);
    const book = await this.resolveBookName(
      organizationId,
      query.translationId,
      parsed.book,
    );
    const reference: {
      book: string;
      chapter: number;
      verseStart: number;
      verseEnd: number;
    } =
      parsed.verseStart === undefined
        ? await this.chapterReference(
            organizationId,
            query.translationId,
            book,
            parsed.chapter,
          )
        : {
            book,
            chapter: parsed.chapter,
            verseStart: parsed.verseStart,
            verseEnd: parsed.verseEnd!,
          };
    return this.resolvePassage(
      organizationId,
      { translationId: query.translationId, ...reference },
      false,
    );
  }

  async listBooks(
    userId: string,
    organizationId: string,
    translationId: string,
  ): Promise<string[]> {
    await this.requireMembership(userId, organizationId);
    await this.requireTranslation(organizationId, translationId);
    const rows = await this.prisma.bibleVerse.findMany({
      where: { translationId },
      distinct: ['book'],
      select: { book: true, bookOrder: true },
      orderBy: [{ bookOrder: 'asc' }, { book: 'asc' }],
    });
    return rows.map((row) => row.book);
  }

  async listChapters(
    userId: string,
    organizationId: string,
    translationId: string,
    book: string,
  ): Promise<number[]> {
    await this.requireMembership(userId, organizationId);
    await this.requireTranslation(organizationId, translationId);
    const rows = await this.prisma.bibleVerse.findMany({
      where: { translationId, book },
      distinct: ['chapter'],
      select: { chapter: true },
      orderBy: { chapter: 'asc' },
    });
    return rows.map((row) => row.chapter);
  }

  async listVerses(
    userId: string,
    organizationId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<number[]> {
    await this.requireMembership(userId, organizationId);
    await this.requireTranslation(organizationId, translationId);
    const rows = await this.prisma.bibleVerse.findMany({
      where: { translationId, book, chapter },
      select: { verse: true },
      orderBy: { verse: 'asc' },
    });
    return rows.map((row) => row.verse);
  }

  async createPassage(
    principal: AuthPrincipalDto,
    organizationId: string,
    input: CreateBiblePassageRequestDto,
  ): Promise<BiblePassageDto> {
    await this.requireServiceEditor(principal.userId, organizationId);
    const selection: {
      translationId: string;
      book: string;
      chapter: number;
      verseStart: number;
      verseEnd: number;
    } =
      input.verseStart === undefined
        ? {
            translationId: input.translationId,
            ...(await this.chapterReference(
              organizationId,
              input.translationId,
              input.book,
              input.chapter,
            )),
          }
        : {
            translationId: input.translationId,
            book: input.book,
            chapter: input.chapter,
            verseStart: input.verseStart,
            verseEnd: input.verseEnd!,
          };
    const resolved = await this.resolvePassage(
      organizationId,
      selection,
      false,
    );
    const passage = await this.prisma.biblePassage.create({
      data: {
        organizationId,
        translationId: input.translationId,
        book: input.book,
        chapter: input.chapter,
        verseStart: selection.verseStart,
        verseEnd: selection.verseEnd,
        reference: resolved.reference,
      },
    });
    await this.publish(
      'bible.passage.created',
      principal.userId,
      organizationId,
      passage.id,
      { title: passage.reference },
    );
    return this.getPassage(principal.userId, organizationId, passage.id);
  }

  async listPassages(
    userId: string,
    organizationId: string,
  ): Promise<BiblePassageDto[]> {
    await this.requireMembership(userId, organizationId);
    const passages = await this.prisma.biblePassage.findMany({
      where: { organizationId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return Promise.all(
      passages.map((passage) =>
        this.resolvePassage(
          organizationId,
          passage,
          true,
          passage.id,
          passage.createdAt,
          passage.updatedAt,
        ),
      ),
    );
  }

  async getPassage(
    userId: string,
    organizationId: string,
    passageId: string,
  ): Promise<BiblePassageDto> {
    await this.requireMembership(userId, organizationId);
    const passage = await this.prisma.biblePassage.findFirst({
      where: { id: passageId, organizationId },
    });
    if (!passage) throw new NotFoundException('Bible passage not found');
    return this.resolvePassage(
      organizationId,
      passage,
      true,
      passage.id,
      passage.createdAt,
      passage.updatedAt,
    );
  }

  async listPassageTranslations(
    userId: string,
    organizationId: string,
    passageId: string,
  ): Promise<BiblePassageTranslationDto[]> {
    await this.requireMembership(userId, organizationId);
    await this.getPassage(userId, organizationId, passageId);
    const translations = await this.prisma.biblePassageTranslation.findMany({
      where: { passageId },
      orderBy: { locale: 'asc' },
    });
    return translations.map((translation) =>
      this.passageTranslationToDto(translation),
    );
  }

  async generatePassageTranslation(
    principal: AuthPrincipalDto,
    organizationId: string,
    passageId: string,
    input: GenerateBiblePassageTranslationRequestDto,
  ): Promise<BiblePassageTranslationDto> {
    await this.requireServiceEditor(principal.userId, organizationId);
    const passage = await this.prisma.biblePassage.findFirst({
      where: { id: passageId, organizationId },
      include: { translation: { select: { locale: true } } },
    });
    if (!passage) throw new NotFoundException('Bible passage not found');
    if (input.targetLocale === passage.translation.locale) {
      throw new BadRequestException(
        'A translation target must differ from the Bible edition language',
      );
    }
    const source = await this.getPassage(
      principal.userId,
      organizationId,
      passageId,
    );
    const verses = await this.translations.translateBiblePassage({
      sourceLocale: passage.translation.locale,
      targetLocale: input.targetLocale,
      reference: source.reference,
      verses: source.verses.map((verse) => ({
        verse: verse.verse,
        text: verse.text,
      })),
    });
    const metadata = this.translations.metadata();
    const translated = await this.prisma.biblePassageTranslation.upsert({
      where: { passageId_locale: { passageId, locale: input.targetLocale } },
      create: {
        passageId,
        locale: input.targetLocale,
        verses: verses as unknown as Prisma.InputJsonValue,
        provider: metadata.provider,
        model: metadata.model,
      },
      update: {
        verses: verses as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
        provider: metadata.provider,
        model: metadata.model,
      },
    });
    await this.publish(
      'bible.passage-translation.generated',
      principal.userId,
      organizationId,
      translated.id,
      {
        title: `${source.reference} · ${input.targetLocale}`,
        sourceId: passageId,
      },
    );
    return this.passageTranslationToDto(translated);
  }

  private async resolvePassage(
    organizationId: string,
    source: {
      translationId: string;
      book: string;
      chapter: number;
      verseStart: number;
      verseEnd: number;
    },
    persisted: boolean,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ): Promise<BiblePassageDto> {
    const translation = await this.requireTranslation(
      organizationId,
      source.translationId,
    );
    const verses = await this.prisma.bibleVerse.findMany({
      where: {
        translationId: source.translationId,
        book: source.book,
        chapter: source.chapter,
        verse: { gte: source.verseStart, lte: source.verseEnd },
      },
      orderBy: { verse: 'asc' },
    });
    if (verses.length !== source.verseEnd - source.verseStart + 1) {
      throw new NotFoundException(
        'One or more requested Bible verses are unavailable',
      );
    }
    const reference = `${source.book} ${source.chapter}:${source.verseStart}${source.verseEnd === source.verseStart ? '' : `-${source.verseEnd}`}`;
    return BiblePassageSchema.parse({
      // Search results are previews; only a created passage is a reusable sourceId.
      id: id ?? 'search',
      organizationId,
      translationId: source.translationId,
      translationAbbreviation: translation.abbreviation,
      book: source.book,
      chapter: source.chapter,
      verseStart: source.verseStart,
      verseEnd: source.verseEnd,
      reference,
      verses,
      createdAt: (createdAt ?? new Date()).toISOString(),
      updatedAt: (updatedAt ?? new Date()).toISOString(),
    });
  }

  private parseReference(value: string): {
    book: string;
    chapter: number;
    verseStart?: number;
    verseEnd?: number;
  } {
    const match = /^(.+?\D)\s*(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(value.trim());
    if (!match)
      throw new BadRequestException(
        'Reference must use Book chapter, Book chapter:verse, or Book chapter:verse-endVerse',
      );
    const [, book, chapter, verseStart, verseEnd] = match;
    if (verseEnd && Number(verseEnd) < Number(verseStart))
      throw new BadRequestException('Reference range is invalid');
    return {
      book: book.trim(),
      chapter: Number(chapter),
      ...(verseStart
        ? {
            verseStart: Number(verseStart),
            verseEnd: Number(verseEnd ?? verseStart),
          }
        : {}),
    };
  }

  private async resolveBookName(
    organizationId: string,
    translationId: string,
    requested: string,
  ): Promise<string> {
    await this.requireTranslation(organizationId, translationId);
    const normalized = requested
      .trim()
      .toLocaleLowerCase('it')
      .replace(/[.\s]/g, '');
    const aliases: Record<string, readonly string[]> = {
      ge: ['Genesi', 'Genesis'],
      es: ['Esodo', 'Exodus'],
      lv: ['Levitico', 'Leviticus'],
      nm: ['Numeri', 'Numbers'],
      dt: ['Deuteronomio', 'Deuteronomy'],
      gs: ['Giosue', 'Joshua'],
      gd: ['Giudici', 'Judges'],
      rt: ['Rut', 'Ruth'],
      '1sam': ['1 Samuele', '1 Samuel'],
      '2sam': ['2 Samuele', '2 Samuel'],
      '1re': ['1 Re', '1 Kings'],
      '2re': ['2 Re', '2 Kings'],
      sl: ['Salmi', 'Psalms'],
      pr: ['Proverbi', 'Proverbs'],
      is: ['Isaia', 'Isaiah'],
      ger: ['Geremia', 'Jeremiah'],
      ez: ['Ezechiele', 'Ezekiel'],
      dn: ['Daniele', 'Daniel'],
      mt: ['Matteo', 'Matthew'],
      mc: ['Marco', 'Mark'],
      lc: ['Luca', 'Luke'],
      gv: ['Giovanni', 'John'],
      at: ['Atti', 'Acts'],
      rm: ['Romani', 'Romans'],
      '1cor': ['1 Corinzi', '1 Corinthians'],
      '2cor': ['2 Corinzi', '2 Corinthians'],
      gal: ['Galati', 'Galatians'],
      ef: ['Efesini', 'Ephesians'],
      fil: ['Filippesi', 'Philippians'],
      col: ['Colossesi', 'Colossians'],
      '1ts': ['1 Tessalonicesi', '1 Thessalonians'],
      '2ts': ['2 Tessalonicesi', '2 Thessalonians'],
      '1tm': ['1 Timoteo', '1 Timothy'],
      '2tm': ['2 Timoteo', '2 Timothy'],
      tt: ['Tito'],
      eb: ['Ebrei', 'Hebrews'],
      gc: ['Giacomo', 'James'],
      '1pt': ['1 Pietro', '1 Peter'],
      '2pt': ['2 Pietro', '2 Peter'],
      '1gv': ['1 Giovanni', '1 John'],
      '2gv': ['2 Giovanni', '2 John'],
      '3gv': ['3 Giovanni', '3 John'],
      ap: ['Apocalisse', 'Revelation'],
    };
    const candidates = [
      ...new Set([requested.trim(), ...(aliases[normalized] ?? [])]),
    ];
    const direct = await this.prisma.bibleVerse.findFirst({
      where: { translationId, book: { in: candidates, mode: 'insensitive' } },
      select: { book: true },
      orderBy: { bookOrder: 'asc' },
    });
    if (direct) return direct.book;
    throw new NotFoundException(
      `Bible book '${requested}' is unavailable in this translation`,
    );
  }

  private async chapterReference(
    organizationId: string,
    translationId: string,
    book: string,
    chapter: number,
  ): Promise<{
    book: string;
    chapter: number;
    verseStart: number;
    verseEnd: number;
  }> {
    await this.requireTranslation(organizationId, translationId);
    const verses = await this.prisma.bibleVerse.findMany({
      where: { translationId, book, chapter },
      orderBy: { verse: 'asc' },
      select: { verse: true },
    });
    if (!verses.length)
      throw new NotFoundException('Bible chapter is unavailable');
    return {
      book,
      chapter,
      verseStart: verses[0].verse,
      verseEnd: verses.at(-1)!.verse,
    };
  }

  private async requireTranslation(
    organizationId: string,
    translationId: string,
  ) {
    const translation = await this.prisma.bibleTranslation.findFirst({
      where: { id: translationId, organizationId },
    });
    if (!translation)
      throw new NotFoundException('Bible translation not found');
    return translation;
  }

  private async requireMembership(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    const membership = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { roles: true },
    });
    if (!membership) throw new ForbiddenException('Organization access denied');
    return membership.roles;
  }

  private async requireLibraryEditor(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const roles = await this.requireMembership(userId, organizationId);
    if (!roles.some((role) => role === 'OWNER' || role === 'ADMIN'))
      throw new ForbiddenException('Bible import requires Owner or Admin role');
  }

  private async requireServiceEditor(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const roles = await this.requireMembership(userId, organizationId);
    if (
      !roles.some(
        (role) => role === 'OWNER' || role === 'ADMIN' || role === 'LEADER',
      )
    )
      throw new ForbiddenException(
        'Bible passage creation requires Owner, Admin, or Leader role',
      );
  }

  private translationToDto(record: {
    id: string;
    organizationId: string;
    locale: string;
    name: string;
    abbreviation: string;
    copyright: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): BibleTranslationDto {
    return BibleTranslationSchema.parse({
      id: record.id,
      organizationId: record.organizationId,
      locale: record.locale,
      name: record.name,
      abbreviation: record.abbreviation,
      ...(record.copyright ? { copyright: record.copyright } : {}),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  private passageTranslationToDto(record: {
    id: string;
    passageId: string;
    locale: string;
    verses: unknown;
    generatedAt: Date;
    provider: string;
    model: string;
  }): BiblePassageTranslationDto {
    return BiblePassageTranslationSchema.parse({
      ...record,
      generatedAt: record.generatedAt.toISOString(),
    });
  }

  private publish(
    type:
      | 'bible.translation.created'
      | 'bible.verses.imported'
      | 'bible.passage.created'
      | 'bible.passage-translation.generated',
    actorUserId: string,
    organizationId: string,
    subjectId: string,
    payload: DomainEventPayloadDto,
  ) {
    return this.events.publish({
      type,
      actorUserId,
      organizationId,
      subjectId,
      payload,
      correlationId: this.requestContext.requestId ?? 'system',
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
