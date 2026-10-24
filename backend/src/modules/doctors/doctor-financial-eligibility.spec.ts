import {DOCTOR_FINANCIAL_ELIGIBILITY as where} from './doctor-financial-eligibility';
describe('new charge medical eligibility',()=>{
 it('requires a real professional and reviewed wallet',()=>{
  expect(where.doctorFinancialLinks).toEqual({some:{
   active:true,status:'VERIFIED',doctor:{is:{enabled:true,registrationStatus:'VERIFIED'}},
  }});
 });
});
