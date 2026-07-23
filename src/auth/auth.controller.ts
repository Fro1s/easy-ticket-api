import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MagicLinkDto } from './dto/magic-link.dto';
import { ClaimDto, ConsumeMagicLinkDto } from './dto/claim.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto';
import { AuthResponse, MagicLinkResponse } from './dto/auth.response';

interface AuthedRequest extends Request {
  user: { id: string; email: string; role: string };
}

// Limites apertados contra brute-force / credential stuffing / email bombing.
// Login e magic-link (que dispara e-mails) são os mais restritos.
@ApiTags('auth')
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Create a new buyer account' })
  @ApiResponse({ status: 201, type: AuthResponse })
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Email + password login' })
  @ApiResponse({ status: 200, type: AuthResponse })
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @Post('magic-link')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({
    summary: 'Request a magic-link email (15 min TTL). Always responds 200.',
  })
  @ApiResponse({ status: 200, type: MagicLinkResponse })
  magicLink(@Body() dto: MagicLinkDto): Promise<MagicLinkResponse> {
    return this.auth.requestMagicLink(dto);
  }

  @Post('magic-link/consume')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Exchange a magic-link token for a session' })
  @ApiResponse({ status: 200, type: AuthResponse })
  consumeMagicLink(@Body() dto: ConsumeMagicLinkDto): Promise<AuthResponse> {
    return this.auth.consumeMagicLink(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({
    summary:
      'Request a password-reset email (30 min TTL). Always responds 200. ' +
      'Ghost accounts receive the account-activation link instead.',
  })
  @ApiResponse({ status: 200, type: MagicLinkResponse })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MagicLinkResponse> {
    return this.auth.requestPasswordReset(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Set a new password using the emailed token. Returns a session.',
  })
  @ApiResponse({ status: 200, type: AuthResponse })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<AuthResponse> {
    return this.auth.resetPassword(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new session' })
  @ApiResponse({ status: 200, type: AuthResponse })
  refresh(@Body() dto: RefreshDto): Promise<AuthResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('claim')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Claim a ghost account using the email token' })
  @ApiResponse({ status: 200, type: AuthResponse })
  claim(@Body() dto: ClaimDto): Promise<AuthResponse> {
    return this.auth.claim(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Revoke all refresh tokens for the current user (logout).',
  })
  @ApiResponse({ status: 201 })
  logout(@Req() req: AuthedRequest): Promise<{ success: true }> {
    return this.auth.logout(req.user.id);
  }
}
