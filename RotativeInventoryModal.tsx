import React, { useState, useMemo, useEffect } from 'react';
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
  ClipboardCheck,
  Trash2,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { downloadCSV } from '../lib/exportHelpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { 
  getLocalRotativeVerifications, 
  saveLocalRotativeVerification, 
  clearAllRotativeVerifications,
  RotativeVerificationItem 
} from '../lib/storage';

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
  const [verifications, setVerifications] = useState<Record<string, RotativeVerificationItem>>(() => getLocalRotativeVerifications());
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  // Sync state if storage changes elsewhere
  useEffect(() => {
    const loaded = getLocalRotativeVerifications();
    setVerifications(loaded);
  }, []);

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

  // Helper to get medicines for any group index
  const getGroupMedicines = (groupIndex: number) => {
    const start = groupIndex * batchSize;
    const end = start + batchSize;
    return sortedMedicines.slice(start, end);
  };

  // Medicines for today's active batch
  const dailyMedicines = useMemo(() => {
    return getGroupMedicines(activeGroupIndex);
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

  // Counts of verification
  const dailyVerifiedCount = useMemo(() => {
    return dailyMedicines.filter(m => verifications[m.id]?.verified).length;
  }, [dailyMedicines, verifications]);

  const totalVerifiedCount = useMemo(() => {
    return sortedMedicines.filter(m => verifications[m.id]?.verified).length;
  }, [sortedMedicines, verifications]);

  // Toggle single item verification with persistent storage
  const toggleVerified = (medicine: Medicine) => {
    const currentItem = verifications[medicine.id];
    const newVerified = !currentItem?.verified;

    const updated = saveLocalRotativeVerification(medicine.id, newVerified, {
      stockCounted: medicine.stockActual
    });
    setVerifications({ ...updated });
  };

  // Reset entire cycle with confirmation
  const handleResetAll = () => {
    clearAllRotativeVerifications();
    setVerifications({});
    setShowResetConfirm(false);
  };

  // Formatter for verification date/time
  const formatVerifiedTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const today = new Date();
      const isSameDay = d.toDateString() === today.toDateString();
      if (isSameDay) {
        return `Hoy ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    } catch {
      return '';
    }
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
      "Fecha Verificación"
    ];

    const rows = dailyMedicines.map((m, idx) => {
      const v = verifications[m.id];
      const isV = !!v?.verified;
      return [
        idx + 1,
        m.ubicacion || 'Sin asignar',
        m.droga,
        m.nombreComercial,
        m.presentacion || '-',
        m.stockActual,
        isV ? m.stockActual : '',
        '',
        isV ? 'VERIFICADO OK' : 'PENDIENTE',
        isV && v?.verifiedAt ? new Date(v.verifiedAt).toLocaleString() : ''
      ];
    });

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

    const tableData = dailyMedicines.map((m, idx) => {
      const isV = !!verifications[m.id]?.verified;
      return [
        (idx + 1).toString(),
        m.ubicacion || '-',
        m.droga,
        m.nombreComercial,
        m.stockActual.toString(),
        isV ? m.stockActual.toString() : "[   ]",
        isV ? "0" : "[   ]",
        isV ? 'VERIFICADO' : 'PENDIENTE'
      ];
    });

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
        7: { cellWidth: 22, halign: 'center' }
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
              <CalendarDays size={14} /> Control Cíclico Semanal Persistente (15 - 20 Medicamentos / Día)
            </span>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
              Seleccione la Jornada de Auditoría
            </h3>
          </div>

          <div className="flex items-center gap-3">
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

            {/* Total verified badge & Reset */}
            {totalVerifiedCount > 0 && (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-2 rounded-2xl text-[11px] font-black transition-all active:scale-95 shadow-sm"
                title="Reiniciar marcas para comenzar un nuevo ciclo semanal completo"
              >
                <RotateCcw size={13} />
                Reiniciar Ciclo
              </button>
            )}
          </div>
        </div>

        {/* Reset Confirmation Alert */}
        {showResetConfirm && (
          <div className="bg-rose-100/80 border-2 border-rose-300 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-rose-950">
            <div className="flex items-center gap-2.5">
              <AlertCircle size={20} className="text-rose-600 shrink-0" />
              <p className="text-xs font-bold">
                ¿Desea reiniciar el ciclo y desmarcar todos los {totalVerifiedCount} medicamentos verificados para comenzar la nueva semana?
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResetAll}
                className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-xl font-black text-xs shadow-sm transition-all"
              >
                Sí, Reiniciar Todo
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="bg-white hover:bg-rose-50 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-xs shadow-sm transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Days Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
          {DAYS_OF_WEEK.map((day) => {
            const isToday = currentDayIndex === day.index;
            const isSelected = selectedDayIndex === day.index;

            // Calculate verified count for this specific day
            const dayMeds = getGroupMedicines(day.index % totalGroups);
            const dayDone = dayMeds.filter(m => verifications[m.id]?.verified).length;
            const isDayComplete = dayDone === dayMeds.length && dayMeds.length > 0;

            return (
              <button
                key={day.id}
                onClick={() => setSelectedDayIndex(day.index)}
                className={cn(
                  "py-3.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center transition-all relative",
                  isSelected 
                    ? "bg-orange-600 text-white shadow-lg shadow-orange-100 scale-102" 
                    : isDayComplete
                      ? "bg-emerald-50 text-emerald-800 border-2 border-emerald-300 hover:bg-emerald-100"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span>{day.label}</span>
                  {isDayComplete && (
                    <CheckCircle2 size={13} className={isSelected ? "text-emerald-200" : "text-emerald-600"} />
                  )}
                </div>

                <div className="flex items-center gap-1 mt-0.5">
                  <span className={cn(
                    "text-[9px] font-bold tracking-tight",
                    isSelected ? "text-orange-200" : "text-slate-400"
                  )}>
                    Grupo #{day.index + 1}
                  </span>
                  <span className={cn(
                    "text-[9px] font-black px-1.5 py-0.2 rounded-md",
                    isSelected 
                      ? "bg-orange-700/60 text-white" 
                      : dayDone > 0 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-slate-100 text-slate-400"
                  )}>
                    {dayDone}/{dayMeds.length}
                  </span>
                </div>

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
            "p-3 rounded-2xl flex items-center justify-center transition-all",
            dailyVerifiedCount === dailyMedicines.length && dailyMedicines.length > 0 
              ? "bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50" 
              : dailyVerifiedCount > 0
                ? "bg-orange-100 text-orange-600"
                : "bg-slate-100 text-slate-400"
          )}>
            <ClipboardCheck size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-black text-slate-800 text-base">
                Progreso del Día: {dailyVerifiedCount} de {dailyMedicines.length} revisados
              </h4>
              {dailyVerifiedCount === dailyMedicines.length && dailyMedicines.length > 0 && (
                <span className="bg-emerald-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-md shadow-sm flex items-center gap-1">
                  <CheckCircle2 size={11} /> ¡Jornada Completa!
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-medium flex items-center gap-2">
              <span>Total catálogo: {medicines.length} medicamentos en {totalGroups} ciclos.</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="font-bold text-slate-600">Total ciclo verificado: {totalVerifiedCount}/{medicines.length}</span>
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
            const verificationItem = verifications[m.id];
            const isVerified = !!verificationItem?.verified;

            return (
              <div
                key={m.id}
                className={cn(
                  "p-6 rounded-[2.5rem] border-4 border-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all",
                  isVerified ? "bg-emerald-50/70 ring-2 ring-emerald-300 shadow-emerald-100/50" : "bg-white hover:shadow-lg"
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
                      {isVerified && (
                        <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-xs">
                          <ShieldCheck size={11} /> Guardado
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
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => toggleVerified(m)}
                      className={cn(
                        "px-4 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all active:scale-95 shadow-sm",
                        isVerified
                          ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400"
                          : "bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 border border-slate-200"
                      )}
                    >
                      <CheckCircle2 size={16} className={isVerified ? "text-white" : "text-slate-400"} />
                      {isVerified ? 'Verificado OK' : 'Confirmar Stock OK'}
                    </button>
                    {isVerified && verificationItem?.verifiedAt && (
                      <span className="text-[9px] font-bold text-emerald-700 flex items-center gap-1 mr-1">
                        <Clock size={10} /> {formatVerifiedTime(verificationItem.verifiedAt)}
                      </span>
                    )}
                  </div>

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
