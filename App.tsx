
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  FileText, 
  History, 
  Plus, 
  Trash2, 
  Edit3,
  Search,
  X,
  Printer,
  AlertTriangle,
  BrainCircuit,
  Stethoscope,
  ShoppingCart,
  CheckCircle2,
  Users,
  Download,
  Upload,
  FileDown,
  ArrowUpRight,
  ArrowDownLeft,
  Settings,
  Cloud,
  RefreshCw,
  Clock,
  TrendingUp,
  BarChart3,
  ExternalLink,
  Info,
  Calendar,
  List,
  ChevronDown,
  Zap,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { Category, InventoryItem, Transaction, TransactionType, ItemType, ItemGroup } from './types';
import { getInventoryInsights } from './services/geminiService';

const STORAGE_KEY_ITEMS = 'safeman_v35_items';
const STORAGE_KEY_LOGS = 'safeman_v35_logs';
const STORAGE_KEY_GAS_URL = 'safeman_v35_gas_url';
const STORAGE_KEY_LAST_SYNC = 'safeman_v35_last_sync';

const DEPARTMENTS = [
  "工安組", "品質組", "供應組", "南一隊", "南二隊", "南三隊", "南四隊", "人資、政風、主任室"
];

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface BasketItem {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  spec: string;
  itemType: ItemType;
}

type SyncStatus = 'synced' | 'syncing' | 'error' | 'local';

