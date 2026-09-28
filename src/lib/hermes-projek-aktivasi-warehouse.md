# Hermes Agent — Projek Aktivasi Warehouse-System

> PANDUAN OPERASIONAL untuk aktivasi modul warehouse-system: Next.js + Supabase (PostgreSQL).

---

## Konteks

User Dio Pramdia mengoperasikan aplikasi warehouse-system di `C:\Users\Dio Pramdia\warehouse-system`. Aplikasi menggunakan Next.js 16 + Supabase sebagai backend PostgreSQL via `@supabase/ssr`. Tujuan: mengaktifkan seluruh modul (pembelian, penerimaan, QC, persediaan, penjualan, rental cold storage, keuangan, approval, dokumen, laporan, master data, user/access) dari status stub/placeholder menjadi aplikasi produksi yang fully functional.

**STATUS PER: 2026-09-28**
- Pipeline: LINT ✅ TSC ✅ BUILD ✅ (35 routes)
- RPCs: 82 fungsi terdefinisi di migrations
- Migration versions: duplicate fix ✅ (8 file di-rename, sequential)
- Notification system: table + triggers + dropdown bell ✅
- Approval decision RPC: param fix ✅
- Junk files: remote_schema_dump.sql dihapus ✅

**Environment**: Windows (git-bash/MSYS). Docker tidak tersedia. Build dan lint harus berjalan di host.

---

## Aturan Utama dari User (wajib dipatuhi — lihat CLAUDE.md / AGENTS.md)

1. **DILARANG membuat mock API, hardcoded data, atau UI dummy.** Semua data harus berasal dari Supabase.
2. **DILARANG membocorkan service-role key ke browser.** Gunakan server-side Supabase client untuk operasi server.
3. **DILARANG menonaktifkan RLS atau hardcoding authorization di frontend.** Permission harus dari database.
4. **DILARANG menghapus/memodifikasi migration lama yang sudah applied.** Gunakan migration baru untuk schema perubahan.
5. **IDEMPOTENT & AMAN**: seed data menggunakan `ON CONFLICT DO NOTHING`, tidak ada DELETE/TRUNCATE/DROP.
6. **Bahasa Indonesia** untuk seluruh UI dan pesan error.
7. **Pipeline check wajib**: `npm run lint`, `npx tsc --noEmit`, `npm run build` — semuanya harus pass sebelum melapor "selesai".
8. **Build PASS bukan berarti selesai.** Laporan harus menyebutkan modul yang memang belum aktif.
9. **Feedback ke user yang jujur**: jika ada modul yang belum bisa diaktifkan karena blokadi teknis, sebutkan secara eksplisit.
10. **Seed data tidak boleh meminta user melakukan setup manual.** Fungsi seed harus bisa dijalankan (via RPC atau SQL) saat aplikasi sudah berjalan.

---

## Workflow Aktivasi Modul (urutan kerja)

### PHASE 0: Audit environment (sebelum coding)
- `find . -name "*.sql" -path "*/migrations/*"` → daftar semua migration
- `ls supabase/migrations/` → nomor migration terbesar
- `grep -rn "CREATE TABLE\|CREATE FUNCTION\|CREATE VIEW" supabase/migrations/` → schema yang ada
- `npm run build && npm run lint` → baseline: pastikan project bisa build sebelum perubahan

### PHASE 1: Schema audit dan identification gap
Untuk setiap tabel yang dibutuhkan modul, cek apakah sudah ada di migration yang dijalankan:
- Baca `supabase/migrations/004_inventory_domain.sql` (inventory) dan `005_rental_domain.sql` (rental)
- Baca `src/lib/inventory/repository.ts` dan `src/lib/inventory/types.ts` untuk types yang diharapkan
- Jika tabel/module belum ada di migration → buat migration baru (angka terkecil + 1 dari yang terakhir) dengan `idempotent` dan `ON CONFLICT`

**RULE**: Migration baru harus:
- Menggunakan `CREATE TABLE IF NOT EXISTS` atau pengecekan eksplisit
- Tidak pernah `DROP` atau `ALTER` tabel yang sudah ada kecuali benar-benar perlu
- Diuji dengan `npm run build` setelah dibuat

### PHASE 2: Seed data function (wajib dibuat sebelum deployment)
Segera setelah Phase 1, buat fungsi seed:
- File: `src/lib/seed-function.sql` — fungsi PostgreSQL `seed_initial_data(p_org_id uuid)` yang idempotent
- Fungsi harus menerima `organization_id` dan membuat data jika belum ada
- Seed mencakup: product_categories, units, products, suppliers, customers, dan jika memungkinkan: inventory via movement RPC, rental contract + stock
- Fungsi harus MENDukung callable dari dalam aplikasi (via RPC) atau bisa dijalankan manual via Supabase SQL Editor

