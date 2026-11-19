import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = 'https://guardian-voice-final.onrender.com/api/chat';
const RESET_URL = 'https://guardian-voice-final.onrender.com/api/reset';
const HISTORY_URL = 'https://guardian-voice-final.onrender.com/api/history';
const VISION_URL = 'https://guardian-voice-final.onrender.com/api/analyze-image';

function App() {
  const [messages, setMessages] = useState([{ sender: 'ai', text: 'Guardian Voice active. System secure. How can I help?' }]);
  const [input, setInput] = useState('');
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [showVetoPanel, setShowVetoPanel] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(""); 
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [threatLevel, setThreatLevel] = useState("LOW");
  const [historyData, setHistoryData] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isLockdown, setIsLockdown] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [ownerPin, setOwnerPin] = useState("");
  
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, showCodeBox, showVetoPanel, showEmergency, isLockdown, isSpeaking]);

  useEffect(() => {
    axios.post(RESET_URL).catch(() => {});
  }, []);

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      setMessages(prev => [...prev, { sender: 'user', text: '📷 [Image Uploaded]' }]);
      setIsLoading(true);
      try {
        const res = await axios.post(VISION_URL, { imageBase64: reader.result });
        setMessages(prev => [...prev, { sender: 'ai', text: res.data.reply }]);
        speak(res.data.reply);
      } catch (error) {
        setMessages(prev => [...prev, { sender: 'ai', text: 'Error processing image.' }]);
      }
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSend = async (e, text = null) => {
    if (e) e.preventDefault();
    const userMessage = text || input;
    if (!userMessage.trim()) return;

    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await axios.post(BACKEND_URL, { message: userMessage });
      const data = res.data;
      setMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);
      speak(data.reply);

      if (data.uiUpdate?.triggerLockdown) {
        setThreatLevel("HIGH");
        setIsLockdown(true);
        setTimeout(() => { setIsLockdown(false); setThreatLevel("LOW"); }, 5000);
      }
      if (data.uiUpdate?.showCode) { setShowCodeBox(true); setGeneratedCode(data.uiUpdate.code); }
      if (data.uiUpdate?.showPending) { setShowCodeBox(false); setShowVetoPanel(true); }
      if (data.uiUpdate?.clearPending) { setShowVetoPanel(false); setShowCodeBox(false); }
      if (data.uiUpdate?.playMusic) { audioRef.current.src = data.uiUpdate.trackUrl; audioRef.current.play(); }
      if (data.uiUpdate?.showEmergency) { setShowEmergency(true); }
      if (data.uiUpdate?.guestMode !== undefined) { setIsGuest(data.uiUpdate.guestMode); }
    } catch (error) {
      setMessages(prev => [...prev, { sender: 'ai', text: 'Connection error.' }]);
    }
    setIsLoading(false);
  };

  const fetchHistoryWithPin = async () => {
    try {
      const res = await axios.get(`${HISTORY_URL}?pin=${ownerPin}`);
      setHistoryData(res.data);
      setShowPinModal(false);
      setShowHistory(true);
    } catch (error) {
      alert("Invalid Owner PIN");
    }
  };

  return (
    <div className={`min-h-screen flex justify-center items-start md:items-center p-2 md:p-8 font-sans transition-colors duration-500 ${showEmergency ? 'bg-red-900' : 'bg-[#F4F1EA] text-stone-800'}`}>
      <audio ref={audioRef} />
      <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />

      {isLockdown && (
        <div className="fixed inset-0 z-50 bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center animate-pulse">
            <h1 className="text-red-500 font-mono font-bold text-6xl tracking-widest mb-4">LOCKDOWN</h1>
            <p className="text-red-200 text-lg">SECURITY BREACH DETECTED</p>
        </div>
      )}

      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center p-4">
          <div className="bg-[#FDFCF8] p-6 rounded-2xl w-full max-w-sm shadow-2xl border border-stone-200">
            <h2 className="text-xl font-bold text-stone-900 mb-2">Owner Access Only</h2>
            <p className="text-sm text-stone-500 mb-4">Enter your 4-digit PIN to view logs.</p>
            <input type="password" value={ownerPin} onChange={(e) => setOwnerPin(e.target.value)} maxLength={4} className="w-full bg-[#F4F1EA] border border-stone-300 rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-mono mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setShowPinModal(false)} className="px-4 py-2 rounded-lg font-bold text-stone-600 hover:bg-stone-100 w-full">Cancel</button>
              <button onClick={fetchHistoryWithPin} className="px-4 py-2 rounded-lg font-bold text-white bg-teal-800 hover:bg-teal-900 w-full">Verify</button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center p-4">
          <div className="bg-[#FDFCF8] p-6 rounded-2xl w-full max-w-md shadow-2xl border border-stone-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-stone-900">Owner Audit Logs</h2>
              <button onClick={() => setShowHistory(false)} className="text-red-500 font-bold text-xl">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {historyData.map((item, i) => (
                <div key={i} className="bg-white p-3 rounded-lg border border-stone-200 flex justify-between items-center text-sm shadow-sm">
                  <div>
                    <p className="font-bold text-stone-800">{item.action}</p>
                    <p className="text-xs text-stone-400">{item.role} • {item.time}</p>
                  </div>
                  <span className={`font-bold text-xs px-2 py-1 rounded ${item.status.includes('DENIED') || item.status.includes('LOCKDOWN') || item.status.includes('VETO') ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`w-full max-w-6xl rounded-3xl shadow-2xl border flex flex-col md:flex-row overflow-hidden min-h-[85vh] md:h-[90vh] ${showEmergency ? 'bg-red-950 border-red-700' : 'bg-[#FDFCF8] border-stone-200'}`}>
        
        <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-stone-200">
          
          <div className={`p-4 md:p-6 border-b flex flex-col md:flex-row gap-3 justify-between items-start md:items-center ${showEmergency ? 'bg-red-900 text-white' : 'bg-[#FDFCF8]'}`}>
              <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-800 text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                  </div>
                  <div>
                      <h1 className="text-lg md:text-xl font-bold tracking-tight text-stone-900">Guardian Voice</h1>
                      <p className="text-[10px] md:text-xs font-medium text-stone-500 uppercase">Secure Smart Home</p>
                  </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold border ${threatLevel === 'HIGH' ? 'bg-red-500 text-white border-red-600 animate-pulse' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>Threat: {threatLevel}</span>
                  <button onClick={() => setShowPinModal(true)} className="text-[10px] bg-stone-200 text-stone-800 px-2 py-1.5 rounded-lg font-bold hover:bg-stone-300 border border-stone-300">📜 Logs</button>
              </div>
          </div>
          
          <div className="relative flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-[#F4F1EA]/50">
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center">
                <svg className="w-64 h-64 md:w-96 md:h-96 text-stone-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            </div>

            <div className="relative z-10">
                {messages.map((msg, index) => (
                  <div key={index} className={`flex mb-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 md:p-4 rounded-2xl text-xs md:text-sm leading-relaxed ${msg.sender === 'user' ? 'bg-teal-800 text-white rounded-br-none shadow-md' : 'bg-white border border-stone-200 text-stone-700 rounded-bl-none shadow-sm'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isLoading && <div className="text-stone-400 text-xs animate-pulse ml-2">Processing...</div>}
                <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="p-4 bg-[#FDFCF8] border-t border-stone-200">
              <form onSubmit={handleSend} className="flex gap-2">
                <button type="button" onClick={() => fileInputRef.current.click()} className="p-3 rounded-xl bg-stone-200 text-stone-700 hover:bg-stone-300 border border-stone-300">📷</button>
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type command..." className="flex-1 bg-[#F4F1EA] border border-stone-300 rounded-xl px-4 py-2 text-stone-900 text-sm focus:outline-none focus:border-teal-700" />
                <button type="submit" className="px-6 py-2 rounded-xl font-bold bg-teal-800 text-white hover:bg-teal-900 shadow-md">Send</button>
              </form>
          </div>
        </div>

        <div className="w-full md:w-1/2 p-6 flex flex-col bg-[#F4F1EA]">
          <div className="bg-stone-900 rounded-2xl p-4 h-40 overflow-y-auto font-mono text-xs text-emerald-400 border border-stone-800 mb-6 shadow-inner">
              <p className="text-stone-500 mb-2">System Security Logs</p>
              {messages.map((msg, i) => {
                  if (msg.text.includes("Owner")) return <p key={i} className="mb-1">[SECURITY] Owner Auth</p>;
                  if (msg.text.includes("Unauthorized")) return <p key={i} className="text-red-400 mb-1">[ALERT] Unauthorized Access</p>;
                  return null;
              })}
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center">
              {showCodeBox && (
              <div className="bg-white border border-stone-200 p-8 rounded-3xl w-full max-w-md text-center shadow-xl">
                  <h2 className="text-stone-900 font-bold text-2xl mb-4">Verification Code</h2>
                  <div className="bg-[#F4F1EA] py-6 rounded-2xl tracking-[0.5em] text-5xl font-mono text-stone-900 font-bold border border-stone-300">{generatedCode}</div>
              </div>
              )}

              {showVetoPanel && (
              <div className="bg-white border border-amber-300 p-8 rounded-3xl w-full max-w-md text-center shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                  <h2 className="text-stone-900 font-bold text-2xl mb-2">Pending Approval</h2>
                  <div className="flex gap-4 mt-6">
                    <button onClick={() => handleSend(null, 'accept')} className="bg-stone-200 text-stone-800 py-3 rounded-xl font-bold w-full border border-stone-300">ACCEPT</button>
                    <button onClick={() => handleSend(null, 'veto')} className="bg-red-700 text-white py-3 rounded-xl font-bold w-full shadow-lg">VETO</button>
                  </div>
              </div>
              )}

              {!showCodeBox && !showVetoPanel && (
              <div className="w-full max-w-md space-y-4">
                  <div className="bg-white p-6 rounded-3xl shadow-sm border border-stone-200 flex flex-col items-center text-center">
                      <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center shadow-inner border border-stone-100 mb-4 relative">
                          <svg className="w-10 h-10 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                          <span className="absolute top-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full animate-ping"></span>
                          <span className="absolute top-0 right-0 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full"></span>
                      </div>
                      <p className="text-lg font-semibold text-stone-800 mb-1">System Secure</p>
                      <p className="text-sm text-stone-500 mb-4">All systems operational.</p>
                  </div>
                  {isGuest && <p className="text-amber-600 text-xs font-bold text-center">GUEST MODE ACTIVE</p>}
              </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;