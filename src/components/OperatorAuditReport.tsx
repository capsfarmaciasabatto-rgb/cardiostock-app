import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getLocalMovements, DEFAULT_CAPS_OPERATORS } from '../lib/storage';
import { Medicine } from '../types';
import { 
  UserCheck, 
  Calendar, 
  Filter, 
  Download, 
  FileText, 
  Printer, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  SlidersHorizontal, 
  Package, 
  ShieldAlert, 
  User, 
  Activity,
  CheckCircle2,
  Clock,
  Sparkles,
  Users
} from 'lucide-react';
import { downloadCSV } from '../lib/exportHelpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

interface OperatorAuditReportProps {
  medicines: Medicine[];
  onClose?: () => void;
}

type DateRangeFilter = 'today' | '7days' | '30days' | 'thisMonth' | '90days' | 'all';
type MovementTypeFilter = 'all' | 'ingreso' | 'dispensa' | 'ajuste';

// Función auxiliar para normalizar nombres y correos de operadores del CAPS
function resolveOperator(m: any, userMap: Map<string, any>): { name: string; email: string; shortName: string } {
  const rawEmail = (m.user_email || m.userEmail || '').trim().toLowerCase();
  const rawName = (m.user_name || m.userName || '').trim();
  const rawId = (m.user_id || m.userId || '').trim();

  // 1. Buscar en mapa de usuarios de Supabase
  let email = rawEmail;
  let name = rawName;

  if (rawId && userMap.has(rawId)) {
    const u = userMap.get(rawId);
    if (!name || name === 'Personal Farmacia' || name === 'anon@caps.local' || name.includes('@')) {
      name = u.displayName || u.display_name || u.email;
    }
    if (!email) email = (u.email || '').toLowerCase();
  }

  if (email && userMap.has(email)) {
    const u = userMap.get(email);
    if (!name || name === 'Personal Farmacia' || name === 'anon@caps.local' || name.includes('@')) {
      name = u.displayName || u.display_name || u.email;
    }
  }

  const combined = `${name} ${email} ${rawId}`.toLowerCase();

  // 2. Detección inteligente por palabras clave para Caro, Gloria y el equipo de CAPS Sabatto
  if (combined.includes('caro') || combined.includes('carolina')) {
    return {
      name: name && !name.includes('@') ? name : 'Téc. Carolina (Caro)',
      email: email || 'caro.farmacia@caps.gob.ar',
      shortName: 'Caro'
    };
  }

  if (combined.includes('gloria')) {
    return {
      name: name && !name.includes('@') ? name : 'Téc. Gloria',
      email: email || 'gloria.farmacia@caps.gob.ar',
      shortName: 'Gloria'
    };
  }

  if (combined.includes('sabatto') || combined.includes('capsfarmaciasabatto') || combined.includes('admin')) {
    return {
      name: 'Farm. Sabatto (Administrador)',
      email: 'capsfarmaciasabatto@gmail.com',
      shortName: 'Sabatto'
    };
  }

  if (combined.includes('laura')) {
    return {
      name: 'Téc. Laura Méndez',
      email: email || 'laura.mendez@caps.gob.ar',
      shortName: 'Laura'
    };
  }

  if (combined.includes('carlos')) {
    return {
      name: 'Téc. Carlos Benítez',
      email: email || 'carlos.benitez@caps.gob.ar',
      shortName: 'Carlos'
    };
  }

  if (combined.includes('rossi') || combined.includes('alejandro')) {
    return {
      name: 'Dr. Alejandro Rossi',
      email: email || 'arossi@caps.gob.ar',
      shortName: 'Dr. Rossi'
    };
  }

  return {
    name: name || email || 'Personal de Farmacia',
    email: email || 'personal@caps.local',
    shortName: name ? name.split(' ')[0] : 'Operador'
  };
}

