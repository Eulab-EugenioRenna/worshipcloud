import {
  BibleSearchQuerySchema,
  BibleBooksQuerySchema,
  BibleChaptersQuerySchema,
  BibleVersesQuerySchema,
  GenerateBiblePassageTranslationRequestSchema,
  CreateBiblePassageRequestSchema,
  CreateBibleTranslationRequestSchema,
  IdSchema,
  ImportBibleVersesRequestSchema,
  BibleImportCommandSchema,
  type AuthPrincipalDto,
  type BiblePassageDto,
  type BiblePassageTranslationDto,
  type BibleSearchQueryDto,
  type BibleBooksQueryDto,
  type BibleChaptersQueryDto,
  type BibleVersesQueryDto,
  type BibleTranslationDto,
  type CreateBiblePassageRequestDto,
  type CreateBibleTranslationRequestDto,
  type GenerateBiblePassageTranslationRequestDto,
  type ImportBibleVersesRequestDto,
  type ImportSourceDto,
  type BibleImportCommandDto,
  type ImportBibleResponseDto,
  type MessageResponseDto,
} from '@worship/shared-dto';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BibleService } from './bible.service';

@Controller('organizations/:organizationId/bible')
export class BibleController {
  constructor(private readonly bible: BibleService) {}

  @Get('import/sources')
  listImportSources(): ImportSourceDto[] {
    return this.bible.listImportSources();
  }

  @Post('import')
  importBible(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Body(new ZodValidationPipe(BibleImportCommandSchema))
    input: BibleImportCommandDto,
  ): Promise<ImportBibleResponseDto> {
    return this.bible.importRemote(principal, organizationId, input);
  }

  @Get('translations')
  listTranslations(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
  ): Promise<BibleTranslationDto[]> {
    return this.bible.listTranslations(principal.userId, organizationId);
  }

  @Post('translations')
  createTranslation(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Body(new ZodValidationPipe(CreateBibleTranslationRequestSchema))
    input: CreateBibleTranslationRequestDto,
  ): Promise<BibleTranslationDto> {
    return this.bible.createTranslation(principal, organizationId, input);
  }

  @Post('translations/:translationId/verses/import')
  async importVerses(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('translationId', new ZodValidationPipe(IdSchema))
    translationId: string,
    @Body(new ZodValidationPipe(ImportBibleVersesRequestSchema))
    input: ImportBibleVersesRequestDto,
  ): Promise<MessageResponseDto> {
    await this.bible.importVerses(
      principal,
      organizationId,
      translationId,
      input,
    );
    return { message: 'Bible verses imported' };
  }

  @Get('search')
  search(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Query(new ZodValidationPipe(BibleSearchQuerySchema))
    query: BibleSearchQueryDto,
  ): Promise<BiblePassageDto> {
    return this.bible.search(principal.userId, organizationId, query);
  }

  @Get('books')
  listBooks(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Query(new ZodValidationPipe(BibleBooksQuerySchema))
    query: BibleBooksQueryDto,
  ): Promise<string[]> {
    return this.bible.listBooks(
      principal.userId,
      organizationId,
      query.translationId,
    );
  }

  @Get('chapters')
  listChapters(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Query(new ZodValidationPipe(BibleChaptersQuerySchema))
    query: BibleChaptersQueryDto,
  ): Promise<number[]> {
    return this.bible.listChapters(
      principal.userId,
      organizationId,
      query.translationId,
      query.book,
    );
  }

  @Get('verses')
  listVerses(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Query(new ZodValidationPipe(BibleVersesQuerySchema))
    query: BibleVersesQueryDto,
  ): Promise<number[]> {
    return this.bible.listVerses(
      principal.userId,
      organizationId,
      query.translationId,
      query.book,
      query.chapter,
    );
  }

  @Post('passages')
  createPassage(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Body(new ZodValidationPipe(CreateBiblePassageRequestSchema))
    input: CreateBiblePassageRequestDto,
  ): Promise<BiblePassageDto> {
    return this.bible.createPassage(principal, organizationId, input);
  }

  @Get('passages')
  listPassages(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
  ): Promise<BiblePassageDto[]> {
    return this.bible.listPassages(principal.userId, organizationId);
  }

  @Get('passages/:passageId')
  getPassage(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('passageId', new ZodValidationPipe(IdSchema)) passageId: string,
  ): Promise<BiblePassageDto> {
    return this.bible.getPassage(principal.userId, organizationId, passageId);
  }

  @Get('passages/:passageId/translations')
  listPassageTranslations(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('passageId', new ZodValidationPipe(IdSchema)) passageId: string,
  ): Promise<BiblePassageTranslationDto[]> {
    return this.bible.listPassageTranslations(
      principal.userId,
      organizationId,
      passageId,
    );
  }

  @Post('passages/:passageId/translations/generate')
  generatePassageTranslation(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('passageId', new ZodValidationPipe(IdSchema)) passageId: string,
    @Body(new ZodValidationPipe(GenerateBiblePassageTranslationRequestSchema))
    input: GenerateBiblePassageTranslationRequestDto,
  ): Promise<BiblePassageTranslationDto> {
    return this.bible.generatePassageTranslation(
      principal,
      organizationId,
      passageId,
      input,
    );
  }
}
