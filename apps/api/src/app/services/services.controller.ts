import {
  CreateLineupItemRequestSchema,
  CreateLineupVisualSlideRequestSchema,
  CreateServiceRequestSchema,
  IdSchema,
  ReorderLineupRequestSchema,
  ServiceListQuerySchema,
  UpdateLineupItemRequestSchema,
  UpdateLineupVisualSlideRequestSchema,
  UpdateServiceRequestSchema,
  type AuthPrincipalDto,
  type CreateLineupItemRequestDto,
  type CreateLineupVisualSlideRequestDto,
  type CreateServiceRequestDto,
  type LineupItemDto,
  type LineupItemListDto,
  type MessageResponseDto,
  type ReorderLineupRequestDto,
  type ServiceDto,
  type ServiceListQueryDto,
  type ServiceListResponseDto,
  type UpdateLineupItemRequestDto,
  type UpdateLineupVisualSlideRequestDto,
  type LineupVisualSlideDto,
  type UpdateServiceRequestDto,
} from '@worship/shared-dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ServicesService } from './services.service';

@Controller('organizations/:organizationId/services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Query(new ZodValidationPipe(ServiceListQuerySchema))
    query: ServiceListQueryDto,
  ): Promise<ServiceListResponseDto> {
    return this.services.list(principal.userId, organizationId, query);
  }

  @Get(':serviceId')
  get(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
  ): Promise<ServiceDto> {
    return this.services.get(principal.userId, organizationId, serviceId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Body(new ZodValidationPipe(CreateServiceRequestSchema))
    input: CreateServiceRequestDto,
  ): Promise<ServiceDto> {
    return this.services.create(principal, organizationId, input);
  }

  @Patch(':serviceId')
  update(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Body(new ZodValidationPipe(UpdateServiceRequestSchema))
    input: UpdateServiceRequestDto,
  ): Promise<ServiceDto> {
    return this.services.update(principal, organizationId, serviceId, input);
  }

  @Delete(':serviceId')
  async remove(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
  ): Promise<MessageResponseDto> {
    await this.services.remove(principal, organizationId, serviceId);
    return { message: 'Service deleted' };
  }

  @Post(':serviceId/lineup')
  addLineupItem(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Body(new ZodValidationPipe(CreateLineupItemRequestSchema))
    input: CreateLineupItemRequestDto,
  ): Promise<LineupItemDto> {
    return this.services.addLineupItem(
      principal,
      organizationId,
      serviceId,
      input,
    );
  }

  @Patch(':serviceId/lineup/:itemId')
  updateLineupItem(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('itemId', new ZodValidationPipe(IdSchema)) itemId: string,
    @Body(new ZodValidationPipe(UpdateLineupItemRequestSchema))
    input: UpdateLineupItemRequestDto,
  ): Promise<LineupItemDto> {
    return this.services.updateLineupItem(
      principal,
      organizationId,
      serviceId,
      itemId,
      input,
    );
  }

  @Post(':serviceId/lineup/:itemId/duplicate')
  duplicateLineupItem(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('itemId', new ZodValidationPipe(IdSchema)) itemId: string,
  ): Promise<LineupItemDto> {
    return this.services.duplicateLineupItem(principal, organizationId, serviceId, itemId);
  }

  @Delete(':serviceId/lineup/:itemId')
  async removeLineupItem(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('itemId', new ZodValidationPipe(IdSchema)) itemId: string,
  ): Promise<MessageResponseDto> {
    await this.services.removeLineupItem(
      principal,
      organizationId,
      serviceId,
      itemId,
    );
    return { message: 'Lineup item deleted' };
  }

  @Post(':serviceId/lineup/reorder')
  reorderLineup(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Body(new ZodValidationPipe(ReorderLineupRequestSchema))
    input: ReorderLineupRequestDto,
  ): Promise<LineupItemListDto> {
    return this.services.reorderLineup(
      principal,
      organizationId,
      serviceId,
      input,
    );
  }

  @Get(':serviceId/lineup/:itemId/visual-slides')
  listLineupVisualSlides(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('itemId', new ZodValidationPipe(IdSchema)) itemId: string,
  ): Promise<LineupVisualSlideDto[]> {
    return this.services.listLineupVisualSlides(principal.userId, organizationId, serviceId, itemId);
  }

  @Post(':serviceId/lineup/:itemId/visual-slides')
  createLineupVisualSlide(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('itemId', new ZodValidationPipe(IdSchema)) itemId: string,
    @Body(new ZodValidationPipe(CreateLineupVisualSlideRequestSchema)) input: CreateLineupVisualSlideRequestDto,
  ): Promise<LineupVisualSlideDto> {
    return this.services.createLineupVisualSlide(principal, organizationId, serviceId, itemId, input);
  }

  @Patch(':serviceId/lineup/:itemId/visual-slides/:visualSlideId')
  updateLineupVisualSlide(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('itemId', new ZodValidationPipe(IdSchema)) itemId: string,
    @Param('visualSlideId', new ZodValidationPipe(IdSchema)) visualSlideId: string,
    @Body(new ZodValidationPipe(UpdateLineupVisualSlideRequestSchema)) input: UpdateLineupVisualSlideRequestDto,
  ): Promise<LineupVisualSlideDto> {
    return this.services.updateLineupVisualSlide(principal, organizationId, serviceId, itemId, visualSlideId, input);
  }

  @Delete(':serviceId/lineup/:itemId/visual-slides/:visualSlideId')
  async removeLineupVisualSlide(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('itemId', new ZodValidationPipe(IdSchema)) itemId: string,
    @Param('visualSlideId', new ZodValidationPipe(IdSchema)) visualSlideId: string,
  ): Promise<MessageResponseDto> {
    await this.services.removeLineupVisualSlide(principal, organizationId, serviceId, itemId, visualSlideId);
    return { message: 'Lineup visual slide deleted' };
  }
}
