# Arsitektur Dual-System ERP ASTADECA

## Latar Belakang

PT Astadeca Baswara Persada memiliki **2 unit bisnis** dalam satu perusahaan:

| Unit Bisnis | Sistem | Fokus |
|---|---|---|
| **Operasional Gudang** | Sistem Operasional Kantor | Stock management, purchasing, sales, QC, warehouse ops |
| **Penyewaan** | Sistem Penyewaan Cold Storage | Kontrak sewa, billing, unit cold storage, rates |

Kedua sistem berbagi: Users, Organization, Notifications, dan Integrasi kapasitas cold storage.

---

## Opsi Arsitektur

### Opsi A: Single App — System Switcher di Sidebar
Semua page di `/operational/*` dan `/rental/*`, sidebar punya toggle atau tab system.

| Pro | Kontra |
|---|---|
| Shared codebase, 1 repo | Mixing concerns jika tidak rapi |
| Shared auth, components, DB | Navigasi bisa membingungkan |
| Deployment tunggal | Perlu gating logic di setiap page |
| Fast iteration | |

**Verdict:** ✅ **PILIHAN TERBAIK** — Paling praktis untuk fase ini.

### Opsi B: Separate Subdirectories
URL: `/operational/dashboard`, `/rental/dashboard`

- Shared components di `src/components/`
- Shared lib di `src/lib/`
- Pages terpisah di `src/app/operational/` dan `src/app/rental/`

| Pro | Kontra |
|---|---|
| Clear separation of concerns | Double maintenance |
| Easy to understand navigation | Shared code needs discipline |
| Can add new rental-only features easily | |

### Opsi C: Separate Next.js Apps
Dua repo berbeda, shared Supabase DB.

| Pro | Kontra |
|---|---|
| Full isolation | Repo maintenance overhead |
| Independent deployments | Shared DB requires careful FK |
| No cross-contamination | Complex CI/CD |
| | Double the infra cost |

**Verdict:** ❌ Terlalu overkill untuk fase awal.

---

## Rekomendasi: Opsi A (Single App, Subdirectory Split)

### Struktur URL

```
/operational/
  dashboard
  supply-chain/sales
  supply-chain/purchasing
  supply-chain/delivery
  warehouse/inventory
  warehouse/cold-storages
  qc
  approval
  reports

/rental/
  dashboard
  contracts
  rates
  billing
  cold-storages
  receiving
  release
  reports

/settings/*        — Shared (users, roles, profile)
/notifications     — Shared
```

### Sidebar Navigation (Per-System)

**Operasional Sidebar:**
- Dashboard
- Supply Chain → Sales, Purchases, Delivery, Returns
- Warehouse → Inventory, Cold Storages, Stock Opname
- Quality Control
- Approvals
- Reports

**Rental Sidebar:**
- Dashboard
- Rental → Contracts, Rates, Billing
- Cold Storage → Receiving, Release
- Reports

### Shared Data Models

```sql
-- Users & Auth (SINGLE)
profiles (id, email, full_name, phone, avatar_url, system_role)
organization_memberships (user_id, organization_id, role_id, is_active)

-- Notifications (SINGLE - semua user dapat notifikasi)
notifications (id, organization_id, recipient_user_id, type, title, message, is_read, ...)

-- Kontrak & Stock Cold Storage (RENTAL ONLY)
rental_contracts, rental_rates, rental_billing_invoices,
cold_storage_units, cold_storage_zones

-- Inventory (OPERATIONAL ONLY)
products, inventory, inventory_movements, inventory_summary,
suppliers, customers, quotations, sales_orders,
purchase_requests, purchase_orders, delivery_orders

-- Finance (bisa SHARED via module field)
-- transactions (id, module, type, amount, description, ...)
-- module: 'operational' | 'rental'
```

### Finance Separation

Tambahkan kolom `module` ke tabel financial:

```sql
ALTER TABLE transactions ADD COLUMN module TEXT CHECK (module IN ('operational', 'rental'));
```

Revenue per module di-report terpisah.

