"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

interface ApprovalRequest {
  id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  description: string | null;
  submitted_at: string;
  profiles: { full_name: string | null } | null;
}

type ApprovalAction = "APPROVE" | "REJECT" | "REQUEST_REVISION";

export default function ApprovalPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [actorId, setActorId] = useState<string | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk membuka persetujuan.");

        const { data: membership, error: membershipError } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("is_active", "true")
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki membership organisasi aktif.");

        const [{ data: canApprove, error: permError }, { data: pending, error: requestsError }] = await Promise.all([
          supabase.rpc("has_org_permission", {
            p_org_id: membership.organization_id,
            p_permission_code: "approval.approve",
          }),
          supabase
            .from("approval_requests")
            .select("id, entity_type, entity_id, title, description, submitted_at, profiles!approval_requests_requested_by_fkey(full_name)")
            .eq("organization_id", membership.organization_id)
            .eq("status", "PENDING")
            .order("submitted_at", { ascending: true }),
        ]);
        if (permError) throw permError;
        if (requestsError) throw requestsError;

        if (!cancelled) {
          setActorId(userId);
          setCanApprove(Boolean(canApprove));
          setRequests((pending || []) as unknown as ApprovalRequest[]);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat persetujuan.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function decide(request: ApprovalRequest, action: ApprovalAction) {
    if (!actorId) return;
    const comment = comments[request.id]?.trim() || "";
    if (action !== "APPROVE" && !comment) {
      setError("Komentar wajib diisi untuk penolakan atau revisi.");
      return;
    }

    setActingId(request.id);
    setError(null);
    try {
      const supabase = createClient();
      const { error: actionError } = await supabase.rpc("decide_approval_request", {
        p_approval_request_id: request.id,
        p_action: action,
        p_comment: comment || null,
        p_actor_user_id: actorId,
      });
      if (actionError) throw actionError;

      const { data: refreshed, error: refreshError } = await supabase
        .from("approval_requests")
        .select("id, entity_type, entity_id, title, description, submitted_at, profiles!approval_requests_requested_by_fkey(full_name)")
        .eq("id", request.id)
        .eq("status", "PENDING")
        .maybeSingle();
      if (refreshError) throw refreshError;
      setRequests((current) => refreshed
        ? current.map((item) => item.id === request.id ? refreshed as unknown as ApprovalRequest : item)
        : current.filter((item) => item.id !== request.id));
      setComments((current) => ({ ...current, [request.id]: "" }));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Gagal memproses persetujuan.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="ADMINISTRASI" title="Persetujuan" description="Tinjau dan putuskan permintaan yang menunggu otorisasi." />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat permintaan persetujuan...</div>
        ) : !canApprove ? (
          <div className="rounded-xl border border-line bg-white p-8 text-sm text-slate-600">Aksi persetujuan hanya tersedia untuk Director organisasi.</div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">Tidak ada permintaan yang menunggu persetujuan.</div>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-white">
            {requests.map((request) => (
              <article key={request.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-ink">{request.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">{request.description || request.entity_type}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {request.profiles?.full_name || "Pemohon"} · {request.entity_type} · {new Date(request.submitted_at).toLocaleString("id-ID")}
                    </p>
                  </div>
                  <StatusBadge tone="warning">Menunggu</StatusBadge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Textarea
                    rows={2}
                    aria-label={`Komentar untuk ${request.title}`}
                    placeholder="Komentar untuk penolakan atau permintaan revisi"
                    value={comments[request.id] || ""}
                    onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))}
                  />
                  <div className="flex flex-wrap items-start gap-2">
                    <Button size="sm" loading={actingId === request.id} disabled={actingId !== null} onClick={() => void decide(request, "APPROVE")}>Setujui</Button>
                    <Button size="sm" variant="secondary" disabled={actingId !== null} onClick={() => void decide(request, "REQUEST_REVISION")}>Minta revisi</Button>
                    <Button size="sm" variant="danger" disabled={actingId !== null} onClick={() => void decide(request, "REJECT")}>Tolak</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
