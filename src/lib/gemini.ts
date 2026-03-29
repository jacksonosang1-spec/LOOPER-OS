import { GoogleGenAI, Type } from "@google/genai";
import { Lead, LeadAnalysis } from "../types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY || GEMINI_API_KEY === 'undefined') {
  console.error("GEMINI_API_KEY is missing or invalid. Please set it in your environment variables.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error?.message?.includes('429') || error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED');
      
      if (isRateLimit && i < maxRetries) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.warn(`Rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function discoverLeads(niche: string, city: string, count: number = 5, latLng?: { latitude: number, longitude: number }): Promise<Partial<Lead>[]> {
  console.log(`Discovering leads for niche: ${niche} in ${city} (count: ${count})`);
  
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'undefined') {
    throw new Error("Gemini API key is missing. Please configure it in your environment variables on Vercel.");
  }

  const model = "gemini-3-flash-preview";
  
  const prompt = `Find ${count} ${niche} businesses in ${city} using Google Maps.
  For each business you find, you MUST extract the official website URL and contact email.
  
  Instructions for extraction:
  - companyName: The official brand/business name.
  - websiteUrl: The official website link listed on their Google Maps profile. If not found, search for "[Business Name] [City] official website".
  - phone: The primary contact phone number from their Google Business Profile or official website.
  - address: The full physical address.
  - mapsUrl: The Google Maps URL provided by the tool.
  - email: The official contact email. Search their official website, Google Business Profile, or verified business directories (e.g., Yelp, Yellow Pages).
  - jobTitle: The job title of a key contact person if explicitly listed.
  - socialMedia: An object containing links to their official social media profiles if explicitly listed.

  CRITICAL AUTHENTICITY & ANTI-HALLUCINATION RULE: 
  - ONLY include businesses you successfully found using the Google Maps tool.
  - Do NOT guess, predict, or hallucinate any details.
  - Phone numbers and emails MUST be authentic and directly sourced from the business's own pages or verified profiles.
  - If a verified detail is not found, return an empty string or empty object.
  - Ensure the "mapsUrl" matches the tool's output exactly.

  IMPORTANT: You MUST return the results as a JSON array of objects inside a \`\`\`json code block. 
  Do not include any other text outside the code block.
  `;

  try {
    const response = await withRetry(() => ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          includeServerSideToolInvocations: true,
          retrievalConfig: {
            latLng: latLng
          }
        }
      },
    }));

    console.log("Gemini Response:", response);
    const text = response.text;
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    let parsedLeads: Partial<Lead>[] = [];

    if (jsonMatch) {
      try {
        parsedLeads = JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.error("Failed to parse lead discovery JSON", e);
      }
    }

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const finalLeads: Partial<Lead>[] = [];

    const verifyEmail = async (email: string): Promise<'verified' | 'unverified' | 'unknown'> => {
      if (!email) return 'unknown';
      try {
        const response = await fetch('/api/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await response.json();
        return data.status || 'unknown';
      } catch (e) {
        console.error("Email verification error", e);
        return 'unknown';
      }
    };

    if (groundingChunks) {
      // Create a map of real businesses found by the tool
      const realBusinesses = new Map<string, any>();
      groundingChunks.forEach(chunk => {
        if (chunk.maps) {
          realBusinesses.set(chunk.maps.uri, chunk.maps);
        }
      });

      // Match parsed leads with real businesses
      await Promise.all(parsedLeads.map(async (lead) => {
        if (lead.mapsUrl && realBusinesses.has(lead.mapsUrl)) {
          const chunk = realBusinesses.get(lead.mapsUrl);
          const emailStatus = lead.email ? await verifyEmail(lead.email) : 'unknown';
          
          finalLeads.push({
            ...lead,
            companyName: chunk.title || lead.companyName, // Prioritize tool's title
            mapsUrl: chunk.uri,
            emailStatus,
            reviewSnippets: (chunk.placeAnswerSources as any[])?.map((s: any) => s.reviewSnippets).flat().filter(Boolean)
          });
          // Mark as processed
          realBusinesses.delete(lead.mapsUrl);
        }
      }));

      // Add any real businesses that the model missed in its JSON
      realBusinesses.forEach((chunk, uri) => {
        finalLeads.push({
          companyName: chunk.title || "Unknown Business",
          mapsUrl: uri,
          websiteUrl: "",
          phone: "",
          address: "",
          email: "",
          reviewSnippets: (chunk.placeAnswerSources as any[])?.map((s: any) => s.reviewSnippets).flat().filter(Boolean)
        });
      });
    } else if (parsedLeads.length > 0) {
      // If no grounding chunks but we have parsed leads, we must be careful.
      // However, the user wants 100% real data from Maps. 
      // If there are no chunks, the model likely hallucinated the whole thing.
      console.warn("No grounding chunks found. Discarding potentially hallucinated leads.");
    }

    return finalLeads;
  } catch (error) {
    console.error("Gemini lead discovery error:", error);
    throw error;
  }
}

