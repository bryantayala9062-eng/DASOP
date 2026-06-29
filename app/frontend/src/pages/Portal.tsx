import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, LayoutDashboard, ChevronRight } from 'lucide-react';

const Portal = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-20%] left-[-10%] w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[30rem] h-[30rem] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="text-center mb-12 relative z-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight">
          Portal <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-emerald-400">Unificado</span>
        </h1>
        <p className="text-slate-400 text-lg">Selecciona el sistema al que deseas acceder</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl relative z-10">
        
        {/* DashOP Card */}
        <button
          onClick={() => navigate('/login')}
          className="group relative bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 p-8 rounded-2xl hover:bg-slate-800 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/10 hover:border-indigo-500/30 flex flex-col text-left overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          
          <div className="bg-indigo-500/20 text-indigo-400 w-14 h-14 rounded-xl flex items-center justify-center mb-6 shadow-inner relative z-10">
            <LayoutDashboard size={28} />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2 relative z-10 group-hover:text-indigo-300 transition-colors">
            DashOP
          </h2>
          
          <p className="text-slate-400 text-sm leading-relaxed mb-8 flex-1 relative z-10">
            Sistema Operativo Principal. Gestión de contratos legales, materialidad, facturas, respaldos y reportes XML.
          </p>
          
          <div className="flex items-center text-indigo-400 font-medium text-sm relative z-10">
            <span>Iniciar sesión</span>
            <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Compliance OP Card */}
        <button
          onClick={() => window.location.href = 'https://compliance.op-dash.com'}
          className="group relative bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 p-8 rounded-2xl hover:bg-slate-800 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald-500/10 hover:border-emerald-500/30 flex flex-col text-left overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-bl-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
          
          <div className="bg-emerald-500/20 text-emerald-400 w-14 h-14 rounded-xl flex items-center justify-center mb-6 shadow-inner relative z-10">
            <ShieldCheck size={28} />
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2 relative z-10 group-hover:text-emerald-400 transition-colors">
            Compliance OP
          </h2>
          
          <p className="text-slate-400 text-sm leading-relaxed mb-8 flex-1 relative z-10">
            Módulo de evaluación y seguimiento integral. Monitoreo en tiempo real de KPIs, cumplimiento de tareas internas, gestión de fechas límite y control de riesgos operativos.
          </p>
          
          <div className="flex items-center text-emerald-400 font-medium text-sm relative z-10">
            <span>Iniciar sesión</span>
            <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

      </div>
      
    </div>
  );
};

export default Portal;
