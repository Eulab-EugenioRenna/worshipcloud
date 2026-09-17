import { Global, Module } from '@nestjs/common';
import { ImportSourcesService } from './import-sources.service';

@Global()
@Module({
  providers: [ImportSourcesService],
  exports: [ImportSourcesService],
})
export class ImportSourcesModule {}
