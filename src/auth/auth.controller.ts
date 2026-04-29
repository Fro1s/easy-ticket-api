import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MagicLinkDto } from './dto/magic-link.dto';
import { ClaimDto, ConsumeMagicLinkDto } from './dto/claim.dto';
import { AuthResponse, MagicLinkResponse } from './dto/auth.response';

@ApiTags('auth')
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
  @ApiOperation({ summary: 'Email + password login' })
  @ApiResponse({ status: 200, type: AuthResponse })
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @Post('magic-link')
  @ApiOperation({
    summary: 'Request a magic-link email (15 min TTL). Always responds 200.',
  })
  @ApiResponse({ status: 200, type: MagicLinkResponse })
  magicLink(@Body() dto: MagicLinkDto): Promise<MagicLinkResponse> {
    return this.auth.requestMagicLink(dto);
  }

  @Post('magic-link/consume')
  @ApiOperation({ summary: 'Exchange a magic-link token for a session' })
  @ApiResponse({ status: 200, type: AuthResponse })
  consumeMagicLink(@Body() dto: ConsumeMagicLinkDto): Promise<AuthResponse> {
    return this.auth.consumeMagicLink(dto);
  }

  @Post('claim')
  @ApiOperation({ summary: 'Claim a ghost account using the email token' })
  @ApiResponse({ status: 200, type: AuthResponse })
  claim(@Body() dto: ClaimDto): Promise<AuthResponse> {
    return this.auth.claim(dto);
  }
}
