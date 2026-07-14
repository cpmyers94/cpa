import type { SupabaseClient } from "@supabase/supabase-js";

export async function renameHousehold(
  supabase: SupabaseClient,
  householdId: string,
  name: string
) {
  const { error } = await supabase
    .from("households")
    .update({ name })
    .eq("id", householdId);
  if (error) throw error;
}

export async function setSharedEditing(
  supabase: SupabaseClient,
  householdId: string,
  value: boolean
) {
  const { error } = await supabase
    .from("households")
    .update({ shared_editing: value })
    .eq("id", householdId);
  if (error) throw error;
}

export async function regenerateInviteCode(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("regenerate_invite_code");
  if (error) throw error;
  return data as string;
}

export async function joinHousehold(supabase: SupabaseClient, code: string) {
  const { error } = await supabase.rpc("join_household", { p_code: code });
  if (error) throw error;
}

export async function leaveHousehold(supabase: SupabaseClient) {
  const { error } = await supabase.rpc("leave_household");
  if (error) throw error;
}
