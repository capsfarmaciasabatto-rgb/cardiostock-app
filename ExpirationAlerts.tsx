import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Medicine, Batch } from '../types';
import { Calendar, Package, MapPin, Download, FileText, Filter } from 'lucide-react';
import { downloadCSV } from '../lib/exportHelpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

interface ExpirationAlertsProps {
  medicines: Medicine[];
}

export function ExpirationAlerts({ medicines }: ExpirationAlertsProps) {
  const [allBatches, setAllBatches] = useState<(Batch & { medicine: Medicine })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'expired' | 'upcoming'>('all');

  useEffect(() => {
    let isMounted = true;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const results: (Batch & { medicine: Medicine })[] = [];
        
        // Map medicines for quick lookup
        const medMap = new Map<string, Medicine>();
        medicines.forEach(m => medMap.set(m.id, m));

        const { data: batchesData, error } = await supabase
          .from('batches')
          .select(`
            *,
            medicines (
              id,
              droga,
              nombre_comercial,
              presentacion,
              familia,
              ubicacion,
              stock_actual
            )
          `)
          .gt('quantity', 0);

        if (!error && batchesData) {
          batchesData.forEach((b: any) => {
            const med = medMap.get(b.medicine_id) || (b.medicines ? {
              id: b.medicines.id,
              droga: b.medicines.droga,
              nombreComercial: b.medicines.nombre_comercial,
              presentacion: b.medicines.presentacion,
              familia: b.medicines.familia,
              ubicacion: b.medicines.ubicacion,
              stockActual: b.medicines.stock_actual
            } as Medicine : {
              id: b.medicine_id,
              droga: 'Desconocido',
              nombreComercial: '-',
              presentacion: '-',
              familia: '-',
              ubicacion: '-',
              stockActual: 0
            } as Medicine);

            results.push({
              id: b.id,
              medicineId: b.medicine_id,
              vencimiento: b.vencimiento,
              quantity: b.quantity,
              medicine: med
            });
          });
        }

        if (isMounted) {
          // Sort by expiration date
          const sorted = results.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
          
          // Filter those expiring in the next 90 days or already expired
          const ninetyDaysFromNow = new Date();
          ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
          const limitStr = ninetyDaysFromNow.toISOString().substring(0, 7); // YYYY-MM

          const upcoming = sorted.filter(b => b.vencimiento <= limitStr);
          setAllBatches(upcoming);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error al cargar alertas de vencimiento:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchAll();
    return () => { isMounted = false; };
  }, [medicines]);

  const currentMonthStr = useMemo(() => {
    return new Date().toISOString().substring(0, 7);
  }, []);

  const filteredBatches = useMemo(() => {
    return allBatches.filter(b => {
      const isExpired = b.vencimiento <= currentMonthStr;
      if (filterType === 'expired') return isExpired;
      if (filterType === 'upcoming') return !isExpired;
      return true;
    });
  }, [allBatches, filterType, currentMonthStr]);

  const expiredCount = useMemo(() => {
    return allBatches.filter(b => b.vencimiento <= currentMonthStr).length;
  }, [allBatches, currentMonthStr]);

  const upcomingCount = useMemo(() => {
    return allBatches.filter(b => b.vencimiento > currentMonthStr).length;
  }, [allBatches, currentMonthStr]);

  const handleExportCSV = () => {
    if (filteredBatches.length === 0) return;

    const headers = [
      "Estado",
      "Droga / Principio Activo",
      "Nombre Comercial",
      "Presentación",
      "Familia",
      "Ubicación / Estante",
      "Lote",
      "Fecha de Vencimiento",
      "Stock en Lote"
    ];

    const rows = filteredBatches.map(b => {
      const isExpired = b.vencimiento <= currentMonthStr;
      return [
        isExpired ? 'VENCIDO' : 'PRÓXIMO A VENCER',
        b.medicine.droga,
        b.medicine.nombreComercial,
        b.medicine.presentacion || '-',
        b.medicine.familia || '-',
        b.medicine.ubicacion || 'Sin asignar',
        b.id,
        b.vencimiento,
        b.quantity
      ];
    });

    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`alertas_vencimiento_${filterType}_${dateStr}`, headers, rows);
  };

  const handleExportPDF = () => {
    if (filteredBatches.length === 0) return;

    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text("Farmacia Sabatto - Reporte de Vencimientos", 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Criterio: Lotes próximos a vencer (< 90 días) y vencidos | Fecha: ${new Date().toLocaleDateString()}`, 14, 25);

    const tableData = filteredBatches.map(b => {
      const isExpired = b.vencimiento <= currentMonthStr;
      return [
        isExpired ? 'VENCIDO' : 'PRÓXIMO',
        b.medicine.droga,
        b.medicine.nombreComercial,
        b.medicine.ubicacion || '-',
        b.id.substring(0, 8),
        b.vencimiento,
        b.quantity.toString()
      ];
    });

    autoTable(doc, {
      startY: 32,
      head: [["Estado", "Droga / Medicamento", "Marca", "Ubicación", "Lote", "Vencimiento", "Stock"]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [234, 88, 12], fontStyle: 'bold', textColor: [255, 255, 255] },
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 50 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 22 },
        5: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 15, halign: 'center' }
      }
    });

    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`reporte_vencimientos_${dateStr}.pdf`);
  };

  if (loading) {
    return (
      <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase tracking-widest text-[10px]">
        Analizando fechas de vencimiento y ubicaciones...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Control bar: Filters + Export buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-6 rounded-[2.5rem] border-2 border-white shadow-sm">
        {/* Quick Filter buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2 flex items-center gap-1.5">
            <Filter size={14} className="text-orange-500" /> Filtrar:
          </span>
          <button
            onClick={() => setFilterType('all')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all",
              filterType === 'all' ? "bg-orange-600 text-white shadow-md shadow-orange-100" : "bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            Todos ({allBatches.length})
          </button>
          <button
            onClick={() => setFilterType('expired')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
              filterType === 'expired' ? "bg-red-600 text-white shadow-md shadow-red-100" : "bg-white text-red-600 hover:bg-red-50"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Vencidos ({expiredCount})
          </button>
          <button
            onClick={() => setFilterType('upcoming')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5",
              filterType === 'upcoming' ? "bg-amber-500 text-white shadow-md shadow-amber-100" : "bg-white text-amber-600 hover:bg-amber-50"
            )}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Próximos ({upcomingCount})
          </button>
        </div>

        {/* Export buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCSV}
            disabled={filteredBatches.length === 0}
            className="bg-white text-slate-800 hover:bg-orange-50 border-2 border-slate-200 hover:border-orange-300 px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Descargar listado para Excel con Ubicaciones"
          >
            <Download size={16} className="text-orange-500" />
            Exportar Excel / CSV
          </button>
          <button
            onClick={handleExportPDF}
            disabled={filteredBatches.length === 0}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <FileText size={16} className="text-orange-400" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {filteredBatches.length > 0 ? (
          filteredBatches.map(b => {
            const isExpired = b.vencimiento <= currentMonthStr;
            return (
              <div
                key={`${b.medicine.id}-${b.id}`}
                className={cn(
                  "p-8 rounded-[2.5rem] border-4 border-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all hover:shadow-xl",
                  isExpired ? "bg-red-50/80 ring-1 ring-red-200" : "bg-amber-50/50 ring-1 ring-amber-100"
                )}
              >
                {/* Medicine info & location */}
                <div className="flex items-center gap-4 flex-1">
                  <div className={cn("p-3 rounded-2xl shrink-0", isExpired ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600")}>
                    <Calendar size={22} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-black text-slate-800 uppercase leading-none">{b.medicine.droga}</p>
                    </div>
                    <p className="text-[11px] font-bold text-slate-400 italic mb-2">
                      {b.medicine.nombreComercial} {b.medicine.presentacion ? `• ${b.medicine.presentacion}` : ''}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md shadow-sm tracking-wide",
                        isExpired ? "bg-red-600 text-white" : "bg-amber-500 text-white"
                      )}>
                        {isExpired ? 'VENCIDO' : 'PRÓXIMO A VENCER'}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-white/70 px-2 py-0.5 rounded border border-slate-100">
                        Lote: {b.id.substring(0, 8)}
                      </span>
                      {/* Location Badge */}
                      <span className="inline-flex items-center gap-1 text-[10px] font-black text-orange-700 bg-orange-100/90 px-2.5 py-0.5 rounded-md border border-orange-200/60 shadow-xs">
                        <MapPin size={11} className="text-orange-600" />
                        <span>Ubicación: {b.medicine.ubicacion || 'Sin asignar'}</span>
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Expiry date */}
                <div className="flex-1 md:text-center px-4 py-2 bg-white/60 rounded-2xl border border-white">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Fecha de Vencimiento</p>
                  <p className={cn("font-black text-xl tracking-tight", isExpired ? "text-red-600" : "text-amber-600")}>
                    {b.vencimiento}
                  </p>
                </div>

                {/* Stock quantity */}
                <div className="text-right px-4 py-2 bg-white/60 rounded-2xl border border-white shrink-0 min-w-[120px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Stock en Lote</p>
                  <p className="font-black text-slate-800 text-xl leading-none">{b.quantity} <span className="text-xs font-bold text-slate-400">u.</span></p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-20 text-center bg-white rounded-[2.5rem] border-4 border-white shadow-md">
            <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package size={32} />
            </div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
              No hay lotes que coincidan con este filtro
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
