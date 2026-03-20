import React, { useEffect, useRef, useState } from 'react';
import { Icons } from '../constants';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { decode, decodeAudioData, encode } from '../services/aiService';

interface LiveVoiceOverlayProps {
  onClose: () => void;
  isOpen: boolean;
}

const LiveVoiceOverlay: React.FC<LiveVoiceOverlayProps> = ({ onClose, isOpen }) => {
  const [status, setStatus] = useState<'connecting' | 'active' | 'error' | 'closed'>('closed');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      startLiveSession();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isOpen]);

  const cleanup = () => {
    setStatus('closed');
    setErrorMessage(null);
    setTranscription([]);
    
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch(e) {}
    }
    sourcesRef.current.clear();

    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach(track => track.stop());
      microphoneStreamRef.current = null;
    }

    // Disconnect scriptProcessor to stop audio processing callbacks
    if (scriptProcessorRef.current) {
      try { scriptProcessorRef.current.disconnect(); } catch(e) {}
      scriptProcessorRef.current = null;
    }

    // Close BOTH audio contexts (input + output) to free system resources
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close().catch(() => {});
      inputAudioContextRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const startLiveSession = async () => {
    try {
      setStatus('connecting');
      setErrorMessage(null);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;
      inputAudioContextRef.current = inputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;
      
      const sessionPromise = ai.live.connect({
        // Fix: Updated model name to 'gemini-2.5-flash-native-audio-preview-12-2025' per latest SDK documentation
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('active');
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              sessionPromise.then(s => s.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (m) => {
            if (m.serverContent?.inputTranscription) setTranscription(p => [...p.slice(-4), `You: ${m.serverContent?.inputTranscription?.text}`]);
            if (m.serverContent?.outputTranscription) setTranscription(p => [...p.slice(-4), `Sedrex: ${m.serverContent?.outputTranscription?.text}`]);
            const audioData = m.serverContent?.modelTurn?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (audioData) {
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
              // Clean up finished sources to prevent memory leak
              source.onended = () => { sourcesRef.current.delete(source); };
            }
          },
          onerror: (e) => setErrorMessage(e.message || 'Error'),
          onclose: () => setStatus('closed')
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) { setStatus('error'); setErrorMessage(err.message); }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-2xl animate-in fade-in duration-300">
      <div ref={modalRef} className="w-full max-w-lg p-10 flex flex-col items-center gap-10">
        <div className={`w-32 h-32 rounded-full border-2 flex items-center justify-center ${status === 'active' ? 'border-emerald-500 animate-pulse' : 'border-white/10'}`}>
          <Icons.Robot className="w-14 h-14 opacity-50" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">{status}</h2>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.3em]">{errorMessage || 'Secure Voice Uplink'}</p>
        </div>
        <div className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 h-48 overflow-y-auto">
          {transcription.map((t, i) => <p key={i} className="text-xs mb-2 opacity-60">{t}</p>)}
        </div>
        <button onClick={onClose} className="px-10 py-3 bg-white/10 border border-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white">End Session</button>
      </div>
    </div>
  );
};

export default LiveVoiceOverlay;