export function OperatorAuditReport({ medicines, onClose }: OperatorAuditReportProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOperator, setSelectedOperator] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('all');
  const [movementType, setMovementType] = useState<MovementTypeFilter>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      let usersList: any[] = [];
      let movementsList: any[] = [];

      // 1. Intentar cargar usuarios registrados de Supabase
      try {
        const { data: uData } = await supabase.from('users').select('*');
        if (uData && uData.length > 0) {
          usersList = uData;
          setDbUsers(uData);
        }
      } catch (uErr) {
        console.warn('No se pudieron consultar usuarios en Supabase:', uErr);
      }

      // Mapa rápido de usuarios
      const userMap = new Map<string, any>();
      usersList.forEach(u => {
        if (u.id) userMap.set(u.id, u);
        if (u.email) userMap.set(u.email.toLowerCase(), u);
      });

      // 2. Intentar cargar movimientos de Supabase
      try {
        const { data: mData, error: mError } = await supabase
          .from('movements')
          .select(`
            *,
            medicines (
              droga,
              nombre_comercial,
              presentacion,
              familia,
              ubicacion
            )
          `)
          .order('created_at', { ascending: false });

        if (!mError && mData && mData.length > 0) {
          movementsList = mData;
        }
      } catch (mErr) {
        console.warn('Error cargando movimientos de Supabase:', mErr);
      }

      // 3. Si no hay movimientos en Supabase o son pocos, fusionar / cargar de localStorage
      const local = getLocalMovements();
      if (movementsList.length === 0) {
        movementsList = local;
      } else {
        // En caso de que falten movimientos locales no sincronizados
        const existingIds = new Set(movementsList.map(m => m.id));
        local.forEach(loc => {
          if (!existingIds.has(loc.id)) {
            movementsList.push(loc);
          }
        });
      }

      // Normalizar operadores en todos los movimientos
      const normalized = movementsList.map(m => {
        const op = resolveOperator(m, userMap);
        return {
          ...m,
          user_name: op.name,
          user_email: op.email,
          user_short: op.shortName
        };
      });

      setMovements(normalized);
      setLoading(false);
    };

    fetchData();
  }, []);

  // Quick medicine map for resolving names
  const medicineMap = useMemo(() => {
    const map = new Map<string, Medicine>();
    medicines.forEach(m => map.set(m.id, m));
    return map;
  }, [medicines]);

  // Lista consolidada de operadores garantizando presencia de Caro, Gloria y equipo
  const operatorList = useMemo(() => {
    const ops = new Map<string, { name: string; email: string; shortName: string }>();

    // 1. Añadir los operadores base del CAPS
    DEFAULT_CAPS_OPERATORS.forEach(op => {
      ops.set(op.email.toLowerCase(), { name: op.name, email: op.email.toLowerCase(), shortName: op.shortName });
    });

    // 2. Añadir usuarios de la base de datos
    dbUsers.forEach(u => {
      if (u.email) {
        const e = u.email.toLowerCase();
        const n = u.display_name || u.displayName || u.email;
        if (!ops.has(e)) {
          ops.set(e, { name: n, email: e, shortName: n.split(' ')[0] });
        }
      }
    });

    // 3. Añadir cualquier otro operador detectado en movimientos
    movements.forEach(m => {
      const email = (m.user_email || 'anon@caps.local').toLowerCase();
      const name = m.user_name || email;
      const shortName = m.user_short || name.split(' ')[0];
      if (!ops.has(email)) {
        ops.set(email, { name, email, shortName });
      }
    });

    return Array.from(ops.values());
  }, [movements, dbUsers]);

  // Filtrado de movimientos
  const filteredMovements = useMemo(() => {
    const now = new Date();
    return movements.filter(m => {
      // 1. Filtro de operador
      if (selectedOperator !== 'all') {
        const email = (m.user_email || '').toLowerCase();
        const name = (m.user_name || '').toLowerCase();
        const sel = selectedOperator.toLowerCase();

        const matches = email === sel || name === sel || email.includes(sel) || (sel.includes('caro') && (name.includes('caro') || email.includes('caro'))) || (sel.includes('gloria') && (name.includes('gloria') || email.includes('gloria')));
        if (!matches) return false;
      }

      // 2. Filtro de tipo de movimiento
      if (movementType === 'ingreso') {
        if (m.type !== 'ingreso' || m.is_adjustment) return false;
      } else if (movementType === 'dispensa') {
        if (m.type !== 'dispensa' || m.is_adjustment) return false;
      } else if (movementType === 'ajuste') {
        if (!m.is_adjustment) return false;
      }

      // 3. Filtro de rango de fecha
      if (m.created_at && dateRange !== 'all') {
        const d = new Date(m.created_at);
        if (dateRange === 'today') {
          const isToday = d.toDateString() === now.toDateString();
          if (!isToday) return false;
        } else if (dateRange === '7days') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          if (d < sevenDaysAgo) return false;
        } else if (dateRange === '30days') {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(now.getDate() - 30);
          if (d < thirtyDaysAgo) return false;
        } else if (dateRange === 'thisMonth') {
          const isThisMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
          if (!isThisMonth) return false;
        } else if (dateRange === '90days') {
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(now.getDate() - 90);
          if (d < ninetyDaysAgo) return false;
        }
      }

      // 4. Búsqueda de texto
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const medName = (m.medicines?.droga || m.medicine_name || medicineMap.get(m.medicine_id)?.droga || '').toLowerCase();
        const medComercial = (m.medicines?.nombre_comercial || medicineMap.get(m.medicine_id)?.nombreComercial || '').toLowerCase();
        const reason = (m.reason || '').toLowerCase();
        const just = (m.justification || '').toLowerCase();
        const opName = (m.user_name || '').toLowerCase();
        const opEmail = (m.user_email || '').toLowerCase();

        const match = medName.includes(term) || medComercial.includes(term) || reason.includes(term) || just.includes(term) || opName.includes(term) || opEmail.includes(term);
        if (!match) return false;
      }

      return true;
    });
  }, [movements, selectedOperator, dateRange, movementType, searchTerm, medicineMap]);

  // Estadísticas globales del filtro activo
  const stats = useMemo(() => {
    let totalOps = filteredMovements.length;
    let dispensedUnits = 0;
    let receivedUnits = 0;
    let adjustmentCount = 0;
    const opCountMap = new Map<string, number>();

    filteredMovements.forEach(m => {
      const qty = Number(m.quantity) || 0;
      if (m.is_adjustment) {
        adjustmentCount++;
      } else if (m.type === 'dispensa') {
        dispensedUnits += qty;
      } else if (m.type === 'ingreso') {
        receivedUnits += qty;
      }

      const opKey = m.user_name || m.user_email || 'Sin operador';
      opCountMap.set(opKey, (opCountMap.get(opKey) || 0) + 1);
    });

    let topOperator = '-';
    let topOpCount = 0;
    opCountMap.forEach((count, op) => {
      if (count > topOpCount) {
        topOpCount = count;
        topOperator = op;
      }
    });

    return {
      totalOps,
      dispensedUnits,
      receivedUnits,
      adjustmentCount,
      topOperator,
      topOpCount
    };
  }, [filteredMovements]);

  // Desglose por operador (calculado sobre los movimientos filtrados por fecha y tipo)
  const operatorBreakdown = useMemo(() => {
    const map = new Map<string, {
      name: string;
      email: string;
      totalOps: number;
      dispensas: number;
      ingresos: number;
      ajustes: number;
      totalUnits: number;
    }>();

    // Inicializar con todos los operadores conocidos para que nadie falte
    operatorList.forEach(op => {
      map.set(op.email, {
        name: op.name,
        email: op.email,
        totalOps: 0,
        dispensas: 0,
        ingresos: 0,
        ajustes: 0,
        totalUnits: 0
      });
    });

    // Sumarizar según los movimientos filtrados
    filteredMovements.forEach(m => {
      const email = (m.user_email || 'anon@caps.local').toLowerCase();
      const name = m.user_name || email;
      const qty = Number(m.quantity) || 0;

      if (!map.has(email)) {
        map.set(email, {
          name,
          email,
          totalOps: 0,
          dispensas: 0,
          ingresos: 0,
          ajustes: 0,
          totalUnits: 0
        });
      }

      const entry = map.get(email)!;
      entry.totalOps += 1;
      entry.totalUnits += qty;

      if (m.is_adjustment) {
        entry.ajustes += 1;
      } else if (m.type === 'dispensa') {
        entry.dispensas += 1;
      } else if (m.type === 'ingreso') {
        entry.ingresos += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalOps - a.totalOps);
  }, [filteredMovements, operatorList]);

  // Exportar a CSV
  const handleExportCSV = () => {
    const headers = [
      'Fecha y Hora',
      'Operador / Técnico',
      'Email Operador',
      'Tipo de Operación',
      'Medicamento (Droga)',
      'Nombre Comercial',
      'Ubicación',
      'Cantidad',
      'Motivo',
      'Es Ajuste',
      'Justificación'
    ];

    const rows = filteredMovements.map(m => {
      const med = m.medicines || medicineMap.get(m.medicine_id);
      const dateStr = m.created_at ? new Date(m.created_at).toLocaleString('es-AR') : '-';
      const typeLabel = m.is_adjustment ? 'Ajuste Manual' : (m.type === 'ingreso' ? 'Ingreso Muestras' : 'Dispensa Paciente');

      return [
        dateStr,
        m.user_name || 'Personal Farmacia',
        m.user_email || '-',
        typeLabel,
        med?.droga || m.medicine_name || 'N/A',
        med?.nombreComercial || med?.nombre_comercial || '-',
        med?.ubicacion || '-',
        m.quantity,
        m.reason || '-',
        m.is_adjustment ? 'SÍ' : 'NO',
        m.justification || '-'
      ];
    });

    downloadCSV(`auditoria_operadores_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  // Exportar a PDF
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text("Farmacia Sabatto - CAPS", 14, 18);
    
    doc.setFontSize(12);
    doc.setTextColor(234, 88, 12);
    doc.text("Auditoría de Movimientos por Operador / Técnico", 14, 26);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Fecha de emisión: ${new Date().toLocaleString('es-AR')}`, 14, 33);
    doc.text(`Filtro operador: ${selectedOperator === 'all' ? 'Todos' : selectedOperator} | Período: ${dateRange} | Total Registros: ${filteredMovements.length}`, 14, 38);

    const tableData = filteredMovements.slice(0, 80).map(m => {
      const med = m.medicines || medicineMap.get(m.medicine_id);
      const dateStr = m.created_at ? new Date(m.created_at).toLocaleDateString('es-AR') + ' ' + new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-';
      const typeLabel = m.is_adjustment ? 'Ajuste' : (m.type === 'ingreso' ? '+ Ingreso' : '- Dispensa');
      const medName = (med?.droga || m.medicine_name || 'N/A') + (med?.ubicacion ? ` (${med.ubicacion})` : '');

      return [
        dateStr,
        m.user_name || m.user_email || 'Personal',
        typeLabel,
        medName,
        m.quantity?.toString() || '0',
        m.justification || m.reason || '-'
      ];
    });

    autoTable(doc, {
      startY: 44,
      head: [["Fecha/Hora", "Operador", "Tipo", "Medicamento", "Cant.", "Motivo / Justificación"]],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2 }
    });

    doc.save(`auditoria_operadores_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-8">
      {/* HEADER Y ACCIONES */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-sm">
              <UserCheck size={26} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                Auditoría por Operador / Técnico
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Trazabilidad completa de ingresos, dispensas y ajustes manuales por usuario responsable
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportCSV}
            className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-3 rounded-2xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm active:scale-95"
            title="Exportar a Excel / CSV"
          >
            <Download size={16} className="text-emerald-600" />
            Excel / CSV
          </button>

          <button
            onClick={handleExportPDF}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
          >
            <FileText size={16} className="text-orange-400" />
            Descargar PDF Oficial
          </button>
        </div>
      </div>

      {/* TARJETAS DE MÉTRICAS CLAVE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Total Operaciones</span>
            <Activity size={20} className="text-slate-400" />
          </div>
          <p className="text-3xl font-black text-slate-900">{stats.totalOps}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Registros en el período seleccionado</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-slate-900 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-emerald-600 uppercase tracking-widest">Unidades Ingresadas</span>
            <ArrowDownRight size={20} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-emerald-600">+{stats.receivedUnits}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Muestras médicas recibidas</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-emerald-500 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest">Unidades Dispensadas</span>
            <ArrowUpRight size={20} className="text-blue-500" />
          </div>
          <p className="text-3xl font-black text-blue-600">-{stats.dispensedUnits}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Entregadas a pacientes</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-blue-500 rounded-bl-full" />
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black text-amber-600 uppercase tracking-widest">Ajustes Manuales</span>
            <ShieldAlert size={20} className="text-amber-500" />
          </div>
          <p className="text-3xl font-black text-amber-600">{stats.adjustmentCount}</p>
          <p className="text-xs text-slate-500 mt-1 font-medium">Correcciones con justificación</p>
          <div className="absolute top-0 right-0 h-1.5 w-16 bg-amber-500 rounded-bl-full" />
        </div>
      </div>

      {/* FILTROS INTERACTIVOS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Filter size={16} className="text-orange-500" />
            Filtros de Trazabilidad
          </span>
          <span className="text-xs text-slate-400 font-bold">
            Mostrando <strong className="text-slate-800">{filteredMovements.length}</strong> movimientos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Operador */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Operador / Técnico</label>
            <select
              value={selectedOperator}
              onChange={e => setSelectedOperator(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="all">👥 Todos los operadores ({operatorList.length})</option>
              {operatorList.map(op => (
                <option key={op.email} value={op.email}>
                  👤 {op.name}
                </option>
              ))}
            </select>
          </div>

          {/* Rango de fecha */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rango de Fecha</label>
            <select
              value={dateRange}
              onChange={e => setDateRange(e.target.value as DateRangeFilter)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="today">📅 Solo Hoy</option>
              <option value="7days">📅 Últimos 7 Días</option>
              <option value="30days">📅 Últimos 30 Días</option>
              <option value="thisMonth">📅 Este Mes</option>
              <option value="90days">📅 Últimos 90 Días</option>
              <option value="all">📅 Todo el Histórico</option>
            </select>
          </div>

          {/* Tipo de movimiento */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de Acción</label>
            <select
              value={movementType}
              onChange={e => setMovementType(e.target.value as MovementTypeFilter)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-black text-slate-700 focus:ring-2 focus:ring-orange-500 outline-none"
            >
              <option value="all">🔄 Todas las acciones</option>
              <option value="dispensa">📤 Solo Dispensas a Pacientes</option>
              <option value="ingreso">📥 Solo Ingresos de Muestras</option>
              <option value="ajuste">⚠️ Solo Ajustes de Inventario</option>
            </select>
          </div>

          {/* Buscador de texto */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Buscar Medicamento / Motivo</label>
            <div className="relative">
              <Search className="absolute left-3.5 top-3.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Droga, marca o justificación..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-orange-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* RESUMEN DE ACTIVIDAD POR OPERADOR */}
      {operatorBreakdown.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <User size={16} className="text-orange-500" />
            Rendimiento y Volumen por Operador
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {operatorBreakdown.map(op => (
              <div 
                key={op.email} 
                onClick={() => setSelectedOperator(op.email === selectedOperator ? 'all' : op.email)}
                className={cn(
                  "p-5 rounded-3xl border transition-all cursor-pointer text-left relative",
                  selectedOperator === op.email 
                    ? "bg-slate-900 text-white border-slate-900 shadow-lg scale-[1.02]" 
                    : "bg-white text-slate-800 border-slate-200 hover:border-orange-300 hover:shadow-md"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={cn(
                    "w-9 h-9 rounded-2xl flex items-center justify-center font-black text-xs",
                    selectedOperator === op.email ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-700"
                  )}>
                    {op.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                    selectedOperator === op.email ? "bg-slate-800 text-orange-400" : "bg-slate-100 text-slate-500"
                  )}>
                    {op.totalOps} ops
                  </span>
                </div>

                <h4 className="font-black text-sm truncate mb-0.5">{op.name}</h4>
                <p className={cn("text-[11px] truncate mb-4 font-medium", selectedOperator === op.email ? "text-slate-400" : "text-slate-400")}>
                  {op.email}
                </p>

                <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-slate-100/20 text-xs">
                  <div>
                    <span className="block text-[9px] font-black uppercase text-blue-500">Dispensas</span>
                    <span className="font-black">{op.dispensas}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-emerald-500">Ingresos</span>
                    <span className="font-black">{op.ingresos}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase text-amber-500">Ajustes</span>
                    <span className="font-black">{op.ajustes}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TABLA DE MOVIMIENTOS DETALLADA */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Clock size={16} className="text-orange-500" />
            Registro Cronológico de Operaciones ({filteredMovements.length})
          </span>
          {selectedOperator !== 'all' && (
            <button 
              onClick={() => setSelectedOperator('all')}
              className="text-[11px] font-black text-orange-600 hover:underline"
            >
              Limpiar filtro de operador
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold text-sm">
            Cargando historial de auditoría...
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-medium">
            <p className="text-base font-bold text-slate-600 mb-1">No se encontraron movimientos</p>
            <p className="text-xs">Pruebe ajustando los filtros de fecha, tipo de operación u operador.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100/75 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-5">Fecha / Hora</th>
                  <th className="py-3.5 px-5">Operador</th>
                  <th className="py-3.5 px-5">Acción</th>
                  <th className="py-3.5 px-5">Medicamento</th>
                  <th className="py-3.5 px-5 text-center">Ubicación</th>
                  <th className="py-3.5 px-5 text-right">Cantidad</th>
                  <th className="py-3.5 px-5">Motivo / Justificación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMovements.map(m => {
                  const med = m.medicines || medicineMap.get(m.medicine_id);
                  const isAdj = m.is_adjustment;
                  const isDisp = m.type === 'dispensa';
                  const dateObj = m.created_at ? new Date(m.created_at) : null;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <span className="font-bold text-slate-800 block">
                          {dateObj ? dateObj.toLocaleDateString('es-AR') : '-'}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {dateObj ? dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-black text-[10px] text-slate-700">
                            {(m.user_name || m.user_email || 'P').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-black text-slate-800 text-xs block">
                              {m.user_name || 'Personal Farmacia'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {m.user_email || '-'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-5 whitespace-nowrap">
                        {isAdj ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">
                            <ShieldAlert size={12} />
                            Ajuste
                          </span>
                        ) : isDisp ? (
                          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">
                            <ArrowUpRight size={12} />
                            Dispensa
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider">
                            <ArrowDownRight size={12} />
                            Ingreso
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-5">
                        <span className="font-black text-slate-900 block text-xs">
                          {med?.droga || m.medicine_name || 'N/A'}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {med?.nombreComercial || med?.nombre_comercial || med?.presentacion || '-'}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-xs">
                          {med?.ubicacion || '-'}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <span className={cn(
                          "font-black text-sm",
                          isAdj ? "text-amber-600" : isDisp ? "text-blue-600" : "text-emerald-600"
                        )}>
                          {isDisp ? `-${m.quantity}` : `+${m.quantity}`}
                        </span>
                      </td>

                      <td className="py-3.5 px-5 text-xs text-slate-600 max-w-xs">
                        <p className="truncate font-medium">{m.justification || m.reason || '-'}</p>
                        {m.justification && m.reason && m.justification !== m.reason && (
                          <p className="text-[10px] text-slate-400 truncate">{m.reason}</p>
                        )}
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
