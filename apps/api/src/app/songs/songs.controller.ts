import {
  CreateSongRequestSchema,
  IdSchema,
  LanguageTagSchema,
  GenerateSongTranslationRequestSchema,
  SongImportCommandSchema,
  ReplaceSongArrangementsRequestSchema,
  ReplaceSongSectionStepsRequestSchema,
  SongVisualSlideInputSchema,
  SongListQuerySchema,
  SongTranslationInputSchema,
  UpdateSongRequestSchema,
  UpdateSongVisualSlideRequestSchema,
  type AuthPrincipalDto,
  type CreateSongRequestDto,
  type GenerateSongTranslationRequestDto,
  type ImportSourceDto,
  type SongImportCommandDto,
  type ImportSongsResponseDto,
  type MessageResponseDto,
  type ReplaceSongArrangementsRequestDto,
  type ReplaceSongSectionStepsRequestDto,
  type SongDto,
  type SongListQueryDto,
  type SongTranslationDto,
  type SongTranslationInputDto,
  type SongVisualSlideDto,
  type SongVisualSlideInputDto,
  type UpdateSongVisualSlideRequestDto,
  type UpdateSongRequestDto,
} from '@worship/shared-dto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SongsService } from './songs.service';

@Controller('organizations/:organizationId/songs')
export class SongsController {
  constructor(private readonly songs: SongsService) {}

  @Get('import/sources')
  listImportSources(): ImportSourceDto[] {
    return this.songs.listImportSources();
  }

  @Post('import')
  importSongs(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Body(new ZodValidationPipe(SongImportCommandSchema))
    input: SongImportCommandDto,
  ): Promise<ImportSongsResponseDto> {
    return this.songs.importRemote(principal, organizationId, input);
  }

  @Get()
  list(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Query(new ZodValidationPipe(SongListQuerySchema)) query: SongListQueryDto,
  ): Promise<SongDto[]> {
    return this.songs.list(principal.userId, organizationId, query);
  }

  @Get(':songId/translations')
  listTranslations(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
  ): Promise<SongTranslationDto[]> {
    return this.songs.listTranslations(
      principal.userId,
      organizationId,
      songId,
    );
  }

  @Get(':songId/visual-slides')
  listVisualSlides(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
  ): Promise<SongVisualSlideDto[]> {
    return this.songs.listVisualSlides(
      principal.userId,
      organizationId,
      songId,
    );
  }

  @Post(':songId/visual-slides')
  createVisualSlide(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
    @Body(new ZodValidationPipe(SongVisualSlideInputSchema))
    input: SongVisualSlideInputDto,
  ): Promise<SongVisualSlideDto> {
    return this.songs.createVisualSlide(
      principal,
      organizationId,
      songId,
      input,
    );
  }

  @Patch(':songId/visual-slides/:visualSlideId')
  updateVisualSlide(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
    @Param('visualSlideId', new ZodValidationPipe(IdSchema))
    visualSlideId: string,
    @Body(new ZodValidationPipe(UpdateSongVisualSlideRequestSchema))
    input: UpdateSongVisualSlideRequestDto,
  ): Promise<SongVisualSlideDto> {
    return this.songs.updateVisualSlide(
      principal,
      organizationId,
      songId,
      visualSlideId,
      input,
    );
  }

  @Delete(':songId/visual-slides/:visualSlideId')
  async removeVisualSlide(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
    @Param('visualSlideId', new ZodValidationPipe(IdSchema))
    visualSlideId: string,
  ): Promise<MessageResponseDto> {
    await this.songs.removeVisualSlide(
      principal,
      organizationId,
      songId,
      visualSlideId,
    );
    return { message: 'Song visual slide deleted' };
  }

  @Put(':songId/translations/:locale')
  upsertTranslation(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
    @Param('locale', new ZodValidationPipe(LanguageTagSchema)) locale: string,
    @Body(new ZodValidationPipe(SongTranslationInputSchema))
    input: SongTranslationInputDto,
  ): Promise<SongTranslationDto> {
    if (input.locale !== locale) {
      throw new BadRequestException('Translation locale must match its route');
    }
    return this.songs.upsertTranslation(
      principal,
      organizationId,
      songId,
      input,
    );
  }

  @Post(':songId/translations/generate')
  generateTranslation(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
    @Body(new ZodValidationPipe(GenerateSongTranslationRequestSchema))
    input: GenerateSongTranslationRequestDto,
  ): Promise<SongTranslationDto> {
    return this.songs.generateTranslation(
      principal,
      organizationId,
      songId,
      input,
    );
  }

  @Get(':songId')
  get(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
  ): Promise<SongDto> {
    return this.songs.get(principal.userId, organizationId, songId);
  }

  @Post(':songId/steps/regenerate')
  regenerateSteps(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
  ): Promise<SongDto> {
    return this.songs.regenerateSteps(principal, organizationId, songId);
  }

  @Put(':songId/sections/:sectionId/steps')
  replaceSectionSteps(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
    @Param('sectionId', new ZodValidationPipe(IdSchema)) sectionId: string,
    @Body(new ZodValidationPipe(ReplaceSongSectionStepsRequestSchema))
    input: ReplaceSongSectionStepsRequestDto,
  ): Promise<SongDto> {
    return this.songs.replaceSectionSteps(principal, organizationId, songId, sectionId, input);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Body(new ZodValidationPipe(CreateSongRequestSchema))
    input: CreateSongRequestDto,
  ): Promise<SongDto> {
    return this.songs.create(principal, organizationId, input);
  }

  @Patch(':songId')
  update(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
    @Body(new ZodValidationPipe(UpdateSongRequestSchema))
    input: UpdateSongRequestDto,
  ): Promise<SongDto> {
    return this.songs.update(principal, organizationId, songId, input);
  }

  @Patch(':songId/arrangements')
  replaceArrangements(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
    @Body(new ZodValidationPipe(ReplaceSongArrangementsRequestSchema))
    input: ReplaceSongArrangementsRequestDto,
  ): Promise<SongDto> {
    return this.songs.replaceArrangements(
      principal,
      organizationId,
      songId,
      input,
    );
  }

  @Delete(':songId')
  async remove(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('songId', new ZodValidationPipe(IdSchema)) songId: string,
  ): Promise<MessageResponseDto> {
    await this.songs.remove(principal, organizationId, songId);
    return { message: 'Song deleted' };
  }
}
