'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// 👇 AQUÍ PEGAS LAS CLAVES DEL NUEVO PROYECTO "ECOHEROE" 👇
const supabaseUrl = 'https://eeghgwwuemlfxwxvsjsz.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlZ2hnd3d1ZW1sZnh3eHZzanN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDU4MTMsImV4cCI6MjA4MDAyMTgxM30.-rO28sH0qqDW-ag-U5k4vRESfGCIZ3yZAjvf5OMW3d0'; 

const supabase = createClient(supabaseUrl, supabaseKey);

export default function EcoHeroe() {
  const [puntos, setPuntos] = useState(0); 
  const [cargandoDatos, setCargandoDatos] = useState(true);
  
  // Estados de IA y Reciclaje
  const [materialDetectado, setMaterialDetectado] = useState("");
  const [puntosGanados, setPuntosGanados] = useState(0);
  const [vistaCamara, setVistaCamara] = useState(false); 
  const [mensaje, setMensaje] = useState<{texto: string, tipo: 'exito' | 'info'} | null>(null);

  // --- 1. CONEXIÓN LIMPIA CON LA NUEVA BASE DE DATOS ---
  const refrescarPuntos = useCallback(async () => {
    try {
        // Ahora usamos la tabla 'eco_usuarios' y la columna 'puntos'
        // Usamos el ID 1 porque es una base de datos nueva y vacía
        const { data, error } = await supabase
            .from('eco_usuarios')
            .select('puntos') 
            .eq('id', 1) 
            .single();
        
        if (data) {
            setPuntos(data.puntos);
        } else {
            // Si no existe, creamos el primer usuario eco-amigable
            const { error: errorInsert } = await supabase
                .from('eco_usuarios')
                .insert([{ id: 1, puntos: 0 }]);
            
            if (!errorInsert) setPuntos(0);
        }
    } catch (error) {
        console.error("Error conectando a EcoBase:", error);
    }
    setCargandoDatos(false);
  }, []);

  useEffect(() => {
    refrescarPuntos(); 
    
    // Suscripción Realtime a la tabla correcta
    const canal = supabase
      .channel('eco-puntos-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'eco_usuarios' }, (payload) => {
        setPuntos(payload.new.puntos);
      })
      .subscribe();
      
    return () => { supabase.removeChannel(canal); };
  }, [refrescarPuntos]);

  // --- 2. LÓGICA DE RECICLAJE ---
  const analizarImagen = () => {
    setTimeout(() => {
        const materiales = [
            { nombre: "Botella PET", puntos: 10, color: "text-blue-500" },
            { nombre: "Lata Aluminio", puntos: 15, color: "text-gray-500" },
            { nombre: "Caja Cartón", puntos: 5, color: "text-orange-500" },
            { nombre: "Vidrio", puntos: 20, color: "text-green-500" }
        ];
        
        const detectado = materiales[Math.floor(Math.random() * materiales.length)];
        setMaterialDetectado(detectado.nombre);
        setPuntosGanados(detectado.puntos);
    }, 2000);
  };

  const confirmarReciclaje = async () => {
      const nuevosPuntos = puntos + puntosGanados;
      
      setPuntos(nuevosPuntos); // Feedback inmediato
      setVistaCamara(false);
      setMensaje({ texto: `¡Genial! +${puntosGanados} Puntos por ${materialDetectado}`, tipo: 'exito' });
      
      // Guardar en la nueva tabla
      await supabase.from('eco_usuarios').update({ puntos: nuevosPuntos }).eq('id', 1);
      await refrescarPuntos(); // Doble check
      
      setMaterialDetectado("");
      setPuntosGanados(0);
      setTimeout(() => setMensaje(null), 4000);
  };

  if (cargandoDatos) return (
    <div className="min-h-screen bg-green-900 flex flex-col items-center justify-center text-white gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-300"></div>
      <p className="font-bold">Conectando con la Eco-Nube...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-green-50 text-gray-800 font-sans flex justify-center items-center p-4">
      
      <div className="w-full max-w-sm h-[800px] bg-white rounded-[40px] border-8 border-green-900 overflow-hidden relative shadow-2xl flex flex-col">
        
        {/* HEADER */}
        <div className="pt-12 px-6 pb-6 bg-green-600 rounded-b-3xl shadow-lg z-10">
          <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-xl">🌿</div>
                <h3 className="font-bold text-white text-lg">EcoHéroe</h3>
             </div>
             <div className="bg-green-800 px-3 py-1 rounded-full text-xs text-green-200 font-mono">Nivel 1</div>
          </div>
          
          <div className="text-center mt-4">
             <p className="text-green-100 text-sm mb-1">Tus Eco-Puntos</p>
             <h1 className="text-6xl font-black text-white tracking-tighter">{puntos}</h1>
          </div>
        </div>

        {/* CUERPO */}
        <div className="flex-1 px-6 pt-8 overflow-y-auto pb-20 bg-green-50">
          
          <button 
            onClick={() => { setVistaCamara(true); analizarImagen(); }}
            className="w-full bg-white p-6 rounded-3xl shadow-xl border border-green-100 flex items-center gap-4 group hover:scale-[1.02] transition-transform mb-8"
          >
             <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-4xl group-hover:rotate-12 transition-transform">📸</div>
             <div className="text-left">
                <h3 className="font-bold text-xl text-gray-800">Escanear Residuo</h3>
                <p className="text-green-600 text-sm">Gana puntos reciclando</p>
             </div>
          </button>

          <h3 className="font-bold text-gray-700 mb-4 ml-1">Ranking Vecinal 🏆</h3>
          <div className="space-y-3">
             <FilaRanking puesto="1" nombre="Maria G." puntos="2,450" />
             <FilaRanking puesto="2" nombre="Tú" puntos={puntos} activo />
             <FilaRanking puesto="3" nombre="Juan P." puntos="1,200" />
             <FilaRanking puesto="4" nombre="Bodega Pepe" puntos="980" />
          </div>
        </div>

        {/* MODAL CÁMARA */}
        {vistaCamara && (
          <div className="absolute inset-0 bg-black z-50 flex flex-col items-center justify-center p-6 animate-fade-in">
             <div className="w-full h-full border-2 border-green-500 rounded-3xl relative overflow-hidden bg-gray-900">
                <div className="absolute inset-0 flex items-center justify-center">
                    {!materialDetectado ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-64 h-64 border-2 border-green-400 rounded-2xl relative animate-pulse flex items-center justify-center">
                                {/* Crosshair SVG */}
                                <svg className="w-12 h-12 text-green-500 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </div>
                            <p className="text-green-400 font-mono text-sm bg-black/50 px-3 py-1 rounded">Analizando objeto...</p>
                        </div>
                    ) : (
                        <div className="bg-white p-6 rounded-3xl w-full max-w-xs text-center animate-slide-up shadow-2xl">
                            <div className="w-20 h-20 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl animate-bounce">♻️</div>
                            <p className="text-gray-400 text-xs uppercase tracking-widest font-bold">IA DETECTÓ:</p>
                            <h3 className="text-2xl font-black text-gray-800 mb-2">{materialDetectado}</h3>
                            <div className="bg-green-100 text-green-800 px-4 py-2 rounded-xl font-bold inline-block mb-6">+{puntosGanados} Puntos</div>
                            
                            <button onClick={confirmarReciclaje} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg transition transform active:scale-95">¡Reciclar!</button>
                            <button onClick={() => {setVistaCamara(false); setMaterialDetectado("");}} className="mt-4 text-gray-400 text-sm hover:text-green-600 underline">Cancelar / Error</button>
                        </div>
                    )}
                </div>
             </div>
          </div>
        )}

        {mensaje && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 w-11/12 bg-gray-800 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce z-50">
             <span className="text-2xl">🎉</span>
             <div>
                 <p className="font-bold text-sm">¡Reciclaje Registrado!</p>
                 <p className="text-xs text-gray-400">{mensaje.texto}</p>
             </div>
          </div>
        )}

        <div className="absolute bottom-0 w-full bg-white border-t border-gray-100 p-4 flex justify-around text-gray-400">
           <div className="text-green-600 flex flex-col items-center text-xs font-bold cursor-pointer">🏠<span>Inicio</span></div>
           <div className="flex flex-col items-center text-xs cursor-pointer hover:text-green-800">🗺️<span>Mapa</span></div>
           <div className="flex flex-col items-center text-xs cursor-pointer hover:text-green-800">🎁<span>Premios</span></div>
        </div>

      </div>
    </div>
  );
}

function FilaRanking({ puesto, nombre, puntos, activo = false }: any) {
    return (
        <div className={`flex items-center justify-between p-4 rounded-2xl ${activo ? 'bg-green-600 text-white shadow-lg scale-105' : 'bg-white text-gray-600 border border-gray-100'}`}>
            <div className="flex items-center gap-4">
                <span className={`font-black text-lg ${activo ? 'text-green-200' : 'text-green-600'}`}>#{puesto}</span>
                <span className="font-bold">{nombre}</span>
            </div>
            <span className="font-mono font-bold">{puntos} pts</span>
        </div>
    )
}