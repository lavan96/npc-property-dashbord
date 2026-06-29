/**
 * Batch 13 #67 — Onboarding tour for finance partners.
 * Highlights each sidebar destination on first login. Completion is cached in
 * localStorage and (optionally) persisted via finance_partner_ui_prefs.prefs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ArrowRight, X, Sparkles, CheckCircle2, LayoutDashboard, Briefcase, Layers, Users,
  MessageSquare, Inbox, BookOpen, Trophy,
} from 'lucide-react';

const STORAGE_KEY = 'finance_tour_completed_v1';

interface TourStep {
  selector: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const STEPS: TourStep[] = [
  { selector: '[data-tour="dashboard"]', title: 'Your dashboard', description: 'Today\'s briefing, KPIs, streaks and what changed since you last logged in.', icon: LayoutDashboard },
  { selector: '[data-tour="purchase-files"]', title: 'Active purchase files', description: 'Every live deal room with critical dates, status and risk flags. This is your day.', icon: Briefcase },
  { selector: '[data-tour="pipeline"]', title: 'Pipeline Kanban', description: 'Drag files between stages, spot what\'s stuck, and keep momentum visible.', icon: Layers },
  { selector: '[data-tour="clients"]', title: 'My clients', description: 'Every assigned client with their engagement score and full purchase file history.', icon: Users },
  { selector: '[data-tour="messages"]', title: 'Messages', description: 'Direct portal messaging — clients see everything you share here in real-time.', icon: MessageSquare },
  { selector: '[data-tour="client-inbox"]', title: 'Unified client inbox', description: 'Email, SMS, WhatsApp and portal messages stitched into one timeline per client.', icon: Inbox },
  { selector: '[data-tour="lender-intelligence"]', title: 'Lender intelligence', description: 'Live rates, lender filters and side-by-side comparisons from the Command Centre.', icon: BookOpen },
  { selector: '[data-tour="insights"]', title: 'Pipeline insights', description: 'Lender leaderboard, stuck files and win/loss analytics.', icon: Trophy },
];

function hasCompleted() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function markCompleted() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
}

export function resetFinanceTour() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function FinanceOnboardingTour() {
  const { user } = useFinancePortalAuth();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(-1); // -1 = welcome
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    if (hasCompleted()) return;
    const t = setTimeout(() => setActive(true), 900);
    return () => clearTimeout(t);
  }, [user]);

  useEffect(() => {
    const onCustom = () => { resetFinanceTour(); setStep(-1); setActive(true); };
    window.addEventListener('finance:start-tour', onCustom);
    return () => window.removeEventListener('finance:start-tour', onCustom);
  }, []);

  const cleanup = useCallback(() => {
    STEPS.forEach(s => {
      const el = document.querySelector(s.selector) as HTMLElement | null;
      if (el) { el.style.position = ''; el.style.zIndex = ''; el.style.boxShadow = ''; el.style.borderRadius = ''; }
    });
  }, []);

  const position = useCallback((idx: number) => {
    if (idx < 0 || idx >= STEPS.length) return;
    const s = STEPS[idx];
    const el = document.querySelector(s.selector) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.position = 'relative';
    el.style.zIndex = '60';
    el.style.borderRadius = '12px';
    el.style.boxShadow = '0 0 0 4px hsl(var(--primary) / 0.35)';
    const mobile = window.innerWidth < 768;
    if (mobile) {
      setPos({ top: Math.min(r.bottom + 12, window.innerHeight - 320), left: 16 });
    } else {
      setPos({ top: Math.max(r.top - 20, 80), left: r.right + 20 });
    }
  }, []);

  useEffect(() => {
    if (step >= 0) { cleanup(); position(step); }
    return () => cleanup();
  }, [step, position, cleanup]);

  const finish = () => {
    cleanup();
    markCompleted();
    setActive(false);
    setStep(-1);
  };

  if (!active) return null;
  const isWelcome = step === -1;
  const current = step >= 0 ? STEPS[step] : null;
  const Icon = current?.icon;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background dark:bg-black/55 backdrop-blur-sm" />
      {isWelcome ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 fade-in duration-300">
            <div className="text-center space-y-5">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Welcome to the Finance Portal</h2>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  Two minutes to see what's where. You can replay the tour anytime from Settings → Display.
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-2">
                <Button onClick={() => setStep(0)} size="lg" className="w-full gap-2">
                  Start tour <ArrowRight className="h-4 w-4" />
                </Button>
                <Button onClick={finish} variant="ghost" size="sm" className="text-muted-foreground">
                  Skip for now
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : current && Icon ? (
        <div
          ref={ref}
          className="fixed z-[60] w-[340px] md:w-[380px] animate-in fade-in slide-in-from-left-3 duration-200"
          style={{ top: `${pos.top}px`, left: `${pos.left}px`, maxWidth: 'calc(100vw - 32px)' }}
        >
          <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-primary/5 px-5 py-4 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
                <h3 className="font-semibold text-foreground text-base">{current.title}</h3>
              </div>
              <button onClick={finish} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{current.description}</p>
            </div>
            <div className="px-5 py-3 bg-muted/30 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <div key={i} className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === step ? 'w-6 bg-primary' : i < step ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-muted-foreground/20'
                  )} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">{step + 1}/{STEPS.length}</span>
                <Button
                  onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : finish())}
                  size="sm"
                  className="gap-1.5 h-8"
                >
                  {step === STEPS.length - 1
                    ? <>Finish <CheckCircle2 className="h-3.5 w-3.5" /></>
                    : <>Next <ArrowRight className="h-3.5 w-3.5" /></>}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
