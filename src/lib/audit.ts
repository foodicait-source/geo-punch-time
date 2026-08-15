import { supabase } from "@/integrations/supabase/client";

export type AuditEntity = "employee" | "office" | "attendance";

export interface AuditInput {
  action: string;
  entityType: AuditEntity;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: Record<string, unknown>;
}

/** Records an admin action. Never throws — logging must not break the action. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return;
    await supabase.from("audit_logs").insert({
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      details: (input.details ?? {}) as never,
    });
  } catch {
    /* ignore */
  }
}
