# 🛡️ Guardian Voice: Secure Alexa+ Simulator

An intelligent, security-first AI assistant built for the Amazon Alexa+ Hackathon. Guardian Voice bridges the gap between smart home convenience and human safety by implementing a "Zero-Trust" and "Human-in-the-Loop" architecture.

## 🚀 The Problem
Voice assistants are getting smarter, but giving an AI the power to execute high-risk actions (like unlocking doors or making payments) without human oversight is dangerous. Current systems blindly obey commands, creating a massive security risk if an unauthorized person gains access.

## 💡 Our Solution
Guardian Voice categorizes tasks into two levels:
*   **Low-Risk Tasks:** Executes instantly (e.g., playing music, checking weather).
*   **High-Risk Tasks:** Requires strict verification (e.g., unlocking doors, paying bills).

### Key Features:
*   🎙️ **Voice Passphrase:** Owners must speak a secret passphrase to authenticate.
*   🔒 **Zero-Trust Lockdown:** Unauthorized attempts trigger a full-screen system lockdown.
*   🛑 **Human Veto System:** High-risk actions require a generated 4-digit code and a final human "ACCEPT" or "VETO" click.
*   🚨 **Silent SOS:** Typing `9999` pretends to unlock the door while silently sending an alert.
*   🧠 **Real AI Integration:** Uses Groq API (Llama 3) for real-time general knowledge and reasoning.

## 🛠️ Tech Stack
*   **Frontend:** React.js, Tailwind CSS, Web Speech API (Text-to-Speech)
*   **Backend:** Node.js, Express.js
*   **AI Model:** Groq API (Llama 3)
*   **Deployment:** Vercel (Frontend), Render (Backend)

* 🌐 Live Demo

· Live App: https://guardian-voice-final.vercel.app
· Demo Video: [Link to your YouTube Video]

---

Built with ❤️ by Qaseem Sayyed (First-Year B.Tech IT Student)
And 
Md Saad Shaikh (First-Year B.Tech IT Student)
