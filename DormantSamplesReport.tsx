import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getLocalMovements } from '../lib/storage';
import { Medicine } from '../types';
import { 
  Hourglass, 
  AlertTriangle, 
  Calendar, 
  Filter, 
  Download, 
  FileText, 
  Package, 
  Layers, 
  ShieldAlert, 
  Search,
  MapPin,
  Clock,
  CheckCircle2,
  HelpCircle,
  Stethoscope,
  MoveRight,
  TrendingDown
} from 'lucide-react';
import { downloadCSV } from '../lib/exportHelpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

interface DormantSamplesReportProps {
  medicines: Medicine[];
  onClose?: () => void;
}

type DormantThresholdDays = 30 | 60 | 90 | 120 | 180;

interface DormantItem {
  medicine: Medicine;
  stockActual: number;
  lastDispenseDate: Date | null;
  lastEntryDate: Date | null;
  daysSinceLastDispense: number;
  alertLevel: 'critical' | 'space' | 'warning' | 'normal';
  recommendedAction: string;
}

export function DormantSamplesReport({ medicines, onClose }: DormantSamplesReportProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [thresholdDays, setThresholdDays] = useState<DormantThresholdDays>(60);
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    const fetchMovements = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('movements')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          setMovements(data);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Error cargando movimientos de Supabase:', err);
      }

      // Fallback local
      const local = getLocalMovements();
      setMovements(local);
      setLoading(false);
    };

    fetchMovements();
  }, []);

  // Lista de ubicaciones físicas únicas
  const locationsList = useMemo(() => {
    const locs = new Set<string>();
    medicines.forEach(m => {
      if (m.ubicacion) locs.add(m.ubicacion);
    });
    return Array.from(locs).sort();
  }, [medicines]);

  // Cálculo de inactividad por medicamento
  const dormantAnalysis = useMemo(() => {
    const now = new Date();

    // Mapear último movimiento de dispensa y último ingreso por medicamento
    const lastDispenseMap = new Map<string, Date>();
    const lastEntryMap = new Map<string, Date>();

    movements.forEach(m => {
      const medId = m.medicine_id;
      if (!medId || !m.created_at) return;
      const d = new Date(m.created_at);

      if (m.type === 'dispensa' && !m.is_adjustment) {
        const currentLast = lastDispenseMap.get(medId);
        if (!currentLast || d > currentLast) {
          lastDispenseMap.set(medId, d);
        }
      } else if (m.type === 'ingreso' && !m.is_adjustment) {
        const currentLast = lastEntryMap.get(medId);
        if (!currentLast || d > currentLast) {
          lastEntryMap.set(medId, d);
        }
      }
    });

    const items: DormantItem[] = [];

    medicines.forEach(med => {
      // Considerar solo ítems con stock positivo en estantería
      if (med.stockActual <= 0) return;

      const lastDispense = lastDispenseMap.get(med.id) || null;
      const lastEntry = lastEntryMap.get(med.id) || null;

      let daysInactive = 999; // Si nunca tuvo salidas

      if (lastDispense) {
        const diffTime = Math.abs(now.getTime() - lastDispense.getTime());
        daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      } else if (lastEntry) {
        const diffTime = Math.abs(now.getTime() - lastEntry.getTime());
        daysInactive = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      // Comprobar si supera el umbral de inactividad
      if (daysInactive >= thresholdDays) {
        // Evaluar nivel de urgencia
        let alertLevel: 'critical' | 'space' | 'warning' | 'normal' = 'warning';
        let action = 'Monitorear demanda y consultar con médicos del servicio.';

        // Comprobar si vence pronto (en menos de 180 días)
        let isExpiringSoon = false;
        if (med.fechaVencimiento) {
          const parts = med.fechaVencimiento.split('-');
          if (parts.length >= 2) {
            const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 28);
            const daysToExpiry = Math.floor((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysToExpiry <= 180) {
              isExpiringSoon = true;
            }
          }
        }

        if (isExpiringSoon && daysInactive >= 60) {
          alertLevel = 'critical';
          action = '⚠️ ALTA PRIORIDAD: Vencimiento cercano sin salidas. Indicar a cardiólogos prescripción inmediata o transferir.';
        } else if (med.stockActual >= 15 && daysInactive >= 60) {
          alertLevel = 'space';
          action = '📦 CONGESTIÓN: Gran volumen inmovilizado ocupando estantería. Evaluar reubicación a depósito.';
        } else {
          alertLevel = 'warning';
          action = 'Promover indicación en consultas ambulatorias.';
        }

        items.push({
          medicine: med,
          stockActual: med.stockActual,
          lastDispenseDate: lastDispense,
          lastEntryDate: lastEntry,
          daysSinceLastDispense: daysInactive,
          alertLevel,
          recommendedAction: action
        });
      }
    });

    // Ordenar: primero críticas, luego por días de inactividad descendente
    return items.sort((a, b) => {
      if (a.alertLevel === 'critical' && b.alertLevel !== 'critical') return -1;
      if (b.alertLevel === 'critical' && a.alertLevel !== 'critical') return 1;
      return b.daysSinceLastDispense - a.daysSinceLastDispense;
    });
  }, [medicines, movements, thresholdDays]);

  // Filtrar lista para tabla
  const filteredDormantItems = useMemo(() => {
    return dormantAnalysis.filter(item => {
      if (locationFilter !== 'all' && item.medicine.ubicacion !== locationFilter) {
        return false;
      }

      if (urgencyFilter !== 'all' && item.alertLevel !== urgencyFilter) {
        return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match = item.medicine.droga.toLowerCase().includes(term) ||
                      item.medicine.nombreComercial.toLowerCase().includes(term) ||
                      (item.medicine.familia || '').toLowerCase().includes(term) ||
                      (item.medicine.ubicacion || '').toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });
  }, [dormantAnalysis, locationFilter, urgencyFilter, searchTerm]);

  // Métricas agregadas
  const stats = useMemo(() => {
    const totalItems = dormantAnalysis.length;
    let totalUnits = 0;
    let criticalCount = 0;
    let spaceCongestionUnits = 0;
    const locationMap = new Map<string, number>();

    dormantAnalysis.forEach(item => {
      totalUnits += item.stockActual;
      if (item.alertLevel === 'critical') criticalCount++;
      if (item.alertLevel === 'space') spaceCongestionUnits += item.stockActual;

      const loc = item.medicine.ubicacion || 'Sin Ubicación';
      locationMap.set(loc, (locationMap.get(loc) || 0) + item.stockActual);
    });

    let topLocation = '-';
    let topLocUnits = 0;
    locationMap.forEach((units, loc) => {
      if (units > topLocUnits) {
        topLocUnits = units;
        topLocation = loc;
      }
    });

    return {
      totalItems,
      totalUnits,
      criticalCount,
      spaceCongestionUnits,
      topLocation,
      topLocUnits
    };
  }, [dormantAnalysis]);

  // Exportar a CSV
  const handleExportCSV = () => {
    const headers = [
      'Medicamento (Droga)',
      'Nombre Comercial',
      'Presentación',
      'Familia',
      'Ubicación',
      'Stock Inmovilizado',
      'Última Salida',
      'Días Sin Movimiento',
      'Vencimiento',
      'Nivel de Alerta',
      'Acción Sugerida'
    ];

    const rows = filteredDormantItems.map(item => [
      item.medicine.droga,
      item.medicine.nombreComercial,
      item.medicine.presentacion,
      item.medicine.familia || '-',
      item.medicine.ubicacion,
      item.stockActual,
      item.lastDispenseDate ? item.lastDispenseDate.toLocaleDateString('es-AR') : 'Sin registro previo',
      item.daysSinceLastDispense >= 900 ? '+180 (Desde ingreso)' : item.daysSinceLastDispense,
      item.medicine.fechaVencimiento || '-',
      item.alertLevel === 'critical' ? 'CRÍTICA (Vence pronto)' : item.alertLevel === 'space' ? 'CONGESTIÓN ESPACIO' : 'INACTIVA',
      item.recommendedAction
    ]);

    downloadCSV(`muestras_dormidas_${thresholdDays}dias_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  // Exportar a PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text("Farmacia Sabatto - CAPS", 14, 18);
    
    doc.setFontSize(12);
    doc.setTextColor(217, 119, 6);
    doc.text(`Alerta de Muestras Dormidas / Sin Movimiento (+${thresholdDays} días)`, 14, 26);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Fecha de emisión: ${new Date().toLocaleString('es-AR')} | Umbral: +${thresholdDays} días`, 14, 32);
    doc.text(`Total Ítems Inactivos: ${stats.totalItems} | Unidades en Estantería: ${stats.totalUnits} u. | Alertas Críticas: ${stats.criticalCount}`, 14, 37);

    const tableData = filteredDormantItems.map(item => [
      item.medicine.droga,
      item.medicine.ubicacion,
      item.stockActual.toString(),
      item.daysSinceLastDispense >= 900 ? '>180 d.' : `${item.daysSinceLastDispense} d.`,
      item.medicine.fechaVencimiento || '-',
      item.alertLevel === 'critical' ? 'CRÍTICA' : item.alertLevel === 'space' ? 'CONGESTIÓN' : 'INACTIVA',
      item.recommendedAction.substring(0, 40) + '...'
    ]);

    autoTable(doc, {
      startY: 43,
      head: [["Medicamento", "Ubic.", "Stock", "Inactividad", "Vence", "Alerta", "Acción Sugerida"]],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2 }
    });

    doc.save(`muestras_dormidas_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-sm">
              <Hourglass size={26} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                Alerta de Muestras Dormidas / Sin Rotación
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Detección temprana de donaciones estancadas ocupando espacio físico en estanterías sin demanda clínica
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <Download size={16} className="text-amber-600" />
            Excel / CSV
          </button>

          <button
            onClick={handleExportPDF}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
          >
            <FileText size={16} className="text-amber-400" />
            Descargar Listado PDF
          </button>
        </div>
      </div>

      {/* TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Muestras Estancadas</span>
            <Hourglass size={20} className="text-amber-500" />
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.totalItems}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Ítems sin salidas en +{thresholdDays} días</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-amber-500 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Unidades Ocupando Espacio</span>
            <Package size={20} className="text-slate-400" />
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.totalUnits}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Unidades físicas inmovilizadas</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-slate-900 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-red-600 uppercase tracking-widest">Riesgo Crítico de Vencimiento</span>
            <ShieldAlert size={20} className="text-red-500" />
          </div>
          <p className="text-3xl font-black text-red-600">{stats.criticalCount}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Inactivas con vencimiento cercano</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-red-500 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest">Ubicación Más Congestionada</span>
            <MapPin size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-black text-blue-600">{stats.topLocation}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">{stats.topLocUnits} unidades acumuladas</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-blue-500 rounded-bl-full" />
        </div>
      </div>

      {/* SELECTOR DE UMBRAL DE DÍAS Y FILTROS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
            Seleccionar Umbral de Inactividad (Sin Movimiento de Salida):
          </label>
          <div className="flex flex-wrap gap-2">
            {([30, 60, 90, 120, 180] as DormantThresholdDays[]).map(days => (
              <button
                key={days}
                onClick={() => setThresholdDays(days)}
                className={cn(
                  "px-5 py-2.5 rounded-2xl font-black text-xs transition-all active:scale-95 flex items-center gap-2",
                  thresholdDays === days
                    ? "bg-amber-600 text-white shadow-md shadow-amber-200/50"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                <Clock size={14} />
                +{days} Días sin salida {days === 60 ? '(Recomendado)' : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
          {/* Ubicación */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtrar por Ubicación Física</label>
            <select
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none"
            >
              <option value="all">📍 Todas las ubicaciones (M1, M2, Heladera...)</option>
              {locationsList.map(l => (
                <option key={l} value={l}>📍 {l}</option>
              ))}
            </select>
          </div>

          {/* Nivel de Urgencia */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nivel de Alerta</label>
            <select
              value={urgencyFilter}
              onChange={e => setUrgencyFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none"
            >
              <option value="all">⚡ Todos los niveles de alerta</option>
              <option value="critical">🔴 Crítico (Próximo a vencer)</option>
              <option value="space">🟠 Congestión de Espacio (+15 u.)</option>
              <option value="warning">🟡 Inactiva Estándar</option>
            </select>
          </div>

          {/* Buscador */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Buscar Medicamento</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Droga, nombre comercial..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* TABLA DE DETALLE */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Muestras Identificadas Sin Rotación Reciente ({filteredDormantItems.length})
          </span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold text-sm">
            Analizando rotación de muestras en estanterías...
          </div>
        ) : filteredDormantItems.length === 0 ? (
          <div className="p-16 text-center text-emerald-600 font-medium space-y-2">
            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
            <p className="text-base font-black text-slate-800">¡Excelente rotación de inventario!</p>
            <p className="text-xs text-slate-500">No se detectaron muestras médicas con más de {thresholdDays} días de inactividad en el stock activo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100/75 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-5">Medicamento</th>
                  <th className="py-3.5 px-5 text-center">Ubicación</th>
                  <th className="py-3.5 px-5 text-center">Stock Inmovilizado</th>
                  <th className="py-3.5 px-5 text-center">Días Sin Salidas</th>
                  <th className="py-3.5 px-5 text-center">Vencimiento</th>
                  <th className="py-3.5 px-5 text-center">Nivel Alerta</th>
                  <th className="py-3.5 px-5">Recomendación para Farmacéutico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDormantItems.map(item => {
                  const isCrit = item.alertLevel === 'critical';
                  const isSpace = item.alertLevel === 'space';

                  return (
                    <tr key={item.medicine.id} className={cn(
                      "transition-colors",
                      isCrit ? "bg-red-50/40 hover:bg-red-50/70" : "hover:bg-slate-50/75"
                    )}>
                      <td className="py-3.5 px-5">
                        <span className="font-black text-slate-900 block text-xs">
                          {item.medicine.droga}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {item.medicine.nombreComercial || item.medicine.presentacion}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-xs">
                          {item.medicine.ubicacion || '-'}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        <span className="font-black text-slate-800 text-sm">
                          {item.stockActual} u.
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        <span className={cn(
                          "font-black text-xs px-2.5 py-1 rounded-xl inline-block",
                          item.daysSinceLastDispense >= 120 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                        )}>
                          {item.daysSinceLastDispense >= 900 ? '>180 días' : `${item.daysSinceLastDispense} días`}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-center whitespace-nowrap font-medium text-xs text-slate-600">
                        {item.medicine.fechaVencimiento || '-'}
                      </td>

                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        {isCrit ? (
                          <span className="bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <ShieldAlert size={12} />
                            Crítica
                          </span>
                        ) : isSpace ? (
                          <span className="bg-orange-100 text-orange-800 border border-orange-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <Layers size={12} />
                            Congestión
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                            <Clock size={12} />
                            Inactiva
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-xs text-slate-700 max-w-sm">
                        <p className={cn("font-medium", isCrit ? "text-red-900 font-bold" : "text-slate-700")}>
                          {item.recommendedAction}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
