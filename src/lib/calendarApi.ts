import { supabase } from "./supabase";

export type CalendarEvent = {
  id?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  status?: "scheduled" | "draft" | "completed" | "cancelled";
  source?: string;
  related_type?: string | null;
  related_id?: string | null;
};

export async function listCalendarEvents(userId: string, startISO: string, endISO: string) {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .gte("start_at", startISO)
    .lte("end_at", endISO)
    .order("start_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertCalendarEvent(userId: string, event: CalendarEvent) {
  const payload: any = {
    ...event,
    user_id: userId,
    status: event.status || "scheduled",
    source: event.source || "manual",
  };

  const { data, error } = await supabase
    .from("calendar_events")
    .upsert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCalendarEvent(userId: string, id: string) {
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
  return true;
}
