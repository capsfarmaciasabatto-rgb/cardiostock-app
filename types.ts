import { Timestamp } from 'firebase/firestore';

export interface Medicine {
  id: string;
  ubicacion: string;
  droga: string;
  presentacion: string;
  nombreComercial: string;
  familia: string;
  observaciones: string;
  minStock?: number;
  stockActual: number;
  fechaVencimiento?: string;
  updatedAt?: Timestamp;
}

export interface Batch {
  id: string;
  medicineId?: string;
  vencimiento: string; // Format YYYY-MM
  quantity: number;
  updatedAt?: Timestamp;
}

export type MovementType = 'ingreso' | 'dispensa';

export interface Movement {
  id: string;
  medicineId: string;
  type: MovementType;
  quantity: number;
  reason: string;
  isAdjustment?: boolean;
  justification?: string;
  createdAt: Timestamp;
  userId: string;
}

export type UserRole = 'MEDICO' | 'TECNICO' | 'FARMACEUTICO';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: UserRole;
  approved?: boolean;
  accessCode?: string;
  createdAt?: Timestamp;
}
