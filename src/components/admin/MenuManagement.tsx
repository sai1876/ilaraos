'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Pause, Play, Check, Upload, Search, Sliders, Clock, Sparkles, RefreshCw, X, LayoutGrid, Tag } from 'lucide-react';
import { MenuItem, StockItem, IngredientRecipe, ModGroup, Outlet } from '@/lib/types';
import { fetchMenuItems, saveMenuItem, deleteMenuItem, fetchStocks, fetchOutlets } from '@/lib/dbService';
import { generateMenuDescription } from '@/lib/geminiService';
import Image from 'next/image';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { uploadFileViaIntent } from '@/features/documents/documentService';

interface MenuManagementProps {
  userRole?: string;
  outletId?: string;
}

export default function MenuManagement({ userRole, outletId }: MenuManagementProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'list' | 'add'>('list');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // New Item State Form
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'Biryani' | 'Momos' | 'Burgers' | 'Waffles' | 'Snacks' | 'Beverages'>('Biryani');
  const [station, setStation] = useState<MenuItem['station']>('GRILLED OR STEAMED');
  const [imageUrl, setImageUrl] = useState('');
  const [ingredientsInput, setIngredientsInput] = useState('');
  
  // Recipes HUD State
  const [recipes, setRecipes] = useState<IngredientRecipe[]>([]);
  const [selectedStockId, setSelectedStockId] = useState('');
  const [tempIngQty, setTempIngQty] = useState('');

  // Customization Option HUD State
  const [modGroups, setModGroups] = useState<ModGroup[]>([]);
  const [tempGroupName, setTempGroupName] = useState('');
  const [tempModName, setTempModName] = useState('');
  const [tempModPrice, setTempModPrice] = useState('');
  const [tempModStockId, setTempModStockId] = useState('');
  const [tempModStockQty, setTempModStockQty] = useState('');
  const [tempModOptions, setTempModOptions] = useState<any[]>([]);

  // Outlets Selection
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>([]);

  // Pause Duration Modal
  const [pausingItem, setPausingItem] = useState<MenuItem | null>(null);
  const [pauseDurations, setPauseDurations] = useState<Record<string, { until: number; durationText: string }>>({});

  // File Upload & AI Copywriter states
  const [uploading, setUploading] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);

  // Load menu items and stocks on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      loadMenuAndStocks();
    });

    if (typeof window !== "undefined") {
      const persisted = localStorage.getItem("ilara_pause_durations");
      if (persisted) {
        try {
          setPauseDurations(JSON.parse(persisted));
        } catch (e) {}
      }
    }

    return () => unsubscribe();
  }, []);

  const loadMenuAndStocks = async () => {
    setLoading(true);
    try {
      const isGlobal = userRole === 'admin' || userRole === 'owner';
      const menuData = await fetchMenuItems();
      const stocksData = await fetchStocks(!isGlobal ? outletId : undefined);
      const outletsData = await fetchOutlets();
      setItems(menuData);
      setStocks(stocksData);
      setOutlets(outletsData);
      setSelectedOutlets(outletsData.map(o => o.id));
    } catch (err) {
      console.error("Failed to load global menu and stocks catalog: ", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIngredient = () => {
    if (!selectedStockId || !tempIngQty) return;
    const stockItem = stocks.find(s => s.stock_id === selectedStockId);
    if (!stockItem) return;

    if (recipes.some(r => r.stock_id === selectedStockId)) {
      alert("Ingredient is already mapped in this recipe outline.");
      return;
    }

    setRecipes([...recipes, {
      stock_id: selectedStockId,
      name: stockItem.name,
      quantity: parseFloat(tempIngQty),
      unit: stockItem.unit
    }]);
    setSelectedStockId('');
    setTempIngQty('');
  };

  const handleRemoveIngredient = (idx: number) => {
    setRecipes(recipes.filter((_, i) => i !== idx));
  };

  const handleAddModOption = () => {
    if (!tempModName || !tempModPrice) return;
    setTempModOptions([...tempModOptions, {
      name: tempModName,
      price: parseFloat(tempModPrice) || 0,
      stock_id: tempModStockId || undefined,
      quantity: tempModStockQty ? parseFloat(tempModStockQty) : undefined
    }]);
    setTempModName('');
    setTempModPrice('');
    setTempModStockId('');
    setTempModStockQty('');
  };

  const handleCreateModGroup = () => {
    if (!tempGroupName || tempModOptions.length === 0) return;
    setModGroups([...modGroups, {
      groupName: tempGroupName,
      options: tempModOptions
    }]);
    setTempGroupName('');
    setTempModOptions([]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploading(true);

      const itemId = editingItem?.item_id || `menu-${Date.now()}`;

      try {
        const document = await uploadFileViaIntent(file, {
          category: 'menu',
          relatedEntityType: 'menu',
          relatedEntityId: itemId,
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          accessLevel: 'public'
        });

        // For immediate preview, use object URL or Public URL
        if (document.bucket && document.object_path) {
          const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
          setImageUrl(`${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${document.bucket}/${document.object_path}`);
        }
      } catch (error: any) {
        alert(error.message || 'Upload failed');
      }

      setUploading(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!name) {
      alert("Please specify the item name first.");
      return;
    }
    setGeneratingDesc(true);
    try {
      const manualIngredients = ingredientsInput
        .split(',')
        .map(i => i.trim())
        .filter(i => i.length > 0);
      const hudIngredients = recipes.map(r => r.name);
      const ingredientsList = Array.from(new Set([...hudIngredients, ...manualIngredients]));

      const desc = await generateMenuDescription(name, category, ingredientsList);
      setDescription(desc);
    } catch (e: any) {
      console.error(e);
      alert("AI copywriting description generation failed: " + e.message);
    } finally {
      setGeneratingDesc(false);
    }
  };

  const handleCreateMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) return;

    const itemId = editingItem ? editingItem.item_id : `m_${Date.now()}`;
    const newItem: MenuItem = {
      item_id: itemId,
      name,
      description,
      price: parseFloat(price),
      category,
      station,
      image_url: imageUrl || 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=80&w=800',
      is_available: true,
      is_featured: editingItem ? editingItem.is_featured : false,
      sort_order: editingItem ? editingItem.sort_order : items.length + 1,
      recipe: recipes,
      customizationOptions: modGroups,
      available_outlets: selectedOutlets
    };

    try {
      if (userRole === 'manager') {
        alert('Menu edit request sent to Owner for approval via email!');
        // Reset Form
        setName('');
        setPrice('');
        setDescription('');
        setImageUrl('');
        setRecipes([]);
        setModGroups([]);
        setIngredientsInput('');
        if (outlets.length > 0) {
          setSelectedOutlets(outlets.map(o => o.id));
        }
        setActiveTab('list');
        setEditingItem(null);
        return;
      }

      await saveMenuItem(newItem);
      await loadMenuAndStocks();

      // Reset Form
      setName('');
      setPrice('');
      setDescription('');
      setImageUrl('');
      setRecipes([]);
      setModGroups([]);
      setIngredientsInput('');
      setSelectedOutlets(outlets.map(o => o.id));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setEditingItem(null);
    } catch (err: any) {
      console.error(err);
      alert("Firestore failed to save item: " + err.message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (confirm('Are you sure you want to permanently delete this menu item globally from Firestore?')) {
      try {
        await deleteMenuItem(itemId);
        await loadMenuAndStocks();
      } catch (err: any) {
        console.error(err);
        alert("Firestore failed to delete item: " + err.message);
      }
    }
  };

  const toggleAvailability = async (itemId: string) => {
    const item = items.find(i => i.item_id === itemId);
    if (!item) return;

    const updatedItem = { ...item, is_available: !item.is_available };
    setItems(items.map(i => i.item_id === itemId ? updatedItem : i));
    
    try {
      await saveMenuItem(updatedItem);
    } catch (err) {
      console.error("Failed to toggle live availability status: ", err);
    }
  };

  const handlePauseItem = async (durationText: string, hours: number) => {
    if (!pausingItem) return;
    const until = Date.now() + hours * 3600 * 1000;
    
    const newDurations = {
      ...pauseDurations,
      [pausingItem.item_id]: { until, durationText }
    };
    setPauseDurations(newDurations);
    localStorage.setItem("ilara_pause_durations", JSON.stringify(newDurations));

    const updatedItem = { ...pausingItem, is_available: false };
    setItems(items.map(item => 
      item.item_id === pausingItem.item_id ? updatedItem : item
    ));

    try {
      await saveMenuItem(updatedItem);
    } catch (err) {
      console.error(err);
    }
    setPausingItem(null);
  };

  const handleUnpauseItem = async (itemId: string) => {
    const newDurations = { ...pauseDurations };
    delete newDurations[itemId];
    setPauseDurations(newDurations);
    localStorage.setItem("ilara_pause_durations", JSON.stringify(newDurations));

    const item = items.find(i => i.item_id === itemId);
    if (!item) return;

    const updatedItem = { ...item, is_available: true };
    setItems(items.map(i => i.item_id === itemId ? updatedItem : i));

    try {
      await saveMenuItem(updatedItem);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesCategory = selectedCategoryFilter === 'All' || item.category === selectedCategoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const isDark = userRole !== 'manager';

  return (
    <div className={`flex flex-col gap-6 w-full ${isDark ? 'text-[#f7dec4]' : 'text-[#534434]'}`}>
      {/* Header Panel */}
      <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 rounded-3xl p-6 transition-all border ${
        isDark 
          ? 'bg-[#120a06]/40 backdrop-blur-xl border-[#302117]/60' 
          : 'bg-white border-[#d8c3ad]/80 shadow-[0_4px_20px_rgba(83,68,52,0.05)]'
      }`}>
        <div>
          <h2 className={`font-serif italic text-2xl ${isDark ? 'text-white' : 'text-[#855300]'}`}>Menu Catalog Controller</h2>
          <p className={`text-xs font-mono uppercase tracking-widest mt-0.5 ${isDark ? 'text-[#d4c4b0]/50' : 'text-[#534434]/60'}`}>Global Outlets and Recipe Assembly</p>
        </div>
        
        {/* Navigation Tabs */}
        <div className={`flex border rounded-xl p-1 font-mono text-xs ${
          isDark ? 'bg-[#060403] border-[#302117]' : 'bg-[#f5f4ec] border-[#d8c3ad]'
        }`}>
          <button
            onClick={() => { setActiveTab('list'); setEditingItem(null); }}
            className={`px-4 py-2 rounded-lg font-bold transition-all uppercase tracking-wider cursor-pointer ${
              activeTab === 'list' 
                ? isDark ? 'bg-[#f8bc51] text-[#0A0604]' : 'bg-[#855300] text-white shadow-[0_2px_8px_rgba(133,83,0,0.15)]'
                : isDark ? 'text-[#d4c4b0] hover:text-white' : 'text-[#534434]/80 hover:text-[#855300]'
            }`}
          >
            All Items
          </button>
          <button
            onClick={() => {
              setActiveTab('add');
              setName('');
              setPrice('');
              setDescription('');
              setImageUrl('');
              setRecipes([]);
              setModGroups([]);
              setIngredientsInput('');
              setEditingItem(null);
            }}
            className={`px-4 py-2 rounded-lg font-bold transition-all uppercase tracking-wider cursor-pointer ${
              activeTab === 'add' && !editingItem
                ? isDark ? 'bg-[#f8bc51] text-[#0A0604]' : 'bg-[#855300] text-white shadow-[0_2px_8px_rgba(133,83,0,0.15)]'
                : isDark ? 'text-[#d4c4b0] hover:text-white' : 'text-[#534434]/80 hover:text-[#855300]'
            }`}
          >
            + Create Item
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 font-mono text-xs text-[#f8bc51] gap-3">
            <RefreshCw size={24} className="animate-spin" />
            Loading catalog database from Firestore...
          </div>
        ) : activeTab === 'list' ? (
          <motion.div
            key="list-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-5"
          >
            {/* Search Filter Row */}
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-[#d4c4b0]/40' : 'text-[#534434]/50'}`} />
                <input
                  type="text"
                  placeholder="Search items, categories, ingredients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full border rounded-2xl pl-11 pr-10 py-3 text-sm font-mono focus:outline-none transition-all ${
                    isDark 
                      ? 'bg-[#120a06]/40 border-[#302117] text-white focus:border-[#f8bc51]' 
                      : 'bg-white border-[#d8c3ad] text-[#1b1c17] focus:border-[#855300] shadow-[0_2px_8px_rgba(83,68,52,0.02)]'
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className={`absolute right-4 top-1/2 -translate-y-1/2 hover:text-white transition-colors cursor-pointer ${
                      isDark ? 'text-[#d4c4b0]/40' : 'text-[#534434]/50 hover:text-[#855300]'
                    }`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className={`text-[10px] font-mono shrink-0 ${isDark ? 'text-[#d4c4b0]/55' : 'text-[#534434]/60'}`}>
                SHOWING {filteredItems.length} OF {items.length} DISHES
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex overflow-x-auto gap-2 py-1 category-scroll-container">
              {['All', 'Biryani', 'Momos', 'Burgers', 'Waffles', 'Snacks', 'Beverages'].map((cat) => {
                const isActive = selectedCategoryFilter === cat;
                const count = cat === 'All' 
                  ? items.length 
                  : items.filter(i => i.category === cat).length;
                  
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategoryFilter(cat)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider font-mono transition-all border shrink-0 cursor-pointer ${
                      isActive
                        ? isDark 
                          ? 'bg-[#f8bc51] text-[#0A0604] border-[#f8bc51] font-bold shadow-[0_4px_12px_rgba(248,188,81,0.2)]'
                          : 'bg-[#ffddb8]/80 text-[#855300] border-amber-200/50 shadow-[0_2px_8px_rgba(133,83,0,0.08)] font-bold'
                        : isDark
                          ? 'bg-[#120a06]/40 text-[#d4c4b0]/80 border-[#302117] hover:bg-[#302117]/50 hover:text-white'
                          : 'bg-white text-[#534434]/80 border-[#d8c3ad] hover:bg-[#f5f4ec] hover:text-[#855300]'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md transition-all ${
                      isActive 
                        ? isDark ? 'bg-[#0A0604]/20 text-[#0A0604]' : 'bg-[#855300]/15 text-[#855300]' 
                        : isDark ? 'bg-[#0A0604]/50 text-[#d4c4b0]/60' : 'bg-[#534434]/10 text-[#534434]/50'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Menu Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredItems.map((item) => {
                const isPaused = pauseDurations[item.item_id];
                return (
                  <div
                    key={item.item_id}
                    className={`backdrop-blur-xl border rounded-2xl overflow-hidden relative group transition-all duration-500 flex flex-col ${
                      isDark 
                        ? `bg-[#120a06]/40 hover:border-[#f8bc51] hover:shadow-[0_8px_30px_rgba(248,188,81,0.06)] ${item.is_available ? 'border-[#302117]/80' : 'border-[#e8621a]/30'}`
                        : `bg-white hover:border-[#855300] hover:shadow-[0_8px_25px_rgba(83,68,52,0.08)] ${item.is_available ? 'border-[#d8c3ad]/80' : 'border-[#e8621a]/30'}`
                    }`}
                  >
                    {/* Dish Preview Frame */}
                    <div className="w-full aspect-[4/3] bg-[#070402] relative overflow-hidden shrink-0">
                      {item.image_url && (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-cover group-hover:scale-110 transition-transform duration-700 ease-out font-sans"
                        />
                      )}
                      
                      {/* Vignette Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0604] via-[#0A0604]/20 to-transparent opacity-80" />

                      {/* Status Badges */}
                      <div className="absolute top-3 left-3 flex gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider border shadow-md flex items-center gap-1.5 backdrop-blur-md ${
                          item.is_available 
                            ? isDark 
                              ? 'bg-[#0a0604]/80 text-[#10B981] border-[#10B981]/30' 
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                            : isDark
                              ? 'bg-[#0a0604]/80 text-[#e8621a] border-[#e8621a]/30'
                              : 'bg-orange-50 text-orange-700 border-orange-200/60'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${item.is_available ? 'bg-[#10B981]' : 'bg-[#e8621a]'} ${item.is_available ? 'animate-pulse' : ''}`} />
                          {item.is_available ? 'Active' : isPaused ? 'Paused' : 'Sold Out'}
                        </span>
                      </div>

                      {/* Station Badge */}
                      <span className="absolute top-3 right-3 bg-[#0a0604]/80 text-[#f8bc51] px-2 py-0.5 rounded text-[8px] font-mono border border-[#302117] backdrop-blur-md uppercase tracking-wider">
                        {item.station}
                      </span>
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h4 className={`font-serif italic text-lg font-bold leading-tight transition-colors ${
                            isDark ? 'text-white group-hover:text-[#f8bc51]' : 'text-[#534434] group-hover:text-[#855300]'
                          }`}>{item.name}</h4>
                        </div>
                        <p className={`text-xs mt-1.5 line-clamp-2 min-h-[2rem] leading-relaxed ${
                          isDark ? 'text-[#d4c4b0]/65' : 'text-[#534434]/80'
                        }`}>{item.description}</p>
                        
                        {/* Meta statistics row */}
                        <div className="flex flex-wrap gap-1.5 mt-4">
                          <span className={`text-[9px] font-mono border rounded-lg px-2 py-0.5 flex items-center gap-1 ${
                            isDark 
                              ? 'bg-[#070402]/60 border-[#302117] text-[#d4c4b0]/60' 
                              : 'bg-[#f5f4ec] border-[#d8c3ad]/50 text-[#534434]/70'
                          }`}>
                            <Tag size={9} className={isDark ? 'text-[#f8bc51]/80' : 'text-[#855300]/80'} />
                            {item.recipe?.length || 0} Ingredients
                          </span>
                          <span className={`text-[9px] font-mono border rounded-lg px-2 py-0.5 flex items-center gap-1 ${
                            isDark 
                              ? 'bg-[#070402]/60 border-[#302117] text-[#d4c4b0]/60' 
                              : 'bg-[#f5f4ec] border-[#d8c3ad]/50 text-[#534434]/70'
                          }`}>
                            <Sparkles size={9} className={isDark ? 'text-[#f8bc51]/80' : 'text-[#855300]/80'} />
                            {item.customizationOptions?.length || 0} Mods
                          </span>
                          <span className={`text-[9px] font-mono border rounded-lg px-2 py-0.5 flex items-center gap-1 ${
                            isDark 
                              ? 'bg-[#070402]/60 border-[#302117] text-[#d4c4b0]/60' 
                              : 'bg-[#f5f4ec] border-[#d8c3ad]/50 text-[#534434]/70'
                          }`}>
                            <LayoutGrid size={9} className={isDark ? 'text-[#f8bc51]/80' : 'text-[#855300]/80'} />
                            {item.available_outlets?.length || 0} Outlets
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 border-t border-[#302117]/30 pt-4 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className={`text-[8px] font-mono uppercase tracking-widest leading-none ${
                              isDark ? 'text-[#d4c4b0]/40' : 'text-[#534434]/50'
                            }`}>Catalog Price</span>
                            <span className={`font-mono font-black text-lg mt-0.5 ${
                              isDark ? 'text-white' : 'text-[#855300]'
                            }`}>₹{item.price}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            {/* Pause/Unpause */}
                            {isPaused ? (
                              <button
                                onClick={() => handleUnpauseItem(item.item_id)}
                                type="button"
                                className="p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 transition-all cursor-pointer flex items-center justify-center"
                                title={`Paused until: ${new Date(isPaused.until).toLocaleTimeString()}. Click to resume.`}
                              >
                                <Play size={13} className="fill-current" />
                              </button>
                            ) : (
                              <button
                                onClick={() => setPausingItem(item)}
                                type="button"
                                className="p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/25 text-amber-400 border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer flex items-center justify-center"
                                title="Pause operational hours"
                              >
                                <Pause size={13} />
                              </button>
                            )}

                            {/* Toggle availability */}
                            <button
                              onClick={() => toggleAvailability(item.item_id)}
                              type="button"
                              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                                item.is_available
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20 hover:border-emerald-500/40'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/25 hover:bg-rose-500/20 hover:border-rose-500/40'
                              }`}
                              title={item.is_available ? 'Set as Sold Out' : 'Set as In Stock'}
                            >
                              <Check size={13} />
                            </button>

                            {/* Edit Action */}
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setName(item.name);
                                setPrice(item.price.toString());
                                setDescription(item.description);
                                setCategory(item.category);
                                setStation(item.station);
                                setImageUrl(item.image_url || '');
                                setRecipes(item.recipe || []);
                                setModGroups(item.customizationOptions || []);
                                setIngredientsInput(item.recipe ? item.recipe.map(r => r.name).join(', ') : '');
                                setSelectedOutlets(item.available_outlets || outlets.map(o => o.id));
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                setActiveTab('add');
                              }}
                              type="button"
                              className="p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/25 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 transition-all cursor-pointer flex items-center justify-center"
                              title="Edit Details"
                            >
                              <Sliders size={13} />
                            </button>

                            {/* Delete Action */}
                            <button
                              onClick={() => handleDeleteItem(item.item_id)}
                              type="button"
                              className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/40 transition-all cursor-pointer flex items-center justify-center"
                              title="Delete Item"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Display Active Paused Time banner */}
                        {isPaused && (
                          <div className={`flex items-center gap-1.5 font-mono text-[9px] p-2 rounded-lg border justify-center ${
                            isDark 
                              ? 'text-[#e8621a] bg-[#e8621a]/5 border-[#e8621a]/10' 
                              : 'text-orange-700 bg-orange-50 border-orange-200/50'
                          }`}>
                            <Clock size={10} className="animate-pulse" />
                            <span>Paused: {isPaused.durationText}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="add-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleCreateMenuItem}
            className={`backdrop-blur-xl border rounded-3xl p-6 md:p-8 flex flex-col gap-6 transition-all duration-300 ${
              isDark ? 'bg-[#120a06]/40 border-[#302117]' : 'bg-white border-[#d8c3ad] shadow-[0_4px_25px_rgba(83,68,52,0.06)]'
            }`}
          >
            <h3 className={`font-serif italic text-xl border-b pb-3 transition-colors ${
              isDark ? 'text-white border-[#302117]/60' : 'text-[#855300] border-[#d8c3ad]/50'
            }`}>
              {editingItem ? `Modify Item Details: ${editingItem.name}` : 'Assemble New Master Dish'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column Fields */}
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className={`font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434] font-bold'}`}>Item Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Double Espresso Truffle Waffle"
                    className={`border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all ${
                      isDark 
                        ? 'bg-[#070402] border-[#302117] text-white focus:border-[#f8bc51]' 
                        : 'bg-white border-[#b8a38d] text-[#1b1c17] focus:border-[#855300] focus:ring-1 focus:ring-[#855300]/20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={`font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434] font-bold'}`}>Key Ingredients (Comma Separated)</label>
                  <input
                    type="text"
                    value={ingredientsInput}
                    onChange={(e) => setIngredientsInput(e.target.value)}
                    placeholder="e.g. chocolate syrup, fresh banana, vanilla cream"
                    className={`border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all ${
                      isDark 
                        ? 'bg-[#070402] border-[#302117] text-white focus:border-[#f8bc51]' 
                        : 'bg-white border-[#b8a38d] text-[#1b1c17] focus:border-[#855300] focus:ring-1 focus:ring-[#855300]/20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                    }`}
                  />
                  <p className={`text-[9px] font-mono leading-relaxed ${isDark ? 'text-[#d4c4b0]/40' : 'text-[#534434]/60'}`}>List the core ingredients to feed the AI generator for a highly authentic, delicious description.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className={`font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434] font-bold'}`}>Price *</label>
                    <input
                      type="number"
                      required
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="₹ Amount"
                      className={`border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all ${
                        isDark 
                          ? 'bg-[#070402] border-[#302117] text-white focus:border-[#f8bc51]' 
                          : 'bg-white border-[#b8a38d] text-[#1b1c17] focus:border-[#855300] focus:ring-1 focus:ring-[#855300]/20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                      }`}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className={`font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434] font-bold'}`}>KDS Kitchen Station</label>
                    <select
                      value={station}
                      onChange={(e) => setStation(e.target.value as 'FRYER' | 'BREWER' | 'GRILLED OR STEAMED' | 'FASTFOOD & BIRYANI')}
                      className={`border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all font-mono ${
                        isDark 
                          ? 'bg-[#070402] border-[#302117] text-white focus:border-[#f8bc51]' 
                          : 'bg-white border-[#b8a38d] text-[#1b1c17] focus:border-[#855300] focus:ring-1 focus:ring-[#855300]/20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                      }`}
                    >
                      <option value="GRILLED OR STEAMED">GRILLED OR STEAMED (Momos, Sandwiches, Waffles)</option>
                      <option value="BREWER">BREWER (Beverages)</option>
                      <option value="FRYER">FRYER (Snacks, Burgers)</option>
                      <option value="FASTFOOD & BIRYANI">FASTFOOD & BIRYANI (Biryani, Chinese)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className={`font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434] font-bold'}`}>Category *</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as 'Biryani' | 'Momos' | 'Burgers' | 'Waffles' | 'Snacks' | 'Beverages')}
                      className={`border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all font-mono ${
                        isDark 
                          ? 'bg-[#070402] border-[#302117] text-white focus:border-[#f8bc51]' 
                          : 'bg-white border-[#b8a38d] text-[#1b1c17] focus:border-[#855300] focus:ring-1 focus:ring-[#855300]/20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                      }`}
                    >
                      <option value="Biryani">Biryani</option>
                      <option value="Momos">Momos</option>
                      <option value="Burgers">Burgers</option>
                      <option value="Waffles">Waffles</option>
                      <option value="Snacks">Snacks</option>
                      <option value="Beverages">Beverages</option>
                    </select>
                  </div>
                  
                  {/* Firebase Storage Image Upload */}
                  <div className="flex flex-col gap-1.5">
                    <label className={`font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434] font-bold'}`}>Upload Product Pic</label>
                    <div className={`relative group border rounded-xl flex items-center justify-center p-2 min-h-[42px] cursor-pointer transition-all ${
                      isDark 
                        ? 'bg-[#070402] border-[#302117] hover:border-[#f8bc51]' 
                        : 'bg-white border-[#b8a38d] hover:border-[#855300] hover:bg-[#f5f4ec]'
                    }`}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      {uploading ? (
                        <span className={`font-mono text-[10px] animate-pulse ${isDark ? 'text-[#f8bc51]' : 'text-[#855300]'}`}>Uploading catalog file...</span>
                      ) : (
                        <span className={`flex items-center gap-1.5 font-mono text-[10px] ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434]'}`}>
                          <Upload size={12} />
                          Standard upload
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <label className={`font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434] font-bold'}`}>Description</label>
                    <button
                      type="button"
                      onClick={handleGenerateDescription}
                      disabled={generatingDesc || !name}
                      className={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider transition-colors disabled:opacity-40 cursor-pointer ${
                        isDark ? 'text-[#f8bc51] hover:text-[#ffce7b]' : 'text-[#855300] hover:text-[#9c6a1a]'
                      }`}
                    >
                      {generatingDesc ? (
                        <>
                          <RefreshCw size={10} className="animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles size={10} />
                          ✨ AI Generate Description
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide appetizing culinary details..."
                    className={`border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all resize-none ${
                      isDark 
                        ? 'bg-[#070402] border-[#302117] text-white focus:border-[#f8bc51]' 
                        : 'bg-white border-[#b8a38d] text-[#1b1c17] focus:border-[#855300] focus:ring-1 focus:ring-[#855300]/20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                    }`}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={`font-mono text-[10px] uppercase tracking-wider ${isDark ? 'text-[#d4c4b0]' : 'text-[#534434] font-bold'}`}>Image URL</label>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://storage.googleapis.com/..."
                    className={`border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all font-mono ${
                      isDark 
                        ? 'bg-[#070402] border-[#302117] text-white focus:border-[#f8bc51]' 
                        : 'bg-white border-[#b8a38d] text-[#1b1c17] focus:border-[#855300] focus:ring-1 focus:ring-[#855300]/20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]'
                    }`}
                  />
                </div>

                {/* Multi-Outlet Availability Rules */}
                <div className={`border rounded-2xl p-5 flex flex-col gap-4 mt-2 transition-all ${
                  isDark ? 'bg-[#070402]/60 border-[#302117]' : 'bg-[#f5f4ec] border-[#d8c3ad]/70'
                }`}>
                  <div className={`flex justify-between items-center border-b pb-2 ${
                    isDark ? 'border-[#302117]/40' : 'border-[#d8c3ad]/50'
                  }`}>
                    <span className={`font-mono text-[10px] uppercase tracking-wider font-bold ${
                      isDark ? 'text-[#f8bc51]' : 'text-[#855300]'
                    }`}>Outlet Provisions</span>
                    <span className={`text-[9px] font-mono ${isDark ? 'text-[#d4c4b0]/40' : 'text-[#534434]/60'}`}>Select active venues</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {outlets.map((outlet) => {
                      const isSelected = selectedOutlets.includes(outlet.id);
                      return (
                        <button
                          type="button"
                          key={outlet.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedOutlets(selectedOutlets.filter(id => id !== outlet.id));
                            } else {
                              setSelectedOutlets([...selectedOutlets, outlet.id]);
                            }
                          }}
                          className={`flex items-center justify-between p-3 rounded-xl border font-mono text-xs text-left transition-all cursor-pointer ${
                            isSelected
                              ? isDark 
                                ? 'bg-[#f8bc51]/10 text-[#f8bc51] border-[#f8bc51]/40'
                                : 'bg-[#ffddb8]/60 text-[#855300] border-[#855300]/40 font-bold'
                              : isDark
                                ? 'bg-[#120a06]/40 text-[#d4c4b0]/55 border-[#302117]/60 hover:text-white hover:border-[#302117]'
                                : 'bg-white text-[#534434]/80 border-[#d8c3ad] hover:bg-[#f5f4ec] hover:text-[#855300] hover:border-[#b8a38d]'
                          }`}
                        >
                          <span className="truncate">{outlet.name}</span>
                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                            isSelected 
                              ? isDark ? 'border-[#f8bc51] bg-[#f8bc51]' : 'border-[#855300] bg-[#855300]' 
                              : isDark ? 'border-[#d4c4b0]/30' : 'border-[#b8a38d]/40'
                          }`}>
                            {isSelected && <Check size={10} className={`${isDark ? 'text-[#0A0604]' : 'text-white'} stroke-[3]`} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column - Recipes Recipe and Modifier custom Option groups */}
              <div className="flex flex-col gap-5">
                             {/* Recipe Ingredients HUD */}
                <div className={`border rounded-2xl p-5 flex flex-col gap-4 transition-all ${
                  isDark ? 'bg-[#070402] border-[#302117]' : 'bg-[#f5f4ec] border-[#d8c3ad]/70'
                }`}>
                  <div className={`flex justify-between items-center border-b pb-2 ${
                    isDark ? 'border-[#302117]/60' : 'border-[#d8c3ad]/50'
                  }`}>
                    <span className={`font-mono text-[10px] uppercase tracking-wider font-bold ${
                      isDark ? 'text-[#f8bc51]' : 'text-[#855300]'
                    }`}>Recipe Ingredients HUD</span>
                    <span className={`text-[9px] font-mono ${isDark ? 'text-[#d4c4b0]/40' : 'text-[#534434]/60'}`}>Mapped to raw stocks</span>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {recipes.length === 0 ? (
                      <span className={`text-xs italic text-center py-2 ${isDark ? 'text-[#d4c4b0]/30' : 'text-[#534434]/40'}`}>No raw material mapped to this dish yet.</span>
                    ) : (
                      recipes.map((ing, idx) => (
                        <div key={idx} className={`flex justify-between items-center text-xs font-mono rounded-lg p-2 border ${
                          isDark ? 'bg-[#120a06] border-[#302117]/50 text-white' : 'bg-white border-[#d8c3ad]/60 text-[#1b1c17]'
                        }`}>
                          <span>{ing.name}</span>
                          <div className="flex items-center gap-3">
                            <span className={`font-bold ${isDark ? 'text-[#f8bc51]' : 'text-[#855300]'}`}>{ing.quantity} {ing.unit}</span>
                            <button type="button" onClick={() => handleRemoveIngredient(idx)} className="text-red-400 hover:text-red-300 cursor-pointer">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add Ingredient fields */}
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={selectedStockId}
                      onChange={(e) => setSelectedStockId(e.target.value)}
                      className={`col-span-2 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none font-mono border ${
                        isDark ? 'bg-[#120a06] border-[#302117] text-white' : 'bg-white border-[#b8a38d] text-[#1b1c17]'
                      }`}
                    >
                      <option value="">-- Select Material --</option>
                      {stocks.map(s => (
                        <option key={s.stock_id} value={s.stock_id}>{s.name} ({s.unit})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Qty"
                      value={tempIngQty}
                      onChange={(e) => setTempIngQty(e.target.value)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs focus:outline-none border ${
                        isDark ? 'bg-[#120a06] border-[#302117] text-white' : 'bg-white border-[#b8a38d] text-[#1b1c17]'
                      }`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddIngredient}
                    className={`w-full border rounded-lg py-2 font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                      isDark 
                        ? 'border-[#f8bc51]/40 text-[#f8bc51] hover:bg-[#f8bc51]/5' 
                        : 'border-[#855300]/40 text-[#855300] hover:bg-[#855300]/5'
                    }`}
                  >
                    + Add Ingredient To Recipe
                  </button>
                </div>

                {/* Customization Option HUD */}
                <div className={`border rounded-2xl p-5 flex flex-col gap-4 transition-all ${
                  isDark ? 'bg-[#070402] border-[#302117]' : 'bg-[#f5f4ec] border-[#d8c3ad]/70'
                }`}>
                  <div className={`flex justify-between items-center border-b pb-2 ${
                    isDark ? 'border-[#302117]/60' : 'border-[#d8c3ad]/50'
                  }`}>
                    <span className={`font-mono text-[10px] uppercase tracking-wider font-bold ${
                      isDark ? 'text-[#f8bc51]' : 'text-[#855300]'
                    }`}>Customization Options HUD</span>
                    <span className={`text-[9px] font-mono ${isDark ? 'text-[#d4c4b0]/40' : 'text-[#534434]/60'}`}>Mod Groups (Sizes, Toppings)</span>
                  </div>

                  {modGroups.map((group, gIdx) => (
                    <div key={gIdx} className={`border rounded-xl p-3 flex flex-col gap-2 ${
                      isDark ? 'bg-[#120a06] border-[#302117]/50' : 'bg-white border-[#d8c3ad]/60'
                    }`}>
                      <div className={`flex justify-between items-center font-mono text-xs font-bold ${
                        isDark ? 'text-white' : 'text-[#534434]'
                      }`}>
                        <span>{group.groupName}</span>
                        <button type="button" onClick={() => setModGroups(modGroups.filter((_, i) => i !== gIdx))} className="text-red-400 hover:text-red-300 cursor-pointer">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.options.map((opt, oIdx) => {
                          const linkedStock = stocks.find(s => s.stock_id === opt.stock_id);
                          return (
                            <span key={oIdx} className={`border px-2 py-1 rounded text-[10px] font-mono ${
                              isDark 
                                ? 'bg-[#302117]/40 border-[#302117]/85 text-[#d4c4b0]' 
                                : 'bg-[#f5f4ec] border-[#d8c3ad]/50 text-[#534434]'
                            }`}>
                              {opt.name} (+₹{opt.price})
                              {linkedStock && <span className={`text-[8px] ml-1 ${isDark ? 'text-[#f8bc51]' : 'text-[#855300]'}`}>({opt.quantity} {linkedStock.unit} {linkedStock.name})</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* Dynamic Group Builder HUD */}
                  <div className={`flex flex-col gap-3 border p-3 rounded-xl ${
                    isDark ? 'border-[#302117]/40 bg-[#120a06]/30' : 'border-[#d8c3ad]/55 bg-[#eae8e0]/20'
                  }`}>
                    <input
                      type="text"
                      placeholder="Group Title (e.g. Size / Extra Addons)"
                      value={tempGroupName}
                      onChange={(e) => setTempGroupName(e.target.value)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs focus:outline-none border ${
                        isDark ? 'bg-[#120a06] border-[#302117] text-white' : 'bg-white border-[#b8a38d] text-[#1b1c17]'
                      }`}
                    />

                    {/* Temp Option row */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Option Name"
                        value={tempModName}
                        onChange={(e) => setTempModName(e.target.value)}
                        className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none border ${
                          isDark ? 'bg-[#120a06] border-[#302117] text-white' : 'bg-white border-[#b8a38d] text-[#1b1c17]'
                        }`}
                      />
                      <input
                        type="number"
                        placeholder="+ Price"
                        value={tempModPrice}
                        onChange={(e) => setTempModPrice(e.target.value)}
                        className={`w-20 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none border ${
                          isDark ? 'bg-[#120a06] border-[#302117] text-white' : 'bg-white border-[#b8a38d] text-[#1b1c17]'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleAddModOption}
                        className={`px-3.5 rounded-lg flex items-center justify-center font-bold text-xs cursor-pointer transition-colors ${
                          isDark ? 'bg-[#f8bc51] text-[#0A0604] hover:bg-[#ffce7b]' : 'bg-[#855300] text-white hover:bg-[#9c6a1a]'
                        }`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* Optional Stock Link */}
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <select
                        value={tempModStockId}
                        onChange={(e) => setTempModStockId(e.target.value)}
                        className={`rounded-lg px-2.5 py-1.5 text-[10px] focus:outline-none font-mono border ${
                          isDark ? 'bg-[#120a06] border-[#302117] text-white' : 'bg-white border-[#b8a38d] text-[#1b1c17]'
                        }`}
                      >
                        <option value="">-- Link Stock (Optional) --</option>
                        {stocks.map(s => (
                          <option key={s.stock_id} value={s.stock_id}>{s.name} ({s.unit})</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Deduct Qty"
                        value={tempModStockQty}
                        onChange={(e) => setTempModStockQty(e.target.value)}
                        className={`rounded-lg px-2.5 py-1.5 text-[10px] focus:outline-none border ${
                          isDark ? 'bg-[#120a06] border-[#302117] text-white' : 'bg-white border-[#b8a38d] text-[#1b1c17]'
                        }`}
                      />
                    </div>

                    {/* Current draft options */}
                    {tempModOptions.length > 0 && (
                      <div className={`flex flex-wrap gap-1.5 border-t pt-2.5 ${
                        isDark ? 'border-[#302117]/30' : 'border-[#d8c3ad]/40'
                      }`}>
                        {tempModOptions.map((opt, idx) => {
                          const linkedStock = stocks.find(s => s.stock_id === opt.stock_id);
                          return (
                            <span key={idx} className={`px-2 py-0.5 rounded text-[9px] font-mono flex items-center gap-1.5 ${
                              isDark ? 'bg-[#302117]/60 text-white' : 'bg-[#ffddb8]/80 text-[#855300]'
                            }`}>
                              {opt.name} (+₹{opt.price})
                              {linkedStock && <span className={`text-[8px] ${isDark ? 'text-[#f8bc51]' : 'text-[#855300]'}`}>({opt.quantity} {linkedStock.unit} {linkedStock.name})</span>}
                              <button type="button" onClick={() => setTempModOptions(tempModOptions.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 cursor-pointer">×</button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleCreateModGroup}
                      className={`w-full border rounded-lg py-1.5 font-mono text-[9px] uppercase tracking-wider transition-all cursor-pointer ${
                        isDark 
                          ? 'bg-[#302117]/60 hover:bg-[#302117] text-white border-[#302117]' 
                          : 'bg-white hover:bg-[#eae8e0] text-[#855300] border-[#d8c3ad]'
                      }`}
                    >
                      + Save Mod Group Draft
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Save Buttons */}
            <div className={`flex justify-end gap-3 mt-4 border-t pt-5 ${
              isDark ? 'border-[#302117]/60' : 'border-[#d8c3ad]/60'
            }`}>
              <button
                type="button"
                onClick={() => { setActiveTab('list'); setEditingItem(null); }}
                className={`px-6 py-3 rounded-xl border font-mono text-xs uppercase tracking-widest transition-all cursor-pointer ${
                  isDark 
                    ? 'border-[#302117] text-[#d4c4b0] hover:text-white' 
                    : 'border-[#d8c3ad] text-[#534434] hover:bg-[#f5f4ec]'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`px-6 py-3 rounded-xl font-mono text-xs uppercase tracking-widest font-bold shadow-lg transition-all cursor-pointer ${
                  isDark 
                    ? 'bg-[#f8bc51] text-[#0A0604] hover:bg-[#ffce7b] shadow-[#f8bc51]/10 hover:shadow-[#f8bc51]/25' 
                    : 'bg-[#855300] text-white hover:bg-[#9c6a1a] shadow-[#855300]/10 hover:shadow-[#855300]/25'
                }`}
              >
                {loading ? "Saving..." : userRole === 'manager' ? "Request Approval" : editingItem ? "Update Catalog Item" : "Publish Menu Item"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Pausing Modal overlay */}
      {pausingItem && (
        <div className="fixed inset-0 z-50 bg-[#060403]/80 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`border rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-5 text-center ${
              isDark ? 'bg-[#120a06] border-[#302117]' : 'bg-white border-[#d8c3ad]'
            }`}
          >
            <div>
              <h4 className={`font-serif italic text-lg font-bold ${
                isDark ? 'text-white' : 'text-[#855300]'
              }`}>Temporarily Pause Operational State</h4>
              <p className={`text-xs mt-1 ${isDark ? 'text-[#d4c4b0]/70' : 'text-[#534434]/80'}`}>Choose operational delay parameters for <strong className={isDark ? 'text-[#f8bc51]' : 'text-[#855300]'}>{pausingItem.name}</strong></p>
            </div>

            <div className="flex flex-col gap-2 font-mono text-xs uppercase tracking-widest">
              <button 
                onClick={() => handlePauseItem('1 Day', 24)}
                className={`w-full border rounded-xl py-3 transition-colors font-mono cursor-pointer ${
                  isDark 
                    ? 'bg-[#302117]/40 hover:bg-[#302117] text-white border-[#302117]' 
                    : 'bg-[#f5f4ec] hover:bg-[#eae8e0] text-[#534434] border-[#d8c3ad]'
                }`}
              >
                Pause For 1 Day
              </button>
              <button 
                onClick={() => handlePauseItem('3 Days', 72)}
                className={`w-full border rounded-xl py-3 transition-colors font-mono cursor-pointer ${
                  isDark 
                    ? 'bg-[#302117]/40 hover:bg-[#302117] text-white border-[#302117]' 
                    : 'bg-[#f5f4ec] hover:bg-[#eae8e0] text-[#534434] border-[#d8c3ad]'
                }`}
              >
                Pause For 3 Days
              </button>
              <button 
                onClick={() => handlePauseItem('1 Week', 168)}
                className={`w-full border rounded-xl py-3 transition-colors font-mono cursor-pointer ${
                  isDark 
                    ? 'bg-[#302117]/40 hover:bg-[#302117] text-white border-[#302117]' 
                    : 'bg-[#f5f4ec] hover:bg-[#eae8e0] text-[#534434] border-[#d8c3ad]'
                }`}
              >
                Pause For 1 Week
              </button>
              <button 
                onClick={() => handlePauseItem('Indefinitely', 99999)}
                className={`w-full border rounded-xl py-3 transition-colors font-mono cursor-pointer ${
                  isDark 
                    ? 'bg-[#e8621a]/10 hover:bg-[#e8621a]/20 text-[#e8621a] border-[#e8621a]/20' 
                    : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200'
                }`}
              >
                Pause Until Re-enabled
              </button>
            </div>

            <button
              onClick={() => setPausingItem(null)}
              className={`text-[10px] uppercase tracking-wider font-mono mt-2 cursor-pointer ${
                isDark ? 'text-[#d4c4b0]/40 hover:text-white' : 'text-[#534434]/55 hover:text-[#855300]'
              }`}
            >
              Close Overlay
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
