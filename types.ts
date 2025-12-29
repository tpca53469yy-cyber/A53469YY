
export enum Category {
  PROTECTION = '個人防護 (PPE)',
  FIRE_SAFETY = '消防安全',
  FIRST_AID = '急救耗材',
  SIGNAGE = '標誌警告',
  TOOL = '工具設備',
  OTHER = '其他'
}

export type ItemType = 'EQUIPMENT' | 'CONSUMABLE';
// 新增：群組分類 (耗材或藥材)
export type ItemGroup = 'INVENTORY' | 'MEDICINE';

export interface InventoryItem {
  id: string;
  name: string;
  category: Category;
  itemType: ItemType; 
  itemGroup: ItemGroup; // 新增分類
  unit: string;
  spec: string;
  quantity: number;
  minStock: number;
  purchaseDate?: string; // 新增：購入日期
  expiryDate?: string;   // 新增：到期日
  description: string;
  lastUpdated: number;
}

export type TransactionType = 'IN' | 'OUT';

export interface Transaction {
  id: string;
  itemId: string;
  itemName: string;
  type: TransactionType;
  quantity: number;
  person: string;
  dept: string;
  reason: string;
  timestamp: number;
}

export interface DashboardStats {
  totalItems: number;
  lowStockItems: number;
  monthlyOutbound: number;
}
