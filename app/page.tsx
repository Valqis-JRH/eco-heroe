'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import Webcam from 'react-webcam';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { Home, MapPin, Gift, ArrowRight, Camera, Leaf } from 'lucide-react';

// TUS CLAVES SUPABASE
const supabaseUrl = 'https://eeghgwwuemlfxwxvsjsz.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlZ2hnd3d1ZW1sZnh3eHZzanN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDU4MTMsImV4cCI6MjA4MDAyMTgxM30.-rO28sH0qqDW-ag-U5k4vRESfGCIZ3yZAjvf5OMW3d0'; 

// CLAVE IA
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || 'AIzaSyDUGgIXZsuSHTkCU5XwNfQLa5gcs_bn320'; 

const supabase = createClient(supabaseUrl, supabaseKey);

export default function EcoHeroe() {
  const [puntos, setPuntos] = useState(0); 
  const [cargandoDatos, setCargandoDatos] = useState(true);
  const [vistaActual, setVistaActual] = useState<'inicio' | 'premios'>('inicio');
  
  const webcamRef = useRef<any>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  
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

  // --- LÓGICA DE CANJE ---
  const canjearPremio = async (costo: number, nombrePremio: string) => {
    if (puntos >= costo) {
        const nuevosPuntos = puntos - costo;
        setPuntos(nuevosPuntos);
        setMensaje({ texto: `¡Canjeaste ${nombrePremio}! 🎉`, tipo: 'exito' });
        await supabase.from('eco_usuarios').update({ puntos: nuevosPuntos }).eq('id', 1);
        setTimeout(() => setMensaje(null), 4000);
    } else {
        setMensaje({ texto: `Faltan ${costo - puntos} pts`, tipo: 'error' });
        setTimeout(() => setMensaje(null), 3000);
    }
  };

  // --- LÓGICA DE IA (POTENTE) ---
  const capturarYAnalizar = async () => {
    if (!webcamRef.current) return;
    
    const apiKeyFinal = GEMINI_API_KEY.startsWith('AIza') ? GEMINI_API_KEY : '';
    if (!apiKeyFinal) { setMensaje({ texto: "Falta API Key", tipo: 'error' }); return; }

    const genAI = new GoogleGenerativeAI(apiKeyFinal);
    const imageSrc = webcamRef.current.getScreenshot();
    setImgSrc(imageSrc); 
    setAnalizando(true);
    setMensaje(null);

    try {
        const base64Data = imageSrc.split(',')[1];
        let text = "";
        let exito = false;

        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];

        const modelos = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"];

        for (const m of modelos) {
            try {
                const model = genAI.getGenerativeModel({ model: m, safetySettings });
                const prompt = `Analiza la imagen. Responde SOLO JSON: {"nombre": "objeto", "puntos": 10, "esReciclable": true}. Si no es claro: {"nombre": "Desconocido", "puntos": 0, "esReciclable": false}`;
                const result = await model.generateContent([prompt, { inlineData: { data: base64Data, mimeType: "image/jpeg" } }]);
                text = (await result.response).text();
                exito = true;
                break;
            } catch (error) { console.warn(`Falló ${m}`); }
        }

        if (!exito) throw new Error("Error conexión IA.");

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
        setMensaje({ texto: `Error: ${error.message}`, tipo: 'error' });
    }
    setAnalizando(false);
  };

  const confirmarReciclaje = async () => {
      if (puntosGanados === 0) { setVistaCamara(false); setImgSrc(null); return; }
      const nuevos = puntos + puntosGanados;
      setPuntos(nuevos);
      setVistaCamara(false);
      setImgSrc(null);
      setMensaje({ texto: `¡Sumaste +${puntosGanados} pts!`, tipo: 'exito' });
      await supabase.from('eco_usuarios').update({ puntos: nuevos }).eq('id', 1);
      setTimeout(() => setMensaje(null), 4000);
  };

  if (cargandoDatos) return <div className="min-h-screen bg-white flex flex-col items-center justify-center text-[#00C853]">Cargando...</div>;

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-gray-800 font-sans flex justify-center items-center p-4">
      <div className="w-full max-w-sm h-[800px] bg-white rounded-[35px] border border-gray-200 overflow-hidden relative shadow-xl flex flex-col">
        
        {/* HEADER VERDE NEÓN (DISEÑO ORIGINAL RESTAURADO) */}
        <div className="pt-10 px-6 pb-16 bg-[#00C853] rounded-b-[45px] shadow-md z-10 relative">
          <div className="flex justify-between items-center mb-8">
             <div className="flex items-center gap-2 text-black">
                <div className="bg-black/10 p-1.5 rounded-full">
                    <Leaf className="w-5 h-5" fill="black" />
                </div>
                <h3 className="font-extrabold text-lg tracking-tight">EcoHéroe</h3>
             </div>
             <div className="bg-black/10 px-3 py-1 rounded-full text-xs text-black font-bold tracking-wide">v15.0 (Light)</div>
          </div>
          
          <div className="text-center">
             <p className="text-black/60 text-[10px] font-bold tracking-[0.2em] mb-1 uppercase">TUS ECO-PUNTOS</p>
             <h1 className="text-7xl font-black text-white drop-shadow-sm">{puntos}</h1>
          </div>
        </div>

        {/* CUERPO BLANCO */}
        <div className="flex-1 px-6 pt-8 overflow-y-auto pb-24 bg-white -mt-6 z-0 relative rounded-t-[35px]">
          
          {vistaActual === 'inicio' ? (
            <>
              {/* TARJETA ESCANER (BLANCA) */}
              <button 
                onClick={() => { setVistaCamara(true); setMaterialDetectado(""); setImgSrc(null); }}
                className="w-full bg-white p-5 rounded-3xl border border-gray-200 flex items-center gap-5 mb-10 group active:scale-95 transition-all mt-4 shadow-sm hover:shadow-md"
              >
                 <div className="w-14 h-14 bg-[#00C853]/10 rounded-2xl flex items-center justify-center group-hover:bg-[#00C853]/20 transition-colors">
                    <Camera className="w-7 h-7 text-[#00C853]" />
                 </div>
                 <div className="text-left flex-1">
                    <h3 className="font-bold text-lg text-gray-800">Escanear</h3>
                    <p className="text-gray-500 text-xs">Modelo 2.5 Flash</p>
                 </div>
                 <ArrowRight className="text-gray-400 w-5 h-5" />
              </button>

              {/* RANKING (BLANCO) */}
              <div className="flex justify-between items-end mb-4 px-1">
                  <h3 className="font-bold text-gray-500 text-xs tracking-widest uppercase">Ranking Vecinal</h3>
                  <span className="text-[#00C853] text-xs font-bold cursor-pointer">Ver todo</span>
              </div>

              <div className="space-y-3">
                 <FilaRanking puesto="1" nombre="Maria G." puntos="2,450" />
                 <FilaRanking puesto="2" nombre="Tú" puntos={puntos} activo />
                 <FilaRanking puesto="3" nombre="Juan P." puntos="1,200" />
              </div>
            </>
          ) : (
            <>
              {/* VISTA PREMIOS (BLANCA) */}
              <h3 className="font-bold text-gray-800 text-xl mb-2 mt-4">Canjea tus Puntos 🎁</h3>
              <p className="text-gray-500 text-sm mb-6">Recompensas exclusivas.</p>

              <div className="grid grid-cols-2 gap-4">
                 <TarjetaPremio emoji="🥤" titulo="Bebida" costo={50} color="text-blue-500 bg-blue-100" onCanjear={() => canjearPremio(50, "Bebida")} puntosUsuario={puntos} />
                 <TarjetaPremio emoji="🚌" titulo="Pasaje" costo={100} color="text-yellow-500 bg-yellow-100" onCanjear={() => canjearPremio(100, "Pasaje")} puntosUsuario={puntos} />
                 <TarjetaPremio emoji="📱" titulo="Recarga" costo={200} color="text-purple-500 bg-purple-100" onCanjear={() => canjearPremio(200, "Recarga")} puntosUsuario={puntos} />
                 <TarjetaPremio emoji="🌳" titulo="Árbol" costo={500} color="text-green-500 bg-green-100" onCanjear={() => canjearPremio(500, "Árbol")} puntosUsuario={puntos} />
              </div>
            </>
          )}
        </div>

        {/* MODAL CÁMARA (MODO CLARO) */}
        {vistaCamara && (
          <div className="absolute inset-0 bg-white z-50 flex flex-col animate-fade-in">
             {!imgSrc ? (
                 <div className="relative h-full">
                    <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: "environment" }} className="h-full w-full object-cover" />
                    <div className="absolute bottom-10 w-full flex justify-center z-20">
                        <button onClick={capturarYAnalizar} className="w-20 h-20 bg-white rounded-full border-[6px] border-[#00C853]/50 flex items-center justify-center active:scale-90 transition shadow-lg">
                          <div className="w-16 h-16 bg-[#00C853] rounded-full"></div>
                        </button>
                    </div>
                    <button onClick={() => setVistaCamara(false)} className="absolute top-6 right-6 bg-white/80 text-gray-800 p-2 rounded-full backdrop-blur-md z-20 shadow-sm">✕</button>
                 </div>
             ) : (
                 <div className="relative h-full bg-white flex flex-col items-center justify-center p-6">
                    <img src={imgSrc} alt="Captura" className="rounded-3xl shadow-xl mb-8 max-h-[50%] border border-gray-200" />
                    {analizando ? (
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-[#00C853] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-[#00C853] font-mono text-sm animate-pulse">Analizando residuo...</p>
                        </div>
                    ) : (
                        <div className="bg-white w-full p-6 rounded-3xl text-center border border-gray-200 shadow-sm">
                            {puntosGanados > 0 ? (
                                <>
                                    <div className="text-5xl mb-4">♻️</div>
                                    <h2 className="text-2xl font-black text-gray-800 mb-1">{materialDetectado}</h2>
                                    <div className="text-[#00C853] text-xl font-bold py-2">+{puntosGanados} Puntos</div>
                                    <button onClick={confirmarReciclaje} className="w-full mt-4 bg-[#00C853] hover:bg-[#00B248] text-white font-bold py-4 rounded-xl transition-transform active:scale-95 shadow-md">¡Reciclar!</button>
                                </>
                            ) : (
                                <>
                                    <h2 className="text-xl font-bold text-gray-800 mb-2">No reconocido</h2>
                                    <p className="text-red-500 text-xs mb-4">{mensaje?.texto}</p>
                                    <button onClick={() => setImgSrc(null)} className="w-full bg-gray-100 text-gray-800 font-bold py-3 rounded-xl hover:bg-gray-200">Intentar de nuevo</button>
                                </>
                            )}
                        </div>
                    )}
                 </div>
             )}
          </div>
        )}
        
        {mensaje && mensaje.tipo !== 'info' && (
          <div className={`absolute bottom-28 left-1/2 transform -translate-x-1/2 w-11/12 px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-bounce z-50 ${mensaje.tipo === 'error' ? 'bg-red-500 text-white' : 'bg-[#00C853] text-white'}`}>
             <span className="font-bold text-sm">{mensaje.texto}</span>
          </div>
        )}

        {/* NAV BAR (MODO CLARO) */}
        <div className="absolute bottom-0 w-full bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 flex justify-around">
           <button onClick={() => setVistaActual('inicio')} className={`flex flex-col items-center gap-1 cursor-pointer group ${vistaActual === 'inicio' ? 'opacity-100' : 'opacity-50'}`}>
               <Home className={`w-6 h-6 ${vistaActual === 'inicio' ? 'text-[#00C853]' : 'text-gray-400'}`} />
               <span className={`text-[10px] font-bold ${vistaActual === 'inicio' ? 'text-[#00C853]' : 'text-gray-400'}`}>Inicio</span>
           </button>
           <div className="flex flex-col items-center gap-1 cursor-pointer group opacity-50 hover:opacity-100">
               <MapPin className="w-6 h-6 text-gray-400" />
               <span className="text-[10px] text-gray-400">Mapa</span>
           </div>
           <button onClick={() => setVistaActual('premios')} className={`flex flex-col items-center gap-1 cursor-pointer group ${vistaActual === 'premios' ? 'opacity-100' : 'opacity-50'}`}>
               <Gift className={`w-6 h-6 ${vistaActual === 'premios' ? 'text-[#00C853]' : 'text-gray-400'}`} />
               <span className={`text-[10px] font-bold ${vistaActual === 'premios' ? 'text-[#00C853]' : 'text-gray-400'}`}>Premios</span>
           </button>
        </div>

      </div>
    </div>
  );
}

