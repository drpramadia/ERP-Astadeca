# P2 COLD STORAGE RENTAL ENGINE — READ-ONLY AUDIT REPORT
**Date:** 2026-09-26  
**Status:** READ-ONLY AUDIT — NO MODIFICATIONS MADE

---

## 1. EXECUTIVE SUMMARY

| Category | Assessment |
|----------|------------|
| **Architecture** | Generally sound with some critical gaps |
| **Ownership Separation** | ✅ Implemented correctly |
| **Billing Engine** | ⚠️ CRITICAL LOGIC ISSUE |
| **Immutability** | ⚠️ PARTIAL — UPDATE found on rental_charges |
| **Approval Enforcement** | ❌ NOT ENFORCED server-side |
| **Capacity** | ❌ NOT ACTUALLY ENFORCED |
| **Build Status** | ✅ PASSING |

**Recommendation:** P2 is NOT SAFE to proceed to P3 without fixing critical findings.

---

## 2. CRITICAL FINDINGS

### CRITICAL-1: Capacity Check Not Actually Enforced
**Location:** `receive_rental_stock()` lines 877-881

**Issue:**
```sql
-- Check cold storage capacity (company + customer combined)
-- Reuse inventory capacity check
PERFORM "public"."get_cold_storage_capacity"(p_cold_storage_id, NULL, NULL);

-- Check storage location capacity
-- Reuse location capacity check
PERFORM "public"."get_storage_location_capacity"(p_storage_location_id);
```

**Problem:** The `PERFORM` statement executes the function but does NOT check the result. The function only returns data—it doesn't raise an exception when capacity is exceeded.

**Impact:** Receiving can overfill storage beyond capacity.

**Fix Required:** Add actual capacity validation:
```sql
DECLARE v_capacity record;
BEGIN
  SELECT * INTO v_capacity FROM "public"."get_cold_storage_capacity"(p_cold_storage_id, NULL, NULL);
  IF v_capacity.available_kg < v_quantity_kg THEN
    RAISE EXCEPTION 'Cold storage capacity exceeded';
  END IF;
END;
```

---

### CRITICAL-2: UPDATE on rental_charges (Immutability Violation)
**Location:** `generate_rental_invoice()` line 1475

**Issue:**
```sql
-- Update charge status to INVOICED
UPDATE "public"."rental_charges"
SET status = 'INVOICED',
    invoice_line_id = v_charge.id
WHERE id = v_charge.id;
```

**Problem:** The rental_charges table is documented as "IMMUTABLE BILLING LEDGER" but an UPDATE is performed to mark it as INVOICED.

**Analysis:**
- The UPDATE only changes `status` and `invoice_line_id`
- This is a valid business requirement (tracking which invoice contains the charge)
- However, it violates the "never update" principle

**Options:**
1. Add a separate `invoice_id` column and set it via FK (not UPDATE)
2. Add database trigger to prevent UPDATE except on status/invoice_line_id
3. Accept this as a "controlled mutation" with RLS protection

**RLS Analysis:** No UPDATE policy exists for rental_charges, so direct table updates are blocked by RLS. Only the RPC function can update. This is acceptable but needs explicit documentation.

---

### CRITICAL-3: Billing Period Calculation Off-by-One
**Location:** `calculate_rental_charges()` lines 1291-1296, 1325

**Issue:**
```sql
-- Calculate days and quantity
IF v_prev_snapshot.snapshot_date IS NULL THEN
  -- First snapshot in period
  v_days := p_billing_end - v_snapshot.snapshot_date + 1;
ELSE
  v_days := v_snapshot.snapshot_date - v_prev_snapshot.snapshot_date;
END IF;
```

**Problem:**
- `v_days` calculates days UNTIL the snapshot date, not INCLUDING it
- But `billing_end` is set to `v_snapshot.snapshot_date - 1`
- This creates a gap or overlap in billing periods

**Example:**
- Day 1: 1000 kg received
- Day 3: 100 kg released

If billing period is Day 1-3:
- Snapshot at Day 1: quantity = 1000
- Snapshot at Day 3: quantity = 900

The billing calculation might calculate:
- Period 1: Day 1-2 (2 days) at 1000 kg
- Period 2: Day 3 (but billing_end = Day 2) — OVERLAP OR GAP

**Fix Required:** Clarify and test the billing period boundary logic.

---

### CRITICAL-4: Invoice Can Be Modified After Posting
**Location:** RLS policies for rental_invoices

**Issue:**
```sql
CREATE POLICY "rental_invoices_update" ON "public"."rental_invoices" 
  FOR UPDATE USING ("public"."has_org_permission"(...));
```

**Problem:** Invoices can be modified after they're issued. There's no protection against changing amounts or line items post-generation.

**Fix Required:** Either:
1. Add a `posted_at` timestamp and prevent updates after posting
2. Create separate DRAFT/POSTED statuses with status-based update policies
3. Keep as-is and rely on business process controls

---

## 3. HIGH FINDINGS

### HIGH-1: No Approval Enforcement in receive_rental_stock
**Location:** `receive_rental_stock()` lines 862-869

