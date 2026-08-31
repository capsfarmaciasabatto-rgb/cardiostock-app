import { Medicine, Batch, Movement } from '../types';
import initialData from '../data/inventory.json';

const STORAGE_KEYS = {
  MEDICINES: 'cardiostock_medicines_v2',
  BATCHES: 'cardiostock_batches_v2',
  MOVEMENTS: 'cardiostock_movements_v2',
  ROTATIVE_VERIFICATIONS: 'cardiostock_rotative_verifications_v2'
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
      if (Array.isArray(parsed)) {
        // Filtrar y limpiar cualquier registro con dominios ficticios de pruebas previas
        const clean = parsed.filter(m => 
          !m.id?.toString().startsWith('seed-') &&
          !m.user_email?.includes('@caps.gob.ar')
        );
        if (clean.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(clean));
        }
        return clean;
      }
    }
  } catch (err) {
    console.warn('Error reading movements from localStorage:', err);
  }

  return [];
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

export interface RotativeVerificationItem {
  verified: boolean;
  verifiedAt: string; // ISO date string
  verifiedBy?: string;
  stockCounted?: number;
  notes?: string;
}

export function getLocalRotativeVerifications(): Record<string, RotativeVerificationItem> {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ROTATIVE_VERIFICATIONS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        // Normalizar en caso de que vinieran valores booleanos directos
        const result: Record<string, RotativeVerificationItem> = {};
        Object.keys(parsed).forEach(key => {
          const val = parsed[key];
          if (typeof val === 'boolean') {
            result[key] = {
              verified: val,
              verifiedAt: new Date().toISOString()
            };
          } else if (val && typeof val === 'object') {
            result[key] = val;
          }
        });
        return result;
      }
    }
  } catch (err) {
    console.warn('Error loading rotative verifications:', err);
  }
  return {};
}

export function saveLocalRotativeVerification(
  medicineId: string, 
  verified: boolean, 
  options?: { verifiedBy?: string; stockCounted?: number; notes?: string }
): Record<string, RotativeVerificationItem> {
  try {
    const current = getLocalRotativeVerifications();
    if (verified) {
      current[medicineId] = {
        verified: true,
        verifiedAt: new Date().toISOString(),
        verifiedBy: options?.verifiedBy,
        stockCounted: options?.stockCounted,
        notes: options?.notes
      };
    } else {
      delete current[medicineId];
    }
    localStorage.setItem(STORAGE_KEYS.ROTATIVE_VERIFICATIONS, JSON.stringify(current));
    return current;
  } catch (err) {
    console.warn('Error saving rotative verification:', err);
    return {};
  }
}

export function clearAllRotativeVerifications(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ROTATIVE_VERIFICATIONS);
  } catch (err) {
    console.warn('Error clearing rotative verifications:', err);
  }
}

