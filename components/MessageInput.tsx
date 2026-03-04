// This file is deprecated and replaced by ChatInputFloating. Safe to remove.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icons } from '../constants';
import { MessageImage, AIModel, AttachedDocument } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

interface MessageInputProps {
  onSendMessage: (content: string, image?: MessageImage, docs?: AttachedDocument[]) => void;
  onStop: () => void;
  isDisabled: boolean; // Kept for stop button, but input will not be disabled
  preferredModel?: AIModel | 'auto';
  onModelChange?: (model: AIModel | 'auto') => void;
  activeSessionId?: string;
}

const MessageInput: React.FC<MessageInputProps> = ({ 
  onSendMessage, 
  onStop, 
  isDisabled, 
  preferredModel = 'auto', 
  onModelChange, 
  activeSessionId 
}) => {
  const [input, setInput] = useState('');
  const [promptQueue, setPromptQueue] = useState<Array<{content: string, image?: MessageImage, docs?: AttachedDocument[] }>>([]);
  const [attachedImage, setAttachedImage] = useState<MessageImage | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [attachedDocs, setAttachedDocs] = useState<AttachedDocument[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const baseInputRef = useRef('');
  const restartCountRef = useRef(0);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [interimText, setInterimText] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [attachMenuPos, setAttachMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Check if SpeechRecognition API is available (not on Safari desktop)
  const isSpeechSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Focus input on session change or load (desktop only)
  useEffect(() => {
    if (textareaRef.current && window.innerWidth >= 1024) {
      textareaRef.current.focus();
    }
  }, [activeSessionId]);

  const modelColors: Record<string, string> = {
    'auto': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
    [AIModel.GPT4]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    [AIModel.CLAUDE]: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    [AIModel.GEMINI]: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  };

  const modelExpertise: Record<string, { label: string, expertise: string, detail: string, examples: string }> = {
    'auto': { 
      label: "Auto", 
      expertise: "Smart Routing", 
      detail: "Automatically picks the best capability based on your message.",
      examples: "Just type — Nexus figures out the rest." 
    },
    [AIModel.GPT4]: { 
      label: "Reasoning & Planning", 
      expertise: "Strategic Thinking", 
      detail: "Best for strategy, trade-offs, decisions, and frameworks.",
      examples: "Compare options, build a plan, analyze pros & cons." 
    },
    [AIModel.CLAUDE]: { 
      label: "Coding & Writing", 
      expertise: "Technical Precision", 
      detail: "Best for implementation, code, technical docs, and structured writing.",
      examples: "Write code, debug errors, draft documents, refactor." 
    },
    [AIModel.GEMINI]: { 
      label: "Search & Speed", 
      expertise: "Fast Exploration", 
      detail: "Best for fast answers, exploration, summaries, and real-time lookups.",
      examples: "Quick facts, live search, image analysis, summaries." 
    },
  };

  // Calculate dropdown position from button's bounding rect
  const updateDropdownPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.top - 8,
        left: rect.left,
      });
    }
  }, []);

  // Toggle dropdown and compute position
  const handleToggleDropdown = useCallback(() => {
    if (!showModelDropdown) {
      updateDropdownPosition();
    }
    setShowModelDropdown(prev => !prev);
  }, [showModelDropdown, updateDropdownPosition]);

  // Close on click outside (portal-aware)
  useEffect(() => {
    if (!showModelDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setShowModelDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown]);

  // Reposition on scroll/resize while open (RAF-debounced to avoid forced reflow)
  useEffect(() => {
    if (!showModelDropdown) return;
    let rafId = 0;
    const handleReposition = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => updateDropdownPosition());
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModelDropdown(false);
    };
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showModelDropdown, updateDropdownPosition]);

  // Attach menu position
  const updateAttachMenuPosition = useCallback(() => {
    if (attachBtnRef.current) {
      const rect = attachBtnRef.current.getBoundingClientRect();
      setAttachMenuPos({
        top: rect.top - 8,
        left: rect.left,
      });
    }
  }, []);

  const handleToggleAttachMenu = useCallback(() => {
    if (!showAttachMenu) {
      updateAttachMenuPosition();
    }
    setShowAttachMenu(prev => !prev);
  }, [showAttachMenu, updateAttachMenuPosition]);

  // Close attach menu on click outside
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        attachMenuRef.current && !attachMenuRef.current.contains(target) &&
        attachBtnRef.current && !attachBtnRef.current.contains(target)
      ) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAttachMenu]);

  // Reposition attach menu on scroll/resize (RAF-debounced)
  useEffect(() => {
    if (!showAttachMenu) return;
    let rafId = 0;
    const handleReposition = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => updateAttachMenuPosition());
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAttachMenu(false);
    };
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showAttachMenu, updateAttachMenuPosition]);

  // Web Speech API for voice transcription
  const MAX_RESTARTS = 15;

  const startRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      isListeningRef.current = false;
      setIsListening(false);
      return;
    }

    // Clean up any existing instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      restartCountRef.current = 0;
      let interim = '';
      let finalForThisEvent = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalForThisEvent += transcript + ' ';
        } else {
          interim = transcript;
        }
      }
      if (finalForThisEvent) {
        const base = baseInputRef.current;
        const separator = base && !base.endsWith(' ') ? ' ' : '';
        baseInputRef.current = (base + separator + finalForThisEvent).trimEnd() + ' ';
        finalTranscriptRef.current = '';
        setInput(baseInputRef.current);
        setInterimText('');
      } else {
        setInterimText(interim);
        const base = baseInputRef.current;
        setInput(base + interim);
      }
    };

    recognition.onerror = (event: any) => {
      const err = event.error;
      // 'no-speech' and 'aborted' are normal — onend will handle restart
      if (err === 'no-speech' || err === 'aborted') return;
      // Fatal errors — stop entirely
      isListeningRef.current = false;
      setIsListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setInterimText('');
      if (isListeningRef.current && restartCountRef.current < MAX_RESTARTS) {
        restartCountRef.current++;
        const delay = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 400 : 300;
        restartTimerRef.current = setTimeout(() => {
          if (isListeningRef.current) {
            startRecognition();
          }
        }, delay);
      } else {
        isListeningRef.current = false;
        setIsListening(false);
        setInterimText('');
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, []);

  const stopRecognition = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimText('');
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
    // Finalize: trim stale interim text, keep only committed text
    setInput(prev => prev.trim());
    finalTranscriptRef.current = '';
    baseInputRef.current = '';
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (isListeningRef.current) {
      stopRecognition();
    } else {
      baseInputRef.current = input;
      finalTranscriptRef.current = '';
      restartCountRef.current = 0;

      const beginListening = () => {
        isListeningRef.current = true;
        setIsListening(true);
        startRecognition();
      };

      // On mobile, getUserMedia holds an exclusive mic lock that blocks SpeechRecognition.
      // On desktop, SpeechRecognition sometimes needs a prior getUserMedia permission grant.
      // Solution: request permission, release the stream immediately, then start recognition.
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (!isMobile && navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          // Release immediately — we only needed the permission prompt
          stream.getTracks().forEach(t => t.stop());
          beginListening();
        }).catch(() => {
          // Permission denied — try starting directly anyway (Chrome may still allow it)
          beginListening();
        });
      } else {
        // Mobile or no getUserMedia — start directly, SpeechRecognition handles its own permissions
        beginListening();
      }
    }
  }, [input, startRecognition, stopRecognition]);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onend = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // Helper to get file icon/color based on extension
  const getFileInfo = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['pdf'].includes(ext)) return { color: 'text-red-400 bg-red-500/10', label: 'PDF' };
    if (['docx', 'doc'].includes(ext)) return { color: 'text-blue-400 bg-blue-500/10', label: 'DOC' };
    if (['xlsx', 'xls', 'csv'].includes(ext)) return { color: 'text-green-400 bg-green-500/10', label: 'XLS' };
    if (['json'].includes(ext)) return { color: 'text-yellow-400 bg-yellow-500/10', label: 'JSON' };
    if (['md'].includes(ext)) return { color: 'text-purple-400 bg-purple-500/10', label: 'MD' };
    if (['zip'].includes(ext)) return { color: 'text-orange-400 bg-orange-500/10', label: 'ZIP' };
    return { color: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)]', label: 'TXT' };
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    try {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          setImagePreview(base64);
          setAttachedImage({ 
            inlineData: { data: base64.split(',')[1] }, 
            mimeType: file.type 
          });
        };
        reader.readAsDataURL(file);
        return;
      }

      const extension = file.name.split('.').pop()?.toLowerCase();
      let content = '';

      if (extension === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          text += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
        content = text;
      } else if (extension === 'docx') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        content = result.value;
      } else if (['xlsx', 'xls', 'csv'].includes(extension || '')) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        content = XLSX.utils.sheet_to_csv(firstSheet);
      } else if (extension === 'zip') {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        let zipContent = `ZIP Archive: ${file.name}\n`;
        // Only read text-based files, skip binaries
        const textExtensions = new Set(['txt','md','json','csv','xml','html','htm','css','js','ts','tsx','jsx','py','java','c','cpp','h','rb','go','rs','sh','bat','yml','yaml','toml','ini','cfg','conf','env','log','sql','graphql','prisma','svelte','vue','php','swift','kt','scala','r','lua','pl','ps1','dockerfile','makefile','gitignore','editorconfig']);
        const entries = Object.entries(zip.files) as [string, any][];
        let fileCount = 0;
        const MAX_FILES = 30;
        const MAX_FILE_SIZE = 10000; // chars per file
        
        for (const [filename, zipFile] of entries) {
          if (zipFile.dir) continue;
          if (fileCount >= MAX_FILES) {
            zipContent += `\n... (${entries.length - fileCount} more files not shown)\n`;
            break;
          }
          const fileExt = filename.split('.').pop()?.toLowerCase() || '';
          const baseName = filename.split('/').pop()?.toLowerCase() || '';
          // Skip binary files and hidden files
          if (!textExtensions.has(fileExt) && !textExtensions.has(baseName)) {
            zipContent += `\n--- File: ${filename} --- [binary, skipped]\n`;
            fileCount++;
            continue;
          }
          try {
            const text = await zipFile.async('text');
            zipContent += `\n--- File: ${filename} ---\n${text.slice(0, MAX_FILE_SIZE)}\n`;
            if (text.length > MAX_FILE_SIZE) zipContent += `... (truncated, ${text.length} chars total)\n`;
          } catch {
            zipContent += `\n--- File: ${filename} --- [could not read]\n`;
          }
          fileCount++;
        }
        content = zipContent;
      } else {
        // Default text reading
        content = await file.text();
      }

      setAttachedDocs(prev => [...prev, { 
        title: file.name, 
        content: content, 
        type: file.type || extension || 'text/plain' 
      }]);
    } catch (error) {
      console.error("File processing failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => processFile(file));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
    setShowAttachMenu(false);
  };

  const removeImage = () => { 
    setAttachedImage(null); 
    setImagePreview(null); 
  };
  
  const removeDoc = (idx: number) => {
    setAttachedDocs(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedInput = input.trim();
    if ((trimmedInput || attachedImage || attachedDocs.length > 0) && !isProcessing) {
      if (!isDisabled) {
        // If not streaming, send immediately
        onSendMessage(trimmedInput, attachedImage || undefined, attachedDocs);
      } else {
        // If streaming, queue the prompt
        setPromptQueue(prev => [...prev, { content: trimmedInput, image: attachedImage || undefined, docs: attachedDocs }]);
      }
      setInput('');
      setAttachedImage(null);
      setImagePreview(null);
      setAttachedDocs([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Mobile: Enter = newline (user taps Send button). Desktop: Enter = send, Shift+Enter = newline.
    const isMobile = window.innerWidth < 768;
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      el.style.height = 'auto';
      const newHeight = Math.min(el.scrollHeight, window.innerHeight * 0.3);
      el.style.height = `${newHeight}px`;
    });
    return () => cancelAnimationFrame(raf);
  }, [input]);

const hasAttachments = imagePreview || attachedDocs.length > 0;

  // Style helpers for ChatGPT-like input and helper text
  const inputPlaceholderClass = "text-[1.08rem] sm:text-[1.08rem] font-normal text-[var(--text-secondary)]";
  const helperTextClass = "text-[12px] sm:text-[13px] text-[var(--text-secondary)]/60 mt-2 mb-1 leading-relaxed text-center";

  // Effect: When streaming ends and there is a queued prompt, send it automatically
  useEffect(() => {
    if (!isDisabled && promptQueue.length > 0 && !isProcessing) {
      const next = promptQueue[0];
      setPromptQueue(prev => prev.slice(1));
      onSendMessage(next.content, next.image, next.docs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDisabled, promptQueue, isProcessing]);

  return (
    <div className="p-3 sm:p-4 bg-[var(--bg-primary)] relative pb-safe flex-shrink-0 z-[35] transition-all">
      <div className="max-w-3xl mx-auto mb-2 flex items-center justify-between">
        <div>
          <button 
            ref={buttonRef}
            disabled={isDisabled}
            onClick={handleToggleDropdown}
            className={`flex items-center gap-2 px-3 py-1.5 text-[12px] sm:text-[13px] font-semibold rounded-full border shadow-sm transition-all ${modelColors[preferredModel]} ${isDisabled ? 'opacity-50' : 'hover:brightness-110 active:scale-95'}`}
          >
            <Icons.Robot className="w-3.5 h-3.5" />
            {modelExpertise[preferredModel].label}
            <Icons.PanelLeftOpen className={`w-2.5 h-2.5 transition-transform ${showModelDropdown ? 'rotate-90' : ''}`} />
          </button>
        </div>

        {showModelDropdown && dropdownPos && createPortal(
          <div 
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              transform: 'translateY(-100%)',
              zIndex: 9999,
            }}
            className="w-[min(20rem,calc(100vw-2rem))] sm:w-[26rem] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl shadow-2xl py-2 flex"
          >
            <div className="w-48 sm:w-56 border-r border-[var(--border)] flex flex-col">
              <button 
                onMouseEnter={() => setHoveredModel('auto')}
                onClick={() => { onModelChange?.('auto'); setShowModelDropdown(false); }} 
                className={`w-full text-left px-4 py-3 text-[13px] transition-colors ${preferredModel === 'auto' ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}
              >
                <div className="font-semibold tracking-tight flex items-center gap-2"><span className="text-sm">✨</span>Auto</div>
              </button>
              {[
                { m: AIModel.GPT4, l: "Reasoning & Planning", icon: "🧠" },
                { m: AIModel.CLAUDE, l: "Coding & Writing", icon: "⚡" },
                { m: AIModel.GEMINI, l: "Search & Speed", icon: "🔍" }
              ].map(({ m, l, icon }) => (
                <button 
                  key={m} 
                  onMouseEnter={() => setHoveredModel(m)}
                  onClick={() => { onModelChange?.(m); setShowModelDropdown(false); }} 
                  className={`w-full text-left px-4 py-3 text-[13px] transition-colors ${preferredModel === m ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]'}`}
                >
                  <div className="font-semibold tracking-tight flex items-center gap-2"><span className="text-sm">{icon}</span>{l}</div>
                </button>
              ))}
            </div>
            <div className="flex-1 p-4 bg-[var(--bg-tertiary)]/30 min-h-[160px] flex flex-col justify-center">
              {hoveredModel ? (
                <div>
                  <p className="text-[12px] sm:text-[13px] font-bold text-[var(--accent)] mb-1.5 tracking-tight leading-tight">{modelExpertise[hoveredModel].expertise}</p>
                  <p className="text-[12px] sm:text-[13px] text-[var(--text-secondary)] leading-relaxed opacity-80 mb-3">{modelExpertise[hoveredModel].detail}</p>
                  <p className="text-[11px] sm:text-[12px] text-[var(--text-secondary)]/60 leading-relaxed italic">{modelExpertise[hoveredModel].examples}</p>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                  <Icons.Shield className="w-8 h-8" />
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
        {isProcessing && (
          <div className="flex items-center gap-2 text-emerald-500 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".txt,.md,.json,.csv,.pdf,.docx,.xlsx,.xls,.zip" 
        onChange={handleFileChange}
        multiple
        aria-label="Attach file"
      />
      <input 
        type="file" 
        ref={imageInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleFileChange}
        aria-label="Attach image"
      />
      <input 
        type="file" 
        ref={cameraInputRef} 
        className="hidden" 
        accept="image/*" 
        capture="environment"
        onChange={handleFileChange}
        aria-label="Take photo"
      />

      {/* Main input container - ChatGPT style */}
      <div className="max-w-3xl mx-auto bg-[var(--bg-tertiary)]/40 rounded-2xl sm:rounded-3xl border border-[var(--border)] focus-within:border-[var(--text-secondary)]/30 transition-all shadow-xl relative">
        
        {/* Attachment previews inside the bar */}
        {hasAttachments && (
          <div className="px-3 pt-3 pb-0 flex flex-wrap gap-2">
            {imagePreview && (
              <div className="relative group">
                <div className="w-16 h-16 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg-secondary)]">
                  <img src={imagePreview} alt="Attached image" className="w-full h-full object-cover" />
                </div>
                <button 
                  onClick={removeImage} 
                  aria-label="Remove image" 
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white hover:border-red-500"
                >
                  <Icons.X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            {attachedDocs.map((doc, i) => {
              const info = getFileInfo(doc.title);
              const isZip = doc.title.toLowerCase().endsWith('.zip');
              
              if (isZip) {
                // Count files from the extracted content
                const fileMatches = doc.content.match(/--- File: /g);
                const totalFiles = fileMatches ? fileMatches.length : 0;
                // Extract first few filenames for preview
                const fileNames = [...doc.content.matchAll(/--- File: (.+?) ---/g)].slice(0, 4).map(m => m[1].split('/').pop());
                
                return (
                  <div key={i} className="relative group w-52">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl overflow-hidden">
                      {/* ZIP header */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border-b border-[var(--border)]">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-orange-500/20 text-orange-400">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{doc.title}</p>
                          <p className="text-[12px] text-orange-400 font-medium">{totalFiles} file{totalFiles !== 1 ? 's' : ''} extracted</p>
                        </div>
                      </div>
                      {/* File listing preview */}
                      <div className="px-3 py-1.5 space-y-0.5">
                        {fileNames.map((name, j) => (
                          <div key={j} className="flex items-center gap-1.5">
                            <div className="w-1 h-1 rounded-full bg-[var(--text-secondary)]/40 flex-shrink-0" />
                            <span className="text-[12px] text-[var(--text-secondary)] truncate">{name}</span>
                          </div>
                        ))}
                        {totalFiles > 4 && (
                          <p className="text-[11px] text-[var(--text-secondary)]/60 pl-2.5">+{totalFiles - 4} more</p>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => removeDoc(i)} 
                      aria-label="Remove document" 
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white hover:border-red-500"
                    >
                      <Icons.X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              }
              
              return (
                <div key={i} className="relative group flex items-center gap-2.5 px-3 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl min-w-[140px] max-w-[200px]">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${info.color}`}>
                    <span className="text-[11px] font-black uppercase">{info.label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{doc.title}</p>
                    <p className="text-[12px] text-[var(--text-secondary)]">{info.label} file</p>
                  </div>
                  <button 
                    onClick={() => removeDoc(i)} 
                    aria-label="Remove document" 
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white hover:border-red-500"
                  >
                    <Icons.X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end p-1.5 sm:p-2 gap-1">
          {/* Attach button - ChatGPT style + */}
          <button 
            ref={attachBtnRef}
            onClick={handleToggleAttachMenu}
            disabled={isDisabled || isProcessing}
            aria-label="Attach files"
            data-nexus-tooltip="Add files"
            className={`p-2 sm:p-2.5 mb-0.5 rounded-full transition-all flex-shrink-0 ${showAttachMenu ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 sm:w-5 sm:h-5 transition-transform ${showAttachMenu ? 'rotate-45' : ''}`}>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          {/* Attach menu portal */}
          {showAttachMenu && attachMenuPos && createPortal(
            <div 
              ref={attachMenuRef}
              style={{
                position: 'fixed',
                top: attachMenuPos.top,
                left: attachMenuPos.left,
                transform: 'translateY(-100%)',
                zIndex: 9999,
              }}
              className="w-56 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl shadow-2xl py-1.5 overflow-hidden"
            >
              <button
                onClick={() => { imageInputRef.current?.click(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] sm:text-[15px] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-[var(--text-secondary)]">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <circle cx="9" cy="9" r="2" />
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                </svg>
                Upload image
              </button>
              <button
                onClick={() => { cameraInputRef.current?.click(); setShowAttachMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] sm:text-[15px] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left sm:hidden"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-[var(--text-secondary)]">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                Camera
              </button>
              <button
                onClick={() => { fileInputRef.current?.click(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] sm:text-[15px] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors text-left"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5 text-[var(--text-secondary)]">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Upload file
              </button>
            </div>,
            document.body
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className={
              inputPlaceholderClass +
              " flex-1 bg-transparent text-[var(--text-primary)] py-2.5 sm:py-3 px-1 sm:px-2 focus:outline-none resize-none transition-all placeholder:text-[var(--text-secondary)]/40 text-[15px] sm:text-base leading-relaxed overflow-hidden overflow-y-auto"
            }
            // Input is never disabled, only the send/stop button is
            disabled={false}
            rows={1}
            aria-label="Chat message input"
          />

          {/* Right side buttons */}
          <div className="flex items-center gap-0.5 mb-0.5 flex-shrink-0">
            {/* Voice transcription mic — only shown when SpeechRecognition API exists */}
            {isSpeechSupported && (!input.trim() || isListening) && !isDisabled && (
              <button 
                onClick={toggleVoiceInput}
                aria-label={isListening ? "Stop listening" : "Voice input"}
                data-nexus-tooltip={isListening ? 'Stop mic' : 'Voice input'}
                className={`p-2 sm:p-2.5 rounded-full transition-all ${
                  isListening 
                    ? 'text-red-400 bg-red-500/10 animate-pulse' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                {isListening ? <Icons.MicOff className="w-5 h-5" /> : <Icons.Mic className="w-5 h-5" />}
              </button>
            )}
            {/* Send / Stop button */}
            <button 
              onClick={isDisabled ? onStop : () => handleSubmit()} 
              disabled={!isDisabled && (!input.trim() && !attachedImage && attachedDocs.length === 0)}
              aria-label={isDisabled ? "Stop generating" : "Send message"}
              data-nexus-tooltip={isDisabled ? 'Stop' : 'Send'}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-all flex items-center justify-center ${ 
                isDisabled 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
                  : (input.trim() || attachedImage || attachedDocs.length > 0) 
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] active:scale-95' 
                    : 'text-[var(--text-secondary)] opacity-20 cursor-not-allowed' 
              }`}
            >
              {isDisabled ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
      {/* Helper text example (add as needed) */}
      {/* <p className={helperTextClass}>Your message is private and secure.</p> */}
    </div>
  );
};

export default MessageInput;
