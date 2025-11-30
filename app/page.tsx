'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Webcam from 'react-webcam';
// 👇 IMPORTAMOS LAS CATEGORÍAS DE SEGURIDAD
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// 👇 TUS CLAVES 👇
const supabaseUrl = 'https://eeghgwwuemlfxwxvsjsz.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlZ2hnd3d1ZW1sZnh3eHZzanN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDU4MTMsImV4cCI6MjA4MDAyMTgxM30.-rO28sH0qqDW-ag-U5k4vRESfGCIZ3yZAjvf5OMW3d0'; 

// ⚠️ PEGA TU NUEVA API KEY AQUÍ ⚠️
const GEMINI_API_KEY = 'AIzaSyAjTro160n3XJ9BXWko3ajuKAr05aCinQI'; 

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export default function EcoHeroe() {
  const [puntos, setPuntos] = useState(0); 
  const [cargandoDatos, setCargandoDatos] = useState(true);
  
  const webcamRef = useRef<any>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [modeloUsado, setModeloUsado] = useState("");
  
  const [materialDetectado, setMaterialDetectado] = useState("");
  const [puntosGanados, setPuntosGanados] = useState(0);
  const [vistaCamara, setVistaCamara] = useState(false); 
  const [mensaje, setMensaje] = useState<{texto: string, tipo: 'exito' | 'info' | 'error'} | null>(null);

  const refrescarPuntos = useCallback(async () => {
    try {
        const { data } = await supabase.from('eco_usuarios').select('puntos').eq('id', 1).single();
        if (data) setPuntos(data.puntos);
        else {
            const { error } = await supabase.from('eco_usuarios').insert([{ id: 1, puntos: 0 }]);
            if (!error) setPuntos(0);
        }
    } catch (e) { console.error(e); }
    setCargandoDatos(false);
  }, []);

  useEffect(() => {
    refrescarPuntos(); 
    const canal = supabase.channel('eco-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'eco_usuarios' }, (payload) => {
        setPuntos(payload.new.puntos);
      }).subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [refrescarPuntos]);

  // --- FUNCIÓN DE INTENTO CON SEGURIDAD DESACTIVADA ---
  async function probarModelo(modelo: string, base64Data: string) {
    console.log(`Probando: ${modelo}`);
    
    // 🛡️ CONFIGURACIÓN CRÍTICA: PERMITIR TODO
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ];

    const model = genAI.getGenerativeModel({ model: modelo, safetySettings });
    
    const prompt = `Analiza la imagen. Responde SOLO JSON: {"nombre": "objeto", "puntos": 10, "esReciclable": true}. Si no es claro: {"nombre": "Nada", "puntos": 0, "esReciclable": false}`;

    const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
    ]);
    return result.response.text();
  }

  // --- LÓGICA V11: FUERZA BRUTA + SIN CENSURA ---
  const capturarYAnalizar = async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    setImgSrc(imageSrc); 
    setAnalizando(true);
    setMensaje(null);

    try {
        const base64Data = imageSrc.split(',')[1];
        let text = "";
        let exito = false;

        // Lista de modelos a probar
        const modelos = [
            "gemini-1.5-flash", 
            "gemini-1.5-flash-001",
            "gemini-1.5-flash-8b", 
            "gemini-1.5-pro",
            "gemini-pro"
        ];

        for (const m of modelos) {
            try {
                text = await probarModelo(m, base64Data);
                setModeloUsado(m);
                exito = true;
                break; 
            } catch (error) {
                console.warn(`Falló ${m}`);
            }
        }

        if (!exito) throw new Error("Bloqueo total. Revisa API Key.");

        const jsonString = text.replace(/```json/g, "").replace(/```/g, "").trim(); 
        const datosIA = JSON.parse(jsonString);

        if (datosIA.esReciclable) {
            setMaterialDetectado(datosIA.nombre);
            setPuntosGanados(datosIA.puntos);
        } else {
            setMaterialDetectado("No reconocido");
            setPuntosGanados(0);
            setMensaje({ texto: "Intenta enfocar mejor.", tipo: 'info' });
        }

    } catch (error: any) {
        setMaterialDetectado("Error");
        setMensaje({ texto: `Error V11: ${error.message}`, tipo: 'error' });
    }
    setAnalizando(false);
  };

  const confirmarReciclaje = async () => {
      if (puntosGanados === 0) { setVistaCamara(false); setImgSrc(null); return; }
      const nuevos = puntos + puntosGanados;
      setPuntos(nuevos);
      setVistaCamara(false);
      setImgSrc(null);
      setMensaje({ texto: `¡Sumaste +${puntosGanados}!`, tipo: 'exito' });
      await supabase.from('eco_usuarios').update({ puntos: nuevos }).eq('id', 1);
      await refrescarPuntos();
      setTimeout(() => setMensaje(null), 4000);
  };

  if (cargandoDatos) return <div className="min-h-screen bg-orange-900 flex flex-col items-center justify-center text-white">Cargando V11...</div>;

  return (
    <div className="min-h-screen bg-orange-50 text-gray-800 font-sans flex justify-center items-center p-4">
      <div className="w-full max-w-sm h-[800px] bg-white rounded-[40px] border-8 border-orange-900 overflow-hidden relative shadow-2xl flex flex-col">
        
        {/* HEADER V11 (NARANJA PARA CONFIRMAR ACTUALIZACIÓN) */}
        <div className="pt-12 px-6 pb-6 bg-orange-600 rounded-b-3xl shadow-lg z-10">
          <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-xl">🔥</div>
                <h3 className="font-bold text-white text-lg">EcoHéroe Final</h3>
             </div>
             <div className="bg-orange-800 px-3 py-1 rounded-full text-xs text-orange-200 font-mono border border-orange-400">v11.0</div>
          </div>
          <div className="text-center mt-4">
             <p className="text-orange-100 text-sm mb-1">Tus Eco-Puntos</p>
             <h1 className="text-6xl font-black text-white tracking-tighter">{puntos}</h1>
          </div>
        </div>

        {/* CUERPO */}
        <div className="flex-1 px-6 pt-8 overflow-y-auto pb-20 bg-orange-50">
          <button 
            onClick={() => { setVistaCamara(true); setMaterialDetectado(""); setImgSrc(null); }}
            className="w-full bg-white p-6 rounded-3xl shadow-xl border border-orange-100 flex items-center gap-4 group hover:scale-[1.02] transition-transform mb-8"
          >
             <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center text-4xl group-hover:rotate-12 transition-transform">📸</div>
             <div className="text-left">
                <h3 className="font-bold text-xl text-gray-800">Escanear</h3>
                <p className="text-orange-600 text-sm">Modo Sin Censura</p>
             </div>
          </button>

          <h3 className="font-bold text-gray-700 mb-4 ml-1">Ranking Vecinal 🏆</h3>
          <div className="space-y-3">
             <FilaRanking puesto="1" nombre="Maria G." puntos="2,450" />
             <FilaRanking puesto="2" nombre="Tú" puntos={puntos} activo />
             <FilaRanking puesto="3" nombre="Juan P." puntos="1,200" />
          </div>
        </div>

        {/* MODAL CÁMARA */}
        {vistaCamara && (
          <div className="absolute inset-0 bg-black z-50 flex flex-col p-0 animate-fade-in">
             {!imgSrc && (
                 <div className="relative h-full flex flex-col">
                    <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: "environment" }} className="h-full w-full object-cover" />
                    <div className="absolute bottom-10 w-full flex justify-center z-20">
                        <button onClick={capturarYAnalizar} className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 shadow-xl flex items-center justify-center hover:scale-110 transition">
                            <div className="w-16 h-16 bg-orange-500 rounded-full"></div>
                        </button>
                    </div>
                    <button onClick={() => setVistaCamara(false)} className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full z-20">✕</button>
                 </div>
             )}

             {imgSrc && (
                 <div className="relative h-full bg-gray-900 flex flex-col items-center justify-center p-6">
                    <img src={imgSrc} alt="Captura" className="rounded-2xl shadow-2xl mb-6 max-h-[50%] border-2 border-gray-700" />
                    {analizando ? (
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-orange-400 font-mono animate-pulse">Conectando IA...</p>
                        </div>
                    ) : (
                        <div className="bg-white w-full p-6 rounded-3xl text-center animate-slide-up">
                            <p className="text-xs text-gray-400 mb-2">Modelo usado: {modeloUsado}</p>
                            {puntosGanados > 0 ? (
                                <>
                                    <div className="text-5xl mb-2">♻️</div>
                                    <h2 className="text-2xl font-black text-gray-800">{materialDetectado}</h2>
                                    <div className="bg-orange-100 text-orange-800 text-xl font-bold py-3 rounded-xl mb-4">+{puntosGanados} Pts</div>
                                    <button onClick={confirmarReciclaje} className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl shadow-lg">¡Guardar!</button>
                                </>
                            ) : (
                                <>
                                    <h2 className="text-xl font-bold text-gray-800">No reconocido</h2>
                                    <p className="text-gray-500 text-xs mt-2 break-all">{mensaje?.texto}</p>
                                    <button onClick={() => setImgSrc(null)} className="w-full bg-gray-200 text-gray-800 font-bold py-3 rounded-xl mt-4">Intentar de nuevo</button>
                                </>
                            )}
                        </div>
                    )}
                 </div>
             )}
          </div>
        )}

        {mensaje && mensaje.tipo === 'error' && (
          <div className="absolute top-10 left-1/2 transform -translate-x-1/2 w-11/12 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce z-50 bg-red-600 text-white">
             <span className="text-2xl">⚠️</span>
             <div>
                 <p className="font-bold text-sm">Error:</p>
                 <p className="text-xs opacity-90 break-words">{mensaje.texto}</p>
             </div>
          </div>
        )}

        <div className="absolute bottom-0 w-full bg-white border-t border-gray-100 p-4 flex justify-around text-gray-400">
           <div className="text-orange-600 flex flex-col items-center text-xs font-bold">🏠<span>Inicio</span></div>
           <div className="flex flex-col items-center text-xs">🎁<span>Premios</span></div>
        </div>
      </div>
    </div>
  );
}

function FilaRanking({ puesto, nombre, puntos, activo = false }: any) {
    return (
        <div className={`flex items-center justify-between p-4 rounded-2xl ${activo ? 'bg-orange-600 text-white shadow-lg scale-105' : 'bg-white text-gray-600 border border-gray-100'}`}>
            <div className="flex items-center gap-4">
                <span className={`font-black text-lg ${activo ? 'text-orange-200' : 'text-orange-600'}`}>#{puesto}</span>
                <span className="font-bold">{nombre}</span>
            </div>
            <span className="font-mono font-bold">{puntos} pts</span>
        </div>
    )
}