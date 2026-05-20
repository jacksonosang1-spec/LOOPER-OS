import React, { useState, useEffect, useMemo, useRef, Component, ReactNode } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Zap, 
  Settings, 
  Search, 
  Plus, 
  MoreVertical, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ChevronRight,
  Mail,
  BarChart3,
  Globe,
  Shield,
  Smartphone,
  MessageSquare,
  TrendingUp,
  ExternalLink,
  Loader2,
  X,
  Trash2,
  Edit,
  Calendar,
  Check,
  RefreshCw,
  Menu,
  Wand2,
  Copy,
  RotateCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'sonner';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { io } from 'socket.io-client';

import { Lead, LeadAnalysis, ActivityLog } from './types';
import { analyzeWebsite, generateOutreach, discoverLeads, generateRelumeUrl, generateFollowUp } from './lib/gemini';

import { 
  db, 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  where, 
  handleFirestoreError, 
  OperationType,
  User
} from './firebase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Firestore Error: ${parsed.error} (${parsed.operationType} on ${parsed.path})`;
      } catch (e) {
        errorMessage = this.state.error.message || String(this.state.error);
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F4] p-8">
          <div className="bg-white p-8 rounded-3xl border border-[#E5E5E5] shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold mb-4">Application Error</h2>
            <p className="text-[#9E9E9E] text-sm mb-8">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#1A1A1A] text-white py-3 rounded-2xl font-semibold hover:bg-[#333] transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const NICHES = [
  "Lawyers & Legal Firms",
  "Medical & Dental Clinics",
  "Contractors / Remodelers",
  "Real Estate Agents / Brokers / Property Management",
  "Finance / Insurance Advisors",
  "Pool Cleaners / Pool Builders",
  "Painters (Residential / Commercial)",
  "Roofers / Home Repair Services",
  "Electricians / Plumbers / HVAC",
  "Restaurants & Food Delivery",
  "Coaches & Course Creators",
  "E-Commerce & Local Retail Stores",
  "Fitness Trainers / Gyms / Yoga Studios",
  "SaaS & Tech Startups",
  "Construction & Home Improvement",
  "Landscapers & Lawn Care",
  "Photographers & Videographers",
  "Beauty Salons / Spas / Barbers",
  "Wedding / Event Planners",
  "Nonprofits / Churches",
  "Other"
];

