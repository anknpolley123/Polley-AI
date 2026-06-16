import React, { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  Send, 
  FileCode, 
  Folder, 
  Cpu, 
  Layers, 
  HardDrive, 
  Play, 
  Check, 
  Copy, 
  Settings, 
  History, 
  Info, 
  TrendingUp, 
  Code,
  Mic,
  Image as ImageIcon,
  Volume2,
  Battery,
  BatteryCharging,
  BatteryLow,
  ShieldAlert
} from "lucide-react";
import { androidFiles, AndroidFile } from "./data/androidFiles";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  type?: "text" | "image" | "audio";
  simulatedImage?: boolean; // dynamic graphic renderer flag for TinyDiffusion
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "ai",
      text: "Hello there, human teammate. I'm Polley AI. Now outfitted with full offline multimodal pipelines! I support Stable Diffusion / TinyDiffusion local image generation, Whisper JNI Speech-to-Text, and native Android offline Text-to-Speech.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: "text"
    }
  ]);

  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeFile, setActiveFile] = useState<AndroidFile>(androidFiles[0]);
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);
  
  // Custom interactive simulation states
  const [selectedTab, setSelectedTab] = useState<"emulator" | "source">("emulator");
  const [memoryMappedSize, setMemoryMappedSize] = useState(4.2);
  const [inferenceState, setInferenceState] = useState<"IDLE" | "PROCESSING" | "COMPILING" | "GENERATING" | "DECODING">("IDLE");
  const [lastGcTime, setLastGcTime] = useState<string>("Never");
  const [gcPulsing, setGcPulsing] = useState(false);
  const [whisperListening, setWhisperListening] = useState(false);
  const [ttsSpeechPlaying, setTtsSpeechPlaying] = useState<string | null>(null);

  // Battery status & simulation state
  const [batteryLevel, setBatteryLevel] = useState<number>(85);
  const [isPowerSaveMode, setIsPowerSaveMode] = useState<boolean>(false);
  const isLowPowerMode = batteryLevel <= 15 || isPowerSaveMode;

  // React on Low-Power changes to post matching System Logs/Alerts
  useEffect(() => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isLowPowerMode) {
      const lowPowerMsg: Message = {
        id: "low-power-" + Date.now(),
        sender: "ai",
        text: `⚠️ Battery Service: Low-power state recognized (${batteryLevel}% / PowerSave=${isPowerSaveMode ? "ON" : "OFF"}). Suspended on-device deep INT4 executors & decoupled model weights.`,
        timestamp: timeStr,
        type: "text"
      };
      setMessages(prev => {
        if (prev[prev.length - 1]?.text.includes("Battery Service: Low-power state")) return prev;
        return [...prev, lowPowerMsg];
      });
    } else {
      setMessages(prev => {
        const hasLowPowerBefore = prev.some(m => m.text.includes("Battery Service: Low-power state"));
        const alreadyOptimal = prev[prev.length - 1]?.text.includes("Battery Service: Optimal charge detected");
        if (hasLowPowerBefore && !alreadyOptimal) {
          return [...prev, {
            id: "normal-power-" + Date.now(),
            sender: "ai",
            text: `⚡ Battery Service: Optimal charge detected (${batteryLevel}%). Core multi-threaded ONNX / Whisper decoder pipelines resumed safely.`,
            timestamp: timeStr,
            type: "text"
          }];
        }
        return prev;
      });
    }
  }, [isLowPowerMode, batteryLevel, isPowerSaveMode]);
  
  // Ref for auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle standard message send to deep backend /api/chat
  const handleSendMessage = async (e?: React.FormEvent, customUserText?: string, messageType: "text" | "audio" | "image" = "text") => {
    if (e) e.preventDefault();
    const targetText = customUserText || inputText.trim();
    if (!targetText && messageType === "text") return;

    const userMsgText = targetText || "Generate symbolic cyberpunk neural node visual prompt";
    const newMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: userMsgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: messageType
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText("");
    setIsLoading(true);
    setInferenceState(messageType === "audio" ? "DECODING" : "PROCESSING");

    if (isLowPowerMode) {
      setTimeout(() => {
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: "ai",
          text: "⚠️ System Watchdog: Request on layout hold. On-device INT4 model weights decoder suspended to comply with active battery restrictions.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: "text"
        };
        setMessages(prev => [...prev, aiMsg]);
        setIsLoading(false);
        setInferenceState("IDLE");
      }, 800);
      return;
    }

    // Map history to server payload spec
    const historyPayload = messages.map(m => ({
      role: m.sender === "user" ? "user" : "model",
      text: m.text
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsgText,
          history: historyPayload
        })
      });

      if (!response.ok) {
        throw new Error("Failed to receive feedback from Gemini processor.");
      }

      const data = await response.json();
      const aiReply = data.text;
      
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: aiReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: "text"
      };
      
      setMessages(prev => [...prev, aiMsg]);
      triggerTtsVocalization(aiReply);
    } catch (err: any) {
      console.error(err);
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: `⚠️ Polley AI Exception: ${err.message || "Failed to make contact with local inference executor."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: "text"
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
      setInferenceState("IDLE");
    }
  };

  // Simulate local Whisper STT parsing microphone channel
  const triggerWhisperSpeechInput = () => {
    if (whisperListening || isLoading) return;
    if (isLowPowerMode) {
      const warningMsg: Message = {
        id: "stt-warning-" + Date.now(),
        sender: "ai",
        text: "⚠️ Whisper STT recording intercept: Mic decoding suspended for device state optimization under active Power Saving parameters.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: "text"
      };
      setMessages(prev => [...prev, warningMsg]);
      return;
    }
    setWhisperListening(true);
    setInferenceState("DECODING");

    setTimeout(() => {
      setWhisperListening(false);
      const voicePrompts = [
        "Optimize zero-copy MappedByteBuffer mappings to avoid memory garbage",
        "Generate a layout item_message.xml with dynamic nested margins",
        "Enable TinyDiffusion pipeline on the GPU thread pool"
      ];
      const randomText = voicePrompts[Math.floor(Math.random() * voicePrompts.length)];
      handleSendMessage(undefined, randomText, "audio");
    }, 2200);
  };

  // Simulate on-device local TinyDiffusion drawing matrix bitmaps
  const triggerLocalTinyDiffusionImage = () => {
    if (isLoading) return;
    if (isLowPowerMode) {
      const warningMsg: Message = {
        id: "diffusion-warning-" + Date.now(),
        sender: "ai",
        text: "⚠️ TinyDiffusion draw intercept: ONNX generation bypassed to prevent battery depletion under active Power Saving profiles.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: "text"
      };
      setMessages(prev => [...prev, warningMsg]);
      return;
    }
    const promptText = inputText.trim() || "Model visual parameters matrix grid representation";
    
    // Add User prompt message
    const userMsg: Message = {
      id: Date.now().toString(),
      sender: "user",
      text: `Prompt: "${promptText}". Calling ONNX Runtime TinyDiffusion INT4 weights...`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: "image"
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setIsLoading(true);
    setInferenceState("GENERATING");

    setTimeout(() => {
      const aiResponseMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: `TinyDiffusion offline inference successfully computed for prompt: "${promptText}". Zero-copy GPU memory mapped index compiled.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: "image",
        simulatedImage: true
      };
      setMessages(prev => [...prev, aiResponseMsg]);
      setIsLoading(false);
      setInferenceState("IDLE");
      triggerTtsVocalization("TinyDiffusion offline generation completed successfully.");
    }, 2500);
  };

  // Simulate speaking AI responses using native TTS voice output
  const triggerTtsVocalization = (text: string) => {
    setTtsSpeechPlaying(text.slice(0, 80) + "...");
    setTimeout(() => {
      setTtsSpeechPlaying(null);
    }, 4000);
  };

  const handleCopyCode = (file: AndroidFile) => {
    navigator.clipboard.writeText(file.content);
    setCopiedFileId(file.name);
    setTimeout(() => setCopiedFileId(null), 2000);
  };

  const runGarbageCollection = () => {
    setGcPulsing(true);
    setMemoryMappedSize(prev => +(Math.max(1.1, prev - 0.4)).toFixed(1));
    setTimeout(() => {
      setMemoryMappedSize(4.2);
      setLastGcTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setGcPulsing(false);
    }, 1200);
  };

  return (
    <div id="polley_workspace" className="min-h-screen bg-[#070708] text-slate-200 font-sans flex flex-col md:flex-row overflow-x-hidden">
      {/* LEFT SIDEBAR - Polley AI Project & Architecture Hub */}
      <aside id="sidebar" className="w-full md:w-80 border-b md:border-b-0 md:border-r border-slate-800 flex flex-col bg-[#0e0e10] shrink-0">
        {/* Title branding block */}
        <div className="p-6 border-b border-slate-800 bg-[#0c0c0e]">
          <div className="flex items-center space-x-3 mb-1.5">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-teal-500 shadow-[0_0_8px_#14b8a6]"></span>
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white select-none">POLLEY AI</h1>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Local Inference Workspace</p>
        </div>

        {/* Info & Metrics Deck */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {/* Active stats display */}
          <section id="system_stats" className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu size={12} className="text-slate-400" /> System Architecture
            </h3>
            
            <div className="space-y-3">
              <div className="bg-[#161618] p-3 rounded-xl border border-slate-800/80 hover:border-slate-700 transition">
                <p className="text-[10px] text-slate-500 mb-1 font-mono tracking-tight">ASSET_DESCRIPTOR</p>
                <p className="text-sm font-mono text-teal-400 truncate">assets/model.bin</p>
              </div>

              <div className="bg-[#161618] p-3 rounded-xl border border-slate-800/80 hover:border-slate-700 transition">
                <p className="text-[10px] text-slate-500 mb-1 font-mono tracking-tight">MEMORY_MAPPING</p>
                <div className="flex justify-between items-end">
                  <p className="text-lg font-mono text-white font-semibold">
                    {memoryMappedSize}
                    <span className="text-xs text-slate-500 ml-1">GB</span>
                  </p>
                  <p className="text-[10px] text-teal-400 mb-1 font-bold animate-pulse">MULTIMODAL</p>
                </div>
              </div>

              <div className="bg-[#161618] p-3 rounded-xl border border-slate-800/80 hover:border-slate-700 transition">
                <p className="text-[10px] text-slate-500 mb-1 font-mono tracking-tight">WHISPER DECODER STATE</p>
                <div className="flex justify-between items-center text-xs font-mono">
                  <p className="text-slate-300">whisper.cpp JNI</p>
                  <p className="text-emerald-400 font-bold">READY</p>
                </div>
              </div>

              <div className="bg-[#161618] p-3 rounded-xl border border-slate-800/80 hover:border-slate-700 transition">
                <p className="text-[10px] text-slate-500 mb-1 font-mono tracking-tight">NATIVE TTS AUDIO CHANNEL</p>
                <div className="flex justify-between items-center text-xs font-mono">
                  <p className="text-slate-300">android.speech.tts</p>
                  <p className={ttsSpeechPlaying ? "text-amber-400 animate-pulse font-bold" : "text-slate-500"}>
                    {ttsSpeechPlaying ? "SPEAKING" : "IDLE"}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Directory Navigation */}
          <section id="android_hierarchy" className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Folder size={12} className="text-slate-400" /> Project Sources
            </h3>
            
            <div className="space-y-1 bg-[#121214] p-2 rounded-xl border border-slate-800/50">
              <div className="flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-500 font-mono font-bold uppercase select-none">
                <span>📁 Polley-AI/app/...</span>
              </div>
              <div className="space-y-0.5">
                {androidFiles.map((file) => {
                  const isActive = activeFile.name === file.name;
                  return (
                    <button
                      key={file.name}
                      onClick={() => {
                        setActiveFile(file);
                        setSelectedTab("source");
                      }}
                      className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-xs font-mono transition ${
                        isActive
                          ? "bg-teal-900/10 border border-teal-500/20 text-teal-300"
                          : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center space-x-2 truncate">
                        <FileCode size={13} className={isActive ? "text-teal-400 font-semibold" : "text-slate-500"} />
                        <span className="truncate">{file.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Multi-thread pipeline monitoring */}
          <section id="threads_mon" className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={12} className="text-slate-400" /> Active Threads
            </h3>
            
            <div className="space-y-2.5 bg-[#121214] p-3 rounded-xl border border-slate-800/50">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Main UI Thread</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-teal-400 font-bold">120 FPS</span>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Inference Executor</span>
                {isLowPowerMode ? (
                  <span className="inline-flex items-center gap-1 text-red-400 animate-pulse font-mono font-bold text-[10px] tracking-tight bg-red-950/20 border border-red-500/30 px-1.5 py-0.5 rounded">
                    SUSPENDED
                  </span>
                ) : inferenceState === "PROCESSING" ? (
                  <span className="text-amber-500 animate-pulse font-bold tracking-tight italic">PROCESSING</span>
                ) : inferenceState === "GENERATING" ? (
                  <span className="text-teal-400 animate-pulse font-bold tracking-tight uppercase">DIFFUSION_RUN</span>
                ) : inferenceState === "DECODING" ? (
                  <span className="text-blue-400 animate-pulse font-bold uppercase">WHISPER_JNI</span>
                ) : (
                  <span className="text-teal-500 font-semibold">IDLE</span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">File IO Pipeline</span>
                <span className={isLowPowerMode ? "text-slate-500 line-through" : "text-slate-500"}>
                  {isLowPowerMode ? "SUSPENDED" : "READY (MAPPED)"}
                </span>
              </div>
              
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>GC Pulse Trigger:</span>
                <span className="text-slate-400">{lastGcTime}</span>
              </div>
            </div>
          </section>

          {/* Battery Diagnostics Emulator Control Widget */}
          <section id="battery_emulator" className="space-y-3">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Battery size={12} className="text-slate-400" /> Battery & Power Monitor
            </h3>
            
            <div className="bg-[#121214] p-3 rounded-xl border border-slate-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {batteryLevel <= 15 ? (
                    <BatteryLow className="text-red-500 animate-bounce" size={16} />
                  ) : (
                    <Battery className={isPowerSaveMode ? "text-amber-500 animate-pulse" : "text-teal-400"} size={16} />
                  )}
                  <span className="text-xs font-mono font-medium text-slate-300">Android Power Host</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className={`text-xs font-bold font-mono ${
                    batteryLevel <= 15 ? "text-red-500" : batteryLevel <= 35 ? "text-amber-500" : "text-teal-400"
                  }`}>
                    {batteryLevel}%
                  </span>
                  {isPowerSaveMode && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
                      LPM
                    </span>
                  )}
                </div>
              </div>

              {/* Slider scale */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-mono text-slate-500">
                  <span>Critical (15%)</span>
                  <span>Full</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="100" 
                  value={batteryLevel}
                  onChange={(e) => setBatteryLevel(Number(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
                />
              </div>

              {/* Power save mode toggle */}
              <label className="flex items-center justify-between p-2 rounded bg-slate-900/60 border border-slate-800/40 cursor-pointer select-none">
                <span className="text-[10px] font-mono text-slate-400">Android Power Saver</span>
                <input 
                  type="checkbox" 
                  checked={isPowerSaveMode}
                  onChange={(e) => setIsPowerSaveMode(e.target.checked)}
                  className="rounded border-slate-800 text-teal-600 focus:ring-0 focus:ring-offset-0 bg-slate-800 cursor-pointer"
                />
              </label>

              {/* Status banner */}
              <div className={`p-2 rounded text-center text-[10px] font-mono leading-relaxed border ${
                isLowPowerMode 
                  ? "bg-red-950/20 text-red-400 border-red-500/20" 
                  : "bg-teal-950/10 text-teal-400 border-teal-500/10"
              }`}>
                {isLowPowerMode ? (
                  <div className="flex items-center justify-center gap-1">
                    <ShieldAlert size={12} className="animate-pulse" />
                    <span>Inference execution paused!</span>
                  </div>
                ) : (
                  <span>Decouplers safe — nominal output charge</span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar engineer footer details */}
        <div id="sidebar_footer" className="p-4 border-t border-slate-800 bg-[#0a0a0b]/80 flex items-center justify-between select-none shrink-0">
          <div className="flex items-center space-x-3 text-slate-400">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-teal-600 to-emerald-700 flex items-center justify-center text-xs font-bold text-white shadow-md shadow-emerald-500/10">JD</div>
            <div>
              <p className="text-xs font-semibold text-white tracking-tight">Lead Engineer</p>
              <p className="text-[9px] font-mono text-slate-500">com.polleyai.debug</p>
            </div>
          </div>
          <div className="flex space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Offline engine healthy"></span>
          </div>
        </div>
      </aside>

      {/* WORKSPACE AREA */}
      <main id="workspace" className="flex-1 flex flex-col min-w-0">
        {/* Navigation / Header Frame */}
        <header id="workspace_header" className="h-20 border-b border-slate-800 flex items-center justify-between px-6 bg-[#0a0a0b]/85 backdrop-blur-md shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white tracking-tight truncate">Android Local AI Studio</h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">Session context: Multimodal INT4 Whisper & TinyDiffusion</p>
          </div>
          
          {/* Controls deck for tabs and benchmarks */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* Tab selector */}
            <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs font-mono">
              <button 
                onClick={() => setSelectedTab("emulator")}
                className={`px-3 py-1.5 rounded-md transition ${selectedTab === 'emulator' ? 'bg-[#1e1e24] text-white font-bold border border-slate-800' : 'text-slate-400 hover:text-white'}`}
              >
                📱 Live Emulator
              </button>
              <button 
                onClick={() => setSelectedTab("source")}
                className={`px-3 py-1.5 rounded-md transition ${selectedTab === 'source' ? 'bg-[#1e1e24] text-white font-bold border border-slate-800' : 'text-slate-400 hover:text-white'}`}
              >
                💻 Java/XML Source
              </button>
            </div>

            {/* Quick action buttons */}
            <button 
              onClick={runGarbageCollection}
              disabled={gcPulsing}
              className={`hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 active:scale-95 transition-all text-xs font-bold text-slate-300 rounded-lg ${gcPulsing ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${gcPulsing ? 'bg-amber-400 animate-spin' : 'bg-teal-500'}`}></span>
              <span>{gcPulsing ? "Collecting" : "Force GC"}</span>
            </button>
          </div>
        </header>

        {/* WORKSPACE CENTRAL WORK CANVAS */}
        <div id="content_canvas" className="flex-1 flex flex-col lg:flex-row min-h-0 bg-[#070708]">
          {/* TAB 1: EMULATOR CONTENT */}
          {selectedTab === "emulator" && (
            <div className="flex-1 flex flex-col lg:flex-row min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/70">
              {/* Left Column: Device Mockups/Demos and System Parameters details */}
              <div className="w-full lg:w-96 p-6 flex flex-col space-y-6 overflow-y-auto custom-scrollbar shrink-0 bg-[#0a0a0b]/50">
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-teal-400 font-mono">Local Host Controller</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Test the multimodal model pipelines inside the Android UI frame below. Use the gallery image or voice input icons to simulate TinyDiffusion ONNX or Whisper speech decoding.
                  </p>
                </div>

                {/* Simulated quick triggers */}
                <div className="space-y-3 bg-[#111113] border border-slate-800/80 p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2 font-mono">Active Pipelines Simulator</span>
                  
                  <div className="space-y-2">
                    <button 
                      onClick={triggerWhisperSpeechInput}
                      className="w-full text-left p-2.5 bg-slate-900 border border-slate-800 hover:border-teal-500/30 rounded-lg text-xs font-mono transition flex justify-between items-center group"
                    >
                      <span className="text-slate-300 group-hover:text-teal-300 flex items-center gap-1.5">
                        <Mic size={12} className="text-teal-400" /> Whisper JNI Rec()
                      </span>
                      <span className="text-teal-400 font-semibold flex items-center tracking-tighter">DECODE →</span>
                    </button>
                    
                    <button 
                      onClick={triggerLocalTinyDiffusionImage}
                      className="w-full text-left p-2.5 bg-slate-900 border border-slate-800 hover:border-teal-500/30 rounded-lg text-xs font-mono transition flex justify-between items-center group"
                    >
                      <span className="text-slate-300 group-hover:text-teal-300 flex items-center gap-1.5">
                        <ImageIcon size={12} className="text-emerald-400" /> TinyDiffusion 1.3B
                      </span>
                      <span className="text-emerald-400 font-semibold flex items-center tracking-tighter">RENDER →</span>
                    </button>
                  </div>
                </div>

                {/* Active speech player monitor */}
                {ttsSpeechPlaying && (
                  <div className="p-3.5 bg-teal-950/20 border border-teal-500/30 text-teal-300 text-xs rounded-lg flex items-center gap-2.5 animate-pulse">
                    <Volume2 size={16} className="text-teal-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-[10px] uppercase tracking-wider">android.speech.tts Active</p>
                      <p className="text-slate-300 truncate text-[11px] font-mono">"{ttsSpeechPlaying}"</p>
                    </div>
                  </div>
                )}

                {/* Benchmark table */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">MULTIMODAL INFERENCE STATS</h4>
                  <div className="border border-slate-800 rounded-xl overflow-hidden text-xs font-mono">
                    <div className="grid grid-cols-2 bg-slate-900/50 border-b border-slate-800/80 p-2 text-slate-500 text-[10px] uppercase font-bold">
                      <span>PIPELINE</span>
                      <span>DECODE SPEED</span>
                    </div>
                    <div className="divide-y divide-slate-800/50">
                      <div className="grid grid-cols-2 p-2.5">
                        <span className="text-slate-400">TinyDiffusion Gen</span>
                        <span className="text-teal-400 font-bold">2.4 sec/img</span>
                      </div>
                      <div className="grid grid-cols-2 p-2.5">
                        <span className="text-slate-400">Whisper.cpp JNI</span>
                        <span className="text-blue-400 font-bold">180 ms / audio</span>
                      </div>
                      <div className="grid grid-cols-2 p-2.5">
                        <span className="text-slate-400">Android native TTS</span>
                        <span className="text-emerald-500 font-bold">0 ms (Offline Engine)</span>
                      </div>
                      <div className="grid grid-cols-2 p-2.5">
                        <span className="text-slate-400">Zero-copy VRAM Cache</span>
                        <span className="text-slate-500">Shared (Mapped)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Android logcat emulated stream */}
                <div className="flex-1 min-h-36 bg-[#070708] border border-slate-800/80 rounded-xl p-3 font-mono text-[10px] flex flex-col space-y-1.5 overflow-hidden">
                  <div className="flex items-center justify-between text-slate-500 border-b border-slate-800/60 pb-1.5 mb-1 select-none">
                    <span className="font-bold flex items-center gap-1"><Terminal size={10} /> LOGCAT POINTERS</span>
                    <span className="text-[9px] text-emerald-500 animate-pulse font-bold">● ONLINE</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar text-slate-400">
                    <p className="text-slate-500">2026-06-15 23:25:01.309 D/PolleyAI: Initializing virtual address pointer maps...</p>
                    <p className="text-teal-400 font-bold">2026-06-15 23:25:01.312 I/PolleyAI: model.bin mapped completely.</p>
                    {whisperListening && (
                      <p className="text-blue-400 animate-pulse">2026-06-15 23:31:02.100 I/WhisperJNI: Recording mic pipeline... Running Whisper.cpp decoder</p>
                    )}
                    {inferenceState === "GENERATING" && (
                      <p className="text-emerald-400 animate-pulse">2026-06-15 23:31:03.410 I/TinyDiffusion: Allocating ONNX runtime textures... Draw loop computed</p>
                    )}
                    {ttsSpeechPlaying && (
                      <p className="text-amber-400 animate-pulse">2026-06-15 23:31:04.990 D/AndroidTTS: speak(...) queued to system audio channel.</p>
                    )}
                    <span className="text-slate-500">2026-06-15 23:31:05.101 D/PolleyAI: Listening on multimodal intent streams...</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Dynamic Mobile Chat Emulator with "Sophisticated Dark" Styling */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0b]/30">
                <div className="p-4 border-b border-slate-800/80 bg-[#0a0a0b]/80 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-2.5 h-2.5 bg-teal-500 rounded-full shadow-[0_0_8px_#14b8a6]"></div>
                    <span className="text-xs font-mono font-bold tracking-tight text-white">EMULATED THREAD STREAM</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">com.polleyai.chat</span>
                </div>

                {/* Message display board */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4 custom-scrollbar bg-[#080809]">
                  {messages.map((msg) => {
                    const isAi = msg.sender === "ai";
                    return (
                      <div key={msg.id} className={`flex ${isAi ? "justify-start" : "justify-end"} items-start`}>
                        {isAi && (
                          <div className="mr-3 mt-1 shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-teal-500/20">
                              P
                            </div>
                          </div>
                        )}
                        <div className={`p-4 rounded-2xl max-w-xl shadow-xl border ${
                          isAi 
                            ? "bg-slate-800/50 border border-slate-700/50 rounded-tl-none text-slate-300"
                            : "bg-[#2E3C57]/45 border border-teal-500/30 rounded-tr-none text-teal-100"
                        }`}>
                          {isAi && (
                            <div className="flex items-center justify-between mb-1.5 select-none font-mono">
                              <span className="text-[9px] font-bold text-teal-400 tracking-wider uppercase">Polley AI</span>
                              <span className="text-[9px] text-slate-500">{msg.timestamp}</span>
                            </div>
                          )}
                          
                          {/* Multimodal Badges inside Bubble */}
                          {msg.type === "audio" && (
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-tight font-mono mb-1.5">🎤 Local Whisper STT Audio</p>
                          )}
                          {msg.type === "image" && !isAi && (
                            <p className="text-[10px] text-teal-400 font-bold uppercase tracking-tight font-mono mb-1.5">🖼️ Image Diffusion Prompt</p>
                          )}
                          {msg.type === "image" && isAi && (
                            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-tight font-mono mb-1.5">🎨 local TinyDiffusion texture map</p>
                          )}

                          <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
                          
                          {/* Rendering Simulated TinyDiffusion Graphic */}
                          {msg.simulatedImage && (
                            <div className="mt-3.5 border border-slate-700 bg-slate-950 p-2 rounded-xl">
                              <div className="w-full h-32 bg-[#121214] rounded-lg border border-teal-500/20 flex flex-col items-center justify-center relative overflow-hidden select-none">
                                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-teal-500 to-blue-500"></div>
                                {/* simulated drawing/nodes */}
                                <div className="flex items-center space-x-6 relative z-10">
                                  <div className="w-8 h-8 rounded-full border border-teal-400 flex items-center justify-center text-[10px] text-teal-400 font-mono">I</div>
                                  <div className="w-10 h-10 rounded-full border-2 border-emerald-400 flex items-center justify-center text-xs text-emerald-300 font-semibold animate-pulse">SD</div>
                                  <div className="w-8 h-8 rounded-full border border-blue-400 flex items-center justify-center text-[10px] text-blue-400 font-mono">O</div>
                                </div>
                                <div className="mt-3 text-[9px] font-mono text-slate-500 flex justify-between w-full px-4 border-t border-slate-900 pt-1.5">
                                  <span>TINYDIFFUSION 1.3B</span>
                                  <span className="text-teal-400">INT4_MATRIX</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {!isAi && (
                            <div className="mt-1.5 text-right font-mono">
                              <span className="text-[9px] text-teal-400/70 tracking-tight">{msg.timestamp}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Specialized loaders */}
                  {isLoading && (
                    <div className="flex justify-start items-start">
                      <div className="mr-3 mt-1 shrink-0">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-600 to-blue-700 flex items-center justify-center text-white font-bold text-xs shadow-lg animate-pulse">
                          P
                        </div>
                      </div>
                      <div className="bg-slate-800/40 border border-slate-800/80 p-4 rounded-2xl rounded-tl-none max-w-xl shadow-xl flex items-center space-x-3 text-slate-400">
                        <div className="flex space-x-1">
                          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                        <span className="text-xs font-mono text-slate-500 italic">
                          {inferenceState === "GENERATING" ? "TinyDiffusion generating textures..." 
                            : inferenceState === "DECODING" ? "Whisper.cpp JNI decoding voice packet..."
                            : "Decoding model weights..."}
                        </span>
                      </div>
                    </div>
                  )}
                  {whisperListening && (
                    <div className="flex justify-end items-center mr-4">
                      <div className="bg-[#2E3C57]/40 border border-blue-500/20 px-4 py-2.5 rounded-full flex items-center space-x-2.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                        <span className="text-xs font-mono text-slate-300">Whisper Listening to microphone stream...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Keyboard input bar with Multimodal actions */}
                <form onSubmit={handleSendMessage} className="p-6 border-t border-slate-800 bg-[#0a0a0b]/40">
                  <div className="bg-[#161618] border border-slate-700/80 rounded-2xl p-2 flex items-center shadow-2xl focus-within:border-teal-500/80 transition-all">
                    
                    {/* TinyDiffusion active render icon */}
                    <button 
                      type="button"
                      onClick={triggerLocalTinyDiffusionImage}
                      title="Trigger TinyDiffusion local painting prompt template"
                      className="w-10 h-10 hover:bg-slate-800/80 text-teal-400 rounded-xl flex items-center justify-center transition"
                    >
                      <ImageIcon size={18} />
                    </button>

                    {/* Whisper JNI mic active icon */}
                    <button 
                      type="button"
                      onClick={triggerWhisperSpeechInput}
                      title="Simulate speech microphone intake decoder"
                      className="w-10 h-10 hover:bg-slate-800/80 text-blue-400 rounded-xl flex items-center justify-center transition mr-1"
                    >
                      <Mic size={18} />
                    </button>

                    <input 
                      type="text" 
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Instruct Polley AI or press icons for Multimodal simulation..."
                      className="bg-transparent border-none focus:ring-0 text-sm text-slate-200 px-3 flex-1 outline-none placeholder:text-slate-600"
                      disabled={isLoading}
                    />
                    <button 
                      type="submit"
                      disabled={isLoading || !inputText.trim()}
                      className="w-10 h-10 bg-teal-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20 hover:bg-teal-400 transition-colors disabled:opacity-45 disabled:hover:bg-teal-500 shrink-0"
                    >
                      <Send size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                  
                  {/* Status checklist metrics */}
                  <div className="flex justify-center mt-3.5 space-x-6 select-none">
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Thread Safe</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Asset Loaded</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-400"></div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Non-Blocking IO</span>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: JAVA/XML SOURCE CODE VIEWER AND ASSET INSPECTOR */}
          {selectedTab === "source" && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#070708]">
              {/* File navigation tab selector */}
              <div className="flex items-center space-x-1 p-3 bg-[#0a0a0b] border-b border-slate-800 overflow-x-auto custom-scrollbar select-none">
                {androidFiles.map((file) => {
                  const isActive = activeFile.name === file.name;
                  return (
                    <button
                      key={file.name}
                      onClick={() => setActiveFile(file)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition whitespace-nowrap shrink-0 flex items-center space-x-1.5 border ${
                        isActive
                          ? "bg-[#161618] border-slate-700 text-teal-300 font-bold"
                          : "bg-transparent border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900"
                      }`}
                    >
                      <FileCode size={12} className={isActive ? "text-teal-400 font-bold" : "text-slate-500"} />
                      <span>{file.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Code viewer pane */}
              <div className="flex-1 flex flex-col min-h-0 relative">
                {/* Meta details bar */}
                <div className="bg-[#0b0b0d] border-b border-stone-900 px-6 py-2.5 flex items-center justify-between text-xs font-mono select-none">
                  <div className="flex items-center space-x-2.5 text-slate-500">
                    <span className="font-bold text-slate-400">Path:</span>
                    <span className="text-slate-500">{activeFile.path}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="px-2 py-0.5 bg-slate-900 text-[10px] text-slate-400 rounded-md border border-slate-800 capitalize">{activeFile.language} Source</span>
                    
                    {/* Copy to system clipboard action */}
                    <button 
                      onClick={() => handleCopyCode(activeFile)}
                      className="text-slate-400 hover:text-white flex items-center space-x-1.5 transition active:scale-95 font-sans"
                    >
                      {copiedFileId === activeFile.name ? (
                        <>
                          <Check size={13} className="text-emerald-500" />
                          <span className="text-[11px] text-emerald-400 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span className="text-[11px]">Copy Raw</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Displaying structured code files */}
                <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed bg-[#0a0a0c] selection:bg-teal-500/20">
                  <pre className="text-slate-300">
                    <code>
                      {activeFile.content}
                    </code>
                  </pre>
                </div>
                
                {/* Visual file description context */}
                <div className="p-4 bg-[#0d0d10] border-t border-slate-800 flex items-center space-x-3 text-xs leading-relaxed text-slate-400 select-none">
                  <div className="w-2.5 h-2.5 bg-teal-500 rounded-full shrink-0"></div>
                  <div>
                    <span className="font-bold text-white mr-1.5">Architectural Insight:</span>
                    {activeFile.name === "MainActivity.java" && (
                      <span>Utilizes virtual mapped blocks (`READ_ONLY`) bypassing heap allocation. Thread safe execution pipeline runs purely with background executors to maintain user responsiveness. Features local voice recording / Whisper speech-to-get text decode sequences and local Stable Diffusion rendering.</span>
                    )}
                    {activeFile.name === "ChatAdapter.java" && (
                      <span>Renders dynamic dual bubble item types safely. Expanded with item badges, ImageView support for rendered Stable Diffusion bitmaps, and custom metadata.</span>
                    )}
                    {activeFile.name === "ChatMessage.java" && (
                      <span>High-performance simple data descriptor binding parameters. Supports Bitmap references, audio markers, and message Type identifiers.</span>
                    )}
                    {activeFile.name.endsWith(".xml") && (
                      <span>Android specific schema designed strictly to support layout parameters without nested hierarchy limits, optimizing layout passes. Features multimodal buttons.</span>
                    )}
                    {activeFile.name === "model.bin Descriptor" && (
                      <span>Properties identifying model parameters read directly from our asset manager file descriptors in the zero-copy buffer.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
