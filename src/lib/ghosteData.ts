import { supabase } from "@/lib/supabase.client";

export async function loadBio(userId: string) {
  const { data, error } = await supabase
    .from("artist_bios")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveBio(userId: string, payload: any) {
  const clean = { ...payload, user_id: userId };
  const { data, error } = await supabase
    .from("artist_bios")
    .upsert(clean, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function listShows(userId: string) {
  const { data, error } = await supabase
    .from("artist_shows")
    .select("*")
    .eq("user_id", userId)
    .order("show_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createShow(userId: string, payload: any) {
  const { data, error } = await supabase
    .from("artist_shows")
    .insert([{ ...payload, user_id: userId }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateShow(userId: string, id: string, patch: any) {
  const { data, error } = await supabase
    .from("artist_shows")
    .update({ ...patch })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShow(userId: string, id: string) {
  const { error } = await supabase
    .from("artist_shows")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  return true;
}

export async function listPreSaves(userId: string) {
  const { data, error } = await supabase
    .from("pre_saves")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function savePreSave(userId: string, payload: any) {
  if (payload?.id) {
    const { data, error } = await supabase
      .from("pre_saves")
      .update({ ...payload })
      .eq("id", payload.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("pre_saves")
    .insert([{ ...payload, user_id: userId }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listPreSaveLinks(userId: string, preSaveId: string) {
  const { data, error } = await supabase
    .from("pre_save_links")
    .select("*")
    .eq("user_id", userId)
    .eq("pre_save_id", preSaveId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addPreSaveLink(userId: string, preSaveId: string, payload: any) {
  const { data, error } = await supabase
    .from("pre_save_links")
    .insert([{ ...payload, user_id: userId, pre_save_id: preSaveId }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updatePreSaveLink(userId: string, id: string, patch: any) {
  const { data, error } = await supabase
    .from("pre_save_links")
    .update({ ...patch })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deletePreSaveLink(userId: string, id: string) {
  const { error } = await supabase
    .from("pre_save_links")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
  return true;
}
