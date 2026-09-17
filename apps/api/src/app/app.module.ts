import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ServicesModule } from './services/services.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { SongsModule } from './songs/songs.module';
import { TeamModule } from './team/team.module';
import { LiveModule } from './live/live.module';
import { BibleModule } from './bible/bible.module';
import { MediaModule } from './media/media.module';
import { SlidesModule } from './slides/slides.module';
import { CountdownsModule } from './countdowns/countdowns.module';
import { TranslationsModule } from './translations/translations.module';
import { ImportSourcesModule } from './import-sources/import-sources.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    CommonModule,
    DatabaseModule,
    ImportSourcesModule,
    EventsModule,
    AuthModule,
    NotificationsModule,
    ServicesModule,
    OrganizationsModule,
    SongsModule,
    TeamModule,
    LiveModule,
    BibleModule,
    MediaModule,
    SlidesModule,
    CountdownsModule,
    TranslationsModule,
    EmailModule,
    HealthModule,
  ],
})
export class AppModule {}
