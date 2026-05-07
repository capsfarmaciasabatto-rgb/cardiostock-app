import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabase'
import { Medicine, Movement, MovementType, User, Batch, UserRole } from './types';
import { Search, Plus, Minus, LogIn, LogOut, Package, History, AlertCircle, Calendar, ClipboardList, X, HeartPulse, MapPin, LayoutGrid, List, ArrowDownAz, Tags, FileText, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import initialData from './data/inventory.json';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isSelectingRole, setIsSelectingRole] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showAddMedicineModal, setShowAddMedicineModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showExpirationModal, setShowExpirationModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [viewType, setViewType] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'droga' | 'familia' | 'stock'>('droga');
  const [isSeeding, setIsSeeding] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [allMovements, setAllMovements] = useState<any[]>([]);
  const [manualLogin, setManualLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const handleSignOut = () => {
    signOut();
    setUser(null);
    setManualLogin(false);
  };

  const isFarmaceutico = user?.role === 'FARMACEUTICO' || user?.email === 'capsfarmaciasabatto@gmail.com';
  const isTecnico = isFarmaceutico || user?.role === 'TECNICO';
  const isMedico = !!user;

  // Form states for new medicine
  const [newMedicine, setNewMedicine] = useState<Partial<Medicine>>({
    nombreComercial: '',
    droga: '',
    presentacion: '',
    familia: '',
    ubicacion: '',
    observaciones: '',
    minStock: 0
  });

useEffect(() => {

    const fetchMedicines = async () => {
      // Llamamos a la tabla que creaste en el SQL Editor
      const { data, error } = await supabase
        .from('medicines')
        .select('*')
        .order('droga', { ascending: true });

      if (error) {
        console.error('Error al cargar medicamentos:', error);
      } else {
        setMedicines(data || []);
      }
    };

    fetchMedicines();
  }, []);

  const filteredMedicines = useMemo(() => {
    const filtered = medicines.filter(m => {
      const matchesSearch = 
        m.droga.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.nombreComercial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.familia.toLowerCase().includes(searchTerm.toLowerCase());
      
      const isLowStock = filterLowStock ? (m.stockActual <= (m.minStock || 0)) : true;
      
      return matchesSearch && isLowStock;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'droga') return a.droga.localeCompare(b.droga);
      if (sortBy === 'familia') return a.familia.localeCompare(b.familia) || a.droga.localeCompare(b.droga);
      if (sortBy === 'stock') return a.stockActual - b.stockActual;
      return 0;
    });
  }, [medicines, searchTerm, filterLowStock, sortBy]);

