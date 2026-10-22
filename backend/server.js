const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = "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"; 

let currentSecurityCode = "8429"; 
let isGuestMode = false;
let isOwnerVerified = false; 
let isMusicPlaying = false;
let isAwaitingPassphrase = false;

app.post('/api/reset', (req, res) => {
    if (isOwnerVerified) return res.json({ status: "already_verified" });
    isGuestMode = true; 
    isAwaitingPassphrase = false;
    return res.json({ status: "reset" });
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const msgLower = message.toLowerCase().trim();

    if (msgLower.includes("dark") || msgLower.includes("night") || msgLower.includes("nite")) { 
        isOwnerVerified = true;
        isGuestMode = false;
        isAwaitingPassphrase = false;
        return res.json({ reply: "Passphrase verified. Welcome back, Owner. You now have full access.", uiUpdate: { guestMode: false } });
    }

    if (isAwaitingPassphrase) {
        isAwaitingPassphrase = false;
        return res.json({ reply: "Incorrect passphrase. Access denied.", uiUpdate: {} });
    }

    if (msgLower.includes("owner") || msgLower.includes("admin") || msgLower.includes("my house")) {
        isAwaitingPassphrase = true;
        return res.json({ reply: "Voice verification required. Please speak the secret passphrase to confirm your identity.", uiUpdate: {} });
    }

    if (msgLower.includes("unlock") && !isOwnerVerified) {
        isGuestMode = true;
        return res.json({ reply: "CRITICAL ALERT: Unauthorized access attempt detected. Initiating system lockdown protocol.", uiUpdate: { triggerLockdown: true, guestMode: true } });
    }

    if (msgLower.includes("unlock") && isOwnerVerified) {
        currentSecurityCode = Math.floor(1000 + Math.random() * 9000).toString();
        return res.json({ reply: "I cannot execute that directly. I have generated a new 4-digit code on your screen. Please read it back to me to confirm.", uiUpdate: { showCode: true, code: currentSecurityCode } });
    }

    if (msgLower.includes(currentSecurityCode) && isOwnerVerified) {
        return res.json({ reply: "Code verified. I am proposing the action to the owner for final approval.", uiUpdate: { showPending: true } });
    }

    if (msgLower === "veto") return res.json({ reply: "Action vetoed by owner.", uiUpdate: { clearPending: true } });
    if (msgLower === "accept") return res.json({ reply: "Action approved.", uiUpdate: { clearPending: true } });
    if (msgLower === "9999") return res.json({ reply: "Code verified. Executing unlock sequence. (Note: Silent SOS alert sent to authorities).", uiUpdate: { showPending: true, silentSOS: true } });

    if (msgLower.includes("stop") || msgLower.includes("pause")) {
        if (isMusicPlaying) {
            isMusicPlaying = false;
            return res.json({ reply: "Music stopped.", uiUpdate: { stopMusic: true } });
        }
    }

    if (msgLower.includes("volume up") || msgLower.includes("louder")) return res.json({ reply: "Increasing volume.", uiUpdate: { volumeUp: true } });
    if (msgLower.includes("volume down") || msgLower.includes("quieter")) return res.json({ reply: "Decreasing volume.", uiUpdate: { volumeDown: true } });

    if (msgLower.includes("music") || msgLower.includes("play") || msgLower.includes("song")) {
        isMusicPlaying = true;
        let genre = "Jazz Vibes";
        let trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; 
        if (msgLower.includes("rock")) { genre = "Rock Anthems"; trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"; } 
        else if (msgLower.includes("lofi") || msgLower.includes("chill") || msgLower.includes("study")) { genre = "Chill Lofi Beats"; trackUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"; }
        return res.json({ reply: `Playing some ${genre} right now.`, uiUpdate: { playMusic: true, trackUrl: trackUrl, playlistName: genre } });
    }
    
    if (msgLower.includes("weather")) return res.json({ reply: "It is currently 24 degrees and sunny outside.", uiUpdate: {} });
    if (msgLower.includes("help") || msgLower.includes("emergency") || msgLower.includes("sos")) return res.json({ reply: "Emergency mode activated.", uiUpdate: { showEmergency: true } });

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama3-8b-8192",
            messages: [
                { role: "system", content: "You are Guardian Voice, a highly intelligent smart home AI assistant. Keep your answers short, smart, and helpful. You can answer general knowledge questions, tell jokes, or give advice." },
                { role: "user", content: message }
            ],
            temperature: 0.7
        }, {
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
        });

        return res.json({ reply: response.data.choices[0].message.content, uiUpdate: {} });

    } catch (error) {
        return res.json({ reply: "I am Guardian Voice. I can handle security, play music, check weather, or answer your general questions. (AI module offline).", uiUpdate: {} });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Guardian Backend running on port ${PORT}`));