import {
  CreateLocationRequestSchema,
  AddOrganizationMemberRequestSchema,
  IdSchema,
  UpdateLocationRequestSchema,
  UpdateMemberRolesRequestSchema,
  type AuthPrincipalDto,
  type AddOrganizationMemberRequestDto,
  type CreateLocationRequestDto,
  type LocationDto,
  type MessageResponseDto,
  type OrganizationOverviewDto,
  type UpdateLocationRequestDto,
  type UpdateMemberRolesRequestDto,
} from '@worship/shared-dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get(':organizationId')
  getOverview(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
  ): Promise<OrganizationOverviewDto> {
    return this.organizations.getOverview(principal.userId, organizationId);
  }

  @Post(':organizationId/locations')
  createLocation(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Body(new ZodValidationPipe(CreateLocationRequestSchema)) input: CreateLocationRequestDto,
  ): Promise<LocationDto> {
    return this.organizations.createLocation(principal, organizationId, input);
  }

  @Patch(':organizationId/locations/:locationId')
  updateLocation(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('locationId', new ZodValidationPipe(IdSchema)) locationId: string,
    @Body(new ZodValidationPipe(UpdateLocationRequestSchema)) input: UpdateLocationRequestDto,
  ): Promise<LocationDto> {
    return this.organizations.updateLocation(principal, organizationId, locationId, input);
  }

  @Delete(':organizationId/locations/:locationId')
  async removeLocation(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('locationId', new ZodValidationPipe(IdSchema)) locationId: string,
  ): Promise<MessageResponseDto> {
    await this.organizations.removeLocation(principal, organizationId, locationId);
    return { message: 'Location deleted' };
  }

  @Patch(':organizationId/members/:userId/roles')
  updateMemberRoles(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('userId', new ZodValidationPipe(IdSchema)) userId: string,
    @Body(new ZodValidationPipe(UpdateMemberRolesRequestSchema)) input: UpdateMemberRolesRequestDto,
  ): Promise<OrganizationOverviewDto> {
    return this.organizations.updateMemberRoles(principal, organizationId, userId, input);
  }

  @Post(':organizationId/members')
  addMember(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Body(new ZodValidationPipe(AddOrganizationMemberRequestSchema))
    input: AddOrganizationMemberRequestDto,
  ): Promise<OrganizationOverviewDto> {
    return this.organizations.addMember(principal, organizationId, input);
  }
}
