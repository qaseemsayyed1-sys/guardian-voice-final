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
      setMessages(prev => [...prev, { sender: 'user', text: '📷 [Image Uploaded for Analysis]' }]);
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

  const fetchHistory = async () => {
    const res = await axios.get(HISTORY_URL);
    setHistoryData(res.data);
    setShowHistory(true);
  };

  return (
    <div className={`min-h-screen flex justify-center items-start md:items-center p-2 md:p-8 font-sans transition-colors duration-500 ${showEmergency ? 'bg-red-900' : 'bg-[#0F172A] text-slate-200'}`}>
      <audio ref={audioRef} />
      <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />

      {isLockdown && (
        <div className="fixed inset-0 z-50 bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center animate-pulse">
            <h1 className="text-red-500 font-mono font-bold text-6xl tracking-widest mb-4">LOCKDOWN</h1>
            <p className="text-red-200 text-lg">SECURITY BREACH DETECTED</p>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center p-4">
          <div className="bg-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl border border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Persistent Audit Logs</h2>
              <button onClick={() => setShowHistory(false)} className="text-red-500 font-bold text-xl">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {historyData.map((item, i) => (
                <div key={i} className="bg-slate-700 p-3 rounded-lg flex justify-between items-center text-sm border border-slate-600">
                  <div>
                    <p className="font-bold text-white">{item.action}</p>
                    <p className="text-xs text-slate-400">{item.time}</p>
                  </div>
                  <span className={`font-bold text-xs px-2 py-1 rounded ${item.status.includes('DENIED') || item.status.includes('LOCKDOWN') || item.status.includes('VETO') ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>{item.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-6xl rounded-3xl shadow-2xl border border-slate-700 flex flex-col md:flex-row overflow-hidden min-h-[85vh] md:h-[90vh] bg-[#1E293B]">
        
        <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-700">
          
          <div className="p-4 md:p-6 border-b border-slate-700 flex flex-col md:flex-row gap-3 justify-between items-start md:items-center bg-[#0F172A]">
              <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-600 text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                  </div>
                  <div>
                      <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">Guardian Voice</h1>
                      <p className="text-[10px] md:text-xs font-medium text-slate-400 uppercase">Enterprise Smart Home Security</p>
                  </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold border ${threatLevel === 'HIGH' ? 'bg-red-500 text-white border-red-600' : 'bg-emerald-900 text-emerald-400 border-emerald-700'}`}>Threat: {threatLevel}</span>
                  <button onClick={fetchHistory} className="text-[10px] bg-slate-700 text-white px-2 py-1.5 rounded-lg font-bold hover:bg-slate-600 border border-slate-600">📜 Logs</button>
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-[#0F172A]/50">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 md:p-4 rounded-2xl text-xs md:text-sm leading-relaxed ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-700 text-slate-200 rounded-bl-none'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-slate-400 text-xs animate-pulse">Processing...</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-[#0F172A] border-t border-slate-700">
              <form onSubmit={handleSend} className="flex gap-2">
                <button type="button" onClick={() => fileInputRef.current.click()} className="p-3 rounded-xl bg-slate-700 text-white hover:bg-slate-600">📷</button>
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Command..." className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                <button type="submit" className="px-6 py-2 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-500">Send</button>
              </form>
          </div>
        </div>

        <div className="w-full md:w-1/2 p-6 flex flex-col bg-[#1E293B]">
          <div className="bg-[#0F172A] rounded-2xl p-4 h-40 overflow-y-auto font-mono text-xs text-green-400 border border-slate-700 mb-6">
              <p className="text-slate-500 mb-2">System Security Logs</p>
              {messages.map((msg, i) => {
                  if (msg.text.includes("Owner")) return <p key={i} className="mb-1">[SECURITY] Owner Auth</p>;
                  if (msg.text.includes("Unauthorized")) return <p key={i} className="text-red-400 mb-1">[ALERT] Unauthorized Access</p>;
                  return null;
              })}
          </div>
          
          <div className="flex-1 flex flex-col items-center justify-center">
              {showCodeBox && (
              <div className="bg-slate-800 border border-slate-600 p-8 rounded-3xl w-full max-w-md text-center">
                  <h2 className="text-white font-bold text-2xl mb-4">Verification Code</h2>
                  <div className="bg-[#0F172A] py-6 rounded-2xl tracking-[0.5em] text-5xl font-mono text-emerald-400 font-bold border border-slate-700">{generatedCode}</div>
              </div>
              )}

              {showVetoPanel && (
              <div className="bg-slate-800 border border-amber-500 p-8 rounded-3xl w-full max-w-md text-center">
                  <h2 className="text-white font-bold text-2xl mb-2">Pending Approval</h2>
                  <div className="flex gap-4 mt-6">
                    <button onClick={() => handleSend(null, 'accept')} className="bg-slate-700 text-white py-3 rounded-xl font-bold w-full">ACCEPT</button>
                    <button onClick={() => handleSend(null, 'veto')} className="bg-red-600 text-white py-3 rounded-xl font-bold w-full">VETO</button>
                  </div>
              </div>
              )}

              {!showCodeBox && !showVetoPanel && (
              <div className="text-center text-slate-500">
                  <p className="text-xl font-bold text-slate-300 mb-1">System Secure</p>
                  <p className="text-sm">Monitoring active.</p>
                  {isGuest && <p className="text-amber-400 mt-4 text-xs font-bold">GUEST MODE ACTIVE</p>}
              </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;