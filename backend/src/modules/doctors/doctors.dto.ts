import { Transform, Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { IsIn, ArrayMaxSize, IsArray, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { DoctorRegistrationStatus } from '@prisma/client';

const digits = ({value}: {value:unknown}) => typeof value === 'string' ? value.replace(/\D/g,'') : value;
const upper = ({value}: {value:unknown}) => typeof value === 'string' ? value.trim().toUpperCase() : value;
const trimmed = ({value}: {value:unknown}) => typeof value === 'string' ? value.trim() : value;

export class DoctorLicenseInputDto {
  @Transform(digits) @IsString() @Matches(/^[0-9]{1,20}$/) crmNormalized!: string;
  @Transform(upper) @Matches(/^[A-Z]{2}$/) state!: string;
}

export class CreateDoctorDto {
  @Transform(trimmed) @IsString() @MinLength(3) @MaxLength(200) fullName!: string;
  @IsOptional() @Transform(digits) @Matches(/^[0-9]{11}$/) cpfNormalized?: string;
  @IsOptional() @IsString() @MaxLength(30) rg?: string;
  @IsOptional() @IsString() @MaxLength(60) rgIssuer?: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{2}$/) rgState?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(32) mobilePhone?: string;
  @IsOptional() @Transform(digits) @Matches(/^[0-9]{8}$/) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(200) street?: string;
  @IsOptional() @IsString() @MaxLength(30) streetNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) addressComplement?: string;
  @IsOptional() @IsString() @MaxLength(120) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{2}$/) state?: string;
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @IsString() @MaxLength(500) registrationNotes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({each:true}) @Type(()=>DoctorLicenseInputDto)
  licenses?: DoctorLicenseInputDto[];
}

// License addition is explicit, not an implicit replacement during PATCH.
export class UpdateDoctorDto extends PartialType(CreateDoctorDto) {}

export class DoctorListDto {
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(DoctorRegistrationStatus) registrationStatus?: DoctorRegistrationStatus;
}

export class DoctorFinancialLinkDto {
  @IsUUID() subaccountId!: string;
}

/** Trusted integration-only. Never expose this field through generic Doctor PATCH. */
export class ConfirmDoctorProvisioningDto {
  @IsUUID() authUserId!: string;
}

/** Only a Canfy ADMIN can attest a manual CRM registry verification. */
export class ReviewDoctorLicenseDto {
  @IsUUID() licenseId!:string;
  @IsIn(['VERIFIED','REJECTED']) decision!:'VERIFIED'|'REJECTED';
  @IsString() @MinLength(8) @MaxLength(250) evidenceReference!:string;
}
