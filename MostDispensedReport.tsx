import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Medicine } from '../types';
import { Download, FileText, TrendingUp, Filter, Award, Package, MapPin } from 'lucide-react';
import { downloadCSV } from '../lib/exportHelpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

interface MostDispensedReportProps {
  medicines: Medicine[];
}

type Timeframe = '30days' | 'thisMonth' | '90days' | 'all';

interface DispensedStat {
  medicineId: string;
  droga: string;
  nombreComercial: string;
  presentacion: string;
  familia: string;
  ubicacion: string;
  currentStock: number;
  totalQuantity: number;
  dispenseCount: number;
  lastDispensed?: Date;
}

export function MostDispensedReport({ medicines }: MostDispensedReportProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>('thisMonth');

  useEffect(() => {
    const fetchDispensations = async () => {
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
          .eq('type', 'dispensa')
          .order('created_at', { ascending: false });

        if (!error && data) {
          setMovements(data);
        }
      } catch (err) {
        console.error('Error al cargar movimientos de dispensa:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDispensations();
  }, []);

  // Map medicines by ID for fast lookup
  const medicineMap = useMemo(() => {
    const map = new Map<string, Medicine>();
    medicines.forEach(m => map.set(m.id, m));
    return map;
  }, [medicines]);

  // Filter movements by timeframe
  const filteredMovements = useMemo(() => {
    const now = new Date();
    return movements.filter(m => {
      if (!m.created_at) return true;
      const date = new Date(m.created_at);

      if (timeframe === '30days') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return date >= thirtyDaysAgo;
      }
      if (timeframe === 'thisMonth') {
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      }
      if (timeframe === '90days') {
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(now.getDate() - 90);
        return date >= ninetyDaysAgo;
      }
      return true; // 'all'
    });
  }, [movements, timeframe]);

  // Aggregate by medicine
  const rankingList = useMemo(() => {
    const statsMap = new Map<string, DispensedStat>();

    filteredMovements.forEach(m => {
      const med = medicineMap.get(m.medicine_id) || (m.medicines ? {
        id: m.medicine_id,
        droga: m.medicines.droga,
        nombreComercial: m.medicines.nombre_comercial,
        presentacion: m.medicines.presentacion,
        familia: m.medicines.familia,
        ubicacion: m.medicines.ubicacion,
        stockActual: m.medicines.stock_actual
      } as Medicine : undefined);

      const droga = m.medicine_name || med?.droga || 'Desconocido';
      const nombreComercial = m.medicine_comercial_name || med?.nombreComercial || '-';
      const key = m.medicine_id || droga;

      const date = m.created_at ? new Date(m.created_at) : undefined;

      if (!statsMap.has(key)) {
        statsMap.set(key, {
          medicineId: m.medicine_id,
          droga,
          nombreComercial,
          presentacion: med?.presentacion || '-',
          familia: med?.familia || '-',
          ubicacion: med?.ubicacion || '-',
          currentStock: med?.stockActual ?? 0,
          totalQuantity: 0,
          dispenseCount: 0,
          lastDispensed: date
        });
      }

      const stat = statsMap.get(key)!;
      stat.totalQuantity += (m.quantity || 0);
      stat.dispenseCount += 1;

      if (date && (!stat.lastDispensed || date > stat.lastDispensed)) {
        stat.lastDispensed = date;
      }
    });

    // Convert to array and sort descending by totalQuantity
    return Array.from(statsMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [filteredMovements, medicineMap]);

  const getTimeframeLabel = () => {
    switch (timeframe) {
      case '30days': return 'Últimos 30 días';
      case 'thisMonth': return 'Este mes actual';
      case '90days': return 'Últimos 90 días';
      case 'all': return 'Histórico completo';
    }
  };

  const handleExportCSV = () => {
    if (rankingList.length === 0) return;

    const headers = [
      "Ranking",
      "Droga / Principio Activo",
      "Nombre Comercial",
      "Presentación",
      "Familia",
      "Ubicación",
      "Unidades Dispensadas",
      "Cant. Entregas",
      "Stock Actual Disponible",
      "Última Dispensa"
    ];

    const rows = rankingList.map((item, index) => [
      index + 1,
      item.droga,
      item.nombreComercial,
      item.presentacion,
      item.familia,
      item.ubicacion,
      item.totalQuantity,
      item.dispenseCount,
      item.currentStock,
      item.lastDispensed ? item.lastDispensed.toLocaleDateString() : '-'
    ]);

    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`mas_dispensados_${timeframe}_${dateStr}`, headers, rows);
  };

  const handleExportPDF = () => {
    if (rankingList.length === 0) return;

    const doc = new jsPDF('landscape');

    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text("Farmacia Sabatto - Reporte de Más Dispensados", 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Período: ${getTimeframeLabel()} | Fecha de emisión: ${new Date().toLocaleString()}`, 14, 25);

    const tableData = rankingList.map((item, index) => [
      `#${index + 1}`,
      item.droga,
      item.nombreComercial,
      item.ubicacion,
      item.totalQuantity.toString(),
      item.dispenseCount.toString(),
      item.currentStock.toString(),
      item.lastDispensed ? item.lastDispensed.toLocaleDateString() : '-'
    ]);

    autoTable(doc, {
      startY: 32,
      head: [["#", "Droga / Medicamento", "Marca", "Ubicación", "Total Dispensado", "N° Entregas", "Stock Actual", "Últ. Dispensa"]],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [234, 88, 12], fontStyle: 'bold', textColor: [255, 255, 255] },
      styles: { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 65 },
        2: { cellWidth: 45 },
        3: { cellWidth: 30 },
        4: { cellWidth: 32, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 25, halign: 'center' },
        6: { cellWidth: 25, halign: 'center' },
        7: { cellWidth: 30, halign: 'center' }
      }
    });

    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`reporte_mas_dispensados_${timeframe}_${dateStr}.pdf`);
  };

  const totalDispensations = rankingList.reduce((acc, curr) => acc + curr.totalQuantity, 0);
  const totalOperations = rankingList.reduce((acc, curr) => acc + curr.dispenseCount, 0);

  if (loading) {
    return (
      <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase tracking-widest text-xs">
        Calculando estadísticas de dispensas...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top summary and filter controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50 p-6 rounded-[2.5rem] border-2 border-white shadow-sm">
        {/* Timeframe selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2 flex items-center gap-1.5">
            <Filter size={14} className="text-orange-500" /> Período:
          </span>
          <button
            onClick={() => setTimeframe('thisMonth')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all",
              timeframe === 'thisMonth' ? "bg-orange-600 text-white shadow-md shadow-orange-100" : "bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            Este Mes
          </button>
          <button
            onClick={() => setTimeframe('30days')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all",
              timeframe === '30days' ? "bg-orange-600 text-white shadow-md shadow-orange-100" : "bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            Últimos 30 días
          </button>
          <button
            onClick={() => setTimeframe('90days')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all",
              timeframe === '90days' ? "bg-orange-600 text-white shadow-md shadow-orange-100" : "bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            Últimos 90 días
          </button>
          <button
            onClick={() => setTimeframe('all')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all",
              timeframe === 'all' ? "bg-orange-600 text-white shadow-md shadow-orange-100" : "bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            Histórico Completo
          </button>
        </div>

        {/* Action Export Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            disabled={rankingList.length === 0}
            className="bg-white text-slate-800 hover:bg-orange-50 border-2 border-slate-200 hover:border-orange-300 px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Descargar archivo Excel / CSV con formato y tildes correctas"
          >
            <Download size={16} className="text-orange-500" />
            Exportar Excel / CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={rankingList.length === 0}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <FileText size={16} className="text-orange-400" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border-2 border-white shadow-md ring-1 ring-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Unidades Dispensadas</p>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-black text-orange-600">{totalDispensations}</span>
            <div className="p-3 bg-orange-50 rounded-2xl text-orange-500">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-2">{getTimeframeLabel()}</p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border-2 border-white shadow-md ring-1 ring-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Operaciones de Entrega</p>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-black text-slate-800">{totalOperations}</span>
            <div className="p-3 bg-slate-50 rounded-2xl text-slate-600">
              <Package size={20} />
            </div>
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-2">Transacciones registradas</p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border-2 border-white shadow-md ring-1 ring-slate-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Droga Líder en Demanda</p>
          <div className="flex items-center justify-between">
            <span className="text-base font-black text-slate-800 truncate max-w-[180px]">
              {rankingList[0]?.droga || 'Sin registros'}
            </span>
            <div className="p-3 bg-amber-50 rounded-2xl text-amber-500">
              <Award size={20} />
            </div>
          </div>
          <p className="text-[10px] font-bold text-orange-500 mt-2">
            {rankingList[0] ? `${rankingList[0].totalQuantity} unidades entregadas` : '-'}
          </p>
        </div>
      </div>

      {/* List Table */}
      {rankingList.length > 0 ? (
        <div className="bg-white rounded-[2.5rem] border-4 border-white shadow-xl ring-1 ring-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-3 px-8 py-5 border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            <div className="col-span-1 text-center">Puesto</div>
            <div className="col-span-4">Droga / Marca</div>
            <div className="col-span-2">Ubicación</div>
            <div className="col-span-2 text-center">Total Dispensado</div>
            <div className="col-span-1 text-center">N° Entregas</div>
            <div className="col-span-2 text-right">Stock Actual</div>
          </div>

          <div className="divide-y divide-slate-100">
            {rankingList.map((item, index) => {
              return (
                <div
                  key={item.medicineId || index}
                  className="grid grid-cols-12 gap-3 px-8 py-5 items-center hover:bg-orange-50/20 transition-colors"
                >
                  <div className="col-span-1 text-center">
                    <span className={cn(
                      "w-8 h-8 rounded-xl inline-flex items-center justify-center font-black text-xs shadow-sm",
                      index === 0 ? "bg-amber-400 text-white shadow-amber-100" :
                      index === 1 ? "bg-slate-300 text-slate-700" :
                      index === 2 ? "bg-amber-600 text-white" :
                      "bg-slate-100 text-slate-500"
                    )}>
                      #{index + 1}
                    </span>
                  </div>

                  <div className="col-span-4">
                    <p className="font-black text-slate-800 text-sm uppercase leading-tight">{item.droga}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] font-semibold text-slate-400 italic">{item.nombreComercial}</span>
                      {item.presentacion && item.presentacion !== '-' && (
                        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          {item.presentacion}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      <MapPin size={13} className="text-orange-500 shrink-0" />
                      <span>{item.ubicacion || 'Sin asignar'}</span>
                    </div>
                  </div>

                  <div className="col-span-2 text-center">
                    <span className="inline-block bg-orange-50 text-orange-600 font-black px-4 py-1.5 rounded-xl text-base">
                      {item.totalQuantity} <span className="text-[10px] font-bold text-orange-400 uppercase">u.</span>
                    </span>
                  </div>

                  <div className="col-span-1 text-center font-bold text-slate-600 text-xs">
                    {item.dispenseCount}
                  </div>

                  <div className="col-span-2 text-right">
                    <span className={cn(
                      "font-black text-sm px-3 py-1 rounded-lg inline-block",
                      item.currentStock === 0 ? "bg-red-100 text-red-600" :
                      item.currentStock < 10 ? "bg-amber-100 text-amber-600" :
                      "bg-slate-100 text-slate-700"
                    )}>
                      {item.currentStock} disp.
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] p-16 text-center border-4 border-white shadow-md">
          <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp size={32} />
          </div>
          <h4 className="text-lg font-black text-slate-800 uppercase mb-1">Sin dispensas en este período</h4>
          <p className="text-slate-400 text-xs font-medium max-w-md mx-auto">
            No se han registrado movimientos de tipo dispensa durante el período seleccionado ({getTimeframeLabel()}).
          </p>
        </div>
      )}
    </div>
  );
}
