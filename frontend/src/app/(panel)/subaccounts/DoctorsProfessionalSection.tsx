'use client';
import React, {useState,useRef} from 'react';
import Link from 'next/link';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {Stethoscope,Plus} from 'lucide-react';

type License={id?:string;crmNormalized:string;state:string;verificationStatus:string};
type Doctor={msgdeskOrganizationId?:string|null;organizationLinked?:boolean;id:string;fullName:string;registrationStatus:string;provisioningStatus:string;accessActive:boolean;maskedCpf?:string|null;financialStatus?:string;licenses:License[];updatedAt:string;email?:string;cpfNormalized?:string;rg?:string;rgIssuer?:string;rgState?:string;birthDate?:string;mobilePhone?:string;postalCode?:string;street?:string;streetNumber?:string;addressComplement?:string;neighborhood?:string;city?:string;state?:string;country?:string;financialLinks?:Array<{id:string;status:string;active:boolean;subaccount:{id:string;name:string;asaasId:string;walletId?:string|null;active:boolean;deletedAt?:string|null}}>;};
type Result={summary?:{total:number;verified:number;awaitingReview:number;incomplete:number;rejected:number;clinicalActive:number;withFinancialLink:number;withoutOrganization:number};data:Doctor[];pagination:{page:number;limit:number;total:number;totalPages:number}};
const fields:[string,string,string][]=[
 ['fullName','Nome completo','text'],['cpfNormalized','CPF','text'],['rg','RG','text'],
 ['rgIssuer','Órgão emissor','text'],['rgState','UF RG','text'],['birthDate','Nascimento','date'],
 ['email','E-mail','email'],['mobilePhone','Celular','tel'],['postalCode','CEP','text'],['street','Logradouro','text'],
 ['streetNumber','Número','text'],['addressComplement','Complemento','text'],['neighborhood','Bairro','text'],
 ['city','Cidade','text'],['state','UF','text'],['country','País (ISO 2)','text']
];
const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const labels:Record<string,string>={DRAFT:'Incompleto',PENDING_REVIEW:'Em revisão',VERIFIED:'Verificado',REJECTED:'Rejeitado',AWAITING_MSGDESK:'Aguardando organização/acesso',LINKED:'Vinculado',BLOCKED:'Bloqueado',NEEDS_RECONCILIATION:'Requer reconciliação',UNLINKED:'Sem carteira'};
const blank=Object.fromEntries(fields.map(([k])=>[k,''])) as Record<string,string>;
const fieldGroups=[
 {title:'Identificação pessoal',help:'Dados básicos do profissional. A documentação pode ser completada durante a regularização.',keys:['fullName','cpfNormalized','rg','rgIssuer','rgState','birthDate','email','mobilePhone']},
 {title:'Endereço',help:'Informações de localização do profissional, utilizadas para a conferência cadastral.',keys:['postalCode','street','streetNumber','addressComplement','neighborhood','city','state','country']},
];
function formattedDocument(field:string,raw:string){
 const digits=raw.replace(/\D/g,'');
 if(field==='cpfNormalized')return digits.slice(0,11).replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
 if(field==='postalCode')return digits.slice(0,8).replace(/^(\d{5})(\d)/,'$1-$2');
 return raw;
}
function message(error:unknown){
 const e=error as {response?:{data?:{message?:string|string[]}}};
 const m=e.response?.data?.message;
 return (Array.isArray(m)?m[0]:m)||'Operação não concluída. Verifique o estado antes de repetir.';
}
export default function DoctorsProfessionalSection({initiallyExpanded=false}:{initiallyExpanded?:boolean}){
 const qc=useQueryClient();
 const financialReviewKey=useRef<string|null>(null);
 const [financialEvidence,setFinancialEvidence]=useState('');
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[expanded,setExpanded]=useState(initiallyExpanded);
 const [detailId,setDetailId]=useState<string|null>(null),[edit,setEdit]=useState(false),[working,setWorking]=useState(false);
 const [form,setForm]=useState<Record<string,string>>({...blank,country:'BR'});
 const [walletToLink,setWalletToLink]=useState(''),[showLegacy,setShowLegacy]=useState(false);
 const [organizationIntegrationId,setOrganizationIntegrationId]=useState(''),[organizationEvidence,setOrganizationEvidence]=useState('');
 const [statusFilter,setStatusFilter]=useState('');
 const medicalIntegrations=useQuery<{id:string;name:string;status:string;doctorOrganizationId?:string|null;scopes:string[]}[]>({queryKey:['medical-integrations'],queryFn:()=>api.get('/integrations').then(r=>r.data),enabled:!!detailId});
 const pairedIntegrations=(medicalIntegrations.data||[]).filter(i=>i.status==='ACTIVE'&&i.doctorOrganizationId&&i.scopes.includes('doctors:admin:read')&&i.scopes.includes('doctors:admin:write'));

 const [reviewReference,setReviewReference]=useState(''),[reviewLicenseId,setReviewLicenseId]=useState('');
 const result=useQuery<Result>({queryKey:['professional-doctors',page,search,statusFilter],queryFn:()=>api.get('/doctors',{params:{page,limit:20,search,registrationStatus:statusFilter||undefined}}).then(r=>r.data),enabled:expanded});
 const selected=useQuery<Doctor>({queryKey:['professional-doctor',detailId],queryFn:()=>api.get('/doctors/'+detailId).then(r=>r.data),enabled:!!detailId});
 const legacy=useQuery<{data:{subaccountId:string;name:string;reviewRequired:boolean;financialIdentifierVerified:boolean}[]}>({
  queryKey:['doctor-legacy-candidates'],queryFn:()=>api.get('/doctors/legacy-candidates',{params:{page:1,limit:20}}).then(r=>r.data),
  enabled:expanded&&showLegacy,
 });
 function refresh(){void qc.invalidateQueries({queryKey:['professional-doctors']});if(detailId)void qc.invalidateQueries({queryKey:['professional-doctor',detailId]});}
 
 function editDoctor(){const d=selected.data;if(!d)return;setEdit(true);setForm(Object.fromEntries(fields.map(([k])=>[k,String(d[k as keyof Doctor]??'')])));}
 async function submit(e:React.FormEvent){
 e.preventDefault();if(working||!detailId)return;setWorking(true);
 try{
  const data:Record<string,unknown>=Object.fromEntries(Object.entries(form).filter(([,v])=>v.trim()!=='').map(([k,v])=>[k,['cpfNormalized','postalCode'].includes(k)?v.replace(/\D/g,''):v.trim()]));
  await api.patch('/doctors/'+detailId,data);
  toast.success('Cadastro profissional atualizado');
  setEdit(false);refresh();
 }catch(e){toast.error(message(e));}finally{setWorking(false);}
 }
 async function regularize(){
 if(!detailId||working||!confirm('Encaminhar cadastro para revisão? Isso não valida CRM nem cria conta Asaas.'))return;
 setWorking(true);try{await api.post('/doctors/'+detailId+'/regularize');toast.success('Cadastro enviado para revisão');refresh();}
 catch(e){toast.error(message(e));}finally{setWorking(false);}
 }
 async function link(){
 if(!detailId||working||!walletToLink.trim()||!confirm('Associar subconta existente para REVISÃO? Nenhum pagamento será movimentado. Confirme a titularidade do recebedor.'))return;
 setWorking(true);try{await api.post('/doctors/'+detailId+'/financial-links',{subaccountId:walletToLink.trim()});
 toast.success('Vínculo submetido à revisão financeira');setWalletToLink('');refresh();}
 catch(e){toast.error(message(e));}finally{setWorking(false);}
 }
 async function reviewFinancial(linkId:string,decision:'VERIFIED'|'REJECTED'){
  if(!detailId||working||financialEvidence.trim().length<8)return;
  if(!confirm(decision==='VERIFIED'
   ?'Confirmou pessoalmente a titularidade da conta Asaas e registrou evidência verificável?'
   :'Rejeitar este vínculo financeiro após revisão documentada?'))return;
  setWorking(true);
  financialReviewKey.current??=crypto.randomUUID();
  try{
   await api.post('/doctors/'+detailId+'/financial-links/'+linkId+'/review',{
    decision,evidenceReference:financialEvidence.trim(),
   },{headers:{'Idempotency-Key':financialReviewKey.current}});
   toast.success('Revisão financeira registrada com trilha de auditoria');
   financialReviewKey.current=null;setFinancialEvidence('');refresh();
  }catch(e){toast.error(message(e)+' Não altere a chave sem conferir o resultado da operação.');}
  finally{setWorking(false);}
 }
 async function associateOrganization(){
  if(!detailId||working||!organizationIntegrationId||organizationEvidence.trim().length<8||selected.data?.msgdeskOrganizationId)return;
  if(!confirm('Associar este médico à organização comprovadamente pareada com a integração selecionada? Esta ação será auditada e não poderá ser usada para transferência entre organizações.'))return;
  setWorking(true);
  try{await api.post('/doctors/'+detailId+'/organization',{integrationId:organizationIntegrationId,evidenceReference:organizationEvidence.trim()});
    toast.success('Médico associado à organização autorizada');setOrganizationIntegrationId('');setOrganizationEvidence('');refresh();}
  catch(e){toast.error(message(e));}finally{setWorking(false);}
 }
 async function review(decision:'VERIFIED'|'REJECTED'){
  if(!detailId||working||!reviewLicenseId||reviewReference.trim().length<8)return;
  if(!confirm(decision==='VERIFIED'?'Confirma que consultou o CRM no conselho competente e possui referência verificável?':'Rejeitar este CRM após revisão humana?'))return;
  setWorking(true);
  try{
    await api.post('/doctors/'+detailId+'/licenses/review',{licenseId:reviewLicenseId,decision,evidenceReference:reviewReference.trim()});
    toast.success('Decisão de revisão auditada. O acesso MsgDesk continua separado.');
    setReviewLicenseId('');setReviewReference('');refresh();
  }catch(e){toast.error(message(e));}finally{setWorking(false);}
 }
 return <section className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden" aria-label="Médicos profissionais">
 <div className="p-5 flex flex-wrap gap-4 justify-between items-center">
 <div className="flex gap-3 items-start"><div className="bg-emerald-50 text-emerald-700 rounded-lg p-2"><Stethoscope size={19}/></div>
 <div><h2 className="text-lg font-semibold text-gray-900">Médicos profissionais</h2>
 <p className="text-xs text-gray-500 mt-1">Identidade profissional única, verificação de CRM e organização. Todo médico operacional deve possuir conta Asaas vinculada. Aprovação profissional e acesso clínico têm estados próprios.</p></div></div>
 <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?'Recolher área':'Gerenciar médicos'}</button></div>
 {expanded&&<div className="p-5 border-t space-y-5">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Indicadores do cadastro médico">{([['Profissionais',result.data?.summary?.total],['Verificados',result.data?.summary?.verified],['Em revisão',result.data?.summary?.awaitingReview],['Acesso clínico ativo',result.data?.summary?.clinicalActive],['Incompletos',result.data?.summary?.incomplete],['Sem organização',result.data?.summary?.withoutOrganization],['Com vínculo financeiro',result.data?.summary?.withFinancialLink]] as const).map(([title,count])=><div key={title} className="border border-gray-200 rounded-lg p-4 bg-gray-50"><p className="text-xs text-gray-600">{title}</p><strong className="text-xl text-gray-900">{result.isError||result.isLoading?'—':count??'—'}</strong></div>)}</div>
 <div className="flex flex-wrap gap-2 items-center justify-between"><p className="text-sm text-gray-600">Resultados da pesquisa: <strong>{result.isError?'—':result.data?.pagination.total??'—'}</strong></p>
 <div className="flex gap-2"><button className="border rounded-lg px-3 py-2 text-sm" onClick={()=>setShowLegacy(v=>!v)}>Revisar legados</button>
 <Link href="/subaccounts/medical/new" className="bg-emerald-700 text-white rounded-lg px-3 py-2 text-sm flex gap-2"><Plus size={16}/>Adicionar médico</Link></div></div>
 <div className="flex flex-wrap gap-3 items-end"><label className="text-xs font-medium text-gray-700">Busca por nome ou CRM<input aria-label="Buscar médico" className="block w-full sm:w-80 border rounded-lg p-2 text-sm mt-1" value={search} placeholder="Nome ou CRM" onChange={e=>{setPage(1);setSearch(e.target.value);}}/></label><label className="text-xs font-medium text-gray-700">Estado do cadastro<select aria-label="Filtrar cadastro" className="block border rounded-lg p-2 text-sm mt-1" value={statusFilter} onChange={e=>{setPage(1);setStatusFilter(e.target.value);}}><option value="">Todos</option>{[['DRAFT','Incompletos'],['PENDING_REVIEW','Em revisão'],['VERIFIED','Verificados'],['REJECTED','Rejeitados']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>
 {result.isLoading?<p role="status">Consultando cadastros…</p>:result.isError?<p role="alert" className="text-sm text-red-700">Não foi possível consultar médicos profissionais. Confirme a aplicação das migrations no banco Canfy e sua permissão ADMIN.</p>:
 !result.data?.data.length?<p className="text-sm text-gray-500">Nenhum cadastro encontrado.</p>:
 <div className="overflow-x-auto border rounded-lg"><table className="min-w-[630px] w-full text-sm">
 <thead className="bg-gray-50 text-gray-600"><tr>{['Profissional','CRM / UF','Cadastro','Organização','Acesso MsgDesk','Financeiro',''].map(h=><th key={h} className="text-left p-3">{h}</th>)}</tr></thead>
 <tbody>{result.data.data.map(d=><tr className="border-t" key={d.id}><td className="p-3 font-medium">{d.fullName}<div className="text-xs text-gray-500">{d.maskedCpf||'CPF não informado'}</div></td>
 <td className="p-3">{d.licenses.map(l=>l.crmNormalized+'/'+l.state).join(', ')||'—'}</td><td className="p-3">{labels[d.registrationStatus]||d.registrationStatus}</td>
 <td className="p-3">{d.organizationLinked?'Associada':'Pendente'}</td><td className="p-3">{labels[d.provisioningStatus]||d.provisioningStatus}</td>
 <td className="p-3">{labels[d.financialStatus||'UNLINKED']||d.financialStatus}</td>
 <td className="p-3"><button className="text-emerald-700 underline" onClick={()=>{setDetailId(d.id);setEdit(false);}}>Detalhes</button></td></tr>)}</tbody></table></div>}
 <div className="flex gap-3 items-center justify-end text-sm"><span>Página {page}</span><button className="border rounded px-3 py-1" disabled={page===1||result.isFetching} onClick={()=>setPage(p=>p-1)}>Anterior</button>
 <button className="border rounded px-3 py-1" disabled={!result.data||page>=result.data.pagination.totalPages||result.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima</button></div>
 {showLegacy&&<div className="border rounded-lg p-4 space-y-3"><h3 className="font-semibold">Subcontas financeiras legadas: revisão manual</h3>
 <p className="text-xs text-gray-500">Não associamos automaticamente por CPF, nome ou tipo OTHER. O vínculo requer confirmação administrativa de titularidade.</p>
 {legacy.isLoading?<p className="text-sm">Carregando candidatos…</p>:legacy.isError?<p role="alert" className="text-sm text-red-700">Candidatos indisponíveis</p>:
 legacy.data?.data.map(l=><div className="text-sm border-t pt-2" key={l.subaccountId}><strong>{l.name}</strong> • {l.financialIdentifierVerified?'Identificador financeiro existente':'Identificador não validado'}
 <p className="text-xs text-gray-500">ID: {l.subaccountId}. Use somente após revisão no cadastro do médico.</p>{detailId&&<button type="button" className="text-xs text-emerald-700 underline" onClick={()=>setWalletToLink(l.subaccountId)}>Selecionar para vínculo manual</button>}</div>)}</div>}
 {detailId&&<div className="border border-emerald-200 rounded-xl p-5 space-y-4">
 <div className="flex justify-between"><h3 className="font-semibold">{edit?'Editar cadastro':'Detalhe profissional'}</h3><button className="text-sm underline" onClick={()=>{setEdit(false);setDetailId(null);}}>Fechar</button></div>
 {edit?<form className="space-y-4" onSubmit={submit}>
 {fieldGroups.map(group=><fieldset className="rounded-lg border border-gray-200 p-4 sm:p-5 space-y-3" key={group.title}><legend className="font-semibold text-gray-800 px-2">{group.title}</legend><p className="text-xs text-gray-500">{group.help}</p><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.filter(([k])=>group.keys.includes(k)).map(([k,n,t])=><label className="text-sm" key={k}>{n}{['rgState','state'].includes(k)?<select className="border rounded-lg block w-full p-2 mt-1" value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}><option value="">Selecionar UF</option>{UFS.map(uf=><option value={uf} key={uf}>{uf}</option>)}</select>:<input className="border rounded-lg block w-full p-2 mt-1" type={t} value={formattedDocument(k,form[k]||'')} onChange={e=>setForm(f=>({...f,[k]:['cpfNormalized','postalCode'].includes(k)?e.target.value.replace(/\D/g,''):e.target.value}))} required={k==='fullName'} maxLength={k==='cpfNormalized'?14:k==='postalCode'?9:254}/>}</label>)}</div></fieldset>)}
 
 <p className="text-xs text-gray-600">A edição atualiza o perfil existente sem criar outra carteira. CRM e vínculo financeiro exigem ações específicas.</p>
 <button className="bg-emerald-700 text-white px-4 py-2 rounded-lg disabled:opacity-60" disabled={working}>{working?'Salvando…':'Salvar profissional'}</button>
 </form>:selected.isLoading?<p>Carregando…</p>:selected.data?<div className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">{[['Cadastro',selected.data.registrationStatus],['Acesso',selected.data.provisioningStatus],['Financeiro',selected.data.financialStatus||'UNLINKED']].map(([k,v])=><div className="border rounded p-3" key={k}><p className="text-xs text-gray-500">{k}</p><strong>{labels[v]||v}</strong></div>)}</div>
 <p className="text-sm">E-mail: {selected.data.email||'Não informado'} • CRM: {selected.data.licenses.map(l=>l.crmNormalized+'/'+l.state).join(', ')||'Não informado'}</p>
 <p className="text-xs text-gray-500">Cadastro em revisão não equivale à verificação oficial do CRM. Provisionamento MsgDesk depende de vínculo seguro com a organização.</p>
 <section className="border-t pt-4 space-y-3"><h4 className="font-semibold text-sm">Organização e acesso MsgDesk</h4>
 <p className="text-sm">{selected.data.msgdeskOrganizationId?'Organização associada por integração validada':'Ainda sem organização; este profissional não aparece no MsgDesk até revisão e associação.'}</p>
 {!selected.data.msgdeskOrganizationId&&<><label className="block text-xs font-medium">Integração pareada com a organização<select className="border rounded-lg p-2 w-full mt-1 text-sm" value={organizationIntegrationId} onChange={e=>setOrganizationIntegrationId(e.target.value)}><option value="">Selecione uma integração autorizada</option>{pairedIntegrations.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><label className="block text-xs font-medium">Referência da comprovação de vínculo<input className="border rounded-lg p-2 w-full mt-1 text-sm" minLength={8} maxLength={250} placeholder="Protocolo interno ou evidência verificável" value={organizationEvidence} onChange={e=>setOrganizationEvidence(e.target.value)}/></label><p className="text-xs text-gray-600">A associação será auditada. Somente integrações já pareadas aparecem aqui; nenhum UUID de organização pode ser enviado pelo navegador.</p><button type="button" className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={working||!organizationIntegrationId||organizationEvidence.trim().length<8} onClick={()=>void associateOrganization()}>Associar profissional à organização</button></>}
 </section>
 <div className="flex flex-wrap gap-2"><button className="border rounded px-3 py-2 text-sm" onClick={editDoctor}>Editar</button>
 <button className="bg-emerald-700 text-white rounded px-3 py-2 text-sm" disabled={working||selected.data.registrationStatus==='VERIFIED'} onClick={()=>void regularize()}>Encaminhar para revisão</button></div>
 {selected.data.registrationStatus==='PENDING_REVIEW' && selected.data.licenses.some(l=>l.verificationStatus==='PENDING')&&
 <section className="border-t pt-4 space-y-3" aria-label="Revisão documental do CRM">
  <h4 className="font-semibold text-sm">Revisão humana do CRM</h4>
  <p className="text-xs text-gray-600">Verifique o registro no conselho competente antes de aprovar. O cadastro não é verificado automaticamente.</p>
  <label className="block text-sm">Registro a revisar<select className="border rounded-lg p-2 w-full mt-1" value={reviewLicenseId} onChange={e=>setReviewLicenseId(e.target.value)}>
   <option value="">Selecionar CRM pendente</option>
   {selected.data.licenses.filter(l=>l.id&&l.verificationStatus==='PENDING').map(l=><option key={l.id} value={l.id}>{l.crmNormalized} / {l.state}</option>)}
  </select></label>
  <label className="block text-sm">Referência da consulta ao conselho<input className="border rounded-lg p-2 w-full mt-1" value={reviewReference} onChange={e=>setReviewReference(e.target.value)} maxLength={250} placeholder="URL pública do registro ou protocolo verificável"/></label>
  <div className="flex gap-2"><button className="rounded border px-3 py-2 text-sm" disabled={working||!reviewLicenseId||reviewReference.trim().length<8} onClick={()=>void review('REJECTED')}>Rejeitar CRM</button>
  <button className="rounded bg-emerald-700 text-white px-3 py-2 text-sm" disabled={working||!reviewLicenseId||reviewReference.trim().length<8} onClick={()=>void review('VERIFIED')}>Confirmar verificação humana</button></div>
 </section>}
 {selected.data.financialLinks?.filter(l=>l.active&&l.status==='PENDING_REVIEW').map(link=>
 <section key={link.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3" aria-label="Revisão financeira pendente">
  <h4 className="font-semibold text-sm text-amber-900">Revisar titularidade financeira</h4>
  <p className="text-xs text-amber-900">Conta Asaas: {link.subaccount.name} · {link.subaccount.asaasId}. Confirme a associação documental antes de aprovar. Esta ação não substitui a aprovação cadastral da Asaas.</p>
  <label className="block text-sm font-medium text-slate-800">Referência de evidência (protocolo ou documentação verificada)
   <input className="mt-1 block w-full rounded-lg border border-amber-300 bg-white p-2 text-sm"
    maxLength={250} minLength={8} value={financialEvidence}
    onChange={e=>setFinancialEvidence(e.target.value)} disabled={working||!!financialReviewKey.current}
    placeholder="Protocolo interno ou documento revisado"/>
  </label>
  <div className="flex flex-wrap gap-2">
   <button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50"
    disabled={working||financialEvidence.trim().length<8}
    onClick={()=>void reviewFinancial(link.id,'REJECTED')}>Rejeitar associação</button>
   <button type="button" className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50"
    disabled={working||financialEvidence.trim().length<8}
    onClick={()=>void reviewFinancial(link.id,'VERIFIED')}>Aprovar após conferência</button>
  </div>
  {financialReviewKey.current&&<p className="text-xs text-amber-900">Houve tentativa anterior. Confirme o estado do vínculo antes de iniciar uma nova revisão.</p>}
 </section>
 )}
 <div className="border-t pt-4 space-y-2"><h4 className="font-medium text-sm">Vincular subconta existente</h4>
 <p className="text-xs text-gray-500">Opcional: requer carteira DOCTOR verificada e revisão de titularidade. Não cria Asaas nem modifica splits ou histórico.</p>
 <input className="border rounded-lg p-2 text-sm w-full max-w-md" aria-label="ID da subconta" placeholder="UUID da subconta existente" value={walletToLink} onChange={e=>setWalletToLink(e.target.value)}/>
 <button disabled={working||!walletToLink.trim()} onClick={()=>void link()} className="block border rounded-lg px-3 py-2 text-sm">Solicitar vínculo para revisão</button></div>
 </div>:<p className="text-sm">Cadastro indisponível.</p>}
 </div>}
 </div>}
 </section>;
}