### Cold Storage Integration

Cold storage unit **capacity** adalah shared resource:
- **Rental system** track: contracted capacity per unit
- **Operational** dapat melihat: available capacity untuk planning

```sql
CREATE VIEW cold_storage_availability AS
SELECT
  csu.id, csu.unit_code, csu.zone_id,
  csu.total_capacity_m3,
  COALESCE(SUM(rc.total_capacity_m3), 0) AS contracted_m3,
  csu.total_capacity_m3 - COALESCE(SUM(rc.total_capacity_m3), 0) AS available_m3
FROM cold_storage_units csu
LEFT JOIN rental_contracts rc ON rc.unit_id = csu.id AND rc.status = 'ACTIVE'
GROUP BY csu.id;
```

---

## Shared vs System-Specific

### Shared (Both Systems)
- Auth & User Management
- Role Permissions
- Organization
- Notifications
- Reports (financial summary)
- Cold Storage Availability View

### Operational Only
- Products
- Inventory & Movements
- Quotations & Sales Orders
- Purchase Requests & Orders
- Delivery Orders
- QC Inspections

### Rental Only
- Rental Contracts
- Rental Rates
- Billing Invoices
- Cold Storage Receiving/Release

---

## Migration Roadmap

### Phase 1: Sekarang ✅
- [x] Split sidebar navigation per system
- [x] Login page dual-system (UI only, routing TBD)
- [x] Core rental modules (contracts, rates, billing)
- [x] Core operational modules (sales, purchasing, delivery)
- [x] Role separation (SUPER_USER, DIRECTOR, ADMIN, etc.)
- [x] Notification system

### Phase 2: Short Term
- [ ] Add `module` column to financial tables
- [ ] Revenue reports split by module
- [ ] System-specific dashboard pages
- [ ] Stock warning system (LOW_STOCK notifications)
- [ ] Dual-system routing (after login → redirect to last system)

### Phase 3: Medium Term
- [ ] Separate dashboard for each system
- [ ] Reports section split by system
- [ ] Finance module with proper chart of accounts
- [ ] Integration: cold storage availability in operational planning

### Phase 4: Long Term
- [ ] Consider splitting into 2 apps if scale demands
- [ ] API layer for mobile/3rd-party integration
- [ ] Advanced analytics per system

---

## Login Flow (Dual System)

```
User opens app
        │
        ▼
Login Page (NEW: select system first)
        │
   [Pilih Sistem]
        │
   ┌────┴────┐
   │         │
Operasional  Rental
   │         │
   ▼         ▼
Auth (email + password)
        │
        ▼
  Redirect to /operational/dashboard
  or /rental/dashboard based on selection
        │
        ▼
Sidebar shows system-specific nav
  (can switch via settings or logout)
```

---

## Notification Types by System

### Operational Notifications
| Trigger | Type | Recipient |
|---|---|---|
| Quotation created | `QUOTATION_CREATED` | Sales Manager |
| Sales order created | `SALES_ORDER_CREATED` | Warehouse |
| Stock below min | `LOW_STOCK` | Warehouse |
| PO approved | `PO_APPROVED` | Requester |
| Delivery order created | `DO_CREATED` | Warehouse |
| QC passed/failed | `QC_COMPLETED` | Requester |

### Rental Notifications
| Trigger | Type | Recipient |
|---|---|---|
| Contract created | `CONTRACT_CREATED` | Director |
| Contract expiring | `CONTRACT_EXPIRING` | Director |
| Invoice due | `INVOICE_DUE` | Finance |
| Invoice paid | `INVOICE_PAID` | Customer |
| Cold storage available | `CS_AVAILABLE` | Sales |

### Shared Notifications
| Trigger | Type | Recipient |
|---|---|---|
| Approval request | `APPROVAL_REQUIRED` | Approver |
| Approval completed | `APPROVAL_COMPLETED` | Requester |
| System alert | `SYSTEM` | All active users |

---

Generated: 2026-09-29 | PT Astadeca Baswara Persada
