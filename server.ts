import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import dns from "dns";
import { promisify } from "util";
import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import http from "http";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const resolveMx = promisify(dns.resolveMx);
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the Firebase configuration
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));

// Initialize Firebase Admin
let db: any;
try {
  if (getApps().length === 0) {
    const config: any = {
      projectId: firebaseConfig.projectId
    };
    
    // Check if we are in a Google Cloud environment to use applicationDefault
    /*
    if (process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      config.credential = applicationDefault();
      console.log("[Firestore] Using applicationDefault credentials");
    }
    */

    const auth = new GoogleAuth();
    auth.getCredentials().then(creds => {
      console.log(`[Firestore] Identity: ${creds.client_email || 'Default'}`);
    }).catch(e => console.error("[Firestore] Failed to get identity:", e.message));

    initializeApp(config);
  }
  
  const app = getApps()[0];
  console.log(`[Firestore] Admin SDK initialized for project: ${firebaseConfig.projectId}`);
  
  // Use the specific database ID from config
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  db = getFirestore(app);
  console.log(`[Firestore] Connected to database: (default)`);
  
  // Connection test
  db.collection('leads').limit(1).get()
    .then((snapshot: any) => {
      console.log(`[Firestore] Connection successful for database: ${dbId}. Count: ${snapshot.size}`);
    })
    .catch((err: any) => {
      console.error(`[Firestore] Connection failed for database ${dbId}:`, err.message);
      if (err.message.includes('firestore.googleapis.com')) {
        console.error("[Firestore] Suggestion: Ensure Cloud Firestore API is enabled for project " + firebaseConfig.projectId);
      }
    });
} catch (error) {
  console.error("Firebase Admin initialization failed:", error);
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

// In-memory storage for email tracking
const openedLeads = new Map<string, string>();
const clickedLeads = new Map<string, string>();
let io: Server;

export async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

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
          const leadRef = db.collection('leads').doc(leadId);
          const leadDoc = await leadRef.get();
          if (leadDoc.exists) {
            const leadData = leadDoc.data();
            if (!leadData?.isOpened) {
              console.log(`[Firestore] Updating open status for lead: ${leadId}`);
              const newLog = {
                id: Math.random().toString(36).substr(2, 9),
                type: 'Outreach',
                content: `Email opened at ${new Date(openedAt).toLocaleString()} (Server-side)`,
                timestamp: new Date().toISOString(),
              };
              
              await leadRef.update({
                isOpened: true,
                openedAt,
                activityHistory: [newLog, ...(leadData?.activityHistory || [])],
                lastActionDate: new Date().toISOString().split('T')[0]
              });
              console.log(`Successfully updated Firestore for lead ${leadId} open`);
            }
          }
        }
      } catch (error) {
        console.error(`[Firestore] Failed to update Firestore for lead ${leadId} open:`, error);
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

  app.get("/api/leads/engagement-status", (req, res) => {
    console.log("GET /api/leads/engagement-status called");
    res.json({
      opened: Object.fromEntries(openedLeads),
      clicked: Object.fromEntries(clickedLeads)
    });
  });

  app.get("/api/admin/debug-logs", (req, res) => {
    try {
      if (fs.existsSync('engagement_debug.log')) {
        const logs = fs.readFileSync('engagement_debug.log', 'utf8');
        res.send(`<pre>${logs}</pre>`);
      } else {
        res.send("No debug logs found yet.");
      }
    } catch (e: any) {
      res.status(500).send(e.message);
    }
  });

  // Debug Route to list all leads
  app.get("/api/admin/leads", async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "Firestore not initialized" });
      const snapshot = await db.collection('leads').get();
      const leads = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      res.json({ count: snapshot.size, leads });
    } catch (error: any) {
      console.error("[Debug] Failed to fetch leads:", error.message);
      res.status(500).json({ error: error.message });
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

      // FALLBACK: Search for Aboboye and Co specifically
      try {
        const aboboyeSearch = await gmail.users.messages.list({
          userId: 'me',
          q: '"Aboboye" after:2024/01/01', 
          maxResults: 5
        });
        if (aboboyeSearch.data.messages) {
          for (const m of aboboyeSearch.data.messages) {
             const msg = await gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' });
             const snip = msg.data.snippet || "";
             const labelIds = msg.data.labelIds || [];
             if (!labelIds.includes('SENT')) {
               fs.appendFileSync('engagement_debug.log', `[DIAGNOSTIC] Found potential message from Aboboye: ${snip}\n---\n`);
             }
          }
        }
      } catch (e) {
        console.error("Aboboye diagnostic search failed:", e);
      }

      const replies: Record<string, string> = {}; // leadId -> repliedAt

      // Use a concurrency limit to avoid hitting rate limits and timeouts
      const CHUNK_SIZE = 5;
      for (let i = 0; i < leads.length; i += CHUNK_SIZE) {
        const chunk = leads.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (lead) => {
          if (!lead.email || !lead.sentAt) return;

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
            
            // Query 1: Direct reply from the same email
            const q = `from:(${lead.email}) after:${afterTimestamp}`;
            
            // Query 2: Search for the company name in the entire inbox (might catch replies from different addresses)
            const q2 = `"${lead.companyName}" after:${afterTimestamp}`;
            
            console.log(`[Gmail] Checking replies for ${lead.companyName} (${lead.email})`);
            
            let messages: any[] = [];
            
            // Try direct sender first
            const response = await gmail.users.messages.list({
              userId: 'me',
              q,
              maxResults: 5
            });
            if (response.data.messages) messages.push(...response.data.messages);
            
            // If nothing, try searching for company name
            if (messages.length === 0) {
              const response2 = await gmail.users.messages.list({
                userId: 'me',
                q: q2,
                maxResults: 5
              });
              if (response2.data.messages) messages.push(...response2.data.messages);
            }

            // Remove duplicates
            const uniqueMessageIds = new Set(messages.map(m => m.id));
            const uniqueMessages = Array.from(uniqueMessageIds).map(id => messages.find(m => m.id === id));

            if (uniqueMessages.length > 0) {
              console.log(`[Gmail] Found ${uniqueMessages.length} potential replies for ${lead.companyName}`);
              
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
                const fromHeader = headers.find(h => h.name === 'From')?.value || "";
                const isIncoming = !labelIds.includes('SENT') && !labelIds.includes('DRAFT');

                if (internalDate && isIncoming) {
                  const repliedAt = new Date(parseInt(internalDate)).toISOString();
                  replies[lead.id] = repliedAt;

                  // Interest Detection logic
                  const content = (snippet + " " + (msg.data.payload?.body?.data || "")).toLowerCase();
                  const interestKeywords = ['interested', 'yes', 'sure', 'call', 'talk', 'demo', 'website', 'design', 'available', 'how much', 'price', 'tell me more', 'how it works', 'send over', 'details'];
                  const isInterested = interestKeywords.some(kw => content.includes(kw));
                  
                  const logMsg = `[Gmail] Detected reply from ${fromHeader} for ${lead.companyName}. Interested: ${isInterested}\nSnippet: ${snippet}\n`;
                  try {
                    fs.appendFileSync('engagement_debug.log', logMsg + '---\n');
                  } catch (e) {}
                  console.log(logMsg);

                  // Update Firestore directly for replies
                  try {
                    const leadRef = db.collection('leads').doc(lead.id);
                    const leadDoc = await leadRef.get();
                    if (leadDoc.exists) {
                      const leadData = leadDoc.data();
                      if (leadData?.status !== 'Replied') {
                        const newLog = {
                          id: Math.random().toString(36).substr(2, 9),
                          type: 'Outreach',
                          content: `Reply detected from ${fromHeader}. Topic: ${snippet.substring(0, 50)}... ${isInterested ? '(High Interest Detected)' : ''}`,
                          timestamp: new Date().toISOString(),
                        };
                        
                        await leadRef.update({
                          status: 'Replied',
                          priority: isInterested ? 'Hot' : (leadData?.priority || 'Warm'),
                          activityHistory: [newLog, ...(leadData?.activityHistory || [])],
                          lastActionDate: new Date().toISOString().split('T')[0]
                        });
                        console.log(`Successfully updated Firestore for lead ${lead.id} reply`);
                      }
                    }
                  } catch (error) {
                    console.error(`Failed to update Firestore for lead ${lead.id} reply:`, error);
                  }
                  
                  // Stop after finding the first valid incoming reply for this lead
                  break;
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
          const leadRef = db.collection('leads').doc(leadId);
          const leadDoc = await leadRef.get();
          if (leadDoc.exists) {
            const leadData = leadDoc.data();
            if (!leadData?.isClicked) {
              console.log(`[Firestore] Updating click status for lead: ${leadId}`);
              const newLog = {
                id: Math.random().toString(36).substr(2, 9),
                type: 'Outreach',
                content: `Link clicked at ${new Date(clickedAt).toLocaleString()} (Server-side)`,
                timestamp: new Date().toISOString(),
              };
              
              await leadRef.update({
                isClicked: true,
                clickedAt,
                activityHistory: [newLog, ...(leadData?.activityHistory || [])],
                lastActionDate: new Date().toISOString().split('T')[0]
              });
              console.log(`Successfully updated Firestore for lead ${leadId} click`);
            }
          }
        }
      } catch (error) {
        console.error(`[Firestore] Failed to update Firestore for lead ${leadId} click:`, error);
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

    const { to, subject, body, leadId, isInternational } = req.body;
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
        `To: ${to}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${utf8Subject}`,
        '',
        htmlBody,
      ];
      const message = messageParts.join('\n');

      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
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
