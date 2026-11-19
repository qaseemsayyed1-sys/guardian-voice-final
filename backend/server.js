const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODELS = ["gemini-3.5-flash"];
const ADMIN_PIN = "1234"; 

let db, historyRef;

try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n')
      })
    });
    db = admin.firestore();
    historyRef = db.collection('history');
    console.log("Firebase initialized successfully.");
  } else {
    console.log("Firebase keys missing. Running in memory mode.");
  }
} catch (error) {
  console.error("Firebase Init Error:", error.message);
}

let guestLinkToken = null;
let isGuestMode = false;
let isOwnerVerified = false;
let isAwaitingPassphrase = false;
let isFamilyMode = false; 
let isAddingFamily = false;
let currentSecurityCode = "8429";
let isMusicPlaying = false;
let memoryHistory = [];

const saveHistory = async (action, status, role) => {
    const newEntry = { action, status, role, time: new Date().toLocaleString() };
    if (historyRef) {
        try {
            await historyRef.add({
                action, status, role,
                time: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { console.error("Firebase Save Error:", e.message); }
    } else {
        memoryHistory.push(newEntry);
    }
};

app.get('/', (req, res) => res.status(200).send('Guardian Voice Backend running'));

app.post('/api/verify-owner', (req, res) => {
    const { pin } = req.body;
    if (pin === ADMIN_PIN) res.status(200).json({ success: true });
    else res.status(401).json({ success: false, error: "Invalid Owner PIN" });
});

app.get('/api/history', async (req, res) => {
    const { pin } = req.query;
    if (pin !== ADMIN_PIN) return res.status(403).json({ error: "Unauthorized. Owner PIN required." });

    if (historyRef) {
        try {
            const snapshot = await historyRef.orderBy('time', 'desc').limit(50).get();
            const history = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    action: data.action, status: data.status, role: data.role,
                    time: data.time ? data.time.toDate().toLocaleString() : 'Just Now'
                };
            });
            return res.status(200).json(history);
        } catch (error) {
            return res.status(500).json({ error: "Failed to fetch history from DB" });
        }
    } else {
        return res.status(200).json(memoryHistory);
    }
});

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
            { contents: [{ parts: [{ text: "You are Guardian Voice. Analyze this image and help the user." }, { inline_data: { mime_type: "image/jpeg", data: base64Data } }] }] }
        );
        await saveHistory("Image Analyzed", "SUCCESS", "Owner");
        return res.status(200).json({ reply: response.data.candidates[0].content.parts[0].text, uiUpdate: {} });
    } catch (error) {
        return res.status(500).json({ reply: "I couldn't analyze the image.", uiUpdate: {} });
    }
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const msgLower = message.toLowerCase().trim();

    if (msgLower.includes("dark") || msgLower.includes("night")) { 
        isOwnerVerified = true; isGuestMode = false; isAwaitingPassphrase = false; isFamilyMode = false;
        await saveHistory("Owner Authenticated", "SUCCESS", "Owner");
        return res.status(200).json({ reply: "Passphrase verified. Welcome back, Owner.", uiUpdate: { guestMode: false } });
    }

    if (isAwaitingPassphrase) {
        isAwaitingPassphrase = false;
        return res.status(200).json({ reply: "Incorrect passphrase. Access denied.", uiUpdate: {} });
    }

    if (isAddingFamily) {
        isAddingFamily = false; isFamilyMode = true; isOwnerVerified = false; 
        const memberName = message.trim(); 
        await saveHistory(`Family Member Added: ${memberName}`, "SUCCESS", "Owner");
        return res.status(200).json({ reply: `${memberName} added with restricted access.`, uiUpdate: { guestMode: true } });
    }

    if (msgLower.includes("owner") || msgLower.includes("admin")) {
        isAwaitingPassphrase = true;
        return res.status(200).json({ reply: "Voice verification required.", uiUpdate: {} });
    }

    if (msgLower.includes("add family")) {
        isAddingFamily = true;
        return res.status(200).json({ reply: "Please tell me the name of the family member.", uiUpdate: {} });
    }

    if (isFamilyMode && msgLower.includes("unlock")) {
        await saveHistory("Family Unlock Attempt", "DENIED", "Family");
        return res.status(200).json({ reply: "Access Denied. Only primary owner can perform this.", uiUpdate: {} });
    }

    if (msgLower.includes("unlock") && !isOwnerVerified && !isFamilyMode) {
        isGuestMode = true;
        await saveHistory("Unauthorized Unlock Attempt", "LOCKDOWN", "Guest");
        return res.status(200).json({ reply: "CRITICAL ALERT: Unauthorized access detected.", uiUpdate: { triggerLockdown: true, guestMode: true } });
    }

    if (msgLower.includes("unlock") && isOwnerVerified) {
        currentSecurityCode = Math.floor(1000 + Math.random() * 9000).toString();
        return res.status(200).json({ reply: "Generated code. Please confirm.", uiUpdate: { showCode: true, code: currentSecurityCode } });
    }

    if (msgLower.includes(currentSecurityCode) && isOwnerVerified) {
        return res.status(200).json({ reply: "Code verified. Pending owner approval.", uiUpdate: { showPending: true } });
    }

    if (msgLower === "veto") {
        await saveHistory("Door Unlock", "VETOED", "Owner");
        return res.status(200).json({ reply: "Action vetoed by owner.", uiUpdate: { clearPending: true } });
    }
    
    if (msgLower === "accept") {
        await saveHistory("Door Unlock", "APPROVED", "Owner");
        return res.status(200).json({ reply: "Action approved.", uiUpdate: { clearPending: true } });
    }

    if (msgLower.includes("music") || msgLower.includes("play")) {
        isMusicPlaying = true;
        await saveHistory("Music Played", "LOW-RISK", "Owner");
        return res.status(200).json({ reply: `Playing Jazz Vibes.`, uiUpdate: { playMusic: true, trackUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" } });
    }

    if (msgLower.includes("help") || msgLower.includes("sos")) {
        return res.status(200).json({ reply: "Emergency mode activated.", uiUpdate: { showEmergency: true } });
    }

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[0]}:generateContent?key=${GEMINI_API_KEY}`,
            { contents: [{ role: "user", parts: [{ text: `You are Guardian Voice. User: ${message}` }] }] }
        );
        return res.status(200).json({ reply: response.data.candidates[0].content.parts[0].text, uiUpdate: {} });
    } catch (error) {
        return res.status(200).json({ reply: "Running in offline mode.", uiUpdate: {} });
    }
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));