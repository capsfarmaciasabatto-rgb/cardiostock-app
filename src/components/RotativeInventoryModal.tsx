import React, { useState, useMemo } from 'react';
import { Medicine } from '../types';
import { 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw, 
  Download, 
  FileText, 
  MapPin, 
  CalendarDays, 
  Search, 
  SlidersHorizontal,
  ArrowRight,
  Sparkles,
  ClipboardCheck
} from 'lucide-react';
import { downloadCSV } from '../lib/exportHelpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

interface RotativeInventoryModalProps {
  medicines: Medicine[];
  onOpenMovement: (medicine: Medicine) => void;
  isAdmin: boolean;
}

const DAYS_OF_WEEK = [
  { id: 'lunes', label: 'Lunes', index: 0 },
  { id: 'martes', label: 'Martes', index: 1 },
  { id: 'miercoles', label: 'Miércoles', index: 2 },
  { id: 'jueves', label: 'Jueves', index: 3 },
  { id: 'viernes', label: 'Viernes', index: 4 }
];

export function RotativeInventoryModal({ medicines, onOpenMovement, isAdmin }: RotativeInventoryModalProps) {
  // Determine current day of week (0: Monday ... 4: Friday)
  const currentDayIndex = useMemo(() => {
    const day = new Date().getDay(); // 0: Sunday, 1: Mon, 2: Tue, 3: Wed, 4: Thu, 5: Fri, 6: Sat
    if (day >= 1 && day <= 5) return day - 1;
    return 0; // Default to Monday on weekends
  }, []);

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(currentDayIndex);
  const [batchSize, setBatchSize] = useState<number>(18); // 15 to 20
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Sort medicines alphabetically by location or drug name for clean sequential rotation
  const sortedMedicines = useMemo(() => {
    return [...medicines].sort((a, b) => {
      // First by location if available, then by droga
      if (a.ubicacion && b.ubicacion && a.ubicacion !== b.ubicacion) {
        return a.ubicacion.localeCompare(b.ubicacion);
      }
      return a.droga.localeCompare(b.droga);
    });
  }, [medicines]);

  // Total groups calculation
  const totalGroups = useMemo(() => {
    return Math.max(1, Math.ceil(sortedMedicines.length / batchSize));
  }, [sortedMedicines.length, batchSize]);

  // Active group index mapped to 5 days cycle or custom pagination
  const activeGroupIndex = useMemo(() => {
    return selectedDayIndex % totalGroups;
  }, [selectedDayIndex, totalGroups]);

  // Medicines for today's batch
  const dailyMedicines = useMemo(() => {
    const start = activeGroupIndex * batchSize;
    const end = start + batchSize;
    return sortedMedicines.slice(start, end);
  }, [sortedMedicines, activeGroupIndex, batchSize]);

  // Filter within daily batch if searched
  const filteredDailyMedicines = useMemo(() => {
    if (!searchFilter.trim()) return dailyMedicines;
    const term = searchFilter.toLowerCase();
    return dailyMedicines.filter(m => 
      m.droga.toLowerCase().includes(term) ||
      m.nombreComercial.toLowerCase().includes(term) ||
      (m.ubicacion && m.ubicacion.toLowerCase().includes(term))
    );
  }, [dailyMedicines, searchFilter]);

  const verifiedCount = useMemo(() => {
    return dailyMedicines.filter(m => verifiedMap[m.id]).length;
  }, [dailyMedicines, verifiedMap]);

  const toggleVerified = (medicineId: string) => {
    setVerifiedMap(prev => ({
      ...prev,
      [medicineId]: !prev[medicineId]
    }));
  };

  const handleExportDailyCSV = () => {
    if (dailyMedicines.length === 0) return;

    const dayName = DAYS_OF_WEEK[selectedDayIndex]?.label || `Grupo ${activeGroupIndex + 1}`;
    const headers = [
      "N°",
      "Ubicación / Estante",
      "Droga / Principio Activo",
      "Nombre Comercial",
      "Presentación",
      "Stock Teórico (Sistema)",
      "Conteo Físico Real",
      "Diferencia",
      "Estado de Control",
      "Observaciones"
    ];

    const rows = dailyMedicines.map((m, idx) => [
      idx + 1,
      m.ubicacion || 'Sin asignar',
      m.droga,
      m.nombreComercial,
      m.presentacion || '-',
      m.stockActual,
      verifiedMap[m.id] ? m.stockActual : '', // If verified, standard stock
      '', // Blank for physical writing on sheet
      verifiedMap[m.id] ? 'VERIFICADO' : 'PENDIENTE',
      notesMap[m.id] || ''
    ]);

    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`inventario_rotativo_${dayName}_${dateStr}`, headers, rows);
  };

  const handleExportDailyPDF = () => {
    if (dailyMedicines.length === 0) return;

    const doc = new jsPDF();
    const dayName = DAYS_OF_WEEK[selectedDayIndex]?.label || `Grupo ${activeGroupIndex + 1}`;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text("Farmacia Sabatto - Planilla de Inventario Rotativo", 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Jornada: ${dayName} (Lote de ${dailyMedicines.length} ítems) | Fecha: ${new Date().toLocaleDateString()}`, 14, 25);
    doc.text(`Responsable del Recuento: ___________________________`, 14, 31);

    const tableData = dailyMedicines.map((m, idx) => [
      (idx + 1).toString(),
      m.ubicacion || '-',
      m.droga,
      m.nombreComercial,
      m.stockActual.toString(),
      "[   ]", // Box to write physical stock
      "[   ]", // Box to write difference
      verifiedMap[m.id] ? 'OK' : 'PND'
    ]);

    autoTable(doc, {
      startY: 37,
      head: [["#", "Ubicación", "Droga / Principio", "Marca", "Stock Sist.", "Físico", "Dif.", "Estado"]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [234, 88, 12], fontStyle: 'bold', textColor: [255, 255, 255] },
      styles: { fontSize: 8.5, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 55 },
        3: { cellWidth: 35 },
        4: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 18, halign: 'center' },
        6: { cellWidth: 16, halign: 'center' },
        7: { cellWidth: 16, halign: 'center' }
      }
    });

    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`planilla_rotativo_${dayName}_${dateStr}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Top Days Bar (Lunes a Viernes) */}
      <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-white shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 flex items-center gap-1.5 mb-1">
              <CalendarDays size={14} /> Control Cíclico Semanal (15 - 20 Medicamentos / Día)
            </span>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
              Seleccione la Jornada de Auditoría
            </h3>
          </div>

          {/* Batch size selector */}
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
            <SlidersHorizontal size={14} className="text-slate-400" />
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Ítems/día:</span>
            <select
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value))}
              className="bg-transparent border-none text-xs font-black text-orange-600 focus:ring-0 cursor-pointer"
            >
              <option value={15}>15 medicamentos</option>
              <option value={18}>18 medicamentos (Recomendado)</option>
              <option value={20}>20 medicamentos</option>
              <option value={25}>25 medicamentos</option>
            </select>
          </div>
        </div>

        {/* Days Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
          {DAYS_OF_WEEK.map((day) => {
            const isToday = currentDayIndex === day.index;
            const isSelected = selectedDayIndex === day.index;

            return (
              <button
                key={day.id}
                onClick={() => setSelectedDayIndex(day.index)}
                className={cn(
                  "py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center transition-all relative",
                  isSelected 
                    ? "bg-orange-600 text-white shadow-lg shadow-orange-100 scale-102" 
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
                )}
              >
                <span>{day.label}</span>
                <span className={cn(
                  "text-[9px] font-bold tracking-tight mt-0.5",
                  isSelected ? "text-orange-200" : "text-slate-400"
                )}>
                  Grupo #{day.index + 1}
                </span>
                {isToday && (
                  <span className="absolute -top-1.5 -right-1 bg-slate-900 text-white text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm">
                    Hoy
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Progress & Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border-2 border-white shadow-md ring-1 ring-slate-100">
        <div className="flex items-center gap-4">
          <div className={cn(
            "p-3 rounded-2xl flex items-center justify-center",
            verifiedCount === dailyMedicines.length && dailyMedicines.length > 0 
              ? "bg-emerald-100 text-emerald-600" 
              : "bg-orange-100 text-orange-600"
          )}>
            <ClipboardCheck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-black text-slate-800 text-base">
                Progreso del Día: {verifiedCount} de {dailyMedicines.length} revisados
              </h4>
              {verifiedCount === dailyMedicines.length && dailyMedicines.length > 0 && (
                <span className="bg-emerald-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-md shadow-sm">
                  ¡Completo!
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Total catálogo: {medicines.length} medicamentos repartidos en {totalGroups} ciclos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <button
            onClick={handleExportDailyCSV}
            className="bg-white hover:bg-orange-50 text-slate-700 border-2 border-slate-200 hover:border-orange-200 px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all active:scale-95 shadow-sm"
            title="Descargar para abrir en Excel o Google Sheets"
          >
            <Download size={15} className="text-orange-500" />
            Descargar Excel / CSV
          </button>
          <button
            onClick={handleExportDailyPDF}
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all active:scale-95 shadow-md"
            title="Imprimir planilla para recuento en estantería"
          >
            <FileText size={15} className="text-orange-400" />
            Imprimir Planilla PDF
          </button>
        </div>
      </div>

      {/* Internal search filter */}
      <div className="bg-white p-3.5 rounded-[2rem] border-2 border-white shadow-sm ring-1 ring-slate-100 flex items-center gap-3">
        <Search size={18} className="text-slate-400 ml-3" />
        <input
          type="text"
          placeholder="Filtrar por droga o ubicación en este grupo..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="flex-1 bg-transparent border-none text-xs font-bold placeholder:text-slate-300 focus:ring-0"
        />
        {searchFilter && (
          <button 
            onClick={() => setSearchFilter('')}
            className="text-[10px] font-black text-slate-400 hover:text-slate-600 mr-2 uppercase"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Daily Medicines Table / Cards */}
      <div className="space-y-3">
        {filteredDailyMedicines.length > 0 ? (
          filteredDailyMedicines.map((m, idx) => {
            const isVerified = !!verifiedMap[m.id];

            return (
              <div
                key={m.id}
                className={cn(
                  "p-6 rounded-[2.5rem] border-4 border-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all",
                  isVerified ? "bg-emerald-50/50 ring-2 ring-emerald-200" : "bg-white hover:shadow-lg"
                )}
              >
                {/* Left info */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex flex-col items-center justify-center w-8 text-slate-400 font-black text-xs">
                    #{idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-black text-slate-800 uppercase leading-tight truncate">
                        {m.droga}
                      </p>
                      {m.ubicacion && (
                        <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-[10px] font-black px-2 py-0.5 rounded-lg">
                          <MapPin size={11} /> {m.ubicacion}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-slate-400 italic mb-1">
                      {m.nombreComercial} {m.presentacion ? `• ${m.presentacion}` : ''}
                    </p>
                    {m.observaciones && (
                      <p className="text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded inline-block">
                        Obs: {m.observaciones}
                      </p>
                    )}
                  </div>
                </div>

                {/* Stock info */}
                <div className="flex items-center justify-between md:justify-center gap-6 px-4 py-2 bg-slate-50 rounded-2xl">
                  <div className="text-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Stock Sistema</p>
                    <p className={cn(
                      "text-xl font-black",
                      m.stockActual <= (m.minStock || 0) ? "text-red-500" : "text-slate-800"
                    )}>
                      {m.stockActual}
                    </p>
                  </div>
                </div>

                {/* Actions & Verification */}
                <div className="flex items-center gap-3 justify-end shrink-0">
                  {/* Mark as Verified Button */}
                  <button
                    onClick={() => toggleVerified(m.id)}
                    className={cn(
                      "px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all active:scale-95 shadow-sm",
                      isVerified
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600"
                    )}
                  >
                    <CheckCircle2 size={16} />
                    {isVerified ? 'Verificado OK' : 'Confirmar Stock OK'}
                  </button>

                  {/* Adjust Difference button */}
                  {isAdmin && (
                    <button
                      onClick={() => onOpenMovement(m)}
                      className="bg-white hover:bg-orange-50 text-orange-600 border border-orange-200 hover:border-orange-300 px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                      title="Registrar ajuste si el conteo físico difiere"
                    >
                      <RotateCcw size={14} />
                      Ajustar Diferencia
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-[2.5rem] p-12 text-center border-4 border-white shadow-md">
            <p className="text-slate-400 font-bold uppercase text-xs">No hay medicamentos asignados a este filtro</p>
          </div>
        )}
      </div>
    </div>
  );
}
