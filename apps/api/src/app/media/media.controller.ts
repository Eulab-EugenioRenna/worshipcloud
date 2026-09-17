import {
  CreateMediaAssetRequestSchema,
  IdSchema,
  MediaAssetListQuerySchema,
  UpdateMediaAssetRequestSchema,
  type AuthPrincipalDto,
  type CreateMediaAssetRequestDto,
  type MediaAssetDto,
  type MediaAssetListQueryDto,
  type MessageResponseDto,
  type UpdateMediaAssetRequestDto,
} from '@worship/shared-dto';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MediaService } from './media.service';

@Controller('organizations/:organizationId/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Query(new ZodValidationPipe(MediaAssetListQuerySchema)) query: MediaAssetListQueryDto,
  ): Promise<MediaAssetDto[]> {
    return this.media.list(principal.userId, organizationId, query);
  }

  @Get(':assetId')
  get(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('assetId', new ZodValidationPipe(IdSchema)) assetId: string,
  ): Promise<MediaAssetDto> {
    return this.media.get(principal.userId, organizationId, assetId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Body(new ZodValidationPipe(CreateMediaAssetRequestSchema)) input: CreateMediaAssetRequestDto,
  ): Promise<MediaAssetDto> {
    return this.media.create(principal, organizationId, input);
  }

  @Patch(':assetId')
  update(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('assetId', new ZodValidationPipe(IdSchema)) assetId: string,
    @Body(new ZodValidationPipe(UpdateMediaAssetRequestSchema)) input: UpdateMediaAssetRequestDto,
  ): Promise<MediaAssetDto> {
    return this.media.update(principal, organizationId, assetId, input);
  }

  @Delete(':assetId')
  async remove(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('assetId', new ZodValidationPipe(IdSchema)) assetId: string,
  ): Promise<MessageResponseDto> {
    await this.media.remove(principal, organizationId, assetId);
    return { message: 'Media asset deleted' };
  }
}
