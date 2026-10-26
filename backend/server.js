const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Google ka latest working model
const GEMINI_MODELS = [
    "gemini-2.5-flash"
];

let isGuestMode = false;
let isOwnerVerified = false;
let isAwaitingPassphrase = false;
let currentSecurityCode = "8429";
let isMusicPlaying = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/', (req, res) => {
    res.status(200).send('Guardian Voice backend is running');
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'Guardian Voice',
        aiConfigured: Boolean(GEMINI_API_KEY)
    });
});

app.post('/api/reset', (req, res) => {
    isOwnerVerified = false;
    isGuestMode = false;
    isAwaitingPassphrase = false;
    currentSecurityCode = "8429";
    isMusicPlaying = false;
    res.status(200).json({
        success: true,
        message: "Chat reset successfully"
    });
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const msgLower = message.toLowerCase().trim();

    // 1. Passphrase Check
    if (msgLower.includes("dark") || msgLower.includes("night") || msgLower.includes("nite")) { 
        isOwnerVerified = true;
        isGuestMode = false;
        isAwaitingPassphrase = false;
        return res.status(200).json({ 
            reply: "Passphrase verified. Welcome back, Owner. You now have full access.", 
            uiUpdate: { guestMode: false } 
        });
    }

    // 2. Incorrect Passphrase
    if (isAwaitingPassphrase) {
        isAwaitingPassphrase = false;
        return res.status(200).json({ 
            reply: "Incorrect passphrase. Access denied.", 
            uiUpdate: {} 
        });
    }

    // 3. Owner Login Trigger
    if (msgLower.includes("owner") || msgLower.includes("admin") || msgLower.includes("my house")) {
        isAwaitingPassphrase = true;
        return res.status(200).json({ 
            reply: "Voice verification required. Please speak the secret passphrase to confirm your identity.", 
            uiUpdate: {} 
        });
    }

    // 4. Unauthorized Unlock (Lockdown)
    if (msgLower.includes("unlock") && !isOwnerVerified) {
        isGuestMode = true;
        return res.status(200).json({ 
            reply: "CRITICAL ALERT: Unauthorized access attempt detected. Initiating system lockdown protocol.", 
            uiUpdate: { triggerLockdown: true, guestMode: true } 
        });
    }

    // 5. Authorized Unlock (Generate Code)
    if (msgLower.includes("unlock") && isOwnerVerified) {
        currentSecurityCode = Math.floor(1000 + Math.random() * 9000).toString();
        return res.status(200).json({ 
            reply: "I cannot execute that directly. I have generated a new 4-digit code on your screen. Please read it back to me to confirm.", 
            uiUpdate: { showCode: true, code: currentSecurityCode } 
        });
    }

    // 6. Code Verification
    if (msgLower.includes(currentSecurityCode) && isOwnerVerified) {
        return res.status(200).json({ 
            reply: "Code verified. I am proposing the action to the owner for final approval.", 
            uiUpdate: { showPending: true } 
        });
    }

    // 7. Veto / Accept
    if (msgLower === "veto") return res.status(200).json({ reply: "Action vetoed by owner.", uiUpdate: { clearPending: true } });
    if (msgLower === "accept") return res.status(200).json({ reply: "Action approved.", uiUpdate: { clearPending: true } });
    
    // 8. Silent SOS
    if (msgLower === "9999") {
        return res.status(200).json({ 
            reply: "Code verified. Executing unlock sequence. (Note: Silent SOS alert sent to authorities).", 
            uiUpdate: { showPending: true, silentSOS: true } 
        });
    }

    // 9. Low-Risk: Music
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

    // 10. Low-Risk: Weather
    if (msgLower.includes("weather")) {
        return res.status(200).json({ reply: "It is currently 24 degrees and sunny outside.", uiUpdate: {} });
    }

    // 11. Emergency / Help
    if (msgLower.includes("help") || msgLower.includes("emergency") || msgLower.includes("sos")) {
        return res.status(200).json({ reply: "Emergency mode activated.", uiUpdate: { showEmergency: true } });
    }

    // --- 12. GEMINI AI FALLBACK ---
    
    if (!GEMINI_API_KEY) {
        return res.status(200).json({
            reply: "I am Guardian Voice. I can handle security, play music, check weather, or answer your general questions. (AI module offline - API Key missing).",
            uiUpdate: {}
        });
    }

    const requestBody = {
        systemInstruction: {
            parts: [{ text: "You are Guardian Voice, a helpful and calm AI assistant. Keep answers short and helpful." }]
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
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "x-goog-api-key": GEMINI_API_KEY
                        },
                        timeout: 25000
                    }
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
    
    return res.status(200).json({ 
        reply: "I am Guardian Voice. I can handle security, play music, check weather, or answer your general questions. (AI is temporarily busy).", 
        uiUpdate: {} 
    });
});

app.listen(PORT, () => {
    console.log(`Guardian Voice backend running on port ${PORT}`);
});
