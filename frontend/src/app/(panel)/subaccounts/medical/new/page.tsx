'use client';

import React, {useRef, useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, Stethoscope, Wallet, ShieldCheck} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

type Mode = 'CREATE'|'LINK';
type FormValues = {
  fullName:string; cpfNormalized:string; rg:string; rgIssuer:string; rgState:string;
  birthDate:string; email:string; mobilePhone:string; postalCode:string;
  street:string; streetNumber:string; addressComplement:string; neighborhood:string;
  city:string; state:string; country:string; crm:string; crmUf:string;
  ownerName:string; ownerDocument:string; ownerEmail:string; ownerMobile:string;
  incomeValue:string; companyType:string; accountIdentifier:string;
  integrationId:string;
};
type IdentityCandidate={id:string;fullName:string;maskedCpf:string|null;cpfMatched:boolean;crmMatched:boolean;registrationStatus:string;organizationLinked:boolean;financiallyLinked:boolean;licenses:Array<{crmNormalized:string;state:string}>};
type Onboarded = {
  doctor:{id:string;fullName:string;registrationStatus:string;provisioningStatus:string;accessActive:boolean;financialLinks?:Array<{id:string;status:string;subaccountId:string}>};
  financialOwnershipVerified:boolean; asaasStatus:string|null;
  clinicalAccessActive:boolean;msgdeskProvisioningStatus:string;message:string;
  financialAccountReused?:boolean;existingProfessionalReused?:boolean;
};
const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const companyTypes=[['MEI','MEI'],['LIMITED','Limitada (LTDA)'],['INDIVIDUAL','Empresário individual'],['ASSOCIATION','Associação']];
const initial:FormValues={
  fullName:'',cpfNormalized:'',rg:'',rgIssuer:'',rgState:'',birthDate:'',email:'',mobilePhone:'',
  postalCode:'',street:'',streetNumber:'',addressComplement:'',neighborhood:'',city:'',state:'',
  country:'BR',crm:'',crmUf:'',ownerName:'',ownerDocument:'',ownerEmail:'',ownerMobile:'',
  incomeValue:'',companyType:'',accountIdentifier:'',integrationId:'',
};
const personalFields:Array<[keyof FormValues,string,string,boolean]>=[
  ['fullName','Nome completo','text',true],['cpfNormalized','CPF','text',true],
  ['rg','RG','text',false],['rgIssuer','Órgão emissor','text',false],
  ['birthDate','Nascimento','date',true],['email','E-mail profissional','email',true],
  ['mobilePhone','Celular','tel',true],
];
const addressFields:Array<[keyof FormValues,string,string,boolean]>=[
  ['postalCode','CEP','text',true],['street','Logradouro','text',true],
  ['streetNumber','Número','text',true],['addressComplement','Complemento','text',false],
  ['neighborhood','Bairro','text',true],['city','Cidade','text',true],
];
const onlyDigits=(v:string)=>v.replace(/\D/g,'');
const maskCpf=(v:string)=>{const d=onlyDigits(v);return d.length===11?'***.***.***-'+d.slice(-2):'Não informado'};
const errorMessage=(error:unknown)=>{
  const e=error as {response?:{data?:{message?:string|string[];operationId?:string;missingFields?:string[]}}};
  const message=e.response?.data?.message;
  const safe=(Array.isArray(message)?message.join('; '):message)||'Não foi possível concluir. Verifique o resultado antes de tentar novamente.';
  return e.response?.data?.operationId?safe+' Operação: '+e.response.data.operationId:safe;
};
const inputClass='w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600';
const labelClass='block text-sm font-medium text-slate-700 mb-1.5';

