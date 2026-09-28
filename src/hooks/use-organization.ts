"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Organization, BusinessUnit, ColdStorage, Warehouse } from "@/lib/master-data";

interface UseOrganizationResult {
  organization: Organization | null;
  membership: { organization_id: string; role_id: string } | null;
  isLoading: boolean;
  error: Error | null;
}

export function useOrganization() {
  const [result, setResult] = useState<UseOrganizationResult>({
    organization: null,
    membership: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getClaims();
        const claims = claimsData?.claims;
        
        if (!claims) {
          setResult({ organization: null, membership: null, isLoading: false, error: null });
          return;
        }

        const userId = claims.sub;
        const { data: membership } = await supabase
          .from("organization_memberships")
          .select("organization_id, role_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();

        if (!membership) {
          setResult({ organization: null, membership: null, isLoading: false, error: null });
          return;
        }

        const { data: organization } = await supabase
          .from("organizations")
          .select("id, name, code")
          .eq("id", membership.organization_id)
          .maybeSingle();

        setResult({
          organization: organization as Organization | null,
          membership,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        setResult({ organization: null, membership: null, isLoading: false, error: err as Error });
      }
    }

    fetchData();
  }, []);

  return result;
}

export function useMasterData(organizationId: string | null) {
  const [data, setData] = useState<{
    warehouses: Warehouse[];
    coldStorages: ColdStorage[];
    businessUnits: BusinessUnit[];
  }>({ warehouses: [], coldStorages: [], businessUnits: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!organizationId) return;
    
    setIsLoading(true);
    try {
      const supabase = createClient();
      const [warehousesRes, coldStoragesRes, businessUnitsRes] = await Promise.all([
        supabase.from("warehouses").select("*").eq("organization_id", organizationId).eq("active", true),
        supabase.from("cold_storages").select("*").eq("organization_id", organizationId).eq("status", "ACTIVE"),
        supabase.from("business_units").select("*").eq("organization_id", organizationId).eq("active", true),
      ]);

      setData({
        warehouses: (warehousesRes.data || []) as Warehouse[],
        coldStorages: (coldStoragesRes.data || []) as ColdStorage[],
        businessUnits: (businessUnitsRes.data || []) as BusinessUnit[],
      });
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  return { ...data, isLoading, error, refetch: fetchData };
}
