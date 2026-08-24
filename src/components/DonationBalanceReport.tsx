import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getLocalMovements } from '../lib/storage';
import { Medicine } from '../types';
import { 
  HeartHandshake, 
  TrendingUp, 
  Calendar, 
  Filter, 
  Download, 
  FileText, 
  Package, 
  CheckCircle, 
  AlertTriangle, 
  Layers, 
  Award, 
  Search,
  Sparkles,
  PieChart as PieIcon,
  Percent
} from 'lucide-react';
import { downloadCSV } from '../lib/exportHelpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

interface DonationBalanceReportProps {
  medicines: Medicine[];
  onClose?: () => void;
}

type PeriodFilter = 'thisMonth' | 'thisQuarter' | 'thisYear' | 'all';

interface MedDonationStat {
  medicineId: string;
  droga: string;
  nombreComercial: string;
  presentacion: string;
  familia: string;
  ubicacion: string;
  ingresadas: number;
  dispensadas: number;
  descarteVencidas: number;
  stockActual: number;
  tasaAprovechamiento: number; // %
  tasaDescarte: number; // %
}

export function DonationBalanceReport({ medicines, onClose }: DonationBalanceReportProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    const fetchMovements = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('movements')
          .select(`
            *,
            medicines (
              droga,
              nombre_comercial,
              presentacion,
              familia,
              ubicacion,
              stock_actual
            )
          `)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          setMovements(data);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Error cargando movimientos de Supabase:', err);
      }

      // Fallback a almacenamiento local persistente
      const local = getLocalMovements();
      setMovements(local);
      setLoading(false);
    };

    fetchMovements();
  }, []);

  // Map medicines by ID
  const medicineMap = useMemo(() => {
    const map = new Map<string, Medicine>();
    medicines.forEach(m => map.set(m.id, m));
    return map;
  }, [medicines]);

  // Lista de familias farmacológicas únicas
  const familiesList = useMemo(() => {
    const fams = new Set<string>();
    medicines.forEach(m => {
      if (m.familia) fams.add(m.familia);
    });
    return Array.from(fams).sort();
  }, [medicines]);

  // Filtrado de movimientos por período
  const periodFilteredMovements = useMemo(() => {
    const now = new Date();
    return movements.filter(m => {
      if (!m.created_at || period === 'all') return true;
      const d = new Date(m.created_at);

      if (period === 'thisMonth') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (period === 'thisQuarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const movQuarter = Math.floor(d.getMonth() / 3);
        return d.getFullYear() === now.getFullYear() && currentQuarter === movQuarter;
      }
      if (period === 'thisYear') {
        return d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [movements, period]);

  // Consolidación de estadísticas por medicamento
  const medStats = useMemo(() => {
    const map = new Map<string, MedDonationStat>();

    // Inicializar con todos los medicamentos
    medicines.forEach(m => {
      map.set(m.id, {
        medicineId: m.id,
        droga: m.droga,
        nombreComercial: m.nombreComercial,
        presentacion: m.presentacion,
        familia: m.familia || 'Sin Categoría',
        ubicacion: m.ubicacion,
        ingresadas: 0,
        dispensadas: 0,
        descarteVencidas: 0,
        stockActual: m.stockActual || 0,
        tasaAprovechamiento: 0,
        tasaDescarte: 0
      });
    });

    // Procesar movimientos dentro del período
    periodFilteredMovements.forEach(m => {
      const medId = m.medicine_id;
      if (!map.has(medId)) {
        // En caso de que el medicamento haya sido agregado en movements pero no en local
        map.set(medId, {
          medicineId: medId,
          droga: m.medicines?.droga || m.medicine_name || 'Medicamento',
          nombreComercial: m.medicines?.nombre_comercial || '',
          presentacion: m.medicines?.presentacion || '',
          familia: m.medicines?.familia || 'General',
          ubicacion: m.medicines?.ubicacion || 'M1',
          ingresadas: 0,
          dispensadas: 0,
          descarteVencidas: 0,
          stockActual: m.medicines?.stock_actual || 0,
          tasaAprovechamiento: 0,
          tasaDescarte: 0
        });
      }

      const stat = map.get(medId)!;
      const qty = Number(m.quantity) || 0;

      if (m.type === 'ingreso' && !m.is_adjustment) {
        stat.ingresadas += qty;
      } else if (m.type === 'dispensa' && !m.is_adjustment) {
        stat.dispensadas += qty;
      } else if (m.is_adjustment) {
        // Si el ajuste es un egreso por merma/vencimiento
        const isWaste = (m.reason || '').toLowerCase().includes('merma') || 
                        (m.reason || '').toLowerCase().includes('venc') || 
                        (m.justification || '').toLowerCase().includes('merma') ||
                        (m.justification || '').toLowerCase().includes('venc');
        if (isWaste && m.type === 'dispensa') {
          stat.descarteVencidas += qty;
        } else if (m.type === 'ingreso') {
          stat.ingresadas += qty;
        }
      }
    });

    // Calcular tasas
    const list = Array.from(map.values()).map(s => {
      const totalBase = s.ingresadas > 0 ? s.ingresadas : (s.dispensadas + s.stockActual + s.descarteVencidas);
      const safeTotal = totalBase > 0 ? totalBase : 1;

      const tasaAprov = s.dispensadas > 0 ? Math.min(100, Math.round((s.dispensadas / safeTotal) * 100)) : 0;
      const tasaDesc = s.descarteVencidas > 0 ? Math.min(100, Math.round((s.descarteVencidas / safeTotal) * 100)) : 0;

      return {
        ...s,
        tasaAprovechamiento: tasaAprov,
        tasaDescarte: tasaDesc
      };
    });

    return list;
  }, [medicines, periodFilteredMovements]);

  // Filtrar lista para tabla
  const filteredList = useMemo(() => {
    return medStats.filter(item => {
      if (familyFilter !== 'all' && item.familia !== familyFilter) {
        return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match = item.droga.toLowerCase().includes(term) || 
                      item.nombreComercial.toLowerCase().includes(term) ||
                      item.familia.toLowerCase().includes(term) ||
                      item.ubicacion.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    }).sort((a, b) => b.dispensadas - a.dispensadas);
  }, [medStats, familyFilter, searchTerm]);

  // Métricas globales del balance
  const globalBalance = useMemo(() => {
    let totalIngresadas = 0;
    let totalDispensadas = 0;
    let totalDescarte = 0;
    let totalStockActivo = 0;

    medStats.forEach(s => {
      totalIngresadas += s.ingresadas;
      totalDispensadas += s.dispensadas;
      totalDescarte += s.descarteVencidas;
      totalStockActivo += s.stockActual;
    });

    // Base de cálculo
    const baseTotal = totalIngresadas > 0 ? totalIngresadas : (totalDispensadas + totalStockActivo + totalDescarte);
    const safeBase = baseTotal > 0 ? baseTotal : 1;

    const tasaAprovechamientoGlobal = Math.min(100, Math.round((totalDispensadas / safeBase) * 100));
    const tasaDescarteGlobal = Math.min(100, Math.round((totalDescarte / safeBase) * 100));
    const tasaEnRotacionGlobal = Math.max(0, 100 - tasaAprovechamientoGlobal - tasaDescarteGlobal);

    return {
      totalIngresadas: totalIngresadas > 0 ? totalIngresadas : baseTotal,
      totalDispensadas,
      totalDescarte,
      totalStockActivo,
      tasaAprovechamientoGlobal,
      tasaDescarteGlobal,
      tasaEnRotacionGlobal
    };
  }, [medStats]);

  // Rendimiento por familia farmacológica
  const familyBreakdown = useMemo(() => {
    const map = new Map<string, { family: string; ingresadas: number; dispensadas: number; stock: number; count: number }>();

    medStats.forEach(s => {
      const fam = s.familia || 'Otras';
      if (!map.has(fam)) {
        map.set(fam, { family: fam, ingresadas: 0, dispensadas: 0, stock: 0, count: 0 });
      }
      const e = map.get(fam)!;
      e.ingresadas += s.ingresadas;
      e.dispensadas += s.dispensadas;
      e.stock += s.stockActual;
      e.count += 1;
    });

    return Array.from(map.values())
      .map(f => {
        const base = f.ingresadas > 0 ? f.ingresadas : (f.dispensadas + f.stock);
        const safeBase = base > 0 ? base : 1;
        const tasa = Math.min(100, Math.round((f.dispensadas / safeBase) * 100));
        return { ...f, tasa };
      })
      .sort((a, b) => b.dispensadas - a.dispensadas);
  }, [medStats]);

  // Exportar a CSV
  const handleExportCSV = () => {
    const headers = [
      'Medicamento (Droga)',
      'Nombre Comercial',
      'Presentación',
      'Familia',
      'Ubicación',
      'Unidades Ingresadas (Donación)',
      'Unidades Dispensadas a Pacientes',
      'Stock Remanente Activo',
      'Unidades Vencidas / Descarte',
      'Tasa de Aprovechamiento Social (%)',
      'Tasa de Descarte (%)'
    ];

    const rows = filteredList.map(s => [
      s.droga,
      s.nombreComercial,
      s.presentacion,
      s.familia,
      s.ubicacion,
      s.ingresadas,
      s.dispensadas,
      s.stockActual,
      s.descarteVencidas,
      `${s.tasaAprovechamiento}%`,
      `${s.tasaDescarte}%`
    ]);

    downloadCSV(`balance_donaciones_aprovechamiento_${period}_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  // Exportar a PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text("Farmacia Sabatto - CAPS", 14, 18);
    
    doc.setFontSize(12);
    doc.setTextColor(234, 88, 12);
    doc.text("Balance de Ingresos vs. Aprovechamiento (% de Éxito de Donaciones)", 14, 26);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Fecha de emisión: ${new Date().toLocaleString('es-AR')} | Período: ${period}`, 14, 32);
    doc.text(`Tasa de Éxito Social: ${globalBalance.tasaAprovechamientoGlobal}% | Entregadas a Pacientes: ${globalBalance.totalDispensadas} u. | Stock en Rotación: ${globalBalance.totalStockActivo} u.`, 14, 37);

    const tableData = filteredList.map(s => [
      s.droga,
      s.nombreComercial || '-',
      s.familia || '-',
      s.ubicacion || '-',
      s.ingresadas.toString(),
      s.dispensadas.toString(),
      s.stockActual.toString(),
      `${s.tasaAprovechamiento}%`
    ]);

    autoTable(doc, {
      startY: 43,
      head: [["Droga", "Marca", "Familia", "Ubic.", "Ingresadas", "Dispensadas", "Stock", "% Éxito"]],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2 }
    });

    doc.save(`balance_donaciones_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-8">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-600 text-white rounded-2xl shadow-sm">
              <HeartHandshake size={26} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                Balance de Ingresos vs. Aprovechamiento
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Tasa de éxito social y efectividad del banco de muestras médicas del CAPS Sabatto
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95"
          >
            <Download size={16} className="text-emerald-600" />
            Excel / CSV
          </button>

          <button
            onClick={handleExportPDF}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
          >
            <FileText size={16} className="text-emerald-400" />
            Descargar Informe Ejecutivo PDF
          </button>
        </div>
      </div>

      {/* KPI PRINCIPAL: TASA DE ÉXITO SOCIAL */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 relative z-10">
          <div className="space-y-3 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-black uppercase tracking-wider">
              <Sparkles size={14} />
              Impacto Social del CAPS Sabatto
            </div>
            <h3 className="text-3xl font-black tracking-tight text-white">
              Tasa de Aprovechamiento de Donaciones
            </h3>
            <p className="text-slate-300 text-sm font-medium leading-relaxed">
              Mide el porcentaje de muestras médicas recibidas por laboratorios que fueron efectivamente entregadas a pacientes en tratamiento ambulatorio frente a las que vencieron o quedaron estancadas.
            </p>
          </div>

          <div className="flex items-center gap-6 bg-slate-800/80 p-6 rounded-3xl border border-slate-700/50 shadow-inner">
            <div className="text-center">
              <span className="text-[11px] font-black uppercase text-emerald-400 tracking-widest block mb-1">
                Efectividad Social
              </span>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-black text-emerald-400 tracking-tight">
                  {globalBalance.tasaAprovechamientoGlobal}
                </span>
                <span className="text-2xl font-black text-emerald-300">%</span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 block">
                {globalBalance.tasaAprovechamientoGlobal >= 80 ? '🌟 Nivel Sobresaliente' : globalBalance.tasaAprovechamientoGlobal >= 65 ? '✅ Nivel Óptimo' : '⚠️ A Optimizar'}
              </span>
            </div>

            <div className="h-16 w-px bg-slate-700" />

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400" />
                <span className="text-slate-300">Entregadas a Pacientes:</span>
                <strong className="text-white ml-auto">{globalBalance.totalDispensadas} u.</strong>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-400" />
                <span className="text-slate-300">En Rotación Activa:</span>
                <strong className="text-white ml-auto">{globalBalance.totalStockActivo} u.</strong>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <span className="text-slate-300">Mermas / Vencidas:</span>
                <strong className="text-white ml-auto">{globalBalance.totalDescarte} u.</strong>
              </div>
            </div>
          </div>
        </div>

        {/* BARRA DE PROGRESO COMPUESTA */}
        <div className="mt-8 pt-6 border-t border-slate-700/50 space-y-2">
          <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-slate-300">
            <span>Distribución de Muestras Ingresadas ({globalBalance.totalIngresadas} unidades totales)</span>
            <span>Aprovechamiento: {globalBalance.tasaAprovechamientoGlobal}%</span>
          </div>

          <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex p-0.5 border border-slate-700">
            <div 
              style={{ width: `${globalBalance.tasaAprovechamientoGlobal}%` }} 
              className="bg-emerald-500 rounded-l-full transition-all duration-500" 
              title={`Aprovechadas por Pacientes: ${globalBalance.tasaAprovechamientoGlobal}%`}
            />
            <div 
              style={{ width: `${globalBalance.tasaEnRotacionGlobal}%` }} 
              className="bg-blue-500 transition-all duration-500" 
              title={`En Rotación / Stock: ${globalBalance.tasaEnRotacionGlobal}%`}
            />
            <div 
              style={{ width: `${globalBalance.tasaDescarteGlobal}%` }} 
              className="bg-red-500 rounded-r-full transition-all duration-500" 
              title={`Descarte / Vencidas: ${globalBalance.tasaDescarteGlobal}%`}
            />
          </div>

          <div className="flex justify-between text-[10px] text-slate-400 font-bold pt-1">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/> Entregadas ({globalBalance.tasaAprovechamientoGlobal}%)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"/> En Estantería ({globalBalance.tasaEnRotacionGlobal}%)</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/> Mermas ({globalBalance.tasaDescarteGlobal}%)</span>
          </div>
        </div>
      </div>

      {/* TARJETAS DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Muestras Ingresadas</span>
            <Package size={20} className="text-slate-400" />
          </div>
          <p className="text-3xl font-black text-slate-900">{globalBalance.totalIngresadas}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Unidades recibidas por laboratorios</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-slate-900 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Entregadas a Pacientes</span>
            <CheckCircle size={20} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-emerald-600">{globalBalance.totalDispensadas}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Tratamientos completados</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-emerald-500 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest">Stock en Espera</span>
            <Layers size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-black text-blue-600">{globalBalance.totalStockActivo}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Listas para prescripción médica</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-blue-500 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-red-600 uppercase tracking-widest">Tasa de Merma / Vencidas</span>
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <p className="text-3xl font-black text-red-600">{globalBalance.tasaDescarteGlobal}%</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">{globalBalance.totalDescarte} unidades vencidas</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-red-500 rounded-bl-full" />
        </div>
      </div>

      {/* FILTROS DE PERÍODO Y FAMILIA */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Filter size={16} className="text-emerald-600" />
            Segmentación del Balance
          </span>
          <span className="text-xs text-slate-400 font-bold">
            Mostrando <strong className="text-slate-800">{filteredList.length}</strong> medicamentos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Período */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Período de Análisis</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as PeriodFilter)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="thisMonth">📅 Este Mes Actual</option>
              <option value="thisQuarter">📅 Trimestre Actual</option>
              <option value="thisYear">📅 Año 2026</option>
              <option value="all">📅 Histórico Acumulado Completo</option>
            </select>
          </div>

          {/* Familia */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Familia Farmacológica</label>
            <select
              value={familyFilter}
              onChange={e => setFamilyFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="all">📂 Todas las familias ({familiesList.length})</option>
              {familiesList.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Buscador */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Buscar Medicamento</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Droga, nombre comercial o ubicación..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* EFECTIVIDAD POR FAMILIA / ESPECIALIDAD */}
      {familyBreakdown.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Award size={16} className="text-emerald-600" />
            Aprovechamiento por Grupo Farmacológico
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {familyBreakdown.slice(0, 4).map(f => (
              <div key={f.family} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 truncate">{f.family}</span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                    {f.tasa}% éxito
                  </span>
                </div>

                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div style={{ width: `${f.tasa}%` }} className="h-full bg-emerald-500 rounded-full" />
                </div>

                <div className="flex justify-between text-[11px] text-slate-500 font-medium pt-1 border-t border-slate-50">
                  <span>Dispensadas: <strong className="text-slate-800">{f.dispensadas} u.</strong></span>
                  <span>Stock: <strong className="text-slate-800">{f.stock} u.</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TABLA DE DETALLE POR MEDICAMENTO */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Percent size={16} className="text-emerald-600" />
            Detalle de Aprovechamiento por Donación ({filteredList.length} ítems)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100/75 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-5">Medicamento</th>
                <th className="py-3.5 px-5">Familia</th>
                <th className="py-3.5 px-5 text-center">Ubicación</th>
                <th className="py-3.5 px-5 text-center">Ingresadas</th>
                <th className="py-3.5 px-5 text-center">Dispensadas (Pacientes)</th>
                <th className="py-3.5 px-5 text-center">Stock Actual</th>
                <th className="py-3.5 px-5 text-right">% Aprovechamiento</th>
                <th className="py-3.5 px-5 text-center">Estado de Éxito</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.map(s => {
                const isHigh = s.tasaAprovechamiento >= 75;
                const isMedium = s.tasaAprovechamiento >= 40 && s.tasaAprovechamiento < 75;

                return (
                  <tr key={s.medicineId} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3.5 px-5">
                      <span className="font-black text-slate-900 block text-xs">
                        {s.droga}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {s.nombreComercial || s.presentacion}
                      </span>
                    </td>

                    <td className="py-3.5 px-5 text-xs font-medium text-slate-600 whitespace-nowrap">
                      {s.familia}
                    </td>

                    <td className="py-3.5 px-5 text-center whitespace-nowrap">
                      <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-xs">
                        {s.ubicacion || '-'}
                      </span>
                    </td>

                    <td className="py-3.5 px-5 text-center font-bold text-slate-700">
                      {s.ingresadas > 0 ? `+${s.ingresadas}` : (s.dispensadas + s.stockActual)}
                    </td>

                    <td className="py-3.5 px-5 text-center font-black text-emerald-600">
                      {s.dispensadas}
                    </td>

                    <td className="py-3.5 px-5 text-center font-black text-blue-600">
                      {s.stockActual}
                    </td>

                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                          <div 
                            style={{ width: `${s.tasaAprovechamiento}%` }} 
                            className={cn(
                              "h-full rounded-full",
                              isHigh ? "bg-emerald-500" : isMedium ? "bg-blue-500" : "bg-amber-500"
                            )} 
                          />
                        </div>
                        <span className={cn(
                          "font-black text-xs",
                          isHigh ? "text-emerald-600" : isMedium ? "text-blue-600" : "text-amber-600"
                        )}>
                          {s.tasaAprovechamiento}%
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-5 text-center whitespace-nowrap">
                      {isHigh ? (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                          <CheckCircle size={12} />
                          Alto Impacto
                        </span>
                      ) : isMedium ? (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                          <TrendingUp size={12} />
                          En Rotación
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Stock Remanente
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