// 排序類型
type SortKey = 'name' | 'quantity' | 'expiryDate' | 'lastUpdated';
type SortOrder = 'asc' | 'desc';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'medicine' | 'issuance' | 'history' | 'dashboard'>('inventory');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<Transaction[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [gasUrl, setGasUrl] = useState<string>(localStorage.getItem(STORAGE_KEY_GAS_URL) || '');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [lastSyncTime, setLastSyncTime] = useState<string>(localStorage.getItem(STORAGE_KEY_LAST_SYNC) || '從未同步');
  const [showSettings, setShowSettings] = useState(false);
  
  const [aiInsights, setAiInsights] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 排序狀態
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; order: SortOrder }>({ key: 'lastUpdated', order: 'desc' });

  // 看板篩選器
  const [statsDeptFilter, setStatsDeptFilter] = useState<string>('ALL');
  const [statsYearFilter, setStatsYearFilter] = useState<number>(new Date().getFullYear());

  const [lastTransactionBatch, setLastTransactionBatch] = useState<{
    id: string;
    dept: string;
    person: string;
    reason: string;
    items: BasketItem[];
    timestamp: number;
  } | null>(null);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{id: string, name: string} | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  
  // 領用作業搜尋狀態
  const [issuanceSearch, setIssuanceSearch] = useState('');
  const [isIssuanceDropdownOpen, setIsIssuanceDropdownOpen] = useState(false);
  const issuanceDropdownRef = useRef<HTMLDivElement>(null);

  const [issuanceMode, setIssuanceMode] = useState<TransactionType>('OUT');
  const [issuanceGroup, setIssuanceGroup] = useState<ItemGroup>('INVENTORY');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [inputQty, setInputQty] = useState<string>('1');
  const [inputPerson, setInputPerson] = useState(''); 
  const [inputReason, setInputReason] = useState('');
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0]);
  const [basket, setBasket] = useState<BasketItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initLoad = async () => {
      const savedItems = localStorage.getItem(STORAGE_KEY_ITEMS);
      const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
      if (savedItems) { try { const p = JSON.parse(savedItems); if (Array.isArray(p)) setItems(p); } catch (e) {} }
      if (savedLogs) { try { const p = JSON.parse(savedLogs); if (Array.isArray(p)) setLogs(p); } catch (e) {} }
      setIsLoaded(true);
      if (gasUrl) { fetchFromCloud(); } else { setSyncStatus('local'); }
    };
    initLoad();

    const handleClickOutside = (event: MouseEvent) => {
      if (issuanceDropdownRef.current && !issuanceDropdownRef.current.contains(event.target as Node)) {
        setIsIssuanceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [gasUrl]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
    }
  }, [items, logs, isLoaded]);

  const updateSyncTime = () => {
    const now = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const fullTime = `${new Date().toLocaleDateString('zh-TW')} ${now}`;
    setLastSyncTime(fullTime);
    localStorage.setItem(STORAGE_KEY_LAST_SYNC, fullTime);
  };

  const syncToCloud = async (currentItems: InventoryItem[], currentLogs: Transaction[]) => {
    if (!gasUrl) { setSyncStatus('local'); return; }
    setSyncStatus('syncing');
    try {
      const payload = { items: currentItems, logs: currentLogs, timestamp: Date.now() };
      await fetch(gasUrl, { method: 'POST', body: JSON.stringify(payload), mode: 'no-cors' });
      setSyncStatus('synced');
      updateSyncTime();
    } catch (err) {
      console.error("Cloud Sync Error:", err);
      setSyncStatus('error');
    }
  };

  const fetchFromCloud = async () => {
    if (!gasUrl) return;
    setSyncStatus('syncing');
    try {
      const response = await fetch(gasUrl);
      const data = await response.json();
      if (data && data.items) {
        setItems(data.items);
        setLogs(data.logs || []);
        setSyncStatus('synced');
        updateSyncTime();
      }
    } catch (err) {
      console.error("Fetch Cloud Error:", err);
      setSyncStatus('error');
    }
  };

  const handleGasUrlSave = (newUrl: string) => {
    const cleanUrl = newUrl.trim();
    setGasUrl(cleanUrl);
    localStorage.setItem(STORAGE_KEY_GAS_URL, cleanUrl);
    setShowSettings(false);
    if (cleanUrl) { fetchFromCloud(); } else { setSyncStatus('local'); }
  };

  const exportData = () => {
    const data = { items, logs, timestamp: Date.now() };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `工安管理備份_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.items) {
          if (window.confirm("確定要導入此備份並同步數據嗎？這將覆蓋現現有庫存。")) {
            setItems(data.items);
            setLogs(data.logs || []);
            syncToCloud(data.items, data.logs || []);
            window.alert("✅ 數據導入成功，已嘗試同步至雲端！");
          }
        }
      } catch (err) { window.alert("❌ 檔案格式錯誤，無法讀取。"); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const generateId = () => `TX-${Date.now().toString().slice(-6)}`;

  const getReservedQty = (itemId: string) => basket.filter(b => b.itemId === itemId).reduce((acc, curr) => acc + curr.quantity, 0);

  const currentAvailable = useMemo(() => {
    if (!selectedItemId) return 0;
    const item = items.find(i => i.id === selectedItemId);
    return item ? item.quantity - getReservedQty(selectedItemId) : 0;
  }, [selectedItemId, items, basket]);

  const isQtyOver = useMemo(() => {
    if (issuanceMode === 'IN') return false;
    const qty = Number(inputQty);
    return !isNaN(qty) && qty > currentAvailable;
  }, [inputQty, currentAvailable, issuanceMode]);

  // 計算常用品項
  const frequentItems = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.filter(l => l.type === 'OUT').forEach(l => {
      counts[l.itemId] = (counts[l.itemId] || 0) + 1;
    });
    
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => items.find(i => i.id === id))
      .filter((i): i is InventoryItem => !!i && i.itemGroup === issuanceGroup);
  }, [logs, items, issuanceGroup]);

  // 領用清單過濾
  const filteredIssuanceItems = useMemo(() => {
    return items.filter(i => 
      i.itemGroup === issuanceGroup && 
      (i.name.toLowerCase().includes(issuanceSearch.toLowerCase()) || 
       i.spec.toLowerCase().includes(issuanceSearch.toLowerCase()))
    );
  }, [items, issuanceGroup, issuanceSearch]);

  // 排序處理
  const toggleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc'
    }));
  };

  // 排序過濾後的清單
  const managedItems = useMemo(() => {
    const filtered = items.filter(i => 
      (activeTab === 'medicine' ? i.itemGroup === 'MEDICINE' : i.itemGroup === 'INVENTORY') && 
      i.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let valA: any = a[sortConfig.key] || '';
      let valB: any = b[sortConfig.key] || '';

      if (sortConfig.key === 'quantity') {
        valA = Number(valA); valB = Number(valB);
      } else if (sortConfig.key === 'expiryDate') {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase(); valB = valB.toLowerCase();
      }

      if (valA < valB) return sortConfig.order === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, activeTab, searchTerm, sortConfig]);

  const addToBasket = () => {
    if (!selectedItemId || isQtyOver) return;
    const targetItem = items.find(i => i.id === selectedItemId);
    if (!targetItem) return;
    const qty = Number(inputQty);
    if (isNaN(qty) || qty <= 0) return;
    setBasket(prev => [...prev, { itemId: targetItem.id, name: targetItem.name, quantity: qty, unit: targetItem.unit, spec: targetItem.spec, itemType: targetItem.itemType }]);
    setSelectedItemId(''); setInputQty('1'); setIssuanceSearch('');
  };

  const processIssuance = () => {
    if (basket.length === 0) return;
    const timestamp = Date.now();
    const batchId = generateId();
    let updatedItems = [...items];
    const newLogs: Transaction[] = [];

    basket.forEach(bItem => {
      updatedItems = updatedItems.map(item => {
        if (item.id === bItem.itemId) {
          const newQty = issuanceMode === 'IN' ? item.quantity + bItem.quantity : item.quantity - bItem.quantity;
          return { ...item, quantity: newQty, lastUpdated: timestamp };
        }
        return item;
      });
      newLogs.push({ 
        id: generateId() + Math.random().toString(36).substr(2, 4), 
        itemId: bItem.itemId, 
        itemName: bItem.name, 
        type: issuanceMode, 
        quantity: bItem.quantity, 
        person: inputPerson || '未填寫', 
        dept: issuanceMode === 'OUT' ? selectedDept : '修護處南部分處', 
        reason: inputReason, 
        timestamp: timestamp,
        spec: bItem.spec
      });
    });

    const finalLogs = [...newLogs, ...logs];
    setItems(updatedItems);
    setLogs(finalLogs);
    syncToCloud(updatedItems, finalLogs);

    if (issuanceMode === 'OUT') {
      setLastTransactionBatch({ id: batchId, dept: selectedDept, person: inputPerson, reason: inputReason, items: [...basket], timestamp: timestamp });
      setShowPrintModal(true);
    } else { window.alert(`✅ 物資補貨入庫完成。`); }
    setBasket([]); setInputPerson(''); setInputReason('');
  };

  const handleFinalPrint = (isPDF: boolean = false) => {
    if (!lastTransactionBatch) return;
    if (isPDF) { 
      window.alert("💡 另存為 PDF 指引：\n\n點擊確認後，請在印表機目的地選擇「另存為 PDF (Save as PDF)」。"); 
    }
    const date = new Date(lastTransactionBatch.timestamp);
    const isEquip = lastTransactionBatch.items.some(it => it.itemType === 'EQUIPMENT');
    const isConsum = lastTransactionBatch.items.every(it => it.itemType === 'CONSUMABLE') || !isEquip;
    
    const rows = lastTransactionBatch.items.map(item => `<tr><td style="text-align:center; color:black !important; padding: 12px; border: 1.5px solid black;">${item.name}</td><td style="text-align:center; color:black !important; border: 1.5px solid black;">${item.spec || ''}</td><td style="text-align:center; color:black !important; border: 1.5px solid black;">${item.unit}</td><td style="text-align:center; font-size:18pt; font-weight:bold; color:black !important; border: 1.5px solid black;">${item.quantity}</td><td style="text-align:center; color:black !important; border: 1.5px solid black;">${lastTransactionBatch.reason}</td></tr>`).join('');
    const emptyRowsCount = Math.max(0, 15 - lastTransactionBatch.items.length);
    const emptyRows = Array(emptyRowsCount).fill('<tr><td style="height:35px; border: 1.5px solid black;">&nbsp;</td><td style="border: 1.5px solid black;"></td><td style="border: 1.5px solid black;"></td><td style="border: 1.5px solid black;"></td><td style="border: 1.5px solid black;"></td></tr>').join('');

    const printWin = window.open('', '_blank', 'width=1100,height=900');
    if (!printWin) return;
    printWin.document.write(`
      <html><head><title>領用單_${lastTransactionBatch.id}</title><style>
            @font-face { font-family: 'StandardKai'; src: local('標楷體'), local('DFKai-SB'), local('BiauKai'); }
            @page { margin: 0; }
            body { font-family: 'StandardKai', serif; padding: 80px 60px; color: black !important; background: white; margin: 0; line-height: 1.2; }
            .title { text-align: center; font-size: 26pt; font-weight: bold; margin-bottom: 25px; letter-spacing: 2px; color: black !important; }
            .checkbox-area { display: flex; justify-content: center; gap: 40px; font-size: 16pt; margin-bottom: 25px; font-weight: bold; color: black !important; }
            .checkbox { width: 22px; height: 22px; border: 2.5px solid black; display: inline-flex; align-items: center; justify-content: center; margin-right: 8px; vertical-align: middle; color: black !important; }
            .dept-row { font-size: 15pt; font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; color: black !important; }
            table { width: 100%; border-collapse: collapse; border: 2.5px solid black; margin-bottom: 25px; color: black !important; }
            th { border: 1.5px solid black; padding: 10px; text-align: center; font-size: 14pt; font-weight: bold; background: #f2f2f2; color: black !important; }
            td { color: black !important; text-align: center; }
            .footer-row { font-size: 14pt; font-weight: bold; margin-top: 30px; color: black !important; }
            .sig-area { display: flex; justify-content: space-between; margin-top: 45px; font-size: 13pt; color: black !important; }
            @media print { body { padding: 80px 60px; } .no-print { display: none; } }
          </style></head><body>
          <div style="display: flex; flex-direction: column; align-items: flex-end;"><div style="font-size: 9pt; color: #666;">單號：${lastTransactionBatch.id}</div>${lastTransactionBatch.person ? `<div style="font-size: 9pt; color: #333; margin-top: 2px;">領用人：${lastTransactionBatch.person}</div>` : ''}</div>
          <div class="title">台灣電力公司電力修護處南部分處</div>
          <div class="checkbox-area"><div><span class="checkbox">${isEquip ? 'V' : ''}</span>安全衛生設備借用單</div><div><span class="checkbox">${isConsum ? 'V' : ''}</span>安全衛生類消耗品領用單</div></div>
          <div class="dept-row"><div>部 門：<span style="border-bottom: 2px dotted black; min-width: 350px; display: inline-block; text-align: center;">${lastTransactionBatch.dept}</span></div><div>${date.getFullYear() - 1911} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日</div></div>
          <table><thead><tr><th style="width:35%; color:black !important;">名　　　稱</th><th style="width:25%; color:black !important;">規　規範（序　號）</th><th style="width:10%; color:black !important;">單 位</th><th style="width:10%; color:black !important;">數 量</th><th style="width:20%; color:black !important;">備　　註</th></tr></thead><tbody>${rows}${emptyRows}</tbody></table>
          <div class="footer-row"><div style="display: flex; justify-content: space-between; color:black !important;"><div style="flex:1">申請部門：</div><div style="flex:1">經管部門：</div></div><div class="sig-area"><div style="flex:1; display:flex; justify-content:space-around; padding: 0 15px; color:black !important;"><span>經辦：</span><span>課長：</span><span>經理：</span></div><div style="flex:1; display:flex; justify-content:space-around; padding: 0 15px; color:black !important;"><span>經辦：</span><span>課長：</span><span>經理：</span></div></div></div>
          <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 600); };</script></body></html>
    `);
    printWin.document.close();
  };

  const handleSaveItem = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const data = { name: formData.get('name') as string, itemType: formData.get('itemType') as ItemType, unit: formData.get('unit') as string, spec: formData.get('spec') as string, purchaseDate: formData.get('purchaseDate') as string, expiryDate: formData.get('expiryDate') as string, quantity: Number(formData.get('quantity')), minStock: Number(formData.get('minStock')), };
    let updated;
    if (editTarget) {
      updated = items.map(i => i.id === editTarget.id ? { ...editTarget, ...data } : i);
      setItems(updated); setEditTarget(null);
    } else {
      updated = [...items, { id: generateId(), ...data, itemGroup: activeTab === 'medicine' ? 'MEDICINE' : 'INVENTORY', category: Category.OTHER, description: '', lastUpdated: Date.now() }];
      setItems(updated); setShowAddModal(false);
    }
    syncToCloud(updated, logs);
  };

  const stats = useMemo(() => {
    const invItems = items.filter(i => i.itemGroup === 'INVENTORY');
    const medItems = items.filter(i => i.itemGroup === 'MEDICINE');
    
    const filteredLogs = logs.filter(l => {
        const logDate = new Date(l.timestamp);
        return l.type === 'OUT' && logDate.getFullYear() === statsYearFilter && (statsDeptFilter === 'ALL' || l.dept === statsDeptFilter);
    });
    
    const invDetailMap: Record<string, {name: string, qty: number}> = {};
    const medDetailMap: Record<string, {name: string, qty: number}> = {};
    let fInvQty = 0, fMedQty = 0;
    
    filteredLogs.forEach(log => {
        const item = items.find(it => it.id === log.itemId);
        if (item?.itemGroup === 'MEDICINE') { 
          fMedQty += log.quantity; 
          if (!medDetailMap[log.itemId]) medDetailMap[log.itemId] = { name: log.itemName, qty: 0 }; 
          medDetailMap[log.itemId].qty += log.quantity; 
        } else { 
          fInvQty += log.quantity; 
          if (!invDetailMap[log.itemId]) invDetailMap[log.itemId] = { name: log.itemName, qty: 0 }; 
          invDetailMap[log.itemId].qty += log.quantity; 
        }
    });

    const invDetails = Object.values(invDetailMap).sort((a, b) => b.qty - a.qty);
    const medDetails = Object.values(medDetailMap).sort((a, b) => b.qty - a.qty);

    return {
      sys: { invTotal: invItems.length, medTotal: medItems.length },
      filtered: { 
        invQty: fInvQty, 
        medQty: fMedQty, 
        invDetails, 
        medDetails,
        logs: filteredLogs, 
        chartData: invDetails.slice(0, 8).map(d => ({ name: d.name, value: d.qty }))
      },
      deptRanking: Object.entries(logs.filter(l => l.type === 'OUT' && new Date(l.timestamp).getFullYear() === statsYearFilter).reduce((acc: any, curr) => { acc[curr.dept] = (acc[curr.dept] || 0) + curr.quantity; return acc; }, {})).sort((a: any, b: any) => b[1] - a[1])
    };
  }, [items, logs, statsDeptFilter, statsYearFilter]);

  const isMedicineExpired = (dateStr?: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const formatDateDisplay = (dateStr?: string) => {
    if (!dateStr) return '未填';
    return dateStr.replace(/-/g, '/');
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={12} className="text-slate-300 ml-1 opacity-50 group-hover:opacity-100" />;
    return sortConfig.order === 'asc' ? <ArrowUp size={12} className="text-blue-600 ml-1" /> : <ArrowDown size={12} className="text-blue-600 ml-1" />;
  };

  return (
    <div className="min-h-screen flex bg-slate-100 text-black font-sans">
      <style>{`
        input, select, textarea { color: #000000 !important; background-color: #ffffff !important; border: 2px solid #94a3b8 !important; font-weight: 700 !important; }
        
        input[type="date"]::-webkit-calendar-picker-indicator { 
          cursor: pointer; 
          filter: invert(0) grayscale(100%) brightness(0%); 
          opacity: 1; 
          display: block;
          background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>');
          background-size: contain; width: 20px; height: 20px;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .pulse-orange { animation: pulse-orange 2s infinite; }
        @keyframes pulse-orange { 0% { box-shadow: 0 0 0 0 rgba(251, 146, 60, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(251, 146, 60, 0); } 100% { box-shadow: 0 0 0 0 rgba(251, 146, 60, 0); } }
      `}</style>
      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={importData} />
      <aside className="w-72 bg-slate-900 text-white p-6 flex flex-col shrink-0 border-r border-slate-800 shadow-2xl">
        <div className="flex flex-col gap-1 mb-8">
          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg"><Package size={22} className="text-white"/></div><h1 className="font-black text-xl tracking-tight text-white">工安管理系統</h1></div>
          <div className="mt-6 bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">雲端連線狀態</span><div className={`w-3 h-3 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]' : syncStatus === 'syncing' ? 'bg-amber-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]' : 'bg-orange-400 pulse-orange'}`}></div></div>
            <div className="text-sm font-black text-white mb-1">{syncStatus === 'synced' ? '已成功連線' : syncStatus === 'syncing' ? '正在同步數據...' : syncStatus === 'error' ? '連線中斷 / 網址錯誤' : '尚未設定雲端網址'}</div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold"><Clock size={10}/> 最後同步：{lastSyncTime}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {[ { id: 'inventory', label: '工安耗材管理', icon: Package }, { id: 'medicine', label: '急救藥材管理', icon: Stethoscope }, { id: 'issuance', label: '領用補貨作業', icon: FileText }, { id: 'history', label: '歷史異動日誌', icon: History }, { id: 'dashboard', label: '數據統計看板', icon: LayoutDashboard }, ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl font-bold transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}><tab.icon size={20} /> {tab.label}</button>
          ))}
        </nav>
        <div className="pt-6 mt-6 border-t border-slate-800 space-y-2">
            <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">管理與備份</p>
            <button onClick={() => setShowSettings(true)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${!gasUrl ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}><Settings size={16}/> 雲端連線設定</button>
            <button onClick={fetchFromCloud} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"><RefreshCw size={16}/> 手動重新同步</button>
            <button onClick={exportData} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"><Download size={16}/> 匯出備份 (JSON)</button>
            <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-all"><Upload size={16}/> 導入備份</button>
        </div>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black text-black">{activeTab === 'inventory' ? '工安耗材清冊' : activeTab === 'medicine' ? '急救藥材清冊' : activeTab === 'issuance' ? '領用 / 補貨登記' : activeTab === 'history' ? '歷史異動日誌' : '數據統計看板'}</h2>
          </div>
          {(activeTab === 'inventory' || activeTab === 'medicine') && (
            <button onClick={() => setShowAddModal(true)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-black shadow-xl"><Plus size={18}/> 新增項目</button>
          )}
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2"><label className="text-xs font-black text-slate-400">統計年度</label><select className="p-2 rounded-lg text-sm font-bold text-black border-2 border-slate-300" value={statsYearFilter} onChange={e => setStatsYearFilter(Number(e.target.value))}><option value={new Date().getFullYear()}>{new Date().getFullYear()}</option><option value={2024}>2024</option></select></div>
              <div className="flex items-center gap-2"><label className="text-xs font-black text-slate-400">篩選部門</label><select className="p-2 rounded-lg text-sm font-bold text-black border-2 border-slate-300" value={statsDeptFilter} onChange={e => setStatsDeptFilter(e.target.value)}><option value="ALL">全廠總覽</option>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-xl flex flex-col justify-between">
                <div><p className="text-blue-400 text-xs font-black uppercase tracking-widest">年度篩選總領用</p><h3 className="text-5xl font-black mt-2 text-white">{stats.filtered.invQty + stats.filtered.medQty}</h3></div>
                <TrendingUp className="text-blue-500 mt-4" size={32}/>
              </div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-blue-500">
                <p className="text-slate-400 text-xs font-black uppercase">工安消耗品</p>
                <h3 className="text-4xl font-black mt-2 text-blue-600">{stats.filtered.invQty} <span className="text-sm font-bold text-slate-400">件</span></h3>
              </div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-emerald-500">
                <p className="text-slate-400 text-xs font-black uppercase">急救藥材</p>
                <h3 className="text-4xl font-black mt-2 text-emerald-600">{stats.filtered.medQty} <span className="text-sm font-bold text-slate-400">件</span></h3>
              </div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-orange-500">
                <p className="text-slate-400 text-xs font-black uppercase">庫存不足警示</p>
                <h3 className="text-4xl font-black mt-2 text-orange-600">{items.filter(i => i.quantity <= i.minStock).length} <span className="text-sm font-bold text-slate-400">項</span></h3>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-lg flex flex-col min-h-[450px]">
                <h4 className="text-xl font-black mb-6 flex items-center gap-2 text-black"><BarChart3 className="text-blue-500"/> 熱門領用品項分析 (依篩選)</h4>
                <div className="flex-1 w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.filtered.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} />
                      <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', fontWeight: 800 }} cursor={{ fill: '#f8fafc' }} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={40}>
                        {stats.filtered.chartData.map((entry, index) => ( <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} /> ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] shadow-lg flex flex-col">
                <h4 className="text-xl font-black mb-6 flex items-center gap-2 text-black"><Users className="text-slate-600"/> 部門領用貢獻排行</h4>
                <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  {stats.deptRanking.map(([dept, count]: any, idx) => (
                    <div key={dept} className="group flex items-center gap-4 bg-slate-50 p-4 rounded-2xl transition-all hover:bg-slate-100 hover:translate-x-1">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black ${idx === 0 ? 'bg-amber-500 text-white shadow-lg shadow-amber-200' : 'bg-slate-900 text-white'}`}>{idx + 1}</div>
                      <div className="flex-1 font-bold text-black">{dept}</div>
                      <div className="font-black text-black bg-white px-3 py-1 rounded-lg border border-slate-200">{count} 件</div>
                    </div>
                  ))}
                  {stats.deptRanking.length === 0 && <p className="text-slate-300 text-center py-20 font-bold">目前無領用數據</p>}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-xl overflow-hidden border border-slate-200">
              <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                <h4 className="text-xl font-black flex items-center gap-2"><List size={20}/> 領用明細檢視 (篩選後結果)</h4>
                <span className="text-xs font-bold px-3 py-1 bg-blue-600 rounded-full">共 {stats.filtered.logs.length} 筆</span>
              </div>
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 sticky top-0 z-10 text-[10px] font-black text-slate-500 uppercase border-b">
                    <tr><th className="px-6 py-4">時間</th><th className="px-6 py-4">品項</th><th className="px-6 py-4">部門</th><th className="px-6 py-4">人員</th><th className="px-6 py-4 text-right">數量</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.filtered.logs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-xs font-bold text-slate-400">{new Date(log.timestamp).toLocaleDateString()}</td>
                        <td className="px-6 py-4 font-black text-black">{log.itemName}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{log.dept}</td>
                        <td className="px-6 py-4 font-bold text-slate-600">{log.person}</td>
                        <td className="px-6 py-4 text-right font-black text-blue-600">{log.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden h-fit group">
              <div className="absolute top-[-20px] right-[-20px] w-40 h-40 bg-blue-600 rounded-full opacity-20 blur-3xl group-hover:opacity-40 transition-opacity"></div>
              <h4 className="text-2xl font-black flex items-center gap-3 text-white relative z-10"><BrainCircuit size={28} className="text-blue-400"/> AI 庫存智能分析系統</h4>
              <p className="mt-2 text-slate-400 font-bold relative z-10">點擊按鈕，讓 Gemini 協助您優化採購計劃與安全建議</p>
              <button onClick={async () => { setIsAiLoading(true); setAiInsights(await getInventoryInsights(items)); setIsAiLoading(false); }} className="w-full mt-8 py-5 bg-blue-600 text-white rounded-2xl font-black text-xl shadow-xl hover:bg-blue-500 active:scale-95 transition-all relative z-10 flex items-center justify-center gap-3">
                {isAiLoading ? <RefreshCw className="animate-spin" size={24}/> : <CheckCircle2 size={24}/>}
                {isAiLoading ? '數據掃描中...' : '生成專業庫存分析報告'}
              </button>
              {aiInsights && (
                <div className="bg-white mt-6 p-8 rounded-[2rem] text-black text-lg font-bold whitespace-pre-wrap leading-relaxed animate-in zoom-in">
                  {aiInsights}
                </div>
              )}
            </div>
          </div>
        )}

        {(activeTab === 'inventory' || activeTab === 'medicine') && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-50 border-b flex items-center justify-between">
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="搜尋項目名稱..." className="w-full pl-12 pr-4 py-3 rounded-xl font-bold text-black border-2 border-slate-300" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div className="text-xs font-bold text-slate-400">目前顯示：{managedItems.length} 個品項</div>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-[11px] font-black text-slate-500 uppercase border-b">
                <tr>
                  <th className="px-8 py-5 cursor-pointer group hover:bg-slate-200 transition-colors" onClick={() => toggleSort('name')}>
                    <div className="flex items-center">名稱及規格 <SortIcon column="name" /></div>
                  </th>
                  <th className="px-8 py-5 text-center cursor-pointer group hover:bg-slate-200 transition-colors" onClick={() => toggleSort('quantity')}>
                    <div className="flex items-center justify-center">目前庫存 <SortIcon column="quantity" /></div>
                  </th>
                  {activeTab === 'medicine' && (
                    <th className="px-8 py-5 text-center cursor-pointer group hover:bg-slate-200 transition-colors" onClick={() => toggleSort('expiryDate')}>
                      <div className="flex items-center justify-center">有效期限 <SortIcon column="expiryDate" /></div>
                    </th>
                  )}
                  <th className="px-8 py-5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managedItems.map(item => {
                  const expired = isMedicineExpired(item.expiryDate);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-8 py-5">
                        <div className="font-black text-black">{item.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-black border ${item.itemType === 'EQUIPMENT' ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-slate-500 border-slate-200 bg-slate-50'}`}>{item.itemType === 'EQUIPMENT' ? '設備' : '耗材'}</span>
                          <span className="text-xs text-slate-400 font-bold">{item.spec || '無規格'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-center">
                        <span className={`px-6 py-2 rounded-xl font-black text-xl border-2 ${item.quantity <= item.minStock ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          {item.quantity} {item.unit}
                        </span>
                      </td>
                      {activeTab === 'medicine' && (
                        <td className="px-8 py-5 text-center">
                          <div className={`text-sm font-black flex items-center justify-center gap-1.5 ${expired ? 'text-red-600' : 'text-emerald-600'}`}>
                            <Calendar size={14}/> {formatDateDisplay(item.expiryDate)}
                          </div>
                        </td>
                      )}
                      <td className="px-8 py-5 text-right">
                        <button onClick={() => setEditTarget(item)} className="p-2 text-slate-400 hover:text-blue-600"><Edit3 size={20}/></button>
                        <button onClick={() => setDeleteTarget({id: item.id, name: item.name})} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={20}/></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'issuance' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-xl border border-slate-200">
              <h3 className="text-xl font-black mb-8 flex items-center gap-2 text-black"><ShoppingCart className="text-blue-500"/> 1. 挑選項目</h3>
              <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                <button onClick={()=>{setIssuanceMode('OUT'); setBasket([]);}} className={`flex-1 py-3 rounded-lg font-black transition-all ${issuanceMode==='OUT'?'bg-white shadow text-blue-600':'text-slate-400'}`}>領用出庫</button>
                <button onClick={()=>{setIssuanceMode('IN'); setBasket([]);}} className={`flex-1 py-3 rounded-lg font-black transition-all ${issuanceMode==='IN'?'bg-white shadow text-emerald-600':'text-slate-400'}`}>補貨入庫</button>
              </div>
              <div className="space-y-6">
                <div><label className="text-xs font-black text-slate-500 uppercase tracking-widest">分類</label><div className="flex gap-2 mt-2"><button onClick={()=>{setIssuanceGroup('INVENTORY'); setIssuanceSearch(''); setSelectedItemId('');}} className={`flex-1 py-3 rounded-xl font-black border-2 ${issuanceGroup==='INVENTORY'?'bg-blue-50 border-blue-500 text-blue-600':'bg-white border-slate-200 text-slate-400'}`}>耗材類</button><button onClick={()=>{setIssuanceGroup('MEDICINE'); setIssuanceSearch(''); setSelectedItemId('');}} className={`flex-1 py-3 rounded-xl font-black border-2 ${issuanceGroup==='MEDICINE'?'bg-emerald-50 border-emerald-500 text-emerald-600':'bg-white border-slate-200 text-slate-400'}`}>藥材類</button></div></div>
                
                {/* 向上彈出式智慧搜尋器 */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2 block">品項選取 (向上展開選單)</label>
                    <div className="relative" ref={issuanceDropdownRef}>
                      {isIssuanceDropdownOpen && (
                        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] max-h-96 overflow-y-auto custom-scrollbar">
                          {issuanceSearch === '' && frequentItems.length > 0 && (
                            <div className="p-2 border-b bg-blue-50/30">
                              <p className="px-3 py-1 text-[10px] font-black text-blue-600 uppercase flex items-center gap-1"><Zap size={10} fill="currentColor"/> 智慧熱門建議</p>
                              <div className="grid grid-cols-1 gap-1 mt-1">
                                {frequentItems.map(item => {
                                  const remaining = item.quantity - getReservedQty(item.id);
                                  const isCritical = remaining <= item.minStock || remaining <= 0;
                                  return (
                                    <button key={item.id} onClick={() => { setSelectedItemId(item.id); setIssuanceSearch(item.name); setIsIssuanceDropdownOpen(false); }} className="w-full text-left p-3 hover:bg-blue-100 rounded-lg flex justify-between items-center group transition-colors">
                                      <div><span className="font-black text-slate-900">{item.name}</span><span className="ml-2 text-xs text-slate-400 font-bold">[{item.spec}]</span></div>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded border transition-colors ${isCritical ? 'text-red-600 bg-red-50 border-red-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                                          剩餘: {remaining} {item.unit}
                                        </span>
                                        <span className="text-[10px] font-black text-blue-600 opacity-0 group-hover:opacity-100">快速選取</span>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div className="p-1">
                            {filteredIssuanceItems.length > 0 ? (
                              filteredIssuanceItems.map(item => {
                                const remaining = item.quantity - getReservedQty(item.id);
                                const isCritical = remaining <= item.minStock || remaining <= 0;
                                return (
                                  <button key={item.id} onClick={() => { setSelectedItemId(item.id); setIssuanceSearch(item.name); setIsIssuanceDropdownOpen(false); }} className="w-full text-left p-4 hover:bg-slate-50 rounded-xl flex flex-col gap-1 border-b border-slate-50 last:border-0">
                                    <div className="flex justify-between items-start">
                                      <span className="font-black text-black text-lg">{item.name}</span>
                                      <span className={`text-xs font-black px-2 py-0.5 rounded transition-colors ${isCritical ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50'}`}>
                                        剩餘: {remaining} {item.unit}
                                      </span>
                                    </div>
                                    <span className="text-xs text-slate-400 font-bold">規格: {item.spec || '無'}</span>
                                  </button>
                                );
                              })
                            ) : <div className="p-10 text-center text-slate-300 font-bold italic">未找到匹配品項</div>}
                          </div>
                        </div>
                      )}
                      <div className="relative">
                        <input type="text" placeholder="搜尋項目名稱..." className="w-full p-4 pr-12 rounded-xl text-lg font-bold border-2" value={selectedItemId ? items.find(i=>i.id===selectedItemId)?.name : issuanceSearch} onChange={(e) => { setIssuanceSearch(e.target.value); setSelectedItemId(''); setIsIssuanceDropdownOpen(true); }} onFocus={() => setIsIssuanceDropdownOpen(true)} />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><Search size={20}/></div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 常用標籤 */}
                  {frequentItems.length > 0 && !selectedItemId && (
                    <div className="flex flex-wrap gap-2">
                      {frequentItems.map(item => {
                        const remaining = item.quantity - getReservedQty(item.id);
                        const isCritical = remaining <= item.minStock || remaining <= 0;
                        return (
                          <button key={item.id} onClick={() => { setSelectedItemId(item.id); setIssuanceSearch(item.name); }} className={`px-3 py-1.5 bg-white rounded-full text-xs font-black transition-all shadow-sm border flex items-center gap-1 hover:bg-slate-900 hover:text-white ${isCritical ? 'text-red-600 border-red-200' : 'text-slate-600 border-slate-200'}`}>
                            <Zap size={10} className={isCritical ? 'text-red-500' : 'text-amber-500'} fill="currentColor"/> {item.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div><label className="text-xs font-black text-slate-500 uppercase tracking-widest">數量</label><input type="number" min="1" className="w-full p-4 rounded-xl mt-2 text-xl font-bold" value={inputQty} onChange={e=>setInputQty(e.target.value)}/>{isQtyOver && <p className="text-red-600 text-xs font-black mt-2">⚠️ 超出庫存</p>}</div>
                <button onClick={addToBasket} disabled={!selectedItemId || isQtyOver} className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-2 shadow-lg transition-all ${!selectedItemId || isQtyOver ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-black'}`}><Plus size={20}/> 加入處理清單</button>
              </div>
            </div>
            <div className="lg:col-span-3 bg-white p-8 rounded-3xl shadow-xl border border-slate-200 flex flex-col">
              <h3 className="text-xl font-black mb-6 flex items-center gap-2 text-black"><FileText className="text-emerald-500"/> 2. 待處理作業</h3>
              <div className="flex-1 overflow-y-auto border-2 border-dashed border-slate-100 rounded-2xl mb-6 min-h-[250px] bg-slate-50">{basket.length > 0 ? (<table className="w-full text-left"><tbody className="divide-y divide-slate-100">{basket.map((b, idx) => (<tr key={idx} className="bg-white"><td className="px-6 py-5 font-black text-black">{b.name}</td><td className="px-6 py-5 text-center font-black text-blue-700">{b.quantity} {b.unit}</td><td className="px-6 py-5 text-right"><button onClick={()=>setBasket(prev => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-600"><X size={20}/></button></td></tr>))}</tbody></table>) : (<div className="h-full flex items-center justify-center text-slate-300 font-bold opacity-30">清單目前為空</div>)}</div>
              {issuanceMode === 'OUT' && (
                <div className="grid grid-cols-2 gap-6 mb-6"><div><label className="text-xs font-black text-slate-500 uppercase">領用部門</label><select className="w-full p-3 rounded-xl mt-2 text-black font-bold" value={selectedDept} onChange={e=>setSelectedDept(e.target.value)}>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div><div><label className="text-xs font-black text-slate-500 uppercase">領用人</label><input type="text" className="w-full p-3 rounded-xl mt-2 text-black font-bold" value={inputPerson} onChange={e=>setInputPerson(e.target.value)}/></div><div className="col-span-2"><label className="text-xs font-black text-slate-500 uppercase">用途說明</label><input type="text" className="w-full p-3 rounded-xl mt-2 text-black font-bold" value={inputReason} onChange={e=>setInputReason(e.target.value)}/></div></div>
              )}
              <button onClick={processIssuance} disabled={basket.length === 0} className={`w-full py-6 rounded-2xl font-black text-3xl shadow-2xl transition-all active:scale-95 text-white ${issuanceMode==='OUT'?'bg-blue-600 hover:bg-blue-700':'bg-emerald-600 hover:bg-emerald-700'}`}>{issuanceMode === 'OUT' ? '確認領用' : '確認入庫'}</button>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-[11px] font-black text-slate-500 uppercase border-b">
                <tr><th className="px-6 py-5">異動時間</th><th className="px-6 py-5">狀態</th><th className="px-6 py-5">項目 (數量)</th><th className="px-6 py-5">規格</th><th className="px-6 py-5">部門 / 經手人</th><th className="px-6 py-5 text-right">補印</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-5 text-xs font-bold text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-6 py-5 font-black">{log.type === 'OUT' ? <span className="text-blue-600 font-bold">領用出庫</span> : <span className="text-emerald-600 font-bold">補貨入庫</span>}</td>
                    <td className="px-6 py-5 font-black text-black">{log.itemName} (x{log.quantity})</td>
                    <td className="px-6 py-5 font-bold text-slate-500">{log.spec || '--'}</td>
                    <td className="px-6 py-5 font-bold text-slate-600">{log.dept} / {log.person}</td>
                    <td className="px-6 py-5 text-right">
                      {log.type === 'OUT' ? <button onClick={()=>{ setLastTransactionBatch({ id: log.id, dept: log.dept, person: log.person, reason: log.reason, items: [{ itemId: log.itemId, name: log.itemName, quantity: log.quantity, unit: '個', spec: log.spec || '', itemType: 'CONSUMABLE' }], timestamp: log.timestamp }); setShowPrintModal(true); }} className="text-slate-400 hover:text-blue-600"><Printer size={18}/></button> : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(editTarget || showAddModal) && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-xl p-10 shadow-2xl animate-in zoom-in duration-300">
              <form className="space-y-6" onSubmit={handleSaveItem}>
                <h3 className="text-2xl font-black text-black mb-4">{editTarget ? '編輯項目' : '新增項目'}</h3>
                <div><label className="text-xs font-black text-slate-500 uppercase">物資名稱</label><input name="name" type="text" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.name} /></div>
                <div className="grid grid-cols-2 gap-6">
                  <div><label className="text-xs font-black text-slate-500">分類</label><select name="itemType" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.itemType || 'CONSUMABLE'}><option value="EQUIPMENT">安全衛生設備</option><option value="CONSUMABLE">安全衛生類消耗品</option></select></div>
                  <div><label className="text-xs font-black text-slate-500">規範 (序號)</label><input name="spec" type="text" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.spec || ''} /></div>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div><label className="text-xs font-black text-slate-500">單位</label><input name="unit" type="text" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.unit || '個'} /></div>
                  <div><label className="text-xs font-black text-slate-500">目前庫存</label><input name="quantity" type="number" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.quantity || 0} /></div>
                  <div><label className="text-xs font-black text-slate-500">警戒數量</label><input name="minStock" type="number" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.minStock || 5} /></div>
                </div>
                { (activeTab === 'medicine' || editTarget?.itemGroup === 'MEDICINE') && (
                  <div className="grid grid-cols-2 gap-6 animate-in fade-in">
                    <div><label className="text-xs font-black text-slate-500">購入日期</label><input name="purchaseDate" type="date" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.purchaseDate} /></div>
                    <div><label className="text-xs font-black text-slate-500">有效日期</label><input name="expiryDate" type="date" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.expiryDate} /></div>
                  </div>
                )}
                <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-2xl shadow-xl mt-6">儲存物資</button>
                <button type="button" onClick={()=>{setEditTarget(null);setShowAddModal(false)}} className="w-full py-3 text-slate-400 font-bold hover:text-black">取消返回</button>
              </form>
            </div>
          </div>
        )}

        {showPrintModal && lastTransactionBatch && (
          <div className="fixed inset-0 bg-slate-900/95 z-[500] flex flex-col items-center justify-center p-6">
            <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="p-8 flex justify-between items-center border-b bg-white relative z-10 shadow-sm">
                <div className="flex items-center gap-4"><CheckCircle2 className="text-emerald-500" size={40}/><h3 className="font-black text-2xl text-black">領用單據生成預覽</h3></div>
                <div className="flex gap-4"><button onClick={() => handleFinalPrint(false)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-xl hover:scale-105 transition-all flex items-center gap-2"><Printer size={24}/> 直接列印</button><button onClick={()=>setShowPrintModal(false)} className="p-4 bg-slate-100 rounded-2xl text-black hover:bg-slate-200"><X size={32}/></button></div>
              </div>
              <div className="flex-1 bg-slate-100 p-10 overflow-y-auto flex justify-center shadow-inner">
                <div className="bg-white shadow-2xl p-6 border rounded-sm origin-top mb-10 scale-90">
                  <div style={{width:'210mm', minHeight:'297mm', padding:'40px', color:'black', background:'white'}}>
                    <h1 style={{textAlign:'center', fontSize:'24pt', fontWeight:'bold', marginBottom:'25px'}}>台灣電力公司電力修護處南部分處</h1>
                    <div style={{display:'flex', justifyContent:'center', gap:'40px', fontSize:'15pt', marginBottom:'25px', fontWeight:'bold'}}>
                      <div><span style={{border:'2.5px solid black', width:'20px', height:'20px', display:'inline-flex', alignItems:'center', justifyContent:'center', marginRight:'8px', verticalAlign:'middle'}}>{lastTransactionBatch.items.some(it => it.itemType === 'EQUIPMENT') ? 'V' : ''}</span> 設備借用單</div>
                      <div><span style={{border:'2.5px solid black', width:'20px', height:'20px', display:'inline-flex', alignItems:'center', justifyContent:'center', marginRight:'8px', verticalAlign:'middle'}}>{lastTransactionBatch.items.every(it => it.itemType === 'CONSUMABLE') ? 'V' : ''}</span> 消耗品領用單</div>
                    </div>
                    <table style={{width:'100%', borderCollapse:'collapse', border:'2px solid black'}}>
                      <thead><tr style={{background:'#f2f2f2'}}><th style={{padding:'8px', border:'1.5px solid black'}}>名稱</th><th style={{padding:'8px', border:'1.5px solid black'}}>規範</th><th style={{padding:'8px', border:'1.5px solid black'}}>數量</th></tr></thead>
                      <tbody>{lastTransactionBatch.items.map((it, i) => (<tr key={i}><td style={{textAlign:'center', padding:'12px', border:'1.5px solid black'}}>{it.name}</td><td style={{border:'1.5px solid black', textAlign:'center'}}>{it.spec}</td><td style={{fontWeight:'bold', fontSize:'16pt', border:'1.5px solid black', textAlign:'center'}}>{it.quantity}</td></tr>))}</tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[600] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-xl p-10 shadow-2xl animate-in zoom-in duration-300">
              <h3 className="text-2xl font-black text-black mb-6">雲端同步設定</h3>
              <input type="text" className="w-full p-4 rounded-xl mt-2 text-black font-bold border-2" placeholder="GAS URL" defaultValue={gasUrl} id="gas-url-input"/>
              <div className="flex gap-4 mt-8"><button onClick={() => handleGasUrlSave((document.getElementById('gas-url-input') as HTMLInputElement).value)} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black text-xl shadow-xl">儲存</button><button onClick={() => setShowSettings(false)} className="px-8 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xl">取消</button></div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center p-4 z-[400] animate-in fade-in">
            <div className="bg-white p-10 rounded-3xl text-center max-w-sm shadow-2xl">
              <h3 className="text-2xl font-black mb-4 text-black">確定刪除「{deleteTarget.name}」？</h3>
              <button onClick={()=>{ setItems(items.filter(i => i.id !== deleteTarget.id)); syncToCloud(items.filter(i => i.id !== deleteTarget.id), logs); setDeleteTarget(null); }} className="w-full py-4 bg-red-600 text-white rounded-xl font-black mb-2 shadow-lg">確認刪除</button>
              <button onClick={()=>setDeleteTarget(null)} className="w-full py-4 text-slate-400 font-bold hover:text-black">取消</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
