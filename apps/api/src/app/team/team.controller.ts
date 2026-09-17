import {
  CreateServiceTeamAssignmentRequestSchema,
  IdSchema,
  UpdateServiceTeamAssignmentRequestSchema,
  type AuthPrincipalDto,
  type CreateServiceTeamAssignmentRequestDto,
  type MessageResponseDto,
  type MyServiceTeamAssignmentDto,
  type ServiceTeamAssignmentDto,
  type UpdateServiceTeamAssignmentRequestDto,
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
import { TeamService } from './team.service';

@Controller('organizations/:organizationId/services/:serviceId/team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
  ): Promise<ServiceTeamAssignmentDto[]> {
    return this.team.list(principal.userId, organizationId, serviceId);
  }

  @Post()
  assign(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Body(new ZodValidationPipe(CreateServiceTeamAssignmentRequestSchema))
    input: CreateServiceTeamAssignmentRequestDto,
  ): Promise<ServiceTeamAssignmentDto> {
    return this.team.assign(principal, organizationId, serviceId, input);
  }

  @Patch(':assignmentId')
  update(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('assignmentId', new ZodValidationPipe(IdSchema)) assignmentId: string,
    @Body(new ZodValidationPipe(UpdateServiceTeamAssignmentRequestSchema))
    input: UpdateServiceTeamAssignmentRequestDto,
  ): Promise<ServiceTeamAssignmentDto> {
    return this.team.update(
      principal,
      organizationId,
      serviceId,
      assignmentId,
      input,
    );
  }

  @Delete(':assignmentId')
  async remove(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
    @Param('assignmentId', new ZodValidationPipe(IdSchema)) assignmentId: string,
  ): Promise<MessageResponseDto> {
    await this.team.remove(principal, organizationId, serviceId, assignmentId);
    return { message: 'Team assignment removed' };
  }
}

@Controller('organizations/:organizationId/my-team-assignments')
export class MyTeamAssignmentsController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
  ): Promise<MyServiceTeamAssignmentDto[]> {
    return this.team.listMine(principal.userId, organizationId);
  }
}
