'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Webcam from 'react-webcam'; // 📸 Cámara Real
import { GoogleGenerativeAI } from '@google/generative-ai'; // 🧠 Cerebro IA

// 👇 TUS CLAVES DE SUPABASE 👇
const supabaseUrl = 'https://eeghgwwuemlfxwxvsjsz.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlZ2hnd3d1ZW1sZnh3eHZzanN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDU4MTMsImV4cCI6MjA4MDAyMTgxM30.-rO28sH0qqDW-ag-U5k4vRESfGCIZ3yZAjvf5OMW3d0'; 

// 👇 TU CLAVE DE GEMINI 👇
const GEMINI_API_KEY = 'AIzaSyAjTro160n3XJ9BXWko3ajuKAr05aCinQI'; 

// Inicializamos clientes
const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export default function EcoHeroe() {
  const [puntos, setPuntos] = useState(0); 
  const [cargandoDatos, setCargandoDatos] = useState(true);
  
  // Estados de IA y Cámara
  const webcamRef = useRef<any>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  
  const [materialDetectado, setMaterialDetectado] = useState("");
  const [puntosGanados, setPuntosGanados] = useState(0);
  const [vistaCamara, setVistaCamara] = useState(false); 
  const [mensaje, setMensaje] = useState<{texto: string, tipo: 'exito' | 'info' | 'error'} | null>(null);

  // --- 1. CONEXIÓN CON SUPABASE ---
  const refrescarPuntos = useCallback(async () => {
    try {
        const { data, error } = await supabase
            .from('eco_usuarios')
            .select('puntos') 
            .eq('id', 1) 
            .single();
        
        if (data) {
            setPuntos(data.puntos);
        } else {
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
    const canal = supabase
      .channel('eco-puntos-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'eco_usuarios' }, (payload) => {
        setPuntos(payload.new.puntos);
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [refrescarPuntos]);

  // --- 2. IA REAL: GEMINI (CORREGIDO ✅) ---
  const capturarYAnalizar = async () => {
    if (!webcamRef.current) return;
    
    // 1. Tomar foto
    const imageSrc = webcamRef.current.getScreenshot();
    setImgSrc(imageSrc); 
    setAnalizando(true);

    try {
        const base64Data = imageSrc.split(',')[1];
        
        // 🚨 CAMBIO IMPORTANTE AQUÍ: .getGenerativeModel()
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        // Prompt para la IA
        const prompt = `Analiza esta imagen. Identifica si hay un objeto reciclable (Botella plastico, Lata, Vidrio, Cartón, Papel). 
        Si encuentras uno, responde SOLO un objeto JSON con este formato exacto:
        {"nombre": "Nombre del objeto", "puntos": un numero entero entre 10 y 50, "esReciclable": true}
        Si NO es reciclable o no ves nada claro, responde:
        {"nombre": "No identificado", "puntos": 0, "esReciclable": false}
        NO uses markdown, solo el JSON puro.`;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
        ]);
        
        const response = await result.response;
        const text = response.text();
        const jsonString = text.replace(/```json|```/g, "").trim(); 
        const datosIA = JSON.parse(jsonString);

        if (datosIA.esReciclable) {
            setMaterialDetectado(datosIA.nombre);
            setPuntosGanados(datosIA.puntos);
        } else {
            setMaterialDetectado("Objeto no válido");
            setPuntosGanados(0);
            setMensaje({ texto: "Intenta enfocar mejor.", tipo: 'error' });
        }

    } catch (error: any) {
        console.error("Error IA:", error);
        setMaterialDetectado("Error de IA");
        // Mostramos el error real en pantalla para ayudarte
        setMensaje({ texto: `Error: ${error.message || "Verifica API Key"}`, tipo: 'error' });
    }
    
    setAnalizando(false);
  };

  const confirmarReciclaje = async () => {
      if (puntosGanados === 0) {
          setVistaCamara(false);
          setImgSrc(null);
          return;
      }

      const nuevosPuntos = puntos + puntosGanados;
      setPuntos(nuevosPuntos);
      setVistaCamara(false);
      setImgSrc(null);
      setMensaje({ texto: `¡Genial! +${puntosGanados} Puntos por ${materialDetectado}`, tipo: 'exito' });
      
      await supabase.from('eco_usuarios').update({ puntos: nuevosPuntos }).eq('id', 1);
      await refrescarPuntos();
      
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
                <h3 className="font-bold text-white text-lg">EcoHéroe AI</h3>
             </div>
             <div className="bg-green-800 px-3 py-1 rounded-full text-xs text-green-200 font-mono">En vivo</div>
          </div>
          <div className="text-center mt-4">
             <p className="text-green-100 text-sm mb-1">Tus Eco-Puntos</p>
             <h1 className="text-6xl font-black text-white tracking-tighter">{puntos}</h1>
          </div>
        </div>

        {/* CUERPO */}
        <div className="flex-1 px-6 pt-8 overflow-y-auto pb-20 bg-green-50">
          <button 
            onClick={() => { setVistaCamara(true); setMaterialDetectado(""); setImgSrc(null); }}
            className="w-full bg-white p-6 rounded-3xl shadow-xl border border-green-100 flex items-center gap-4 group hover:scale-[1.02] transition-transform mb-8"
          >
             <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-4xl group-hover:rotate-12 transition-transform">🤖</div>
             <div className="text-left">
                <h3 className="font-bold text-xl text-gray-800">Escanear con IA</h3>
                <p className="text-green-600 text-sm">Identifica residuos reales</p>
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

        {/* --- MODAL CÁMARA REAL --- */}
        {vistaCamara && (
          <div className="absolute inset-0 bg-black z-50 flex flex-col p-0 animate-fade-in">
             {/* 1. VISTA DE CÁMARA (Si no hay foto tomada) */}
             {!imgSrc && (
                 <div className="relative h-full flex flex-col">
                    <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={{ facingMode: "environment" }} // Usa cámara trasera en celular
                        className="h-full w-full object-cover"
                    />
                    <div className="absolute top-0 left-0 w-full h-full border-[20px] border-black/30 pointer-events-none"></div>
                    <div className="absolute bottom-10 w-full flex justify-center z-20">
                        <button onClick={capturarYAnalizar} className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 shadow-xl flex items-center justify-center hover:scale-110 transition">
                            <div className="w-16 h-16 bg-green-500 rounded-full"></div>
                        </button>
                    </div>
                    <button onClick={() => setVistaCamara(false)} className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full z-20">✕</button>
                 </div>
             )}

             {/* 2. VISTA DE ANÁLISIS (Foto tomada) */}
             {imgSrc && (
                 <div className="relative h-full bg-gray-900 flex flex-col items-center justify-center p-6">
                    <img src={imgSrc} alt="Captura" className="rounded-2xl shadow-2xl mb-6 max-h-[50%] border-2 border-gray-700" />
                    
                    {analizando ? (
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-green-400 font-mono animate-pulse">Consultando a Gemini AI...</p>
                        </div>
                    ) : (
                        <div className="bg-white w-full p-6 rounded-3xl text-center animate-slide-up">
                            {puntosGanados > 0 ? (
                                <>
                                    <div className="text-5xl mb-2">♻️</div>
                                    <h2 className="text-2xl font-black text-gray-800">{materialDetectado}</h2>
                                    <p className="text-gray-500 mb-4">Detectado por IA</p>
                                    <div className="bg-green-100 text-green-800 text-xl font-bold py-3 rounded-xl mb-4">
                                        +{puntosGanados} Puntos
                                    </div>
                                    <button onClick={confirmarReciclaje} className="w-full bg-green-600 text-white font-bold py-4 rounded-xl shadow-lg">
                                        ¡Guardar Puntos!
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="text-5xl mb-2">❓</div>
                                    <h2 className="text-xl font-bold text-gray-800">No reconocido</h2>
                                    <p className="text-gray-500 mb-6 text-sm">Intenta acercarte más o buscar mejor luz.</p>
                                    <button onClick={() => setImgSrc(null)} className="w-full bg-gray-200 text-gray-800 font-bold py-3 rounded-xl">
                                        Intentar de nuevo
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                 </div>
             )}
          </div>
        )}

        {/* NOTIFICACIÓN */}
        {mensaje && (
          <div className={`absolute bottom-24 left-1/2 transform -translate-x-1/2 w-11/12 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce z-50 ${mensaje.tipo === 'error' ? 'bg-red-500 text-white' : 'bg-gray-800 text-white'}`}>
             <span className="text-2xl">{mensaje.tipo === 'error' ? '⚠️' : '🎉'}</span>
             <div>
                 <p className="font-bold text-sm">{mensaje.tipo === 'error' ? 'Ups' : '¡Éxito!'}</p>
                 <p className="text-xs opacity-90">{mensaje.texto}</p>
             </div>
          </div>
        )}

        {/* NAV */}
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