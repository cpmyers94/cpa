"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Household, HouseholdMember } from "@/lib/supabase/types";

type AuthContextValue = {
  supabase: SupabaseClient;
  user: User | null;
  household: Household | null;
  members: HouseholdMember[];
  loading: boolean;
  /** True if the signed-in user may edit a row authored by `authorId`. */
  canEdit: (authorId: string) => boolean;
  /** Display name for a member's user id (falls back to "someone"). */
  nameFor: (userId: string) => string;
  refreshHousehold: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHousehold = useCallback(
    async (currentUser: User) => {
      await supabase.rpc("ensure_household");

      const [{ data: households }, { data: memberRows }, { data: profiles }] =
        await Promise.all([
          supabase.from("households").select("*").limit(1),
          supabase.from("household_members").select("user_id, role"),
          supabase.from("profiles").select("id, display_name, email"),
        ]);

      const profileById = new Map(
        (profiles ?? []).map((p) => [p.id as string, p])
      );

      setHousehold((households?.[0] as Household) ?? null);
      setMembers(
        (memberRows ?? []).map((m) => {
          const profile = profileById.get(m.user_id as string);
          return {
            user_id: m.user_id as string,
            role: m.role as "owner" | "member",
            display_name:
              (profile?.display_name as string) ||
              (profile?.email as string) ||
              "Member",
            email: (profile?.email as string) ?? null,
            isSelf: m.user_id === currentUser.id,
          };
        })
      );
    },
    [supabase]
  );

  useEffect(() => {
    let active = true;

    async function init(nextUser: User | null) {
      if (!nextUser) {
        setUser(null);
        setHousehold(null);
        setMembers([]);
        setLoading(false);
        return;
      }
      setUser(nextUser);
      try {
        await loadHousehold(nextUser);
      } finally {
        if (active) setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) init(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) init(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadHousehold]);

  const refreshHousehold = useCallback(async () => {
    if (user) await loadHousehold(user);
  }, [user, loadHousehold]);

  const canEdit = useCallback(
    (authorId: string) =>
      Boolean(household?.shared_editing) || authorId === user?.id,
    [household, user]
  );

  const nameFor = useCallback(
    (userId: string) => {
      const member = members.find((m) => m.user_id === userId);
      if (!member) return "someone";
      return member.isSelf ? "you" : member.display_name;
    },
    [members]
  );

  const value = useMemo(
    () => ({
      supabase,
      user,
      household,
      members,
      loading,
      canEdit,
      nameFor,
      refreshHousehold,
    }),
    [supabase, user, household, members, loading, canEdit, nameFor, refreshHousehold]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20 text-sm text-neutral-400">
        Loading…
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
