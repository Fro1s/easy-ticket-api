import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiPropertyOptional({
    description:
      'Senha atual. Obrigatória para contas que já possuem senha; ' +
      'omitida por quem nunca definiu uma (acesso só por link mágico).',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiProperty({ example: 'novaSenhaSegura123' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
