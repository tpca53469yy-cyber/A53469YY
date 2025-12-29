
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
  Info
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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'medicine' | 'issuance' | 'history' | 'dashboard'>('inventory');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<Transaction[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [gasUrl, setGasUrl] = useState<string>(localStorage.getItem(STORAGE_KEY_GAS_URL) || '');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [lastSyncTime, setLastSyncTime] = useState<string>(localStorage.getItem(STORAGE_KEY_LAST_SYNC) || '從未同步');
  const [showSettings, setShowSettings] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // 處理中狀態
  
  const [aiInsights, setAiInsights] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);

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
  const [issuanceMode, setIssuanceMode] = useState<TransactionType>('OUT');
  const [issuanceGroup, setIssuanceGroup] = useState<ItemGroup>('INVENTORY');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [inputQty, setInputQty] = useState<string>('1');
  const [inputPerson, setInputPerson] = useState(''); 
  const [inputReason, setInputReason] = useState('');
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0]);
  const [basket, setBasket] = useState<BasketItem[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化與高頻同步 (15秒一次)
  useEffect(() => {
    const initLoad = async () => {
      const savedItems = localStorage.getItem(STORAGE_KEY_ITEMS);
      const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
      if (savedItems) { try { const p = JSON.parse(savedItems); if (Array.isArray(p)) setItems(p); } catch (e) {} }
      if (savedLogs) { try { const p = JSON.parse(savedLogs); if (Array.isArray(p)) setLogs(p); } catch (e) {} }
      setIsLoaded(true);
      if (gasUrl) fetchFromCloud();
    };
    initLoad();

    const interval = setInterval(() => {
      if (localStorage.getItem(STORAGE_KEY_GAS_URL) && !isProcessing) {
        fetchFromCloud();
      }
    }, 15000); // 縮短為 15 秒，減少資訊落差

    return () => clearInterval(interval);
  }, [gasUrl, isProcessing]);

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

  const fetchFromCloud = async (): Promise<{items: InventoryItem[], logs: Transaction[]} | null> => {
    const currentUrl = localStorage.getItem(STORAGE_KEY_GAS_URL);
    if (!currentUrl) return null;
    setSyncStatus('syncing');
    try {
      const response = await fetch(currentUrl);
      const data = await response.json();
      if (data && data.items) {
        setItems(data.items);
        setLogs(data.logs || []);
        setSyncStatus('synced');
        updateSyncTime();
        return data;
      }
    } catch (err) {
      console.error("Fetch Cloud Error:", err);
      setSyncStatus('error');
    }
    return null;
  };

  const handleGasUrlSave = (newUrl: string) => {
    const cleanUrl = newUrl.trim();
    setGasUrl(cleanUrl);
    localStorage.setItem(STORAGE_KEY_GAS_URL, cleanUrl);
    setShowSettings(false);
    if (cleanUrl) fetchFromCloud(); else setSyncStatus('local');
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

  const addToBasket = () => {
    if (!selectedItemId || isQtyOver) return;
    const targetItem = items.find(i => i.id === selectedItemId);
    if (!targetItem) return;
    const qty = Number(inputQty);
    if (isNaN(qty) || qty <= 0) return;
    setBasket(prev => [...prev, { itemId: targetItem.id, name: targetItem.name, quantity: qty, unit: targetItem.unit, spec: targetItem.spec, itemType: targetItem.itemType }]);
    setSelectedItemId(''); setInputQty('1');
  };

  // 核心改動：處理領用時先對齊雲端
  const processIssuance = async () => {
    if (basket.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    // 1. 先抓最新的雲端資料，確保基準點正確
    const cloudData = await fetchFromCloud();
    const latestItems = cloudData ? cloudData.items : [...items];
    const latestLogs = cloudData ? cloudData.logs : [...logs];

    const timestamp = Date.now();
    const batchId = generateId();
    let updatedItems = [...latestItems];
    const newLogs: Transaction[] = [];

    // 2. 在最新的數據基礎上進行加減
    basket.forEach(bItem => {
      updatedItems = updatedItems.map(item => {
        if (item.id === bItem.itemId) {
          const newQty = issuanceMode === 'IN' ? item.quantity + bItem.quantity : item.quantity - bItem.quantity;
          return { ...item, quantity: Math.max(0, newQty), lastUpdated: timestamp };
        }
        return item;
      });
      newLogs.push({ id: generateId() + Math.random().toString(36).substr(2, 4), itemId: bItem.itemId, itemName: bItem.name, type: issuanceMode, quantity: bItem.quantity, person: inputPerson || '未填寫', dept: issuanceMode === 'OUT' ? selectedDept : '修護處南部分處', reason: inputReason, timestamp: timestamp });
    });

    const finalLogs = [...newLogs, ...latestLogs];
    setItems(updatedItems);
    setLogs(finalLogs);

    // 3. 立即推回雲端
    await syncToCloud(updatedItems, finalLogs);

    if (issuanceMode === 'OUT') {
      setLastTransactionBatch({ id: batchId, dept: selectedDept, person: inputPerson, reason: inputReason, items: [...basket], timestamp: timestamp });
      setShowPrintModal(true);
    } else { window.alert(`✅ 入庫完成。數據已同步至雲端。`); }
    
    setBasket([]); setInputPerson(''); setInputReason('');
    setIsProcessing(false);
  };

  const handleFinalPrint = (isPDF: boolean = false) => {
    if (!lastTransactionBatch) return;
    const date = new Date(lastTransactionBatch.timestamp);
    const isEquip = lastTransactionBatch.items.some(it => it.itemType === 'EQUIPMENT');
    const isConsum = lastTransactionBatch.items.every(it => it.itemType === 'CONSUMABLE') || !isEquip;
    
    const rows = lastTransactionBatch.items.map(item => `<tr><td style="text-align:center; padding: 12px; border: 1.5px solid black;">${item.name}</td><td style="text-align:center; border: 1.5px solid black;">${item.spec || ''}</td><td style="text-align:center; border: 1.5px solid black;">${item.unit}</td><td style="text-align:center; font-size:18pt; font-weight:bold; border: 1.5px solid black;">${item.quantity}</td><td style="text-align:center; border: 1.5px solid black;">${lastTransactionBatch.reason}</td></tr>`).join('');
    const emptyRowsCount = Math.max(0, 15 - lastTransactionBatch.items.length);
    const emptyRows = Array(emptyRowsCount).fill('<tr><td style="height:35px; border: 1.5px solid black;">&nbsp;</td><td style="border: 1.5px solid black;"></td><td style="border: 1.5px solid black;"></td><td style="border: 1.5px solid black;"></td><td style="border: 1.5px solid black;"></td></tr>').join('');

    const printWin = window.open('', '_blank', 'width=1100,height=900');
    if (!printWin) return;
    printWin.document.write(`
      <html><head><title>領用單_${lastTransactionBatch.id}</title><style>
            @font-face { font-family: 'StandardKai'; src: local('標楷體'), local('DFKai-SB'), local('BiauKai'); }
            @page { margin: 0; }
            body { font-family: 'StandardKai', serif; padding: 80px 60px; color: black !important; background: white; margin: 0; }
            .title { text-align: center; font-size: 26pt; font-weight: bold; margin-bottom: 25px; }
            .checkbox-area { display: flex; justify-content: center; gap: 40px; font-size: 16pt; margin-bottom: 25px; font-weight: bold; }
            .checkbox { width: 22px; height: 22px; border: 2.5px solid black; display: inline-flex; align-items: center; justify-content: center; margin-right: 8px; vertical-align: middle; }
            .dept-row { font-size: 15pt; font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; }
            table { width: 100%; border-collapse: collapse; border: 2.5px solid black; margin-bottom: 25px; }
            th { border: 1.5px solid black; padding: 10px; text-align: center; font-size: 14pt; font-weight: bold; background: #f2f2f2; }
            .footer-row { font-size: 14pt; font-weight: bold; margin-top: 30px; }
            .sig-area { display: flex; justify-content: space-between; margin-top: 45px; font-size: 13pt; }
            @media print { body { padding: 80px 60px; } }
          </style></head><body>
          <div style="display: flex; flex-direction: column; align-items: flex-end;"><div style="font-size: 9pt; color: #666;">單號：${lastTransactionBatch.id}</div></div>
          <div class="title">台灣電力公司電力修護處南部分處</div>
          <div class="checkbox-area"><div><span class="checkbox">${isEquip ? 'V' : ''}</span>設備借用單</div><div><span class="checkbox">${isConsum ? 'V' : ''}</span>消耗品領用單</div></div>
          <div class="dept-row"><div>部 門：<span style="border-bottom: 2px dotted black; min-width: 350px; display: inline-block; text-align: center;">${lastTransactionBatch.dept}</span></div><div>${date.getFullYear() - 1911} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日</div></div>
          <table><thead><tr><th>名稱</th><th>規範</th><th>單位</th><th>數量</th><th>備註</th></tr></thead><tbody>${rows}${emptyRows}</tbody></table>
          <div class="footer-row">
            <div style="display: flex; justify-content: space-between;"><div style="flex:1">申請部門：</div><div style="flex:1">經管部門：</div></div>
            <div class="sig-area"><div style="flex:1; display:flex; justify-content:space-around;"><span>經辦：</span><span>課長：</span><span>經理：</span></div><div style="flex:1; display:flex; justify-content:space-around;"><span>經辦：</span><span>課長：</span><span>經理：</span></div></div>
          </div>
          <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 600); };</script></body></html>
    `);
    printWin.document.close();
  };

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);

    const cloudData = await fetchFromCloud();
    const latestItems = cloudData ? cloudData.items : [...items];

    const formData = new FormData(e.currentTarget);
    const data = { name: formData.get('name') as string, itemType: formData.get('itemType') as ItemType, unit: formData.get('unit') as string, spec: formData.get('spec') as string, quantity: Number(formData.get('quantity')), minStock: Number(formData.get('minStock')), };
    
    let updated;
    if (editTarget) {
      updated = latestItems.map(i => i.id === editTarget.id ? { ...editTarget, ...data, lastUpdated: Date.now() } : i);
      setItems(updated); setEditTarget(null);
    } else {
      updated = [...latestItems, { id: generateId(), ...data, itemGroup: activeTab === 'medicine' ? 'MEDICINE' : 'INVENTORY', category: Category.OTHER, description: '', lastUpdated: Date.now() }];
      setItems(updated); setShowAddModal(false);
    }
    
    await syncToCloud(updated, logs);
    setIsProcessing(false);
  };

  const stats = useMemo(() => {
    const invItems = items.filter(i => i.itemGroup === 'INVENTORY');
    const filteredLogs = logs.filter(l => l.type === 'OUT' && new Date(l.timestamp).getFullYear() === statsYearFilter && (statsDeptFilter === 'ALL' || l.dept === statsDeptFilter));
    const invDetailMap: Record<string, {name: string, qty: number}> = {};
    const medDetailMap: Record<string, {name: string, qty: number}> = {};
    let fInvQty = 0, fMedQty = 0;
    filteredLogs.forEach(log => {
        const item = items.find(it => it.id === log.itemId);
        if (item?.itemGroup === 'MEDICINE') { fMedQty += log.quantity; if (!medDetailMap[log.itemId]) medDetailMap[log.itemId] = { name: log.itemName, qty: 0 }; medDetailMap[log.itemId].qty += log.quantity; }
        else { fInvQty += log.quantity; if (!invDetailMap[log.itemId]) invDetailMap[log.itemId] = { name: log.itemName, qty: 0 }; invDetailMap[log.itemId].qty += log.quantity; }
    });
    const invDetails = Object.values(invDetailMap).sort((a, b) => b.qty - a.qty);
    return { sys: { invTotal: invItems.length }, filtered: { invQty: fInvQty, medQty: fMedQty, invDetails, medDetails: Object.values(medDetailMap), chartData: invDetails.slice(0, 8).map(d => ({ name: d.name, value: d.qty })) }, deptRanking: Object.entries(logs.filter(l => l.type === 'OUT' && new Date(l.timestamp).getFullYear() === statsYearFilter).reduce((acc: any, curr) => { acc[curr.dept] = (acc[curr.dept] || 0) + curr.quantity; return acc; }, {})).sort((a: any, b: any) => b[1] - a[1]) };
  }, [items, logs, statsDeptFilter, statsYearFilter]);

  return (
    <div className="min-h-screen flex bg-slate-100 text-black font-sans">
      <style>{`
        input, select, textarea { color: #000000 !important; background-color: #ffffff !important; border: 2px solid #94a3b8 !important; font-weight: 700 !important; }
        .pulse-orange { animation: pulse-orange 2s infinite; }
        @keyframes pulse-orange { 0% { box-shadow: 0 0 0 0 rgba(251, 146, 60, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(251, 146, 60, 0); } 100% { box-shadow: 0 0 0 0 rgba(251, 146, 60, 0); } }
      `}</style>

      {/* 處理中遮罩 */}
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[999] flex flex-col items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 border-4 border-blue-500">
            <RefreshCw className="text-blue-600 animate-spin" size={48} />
            <div className="text-2xl font-black text-slate-900">正在對齊雲端數據...</div>
            <div className="text-slate-500 font-bold">確保多人同時使用不產生落差</div>
          </div>
        </div>
      )}

      <aside className="w-72 bg-slate-900 text-white p-6 flex flex-col shrink-0 border-r border-slate-800 shadow-2xl">
        <div className="flex flex-col gap-1 mb-8">
          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center"><Package size={22} className="text-white"/></div><h1 className="font-black text-xl text-white">工安管理系統</h1></div>
          <div className="mt-6 bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-black text-slate-500 uppercase">雲端同步狀態</span><div className={`w-3 h-3 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500 shadow-lg' : syncStatus === 'syncing' ? 'bg-amber-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500 shadow-lg' : 'bg-orange-400 pulse-orange'}`}></div></div>
            <div className="text-sm font-black text-white">{syncStatus === 'synced' ? '已連接 (高頻模式)' : syncStatus === 'syncing' ? '對齊數據中...' : syncStatus === 'error' ? '連線錯誤' : '尚未設定網址'}</div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1"><Clock size={10}/> 最後校對: {lastSyncTime}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {[ { id: 'inventory', label: '工安耗材管理', icon: Package }, { id: 'medicine', label: '急救藥材管理', icon: Stethoscope }, { id: 'issuance', label: '領用補貨作業', icon: FileText }, { id: 'history', label: '歷史異動日誌', icon: History }, { id: 'dashboard', label: '數據統計看板', icon: LayoutDashboard }, ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl font-bold transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}><tab.icon size={20} /> {tab.label}</button>
          ))}
        </nav>
        <div className="pt-6 mt-6 border-t border-slate-800 space-y-2">
            <button onClick={() => setShowSettings(true)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-black transition-all ${!gasUrl ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 pulse-orange' : 'text-slate-300 hover:bg-slate-800'}`}><Settings size={16}/> 雲端連線設定</button>
            <button onClick={() => fetchFromCloud()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 transition-all"><RefreshCw size={16}/> 立即校對雲端</button>
            <button onClick={() => { const data = { items, logs, timestamp: Date.now() }; const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `工安管理備份_${new Date().toLocaleDateString().replace(/\//g, '-')}.json`; link.click(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 transition-all"><Download size={16}/> 匯出備份</button>
        </div>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto relative">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black text-black">{activeTab === 'inventory' ? '工安耗材清冊' : activeTab === 'medicine' ? '急救藥材清冊' : activeTab === 'issuance' ? '領用 / 補貨登記' : activeTab === 'history' ? '歷史異動日誌' : '數據統計看板'}</h2>
            {!gasUrl && (
              <div onClick={() => setShowSettings(true)} className="mt-6 bg-orange-50 border-4 border-orange-200 p-6 rounded-3xl flex items-center gap-4 text-orange-700 cursor-pointer hover:bg-orange-100 transition-all shadow-xl animate-bounce">
                <AlertTriangle size={32} className="text-orange-500 shrink-0"/>
                <div><div className="font-black text-xl">⚠️ 系統尚未連線 (請點擊此處)</div><div className="text-base font-bold opacity-90">首次使用或新同事請點擊此處並貼上 GAS 網址，以載入全組庫存資料。</div></div>
                <div className="ml-auto bg-orange-500 text-white px-4 py-2 rounded-xl font-black shadow-lg flex items-center gap-2">設定 <ArrowUpRight size={18}/></div>
              </div>
            )}
          </div>
          {(activeTab === 'inventory' || activeTab === 'medicine') && (
            <button onClick={() => setShowAddModal(true)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-black shadow-xl"><Plus size={18}/> 新增項目</button>
          )}
        </header>

        {activeTab === 'issuance' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-xl border border-slate-200">
              <h3 className="text-xl font-black mb-8 flex items-center gap-2 text-black"><ShoppingCart className="text-blue-500"/> 1. 挑選項目</h3>
              <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                <button onClick={()=>{setIssuanceMode('OUT'); setBasket([]);}} className={`flex-1 py-3 rounded-lg font-black transition-all ${issuanceMode==='OUT'?'bg-white shadow text-blue-600':'text-slate-400'}`}>領用出庫</button>
                <button onClick={()=>{setIssuanceMode('IN'); setBasket([]);}} className={`flex-1 py-3 rounded-lg font-black transition-all ${issuanceMode==='IN'?'bg-white shadow text-emerald-600':'text-slate-400'}`}>補貨入庫</button>
              </div>
              <div className="space-y-6">
                <div><label className="text-xs font-black text-slate-500 uppercase">品項類型</label><div className="flex gap-2 mt-2"><button onClick={()=>setIssuanceGroup('INVENTORY')} className={`flex-1 py-3 rounded-xl font-black border-2 ${issuanceGroup==='INVENTORY'?'bg-blue-50 border-blue-500 text-blue-600':'bg-white border-slate-200 text-slate-400'}`}>耗材</button><button onClick={()=>setIssuanceGroup('MEDICINE')} className={`flex-1 py-3 rounded-xl font-black border-2 ${issuanceGroup==='MEDICINE'?'bg-emerald-50 border-emerald-500 text-emerald-600':'bg-white border-slate-200 text-slate-400'}`}>藥材</button></div></div>
                <div><label className="text-xs font-black text-slate-500 uppercase">選擇品項</label><select className="w-full p-4 rounded-xl mt-2 text-lg text-black font-bold" value={selectedItemId} onChange={e=>setSelectedItemId(e.target.value)}><option value="">-- 請選擇 --</option>{items.filter(i => i.itemGroup === issuanceGroup).map(i => (<option key={i.id} value={i.id}>{i.name} ({issuanceMode === 'OUT' ? `剩餘:${i.quantity - getReservedQty(i.id)}` : `目前:${i.quantity}`})</option>))}</select></div>
                <div><label className="text-xs font-black text-slate-500 uppercase">數量</label><input type="number" min="1" className="w-full p-4 rounded-xl mt-2 text-xl font-bold" value={inputQty} onChange={e=>setInputQty(e.target.value)}/>{isQtyOver && <p className="text-red-600 text-xs font-black mt-2">⚠️ 超出庫存</p>}</div>
                <button onClick={addToBasket} disabled={!selectedItemId || isQtyOver} className={`w-full py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-2 shadow-lg ${!selectedItemId || isQtyOver ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-black'}`}><Plus size={20}/> 加入清單</button>
              </div>
            </div>
            <div className="lg:col-span-3 bg-white p-8 rounded-3xl shadow-xl border border-slate-200 flex flex-col">
              <h3 className="text-xl font-black mb-6 flex items-center gap-2 text-black"><FileText className="text-emerald-500"/> 2. 待處理清單</h3>
              <div className="flex-1 overflow-y-auto border-2 border-dashed border-slate-100 rounded-2xl mb-6 min-h-[250px] bg-slate-50">{basket.length > 0 ? (<table className="w-full text-left"><tbody className="divide-y divide-slate-100">{basket.map((b, idx) => (<tr key={idx} className="bg-white"><td className="px-6 py-5 font-black text-black">{b.name}</td><td className="px-6 py-5 text-center font-black text-blue-700">{b.quantity} {b.unit}</td><td className="px-6 py-5 text-right"><button onClick={()=>setBasket(prev => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-600"><X size={20}/></button></td></tr>))}</tbody></table>) : (<div className="h-full flex items-center justify-center text-slate-300 font-bold opacity-30">目前清單為空</div>)}</div>
              {issuanceMode === 'OUT' && (
                <div className="grid grid-cols-2 gap-6 mb-6"><div><label className="text-xs font-black text-slate-500 uppercase">部門</label><select className="w-full p-3 rounded-xl mt-2 text-black font-bold" value={selectedDept} onChange={e=>setSelectedDept(e.target.value)}>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div><div><label className="text-xs font-black text-slate-500 uppercase">領用人</label><input type="text" className="w-full p-3 rounded-xl mt-2 text-black font-bold" value={inputPerson} onChange={e=>setInputPerson(e.target.value)}/></div></div>
              )}
              <button onClick={processIssuance} disabled={basket.length === 0 || isProcessing} className={`w-full py-6 rounded-2xl font-black text-3xl shadow-2xl transition-all text-white ${issuanceMode==='OUT'?'bg-blue-600 hover:bg-blue-700':'bg-emerald-600 hover:bg-emerald-700'}`}>{isProcessing ? '同步中...' : (issuanceMode === 'OUT' ? '確認領用 (生成單據)' : '確認入庫')}</button>
            </div>
          </div>
        )}

        {/* 其餘分頁內容與之前相同，僅 handleSaveItem/processIssuance 有邏輯改動 */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-xl"><p className="text-blue-400 text-xs font-black uppercase">年度領用量</p><h3 className="text-5xl font-black mt-2">{stats.filtered.invQty + stats.filtered.medQty}</h3></div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-blue-500"><p className="text-slate-400 text-xs font-black uppercase">工安消耗品</p><h3 className="text-4xl font-black mt-2 text-blue-600">{stats.filtered.invQty}</h3></div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-emerald-500"><p className="text-slate-400 text-xs font-black uppercase">急救藥材</p><h3 className="text-4xl font-black mt-2 text-emerald-600">{stats.filtered.medQty}</h3></div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-orange-500"><p className="text-slate-400 text-xs font-black uppercase">低庫存警戒</p><h3 className="text-4xl font-black mt-2 text-orange-600">{items.filter(i => i.quantity <= i.minStock).length}</h3></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-lg flex flex-col min-h-[450px]">
                <h4 className="text-xl font-black mb-6 flex items-center gap-2"><BarChart3 className="text-blue-500"/> 熱門領用品項分析</h4>
                <div className="flex-1 w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.filtered.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} />
                      <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', fontWeight: 800 }} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={40}>{stats.filtered.chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />))}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-lg flex flex-col">
                <h4 className="text-xl font-black mb-6 flex items-center gap-2"><Users className="text-slate-600"/> 部門領用排行</h4>
                <div className="space-y-4 flex-1 overflow-y-auto pr-2">{stats.deptRanking.map(([dept, count]: any, idx) => (<div key={dept} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl"><div className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-900 text-white text-xs font-black">{idx + 1}</div><div className="flex-1 font-bold">{dept}</div><div className="font-black">{count} 件</div></div>))}</div>
              </div>
            </div>
            <div className="flex flex-col gap-6">
                <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-[-20px] right-[-20px] w-40 h-40 bg-blue-600 rounded-full opacity-20 blur-3xl"></div>
                  <h4 className="text-2xl font-black flex items-center gap-3"><BrainCircuit size={28} className="text-blue-400"/> AI 庫存智能分析系統</h4>
                  <p className="mt-2 text-slate-400 font-bold">點擊按鈕，由 Gemini 提供專業採購建議與管理規劃</p>
                  <button onClick={async () => { setIsAiLoading(true); setAiInsights(await getInventoryInsights(items)); setIsAiLoading(false); }} className="w-full mt-8 py-5 bg-blue-600 text-white rounded-2xl font-black text-xl shadow-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-3">{isAiLoading ? <RefreshCw className="animate-spin" size={24}/> : <CheckCircle2 size={24}/>}{isAiLoading ? '分析中...' : '生成庫存診斷報告'}</button>
                </div>
                {aiInsights && (<div className="bg-white p-8 rounded-[2.5rem] shadow-lg border-2 border-blue-100 animate-in zoom-in"><div className="text-black text-lg font-bold whitespace-pre-wrap leading-relaxed">{aiInsights}</div></div>)}
            </div>
          </div>
        )}

        {(activeTab === 'inventory' || activeTab === 'medicine') && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-50 border-b flex items-center justify-between"><div className="relative max-w-sm w-full"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="搜尋名稱..." className="w-full pl-12 pr-4 py-3 rounded-xl font-bold" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div></div>
            <table className="w-full text-left"><thead className="bg-slate-100 text-[11px] font-black text-slate-500 border-b"><tr><th className="px-8 py-5">名稱及規格</th><th className="px-8 py-5 text-center">庫存</th><th className="px-8 py-5 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{items.filter(i => (activeTab === 'medicine' ? i.itemGroup === 'MEDICINE' : i.itemGroup === 'INVENTORY') && i.name.toLowerCase().includes(searchTerm.toLowerCase())).map(item => (<tr key={item.id} className="hover:bg-slate-50"><td className="px-8 py-5"><div className="font-black text-black text-lg">{item.name}</div><div className="text-xs text-slate-400 font-bold">{item.spec || '無規格'} | {item.itemType === 'EQUIPMENT' ? '設備' : '消耗品'}</div></td><td className="px-8 py-5 text-center"><span className={`px-6 py-2 rounded-xl font-black text-xl ${item.quantity <= item.minStock ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600'}`}>{item.quantity} {item.unit}</span></td><td className="px-8 py-5 text-right"><button onClick={() => setEditTarget(item)} className="p-2 text-slate-400 hover:text-blue-600"><Edit3 size={20}/></button><button onClick={() => setDeleteTarget({id: item.id, name: item.name})} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={20}/></button></td></tr>))}</tbody></table>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            <table className="w-full text-left"><thead className="bg-slate-100 text-[11px] font-black text-slate-500 border-b"><tr><th className="px-6 py-5">時間</th><th className="px-6 py-5">動作</th><th className="px-6 py-5">項目</th><th className="px-6 py-5">部門/人員</th><th className="px-6 py-5 text-right">補印</th></tr></thead><tbody className="divide-y divide-slate-100">{logs.map(log => (<tr key={log.id} className="hover:bg-slate-50"><td className="px-6 py-5 text-xs font-bold text-slate-400">{new Date(log.timestamp).toLocaleString()}</td><td className="px-6 py-5 font-black">{log.type === 'OUT' ? <span className="text-blue-600">領用出庫</span> : <span className="text-emerald-600">補貨入庫</span>}</td><td className="px-6 py-5 font-black text-black">{log.itemName} (x{log.quantity})</td><td className="px-6 py-5 font-bold text-slate-600">{log.dept} / {log.person}</td><td className="px-6 py-5 text-right">{log.type === 'OUT' ? <button onClick={()=>{ setLastTransactionBatch({id: log.id, dept: log.dept, person: log.person, reason: log.reason, items: [{itemId: log.itemId, name: log.itemName, quantity: log.quantity, unit: '個', spec: '', itemType: 'CONSUMABLE'}], timestamp: log.timestamp}); setShowPrintModal(true); }} className="text-slate-400 hover:text-blue-600"><Printer size={20}/></button> : '--'}</td></tr>))}</tbody></table>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[600] flex items-center justify-center p-4 animate-in fade-in"><div className="bg-white rounded-[2.5rem] w-full max-w-xl p-10 shadow-2xl"><div className="flex items-center gap-4 mb-8"><div className="p-4 bg-blue-100 text-blue-600 rounded-2xl"><Cloud size={32}/></div><div><h3 className="text-2xl font-black text-black">雲端同步設定</h3><p className="text-slate-400 font-bold">同步多人數據</p></div></div><div className="space-y-6"><div><label className="text-xs font-black text-slate-500">GAS Web App URL</label><input type="text" className="w-full p-4 rounded-xl mt-2 text-black font-bold" placeholder="https://script.google.com/macros/s/.../exec" defaultValue={gasUrl} id="gas-url-input"/><p className="mt-4 text-xs text-slate-500 font-bold bg-slate-50 p-4 rounded-xl">💡 貼上 GAS 網址後，系統將自動從雲端下載最新庫存。</p></div><div className="flex gap-4"><button onClick={() => handleGasUrlSave((document.getElementById('gas-url-input') as HTMLInputElement).value)} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black text-xl shadow-xl">儲存並同步</button><button onClick={() => setShowSettings(false)} className="px-8 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xl">取消</button></div></div></div></div>
        )}

        {showPrintModal && lastTransactionBatch && (
          <div className="fixed inset-0 bg-slate-900/95 z-[500] flex flex-col items-center justify-center p-6"><div className="bg-white rounded-[3rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden"><div className="p-8 flex justify-between items-center border-b bg-white"><h3 className="font-black text-2xl text-black">單據預覽</h3><div className="flex gap-4"><button onClick={() => handleFinalPrint(false)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-xl flex items-center gap-2"><Printer size={24}/> 列印</button><button onClick={() => handleFinalPrint(true)} className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-xl flex items-center gap-2"><FileDown size={24}/> 下載 PDF</button><button onClick={()=>setShowPrintModal(false)} className="p-4 bg-slate-100 rounded-2xl"><X size={32}/></button></div></div><div className="flex-1 bg-slate-100 p-10 overflow-y-auto flex justify-center"><div className="bg-white shadow-2xl p-6 border scale-90 origin-top mb-10"><div style={{width:'210mm', minHeight:'297mm', padding:'40px', color:'black', background:'white'}}><h1 style={{textAlign:'center', fontSize:'24pt', fontWeight:'bold', marginBottom:'25px'}}>台灣電力公司電力修護處南部分處</h1><div style={{display:'flex', justifyContent:'center', gap:'40px', fontSize:'15pt', marginBottom:'25px', fontWeight:'bold'}}><div><span style={{border:'2px solid black', width:'20px', height:'20px', display:'inline-flex', marginRight:'8px', verticalAlign:'middle'}}>{lastTransactionBatch.items.some(it => it.itemType === 'EQUIPMENT') ? 'V' : ''}</span> 設備借用單</div><div><span style={{border:'2px solid black', width:'20px', height:'20px', display:'inline-flex', marginRight:'8px', verticalAlign:'middle'}}>{lastTransactionBatch.items.every(it => it.itemType === 'CONSUMABLE') ? 'V' : ''}</span> 消耗品領用單</div></div><div style={{display:'flex', justifyContent:'space-between', marginBottom:'15px', fontWeight:'bold', fontSize:'14pt'}}><div>部 門：<span style={{borderBottom:'1.5px dotted black', minWidth:'300px', display:'inline-block', textAlign:'center'}}>{lastTransactionBatch.dept}</span></div><div>{new Date(lastTransactionBatch.timestamp).getFullYear() - 1911} 年 {new Date(lastTransactionBatch.timestamp).getMonth() + 1} 月 {new Date(lastTransactionBatch.timestamp).getDate()} 日</div></div><table style={{width:'100%', borderCollapse:'collapse', border:'2px solid black'}}><thead><tr style={{background:'#f2f2f2'}}><th style={{padding:'8px', border:'1.5px solid black'}}>名稱</th><th style={{padding:'8px', border:'1.5px solid black'}}>規範</th><th style={{padding:'8px', border:'1.5px solid black'}}>單位</th><th style={{padding:'8px', border:'1.5px solid black'}}>數量</th><th style={{padding:'8px', border:'1.5px solid black'}}>備註</th></tr></thead><tbody>{lastTransactionBatch.items.map((it, i) => (<tr key={i}><td style={{textAlign:'center', padding:'12px', border:'1.5px solid black'}}>{it.name}</td><td style={{border:'1.5px solid black', textAlign:'center'}}>{it.spec}</td><td style={{border:'1.5px solid black', textAlign:'center'}}>{it.unit}</td><td style={{fontWeight:'bold', fontSize:'16pt', border:'1.5px solid black', textAlign:'center'}}>{it.quantity}</td><td style={{border:'1.5px solid black', textAlign:'center'}}>{lastTransactionBatch.reason}</td></tr>))}{Array(Math.max(0, 15 - lastTransactionBatch.items.length)).fill(0).map((_, i) => (<tr key={i}><td style={{height:'35px', border:'1.5px solid black'}}>&nbsp;</td><td style={{border:'1.5px solid black'}}></td><td style={{border:'1.5px solid black'}}></td><td style={{border:'1.5px solid black'}}></td><td style={{border:'1.5px solid black'}}></td></tr>))}</tbody></table><div style={{marginTop:'35px', fontWeight:'bold', fontSize:'13pt'}}><div style={{display:'flex', justifyContent:'space-between'}}><div style={{flex:1}}>申請部門：</div><div style={{flex:1}}>經管部門：</div></div><div style={{display:'flex', justifyContent:'space-between', marginTop:'45px', fontSize:'12pt'}}><div style={{flex:1, display:'flex', justifyContent:'space-around'}}><span>經辦：</span><span>課長：</span><span>經理：</span></div><div style={{flex:1, display:'flex', justifyContent:'space-around'}}><span>經辦：</span><span>課長：</span><span>經理：</span></div></div></div></div></div></div></div></div>
        )}

        {(editTarget || showAddModal) && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4"><div className="bg-white rounded-[2.5rem] w-full max-w-xl p-10 shadow-2xl animate-in zoom-in"><form className="space-y-6" onSubmit={handleSaveItem}><h3 className="text-2xl font-black text-black">{editTarget ? '編輯項目' : '新增項目'}</h3><div><label className="text-xs font-black text-slate-500 uppercase">物資名稱</label><input name="name" type="text" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.name} /></div><div className="grid grid-cols-2 gap-6"><div><label className="text-xs font-black text-slate-500">分類</label><select name="itemType" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.itemType || 'CONSUMABLE'}><option value="EQUIPMENT">安全衛生設備</option><option value="CONSUMABLE">安全衛生類消耗品</option></select></div><div><label className="text-xs font-black text-slate-500">規範 (序號)</label><input name="spec" type="text" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.spec || ''} /></div></div><div className="grid grid-cols-3 gap-6"><div><label className="text-xs font-black text-slate-500">單位</label><input name="unit" type="text" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.unit || '個'} /></div><div><label className="text-xs font-black text-slate-500">目前庫存</label><input name="quantity" type="number" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.quantity || 0} /></div><div><label className="text-xs font-black text-slate-500">警戒數量</label><input name="minStock" type="number" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.minStock || 5} /></div></div><button type="submit" disabled={isProcessing} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-2xl shadow-xl mt-6">{isProcessing ? '同步中...' : '儲存物資'}</button><button type="button" onClick={()=>{setEditTarget(null);setShowAddModal(false)}} className="w-full py-3 text-slate-400 font-bold hover:text-black">取消</button></form></div></div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center p-4 z-[400] animate-in fade-in"><div className="bg-white p-10 rounded-3xl text-center max-w-sm"><h3 className="text-2xl font-black mb-4">確定刪除「{deleteTarget.name}」？</h3><button onClick={()=>{ setItems(items.filter(i => i.id !== deleteTarget.id)); syncToCloud(items.filter(i => i.id !== deleteTarget.id), logs); setDeleteTarget(null); }} className="w-full py-4 bg-red-600 text-white rounded-xl font-black mb-2">確認刪除</button><button onClick={()=>setDeleteTarget(null)} className="w-full py-4 text-slate-400 font-bold">取消</button></div></div>
        )}
      </main>
    </div>
  );
};

export default App;
