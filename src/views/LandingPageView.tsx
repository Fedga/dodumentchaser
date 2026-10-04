import React, { useState } from 'react';
import {
  FileCheck2,
  ArrowRight,
  Shield,
  BellRing,
  Clock,
  CheckCircle2,
  Check,
  ChevronDown,
  Sparkles,
  ExternalLink,
  Users,
  Repeat,
  Lock,
  Layers
} from 'lucide-react';

interface LandingPageViewProps {
  onLaunchApp: () => void;
  onOpenPortalDemo: () => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  onLaunchApp,
  onOpenPortalDemo,
}) => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const faqs = [
    {
      q: 'Is this accounting software?',
      a: 'No. DocumentChaser focuses specifically and obsessively on collecting, tracking, and chasing documents and information from clients. We do not replace Xero, QuickBooks or Dext—we make sure you actually get the raw files needed to do your work on time.',
    },
    {
      q: 'Can clients upload documents securely?',
      a: 'Yes. Every client request receives an unguessable 256-bit secure portal token. Documents are stored in isolated encrypted storage and can only be accessed by authorized staff in your firm.',
    },
    {
      q: 'Can I reuse document checklists?',
      a: 'Absolutely. You can build and customize reusable templates for Monthly Bookkeeping, Year End Statutory Accounts, VAT Returns, Self Assessment, and AML Onboarding.',
    },
    {
      q: 'Can I automate reminders?',
      a: 'Yes. Set your preferred chase interval (e.g. every 3 days) and max chaser count. The moment your client uploads all required files or marks them as not applicable, automated chasing halts instantly.',
    },
    {
      q: 'Can I use it for monthly bookkeeping?',
      a: 'Yes! It was built from day one around monthly bank statement, credit card, and sales invoice reconciliations.',
    },
    {
      q: 'Can I use it for tax returns?',
      a: 'Yes. Customise checklists with dividend vouchers, P60s, rental income statements, and mortgage interest certificates for January self-assessment crunches.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col font-sans">
      {/* Top Bar Contract (3 Zones) */}
      <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
            <FileCheck2 className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">
            DocumentChaser
          </span>
        </div>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-600">
          <a href="#problem" className="hover:text-slate-900 transition-colors">The Problem</a>
          <a href="#how-it-works" className="hover:text-slate-900 transition-colors">How It Works</a>
          <a href="#features" className="hover:text-slate-900 transition-colors">Features</a>
          <a href="#pricing" className="hover:text-slate-900 transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-slate-900 transition-colors">FAQ</a>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenPortalDemo}
            className="hidden sm:inline-flex text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            Client Portal Demo
          </button>
          <button
            onClick={onLaunchApp}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs whitespace-nowrap"
          >
            Open Practice App
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/80">
          <Check className="w-3.5 h-3.5 text-emerald-600" />
          <span>Purpose-built for UK Accounting & Bookkeeping Firms</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight max-w-4xl mx-auto" style={{ textWrap: 'balance' }}>
          Stop chasing clients for documents.
        </h1>

        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed" style={{ textWrap: 'balance' }}>
          Automatically request, collect and track the documents your accounting clients owe you. Save 4+ hours per client every single month.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={onLaunchApp}
            className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
          >
            <span>Start collecting documents</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href="#how-it-works"
            className="w-full sm:w-auto px-6 py-3 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <span>See how it works</span>
          </a>
        </div>

        {/* Hero Visual Asset */}
        <div className="pt-8 max-w-4xl mx-auto">
          <div className="rounded-xl border border-slate-200/90 shadow-lg overflow-hidden bg-white p-2">
            <div className="relative rounded-lg overflow-hidden aspect-[16/9] bg-slate-100">
              <img
                src="/src/assets/images/hero_document_flow_1790848146678.jpg"
                alt="DocumentChaser organized practice workspace"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent flex items-end p-6">
                <div className="text-left text-white space-y-1">
                  <div className="text-xs uppercase tracking-wider font-semibold text-emerald-400">Live Practice Dashboard</div>
                  <div className="text-lg sm:text-xl font-bold">Every missing statement, receipt and invoice tracked in real time.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className="py-16 bg-white border-y border-slate-200/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <span className="text-xs font-semibold text-rose-600 uppercase tracking-wider">The Problem</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Still chasing clients for bank statements, receipts and invoices?
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Accountants and bookkeepers waste up to 30% of their billable hours sending awkward follow-up emails, deciphering fragmented email attachments, and wondering which files are still outstanding.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="text-sm font-bold text-slate-900">Endless email ping-pong</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Clients send random photos via WhatsApp, partial PDFs via email, or forget entirely until filing day.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="text-sm font-bold text-slate-900">Zero clarity on what's missing</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Staff waste 20 minutes before each reconciliation just determining which accounts are still waiting on statements.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="text-sm font-bold text-slate-900">Awkward fee conversations</div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Late statutory filings and emergency overtime because clients submitted documents 12 hours before the midnight deadline.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works (6 Steps) */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-12">
        <div className="text-center space-y-2">
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Simple Workflow</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            How DocumentChaser Works
          </h2>
          <p className="text-sm text-slate-600 max-w-xl mx-auto">
            From initial request creation to automatic chase stops—everything happens seamlessly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { step: '01', title: 'Create a request', desc: 'Select a client and pick a checklist template (e.g. Monthly Bookkeeping or Year End).' },
            { step: '02', title: 'Client receives secure portal', desc: 'Your client gets an email with their dedicated tokenised portal link. No passwords required.' },
            { step: '03', title: 'Client uploads documents', desc: 'Client drags and drops files from their phone or computer with file type and size validation.' },
            { step: '04', title: 'Missing items tracked automatically', desc: 'DocumentChaser updates your practice dashboard in real time showing exactly what is left.' },
            { step: '05', title: 'Reminders sent automatically', desc: 'Polite, automated reminders dispatch at your set frequency (e.g. every 3 days) until complete.' },
            { step: '06', title: 'Request becomes complete', desc: 'Once all documents are uploaded and approved, reminders halt and your team starts reconciliations.' },
          ].map((item, idx) => (
            <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
              <span className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                Step {item.step}
              </span>
              <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
              <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-16 bg-white border-y border-slate-200/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Features</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Engineered exclusively for accountants and bookkeepers
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { title: 'Automated Reminders', desc: 'Scheduled follow-ups with customizable tone, frequency, and automatic shut-off.' },
              { title: 'Secure Client Portal', desc: 'Mobile-responsive upload page branded with your practice logo and details.' },
              { title: 'Document Checklists', desc: 'Clear itemized lists with required / optional flags and rejection reason notices.' },
              { title: 'Request Templates', desc: 'Reusable packs for Bookkeeping, Year End Accounts, VAT, and AML Onboarding.' },
              { title: 'Document Review', desc: 'Preview, approve or reject files with specific feedback (e.g. missing pages).' },
              { title: 'Client Notes & Queries', desc: 'Clients can ask questions or mark items "Not Applicable" with reasons.' },
              { title: 'Practice Audit Stream', desc: 'Comprehensive activity logs tracking every upload, approval and email sent.' },
              { title: 'UK Tax Ready', desc: 'Built around UK accounting terms, HMRC requirements, and MTD schedules.' },
            ].map((f, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/40 space-y-1.5">
                <div className="text-xs font-bold text-slate-900">{f.title}</div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-10">
        <div className="text-center space-y-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pricing</span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Transparent pricing for practices of all sizes
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Cancel anytime &middot; No long-term lock-in &middot; Unlimited document requests
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Starter Plan */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Starter</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono text-slate-900">£19</span>
                <span className="text-xs text-slate-500">/month</span>
              </div>
              <p className="text-xs text-slate-600">Ideal for sole practitioners and freelance bookkeepers.</p>
              <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-slate-100">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Up to 15 active clients</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Automated chasing reminders</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Standard request templates</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Secure mobile client portal</span>
                </li>
              </ul>
            </div>
            <button
              onClick={onLaunchApp}
              className="w-full py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Start Free Trial
            </button>
          </div>

          {/* Professional Plan (Popular) */}
          <div className="bg-white p-6 rounded-xl border-2 border-slate-900 shadow-md space-y-5 flex flex-col justify-between relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-slate-900 text-white rounded-full text-[10px] font-bold uppercase tracking-wider">
              Most Popular
            </span>
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Professional</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono text-slate-900">£49</span>
                <span className="text-xs text-slate-500">/month</span>
              </div>
              <p className="text-xs text-slate-600">For established firms managing high-volume client document queues.</p>
              <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-slate-100">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Up to 60 active clients</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Multi-staff assignment</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Custom email chase copy</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Document rejection feedback</span>
                </li>
              </ul>
            </div>
            <button
              onClick={onLaunchApp}
              className="w-full py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors shadow-xs"
            >
              Get Started
            </button>
          </div>

          {/* Practice Plan */}
          <div className="bg-white p-6 rounded-xl border border-slate-200/90 shadow-2xs space-y-5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Practice</div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold font-mono text-slate-900">£99</span>
                <span className="text-xs text-slate-500">/month</span>
              </div>
              <p className="text-xs text-slate-600">For growing accounting practices with multiple partners and staff.</p>
              <ul className="text-xs text-slate-700 space-y-2 pt-2 border-t border-slate-100">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Unlimited active clients</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Custom practice logo branding</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Priority API & notification logs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Dedicated practice onboarding</span>
                </li>
              </ul>
            </div>
            <button
              onClick={onLaunchApp}
              className="w-full py-2 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            >
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-16 bg-white border-t border-slate-200/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">FAQ</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Frequently Asked Questions</h2>
          </div>

          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map((faq, idx) => (
              <div key={idx} className="py-4">
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full flex items-center justify-between text-left text-sm font-semibold text-slate-900"
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${openFaq === idx ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === idx && (
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed pr-6">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Banner */}
      <section className="py-20 px-4 sm:px-6 bg-slate-900 text-white text-center space-y-6">
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight max-w-2xl mx-auto">
          Ready to stop chasing clients for documents?
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          Launch your firm's live DocumentChaser workspace right now. No setup fee.
        </p>
        <div>
          <button
            onClick={onLaunchApp}
            className="px-6 py-3 text-sm font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-sm transition-colors"
          >
            Open DocumentChaser Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-slate-950 text-slate-500 text-xs px-4 sm:px-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          &copy; {new Date().getFullYear()} DocumentChaser. All rights reserved.
        </div>
        <div className="flex items-center gap-6">
          <a href="#problem" className="hover:text-slate-300">The Problem</a>
          <a href="#how-it-works" className="hover:text-slate-300">How It Works</a>
          <a href="#pricing" className="hover:text-slate-300">Pricing</a>
          <button onClick={onLaunchApp} className="hover:text-white font-medium">Practice Login</button>
        </div>
      </footer>
    </div>
  );
};
