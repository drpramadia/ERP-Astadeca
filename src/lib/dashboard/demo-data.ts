export interface DashboardDemoData {
  availableStockKg: number;
  quarantineStockKg: number;
  pendingApprovals: number;
  coldStorages: {
    id: string;
    code: string;
    name: string;
    capacityKg: number;
    occupiedKg: number;
  }[];
  recentMovements: {
    id: string;
    type: string;
    product: string;
    batch: string;
    quantityKg: number;
    date: string;
    actor: string;
  }[];
}

export const dashboardDemoData: DashboardDemoData = {
  availableStockKg: 2200,
  quarantineStockKg: 50,
  pendingApprovals: 3,
  coldStorages: [
    { id: "demo-cs-01", code: "CS-01", name: "Cold Storage 01", capacityKg: 3000, occupiedKg: 850 },
    { id: "demo-cs-02", code: "CS-02", name: "Cold Storage 02", capacityKg: 3000, occupiedKg: 1400 },
  ],
  recentMovements: [
    { id: "demo-move-01", type: "RECEIVE", product: "Daging Ayam Fillet", batch: "AY-260901", quantityKg: 500, date: "2026-09-26T08:30:00+07:00", actor: "Warehouse" },
    { id: "demo-move-02", type: "RECEIVE", product: "Daging Sapi", batch: "DS-260901", quantityKg: 350, date: "2026-09-26T09:10:00+07:00", actor: "Warehouse" },
    { id: "demo-move-03", type: "RECEIVE", product: "Ikan Dori", batch: "ID-260901", quantityKg: 250, date: "2026-09-26T10:15:00+07:00", actor: "Warehouse" },
    { id: "demo-move-04", type: "RECEIVE", product: "Udang", batch: "UD-260901", quantityKg: 150, date: "2026-09-26T11:05:00+07:00", actor: "Warehouse" },
    { id: "demo-move-05", type: "RENTAL_RECEIVE", product: "Sayuran Campur · PT Maju Pangan", batch: "MP-260926", quantityKg: 1000, date: "2026-09-26T11:30:00+07:00", actor: "Rental" },
  ],
};
