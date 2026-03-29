export interface Lead {
  id: string;
  companyName: string;
  websiteUrl: string;
  contactName: string;
  email: string;
  emailStatus?: 'verified' | 'unverified' | 'unknown';
  jobTitle?: string;
  socialMedia?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
  phone?: string;
  address?: string;
  status: 'New' | 'Analyzing' | 'Scored' | 'Outreach Sent' | 'Replied' | 'Meeting Booked' | 'Closed Won' | 'Closed Lost';
  score: number;
  priority: 'Hot' | 'Warm' | 'Cold' | 'None';
  websiteStatus: 'none' | 'poor' | 'good';
  painPoints: string[];
  lastActionDate: string;
  createdAt: string;
  analysis?: LeadAnalysis;
  outreachMessage?: string;
  relumeUrl?: string;
  mapsUrl?: string;
  reviewSnippets?: string[];
}

export interface LeadAnalysis {
  technical: {
    mobileResponsiveness: number;
    pageLoadSpeed: number;
    security: number;
    outdatedCms: number;
    brokenLinks: number;
  };
  design: {
    visualHierarchy: number;
    ctaClarity: number;
    accessibility: number;
    modernLayout: number;
    consistency: number;
  };
  business: {
    leadCaptureForms: number;
    aiChatbot: number;
    socialProof: number;
    ecommerce: number;
    analytics: number;
  };
  seo: {
    metaTagOptimization: number;
    contentFreshness: number;
    keywordRelevance: number;
    localSeo: number;
  };
  summary: string;
  recommendations: string[];
}