const handleSeedData = async () => {
    if (isSeeding) return;
    setIsSeeding(true);
    try {
      // Preparamos los datos del JSON inicial para Supabase
      const medicinesToInsert = initialData.map(item => ({
        droga: item.droga || '',
        nombreComercial: item.nombreComercial || '',
        presentacion: item.presentacion || '',
        familia: item.familia || '',
        ubicacion: item.ubicacion || '',
        stockActual: item.stockActual || 0,
        minStock: 5
      }));

      const { error } = await supabase
        .from('medicines')
        .insert(medicinesToInsert);

      if (error) throw error;
      
      alert('¡Stock inicial cargado con éxito en Supabase!');
      // Recargamos la página para ver los cambios
      window.location.reload();
      
    } catch (error) {
      console.error(error);
      alert('Error al inicializar datos en Supabase.');
    } finally {
      setIsSeeding(false);
    }
  };

  const [showEditMedicineModal, setShowEditMedicineModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);

  const handleUpdateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editingMedicine) return;
    try {
      const { id, ...data } = editingMedicine as any;
      // Actualizamos en Supabase buscando por la ID del medicamento
      const { error } = await supabase
        .from('medicines')
        .update(data)
        .eq('id', id);

      if (error) throw error;
      
      setShowEditMedicineModal(false);
      setEditingMedicine(null);
      
      // Refrescamos la lista para ver los cambios en la tabla
      const { data: updatedList } = await supabase
        .from('medicines')
        .select('*')
        .order('droga', { ascending: true });
      setMedicines(updatedList || []);
      
    } catch (error) {
      console.error(error);
      alert('Error al actualizar el medicamento en Supabase.');
    }
  };

  const handleUpdateBatch = async (batchId: string, quantity: number, vencimiento: string) => {
    if (!user || !selectedMedicine) return;
    try {
      // Actualizamos directamente el stock y vencimiento en la tabla medicines
      const { error } = await supabase
        .from('medicines')
        .update({ 
          stockActual: quantity, 
          fechaVencimiento: vencimiento 
        })
        .eq('id', selectedMedicine.id);

      if (error) throw error;
      
      setShowEditBatchModal(false);
      setEditingBatch(null);
      
      // Refrescamos la lista para ver el nuevo stock
      const { data: updatedList } = await supabase.from('medicines').select('*').order('droga');
      setMedicines(updatedList || []);
      
    } catch (error) {
      console.error(error);
      alert('Error al actualizar el stock en Supabase.');
    }
  };

  const handleAddMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Suponiendo que tenés un estado 'newMedicine' con los datos del formulario
    try {
      const { error } = await supabase
        .from('medicines')
        .insert([newMedicine]);

      if (error) throw error;

      setShowAddMedicineModal(false);
      // Recargar lista
      const { data: updatedList } = await supabase.from('medicines').select('*').order('droga');
      setMedicines(updatedList || []);
    } catch (error) {
      console.error(error);
      alert('Error al agregar el medicamento.');
    }
  };

  const registerMovement = async (type: MovementType, quantity: number, expiry?: string, isAdjustment?: boolean, justification?: string) => {
    if (!user || !selectedMedicine) return;
    if (quantity <= 0) return;

    try {
      const batch = writeBatch(db);
      const medicineRef = doc(db, 'medicines', selectedMedicine.id);
      
      const movementRef = doc(collection(medicineRef, 'movements'));
      const globalMovementRef = doc(collection(db, 'global_movements'));
      
      const movementData = {
        medicineId: selectedMedicine.id,
        medicineName: selectedMedicine.droga,
        medicineComercialName: selectedMedicine.nombreComercial,
        type,
        quantity,
        reason: isAdjustment ? 'Ajuste manual' : 'Registro manual',
        isAdjustment: isAdjustment || false,
        justification: justification || '',
        createdAt: serverTimestamp(),
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName || user.email
      };

      batch.set(movementRef, movementData);
      batch.set(globalMovementRef, movementData);

      if (type === 'ingreso') {
        if (!expiry) {
          alert('Debe ingresar una fecha de vencimiento para el ingreso');
          return;
        }

        const batchesRef = collection(medicineRef, 'batches');
        const q = query(batchesRef, where('vencimiento', '==', expiry));
        const batchSnap = await getDocs(q);

        if (!batchSnap.empty) {
          const existingBatchDoc = batchSnap.docs[0];
          batch.update(existingBatchDoc.ref, {
            quantity: existingBatchDoc.data().quantity + quantity,
            updatedAt: serverTimestamp()
          });
        } else {
          const newBatchRef = doc(batchesRef);
          batch.set(newBatchRef, {
            vencimiento: expiry,
            quantity: quantity,
            updatedAt: serverTimestamp()
          });
        }

        batch.update(medicineRef, {
          stockActual: selectedMedicine.stockActual + quantity,
          updatedAt: serverTimestamp()
        });
      } else {
        if (selectedMedicine.stockActual < quantity) {
          alert('No hay stock suficiente');
          return;
        }

        const batchesRef = collection(medicineRef, 'batches');
        const q = query(batchesRef, where('quantity', '>', 0), orderBy('vencimiento', 'asc'));
        const batchSnap = await getDocs(q);
        
        let remainingToDeduct = quantity;
        const batchDocs = batchSnap.docs;

        for (const bDoc of batchDocs) {
          if (remainingToDeduct === 0) break;
          const bData = bDoc.data();
          const bQty = bData.quantity;

          if (bQty <= remainingToDeduct) {
            batch.update(bDoc.ref, {
              quantity: 0,
              updatedAt: serverTimestamp()
            });
            remainingToDeduct -= bQty;
          } else {
            batch.update(bDoc.ref, {
              quantity: bQty - remainingToDeduct,
              updatedAt: serverTimestamp()
            });
            remainingToDeduct = 0;
          }
        }

        batch.update(medicineRef, {
          stockActual: selectedMedicine.stockActual - quantity,
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      setShowMovementModal(false);
      setTimeout(() => setSelectedMedicine(null), 200);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `medicines/${selectedMedicine.id}`);
    }
  };

  const handleSelectRole = async (role: UserRole) => {
    if (!pendingUser) return;
    try {
      const userRef = doc(db, 'users', pendingUser.uid);
      const isFirstUser = (await getDocs(collection(db, 'users'))).empty;
      
      const userData = {
        email: pendingUser.email,
        displayName: pendingUser.displayName,
        role: role,
        approved: isFirstUser || role === 'FARMACEUTICO' ? true : false, // First user or pharmacists are auto-approved for simplicity in this prototype, or we could require approval for everyone
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(userRef, userData);
      
      setUser({
        uid: pendingUser.uid,
        email: pendingUser.email,
        displayName: pendingUser.displayName,
        photoURL: pendingUser.photoURL,
        role: role,
        approved: userData.approved
      });
      setIsSelectingRole(false);
    } catch (error) {
      console.error(error);
      alert('Error al guardar el perfil.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-200 flex items-center justify-center font-sans text-orange-600 font-black animate-pulse">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (isSelectingRole && pendingUser) {
    return (
      <div className="min-h-screen bg-slate-200 flex items-center justify-center p-6 font-sans">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl w-full">
          <div className="text-center mb-12">
             <h2 className="text-4xl font-black text-slate-800 mb-2 uppercase tracking-tight">Elija su Perfil</h2>
             <p className="text-slate-500 font-medium italic">Seleccione su rol para continuar al sistema</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <RoleCard 
                title="Médico" 
                role="MEDICO"
                icon={<HeartPulse size={32} />}
                description="Consulta de stock, vencimientos y ubicación de medicamentos en tiempo real."
                color="bg-white"
                textColor="text-slate-800"
                onClick={() => handleSelectRole('MEDICO')}
             />
             <RoleCard 
                title="Técnico" 
                role="TECNICO"
                icon={<Package size={32} />}
                description="Gestión operativa: Ingresos, dispensas, armado de lotes y control de ubicaciones."
                color="bg-orange-50 border-orange-200"
                textColor="text-orange-900"
                onClick={() => handleSelectRole('TECNICO')}
             />
             <RoleCard 
                title="Farmacéutico" 
                role="FARMACEUTICO"
                icon={<ClipboardList size={32} />}
                description="Control total: Auditoría, corrección de inventario, exportación de informes y gestión de usuarios."
                color="bg-slate-900 shadow-2xl"
                textColor="text-white"
                onClick={() => handleSelectRole('FARMACEUTICO')}
             />
          </div>

          <div className="mt-12 text-center">
             <button onClick={handleSignOut} className="text-slate-400 font-bold hover:text-red-500 transition-colors uppercase tracking-widest text-[10px]">
               Cerrar Sesión e Intentar de Nuevo
             </button>
          </div>
        </motion.div>
      </div>
    );
  }

const handleManualLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoginError(null);
  setIsLoggingIn(true);

  // --- ACCESO CON CONTRASEÑA GENÉRICA ---
  if (loginPassword === '1234') {
    setUser({
      uid: 'admin-manual',
      email: loginEmail || 'capsfarmaciasabatto@gmail.com',
      displayName: 'Administrador Local',
      role: 'FARMACEUTICO',
      approved: true
    });
    setIsLoggingIn(false);
    return;
  }
    try {
      const cleanEmail = loginEmail.toLowerCase().trim();
      // Use the same predictable ID format as in handleCreateUser
      const tempId = `pre_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const userSnap = await getDoc(doc(db, 'users', tempId));
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        
        // Verify access code
        if (userData.accessCode === loginPassword) {
          if (!userData.approved && userData.email !== 'capsfarmaciasabatto@gmail.com') {
            setLoginError("Usuario pendiente de aprobación.");
            setIsLoggingIn(false);
            return;
          }

          setUser({
            uid: userSnap.id,
            email: userData.email,
            displayName: userData.displayName || userData.email,
            photoURL: null,
            role: userData.role,
            approved: true,
            accessCode: userData.accessCode
          });
          setIsSelectingRole(false);
        } else {
          setLoginError("Código de acceso incorrecto.");
          setIsLoggingIn(false);
        }
      } else {
        setLoginError("Usuario no encontrado.");
        setIsLoggingIn(false);
      }
    } catch (error) {
      console.error("Login error:", error);
      setLoginError("Error al intentar iniciar sesión.");
      setIsLoggingIn(false);
    }
  };

  if (!user) {
    if (isLoggingIn || pendingUser) return <div className="min-h-screen bg-slate-200 flex items-center justify-center font-black text-slate-400 uppercase tracking-widest text-xs animate-pulse">Iniciando sistema...</div>;

    return (
      <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-[4rem] shadow-2xl p-12 text-center border-4 border-white relative overflow-hidden ring-1 ring-slate-200"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 blur-2xl opacity-50" />
          
          <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-sm">
            <HeartPulse className="text-orange-500 w-12 h-12" />
          </div>
          <h1 className="text-5xl font-black text-slate-800 mb-2 uppercase tracking-tighter">SABATTO</h1>
          <p className="text-orange-500 font-black uppercase tracking-[0.2em] text-[10px] mb-4">Farmacia Especializada</p>
          
          <AnimatePresence mode="wait">
            {!manualLogin ? (
              <motion.div
                key="google"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-4"
              >
                <p className="text-slate-400 font-medium leading-relaxed mb-10 text-sm">Gestión inteligente de muestras cardiológicas para profesionales de la salud.</p>
                <button 
                  onClick={handleSignIn}
                  disabled={isLoggingIn}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-5 rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 mb-6"
                >
                  <LogIn size={20} />
                  {isLoggingIn ? 'Iniciando...' : 'Entrar con Google'}
                </button>
                <button 
                  onClick={() => setManualLogin(true)}
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-orange-500 transition-colors"
                >
                  O usar Usuario y Contraseña
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="manual"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <form onSubmit={handleManualLogin} className="space-y-4">
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Email de Usuario</label>
                    <input 
                      type="email"
                      required
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value)}
                      className="w-full bg-slate-100 border-none rounded-2xl px-6 py-4 font-bold text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-colors border-2 border-transparent focus:border-white shadow-inner"
                      placeholder="ejemplo@email.com"
                    />
                  </div>
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-4">Código de Acceso</label>
                    <input 
                      type="password"
                      required
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      className="w-full bg-slate-100 border-none rounded-2xl px-6 py-4 font-bold text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-colors border-2 border-transparent focus:border-white shadow-inner"
                      placeholder="••••••••"
                    />
                  </div>
                  {loginError && <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">{loginError}</p>}
                  <button 
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-orange-100 active:scale-95 mt-4"
                  >
                    {isLoggingIn ? 'Verificando...' : 'Entrar al Sistema'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setManualLogin(false)}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-orange-500 transition-colors mt-4 block mx-auto"
                  >
                    Volver a Google
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

if (user && !user.approved && user.email !== 'capsfarmaciasabatto@gmail.com' && user.uid !== 'admin-manual') {
  return (
    <div className="min-h-screen bg-slate-200 flex flex-col items-center justify-center p-4 font-sans text-center">
      {/* ... todo el diseño de Acceso Pendiente ... */}
    </div>
  );
}

  return (
    <div className="min-h-screen bg-slate-200 text-slate-900 font-sans pb-20">
      <header className="sticky top-0 z-40 bg-white shadow-md border-b border-white px-4 py-4 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-orange-600 p-2 rounded-xl text-white shadow-md">
              <HeartPulse size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-800">CardioStock</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-orange-500 font-black">Farmacia Sabatto</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
             <div className="hidden sm:flex flex-col items-end pr-6 border-r border-slate-100">
                <p className="text-sm font-black text-slate-800 lowercase">{user.displayName || user.email}</p>
                <div className="flex items-center gap-3 mt-1">
                   {user.email === 'capsfarmaciasabatto@gmail.com' && (
                     <button 
                        onClick={() => setIsSelectingRole(true)} 
                        className="text-[9px] font-black uppercase tracking-widest text-orange-500 hover:text-orange-600 transition-colors"
                      >
                       Cambiar Perfil
                     </button>
                   )}
                   <span className={cn(
                     "text-[8px] font-black uppercase px-2 py-1 rounded-lg tracking-[0.1em] shadow-sm",
                     user.role === 'FARMACEUTICO' ? "bg-slate-900 text-white" :
                     user.role === 'TECNICO' ? "bg-orange-600 text-white" :
                     "bg-white text-slate-400 border border-slate-200"
                   )}>
                     PERFIL: {user.role}
                   </span>
                </div>
             </div>
             <button onClick={handleSignOut} className="p-3 rounded-2xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all border border-transparent hover:border-red-100">
               <LogOut size={20} />
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-10 md:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <h2 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">Inventario de Muestras</h2>
            <p className="text-slate-500 font-medium">Control de stock FEFO para cardiología.</p>
          </div>
          <div className="flex flex-wrap gap-4">
            {isFarmaceutico && (
              <>
                <button 
                  onClick={() => {
                    const doc = new jsPDF();
                    
                    // Header
                    doc.setFontSize(22);
                    doc.setTextColor(30, 41, 59);
                    doc.text("Farmacia Sabatto", 14, 20);
                    
                    doc.setFontSize(12);
                    doc.setTextColor(100, 116, 139);
                    doc.text("Informe de Inventario Actual", 14, 28);
                    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 34);

                    const tableData = medicines.map(m => [
                      m.droga,
                      m.nombreComercial,
                      m.familia || '-',
                      m.ubicacion || '-',
                      m.stockActual.toString(),
                      (m.minStock || 0).toString()
                    ]);

                    autoTable(doc, {
                      startY: 45,
                      head: [["Medicamento", "Marca", "Familia", "Ubicación", "Stock", "Mín."]],
                      body: tableData,
                      theme: 'striped',
                      headStyles: { fillColor: [30, 41, 59], fontStyle: 'bold' },
                      styles: { fontSize: 9 }
                    });

                    doc.save(`inventario_${new Date().toISOString().split('T')[0]}.pdf`);
                  }}
                  className="bg-slate-900 text-white px-6 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-lg"
                >
                  <FileText size={20} />
                  Exportar PDF Inventario
                </button>
                <button 
                  onClick={() => setShowExpirationModal(true)}
                  className="bg-white text-slate-600 px-6 py-4 rounded-2xl font-bold border border-slate-200 flex items-center gap-2 hover:bg-slate-50 transition-all"
                >
                  <Calendar size={20} className="text-amber-500" />
                  Próximos Vencimientos
                </button>
                <button 
                  onClick={() => setShowAuditModal(true)}
                  className="bg-white text-slate-600 px-6 py-4 rounded-2xl font-bold border border-slate-200 flex items-center gap-2 hover:bg-slate-50 transition-all"
                >
                  <History size={20} />
                  Auditoría
                </button>
                <button 
                  onClick={() => setShowUsersModal(true)}
                  className="bg-slate-800 text-white px-6 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-700 transition-all shadow-lg"
                >
                  <List size={20} className="text-orange-400" />
                  Usuarios
                </button>
              </>
            )}
            {isTecnico && (
              <button 
                onClick={() => setShowAddMedicineModal(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-lg shadow-orange-100 flex items-center gap-2"
              >
                <Plus size={20} />
                Agregar Medicamento
              </button>
            )}
            {medicines.length === 0 && (
              <button onClick={handleSeedData} disabled={isSeeding} className="bg-slate-100 text-slate-600 px-6 py-4 rounded-2xl font-bold">
                {isSeeding ? '...' : 'Cargar Inicial'}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-[3rem] shadow-xl border-2 border-white ring-1 ring-orange-100 mb-10 flex gap-4 items-center">
            <Search className="ml-5 text-orange-400" size={24} />
            <input 
              type="text" 
              placeholder="Buscar por droga, marca o grupo..."
              className="flex-1 bg-transparent border-none py-4 text-lg font-black placeholder:text-slate-300 focus:ring-0 text-slate-800"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button 
              onClick={() => setFilterLowStock(!filterLowStock)}
              className={cn(
                "px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2",
                filterLowStock ? "bg-red-500 text-white shadow-lg shadow-red-100" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
              )}
            >
              <AlertCircle size={14} />
              Stock Bajo
            </button>

            <div className="h-8 w-px bg-slate-100 mx-2 hidden sm:block" />

            <div className="hidden sm:flex bg-slate-50 p-1 rounded-xl gap-1">
              <button 
                onClick={() => setSortBy('droga')}
                className={cn(
                  "px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 transition-all",
                  sortBy === 'droga' ? "bg-white text-orange-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <ArrowDownAz size={12} /> Az
              </button>
              <button 
                onClick={() => setSortBy('familia')}
                className={cn(
                  "px-3 py-2 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 transition-all",
                  sortBy === 'familia' ? "bg-white text-orange-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Tags size={12} /> Familia
              </button>
            </div>

            <div className="h-8 w-px bg-slate-100 mx-2 hidden sm:block" />

            <div className="hidden sm:flex bg-slate-50 p-1 rounded-xl gap-1 mr-2">
              <button 
                onClick={() => setViewType('grid')}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  viewType === 'grid' ? "bg-white text-orange-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <LayoutGrid size={18} />
              </button>
              <button 
                onClick={() => setViewType('list')}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  viewType === 'list' ? "bg-white text-orange-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <List size={18} />
              </button>
            </div>
        </div>

        {viewType === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AnimatePresence mode="popLayout">
              {filteredMedicines.map(m => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "bg-white rounded-[3rem] p-8 shadow-lg border-2 transition-all group",
                    m.stockActual <= (m.minStock || 0) 
                      ? "border-red-300 shadow-red-200/20" 
                      : "border-white ring-1 ring-slate-100 hover:shadow-2xl hover:border-orange-200 hover:ring-orange-100"
                  )}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex gap-2">
                      <span className="text-[10px] uppercase font-black tracking-widest text-orange-400 bg-orange-50 px-3 py-1.5 rounded-full">{m.familia || 'General'}</span>
                      {m.stockActual <= (m.minStock || 0) && (
                        <span className="text-[10px] uppercase font-black tracking-widest text-white bg-red-500 px-3 py-1.5 rounded-full flex items-center gap-1">
                          <AlertCircle size={10} /> Stock Bajo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isFarmaceutico && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingMedicine(m);
                            setShowEditMedicineModal(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-orange-500 hover:bg-orange-50 transition-all"
                        >
                           <Plus size={14} className="rotate-45" />
                        </button>
                      )}
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <MapPin size={12} />
                        <span className="text-[10px] font-bold">{m.ubicacion}</span>
                      </div>
                    </div>
                  </div>

                  <h3 className="text-xl font-black text-slate-800 mb-1 uppercase tracking-tight group-hover:text-orange-600 transition-colors leading-tight">{m.droga}</h3>
                  <p className="text-sm font-medium text-slate-400 mb-6 italic leading-relaxed">{m.nombreComercial}</p>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Forma</p>
                        <p className="text-xs font-bold text-slate-700 truncate">{m.presentacion}</p>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                        <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1">Stock Actual</p>
                        <p className="text-xl font-black text-orange-600">{m.stockActual}</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => {
                      setSelectedMedicine(m);
                      setShowMovementModal(true);
                    }}
                    className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg hover:bg-slate-800 transition-all active:scale-95"
                  >
                    <ClipboardList size={18} />
                    Movimientos & FEFO
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-white rounded-[3rem] shadow-xl border-4 border-white ring-1 ring-slate-200 overflow-hidden">
             <div className="grid grid-cols-12 gap-4 px-8 py-6 border-b border-slate-100 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                <div className="col-span-5">Droga / Marca</div>
                <div className="col-span-3">Grupo / Familia</div>
                <div className="col-span-1 text-center">Stock</div>
                <div className="col-span-1 text-center">Ubic.</div>
                <div className="col-span-2 text-right">Acción</div>
             </div>
             <div className="divide-y divide-slate-50">
                <AnimatePresence mode="popLayout">
                  {filteredMedicines.map(m => (
                    <motion.div 
                      key={m.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={cn(
                        "grid grid-cols-12 gap-4 px-8 py-4 items-center group hover:bg-orange-50/30 transition-colors",
                        m.stockActual <= (m.minStock || 0) && "bg-red-50/30"
                      )}
                    >
                       <div className="col-span-5">
                          <p className="font-black text-slate-800 uppercase text-sm leading-tight">{m.droga}</p>
                          <p className="text-[11px] font-medium text-slate-400 italic leading-tight">{m.nombreComercial}</p>
                       </div>
                       <div className="col-span-3">
                          <span className="text-[10px] font-black uppercase text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                            {m.familia || '-'}
                          </span>
                       </div>
                       <div className="col-span-1 text-center font-black">
                          <span className={cn(
                            "text-base", 
                            m.stockActual <= (m.minStock || 0) ? "text-red-500" : "text-orange-600"
                          )}>
                            {m.stockActual}
                          </span>
                       </div>
                       <div className="col-span-1 text-center text-[10px] font-bold text-slate-400">
                          {m.ubicacion || '-'}
                       </div>
                       <div className="col-span-2 text-right">
                          <button 
                             onClick={() => {
                              setSelectedMedicine(m);
                              setShowMovementModal(true);
                            }}
                            className="bg-slate-900 text-white p-2.5 rounded-xl hover:bg-orange-600 transition-all active:scale-90"
                          >
                            <ClipboardList size={16} />
                          </button>
                       </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
             </div>
          </div>
        )}
      </main>

      {/* Movement Modal */}
      <AnimatePresence>
        {showMovementModal && selectedMedicine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowMovementModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-4xl bg-white rounded-[3rem] shadow-2xl p-8 md:p-12 max-h-[90vh] overflow-hidden flex flex-col">
              <div className="flex justify-between items-start mb-10">
                <div className="space-y-1">
                   <p className="text-xs font-black text-orange-500 uppercase tracking-widest">{selectedMedicine.nombreComercial}</p>
                   <h2 className="text-3xl font-black text-slate-800 uppercase">{selectedMedicine.droga}</h2>
                </div>
                <button onClick={() => setShowMovementModal(false)} className="bg-slate-100 p-2 rounded-full text-slate-400"><X size={24} /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 overflow-y-auto">
                <div className="space-y-8">
                  {isTecnico ? (
                    <>
                      <MovementForm 
                        type="ingreso" 
                        title="Ingreso de Stock" 
                        onConfirm={(q, e, adj, just) => registerMovement('ingreso', q, e, adj, just)} 
                      />
                      <MovementForm 
                        type="dispensa" 
                        title="Dispensa (FEFO)" 
                        onConfirm={(q, e, adj, just) => registerMovement('dispensa', q, undefined, adj, just)} 
                      />
                    </>
                  ) : (
                    <div className="bg-slate-50 p-8 rounded-[2rem] text-center border-2 border-slate-100">
                      <AlertCircle size={40} className="text-slate-300 mx-auto mb-4" />
                      <p className="text-slate-500 font-bold">Solo personal Técnico o Farmacéutico puede registrar movimientos.</p>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 rounded-[2.5rem] p-8">
                   <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                     <Calendar size={20} className="text-slate-400" />
                     Vencimientos Vigentes (FEFO)
                   </h3>
                   <BatchList 
                    medicineId={selectedMedicine.id} 
                    isAdmin={isFarmaceutico} 
                    onEdit={(b) => {
                      setEditingBatch(b);
                      setShowEditBatchModal(true);
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Medicine Modal */}
      <AnimatePresence>
        {showAddMedicineModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddMedicineModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl p-10">
              <h2 className="text-3xl font-black text-slate-800 mb-8 uppercase">Nuevo Medicamento</h2>
              <form onSubmit={handleAddMedicine} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <InputGroup label="Droga / Principio" value={newMedicine.droga} onChange={v => setNewMedicine({...newMedicine, droga: v})} required />
                <InputGroup label="Nombre Comercial" value={newMedicine.nombreComercial} onChange={v => setNewMedicine({...newMedicine, nombreComercial: v})} required />
                <InputGroup label="Presentación" value={newMedicine.presentacion} onChange={v => setNewMedicine({...newMedicine, presentacion: v})} />
                <InputGroup label="Familia" value={newMedicine.familia} onChange={v => setNewMedicine({...newMedicine, familia: v})} />
                <InputGroup label="Ubicación" value={newMedicine.ubicacion} onChange={v => setNewMedicine({...newMedicine, ubicacion: v})} />
                <InputGroup 
                  label="Stock Mínimo (Alerta)" 
                  type="number"
                  value={newMedicine.minStock} 
                  onChange={v => setNewMedicine({...newMedicine, minStock: v})} 
                />
                <div className="sm:col-span-2">
                  <InputGroup label="Observaciones" value={newMedicine.observaciones} onChange={v => setNewMedicine({...newMedicine, observaciones: v})} />
                </div>
                <div className="sm:col-span-2 flex gap-4 mt-4">
                   <button type="button" onClick={() => setShowAddMedicineModal(false)} className="flex-1 py-4 font-bold text-slate-400">Cancelar</button>
                   <button type="submit" className="flex-[2] bg-orange-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-100">Guardar</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Medicine Modal */}
      <AnimatePresence>
        {showEditMedicineModal && editingMedicine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditMedicineModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl p-10">
              <h2 className="text-3xl font-black text-slate-800 mb-8 uppercase">Editar Medicamento</h2>
              <form onSubmit={handleUpdateMedicine} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <InputGroup label="Droga / Principio" value={editingMedicine.droga} onChange={v => setEditingMedicine({...editingMedicine, droga: v})} required />
                <InputGroup label="Nombre Comercial" value={editingMedicine.nombreComercial} onChange={v => setEditingMedicine({...editingMedicine, nombreComercial: v})} required />
                <InputGroup label="Presentación" value={editingMedicine.presentacion} onChange={v => setEditingMedicine({...editingMedicine, presentacion: v})} />
                <InputGroup label="Familia" value={editingMedicine.familia} onChange={v => setEditingMedicine({...editingMedicine, familia: v})} />
                <InputGroup label="Ubicación" value={editingMedicine.ubicacion} onChange={v => setEditingMedicine({...editingMedicine, ubicacion: v})} />
                <InputGroup 
                  label="Stock Mínimo (Alerta)" 
                  type="number"
                  value={editingMedicine.minStock} 
                  onChange={v => setEditingMedicine({...editingMedicine, minStock: parseInt(v as any) || 0})} 
                />
                <div className="sm:col-span-2">
                  <InputGroup label="Observaciones" value={editingMedicine.observaciones} onChange={v => setEditingMedicine({...editingMedicine, observaciones: v})} />
                </div>
                <div className="sm:col-span-2 flex gap-4 mt-4">
                   <button type="button" onClick={() => setShowEditMedicineModal(false)} className="flex-1 py-4 font-bold text-slate-400">Cancelar</button>
                   <button type="submit" className="flex-[2] bg-orange-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-100">Actualizar</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Batch Modal */}
      <AnimatePresence>
        {showEditBatchModal && editingBatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditBatchModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10">
              <h2 className="text-2xl font-black text-slate-800 mb-6 uppercase">Corregir Lote</h2>
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 ml-2">Vencimiento (YYYY-MM)</label>
                  <input 
                    type="month"
                    value={editingBatch.vencimiento ?? ''}
                    onChange={e => setEditingBatch({...editingBatch, vencimiento: e.target.value})}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-bold text-slate-700 mt-2 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 ml-2">Cantidad en Stock</label>
                  <input 
                    type="number"
                    value={editingBatch.quantity ?? 0}
                    onChange={e => setEditingBatch({...editingBatch, quantity: parseInt(e.target.value) || 0})}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 font-bold text-slate-700 mt-2 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                   <button type="button" onClick={() => setShowEditBatchModal(false)} className="flex-1 py-4 font-bold text-slate-400">Cancelar</button>
                   <button 
                    onClick={() => handleUpdateBatch(editingBatch.id, editingBatch.quantity, editingBatch.vencimiento)}
                    className="flex-[2] bg-orange-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-100"
                   >
                     Guardar
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Expiration Alerts Modal */}
      <AnimatePresence>
        {showExpirationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowExpirationModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-4xl bg-white rounded-[3rem] shadow-2xl p-10 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                     <AlertCircle size={24} />
                   </div>
                   <div>
                     <h2 className="text-3xl font-black text-slate-800 uppercase">Alertas de Vencimiento</h2>
                     <p className="text-slate-400 font-medium text-sm">Lotes que vencen en los próximos 90 días</p>
                   </div>
                </div>
                <button onClick={() => setShowExpirationModal(false)} className="bg-slate-100 p-2 rounded-full text-slate-400"><X size={24} /></button>
              </div>
              <div className="overflow-y-auto flex-1 pr-4">
                <ExpirationAlerts medicines={medicines} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Audit Modal */}
      <AnimatePresence>
        {showAuditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAuditModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-5xl bg-white rounded-[3rem] shadow-2xl p-10 max-h-[90vh] flex flex-col">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black text-slate-800 uppercase">Registro de Auditoría</h2>
                <button onClick={() => setShowAuditModal(false)} className="bg-slate-100 p-2 rounded-full text-slate-400"><X size={24} /></button>
              </div>
              <div className="overflow-y-auto flex-1 pr-4">
                <AuditLog />
              </div>
            </motion.div>
          </div>
        )}

        {showUsersModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowUsersModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              className="bg-white w-full max-w-5xl max-h-[85vh] rounded-[3rem] shadow-2xl relative z-10 overflow-hidden border border-slate-100 flex flex-col"
            >
              <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Gestión de Usuarios</h3>
                  <p className="text-xs font-bold text-slate-400">Apruebe accesos, cambie roles y asigne códigos de seguridad</p>
                </div>
                <button onClick={() => setShowUsersModal(false)} className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:text-red-500 transition-all">
                  <X size={24} />
                </button>
              </div>
              <div className="p-8 overflow-y-auto flex-1">
                <UsersManager />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

async function updateUserInfo(uid: string, data: any) {
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("MEDICO");
  const [newAccessCode, setNewAccessCode] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data: User[] = [];
      snap.forEach(doc => data.push({ uid: doc.id, ...doc.data() } as User));
      setUsers(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsubscribe();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    try {
      const cleanEmail = newEmail.toLowerCase().trim();
      const userData = {
        email: cleanEmail,
        displayName: newDisplayName,
        role: newRole,
        accessCode: newAccessCode,
        approved: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Use a consistent ID for pre-registered users based on email
      const tempId = `pre_${cleanEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
      await setDoc(doc(db, 'users', tempId), userData);
      
      setShowAddForm(false);
      setNewEmail("");
      setNewDisplayName("");
      setNewRole("MEDICO");
      setNewAccessCode("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    }
  };

  if (loading) return <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase tracking-widest text-[10px]">Cargando usuarios...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-slate-900 p-5 rounded-3xl shadow-xl text-white">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight">Acciones Rápidas</h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Pre-registre nuevos miembros</p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          className={cn(
            "px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2",
            showAddForm ? "bg-red-500 text-white" : "bg-orange-500 text-white"
          )}
        >
          {showAddForm ? <X size={14} /> : <Plus size={14} />}
          {showAddForm ? 'Cancelar' : 'Nuevo Usuario'}
        </button>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleCreateUser} className="bg-white p-6 rounded-3xl border-2 border-orange-500/20 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mb-4">
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase font-black tracking-widest text-slate-400 ml-1">Email</label>
                <input 
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="ejemplo@google.com"
                  className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase font-black tracking-widest text-slate-400 ml-1">Nombre</label>
                <input 
                  type="text"
                  value={newDisplayName}
                  onChange={e => setNewDisplayName(e.target.value)}
                  placeholder="Juan Pérez"
                  className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase font-black tracking-widest text-slate-400 ml-1">Perfil</label>
                <select 
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="MEDICO">MÉDICO</option>
                  <option value="TECNICO">TÉCNICO</option>
                  <option value="FARMACEUTICO">FARMACÉUTICO</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase font-black tracking-widest text-slate-400 ml-1">Acceso</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={newAccessCode}
                    onChange={e => setNewAccessCode(e.target.value)}
                    placeholder="Pass"
                    className="flex-1 bg-slate-50 border-none rounded-lg px-3 py-2 text-xs font-bold focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                  <button type="submit" className="bg-orange-500 text-white p-2 rounded-lg hover:bg-orange-600 transition-all shadow-lg active:scale-95">
                    <Check size={18} />
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-3">
        {users.map(u => (
        <div key={u.uid} className={cn(
          "bg-white p-6 rounded-3xl border-2 border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4 transition-all hover:shadow-xl hover:border-orange-100",
          !u.approved && "border-amber-200 bg-amber-50/20"
        )}>
          <div className="flex items-center gap-4 shrink-0 min-w-0">
             <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center border border-slate-100 shrink-0">
               {u.photoURL ? (
                 <img src={u.photoURL} alt="" className="w-full h-full rounded-xl object-cover" />
               ) : (
                 <HeartPulse className="text-slate-200" size={20} />
               )}
             </div>
             <div className="truncate">
               <p className="text-sm font-black text-slate-800 truncate leading-tight">{u.displayName || 'Sin nombre'}</p>
               <p className="text-[10px] font-medium text-slate-400 truncate">{u.email}</p>
             </div>
             <div className="flex items-center gap-2 shrink-0">
               <span className={cn(
                 "text-[8px] font-black uppercase px-2 py-0.5 rounded shadow-sm tracking-tighter",
                 u.approved ? "bg-orange-500 text-white" : "bg-amber-500 text-white"
               )}>
                 {u.approved ? 'OK' : 'PND'}
               </span>
             </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 xl:gap-6 justify-between xl:justify-end flex-1">
            <div className="flex flex-col gap-1">
              <label className="text-[8px] uppercase font-black tracking-widest text-slate-400 ml-0.5">Perfil</label>
              <div className="flex gap-1">
                {(['MEDICO', 'TECNICO', 'FARMACEUTICO'] as UserRole[]).map(r => (
                  <button 
                    key={r}
                    onClick={() => updateUserInfo(u.uid, { role: r })}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[9px] font-black transition-all",
                      u.role === r ? "bg-slate-800 text-white shadow-sm" : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1 max-w-[100px]">
              <label className="text-[8px] uppercase font-black tracking-widest text-slate-400 ml-0.5">Cód. Acceso</label>
              <input 
                type="text"
                placeholder="---"
                value={u.accessCode || ''}
                onChange={e => updateUserInfo(u.uid, { accessCode: e.target.value })}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1 text-[10px] font-bold w-full focus:ring-1 focus:ring-orange-500 outline-none transition-all"
              />
            </div>

            <div className="flex items-center gap-2 xl:pl-4 xl:border-l border-slate-200">
               <button 
                 onClick={() => updateUserInfo(u.uid, { approved: !u.approved })}
                 className={cn(
                   "px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all active:scale-95",
                   u.approved ? "bg-red-50 text-red-500 hover:bg-red-500 hover:text-white" : "bg-orange-500 text-white shadow-md shadow-orange-100"
                 )}
               >
                 {u.approved ? 'Revocar' : 'Aprobar'}
               </button>
            </div>
          </div>
        </div>
      ))}
      {users.length === 0 && (
        <div className="py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">No hay usuarios registrados</div>
      )}
      </div>
    </div>
  );
}

function RoleCard({ title, icon, description, color, textColor, onClick }: any) {
  return (
    <motion.button
      whileHover={{ y: -10, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "p-10 rounded-[4rem] border-4 border-white ring-1 ring-slate-200 shadow-xl transition-all text-left flex flex-col h-full group",
        color
      )}
    >
      <div className={cn("p-5 rounded-3xl mb-8 w-fit transition-transform group-hover:scale-110", textColor, "bg-opacity-10", roleIconBg(textColor))}>
         {icon}
      </div>
      <h3 className={cn("text-2xl font-black mb-4 uppercase tracking-tight", textColor)}>{title}</h3>
      <p className={cn("text-sm font-medium leading-relaxed opacity-60 flex-1", textColor)}>
        {description}
      </p>
      <div className={cn("mt-10 flex items-center gap-2 font-black uppercase tracking-widest text-[10px]", textColor)}>
        <span>Seleccionar Perfil</span>
        <Plus size={12} className="transition-transform group-hover:rotate-90" />
      </div>
    </motion.button>
  );
}

function roleIconBg(textColor: string) {
  if (textColor.includes('white')) return 'bg-white';
  if (textColor.includes('orange')) return 'bg-orange-600';
  return 'bg-slate-800';
}

function InputGroup({ label, value, onChange, placeholder, required, type = "text" }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 ml-2">{label}</label>
      <input 
        required={required}
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-100 border-none rounded-2xl px-5 py-4 font-bold text-slate-700 focus:ring-2 focus:ring-orange-500 outline-none shadow-inner"
      />
    </div>
  );
}

function MovementForm({ type, title, onConfirm }: { type: MovementType, title: string, onConfirm: (q: number, e?: string, isAdj?: boolean, just?: string) => void }) {
  const [quantity, setQuantity] = useState("1");
  const [expiryMonth, setExpiryMonth] = useState(new Date().getMonth() + 1);
  const [expiryYear, setExpiryYear] = useState(new Date().getFullYear());
  const [isAdjustment, setIsAdjustment] = useState(false);
  const [justification, setJustification] = useState("");
  const isIngreso = type === 'ingreso';

  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const handleConfirm = () => {
    const q = parseInt(quantity);
    if (isNaN(q) || q <= 0) {
      alert("Ingrese una cantidad válida");
      return;
    }

    if (isIngreso) {
      // Formatear como YYYY-MM para mantener consistencia en la DB
      const formattedMonth = expiryMonth.toString().padStart(2, '0');
      const expiry = `${expiryYear}-${formattedMonth}`;
      onConfirm(q, expiry, isAdjustment, justification);
    } else {
      onConfirm(q, undefined, isAdjustment, justification);
    }
  };

  return (
    <div className={cn("p-8 rounded-[3rem] border-4 shadow-xl border-white ring-1 ring-slate-100", isIngreso ? "bg-orange-50/40" : "bg-amber-50/40")}>
      <h4 className={cn("text-xs font-black uppercase tracking-widest mb-6", isIngreso ? "text-orange-600" : "text-amber-600")}>{title}</h4>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 ml-2">Cantidad</label>
          <div className="flex items-center gap-3">
              <button type="button" onClick={() => setQuantity(q => Math.max(1, parseInt(q || "0") - 1).toString())} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform"><Minus size={16} /></button>
              <input type="number" value={quantity ?? ''} onChange={e => setQuantity(e.target.value)} className="flex-1 bg-white rounded-xl py-3 text-center font-black text-lg focus:outline-none shadow-sm" />
              <button type="button" onClick={() => setQuantity(q => (parseInt(q || "0") + 1).toString())} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform"><Plus size={16} /></button>
          </div>
        </div>

        {isIngreso && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 ml-2">Vencimiento (Mes / Año)</label>
            <div className="flex gap-2">
              <select 
                value={expiryMonth ?? 1} 
                onChange={e => setExpiryMonth(parseInt(e.target.value))}
                className="flex-[2] bg-white rounded-xl py-3 px-4 font-bold text-sm shadow-sm border-none focus:ring-2 focus:ring-orange-500 outline-none"
              >
                {months.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <input 
                type="number" 
                placeholder="Año"
                value={expiryYear ?? new Date().getFullYear()}
                onChange={e => setExpiryYear(parseInt(e.target.value))}
                className="flex-1 bg-white rounded-xl py-3 px-4 font-bold text-sm shadow-sm border-none focus:ring-2 focus:ring-orange-500 text-center outline-none"
              />
            </div>
          </div>
        )}

        <div className="pt-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={cn(
              "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
              isAdjustment ? "bg-red-500 border-red-500 text-white" : "border-slate-200 bg-white group-hover:border-slate-300"
            )} onClick={() => setIsAdjustment(!isAdjustment)}>
              {isAdjustment && <X size={14} className="stroke-[4]" />}
            </div>
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-500">¿Es un ajuste de inventario?</span>
          </label>
        </div>

        {isAdjustment && (
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-slate-400 ml-2">Justificación del ajuste</label>
            <textarea 
              value={justification}
              onChange={e => setJustification(e.target.value)}
              placeholder="Ej: Faltante detectado, rotura, sobra de stock..."
              className="w-full bg-white rounded-xl py-3 px-4 font-bold text-sm shadow-sm border-none focus:ring-2 focus:ring-red-400 outline-none min-h-[80px]"
            />
          </div>
        )}

        <button onClick={handleConfirm} className={cn("w-full py-4 rounded-2xl font-black text-white shadow-lg transition-all active:scale-95 mt-2", isIngreso ? "bg-orange-500 shadow-orange-50 hover:bg-orange-600" : "bg-amber-500 shadow-amber-50 hover:bg-amber-600")}>
          Confirmar {isAdjustment ? 'AJUSTE' : (isIngreso ? 'Ingreso' : 'Dispensa')}
        </button>
      </div>
    </div>
  );
}

function BatchList({ medicineId, isAdmin, onEdit }: { medicineId: string, isAdmin?: boolean, onEdit?: (b: Batch) => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, `medicines/${medicineId}/batches`), where('quantity', '>', 0), orderBy('vencimiento', 'asc'));
    return onSnapshot(q, (snap) => {
      const data: Batch[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Batch));
      setBatches(data);
      setLoading(false);
    });
  }, [medicineId]);

  if (loading) return <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase tracking-widest text-[10px]">Cargando lotes...</div>;

  return (
    <div className="space-y-4">
      {batches.length > 0 ? batches.map(b => (
        <div key={b.id} className="bg-slate-50 p-6 rounded-[2rem] border-2 border-white shadow-sm flex items-center justify-between group hover:bg-white hover:shadow-md transition-all">
          <div className="flex items-center gap-4">
             <Calendar size={18} className="text-amber-500" />
             <div>
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Vencimiento</p>
               <p className="font-bold text-slate-700 leading-none">{b.vencimiento}</p>
             </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Stock</p>
               <p className="font-black text-orange-600 text-lg leading-none">{b.quantity}</p>
            </div>
            {isAdmin && (
              <button 
                onClick={() => onEdit?.(b)}
                className="bg-slate-50 p-2 rounded-xl text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-all opacity-0 group-hover:opacity-100"
              >
                <Plus size={16} className="rotate-45" />
              </button>
            )}
          </div>
        </div>
      )) : (
        <div className="py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">Sin stock por lotes</div>
      )}
    </div>
  );
}