// Mock initial data
const INITIAL_LEADS: Lead[] = [
  {
    id: '1',
    companyName: 'Acme Corp',
    websiteUrl: 'https://acme.com',
    contactName: 'John Doe',
    email: 'john@acme.com',
    status: 'Scored',
    score: 72,
    priority: 'Hot',
    websiteStatus: 'poor',
    painPoints: ['Slow load speed', 'Non-responsive', 'No CTA'],
    lastActionDate: '2026-03-20',
    createdAt: '2026-03-20',
    uid: 'system',
    analysis: {
      technical: { mobileResponsiveness: 40, pageLoadSpeed: 30, security: 90, outdatedCms: 20, brokenLinks: 80 },
      design: { visualHierarchy: 60, ctaClarity: 20, accessibility: 50, modernLayout: 30, consistency: 70 },
      business: { leadCaptureForms: 10, aiChatbot: 0, socialProof: 40, ecommerce: 0, analytics: 90 },
      seo: { metaTagOptimization: 50, contentFreshness: 20, keywordRelevance: 60, localSeo: 40 },
      summary: "The site is technically outdated and lacks clear conversion paths.",
      recommendations: ["Optimize for mobile", "Add clear CTAs", "Implement AI Chatbot"]
    }
  },
  {
    id: '2',
    companyName: 'Globex',
    websiteUrl: 'https://globex.io',
    contactName: 'Jane Smith',
    email: 'jane@globex.io',
    status: 'New',
    score: 0,
    priority: 'None',
    websiteStatus: 'none',
    isVerifiedNoWebsite: false,
    painPoints: [],
    lastActionDate: '2026-03-28',
    createdAt: '2026-03-28',
    uid: 'system'
  },
  {
    id: 'aboboye-1',
    companyName: 'Aboboye and Co',
    websiteUrl: 'https://aboboye.com',
    contactName: 'Contact',
    email: 'info@aboboye.com',
    status: 'Outreach Sent',
    score: 85,
    priority: 'Warm',
    websiteStatus: 'poor',
    painPoints: ['Outdated design', 'No mobile support'],
    lastActionDate: '2026-03-29',
    createdAt: '2026-03-29',
    sentAt: '2026-03-20T00:00:00.000Z',
    uid: 'system'
  }
];

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);
  const [isSchedulingFollowUp, setIsSchedulingFollowUp] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');
  const [trackingStatus, setTrackingStatus] = useState<{ opened: Record<string, string>, clicked: Record<string, string> }>({ opened: {}, clicked: {} });

  const leadsRef = useRef<Lead[]>([]);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) {
      setLeads([]);
      return;
    }

    const q = query(collection(db, 'leads'), where('uid', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leadsData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Lead))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setLeads(leadsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leads');
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  const addActivityLog = async (leadId: string, type: ActivityLog['type'], content: string) => {
    const newLog: ActivityLog = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content,
      timestamp: new Date().toISOString(),
    };
    
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    try {
      await updateDoc(doc(db, 'leads', leadId), {
        activityHistory: [newLog, ...(lead.activityHistory || [])],
        lastActionDate: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${leadId}`);
    }
  };

  const handleAddNote = async (leadId: string) => {
    if (!noteText.trim()) return;
    setIsAddingNote(true);
    try {
      await addActivityLog(leadId, 'Note', noteText);
      setNoteText('');
      toast.success('Note added to activity history');
    } finally {
      setIsAddingNote(false);
    }
  };

  const checkGmailStatus = async (retries = 3) => {
    try {
      const response = await fetch('/api/gmail/status');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setIsGmailConnected(data.connected);
    } catch (error) {
      if (retries > 0) {
        console.warn(`Retrying Gmail status check... (${retries} attempts left)`);
        setTimeout(() => checkGmailStatus(retries - 1), 2000);
      } else {
        console.error('Failed to check Gmail status after retries:', error);
      }
    }
  };

  const pollTrackingStatus = async () => {
    if (isPolling) return;
    setIsPolling(true);
    try {
      // 1. Check Pixel Tracking (Opens/Clicks)
      try {
        const response = await fetch('/api/leads/activity-summary');
        if (response.ok) {
          const data = await response.json();
          setTrackingStatus(data);
        } else {
          if (response.status !== 404) {
             console.warn(`Activity summary check failed with status: ${response.status}`);
          }
        }
      } catch (err: any) {
        // Silent fail for network errors during background polling
        if (err?.name !== 'TypeError' || !err?.message?.includes('fetch')) {
          console.error('Failed to fetch activity summary:', err);
        }
      }

      // 2. Check Gmail Replies
      if (isGmailConnected) {
        const sentLeads = leadsRef.current.filter(l => 
          (l.status === 'Outreach Sent' || 
           l.status === 'Follow-up Sent' || 
           l.status === 'Replied' || 
           (l.replies && l.replies.length > 0)) && 
          (l.email || l.companyName)
        );
        if (sentLeads.length > 0) {
          try {
            const replyResponse = await fetch('/api/gmail/check-replies', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                leads: sentLeads.map(l => ({
                  id: l.id,
                  email: l.email || '',
                  companyName: l.companyName,
                  sentAt: l.deliveredAt || l.lastActionDate || l.createdAt || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
                }))
              })
            });

            if (replyResponse.ok) {
              const { replies } = await replyResponse.json();
              const replyCount = Object.keys(replies).length;
              if (replyCount > 0) {
                console.log(`Detected ${replyCount} new replies via polling`);
                // No need to update Firestore here as the server already did it
                // onSnapshot will handle the UI update
              }
            } else if (replyResponse.status === 401) {
              console.warn('Gmail session expired during polling');
              setIsGmailConnected(false);
            } else {
              const errorData = await replyResponse.json().catch(() => ({}));
              console.error('Failed to check Gmail replies:', errorData.error || replyResponse.statusText);
            }
          } catch (err) {
            if (err instanceof TypeError && err.message === 'Failed to fetch') {
              console.warn('Network error while checking Gmail replies - server might be busy or unreachable');
            } else {
              console.error('Failed to check Gmail replies:', err);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to poll tracking status:', error);
    } finally {
      setIsPolling(false);
    }
  };

  useEffect(() => {
    checkGmailStatus();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    pollTrackingStatus(); // Initial call
    const interval = setInterval(pollTrackingStatus, 15000); // 15s fallback
    return () => clearInterval(interval);
  }, [isAuthReady, user, isGmailConnected]);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const socket = io();

    socket.on('connect', () => {
      console.log('Connected to tracking WebSocket');
    });

    socket.on('lead:opened', async ({ leadId, openedAt }) => {
      console.log('Real-time open detected:', leadId);
      const currentLeads = leadsRef.current;
      const lead = currentLeads.find(l => l.id === leadId);
      if (lead && !lead.isOpened) {
        const newLog: ActivityLog = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'Outreach',
          content: `Email opened at ${new Date(openedAt).toLocaleString()} (Real-time)`,
          timestamp: new Date().toISOString(),
        };
        
        try {
          await updateDoc(doc(db, 'leads', leadId), {
            isOpened: true,
            openedAt,
            activityHistory: [newLog, ...(lead.activityHistory || [])],
            lastActionDate: new Date().toISOString().split('T')[0]
          });
          toast.info(`Email opened by ${lead.companyName}`);
        } catch (error) {
          console.error('Failed to update open status in real-time:', error);
        }
      }
    });

    socket.on('lead:clicked', async ({ leadId, clickedAt }) => {
      console.log('Real-time click detected:', leadId);
      const currentLeads = leadsRef.current;
      const lead = currentLeads.find(l => l.id === leadId);
      if (lead && !lead.isClicked) {
        const newLog: ActivityLog = {
          id: Math.random().toString(36).substr(2, 9),
          type: 'Outreach',
          content: `Link clicked at ${new Date(clickedAt).toLocaleString()} (Real-time)`,
          timestamp: new Date().toISOString(),
        };
        
        try {
          await updateDoc(doc(db, 'leads', leadId), {
            isClicked: true,
            clickedAt,
            activityHistory: [newLog, ...(lead.activityHistory || [])],
            lastActionDate: new Date().toISOString().split('T')[0]
          });
          toast.info(`Link clicked by ${lead.companyName}`);
        } catch (error) {
          console.error('Failed to update click status in real-time:', error);
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthReady, user]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkGmailStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectGmail = async () => {
    try {
      const response = await fetch('/api/auth/google/url');
      const { url } = await response.json();
      window.open(url, 'google_oauth', 'width=600,height=700');
    } catch (error) {
      console.error('Failed to get Google Auth URL:', error);
    }
  };

  const handleSendGmail = async () => {
    if (!selectedLead || !outreachScript || !outreachSubject) return;
    if (!isGmailConnected) {
      handleConnectGmail();
      return;
    }

    setIsSendingEmail(true);
    try {
      const response = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedLead.email,
          subject: outreachSubject,
          body: outreachScript,
          leadId: selectedLead.id,
          isInternational: !selectedLead.address?.toLowerCase().includes('nigeria')
        })
      });

      if (response.ok) {
        await updateDoc(doc(db, 'leads', selectedLead.id), {
          status: 'Outreach Sent',
          deliveredAt: new Date().toISOString()
        });
        await addActivityLog(selectedLead.id, 'Outreach', `Email sent: ${outreachSubject}`);
        setOutreachScript(null);
        setOutreachSubject(null);
        toast.success('Email sent successfully!');
      } else {
        const data = await response.json();
        if (response.status === 401) {
          setIsGmailConnected(false);
          handleConnectGmail();
        } else {
          toast.error(`Failed to send email: ${data.error}`);
        }
      }
    } catch (error) {
      console.error('Failed to send email:', error);
      toast.error('An error occurred while sending the email.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleGenerateFollowUp = async (lead: Lead) => {
    setIsGeneratingFollowUp(true);
    try {
      const { subject, body } = await generateFollowUp(lead);
      await updateDoc(doc(db, 'leads', lead.id), {
        followUpScript: body,
        outreachSubject: subject // Reuse subject or add followUpSubject
      });
      await addActivityLog(lead.id, 'Outreach', 'Personalized follow-up script generated.');
      toast.success('Follow-up script generated!');
    } catch (error) {
      console.error("Follow-up generation failed", error);
      toast.error('Failed to generate follow-up script.');
    } finally {
      setIsGeneratingFollowUp(false);
    }
  };

  const handleScheduleFollowUp = async (leadId: string, date: string) => {
    if (!date) return;
    setIsSchedulingFollowUp(true);
    try {
      await updateDoc(doc(db, 'leads', leadId), {
        followUpDate: date
      });
      await addActivityLog(leadId, 'Outreach', `Follow-up scheduled for ${date}`);
      toast.success(`Follow-up scheduled for ${date}`);
      setFollowUpDate('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${leadId}`);
    } finally {
      setIsSchedulingFollowUp(false);
    }
  };

  const [isFocusMode, setIsFocusMode] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [analyzingCount, setAnalyzingCount] = useState(0);
  const isAnalyzing = analyzingCount > 0;
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [selectedNicheOption, setSelectedNicheOption] = useState(NICHES[0]);
  const [discoveryNiche, setDiscoveryNiche] = useState(NICHES[0]);
  const [discoveryCity, setDiscoveryCity] = useState('Lagos');
  const [discoveryCount, setDiscoveryCount] = useState(5);
  const [excludeUnverified, setExcludeUnverified] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);
  const [isEditingLead, setIsEditingLead] = useState(false);

  const handleLogoutGmail = async () => {
    try {
      await fetch('/api/auth/google/logout', { method: 'POST' });
      setIsGmailConnected(false);
    } catch (error) {
      console.error('Failed to logout from Gmail:', error);
    }
  };
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leads' | 'settings' | 'crm' | 'outreach' | 'responses'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [crmFilterStatus, setCrmFilterStatus] = useState<string>('All');
  const [crmSortBy, setCrmSortBy] = useState<'score' | 'date' | 'name'>('score');

  const selectedLead = useMemo(() => 
    leads.find(l => l.id === selectedLeadId), 
    [leads, selectedLeadId]
  );

  const filteredLeads = useMemo(() => 
    leads.filter(l => 
      l.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.websiteUrl.toLowerCase().includes(searchQuery.toLowerCase())
    ),
    [leads, searchQuery]
  );

  const isNewLead = (lead: Lead) => {
    if (!lead.createdAt) return false;
    const createdAt = new Date(lead.createdAt).getTime();
    const now = new Date().getTime();
    return (now - createdAt) < 24 * 60 * 60 * 1000;
  };

  const crmLeads = useMemo(() => {
    let result = leads;
    if (crmFilterStatus === 'New (24h)') {
      result = result.filter(l => isNewLead(l));
    } else if (crmFilterStatus !== 'All') {
      result = result.filter(l => l.status === crmFilterStatus);
    }
    
    return [...result].sort((a, b) => {
      if (crmSortBy === 'score') return (b.score || 0) - (a.score || 0);
      if (crmSortBy === 'date') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return a.companyName.localeCompare(b.companyName);
    });
  }, [leads, crmFilterStatus, crmSortBy]);

  const stats = useMemo(() => ({
    total: leads.length,
    scored: leads.filter(l => l.status !== 'New').length,
    highIntent: leads.filter(l => l.score > 80).length,
    outreachSent: leads.filter(l => l.status === 'Outreach Sent').length,
    verified: leads.filter(l => l.emailStatus === 'verified' && l.phone).length,
  }), [leads]);

  const verifyLeadEmail = async (leadId: string, email: string) => {
    if (!email || !email.includes('@')) return;
    
    try {
      const response = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      if (response.ok) {
        const data = await response.json();
        const status = data.status as 'verified' | 'unverified' | 'unknown';
        
        await updateDoc(doc(db, 'leads', leadId), {
          emailStatus: status
        });
        
        return status;
      }
    } catch (error) {
      console.error("Email verification failed", error);
    }
    return 'unknown';
  };

  const handleAddLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please login to add leads.");
      return;
    }
    const formData = new FormData(e.currentTarget);
    const leadId = Math.random().toString(36).substr(2, 9);
    const newLead: Omit<Lead, 'id'> = {
      companyName: formData.get('companyName') as string,
      websiteUrl: formData.get('websiteUrl') as string,
      contactName: formData.get('contactName') as string,
      email: formData.get('email') as string,
      emailStatus: 'unknown',
      status: 'New',
      score: 0,
      priority: 'None',
      websiteStatus: 'none',
      painPoints: [],
      lastActionDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString().split('T')[0],
      uid: user.uid
    };
    
    try {
      await setDoc(doc(db, 'leads', leadId), newLead);
      setIsAddingLead(false);
      toast.success('Lead added successfully!');
      
      // Trigger email verification
      if (newLead.email) {
        verifyLeadEmail(leadId, newLead.email);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `leads/${leadId}`);
    }
  };

  const handleAnalyze = async (lead: Lead) => {
    setAnalyzingCount(prev => prev + 1);
    try {
      // Trigger email verification if unknown and exists
      if (lead.email && (!lead.emailStatus || lead.emailStatus === 'unknown')) {
        verifyLeadEmail(lead.id, lead.email);
      }
      
      const analysis = await analyzeWebsite(lead.websiteUrl, lead.companyName);
      
      const techScore = (Object.values(analysis.technical) as number[]).reduce((a, b) => a + b, 0) / 5;
      const businessScore = (Object.values(analysis.business) as number[]).reduce((a, b) => a + b, 0) / 5;
      const seoScore = (Object.values(analysis.seo) as number[]).reduce((a, b) => a + b, 0) / 4;
      const designScore = (Object.values(analysis.design) as number[]).reduce((a, b) => a + b, 0) / 5;
      
      const finalScore = Math.round(
        (techScore * 0.30) + 
        (businessScore * 0.30) + 
        (seoScore * 0.25) + 
        (designScore * 0.15)
      );

      let priority: Lead['priority'] = 'Cold';
      if (finalScore >= 70) priority = 'Hot';
      else if (finalScore >= 40) priority = 'Warm';

      const finalWebsiteUrl = ((analysis as any).websiteUrl && (analysis as any).websiteUrl !== 'none') ? (analysis as any).websiteUrl : lead.websiteUrl;
      let websiteStatus: Lead['websiteStatus'] = 'good';
      if (!finalWebsiteUrl || finalWebsiteUrl === 'none') websiteStatus = 'none';
      else if (finalScore >= 40) websiteStatus = 'poor';

      await updateDoc(doc(db, 'leads', lead.id), {
        status: 'Scored',
        score: finalScore,
        priority,
        websiteStatus,
        isVerifiedNoWebsite: !!(analysis as any).isVerifiedNoWebsite,
        analysis,
        painPoints: analysis.recommendations.slice(0, 3),
        email: (analysis as any).email || lead.email,
        emailStatus: (analysis as any).emailStatus || lead.emailStatus,
        websiteUrl: finalWebsiteUrl
      });
      
      await addActivityLog(lead.id, 'Analysis', `AI analysis completed. Score: ${finalScore}`);
      toast.success('Analysis completed!');
    } catch (error) {
      console.error("Analysis failed", error);
      toast.error('Analysis failed. Please try again.');
    } finally {
      setAnalyzingCount(prev => Math.max(0, prev - 1));
    }
  };

  const reVerifyLeads = async () => {
    const unverifiedLeads = leads.filter(l => l.websiteStatus === 'NO WEBSITE' && !l.isVerifiedNoWebsite);
    if (unverifiedLeads.length === 0) {
      toast.info('No unverified leads without websites found.');
      return;
    }

    toast.info(`Re-verifying ${unverifiedLeads.length} leads...`);
    
    // Process in chunks to avoid hitting rate limits
    const CHUNK_SIZE = 3;
    for (let i = 0; i < unverifiedLeads.length; i += CHUNK_SIZE) {
      const chunk = unverifiedLeads.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(l => handleAnalyze(l)));
    }
    
    toast.success('Re-verification complete!');
  };

  const checkRepliesManually = async () => {
    if (!isGmailConnected) {
      toast.error('Connect Gmail first');
      return;
    }
    toast.info('Checking for new replies...');
    await pollTrackingStatus();
    toast.success('Reply check complete');
  };

  const handleDiscover = async () => {
    if (!user) {
      toast.error("Please log in to discover leads.");
      return;
    }
    if (!discoveryNiche.trim()) {
      toast.error("Please enter a niche to discover leads.");
      return;
    }
    if (!discoveryCity.trim()) {
      toast.error("Please enter a city to discover leads.");
      return;
    }
    setIsDiscovering(true);
    toast.info(`Discovering and verifying high-intent leads in ${discoveryCity}...`);
    try {
      let latLng: { latitude: number, longitude: number } | undefined;
      
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject);
          });
          latLng = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
        } catch (e) {
          console.warn("Geolocation failed", e);
        }
      }

      const searchCount = excludeUnverified ? discoveryCount * 3 : discoveryCount;
      const discovered = await discoverLeads(discoveryNiche, discoveryCity, searchCount, latLng);
      
      if (!discovered || discovered.length === 0) {
        toast.info("No leads were found for this niche and city. Try adjusting your search criteria.");
        return;
      }

      let newLeads: Omit<Lead, 'id'>[] = discovered.map(d => ({
        companyName: d.companyName || 'Unknown',
        websiteUrl: d.websiteUrl || 'none',
        contactName: 'Business Owner',
        jobTitle: d.jobTitle || '',
        socialMedia: d.socialMedia || {},
        email: d.email || '',
        emailStatus: d.emailStatus || 'unknown',
        phone: d.phone || '',
        address: d.address || '',
        status: 'New',
        score: 0,
        priority: 'None',
        websiteStatus: d.websiteStatus || (d.websiteUrl && d.websiteUrl !== 'none' ? 'poor' : 'none'),
        isVerifiedNoWebsite: !!d.isVerifiedNoWebsite,
        painPoints: d.painPoints || [],
        lastActionDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString().split('T')[0],
        mapsUrl: d.mapsUrl || '',
        reviewSnippets: d.reviewSnippets || [],
        uid: user!.uid
      }));

      // If excludeUnverified is checked, we MUST have both email and phone
      if (excludeUnverified) {
        newLeads = newLeads.filter(l => l.email && l.phone);
      }

      // Verify emails for discovered leads
      const verifiedLeads = await Promise.all(newLeads.map(async (lead) => {
        if (lead.email) {
          try {
            const response = await fetch('/api/verify-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: lead.email })
            });
            if (response.ok) {
              const data = await response.json();
              return { ...lead, emailStatus: data.status as 'verified' | 'unverified' | 'unknown' };
            }
          } catch (e) {
            console.warn("Email verification failed during discovery", e);
          }
        }
        return lead;
      }));

      let finalLeads = verifiedLeads;
      if (excludeUnverified) {
        // Strict filter: must be verified
        finalLeads = finalLeads.filter(l => l.emailStatus === 'verified');
      }

      finalLeads = finalLeads.slice(0, discoveryCount);

      // Add to Firestore
      for (const leadData of finalLeads) {
        const leadId = Math.random().toString(36).substr(2, 9);
        await setDoc(doc(db, 'leads', leadId), leadData);
        
        if (autoAnalyze) {
          handleAnalyze({ id: leadId, ...leadData } as Lead);
        }
      }
      
      toast.success(`Discovered ${newLeads.length} leads!`);
    } catch (error) {
      console.error("Discovery failed", error);
      toast.error(`Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const [outreachScript, setOutreachScript] = useState<string | null>(null);
  const [outreachSubject, setOutreachSubject] = useState<string | null>(null);
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [isGeneratingRelume, setIsGeneratingRelume] = useState(false);

  const handleGenerateOutreach = async (lead: Lead) => {
    setIsGeneratingOutreach(true);
    try {
      const { subject, body } = await generateOutreach(lead);
      setOutreachScript(body);
      setOutreachSubject(subject);
      
      await updateDoc(doc(db, 'leads', lead.id), {
        outreachMessage: body,
        outreachSubject: subject,
        status: 'Outreach Sent'
      });
      
      await addActivityLog(lead.id, 'Outreach', 'Personalized outreach script generated.');
      toast.success('Outreach script generated!');
    } catch (error) {
      console.error("Outreach generation failed", error);
      toast.error('Failed to generate outreach script.');
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  const handleGenerateRelume = async (lead: Lead) => {
    setIsGeneratingRelume(true);
    try {
      const url = await generateRelumeUrl(lead);
      await updateDoc(doc(db, 'leads', lead.id), { relumeUrl: url });
    } catch (error) {
      console.error("Relume generation failed", error);
    } finally {
      setIsGeneratingRelume(false);
    }
  };

  const handleUpdateLead = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLead) return;
    
    const formData = new FormData(e.currentTarget);
    const websiteUrl = formData.get('websiteUrl') as string;
    const email = formData.get('email') as string;
    
    try {
      await updateDoc(doc(db, 'leads', selectedLead.id), {
        websiteUrl,
        email,
        status: selectedLead.websiteUrl !== websiteUrl ? 'New' : selectedLead.status
      });
      setIsEditingLead(false);
      toast.success('Lead updated!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${selectedLead.id}`);
    }
  };

  const handleDeleteLead = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'leads', id));
      if (selectedLeadId === id) {
        setSelectedLeadId(null);
        setOutreachScript(null);
      }
      setLeadToDelete(null);
      toast.success('Lead deleted successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `leads/${id}`);
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Company Name', 'Website', 'Contact', 'Email', 'Status', 'Score', 'Priority', 'Created At'];
    const rows = leads.map(l => [
      l.id,
      l.companyName,
      l.websiteUrl,
      l.contactName,
      l.email,
      l.status,
      l.score,
      l.priority,
      l.createdAt
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `looper_leads_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Leads exported to CSV');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1A1A1A] font-sans selection:bg-[#FF6321] selection:text-white">
      {/* Sidebar Navigation */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[45] lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.nav 
        className={cn(
          "fixed left-0 top-0 h-full w-64 bg-white border-r border-[#E5E5E5] flex flex-col py-8 z-50 transition-transform duration-300",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isFocusMode && "lg:-translate-x-full"
        )}
      >
        <div className="px-8 mb-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center shadow-lg shadow-black/10">
              <Zap className="text-white w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight">Looper AI</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 hover:bg-[#F5F5F4] rounded-full lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex flex-col gap-2 px-4 flex-1">
          <NavItem 
            icon={<LayoutDashboard />} 
            label="Dashboard"
            active={activeTab === 'dashboard'} 
            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} 
          />
          <NavItem 
            icon={<Users />} 
            label="Leads"
            active={activeTab === 'leads'} 
            onClick={() => { setActiveTab('leads'); setIsMobileMenuOpen(false); }} 
          />
          <NavItem 
            icon={<Mail />} 
            label="Outreach"
            active={activeTab === 'outreach'} 
            onClick={() => { setActiveTab('outreach'); setIsMobileMenuOpen(false); }} 
          />
          <NavItem 
            icon={<MessageSquare />} 
            label="Responses"
            active={activeTab === 'responses'} 
            onClick={() => { setActiveTab('responses'); setIsMobileMenuOpen(false); }} 
          />
          <NavItem 
            icon={<BarChart3 />} 
            label="CRM"
            active={activeTab === 'crm'} 
            onClick={() => { setActiveTab('crm'); setIsMobileMenuOpen(false); }} 
          />
        </div>

        <div className="px-4 mt-auto">
          <NavItem 
            icon={<Settings />} 
            label="Settings"
            active={activeTab === 'settings'} 
            onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }} 
          />
          {user && (
            <div className="mt-6 p-4 bg-[#F5F5F4] rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 bg-[#1A1A1A] rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{user.email?.split('@')[0]}</p>
                <button onClick={() => signOut(auth)} className="text-[10px] text-[#9E9E9E] hover:text-red-600 font-medium transition-colors">Sign Out</button>
              </div>
            </div>
          )}
        </div>
      </motion.nav>

      {/* Main Content Area */}
      <main className={cn(
        "transition-all duration-500 min-h-screen",
        isFocusMode ? "pl-0" : "lg:pl-64"
      )}>
        {/* Header */}
        <header className="sticky top-0 bg-[#F5F5F4]/80 backdrop-blur-md border-b border-[#E5E5E5]/50 px-4 md:px-12 py-4 md:py-6 flex items-center justify-between z-40">
          <div className="flex items-center gap-3 md:gap-6 flex-1">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-[#E5E5E5] rounded-xl lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsFocusMode(!isFocusMode)}
              className="hidden lg:flex p-2 bg-white rounded-xl border border-[#E5E5E5] hover:bg-[#F5F5F4] transition-all shadow-sm"
              title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
            >
              {isFocusMode ? <ChevronRight className="w-5 h-5" /> : <X className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2 md:gap-4 bg-white px-3 md:px-6 py-2 md:py-3 rounded-2xl border border-[#E5E5E5] w-full max-w-xl shadow-sm focus-within:ring-2 focus-within:ring-[#FF6321]/20 transition-all">
              <Search className="w-4 h-4 md:w-5 md:h-5 text-[#9E9E9E]" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="bg-transparent border-none outline-none w-full text-xs md:text-sm font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsAddingLead(true)}
              className="bg-[#1A1A1A] text-white px-4 md:px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-[#333] transition-all shadow-lg shadow-black/10 active:scale-95"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Lead</span>
            </button>
          </div>
        </header>

        <div className="p-4 md:p-12 max-w-[1600px] mx-auto">
          {activeTab === 'responses' && (
            <ResponseDashboard 
              leads={leads} 
              isGmailConnected={isGmailConnected}
              handleConnectGmail={handleConnectGmail}
              onDraftFollowUp={async (leadId, replyId) => {
                try {
                  const response = await fetch('/api/leads/generate-draft', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId, replyId })
                  });
                  if (response.ok) {
                    const data = await response.json();
                    if (!data.draft) throw new Error('No draft returned in response');
                    
                    const { draft, subject } = data;
                    const targetLead = leads.find(l => l.id === leadId);
                    if (targetLead && draft) {
                      const updatedReplies = (targetLead.replies || []).map((r: any) => 
                        (r.id === replyId || r.messageId === replyId) ? { ...r, followUpDraft: draft, followUpSubject: subject } : r
                      );
                      await updateDoc(doc(db, 'leads', leadId), {
                        replies: updatedReplies
                      });
                      toast.success('Follow-up draft generated!');
                    }
                  } else {
                    const errData = await response.json().catch(() => ({ error: 'Unknown API error' }));
                    toast.error(`Failed to generate draft: ${errData.error || response.statusText}`);
                  }
                } catch (e: any) {
                  toast.error('Error generating draft: ' + e.message);
                }
              }}
              onSendResponse={async (lead, replyId, subject, body, threadId, originalMessageId) => {
                if (!isGmailConnected) {
                  handleConnectGmail();
                  return;
                }
                setIsSendingEmail(true);
                try {
                  const extractEmailAddress = (str: string | undefined | null): string | null => {
                    if (!str) return null;
                    const match = str.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                    return match ? match[0].trim() : null;
                  };

                  const reply = lead.replies?.find((r: any) => r.id === replyId || r.messageId === replyId);
                  let recipientEmail = extractEmailAddress(lead.email);
                  
                  if (!recipientEmail && reply && (reply as any).fromEmail) {
                    recipientEmail = extractEmailAddress((reply as any).fromEmail);
                  }

                  if (!recipientEmail && reply && reply.from) {
                    recipientEmail = extractEmailAddress(reply.from);
                  }
                  
                  if (!recipientEmail && lead.replies) {
                    for (const r of lead.replies) {
                      const foundAddress = extractEmailAddress((r as any).fromEmail) || extractEmailAddress((r as any).from);
                      if (foundAddress) {
                        recipientEmail = foundAddress;
                        break;
                      }
                    }
                  }

                  // Delegate resolution to the backend server's robust fallback if we cannot determine it locally.
                  const response = await fetch('/api/gmail/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      to: recipientEmail || lead.email || '',
                      subject,
                      body,
                      leadId: lead.id,
                      isInternational: !lead.address?.toLowerCase()?.includes('nigeria'),
                      threadId,
                      originalMessageId
                    })
                  });

                  if (response.ok) {
                    const updatedReplies = (lead.replies || []).map((r: any) => 
                      (r.id === replyId || r.messageId === replyId) ? { ...r, sent: true, sentAt: new Date().toISOString() } : r
                    );
                    const updatePayload: any = {
                      replies: updatedReplies,
                      lastActionDate: new Date().toISOString().split('T')[0]
                    };
                    if (!lead.email && recipientEmail) {
                      updatePayload.email = recipientEmail;
                    }
                    await updateDoc(doc(db, 'leads', lead.id), updatePayload);
                    await addActivityLog(lead.id, 'Outreach', `Reply follow-up sent: ${subject}`);
                    toast.success('Reply sent successfully!');
                  } else {
                    const data = await response.json();
                    toast.error(`Failed to send reply: ${data.error}`);
                  }
                } catch (error) {
                  console.error('Failed to send reply:', error);
                  toast.error('An error occurred while sending the reply.');
                } finally {
                  setIsSendingEmail(false);
                }
              }}
            />
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-12">
              {/* Bento Grid Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                {/* Main Stats - Bento Style */}
                <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <StatCard 
                    label="Total Leads" 
                    value={stats.total} 
                    icon={<Users className="w-6 h-6" />} 
                    trend="+12% from last week"
                    color="blue"
                  />
                  <StatCard 
                    label="High Intent" 
                    value={stats.highIntent} 
                    icon={<Zap className="w-6 h-6" />} 
                    trend="+5% from last week"
                    color="orange"
                  />
                  <StatCard 
                    label="Outreach Sent" 
                    value={stats.outreachSent} 
                    icon={<Mail className="w-6 h-6" />} 
                    trend="+18% from last week"
                    color="purple"
                  />
                  <StatCard 
                    label="Verified Contacts" 
                    value={stats.verified} 
                    icon={<CheckCircle2 className="w-6 h-6" />} 
                    trend="+8% from last week"
                    color="green"
                  />
                </div>

                {/* Lead Discovery Widget - Bento Style */}
                <div className="md:col-span-4 bg-[#1A1A1A] text-white rounded-[2.5rem] p-8 border border-[#333] shadow-2xl relative overflow-hidden flex flex-col justify-between group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6321] blur-[120px] opacity-20 -mr-32 -mt-32 group-hover:opacity-30 transition-opacity" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="p-3 bg-[#FF6321] rounded-2xl shadow-lg shadow-[#FF6321]/20">
                        <Globe className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold tracking-tight">Discovery Engine</h2>
                        <p className="text-sm text-white/50">Find high-intent prospects</p>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <button 
                          onClick={reVerifyLeads}
                          className="p-2 text-white/40 hover:text-[#FF6321] hover:bg-white/5 rounded-xl transition-all"
                          title="Re-verify leads without websites"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={checkRepliesManually}
                          className="p-2 text-white/40 hover:text-green-400 hover:bg-white/5 rounded-xl transition-all"
                          title="Check for new replies"
                        >
                          <Mail className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">Niche</label>
                          <select 
                            value={selectedNicheOption}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSelectedNicheOption(val);
                              if (val !== 'Other') setDiscoveryNiche(val);
                              else setDiscoveryNiche('');
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF6321] outline-none transition-all text-white appearance-none"
                          >
                            {NICHES.map(niche => (
                              <option key={niche} value={niche} className="bg-[#1A1A1A]">{niche}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-white/40 ml-1">City</label>
                          <input 
                            type="text" 
                            value={discoveryCity}
                            onChange={(e) => setDiscoveryCity(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF6321] outline-none transition-all placeholder:text-white/20"
                            placeholder="e.g. Lagos"
                          />
                        </div>
                      </div>

                      <button 
                        onClick={handleDiscover}
                        disabled={isDiscovering}
                        className="w-full bg-[#FF6321] text-white py-4 rounded-2xl font-bold hover:bg-[#E55A1E] transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-[#FF6321]/20 active:scale-95"
                      >
                        {isDiscovering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        {isDiscovering ? 'Searching...' : 'Discover Leads'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* High Intent Leads List */}
                <div className="lg:col-span-8 bg-white rounded-[2.5rem] p-10 border border-[#E5E5E5] shadow-sm">
                  <div className="flex items-center justify-between mb-10">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">High Intent Leads</h2>
                      <p className="text-sm text-[#9E9E9E]">Top prospects based on AI analysis</p>
                    </div>
                    <button onClick={() => setActiveTab('leads')} className="px-6 py-2 bg-[#F5F5F4] rounded-full text-sm font-bold text-[#1A1A1A] hover:bg-[#E5E5E5] transition-all flex items-center gap-2">
                      View all <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {leads.filter(l => l.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map(lead => (
                      <div key={lead.id} className="group flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-6 rounded-3xl hover:bg-[#F5F5F4] transition-all cursor-pointer border border-transparent hover:border-[#E5E5E5] gap-4" onClick={() => { setSelectedLeadId(lead.id); setActiveTab('leads'); setNoteText(''); }}>
                        <div className="flex items-center gap-4 md:gap-6">
                          <div className={cn(
                            "w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center text-lg md:text-xl font-black shadow-sm flex-shrink-0",
                            lead.priority === 'Hot' ? "bg-red-50 text-red-600" : 
                            lead.priority === 'Warm' ? "bg-orange-50 text-orange-600" : "bg-blue-50 text-blue-600"
                          )}>
                            {lead.score}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-base md:text-lg truncate">{lead.companyName}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {isNewLead(lead) && (
                                <span className="text-[8px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full font-black tracking-wider uppercase whitespace-nowrap bg-green-100 text-green-700">
                                  NEW
                                </span>
                              )}
                              <p className="text-xs md:text-sm text-[#9E9E9E] font-medium truncate max-w-[150px] md:max-w-[200px]">{lead.websiteUrl}</p>
                              {lead.websiteStatus === 'none' && (
                                <span className={cn(
                                  "text-[8px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full font-black tracking-wider uppercase whitespace-nowrap",
                                  lead.isVerifiedNoWebsite ? "bg-gray-100 text-gray-600" : "bg-red-50 text-red-600"
                                )}>
                                  {lead.isVerifiedNoWebsite ? "Verified No Website" : "No Website"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-4 md:gap-8">
                          <div className="text-left sm:text-right">
                            <p className="text-xs md:text-sm font-bold text-[#1A1A1A]">{lead.status}</p>
                            <p className="text-[10px] md:text-xs text-[#9E9E9E] font-medium">{lead.lastActionDate}</p>
                          </div>
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#F5F5F4] flex items-center justify-center group-hover:bg-[#1A1A1A] group-hover:text-white transition-all flex-shrink-0">
                            <ArrowUpRight className="w-4 h-4 md:w-5 md:h-5" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Actions / System Health */}
                <div className="lg:col-span-4 space-y-8">
                  <div className="bg-white rounded-[2.5rem] p-8 border border-[#E5E5E5] shadow-sm">
                    <h3 className="text-lg font-bold mb-6">System Status</h3>
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-sm font-bold">AI Analysis Engine</span>
                        </div>
                        <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded-full">ACTIVE</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-sm font-bold">Gmail Integration</span>
                        </div>
                        <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded-full">CONNECTED</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="text-sm font-bold">Google Maps API</span>
                        </div>
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-full">OPTIMAL</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-[#FF6321] to-[#E55A1E] rounded-[2.5rem] p-8 text-white shadow-xl shadow-[#FF6321]/20">
                    <h3 className="text-lg font-bold mb-2">Pro Tip</h3>
                    <p className="text-sm text-white/80 leading-relaxed font-medium">
                      Leads with "Verified No Website" have a 40% higher conversion rate for web design services.
                    </p>
                    <button className="mt-6 w-full bg-white text-[#FF6321] py-3 rounded-2xl font-bold text-sm hover:bg-white/90 transition-all active:scale-95">
                      Learn Outreach Strategy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'leads' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Lead List */}
              <div className={cn(
                "bg-white rounded-3xl border border-[#E5E5E5] shadow-sm overflow-hidden transition-all duration-500",
                selectedLeadId ? "lg:col-span-4" : "lg:col-span-12"
              )}>
                <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
                  <h2 className="font-semibold">All Leads</h2>
                  <span className="text-xs font-medium px-2 py-1 bg-[#F5F5F4] rounded-md text-[#9E9E9E]">
                    {filteredLeads.length} Total
                  </span>
                </div>
                <div className="divide-y divide-[#E5E5E5]">
                  {filteredLeads.map(lead => (
                    <div 
                      key={lead.id} 
                      onClick={() => { setSelectedLeadId(lead.id); setOutreachScript(null); setNoteText(''); }}
                      className={cn(
                        "p-6 cursor-pointer transition-all hover:bg-[#F5F5F4]",
                        selectedLeadId === lead.id && "bg-[#F5F5F4] border-l-4 border-l-[#1A1A1A]"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 truncate pr-4">
                          <h3 className="font-medium truncate">{lead.companyName}</h3>
                          {isNewLead(lead) && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-green-100 text-green-700">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {lead.websiteStatus === 'none' && (
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5",
                              lead.isVerifiedNoWebsite ? "bg-gray-100 text-gray-700" : "bg-red-100 text-red-700"
                            )}>
                              <AlertCircle className="w-2.5 h-2.5" /> 
                              {lead.isVerifiedNoWebsite ? "VERIFIED NO WEBSITE" : "NO WEBSITE"}
                            </span>
                          )}
                          {lead.websiteStatus === 'poor' && (
                            <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                              <AlertCircle className="w-2.5 h-2.5" /> POOR WEBSITE
                            </span>
                          )}
                          {lead.score > 0 && (
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-full",
                              lead.priority === 'Hot' ? "bg-red-100 text-red-700" : 
                              lead.priority === 'Warm' ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {lead.score}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-[#9E9E9E]">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {lead.websiteUrl.replace('https://', '')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {lead.lastActionDate}
                          </span>
                          {lead.isOpened && (
                            <span className="flex items-center gap-1 text-green-600 font-bold">
                              <Mail className="w-3 h-3" /> Opened
                            </span>
                          )}
                        </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setLeadToDelete(lead.id);
                            }}
                            className="p-1.5 text-[#9E9E9E] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete Lead"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lead Details */}
              <AnimatePresence mode="wait">
                {selectedLeadId && selectedLead && (
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="lg:col-span-8 space-y-8"
                  >
                    <div className="bg-white rounded-3xl border border-[#E5E5E5] shadow-sm p-4 md:p-8">
                      <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-6">
                        <div>
                          <div className="flex flex-wrap items-center gap-3 mb-2">
                            <h2 className="text-xl md:text-2xl font-bold">{selectedLead.companyName}</h2>
                            <span className="px-2 md:px-3 py-1 bg-[#F5F5F4] rounded-full text-[10px] md:text-xs font-medium">
                              {selectedLead.status}
                            </span>
                            {selectedLead.websiteStatus === 'none' && (
                              <span className={cn(
                                "px-2 md:px-3 py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1",
                                selectedLead.isVerifiedNoWebsite ? "bg-gray-100 text-gray-700" : "bg-red-100 text-red-700"
                              )}>
                                <AlertCircle className="w-3 h-3" /> 
                                {selectedLead.isVerifiedNoWebsite ? "Verified No Website" : "No Website"}
                              </span>
                            )}
                            {selectedLead.websiteStatus === 'poor' && (
                              <span className="px-2 md:px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Poor Website
                              </span>
                            )}
                            {selectedLead.isOpened && (
                              <span className="px-2 md:px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-1">
                                <Mail className="w-3 h-3" /> Opened {new Date(selectedLead.openedAt!).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-[#9E9E9E] text-sm md:text-base flex items-center flex-wrap gap-2">
                            {selectedLead.contactName} {selectedLead.jobTitle && `(${selectedLead.jobTitle})`} • {selectedLead.email || 'No email found'}
                            {selectedLead.email && (
                              <>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-green-100">
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                  Verified Source
                                </span>
                                {selectedLead.emailStatus === 'verified' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-blue-100">
                                    <Shield className="w-2.5 h-2.5" />
                                    Email Verified
                                  </span>
                                )}
                                {selectedLead.emailStatus === 'unverified' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-red-100">
                                    <AlertCircle className="w-2.5 h-2.5" />
                                    Unverified Email
                                  </span>
                                )}
                              </>
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 md:gap-4 mt-2">
                            {selectedLead.phone && (
                              <div className="flex items-center gap-2 text-xs text-[#1A1A1A]">
                                <Smartphone className="w-3 h-3" />
                                {selectedLead.phone}
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-bold uppercase tracking-wider rounded-full border border-blue-100">
                                  <CheckCircle2 className="w-2 h-2" />
                                  Verified Phone
                                </span>
                              </div>
                            )}
                            {selectedLead.mapsUrl && (
                              <a 
                                href={selectedLead.mapsUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              >
                                <Globe className="w-3 h-3" />
                                View on Google Maps
                              </a>
                            )}
                            {selectedLead.socialMedia && Object.entries(selectedLead.socialMedia).map(([platform, url]) => (
                              url && (
                                <a 
                                  key={platform}
                                  href={url as string} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-xs text-[#9E9E9E] hover:text-[#1A1A1A] transition-colors flex items-center gap-1 capitalize"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {platform}
                                </a>
                              )
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={pollTrackingStatus}
                            disabled={isPolling}
                            title="Refresh Engagement Status"
                            className="p-2 bg-[#F5F5F4] rounded-xl hover:bg-[#E5E5E5] transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={`w-5 h-5 ${isPolling ? 'animate-spin' : ''}`} />
                          </button>
                          <button 
                            onClick={() => setIsEditingLead(true)}
                            title="Edit Lead"
                            className="p-2 bg-[#F5F5F4] rounded-xl hover:bg-[#E5E5E5] transition-colors"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => handleAnalyze(selectedLead)}
                            disabled={isAnalyzing}
                            title="Run AI Analysis"
                            className="p-2 bg-[#F5F5F4] rounded-xl hover:bg-[#E5E5E5] transition-colors disabled:opacity-50"
                          >
                            {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                          </button>
                          <button 
                            onClick={() => handleGenerateOutreach(selectedLead)}
                            disabled={!selectedLead.analysis || isGeneratingOutreach}
                            title="Generate Outreach"
                            className="p-2 bg-[#F5F5F4] rounded-xl hover:bg-[#E5E5E5] transition-colors disabled:opacity-50"
                          >
                            {isGeneratingOutreach ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                          </button>
                          <button 
                            onClick={() => handleGenerateRelume(selectedLead)}
                            disabled={isGeneratingRelume}
                            title="Generate Relume Demo"
                            className="p-2 bg-[#F5F5F4] rounded-xl hover:bg-[#E5E5E5] transition-colors disabled:opacity-50"
                          >
                            {isGeneratingRelume ? <Loader2 className="w-5 h-5 animate-spin" /> : <ExternalLink className="w-5 h-5" />}
                          </button>
                          <button 
                            onClick={() => setLeadToDelete(selectedLead.id)}
                            title="Delete Lead"
                            className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => setSelectedLeadId(null)}
                            className="p-2 bg-[#F5F5F4] rounded-xl hover:bg-[#E5E5E5] transition-colors"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {isEditingLead ? (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-[#F5F5F4] p-8 rounded-3xl mb-8"
                        >
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-lg">Update Lead Details</h3>
                            <button onClick={() => setIsEditingLead(false)} className="p-2 hover:bg-[#E5E5E5] rounded-full">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <form onSubmit={handleUpdateLead} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <Input 
                                label="Website URL" 
                                name="websiteUrl" 
                                defaultValue={selectedLead.websiteUrl} 
                                placeholder="https://example.com"
                                required 
                              />
                              <Input 
                                label="Email Address" 
                                name="email" 
                                type="email"
                                defaultValue={selectedLead.email} 
                                placeholder="contact@example.com"
                              />
                            </div>
                            <div className="flex gap-4">
                              <button 
                                type="submit" 
                                className="flex-1 bg-[#1A1A1A] text-white py-3 rounded-2xl font-bold hover:bg-[#333] transition-all"
                              >
                                Save Changes
                              </button>
                              <button 
                                type="button"
                                onClick={() => setIsEditingLead(false)}
                                className="px-8 bg-white border border-[#E5E5E5] py-3 rounded-2xl font-bold hover:bg-gray-50 transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </motion.div>
                      ) : outreachScript ? (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-[#1A1A1A] text-white p-8 rounded-3xl relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-4">
                            <button 
                              onClick={() => {
                                setOutreachScript(null);
                                setOutreachSubject(null);
                              }}
                              className="text-white/50 hover:text-white transition-colors"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                          <h3 className="text-sm font-semibold uppercase tracking-widest text-white/50 mb-6">Personalized Outreach Editor</h3>
                          
                          <div className="space-y-6">
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-widest text-white/30 ml-1">Subject Line</label>
                              <input 
                                type="text"
                                value={outreachSubject || ''}
                                onChange={(e) => setOutreachSubject(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-lg font-medium focus:ring-2 focus:ring-[#FF6321] outline-none transition-all"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-widest text-white/30 ml-1">Email Body</label>
                              <textarea 
                                value={outreachScript || ''}
                                onChange={(e) => setOutreachScript(e.target.value)}
                                rows={12}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-lg leading-relaxed focus:ring-2 focus:ring-[#FF6321] outline-none transition-all resize-none"
                              />
                            </div>
                          </div>

                          <div className="mt-8 flex gap-4">
                            <button 
                              onClick={() => {
                                navigator.clipboard.writeText(`Subject: ${outreachSubject}\n\n${outreachScript}`);
                              }}
                              className="bg-white text-[#1A1A1A] px-6 py-2 rounded-full text-sm font-bold hover:bg-white/90 transition-all"
                            >
                              Copy to Clipboard
                            </button>
                            <button 
                              onClick={handleSendGmail}
                              disabled={isSendingEmail}
                              className="bg-[#FF6321] text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-[#FF6321]/90 transition-all flex items-center gap-2"
                            >
                              {isSendingEmail ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Mail className="w-4 h-4" />
                              )}
                              {isGmailConnected ? 'Send via Gmail' : 'Connect Gmail'}
                            </button>
                          </div>
                        </motion.div>
                      ) : selectedLead.analysis ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div>
                            <h3 className="text-sm font-semibold uppercase tracking-wider text-[#9E9E9E] mb-6">AI Analysis Radar</h3>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                                  { subject: 'Technical', A: (Object.values(selectedLead.analysis.technical) as number[]).reduce((a,b)=>a+b,0)/5 },
                                  { subject: 'Design', A: (Object.values(selectedLead.analysis.design) as number[]).reduce((a,b)=>a+b,0)/5 },
                                  { subject: 'Business', A: (Object.values(selectedLead.analysis.business) as number[]).reduce((a,b)=>a+b,0)/5 },
                                  { subject: 'SEO', A: (Object.values(selectedLead.analysis.seo) as number[]).reduce((a,b)=>a+b,0)/4 },
                                ]}>
                                  <PolarGrid stroke="#E5E5E5" />
                                  <PolarAngleAxis dataKey="subject" tick={{fontSize: 12, fill: '#9E9E9E'}} />
                                  <Radar name="Performance" dataKey="A" stroke="#1A1A1A" fill="#1A1A1A" fillOpacity={0.1} />
                                </RadarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          
                          <div className="space-y-6">
                            <div>
                              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#9E9E9E] mb-4">Key Pain Points</h3>
                              <div className="flex flex-wrap gap-2">
                                {selectedLead.analysis.recommendations.map((rec, i) => (
                                  <span key={i} className="px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-sm flex items-center gap-2">
                                    <AlertCircle className="w-3 h-3" />
                                    {rec}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div>
                              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#9E9E9E] mb-4">AI Summary</h3>
                              <p className="text-sm leading-relaxed text-[#4A4A4A]">
                                {selectedLead.analysis.summary}
                              </p>
                            </div>

                            {selectedLead.reviewSnippets && selectedLead.reviewSnippets.length > 0 && (
                              <div>
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-[#9E9E9E] mb-4">Customer Insights (from Maps)</h3>
                                <ul className="space-y-2">
                                  {selectedLead.reviewSnippets.map((snippet, i) => (
                                    <li key={i} className="text-xs italic text-[#4A4A4A] bg-[#F5F5F4] p-3 rounded-xl border-l-2 border-[#FF6321]">
                                      "{snippet}"
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                              <div className="pt-4 border-t border-[#E5E5E5] space-y-4">
                                {selectedLead.relumeUrl && (
                                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="p-2 bg-blue-100 rounded-lg">
                                        <Globe className="w-4 h-4 text-blue-600" />
                                      </div>
                                      <div>
                                        <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Relume Demo Ready</p>
                                        <p className="text-xs text-blue-600 truncate max-w-[200px]">{selectedLead.relumeUrl}</p>
                                      </div>
                                    </div>
                                    <a 
                                      href={selectedLead.relumeUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="p-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-all"
                                    >
                                      <ExternalLink className="w-4 h-4 text-blue-600" />
                                    </a>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <button 
                                    onClick={() => handleGenerateOutreach(selectedLead)}
                                    disabled={isGeneratingOutreach}
                                    className="flex-1 bg-[#1A1A1A] text-white py-3 rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-[#333] transition-all"
                                  >
                                    {isGeneratingOutreach ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    Generate Outreach Script
                                  </button>
                                  {!selectedLead.relumeUrl && (
                                    <button 
                                      onClick={() => handleGenerateRelume(selectedLead)}
                                      disabled={isGeneratingRelume}
                                      className="px-4 bg-white border border-[#E5E5E5] text-[#1A1A1A] py-3 rounded-2xl font-medium flex items-center justify-center gap-2 hover:bg-[#F5F5F4] transition-all"
                                    >
                                      {isGeneratingRelume ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                                    </button>
                                  )}
                                </div>
                              </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 bg-[#F5F5F4] rounded-3xl border-2 border-dashed border-[#E5E5E5]">
                          <Zap className="w-12 h-12 text-[#9E9E9E] mb-4" />
                          <h3 className="font-medium mb-2">No Analysis Yet</h3>
                          <p className="text-sm text-[#9E9E9E] mb-6">Run the AI scoring engine to identify pain points.</p>
                          <button 
                            onClick={() => handleAnalyze(selectedLead)}
                            disabled={isAnalyzing}
                            className="bg-white border border-[#E5E5E5] px-6 py-2 rounded-full text-sm font-medium hover:bg-[#F5F5F4] transition-all flex items-center gap-2"
                          >
                            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            {selectedLead.websiteStatus === 'none' ? 'Search & Analyze' : 'Start AI Analysis'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Detailed Metrics Grid */}
                    {selectedLead.analysis && !outreachScript && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <MetricGroup title="Technical Performance" icon={<Shield />} metrics={selectedLead.analysis.technical} />
                        <MetricGroup title="Design & UX" icon={<Smartphone />} metrics={selectedLead.analysis.design} />
                        <MetricGroup title="Business & Conversion" icon={<TrendingUp />} metrics={selectedLead.analysis.business} />
                        <MetricGroup title="SEO & Visibility" icon={<Search />} metrics={selectedLead.analysis.seo} />
                      </div>
                    )}

                    {/* Notes Section */}
                    <div className="mt-12 pt-12 border-t border-[#E5E5E5]">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-[#9E9E9E] mb-6">Internal Notes</h3>
                      <div className="flex flex-col gap-4">
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Add a private note about this lead..."
                          className="w-full p-4 bg-[#F5F5F4] rounded-2xl border-none text-sm focus:ring-2 focus:ring-[#FF6321] transition-all resize-none h-24"
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleAddNote(selectedLead.id)}
                            disabled={!noteText.trim() || isAddingNote}
                            className="px-6 py-2 bg-[#1A1A1A] text-white rounded-xl font-semibold hover:bg-[#333] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            {isAddingNote && <Loader2 className="w-4 h-4 animate-spin" />}
                            Add Note
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Activity History */}
                    {selectedLead.activityHistory && selectedLead.activityHistory.length > 0 && (
                      <div className="mt-12 pt-12 border-t border-[#E5E5E5]">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#9E9E9E] mb-6">Activity History</h3>
                        <div className="space-y-4">
                          {selectedLead.activityHistory.map((log) => (
                            <div key={log.id} className="flex gap-4">
                              <div className="w-8 h-8 rounded-full bg-[#F5F5F4] flex items-center justify-center shrink-0">
                                {log.type === 'Analysis' && <Zap className="w-4 h-4 text-orange-500" />}
                                {log.type === 'Outreach' && <Mail className="w-4 h-4 text-blue-500" />}
                                {log.type === 'Status Change' && <Clock className="w-4 h-4 text-green-500" />}
                                {log.type === 'Note' && <MessageSquare className="w-4 h-4 text-purple-500" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{log.content}</p>
                                <p className="text-xs text-[#9E9E9E]">{new Date(log.timestamp).toLocaleString()}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {activeTab === 'crm' && (
            <div className="bg-white rounded-3xl border border-[#E5E5E5] shadow-sm overflow-hidden">
              <div className="p-4 md:p-8 border-b border-[#E5E5E5] flex flex-col md:flex-row md:items-center justify-between bg-[#F5F5F4]/50 gap-4">
                <div>
                  <h2 className="text-lg md:text-xl font-bold">Lean CRM</h2>
                  <p className="text-xs md:text-sm text-[#9E9E9E]">Real-time sync with Google Sheets</p>
                </div>
                <div className="flex flex-wrap gap-2 md:gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#9E9E9E]">Filter</label>
                    <select 
                      value={crmFilterStatus}
                      onChange={(e) => setCrmFilterStatus(e.target.value)}
                      className="bg-white border border-[#E5E5E5] rounded-xl px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs focus:ring-2 focus:ring-[#1A1A1A] outline-none"
                    >
                      <option value="All">All Statuses</option>
                      <option value="New (24h)">New (24h)</option>
                      <option value="New">New Status</option>
                      <option value="Scored">Scored</option>
                      <option value="Outreach Sent">Outreach Sent</option>
                      <option value="Replied">Replied</option>
                      <option value="Meeting Booked">Meeting Booked</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#9E9E9E]">Sort</label>
                    <select 
                      value={crmSortBy}
                      onChange={(e) => setCrmSortBy(e.target.value as any)}
                      className="bg-white border border-[#E5E5E5] rounded-xl px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs focus:ring-2 focus:ring-[#1A1A1A] outline-none"
                    >
                      <option value="score">By Score</option>
                      <option value="date">By Date</option>
                      <option value="name">By Name</option>
                    </select>
                  </div>
                  <button 
                    onClick={handleExportCSV}
                    className="px-3 md:px-4 py-1.5 md:py-2 bg-white border border-[#E5E5E5] rounded-xl text-xs md:text-sm font-medium hover:bg-[#F5F5F4] transition-all flex items-center gap-2"
                  >
                    <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Export CSV</span>
                    <span className="sm:hidden">Export</span>
                  </button>
                  <button className="px-3 md:px-4 py-1.5 md:py-2 bg-[#1A1A1A] text-white rounded-xl text-xs md:text-sm font-medium hover:bg-[#333] transition-all">
                    Sync Now
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F5F5F4]/30 border-b border-[#E5E5E5]">
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-[#9E9E9E]">Company</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-[#9E9E9E]">Score</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-[#9E9E9E]">Status</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-[#9E9E9E]">Contact</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-[#9E9E9E]">Last Action</th>
                      <th className="p-4 text-xs font-bold uppercase tracking-wider text-[#9E9E9E]">Next Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {crmLeads.map(lead => (
                      <tr key={lead.id} className="hover:bg-[#F5F5F4]/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium">{lead.companyName}</p>
                              <p className="text-xs text-[#9E9E9E]">{lead.websiteUrl}</p>
                            </div>
                            {isNewLead(lead) && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-green-100 text-green-700">
                                NEW
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-xs font-bold",
                            lead.priority === 'Hot' ? "bg-red-100 text-red-700" : 
                            lead.priority === 'Warm' ? "bg-orange-100 text-orange-700" : 
                            lead.priority === 'Cold' ? "bg-blue-100 text-blue-700" : "bg-[#F5F5F4] text-[#9E9E9E]"
                          )}>
                            {lead.score || 'N/A'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-sm">{lead.status}</span>
                        </td>
                        <td className="p-4">
                          <p className="text-sm font-medium">{lead.contactName}</p>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs text-[#9E9E9E]">{lead.email || 'No email'}</p>
                            {lead.emailStatus === 'verified' && (
                              <CheckCircle2 className="w-3 h-3 text-green-500" title="Verified Email" />
                            )}
                            {lead.emailStatus === 'unverified' && (
                              <AlertCircle className="w-3 h-3 text-red-500" title="Unverified Email" />
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-sm text-[#9E9E9E]">{lead.lastActionDate}</td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <button className="text-xs font-bold text-[#FF6321] hover:underline">
                              Set Reminder
                            </button>
                            <button 
                              onClick={() => setLeadToDelete(lead.id)}
                              className="p-1.5 text-[#9E9E9E] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Delete Lead"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-8">
              <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8">
                <h2 className="text-xl font-bold mb-8">Integrations</h2>
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-[#F5F5F4] rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-white rounded-xl shadow-sm">
                        <Mail className="w-6 h-6 text-[#1A1A1A]" />
                      </div>
                      <div>
                        <h3 className="font-bold">Gmail API</h3>
                        <p className="text-sm text-[#4A4A4A]">Send personalized outreach directly from your Gmail account.</p>
                      </div>
                    </div>
                    {isGmailConnected ? (
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Connected
                        </span>
                        <button 
                          onClick={handleLogoutGmail}
                          className="px-4 py-2 bg-white border border-[#E5E5E5] rounded-xl text-sm font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={handleConnectGmail}
                        className="px-6 py-2 bg-[#1A1A1A] text-white rounded-xl text-sm font-bold hover:bg-[#333] transition-all"
                      >
                        Connect Gmail
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-[#E5E5E5] p-8">
                <h2 className="text-xl font-bold mb-8">System Configuration</h2>
              <div className="space-y-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#9E9E9E]">Automation Rules</h3>
                  <ToggleSetting 
                    label="Auto-analyze new leads" 
                    description="Automatically run AI scoring when a lead is added via Manus." 
                    checked={autoAnalyze}
                    onCheckedChange={setAutoAnalyze}
                  />
                  <ToggleSetting label="Smart outreach drafting" description="Generate personalized email drafts as soon as scoring is complete." defaultChecked />
                  <ToggleSetting label="CRM Sync" description="Keep Google Sheets CRM in sync with real-time dashboard updates." defaultChecked />
                </div>

                <div className="pt-8 border-t border-[#E5E5E5]">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-[#9E9E9E] mb-4">Integrations</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <IntegrationCard name="Manus AI" status="Connected" />
                    <IntegrationCard name="HeyGen" status="Connected" />
                    <IntegrationCard name="Google Sheets" status="Connected" />
                    <IntegrationCard name="Gmail API" status="Connected" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'outreach' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
                  <div className="p-6 border-b border-[#E5E5E5] flex items-center justify-between">
                    <h2 className="font-semibold">Outreach Performance</h2>
                    <div className="flex gap-2">
                      <span className="px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full">
                        {leads.filter(l => l.isOpened).length} OPENS
                      </span>
                      <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full">
                        {leads.filter(l => l.isClicked).length} CLICKS
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-[#E5E5E5]">
                    {leads.filter(l => l.status === 'Outreach Sent' || l.isOpened || l.isClicked).map(lead => (
                      <div key={lead.id} className="p-4 md:p-6 hover:bg-[#F5F5F4] transition-all group">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center font-bold text-xs md:text-sm flex-shrink-0">
                              {lead.companyName.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-medium text-sm md:text-base truncate">{lead.companyName}</h3>
                              <p className="text-[10px] md:text-xs text-[#9E9E9E] truncate">{lead.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {lead.isOpened ? (
                              <div className="flex flex-col items-end">
                                <span className="text-[9px] md:text-[10px] font-bold text-green-600 flex items-center gap-1">
                                  <CheckCircle2 className="w-2.5 h-2.5 md:w-3 md:h-3" /> OPENED
                                </span>
                                <span className="text-[9px] md:text-[10px] text-[#9E9E9E]">{new Date(lead.openedAt!).toLocaleTimeString()}</span>
                              </div>
                            ) : (
                              <span className="text-[9px] md:text-[10px] font-bold text-[#9E9E9E]">NOT OPENED</span>
                            )}
                            {lead.isClicked && (
                              <div className="flex flex-col items-end border-l border-[#E5E5E5] pl-3">
                                <span className="text-[9px] md:text-[10px] font-bold text-purple-600 flex items-center gap-1">
                                  <ExternalLink className="w-2.5 h-2.5 md:w-3 md:h-3" /> CLICKED
                                </span>
                                <span className="text-[9px] md:text-[10px] text-[#9E9E9E]">{new Date(lead.clickedAt!).toLocaleTimeString()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            {lead.followUpDate ? (
                              <div className="flex items-center gap-2 text-[10px] md:text-xs text-orange-600 font-medium bg-orange-50 px-2 md:px-3 py-1 md:py-1.5 rounded-xl">
                                <Calendar className="w-3 md:w-3.5 h-3 md:h-3.5" />
                                Follow-up: {lead.followUpDate}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input 
                                  type="date" 
                                  className="text-[10px] md:text-xs border border-[#E5E5E5] rounded-xl px-2 md:px-3 py-1 md:py-1.5 focus:ring-1 focus:ring-[#1A1A1A] outline-none"
                                  onChange={(e) => setFollowUpDate(e.target.value)}
                                />
                                <button 
                                  onClick={() => handleScheduleFollowUp(lead.id, followUpDate)}
                                  disabled={isSchedulingFollowUp}
                                  className="text-[10px] md:text-xs bg-[#1A1A1A] text-white px-2 md:px-3 py-1 md:py-1.5 rounded-xl hover:bg-[#333] transition-all"
                                >
                                  Schedule
                                </button>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleGenerateFollowUp(lead)}
                              disabled={isGeneratingFollowUp}
                              className="text-[10px] md:text-xs border border-[#1A1A1A] text-[#1A1A1A] px-2 md:px-3 py-1 md:py-1.5 rounded-xl hover:bg-[#1A1A1A] hover:text-white transition-all flex items-center gap-1.5"
                            >
                              {isGeneratingFollowUp ? <Loader2 className="w-2.5 md:w-3 h-2.5 md:h-3 animate-spin" /> : <Zap className="w-2.5 md:w-3 h-2.5 md:h-3" />}
                              {lead.followUpScript ? 'Regenerate Script' : 'Generate Follow-up'}
                            </button>
                            {lead.followUpScript && (
                              <button 
                                onClick={() => {
                                  setSelectedLeadId(lead.id);
                                  setOutreachScript(lead.followUpScript!);
                                  setOutreachSubject(`Following up: ${lead.companyName} x DCYPHERNET`);
                                  setActiveTab('leads');
                                }}
                                className="text-xs bg-[#FF6321] text-white px-3 py-1.5 rounded-xl hover:bg-[#E55A1E] transition-all"
                              >
                                Send Follow-up
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {lead.followUpScript && (
                          <div className="mt-4 p-4 bg-[#F5F5F4] rounded-2xl text-xs text-[#444] whitespace-pre-wrap border border-[#E5E5E5]">
                            <p className="font-bold mb-2 text-[#1A1A1A]">Generated Follow-up Script:</p>
                            {lead.followUpScript}
                          </div>
                        )}
                      </div>
                    ))}
                    {leads.filter(l => l.status === 'Outreach Sent' || l.isOpened || l.isClicked).length === 0 && (
                      <div className="p-12 text-center">
                        <Mail className="w-12 h-12 text-[#E5E5E5] mx-auto mb-4" />
                        <p className="text-[#9E9E9E]">No outreach activity recorded yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="bg-[#1A1A1A] text-white rounded-3xl p-6 shadow-xl">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#FF6321]" />
                    Conversion Tips
                  </h3>
                  <ul className="space-y-4 text-sm text-white/70">
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                      <p>Follow up within 48 hours if they opened the email but didn't reply.</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                      <p>If they clicked a link, they are high-intent. Offer a specific time for a demo.</p>
                    </li>
                    <li className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
                      <p>Keep follow-ups short (under 100 words) and value-focused.</p>
                    </li>
                  </ul>
                </div>
                
                <div className="bg-white rounded-3xl p-6 border border-[#E5E5E5] shadow-sm">
                  <h3 className="font-bold mb-4">Upcoming Follow-ups</h3>
                  <div className="space-y-4">
                    {leads.filter(l => l.followUpDate).sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!)).slice(0, 5).map(lead => (
                      <div key={lead.id} className="flex items-center justify-between p-3 rounded-2xl bg-[#F5F5F4]">
                        <div>
                          <p className="text-xs font-bold">{lead.companyName}</p>
                          <p className="text-[10px] text-[#9E9E9E]">{lead.followUpDate}</p>
                        </div>
                        <button 
                          onClick={() => { setSelectedLeadId(lead.id); setActiveTab('outreach'); }}
                          className="p-2 rounded-lg hover:bg-white transition-all"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {leads.filter(l => l.followUpDate).length === 0 && (
                      <p className="text-xs text-[#9E9E9E] text-center py-4">No follow-ups scheduled.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {leadToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLeadToDelete(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-[32px] w-full max-w-sm p-8 shadow-2xl"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold mb-2">Delete Lead?</h2>
                <p className="text-[#9E9E9E] text-sm mb-8">
                  This action cannot be undone. All data for this lead will be permanently removed.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setLeadToDelete(null)}
                    className="flex-1 px-6 py-3 bg-[#F5F5F4] rounded-2xl font-semibold hover:bg-[#E5E5E5] transition-all"
                  >
                    Cancel
                  </button>
                    <button 
                      onClick={() => handleDeleteLead(leadToDelete!)}
                      className="flex-1 px-6 py-3 bg-red-600 text-white rounded-2xl font-semibold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                    >
                      Delete
                    </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Lead Modal */}
      <AnimatePresence>
        {isAddingLead && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingLead(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-[32px] w-full max-w-lg p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold">Add New Lead</h2>
                <button onClick={() => setIsAddingLead(false)} className="p-2 hover:bg-[#F5F5F4] rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleAddLead} className="space-y-6">
                <div className="space-y-4">
                  <Input label="Company Name" name="companyName" placeholder="e.g. Acme Corp" required />
                  <Input label="Website URL" name="websiteUrl" placeholder="https://example.com" required />
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Contact Name" name="contactName" placeholder="John Doe" />
                    <Input label="Email Address" name="email" type="email" placeholder="john@example.com" />
                  </div>
                </div>
                <button type="submit" className="w-full bg-[#1A1A1A] text-white py-4 rounded-2xl font-semibold hover:bg-[#333] transition-all shadow-lg shadow-black/10">
                  Add Lead to System
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <Toaster position="top-right" richColors />
    </div>
  );
}

interface ResponseDashboardProps {
  leads: Lead[];
  onDraftFollowUp: (leadId: string, replyId: string) => Promise<void>;
  onSendResponse: (lead: Lead, replyId: string, subject: string, body: string, threadId?: string, originalMessageId?: string) => Promise<void>;
  isGmailConnected: boolean;
  handleConnectGmail: () => Promise<void>;
}

function ResponseDashboard({ leads, onDraftFollowUp, onSendResponse, isGmailConnected, handleConnectGmail }: ResponseDashboardProps) {
  const repliedLeads = leads.filter(l => l.replies && l.replies.length > 0);
  const [selectedReply, setSelectedReply] = useState<{leadId: string, replyId: string} | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [editableDraftSubject, setEditableDraftSubject] = useState("");
  const [editableDraftBody, setEditableDraftBody] = useState("");

  useEffect(() => {
    if (selectedReply) {
      const lead = leads.find(l => l.id === selectedReply.leadId);
      const reply = lead?.replies?.find(r => (r as any).id === selectedReply.replyId || (r as any).messageId === selectedReply.replyId);
      
      let baseSubject = "";
      if (reply && (reply as any).subject) {
        baseSubject = (reply as any).subject;
      } else if (lead && (lead as any).outreachSubject) {
        baseSubject = (lead as any).outreachSubject;
      }

      if (baseSubject) {
        if (!/^re:/i.test(baseSubject)) {
          baseSubject = `Re: ${baseSubject}`;
        }
      } else {
        baseSubject = `Re: ${lead?.companyName || 'Lead'}`;
      }

      if (reply && reply.followUpDraft) {
        setEditableDraftSubject(reply.followUpSubject || baseSubject);
        setEditableDraftBody(reply.followUpDraft);
      } else {
        setEditableDraftSubject(baseSubject);
        setEditableDraftBody("");
      }
    }
  }, [selectedReply, leads]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Outreach Responses</h2>
          <p className="text-[#9E9E9E]">Track and follow up on incoming replies.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Replies List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-3xl border border-[#E5E5E5] overflow-hidden shadow-sm">
            <div className="p-6 border-b border-[#E5E5E5]">
              <h3 className="font-semibold">All Replies</h3>
            </div>
            <div className="divide-y divide-[#E5E5E5] max-h-[600px] overflow-y-auto">
              {repliedLeads.length === 0 ? (
                <div className="p-12 text-center text-[#9E9E9E]">
                  No replies detected yet.
                </div>
              ) : (
                repliedLeads.flatMap(lead => 
                  (lead.replies || []).map(reply => ({ ...reply, leadId: lead.id, companyName: lead.companyName }))
                ).sort((a, b) => {
                  const timeA = new Date((a as any).timestamp || (a as any).repliedAt || (a as any).receivedAt || 0).getTime();
                  const timeB = new Date((b as any).timestamp || (b as any).repliedAt || (b as any).receivedAt || 0).getTime();
                  return timeB - timeA;
                }).map((reply, idx) => {
                  const replyId = (reply as any).id || (reply as any).messageId || `idx-${idx}`;
                  const timestamp = (reply as any).timestamp || (reply as any).repliedAt || (reply as any).receivedAt;
                  
                  return (
                    <button 
                      key={`${reply.leadId}-${replyId}`}
                      onClick={() => setSelectedReply({leadId: reply.leadId, replyId: (reply as any).id || (reply as any).messageId})}
                      className={cn(
                        "w-full p-4 hover:bg-[#F5F5F4] transition-all text-left flex flex-col gap-2",
                        selectedReply?.replyId === ((reply as any).id || (reply as any).messageId) && "bg-[#F5F5F4] border-l-4 border-[#FF6321]"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm truncate">{reply.companyName}</span>
                        <span className="text-[10px] text-[#9E9E9E]">
                          {timestamp ? new Date(timestamp).toLocaleDateString() : 'Recent'}
                        </span>
                      </div>
                      <p className="text-xs text-[#4A4A4A] line-clamp-2 italic">"{reply.snippet}"</p>
                      <div className="flex items-center gap-2">
                        {reply.isInterested ? (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" /> Interested
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-bold rounded-full">Neutral</span>
                        )}
                        {reply.followUpDraft && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">Drafted</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Reply Details & Follow-up Draft */}
        <div className="lg:col-span-2">
          {selectedReply ? (
            <AnimatePresence mode="wait">
              <motion.div 
                key={selectedReply.replyId}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-[#E5E5E5] p-8 shadow-sm h-full"
              >
                {(() => {
                  const lead = leads.find(l => l.id === selectedReply.leadId);
                  const reply = lead?.replies?.find(r => (r as any).id === selectedReply.replyId || (r as any).messageId === selectedReply.replyId);
                  
                  if (!lead || !reply) {
                    return (
                      <div className="bg-[#F5F5F4] rounded-3xl border-2 border-dashed border-[#E5E5E5] flex flex-col items-center justify-center py-32 text-center p-8 h-full">
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6">
                          <AlertCircle className="w-8 h-8 text-orange-500" />
                        </div>
                        <h3 className="font-bold text-lg mb-2">Details Unavailable</h3>
                        <p className="text-[#9E9E9E] max-w-xs">We couldn't load the details for this reply.</p>
                      </div>
                    );
                  }

                  const content = (reply as any).content || (reply as any).snippet || "No content available.";
                  const from = (reply as any).from || "Unknown Sender";
                  const replyId = (reply as any).id || (reply as any).messageId;

                  return (
                    <div className="space-y-8">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold">{lead.companyName}</h3>
                          <p className="text-sm text-[#9E9E9E]">From: {from}</p>
                        </div>
                        <button 
                          onClick={() => setSelectedReply(null)}
                          className="p-2 hover:bg-[#F5F5F4] rounded-full"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="p-6 bg-[#F5F5F4] rounded-2xl relative">
                        <MessageSquare className="absolute -top-3 -left-3 w-8 h-8 text-[#FF6321]/20" />
                        <h4 className="text-xs font-bold uppercase tracking-widest text-[#9E9E9E] mb-4">Incoming Reply</h4>
                        <p className="text-lg leading-relaxed whitespace-pre-wrap">{content}</p>
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-widest text-[#9E9E9E]">Automated Follow-up Draft</h4>
                          {!reply.followUpDraft && (
                            <button 
                              onClick={async () => {
                                setIsDrafting(true);
                                await onDraftFollowUp(lead.id, replyId);
                                setIsDrafting(false);
                              }}
                              disabled={isDrafting}
                              className="bg-[#1A1A1A] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#333] transition-all flex items-center gap-2"
                            >
                              {isDrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                              {isDrafting ? 'Generating...' : 'Generate AI Response'}
                            </button>
                          )}
                        </div>

                        {reply.followUpDraft ? (
                          <div className="space-y-4">
                            <div className="p-6 bg-[#F5F5F4] rounded-2xl border border-[#E5E5E5] space-y-4 shadow-inner">
                              <div className="pb-4 border-b border-[#E5E5E5]">
                                <label className="text-[10px] font-bold uppercase text-[#9E9E9E] block mb-1">Subject</label>
                                <input 
                                  type="text"
                                  value={editableDraftSubject}
                                  onChange={(e) => setEditableDraftSubject(e.target.value)}
                                  className="w-full bg-transparent font-bold text-sm focus:outline-none focus:ring-1 focus:ring-[#FF6321]/50 rounded px-1"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold uppercase text-[#9E9E9E] block mb-1">Email Body</label>
                                <textarea 
                                  value={editableDraftBody}
                                  onChange={(e) => setEditableDraftBody(e.target.value)}
                                  rows={12}
                                  className="w-full bg-transparent text-base leading-relaxed focus:outline-none focus:ring-1 focus:ring-[#FF6321]/50 rounded px-1 resize-none"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <button 
                                onClick={async () => {
                                  if (!editableDraftBody) return;
                                  setIsSending(true);
                                  await onSendResponse(
                                    lead, 
                                    replyId, 
                                    editableDraftSubject || `Re: ${lead.companyName}`, 
                                    editableDraftBody,
                                    reply.threadId,
                                    reply.originalMessageId
                                  );
                                  setIsSending(false);
                                }}
                                disabled={isSending || isDrafting || (reply as any).sent}
                                className={cn(
                                  "flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all text-sm shadow-lg active:scale-95",
                                  (reply as any).sent 
                                    ? "bg-green-500 text-white cursor-default" 
                                    : "bg-[#FF6321] text-white hover:bg-[#FF6321]/90 shadow-[#FF6321]/20"
                                )}
                              >
                                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : (reply as any).sent ? <Check className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                                {(reply as any).sent ? 'Sent Successfully' : isSending ? 'Sending...' : 'Send via Gmail'}
                              </button>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(editableDraftBody);
                                  toast.success('Draft copied to clipboard!');
                                }}
                                className="flex items-center justify-center gap-2 py-3 bg-[#1A1A1A] text-white rounded-xl font-bold hover:bg-[#333] transition-all text-sm"
                              >
                                <Copy className="w-4 h-4" /> Copy Draft
                              </button>
                              <button 
                                onClick={async () => {
                                  setIsDrafting(true);
                                  await onDraftFollowUp(lead.id, replyId);
                                  setIsDrafting(false);
                                }}
                                disabled={isDrafting || isSending}
                                className="flex items-center justify-center gap-2 py-3 bg-white border border-[#E5E5E5] text-[#1A1A1A] rounded-xl font-bold hover:bg-[#F5F5F4] transition-all text-sm"
                              >
                                <RefreshCw className={cn("w-4 h-4", isDrafting && "animate-spin")} /> {isDrafting ? 'Drafting...' : 'Regenerate'}
                              </button>
                            </div>
                            
                            {!isGmailConnected && ! (reply as any).sent && (
                              <button 
                                onClick={handleConnectGmail}
                                className="w-full py-2 text-xs text-[#FF6321] font-bold hover:underline flex items-center justify-center gap-1"
                              >
                                <Globe className="w-3 h-3" /> Connect Gmail to send directly
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="p-12 text-center border-2 border-dashed border-[#E5E5E5] rounded-2xl">
                            <Zap className="w-8 h-8 text-[#9E9E9E] mx-auto mb-4" />
                            <p className="text-sm text-[#9E9E9E]">Click generate to create an AI-powered follow-up script.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="bg-[#F5F5F4] rounded-3xl border-2 border-dashed border-[#E5E5E5] flex flex-col items-center justify-center py-32 text-center p-8 h-full">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6">
                <MessageSquare className="w-8 h-8 text-[#9E9E9E]" />
              </div>
              <h3 className="font-bold text-lg mb-2">No Response Selected</h3>
              <p className="text-[#9E9E9E] max-w-xs">Select a reply from the left to view the conversation and draft follow-ups.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all font-medium text-sm group relative overflow-hidden",
        active 
          ? "bg-[#1A1A1A] text-white shadow-lg shadow-black/10" 
          : "text-[#9E9E9E] hover:bg-[#F5F5F4] hover:text-[#1A1A1A]"
      )}
    >
      <div className={cn(
        "transition-transform group-hover:scale-110",
        active ? "text-white" : "text-[#9E9E9E] group-hover:text-[#1A1A1A]"
      )}>
        {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
      </div>
      <span className="font-semibold">{label}</span>
      {active && (
        <motion.div 
          layoutId="active-indicator"
          className="ml-auto w-1.5 h-1.5 bg-[#FF6321] rounded-full"
        />
      )}
    </button>
  );
}

function StatCard({ label, value, icon, color = 'black', trend }: { label: string, value: number | string, icon: React.ReactNode, color?: 'black' | 'orange' | 'green' | 'blue' | 'purple', trend?: string }) {
  return (
    <div className="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] border border-[#E5E5E5] shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group relative overflow-hidden">
      <div className={cn(
        "absolute top-0 right-0 w-32 h-32 blur-[60px] opacity-10 -mr-16 -mt-16 transition-opacity group-hover:opacity-20",
        color === 'black' ? "bg-gray-500" :
        color === 'orange' ? "bg-orange-500" :
        color === 'green' ? "bg-green-500" :
        color === 'blue' ? "bg-blue-500" : "bg-purple-500"
      )} />
      
      <div className="flex items-center justify-between mb-4 md:mb-6 relative z-10">
        <div className={cn(
          "p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-500 shadow-sm",
          color === 'black' ? "bg-[#F5F5F4] text-[#1A1A1A] group-hover:bg-[#1A1A1A] group-hover:text-white" :
          color === 'orange' ? "bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white group-hover:shadow-orange-200" :
          color === 'green' ? "bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white group-hover:shadow-green-200" :
          color === 'blue' ? "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-blue-200" :
          "bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white group-hover:shadow-purple-200"
        )}>
          {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5 md:w-6 md:h-6" })}
        </div>
        {trend && (
          <span className="text-[9px] md:text-[10px] font-black text-green-600 bg-green-50 px-2 md:px-3 py-1 md:py-1.5 rounded-full tracking-wider uppercase">
            {trend}
          </span>
        )}
      </div>
      <div className="relative z-10">
        <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-[#9E9E9E] mb-1 md:mb-2">{label}</p>
        <h3 className="text-3xl md:text-4xl font-black tracking-tighter text-[#1A1A1A]">{value}</h3>
      </div>
    </div>
  );
}

function MetricGroup({ title, icon, metrics }: { title: string, icon: React.ReactNode, metrics: Record<string, number> }) {
  return (
    <div className="bg-white p-4 md:p-6 rounded-2xl md:rounded-3xl border border-[#E5E5E5] shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-[#F5F5F4] rounded-xl">
          {React.cloneElement(icon as React.ReactElement, { className: "w-4 h-4" })}
        </div>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="space-y-4">
        {Object.entries(metrics).map(([key, val]) => (
          <div key={key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#9E9E9E] capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              <span className={cn("font-bold", val < 50 ? "text-red-500" : "text-green-500")}>{val}%</span>
            </div>
            <div className="w-full bg-[#F5F5F4] h-1.5 rounded-full overflow-hidden">
              <div 
                className={cn("h-full transition-all duration-1000", val < 50 ? "bg-red-500" : "bg-green-500")} 
                style={{ width: `${val}%` }} 
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-[#4A4A4A] ml-1">{label}</label>
      <input 
        {...props}
        className="w-full px-4 py-3 bg-[#F5F5F4] border-none rounded-2xl text-sm focus:ring-2 focus:ring-[#1A1A1A] transition-all outline-none"
      />
    </div>
  );
}

function ToggleSetting({ label, description, checked, onCheckedChange, defaultChecked }: { 
  label: string, 
  description: string, 
  checked?: boolean,
  onCheckedChange?: (checked: boolean) => void,
  defaultChecked?: boolean 
}) {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  
  const isChecked = checked !== undefined ? checked : internalChecked;
  const handleChange = () => {
    if (onCheckedChange) {
      onCheckedChange(!isChecked);
    } else {
      setInternalChecked(!isChecked);
    }
  };

  return (
    <div className="flex items-center justify-between group">
      <div className="max-w-[80%]">
        <p className="font-medium group-hover:text-[#1A1A1A] transition-colors">{label}</p>
        <p className="text-xs text-[#9E9E9E]">{description}</p>
      </div>
      <button 
        onClick={handleChange}
        className={cn(
          "w-12 h-6 rounded-full transition-all relative",
          isChecked ? "bg-[#1A1A1A]" : "bg-[#E5E5E5]"
        )}
      >
        <div className={cn(
          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
          isChecked ? "left-7" : "left-1"
        )} />
      </button>
    </div>
  );
}

function IntegrationCard({ name, status }: { name: string, status: string }) {
  return (
    <div className="p-4 bg-[#F5F5F4] rounded-2xl border border-transparent hover:border-[#E5E5E5] transition-all">
      <p className="text-sm font-bold mb-1">{name}</p>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
        <span className="text-[10px] uppercase font-bold text-[#9E9E9E]">{status}</span>
      </div>
    </div>
  );
}
