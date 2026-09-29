CREATE OR REPLACE FUNCTION public.generate_contract_number(p_org_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(rc.contract_number FROM 5 FOR 4) AS int)
  ), 0) + 1
  INTO v_seq
  FROM "public"."rental_contracts" rc
  WHERE rc.organization_id = p_org_id
    AND rc.contract_number LIKE 'CNT-' || v_year || '-%';
  
  RETURN 'CNT-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$function$
