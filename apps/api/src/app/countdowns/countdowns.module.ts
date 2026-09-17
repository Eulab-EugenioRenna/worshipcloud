import { Module } from '@nestjs/common';
import { CountdownsController } from './countdowns.controller';
import { CountdownsService } from './countdowns.service';

@Module({ controllers: [CountdownsController], providers: [CountdownsService] })
export class CountdownsModule {}
