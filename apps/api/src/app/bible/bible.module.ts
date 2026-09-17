import { Module } from '@nestjs/common';
import { BibleController } from './bible.controller';
import { BibleService } from './bible.service';
import { TranslationsModule } from '../translations/translations.module';

@Module({
  imports: [TranslationsModule],
  controllers: [BibleController],
  providers: [BibleService],
})
export class BibleModule {}
