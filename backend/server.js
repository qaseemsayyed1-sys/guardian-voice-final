const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
const { cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const OWNER_PASSPHRASE = process.env.OWNER_PASSPHRASE || 'dark';

const GEMINI_MODELS = (
    process.env.GEMINI_MODELS ||
    'gemini-3.5-flash,gemini-3.1-flash-lite'
).split(',').map(model => model.trim()).filter(Boolean);

const GEMINI_TIMEOUT = 20000;

let db;
let historyRef;

try {
    if (
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
    ) {
        const serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        };

        if (!admin.apps.length) {
            admin.initializeApp({
                credential: cert(serviceAccount)
            });
        }

        db = getFirestore();
        historyRef = db.collection('history');

        console.log('Firebase initialized successfully.');
    } else {
        console.log('Firebase keys missing. Running in memory mode.');
    }
} catch (error) {
    console.error('Firebase Init Error:', error.message);
}

let isGuestMode = false;
let isOwnerVerified = false;
let isAwaitingPassphrase = false;
let isFamilyMode = false;
let isAddingFamily = false;
let currentSecurityCode = '8429';
let isMusicPlaying = false;
let memoryHistory = [];

const saveHistory = async (action, status, role) => {
    const newEntry = {
        action,
        status,
        role,
        time: new Date().toLocaleString()
    };

    if (historyRef) {
        try {
            await historyRef.add({
                action,
                status,
                role,
                time: FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Firebase Save Error:', error.message);
        }
    } else {
        memoryHistory.push(newEntry);

        if (memoryHistory.length > 100) {
            memoryHistory.shift();
        }
    }
};

const extractGeminiReply = (data) => {
    return data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('')
        .trim() || '';
};

const callGemini = async (requestBody) => {
    if (!GEMINI_API_KEY) {
        throw new Error('Gemini API key is missing.');
    }

    let lastError;

    for (const model of GEMINI_MODELS) {
        try {
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                requestBody,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': GEMINI_API_KEY
                    },
                    timeout: GEMINI_TIMEOUT
                }
            );

            const reply = extractGeminiReply(response.data);

            if (reply) {
                return reply;
            }

            lastError = new Error(`${model} returned an empty response.`);
            console.error(lastError.message);
        } catch (error) {
            lastError = error;

            const status = error.response?.status;
            const details = error.response?.data || error.message;

            console.error(`Gemini model ${model} failed:`, details);

            if (status === 401 || status === 403) {
                throw new Error('Gemini API key is invalid or does not have permission.');
            }
        }
    }

    throw lastError || new Error('All Gemini models failed.');
};

app.get('/', (req, res) => {
    res.status(200).send('Guardian Voice backend is running');
});

app.get('/api/mcp/tools', (req, res) => {
    res.status(200).json({
        protocol: 'MCP',
        version: '2025-11-25',
        tools: [
            {
                name: 'unlock_door',
                description: 'Unlocks the smart door',
                risk: 'HIGH'
            },
            {
                name: 'play_music',
                description: 'Plays music on speaker',
                risk: 'LOW'
            },
            {
                name: 'add_family_member',
                description: 'Adds a restricted user',
                risk: 'MEDIUM'
            },
            {
                name: 'silent_sos',
                description: 'Triggers silent emergency alert',
                risk: 'CRITICAL'
            }
        ]
    });
});

app.get('/api/history', async (req, res) => {
    const { pin } = req.query;

    if (pin !== ADMIN_PIN) {
        return res.status(403).json({
            error: 'Unauthorized. Owner PIN required.'
        });
    }

    if (historyRef) {
        try {
            const snapshot = await historyRef
                .orderBy('time', 'desc')
                .limit(50)
                .get();

            const history = snapshot.docs.map(doc => {
                const data = doc.data();

                return {
                    action: data.action,
                    status: data.status,
                    role: data.role,
                    time: data.time
                        ? data.time.toDate().toLocaleString()
                        : 'Just Now'
                };
            });

            return res.status(200).json(history);
        } catch (error) {
            console.error('History Fetch Error:', error.message);

            return res.status(500).json({
                error: 'Failed to fetch history from DB'
            });
        }
    }

    return res.status(200).json(memoryHistory.slice(-50).reverse());
});

app.post('/api/reset', (req, res) => {
    isOwnerVerified = false;
    isGuestMode = false;
    isFamilyMode = false;
    isAddingFamily = false;
    isAwaitingPassphrase = false;
    currentSecurityCode = '8429';
    isMusicPlaying = false;

    res.status(200).json({
        success: true,
        message: 'Chat reset successfully'
    });
});

