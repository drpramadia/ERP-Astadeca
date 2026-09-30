"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_CATEGORIES, type DocumentType } from "@/lib/documents/types";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

interface Document {
  id: string;
  document_type: DocumentType;
  document_number: string;
  document_date: string;
  status: string;
  title: string;
  reference_number?: string;
  reference_type?: string;
  customer?: { name: string; code: string };
  supplier?: { name: string; code: string };
  verification_token: string;
  created_at: string;
}

export default function DocumentCenterPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (membership) {
        setOrganizationId(membership.organization_id);
      }
    }
    init();
  }, []);

  useEffect(() => {
    async function fetchDocuments() {
      if (!organizationId) return;
      setLoading(true);

      const supabase = createClient();
      let query = supabase
        .from("documents")
        .select(`
          id, document_type, document_number, document_date, status, title,
          reference_number, reference_type,
          customer:customers(name, code),
          supplier:suppliers(name, code),
          verification_token, created_at
        `, { count: 'exact' })
        .eq("organization_id", organizationId)
        .order("document_date", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (search) {
        query = query.or(`document_number.ilike.%${search}%,title.ilike.%${search}%`);
      }
      if (selectedType) {
        query = query.eq("document_type", selectedType);
      }
      if (selectedCategory) {
        const types = DOCUMENT_CATEGORIES[selectedCategory] || [];
        query = query.in("document_type", types);
      }

      const { data, error, count } = await query;
      
      if (!error && data) {
        setDocuments(data as unknown as Document[]);
        setTotal(count || 0);
      }
      setLoading(false);
    }
    fetchDocuments();
  }, [organizationId, search, selectedCategory, selectedType, page]);

  const getStatusBadge = (status: string) => {
    const tones: Record<string, string> = {
      DRAFT: "neutral",
      PENDING: "warning",
      APPROVED: "info",
      ISSUED: "success",
      CANCELLED: "danger",
      VOID: "danger",
    };
    return <StatusBadge tone={tones[status] as "neutral" | "warning" | "info" | "success" | "danger"}>{status}</StatusBadge>;
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <AppShell>
      <PageHeader
        title="Document Center"
        description="Pusat dokumen dan arsip resmi"
      />

      {/* Search & Filters */}
      <div className="bg-white rounded-2xl border border-line p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Cari nomor dokumen, judul..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={() => { setSelectedCategory(""); setSelectedType(""); setPage(1); }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              !selectedCategory && !selectedType
                ? "bg-ink text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }}
          >
            Semua
          </button>
          {Object.keys(DOCUMENT_CATEGORIES).map((category) => (
            <button
              key={category}
              onClick={() => { setSelectedCategory(category); setSelectedType(""); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                selectedCategory === category
                  ? "bg-ink text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Type Dropdown */}
        {selectedCategory && (
          <div className="flex flex-wrap gap-2 mt-2">
            {DOCUMENT_CATEGORIES[selectedCategory]?.map((type) => (
              <button
                key={type}
                onClick={() => { setSelectedType(type); setPage(1); }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  selectedType === type
                    ? "bg-primary text-white"
                    : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                }}
              >
                {DOCUMENT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Document List */}
      <div className="bg-white rounded-2xl border border-line overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">
            Memuat dokumen...
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <div className="text-4xl mb-2">📄</div>
            <p>Belum ada dokumen</p>
            <p className="text-sm text-slate-400 mt-1">
              Dokumen akan muncul setelah Anda membuat transaksi
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-line">
                  <th className="text-left p-3 font-semibold text-slate-600">Nomor</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Jenis</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Judul</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Referensi</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Tanggal</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Status</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-line hover:bg-slate-50">
                    <td className="p-3 font-mono text-sm">
                      <span className="text-primary font-semibold">{doc.document_number}</span>
                    </td>
                    <td className="p-3">
                      <span className="text-slate-600">
                        {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-medium">{doc.title}</div>
                      {doc.customer && (
                        <div className="text-xs text-slate-500">{doc.customer.name}</div>
                      )}
                      {doc.supplier && (
                        <div className="text-xs text-slate-500">{doc.supplier.name}</div>
                      )}
                    </td>
                    <td className="p-3 text-slate-600">
                      {doc.reference_number ? (
                        <div>
                          <span className="text-xs text-slate-400">{doc.reference_type}</span>
                          <div className="font-mono text-sm">{doc.reference_number}</div>
                        </div>
                      ) : "-"}
                    </td>
                    <td className="p-3 text-slate-600">
                      {formatDate(doc.document_date)}
                    </td>
                    <td className="p-3">
                      {getStatusBadge(doc.status)}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Link href={`/documents/${doc.id}}>
                          <Button variant="ghost" size="sm">Lihat</Button>
                        </Link>
                        <Link href={`/documents/${doc.id}/print`}>
                          <Button variant="ghost" size="sm">Print</Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-line">
                <div className="text-sm text-slate-500">
                  Menampilkan {(page - 1) * limit + 1} - {Math.min(page * limit, total)} dari {total}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
