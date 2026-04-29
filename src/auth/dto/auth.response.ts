import { ApiProperty } from '@nestjs/swagger';

export class AuthUserResponse {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true, type: String }) name: string | null;
  @ApiProperty() role: string;
}

export class AuthResponse {
  @ApiProperty({ type: AuthUserResponse })
  user: AuthUserResponse;

  @ApiProperty({ description: 'Bearer token, expires per APP_JWT_EXPIRES_IN' })
  accessToken: string;

  @ApiProperty({ description: 'Refresh token, expires per APP_JWT_REFRESH_EXPIRES_IN' })
  refreshToken: string;
}

export class MagicLinkResponse {
  @ApiProperty({ example: true })
  sent: boolean;
}
