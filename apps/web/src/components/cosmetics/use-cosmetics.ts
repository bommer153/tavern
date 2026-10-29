'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AppearanceInput, type CosmeticCollection, DEFAULT_BACKGROUND } from '@tavern/shared';
import { api } from '@/lib/api';

const KEY = ['cosmetics', 'me'];
export const DEFAULT_APPEARANCE = { frame: null, background: DEFAULT_BACKGROUND, followRoomTheme: true, animated: true, intensity: 70, parallax: true };

/** The signed-in user's collection and appearance. Appearance edits apply optimistically and roll back on error. */
export function useCosmetics(enabled = true) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => api.cosmetics.mine(), enabled });
  const save = useMutation({
    mutationFn: (b: AppearanceInput) => api.cosmetics.setAppearance(b),
    onMutate: async (b) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<CosmeticCollection>(KEY);
      if (prev) qc.setQueryData<CosmeticCollection>(KEY, { ...prev, appearance: { ...prev.appearance, ...b } as CosmeticCollection['appearance'] });
      return { prev };
    },
    onError: (_e, _b, ctx) => ctx?.prev && qc.setQueryData(KEY, ctx.prev),
    onSuccess: (appearance) => qc.setQueryData<CosmeticCollection>(KEY, (c) => (c ? { ...c, appearance } : c)),
  });
  return { ...q, appearance: q.data?.appearance ?? DEFAULT_APPEARANCE, owned: new Set(q.data?.owned ?? [DEFAULT_BACKGROUND]), save };
}
