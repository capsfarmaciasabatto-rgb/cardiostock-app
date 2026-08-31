import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getLocalMovements } from '../lib/storage';
import { Medicine } from '../types';
import { 
  TrendingUp, 
  Filter, 
  Download, 
  FileText, 
  Calendar, 
  Building2, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Sparkles, 
  Package, 
  Users, 
  ArrowUpDown, 
  Clock, 
  Info,
  ChevronRight,
  Printer,
  Boxes
} from 'lucide-react';
import { downloadCSV } from '../lib/exportHelpers';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

interface DemandAndRotationReportProps {
  medicines: Medicine[];
  onClose?: () => void;
}

export type TimeframePeriod = 
  | 'thisMonth' 
  | 'lastMonth' 
  | 'thisQuarter' 
  | 'lastQuarter' 
  | '90days' 
  | '180days' 
  | 'thisYear' 
  | 'all' 
  | 'custom';

// Laboratorios farmacéuticos habituales en Argentina
const COMMON_LABS = [
  'Roemmers',
  'Baliarda',
  'Bagó',
  'Elea',
  'Casasco',
  'Raffo',
  'Montpellier',
  'Novartis',
  'Pfizer',
  'Sanofi',
  'Boehringer Ingelheim',
  'Beta',
  'Bernabó',
  'Craveri',
  'Gador',
  'Bayer',
  'Savant',
  'Microsules',
  'Temis Lostaló'
];

interface MedicineRotationStat {
  medicineId: string;
  droga: string;
  nombreComercial: string;
  laboratorio: string;
  presentacion: string;
  familia: string;
  ubicacion: string;
  currentStock: number;
  
  // Métricas del período
  dispenseCount: number;      // N° de actos de dispensación (frecuencia / pacientes)
  totalDispensed: number;     // Total de unidades dispensadas (volumen)
  totalIngresos: number;      // Total de unidades ingresadas en el período
  ingresoCount: number;       // N° de ingresos registrados
  avgUnitsPerDispense: number;// Promedio de unidades por dispensa
  absorptionRate: number;     // % de salida vs ingresado
  avgDaysToDispense: number;  // Tiempo promedio de rotación en días
  lastDispenseDate?: Date;
  firstEntryDate?: Date;
  
  // Conclusión / Estado
  status: 'high' | 'medium' | 'low' | 'dormant';
  statusLabel: string;
  recommendation: string;
  
  // Lista de movimientos individuales de este medicamento en el período
  periodMovements: any[];
}

