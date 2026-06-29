import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import LegalDashboard from './pages/legal/LegalDashboard';
import LegalContractForm from './pages/legal/LegalContractForm';
import MaterialidadUpload from './pages/materialidad/MaterialidadUpload';
import MaterialidadHistory from './pages/materialidad/MaterialidadHistory';
import DashboardXML from './pages/dashboard/DashboardXML';
import Profile from './pages/Profile';
import UsersAdmin from './pages/UsersAdmin';

import Login from './pages/Login';
import Portal from './pages/Portal';

// Espera a que el autologin termine antes de renderizar — nunca redirige a login
const LoadingGate = ({ children }: { children: React.ReactNode }) => {
  const { loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
      Iniciando...
    </div>
  );
  return <>{children}</>;
};

function AppRoutes() {
  const { user } = useAuth();

  if (!user) {
    return (
      <LoadingGate>
        <Routes>
          <Route path="/" element={<Portal />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </LoadingGate>
    );
  }

  return (
    <LoadingGate>
      <Routes>
        <Route path="/portal" element={<Portal />} />
        <Route path="/" element={<Home />} />

        {/* Módulo Legal */}
        <Route path="/legal" element={<LegalDashboard />} />
        <Route path="/legal/nuevo" element={<LegalContractForm />} />

        {/* Módulo Materialidad */}
        <Route path="/materialidad" element={<MaterialidadUpload />} />
        <Route path="/materialidad/historial" element={<MaterialidadHistory />} />

        {/* Módulo Dashboard XML */}
        <Route path="/dashboard" element={<DashboardXML />} />

        {/* Perfil de usuario */}
        <Route path="/perfil" element={<Profile />} />

        {/* Administración de usuarios (solo admin) */}
        <Route path="/usuarios" element={<UsersAdmin />} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </LoadingGate>

  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