**RULE seed**: Setelah fungsi dibuat, aplikasi HARUS bisa memanggil fungsi tersebut. Jika migration belum dijalankan ke remote, user perlu menjalankannya lewat Supabase dashboard SQL editor.

### PHASE 3: Modul inventory (existing — jaga fungsionalitas)
- `src/app/warehouse/inventory/page.tsx` — sudah ada, connected ke database via Supabase client
- Pastikan halaman ini menampilkan data real, filter, dan empty state
- Jangan destroy yang sudah ada — perbaiki yang rusak, jangan refactor sembarangan

### PHASE 4: Modul supply chain yang belum ada (pembelian, penerimaan, QC, penjualan)
- Butuh migration untuk tabel-tabel yang belum ada (lihat Phase 1)
- Halaman harus memiliki: UI + query + create + update + status workflow + validation + permission
- Tiap halaman: [HalamanRoute]/page.tsx dengan `createClient()` dari `@/lib/supabase/client`

**Daftar modul yang perlu diaktifkan**:
| Modul | Route | Status |
|-------|-------|--------|
| Purchasing (PR, PO, supplier, quotation) | `/supply-chain/purchasing` | BUTUH migration + halaman |
| Receiving (terima barang dari PO) | `/supply-chain/receiving` | BUTUH migration + halaman |
| QC (quality control) | `/supply-chain/qc` | BUTUH migration + halaman |
| Sales Order + Quotation | `/supply-chain/sales` | BUTUH migration + halaman |
| Delivery Order | `/supply-chain/delivery` | BUTUH migration + halaman |
| Returns | `/supply-chain/returns` | BUTUH migration + halaman |

### PHASE 5: Modul warehouse (stock movement, transfer, stock opname, adjustment)
- Stock movement sudah ada di 004_inventory_domain.sql → cukup implementasi halaman
- Transfer: CS-01 ↔ CS-02, lokasi ke lokasi → perlu halaman
- Stock opname: `/warehouse/stock-opname` → perlu halaman
- Adjustment (damage/expiry/loss): perlu halaman

### PHASE 6: Modul rental cold storage (existing — jaga fungsionalitas)
- `src/app/rental/contracts/page.tsx` — sudah ada
- `src/app/rental/inventory/page.tsx` — sudah ada  
- `src/app/rental/billing/page.tsx` — sudah ada
- Perlu tambahan: rental receiving, rental release, rental invoice

### PHASE 7: Modul keuangan (AR, AP, pembayaran)
- BUTUH migration untuk tables financial jika belum ada
- Halaman: piutang, hutang, pembayaran

### PHASE 8: Approval, dokumen, laporan, settings
- Approval: sudah ada `approval_requests`, `approval_steps`, `approval_actions` di 001
- Dokumen: perlu halaman document center
- Laporan: perlu halaman dengan berbagai report
- Settings: company, business unit, warehouse, cold storage, document numbering

### PHASE 9: Dashboard real data
- `src/app/dashboard/page.tsx` sudah ada tapi mungkin perlu diperbaiki
- Dashboard harus mengambil data real dari database (tidak hardcoded)
- Cold storage utilization, stock by status, pending approval, recent movements

### PHASE 10: Navigation & fixed duplicate keys
- `src/components/app-shell.tsx` — sidebar navigation
- Setiap nav item harus punya `key` unik
- Route tidak boleh duplicate

---

## Cara Membuat Migration Baru yang Aman

```bash
# Lihat migration terakhir
ls -la supabase/migrations/ | tail -1

# Buat file migration baru dengan nama (nomor_terakhir + 1)_deskripsi.sql
# Contoh: jika terakhir adalah 007, buat 008_nama_migrasi.sql
```

Struktur migration baru:
```sql
-- Migration: NN_deskripsi.sql
-- Description: ...
-- Date: YYYY-MM-DD
-- Note: IDEMPOTENT

-- Pengecekan eksistensi tabel sebelum create
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'nama_tabel') THEN
    CREATE TABLE public.nama_tabel (...);
  END IF;
END $$;

-- Atau gunakan IF NOT EXISTS langsung untuk object sederhana
CREATE TABLE IF NOT EXISTS public.nama_tabel (...);

-- Tambahkan index jika perlu (dengan pengecekan)
CREATE INDEX IF NOT EXISTS idx_nama_tabel_column ON public.nama_tabel(column);
```

