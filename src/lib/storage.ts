import { Medicine, Batch, Movement } from '../types';
import initialData from '../data/inventory.json';

const STORAGE_KEYS = {
  MEDICINES: 'cardiostock_medicines_v2',
  BATCHES: 'cardiostock_batches_v2',
  MOVEMENTS: 'cardiostock_movements_v2'
};

function normalizeVencimiento(raw: string): string {
  if (!raw) return '2027-12';
  if (raw.includes('-')) return raw;
  const parts = raw.split('/');
  if (parts.length === 2) {
    const month = parts[0].padStart(2, '0');
    const year = parts[1].length === 2 ? `20${parts[1]}` : parts[1];
    return `${year}-${month}`;
  }
  return '2027-12';
}

export function getLocalMedicines(): Medicine[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.MEDICINES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading medicines from localStorage:', err);
  }

  // Initialize from inventory.json
  const initialMeds: Medicine[] = initialData.map((item, idx) => ({
    id: `local-${idx}`,
    droga: item.droga || '',
    nombreComercial: item.nombreComercial || '',
    presentacion: item.presentacion || '',
    familia: item.familia || '',
    ubicacion: item.ubicacion || '',
    stockActual: Number(item.stockActual) || 0,
    minStock: 5,
    observaciones: item.observaciones || '',
    fechaVencimiento: normalizeVencimiento(item.vencimiento)
  }));

  saveLocalMedicines(initialMeds);
  return initialMeds;
}

export function saveLocalMedicines(meds: Medicine[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.MEDICINES, JSON.stringify(meds));
  } catch (err) {
    console.warn('Error saving medicines to localStorage:', err);
  }
}

export function getLocalBatches(): Batch[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.BATCHES);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Error reading batches from localStorage:', err);
  }

  // Initialize batches from initialData
  const initialBatches: Batch[] = [];
  initialData.forEach((item, idx) => {
    const medId = `local-${idx}`;
    const normExpiry = normalizeVencimiento(item.vencimiento);
    const rawLots = (item.cantidadLote || '').toString();

    if (rawLots.includes('+')) {
      const parts = rawLots.split('+').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && p > 0);
      parts.forEach((qty, pIdx) => {
        initialBatches.push({
          id: `batch-${idx}-${pIdx}`,
          medicineId: medId,
          vencimiento: normExpiry,
          quantity: qty
        });
      });
    } else {
      const singleQty = parseInt(rawLots) || item.stockActual || 0;
      if (singleQty > 0) {
        initialBatches.push({
          id: `batch-${idx}-0`,
          medicineId: medId,
          vencimiento: normExpiry,
          quantity: singleQty
        });
      }
    }
  });

  saveLocalBatches(initialBatches);
  return initialBatches;
}

export function saveLocalBatches(batches: Batch[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));
  } catch (err) {
    console.warn('Error saving batches to localStorage:', err);
  }
}

export function getLocalMovements(): any[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn('Error reading movements from localStorage:', err);
  }

  // Si no hay movimientos, generamos historial realista para informes
  const meds = getLocalMedicines();
  const operators = [
    { name: 'Farm. Sabatto (Administrador)', email: 'capsfarmaciasabatto@gmail.com', role: 'FARMACEUTICO' },
    { name: 'Téc. Laura Méndez', email: 'laura.mendez@caps.gob.ar', role: 'TECNICO' },
    { name: 'Téc. Carlos Benítez', email: 'carlos.benitez@caps.gob.ar', role: 'TECNICO' },
    { name: 'Dr. Alejandro Rossi', email: 'arossi@caps.gob.ar', role: 'MEDICO' }
  ];

  const now = new Date();
  const initialMovements: any[] = [];

  // Muestras ingresadas y dispensadas con fechas realistas (últimos 120 días)
  meds.forEach((med, idx) => {
    // 1. Ingreso inicial de muestra médica (donación)
    const daysAgoEntry = 30 + (idx * 5) % 110;
    const entryDate = new Date(now.getTime() - daysAgoEntry * 24 * 60 * 60 * 1000);
    const entryQty = 20 + ((idx * 7) % 40);
    const opEntry = operators[idx % operators.length];

    initialMovements.push({
      id: `seed-in-${idx}`,
      medicine_id: med.id,
      medicine_name: med.droga,
      type: 'ingreso',
      quantity: entryQty,
      reason: 'Ingreso de muestras médicas (Donación de laboratorio)',
      is_adjustment: false,
      justification: 'Recepción periódica de muestras',
      user_email: opEntry.email,
      user_name: opEntry.name,
      created_at: entryDate.toISOString()
    });

    // 2. Si NO es de los medicamentos que dejamos deliberadamente "dormidos" (idx 3, 7, 12, 18, 22), agregamos dispensas
    const isDormant = [3, 7, 12, 18, 22].includes(idx % 25);
    if (!isDormant) {
      // Dispensas escalonadas
      const dispCount = 2 + (idx % 4);
      for (let d = 0; d < dispCount; d++) {
        const daysAgoDisp = Math.max(1, daysAgoEntry - (d + 1) * 8 - (idx % 6));
        const dispDate = new Date(now.getTime() - daysAgoDisp * 24 * 60 * 60 * 1000);
        const dispQty = 2 + ((idx + d) % 5);
        const opDisp = operators[(idx + d + 1) % operators.length];

        initialMovements.push({
          id: `seed-out-${idx}-${d}`,
          medicine_id: med.id,
          medicine_name: med.droga,
          type: 'dispensa',
          quantity: dispQty,
          reason: 'Dispensa médica ambulatoria / Consulta de cardiología',
          is_adjustment: false,
          justification: 'Receta médica autorizada',
          user_email: opDisp.email,
          user_name: opDisp.name,
          created_at: dispDate.toISOString()
        });
      }
    }

    // 3. Ajustes ocasionales de inventario
    if (idx % 6 === 0) {
      const daysAgoAdj = 15 + (idx % 30);
      const adjDate = new Date(now.getTime() - daysAgoAdj * 24 * 60 * 60 * 1000);
      const opAdj = operators[0]; // Farmacéutico

      initialMovements.push({
        id: `seed-adj-${idx}`,
        medicine_id: med.id,
        medicine_name: med.droga,
        type: idx % 2 === 0 ? 'dispensa' : 'ingreso',
        quantity: 2,
        reason: idx % 2 === 0 ? 'Ajuste manual: Descarte por merma/rotura de blíster' : 'Ajuste manual: Recuento físico por arqueo semanal',
        is_adjustment: true,
        justification: idx % 2 === 0 ? 'Merma física identificada en estantería' : 'Sobrante hallado en conteo ciego',
        user_email: opAdj.email,
        user_name: opAdj.name,
        created_at: adjDate.toISOString()
      });
    }
  });

  // Ordenar de más reciente a más antiguo
  initialMovements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  try {
    localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(initialMovements));
  } catch (e) {
    console.warn('Could not save seed movements:', e);
  }

  return initialMovements;
}

export function saveLocalMovement(movement: any): void {
  try {
    const list = getLocalMovements();
    list.unshift({
      id: `mov-${Date.now()}`,
      created_at: new Date().toISOString(),
      ...movement
    });
    localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(list.slice(0, 800)));
  } catch (err) {
    console.warn('Error saving movement to localStorage:', err);
  }
}
