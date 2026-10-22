import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = 'https://guardian-voice-final.onrender.com/api/chat';
const RESET_URL = 'https://guardian-voice-final.onrender.com/api/reset';

function App() {
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hello! I am Guardian Voice. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [showVetoPanel, setShowVetoPanel] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(""); 
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [currentPlaylist, setCurrentPlaylist] = useState(null);
  const [isGuest, setIsGuest] = useState(false);
  const [isLockdown, setIsLockdown] = useState(false);
  
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, showCodeBox, showVetoPanel, showEmergency, isLockdown]);

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
    axios.post(RESET_URL)
      .then(() => {
        setIsGuest(false);
        setShowCodeBox(false);
        setShowVetoPanel(false);
        setIsLockdown(false);
      })
      .catch(err => console.log("Reset failed"));
  }, []);

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const alexaVoice = voices.find(v => v.name.includes('Google US English') || v.name.includes('Samantha') || v.name.includes('Zira'));
      if (alexaVoice) utterance.voice = alexaVoice;
      utterance.rate = 1.0; 
      utterance.pitch = 1.1; 
      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Browser voice support nahi karta. Chrome use karein.");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      handleSend(null, transcript); 
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognition.start();
  };

  const handleSend = async (e, voiceText = null) => {
    if (e) e.preventDefault();
    const userMessage = voiceText || input;
    if (!userMessage.trim()) return;

    setMessages((prev) => [...prev, { sender: 'user', text: userMessage }]);
    setInput('');
    setIsLoading(true);
    setShowEmergency(false);

    try {
      const response = await axios.post(BACKEND_URL, { message: userMessage });
      const data = response.data;
      
      setMessages((prev) => [...prev, { sender: 'ai', text: data.reply }]);
      speak(data.reply);

      if (data.uiUpdate?.silentSOS) {
        setMessages((prev) => [...prev, { sender: 'ai', text: '[SILENT SOS SENT TO AUTHORITIES]' }]);
      }
      if (data.uiUpdate?.guestMode !== undefined) setIsGuest(data.uiUpdate.guestMode);
      if (data.uiUpdate?.triggerLockdown) {
        setIsLockdown(true);
        setTimeout(() => setIsLockdown(false), 5000); 
      }
      if (data.uiUpdate?.showCode) {
        setShowCodeBox(true);
        setGeneratedCode(data.uiUpdate.code);
      }
      if (data.uiUpdate?.showPending) {
        setShowCodeBox(false);
        setShowVetoPanel(true);
      }
      if (data.uiUpdate?.clearPending) {
        setShowVetoPanel(false);
        setShowCodeBox(false);
      }
      
      if (data.uiUpdate?.playMusic) {
        if (audioRef.current) {
          audioRef.current.src = data.uiUpdate.trackUrl;
          audioRef.current.volume = 0.3;
          audioRef.current.play().catch(e => console.log("Audio blocked"));
          setCurrentPlaylist(data.uiUpdate.playlistName); 
        }
      }
      
      if (data.uiUpdate?.stopMusic) {
        if (audioRef.current) {
          audioRef.current.pause();
          setCurrentPlaylist(null);
        }
      }

      if (data.uiUpdate?.volumeUp) {
        if (audioRef.current && audioRef.current.volume < 1.0) {
          audioRef.current.volume = Math.min(1.0, audioRef.current.volume + 0.2);
        }
      }

      if (data.uiUpdate?.volumeDown) {
        if (audioRef.current && audioRef.current.volume > 0.0) {
          audioRef.current.volume = Math.max(0.0, audioRef.current.volume - 0.2);
        }
      }

      if (data.uiUpdate?.showEmergency) setShowEmergency(true);

    } catch (error) {
      setMessages((prev) => [...prev, { sender: 'ai', text: 'Connection error. Wake up backend.' }]);
    }
    setIsLoading(false);
  };

  const handleVeto = async () => {
    setMessages((prev) => [...prev, { sender: 'user', text: 'VETO' }]);
    speak("Action vetoed. The task remains blocked.");
    setIsLoading(true);
    try {
      const response = await axios.post(BACKEND_URL, { message: 'veto' });
      setMessages((prev) => [...prev, { sender: 'ai', text: response.data.reply }]);
      setShowVetoPanel(false);
    } catch (error) {
      console.error(error);
    }
    setIsLoading(false);
  };

  const handleAccept = async () => {
    setMessages((prev) => [...prev, { sender: 'user', text: 'ACCEPT' }]);
    speak("Action approved. Executing task now.");
    setIsLoading(true);
    try {
      const response = await axios.post(BACKEND_URL, { message: 'accept' });
      setMessages((prev) => [...prev, { sender: 'ai', text: response.data.reply }]);
      setShowVetoPanel(false);
    } catch (error) {
      console.error(error);
    }
    setIsLoading(false);
  };

  const runAutoDemo = async () => {
    if (isAutoPlaying) return;
    setIsAutoPlaying(true);
    setMessages([{ sender: 'ai', text: 'Starting automated demo sequence...' }]);
    
    await new Promise(r => setTimeout(r, 2000));
    setMessages(prev => [...prev, { sender: 'user', text: 'Alexa, unlock the front door.' }]);
    await new Promise(r => setTimeout(r, 1000));
    
    try {
      const res1 = await axios.post(BACKEND_URL, { message: 'unlock the front door' });
      setMessages(prev => [...prev, { sender: 'ai', text: res1.data.reply }]);
      speak(res1.data.reply);
      setShowCodeBox(true);
      setGeneratedCode(res1.data.uiUpdate.code);

      await new Promise(r => setTimeout(r, 6000));
      setMessages(prev => [...prev, { sender: 'user', text: `The code is ${res1.data.uiUpdate.code}` }]);
      await new Promise(r => setTimeout(r, 1000));

      const res2 = await axios.post(BACKEND_URL, { message: res1.data.uiUpdate.code });
      setMessages(prev => [...prev, { sender: 'ai', text: res2.data.reply }]);
      speak(res2.data.reply);
      setShowCodeBox(false);
      setShowVetoPanel(true);

      await new Promise(r => setTimeout(r, 4000));
      setMessages(prev => [...prev, { sender: 'user', text: 'VETO' }]);
      await new Promise(r => setTimeout(r, 1000));
      
      const res3 = await axios.post(BACKEND_URL, { message: 'veto' });
      setMessages(prev => [...prev, { sender: 'ai', text: res3.data.reply }]);
      speak(res3.data.reply);
      setShowVetoPanel(false);

    } catch (error) {
      console.error(error);
    }
    setIsAutoPlaying(false);
  };

  return (
    <div className={`min-h-screen flex justify-center items-center p-4 md:p-8 font-sans transition-colors duration-500 ${showEmergency ? 'bg-red-900' : 'bg-[#F4F1EA] text-stone-800'}`}>
      
      <audio ref={audioRef} />

      {isLockdown && (
        <div className="fixed inset-0 z-50 bg-red-950/90 backdrop-blur-md flex flex-col items-center justify-center animate-pulse">
            <svg className="w-32 h-32 text-red-500 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            <h1 className="text-red-500 font-mono font-bold text-5xl tracking-widest mb-4">LOCKDOWN</h1>
            <p className="text-red-200 font-mono text-lg">SECURITY BREACH DETECTED</p>
            <p className="text-red-400 font-mono text-sm mt-4 animate-ping">Isolating system...</p>
        </div>
      )}

      <div className={`w-full max-w-6xl rounded-3xl shadow-xl border flex flex-col md:flex-row overflow-hidden h-[90vh] ${showEmergency ? 'bg-red-950 border-red-700' : 'bg-[#FDFCF8] border-stone-200 shadow-stone-200/60'}`}>
        
        <div className={`w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r ${showEmergency ? 'border-red-800' : 'border-stone-200'}`}>
          
          <div className={`p-6 border-b flex justify-between items-center z-10 ${showEmergency ? 'bg-red-900 border-red-800 text-white' : 'bg-[#FDFCF8] border-stone-200'}`}>
              <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${showEmergency ? 'bg-white text-red-900' : 'bg-stone-900 text-[#F4F1EA]'}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                  </div>
                  <div>
                      <h1 className={`text-xl font-bold tracking-tight ${showEmergency ? 'text-white' : 'text-stone-900'}`}>Guardian Voice</h1>
                      <p className={`text-xs font-medium tracking-wide uppercase ${showEmergency ? 'text-red-200' : 'text-stone-500'}`}>Alexa+ Simulator</p>
                  </div>
              </div>
              <div className="flex gap-2">
                  {isGuest && (
                      <span className="bg-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded-lg font-bold uppercase tracking-wide border border-amber-300">
                          Guest Mode
                      </span>
                  )}
                  <button onClick={runAutoDemo} disabled={isAutoPlaying} className={`text-xs px-4 py-2 rounded-lg font-bold transition-all uppercase tracking-wide ${isAutoPlaying ? 'bg-stone-200 text-stone-400' : showEmergency ? 'bg-white text-red-900 hover:bg-red-100' : 'bg-stone-900 text-[#F4F1EA] hover:bg-stone-800'}`}>
                      {isAutoPlaying ? 'Running...' : 'Auto-Demo'}
                  </button>
              </div>
          </div>

          {currentPlaylist && (
            <div className="bg-[#F4F1EA] border-b border-stone-200 px-6 py-3 flex items-center justify-between animate-in slide-in-from-top duration-300">
              <div className="flex items-center gap-3">
                <div className="flex gap-1 h-4 items-end">
                  <div className="w-1 bg-stone-800 animate-[bounce_1s_infinite] h-full"></div>
                  <div className="w-1 bg-stone-800 animate-[bounce_1.2s_infinite] h-2/3"></div>
                  <div className="w-1 bg-stone-800 animate-[bounce_0.8s_infinite] h-full"></div>
                </div>
                <span className="text-xs font-bold tracking-widest uppercase text-stone-600">Now Playing: {currentPlaylist}</span>
              </div>
              <button onClick={() => { audioRef.current.pause(); setCurrentPlaylist(null); }} className="text-xs font-bold text-red-600 hover:text-red-800 uppercase">Stop</button>
            </div>
          )}
          
          <div className={`flex-1 overflow-y-auto p-6 space-y-6 ${showEmergency ? 'bg-red-950/50' : 'bg-[#F4F1EA]/50'}`}>
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed ${msg.sender === 'user' ? (showEmergency ? 'bg-red-700 text-white rounded-br-none' : 'bg-stone-900 text-[#F4F1EA] rounded-br-none shadow-md') : (showEmergency ? 'bg-red-900 text-red-100 border border-red-700 rounded-bl-none' : 'bg-white border border-stone-200 text-stone-700 rounded-bl-none shadow-sm')}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className={`text-sm animate-pulse italic ${showEmergency ? 'text-red-300' : 'text-stone-400'}`}>Guardian is processing...</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className={`p-6 border-t ${showEmergency ? 'bg-red-900 border-red-800' : 'bg-[#FDFCF8] border-stone-200'}`}>
              <form onSubmit={handleSend} className="flex gap-3">
                <button type="button" onClick={startListening} className={`p-4 rounded-xl transition-all ${isListening ? 'bg-red-700 text-white animate-pulse' : showEmergency ? 'bg-red-800 text-red-200 hover:bg-red-700' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                </button>
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Say: 'I am the owner', 'Play lofi', or 'Help'" className={`flex-1 border rounded-xl px-5 py-4 focus:outline-none focus:ring-2 transition-all text-sm ${showEmergency ? 'bg-red-800 border-red-700 text-white placeholder-red-300 focus:ring-white/20 focus:border-white' : 'bg-[#F4F1EA] border-stone-300 text-stone-900 placeholder-stone-400 focus:ring-stone-900/10 focus:border-stone-900'}`} />
                <button type="submit" className={`px-8 py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center ${showEmergency ? 'bg-white text-red-900 hover:bg-red-100' : 'bg-stone-900 hover:bg-stone-800 text-[#F4F1EA]'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                </button>
              </form>
          </div>
        </div>

        <div className={`w-full md:w-1/2 p-6 md:p-8 flex flex-col relative ${showEmergency ? 'bg-red-950' : 'bg-[#F4F1EA]'}`}>
          
          <div className="mb-8 bg-stone-900 rounded-2xl p-5 shadow-inner h-40 overflow-y-auto font-mono text-xs border border-stone-800">
              <p className="text-stone-500 mb-3 tracking-widest uppercase text-[10px]">System Security Logs</p>
              {messages.map((msg, i) => {
                  if (msg.text.includes("Playing")) return <p key={i} className="text-emerald-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 block"></span>[LOW-RISK] Music playback started.</p>;
                  if (msg.text.includes("stopped")) return <p key={i} className="text-stone-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-stone-400 block"></span>[LOW-RISK] Music stopped.</p>;
                  if (msg.text.includes("volume")) return <p key={i} className="text-emerald-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 block"></span>[LOW-RISK] Volume adjusted.</p>;
                  if (msg.text.includes("weather")) return <p key={i} className="text-emerald-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 block"></span>[LOW-RISK] Weather fetched.</p>;
                  if (msg.text.includes("Passphrase verified")) return <p key={i} className="text-emerald-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 block"></span>[SECURITY] Owner authenticated.</p>;
                  if (msg.text.includes("Voice verification required")) return <p key={i} className="text-blue-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 block"></span>[SECURITY] Awaiting passphrase.</p>;
                  if (msg.text.includes("Unauthorized")) return <p key={i} className="text-red-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 block"></span>[SECURITY] Unauthorized access blocked.</p>;
                  if (msg.text.includes("Emergency")) return <p key={i} className="text-red-500 mb-1.5 flex items-center gap-2 animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-red-500 block"></span>[CRITICAL] Emergency protocol engaged!</p>;
                  if (msg.text.includes("4-digit code")) return <p key={i} className="text-amber-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 block"></span>[HIGH-RISK] Awaiting verification.</p>;
                  if (msg.text.includes("vetoed")) return <p key={i} className="text-red-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-400 block"></span>[VETO] Action blocked by human.</p>;
                  if (msg.text.includes("approved")) return <p key={i} className="text-emerald-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 block"></span>[ACCEPT] Action approved.</p>;
                  if (msg.text.includes("verified")) return <p key={i} className="text-blue-400 mb-1.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 block"></span>[SECURITY] Identity verified.</p>;
                  if (msg.text.includes("lockdown")) return <p key={i} className="text-red-600 mb-1.5 flex items-center gap-2 animate-pulse"><span className="w-1.5 h-1.5 rounded-full bg-red-600 block"></span>[CRITICAL] System Lockdown Initiated!</p>;
                  if (msg.text.includes("SILENT SOS")) return <p key={i} className="text-red-600 mb-1.5 flex items-center gap-2 animate-ping"><span className="w-1.5 h-1.5 rounded-full bg-red-600 block"></span>[CRITICAL] Silent SOS transmitted!</p>;
                  return null;
              })}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
              
              {showEmergency && (
                <div className="bg-red-900 border-2 border-red-500 p-8 rounded-3xl w-full max-w-md text-center shadow-2xl shadow-red-900/50 animate-pulse">
                  <svg className="w-20 h-20 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  <h2 className="text-white font-bold text-3xl mb-2 tracking-tight">EMERGENCY ALERT</h2>
                  <p className="text-red-200">Emergency contacts have been notified.</p>
                </div>
              )}

              {!showEmergency && showCodeBox && (
              <div className="bg-[#FDFCF8] border border-stone-200 p-8 rounded-3xl w-full max-w-md text-center shadow-xl shadow-stone-200/50 animate-in fade-in zoom-in duration-300">
                  <div className="w-16 h-16 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto mb