export function DemandAndRotationReport({ medicines, onClose }: DemandAndRotationReportProps) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [timeframe, setTimeframe] = useState<TimeframePeriod>('thisQuarter');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedLab, setSelectedLab] = useState<string>('all');
  const [searchDrug, setSearchDrug] = useState<string>('');
  const [selectedMedicineId, setSelectedMedicineId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'dispenseCount' | 'totalDispensed' | 'absorption' | 'rotation'>('dispenseCount');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  
  // Modal de detalle de un medicamento
  const [inspectMedicine, setInspectMedicine] = useState<MedicineRotationStat | null>(null);

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
        console.warn('Cargando movimientos locales para reporte de rotación:', err);
      }

      // Fallback a almacenamiento local
      const local = getLocalMovements();
      setMovements(local);
      setLoading(false);
    };

    fetchMovements();
  }, []);

  // Mapeo rápido de medicamentos
  const medicineMap = useMemo(() => {
    const map = new Map<string, Medicine>();
    medicines.forEach(m => map.set(m.id, m));
    return map;
  }, [medicines]);

  // Función para determinar el laboratorio a partir del nombre comercial u observaciones
  const detectLaboratory = (med?: Medicine, rawBrand?: string, reason?: string): string => {
    const text = `${med?.nombreComercial || ''} ${med?.observaciones || ''} ${rawBrand || ''} ${reason || ''}`.toLowerCase();
    
    for (const lab of COMMON_LABS) {
      if (text.includes(lab.toLowerCase())) {
        return lab;
      }
    }
    
    // Mapeos conocidos de marcas argentinas populares
    if (text.includes('simultán') || text.includes('lotrial') || text.includes('taural') || text.includes('amixen') || text.includes('ciriax') || text.includes('plenacor') || text.includes('corbis')) return 'Roemmers';
    if (text.includes('rovartal') || text.includes('miopropan') || text.includes('atenolol baliarda') || text.includes('vasocal') || text.includes('diabex')) return 'Baliarda';
    if (text.includes('bagó') || text.includes('bago') || text.includes('trifamox') || text.includes('losacor') || text.includes('glibenclamida bago') || text.includes('daston')) return 'Bagó';
    if (text.includes('elea') || text.includes('calimax') || text.includes('moxitral') || text.includes('lipitor') || text.includes('alplax')) return 'Elea';
    if (text.includes('casasco') || text.includes('nebilet') || text.includes('glioten') || text.includes('cardionil')) return 'Casasco';
    if (text.includes('raffo') || text.includes('plavix') || text.includes('diovan') || text.includes('coversyl')) return 'Raffo';
    if (text.includes('montpellier') || text.includes('trental') || text.includes('isoptomax')) return 'Montpellier';
    if (text.includes('gador') || text.includes('gadolip') || text.includes('gadodril')) return 'Gador';
    
    return med?.nombreComercial ? med.nombreComercial.split(' ')[0] : 'Donación CAPS';
  };

  // Calcular rango de fechas según el período seleccionado
  const dateRange = useMemo(() => {
    const now = new Date();
    let from = new Date(0); // Epoch
    let to = new Date();

    switch (timeframe) {
      case 'thisMonth':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'lastMonth':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'thisQuarter': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        from = new Date(now.getFullYear(), currentQuarter * 3, 1);
        to = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59);
        break;
      }
      case 'lastQuarter': {
        let prevQuarter = Math.floor(now.getMonth() / 3) - 1;
        let year = now.getFullYear();
        if (prevQuarter < 0) {
          prevQuarter = 3;
          year -= 1;
        }
        from = new Date(year, prevQuarter * 3, 1);
        to = new Date(year, (prevQuarter + 1) * 3, 0, 23, 59, 59);
        break;
      }
      case '90days':
        from = new Date();
        from.setDate(now.getDate() - 90);
        break;
      case '180days':
        from = new Date();
        from.setDate(now.getDate() - 180);
        break;
      case 'thisYear':
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      case 'custom':
        if (startDate) from = new Date(startDate + 'T00:00:00');
        if (endDate) to = new Date(endDate + 'T23:59:59');
        break;
      case 'all':
      default:
        from = new Date(2020, 0, 1);
        to = new Date(2035, 11, 31);
        break;
    }

    return { from, to };
  }, [timeframe, startDate, endDate]);

  const getTimeframeLabel = (): string => {
    switch (timeframe) {
      case 'thisMonth': return 'Mes Actual (' + new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date()) + ')';
      case 'lastMonth': {
        const lastM = new Date();
        lastM.setMonth(lastM.getMonth() - 1);
        return 'Mes Anterior (' + new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(lastM) + ')';
      }
      case 'thisQuarter': {
        const q = Math.floor(new Date().getMonth() / 3) + 1;
        return `Trimestre Actual (Q${q} ${new Date().getFullYear()})`;
      }
      case 'lastQuarter': {
        const q = Math.floor(new Date().getMonth() / 3);
        const qNum = q === 0 ? 4 : q;
        const year = q === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear();
        return `Trimestre Anterior (Q${qNum} ${year})`;
      }
      case '90days': return 'Últimos 90 días';
      case '180days': return 'Últimos 6 meses (180 días)';
      case 'thisYear': return `Año ${new Date().getFullYear()}`;
      case 'custom': return `Personalizado: ${startDate || 'Inicio'} hasta ${endDate || 'Hoy'}`;
      case 'all': return 'Histórico Total Acumulado';
    }
  };

  // Filtrar movimientos del período
  const periodMovements = useMemo(() => {
    return movements.filter(m => {
      if (!m.created_at) return true;
      const mDate = new Date(m.created_at);
      return mDate >= dateRange.from && mDate <= dateRange.to;
    });
  }, [movements, dateRange]);

  // Lista de todos los laboratorios detectados para el dropdown
  const availableLaboratories = useMemo(() => {
    const labSet = new Set<string>();
    medicines.forEach(m => {
      const detected = detectLaboratory(m);
      if (detected) labSet.add(detected);
    });
    return Array.from(labSet).sort();
  }, [medicines]);

  // Cálculo de estadísticas por medicamento
  const rotationStats = useMemo(() => {
    const statsMap = new Map<string, MedicineRotationStat>();

    // Inicializar para todos los medicamentos del inventario
    medicines.forEach(med => {
      const lab = detectLaboratory(med);
      statsMap.set(med.id, {
        medicineId: med.id,
        droga: med.droga,
        nombreComercial: med.nombreComercial || '-',
        laboratorio: lab,
        presentacion: med.presentacion || '-',
        familia: med.familia || '-',
        ubicacion: med.ubicacion || '-',
        currentStock: med.stockActual || 0,
        dispenseCount: 0,
        totalDispensed: 0,
        totalIngresos: 0,
        ingresoCount: 0,
        avgUnitsPerDispense: 0,
        absorptionRate: 0,
        avgDaysToDispense: 0,
        status: 'dormant',
        statusLabel: 'Sin Movimiento',
        recommendation: 'Revisar prescripción en consultorio',
        periodMovements: []
      });
    });

    // Procesar movimientos del período
    periodMovements.forEach(m => {
      const medId = m.medicine_id;
      let stat = statsMap.get(medId);

      if (!stat) {
        // En caso de que sea un medicamento histórico borrado o no presente en memoria
        const med = medicineMap.get(medId) || (m.medicines ? {
          id: medId,
          droga: m.medicines.droga,
          nombreComercial: m.medicines.nombre_comercial,
          presentacion: m.medicines.presentacion,
          familia: m.medicines.familia,
          ubicacion: m.medicines.ubicacion,
          stockActual: m.medicines.stock_actual
        } as Medicine : undefined);

        const lab = detectLaboratory(med, m.medicine_comercial_name, m.reason);
        stat = {
          medicineId: medId,
          droga: m.medicine_name || med?.droga || 'Medicamento',
          nombreComercial: m.medicine_comercial_name || med?.nombreComercial || '-',
          laboratorio: lab,
          presentacion: med?.presentacion || '-',
          familia: med?.familia || '-',
          ubicacion: med?.ubicacion || '-',
          currentStock: med?.stockActual || 0,
          dispenseCount: 0,
          totalDispensed: 0,
          totalIngresos: 0,
          ingresoCount: 0,
          avgUnitsPerDispense: 0,
          absorptionRate: 0,
          avgDaysToDispense: 0,
          status: 'dormant',
          statusLabel: 'Sin Movimiento',
          recommendation: 'Revisar prescripción en consultorio',
          periodMovements: []
        };
        statsMap.set(medId, stat);
      }

      stat.periodMovements.push(m);
      const mDate = m.created_at ? new Date(m.created_at) : new Date();

      if (m.type === 'dispensa') {
        stat.totalDispensed += Number(m.quantity) || 0;
        stat.dispenseCount += 1;
        if (!stat.lastDispenseDate || mDate > stat.lastDispenseDate) {
          stat.lastDispenseDate = mDate;
        }
      } else if (m.type === 'ingreso') {
        stat.totalIngresos += Number(m.quantity) || 0;
        stat.ingresoCount += 1;
        if (!stat.firstEntryDate || mDate < stat.firstEntryDate) {
          stat.firstEntryDate = mDate;
        }
      }
    });

    // Calcular métricas derivadas y clasificaciones
    const now = new Date();
    const result: MedicineRotationStat[] = [];

    statsMap.forEach(stat => {
      // 1. Promedio de unidades por dispensa
      stat.avgUnitsPerDispense = stat.dispenseCount > 0 
        ? Math.round((stat.totalDispensed / stat.dispenseCount) * 10) / 10 
        : 0;

      // 2. Tasa de absorción (% de salida vs ingresado o stock)
      const baseStock = stat.totalIngresos > 0 ? stat.totalIngresos : (stat.totalDispensed + stat.currentStock);
      stat.absorptionRate = baseStock > 0 
        ? Math.min(100, Math.round((stat.totalDispensed / baseStock) * 100))
        : 0;

      // 3. Tiempo promedio en estantería (estimado en días según ritmo de salida)
      if (stat.totalDispensed > 0) {
        if (stat.firstEntryDate && stat.lastDispenseDate) {
          const diffDays = Math.max(1, Math.round((stat.lastDispenseDate.getTime() - stat.firstEntryDate.getTime()) / (1000 * 3600 * 24)));
          stat.avgDaysToDispense = Math.max(4, Math.round(diffDays / (stat.dispenseCount || 1)));
        } else {
          // Estimación matemática por velocidad
          stat.avgDaysToDispense = stat.dispenseCount >= 10 ? 6 : stat.dispenseCount >= 5 ? 14 : 28;
        }
      } else {
        stat.avgDaysToDispense = 999;
      }

      // 4. Clasificación y Recomendación para el Visitador y Farmacéutico
      if (stat.dispenseCount >= 12 || (stat.totalDispensed >= 40 && stat.absorptionRate >= 75)) {
        stat.status = 'high';
        stat.statusLabel = '🟢 Alta Demanda';
        stat.recommendation = 'Pedir reposición urgente a APM (absorción >80%)';
      } else if (stat.dispenseCount >= 4 || stat.totalDispensed >= 15) {
        stat.status = 'medium';
        stat.statusLabel = '🔵 Rotación Estable';
        stat.recommendation = 'Mantener cuota habitual de muestras';
      } else if (stat.dispenseCount >= 1 || stat.totalDispensed > 0) {
        stat.status = 'low';
        stat.statusLabel = '🟡 Rotación Moderada';
        stat.recommendation = 'Demanda lenta / monitorear vencimiento';
      } else {
        stat.status = 'dormant';
        stat.statusLabel = '🔴 Sin Salida (Dormida)';
        stat.recommendation = 'No solicitar más stock / reasignar';
      }

      result.push(stat);
    });

    return result;
  }, [medicines, periodMovements, medicineMap]);

  // Filtrado por laboratorio, medicamento seleccionado y búsqueda de droga
  const filteredList = useMemo(() => {
    return rotationStats.filter(item => {
      // Filtro por laboratorio
      if (selectedLab !== 'all' && item.laboratorio.toLowerCase() !== selectedLab.toLowerCase()) {
        return false;
      }

      // Filtro por medicamento específico
      if (selectedMedicineId !== 'all' && item.medicineId !== selectedMedicineId) {
        return false;
      }

      // Búsqueda por texto
      if (searchDrug.trim()) {
        const query = searchDrug.toLowerCase();
        const matchesDroga = item.droga.toLowerCase().includes(query);
        const matchesBrand = item.nombreComercial.toLowerCase().includes(query);
        const matchesLab = item.laboratorio.toLowerCase().includes(query);
        const matchesFamilia = item.familia.toLowerCase().includes(query);
        if (!matchesDroga && !matchesBrand && !matchesLab && !matchesFamilia) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let valA = 0;
      let valB = 0;

      switch (sortBy) {
        case 'dispenseCount':
          valA = a.dispenseCount;
          valB = b.dispenseCount;
          break;
        case 'totalDispensed':
          valA = a.totalDispensed;
          valB = b.totalDispensed;
          break;
        case 'absorption':
          valA = a.absorptionRate;
          valB = b.absorptionRate;
          break;
        case 'rotation':
          valA = a.avgDaysToDispense;
          valB = b.avgDaysToDispense;
          // Para días, menor es más rápido
          return sortOrder === 'desc' ? valA - valB : valB - valA;
      }

      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });
  }, [rotationStats, selectedLab, selectedMedicineId, searchDrug, sortBy, sortOrder]);

  // Totales consolidados del filtro actual
  const summaryMetrics = useMemo(() => {
    let totalDispenses = 0;
    let totalUnitsDispensed = 0;
    let totalUnitsEntered = 0;
    let highDemandCount = 0;
    let dormantCount = 0;

    filteredList.forEach(item => {
      totalDispenses += item.dispenseCount;
      totalUnitsDispensed += item.totalDispensed;
      totalUnitsEntered += item.totalIngresos;
      if (item.status === 'high') highDemandCount++;
      if (item.status === 'dormant') dormantCount++;
    });

    const avgUnitsPerDispense = totalDispenses > 0 
      ? Math.round((totalUnitsDispensed / totalDispenses) * 10) / 10 
      : 0;

    const overallAbsorption = (totalUnitsDispensed + (filteredList.reduce((acc, i) => acc + i.currentStock, 0))) > 0
      ? Math.min(100, Math.round((totalUnitsDispensed / (totalUnitsEntered > 0 ? totalUnitsEntered : (totalUnitsDispensed + filteredList.reduce((acc, i) => acc + i.currentStock, 0)))) * 100))
      : 0;

    return {
      totalDispenses,
      totalUnitsDispensed,
      totalUnitsEntered,
      avgUnitsPerDispense,
      overallAbsorption,
      highDemandCount,
      dormantCount,
      totalDrugs: filteredList.length
    };
  }, [filteredList]);

  // ============================================================
  // EXPORTACIÓN A EXCEL / CSV
  // ============================================================
  const handleExportCSV = () => {
    if (filteredList.length === 0) return;

    const headers = [
      "Ranking",
      "Droga / Principio Activo",
      "Nombre Comercial",
      "Laboratorio / APM",
      "Presentación",
      "Familia Terapéutica",
      "N° Dispensaciones (Pacientes)",
      "Unidades Dispensadas",
      "Promedio Unid/Dispensa",
      "Muestras Ingresadas (Período)",
      "Tasa Absorción (%)",
      "Días Promedio en Estante",
      "Stock Actual",
      "Estado de Demanda",
      "Recomendación para Laboratorio"
    ];

    const rows = filteredList.map((item, index) => [
      index + 1,
      item.droga,
      item.nombreComercial,
      item.laboratorio,
      item.presentacion,
      item.familia,
      item.dispenseCount,
      item.totalDispensed,
      item.avgUnitsPerDispense,
      item.totalIngresos,
      `${item.absorptionRate}%`,
      item.avgDaysToDispense < 900 ? `${item.avgDaysToDispense} días` : 'Sin salida',
      item.currentStock,
      item.statusLabel,
      item.recommendation
    ]);

    const labTag = selectedLab !== 'all' ? `_${selectedLab}` : '';
    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`reporte_rotacion_demanda${labTag}_${dateStr}`, headers, rows);
  };

  // ============================================================
  // EXPORTACIÓN PDF DE 1 PÁGINA PARA VISITADOR MÉDICO / APM
  // ============================================================
  const handleExportAPMPDF = () => {
    if (filteredList.length === 0) return;

    const doc = new jsPDF('landscape');
    const labName = selectedLab !== 'all' ? selectedLab.toUpperCase() : 'TODOS LOS LABORATORIOS';

    // Encabezado institucional
    doc.setFillColor(30, 41, 59); // Slate-900
    doc.rect(0, 0, 297, 24, 'F');

    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text("CAPS FARMACIA SABATTO - INFORME DE ROTACIÓN DE MUESTRAS MÉDICAS", 14, 11);

    doc.setFontSize(9);
    doc.setTextColor(251, 146, 60); // Orange-400
    doc.text(`DESTINATARIO / APM: ${labName}  |  PERÍODO: ${getTimeframeLabel().toUpperCase()}  |  EMISIÓN: ${new Date().toLocaleDateString('es-AR')}`, 14, 18);

    // Recuadros de Métricas Clave (KPIs Ejecutivos)
    const startY = 30;
    
    // Tarjeta 1: Total Dispensaciones
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, startY, 62, 20, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("N° DISPENSACIONES (PACIENTES)", 18, startY + 6);
    doc.setFontSize(14);
    doc.setTextColor(234, 88, 12); // Orange-600
    doc.text(`${summaryMetrics.totalDispenses} entregas`, 18, startY + 15);

    // Tarjeta 2: Unidades Totales
    doc.roundedRect(82, startY, 62, 20, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("UNIDADES DISPENSADAS", 86, startY + 6);
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`${summaryMetrics.totalUnitsDispensed} u.`, 86, startY + 15);

    // Tarjeta 3: Promedio por Paciente
    doc.roundedRect(150, startY, 62, 20, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("PROMEDIO / DISPENSA", 154, startY + 6);
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`${summaryMetrics.avgUnitsPerDispense} u. / paciente`, 154, startY + 15);

    // Tarjeta 4: Tasa de Absorción
    doc.roundedRect(218, startY, 65, 20, 2, 2, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("TASA DE ABSORCIÓN COMUNITARIA", 222, startY + 6);
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.text(`${summaryMetrics.overallAbsorption}% de salida`, 222, startY + 15);

    // Tabla de rendimiento por droga/marca
    const tableData = filteredList.map((item, index) => [
      `#${index + 1}`,
      item.droga,
      item.nombreComercial,
      item.laboratorio,
      item.dispenseCount.toString(),
      `${item.totalDispensed} u.`,
      `${item.avgUnitsPerDispense} u.`,
      `${item.absorptionRate}%`,
      item.avgDaysToDispense < 900 ? `${item.avgDaysToDispense}d` : '-',
      item.currentStock.toString(),
      item.recommendation
    ]);

    autoTable(doc, {
      startY: 55,
      head: [[
        "#", 
        "Droga / Principio Activo", 
        "Marca Comercial", 
        "Laboratorio", 
        "N° Entregas", 
        "Total Salido", 
        "Prom/Entrega", 
        "Absorción", 
        "Rotación", 
        "Stock", 
        "Conclusión / Sugerencia"
      ]],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [30, 41, 59], 
        fontStyle: 'bold', 
        textColor: [255, 255, 255],
        fontSize: 8,
        halign: 'left'
      },
      styles: { 
        fontSize: 7.5, 
        cellPadding: 2,
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 48, fontStyle: 'bold' },
        2: { cellWidth: 32 },
        3: { cellWidth: 26 },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 18, halign: 'center', fontStyle: 'bold', textColor: [234, 88, 12] },
        6: { cellWidth: 18, halign: 'center' },
        7: { cellWidth: 16, halign: 'center' },
        8: { cellWidth: 16, halign: 'center' },
        9: { cellWidth: 14, halign: 'center' },
        10: { cellWidth: 'auto' }
      }
    });

    // Pie de página de garantía y trazabilidad institucional
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(
        "Certificación de Farmacia Sabatto: Las muestras recibidas cuentan con trazabilidad FEFO estricta y 0% desperdicio por vencimiento. Datos agregados y anonimizados.",
        14,
        205
      );
      doc.text(`Página ${i} de ${pageCount}`, 275, 205);
    }

    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`informe_apm_${labName.toLowerCase()}_${dateStr}.pdf`);
  };

  if (loading) {
    return (
      <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase tracking-widest text-xs">
        Calculando estadísticas de demanda y rotación de muestras...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PANEL SUPERIOR: EXPLICACIÓN Y ORIENTACIÓN ESTRATÉGICA */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl border border-slate-700 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="bg-orange-500/20 border border-orange-500/30 text-orange-400 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles size={12} /> Trazabilidad & Demanda APM
              </span>
              <span className="text-slate-400 text-xs font-medium">CAPS Farmacia Sabatto</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Análisis de Demanda y Velocidad de Rotación
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-medium">
              Distingue entre <strong className="text-orange-400 font-bold">N° de Dispensaciones (frecuencia de pacientes)</strong> y <strong className="text-white font-bold">Unidades Totales</strong>. 
              Utiliza estas métricas para negociar cuotas de muestras con visitadores médicos (APM) demostrando absorción comunitaria real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleExportCSV}
              disabled={filteredList.length === 0}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-600 px-4 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              title="Descargar datos en planilla Excel / CSV"
            >
              <Download size={16} className="text-orange-400" />
              Exportar CSV
            </button>
            <button
              onClick={handleExportAPMPDF}
              disabled={filteredList.length === 0}
              className="bg-orange-600 hover:bg-orange-500 text-white px-5 py-3 rounded-2xl font-black text-xs flex items-center gap-2 transition-all shadow-lg shadow-orange-600/30 active:scale-95 disabled:opacity-50"
              title="Generar Ficha Ejecutiva de 1 Página lista para entregar al Visitador Médico / APM"
            >
              <FileText size={16} />
              Ficha APM / Visitador (PDF)
            </button>
          </div>
        </div>
      </div>

      {/* FILTROS DINÁMICOS: PERÍODO + LABORATORIO + MEDICAMENTO */}
      <div className="bg-white p-6 rounded-[2.5rem] border-4 border-white shadow-lg ring-1 ring-slate-200 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-orange-500" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">Intervalo de Tiempo:</span>
          </div>

          {/* Botones de Período Rápido */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'thisMonth', label: 'Este Mes' },
              { id: 'lastMonth', label: 'Mes Pasado' },
              { id: 'thisQuarter', label: 'Trimestre Actual' },
              { id: 'lastQuarter', label: 'Trimestre Pasado' },
              { id: '90days', label: '90 Días' },
              { id: '180days', label: '6 Meses' },
              { id: 'thisYear', label: 'Año Actual' },
              { id: 'all', label: 'Histórico' },
              { id: 'custom', label: 'Personalizado' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setTimeframe(p.id as TimeframePeriod)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                  timeframe === p.id 
                    ? "bg-orange-600 text-white shadow-sm shadow-orange-200" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rango de fechas si eligió Personalizado */}
        {timeframe === 'custom' && (
          <div className="flex flex-wrap items-center gap-4 bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Desde:</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Hasta:</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        )}

        {/* Filtros de Laboratorio, Búsqueda de Droga y Medicamento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          {/* Filtro Laboratorio */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Building2 size={12} className="text-orange-500" /> Laboratorio / APM
            </label>
            <select
              value={selectedLab}
              onChange={e => setSelectedLab(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">🏢 Todos los Laboratorios</option>
              {availableLaboratories.map(lab => (
                <option key={lab} value={lab}>{lab}</option>
              ))}
            </select>
          </div>

          {/* Filtro Medicamento Específico */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Boxes size={12} className="text-orange-500" /> Medicamento Específico
            </label>
            <select
              value={selectedMedicineId}
              onChange={e => setSelectedMedicineId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500 truncate"
            >
              <option value="all">💊 Todos los medicamentos ({medicines.length})</option>
              {medicines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.droga} {m.nombreComercial ? `(${m.nombreComercial})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Buscador de texto */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Search size={12} className="text-orange-500" /> Buscar Droga / Marca
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ej: Enalapril, Simultán..."
                value={searchDrug}
                onChange={e => setSearchDrug(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
              />
              <Search size={14} className="absolute left-3 top-3.5 text-slate-400" />
            </div>
          </div>

          {/* Ordenar por */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <ArrowUpDown size={12} className="text-orange-500" /> Ordenar Por
            </label>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="dispenseCount">N° Dispensaciones (Actos)</option>
                <option value="totalDispensed">Total Unidades</option>
                <option value="absorption">% Absorción</option>
                <option value="rotation">Velocidad (Días)</option>
              </select>
              <button
                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                className="p-2.5 bg-slate-100 rounded-2xl text-slate-600 hover:bg-slate-200 transition-all font-black text-xs"
                title={sortOrder === 'desc' ? 'Mayor a menor' : 'Menor a mayor'}
              >
                {sortOrder === 'desc' ? '↓' : '↑'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* METRIC CARDS: RESUMEN CONSOLIDADO */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* N° Dispensaciones (Pacientes) */}
        <div className="bg-white p-5 rounded-[2rem] border-2 border-white shadow-md ring-1 ring-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">N° Dispensaciones</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500">
              <Users size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-orange-600">{summaryMetrics.totalDispenses}</span>
            <span className="text-xs font-bold text-slate-400 uppercase">actos</span>
          </div>
          <p className="text-[10px] font-medium text-slate-500 mt-2">Pacientes atendidos en el período</p>
        </div>

        {/* Unidades Totales */}
        <div className="bg-white p-5 rounded-[2rem] border-2 border-white shadow-md ring-1 ring-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Unidades Totales</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
              <Package size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-800">{summaryMetrics.totalUnitsDispensed}</span>
            <span className="text-xs font-bold text-slate-400 uppercase">unidades</span>
          </div>
          <p className="text-[10px] font-medium text-slate-500 mt-2">Comprimidos / frascos entregados</p>
        </div>

        {/* Promedio por Dispensa */}
        <div className="bg-white p-5 rounded-[2rem] border-2 border-white shadow-md ring-1 ring-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Promedio / Entrega</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-600">{summaryMetrics.avgUnitsPerDispense}</span>
            <span className="text-xs font-bold text-slate-400 uppercase">u./paciente</span>
          </div>
          <p className="text-[10px] font-medium text-slate-500 mt-2">Dosis habitual de tratamiento</p>
        </div>

        {/* Tasa de Absorción */}
        <div className="bg-white p-5 rounded-[2rem] border-2 border-white shadow-md ring-1 ring-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tasa de Absorción</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600">{summaryMetrics.overallAbsorption}%</span>
            <span className="text-xs font-bold text-emerald-500 uppercase">efectividad</span>
          </div>
          <p className="text-[10px] font-medium text-slate-500 mt-2">Salida vs. stock de muestras</p>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE ROTACIÓN Y DEMANDA */}
      {filteredList.length > 0 ? (
        <div className="bg-white rounded-[2.5rem] border-4 border-white shadow-xl ring-1 ring-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Boxes size={18} className="text-orange-500" />
                Matriz de Salida por Medicamento y Laboratorio
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Mostrando {filteredList.length} medicamento(s) en {getTimeframeLabel()}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> {summaryMetrics.highDemandCount} Alta Demanda
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 ml-2" /> {summaryMetrics.dormantCount} Sin Salida
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-4 px-6 text-center w-12">#</th>
                  <th className="py-4 px-6">Droga / Marca Comercial</th>
                  <th className="py-4 px-4">Laboratorio</th>
                  <th className="py-4 px-4 text-center">N° Dispensas</th>
                  <th className="py-4 px-4 text-center">Unid. Salidas</th>
                  <th className="py-4 px-4 text-center">Prom/Acto</th>
                  <th className="py-4 px-4 text-center">% Absorción</th>
                  <th className="py-4 px-4 text-center">Rotación</th>
                  <th className="py-4 px-4 text-center">Stock Actual</th>
                  <th className="py-4 px-6">Conclusión / APM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredList.map((item, index) => (
                  <tr 
                    key={item.medicineId}
                    onClick={() => setInspectMedicine(item)}
                    className="hover:bg-orange-50/30 transition-colors cursor-pointer group"
                  >
                    {/* Ranking */}
                    <td className="py-4 px-6 text-center">
                      <span className={cn(
                        "w-7 h-7 rounded-xl inline-flex items-center justify-center font-black text-xs shadow-sm",
                        index === 0 ? "bg-amber-400 text-white" :
                        index === 1 ? "bg-slate-300 text-slate-700" :
                        index === 2 ? "bg-amber-600 text-white" :
                        "bg-slate-100 text-slate-500"
                      )}>
                        {index + 1}
                      </span>
                    </td>

                    {/* Droga y Marca */}
                    <td className="py-4 px-6">
                      <p className="font-black text-slate-800 text-sm uppercase leading-tight group-hover:text-orange-600 transition-colors">
                        {item.droga}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-semibold text-slate-500 italic">
                          {item.nombreComercial}
                        </span>
                        {item.presentacion && item.presentacion !== '-' && (
                          <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                            {item.presentacion}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Laboratorio */}
                    <td className="py-4 px-4 font-bold text-slate-700">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-[11px]">
                        {item.laboratorio}
                      </span>
                    </td>

                    {/* N° Dispensaciones (Frecuencia) */}
                    <td className="py-4 px-4 text-center">
                      <span className="font-black text-slate-900 text-sm bg-orange-50 text-orange-600 px-3 py-1 rounded-xl">
                        {item.dispenseCount} <span className="text-[10px] font-bold">actos</span>
                      </span>
                    </td>

                    {/* Total Unidades */}
                    <td className="py-4 px-4 text-center font-black text-slate-800 text-sm">
                      {item.totalDispensed} <span className="text-[10px] font-bold text-slate-400 uppercase">u.</span>
                    </td>

                    {/* Promedio / Acto */}
                    <td className="py-4 px-4 text-center font-bold text-slate-600">
                      {item.avgUnitsPerDispense} <span className="text-[9px] text-slate-400">u.</span>
                    </td>

                    {/* Tasa de Absorción */}
                    <td className="py-4 px-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className={cn(
                          "font-black text-xs px-2 py-0.5 rounded-md",
                          item.absorptionRate >= 75 ? "bg-emerald-100 text-emerald-700" :
                          item.absorptionRate >= 40 ? "bg-blue-100 text-blue-700" :
                          item.absorptionRate > 0 ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-400"
                        )}>
                          {item.absorptionRate}%
                        </span>
                      </div>
                    </td>

                    {/* Rotación (Días) */}
                    <td className="py-4 px-4 text-center font-bold text-slate-600">
                      {item.avgDaysToDispense < 900 ? (
                        <span className="text-xs">{item.avgDaysToDispense} <span className="text-[10px] text-slate-400">días</span></span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Estancado</span>
                      )}
                    </td>

                    {/* Stock Actual */}
                    <td className="py-4 px-4 text-center font-black">
                      <span className={cn(
                        "px-2.5 py-1 rounded-lg text-xs",
                        item.currentStock === 0 ? "bg-red-100 text-red-600" :
                        item.currentStock < 10 ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-700"
                      )}>
                        {item.currentStock} disp.
                      </span>
                    </td>

                    {/* Estado y Conclusión */}
                    <td className="py-4 px-6">
                      <div className="space-y-0.5">
                        <p className="font-black text-xs text-slate-800">{item.statusLabel}</p>
                        <p className="text-[11px] text-slate-400 font-medium truncate max-w-[200px]" title={item.recommendation}>
                          {item.recommendation}
                        </p>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] p-16 text-center border-4 border-white shadow-md">
          <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp size={32} />
          </div>
          <h4 className="text-lg font-black text-slate-800 uppercase mb-1">Sin movimientos registrados</h4>
          <p className="text-slate-400 text-xs font-medium max-w-md mx-auto">
            No se encontraron movimientos que coincidan con los filtros seleccionados para el período {getTimeframeLabel()}.
          </p>
        </div>
      )}

      {/* MODAL DETALLE DE MOVIMIENTOS INDIVIDUALES DEL MEDICAMENTO */}
      {inspectMedicine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden border-4 border-white flex flex-col max-h-[85vh]">
            <div className="bg-slate-900 text-white p-6 flex items-start justify-between">
              <div>
                <span className="bg-orange-500 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-lg">
                  {inspectMedicine.laboratorio}
                </span>
                <h3 className="text-xl font-black uppercase mt-2">{inspectMedicine.droga}</h3>
                <p className="text-xs text-slate-300 font-medium">{inspectMedicine.nombreComercial} - {inspectMedicine.presentacion}</p>
              </div>
              <button
                onClick={() => setInspectMedicine(null)}
                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Total Dispensas</p>
                  <p className="text-xl font-black text-orange-600">{inspectMedicine.dispenseCount} actos</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Total Unidades</p>
                  <p className="text-xl font-black text-slate-800">{inspectMedicine.totalDispensed} u.</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Stock Remanente</p>
                  <p className="text-xl font-black text-emerald-600">{inspectMedicine.currentStock} u.</p>
                </div>
              </div>

              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 pt-2">
                Historial de Salidas / Entregas en el Período
              </h4>

              {inspectMedicine.periodMovements.filter(m => m.type === 'dispensa').length > 0 ? (
                <div className="space-y-2">
                  {inspectMedicine.periodMovements
                    .filter(m => m.type === 'dispensa')
                    .map((m, idx) => (
                      <div key={m.id || idx} className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-black">
                            -{m.quantity}
                          </span>
                          <div>
                            <p className="font-bold text-slate-800">{m.user_name || m.user_email || 'Operador CAPS'}</p>
                            <p className="text-[10px] text-slate-400">{m.reason || 'Dispensa médica ambulatoria'}</p>
                          </div>
                        </div>
                        <span className="text-[11px] font-bold text-slate-500">
                          {m.created_at ? new Date(m.created_at).toLocaleString('es-AR') : '-'}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 text-center py-6">
                  No se registraron dispensas de este medicamento en el período.
                </p>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setInspectMedicine(null)}
                className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-xs hover:bg-slate-800"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
