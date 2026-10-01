import { ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { INTEGRATION_SCOPES, IntegrationScope } from './integration-scopes';

export class CreateIntegrationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn([...INTEGRATION_SCOPES], { each: true })
  scopes!: IntegrationScope[];
}