**JANGAN** menggunakan:
- `DROP TABLE IF EXISTS` kecuali tabel memang direncanakan untuk dihapus
- `TRUNCATE` atau `DELETE FROM` di migration (kecuali untuk seed data yang aman)
- `ALTER TABLE ... DROP COLUMN` tanpa pengecekan

---

## Cara Menggunakan Seed Function

Fungsi seed `public.seed_initial_data(p_org_id uuid)` dibuat di `src/lib/seed-function.sql`. Setelah migration dijalankan:

1. **Jalankan via Supabase SQL Editor** (paling langsung):
   ```sql
   SELECT public.seed_initial_data('ORGANIZATION_UUID_HERE');
   ```

2. **Atau jalankan dari aplikasi** (via RPC):
   ```typescript
   const { data, error } = await supabase.rpc('seed_initial_data', {
     p_org_id: organizationId
   });
   ```

3. **Hasil**: fungsi mengembalikan JSON dengan `success`, `message`, dan detail objek yang dibuat.

**PENTING**: Fungsi seed bersifat idempotent — menjalankannya berkali-kali tidak akan membuat duplikat karena menggunakan `ON CONFLICT (organization_id, code) DO NOTHING`.

---

## Build & Lint Check List

Sebelum melapor ke user, jalankan:

```bash
cd /c/Users/Dio\ Pramdia/warehouse-system
npm run lint          # Pastikan exit 0 atau hanya warning minor
npx tsc --noEmit      # Pastikan tidak ada TypeScript error
npm run build         # Pastikan build sukses (exit 0)
```

**Blokadi**: Jika build gagal atau ada TypeScript error yang signifikan, perbaiki sebelum melanjutkan.

---

## Pola Kode yang Wajib Ada di Setiap Modul

Tiap halaman/modul yang aktif harus mempunyai:

1. **Data fetching**: query dari Supabase via `createClient()`
2. **Loading state**: `isLoading` state, tampilkan skeleton/spinner
3. **Empty state**: jika data kosong, tampilkan pesan informatif ("Belum ada data. Mulai dengan menambah...")
4. **Error handling**: catch error dari Supabase, tampilkan pesan user-friendly (bukan error mentah PostgreSQL)
5. **Create form**: form dengan validasi, submit ke database
6. **Update (jika relevan)**: edit existing record
7. **Status workflow**: badge status yang sesuai lifecycle
8. **Destructive actions**: konfirmasi sebelum delete (jika diizinkan), gunakan soft delete/archive jika ada relational constraint

---

## Pitfalls yang Sering Terjadi

### 1. Docker tidak tersedia di lingkungan user
- ❌ Jangan mencoba `supabase start`, `docker compose up`, atau perintah yang butuh Docker
- ✅ Gunakan `npm run build` dan `npm run lint` untuk verifikasi
- ✅ Seed data melalui SQL function yang bisa dijalankan via Supabase dashboard

### 2. Service-role key tidak boleh masuk ke browser
- ❌ Jangan gunakan `createClient()` di client-side untuk operasi yang butuh admin access
- ✅ Gunakan `createClient()` dari `@/lib/supabase/server` untuk operasi server (Next.js API routes / Server Components)

### 3. Migration nama bertabrakan
- ❌ Jangan membuat migration dengan nama yang sama
- ✅ Cek `ls supabase/migrations/` sebelum membuat, gunakan nomor urut terbesar + 1

### 4. React duplicate key di React list
- ❌ Jangan menggunakan key yang sama untuk item berbeda (contoh: `key="/warehouse"` muncul dua kali)
- ✅ Setiap navigation item dan list item harus punya key unik dan stabil

### 5. `getClaims()` bisa return null
- ❌ `const { data: { claims } } = await supabase.auth.getClaims()` → akan crash jika data null
- ✅ Gunakan pattern aman: `const { data } = await supabase.auth.getClaims(); const claims = data?.claims ?? null`

### 6. Hardcoded dashboard metrics
- ❌ `const stock = 1234` atau `const pending = 3` di dashboard
- ✅ Semua angka di dashboard harus berasal dari query database

---

## Komponen UI yang Tersedia

Dari pemindaian project, ditemukan komponen:
- `@/components/app-shell.tsx` — layout utama dengan sidebar navigation
- `@/components/page-header.tsx` — header halaman
- `@/components/ui/status-badge.tsx` — badge untuk status (DRAFT, APPROVED, dll)
- `@/components/ui/empty-state.tsx` — tampilan kosong
- `@/components/ui/data-table.tsx` — tabel data generik
- `@/components/ui/kpi-card.tsx` — kartu metrik untuk dashboard
- `@/components/ui/button.tsx`, `input.tsx`, `select.tsx`, `modal.tsx`, `textarea.tsx` — form elements
- `@/lib/utils.ts` — helper: `formatCurrency`, `formatNumber`, `formatDate`, `cn`

