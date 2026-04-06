import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senhaSegura123' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RegisterDto extends LoginDto {
  @ApiProperty({ example: 'Mario Fumura' })
  @IsString()
  @MinLength(2)
  name!: string;
}
