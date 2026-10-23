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
  integrationId:string; evidenceReference:string;
};
type Onboarded = {
  doctor:{id:string;fullName:string;registrationStatus:string;provisioningStatus:string;accessActive:boolean;financialLinks?:Array<{id:string;status:string;subaccountId:string}>};
  financialOwnershipVerified:boolean; asaasStatus:string|null;
  clinicalAccessActive:boolean;msgdeskProvisioningStatus:string;message:string;
};
const UFS=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const companyTypes=[['MEI','MEI'],['LIMITED','Limitada (LTDA)'],['INDIVIDUAL','Empresário individual'],['ASSOCIATION','Associação']];
const initial:FormValues={
  fullName:'',cpfNormalized:'',rg:'',rgIssuer:'',rgState:'',birthDate:'',email:'',mobilePhone:'',
  postalCode:'',street:'',streetNumber:'',addressComplement:'',neighborhood:'',city:'',state:'',
  country:'BR',crm:'',crmUf:'',ownerName:'',ownerDocument:'',ownerEmail:'',ownerMobile:'',
  incomeValue:'',companyType:'',accountIdentifier:'',integrationId:'',evidenceReference:'',
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
  const [integrations,setIntegrations]=useState<Array<{id:string;name:string;status:string;doctorOrganizationId?:string|null;scopes:string[]}>>([]);
  const [integrationError,setIntegrationError]=useState(false);
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
  function continueProfessional(){
    const required:(keyof FormValues)[]=['fullName','cpfNormalized','birthDate','email','mobilePhone','postalCode','street','streetNumber','neighborhood','city','state','crm','crmUf'];
    const missing=required.filter(k=>!form[k].trim());
    if(missing.length){toast.error('Complete os dados pessoais, endereço e CRM obrigatórios');return}
    if(onlyDigits(form.cpfNormalized).length!==11 || onlyDigits(form.postalCode).length!==8 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)){
      toast.error('Confira CPF, CEP e e-mail');return;
    }
    setStep(2);window.scrollTo({top:0,behavior:'smooth'});
  }
  function continueFinancial(){
    if(mode==='LINK'&&!form.accountIdentifier.trim()){
      toast.error('Informe o ID da conta ou Wallet ID Asaas');return;
    }
    if(mode==='CREATE'){
      const required=['incomeValue'] as const;
      if(required.some(k=>!form[k].trim())||!Number.isFinite(Number(form.incomeValue))||Number(form.incomeValue)<=0){
        toast.error('Informe a renda ou faturamento mensal');return;
      }
      const doc=onlyDigits(form.ownerDocument||form.cpfNormalized);
      if(![11,14].includes(doc.length)){toast.error('CPF ou CNPJ do titular inválido');return}
      if(doc.length===14&&!form.companyType){toast.error('Selecione o tipo societário');return}
    }
    if(form.integrationId&&form.evidenceReference.trim().length<8){
      toast.error('Informe uma referência verificável da associação à organização');return;
    }
    setStep(3);window.scrollTo({top:0,behavior:'smooth'});
  }
  async function submit(){
    if(busy||result)return;
    if(!window.confirm('Confirmar cadastro profissional e operação financeira Asaas? A criação pode ter custos.'))return;
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
      doctor,mode,
      ...(mode==='CREATE'?{newAccount}:{accountIdentifier:form.accountIdentifier.trim()}),
      ...(form.integrationId?{integrationId:form.integrationId,evidenceReference:form.evidenceReference.trim()}:{}),
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
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Adicionar médico</h1>
        <p className="mt-1 text-sm text-slate-600">Um cadastro profissional e uma conta de recebimento, sem formulários duplicados.</p>
      </div>
    </div>
    <nav aria-label="Etapas do cadastro" className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {['Dados profissionais','Conta Asaas','Revisão','Resultado'].map((title,i)=>
        <div key={title} aria-current={step===i+1?'step':undefined}
          className={`rounded-lg border p-3 text-sm ${step===i+1?'border-emerald-500 bg-emerald-50 text-emerald-900':'border-slate-200 bg-white text-slate-500'}`}>
          <span className="mr-2 font-semibold">{i+1}.</span>{title}
        </div>)}
    </nav>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-live={step===4?'polite':undefined}>
      {step===1&&<div className="space-y-8">
        <div className="flex items-center gap-2"><Stethoscope className="text-emerald-700" size={20}/><h2 className="text-lg font-semibold">Identificação profissional</h2></div>
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold text-slate-800">Dados pessoais</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {personalFields.map(([k,l,t,r])=>field(k,l,t,r))}
            {ufField('rgState','UF de emissão do RG')}
          </div>
        </fieldset>
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold text-slate-800">Endereço</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{addressFields.map(([k,l,t,r])=>field(k,l,t,r))}
            {ufField('state','Estado',true)}
          </div>
        </fieldset>
        <fieldset className="space-y-4"><legend className="mb-3 font-semibold text-slate-800">Habilitação médica</legend>
          <p className="text-sm text-slate-600">O CRM será registrado como pendente até a conferência humana no conselho.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{field('crm','CRM', 'text',true)}{ufField('crmUf','UF do CRM',true)}</div>
        </fieldset>
        <div className="flex justify-end"><button type="button" onClick={continueProfessional} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-white hover:bg-emerald-800">Continuar <ArrowRight size={16}/></button></div>
      </div>}
      {step===2&&<div className="space-y-6">
        <div className="flex items-center gap-2"><Wallet className="text-emerald-700" size={20}/><h2 className="text-lg font-semibold">Conta de recebimento Asaas</h2></div>
        <div role="radiogroup" aria-label="Operação financeira" className="grid gap-3 sm:grid-cols-2">
          {([['CREATE','Criar nova subconta','Utiliza os dados já informados e cria uma conta filha no Asaas.'],['LINK','Vincular existente','Valida a conta diretamente na lista de subcontas da conta-pai.']] as const).map(([value,title,help])=>
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
          {field('accountIdentifier','Account ID ou Wallet ID', 'text',true)}
          <p className="text-sm text-slate-600">Somente contas verificáveis pela API da conta-pai podem ser associadas. Carteiras externas não são aceitas apenas por informar um identificador.</p>
        </fieldset>}
        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <legend className="px-2 font-semibold">Organização MsgDesk (opcional)</legend>
          <p className="text-sm text-slate-600">O vínculo com a organização requer uma integração previamente pareada e evidência verificável. O acesso clínico não é liberado neste cadastro.</p>
          <label className="block"><span className={labelClass}>Integração Canfy–MsgDesk pareada</span>
            <select className={inputClass} value={form.integrationId} onChange={e=>update('integrationId',e.target.value)}>
              <option value="">Associar posteriormente</option>{integrations.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          {integrationError&&<p role="alert" className="text-sm text-amber-800">Integrações indisponíveis: é possível concluir o financeiro e associar a organização depois.</p>}
          {form.integrationId&&field('evidenceReference','Referência da conferência de organização','text',true)}
        </fieldset>
        <div className="flex justify-between gap-3">
          <button className="rounded-lg border px-4 py-2.5" onClick={()=>setStep(1)}>Voltar</button>
          <button className="flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-white" onClick={continueFinancial}>Revisar <ArrowRight size={16}/></button>
        </div>
      </div>}
      {step===3&&<div className="space-y-6">
        <div className="flex items-center gap-2"><ShieldCheck className="text-emerald-700" size={20}/><h2 className="text-lg font-semibold">Revisar e confirmar</h2></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-5 space-y-2 text-sm">
            <h3 className="font-semibold text-slate-900">Profissional</h3>
            <p>{form.fullName}</p><p>CPF: {maskCpf(form.cpfNormalized)}</p><p>CRM: {form.crm} / {form.crmUf}</p>
            <p className="text-slate-600">Verificação profissional: pendente de análise humana</p>
          </div>
          <div className="rounded-xl border p-5 space-y-2 text-sm">
            <h3 className="font-semibold text-slate-900">Financeiro</h3><p>{mode==='CREATE'?'Criar nova subconta Asaas':'Vincular subconta Asaas existente'}</p>
            <p>{mode==='CREATE'?(form.ownerName||form.fullName):form.accountIdentifier}</p>
            <p className="text-slate-600">Aprovação da conta: depende do estado retornado pela Asaas</p>
          </div>
        </div>
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">A conclusão financeira não significa habilitação clínica nem acesso imediato ao MsgDesk. Se houver inconsistência de titularidade ou resposta incerta da Asaas, a operação ficará pendente de reconciliação.</p>
        {error&&<div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 p-4 text-sm text-red-800"><CircleAlert size={18} className="shrink-0"/><div><strong>Operação não confirmada</strong><p>{error}</p><p className="mt-2">Não inicie outro cadastro com uma chave diferente sem verificar o resultado anterior.</p></div></div>}
        <div className="flex justify-between gap-3">
          <button className="rounded-lg border px-4 py-2.5 disabled:opacity-50" disabled={busy||attempted} onClick={()=>setStep(2)}>Voltar</button>
          <button className="rounded-lg bg-emerald-700 px-5 py-2.5 text-white disabled:opacity-50" disabled={busy} onClick={()=>void submit()}>{busy?'Registrando com segurança…':attempted?'Verificar/retomar mesma operação':'Confirmar cadastro'}</button>
        </div>
      </div>}
      {step===4&&result&&<div className="space-y-5">
        <div className="flex items-center gap-3 text-emerald-700"><CheckCircle2 size={30}/><h2 className="text-xl font-semibold">Cadastro unificado registrado</h2></div>
        <p className="text-sm text-slate-600">{result.message}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ['Médico',result.doctor.fullName],
            ['Cadastro profissional',result.doctor.registrationStatus],
            ['Vínculo financeiro',result.doctor.financialLinks?.[0]?.status||'PENDENTE'],
            ['Situação Asaas',result.asaasStatus||'Aguardando consulta / ativação'],
            ['MsgDesk',result.msgdeskProvisioningStatus],
            ['Acesso clínico',result.clinicalAccessActive?'Ativo':'Não habilitado'],
          ] as const).map(([label,value])=><div className="rounded-xl border border-slate-200 p-4" key={label}>
            <p className="text-xs text-slate-500">{label}</p><p className="font-semibold text-slate-900">{value}</p>
          </div>)}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="rounded-lg bg-emerald-700 px-5 py-2.5 text-white" onClick={()=>router.push('/doctors')}>Gerenciar médicos</button>
          <Link className="rounded-lg border px-5 py-2.5" href="/subaccounts">Voltar a Subcontas</Link>
        </div>
      </div>}
    </section>
  </main>;
}
