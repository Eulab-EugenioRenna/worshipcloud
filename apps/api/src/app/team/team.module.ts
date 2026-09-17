import { Module } from '@nestjs/common';
import { MyTeamAssignmentsController, TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  controllers: [TeamController, MyTeamAssignmentsController],
  providers: [TeamService],
})
export class TeamModule {}
