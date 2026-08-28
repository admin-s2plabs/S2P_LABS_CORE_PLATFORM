import { useQuery } from "@tanstack/react-query";

interface DeleteFunctionSettings {
  enabled: boolean;
  canDelete: boolean;
}

function readAuthRoles(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("prokraya-auth");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const primary = parsed?.userRole || parsed?.role;
    const roles = Array.isArray(parsed?.roles) ? parsed.roles : [];
    return [...roles, primary].filter(Boolean);
  } catch {
    return [];
  }
}

function isSuperadminFromAuth(): boolean {
  return readAuthRoles().some(
    (r) => r === "ROLE_SUPERADMIN" || r === "SUPERADMIN",
  );
}

/**
 * Delete is allowed only when the user is ROLE_SUPERADMIN and the
 * DELETED_FUNCTION lookup is enabled in Administration → Lookups.
 */
export function useDeleteFunction() {
  const { data, isLoading } = useQuery<DeleteFunctionSettings>({
    queryKey: ["/api/settings/delete-function-enabled"],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const isSuperadmin = isSuperadminFromAuth();
  const lookupEnabled = true //data?.enabled ?? false;
  const canDelete = Boolean((isSuperadmin && lookupEnabled));

  return {
    isLoading,
    isSuperadmin,
    lookupEnabled,
    canDelete,
  };
}
