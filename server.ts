import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import dns from "dns";
import { promisify } from "util";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import { GoogleGenAI } from "@google/genai";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import http from "http";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// Web SDK for server-side fallback
import { initializeApp as initializeWebApp } from 'firebase/app';
import { getFirestore as getWebFirestore, doc as webDoc, getDoc as getWebDoc, setDoc as setWebDoc, collection as webCollection, getDocs as getWebDocs, limit as webLimit, query as webQuery } from 'firebase/firestore';
import { getAuth as getWebAuth, signInAnonymously } from 'firebase/auth';

const resolveMx = promisify(dns.resolveMx);
dotenv.config();

// Import the Firebase configuration
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

// Initialize Firebase (Both Admin and Web SDK as fallback)
let db: any;
let isWebFallback = false;

try {
  // 1. Initialize Web SDK (usually more robust with API keys in this environment)
  const webApp = initializeWebApp(firebaseConfig);
  const webAuth = getWebAuth(webApp);
  
  // Sign in anonymously to allow rule-based access for the server
  const signInPromise = signInAnonymously(webAuth).then((cred) => {
    console.log(`[Firestore] Web SDK signed in anonymously. UID: ${cred.user.uid}`);
    return true;
  }).catch(e => {
    console.error(`[Firestore] Web SDK anonymous sign-in failed: ${e.message}`);
    return false;
  });

  const webDb = getWebFirestore(webApp, firebaseConfig.firestoreDatabaseId);

  // 2. Initialize Admin SDK (optional, kept for compatibility)
  if (getApps().length === 0) {
    initializeApp({
      projectId: firebaseConfig.projectId,
      credential: applicationDefault()
    });
  }
  const adminApp = getApps()[0];
  const adminDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

  // 3. Test and Choose
  db = adminDb; // Default to admin
  
  const testConnection = async () => {
    try {
      // Test Admin SDK
      await adminDb.collection('leads').limit(1).get();
      console.log("[Firestore] Admin SDK connection successful");
    } catch (adminErr: any) {
      console.warn(`[Firestore] Admin SDK failed: ${adminErr.message}. Switching to Web SDK fallback.`);
      isWebFallback = true;
      db = webDb; // Switch to web SDK
      
      try {
        // Wait for anonymous sign-in if using Web SDK
        await signInPromise;
        // Test Web SDK
        await getWebDocs(webQuery(webCollection(webDb, 'leads'), webLimit(1)));
        console.log("[Firestore] Web SDK connection successful");
      } catch (webErr: any) {
        console.error(`[Firestore] Web SDK also failed. Code: ${webErr.code}, Message: ${webErr.message}`);
      }
    }
  };
  testConnection();
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Helper to get the current base URL from a request if APP_URL is localhost
const getBaseUrl = (req: express.Request) => {
  if (APP_URL.includes('localhost') && req.get('host')) {
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    return `${protocol}://${req.get('host')}`;
  }
  return APP_URL;
};

console.log(`Application URL configured as: ${APP_URL}`);
if (APP_URL.includes('localhost')) {
  console.warn("WARNING: APP_URL is set to localhost. Tracking links in emails will not work for external recipients.");
}

if (process.env.VERCEL && (!process.env.APP_URL || process.env.APP_URL.includes('localhost'))) {
  console.warn("WARNING: APP_URL is not set or points to localhost on Vercel. Google OAuth callbacks will fail.");
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${APP_URL}/auth/google/callback`
);

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY as string,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

// In-memory storage for email tracking
const openedLeads = new Map<string, string>();
const clickedLeads = new Map<string, string>();
let io: Server;

export async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Health check
  app.get("/api/health", async (req, res) => {
    let firestoreStatus = "unknown";
    let errorDetail = null;
    try {
      if (db) {
        if (isWebFallback) {
          // Since getDocs might be blocked by 'list' rules, we test with a dummy getDoc
          await getWebDoc(webDoc(db, 'leads', 'health-check'));
        } else {
          await db.collection('leads').doc('health-check').get();
        }
        firestoreStatus = "connected";
      } else {
        firestoreStatus = "not_initialized";
      }
    } catch (e: any) {
      firestoreStatus = "failed";
      errorDetail = { code: e.code, message: e.message };
    }

    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      firestore: firestoreStatus,
      firestoreError: errorDetail,
      isWebFallback,
      dbId: firebaseConfig.firestoreDatabaseId || '(default)',
      projectId: firebaseConfig.projectId
    });
  });

  // Google Auth Routes
  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google OAuth credentials not configured" });
    }
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/gmail.send", 
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/userinfo.email"
      ],
      prompt: "consent"
    });
    res.json({ url });
  });

  app.get("/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Store tokens in a secure, httpOnly cookie
      res.cookie("google_tokens", JSON.stringify(tokens), {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Google Auth Callback Error:", error);
      res.status(500).send("Authentication failed");
    }
  });

  app.post("/api/auth/google/logout", (req, res) => {
    res.clearCookie("google_tokens", {
      httpOnly: true,
      secure: true,
      sameSite: "none"
    });
    res.json({ success: true });
  });

  app.get("/api/gmail/status", (req, res) => {
    const tokens = req.cookies.google_tokens;
    res.json({ connected: !!tokens });
  });

  // Tracking Pixel Route
  app.get("/api/pixel/:leadId", async (req, res) => {
    const { leadId } = req.params;
    console.log(`[Tracking] Pixel hit for lead: ${leadId}`);
    if (leadId) {
      const openedAt = new Date().toISOString();
      openedLeads.set(leadId, openedAt);
      
      if (io) {
        console.log(`[Socket] Emitting lead:opened for ${leadId}`);
        io.emit("lead:opened", { leadId, openedAt });
      }

      // Update Firestore directly
      try {
        if (db) {
          let leadDoc: any;
          let leadData: any;
          let leadRef: any;

          if (isWebFallback) {
            leadRef = webDoc(db, 'leads', leadId);
            const snap = await getWebDoc(leadRef);
            if (snap.exists()) {
              leadDoc = snap;
              leadData = snap.data();
            }
          } else {
            leadRef = db.collection('leads').doc(leadId);
            const snap = await leadRef.get();
            if (snap.exists) {
              leadDoc = snap;
              leadData = snap.data();
            }
          }

          if (leadDoc && !leadData?.isOpened) {
            const newLog = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'Outreach',
              content: `Email opened at ${new Date(openedAt).toLocaleString()} (Server-side)`,
              timestamp: new Date().toISOString(),
            };
            
            const updatePayload = {
              isOpened: true,
              openedAt,
              activityHistory: [newLog, ...(leadData?.activityHistory || [])],
              lastActionDate: new Date().toISOString().split('T')[0]
            };

            if (isWebFallback) {
              await setWebDoc(leadRef, updatePayload, { merge: true });
            } else {
              await leadRef.set(updatePayload, { merge: true });
            }
            console.log(`Successfully updated Firestore for lead ${leadId} open`);
          }
        }
      } catch (error: any) {
        console.error(`[Firestore Pixel Update ERROR] Lead: ${leadId}, Fallback: ${isWebFallback}, Error: ${error.code || error.message}`);
      }
    }
    
    // Return a 1x1 transparent GIF
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": pixel.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });
    res.end(pixel);
  });

  // Activity Summary (Engagement Stats)
  app.get("/api/leads/activity-summary", (req, res) => {
    try {
      console.log(`[Summary] Activity summary requested. Maps: opened=${openedLeads.size}, clicked=${clickedLeads.size}`);
      const data = {
        opened: Object.fromEntries(openedLeads),
        clicked: Object.fromEntries(clickedLeads)
      };
      res.json(data);
    } catch (error: any) {
      console.error("Activity summary error:", error.message);
      res.status(500).json({ error: error.message || "Failed to fetch activity summary" });
    }
  });

  // Admin Leads (Debug)
  app.get("/api/admin/leads", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "Firestore not initialized" });
      
      let leads: any[] = [];
      let size = 0;

      if (isWebFallback) {
        const snap = await getWebDocs(webQuery(webCollection(db, 'leads'), webLimit(50)));
        leads = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        size = snap.size;
      } else {
        const snapshot = await db.collection('leads').limit(50).get();
        leads = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        size = snapshot.size;
      }
      
      res.json({ count: size, leads });
    } catch (error: any) {
      console.error("[Admin API] Failed to fetch leads:", error.message);
      res.status(500).json({ error: error.message || "Firestore permission or connection error" });
    }
  });

  app.post("/api/gmail/check-replies", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    const { leads } = req.body; // Array of { id, email, sentAt }
    if (!leads || !Array.isArray(leads)) {
      return res.status(400).json({ error: "Invalid leads data" });
    }

    console.log(`Checking Gmail replies for ${leads.length} leads...`);

    try {
      const tokens = JSON.parse(tokensStr);
      const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      client.setCredentials(tokens);
      const gmail = google.gmail({ version: "v1", auth: client });

      const replies: Record<string, string> = {}; // leadId -> repliedAt

      // Use a concurrency limit to avoid hitting rate limits and timeouts
      const CHUNK_SIZE = 5;
      for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
        const chunk = leads.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (lead) => {
          if ((!lead.email && !lead.companyName) || !lead.sentAt) return;

          try {
            const sentAtDate = new Date(lead.sentAt);
            if (isNaN(sentAtDate.getTime())) {
              console.warn(`Invalid sentAt date for lead ${lead.id}: ${lead.sentAt}`);
              return;
            }

            // Search for messages from this email after sentAt
            // Gmail 'after' parameter uses Unix timestamp (seconds)
            // Subtract 3600 seconds (1 hour) to account for clock skew and potential delay in sentAt recording
            const afterTimestamp = Math.floor(sentAtDate.getTime() / 1000) - 3600;
            
            let messages: any[] = [];
            
            // Try direct sender first (if email is known)
            if (lead.email) {
              const q = `from:(${lead.email}) after:${afterTimestamp}`;
              console.log(`[Gmail] Checking replies for ${lead.companyName} by email (${lead.email})`);
              const response = await gmail.users.messages.list({
                userId: 'me',
                q,
                maxResults: 10
              });
              if (response.data.messages) messages.push(...response.data.messages);
            }
            
            // If nothing found or email is empty, search by company name
            if (messages.length === 0 && lead.companyName) {
              const q2 = `"${lead.companyName}" after:${afterTimestamp}`;
              console.log(`[Gmail] Checking replies for ${lead.companyName} by company query (${q2})`);
              const response2 = await gmail.users.messages.list({
                userId: 'me',
                q: q2,
                maxResults: 10
              });
              if (response2.data.messages) messages.push(...response2.data.messages);
            }

            // Remove duplicates
            const uniqueMessageIds = new Set(messages.map(m => m.id));
            const uniqueMessages = Array.from(uniqueMessageIds).map(id => messages.find(m => m.id === id));

            if (uniqueMessages.length > 0) {
              console.log(`[Gmail] Found ${uniqueMessages.length} potential messages for ${lead.companyName}`);
              
              for (const message of uniqueMessages) {
                const msg = await gmail.users.messages.get({
                  userId: 'me',
                  id: message.id!,
                  format: 'full'
                });
                
                const internalDate = msg.data.internalDate;
                const snippet = msg.data.snippet || "";
                
                // Check if it's REALLY an incoming message (not my own sent message showing up in search)
                const labelIds = msg.data.labelIds || [];
                const headers = msg.data.payload?.headers || [];
                const fromHeader = headers.find(h => h.name && h.name.toLowerCase() === 'from')?.value || "";
                const isIncoming = !labelIds.includes('SENT') && !labelIds.includes('DRAFT');

                if (internalDate && isIncoming) {
                  const repliedAt = new Date(parseInt(internalDate)).toISOString();
                  replies[lead.id] = repliedAt;

                  // Interest Detection logic
                  const snippet = msg.data.snippet || "";
                  const bodyData = msg.data.payload?.parts 
                    ? msg.data.payload.parts.find(p => p.mimeType === 'text/plain')?.body?.data || "" 
                    : msg.data.payload?.body?.data || "";
                  
                  const base64Body = bodyData.replace(/-/g, '+').replace(/_/g, '/');
                  const decodedBody = base64Body ? Buffer.from(base64Body, 'base64').toString('utf-8') : "";
                  const content = (snippet + " " + decodedBody).toLowerCase();
                  const interestKeywords = ['interested', 'yes', 'sure', 'call', 'talk', 'demo', 'website', 'design', 'available', 'how much', 'price', 'tell me more', 'how it works', 'send over', 'details'];
                  const isInterested = interestKeywords.some(kw => content.includes(kw));
                  
                  const logMsg = `[Gmail] Detected reply from ${fromHeader} for ${lead.companyName}. Interested: ${isInterested}\nSnippet: ${snippet}\n`;
                  console.log(logMsg);

                  // Update Firestore directly for replies
                  try {
                    let leadDoc: any;
                    let leadData: any;
                    let leadRef: any;

                    if (isWebFallback) {
                      leadRef = webDoc(db, 'leads', lead.id);
                      const snap = await getWebDoc(leadRef);
                      if (snap.exists()) {
                        leadDoc = snap;
                        leadData = snap.data();
                      }
                    } else {
                      leadRef = db.collection('leads').doc(lead.id);
                      const snap = await leadRef.get();
                      if (snap.exists) {
                        leadDoc = snap;
                        leadData = snap.data();
                      }
                    }

                    if (leadDoc) {
                      const currentReplies = [...(leadData?.replies || [])];
                      const messageIdHeader = headers.find(h => h.name && h.name.toLowerCase() === 'message-id')?.value || "";
                      const subjectHeader = headers.find(h => h.name && h.name.toLowerCase() === 'subject')?.value || "";
                      
                      const emailMatch = fromHeader.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                      const senderEmail = emailMatch ? emailMatch[0].trim() : "";
                      const threadId = msg.data.threadId || message.threadId;

                      const replyPayload = {
                        id: message.id,
                        threadId: threadId,
                        originalMessageId: messageIdHeader || message.id,
                        from: fromHeader,
                        fromEmail: senderEmail,
                        subject: subjectHeader,
                        content: decodedBody || snippet, 
                        snippet: snippet,
                        timestamp: repliedAt,
                        isInterested: isInterested
                      };

                      const existingIndex = currentReplies.findIndex((r: any) => r.id === message.id || r.messageId === message.id);
                      let repliesChanged = false;
                      let isNewReply = false;

                      if (existingIndex > -1) {
                        const existingReply = { ...currentReplies[existingIndex] };
                        let updated = false;
                        if (!existingReply.threadId && replyPayload.threadId) {
                          existingReply.threadId = replyPayload.threadId;
                          updated = true;
                        }
                        if (!existingReply.fromEmail && replyPayload.fromEmail) {
                          existingReply.fromEmail = replyPayload.fromEmail;
                          updated = true;
                        }
                        if (!existingReply.originalMessageId && replyPayload.originalMessageId) {
                          existingReply.originalMessageId = replyPayload.originalMessageId;
                          updated = true;
                        }
                        if (!existingReply.from && replyPayload.from) {
                          existingReply.from = replyPayload.from;
                          updated = true;
                        }
                        if (updated) {
                          currentReplies[existingIndex] = existingReply;
                          repliesChanged = true;
                        }
                      } else {
                        currentReplies.unshift(replyPayload);
                        repliesChanged = true;
                        isNewReply = true;
                      }

                      if (repliesChanged) {
                        const updatePayload: any = {
                          replies: currentReplies,
                          lastActionDate: new Date().toISOString().split('T')[0]
                        };

                        if (isNewReply) {
                          updatePayload.status = 'Replied';
                          updatePayload.priority = isInterested ? 'Hot' : (leadData?.priority || 'Warm');
                          
                          const newLog = {
                            id: Math.random().toString(36).substr(2, 9),
                            type: 'Outreach',
                            content: `Reply detected from ${fromHeader}. Topic: ${snippet.substring(0, 50)}... ${isInterested ? '(High Interest Detected)' : ''}`,
                            timestamp: new Date().toISOString(),
                          };
                          updatePayload.activityHistory = [newLog, ...(leadData?.activityHistory || [])];
                        }

                        if (senderEmail && (!leadData?.email || !leadData.email.includes("@"))) {
                          updatePayload.email = senderEmail;
                        }

                        if (isWebFallback) {
                          await setWebDoc(leadRef, updatePayload, { merge: true });
                        } else {
                          await leadRef.set(updatePayload, { merge: true });
                        }
                        console.log(`Successfully updated Firestore for lead ${lead.id} reply (isNew: ${isNewReply})`);
                      }
                    }
                  } catch (error: any) {
                    console.error(`[Firestore Reply Update ERROR] Lead: ${lead.id}, Fallback: ${isWebFallback}, Error: ${error.code || error.message}`);
                  }
                }
              }
            }
          } catch (err) {
            console.error(`Error checking replies for lead ${lead.id}:`, err);
          }
        }));
      }

      res.json({ replies });
    } catch (error) {
      console.error("Gmail Check Replies Error:", error);
      res.status(500).json({ error: "Failed to check for replies" });
    }
  });

  app.post("/api/leads/generate-draft", async (req, res) => {
    const { leadId, replyId } = req.body;
    console.log(`[Draft] Generating draft for lead ${leadId}, reply ${replyId}`);
    
    if (!leadId || !replyId) {
      return res.status(400).json({ error: "Missing leadId or replyId" });
    }

    try {
      if (!db) return res.status(500).json({ error: "Firestore not initialized" });
      
      let leadDoc: any;
      let leadData: any;

      if (isWebFallback) {
        const leadRef = webDoc(db, "leads", leadId);
        const snap = await getWebDoc(leadRef);
        if (snap.exists()) {
          leadDoc = snap;
          leadData = snap.data();
        }
      } else {
        const leadRef = db.collection("leads").doc(leadId);
        const snap = await leadRef.get();
        if (snap.exists) {
          leadDoc = snap;
          leadData = snap.data();
        }
      }

      if (!leadDoc) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const replies = leadData.replies || [];
      const currentReply = replies.find((r: any) => r.id === replyId || r.messageId === replyId);
      
      if (!currentReply) {
        return res.status(404).json({ error: "Reply not found" });
      }

      // Format conversation history
      const conversationHistory = replies
        .slice()
        .reverse() // Sort chronologically (assuming they are stored newest first)
        .map((r: any) => {
          const sender = r.from || "Lead";
          return `${sender === "me" ? "Me" : "Lead"}: ${r.snippet || r.content}`;
        }).join('\n');

      const sysPrompt = `
        You are Jackson Osang (Web Strategist) from DCYPHERNET, a Lagos-based web design agency. 
        Your goal is to draft a professional, straightforward, and respectful response.
        
        Persona Details:
        - Name: Jackson Osang
        - Agency: DCYPHERNET
        - Role: Web Strategist
        - Location: Lagos, Nigeria
        
        Outreach Context:
        In our initial outreach email, we stated that we have already built a "demo concept" (a fast, smart, mobile-first website demo) custom-designed for their company to solve their specific digital pain points (e.g., outdated design, lack of mobile optimization, or relying on non-business emails).
        Since the lead's response was positive (e.g., "Ok", "Sure", "Let's see", "I'm interested"), this means they are open and expecting to see this specific demo this week as promised.
        
        Core Directive:
        - Build directly on this positive context. Be straightforward and direct: we have the demo ready and want to walk them through it this week.
        - Avoid generic sales preambles, fluff, or beating around the bush. Say something like "Great! I have the responsive demo concept of your website ready to show you."
        - Keep the content concise, crisp, and focused on booking a quick call (maximum 10 minutes) this week to show them our work.
        - Suggest a practical day/time format for this week (e.g., "Are you available this Wednesday or Thursday afternoon for a quick 10-minute Google Meet to review the concept?").
        
        Guidelines:
        - Reference the custom "demo website concept" that we built for them specifically to address their web presence / pain points.
        - Signature MUST be:
          Best regards,
          Jackson Osang / Web Strategist
          DCYPHERNET
          Tel: +234 9065710367
      `;

      const userPrompt = `
        Draft a follow-up response for:
        Company: ${leadData.companyName}
        Website: ${leadData.websiteUrl}
        Original Outreach Subject: "${leadData.outreachSubject || ''}"
        Incoming Message Subject: "${currentReply.subject || ''}"
        
        Conversation History:
        ${conversationHistory}
        
        Most Recent Lead Message: "${currentReply.snippet || currentReply.content}"
        Interest Level (Detected): ${currentReply.isInterested ? 'High' : 'Neutral/Low'}
        
        Return ONLY a JSON object with:
        { "subject": "Professional Re: subject line", "body": "The full email body" }
      `;

      // Robust Gemini Call with retries and fallback
      async function generateWithRetry(userPrompt: string, sysPrompt: string, attempt: number = 0): Promise<{subject: string, body: string}> {
        const models = ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-flash-latest"];
        const modelName = models[Math.min(attempt, models.length - 1)];
        
        try {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: userPrompt }] },
            config: {
              systemInstruction: sysPrompt,
              responseMimeType: "application/json"
            }
          });
          
          if (response.text) {
            try {
              return JSON.parse(response.text);
            } catch (e) {
              console.error("Failed to parse Gemini JSON output:", response.text);
              return { 
                subject: `Follow-up: ${leadData.companyName}`, 
                body: response.text 
              };
            }
          }
          throw new Error("Empty response from AI");
        } catch (err: any) {
          const isRetryable = err.message?.includes("503") || err.message?.includes("429") || err.message?.includes("UNAVAILABLE");
          if (isRetryable && attempt < 3) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`[Gemini] Model ${modelName} returned retryable error. Retrying in ${delay}ms... (Attempt ${attempt + 1})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateWithRetry(userPrompt, sysPrompt, attempt + 1);
          }
          throw err;
        }
      }

      const { subject: aiSubject, body } = await generateWithRetry(userPrompt, sysPrompt);
      
      // Determine thread-safe subject
      let baseSubject = "";
      if (currentReply.subject) {
        baseSubject = currentReply.subject;
      } else if (leadData.outreachSubject) {
        baseSubject = leadData.outreachSubject;
      }
      
      if (baseSubject) {
        if (!/^re:/i.test(baseSubject)) {
          baseSubject = `Re: ${baseSubject}`;
        }
      } else {
        baseSubject = aiSubject || `Re: ${leadData.companyName} x DCYPHERNET`;
      }
      
      res.json({ subject: baseSubject, draft: body });
    } catch (error: any) {
      console.error("Draft generation error:", error.message);
      res.status(500).json({ error: error.message || "Failed to generate draft" });
    }
  });

  // Click Tracking Route
  app.get("/api/redirect/:leadId", async (req, res) => {
    const { leadId } = req.params;
    const { url } = req.query;
    console.log(`[Tracking] Redirect hit for lead: ${leadId}, target: ${url}`);

    if (leadId) {
      const clickedAt = new Date().toISOString();
      clickedLeads.set(leadId, clickedAt);

      if (io) {
        console.log(`[Socket] Emitting lead:clicked for ${leadId}`);
        io.emit("lead:clicked", { leadId, clickedAt });
      }

      // Update Firestore directly
      try {
        if (db) {
          let leadDoc: any;
          let leadData: any;
          let leadRef: any;

          if (isWebFallback) {
            leadRef = webDoc(db, 'leads', leadId);
            const snap = await getWebDoc(leadRef);
            if (snap.exists()) {
              leadDoc = snap;
              leadData = snap.data();
            }
          } else {
            leadRef = db.collection('leads').doc(leadId);
            const snap = await leadRef.get();
            if (snap.exists) {
              leadDoc = snap;
              leadData = snap.data();
            }
          }

          if (leadDoc && !leadData?.isClicked) {
            const newLog = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'Outreach',
              content: `Link clicked at ${new Date(clickedAt).toLocaleString()} (Server-side)`,
              timestamp: new Date().toISOString(),
            };
            
            const updatePayload = {
              isClicked: true,
              clickedAt,
              activityHistory: [newLog, ...(leadData?.activityHistory || [])],
              lastActionDate: new Date().toISOString().split('T')[0]
            };

            if (isWebFallback) {
              await setWebDoc(leadRef, updatePayload, { merge: true });
            } else {
              await leadRef.set(updatePayload, { merge: true });
            }
            console.log(`Successfully updated Firestore for lead ${leadId} click`);
          }
        }
      } catch (error: any) {
        console.error(`[Firestore Redirect Update ERROR] Lead: ${leadId}, Fallback: ${isWebFallback}, Error: ${error.code || error.message}`);
      }
    }
    
    if (url) {
      res.redirect(url as string);
    } else {
      res.redirect("/");
    }
  });

  app.post("/api/gmail/send", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    let { to, subject, body, leadId, isInternational, threadId, originalMessageId } = req.body;
    try {
      const tokens = JSON.parse(tokensStr);
      const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      client.setCredentials(tokens);

      // Handle token refresh
      client.on('tokens', (newTokens) => {
        const updatedTokens = { ...tokens, ...newTokens };
        res.cookie("google_tokens", JSON.stringify(updatedTokens), {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 30 * 24 * 60 * 60 * 1000
        });
      });

      const gmail = google.gmail({ version: "v1", auth: client });

      let leadData: any = null;
      if (leadId) {
        try {
          if (isWebFallback) {
            const snap = await getWebDoc(webDoc(db, 'leads', leadId));
            if (snap.exists()) {
              leadData = snap.data();
            }
          } else {
            const snap = await db.collection('leads').doc(leadId).get();
            if (snap.exists) {
              leadData = snap.data();
            }
          }
        } catch (dbErr) {
          console.error("Failed to load lead details from Firestore inside gmail/send:", dbErr);
        }
      }

      // 1. Resolve 'to' email address via Firestore Lead details if missing or invalid
      if ((!to || typeof to !== "string" || !to.includes("@")) && leadData) {
        if (leadData.email && leadData.email.includes("@")) {
          to = leadData.email;
        } else {
          // Look through existing replies
          const replies = leadData.replies || [];
          for (const r of replies) {
            if (r.fromEmail && r.fromEmail.includes("@")) {
              to = r.fromEmail;
              break;
            }
            const match = r.from?.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (match) {
              to = match[0].trim();
              break;
            }
          }
        }
      }

      // If 'to' is still missing or invalid, search Gmail with company query fallback
      if ((!to || typeof to !== "string" || !to.includes("@")) && leadData?.companyName) {
        try {
          const searchRes = await gmail.users.messages.list({
            userId: 'me',
            q: `"${leadData.companyName}"`,
            maxResults: 5
          });
          if (searchRes.data.messages && searchRes.data.messages.length > 0) {
            for (const msgBrief of searchRes.data.messages) {
              const fullMsg = await gmail.users.messages.get({
                userId: 'me',
                id: msgBrief.id!,
                format: 'metadata',
                metadataHeaders: ['From']
              });
              const fromVal = fullMsg.data.payload?.headers?.find(h => h.name && h.name.toLowerCase() === 'from')?.value || "";
              const match = fromVal.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
              if (match) {
                to = match[0].trim();
                break;
              }
            }
          }
        } catch (searchErr) {
          console.error("Failed to fallback search Gmail for email:", searchErr);
        }
      }

      // If still missing, return bad request
      if (!to || typeof to !== "string" || !to.includes("@")) {
        return res.status(400).json({ error: "Invalid or missing 'to' email address, unable to resolve from lead or search." });
      }

      // 2. Resolve 'threadId' and 'originalMessageId' if missing
      if (!threadId && leadData) {
        const replies = leadData.replies || [];
        const replyWithThread = replies.find((r: any) => r.threadId);
        if (replyWithThread) {
          threadId = replyWithThread.threadId;
        }
      }

      if (!originalMessageId && leadData) {
        const replies = leadData.replies || [];
        const replyWithMsgId = replies.find((r: any) => r.originalMessageId || r.id);
        if (replyWithMsgId) {
          originalMessageId = replyWithMsgId.originalMessageId || replyWithMsgId.id;
        }
      }

      // Last-resort fallback: Search Gmail directly for any thread with this 'to' recipient
      if (!threadId && to) {
        try {
          const searchRes = await gmail.users.messages.list({
            userId: 'me',
            q: `to:(${to}) OR from:(${to})`,
            maxResults: 1
          });
          if (searchRes.data.messages && searchRes.data.messages.length > 0) {
            const firstMsg = searchRes.data.messages[0];
            threadId = firstMsg.threadId || undefined;
            if (!originalMessageId) {
              originalMessageId = firstMsg.id || undefined;
            }
          }
        } catch (searchErr) {
          console.error("Failed to fallback search Gmail for threadId:", searchErr);
        }
      }

      // Wrap links for tracking
      const currentBaseUrl = getBaseUrl(req);
      const wrappedBody = body.replace(/href="([^"]+)"/g, (match: string, url: string) => {
        if (url.startsWith('http') && !url.includes(currentBaseUrl)) {
          return `href="${currentBaseUrl}/api/redirect/${leadId}?url=${encodeURIComponent(url)}"`;
        }
        return match;
      });

      const trackingPixel = leadId ? `<img src="${currentBaseUrl}/api/pixel/${leadId}" width="1" height="1" style="display:none;" />` : '';
      
      const nigeriaFooter = `
        <div class="footer">
          Sent via <strong>LOOPER OS</strong> - Powered by DCYPHERNET<br>
          &copy; 2026 DCYPHERNET. All rights reserved.<br>
          Lagos, Nigeria | Specialized Smart Web Solutions<br>
          <a href="https://www.dcyphernet.com" style="color: #999; text-decoration: none;">www.dcyphernet.com</a>
        </div>
      `;

      const internationalFooter = `
        <div class="footer">
          Sent via <strong>LOOPER OS</strong> - Powered by DCYPHERNET<br>
          &copy; 2026 DCYPHERNET. All rights reserved.<br>
          Specialized Smart Web Solutions<br>
          <a href="https://www.dcyphernet.com" style="color: #999; text-decoration: none;">www.dcyphernet.com</a>
        </div>
      `;

      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; padding: 40px; border: 1px solid #eee; border-radius: 12px; background-color: #ffffff; }
    .header { margin-bottom: 30px; text-align: left; }
    .logo { font-size: 24px; font-weight: 900; color: #1A1A1A; letter-spacing: -1px; }
    .content { font-size: 16px; color: #444; }
    .footer { font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; margin-top: 40px; }
    .highlight { color: #4b1e78; font-weight: bold; }
  </style>
</head>
<body style="background-color: #f9f9f9; padding: 20px;">
  <div class="container">
    <div class="header">
      <div class="logo">DCYPHER<span class="highlight">NET</span></div>
    </div>
    <div class="content">
      ${wrappedBody.replace(/\n/g, '<br>')}
    </div>
    ${isInternational ? internationalFooter : nigeriaFooter}
  </div>
  ${trackingPixel}
</body>
</html>
      `;

      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `To: ${to.trim()}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${utf8Subject}`,
      ];

      if (originalMessageId) {
        messageParts.push(`In-Reply-To: ${originalMessageId}`);
        messageParts.push(`References: ${originalMessageId}`);
      }

      messageParts.push('');
      messageParts.push(htmlBody);
      
      const message = messageParts.join('\r\n');

      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: threadId
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Gmail Send Error:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // API Route for Email Verification
  app.post("/api/verify-email", async (req, res) => {
    const { email } = req.body;
    const abstractKey = process.env.EMAIL_VERIFICATION_API_KEY;
    const verifaliaSid = process.env.VERIFALIA_APP_SID;
    const verifaliaKey = process.env.VERIFALIA_APP_KEY;

    // 1. Basic Regex Check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.json({ status: "unverified", reason: "Invalid format" });
    }

    // 2. DNS MX Record Check (Free & Unlimited)
    const domain = email.split("@")[1];
    let domainVerified = false;
    try {
      const mxRecords = await resolveMx(domain);
      domainVerified = mxRecords && mxRecords.length > 0;
    } catch (error: any) {
      if (error.code === 'ENOTFOUND' || error.code === 'ESERVFAIL' || error.code === 'ENODATA') {
        console.warn(`DNS MX check: Domain ${domain} not found or has no mail servers.`);
      } else {
        console.warn(`DNS MX check failed for ${domain}:`, error);
      }
    }

    if (!domainVerified) {
      return res.json({ status: "unverified", reason: "Domain has no mail servers" });
    }

    // 3. Failover API Logic
    const isPlaceholder = (key: string | undefined) => !key || key.length < 10 || key.includes("TODO") || key.includes("your_") || key.includes("MY_");

    // Try Abstract API first
    if (!isPlaceholder(abstractKey)) {
      try {
        const response = await fetch(
          `https://emailvalidation.abstractapi.com/v1/?api_key=${abstractKey}&email=${email}`
        );
        if (response.ok) {
          const data = await response.json();
          const status = data.deliverability === "DELIVERABLE" ? "verified" : "unverified";
          return res.json({ status, data, method: "abstract-api" });
        } else if (response.status === 429) {
          console.warn("Abstract API limit reached, falling back to Verifalia...");
        } else if (response.status === 401) {
          console.warn("Abstract API: Unauthorized (401). Please check your EMAIL_VERIFICATION_API_KEY in the Secrets panel.");
        } else {
          console.warn(`Abstract API failed with status ${response.status}`);
        }
      } catch (error) {
        console.error("Abstract API verification failed:", error);
      }
    } else if (abstractKey && abstractKey !== "") {
      console.info("Abstract API key is missing or a placeholder. Skipping premium verification.");
    }

    // Fallback to Verifalia API
    if (!isPlaceholder(verifaliaSid) && !isPlaceholder(verifaliaKey)) {
      try {
        const auth = Buffer.from(`${verifaliaSid}:${verifaliaKey}`).toString('base64');
        const response = await fetch("https://api.verifalia.com/v2.4/email-validations", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            entries: [{ input: email }],
            waitTime: 30000 // Wait up to 30s for synchronous result
          })
        });

        if (response.ok) {
          const data = await response.json();
          const entry = data.entries[0];
          // Verifalia status: 'Deliverable', 'Undeliverable', 'Risky', 'Unknown'
          const status = entry.status === "Deliverable" ? "verified" : "unverified";
          return res.json({ status, data: entry, method: "verifalia-api" });
        } else if (response.status === 401) {
          console.warn("Verifalia API: Unauthorized (401). Please check your VERIFALIA_APP_SID and VERIFALIA_APP_KEY in the Secrets panel.");
        } else {
          console.warn(`Verifalia API failed with status ${response.status}`);
        }
      } catch (error) {
        console.error("Verifalia API verification failed:", error);
      }
    } else if (verifaliaSid || verifaliaKey) {
      console.info("Verifalia credentials are missing or placeholders. Skipping premium verification.");
    }

    // Final Fallback: DNS MX Check result
    res.json({ 
      status: "verified", 
      method: "dns-fallback", 
      message: "Domain verified (MX records found), but premium APIs were unavailable or skipped." 
    });
  });

  // Unmatched API routes fallback before Vite
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    // Only serve static files if NOT on Vercel (Vercel handles this via rewrites)
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Global Error]', err);
    res.status(err.status || 500).json({ 
      error: err.message || 'Internal Server Error',
      path: req.path
    });
  });

  return app;
}

createServer().then(app => {
  const PORT = 3000;
  const server = http.createServer(app);
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected to tracking socket");
    socket.on("disconnect", () => {
      console.log("Client disconnected from tracking socket");
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
