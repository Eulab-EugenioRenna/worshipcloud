import {
  CreateSlideRequestSchema,
  CreateSlideTemplateRequestSchema,
  IdSchema,
  SlideListQuerySchema,
  UpdateSlideRequestSchema,
  UpdateSlideTemplateRequestSchema,
  type AuthPrincipalDto,
  type CreateSlideRequestDto,
  type CreateSlideTemplateRequestDto,
  type MessageResponseDto,
  type SlideDocumentDto,
  type SlideListQueryDto,
  type SlideTemplateDto,
  type UpdateSlideRequestDto,
  type UpdateSlideTemplateRequestDto,
} from '@worship/shared-dto';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SlidesService } from './slides.service';

@Controller('organizations/:organizationId/slides')
export class SlidesController {
  constructor(private readonly slides: SlidesService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Query(new ZodValidationPipe(SlideListQuerySchema)) query: SlideListQueryDto,
  ): Promise<SlideDocumentDto[]> {
    return this.slides.list(principal.userId, organizationId, query);
  }

  @Get(':slideId')
  get(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('slideId', new ZodValidationPipe(IdSchema)) slideId: string,
  ): Promise<SlideDocumentDto> {
    return this.slides.get(principal.userId, organizationId, slideId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Body(new ZodValidationPipe(CreateSlideRequestSchema)) input: CreateSlideRequestDto,
  ): Promise<SlideDocumentDto> {
    return this.slides.create(principal, organizationId, input);
  }

  @Patch(':slideId')
  update(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('slideId', new ZodValidationPipe(IdSchema)) slideId: string,
    @Body(new ZodValidationPipe(UpdateSlideRequestSchema)) input: UpdateSlideRequestDto,
  ): Promise<SlideDocumentDto> {
    return this.slides.update(principal, organizationId, slideId, input);
  }

  @Delete(':slideId')
  async remove(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('slideId', new ZodValidationPipe(IdSchema)) slideId: string,
  ): Promise<MessageResponseDto> {
    await this.slides.remove(principal, organizationId, slideId);
    return { message: 'Slide deleted' };
  }

}

@Controller('organizations/:organizationId/slide-templates')
export class SlideTemplatesController {
  constructor(private readonly slides: SlidesService) {}

  @Get()
  listTemplates(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
  ): Promise<SlideTemplateDto[]> {
    return this.slides.listTemplates(principal.userId, organizationId);
  }

  @Post()
  createTemplate(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Body(new ZodValidationPipe(CreateSlideTemplateRequestSchema)) input: CreateSlideTemplateRequestDto,
  ): Promise<SlideTemplateDto> {
    return this.slides.createTemplate(principal, organizationId, input);
  }

  @Patch(':templateId')
  updateTemplate(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('templateId', new ZodValidationPipe(IdSchema)) templateId: string,
    @Body(new ZodValidationPipe(UpdateSlideTemplateRequestSchema)) input: UpdateSlideTemplateRequestDto,
  ): Promise<SlideTemplateDto> {
    return this.slides.updateTemplate(principal, organizationId, templateId, input);
  }

  @Delete(':templateId')
  async removeTemplate(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('templateId', new ZodValidationPipe(IdSchema)) templateId: string,
  ): Promise<MessageResponseDto> {
    await this.slides.removeTemplate(principal, organizationId, templateId);
    return { message: 'Slide template deleted' };
  }
}