**Issue:**
```sql
-- Validate contract
SELECT * INTO v_contract FROM "public"."rental_contracts" WHERE id = p_contract_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'Contract not found';
END IF;

IF v_contract.status != 'ACTIVE' THEN
  RAISE EXCEPTION 'Contract must be ACTIVE to receive stock...';
END IF;
```

**Analysis:**
- ✅ Contract must be ACTIVE — ENFORCED
- ✅ Contract must exist — ENFORCED
- ❌ Contract approval_request status NOT validated
- ❌ Special rates/discounts approval NOT validated

**Missing Checks:**
1. Does the contract have a pending or rejected approval_request?
2. Are special rates (discount > threshold) Director-approved?

---

### HIGH-2: Rate Priority Comment Inconsistent with Implementation
**Location:** rental_rates table comment (lines 43-47)

**Comment says:**
```
Rate Priority (lowest to highest):
1. standard_rate (fallback)
2. category_rate (product category specific)
3. storage_rate (cold storage specific)
4. customer_rate (customer specific)
```

**Implementation (get_applicable_rental_rate) priority is:**
```
1. CUSTOMER
2. STORAGE  
3. LOCATION
4. CATEGORY
5. PRODUCT
6. STANDARD
```

**Problem:** Comment is backwards. Standard should be highest priority (fallback), but comment says "lowest to highest".

---

### HIGH-3: Concurrency Protection Missing in receive_rental_stock
**Location:** `receive_rental_stock()`

**Issue:** No `FOR UPDATE` lock when checking capacity or creating inventory.

**Race Condition Scenario:**
1. Storage has 100 kg free
2. User A receives 80 kg
3. User B receives 80 kg (simultaneously)
4. Both pass capacity check (each sees 100 kg free)
5. Result: 160 kg received into 100 kg space

**Missing:** `FOR UPDATE NOWAIT` on cold_storage or capacity table during receive.

---

### HIGH-4: Transfer Destination Capacity Not Checked
**Location:** `transfer_rental_stock()`

**Issue:** Only source allocation is locked. Destination capacity is not validated before transfer.

**Missing:** Call `get_combined_storage_capacity()` for destination and verify space exists.

---

## 4. MEDIUM FINDINGS

### MEDIUM-1: Quantity Snapshot for Billing — First Day Handling
**Location:** `calculate_rental_charges()` line 1291-1293

**Issue:**
```sql
IF v_prev_snapshot.snapshot_date IS NULL THEN
  -- First snapshot in period
  v_days := p_billing_end - v_snapshot.snapshot_date + 1;
```

If a customer receives stock on Day 1, there's no snapshot for Day 1 before the receive. The first snapshot is created AT receive time.

**Impact:** The billing period starting from contract start might not have a snapshot entry.

---

### MEDIUM-2: Release Inventory Quantity Calculation
**Location:** `release_rental_stock()` lines 1038-1044

**Issue:**
```sql
UPDATE "public"."inventory"
SET quantity = quantity - (p_quantity_kg / COALESCE(NULLIF(quantity_kg, 0), 1) * quantity),
    quantity_kg = quantity_kg - p_quantity_kg,
    updated_at = now()
WHERE id = v_allocation.inventory_id
  AND quantity_kg >= p_quantity_kg;
```

**Complexity:** The quantity calculation `(p_quantity_kg / quantity_kg) * quantity` is attempting to maintain the ratio between quantity and quantity_kg.

**Risk:** If quantity and quantity_kg get out of sync, this could produce incorrect results.

---

### MEDIUM-3: No Unique Constraint on rental_charges
**Location:** rental_charges table

**Issue:** No unique constraint prevents duplicate charges for the same allocation/period.

**Risk:** If the billing function is called twice for the same period, duplicate charges could be created.

**Existing Protection:** `generate_rental_invoice()` checks for existing invoices, but `calculate_rental_charges()` has no idempotency.

---

### MEDIUM-4: RLS Policy Coverage Incomplete
**Location:** rental_invoice_lines RLS

**Issue:** The RLS policy only checks the parent invoice's organization membership:
```sql
CREATE POLICY "rental_invoice_lines_select" ON "public"."rental_invoice_lines" FOR SELECT USING (
    EXISTS (SELECT 1 FROM "public"."rental_invoices" ri 
            WHERE ri."id" = "rental_invoice_lines"."invoice_id" 
            AND "public"."is_org_member"(ri."organization_id"))
);
```

This is correct for SELECT. But INSERT/UPDATE policies for invoice_lines reference rental_invoices policies, which reference `has_org_permission`.

**Question:** Does the user need `rental.billing` permission just to view invoice lines? This may be too restrictive for customers viewing their own invoices.

---

## 5. LOW FINDINGS

### LOW-1: Rate Comment Mentions Discount Requires Approval
**Location:** `get_applicable_rental_rate()` comment

**Comment says:** "special rate / discount requires Director approval"

**Reality:** The function doesn't check for approval status. It's just a rate lookup function.

**Recommendation:** Add a separate function `get_approved_rental_rate()` that validates approval.

---

