'use client';
import DoctorsProfessionalSection from '../subaccounts/DoctorsProfessionalSection';
export default function DoctorsPage(){
 return <div className="space-y-6 max-w-7xl mx-auto"><div><h1 className="text-2xl font-bold text-gray-900">Médicos</h1><p className="text-sm text-gray-600 mt-1">Cadastros profissionais, verificação de CRM, associação organizacional e recebimento financeiro opcional.</p></div><DoctorsProfessionalSection initiallyExpanded /></div>;
}
