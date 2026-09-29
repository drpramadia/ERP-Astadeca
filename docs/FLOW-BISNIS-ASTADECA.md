# ASTADECA — Panduan Flow Bisnis (untuk Edukasi Karyawan)

> Versi: 1.0 — Cold Storage & Supply Chain ERP
> Dibuat: 29 September 2026

---

## 1. FLOW PEMBELIAN (PURCHASE)

### Alur: Purchase Request → Purchase Order → Penerimaan Barang

```
Purchasing Staff
    │
    ├─ PR BARU ──────────────────────────────┐
    │  (Purchase Request = permintaan beli)  │
    │  - Pilih supplier                     │
    │  - Pilih produk + qty + satuan        │
    │  - Simpan sebagai DRAFT               │
    └────────────────────────────────────────┘
                      │
                      ▼
    ┌─ PR Submit ───────────────────────────┐
    │  Status: DRAFT → PENDING_APPROVAL     │
    │  Perlu persetujuan Manager/Director    │
    └────────────────────────────────────────┘
                      │
                      ▼
            [Approval oleh Director]
                      │
            ┌─────────┴─────────┐
            │                   │
       Diapprove          Ditolak
            │                   │
            ▼                   ▼
     Status: APPROVED      PR kembali ke DRAFT
            │              (Staff revisi)
            ▼
    ┌─ Purchase Order (PO) ─────────────────┐
    │  Staff buat PO dari PR yang disetujui │
    │  - Terpilih otomatis dari PR         │
    │  - Tambah harga/unit + supplier       │
    │  - Simpan sebagai DRAFT               │
    └────────────────────────────────────────┘
                      │
                      ▼
    ┌─ PO Submit ───────────────────────────┐
    │  Status: DRAFT → PENDING_APPROVAL     │
    └────────────────────────────────────────┘
                      │
                      ▼
            [Approval oleh Director]
                      │
                 Diapprove
                      │
                      ▼
         ┌─ Penerimaan Barang ─────────────┐
         │  (/supply-chain/receiving)        │
         │  - Cek barang datang             │
         │  - Input qty yang diterima        │
         │  - Simpan sebagai RECEIVED         │
         └────────────────────────────────────┘
                      │
                      ▼
         ┌─ Persediaan Masuk ────────────────┐
         │  Inventory automatically updated   │
         └────────────────────────────────────┘
```

### Role & Permission:
| Role | Buat PR | Submit PR | Buat PO | Submit PO |
|---|---|---|---|---|
| Purchasing | ✅ | ✅ | ✅ | ✅ |
| Director | - | ✅ approve | - | ✅ approve |
| Admin | ✅ | ✅ | ✅ | ✅ |

---

## 2. FLOW PENJUALAN (SALES)

### Alur: SO → Delivery Order → shipment

```
Sales Staff
    │
    ├─ Sales Order (SO) BARU ───────────────┐
    │  - Pilih customer                     │
    │  - Pilih produk + qty                 │
    │  - Simpan sebagai DRAFT                │
    └────────────────────────────────────────┘
                      │
                      ▼
    ┌─ SO Submit ───────────────────────────┐
    │  Status: DRAFT → PENDING_APPROVAL     │
    └────────────────────────────────────────┘
                      │
                      ▼
            [Approval oleh Director]
                      │
                 Diapprove
                      │
                      ▼
         ┌─ Delivery Order ────────────────┐
         │  Staff buat DO dari SO yang       │
         │  disetujui                         │
         │  - Terpilih otomatis dari SO       │
         │  - Input tanggal jadwal            │
         │  - Simpan sebagai DRAFT            │
         └────────────────────────────────────┘
                      │
                      ▼
    ┌─ DO Kirim ────────────────────────────┐
    │  Status: DRAFT → IN_TRANSIT          │
    │  (barang sedang dalam perjalanan)     │
    └────────────────────────────────────────┘
                      │
                      ▼
    ┌─ DO Diterima (POD) ─────────────────┐
    │  Status: IN_TRANSIT → DELIVERED       │
    │  - Input tgl terima + penerima        │
    │  - Input signature / catatan          │
    └────────────────────────────────────────┘
                      │
                      ▼
         ┌─ Persediaan Berkurang ───────────┐
         │  Inventory automatically reduced  │
         └────────────────────────────────────┘
```

---

## 3. FLOW RENTAL (COLD STORAGE)

### Alur: Kontrak Sewa → Aktivasi → Penggunaan Cold Storage

