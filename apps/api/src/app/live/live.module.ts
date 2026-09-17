import { Module } from '@nestjs/common';
import { LiveController, LiveOutputsController } from './live.controller';
import { LiveGateway } from './live.gateway';
import { LiveCountdownSchedulerService } from './live-countdown-scheduler.service';
import { LiveVisualSceneSynchronizerService } from './live-visual-scene-synchronizer.service';
import { LiveService } from './live.service';
import { AuthModule } from '../auth/auth.module';
import { SongsModule } from '../songs/songs.module';

@Module({
  imports: [AuthModule, SongsModule],
  controllers: [LiveController, LiveOutputsController],
  providers: [
    LiveService,
    LiveGateway,
    LiveCountdownSchedulerService,
    LiveVisualSceneSynchronizerService,
  ],
})
export class LiveModule {}
