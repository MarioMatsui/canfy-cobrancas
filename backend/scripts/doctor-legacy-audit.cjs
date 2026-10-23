// READ ONLY. No name, CPF, email, wallet, keys or transaction data is printed.
// Run from backend/: node scripts/doctor-legacy-audit.cjs --dry-run
const { PrismaClient, SubaccountType } = require('@prisma/client');
if (process.argv.includes('--apply')) {
  throw new Error('Este script NAO possui modo apply. Regularizacao exige revisao humana.');
}
const db = new PrismaClient();
(async () => {
  const [doctor, other, noWallet, inactive, removed, links] = await Promise.all([
    db.subaccount.count({where:{type:SubaccountType.DOCTOR}}),
    db.subaccount.count({where:{type:SubaccountType.OTHER}}),
    db.subaccount.count({where:{type:SubaccountType.DOCTOR,walletId:null}}),
    db.subaccount.count({where:{type:SubaccountType.DOCTOR,active:false}}),
    db.subaccount.count({where:{type:SubaccountType.DOCTOR,deletedAt:{not:null}}}),
    db.doctorFinancialLink.count(),
  ]);
  console.log(JSON.stringify({dryRun:true,readOnly:true,counts:{
    doctorSubaccounts:doctor,otherCandidates:other,doctorWithoutWallet:noWallet,
    doctorInactive:inactive,doctorSoftDeleted:removed,existingFinancialLinks:links,
  }},null,2));
})().catch((error)=>{
  console.error('Falha na auditoria somente leitura:',error?.code||error?.name||'UNKNOWN');
  process.exitCode=1;
}).finally(()=>db.$disconnect());
