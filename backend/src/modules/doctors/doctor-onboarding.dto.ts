import { Type } from 'class-transformer';
import { Equals, IsDefined, IsEnum, IsOptional, IsString, IsUUID, Matches, MinLength, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
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
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateDoctorDto)
  doctor!: CreateDoctorDto;

  @IsEnum(DoctorOnboardingFinancialMode)
  mode!: DoctorOnboardingFinancialMode;

  /** Canfy ADMIN confirms the human checks made before internal registration. */
  @Equals(true)
  administrativeConfirmed!: true;

  @ValidateIf(o => o.mode === DoctorOnboardingFinancialMode.CREATE)
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateSubaccountDto)
  newAccount?: CreateSubaccountDto;

  @ValidateIf(o => o.mode === DoctorOnboardingFinancialMode.LINK && !o.localSubaccountId)
  @IsDefined()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{8,100}$/)
  accountIdentifier?: string;

  /** Reuse an already imported DOCTOR subaccount; no Asaas POST or import. */
  @IsOptional()
  @IsUUID()
  localSubaccountId?: string;

  /** Resume the verified identity chosen by the administrator instead of duplicating it. */
  @IsOptional()
  @IsUUID()
  existingDoctorId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(250)
  identityEvidenceReference?: string;

  @IsOptional()
  @IsUUID()
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(250)
  evidenceReference?: string;
}