// COMPONENTE FILA RANKING (DISEÑO CLARO)
function FilaRanking({ puesto, nombre, puntos, activo = false }: any) {
    return (
        <div className={`flex items-center justify-between p-4 rounded-2xl border ${activo ? 'bg-[#00C853]/10 border-[#00C853] shadow-sm' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${activo ? 'bg-[#00C853] text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {puesto}
                </div>
                <span className={`font-bold ${activo ? 'text-gray-800' : 'text-gray-600'}`}>{nombre}</span>
            </div>
            <span className={`font-mono font-bold ${activo ? 'text-[#00C853]' : 'text-gray-400'}`}>{puntos} pts</span>
        </div>
    )
}

function TarjetaPremio({ emoji, titulo, costo, color, onCanjear, puntosUsuario }: any) {
    const alcanzable = puntosUsuario >= costo;
    return (
        <div className={`p-4 rounded-3xl border flex flex-col items-center text-center transition-all ${alcanzable ? 'bg-white border-gray-200 hover:border-[#00C853] cursor-pointer shadow-sm hover:shadow-md' : 'bg-gray-50 border-gray-200 opacity-50'}`} onClick={alcanzable ? onCanjear : undefined}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-3 ${color}`}>
                {emoji}
            </div>
            <h4 className="text-gray-800 font-bold text-sm mb-1">{titulo}</h4>
            <p className={`text-xs font-mono font-bold ${alcanzable ? 'text-[#00C853]' : 'text-gray-500'}`}>{costo} pts</p>
        </div>
    )
}