export default function NewMedicalSubaccountPage(){
  const router=useRouter();
  const key=useRef<string|null>(null);
  const [form,setForm]=useState<FormValues>(initial);
  const [mode,setMode]=useState<Mode>('CREATE');
  const [step,setStep]=useState(1);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<Onboarded|null>(null);
  const [error,setError]=useState('');
  const [attempted,setAttempted]=useState(false);
  const [administrativeConfirmed,setAdministrativeConfirmed]=useState(false);
  const [integrations,setIntegrations]=useState<Array<{id:string;name:string;status:string;doctorOrganizationId?:string|null;scopes:string[]}>>([]);
  const [integrationError,setIntegrationError]=useState(false);
  const [localSubaccountId,setLocalSubaccountId]=useState('');
  const [existingDoctorId,setExistingDoctorId]=useState('');
  const [sourceReady,setSourceReady]=useState(false);
  const [sourceError,setSourceError]=useState('');
  const [sourceName,setSourceName]=useState('');
  const [identityCandidates,setIdentityCandidates]=useState<IdentityCandidate[]>([]);
  const [identityBusy,setIdentityBusy]=useState(false);
  const [legacyChoices,setLegacyChoices]=useState<Array<{subaccountId:string;name:string;financialIdentifierVerified:boolean}>>([]);
  React.useEffect(()=>{
    let current=true;
    api.get('/doctors/legacy-candidates',{params:{page:1,limit:100}})
      .then(r=>{if(current)setLegacyChoices(r.data.data||[]);}).catch(()=>{});
    return()=>{current=false};
  },[]);
  React.useEffect(()=>{
    let current=true;
    const params=new URLSearchParams(window.location.search);
    const subaccountId=params.get('subaccountId')||'';
    const doctorId=params.get('doctorId')||'';
    if (!subaccountId && !doctorId){setSourceReady(true);return;}
    if ((subaccountId && !/^[a-f0-9-]{36}$/i.test(subaccountId)) ||
        (doctorId && !/^[a-f0-9-]{36}$/i.test(doctorId))) {
      setSourceError('Identificador do cadastro inválido. Volte a Subcontas.');return;
    }
    Promise.all([
      subaccountId?api.get('/subaccounts/'+encodeURIComponent(subaccountId)).then(r=>r.data):Promise.resolve(null),
      doctorId?api.get('/doctors/'+encodeURIComponent(doctorId)).then(r=>r.data):Promise.resolve(null),
    ]).then(([account,professional])=>{
      if(!current)return;
      if(account && (account.type!=='DOCTOR'||!account.active||account.deletedAt))
        throw new Error('Conta financeira não elegível para regularização');
      setMode('LINK');setLocalSubaccountId(subaccountId);setExistingDoctorId(doctorId);
      setSourceName(account?.name||professional?.fullName||'');
      setForm(old=>{
        const next={...old};
        if(account){
          next.fullName=account.name||'';
          next.cpfNormalized=onlyDigits(account.cpfCnpj||'').length===11?onlyDigits(account.cpfCnpj):'';
          next.email=account.email||'';next.mobilePhone=account.mobilePhone||account.phone||'';
        }
        if(professional){
          for(const k of ['fullName','cpfNormalized','rg','rgIssuer','rgState','email','mobilePhone','postalCode','street','streetNumber','addressComplement','neighborhood','city','state','country'] as const)
            next[k]=String(professional[k]||'');
          next.birthDate=professional.birthDate?String(professional.birthDate).slice(0,10):'';
          next.crm=professional.licenses?.[0]?.crmNormalized||'';
          next.crmUf=professional.licenses?.[0]?.state||'';
        }
        return next;
      });
      setSourceReady(true);
    }).catch(e=>{if(current)setSourceError(e instanceof Error?e.message:'Não foi possível abrir o cadastro existente');});
    return()=>{current=false};
  },[]);
  React.useEffect(()=>{
    let current=true;
    api.get('/integrations').then(r=>{
      if(current)setIntegrations(r.data.filter((i:{status:string;doctorOrganizationId?:string|null;scopes:string[]})=>
        i.status==='ACTIVE'&&i.doctorOrganizationId&&i.scopes.includes('doctors:admin:read')&&i.scopes.includes('doctors:admin:write')));
    }).catch(()=>{if(current)setIntegrationError(true)});
    return()=>{current=false};
  },[]);
  function update(k:keyof FormValues,v:string){setForm(old=>({...old,[k]:['cpfNormalized','postalCode','crm','ownerDocument'].includes(k)?onlyDigits(v):v}));setError('')}
  const field=(k:keyof FormValues,label:string,type='text',required=false)=>(
    <label key={k} className="block">
      <span className={labelClass}>{label}{required?' *':''}</span>
      <input className={inputClass} type={type} value={form[k]} required={required}
        maxLength={k==='cpfNormalized'?11:k==='postalCode'?8:k==='ownerDocument'?14:254}
        onChange={e=>update(k,e.target.value)}/>
    </label>
  );
  const ufField=(k:keyof FormValues,label:string,required=false)=>(
    <label className="block" key={k}>
      <span className={labelClass}>{label}{required?' *':''}</span>
      <select className={inputClass} required={required} value={form[k]} onChange={e=>update(k,e.target.value)}>
        <option value="">Selecione</option>{UFS.map(uf=><option key={uf} value={uf}>{uf}</option>)}
      </select>
    </label>
  );
  async function continueProfessional(){
    const required:(keyof FormValues)[]=['fullName','cpfNormalized','crm','crmUf'];
    const missing=required.filter(k=>!form[k].trim());
    if(missing.length){toast.error('Informe nome, CPF e CRM/UF');return}
    if(onlyDigits(form.cpfNormalized).length!==11 ||
      (form.postalCode && onlyDigits(form.postalCode).length!==8) ||
      (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))){
      toast.error('Confira CPF, CEP e e-mail');return;
    }
    setIdentityBusy(true);
    try {
      const response=await api.post('/doctors/identity-candidates',{
        cpfNormalized:form.cpfNormalized,crmNormalized:form.crm,state:form.crmUf,
      });
      const matches:IdentityCandidate[]=response.data.candidates||[];
      setIdentityCandidates(matches);
      if(existingDoctorId && !matches.some(x=>x.id===existingDoctorId)){
        toast.error('A identidade selecionada não coincide com o CPF/CRM informado. Revise antes de continuar.');return;
      }
      if(matches.length>1){toast.error('CPF e CRM correspondem a cadastros diferentes. Revisão administrativa necessária antes de associar.');return;}
      setStep(2);window.scrollTo({top:0,behavior:'smooth'});
    } catch(e){toast.error(errorMessage(e)+' Não será criado outro profissional sem verificar duplicidades.');}
    finally{setIdentityBusy(false);}
  }
  function continueFinancial(){
    if(identityCandidates.length>1){toast.error('Identidade em conflito. Volte e revise CPF/CRM.');return;}
    if(identityCandidates.length===1&&!existingDoctorId){toast.error('Selecione e confirme o cadastro profissional existente antes de continuar.');return;}
    if(mode==='LINK'&&!localSubaccountId&&!form.accountIdentifier.trim()){
      toast.error('Informe o ID da conta ou Wallet ID Asaas');return;
    }
    if(mode==='CREATE'){
      const required:(keyof FormValues)[]=['birthDate','email','mobilePhone','postalCode','street','streetNumber','neighborhood','city','state','incomeValue'];
      if(required.some(k=>!form[k].trim())||!Number.isFinite(Number(form.incomeValue))||Number(form.incomeValue)<=0){
        toast.error('Para criar a subconta Asaas, complete contato, nascimento, endereço e renda');return;
      }
      const doc=onlyDigits(form.ownerDocument||form.cpfNormalized);
      if(![11,14].includes(doc.length)){toast.error('CPF ou CNPJ do titular inválido');return}
      if(doc.length===14&&!form.companyType){toast.error('Selecione o tipo societário');return}
    }
    const tenantIds=new Set(integrations.map(i=>i.doctorOrganizationId));
    if(tenantIds.size>1&&!form.integrationId){
      toast.error('Selecione a organização MsgDesk autorizada antes de concluir');return;
    }
    setStep(3);window.scrollTo({top:0,behavior:'smooth'});
  }
  async function submit(){
    if(busy||result||!sourceReady||sourceError||!administrativeConfirmed)return;
    setBusy(true);setError('');setAttempted(true);
    key.current??=crypto.randomUUID();
    const doctor:Record<string,unknown>={};
    const doctorKeys:(keyof FormValues)[]=['fullName','cpfNormalized','rg','rgIssuer','rgState','birthDate','email','mobilePhone','postalCode','street','streetNumber','addressComplement','neighborhood','city','state','country'];
    for(const k of doctorKeys)if(form[k].trim())doctor[k]=form[k].trim();
    doctor.licenses=[{crmNormalized:onlyDigits(form.crm),state:form.crmUf}];
    const ownerDocument=onlyDigits(form.ownerDocument||form.cpfNormalized);
    const newAccount={
      type:'DOCTOR',name:form.ownerName.trim()||form.fullName.trim(),
      cpfCnpj:ownerDocument,email:form.ownerEmail.trim()||form.email.trim(),
      mobilePhone:form.ownerMobile.trim()||form.mobilePhone.trim(),
      birthDate:ownerDocument.length===11?form.birthDate:undefined,
      companyType:ownerDocument.length===14?form.companyType:undefined,
      incomeValue:Number(form.incomeValue),postalCode:onlyDigits(form.postalCode),
      address:form.street, addressNumber:form.streetNumber,
      complement:form.addressComplement||undefined,province:form.neighborhood,
    };
    const payload={
      doctor,mode,administrativeConfirmed:true,
      ...(mode==='CREATE'?{newAccount}:localSubaccountId?{localSubaccountId}:{accountIdentifier:form.accountIdentifier.trim()}),
      ...(existingDoctorId?{existingDoctorId}:{}),
      ...(form.integrationId?{integrationId:form.integrationId}:{}),
    };
    try{
      const r=await api.post('/doctors/onboard',payload,{headers:{'Idempotency-Key':key.current}});
      setResult(r.data);setStep(4);toast.success('Cadastro unificado registrado');
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e){
      const msg=errorMessage(e);setError(msg);toast.error('Operação não concluída; confira o estado antes de repetir');
    }finally{setBusy(false)}
  }
  return <main className="mx-auto max-w-5xl space-y-7 pb-16">
    <div className="flex items-start gap-3">
      <Link href="/subaccounts" aria-label="Voltar para Subcontas" className="rounded-xl border border-slate-200 p-2.5 hover:bg-slate-50"><ArrowLeft size={20}/></Link>
      <div className="flex-1">
        <p className="text-sm font-medium text-emerald-700">Subcontas / Médicos</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{localSubaccountId||existingDoctorId?'Completar cadastro médico':'Adicionar médico'}</h1>
        <p className="mt-1 text-sm text-slate-600">Um cadastro profissional e uma conta de recebimento, sem formulários duplicados.</p>
      </div>
    </div>
    {!sourceReady&&<p role="status" className="rounded-xl border p-4 text-sm">Carregando dados já cadastrados…</p>}
    {sourceError&&<div role="alert" className="rounded-xl border border-red-300 p-4 text-sm text-red-700">{sourceError} <Link href="/subaccounts?type=DOCTOR" className="underline">Voltar à lista</Link></div>}
    {sourceReady&&(localSubaccountId||existingDoctorId)&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <strong>Regularização de cadastro existente: {sourceName}</strong>
      <p className="mt-1">Os dados disponíveis foram pré-preenchidos para conferência, mas não comprovam que o profissional é o titular da conta. A carteira original será mantida, sem criar outra conta Asaas. Identidade, CRM, vínculo financeiro e acesso clínico exigem validações independentes.</p>
    </div>}
    <nav aria-label="Etapas do cadastro" className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {['Dados profissionais','Conta Asaas','Revisão','Resultado'].map((title,i)=>
        <div key={title} aria-current={step===i+1?'step':undefined}
          className={`rounded-lg border p-3 text-sm ${step===i+1?'border-emerald-500 bg-emerald-50 text-emerald-900':'border-slate-200 bg-white text-slate-500'}`}>
          <span className="mr-2 font-semibold">{i+1}.</span>{title}
        </div>)}
    </nav>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-live={step===4?'polite':undefined}>
      {sourceReady&&!sourceError&&step===1&&<div className="space-y-8">
        <div className="flex items-center gap-2"><Stethoscope className="text-emerald-700" size={20}/><h2 className="text-lg font-semibold">Identificação profissional</h2></div>
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold text-slate-800">Dados pessoais</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {personalFields.map(([k,l,t,r])=>field(k,l,t,['fullName','cpfNormalized'].includes(k)?r:false))}
            {ufField('rgState','UF de emissão do RG')}
          </div>
        </fieldset>
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold text-slate-800">Endereço</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{addressFields.map(([k,l,t,r])=>field(k,l,t,r))}
            {ufField('state','Estado')}
          </div>
        </fieldset>
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold text-slate-800">Habilitação médica</legend>
          <p className="text-sm text-slate-600">Informe o registro já conferido pela administração. A confirmação será registrada ao concluir.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{field('crm','CRM', 'text',true)}{ufField('crmUf','UF do CRM',true)}</div>
        </fieldset>
        <div className="flex justify-end"><button type="button" onClick={()=>void continueProfessional()} disabled={identityBusy} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-white hover:bg-emerald-800 disabled:opacity-50">{identityBusy?'Conferindo registros existentes…':'Continuar'} <ArrowRight size={16}/></button></div>
      </div>}
      {sourceReady&&!sourceError&&step===2&&<div className="space-y-6">
        <div className="flex items-center gap-2"><Wallet className="text-emerald-700" size={20}/><h2 className="text-lg font-semibold">Conta de recebimento Asaas</h2></div>
        {identityCandidates.length===1&&<section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4" aria-label="Profissional já cadastrado">
          <h3 className="font-semibold text-amber-950">Profissional existente localizado</h3>
          <p className="text-sm text-amber-900">O CPF ou CRM informado corresponde a <strong>{identityCandidates[0].fullName}</strong> ({identityCandidates[0].maskedCpf||'CPF restrito'}). Isso não comprova titularidade financeira. Não será criado um segundo cadastro profissional.</p>
          <label className="flex items-start gap-3 text-sm text-amber-950"><input type="checkbox" className="mt-1" checked={existingDoctorId===identityCandidates[0].id} onChange={e=>{setExistingDoctorId(e.target.checked?identityCandidates[0].id:'');setMode('LINK');}} disabled={!!sourceName&&!!existingDoctorId&&existingDoctorId===identityCandidates[0].id&&!!new URLSearchParams(typeof window==='undefined'?'':window.location.search).get('doctorId')}/>
            <span>Conferi a identidade e quero retomar este perfil profissional, preservando o histórico anterior.</span></label>
          <p className="text-xs">Estado: {identityCandidates[0].registrationStatus}. {identityCandidates[0].financiallyLinked?'Já há carteira vinculada; revise antes de associar outra.':'Sem carteira profissional ativa identificada.'}</p>
        </section>}
        <div role="radiogroup" aria-label="Operação financeira" className="grid gap-3 sm:grid-cols-2">
          {([['CREATE','Criar nova subconta','Utiliza os dados já informados e cria uma conta filha no Asaas.'],['LINK','Vincular existente','Reaproveita uma subconta cadastrada ou uma conta existente na conta-pai.']] as const).filter(([value])=>!(existingDoctorId||localSubaccountId)||value==='LINK').map(([value,title,help])=>
            <label key={value} className={`cursor-pointer rounded-xl border p-4 ${mode===value?'border-emerald-600 bg-emerald-50':'border-slate-200'}`}>
              <span className="flex gap-2 font-semibold"><input type="radio" name="financialMode" checked={mode===value} onChange={()=>setMode(value)} disabled={attempted}/>{title}</span>
              <span className="mt-1 block text-sm text-slate-600">{help}</span>
            </label>)}
        </div>
        {mode==='CREATE'?<fieldset className="space-y-4">
          <legend className="font-semibold">Dados financeiros</legend>
          <p className="text-sm text-slate-600">Nome, e-mail, celular e endereço serão aproveitados do cadastro profissional quando não forem diferentes.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('ownerName','Titular (se diferente)')}{field('ownerDocument','CPF/CNPJ titular (se diferente)')}
            {field('ownerEmail','E-mail financeiro (se diferente)','email')}{field('ownerMobile','Celular financeiro (se diferente)','tel')}
            {field('incomeValue','Renda / faturamento mensal (R$)','number',true)}
            {(onlyDigits(form.ownerDocument||form.cpfNormalized).length===14)&&
              <label className="block"><span className={labelClass}>Tipo societário *</span>
                <select className={inputClass} value={form.companyType} onChange={e=>update('companyType',e.target.value)}>
                  <option value="">Selecione</option>{companyTypes.map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              </label>}
          </div>
          <p className="text-xs text-amber-800">Criar uma subconta pode gerar tarifas da Asaas. A ativação financeira e a revisão do CRM são processos distintos.</p>
        </fieldset>:<fieldset className="space-y-3">
          <legend className="font-semibold">Subconta existente</legend>
          {localSubaccountId?<p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Subconta local selecionada: <strong>{sourceName}</strong>. O sistema conservará a carteira e verificará a titularidade automaticamente.</p>:<>
            {legacyChoices.length>0&&<label className="block"><span className={labelClass}>Reutilizar subconta financeira pendente no Canfy</span>
              <select className={inputClass} value={localSubaccountId} onChange={e=>{setLocalSubaccountId(e.target.value);setSourceName(legacyChoices.find(x=>x.subaccountId===e.target.value)?.name||'');}}>
                <option value="">Usar identificador Asaas abaixo</option>{legacyChoices.filter(x=>x.financialIdentifierVerified).map(x=><option key={x.subaccountId} value={x.subaccountId}>{x.name}</option>)}
              </select></label>}
            {!localSubaccountId&&field('accountIdentifier','Account ID ou Wallet ID', 'text',true)}
          </>}
          <p className="text-sm text-slate-600">A conta Asaas existente será reutilizada sem criar outra carteira. Conflitos de titularidade reais impedem a confirmação automática.</p>
        </fieldset>}
        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-2 font-semibold">Associação ao MsgDesk</legend>
          <p className="text-sm text-slate-600">O servidor associará automaticamente a organização quando houver somente um pareamento autorizado. Isso não concede acesso clínico.</p>
          {new Set(integrations.map(i=>i.doctorOrganizationId)).size>1&&
            <label className="block"><span className={labelClass}>Organização pareada *</span>
              <select className={inputClass} value={form.integrationId} onChange={e=>update('integrationId',e.target.value)}>
                <option value="">Selecione a integração autorizada</option>{integrations.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>}
          {integrations.length===1&&<p className="text-sm text-emerald-800">Integração identificada: {integrations[0].name}</p>}
          {!integrations.length&&<p role="status" className="text-sm text-amber-800">Nenhuma organização pareada encontrada. O cadastro será preservado e a associação poderá ser resolvida depois.</p>}
          {integrationError&&<p role="alert" className="text-sm text-amber-800">Não foi possível consultar os pareamentos. A associação pode permanecer pendente.</p>}
        </fieldset>
        <div className="flex justify-between gap-3">
          <button className="rounded-lg border px-4 py-2.5" onClick={()=>setStep(1)}>Voltar</button>
          <button className="flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-white" onClick={continueFinancial}>Revisar <ArrowRight size={16}/></button>
        </div>
      </div>}
      {sourceReady&&!sourceError&&step===3&&<div className="space-y-6">
        <div className="flex items-center gap-2"><ShieldCheck className="text-emerald-700" size={20}/><h2 className="text-lg font-semibold">Revisar e confirmar</h2></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-5 space-y-2 text-sm">
            <h3 className="font-semibold text-slate-900">Profissional</h3>
            <p>{form.fullName}</p><p>CPF: {maskCpf(form.cpfNormalized)}</p><p>CRM: {form.crm} / {form.crmUf}</p>
            <p className="text-slate-600">Conferência administrativa: será registrada na finalização</p>
          </div>
          <div className="rounded-xl border p-5 space-y-2 text-sm">
            <h3 className="font-semibold text-slate-900">Financeiro</h3><p>{mode==='CREATE'?'Criar nova subconta Asaas':'Vincular subconta Asaas existente'}</p>
            <p>{mode==='CREATE'?(form.ownerName||form.fullName):localSubaccountId?'Subconta local: '+(sourceName||localSubaccountId):form.accountIdentifier}</p>
            {existingDoctorId&&<p className="text-slate-600">Reutilizar perfil profissional já cadastrado</p>}
            <p className="text-slate-600">Aprovação da conta: depende do estado retornado pela Asaas</p>
          </div>
        </div>
        <label className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><input type="checkbox" className="mt-1 accent-emerald-700" checked={administrativeConfirmed} onChange={e=>setAdministrativeConfirmed(e.target.checked)} /><span>Confirmo que a administração da Canfy conferiu os dados pessoais, a identidade e o CRM/UF informados. Esta decisão ficará registrada com meu usuário e data.</span></label>
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">Esta decisão não substitui a aprovação operacional da Asaas e não habilita acesso clínico. Pendências reais poderão ser resolvidas posteriormente, sem duplicar contas.</p>
        {error&&<div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 p-4 text-sm text-red-800"><CircleAlert size={18} className="shrink-0"/><div><strong>Operação não confirmada</strong><p>{error}</p><p className="mt-2">Não inicie outro cadastro com uma chave diferente sem verificar o resultado anterior.</p></div></div>}
        <div className="flex justify-between gap-3">
          <button className="rounded-lg border px-4 py-2.5 disabled:opacity-50" disabled={busy||attempted} onClick={()=>setStep(2)}>Voltar</button>
          <button className="rounded-lg bg-emerald-700 px-5 py-2.5 text-white disabled:opacity-50" disabled={busy||!administrativeConfirmed} onClick={()=>void submit()}>{busy?'Registrando com segurança…':attempted?'Verificar/retomar mesma operação':'Concluir cadastro médico'}</button>
        </div>
      </div>}
      {sourceReady&&!sourceError&&step===4&&result&&<div className="space-y-5">
        <div className="flex items-center gap-3 text-emerald-700"><CheckCircle2 size={30}/><h2 className="text-xl font-semibold">Cadastro unificado registrado</h2></div>
        <p className="text-sm text-slate-600">{result.message}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ['Médico',result.doctor.fullName],
            ['Cadastro profissional',result.doctor.registrationStatus],
            ['Vínculo financeiro',result.doctor.financialStatus||'Não disponível'],
            ['Situação Asaas',result.asaasStatus||'Aguardando consulta / ativação'],
            ['MsgDesk',result.msgdeskProvisioningStatus],
            ['Acesso clínico',result.clinicalAccessActive?'Ativo':'Não habilitado'],
          ] as const).map(([label,value])=><div className="rounded-xl border border-slate-200 p-4" key={label}>
            <p className="text-xs text-slate-500">{label}</p><p className="font-semibold text-slate-900">{value}</p>
          </div>)}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-lg bg-emerald-700 px-5 py-2.5 text-white" onClick={()=>router.push('/subaccounts?type=DOCTOR')}>Gerenciar médicos</button>
          <Link className="rounded-lg border px-5 py-2.5" href="/subaccounts">Voltar a Subcontas</Link>
        </div>
      </div>}
    </section>
  </main>;
}
