'use client';
import React, {useState,useRef} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {Stethoscope,Plus} from 'lucide-react';

type License={id?:string;crmNormalized:string;state:string;verificationStatus:string};
type Doctor={msgdeskOrganizationId?:string|null;organizationLinked?:boolean;id:string;fullName:string;registrationStatus:string;provisioningStatus:string;accessActive:boolean;maskedCpf?:string|null;financialStatus?:string;licenses:License[];updatedAt:string;email?:string;cpfNormalized?:string;rg?:string;rgIssuer?:string;rgState?:string;birthDate?:string;mobilePhone?:string;postalCode?:string;street?:string;streetNumber?:string;addressComplement?:string;neighborhood?:string;city?:string;state?:string;country?:string;financialLinks?:unknown[]};
type Result={summary?:{total:number;verified:number;awaitingReview:number;incomplete:number;rejected:number;clinicalActive:number;withFinancialLink:number;withoutOrganization:number};data:Doctor[];pagination:{page:number;limit:number;total:number;totalPages:number}};
const fields:[string,string,string][]=[
 ['fullName','Nome completo','text'],['cpfNormalized','CPF','text'],['rg','RG','text'],
 ['rgIssuer','Órgão emissor','text'],['rgState','UF RG','text'],['birthDate','Nascimento','date'],
 ['email','E-mail','email'],['mobilePhone','Celular','tel'],['postalCode','CEP','text'],['street','Logradouro','text'],
 ['streetNumber','Número','text'],['addressComplement','Complemento','text'],['neighborhood','Bairro','text'],
 ['city','Cidade','text'],['state','UF','text'],['country','País (ISO 2)','text']
];
const labels:Record<string,string>={DRAFT:'Incompleto',PENDING_REVIEW:'Em revisão',VERIFIED:'Verificado',REJECTED:'Rejeitado',AWAITING_MSGDESK:'Aguardando organização/acesso',LINKED:'Vinculado',BLOCKED:'Bloqueado',NEEDS_RECONCILIATION:'Requer reconciliação',UNLINKED:'Sem carteira'};
const blank=Object.fromEntries(fields.map(([k])=>[k,''])) as Record<string,string>;
function message(error:unknown){
 const e=error as {response?:{data?:{message?:string|string[]}}};
 const m=e.response?.data?.message;
 return (Array.isArray(m)?m[0]:m)||'Operação não concluída. Verifique o estado antes de repetir.';
}
export default function DoctorsProfessionalSection({initiallyExpanded=false}:{initiallyExpanded?:boolean}){
 const qc=useQueryClient(),key=useRef<string|null>(null);
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[expanded,setExpanded]=useState(initiallyExpanded);
 const [detailId,setDetailId]=useState<string|null>(null),[edit,setEdit]=useState(false),[working,setWorking]=useState(false);
 const [form,setForm]=useState<Record<string,string>>({...blank,country:'BR'}),[crm,setCrm]=useState(''),[uf,setUf]=useState('SP');
 const [walletToLink,setWalletToLink]=useState(''),[showLegacy,setShowLegacy]=useState(false);
 const [organizationIntegrationId,setOrganizationIntegrationId]=useState('');
 const medicalIntegrations=useQuery<{id:string;name:string;status:string;doctorOrganizationId?:string|null;scopes:string[]}[]>({queryKey:['medical-integrations'],queryFn:()=>api.get('/integrations').then(r=>r.data),enabled:!!detailId});
 const pairedIntegrations=(medicalIntegrations.data||[]).filter(i=>i.status==='ACTIVE'&&i.doctorOrganizationId&&i.scopes.includes('doctors:admin:read')&&i.scopes.includes('doctors:admin:write'));

 const [reviewReference,setReviewReference]=useState(''),[reviewLicenseId,setReviewLicenseId]=useState('');
 const result=useQuery<Result>({queryKey:['professional-doctors',page,search],queryFn:()=>api.get('/doctors',{params:{page,limit:20,search}}).then(r=>r.data),enabled:expanded});
 const selected=useQuery<Doctor>({queryKey:['professional-doctor',detailId],queryFn:()=>api.get('/doctors/'+detailId).then(r=>r.data),enabled:!!detailId});
 const legacy=useQuery<{data:{subaccountId:string;name:string;reviewRequired:boolean;financialIdentifierVerified:boolean}[]}>({
  queryKey:['doctor-legacy-candidates'],queryFn:()=>api.get('/doctors/legacy-candidates',{params:{page:1,limit:20}}).then(r=>r.data),
  enabled:expanded&&showLegacy,
 });
 function refresh(){void qc.invalidateQueries({queryKey:['professional-doctors']});if(detailId)void qc.invalidateQueries({queryKey:['professional-doctor',detailId]});}
 function newDoctor(){setDetailId(null);setEdit(true);setForm({...blank,country:'BR'});setCrm('');setUf('SP');key.current=crypto.randomUUID();}
 function editDoctor(){const d=selected.data;if(!d)return;setEdit(true);setForm(Object.fromEntries(fields.map(([k])=>[k,String(d[k as keyof Doctor]??'')])));key.current=null;}
 async function submit(e:React.FormEvent){
 e.preventDefault();if(working)return;setWorking(true);
 try{
  const data:Record<string,unknown>=Object.fromEntries(Object.entries(form).filter(([,v])=>v.trim()!=='').map(([k,v])=>[k,['cpfNormalized','postalCode'].includes(k)?v.replace(/\D/g,''):v.trim()]));
  if(!detailId && crm.trim())data.licenses=[{crmNormalized:crm.replace(/\D/g,''),state:uf}];
  if(detailId)await api.patch('/doctors/'+detailId,data);
  else {key.current??=crypto.randomUUID();await api.post('/doctors',data,{headers:{'Idempotency-Key':key.current}});}
  toast.success(detailId?'Cadastro atualizado':'Médico criado sem gerar subconta Asaas');
  setEdit(false);key.current=null;refresh();
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
 async function associateOrganization(){
  if(!detailId||working||!organizationIntegrationId||selected.data?.msgdeskOrganizationId)return;
  if(!confirm('Associar este médico à organização comprovadamente pareada com a integração selecionada? Esta ação será auditada e não poderá ser usada para transferência entre organizações.'))return;
  setWorking(true);
  try{await api.post('/doctors/'+detailId+'/organization',{integrationId:organizationIntegrationId});
    toast.success('Médico associado à organização autorizada');setOrganizationIntegrationId('');refresh();}
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
 <p className="text-xs text-gray-500 mt-1">Identidade profissional única, verificação de CRM e organização. A conta financeira e o login clínico são independentes.</p></div></div>
 <button type="button" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?'Recolher área':'Gerenciar médicos'}</button></div>
 {expanded&&<div className="p-5 border-t space-y-5">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Indicadores do cadastro médico">{([['Profissionais',result.data?.summary?.total],['Verificados',result.data?.summary?.verified],['Em revisão',result.data?.summary?.awaitingReview],['Acesso clínico ativo',result.data?.summary?.clinicalActive],['Incompletos',result.data?.summary?.incomplete],['Sem organização',result.data?.summary?.withoutOrganization],['Com vínculo financeiro',result.data?.summary?.withFinancialLink]] as const).map(([title,count])=><div key={title} className="border border-gray-200 rounded-lg p-4 bg-gray-50"><p className="text-xs text-gray-600">{title}</p><strong className="text-xl text-gray-900">{result.isError||result.isLoading?'—':count??'—'}</strong></div>)}</div>
 <div className="flex flex-wrap gap-2 items-center justify-between"><p className="text-sm text-gray-600">Resultados da pesquisa: <strong>{result.isError?'—':result.data?.pagination.total??'—'}</strong></p>
 <div className="flex gap-2"><button className="border rounded-lg px-3 py-2 text-sm" onClick={()=>setShowLegacy(v=>!v)}>Revisar legados</button>
 <button className="bg-emerald-700 text-white rounded-lg px-3 py-2 text-sm flex gap-2" onClick={newDoctor}><Plus size={16}/>Novo médico</button></div></div>
 <input aria-label="Buscar médico" className="w-full sm:w-80 border rounded-lg p-2 text-sm" value={search} placeholder="Nome ou CRM" onChange={e=>{setPage(1);setSearch(e.target.value);}}/>
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
 {(detailId||edit)&&<div className="border border-emerald-200 rounded-xl p-5 space-y-4">
 <div className="flex justify-between"><h3 className="font-semibold">{edit?(detailId?'Editar cadastro':'Cadastrar profissional'):'Detalhe profissional'}</h3><button className="text-sm underline" onClick={()=>{setEdit(false);setDetailId(null);}}>Fechar</button></div>
 {edit?<form className="space-y-4" onSubmit={submit}>
 <fieldset className="space-y-3"><legend className="font-semibold text-gray-800 mb-3">Identificação, endereço e informações profissionais</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{fields.map(([k,n,t])=><label className="text-sm" key={k}>{n}<input className="border rounded-lg block w-full p-2 mt-1" type={t} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} required={k==='fullName'} maxLength={254}/></label>)}</div></fieldset>
 {!detailId&&<div className="grid grid-cols-2 gap-3"><label className="text-sm">CRM<input className="border rounded-lg p-2 block w-full mt-1" value={crm} onChange={e=>setCrm(e.target.value)}/></label>
 <label className="text-sm">UF CRM<input className="border rounded-lg p-2 block w-full mt-1" value={uf} maxLength={2} onChange={e=>setUf(e.target.value.toUpperCase())}/></label></div>}
 <p className="text-xs text-gray-600">Salvar cria apenas o cadastro profissional. A organização será vinculada posteriormente a uma integração pareada; CRM, login clínico e carteira financeira exigem processos separados.</p>
 <button className="bg-emerald-700 text-white px-4 py-2 rounded-lg disabled:opacity-60" disabled={working}>{working?'Salvando…':'Salvar profissional'}</button>
 </form>:selected.isLoading?<p>Carregando…</p>:selected.data?<div className="space-y-4">
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">{[['Cadastro',selected.data.registrationStatus],['Acesso',selected.data.provisioningStatus],['Financeiro',selected.data.financialStatus||'UNLINKED']].map(([k,v])=><div className="border rounded p-3" key={k}><p className="text-xs text-gray-500">{k}</p><strong>{labels[v]||v}</strong></div>)}</div>
 <p className="text-sm">E-mail: {selected.data.email||'Não informado'} • CRM: {selected.data.licenses.map(l=>l.crmNormalized+'/'+l.state).join(', ')||'Não informado'}</p>
 <p className="text-xs text-gray-500">Cadastro em revisão não equivale à verificação oficial do CRM. Provisionamento MsgDesk depende de vínculo seguro com a organização.</p>
 <section className="border-t pt-4 space-y-3"><h4 className="font-semibold text-sm">Organização e acesso MsgDesk</h4>
 <p className="text-sm">{selected.data.msgdeskOrganizationId?'Organização associada por integração validada':'Ainda sem organização; este profissional não aparece no MsgDesk até revisão e associação.'}</p>
 {!selected.data.msgdeskOrganizationId&&<><label className="block text-xs font-medium">Integração pareada com a organização<select className="border rounded-lg p-2 w-full mt-1 text-sm" value={organizationIntegrationId} onChange={e=>setOrganizationIntegrationId(e.target.value)}><option value="">Selecione uma integração autorizada</option>{pairedIntegrations.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><p className="text-xs text-gray-600">Somente integrações com pareamento concluído e escopos administrativos válidos aparecem aqui. Nenhum ID de organização é aceito do navegador.</p><button type="button" className="rounded border px-3 py-2 text-sm disabled:opacity-50" disabled={working||!organizationIntegrationId} onClick={()=>void associateOrganization()}>Associar profissional à organização</button></>}
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
 <div className="border-t pt-4 space-y-2"><h4 className="font-medium text-sm">Vincular subconta existente</h4>
 <p className="text-xs text-gray-500">Opcional: requer carteira DOCTOR verificada e revisão de titularidade. Não cria Asaas nem modifica splits ou histórico.</p>
 <input className="border rounded-lg p-2 text-sm w-full max-w-md" aria-label="ID da subconta" placeholder="UUID da subconta existente" value={walletToLink} onChange={e=>setWalletToLink(e.target.value)}/>
 <button disabled={working||!walletToLink.trim()} onClick={()=>void link()} className="block border rounded-lg px-3 py-2 text-sm">Solicitar vínculo para revisão</button></div>
 </div>:<p className="text-sm">Cadastro indisponível.</p>}
 </div>}
 </div>}
 </section>;
}
