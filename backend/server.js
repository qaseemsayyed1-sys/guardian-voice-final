const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
];

let actionHistory = [];
let isGuestMode = false;
let isOwnerVerified = false;
let isAwaitingPassphrase = false;
let isFamilyMode = false; 
let isAddingFamily = false;
let currentSecurityCode = "8429";
let isMusicPlaying = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/', (req, res) => {
    res.status(200).send('Guardian Voice backend is running');
});

app.get('/api/history', (req, res) => {
    res.status(200).json(actionHistory);
});

app.post('/api/reset', (req, res) => {
    isOwnerVerified = false;
    isGuestMode = false;
    isFamilyMode = false;
    isAddingFamily = false;
    isAwaitingPassphrase = false;
    currentSecurityCode = "8429";
    isMusicPlaying = false;
    res.status(200).json({ success: true, message: "Chat reset successfully" });
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const msgLower = message.toLowerCase().trim();

    if (msgLower.includes("dark") || msgLower.includes("night") || msgLower.includes("nite")) { 
        isOwnerVerified = true;
        isGuestMode = false;
        isAwaitingPassphrase = false;
        isFamilyMode = false;
        isAddingFamily = false;
        return res.status(200).json({ 
            reply: "Passphrase verified. Welcome back, Owner. You now have full access.", 
            uiUpdate: { guestMode: false } 
        });
    }

    if (isAwaitingPassphrase) {
        isAwaitingPassphrase = false;
        return res.status(200).json({ reply: "Incorrect passphrase. Access denied.", uiUpdate: {} });
    }

    if (isAddingFamily) {
        isAddingFamily = false;
        isFamilyMode = true;
        isOwnerVerified = false; 
        const memberName = message.trim(); 
        actionHistory.push({ action: `Family Member Added: ${memberName}`, status: "SUCCESS", time: new Date().toLocaleTimeString() });
        return res.status(200).json({ 
            reply: `${memberName} has been added successfully. They now have restricted access.`, 
            uiUpdate: { guestMode: true } 
        });
    }

    if (msgLower.includes("owner") || msgLower.includes("admin") || msgLower.includes("my house")) {
        isAwaitingPassphrase = true;
        return res.status(200).json({ 
            reply: "Voice verification required. Please speak the secret passphrase to confirm your identity.", 
            uiUpdate: {} 
        });
    }

    if (msgLower.includes("add family") || msgLower.includes("add member")) {
        isAddingFamily = true;
        return res.status(200).json({ 
            reply: "Please tell me the name of the family member you want to add.", 
            uiUpdate: {} 
        });
    }

    if (isFamilyMode && msgLower.includes("unlock")) {
        actionHistory.push({ action: "Family Unlock Attempt", status: "DENIED", time: new Date().toLocaleTimeString() });
        return res.status(200).json({ 
            reply: "Access Denied. Only the primary owner can perform this action.", 
            uiUpdate: {} 
        });
    }

    if (msgLower.includes("unlock") && !isOwnerVerified && !isFamilyMode) {
        isGuestMode = true;
        actionHistory.push({ action: "Unauthorized Unlock Attempt", status: "LOCKDOWN", time: new Date().toLocaleTimeString() });
        return res.status(200).json({ 
            reply: "CRITICAL ALERT: Unauthorized access attempt detected. Initiating system lockdown protocol.", 
            uiUpdate: { triggerLockdown: true, guestMode: true } 
        });
    }

    if (msgLower.includes("unlock") && isOwnerVerified) {
        currentSecurityCode = Math.floor(1000 + Math.random() * 9000).toString();
        return res.status(200).json({ 
            reply: "I cannot execute that directly. I have generated a new 4-digit code on your screen. Please read it back to me to confirm.", 
            uiUpdate: { showCode: true, code: currentSecurityCode } 
        });
    }

    if (msgLower.includes(currentSecurityCode) && isOwnerVerified) {
        return res.status(200).json({ 
            reply: "Code verified. I am proposing the action to the owner for final approval.", 
            uiUpdate: { showPending: true } 
        });
    }

    if (msgLower === "veto") {
        actionHistory.push({ action: "Door Unlock", status: "VETOED", time: new Date().toLocaleTimeString() });
        return res.status(200).json({ reply: "Action vetoed by owner.", uiUpdate: { clearPending: true } });
    }
    
    if (msgLower === "accept") {
        actionHistory.push({ action: "Door Unlock", status: "APPROVED", time: new Date().toLocaleTimeString() });
        return res.status(200).json({ reply: "Action approved.", uiUpdate: { clearPending: true } });
    }
    
    if (msgLower === "9999") {
        actionHistory.push({ action: "Silent SOS", status: "TRIGGERED", time: new Date().toLocaleTimeString() });
        return res.status(200).json({ 
            reply: "Code verified. Executing unlock sequence. (Note: Silent SOS alert sent to authorities).", 
            uiUpdate: { showPending: true, silentSOS: true } 
        });
    }

    if (msgLower.includes("music") || msgLower.includes("play") || msgLower.includes("song")) {
        isMusicPlaying = true;
        return res.status(200).json({ 
            reply: `Playing some Jazz Vibes right now.`, 
            uiUpdate: { playMusic: true, trackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", playlistName: "Jazz Vibes" } 
        });
    }

    if (msgLower.includes("stop") || msgLower.includes("pause")) {
        if (isMusicPlaying) {
            isMusicPlaying = false;
            return res.status(200).json({ reply: "Music stopped.", uiUpdate: { stopMusic: true } });
        }
        return res.status(200).json({ reply: "Nothing is currently playing.", uiUpdate: {} });
    }

    if (msgLower.includes("help") || msgLower.includes("emergency") || msgLower.includes("sos")) {
        return res.status(200).json({ reply: "Emergency mode activated.", uiUpdate: { showEmergency: true } });
    }

    if (!GEMINI_API_KEY) {
        return res.status(200).json({ reply: "I am Guardian Voice. I can handle security, play music, check weather, or answer your general questions. (AI module offline).", uiUpdate: {} });
    }

    const requestBody = {
        systemInstruction: { 
            parts: [{ 
                text: "You are Guardian Voice, a smart and helpful AI assistant. You can answer general knowledge, give outfit suggestions based on weather, and help with daily tasks. If the user asks to make a payment, politely tell them you cannot process real bank payments but you can guide them. Keep answers concise." 
            }] 
        },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 }
    };

    let response = null;
    let lastError = null;

    for (const model of GEMINI_MODELS) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                if (attempt > 0) await sleep(1500);
                response = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                    requestBody,
                    { headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY }, timeout: 25000 }
                );

                const reply = response.data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
                if (!reply) {
                    lastError = new Error("The AI returned an empty response.");
                    continue;
                }
                return res.status(200).json({ reply, uiUpdate: {} });

            } catch (error) {
                lastError = error;
                const status = error.response?.status;
                if (status && [400, 401, 403, 404].includes(status)) break;
                if (attempt === 0) await sleep(1000);
            }
        }
    }

    console.error("All Gemini models failed:", lastError?.response?.data || lastError?.message);
    
    let fallbackReply = "I am Guardian Voice. ";
    if (msgLower.includes("wear") || msgLower.includes("shopping") || msgLower.includes("weather")) {
        fallbackReply += "Based on the current weather, I suggest wearing light and comfortable clothes. Have a great shopping trip!";
    } else if (msgLower.includes("joke")) {
        fallbackReply += "Why don't programmers like nature? It has too many bugs! 😄";
    } else if (msgLower.includes("payment") || msgLower.includes("pay")) {
        fallbackReply += "I cannot process direct bank payments, but I recommend using secure apps like Google Pay or PhonePe for your safety.";
    } else {
        fallbackReply += "I am currently running in offline mode. I can still help with security, music, and emergency features. Please try your AI question after a minute.";
    }
    
    return res.status(200).json({ reply: fallbackReply, uiUpdate: {} });
});

app.listen(PORT, () => {
    console.log(`Guardian Voice backend running on port ${PORT}`);
});