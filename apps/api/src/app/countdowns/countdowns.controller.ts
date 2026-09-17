import {
  CreateCountdownRequestSchema,
  IdSchema,
  UpdateCountdownRequestSchema,
  type AuthPrincipalDto,
  type CountdownDefinitionDto,
  type CreateCountdownRequestDto,
  type MessageResponseDto,
  type UpdateCountdownRequestDto,
} from '@worship/shared-dto';
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CountdownsService } from './countdowns.service';

@Controller('organizations/:organizationId/countdowns')
export class CountdownsController {
  constructor(private readonly countdowns: CountdownsService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
  ): Promise<CountdownDefinitionDto[]> {
    return this.countdowns.list(principal.userId, organizationId);
  }

  @Post()
  create(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Body(new ZodValidationPipe(CreateCountdownRequestSchema)) input: CreateCountdownRequestDto,
  ): Promise<CountdownDefinitionDto> {
    return this.countdowns.create(principal, organizationId, input);
  }

  @Patch(':countdownId')
  update(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('countdownId', new ZodValidationPipe(IdSchema)) countdownId: string,
    @Body(new ZodValidationPipe(UpdateCountdownRequestSchema)) input: UpdateCountdownRequestDto,
  ): Promise<CountdownDefinitionDto> {
    return this.countdowns.update(principal, organizationId, countdownId, input);
  }

  @Delete(':countdownId')
  async remove(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema)) organizationId: string,
    @Param('countdownId', new ZodValidationPipe(IdSchema)) countdownId: string,
  ): Promise<MessageResponseDto> {
    await this.countdowns.remove(principal, organizationId, countdownId);
    return { message: 'Countdown deleted' };
  }
}
