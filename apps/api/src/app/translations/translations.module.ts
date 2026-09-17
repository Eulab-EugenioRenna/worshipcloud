import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { TranslationService } from './translation.service';

@Module({
  imports: [CommonModule],
  providers: [TranslationService],
  exports: [TranslationService],
})
export class TranslationsModule {}
