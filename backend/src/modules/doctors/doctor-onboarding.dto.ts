import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { CreateDoctorDto } from './doctors.dto';
import { CreateSubaccountDto } from '../subaccounts/subaccounts.dto';

/**
 * One professional identity, with exactly one financial path.
 * The actual Asaas parent/subaccount ownership check is performed server-side.
 */
export enum DoctorOnboardingFinancialMode {
  CREATE = 'CREATE',
  LINK = 'LINK',
}
export class DoctorOnboardingDto {
  @ValidateNested()
  @Type(() => CreateDoctorDto)
  doctor!: CreateDoctorDto;

  @IsEnum(DoctorOnboardingFinancialMode)
  mode!: DoctorOnboardingFinancialMode;

  @ValidateIf(o => o.mode === DoctorOnboardingFinancialMode.CREATE)
  @ValidateNested()
  @Type(() => CreateSubaccountDto)
  newAccount?: CreateSubaccountDto;

  @ValidateIf(o => o.mode === DoctorOnboardingFinancialMode.LINK)
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{8,100}$/)
  accountIdentifier?: string;
}
