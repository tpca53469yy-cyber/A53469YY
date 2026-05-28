
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
  Settings,
  RefreshCw,
  Clock,
  TrendingUp,
  BarChart3,
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

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; order: SortOrder }>({ key: 'lastUpdated', order: 'desc' });
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
      if (gasUrl) { fetchFromCloud(); }
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

  const syncToCloud = async (currentItems: InventoryItem[], currentLogs: Transaction[]) => {
    if (!gasUrl) return;
    setSyncStatus('syncing');
    try {
      const payload = { items: currentItems, logs: currentLogs, timestamp: Date.now() };
      await fetch(gasUrl, { method: 'POST', body: JSON.stringify(payload), mode: 'no-cors' });
      setSyncStatus('synced');
      setLastSyncTime(new Date().toLocaleString());
    } catch (err) { setSyncStatus('error'); }
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
        setLastSyncTime(new Date().toLocaleString());
      }
    } catch (err) { setSyncStatus('error'); }
  };

  const exportData = () => {
    const data = { items, logs, timestamp: Date.now() };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `工安管理備份_${new Date().toISOString().split('T')[0]}.json`;
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
          if (window.confirm("確定要導入此備份嗎？這將覆蓋現有庫存。")) {
            setItems(data.items);
            setLogs(data.logs || []);
            syncToCloud(data.items, data.logs || []);
          }
        }
      } catch (err) { window.alert("❌ 檔案格式錯誤。"); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const generateId = () => `TX-${Date.now().toString().slice(-6)}`;

  const handleFinalPrint = () => {
    if (!lastTransactionBatch) return;
    const date = new Date(lastTransactionBatch.timestamp);
    const isEquip = lastTransactionBatch.items.some(it => it.itemType === 'EQUIPMENT');
    const isConsum = !isEquip || lastTransactionBatch.items.every(it => it.itemType === 'CONSUMABLE');

    const rows = lastTransactionBatch.items.map(item => `
      <tr>
        <td style="text-align:center; padding: 12px; border: 1.5px solid #000000; font-size: 14pt; color: #000000 !important; font-weight: normal;">${item.name}</td>
        <td style="text-align:center; border: 1.5px solid #000000; font-size: 13pt; color: #000000 !important; font-weight: normal;">${item.spec || ''}</td>
        <td style="text-align:center; border: 1.5px solid #000000; font-size: 13pt; color: #000000 !important; font-weight: normal;">${item.unit}</td>
        <td style="text-align:center; font-size: 13pt; border: 1.5px solid #000000; color: #000000 !important; font-weight: normal;">${item.quantity}</td>
        <td style="text-align:center; border: 1.5px solid #000000; font-size: 13pt; color: #000000 !important; font-weight: normal;">${lastTransactionBatch.reason || ''}</td>
      </tr>
    `).join('');

    const emptyRowsCount = Math.max(0, 15 - lastTransactionBatch.items.length);
    const emptyRows = Array(emptyRowsCount).fill(`
      <tr>
        <td style="height: 38px; border: 1.5px solid #000000;"></td>
        <td style="border: 1.5px solid #000000;"></td>
        <td style="border: 1.5px solid #000000;"></td>
        <td style="border: 1.5px solid #000000;"></td>
        <td style="border: 1.5px solid #000000;"></td>
      </tr>
    `).join('');

    const printWin = window.open('', '_blank');
    if (!printWin) return;
    printWin.document.write(`
      <html>
        <head>
          <title>物資領用單_${lastTransactionBatch.id}</title>
          <style>
            @font-face { font-family: 'StandardKai'; src: local('標楷體'), local('DFKai-SB'), local('BiauKai'); }
            @page { margin: 0; }
            body { 
              font-family: 'StandardKai', serif; 
              padding: 1.5cm 1.5cm;
              color: #000000 !important; 
              background: white; 
              margin: 0; 
              -webkit-print-color-adjust: exact;
              font-weight: normal;
            }
            .header-info { text-align: right; font-size: 10pt; color: #94a3b8 !important; margin-bottom: 5px; font-weight: normal; }
            .title { text-align: center; font-size: 28pt; margin-bottom: 20px; color: #000000 !important; letter-spacing: 2px; font-weight: normal; }
            .checkbox-section { 
              display: flex; 
              justify-content: center; 
              gap: 50px; 
              font-size: 16pt; 
              margin-bottom: 25px; 
              color: #000000 !important;
              font-weight: normal;
            }
            .box { 
              width: 24px; 
              height: 24px; 
              border: 2px solid #000000; 
              display: inline-flex; 
              align-items: center; 
              justify-content: center; 
              margin-right: 10px; 
              vertical-align: middle;
              font-size: 18pt;
              color: #000000 !important;
              font-weight: normal;
            }
            .dept-line { 
              display: flex; 
              justify-content: space-between; 
              font-size: 16pt; 
              margin-bottom: 15px; 
              color: #000000 !important;
              font-weight: normal;
            }
            .underline { border-bottom: 2px solid #000000; min-width: 250px; display: inline-block; text-align: center; color: #000000 !important; font-weight: normal; }
            table { width: 100%; border-collapse: collapse; border: 2.5px solid #000000; color: #000000 !important; }
            th { 
              border: 1.5px solid #000000; 
              padding: 8px 12px; 
              background-color: #f2f2f2 !important; 
              font-size: 14pt; 
              color: #000000 !important;
              font-weight: normal;
              line-height: 1.3;
            }
            td { font-weight: normal; }
            .footer-row { font-size: 14pt; margin-top: 30px; color: black !important; font-weight: normal; }
            .sig-area { display: flex; justify-content: space-between; margin-top: 40px; font-size: 13pt; color: black !important; font-weight: normal; }
            .sig-block { flex: 1; display: flex; justify-content: space-around; padding: 0 15px; font-weight: normal; }
          </style>
        </head>
        <body>
          <div class="header-info">單號：${lastTransactionBatch.id}</div>
          <div class="header-info">領用人：${lastTransactionBatch.person}</div>
          <div class="title">台灣電力公司電力修護處南部分處</div>
          <div class="checkbox-section">
            <div><span class="box">${isEquip ? 'V' : ''}</span>安全衛生設備借用單</div>
            <div><span class="box">${isConsum ? 'V' : ''}</span>安全衛生類消耗品領用單</div>
          </div>
          <div class="dept-line">
            <div>部 門：<span class="underline">${lastTransactionBatch.dept}</span></div>
            <div>中華民國 ${date.getFullYear() - 1911} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 35%;">名　　　稱</th>
                <th style="width: 25%;">規　　　範<br/>(序　號)</th>
                <th style="width: 10%;">單 位</th>
                <th style="width: 10%;">數 量</th>
                <th style="width: 20%;">備　註</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
              ${emptyRows}
            </tbody>
          </table>
          <div class="footer-row">
            <div style="display: flex; justify-content: space-between;">
              <div style="flex: 1;">申請部門：</div>
              <div style="flex: 1;">經管部門：</div>
            </div>
            <div class="sig-area">
              <div class="sig-block">
                <span>經辦：</span>
                <span>課長：</span>
                ${isEquip ? '<span>經理：</span>' : ''}
              </div>
              <div class="sig-block">
                <span>經辦：</span>
                <span>課長：</span>
                ${isEquip ? '<span>經理：</span>' : ''}
              </div>
            </div>
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                window.close();
              }, 600);
            };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  };

  const stats = useMemo(() => {
    const filteredLogs = logs.filter(l => 
      l.type === 'OUT' && 
      (new Date(l.timestamp).getFullYear() === statsYearFilter) && 
      (statsDeptFilter === 'ALL' || l.dept === statsDeptFilter)
    );
    
    const invDetailMap: Record<string, {name: string, qty: number, spec: string}> = {};
    filteredLogs.forEach(log => {
      if (!invDetailMap[log.itemId]) invDetailMap[log.itemId] = { name: log.itemName, qty: 0, spec: log.spec || '' };
      invDetailMap[log.itemId].qty += log.quantity;
    });
    
    const invDetails = Object.values(invDetailMap).sort((a, b) => b.qty - a.qty);
    return {
      sys: { 
        invTotal: items.filter(i => i.itemGroup === 'INVENTORY').length, 
        medTotal: items.filter(i => i.itemGroup === 'MEDICINE').length 
      },
      filtered: { 
        qty: filteredLogs.reduce((a, b) => a + b.quantity, 0), 
        details: invDetails,
        chartData: invDetails.slice(0, 8).map(d => ({ name: d.name, value: d.qty })) 
      },
      deptRanking: Object.entries(logs.filter(l => l.type === 'OUT' && (new Date(l.timestamp).getFullYear() === statsYearFilter)).reduce((acc: any, curr) => { 
        acc[curr.dept] = (acc[curr.dept] || 0) + curr.quantity; return acc; 
      }, {})).sort((a: any, b: any) => b[1] - a[1])
    };
  }, [items, logs, statsDeptFilter, statsYearFilter]);

  const toggleSort = (key: SortKey) => {
    setSortConfig(prev => ({ key, order: prev.key === key && prev.order === 'asc' ? 'desc' : 'asc' }));
  };

  const managedItems = useMemo(() => {
    const filtered = items.filter(i => (activeTab === 'medicine' ? i.itemGroup === 'MEDICINE' : i.itemGroup === 'INVENTORY') && i.name.toLowerCase().includes(searchTerm.toLowerCase()));
    return filtered.sort((a, b) => {
      let valA: any = a[sortConfig.key] || '';
      let valB: any = b[sortConfig.key] || '';
      if (sortConfig.key === 'quantity') { valA = Number(valA); valB = Number(valB); }
      if (valA < valB) return sortConfig.order === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.order === 'asc' ? 1 : -1;
      return 0;
    });
  }, [items, activeTab, searchTerm, sortConfig]);

  const filteredIssuanceItems = useMemo(() => {
    const matched = items.filter(i => i.itemGroup === issuanceGroup && (i.name.toLowerCase().includes(issuanceSearch.toLowerCase()) || i.spec.toLowerCase().includes(issuanceSearch.toLowerCase())));
    const limit = issuanceGroup === 'MEDICINE' ? 30 : 15;
    return matched.slice(0, limit);
  }, [items, issuanceGroup, issuanceSearch]);

  const frequentItems = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.filter(l => l.type === 'OUT').forEach(l => { counts[l.itemId] = (counts[l.itemId] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => items.find(i => i.id === id)).filter((i): i is InventoryItem => !!i && i.itemGroup === issuanceGroup);
  }, [logs, items, issuanceGroup]);

  return (
    <div className="min-h-screen flex bg-slate-100 text-black font-sans">
      <style>{`
        input, select, textarea { color: #000000 !important; background-color: #ffffff !important; border: 2px solid #94a3b8 !important; font-weight: 700 !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .active-sort { background: #1e293b !important; color: white !important; }
      `}</style>
      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={importData} />
      
      <aside className="w-72 bg-slate-900 text-white p-6 flex flex-col shrink-0 border-r border-slate-800 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg"><Package size={22}/></div>
          <h1 className="font-black text-xl tracking-tight">工安管理系統</h1>
        </div>
        
        <div className="mb-6 bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">系統連線狀態</span><div className={`w-3 h-3 rounded-full ${syncStatus === 'synced' ? 'bg-emerald-500' : 'bg-orange-400'}`}></div></div>
          <div className="text-sm font-black">{syncStatus === 'synced' ? '雲端同步中' : '本地作業'}</div>
          <div className="text-[10px] text-slate-400 font-bold mt-1">最後更新：{lastSyncTime}</div>
        </div>

        <nav className="flex-1 space-y-1">
          {[ { id: 'inventory', label: '工安耗材管理', icon: Package }, { id: 'medicine', label: '急救藥材管理', icon: Stethoscope }, { id: 'issuance', label: '領用補貨作業', icon: FileText }, { id: 'history', label: '歷史異動日誌', icon: History }, { id: 'dashboard', label: '數據統計看板', icon: LayoutDashboard } ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl font-bold transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-800'}`}><tab.icon size={20} /> {tab.label}</button>
          ))}
        </nav>
        
        <div className="pt-6 mt-6 border-t border-slate-800 space-y-2">
            <button onClick={() => setShowSettings(true)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 transition-all"><Settings size={16}/> 同步設定</button>
            <button onClick={exportData} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 transition-all"><Download size={16}/> 匯出備份</button>
            <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-slate-800 transition-all"><Upload size={16}/> 導入備份</button>
        </div>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        <header className="mb-8 flex justify-between items-center">
          <h2 className="text-3xl font-black text-black">{activeTab === 'inventory' ? '工安耗材清冊' : activeTab === 'medicine' ? '急救藥材清冊' : activeTab === 'issuance' ? '領用 / 補貨登記' : activeTab === 'history' ? '歷史異動日誌' : '數據統計看板'}</h2>
          {(activeTab === 'inventory' || activeTab === 'medicine') && (
            <button onClick={() => setShowAddModal(true)} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-black shadow-xl"><Plus size={18}/> 新增項目</button>
          )}
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex gap-4 p-6 bg-white rounded-3xl shadow-md border border-slate-200 items-center">
              <div className="flex items-center gap-2"><span className="text-sm font-black text-slate-400">年度:</span><select value={statsYearFilter} onChange={e => setStatsYearFilter(Number(e.target.value))} className="p-2 rounded-lg font-bold border-2">{[2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}</select></div>
              <div className="flex items-center gap-2"><span className="text-sm font-black text-slate-400">部門:</span><select value={statsDeptFilter} onChange={e => setStatsDeptFilter(e.target.value)} className="p-2 rounded-lg font-bold border-2"><option value="ALL">所有部門</option>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-xl flex flex-col justify-between"><div><p className="text-blue-400 text-xs font-black">年度篩選總領用</p><h3 className="text-5xl font-black mt-2">{stats.filtered.qty}</h3></div><TrendingUp className="text-blue-500 mt-4" size={32}/></div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-red-500"><p className="text-slate-400 text-xs font-black uppercase">庫存警示</p><h3 className="text-4xl font-black mt-2 text-red-600">{items.filter(i => i.quantity <= i.minStock).length}</h3></div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-blue-500"><p className="text-slate-400 text-xs font-black uppercase">工安品項</p><h3 className="text-4xl font-black mt-2 text-blue-600">{stats.sys.invTotal}</h3></div>
              <div className="bg-white p-8 rounded-[2rem] shadow-xl border-t-8 border-emerald-500"><p className="text-slate-400 text-xs font-black uppercase">藥材品項</p><h3 className="text-4xl font-black mt-2 text-emerald-600">{stats.sys.medTotal}</h3></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-lg">
                <h4 className="text-xl font-black mb-6 flex items-center gap-2"><BarChart3 className="text-blue-500"/> 熱門領用排行榜</h4>
                <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={stats.filtered.chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} /><YAxis tick={{ fontSize: 11, fontWeight: 700 }} /><Tooltip /><Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={35}>{stats.filtered.chartData.map((_, index) => ( <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} /> ))}</Bar></BarChart></ResponsiveContainer></div>
              </div>
              <div className="bg-white p-8 rounded-[2.5rem] shadow-lg flex flex-col">
                <h4 className="text-xl font-black mb-6 flex items-center gap-2"><Users className="text-emerald-500"/> 部門貢獻排行</h4>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">{stats.deptRanking.map(([dept, count]: any, idx) => (<div key={dept} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100"><div className="w-10 h-10 flex items-center justify-center bg-slate-900 text-white rounded-xl font-black">{idx + 1}</div><div className="flex-1 font-bold text-slate-700">{dept}</div><div className="font-black text-xl text-blue-600">{count}</div></div>))}</div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
               <div className="p-6 bg-slate-50 border-b font-black text-lg">年度領用統計細項</div>
               <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-100 text-[11px] font-black text-slate-500 uppercase border-b"><tr><th className="px-8 py-4">物資名稱</th><th className="px-8 py-4">規格</th><th className="px-8 py-4">總領用量</th></tr></thead><tbody className="divide-y divide-slate-100">{stats.filtered.details.map(item => (<tr key={item.name} className="hover:bg-slate-50"><td className="px-8 py-4 font-black">{item.name}</td><td className="px-8 py-4 font-bold text-slate-400">{item.spec}</td><td className="px-8 py-4 font-black text-blue-600">{item.qty}</td></tr>))}</tbody></table></div>
            </div>
          </div>
        )}

        {(activeTab === 'inventory' || activeTab === 'medicine') && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-50 border-b flex items-center justify-between">
              <div className="relative max-w-sm w-full"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="搜尋名稱..." className="w-full pl-12 pr-4 py-3 rounded-xl font-bold border-2 border-slate-300" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} /></div>
              <div className="flex gap-2">
                <button onClick={() => toggleSort('name')} className={`px-4 py-2 rounded-lg text-xs font-black border-2 ${sortConfig.key === 'name' ? 'active-sort' : 'bg-white text-slate-400'}`}>名稱</button>
                <button onClick={() => toggleSort('quantity')} className={`px-4 py-2 rounded-lg text-xs font-black border-2 ${sortConfig.key === 'quantity' ? 'active-sort' : 'bg-white text-slate-400'}`}>數量</button>
              </div>
            </div>
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-[11px] font-black text-slate-500 uppercase border-b"><tr><th className="px-8 py-5">品項名稱及規格</th><th className="px-8 py-5 text-center">當前庫存</th>{activeTab === 'medicine' && (<th className="px-8 py-5 text-center">有效日期</th>)}<th className="px-8 py-5 text-right">操作</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {managedItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-8 py-5">
                      <div className="font-black text-black text-lg">{item.name}</div>
                      <div className="text-xs text-slate-400 font-bold mt-1">規格：{item.spec || '標規'} | {item.itemType==='EQUIPMENT'?'設備':'消耗品'}</div>
                    </td>
                    <td className="px-8 py-5 text-center">
                      <span className={`px-6 py-2 rounded-xl font-black text-xl border-2 ${item.quantity <= item.minStock ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>{item.quantity} {item.unit}</span>
                    </td>
                    {activeTab === 'medicine' && (<td className="px-8 py-5 text-center font-bold text-slate-600">{item.expiryDate?.replace(/-/g, '/') || '未填'}</td>)}
                    <td className="px-8 py-5 text-right"><button onClick={() => setEditTarget(item)} className="p-2 text-slate-400 hover:text-blue-600"><Edit3 size={20}/></button><button onClick={() => setDeleteTarget({id: item.id, name: item.name})} className="p-2 text-slate-400 hover:text-red-600"><Trash2 size={20}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'issuance' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-xl border border-slate-200 relative">
              <h3 className="text-xl font-black mb-8 flex items-center gap-2 text-black"><ShoppingCart className="text-blue-500"/> 1. 挑選項目</h3>
              <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                <button onClick={()=>{setIssuanceMode('OUT'); setBasket([]);}} className={`flex-1 py-3 rounded-lg font-black transition-all ${issuanceMode==='OUT'?'bg-white shadow text-blue-600':'text-slate-400'}`}>領用出庫</button>
                <button onClick={()=>{setIssuanceMode('IN'); setBasket([]);}} className={`flex-1 py-3 rounded-lg font-black transition-all ${issuanceMode==='IN'?'bg-white shadow text-emerald-600':'text-slate-400'}`}>補貨入庫</button>
              </div>
              <div className="space-y-6">
                <div className="flex gap-2"><button onClick={()=>setIssuanceGroup('INVENTORY')} className={`flex-1 py-3 rounded-xl font-black border-2 ${issuanceGroup==='INVENTORY'?'bg-blue-50 border-blue-500 text-blue-600':'bg-white text-slate-400'}`}>耗材類</button><button onClick={()=>setIssuanceGroup('MEDICINE')} className={`flex-1 py-3 rounded-xl font-black border-2 ${issuanceGroup==='MEDICINE'?'bg-emerald-50 border-emerald-500 text-emerald-600':'bg-white text-slate-400'}`}>藥材類</button></div>
                <div className="relative" ref={issuanceDropdownRef}>
                  <label className="text-xs font-black text-slate-500 mb-2 block">品項選取 (向上彈出選單)</label>
                  <div className="relative z-50">
                    <input type="text" placeholder="輸入關鍵字..." className="w-full p-4 pr-12 rounded-xl text-lg font-bold border-2" value={selectedItemId ? items.find(i=>i.id===selectedItemId)?.name : issuanceSearch} onChange={(e) => { setIssuanceSearch(e.target.value); setSelectedItemId(''); setIsIssuanceDropdownOpen(true); }} onFocus={() => setIsIssuanceDropdownOpen(true)} />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"><Search size={20}/></div>
                    {isIssuanceDropdownOpen && (
                      <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl shadow-2xl border-2 border-slate-300 z-[100] max-h-80 overflow-y-auto custom-scrollbar">
                        {filteredIssuanceItems.map(item => {
                          const isLow = item.quantity <= item.minStock;
                          return (
                            <button key={item.id} onClick={() => { setSelectedItemId(item.id); setIssuanceSearch(item.name); setIsIssuanceDropdownOpen(false); }} className={`w-full text-left p-4 hover:bg-slate-100 border-b flex justify-between items-center ${isLow ? 'bg-red-50' : 'bg-white'}`}>
                              <div className="flex flex-col">
                                <div className="font-black text-black">{item.name}</div>
                                {item.itemGroup === 'MEDICINE' && item.expiryDate && (
                                  <div className="text-[10px] text-amber-600 font-bold">有效期限: {item.expiryDate.replace(/-/g, '/')}</div>
                                )}
                                <div className="text-[10px] text-slate-400 font-bold">{item.spec}</div>
                              </div>
                              <span className={`text-xs font-black px-3 py-1 rounded-full ${isLow ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'}`}>剩 {item.quantity}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div><label className="text-xs font-black text-slate-500">操作數量</label><input type="number" min="1" className="w-full p-4 rounded-xl mt-2 text-xl font-bold" value={inputQty} onChange={e=>setInputQty(e.target.value)}/></div>
                <button onClick={()=>{ if(!selectedItemId) return; const target = items.find(i=>i.id===selectedItemId); if(!target) return; setBasket(prev => [...prev, { itemId: target.id, name: target.name, quantity: Number(inputQty), unit: target.unit, spec: target.spec, itemType: target.itemType }]); setSelectedItemId(''); setIssuanceSearch(''); }} disabled={!selectedItemId} className={`w-full py-5 rounded-2xl font-black text-xl shadow-lg transition-all ${!selectedItemId ? 'bg-slate-200 text-slate-400' : 'bg-slate-900 text-white hover:bg-black'}`}>加入領用清單</button>
              </div>
            </div>
            
            <div className="lg:col-span-3 bg-white p-8 rounded-3xl shadow-xl border border-slate-200 flex flex-col">
              <h3 className="text-xl font-black mb-6 flex items-center gap-2"><FileText className="text-emerald-500"/> 2. 批量確認作業</h3>
              <div className="flex-1 overflow-y-auto border-2 border-dashed border-slate-100 rounded-2xl mb-6 min-h-[300px] bg-slate-50">
                {basket.length > 0 ? (
                  <table className="w-full text-left"><tbody>{basket.map((b, idx) => (<tr key={idx} className="bg-white"><td className="px-6 py-5 font-black text-black">{b.name}<br/><span className="text-[10px] text-slate-400 font-bold">{b.spec}</span></td><td className="px-6 py-5 text-center font-black text-blue-700">{b.quantity} {b.unit}</td><td className="px-6 py-5 text-right"><button onClick={()=>setBasket(prev => prev.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-600"><X size={20}/></button></td></tr>))}</tbody></table>
                ) : <div className="h-full flex items-center justify-center text-slate-300 font-bold opacity-30">清單目前為空</div>}
              </div>
              {issuanceMode === 'OUT' && (
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div><label className="text-xs font-black text-slate-500">領用部門</label><select className="w-full p-3 rounded-xl mt-2 font-bold" value={selectedDept} onChange={e=>setSelectedDept(e.target.value)}>{DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                  <div><label className="text-xs font-black text-slate-500">領用人員</label><input type="text" className="w-full p-3 rounded-xl mt-2 font-bold" value={inputPerson} onChange={e=>setInputPerson(e.target.value)}/></div>
                  <div className="col-span-2"><label className="text-xs font-black text-slate-500">領用備註</label><input type="text" className="w-full p-3 rounded-xl mt-2 font-bold" value={inputReason} onChange={e=>setInputReason(e.target.value)}/></div>
                </div>
              )}
              <button onClick={() => {
                const ts = Date.now();
                const updatedItems = [...items];
                const newLogs: Transaction[] = [];
                basket.forEach(b => {
                  const idx = updatedItems.findIndex(i => i.id === b.itemId);
                  if (idx !== -1) {
                    updatedItems[idx] = { ...updatedItems[idx], quantity: issuanceMode === 'OUT' ? updatedItems[idx].quantity - b.quantity : updatedItems[idx].quantity + b.quantity, lastUpdated: ts };
                    newLogs.push({ id: generateId()+Math.random().toString(36).substr(2,4), itemId: b.itemId, itemName: b.name, spec: b.spec, type: issuanceMode, quantity: b.quantity, person: inputPerson || '領用人', dept: issuanceMode === 'OUT' ? selectedDept : '修護處南部分處', reason: inputReason || '工安領用', timestamp: ts });
                  }
                });
                setItems(updatedItems);
                setLogs([...newLogs, ...logs]);
                if (issuanceMode === 'OUT') {
                  setLastTransactionBatch({ id: generateId(), dept: selectedDept, person: inputPerson || '領用人', reason: inputReason, items: [...basket], timestamp: ts });
                  setShowPrintModal(true);
                } else { window.alert('✅ 入庫完成！'); }
                setBasket([]); setInputPerson(''); setInputReason('');
                syncToCloud(updatedItems, [...newLogs, ...logs]);
              }} disabled={basket.length === 0} className={`w-full py-6 rounded-2xl font-black text-3xl shadow-2xl transition-all text-white ${issuanceMode==='OUT'?'bg-blue-600 hover:bg-blue-700':'bg-emerald-600 hover:bg-emerald-700'}`}>{issuanceMode === 'OUT' ? '確認領用並發單' : '確認入庫'}</button>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            <div className="p-6 bg-slate-50 border-b flex justify-between items-center"><h3 className="font-black">異動日誌</h3><span className="text-xs font-bold text-slate-400">總筆數：{logs.length}</span></div>
            <table className="w-full text-left">
              <thead className="bg-slate-100 text-[11px] font-black text-slate-500 uppercase border-b"><tr><th className="px-8 py-5">時間</th><th className="px-8 py-5">異動</th><th className="px-8 py-5">名稱/規格</th><th className="px-8 py-5 text-center">數量</th><th className="px-8 py-5">部門/人員</th><th className="px-8 py-5 text-right">單據</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-8 py-5 text-xs font-bold text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-8 py-5"><span className={`px-3 py-1 rounded-lg font-black text-xs ${log.type === 'OUT' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{log.type === 'OUT' ? '領用' : '入庫'}</span></td>
                    <td className="px-8 py-5"><div className="font-black text-slate-900">{log.itemName}</div><div className="text-[10px] text-slate-400 font-bold">{log.spec || '-'}</div></td>
                    <td className="px-8 py-5 text-center font-black text-blue-600">{log.quantity}</td>
                    <td className="px-8 py-5 font-bold text-slate-700">{log.dept}<br/><span className="text-[10px] text-slate-400">{log.person}</span></td>
                    <td className="px-8 py-5 text-right">
                      {log.type === 'OUT' && (
                        <button onClick={() => { setLastTransactionBatch({ id: log.id.split('-')[1] || log.id, dept: log.dept, person: log.person, reason: log.reason, items: [{ itemId: log.itemId, name: log.itemName, spec: log.spec || '', quantity: log.quantity, unit: items.find(i=>i.id===log.itemId)?.unit || '個', itemType: 'CONSUMABLE' }], timestamp: log.timestamp }); handleFinalPrint(); }} className="p-2 text-slate-400 hover:text-blue-600"><Printer size={18}/></button>
                      )}
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
              <form className="space-y-6" onSubmit={(e) => {
                e.preventDefault(); const fd = new FormData(e.currentTarget);
                const data = { name: fd.get('name') as string, itemType: fd.get('itemType') as ItemType, unit: fd.get('unit') as string, spec: fd.get('spec') as string, purchaseDate: fd.get('purchaseDate') as string, expiryDate: fd.get('expiryDate') as string, quantity: Number(fd.get('quantity')), minStock: Number(fd.get('minStock')), };
                const ts = Date.now();
                if (editTarget) { setItems(items.map(i => i.id === editTarget.id ? { ...editTarget, ...data, lastUpdated: ts } : i)); setEditTarget(null); }
                else { setItems([...items, { id: generateId()+Math.random().toString(36).substr(2,4), ...data, itemGroup: activeTab === 'medicine' ? 'MEDICINE' : 'INVENTORY', category: Category.OTHER, description: '', lastUpdated: ts }]); setShowAddModal(false); }
                syncToCloud(items, logs);
              }}>
                <h3 className="text-2xl font-black mb-4">{editTarget ? '編輯項目' : '新增項目'}</h3>
                <div><label className="text-xs font-black text-slate-500 uppercase">名稱</label><input name="name" type="text" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.name} /></div>
                <div className="grid grid-cols-2 gap-6">
                  <div><label className="text-xs font-black text-slate-500">分類</label><select name="itemType" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.itemType || 'CONSUMABLE'}><option value="EQUIPMENT">安全衛生設備</option><option value="CONSUMABLE">安全衛生類消耗品</option></select></div>
                  <div><label className="text-xs font-black text-slate-500">規格 / 型號</label><input name="spec" type="text" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.spec || ''} /></div>
                </div>
                <div className="grid grid-cols-3 gap-6">
                  <div><label className="text-xs font-black text-slate-500">單位</label><input name="unit" type="text" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.unit || '個'} /></div>
                  <div><label className="text-xs font-black text-slate-500">庫存</label><input name="quantity" type="number" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.quantity || 0} /></div>
                  <div><label className="text-xs font-black text-slate-500">警戒</label><input name="minStock" type="number" required className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.minStock || 5} /></div>
                </div>
                {(activeTab === 'medicine' || editTarget?.itemGroup === 'MEDICINE') && (
                  <div className="grid grid-cols-2 gap-6">
                    <div><label className="text-xs font-black text-slate-500">購入日</label><input name="purchaseDate" type="date" className="w-full p-4 rounded-xl mt-2 font-bold" defaultValue={editTarget?.purchaseDate} /></div>
                    <div><label className="text-xs font-black text-slate-500">到期日</label><input name="expiryDate" type="date" className="w-full p-4 rounded-xl mt-2 font-bold text-blue-600" defaultValue={editTarget?.expiryDate} /></div>
                  </div>
                )}
                <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-2xl shadow-xl mt-6 transition-all hover:bg-blue-700 active:scale-95">儲存項目</button>
                <button type="button" onClick={()=>{setEditTarget(null);setShowAddModal(false)}} className="w-full py-3 text-slate-400 font-bold hover:text-black">取消</button>
              </form>
            </div>
          </div>
        )}

        {showPrintModal && lastTransactionBatch && (
          <div className="fixed inset-0 bg-slate-900/95 z-[500] flex flex-col items-center justify-center p-6">
            <div className="bg-white rounded-[3rem] w-full max-w-5xl h-[90vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
              <div className="p-8 flex justify-between items-center border-b bg-white relative z-10 shadow-sm">
                <div className="flex items-center gap-4"><CheckCircle2 className="text-emerald-500" size={40}/><h3 className="font-black text-2xl text-black">領用單生成成功</h3></div>
                <div className="flex gap-4">
                  <button onClick={handleFinalPrint} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-xl flex items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all"><Printer size={24}/> 列印領用單 (純黑極清)</button>
                  <button onClick={()=>setShowPrintModal(false)} className="p-4 bg-slate-100 rounded-2xl text-black hover:bg-slate-200"><X size={32}/></button>
                </div>
              </div>
              <div className="flex-1 bg-slate-100 p-10 flex justify-center overflow-y-auto">
                <div className="bg-white shadow-2xl p-10 w-[210mm] min-h-[297mm] text-black text-center flex flex-col justify-center font-normal text-3xl border-4 border-dashed border-slate-300 relative">
                  <div className="absolute top-8 right-8 text-right space-y-1">
                    <div className="text-slate-400 text-sm font-normal uppercase tracking-widest">單號: {lastTransactionBatch.id}</div>
                    <div className="text-slate-400 text-sm font-normal uppercase tracking-widest">領用人: {lastTransactionBatch.person}</div>
                  </div>
                  <div className="p-10 border-4 border-black inline-block font-normal">
                    正式領用單預覽準備中<br/>請點擊上方按鈕列印
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[600] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2.5rem] w-full max-w-xl p-10 shadow-2xl">
              <h3 className="text-2xl font-black mb-6">雲端同步設定 (GAS)</h3>
              <input type="text" className="w-full p-4 rounded-xl font-bold border-2" placeholder="GAS Web App URL" defaultValue={gasUrl} id="gas-url-input"/>
              <div className="flex gap-4 mt-8"><button onClick={() => { const url = (document.getElementById('gas-url-input') as HTMLInputElement).value; setGasUrl(url); localStorage.setItem(STORAGE_KEY_GAS_URL, url); setShowSettings(false); fetchFromCloud(); }} className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-black text-xl shadow-xl">儲存並同步</button><button onClick={() => setShowSettings(false)} className="px-8 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black text-xl">取消</button></div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center p-4 z-[400] animate-in fade-in">
            <div className="bg-white p-10 rounded-3xl text-center max-w-sm shadow-2xl">
              <h3 className="text-2xl font-black mb-4 text-black">確定刪除「{deleteTarget.name}」？</h3>
              <button onClick={()=>{ setItems(items.filter(i => i.id !== deleteTarget.id)); setDeleteTarget(null); }} className="w-full py-4 bg-red-600 text-white rounded-xl font-black mb-2 shadow-lg">確認刪除</button>
              <button onClick={()=>setDeleteTarget(null)} className="w-full py-4 text-slate-400 font-bold hover:text-black">取消</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
