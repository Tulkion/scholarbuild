import React, { useState, useEffect, useRef } from 'react';
import { Workspace } from '../../types';
import { Button } from '../ui/button';
import { Mic, Square, Loader2, Volume2, Settings } from 'lucide-react';
import { getGenAI } from '../../lib/gemini';
import { Modality, LiveServerMessage } from '@google/genai';

export default function VoiceTutorTab({ workspace }: { workspace: Workspace }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<{msg: string, type: 'info'|'user'|'model'}[]>([]);
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  
  // Audio playback queue
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const startSession = async () => {
    setIsConnecting(true);
    setLogs(prev => [...prev, { msg: 'Requesting microphone...', type: 'info' }]);
    
    try {
      // 1. Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { channelCount: 1, sampleRate: 16000 } 
      });
      mediaStreamRef.current = stream;

      // 2. Setup AudioContext 
      // Output context MUST match the PCM sample rate from model (24000 Hz) to avoid manual resampling, 
      // but Live API gives 24000 PCM. Let's set it to 24000.
      const ctx = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = ctx;

      // Ensure context is running
      if (ctx.state === 'suspended') {
          await ctx.resume();
      }

      setLogs(prev => [...prev, { msg: 'Microphone active. Connecting to Live API...', type: 'info' }]);
      
      const ai = getGenAI();
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
          },
          systemInstruction: `You are a university academic tutor for the workspace "${workspace.title}". Guide the user, help them brainstorm presentations, practice their speech, and discuss their papers. Be conversational, concise, and helpful.`
        },
        callbacks: {
          onopen: () => {
             setIsConnected(true);
             setIsConnecting(false);
             setLogs(prev => [...prev, { msg: 'Connected to Voice Tutor.', type: 'info' }]);

             // Setup input recording. We use a ScriptProcessorNode for simplicity handling 16kHz audio
             // Note: ScriptProcessor is deprecated but simpler than loading a worklet. 
             // We'll use mediarecorder to base64, or manual PCM. The API needs 16000 PCM base64.
             const source = ctx.createMediaStreamSource(stream);
             const processor = ctx.createScriptProcessor(4096, 1, 1);
             
             processor.onaudioprocess = (e) => {
               const inputData = e.inputBuffer.getChannelData(0);
               // Convert Float32 to Int16
               const pcm16 = new Int16Array(inputData.length);
               for (let i = 0; i < inputData.length; i++) {
                  let s = Math.max(-1, Math.min(1, inputData[i]));
                  pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
               }
               // Base64 encode
               const buffer = new Uint8Array(pcm16.buffer);
               const base64 = btoa(String.fromCharCode.apply(null, Array.from(buffer)));
               
               sessionPromise.then(s => s.sendRealtimeInput({
                   audio: { data: base64, mimeType: 'audio/pcm;rate=24000' } // Should send right rate
               })).catch(console.error);
             };

             source.connect(processor);
             processor.connect(ctx.destination);
             workletNodeRef.current = processor as any;
          },
          onmessage: async (msg: LiveServerMessage) => {
            const base64Audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
               handleAudioMessage(base64Audio);
            }
            if (msg.serverContent?.interrupted) {
               audioQueueRef.current = [];
               isPlayingRef.current = false;
            }
          },
          onclose: (e) => {
             console.log("closed", e);
             stopSession();
          },
          onerror: (e) => {
             console.error("error", e);
             setLogs(prev => [...prev, { msg: 'Error in connection.', type: 'info' }]);
             stopSession();
          }
        }
      });
      
      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error(err);
      setLogs(prev => [...prev, { msg: 'Failed to connect: ' + err.message, type: 'info' }]);
      setIsConnecting(false);
      stopSession();
    }
  };

  const handleAudioMessage = (base64Str: string) => {
      if (!audioContextRef.current) return;
      
      // Decode base64 PCM 16-bit 24kHz
      const binaryString = atob(base64Str);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
         float32[i] = pcm16[i] / 32768.0;
      }

      audioQueueRef.current.push(float32);
      playNextAudio();
  };

  const playNextAudio = () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    
    const ctx = audioContextRef.current;
    if (!ctx) return;

    isPlayingRef.current = true;
    const float32 = audioQueueRef.current.shift()!;
    
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    
    const startTime = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;

    source.onended = () => {
       isPlayingRef.current = false;
       playNextAudio();
    };
  };

  const stopSession = () => {
    if (sessionRef.current) {
        sessionRef.current.close?.();
        sessionRef.current = null;
    }
    if (workletNodeRef.current) {
       workletNodeRef.current.disconnect();
       workletNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
       mediaStreamRef.current.getTracks().forEach(t => t.stop());
       mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
       audioContextRef.current.close().catch(console.error);
       audioContextRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;

    setIsConnected(false);
    setIsConnecting(false);
    setLogs(prev => [...prev, { msg: 'Session ended.', type: 'info' }]);
  };

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, []);

  return (
    <div className="flex-1 p-8 flex flex-col items-center justify-center relative bg-white m-6 rounded-[16px] shadow-card border border-natural-border">
      <div className="text-center space-y-6 max-w-md w-full">
        <div className="mx-auto w-24 h-24 bg-natural-sidebar border border-natural-border rounded-full flex items-center justify-center relative shadow-sm">
           {isConnected && <div className="absolute inset-0 rounded-full bg-natural-accent animate-ping opacity-20" style={{ animationDuration: '3s' }} />}
           {isConnected ? <Volume2 className="w-10 h-10 text-natural-accent animate-pulse" /> : <Mic className="w-10 h-10 text-natural-accent" />}
        </div>
        
        <div>
          <h2 className="text-[1.8rem] font-serif font-bold text-natural-text">Live Academic Voice Tutor</h2>
          <p className="text-natural-muted mt-2 text-[0.85rem] leading-relaxed">Practice presentations, discuss your research sources, and get real-time feedback with a natural voice interaction.</p>
        </div>

        <div className="pt-8 flex justify-center">
          {!isConnected && !isConnecting && (
            <Button size="lg" onClick={startSession} className="w-48 h-[46px] rounded-[12px] bg-natural-accent text-white font-bold transition-colors shadow-sm cursor-pointer">
              <Mic className="w-4 h-4 mr-2" /> Start Session
            </Button>
          )}
          {isConnecting && (
             <Button size="lg" disabled className="w-48 h-[46px] rounded-[12px] bg-natural-border text-natural-text font-bold opacity-70">
               <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...
             </Button>
          )}
          {isConnected && (
             <Button size="lg" variant="outline" onClick={stopSession} className="w-48 h-[46px] rounded-[12px] border-red-500 text-red-600 bg-transparent hover:bg-red-500 hover:text-white transition-colors cursor-pointer">
               <Square className="w-4 h-4 mr-2 fill-current" /> End Call
             </Button>
          )}
        </div>

        <div className="mt-8 text-[0.7rem] text-left w-full bg-[#FAFAFA] border border-natural-border rounded-[12px] p-4 h-32 overflow-y-auto font-sans text-natural-muted">
           {logs.map((L, i) => (
              <div key={i}><span className="opacity-50">[{new Date().toLocaleTimeString()}]</span> {L.msg}</div>
           ))}
           {logs.length === 0 && <div className="italic">Status: Waiting to connect...</div>}
        </div>
      </div>
    </div>
  );
}
