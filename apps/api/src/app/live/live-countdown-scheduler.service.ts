import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StructuredLogger } from '../common/structured-logger.service';
import { LiveService } from './live.service';

/** Maintains countdown transitions independently from connected browsers. */
@Injectable()
export class LiveCountdownSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly live: LiveService,
    private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), 1_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.live.completeDueCountdowns();
    } catch (error) {
      this.logger.error(
        { event: 'live.countdown.scheduler.failed', error: error instanceof Error ? error.message : String(error) },
        error instanceof Error ? error.stack : undefined,
        LiveCountdownSchedulerService.name,
      );
    } finally {
      this.running = false;
    }
  }
}
