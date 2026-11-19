const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATA_FILE = path.join(__dirname, 'history.json');
const GEMINI_MODELS = ["gemini-3.5-flash"];

let guestLinkToken = null;
let isGuestMode = false;
let isOwnerVerified = false;
let isAwaitingPassphrase = false;
let isFamilyMode = false; 
let isAddingFamily = false;
let currentSecurityCode = "8429";
let isMusicPlaying = false;

let actionHistory = [];
if (fs.existsSync(DATA_FILE)) {
    try { actionHistory = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { actionHistory = []; }
}

const saveHistory = () => { 
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(actionHistory, null, 2)); } catch(e) {} 
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/', (req, res) => res.status(200).send('Guardian Voice Backend running'));

app.get('/api/mcp/tools', (req, res) => {
    res.status(200).json({
        protocol: "MCP", version: "2025-11-25",
        tools: [
            { name: "unlock_door", description: "Unlocks the smart door", risk: "HIGH" },
            { name: "play_music", description: "Plays music on speaker", risk: "LOW" },
            { name: "analyze_image", description: "Processes images for accessibility", risk: "MEDIUM" }
        ]
    });
});

app.get('/api/history', (req, res) => res.status(200).json(actionHistory));

app.post('/api/reset', (req, res) => {
    isOwnerVerified = false; isGuestMode = false; isFamilyMode = false; isAddingFamily = false; isAwaitingPassphrase = false; currentSecurityCode = "8429"; isMusicPlaying = false;
    res.status(200).json({ success: true });
});

app.post('/api/analyze-image', async (req, res) => {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: "No image provided" });

    try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[0]}:generateContent?key=${GEMINI_API_KEY}`,
            { contents: [{ parts: [{ text: "You are Guardian Voice. Analyze this image and help the user (especially elderly). Keep it short and helpful." }, { inline_data: { mime_type: "image/jpeg", data: base64Data } }] }] }
        );
        actionHistory.push({ action: "Image Analyzed for Accessibility", status: "SUCCESS", time: new Date().toLocaleString() });
        saveHistory();
        return res.status(200).json({ reply: response.data.candidates[0].content.parts[0].text, uiUpdate: {} });
    } catch (error) {
        return res.status(500).json({ reply: "I couldn't analyze the image. Try again.", uiUpdate: {} });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const msgLower = message.toLowerCase().trim();

    if (msgLower.includes("dark") || msgLower.includes("night")) { 
        isOwnerVerified = true; isGuestMode = false; isAwaitingPassphrase = false; isFamilyMode = false;
        actionHistory.push({ action: "Owner Authenticated", status: "SUCCESS", time: new Date().toLocaleString() }); saveHistory();
        return res.status(200).json({ reply: "Passphrase verified. Welcome back, Owner.", uiUpdate: { guestMode: false } });
    }

    if (isAwaitingPassphrase) {
        isAwaitingPassphrase = false;
        return res.status(200).json({ reply: "Incorrect passphrase. Access denied.", uiUpdate: {} });
    }

    if (isAddingFamily) {
        isAddingFamily = false; isFamilyMode = true; isOwnerVerified = false; 
        const memberName = message.trim(); 
        actionHistory.push({ action: `Family Member Added: ${memberName}`, status: "SUCCESS", time: new Date().toLocaleString() }); saveHistory();
        return res.status(200).json({ reply: `${memberName} added with restricted access.`, uiUpdate: { guestMode: true } });
    }

    if (msgLower.includes("owner") || msgLower.includes("admin")) {
        isAwaitingPassphrase = true;
        return res.status(200).json({ reply: "Voice verification required. Speak the passphrase.", uiUpdate: {} });
    }

    if (msgLower.includes("add family")) {
        isAddingFamily = true;
        return res.status(200).json({ reply: "Please tell me the name of the family member.", uiUpdate: {} });
    }

    if (isFamilyMode && msgLower.includes("unlock")) {
        actionHistory.push({ action: "Family Unlock Attempt", status: "DENIED", time: new Date().toLocaleString() }); saveHistory();
        return res.status(200).json({ reply: "Access Denied. Only primary owner can perform this.", uiUpdate: {} });
    }

    if (msgLower.includes("unlock") && !isOwnerVerified && !isFamilyMode) {
        isGuestMode = true;
        actionHistory.push({ action: "Unauthorized Unlock Attempt", status: "LOCKDOWN", time: new Date().toLocaleString() }); saveHistory();
        return res.status(200).json({ reply: "CRITICAL ALERT: Unauthorized access detected. Lockdown initiated.", uiUpdate: { triggerLockdown: true, guestMode: true } });
    }

    if (msgLower.includes("unlock") && isOwnerVerified) {
        currentSecurityCode = Math.floor(1000 + Math.random() * 9000).toString();
        return res.status(200).json({ reply: "Generated a new 4-digit code. Please confirm.", uiUpdate: { showCode: true, code: currentSecurityCode } });
    }

    if (msgLower.includes(currentSecurityCode) && isOwnerVerified) {
        return res.status(200).json({ reply: "Code verified. Pending owner approval.", uiUpdate: { showPending: true } });
    }

    if (msgLower === "veto") {
        actionHistory.push({ action: "Door Unlock", status: "VETOED", time: new Date().toLocaleString() }); saveHistory();
        return res.status(200).json({ reply: "Action vetoed by owner.", uiUpdate: { clearPending: true } });
    }
    
    if (msgLower === "accept") {
        actionHistory.push({ action: "Door Unlock", status: "APPROVED", time: new Date().toLocaleString() }); saveHistory();
        return res.status(200).json({ reply: "Action approved.", uiUpdate: { clearPending: true } });
    }

    if (msgLower.includes("music") || msgLower.includes("play")) {
        isMusicPlaying = true;
        actionHistory.push({ action: "Music Played", status: "LOW-RISK", time: new Date().toLocaleString() }); saveHistory();
        return res.status(200).json({ reply: `Playing Jazz Vibes.`, uiUpdate: { playMusic: true, trackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" } });
    }

    if (msgLower.includes("help") || msgLower.includes("sos")) {
        return res.status(200).json({ reply: "Emergency mode activated.", uiUpdate: { showEmergency: true } });
    }

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[0]}:generateContent?key=${GEMINI_API_KEY}`,
            { contents: [{ role: "user", parts: [{ text: `You are Guardian Voice, a smart home AI. Keep answers concise. User: ${message}` }] }] }
        );
        return res.status(200).json({ reply: response.data.candidates[0].content.parts[0].text, uiUpdate: {} });
    } catch (error) {
        return res.status(200).json({ reply: "Running in offline mode. Core security features active.", uiUpdate: {} });
    }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));