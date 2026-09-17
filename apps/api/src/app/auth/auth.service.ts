import {
  AuthSessionSchema,
  CurrentUserSchema,
  type AuthSessionDto,
  type AuthPrincipalDto,
  type AuthTokensDto,
  type CurrentUserDto,
  type LoginRequestDto,
  type RegisterRequestDto,
  type UserRole,
  AccessTokenClaimsSchema,
} from '@worship/shared-dto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { RequestContextService } from '../common/request-context.service';
import { PrismaService } from '../database/prisma.service';
import { EventBusService } from '../events/event-bus.service';
import { PasswordService } from './password.service';

const ROLE_NAMES: Record<string, UserRole> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  LEADER: 'Leader',
  OPERATOR: 'Operator',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventBusService,
    private readonly requestContext: RequestContextService,
  ) {}

  async register(input: RegisterRequestDto): Promise<AuthSessionDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('An account already exists for this email');
    const passwordHash = await this.passwords.hash(input.password);
    const created = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: input.email,
          name: input.name,
          credential: { create: { passwordHash } },
        },
      });
      const organization = await transaction.organization.create({
        data: {
          name: input.organizationName,
          locations: { create: { name: input.locationName } },
          memberships: { create: { userId: user.id, roles: ['OWNER'] } },
        },
      });
      return { user, organization };
    });
    const result = await this.issueSession(created.user.id);
    await this.events.publish({
      type: 'auth.user.registered',
      organizationId: created.organization.id,
      actorUserId: created.user.id,
      subjectId: created.user.id,
      payload: { email: created.user.email },
      correlationId: this.requestContext.requestId ?? 'system',
    });
    return result;
  }

  async login(input: LoginRequestDto): Promise<AuthSessionDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: {
        credential: true,
        memberships: { include: { organization: true } },
      },
    });
    if (
      !user?.credential ||
      !user.active ||
      !(await this.passwords.verify(
        input.password,
        user.credential.passwordHash,
      ))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const result = await this.issueSession(user.id);
    await this.events.publish({
      type: 'auth.user.logged-in',
      organizationId: user.memberships[0]?.organizationId ?? null,
      actorUserId: user.id,
      subjectId: user.id,
      payload: {},
      correlationId: this.requestContext.requestId ?? 'system',
    });
    return result;
  }

  async refresh(refreshToken: string): Promise<AuthSessionDto> {
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.active
    ) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    return this.issueSession(session.userId, session.id, this.hashToken(refreshToken));
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const revoked = await this.prisma.authSession.updateMany({
      where: {
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (revoked.count) {
      await this.events.publish({
        type: 'auth.user.logged-out',
        organizationId: null,
        actorUserId: userId,
        subjectId: userId,
        payload: {},
        correlationId: this.requestContext.requestId ?? 'system',
      });
    }
  }

  async current(userId: string): Promise<CurrentUserDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { organization: true } } },
    });
    return CurrentUserSchema.parse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        active: user.active,
      },
      memberships: user.memberships.map((membership) => ({
        organizationId: membership.organizationId,
        organizationName: membership.organization.name,
        roles: membership.roles.map((role) => ROLE_NAMES[role]),
      })),
    });
  }

  /** Validates a socket access token against its persisted, active session. */
  async principalForAccessToken(token: string): Promise<AuthPrincipalDto> {
    try {
      const raw = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      const claims = AccessTokenClaimsSchema.parse(raw);
      const session = await this.prisma.authSession.findFirst({
        where: {
          id: claims.sid,
          userId: claims.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          user: { active: true },
        },
        select: { id: true },
      });
      if (!session) throw new UnauthorizedException('Session is no longer active');
      return { userId: claims.sub, sessionId: claims.sid };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private async issueSession(
    userId: string,
    sessionId?: string,
    expectedRefreshTokenHash?: string,
  ): Promise<AuthSessionDto> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenExpiresAt = new Date(
      Date.now() +
        this.config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS') * 86_400_000,
    );
    const refreshTokenHash = this.hashToken(refreshToken);
    const session = sessionId
      ? await this.rotateSession(sessionId, refreshTokenHash, refreshTokenExpiresAt, expectedRefreshTokenHash)
      : await this.prisma.authSession.create({
          data: {
            userId,
            refreshTokenHash,
            expiresAt: refreshTokenExpiresAt,
          },
        });
    const accessTtlSeconds =
      this.config.getOrThrow<number>('JWT_ACCESS_TTL_MINUTES') * 60;
    const accessTokenExpiresAt = new Date(Date.now() + accessTtlSeconds * 1000);
    const accessToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id, type: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: accessTtlSeconds,
      },
    );
    const tokens: AuthTokensDto = {
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
    const current = await this.current(userId);
    return AuthSessionSchema.parse({ ...current, tokens });
  }

  /** A refresh token is single-use: only the request that still owns its hash may rotate it. */
  private async rotateSession(
    sessionId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    expectedRefreshTokenHash?: string,
  ): Promise<{ id: string }> {
    if (!expectedRefreshTokenHash) {
      return this.prisma.authSession.update({
        where: { id: sessionId },
        data: { refreshTokenHash, expiresAt, lastUsedAt: new Date() },
        select: { id: true },
      });
    }
    const rotated = await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        refreshTokenHash: expectedRefreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { refreshTokenHash, expiresAt, lastUsedAt: new Date() },
    });
    if (rotated.count !== 1) throw new UnauthorizedException('Refresh token is invalid or already used');
    return { id: sessionId };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
