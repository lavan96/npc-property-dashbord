import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useFinancePortalAuth } from '@/hooks/useFinancePortalAuth';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, Briefcase, Users, MessageSquare, Wallet, Plus, Eye,
} from 'lucide-react';
import { smartCapitalize } from '@/lib/nameUtils';

export function FinanceCommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { invokeFinanceFunction, user } = useFinancePortalAuth();
  const isAuthenticated = !!user;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data: filesData } = useQuery({
    queryKey: ['finance-cmd-files'],
    queryFn: async () => {
      const { data } = await invokeFinanceFunction('finance-portal-purchase-files', { operation: 'list_files' });
      return data?.files || [];
    },
    enabled: isAuthenticated && open,
    staleTime: 30_000,
  });

  const { data: clientsData } = useQuery({
    queryKey: ['finance-cmd-clients'],
    queryFn: async () => {
      const { data } = await invokeFinanceFunction('finance-portal-client-data', { operation: 'list_assigned_clients' });
      return data?.records || [];
    },
    enabled: isAuthenticated && open,
    staleTime: 30_000,
  });

  const files = useMemo(() => (filesData || []).slice(0, 12), [filesData]);
  const clients = useMemo(() => (clientsData || []).slice(0, 12), [clientsData]);

  const go = (path: string) => { setOpen(false); navigate(path); };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a file, client, page… (⌘K)" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go('/finance')}><LayoutDashboard className="h-4 w-4 mr-2" /> Dashboard</CommandItem>
          <CommandItem onSelect={() => go('/finance/purchase-files')}><Briefcase className="h-4 w-4 mr-2" /> Active Purchase Files</CommandItem>
          <CommandItem onSelect={() => go('/finance/clients')}><Users className="h-4 w-4 mr-2" /> My Clients</CommandItem>
          <CommandItem onSelect={() => go('/finance/messages')}><MessageSquare className="h-4 w-4 mr-2" /> Messages</CommandItem>
          <CommandItem onSelect={() => go('/finance/earnings')}><Wallet className="h-4 w-4 mr-2" /> Earnings</CommandItem>
        </CommandGroup>

        {files.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Purchase Files">
              {files.map((f: any) => {
                const name = smartCapitalize(`${f.clients?.primary_first_name || ''} ${f.clients?.primary_surname || ''}`.trim());
                return (
                  <CommandItem
                    key={f.id}
                    value={`${f.title} ${name} ${f.property_address || ''} ${f.lender || ''}`}
                    onSelect={() => go(`/finance/purchase-files/${f.id}`)}
                  >
                    <Briefcase className="h-4 w-4 mr-2 text-primary" />
                    <span className="truncate">{f.title}</span>
                    {name && <span className="ml-2 text-xs text-muted-foreground truncate">· {name}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {clients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients">
              {clients.map((r: any) => {
                const name = r.client?.primary_contact_name || r.client?.primary_contact_email || r.client_id;
                return (
                  <CommandItem
                    key={r.client_id}
                    value={`${name} ${r.client?.primary_contact_email || ''}`}
                    onSelect={() => go(`/finance/clients/${r.client_id}`)}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    <span className="truncate">{smartCapitalize(name)}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => go('/finance/purchase-files?new=1')}>
            <Plus className="h-4 w-4 mr-2" /> New purchase file
          </CommandItem>
          <CommandItem onSelect={() => go('/finance/purchase-files?inbox=watching')}>
            <Eye className="h-4 w-4 mr-2" /> View watchlist
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
