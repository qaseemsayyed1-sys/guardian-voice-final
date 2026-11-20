
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = 'https://guardian-voice-final.onrender.com/api/chat';
const RESET_URL = 'https://guardian-voice-final.onrender.com/api/reset';
const HISTORY_URL = 'https://guardian-voice-final.onrender.com/api/history';
const VISION_URL = 'https://guardian-voice-final.onrender.com/api/analyze-image';

function App() {
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hello! I am Guardian Voice. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState(null);
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
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [aiStatus, setAiStatus] = useState("Gemini Active");
  const [isEasyMode, setIsEasyMode] = useState(false);
  const [verificationRequired] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(null);

  const [historyData, setHistoryData] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [ownerPin, setOwnerPin] = useState("");
  const [verifiedOwnerPin, setVerifiedOwnerPin] = useState("");

  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, showCodeBox, showVetoPanel, showEmergency, isLockdown, isSpeaking, pendingImage]);

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
      .catch(() => console.log("Reset failed"));
  }, []);

  const speak = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const alexaVoice = voices.find(v =>
        v.name.includes('Google US English') ||
        v.name.includes('Samantha') ||
        v.name.includes('Zira')
      );

      if (alexaVoice) utterance.voice = alexaVoice;

      utterance.rate = 1.0;
      utterance.pitch = 1.1;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

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

  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const img = new Image();

        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_DIMENSION = 1280;

          const scale = Math.min(
            1,
            MAX_DIMENSION / Math.max(img.width, img.height)
          );

          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);

          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('Could not create image canvas.'));
            return;
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        };

        img.onerror = () => reject(new Error('Could not load the selected image.'));
        img.src = event.target.result;
      };

      reader.onerror = () => reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image.');
      e.target.value = '';
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      alert('Image is too large. Please select an image under 15 MB.');
      e.target.value = '';
      return;
    }

    try {
      const compressedBase64 = await compressImage(file);

      setPendingImage({
        base64: compressedBase64,
        preview: compressedBase64,
        name: file.name
      });
    } catch (error) {
      console.error('Image selection error:', error);
      alert('Could not load this image. Please try another one.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const removePendingImage = () => {
    setPendingImage(null);
  };

  const handleSend = async (e, voiceText = null) => {
    if (e) e.preventDefault();

    const userMessage = (voiceText ?? input).trim();
    const imageToSend = pendingImage;

    if ((!userMessage && !imageToSend) || isLoading) return;

    const userChatMessage = {
      sender: 'user',
      text: userMessage,
      image: imageToSend?.preview || null
    };

    setMessages(prev => [...prev, userChatMessage]);
    setInput('');
    setPendingImage(null);
    setIsLoading(true);
    setShowEmergency(false);
    setAiStatus("Processing...");

    try {
      if (imageToSend) {
        const response = await axios.post(VISION_URL, {
          imageBase64: imageToSend.base64,
          prompt: userMessage
        });

        const reply = response.data.reply || 'I could not analyze this image. Please try again.';

        setMessages(prev => [...prev, { sender: 'ai', text: reply }]);
        speak(reply);
        setAiStatus("Gemini Active");
      } else {
        const response = await axios.post(BACKEND_URL, {
          message: userMessage
        });

        const data = response.data;

        setMessages(prev => [...prev, { sender: 'ai', text: data.reply }]);
        speak(data.reply);

        if (
          data.reply.includes("temporarily busy") ||
          data.reply.includes("offline mode")
        ) {
          setAiStatus("Fallback Mode");
        } else {
          setAiStatus("Gemini Active");
        }

        if (data.uiUpdate?.silentSOS) {
          setMessages(prev => [...prev, {
            sender: 'ai',
            text: '[SILENT SOS SENT TO AUTHORITIES]'
          }]);
        }

        if (data.uiUpdate?.guestMode !== undefined) {
          setIsGuest(data.uiUpdate.guestMode);
        }

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
           setPendingApproval("Door Unlock Request");
        }

        if (data.uiUpdate?.clearPending) {
          setShowVetoPanel(false);
          setShowCodeBox(false);
        }

        if (data.uiUpdate?.playMusic) {
          if (audioRef.current) {
            audioRef.current.src = data.uiUpdate.trackUrl;
            audioRef.current.volume = 0.3;
            audioRef.current.play().catch(() => console.log("Audio blocked"));
            setCurrentPlaylist(data.uiUpdate.playlistName);
          }
        }

        if (data.uiUpdate?.stopMusic) {
          if (audioRef.current) {
            audioRef.current.pause();
            setCurrentPlaylist(null);
          }
        }

        if (data.uiUpdate?.showEmergency) {
          setShowEmergency(true);
        }
      }
    } catch (error) {
      console.error("Send error:", error);

      const errorMessage = imageToSend
        ? error.response?.data?.reply || 'Image analysis failed. Please try again.'
        : 'Connection error. Wake up backend.';

      setMessages(prev => [...prev, {
        sender: 'ai',
        text: errorMessage
      }]);

      setAiStatus("Offline");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVeto = async () => {
    setMessages(prev => [...prev, { sender: 'user', text: 'VETO' }]);
    speak("Action vetoed. The task remains blocked.");
    setIsLoading(true);

    try {
      const response = await axios.post(BACKEND_URL, { message: 'veto' });
      setMessages(prev => [...prev, { sender: 'ai', text: response.data.reply }]);
      setShowVetoPanel(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    setMessages(prev => [...prev, { sender: 'user', text: 'ACCEPT' }]);
    speak("Action approved. Executing task now.");
    setIsLoading(true);

    try {
      const response = await axios.post(BACKEND_URL, { message: 'accept' });
      setMessages(prev => [...prev, { sender: 'ai', text: response.data.reply }]);
      setShowVetoPanel(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };
const formatLogTime = (time) => {
  if (!time) return "Time unavailable";

  let date;

  if (time._seconds) {
    date = new Date(time._seconds * 1000);
  } else if (time.seconds) {
    date = new Date(time.seconds * 1000);
  } else {
    date = new Date(time);
  }

  if (Number.isNaN(date.getTime())) {
    return "Time unavailable";
  }

  return date.toLocaleString();
};

  

const totalEvents = historyData.length;

const approvedEvents = historyData.filter(log =>
  String(log.status || "").toUpperCase().includes("APPROVED")
).length;

const vetoedEvents = historyData.filter(log => {
  const status = String(log.status || "").toUpperCase();
  return status.includes("VETO") || status.includes("DENIED");
}).length;



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
      setMessages(prev => [...prev, {
        sender: 'user',
        text: `The code is ${res1.data.uiUpdate.code}`
      }]);
      await new Promise(r => setTimeout(r, 1000));

      const res2 = await axios.post(BACKEND_URL, {
        message: res1.data.uiUpdate.code
      });

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
  const fetchHistoryWithPin = async () => {
  try {
    const res = await axios.get(`${HISTORY_URL}?pin=${ownerPin}`);

    const records = Array.isArray(res.data)
      ? res.data
      : res.data.history || [];

    setHistoryData(records);
    setVerifiedOwnerPin(ownerPin);
    setShowPinModal(false);
    setShowHistory(true);
    setOwnerPin("");
  } catch (error) {
    alert("Invalid Owner PIN");
  }
};

const refreshHistory = async () => {
  try {
    const res = await axios.get(
      `${HISTORY_URL}?pin=${verifiedOwnerPin}`
    );

    const records = Array.isArray(res.data)
      ? res.data
      : res.data.history || [];

    setHistoryData(records);
  } catch (error) {
    alert("History refresh failed. Please verify your PIN again.");
    setVerifiedOwnerPin("");
    setShowPinModal(true);
  }
};

  return (
    <div className={`min-h-screen flex justify-center items-center p-4 md:p-8 font-sans transition-colors duration-500 ${showEmergency ? 'bg-red-900' : 'bg-[#F4F1EA] text-stone-800'}`}>

      <audio ref={audioRef} />

      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={handleImageUpload}
      />

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        className="hidden"
        onChange={handleImageUpload}
      />

      {isLockdown && (
        <div className="fixed inset-0 z-50 bg-red-950/95 backdrop-blur-md flex flex-col items-center justify-center animate-pulse overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/60 via-transparent to-transparent"></div>
          <svg className="w-32 h-32 text-red-500 mb-6 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
          </svg>
          <h1 className="text-red-500 font-mono font-bold text-5xl tracking-widest mb-4 relative z-10">LOCKDOWN</h1>
          <p className="text-red-200 font-mono text-lg relative z-10">SECURITY BREACH DETECTED</p>
          <p className="text-red-400 font-mono text-sm mt-4 animate-ping relative z-10">Isolating system...</p>
        </div>
      )}

      {showPinModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center p-4">
          <div className="bg-[#FDFCF8] p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-bold text-stone-900 mb-2">Owner Access Only</h2>
            <p className="text-sm text-stone-500 mb-4">Enter your 4-digit PIN to view logs.</p>
            <input
              type="password"
              value={ownerPin}
              onChange={(e) => setOwnerPin(e.target.value)}
              maxLength={4}
              className="w-full bg-[#F4F1EA] border border-stone-300 rounded-xl px-4 py-3 text-center text-2xl tracking-widest font-mono mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowPinModal(false)} className="px-4 py-2 rounded-lg font-bold text-stone-600 hover:bg-stone-100 w-full">Cancel</button>
              <button onClick={fetchHistoryWithPin} className="px-4 py-2 rounded-lg font-bold text-white bg-stone-900 hover:bg-stone-800 w-full">Verify</button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 flex justify-center items-center p-4">
          <div className="bg-[#FDFCF8] p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-stone-900">Activity Logs</h2>
              <button onClick={() => setShowHistory(false)} className="text-red-500 font-bold text-xl">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto space-y-2">
              {historyData.length === 0 ? (
                <p className="text-stone-500 text-sm">No actions recorded yet.</p>
              ) : (
                historyData.map((item, index) => (
                  <div key={index} className="bg-white p-3 rounded-lg border border-stone-200 flex justify-between items-center text-sm shadow-sm">
                    <div>
                      <p className="font-bold text-stone-800">{item.action}</p>
                      <p className="text-xs text-stone-400">
  {item.role} • {formatLogTime(item.time)}
</p>
                    </div>
                    <span className={`font-bold text-xs px-2 py-1 rounded ${item.status.includes('VETO') || item.status.includes('LOCKDOWN') || item.status.includes('DENIED') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {item.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`w-full max-w-6xl rounded-3xl shadow-2xl border flex flex-col md:flex-row overflow-hidden h-[90vh] ${showEmergency ? 'bg-red-950 border-red-700' : 'bg-[#FDFCF8] border-stone-200'}`}>

        <div className={`w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r ${showEmergency ? 'border-red-800' : 'border-stone-200'}`}>

          <div className={`p-6 border-b flex justify-between items-center z-10 ${showEmergency ? 'bg-red-900 border-red-800 text-white' : 'bg-[#FDFCF8] border-stone-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${showEmergency ? 'bg-white text-red-900' : 'bg-stone-900 text-[#F4F1EA]'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 00-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                </svg>
              </div>
              <div>
                <h1 className={`text-xl font-bold tracking-tight ${showEmergency ? 'text-white' : 'text-stone-900'}`}>Guardian Voice</h1>
                <p className={`${isEasyMode ? 'text-base' : 'text-xs'} font-medium tracking-wide uppercase ${showEmergency ? 'text-red-200' : 'text-stone-500'}`}>
                  {isEasyMode ? 'Your Home Assistant' : 'Smart Home Security'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 items-center flex-wrap justify-end">
              {!isEasyMode && (
                <div className="flex gap-2 text-[10px] font-bold tracking-widest uppercase mr-2">
                  <span className={`px-2 py-1 rounded border ${aiStatus === 'Fallback Mode' ? 'bg-amber-50 text-amber-600 border-amber-200' : aiStatus === 'Offline' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                    AI: {aiStatus}
                  </span>
                  <span className="text-stone-600 bg-stone-100 px-2 py-1 rounded border border-stone-200 hidden sm:block">Threat: LOW</span>
                </div>
              )}

              {isGuest && (
                <span className="bg-amber-100 text-amber-800 text-xs px-3 py-1.5 rounded-lg font-bold uppercase tracking-wide border border-amber-300">
                  Guest Mode
                </span>
              )}

              <button
                onClick={() => setIsEasyMode(prev => !prev)}
                className={`px-3 py-2 rounded-lg font-bold ${isEasyMode ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'}`}
              >
                {isEasyMode ? "Standard Mode" : "Easy Mode"}
              </button>

              <button onClick={() => setShowPinModal(true)} className={`text-xs px-3 py-2 rounded-lg font-bold transition-all uppercase tracking-wide ${showEmergency ? 'bg-red-800 text-white' : 'bg-stone-200 text-stone-800 hover:bg-stone-300'}`}>
                📜 Logs
              </button>

              {!isEasyMode && (
                <button onClick={runAutoDemo} disabled={isAutoPlaying} className={`text-xs px-4 py-2 rounded-lg font-bold transition-all uppercase tracking-wide ${isAutoPlaying ? 'bg-stone-200 text-stone-400' : showEmergency ? 'bg-white text-red-900 hover:bg-red-100' : 'bg-stone-900 text-[#F4F1EA] hover:bg-stone-800'}`}>
                  {isAutoPlaying ? 'Running...' : 'Auto-Demo'}
                </button>
              )}
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

          <div className={`relative flex-1 overflow-y-auto p-6 space-y-6 ${showEmergency ? 'bg-red-950/50' : 'bg-[#F4F1EA]/50'}`}>
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] flex items-center justify-center">
              <svg className="w-96 h-96 text-stone-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
              </svg>
            </div>

            <div className="relative z-10">
              {messages.map((msg, index) => (
                <div key={index} className={`flex mb-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl ${isEasyMode ? 'text-lg' : 'text-sm'} leading-relaxed ${msg.sender === 'user' ? (showEmergency ? 'bg-red-700 text-white rounded-br-none' : 'bg-stone-900 text-[#F4F1EA] rounded-br-none shadow-md') : (showEmergency ? 'bg-red-900 text-red-100 border border-red-700 rounded-bl-none' : 'bg-white border border-stone-200 text-stone-700 rounded-bl-none shadow-sm')}`}>
                    {msg.image && (
                      <img src={msg.image} alt="Uploaded" className="max-w-full max-h-64 rounded-xl mb-2 object-contain" />
                    )}
                    {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                  </div>
                </div>
              ))}

              {isSpeaking && (
                <div className="flex justify-start ml-2 mb-2">
                  <div className="bg-stone-900 px-4 py-3 rounded-2xl flex gap-1 items-end h-10 shadow-md">
                    <div className="w-1 bg-emerald-400 animate-[bounce_1s_infinite] h-4"></div>
                    <div className="w-1 bg-emerald-400 animate-[bounce_1.2s_infinite] h-6"></div>
                    <div className="w-1 bg-emerald-400 animate-[bounce_0.8s_infinite] h-3"></div>
                    <div className="w-1 bg-emerald-400 animate-[bounce_1.1s_infinite] h-5"></div>
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center gap-3 ml-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-full w-max animate-pulse border border-emerald-200">
                  <div className="w-4 h-4 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin"></div>
                  <span className="text-xs font-bold tracking-widest uppercase">Guardian is thinking...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className={`px-6 pt-4 flex gap-2 overflow-x-auto pb-2 ${isEasyMode ? 'flex-wrap' : ''} ${showEmergency ? 'bg-red-900' : 'bg-[#FDFCF8]'}`}>
            <button onClick={() => handleSend(null, "unlock the door")} className={`${isEasyMode ? 'text-base px-4 py-3' : 'text-xs px-3 py-2'} bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg font-bold whitespace-nowrap transition`}>
              🔒 Unlock Door
            </button>
            <button onClick={() => handleSend(null, "play music")} className={`${isEasyMode ? 'text-base px-4 py-3' : 'text-xs px-3 py-2'} bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg font-bold whitespace-nowrap transition`}>
              🎵 Play Music
            </button>
            <button onClick={() => handleSend(null, "add family member")} className={`${isEasyMode ? 'text-base px-4 py-3' : 'text-xs px-3 py-2'} bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg font-bold whitespace-nowrap transition`}>
              👨‍👩‍👧 Add Family
            </button>
            <button onClick={() => setShowPinModal(true)} className={`${isEasyMode ? 'text-base px-4 py-3' : 'text-xs px-3 py-2'} bg-stone-200 hover:bg-stone-300 text-stone-800 rounded-lg font-bold whitespace-nowrap transition`}>
              📜 View Logs
            </button>
          </div>

          <div className={`p-6 border-t ${showEmergency ? 'bg-red-900 border-red-800' : 'bg-[#FDFCF8] border-stone-200'}`}>

            {pendingImage && (
              <div className="mb-4 flex items-start gap-3 p-3 rounded-xl border border-stone-300 bg-[#F4F1EA]">
                <img
                  src={pendingImage.preview}
                  alt="Selected file"
                  className="w-20 h-20 object-cover rounded-lg border border-stone-300"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-stone-800">Image ready to send</p>
                  <p className="text-xs text-stone-500 truncate">{pendingImage.name}</p>
                  <p className="text-xs text-stone-500 mt-1">Add a question or send the image directly.</p>
                </div>
                <button
                  type="button"
                  onClick={removePendingImage}
                  aria-label="Remove image"
                  className="w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            <form onSubmit={handleSend} className={`flex gap-3 ${isEasyMode ? 'flex-wrap' : ''}`}>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                aria-label="Take a photo"
                title="Take a photo"
                disabled={isLoading}
                className={`${isEasyMode ? 'p-5 text-xl' : 'p-4'} rounded-xl transition-all ${showEmergency ? 'bg-red-800 text-red-200 hover:bg-red-700' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}`}
              >
                📸
                {isEasyMode && <span className="block text-sm">Camera</span>}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Choose from gallery"
                title="Choose from gallery"
                disabled={isLoading}
                className={`${isEasyMode ? 'p-5 text-xl' : 'p-4'} rounded-xl transition-all ${showEmergency ? 'bg-red-800 text-red-200 hover:bg-red-700' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}`}
              >
                🖼️
                {isEasyMode && <span className="block text-sm">Photos</span>}
              </button>

              <button
                type="button"
                onClick={startListening}
                disabled={isLoading}
                className={`${isEasyMode ? 'p-5 text-xl' : 'p-4'} rounded-xl transition-all ${isListening ? 'bg-red-700 text-white animate-pulse' : showEmergency ? 'bg-red-800 text-red-200 hover:bg-red-700' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}`}
              >
                <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 00-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path>
                </svg>
                {isEasyMode && <span className="block text-sm">Speak</span>}
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={pendingImage ? "Ask something about this image..." : isEasyMode ? "Type your message here..." : "Say: 'Add family member', 'Play lofi', or 'Help'"}
                className={`flex-1 min-w-0 border rounded-xl px-5 py-4 focus:outline-none focus:ring-2 transition-all ${isEasyMode ? 'text-lg' : 'text-sm'} ${showEmergency ? 'bg-red-800 border-red-700 text-white placeholder-red-300 focus:ring-white/20 focus:border-white' : 'bg-[#F4F1EA] border-stone-300 text-stone-900 placeholder-stone-400 focus:ring-stone-900/10 focus:border-stone-900'}`}
              />

              <button
                type="submit"
                disabled={isLoading || (!input.trim() && !pendingImage)}
                aria-label="Send message"
                className={`px-6 py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${showEmergency ? 'bg-white text-red-900 hover:bg-red-100' : 'bg-stone-900 hover:bg-stone-800 text-[#F4F1EA]'}`}
              >
                {isEasyMode ? 'Send' : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path>
                  </svg>
                )}
              </button>
            </form>
          </div>
        </div>

        <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto">

{!isEasyMode && (
  <div className="grid grid-cols-3 gap-3">
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-blue-700 font-bold">TOTAL EVENTS</p>
      <p className="text-3xl font-bold text-blue-900 mt-2">
        {totalEvents}
      </p>
    </div>

    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-green-700 font-bold">APPROVED</p>
      <p className="text-3xl font-bold text-green-900 mt-2">
        {approvedEvents}
      </p>
    </div>

    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-sm">
      <p className="text-xs text-red-700 font-bold">VETOED</p>
      <p className="text-3xl font-bold text-red-900 mt-2">
        {vetoedEvents}
      </p>
    </div>
  </div>
)}


          {!isEasyMode && (
            <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-6 shadow-sm">
              
<div className="flex items-center justify-between mb-4">
  <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
    System Security Logs
  </h2>

  <div className="flex items-center gap-3">
    <button
      onClick={refreshHistory}
      className="text-xs font-bold text-blue-700 hover:text-blue-900"
    >
      ↻ Refresh
    </button>

    <span className="text-xs text-stone-400">Live</span>
  </div>
</div>

              <div className="space-y-3 max-h-64 overflow-y-auto">
               {historyData.length === 0 ? (
  <p className="text-xs text-stone-500">
    Verify Owner PIN using the Logs button to load security history.
  </p>
) : (
  historyData.slice(0, 10).map((log, index) => (
    <div
      key={log.id || index}
      className="flex flex-col gap-1 text-xs border-b border-stone-100 pb-3 last:border-0"
    >
      <div className="flex justify-between gap-2">
        <span className="text-stone-400">
          {formatLogTime(log.time)}
        </span>

        <span className={`font-bold ${
          String(log.status || "").toUpperCase().includes("VETO") ||
          String(log.status || "").toUpperCase().includes("DENIED") ||
          String(log.status || "").toUpperCase().includes("LOCKDOWN")
            ? "text-red-600"
            : "text-green-700"
        }`}>
          {log.status || "Recorded"}
        </span>
      </div>

      <p className="text-stone-800 font-semibold">
        {log.action || "Security Event"}
      </p>

      <p className="text-stone-500">
        Role: {log.role || "Unknown"}
      </p>
    </div>
  ))
)}
              </div>
            </div>
          )}

          <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-6 shadow-sm">
            <h2 className={`${isEasyMode ? 'text-xl' : 'text-sm'} font-bold text-stone-900 uppercase tracking-wider mb-4`}>
              Emergency Status
            </h2>
            <div className={`flex items-center gap-3 p-4 rounded-xl ${showEmergency ? 'bg-red-100 text-red-800' : 'bg-green-50 text-green-800'}`}>
              <span className="text-2xl">{showEmergency ? '🚨' : '🛡️'}</span>
              <div>
                <p className="font-bold">{showEmergency ? 'Emergency Active' : 'All Systems Safe'}</p>
                <p className="text-xs opacity-75">{showEmergency ? 'Please check the chat for details.' : 'No emergency detected.'}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-6 shadow-sm">
            <h2 className={`${isEasyMode ? 'text-xl' : 'text-sm'} font-bold text-stone-900 uppercase tracking-wider mb-4`}>
              Verification Status
            </h2>
            <div className="flex items-center justify-between gap-3">
              <span className="text-stone-600">Verification Required</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${verificationRequired ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                {verificationRequired ? 'Required' : 'Not Required'}
              </span>
            </div>
            {generatedCode && (
              <p className="mt-3 text-lg font-bold text-green-700">
                Verification Code: {generatedCode}
              </p>
            )}
          </div>
          
          <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-6 shadow-sm">
            <h2 className={`${isEasyMode ? 'text-xl' : 'text-sm'} font-bold text-stone-900 uppercase tracking-wider mb-4`}>
              Pending Approval
            </h2>
            {showVetoPanel && pendingApproval ? (
  <div className="space-y-3">
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
      <p className="font-bold text-amber-800">
        🔐 Owner Approval Required
      </p>
      <p className="text-sm text-stone-700 mt-1">
        {pendingApproval}
      </p>
      <p className="text-xs text-stone-500 mt-1">
        Verify this request before approving.
      </p>
    </div>

    <div className="flex gap-2">
      <button
        onClick={handleAccept}
        disabled={isLoading}
        className="flex-1 py-3 rounded-lg bg-green-700 hover:bg-green-800 text-white font-bold text-sm disabled:opacity-50"
      >
        ✓ Accept
      </button>

      <button
        onClick={handleVeto}
        disabled={isLoading}
        className="flex-1 py-3 rounded-lg bg-red-700 hover:bg-red-800 text-white font-bold text-sm disabled:opacity-50"
      >
        ✕ Veto
      </button>
    </div>
  </div>
) : (
  <p className="text-sm text-stone-500">
    No pending approvals.
  </p>
)}
          </div>

          <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-6 shadow-sm">
            <h2 className={`${isEasyMode ? 'text-xl' : 'text-sm'} font-bold text-stone-900 uppercase tracking-wider mb-4`}>
              Secure Status
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-stone-600">System</span>
                <span className="text-green-700 font-bold text-sm">● Online</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Connection</span>
                <span className="text-green-700 font-bold text-sm">● Connected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Security</span>
                <span className="text-green-700 font-bold text-sm">● Active</span>
              </div>
            </div>
          </div>

          <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-6 shadow-sm">
            <h2 className={`${isEasyMode ? 'text-xl' : 'text-sm'} font-bold text-stone-900 uppercase tracking-wider mb-4`}>
              Active Roles
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Owner</span>
                <span className="text-xs font-bold text-stone-700">Protected</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Guest</span>
                <span className="text-xs font-bold text-stone-700">Limited Access</span>
              </div>
            </div>
          </div>

          <div className="bg-[#FDFCF8] border border-stone-200 rounded-2xl p-6 shadow-sm">
            <h2 className={`${isEasyMode ? 'text-xl' : 'text-sm'} font-bold text-stone-900 uppercase tracking-wider mb-4`}>
              System Uptime
            </h2>
            <p className="text-2xl font-bold text-stone-900">Active</p>
            <p className="text-xs text-stone-500 mt-1">Guardian Voice is running.</p>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
