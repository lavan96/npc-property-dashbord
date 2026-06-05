import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface PresenceUser {
  user_id: string;
  name: string;
  color: string;
  page_id?: string | null;
  online_at: string;
}

interface TemplatePresenceBarProps {
  templateId: string;
  currentUserId?: string | null;
  currentUserName?: string | null;
  activePageId?: string | null;
}

const PALETTE = ['#D4A843', '#7AB7FF', '#8AE6A2', '#F4A0C5', '#C99BFF', '#FFB36B', '#73E3D6'];
function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function TemplatePresenceBar({ templateId, currentUserId, currentUserName, activePageId }: TemplatePresenceBarProps) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!templateId || !currentUserId) return;
    const ch = supabase.channel(`tpl-presence:${templateId}`, {
      config: { presence: { key: currentUserId } },
    });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, PresenceUser[]>;
      const flat: PresenceUser[] = [];
      for (const arr of Object.values(state)) {
        if (arr.length) flat.push(arr[0]);
      }
      setUsers(flat);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({
          user_id: currentUserId,
          name: currentUserName || 'Anon',
          color: colorFor(currentUserId),
          page_id: activePageId ?? null,
          online_at: new Date().toISOString(),
        });
      }
    });

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [templateId, currentUserId, currentUserName]);

  // Update page_id when it changes
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !currentUserId) return;
    ch.track({
      user_id: currentUserId,
      name: currentUserName || 'Anon',
      color: colorFor(currentUserId),
      page_id: activePageId ?? null,
      online_at: new Date().toISOString(),
    }).catch(() => {});
  }, [activePageId, currentUserId, currentUserName]);

  if (users.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex items-center -space-x-2">
        {users.slice(0, 5).map((u) => {
          const initials = (u.name || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
          return (
            <Tooltip key={u.user_id}>
              <TooltipTrigger asChild>
                <Avatar
                  className="h-7 w-7 ring-2 ring-background text-[10px]"
                  style={{ backgroundColor: u.color }}
                >
                  <AvatarFallback className="bg-transparent text-foreground font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="font-semibold">{u.name}</div>
                {u.page_id && <div className="text-muted-foreground">on page {u.page_id.slice(0, 8)}</div>}
              </TooltipContent>
            </Tooltip>
          );
        })}
        {users.length > 5 && (
          <div className="h-7 w-7 rounded-full ring-2 ring-background bg-muted text-[10px] flex items-center justify-center font-semibold">
            +{users.length - 5}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