```
Konsumen / Customer Rental
    │
    ├─ Buat Kontrak Sewa ───────────────────┐
    │  (/rental/contracts)                   │
    │  - Pilih customer rental               │
    │  - Pilih cold storage                  │
    │  - Judul kontrak                       │
    │  - Tanggal mulai / selesai             │
    │  - Billing frequency (bulanan dll)     │
    │  - Termin pembayaran                   │
    │  - Simpan sebagai DRAFT                │
    └────────────────────────────────────────┘
                      │
                      ▼
    ┌─ Submit Kontrak ─────────────────────┐
    │  Status: DRAFT → PENDING_APPROVAL   │
    │  Masuk antrian persetujuan Director   │
    └──────────────────────────────────────┘
                      │
                      ▼
            [Approval oleh Director]
                      │
            ┌─────────┴─────────┐
       Diapprove          Ditolak
            │                   │
            ▼                   ▼
     APPROVED             Kembali ke DRAFT
            │
            ▼
    ┌─ Aktifkan Kontrak ───────────────────┐
    │  Director klik "Aktifkan"            │
    │  Status: APPROVED → ACTIVE           │
    │  Cold storage siap digunakan         │
    └──────────────────────────────────────┘
                      │
                      ▼
         ┌─ Penggunaan Cold Storage ────────┐
         │  Customer bisa:                  │
         │  - Penyimpanan barang            │
         │  - Monitoring suhu & kondisi      │
         │  - Billing berjalan per periode   │
         └────────────────────────────────────┘
```

### Tarif Sewa (/rental/rates)
```
Admin/Director
    │
    ├─ Tambah Tarif Sewa ───────────────────┐
    │  - Pilih cold storage                 │
    │  - Tipe tarif (penyimpanan/chiller)  │
    │  - Minimum qty (kg)                  │
    │  - Harga per kg/periode              │
    │  - Efektif dari tanggal              │
    │  - Simpan                             │
    └───────────────────────────────────────┘
```

---

## 4. FLOW RETUR (RETUR BARANG)

### Alur: Retur → Approval → Penyesuaian Inventory

```
Staff / Customer
    │
    ├─ Buat Retur ─────────────────────────┐
    │  (/supply-chain/returns)               │
    │  - Pilih jenis retur:                │
    │    • RUSAK (barang rusak)            │
    │    • EXPIRED (kedaluwarsa)            │
    │    • Sisa (sisa dari pengiriman)      │
    │  - Pilih produk + alasan              │
    │  - Qty yang diretur                  │
    │  - Simpan untuk approval              │
    └───────────────────────────────────────┘
                      │
                      ▼
    ┌─ Submit Retur ────────────────────────┐
    │  Masuk persetujuan Director           │
    └──────────────────────────────────────┘
                      │
                      ▼
            [Approval oleh Director]
                      │
            ┌─────────┴─────────┐
       Diapprove          Ditolak
            │                   │
            ▼                   ▼
     Status: APPROVED    Kembali ke
                     (inventory tidak berubah)
            │
            ▼
    ┌─ Penyesuaian Inventory ─────────────┐
    │  Quantity dikurangi otomatis          │
    │  di warehouse inventory              │
    └──────────────────────────────────────┘
```

---

## 5. FLOW PENGAMBILAN (PICKING)

### Alur: Picking Order → Ambil Barang → Update Inventory

```
Staff Gudang
    │
    ├─ Buat Picking Order ──────────────────┐
    │  (/supply-chain/picking)              │
    │  - Pilih customer                     │
    │  - Pilih produk + qty yang diambil   │
    │  - Lokasi penyimpanan (bin/rack)    │
    │  - Simpan                             │
    └───────────────────────────────────────┘
                      │
                      ▼
    ┌─ Submit Picking ─────────────────────┐
    │  Barang siap diambil customer         │
    └──────────────────────────────────────┘
                      │
                      ▼
         ┌─ Ambil & Konfirmasi ────────────┐
         │  Staff gudang:                  │
         │  - Cek barang sesuai order      │
         │  - Konfirmasi pengambilan       │
         │  - Inventory dikurangi           │
         └────────────────────────────────────┘
```

---

## 6. FLOW PERSEDIAAN (INVENTORY)

### Alur: Monitoring & Adjustment

```
Manager / QC Staff
    │
    ├─ Stok Opname ────────────────────────┐
    │  (/warehouse/inventory)              │
    │  - Cek fisik barang di gudang        │
    │  - Bandingkan dengan sistem          │
    │  - Ada selisih? → Adjustment         │
    └──────────────────────────────────────┘
                      │
                      ▼
    ┌─ Stock Adjustment ───────────────────┐
    │  - Pilih produk                     │
    │  - Input qty hasil hitung            │
    │  - Alasan adjustment                │
    │  - Submit untuk approval            │
    └──────────────────────────────────────┘
                      │
                      ▼
            [Approval oleh Director]
                      │
                 Diapprove
                      │
                      ▼
    ┌─ Inventory Updated ─────────────────┐
    │  Qty di sistem disesuaikan           │
    │  Audit log tersimpan                 │
    └──────────────────────────────────────┘
```

---

## 7. FLOW PENERIMAAN BARANG (RECEIVING)

### Alur: Barang Datang → QC Check → Simpan ke Cold Storage

