import { trpc } from "@/lib/trpc";

export function useAuth() {
  const auth = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation({ onSuccess: () => utils.auth.me.setData(undefined, null) });
  return {
    user: auth.data ?? null,
    loading: auth.isLoading,
    isAuthenticated: Boolean(auth.data),
    logout: () => logoutMutation.mutateAsync(),
    isLoggingOut: logoutMutation.isPending,
  };
}
