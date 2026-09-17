import { Module } from '@nestjs/common';
import { SlideTemplatesController, SlidesController } from './slides.controller';
import { SlidesService } from './slides.service';

@Module({
  controllers: [SlidesController, SlideTemplatesController],
  providers: [SlidesService],
})
export class SlidesModule {}
