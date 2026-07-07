import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Download, Check, X, Package, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface Skill {
  id: string; slug: string; name: string; description: string | null; icon: string | null;
  allowed_tools: string[] | null; default_model: string | null;
  install_count: number; avg_success_rate: number | null; run_count: number;
  is_installed?: boolean;
}
interface Install {
  id: string; skill_id: string; installed_at: string;
  skill_snapshot: any; overrides: any;
}

async function invoke(action: string, payload: Record<string, any> = {}) {
  const { data, error } = await supabase.functions.invoke('agent-skill-marketplace', { body: { action, ...payload } });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export default function AgentSkills() {
  const [available, setAvailable] = useState<Skill[]>([]);
  const [installed, setInstalled] = useState<Install[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, i] = await Promise.all([invoke('list-available'), invoke('list-installed')]);
      setAvailable(a.skills ?? []);
      setInstalled(i.installs ?? []);
    } catch (e) { toast.error(String((e as Error).message)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const doInstall = async (skill: Skill) => {
    setBusy(skill.id);
    try { await invoke('install', { skill_id: skill.id }); toast.success(`Installed "${skill.name}"`); await refresh(); }
    catch (e) { toast.error(String((e as Error).message)); }
    finally { setBusy(null); }
  };
  const doUninstall = async (skillId: string) => {
    setBusy(skillId);
    try { await invoke('uninstall', { skill_id: skillId }); toast.success('Uninstalled'); await refresh(); }
    catch (e) { toast.error(String((e as Error).message)); }
    finally { setBusy(null); }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Package className="h-6 w-6 text-primary" /> Agent Skill Marketplace</h1>
        <p className="text-sm text-muted-foreground">Curated agent personas and toolsets. Install to teach your Aurixa Agent new behaviours.</p>
      </div>

      <Tabs defaultValue="available">
        <TabsList>
          <TabsTrigger value="available">Available <Badge variant="outline" className="ml-2 text-[10px]">{available.length}</Badge></TabsTrigger>
          <TabsTrigger value="installed">Installed <Badge variant="outline" className="ml-2 text-[10px]">{installed.length}</Badge></TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="mt-4">
          {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
          {!loading && !available.length && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              No public skills yet. Publish one of your own from the Skills settings.
            </CardContent></Card>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {available.map((s) => (
              <Card key={s.id} className="hover:border-primary/50 transition">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{s.icon ? `${s.icon} ` : ''}{s.name}</CardTitle>
                      <div className="text-[11px] font-mono text-muted-foreground mt-0.5">{s.slug}</div>
                    </div>
                    {s.is_installed
                      ? <Badge variant="outline" className="text-[10px] gap-1"><Check className="h-3 w-3" /> Installed</Badge>
                      : <Button size="sm" variant="outline" onClick={() => doInstall(s)} disabled={busy === s.id}>
                          {busy === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Download className="h-3 w-3 mr-1" /> Install</>}
                        </Button>}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {s.description && <p className="text-xs text-muted-foreground line-clamp-3">{s.description}</p>}
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    <span>{s.install_count ?? 0} installs</span>
                    <span>·</span>
                    <span>{s.run_count ?? 0} runs</span>
                    {s.avg_success_rate != null && (<><span>·</span><span>{Math.round(s.avg_success_rate * 100)}% success</span></>)}
                  </div>
                  {s.allowed_tools?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {s.allowed_tools.slice(0, 6).map((t) => <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>)}
                      {s.allowed_tools.length > 6 && <span className="text-[10px] text-muted-foreground">+{s.allowed_tools.length - 6} more</span>}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="installed" className="mt-4">
          {!installed.length && (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nothing installed yet.</CardContent></Card>
          )}
          <div className="space-y-2">
            {installed.map((i) => (
              <Card key={i.id}>
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{i.skill_snapshot?.icon ? `${i.skill_snapshot.icon} ` : ''}{i.skill_snapshot?.name ?? 'Skill'}</div>
                    <div className="text-[11px] text-muted-foreground">installed {new Date(i.installed_at).toLocaleDateString()}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => doUninstall(i.skill_id)} disabled={busy === i.skill_id}>
                    {busy === i.skill_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><X className="h-3 w-3 mr-1" /> Uninstall</>}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
