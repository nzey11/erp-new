export interface DashboardSummary {
  stockValue: number;
  revenueMonth: number;
  pendingDocuments: number;
  lowStockAlerts: number;
  recentDocuments: RecentDocument[];
  cashFlow: CashFlowSummary;
}

export interface RecentDocument {
  id: string;
  number: string;
  type: string;
  status: string;
  totalAmount: number;
  date: Date;
  counterpartyName: string | null;
}

export interface CashFlowSummary {
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}
