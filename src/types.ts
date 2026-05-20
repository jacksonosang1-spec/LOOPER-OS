export interface ActivityLog {
  id: string;
  type: 'Analysis' | 'Outreach' | 'Status Change' | 'Note';
  content: string;
  timestamp: string;
}

export interface Reply {
  id: string;
  from: string;
  content: string;
  snippet: string;
  timestamp: string;
  isInterested: boolean;
  followUpDraft?: string;
  followUpSubject?: string;
  sent?: boolean;
  sentAt?: string;
  threadId?: string;
  originalMessageId?: string;
}

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
  status: 'New' | 'Analyzing' | 'Scored' | 'Outreach Sent' | 'Follow-up Sent' | 'Replied' | 'Meeting Booked' | 'Closed Won' | 'Closed Lost';
  score: number;
  priority: 'Hot' | 'Warm' | 'Cold' | 'None';
  websiteStatus: 'none' | 'poor' | 'good';
  isVerifiedNoWebsite?: boolean;
  painPoints: string[];
  lastActionDate: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  openedAt?: string;
  isOpened?: boolean;
  clickedAt?: string;
  isClicked?: boolean;
  followUpDate?: string;
  followUpScript?: string;
  analysis?: LeadAnalysis;
  outreachMessage?: string;
  outreachSubject?: string;
  relumeUrl?: string;
  mapsUrl?: string;
  reviewSnippets?: string[];
  activityHistory?: ActivityLog[];
  replies?: Reply[];
  uid: string;
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
