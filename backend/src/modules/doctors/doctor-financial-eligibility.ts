import {Prisma,SubaccountType} from '@prisma/client';
/** Only verified professional + verified finance link eligible for NEW payments. */
export const DOCTOR_FINANCIAL_ELIGIBILITY:Prisma.SubaccountWhereInput={
 type:SubaccountType.DOCTOR,active:true,deletedAt:null,walletId:{not:null},
 doctorFinancialLinks:{some:{
  active:true,status:'VERIFIED',
  doctor:{is:{enabled:true,registrationStatus:'VERIFIED'}},
 }},
};