export async function analyzeWebsite(url: string, companyName: string): Promise<LeadAnalysis & { email?: string, websiteUrl?: string }> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze the website ${url} for the company ${companyName} based on the LOOPER OS Full Rubric.
    
    CRITICAL: You MUST attempt to find the official contact email and verify the official website URL.
    If the provided URL is 'none' or looks incorrect, use Google Search to find the official website for ${companyName}.
    Search for "${companyName} official website" and "${companyName} contact email".
    
    Rubric Categories & Criteria:
    1. Technical Performance (30%): Not mobile responsive, Slow page speed (>3s LCP), No HTTPS/SSL, Outdated CMS/plugins, Broken links/404s.
    2. Business & Conversion (30%): No lead capture form, Missing clear CTAs, No social proof/testimonials, No analytics/tracking, No chatbot/live chat.
    3. SEO & Visibility (25%): Poor/missing keyword relevance, No local SEO / GMB link, Missing/poor meta tags, Stale content (no updates 6mo+).
    4. Design & UX (15%): Poor visual hierarchy, Outdated layout (tables, Flash), Inconsistent branding, WCAG accessibility issues.
    
    Return the result in JSON format matching this structure:
    {
      "technical": { "mobileResponsiveness": number, "pageLoadSpeed": number, "security": number, "outdatedCms": number, "brokenLinks": number },
      "design": { "visualHierarchy": number, "ctaClarity": number, "accessibility": number, "modernLayout": number, "consistency": number },
      "business": { "leadCaptureForms": number, "aiChatbot": number, "socialProof": number, "ecommerce": number, "analytics": number },
      "seo": { "metaTagOptimization": number, "contentFreshness": number, "keywordRelevance": number, "localSeo": number },
      "summary": "string",
      "recommendations": ["string"],
      "email": "string (optional, only if found)",
      "websiteUrl": "string (optional, only if verified/corrected)"
    }
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      tools: [{ googleSearch: {} }],
      toolConfig: { includeServerSideToolInvocations: true }
    },
  }));

  const analysis = JSON.parse(response.text);
  
  if (analysis.email) {
    try {
      const verifyRes = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: analysis.email })
      });
      const verifyData = await verifyRes.json();
      analysis.emailStatus = verifyData.status || 'unknown';
    } catch (e) {
      console.error("Email verification error during analysis", e);
      analysis.emailStatus = 'unknown';
    }
  }

  return analysis;
}

export async function generateOutreach(lead: Lead): Promise<string> {
  const model = "gemini-3-flash-preview";
  
  const analysisDetails = lead.analysis ? `
    Detailed Analysis:
    - Technical: ${JSON.stringify(lead.analysis.technical)}
    - Design: ${JSON.stringify(lead.analysis.design)}
    - Business: ${JSON.stringify(lead.analysis.business)}
    - SEO: ${JSON.stringify(lead.analysis.seo)}
    - Summary: ${lead.analysis.summary}
    - Recommendations: ${lead.analysis.recommendations.join(", ")}
  ` : "";

  const prompt = `
    Generate a highly personalized outreach email for ${lead.contactName || 'there'} at ${lead.companyName}.
    
    Lead Context:
    - Company: ${lead.companyName}
    - Website: ${lead.websiteUrl}
    - Location: ${lead.address || 'Unknown'}
    - Website Status: ${lead.websiteStatus}
    - Lead Score: ${lead.score}
    - Pain Points: ${lead.painPoints.join(", ")}
    ${analysisDetails}
    
    Outreach Structure & Style (Follow this EXACTLY):
    1. Greeting: "Hello [Name]," (Use ${lead.contactName || 'there'})
    2. Intro: 
       - If the lead is in Lagos or Nigeria: "My name is Jackson, a Lagos-based web designer."
       - If the lead is international: "My name is Jackson, a web designer specializing in [Niche] solutions."
       - Follow with: "I've been following ${lead.companyName}'s incredible work in [Niche]... [Acknowledge their impact/service]."
    3. Observation: "While your services are exceptional, I noticed a few areas on your website that... Specifically, [Reference 2-3 specific pain points from the analysis summary/scores]..."
    4. Value Prop: "I specialize in building fast, mobile-first websites that act as 24/7 sales engines, converting visitors into valuable leads and appointments. Imagine a seamless online experience that not only showcases ${lead.companyName}'s excellence but also makes it incredibly easy for [Target Audience] to connect with you, anytime, anywhere."
    5. Demo Offer: "To illustrate this, I've put together a pre-built demo concept tailored for ${lead.companyName}, demonstrating how these improvements could look and function. It addresses the identified pain points and highlights a modern, [Niche]-centric design."
    6. CTA: "Would you be open to a brief 10-minute call next week to see this demo concept?"
    7. Sign-off: "Best regards, Jackson"

    Tone: Professional, inspiring, and value-first. Do not sound like a generic sales pitch. Use the specific analysis details to prove you've actually looked at their site.

    Return ONLY the email body.
  `;

  const response = await withRetry(() => ai.models.generateContent({
    model,
    contents: prompt,
  }));

  return response.text;
}

export async function generateRelumeUrl(lead: Lead): Promise<string> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Based on the company ${lead.companyName}, identify:
    - Target Audience (e.g., first-time buyers, luxury car buyers)
    - Specializations (e.g., flexible financing, trusted quality)
    - Look and Feel (e.g., sleek and luxury, bold and high-energy)
    
    Return the result in JSON format:
    {
      "audience": "string",
      "specialization": "string",
      "style": "string"
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const { audience, specialization, style } = JSON.parse(response.text);
  
  const brief = `${lead.companyName} is a ${style} website for ${audience}, offering ${specialization} to help them find the perfect service with confidence and ease. The site's design embraces a bold, clean and minimal aesthetic with a modern color palette to convey trust, sophistication, and high energy.`;
  
  const encodedBrief = encodeURIComponent(brief);
  return `https://relume.io/app/project/create?brief=${encodedBrief}&via=gpt`;
}
