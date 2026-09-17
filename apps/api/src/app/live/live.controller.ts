import {
  IdSchema,
  LiveActionRequestSchema,
  LiveOutputAccessQuerySchema,
  type AuthPrincipalDto,
  type LiveActionRequestDto,
  type LiveOutputAccessQueryDto,
  type LiveSessionDto,
  type LiveStateDto,
} from '@worship/shared-dto';
import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { filter, map, type Observable } from 'rxjs';
import { CurrentPrincipal } from '../auth/current-principal.decorator';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EventBusService } from '../events/event-bus.service';
import { LiveService } from './live.service';

@Controller('organizations/:organizationId/services/:serviceId/live')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Post('start')
  start(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('organizationId', new ZodValidationPipe(IdSchema))
    organizationId: string,
    @Param('serviceId', new ZodValidationPipe(IdSchema)) serviceId: string,
  ): Promise<LiveSessionDto> {
    return this.live.start(principal, organizationId, serviceId);
  }
}

@Controller('live-sessions')
export class LiveOutputsController {
  constructor(
    private readonly live: LiveService,
    private readonly events: EventBusService,
  ) {}

  @Get(':sessionId')
  get(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('sessionId', new ZodValidationPipe(IdSchema)) sessionId: string,
  ): Promise<LiveSessionDto> {
    return this.live.get(principal.userId, sessionId);
  }

  @Post(':sessionId/actions')
  act(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Param('sessionId', new ZodValidationPipe(IdSchema)) sessionId: string,
    @Body(new ZodValidationPipe(LiveActionRequestSchema))
    input: LiveActionRequestDto,
  ): Promise<LiveSessionDto> {
    return this.live.act(principal, sessionId, input);
  }

  @Public()
  @Get(':sessionId/state')
  getOutputState(
    @Param('sessionId', new ZodValidationPipe(IdSchema)) sessionId: string,
    @Query(new ZodValidationPipe(LiveOutputAccessQuerySchema))
    query: LiveOutputAccessQueryDto,
  ): Promise<LiveStateDto> {
    return this.live.getOutputState(sessionId, query.key);
  }

  @Public()
  @Sse(':sessionId/events')
  async outputEvents(
    @Param('sessionId', new ZodValidationPipe(IdSchema)) sessionId: string,
    @Query(new ZodValidationPipe(LiveOutputAccessQuerySchema))
    query: LiveOutputAccessQueryDto,
  ): Promise<Observable<MessageEvent>> {
    await this.live.getOutputState(sessionId, query.key);
    return this.events.events$.pipe(
      filter(
        (event) =>
          event.type === 'live.state.updated' &&
          event.payload.sessionId === sessionId,
      ),
      map((event) => ({ id: event.id, data: event.payload.liveState })),
    );
  }
}
