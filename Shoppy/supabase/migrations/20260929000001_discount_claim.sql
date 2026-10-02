-- ============================================================================
-- SHOPY · 20260929000001_discount_claim
-- Incremento atómico de uso de cupón (límite a prueba de carreras).
-- ============================================================================

create or replace function public.claim_discount_usage(p_discount_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean := false;
begin
  update public.discounts
  set usage_count = usage_count + 1,
      updated_at = now()
  where id = p_discount_id
    and (usage_limit is null or usage_count < usage_limit)
  returning true into claimed;
  return coalesce(claimed, false);
end $$;