---

## Template Halaman Standar (Next.js App Router)

```tsx
import { createClient } from "@/lib/supabase/client";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export default function PageName() {
  // State untuk data, loading, error
  // useEffect untuk fetch data
  // Form untuk create/update
  // Tabel/list untuk menampilkan data
  // Tombol action
  
  return (
    <AppShell>
      <PageHeader title="Nama Halaman" subtitle="Keterangan" />
      {/* Content */}
    </AppShell>
  );
}
```

---

## Database Tables yang Sudah Ada (dari migration 001-007)

### Foundation (001):
- organizations, profiles, roles, permissions, role_permissions, organization_memberships
- approval_requests, approval_steps, approval_actions, audit_logs

### Company Structure (002):
- business_units, warehouses, cold_storages, storage_locations

### Master Data (003):
- product_categories, units, products, suppliers, customers

### Inventory Domain (004):
- batches, inventory, inventory_movements, stock_opnames, stock_opname_items
- stock_adjustments, stock_adjustment_items
- stock_transfers, stock_transfer_items
- Views: v_cold_storage_summary, v_inventory_item_list, v_inventory_with_details
- RPC: receive_inventory, receive_inventory_simple, issue_inventory_fefo, transfer_inventory, create_stock_opname, process_stock_opname_item, request_stock_adjustment, process_stock_adjustment, request_stock_transfer

### Rental Domain (005):
- rental_contracts, rental_rates, rental_allocations, rental_stock_movements
- rental_charges, rental_invoices, rental_invoice_lines
- rental_quantity_snapshots (lihat 005_rental_domain.sql)

### Rental Hardening (006): memperbaiki trigger dan constraint

### Rental Financial Hardening (007): immutability untuk financial records

---

## Tabel yang MENDING belum ada (perlu migration baru jika ingin modul aktif)

Berdasarkan audit migration yang ada, tabel-tabel berikut BELUM terlihat di migration 001-007 dan mungkin perlu dibuat:

- purchase_orders / purchase_request_items
- sales_orders / sales_order_items
- delivery_orders / delivery_order_items  
- quotations / quotation_items
- returns / return_items
- qc_inspections / qc_inspection_items
- rental_release_requests / rental_release_items (mungkin ada di 005/006/007 — cek)
- financial tables: accounts_receivable, accounts_payable, payments, etc.

**Cara cek**: `grep -n "CREATE TABLE" supabase/migrations/*.sql` untuk melihat tabel yang sudah dibuat.

---

## Dokumen Referensi

- `src/lib/seed-function.sql` — fungsi seed data (Referensi utama untuk seed)
- `supabase/migrations/` — seluruh history schema
- `src/lib/inventory/repository.ts` — contoh repository pattern
- `src/lib/inventory/types.ts` — types untuk inventory
- `src/lib/rental/types.ts` — types untuk rental
- `src/lib/supabase/server.ts` — server Supabase client
- `src/lib/supabase/client.ts` — client Supabase client
- `src/components/app-shell.tsx` — layout + navigation
- `src/app/dashboard/page.tsx` — dashboard page (referensi implementasi halaman connected)

---

## Catatan Khusus

### User Preferences (dari percakapan)
- User ingin laporan yang JUJUR: sebutkan modul yang belum selesai, jangan klaim "production-ready" jika masih ada yang bermasalah
- User tidak ingin diberi tahu "user perlu melakukan setup manual" — fungsinya harus bisa dijalankan
- User ingin aplikasi langsung berfungsi setelah login, dengan data awal yang terlihat
- User mengutamakan keamanan: tidak ada service-role key di browser, tidak ada RLS bypass

### Lingkungan Kerja
- OS: Windows 11
- Shell: git-bash / MSYS (bukan PowerShell)
- Working directory: `C:\Users\Dio Pramdia\warehouse-system`
- Package manager: npm
- Framework: Next.js (App Router)
- Database: Supabase (PostgreSQL)
- Docker: TIDAK TERSEDIA

### Strat Skala
- Fokus pada "full activation" — bukan perfect code
- Jika ada modul yang sulit karena schema belum ada, buat migration baru yang minimal dan aman
- Jika ada modul yang terlalu besar untuk satu sesi, prioritize yang paling kritis dulu
