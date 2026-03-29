import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import dns from "dns";
import { promisify } from "util";
import { google } from "googleapis";
import cookieParser from "cookie-parser";

const resolveMx = promisify(dns.resolveMx);
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

if (process.env.VERCEL && (!process.env.APP_URL || process.env.APP_URL.includes('localhost'))) {
  console.warn("WARNING: APP_URL is not set or points to localhost on Vercel. Google OAuth callbacks will fail.");
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${APP_URL}/auth/google/callback`
);

export async function createServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Google Auth Routes
  app.get("/api/auth/google/url", (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: "Google OAuth credentials not configured" });
    }
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email"],
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

  app.post("/api/gmail/send", async (req, res) => {
    const tokensStr = req.cookies.google_tokens;
    if (!tokensStr) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    const { to, subject, body } = req.body;
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
    .highlight { color: #FF6321; font-weight: bold; }
  </style>
</head>
<body style="background-color: #f9f9f9; padding: 20px;">
  <div class="container">
    <div class="header">
      <div class="logo">LOOPER<span class="highlight">OS</span></div>
    </div>
    <div class="content">
      ${body.replace(/\n/g, '<br>')}
    </div>
    <div class="footer">
      Sent via <strong>LOOPER OS</strong> - AI-Powered Outreach Intelligence<br>
      &copy; ${new Date().getFullYear()} LOOPER OS. All rights reserved.<br>
      Lagos, Nigeria | Specialized Web Solutions
    </div>
  </div>
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
    } catch (error) {
      console.warn(`DNS MX check failed for ${domain}:`, error);
    }

    if (!domainVerified) {
      return res.json({ status: "unverified", reason: "Domain has no mail servers" });
    }

    // 3. Failover API Logic
    // Try Abstract API first
    if (abstractKey && abstractKey.length > 5 && !abstractKey.includes("TODO")) {
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
          console.error("Abstract API failed with status 401: Unauthorized. Please check your EMAIL_VERIFICATION_API_KEY in the Secrets panel.");
        } else {
          console.warn(`Abstract API failed with status ${response.status}`);
        }
      } catch (error) {
        console.error("Abstract API verification failed:", error);
      }
    } else if (abstractKey) {
      console.warn("Abstract API key appears to be invalid or a placeholder.");
    }

    // Fallback to Verifalia API
    if (verifaliaSid && verifaliaKey && !verifaliaSid.includes("TODO") && !verifaliaKey.includes("TODO")) {
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
          console.error("Verifalia API failed with status 401: Unauthorized. Please check your VERIFALIA_APP_SID and VERIFALIA_APP_KEY in the Secrets panel.");
        } else {
          console.warn(`Verifalia API failed with status ${response.status}`);
        }
      } catch (error) {
        console.error("Verifalia API verification failed:", error);
      }
    } else if (verifaliaSid || verifaliaKey) {
      console.warn("Verifalia credentials appear to be invalid or placeholders.");
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

if (process.env.NODE_ENV !== "production") {
  createServer().then(app => {
    const PORT = 3000;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}