app.post('/api/analyze-image', async (req, res) => {
    const { imageBase64 } = req.body || {};

    if (!imageBase64 || typeof imageBase64 !== 'string') {
        return res.status(400).json({
            error: 'No valid image provided'
        });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({
            error: 'Gemini API key missing. Add GEMINI_API_KEY in Render environment variables.'
        });
    }

    try {
        const match = imageBase64.match(
            /^data:(image\/(?:jpeg|jpg|png|webp));base64,([\s\S]+)$/
        );

        const mimeType = match
            ? match[1].replace('image/jpg', 'image/jpeg')
            : 'image/jpeg';

        const base64Data = match
            ? match[2]
            : imageBase64;

        if (!/^[A-Za-z0-9+/=\s]+$/.test(base64Data)) {
            return res.status(400).json({
                error: 'Invalid image data'
            });
        }

        const requestBody = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        {
                            text: 'Describe this image clearly in 2-3 short sentences. Focus on the main objects and important details.'
                        },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data.replace(/\s/g, '')
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 120
            }
        };

        const reply = await callGemini(requestBody);

        await saveHistory('Image Analyzed', 'SUCCESS', 'Owner');

        return res.status(200).json({
            reply,
            uiUpdate: {}
        });
    } catch (error) {
        console.error('Image Gemini Error:', error.response?.data || error.message);

        return res.status(502).json({
            reply: 'Image analysis failed. Please try again.',
            uiUpdate: {}
        });
    }
});

