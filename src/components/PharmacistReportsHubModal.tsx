import React, { useState } from 'react';
import { Medicine } from '../types';
import { 
  UserCheck, 
  HeartHandshake, 
  Hourglass, 
  TrendingUp, 
  X, 
  BarChart3, 
  Sparkles,
  Boxes
} from 'lucide-react';
import { DemandAndRotationReport } from './DemandAndRotationReport';
import { OperatorAuditReport } from './OperatorAuditReport';
import { DonationBalanceReport } from './DonationBalanceReport';
import { DormantSamplesReport } from './DormantSamplesReport';
import { MostDispensedReport } from './MostDispensedReport';
import { cn } from '../lib/utils';

export type ReportTab = 'demand-rotation' | 'operator-audit' | 'donation-balance' | 'dormant-samples' | 'most-dispensed';

interface PharmacistReportsHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  medicines: Medicine[];
  initialTab?: ReportTab;
}

export function PharmacistReportsHubModal({
  isOpen,
  onClose,
  medicines,
  initialTab = 'demand-rotation'
}: PharmacistReportsHubModalProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);

  // Sincronizar activeTab si cambia initialTab
  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-100 w-full max-w-7xl max-h-[92vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white">
        {/* MODAL HEADER WITH TABS */}
        <div className="bg-white px-6 py-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-md">
              <BarChart3 size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-800 tracking-tight">Centro de Informes y Gestión</h2>
                <span className="bg-orange-100 text-orange-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-md">
                  Exclusivo Farmacéutico / Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Informes de demanda por período, rotación APM, trazabilidad y balance social</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2.5 rounded-2xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all active:scale-95"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION BAR */}
        <div className="bg-white px-6 py-2 border-b border-slate-200 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('demand-rotation')}
            className={cn(
              "px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all whitespace-nowrap active:scale-95",
              activeTab === 'demand-rotation'
                ? "bg-orange-600 text-white shadow-sm shadow-orange-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Boxes size={16} className={activeTab === 'demand-rotation' ? "text-white" : "text-orange-500"} />
            Demanda y Rotación APM
          </button>

          <button
            onClick={() => setActiveTab('operator-audit')}
            className={cn(
              "px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all whitespace-nowrap active:scale-95",
              activeTab === 'operator-audit'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <UserCheck size={16} className={activeTab === 'operator-audit' ? "text-orange-400" : "text-slate-400"} />
            Auditoría por Operador
          </button>

          <button
            onClick={() => setActiveTab('donation-balance')}
            className={cn(
              "px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all whitespace-nowrap active:scale-95",
              activeTab === 'donation-balance'
                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <HeartHandshake size={16} className={activeTab === 'donation-balance' ? "text-white" : "text-emerald-500"} />
            Balance de Donaciones (% Éxito)
          </button>

          <button
            onClick={() => setActiveTab('dormant-samples')}
            className={cn(
              "px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all whitespace-nowrap active:scale-95",
              activeTab === 'dormant-samples'
                ? "bg-amber-600 text-white shadow-sm shadow-amber-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Hourglass size={16} className={activeTab === 'dormant-samples' ? "text-white" : "text-amber-500"} />
            Muestras Dormidas (+60/+90 días)
          </button>

          <button
            onClick={() => setActiveTab('most-dispensed')}
            className={cn(
              "px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all whitespace-nowrap active:scale-95",
              activeTab === 'most-dispensed'
                ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <TrendingUp size={16} className={activeTab === 'most-dispensed' ? "text-white" : "text-blue-500"} />
            Ranking General
          </button>
        </div>

        {/* TAB CONTENT (SCROLLABLE BODY) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          {activeTab === 'demand-rotation' && (
            <DemandAndRotationReport medicines={medicines} onClose={onClose} />
          )}

          {activeTab === 'operator-audit' && (
            <OperatorAuditReport medicines={medicines} onClose={onClose} />
          )}

          {activeTab === 'donation-balance' && (
            <DonationBalanceReport medicines={medicines} onClose={onClose} />
          )}

          {activeTab === 'dormant-samples' && (
            <DormantSamplesReport medicines={medicines} onClose={onClose} />
          )}

          {activeTab === 'most-dispensed' && (
            <MostDispensedReport medicines={medicines} />
          )}
        </div>
      </div>
    </div>
  );
}
