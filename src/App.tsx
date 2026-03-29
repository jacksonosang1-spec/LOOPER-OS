import React, { useState, useEffect, useMemo } from 'react';
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
  Edit
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

import { Lead, LeadAnalysis, ActivityLog } from './types';
import { analyzeWebsite, generateOutreach, discoverLeads, generateRelumeUrl } from './lib/gemini';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
    lastActionDate: '2026-03-25',
    createdAt: '2026-03-20',
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
    painPoints: [],
    lastActionDate: '2026-03-28',
    createdAt: '2026-03-28',
  }
];

export default function App() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('looper_leads');
    return saved ? JSON.parse(saved) : INITIAL_LEADS;
  });

  useEffect(() => {
    localStorage.setItem('looper_leads', JSON.stringify(leads));
  }, [leads]);

  const addActivityLog = (leadId: string, type: ActivityLog['type'], content: string) => {
    const newLog: ActivityLog = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content,
      timestamp: new Date().toISOString(),
    };
    setLeads(prev => prev.map(l => l.id === leadId ? {
      ...l,
      activityHistory: [newLog, ...(l.activityHistory || [])],
      lastActionDate: new Date().toISOString().split('T')[0]
    } : l));
  };

  const checkGmailStatus = async () => {
    try {
      const response = await fetch('/api/gmail/status');
      const data = await response.json();
      setIsGmailConnected(data.connected);
    } catch (error) {
      console.error('Failed to check Gmail status:', error);
    }
  };

  useEffect(() => {
    checkGmailStatus();
  }, []);

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
          body: outreachScript
        })
      });

      if (response.ok) {
        setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, status: 'Outreach Sent' } : l));
        addActivityLog(selectedLead.id, 'Outreach', `Email sent: ${outreachSubject}`);
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
  const [isGmailConnected, setIsGmailConnected] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleLogoutGmail = async () => {
    try {
      await fetch('/api/auth/google/logout', { method: 'POST' });
      setIsGmailConnected(false);
    } catch (error) {
      console.error('Failed to logout from Gmail:', error);
    }
  };
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leads' | 'settings' | 'crm'>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

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

  const stats = useMemo(() => ({
    total: leads.length,
    scored: leads.filter(l => l.status !== 'New').length,
    highIntent: leads.filter(l => l.score > 80).length,
    outreachSent: leads.filter(l => l.status === 'Outreach Sent').length,
  }), [leads]);

  const handleAddLead = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newLead: Lead = {
      id: Math.random().toString(36).substr(2, 9),
      companyName: formData.get('companyName') as string,
      websiteUrl: formData.get('websiteUrl') as string,
      contactName: formData.get('contactName') as string,
      email: formData.get('email') as string,
      status: 'New',
      score: 0,
      priority: 'None',
      websiteStatus: 'none',
      painPoints: [],
      lastActionDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString().split('T')[0],
    };
    setLeads([newLead, ...leads]);
    setIsAddingLead(false);
  };

  const handleAnalyze = async (lead: Lead) => {
    setAnalyzingCount(prev => prev + 1);
    try {
      const analysis = await analyzeWebsite(lead.websiteUrl, lead.companyName);
      
      // Calculate a weighted score based on the PDF criteria (Full Rubric)
      // Technical (30%), Business (30%), SEO (25%), Design (15%)
      const techScore = (Object.values(analysis.technical) as number[]).reduce((a, b) => a + b, 0) / 5;
      const businessScore = (Object.values(analysis.business) as number[]).reduce((a, b) => a + b, 0) / 5;
      const seoScore = (Object.values(analysis.seo) as number[]).reduce((a, b) => a + b, 0) / 4;
      const designScore = (Object.values(analysis.design) as number[]).reduce((a, b) => a + b, 0) / 5;
      
      // Final Score = (Technical × 0.30) + (Business × 0.30) + (SEO × 0.25) + (Design × 0.15)
      // Higher score = more pain points = hotter lead.
      const finalScore = Math.round(
        (techScore * 0.30) + 
        (businessScore * 0.30) + 
        (seoScore * 0.25) + 
        (designScore * 0.15)
      );

      let priority: Lead['priority'] = 'Cold';
      if (finalScore >= 70) priority = 'Hot';
      else if (finalScore >= 40) priority = 'Warm';

      let websiteStatus: Lead['websiteStatus'] = 'good';
      if (!lead.websiteUrl || lead.websiteUrl === 'none') websiteStatus = 'none';
      else if (finalScore >= 40) websiteStatus = 'poor';

      setLeads(prev => prev.map(l => l.id === lead.id ? {
        ...l,
        status: 'Scored',
        score: finalScore,
        priority,
        websiteStatus,
        analysis,
        painPoints: analysis.recommendations.slice(0, 3),
        email: (analysis as any).email || l.email,
        emailStatus: (analysis as any).emailStatus || l.emailStatus,
        websiteUrl: ((analysis as any).websiteUrl && (analysis as any).websiteUrl !== 'none') ? (analysis as any).websiteUrl : l.websiteUrl
      } : l));
      addActivityLog(lead.id, 'Analysis', `AI analysis completed. Score: ${finalScore}`);
      toast.success('Analysis completed!');
    } catch (error) {
      console.error("Analysis failed", error);
      toast.error('Analysis failed. Please try again.');
    } finally {
      setAnalyzingCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleDiscover = async () => {
    setIsDiscovering(true);
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

      const discovered = await discoverLeads(discoveryNiche, discoveryCity, discoveryCount, latLng);
      
      if (!discovered || discovered.length === 0) {
        toast.info("No leads were found for this niche and city. Try adjusting your search criteria.");
        return;
      }

      let newLeads: Lead[] = discovered.map(d => ({
        id: Math.random().toString(36).substr(2, 9),
        companyName: d.companyName || 'Unknown',
        websiteUrl: d.websiteUrl || 'none',
        contactName: 'Business Owner',
        jobTitle: d.jobTitle,
        socialMedia: d.socialMedia,
        email: d.email || '',
        emailStatus: d.emailStatus || 'unknown',
        phone: d.phone,
        address: d.address,
        status: 'New',
        score: 0,
        priority: 'None',
        websiteStatus: d.websiteUrl && d.websiteUrl !== 'none' ? 'poor' : 'none',
        painPoints: [],
        lastActionDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString().split('T')[0],
        mapsUrl: d.mapsUrl,
        reviewSnippets: d.reviewSnippets
      }));

      if (excludeUnverified) {
        newLeads = newLeads.filter(l => l.emailStatus !== 'unverified');
      }

      setLeads(prev => [...newLeads, ...prev]);

      // Automate analysis if enabled
      if (autoAnalyze) {
        newLeads.forEach(lead => {
          handleAnalyze(lead);
        });
      }
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
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, outreachMessage: body, outreachSubject: subject, status: 'Outreach Sent' } : l));
      addActivityLog(lead.id, 'Outreach', 'Personalized outreach script generated.');
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
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, relumeUrl: url } : l));
    } catch (error) {
      console.error("Relume generation failed", error);
    } finally {
      setIsGeneratingRelume(false);
    }
  };

  const handleUpdateLead = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLead) return;
    
    const formData = new FormData(e.currentTarget);
    const websiteUrl = formData.get('websiteUrl') as string;
    const email = formData.get('email') as string;
    
    setLeads(prev => prev.map(l => l.id === selectedLead.id ? {
      ...l,
      websiteUrl,
      email,
      // Reset status if website changed to allow re-analysis
      status: l.websiteUrl !== websiteUrl ? 'New' : l.status
    } : l));
    
    setIsEditingLead(false);
  };

  const handleDeleteLead = (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    if (selectedLeadId === id) {
      setSelectedLeadId(null);
      setOutreachScript(null);
    }
    setLeadToDelete(null);
    toast.success('Lead deleted successfully');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F4] text-[#1A1A1A] font-sans selection:bg-[#FF6321] selection:text-white">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 h-full w-20 bg-white border-r border-[#E5E5E5] flex flex-col items-center py-8 z-50">
        <div className="w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center mb-12">
          <Zap className="text-white w-6 h-6" />
        </div>
        
        <div className="flex flex-col gap-8 flex-1">
          <NavItem 
            icon={<LayoutDashboard />} 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <NavItem 
            icon={<Users />} 
            active={activeTab === 'leads'} 
            onClick={() => setActiveTab('leads')} 
          />
          <NavItem 
            icon={<BarChart3 />} 
            active={activeTab === 'crm'} 
            onClick={() => setActiveTab('crm')} 
          />
          <NavItem 
            icon={<Settings />} 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </div>

        <div className="mt-auto">
          <div className="w-10 h-10 rounded-full bg-[#E5E5E5] overflow-hidden">
            <img src="https://picsum.photos/seed/user/100/100" alt="User" referrerPolicy="no-referrer" />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-20 min-h-screen">
        <header className="h-20 border-b border-[#E5E5E5] bg-white/80 backdrop-blur-md sticky top-0 z-40 px-8 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            {activeTab === 'dashboard' && 'System Overview'}
            {activeTab === 'leads' && 'Lead Management'}
            {activeTab === 'crm' && 'Lean CRM (Google Sheets Sync)'}
            {activeTab === 'settings' && 'System Settings'}
          </h1>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9E9E]" />
              <input 
                type="text" 
                placeholder="Search leads..." 
                className="pl-10 pr-4 py-2 bg-[#F5F5F4] border-none rounded-full text-sm w-64 focus:ring-2 focus:ring-[#1A1A1A] transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setIsAddingLead(true)}
              className="bg-[#1A1A1A] text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:bg-[#333] transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Lead
            </button>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              {/* Lead Discovery Section */}
              <div className="bg-[#1A1A1A] text-white rounded-3xl p-8 border border-[#333] shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6321] blur-[120px] opacity-20 -mr-32 -mt-32" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-[#FF6321] rounded-xl">
                      <Globe className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Automated Lead Discovery</h2>
                      <p className="text-sm text-white/50">Find high-intent prospects using Google Maps</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">Target Niche</label>
                      <select 
                        value={selectedNicheOption}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedNicheOption(val);
                          if (val !== 'Other') {
                            setDiscoveryNiche(val);
                          } else {
                            setDiscoveryNiche('');
                          }
                        }}
                        className="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF6321] outline-none transition-all text-white"
                      >
                        {NICHES.map(niche => (
                          <option key={niche} value={niche} className="bg-[#1A1A1A]">{niche}</option>
                        ))}
                      </select>
                      {selectedNicheOption === 'Other' && (
                        <input 
                          type="text" 
                          value={discoveryNiche}
                          onChange={(e) => setDiscoveryNiche(e.target.value)}
                          className="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF6321] outline-none transition-all mt-2"
                          placeholder="Type specific niche..."
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">Location (City)</label>
                      <input 
                        type="text" 
                        value={discoveryCity}
                        onChange={(e) => setDiscoveryCity(e.target.value)}
                        className="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF6321] outline-none transition-all"
                        placeholder="e.g. Lagos"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-white/50 ml-1">Leads to Find</label>
                      <input 
                        type="number" 
                        min="1"
                        max="20"
                        value={discoveryCount}
                        onChange={(e) => setDiscoveryCount(parseInt(e.target.value) || 1)}
                        className="w-full bg-white/10 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#FF6321] outline-none transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 ml-1">
                        <input 
                          type="checkbox" 
                          id="excludeUnverified"
                          checked={excludeUnverified}
                          onChange={(e) => setExcludeUnverified(e.target.checked)}
                          className="w-4 h-4 rounded border-white/10 bg-white/10 text-[#FF6321] focus:ring-[#FF6321]"
                        />
                        <label htmlFor="excludeUnverified" className="text-xs text-white/70 cursor-pointer">
                          Exclude Unverified
                        </label>
                      </div>
                      <button 
                        onClick={handleDiscover}
                        disabled={isDiscovering}
                        className="bg-[#FF6321] text-white py-3 rounded-2xl font-bold hover:bg-[#E55A1E] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isDiscovering ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        {isDiscovering ? 'Discovering...' : 'Start Discovery'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard label="Total Leads" value={stats.total} icon={<Users className="text-blue-500" />} />
                <StatCard label="AI Scored" value={stats.scored} icon={<Zap className="text-orange-500" />} />
                <StatCard label="High Intent" value={stats.highIntent} icon={<TrendingUp className="text-green-500" />} />
                <StatCard label="Outreach Sent" value={stats.outreachSent} icon={<Mail className="text-purple-500" />} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Activity */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-8 border border-[#E5E5E5] shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-lg font-semibold">High Intent Leads</h2>
                    <button onClick={() => setActiveTab('leads')} className="text-sm text-[#9E9E9E] hover:text-[#1A1A1A] flex items-center gap-1">
                      View all <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {leads.filter(l => l.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(lead => (
                      <div key={lead.id} className="group flex items-center justify-between p-4 rounded-2xl hover:bg-[#F5F5F4] transition-all cursor-pointer" onClick={() => { setSelectedLeadId(lead.id); setActiveTab('leads'); }}>
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold",
                            lead.priority === 'Hot' ? "bg-red-100 text-red-700" : 
                            lead.priority === 'Warm' ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {lead.score}
                          </div>
                          <div>
                            <h3 className="font-medium">{lead.companyName}</h3>
                            <p className="text-sm text-[#9E9E9E]">{lead.websiteUrl}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium">{lead.status}</p>
                            <p className="text-xs text-[#9E9E9E]">{lead.lastActionDate}</p>
                          </div>
                          <ArrowUpRight className="w-5 h-5 text-[#E5E5E5] group-hover:text-[#1A1A1A] transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* System Health / Distribution */}
                <div className="bg-white rounded-3xl p-8 border border-[#E5E5E5] shadow-sm">
                  <h2 className="text-lg font-semibold mb-8">Score Distribution</h2>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { range: '0-20', count: leads.filter(l => l.score <= 20).length },
                        { range: '21-40', count: leads.filter(l => l.score > 20 && l.score <= 40).length },
                        { range: '41-60', count: leads.filter(l => l.score > 40 && l.score <= 60).length },
                        { range: '61-80', count: leads.filter(l => l.score > 60 && l.score <= 80).length },
                        { range: '81-100', count: leads.filter(l => l.score > 80).length },
                      ]}>
                        <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                        <Tooltip cursor={{fill: '#F5F5F4'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {leads.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={index === 4 ? '#FF6321' : '#1A1A1A'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#9E9E9E]">Lead Quality Index</span>
                      <span className="font-medium text-green-600">High</span>
                    </div>
                    <div className="w-full bg-[#F5F5F4] h-2 rounded-full overflow-hidden">
                      <div className="bg-green-500 h-full w-[75%]" />
                    </div>
                  </div>
                  <div className="mt-8 pt-6 border-t border-[#E5E5E5]">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#9E9E9E] mb-4">AI Scoring Logic</h3>
                    <ul className="space-y-2 text-xs text-[#4A4A4A]">
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-500" /> Technical (30%): Speed, Mobile, SSL</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-500" /> Business (30%): Forms, Chat, Social</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-500" /> SEO (20%): Meta, Freshness, Local</li>
                      <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-green-500" /> Design (20%): Hierarchy, CTAs, WCAG</li>
                    </ul>
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
                      onClick={() => { setSelectedLeadId(lead.id); setOutreachScript(null); }}
                      className={cn(
                        "p-6 cursor-pointer transition-all hover:bg-[#F5F5F4]",
                        selectedLeadId === lead.id && "bg-[#F5F5F4] border-l-4 border-l-[#1A1A1A]"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium truncate pr-4">{lead.companyName}</h3>
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
                    <div className="bg-white rounded-3xl border border-[#E5E5E5] shadow-sm p-8">
                      <div className="flex items-start justify-between mb-8">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-2xl font-bold">{selectedLead.companyName}</h2>
                            <span className="px-3 py-1 bg-[#F5F5F4] rounded-full text-xs font-medium">
                              {selectedLead.status}
                            </span>
                          </div>
                          <p className="text-[#9E9E9E] flex items-center flex-wrap gap-2">
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
                          <div className="flex items-center gap-4 mt-2">
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
                        <div className="flex gap-2">
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
                            Start AI Analysis
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
              <div className="p-8 border-b border-[#E5E5E5] flex items-center justify-between bg-[#F5F5F4]/50">
                <div>
                  <h2 className="text-xl font-bold">Lean CRM</h2>
                  <p className="text-sm text-[#9E9E9E]">Real-time sync with Google Sheets</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-4 py-2 bg-white border border-[#E5E5E5] rounded-xl text-sm font-medium hover:bg-[#F5F5F4] transition-all flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4" />
                    Export to Sheets
                  </button>
                  <button className="px-4 py-2 bg-[#1A1A1A] text-white rounded-xl text-sm font-medium hover:bg-[#333] transition-all">
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
                    {leads.map(lead => (
                      <tr key={lead.id} className="hover:bg-[#F5F5F4]/50 transition-colors">
                        <td className="p-4">
                          <p className="font-medium">{lead.companyName}</p>
                          <p className="text-xs text-[#9E9E9E]">{lead.websiteUrl}</p>
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
                          <p className="text-sm">{lead.contactName}</p>
                          <p className="text-xs text-[#9E9E9E]">{lead.email}</p>
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
                  <div className="grid grid-cols-2 gap-4">
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

function NavItem({ icon, active, onClick }: { icon: React.ReactNode, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-3 rounded-xl transition-all duration-300",
        active ? "bg-[#1A1A1A] text-white shadow-lg shadow-black/10" : "text-[#9E9E9E] hover:text-[#1A1A1A] hover:bg-[#F5F5F4]"
      )}
    >
      {React.cloneElement(icon as React.ReactElement, { className: "w-6 h-6" })}
    </button>
  );
}

function StatCard({ label, value, icon }: { label: string, value: number | string, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-[#E5E5E5] shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-[#F5F5F4] rounded-xl">
          {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
        </div>
        <ArrowUpRight className="w-4 h-4 text-[#9E9E9E]" />
      </div>
      <p className="text-sm text-[#9E9E9E] font-medium mb-1">{label}</p>
      <h3 className="text-2xl font-bold">{value}</h3>
    </div>
  );
}

function MetricGroup({ title, icon, metrics }: { title: string, icon: React.ReactNode, metrics: Record<string, number> }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-[#E5E5E5] shadow-sm">
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
