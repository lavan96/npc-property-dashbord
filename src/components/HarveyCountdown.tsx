import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PartyPopper, Rocket } from 'lucide-react';

const TARGET_DATE = new Date('2026-02-28T00:00:00').getTime();

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

function getTimeLeft(): TimeLeft {
  const now = Date.now();
  const diff = Math.max(TARGET_DATE - now, 0);
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    milliseconds: Math.floor(diff % 1000),
  };
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, '0');
}

const DigitBlock = ({ value, label }: { value: string; label: string }) => (
  <div className="flex flex-col items-center gap-1">
    <div className="bg-background/80 border border-primary/30 rounded-lg px-3 py-2 min-w-[56px] text-center shadow-[0_0_15px_hsl(var(--primary)/0.15)]">
      <span className="font-mono text-2xl sm:text-3xl font-bold text-primary tracking-wider">
        {value}
      </span>
    </div>
    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
  </div>
);

const Separator = () => (
  <span className="font-mono text-2xl sm:text-3xl font-bold text-primary/60 self-start mt-2 animate-pulse">:</span>
);

export function HarveyCountdown() {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState<TimeLeft>(getTimeLeft);
  const rafRef = useRef<number>();

  // Show once per session
  useEffect(() => {
    const key = 'harvey_countdown_dismissed';
    if (!sessionStorage.getItem(key)) {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const tick = () => {
      setTime(getTimeLeft());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  const handleClose = () => {
    sessionStorage.setItem('harvey_countdown_dismissed', '1');
    setOpen(false);
  };

  const isComplete = time.days === 0 && time.hours === 0 && time.minutes === 0 && time.seconds === 0 && time.milliseconds === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg border-primary/20 bg-gradient-to-b from-card to-background p-0 overflow-hidden">
        {/* Header glow */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent pointer-events-none" />

        <div className="relative flex flex-col items-center text-center px-6 pt-8 pb-6 gap-5">
          {/* Icon */}
          <div className="flex items-center gap-2">
            <PartyPopper className="h-6 w-6 text-primary animate-bounce" />
            <Rocket className="h-6 w-6 text-primary animate-bounce [animation-delay:150ms]" />
          </div>

          {/* Title */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">
              Harvey Goes Full-Time In
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Feb 28, 2026 &bull; The day job era ends 🎉
            </p>
          </div>

          {isComplete ? (
            <div className="py-6">
              <p className="text-3xl font-bold text-primary animate-pulse">
                🎉 HE'S HERE FULL-TIME! 🎉
              </p>
            </div>
          ) : (
            /* Timer */
            <div className="flex items-start gap-1.5 sm:gap-2 flex-wrap justify-center">
              <DigitBlock value={pad(time.days)} label="Days" />
              <Separator />
              <DigitBlock value={pad(time.hours)} label="Hrs" />
              <Separator />
              <DigitBlock value={pad(time.minutes)} label="Min" />
              <Separator />
              <DigitBlock value={pad(time.seconds)} label="Sec" />
              <Separator />
              <DigitBlock value={pad(time.milliseconds, 3)} label="Ms" />
            </div>
          )}

          <Button onClick={handleClose} variant="outline" className="border-primary/30 hover:bg-primary/10 text-foreground mt-2">
            Let's Go! 🚀
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
