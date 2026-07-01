import { cn } from "@/lib/utils";

export const settingsCardClass =
  "min-w-0 overflow-hidden rounded-2xl border-border/70 bg-card/90 shadow-[0_18px_44px_hsl(var(--foreground)/0.07)] ring-1 ring-primary/5 dark:border-white/10 dark:bg-slate-950/80 dark:shadow-black/30";

export const settingsAccentCardClass =
  "min-w-0 overflow-hidden rounded-2xl border-primary/20 bg-[linear-gradient(145deg,hsl(var(--card)),hsl(var(--muted)/0.18))] shadow-[0_18px_44px_hsl(var(--foreground)/0.07)] ring-1 ring-primary/10 dark:border-primary/25 dark:bg-slate-950/80 dark:shadow-black/30";

export const settingsPanelClass =
  "min-w-0 rounded-2xl border border-border/60 bg-background/45 p-4 dark:border-white/10 dark:bg-slate-950/35";

export const settingsSubtlePanelClass =
  "rounded-2xl border border-border/60 bg-muted/25 p-3 text-xs leading-5 text-muted-foreground dark:border-white/10";

export const settingsPrimaryButtonClass =
  "bg-primary font-semibold text-primary-foreground shadow-[0_12px_30px_hsl(var(--primary)/0.20)] hover:bg-primary-hover disabled:shadow-none";

export const settingsPillButtonClass = "rounded-full font-semibold";

export const settingsInputClass = "min-w-0 focus-visible:ring-primary";

export const settingsSwitchClass = "shrink-0 data-[state=checked]:bg-primary";

export const settingsBadgePillClass = "shrink-0 rounded-full";

export const settingsDangerButtonClass =
  "rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive disabled:text-muted-foreground";

export const settingsDialogClass = "rounded-2xl border-border/70 bg-card/95";

export function settingsCx(
  ...classes: Array<string | undefined | null | false>
) {
  return cn(...classes);
}