app.post('/api/chat', async (req, res) => {
    const message = req.body?.message;

    if (!message || typeof message !== 'string') {
        return res.status(400).json({
            error: 'A valid message is required.'
        });
    }

    const msgLower = message.toLowerCase().trim();

    if (msgLower === OWNER_PASSPHRASE.toLowerCase()) {
        isOwnerVerified = true;
        isGuestMode = false;
        isAwaitingPassphrase = false;
        isFamilyMode = false;
        isAddingFamily = false;

        await saveHistory('Owner Authenticated', 'SUCCESS', 'Owner');

        return res.status(200).json({
            reply: 'Passphrase verified. Welcome back, Owner. You now have full access.',
            uiUpdate: {
                guestMode: false
            }
        });
    }

    if (isAwaitingPassphrase) {
        isAwaitingPassphrase = false;

        return res.status(200).json({
            reply: 'Incorrect passphrase. Access denied.',
            uiUpdate: {}
        });
    }

    if (isAddingFamily) {
        isAddingFamily = false;
        isFamilyMode = true;
        isOwnerVerified = false;

        const memberName = message.trim();

        await saveHistory(
            `Family Member Added: ${memberName}`,
            'SUCCESS',
            'Owner'
        );

        return res.status(200).json({
            reply: `${memberName} has been added successfully. They now have restricted access.`,
            uiUpdate: {
                guestMode: true
            }
        });
    }

    if (
        msgLower.includes('owner') ||
        msgLower.includes('admin') ||
        msgLower.includes('my house')
    ) {
        isAwaitingPassphrase = true;

        return res.status(200).json({
            reply: 'Voice verification required. Please speak the secret passphrase to confirm your identity.',
            uiUpdate: {}
        });
    }

    if (
        msgLower.includes('add family') ||
        msgLower.includes('add member')
    ) {
        isAddingFamily = true;

        return res.status(200).json({
            reply: 'Please tell me the name of the family member you want to add.',
            uiUpdate: {}
        });
    }

    if (isFamilyMode && msgLower.includes('unlock')) {
        await saveHistory('Family Unlock Attempt', 'DENIED', 'Family');

        return res.status(200).json({
            reply: 'Access Denied. Only the primary owner can perform this action.',
            uiUpdate: {}
        });
    }

    if (msgLower.includes('unlock') && !isOwnerVerified && !isFamilyMode) {
        isGuestMode = true;

        await saveHistory(
            'Unauthorized Unlock Attempt',
            'LOCKDOWN',
            'Guest'
        );

        return res.status(200).json({
            reply: 'CRITICAL ALERT: Unauthorized access attempt detected. Initiating system lockdown protocol.',
            uiUpdate: {
                triggerLockdown: true,
                guestMode: true
            }
        });
    }

    if (msgLower.includes('unlock') && isOwnerVerified) {
        currentSecurityCode = Math.floor(
            1000 + Math.random() * 9000
        ).toString();

        return res.status(200).json({
            reply: 'I cannot execute that directly. I have generated a new 4-digit code on your screen. Please read it back to me to confirm.',
            uiUpdate: {
                showCode: true,
                code: currentSecurityCode
            }
        });
    }

    if (msgLower.includes(currentSecurityCode) && isOwnerVerified) {
        return res.status(200).json({
            reply: 'Code verified. I am proposing the action to the owner for final approval.',
            uiUpdate: {
                showPending: true
            }
        });
    }

    if (msgLower === 'veto') {
        await saveHistory('Door Unlock', 'VETOED', 'Owner');

        return res.status(200).json({
            reply: 'Action vetoed by owner.',
            uiUpdate: {
                clearPending: true
            }
        });
    }

    if (msgLower === 'accept') {
        await saveHistory('Door Unlock', 'APPROVED', 'Owner');

        return res.status(200).json({
            reply: 'Action approved.',
            uiUpdate: {
                clearPending: true
            }
        });
    }

    if (msgLower === '9999') {
        await saveHistory('Silent SOS', 'TRIGGERED', 'Owner');

        return res.status(200).json({
            reply: 'Code verified. Executing unlock sequence. (Note: Silent SOS alert sent to authorities).',
            uiUpdate: {
                showPending: true,
                silentSOS: true
            }
        });
    }

    if (
        msgLower.includes('music') ||
        msgLower.includes('play') ||
        msgLower.includes('song')
    ) {
        isMusicPlaying = true;

        await saveHistory('Music Played', 'LOW-RISK', 'Owner');

        return res.status(200).json({
            reply: 'Playing some Jazz Vibes right now.',
            uiUpdate: {
                playMusic: true,
                trackUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                playlistName: 'Jazz Vibes'
            }
        });
    }

    if (
        msgLower.includes('stop') ||
        msgLower.includes('pause')
    ) {
        if (isMusicPlaying) {
            isMusicPlaying = false;

            return res.status(200).json({
                reply: 'Music stopped.',
                uiUpdate: {
                    stopMusic: true
                }
            });
        }

        return res.status(200).json({
            reply: 'Nothing is currently playing.',
            uiUpdate: {}
        });
    }

    if (msgLower.includes('weather')) {
        return res.status(200).json({
            reply: 'It is currently 24°C and sunny in Mumbai. Perfect weather for light clothes if you are going shopping!',
            uiUpdate: {}
        });
    }

    if (
        msgLower.includes('help') ||
        msgLower.includes('emergency') ||
        msgLower.includes('sos')
    ) {
        return res.status(200).json({
            reply: 'Emergency mode activated.',
            uiUpdate: {
                showEmergency: true
            }
        });
    }

    if (!GEMINI_API_KEY) {
        return res.status(200).json({
            reply: 'I am Guardian Voice. I can handle security, play music, check weather, or answer your general questions. (AI module offline).',
            uiUpdate: {}
        });
    }

    const requestBody = {
        systemInstruction: {
            parts: [
                {
                    text: 'You are Guardian Voice, a smart and helpful AI assistant. You can answer general knowledge, tell jokes, and help with daily tasks. Keep answers concise.'
                }
            ]
        },
        contents: [
            {
                role: 'user',
                parts: [
                    {
                        text: message
                    }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 512
        }
    };

    try {
        const reply = await callGemini(requestBody);

        return res.status(200).json({
            reply,
            uiUpdate: {}
        });
    } catch (error) {
        console.error(
            'All Gemini models failed:',
            error.response?.data || error.message
        );

        let fallbackReply = 'I am Guardian Voice. ';

        if (
            msgLower.includes('wear') ||
            msgLower.includes('shopping')
        ) {
            fallbackReply += 'Based on the current weather, I suggest wearing light and comfortable clothes. Have a great shopping trip!';
        } else if (msgLower.includes('joke')) {
            fallbackReply += "Why don't programmers like nature? It has too many bugs! 😄";
        } else if (
            msgLower.includes('payment') ||
            msgLower.includes('pay')
        ) {
            fallbackReply += 'I cannot process direct bank payments, but I recommend using secure apps like Google Pay or PhonePe for your safety.';
        } else {
            fallbackReply += 'I am currently unable to connect to the AI service. Please try again in a moment.';
        }

        return res.status(200).json({
            reply: fallbackReply,
            uiUpdate: {}
        });
    }
});

app.listen(PORT, () => {
    console.log(`Guardian Voice backend running on port ${PORT}`);
});