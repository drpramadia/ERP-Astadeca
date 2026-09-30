import re, os

errors = {
    'approval/page.tsx': 169,
    'billing/page.tsx': 309,
    'warehouse/movements/page.tsx': 194,
    'documents/[id]/purchase-order/page.tsx': 201,
    'documents/[id]/page.tsx': 325,
    'finance/finance-client.tsx': 66,
    'system-pick/page.tsx': 129,
    'documents/page.tsx': 152,
    'supply-chain/delivery/page.tsx': 352,
    'supply-chain/purchasing/page.tsx': 293,
    'supply-chain/receiving/page.tsx': 463,
    'supply-chain/sales/page.tsx': 321,
    'warehouse/adjustments/page.tsx': 146,
    'warehouse/cold-storages/page.tsx': 280,
    'warehouse/inventory/page.tsx': 226,
    'warehouse/stock-opname/page.tsx': 224,
    'warehouse/transfer/page.tsx': 148,
    'rental/baskets/page.tsx': 94,
    'rental/contracts/page.tsx': 225,
    'rental/inquiry/page.tsx': 176,
    'rental/receiving/page.tsx': 336,
    'dashboard/page.tsx': 224,
    'rental/contracts/[id]/page.tsx': 196,
    'supply-chain/returns/page.tsx': 230,
    'master-data/[resource]/master-data-client.tsx': 229,
    'rental/customers/page.tsx': 88,
    'rental/rates/page.tsx': 198,
    'rental/release/page.tsx': 259,
}

results = []
for rel, line_no in sorted(errors.items(), key=lambda x: x[1]):
    path = 'src/app/' + rel
    try:
        with open(path, 'rb') as f:
            raw = f.read()
        # Split by \r\n
        if b'\r\n' in raw:
            lines = raw.split(b'\r\n')
        elif b'\n' in raw:
            lines = raw.split(b'\n')
        else:
            lines = [raw]
        
        lin = line_no - 1
        if lin < len(lines):
            l = lines[lin].decode('utf-8', errors='replace')
            # Find problematic areas - look for template literals containing < characters
            # Show the whole line
            results.append(f"\n{'='*60}\n{rel}: line {line_no} (len={len(l)})\n{l}")
    except Exception as e:
        results.append(f"{rel}: ERROR {e}")

for r in results:
    print(r)
