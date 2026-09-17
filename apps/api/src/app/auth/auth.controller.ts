import {
  LoginRequestSchema,
  LogoutRequestSchema,
  RefreshTokenRequestSchema,
  RegisterRequestSchema,
  type AuthPrincipalDto,
  type AuthSessionDto,
  type CurrentUserDto,
  type LoginRequestDto,
  type LogoutRequestDto,
  type MessageResponseDto,
  type RefreshTokenRequestDto,
  type RegisterRequestDto,
} from '@worship/shared-dto';
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentPrincipal } from './current-principal.decorator';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(
    @Body(new ZodValidationPipe(RegisterRequestSchema))
    input: RegisterRequestDto,
  ): Promise<AuthSessionDto> {
    return this.auth.register(input);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) input: LoginRequestDto,
  ): Promise<AuthSessionDto> {
    return this.auth.login(input);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(
    @Body(new ZodValidationPipe(RefreshTokenRequestSchema))
    input: RefreshTokenRequestDto,
  ): Promise<AuthSessionDto> {
    return this.auth.refresh(input.refreshToken);
  }

  @HttpCode(200)
  @Post('logout')
  async logout(
    @CurrentPrincipal() principal: AuthPrincipalDto,
    @Body(new ZodValidationPipe(LogoutRequestSchema)) input: LogoutRequestDto,
  ): Promise<MessageResponseDto> {
    await this.auth.logout(principal.userId, input.refreshToken);
    return { message: 'Logged out' };
  }

  @Get('me')
  me(@CurrentPrincipal() principal: AuthPrincipalDto): Promise<CurrentUserDto> {
    return this.auth.current(principal.userId);
  }
}