function ExpirationAlerts({ medicines }: { medicines: Medicine[] }) {
  const [allBatches, setAllBatches] = useState<(Batch & { medicine: Medicine })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchAll = async () => {
      const results: (Batch & { medicine: Medicine })[] = [];
      
      // We fetch batches for all medicines
      // In a large app, we would use a collection group query
      for (const m of medicines) {
        const snap = await getDocs(query(
          collection(db, `medicines/${m.id}/batches`),
          where('quantity', '>', 0)
        ));
        snap.forEach(d => {
          results.push({ id: d.id, ...d.data(), medicine: m } as any);
        });
      }

      if (isMounted) {
        // Sort by expiration date
        const sorted = results.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
        
        // Filter those expiring in the next 90 days (roughly)
        const ninetyDaysFromNow = new Date();
        ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
        const limitStr = ninetyDaysFromNow.toISOString().substring(0, 7); // YYYY-MM

        const upcoming = sorted.filter(b => b.vencimiento <= limitStr);
        setAllBatches(upcoming);
        setLoading(false);
      }
    };

    fetchAll();
    return () => { isMounted = false; };
  }, [medicines]);

  if (loading) return <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase tracking-widest text-[10px]">Analizando fechas de vencimiento...</div>;

  return (
    <div className="space-y-4">
      {allBatches.length > 0 ? allBatches.map(b => {
        const isExpired = b.vencimiento <= new Date().toISOString().substring(0, 7);
        return (
          <div key={`${b.medicine.id}-${b.id}`} className={cn(
            "p-8 rounded-[2.5rem] border-4 border-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:shadow-xl",
            isExpired ? "bg-red-50" : "bg-amber-50/50"
          )}>
            <div className="flex items-center gap-4">
               <div className={cn("p-3 rounded-2xl", isExpired ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600")}>
                 <Calendar size={20} />
               </div>
               <div>
                 <p className="text-xs font-black text-slate-800 uppercase leading-none mb-1">{b.medicine.droga}</p>
                 <p className="text-[10px] font-bold text-slate-400 italic mb-1">{b.medicine.nombreComercial}</p>
                 <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded", isExpired ? "bg-red-600 text-white" : "bg-amber-500 text-white")}>
                      {isExpired ? 'VENCIDO' : 'PRÓXIMO'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">Lote: {b.id.substring(0, 8)}</span>
                 </div>
               </div>
            </div>
            
            <div className="flex-1 md:text-center">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Vencimiento</p>
               <p className={cn("font-black text-lg", isExpired ? "text-red-600" : "text-amber-600")}>{b.vencimiento}</p>
            </div>

            <div className="text-right">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Stock en Lote</p>
               <p className="font-black text-slate-700 text-lg leading-none">{b.quantity}</p>
            </div>
          </div>
        );
      }) : (
        <div className="py-20 text-center">
          <div className="w-16 h-16 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package size={32} />
          </div>
          <p className="text-slate-300 font-bold uppercase tracking-widest text-[10px]">No hay vencimientos próximos detectados</p>
        </div>
      )}
    </div>
  );
}

function AuditLog() {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'global_movements'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data: any[] = [];
      snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setMovements(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'global_movements');
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="py-20 text-center animate-pulse text-slate-300 font-bold uppercase tracking-widest text-[10px]">Cargando auditoría...</div>;

  const exportMovements = () => {
    if (movements.length === 0) return;
    
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text("Farmacia Sabatto", 14, 20);
    
    doc.setFontSize(14);
    doc.setTextColor(100, 116, 139);
    doc.text("Informe de Auditoría de Movimientos", 14, 28);
    
    doc.setFontSize(10);
    doc.text(`Fecha de emisión: ${new Date().toLocaleString()}`, 14, 36);

    const tableData = movements.map(m => [
      m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : '',
      m.medicineName,
      `${m.type === 'ingreso' ? 'INGRESO' : 'DISPENSA'}${m.isAdjustment ? ' (AJUSTE)' : ''}`,
      m.quantity.toString(),
      `${m.userEmail || m.userName}${m.justification ? `\nJustif: ${m.justification}` : ''}`
    ]);

    autoTable(doc, {
      startY: 45,
      head: [["Fecha", "Medicamento", "Tipo", "Cant.", "Usuario / Justif."]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 40 },
        2: { cellWidth: 25 },
        3: { cellWidth: 15 },
        4: { cellWidth: 'auto' }
      }
    });

    doc.save(`auditoria_movimientos_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <button 
          onClick={exportMovements}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all text-sm"
        >
          <FileText size={18} />
          Exportar PDF Auditoría
        </button>
      </div>
      {movements.length > 0 ? movements.map(m => (
        <div key={m.id} className={cn(
          "bg-white p-8 rounded-[2.5rem] border-4 border-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:shadow-lg",
          m.isAdjustment && "ring-2 ring-red-100"
        )}>
          <div className="flex items-center gap-4">
             <div className={cn(
               "p-3 rounded-2xl", 
               m.isAdjustment ? "bg-red-500 text-white" : (m.type === 'ingreso' ? "bg-orange-100 text-orange-600" : "bg-amber-100 text-amber-600")
             )}>
               {m.isAdjustment ? <AlertCircle size={20} /> : (m.type === 'ingreso' ? <Plus size={20} /> : <Minus size={20} />)}
             </div>
             <div>
               <div className="flex items-center gap-2">
                 <p className="text-xs font-black text-slate-800 uppercase leading-tight">{m.medicineName}</p>
                 {m.isAdjustment && <span className="text-[8px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded tracking-tighter">AJUSTE</span>}
               </div>
               {m.medicineComercialName && <p className="text-[9px] font-medium text-slate-400 italic mb-1">{m.medicineComercialName}</p>}
               <p className="text-[10px] font-bold text-slate-500">Cantidad: {m.quantity}</p>
               {m.justification && (
                 <p className="text-[10px] mt-2 text-red-600 font-bold bg-white/50 px-3 py-1 rounded-lg border border-red-100 italic">
                   "{m.justification}"
                 </p>
               )}
             </div>
          </div>
          <div className="flex-1 md:text-center">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Realizado por</p>
             <p className="font-bold text-slate-700">{m.userName || m.userEmail}</p>
             <p className="text-[9px] text-slate-400">{m.userEmail}</p>
          </div>
          <div className="text-right">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Fecha</p>
             <p className="font-bold text-slate-600 text-xs">
               {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : 'Reciente'}
             </p>
          </div>
        </div>
      )) : (
        <div className="py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">No hay registros de movimientos</div>
      )}
    </div>
  );
}
