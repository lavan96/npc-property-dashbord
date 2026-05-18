import { useEffect, useState, useCallback } from 'react';
import { invokeSecureFunction } from '@/lib/secureInvoke';

export interface UserName {
  id: string;
  username: string | null;
  email: string | null;
}

const cache = new Map<string, UserName>();

/**
 * Resolve a list of user IDs to their usernames/emails.
 * Results are cached in-memory across components for the session.
 */
export function useUserNames(userIds: (string | null | undefined)[]) {
  const [names, setNames] = useState<Record<string, UserName>>({});

  const load = useCallback(async (ids: string[]) => {
    const missing = ids.filter((id) => !cache.has(id));
    if (missing.length === 0) {
      // Hydrate from cache
      const result: Record<string, UserName> = {};
      ids.forEach((id) => {
        const u = cache.get(id);
        if (u) result[id] = u;
      });
      setNames(result);
      return;
    }

    try {
      const { data, error } = await invokeSecureFunction<{ success: boolean; users: UserName[] }>(
        'get-user-names',
        { userIds: missing },
      );
      if (!error && data?.success) {
        (data.users || []).forEach((u) => cache.set(u.id, u));
      }
    } catch (e) {
      console.warn('[useUserNames] failed', e);
    }

    const result: Record<string, UserName> = {};
    ids.forEach((id) => {
      const u = cache.get(id);
      if (u) result[id] = u;
    });
    setNames(result);
  }, []);

  useEffect(() => {
    const unique = Array.from(
      new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
    );
    if (unique.length === 0) {
      setNames({});
      return;
    }
    load(unique);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIds.join(',')]);

  /** Display label: username, then email-local-part, then short id, then "System". */
  const labelFor = useCallback(
    (id: string | null | undefined): string => {
      if (!id) return 'System';
      const u = names[id] || cache.get(id);
      if (!u) return 'Loading…';
      return u.username || (u.email ? u.email.split('@')[0] : null) || id.slice(0, 8);
    },
    [names],
  );

  return { names, labelFor };
}