### LOW-2: Combined Capacity Function Not Used in RPCs
**Location:** `get_combined_storage_capacity()`

**Issue:** This function exists and correctly combines company + customer inventory, but it's not called by receive_rental_stock or transfer_rental_stock.

---

### LOW-3: No Index on rental_charges for Idempotency
**Location:** rental_charges indexes

**Issue:** No unique index on (allocation_id, billing_start, billing_end) to prevent duplicate charges.

---

### LOW-4: Contract Number Not Enforced Unique
**Location:** rental_contracts table

**Issue:** No UNIQUE constraint on contract_number within organization. Only the number generator ensures uniqueness.

**Risk:** If the generator fails or two orgs generate the same number (unlikely), duplicates could occur.

---

## 6. TEST MATRIX

| # | Test | Expected | Actual | Status |
|---|------|----------|--------|--------|
| 1 | Customer rental receiving | Creates inventory + allocation + movement | ✅ Creates all | PASS |
| 2 | Company vs customer ownership | Separate via owner_type | ✅ owner_type='CUSTOMER' set | PASS |
| 3 | Capacity enforcement | Reject if over capacity | ❌ PERFORM doesn't check result | **FAIL** |
| 4 | Partial release | Reduces active_qty, preserves history | ✅ active_quantity updated, snapshot created | PASS |
| 5 | Transfer | Two movements, no UPDATE on ledger | ✅ INSERT only | PASS |
| 6 | Rate priority | Deterministic CUSTOMER→STORAGE→... | ✅ IF FOUND THEN RETURN pattern | PASS |
| 7 | Rate change | New rate applies to future billing | ✅ Rate looked up at snapshot date | PASS |
| 8 | Historical charge immutability | Charges never change | ⚠️ UPDATE status allowed | **PARTIAL** |
| 9 | Duplicate billing prevention | Cannot double-bill | ❌ No idempotency check | **FAIL** |
| 10 | Invoice reconciliation | Invoice total = sum(lines) | ✅ Calculated in function | PASS |
| 11 | Approval enforcement | Server-side validation | ❌ No approval status check | **FAIL** |
| 12 | RLS isolation | Org/customer separation | ✅ Policies exist | PASS |
| 13 | Movement immutability | No UPDATE/DELETE on ledger | ✅ INSERT only | PASS |
| 14 | Charge immutability | No UPDATE/DELETE | ⚠️ UPDATE status allowed | **PARTIAL** |
| 15 | Audit trail | All operations logged | ✅ INSERT statements present | PASS |
| 16 | Concurrency protection | Row locking | ❌ No FOR UPDATE in receive | **FAIL** |
| 17 | TypeScript | Types match schema | ✅ Types created | PASS |
| 18 | Production build | Compiles | ✅ BUILD SUCCESS | PASS |

---

## 7. REQUIRED FIXES BEFORE P3

### Must Fix (Critical):

1. **CRITICAL-1:** Add actual capacity validation in receive_rental_stock
2. **CRITICAL-2:** Document the rental_charges status update as acceptable, or restructure
3. **CRITICAL-3:** Fix billing period boundary logic
4. **CRITICAL-4:** Prevent invoice modification after posting

### Should Fix (High):

5. **HIGH-1:** Add approval_request status validation in receive_rental_stock
6. **HIGH-3:** Add row locking for capacity checks
7. **HIGH-4:** Check destination capacity in transfer

### Consider Fixing (Medium):

8. **MEDIUM-3:** Add idempotency to calculate_rental_charges

---

## 8. FILES/FUNCTIONS INVOLVED

| File | Functions |
|------|-----------|
| `supabase/migrations/005_rental_domain.sql` | All tables, policies, functions |
| `src/lib/rental/types.ts` | TypeScript types |

### Key Functions:
- `receive_rental_stock()` — CRITICAL issues
- `release_rental_stock()` — Works correctly
- `transfer_rental_stock()` — Missing destination capacity check
- `calculate_rental_charges()` — Logic issue
- `generate_rental_invoice()` — Immutability issue
- `get_applicable_rental_rate()` — Works correctly
- `get_combined_storage_capacity()` — Not used by RPCs

---

## 9. ARCHITECTURE ASSESSMENT

### Strengths:
1. ✅ Clean separation of rental from supply chain
2. ✅ Immutable movement ledger design
3. ✅ Quantity snapshots for accurate billing
4. ✅ Rate priority is deterministic
5. ✅ Comprehensive RLS implementation
6. ✅ Good use of FK constraints

### Weaknesses:
1. ❌ Capacity not actually enforced
2. ❌ Approval workflow not integrated
3. ❌ Billing period calculation unclear
4. ⚠️ Immutability partially violated

---

## 10. CONCLUSION

**Is P2 safe to proceed to P3?**

**NO — Critical findings must be addressed first.**

**Summary:**
- 4 CRITICAL issues
- 4 HIGH issues
- 4 MEDIUM issues
- 4 LOW issues

**Estimated Fixes Required:** 6-8 modifications to the migration file

---

*Audit performed: 2026-09-26*  
*Remote database: NOT MODIFIED (per requirements)*