```
Staff Receiving
    │
    ├─ Terima Barang ──────────────────────┐
    │  (/supply-chain/receiving)            │
    │  - Cek PO / delivery datang          │
    │  - Inspeksi fisik (kondisi, qty)     │
    │  - QC check (suhu, kemasan)          │
    └───────────────────────────────────────┘
                      │
                      ▼
    ┌─ QC Check ───────────────────────────┐
    │  (/supply-chain/qc)                  │
    │  - Lulus / Gagal / Penyimpanan?     │
    │  - Input hasil inspeksi              │
    │  - Catat suhu saat penerimaan        │
    └───────────────────────────────────────┘
                      │
            ┌─────────┼─────────┐
         Lulus      Gagal    Problem
            │         │         │
            ▼         ▼         ▼
      Simpan      Retur    Penyimpanan
      ke CS       Supplier   Khusus
```

---

## 8. FLOW QUALITY CONTROL (QC)

### Alur: Inspeksi → Rekam Hasil → Decision

```
QC Staff
    │
    ├─ QC Check Baru ──────────────────────┐
    │  (/supply-chain/qc)                  │
    │  - Pilih produk/batch               │
    │  - Input hasil inspeksi:           │
    │    • Suhu penyimpanan               │
    │    • Kondisi kemasan                │
    │    • Physical appearance            │
    │    • Batch number                   │
    │  - Decision: PASS / FAIL / HOLD    │
    └──────────────────────────────────────┘
                      │
                      ▼
    ┌─ Submit QC Report ───────────────────┐
    │  Masuk persetujuan Manager           │
    └──────────────────────────────────────┘
                      │
                 Diapprove
                      │
                      ▼
    ┌─ Decision ───────────────────────────┐
    │  PASS → Masuk cold storage normal   │
    │  FAIL → Retur ke supplier           │
    │  HOLD → Penyimpanan khusus, review  │
    └──────────────────────────────────────┘
```

---

## 9. FLOW APPROVAL (PERSETUJUAN)

### Semua approval mengalir ke Director

```
 Dokumen apapun yang butuh persetujuan:
 (PR, PO, Kontrak, Retur, Adjustment, QC)

    │
    ▼
 ┌─────────────────────────────┐
 │   Sistem buat Approval      │
 │   Request otomatis          │
 │   (jika status =           │
 │    PENDING_APPROVAL)        │
 └──────────────┬──────────────┘
                │
                ▼
         ┌───────────────┐
         │ Director      │
         │ menerima notif│
         │ (bell icon)   │
         └───────┬───────┘
                 │
         ┌───────┴───────┐
         │               │
    ┌────▼────┐    ┌────▼────┐
    │ APPROVE │    │ REJECT  │
    └────┬────┘    └────┬────┘
         │              │
         ▼              ▼
   Dokumen      Dokumen
   proceed     dikembalikan
   ke next     ke pengaju
   step        dengan catatan
```

---

## 10. PERAN (ROLE) DALAM SISTEM

| Role | Deskripsi | Akses Utama |
|---|---|---|
| **Director** | Direktur | Approve semua dokumen, kontrak, laporan |
| **Admin** | Administrator | Semua modul, manajemen user |
| **Purchasing** | Staff Pembelian | PR, PO, receiving |
| **Warehouse** | Staff Gudang | Inventory, picking, receiving, QC |
| **QC** | Quality Control | QC check, inspeksi |
| **Logistic** | Staff Logistik | Delivery, returns |
| **Sales** | Staff Penjualan | Sales order, delivery |
| **SUPER_USER** | Konsultan/Programmer | Akses penuh (audit only) |

---

## 11. RINGKASAN STATUS DOKUMEN

```
DRAFT         → draft, belum diajukan
PENDING      → menunggu approval
APPROVED     → disetujui
REJECTED     → ditolak
ACTIVE       → kontrak rental aktif
IN_TRANSIT   → delivery sedang jalan
DELIVERED    → sudah diterima customer
COMPLETED    → selesai
CANCELLED    → dibatalkan
```

---

## 12. TIPS UNTUK KARYAWAN

### Cara kerja tombol di setiap halaman:

**Kontrak Sewa:**
- `+ Buat Kontrak Baru` → buat kontrak
- `Submit` → kirim untuk approval Director
- `Approve` / `Reject` → untuk Director
- `Aktifkan` → kontrak mulai berlaku

**Purchasing:**
- `PR Baru` → minta barang ke supplier
- `PO Baru` → pesanan resmi ke supplier
- `Submit` → kirim untuk approval
- `Kirim` → barang sedang di perjalanan

**Delivery:**
- `Delivery Order Baru` → jadwal pengiriman
- `Kirim` → barang keluar gudang
- `Lihat` → cek detail DO

**Returns:**
- `Buat Retur` → barang dikembalikan
- `Kirim` → minta approval retur

**QC:**
- `QC Check Baru` → inspeksi barang
- Submit → minta approval hasil QC
