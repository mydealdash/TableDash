import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AuthUser, CurrentUser, Public } from './auth.guard';

class RegisterDto {
  @IsEmail() email: string;
  @MinLength(8) password: string;
  @IsString() firstName: string;
  @IsString() lastName: string;
  @IsOptional() @Matches(/^\+?[0-9]{7,15}$/) phone?: string;
}
class LoginDto { @IsEmail() email: string; @IsString() password: string; }
class OtpRequestDto { @Matches(/^\+?[0-9]{7,15}$/) phone: string; }
class OtpVerifyDto {
  @Matches(/^\+?[0-9]{7,15}$/) phone: string;
  @Matches(/^\d{6}$/) code: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Public() @Post('login') @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }
  @Public() @Post('otp/request') @Throttle({ default: { limit: 5, ttl: 60000 } })
  otp(@Body() dto: OtpRequestDto) { return this.auth.requestOtp(dto.phone); }
  @Public() @Post('otp/verify') verify(@Body() dto: OtpVerifyDto) { return this.auth.verifyOtp(dto); }
  @Get('me') me(@CurrentUser() user: AuthUser) { return this.auth.me(user.id); }
}
