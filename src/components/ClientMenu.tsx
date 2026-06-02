/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from "react";
import { MenuItem, OrderItem, BannerSettings, Order, Category } from "../types";
import { 
  Search, Plus, Minus, ShoppingCart, 
  Trash2, Send, CheckCircle, ArrowLeft, QrCode, Clock, X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import Banner from "./Banner";

const formatItemName = (name: string): string => {
  if (!name) return "";
  return name
    .split(/\s+/)
    .map((word) => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

interface ClientMenuProps {
  tableId: string;
  items: MenuItem[];
  categories: Category[];
  orders: Order[];
  bannerSettings: BannerSettings | null;
  onBackToTableSelect: () => void;
  onGoToAdmin: () => void;
  restaurantId?: string | null;
  restaurantName?: string;
}

export default function ClientMenu({ 
  tableId, 
  items, 
  categories = [],
  orders,
  bannerSettings,
  onBackToTableSelect,
  onGoToAdmin,
  restaurantId = null,
  restaurantName = "Foodcourt"
}: ClientMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isCartMinimized, setIsCartMinimized] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{ id: string; total: number } | null>(null);

  // Secret 5-tap sequence on Logo to access Staff Mode discretely
  const [logoClicks, setLogoClicks] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleLogoClick = () => {
    const now = Date.now();
    if (now - lastClickTime < 1500) {
      const nextClicks = logoClicks + 1;
      setLogoClicks(nextClicks);
      if (nextClicks >= 5) {
        setLogoClicks(0);
        onGoToAdmin();
      }
    } else {
      setLogoClicks(1);
    }
    setLastClickTime(now);
  };

  // Dynamically prepare the category list with NO "Others" category pill
  const renderedCategories = useMemo(() => {
    return (categories || []).filter(cat => cat.name.toLowerCase() !== "others");
  }, [categories]);

  // Compute the top 5 most recently created items across any category to highlight new plates
  const recentlyAddedItems = useMemo(() => {
    return [...(items || [])]
      .filter((item) => item.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [items]);

  // Filter items in real time based on search query and active category, sorting ordered items first
  const filteredItems = useMemo(() => {
    const rawFiltered = (items || []).filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedCategory === "All") {
        return true;
      }

      return item.category && item.category.toLowerCase() === selectedCategory.toLowerCase();
    });

    // Obtain the set of item IDs that have already been ordered across all tables/orders (system-wide popular sort)
    const orderedItemIds = new Set(
      (orders || [])
        .flatMap((o) => o.items.map((i) => i.id))
    );

    // Sort already-ordered items first, then newer items first
    return [...rawFiltered].sort((a, b) => {
      const aOrdered = orderedItemIds.has(a.id);
      const bOrdered = orderedItemIds.has(b.id);
      if (aOrdered && !bOrdered) return -1;
      if (!aOrdered && bOrdered) return 1;

      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [items, searchQuery, selectedCategory, orders, tableId]);

  // Active/recent orders related to this table to show live tracking info (hides once they are completed)
  const myActiveOrders = useMemo(() => {
    return (orders || [])
      .filter((o) => o.tableId === tableId && o.status !== "completed")
      .sort((a, b) => {
        if (a.status === "accepted" && b.status === "pending") return -1;
        if (a.status === "pending" && b.status === "accepted") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [orders, tableId]);

  // Add item to persistent bottom cart sheet
  const handleAddToCart = (item: MenuItem) => {
    setIsCartMinimized(false);
    const cleanPrice = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);
    setCart((prevCart) => {
      const existing = prevCart.find((ci) => ci.id === item.id);
      if (existing) {
        return prevCart.map((ci) =>
          ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      }
      return [...prevCart, { id: item.id, name: item.name, price: cleanPrice, quantity: 1 }];
    });
  };

  // Adjust quantity +/-
  const handleIncreaseQty = (id: string) => {
    setCart((prevCart) =>
      prevCart.map((ci) => (ci.id === id ? { ...ci, quantity: ci.quantity + 1 } : ci))
    );
  };

  // Adjust quantity +/-
  const handleDecreaseQty = (id: string) => {
    setCart((prevCart) =>
      prevCart
        .map((ci) => {
          if (ci.id === id) {
            return { ...ci, quantity: ci.quantity - 1 };
          }
          return ci;
        })
        .filter((ci) => ci.quantity > 0)
    );
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prevCart) => prevCart.filter((ci) => ci.id !== id));
  };

  // Calculate cart metrics
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const cleanPrice = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);
      return sum + cleanPrice * item.quantity;
    }, 0);
  }, [cart]);

  const totalItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Place order into Firebase Firestore
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || isPlacingOrder) return;
    setIsPlacingOrder(true);

    const orderId = "order_" + Math.random().toString(36).substring(2, 12);
    const timestampStr = new Date().toISOString();

    const orderPayload = {
      tableId,
      items: cart.map(item => ({
        id: item.id,
        name: item.name,
        price: typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0),
        quantity: item.quantity
      })),
      total: parseFloat(cartTotal.toFixed(2)),
      status: "pending" as const,
      createdAt: timestampStr,
      updatedAt: timestampStr,
    };

    try {
      // Create Document in Firestore orders collection
      const orderDocRef = restaurantId
        ? doc(db, "restaurants", restaurantId, "orders", orderId)
        : doc(db, "orders", orderId);
      await setDoc(orderDocRef, orderPayload);
      
      // Save order metadata for confirmation layout
      setPlacedOrder({
        id: orderId,
        total: orderPayload.total,
      });

      // Reset local cart state
      setCart([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}`);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Direct 1-click order handler
  const handleDirectOrder = async (item: MenuItem) => {
    if (isPlacingOrder) return;
    setIsPlacingOrder(true);

    const orderId = "order_" + Math.random().toString(36).substring(2, 12);
    const timestampStr = new Date().toISOString();
    const cleanPrice = typeof item.price === "number" ? item.price : (parseFloat(item.price as any) || 0);

    const orderPayload = {
      tableId,
      items: [{ id: item.id, name: item.name, price: cleanPrice, quantity: 1 }],
      total: parseFloat(cleanPrice.toFixed(2)),
      status: "pending" as const,
      createdAt: timestampStr,
      updatedAt: timestampStr,
    };

    try {
      const orderDocRef = restaurantId
        ? doc(db, "restaurants", restaurantId, "orders", orderId)
        : doc(db, "orders", orderId);
      await setDoc(orderDocRef, orderPayload);
      
      setPlacedOrder({
        id: orderId,
        total: orderPayload.total,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `orders/${orderId}`);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 pb-36 text-neutral-100 flex flex-col" id="client-menu-view">
      {/* Dynamic Subheader/Table identifier */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800/50 bg-[#0a0a0a]/90 px-8 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div 
              onClick={handleLogoClick}
              className="w-7.5 h-7.5 bg-white flex items-center justify-center rounded-md shadow-md shrink-0 cursor-pointer active:scale-95 transition-transform select-none"
              title={restaurantName}
            >
              <span className="text-black font-black text-sm">{restaurantName ? restaurantName.charAt(0).toUpperCase() : "F"}</span>
            </div>
            <div>
              <h1 className="text-xs font-bold tracking-tight text-zinc-100">{restaurantName}</h1>
              <p className="text-[9px] text-zinc-500 uppercase tracking-[0.2em]">Table {tableId}</p>
            </div>
          </div>
        </div>

        {/* Branding/Secret Gateway link */}
        {(sessionStorage.getItem(`admin_role_${restaurantId}`) === "staff" || 
          sessionStorage.getItem(`admin_role_${restaurantId}`) === "superadmin" || 
          sessionStorage.getItem("admin_role") === "superadmin") && (
          <button
            onClick={onGoToAdmin}
            id="staff-console-gateway"
            className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-400 hover:text-zinc-100 uppercase tracking-widest transition-all border border-zinc-800 px-3 py-1 rounded-full bg-zinc-950 cursor-pointer active:scale-95 animate-pulse"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Staff Mode</span>
          </button>
        )}
      </header>

      {/* Dynamic announcements banner inside client menu workspace */}
      <Banner settings={bannerSettings} />

      {/* Menu / Items Workspace */}
      <main className="mx-auto w-full max-w-5xl px-8 flex-grow">
        {/* Real-time search */}
        <div className="relative mb-2 mt-2">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-500">
            <Search className="h-5 w-5" />
          </div>
          <input
            type="text"
            id="menu-search-input"
            placeholder="Search dishes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800/80 px-5 py-3.5 pl-12 rounded-full text-sm focus:outline-none focus:border-zinc-600 placeholder:text-zinc-500 text-zinc-100 transition-all outline-none"
          />
        </div>

        {/* Category filtering section (turn off/on via settings) */}
        {(bannerSettings?.categoriesEnabled ?? true) && (
          <div className="flex items-center gap-2 overflow-x-auto py-3 mb-4 scrollbar-none no-scrollbar" id="category-pills-row">
            {renderedCategories
              .map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    if (selectedCategory.toLowerCase() === cat.name.toLowerCase()) {
                      setSelectedCategory("All");
                    } else {
                      setSelectedCategory(cat.name);
                    }
                  }}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer shrink-0 border ${
                    selectedCategory.toLowerCase() === cat.name.toLowerCase()
                      ? "bg-white border-white text-black font-extrabold shadow-md"
                      : "bg-zinc-900/60 border-zinc-808/80 text-zinc-400 hover:text-white hover:border-zinc-700"
                  }`}
                >
                  <img
                    src={cat.imageUrl || "https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=50&auto=format&fit=crop&q=80"}
                    alt={cat.name}
                    className="w-4.5 h-4.5 rounded-full object-cover border border-zinc-800/50 shrink-0"
                  />
                  <span>{cat.name}</span>
                </button>
              ))}
          </div>
        )}
        {/* Real-time active orders status display section */}
        {myActiveOrders.length > 0 && (
          <div className="mb-3 rounded-xl border border-zinc-900 bg-zinc-900/10 p-2 px-3.5 space-y-1.5" id="active-orders-tracker">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-1">
              <div className="flex items-center gap-2">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-sans text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Your Order Status ({myActiveOrders.length})
                </h3>
              </div>
              <p className="font-mono text-[9px] text-zinc-650">Real-time update</p>
            </div>
            <div className="divide-y divide-zinc-900/40 overflow-hidden max-h-24 overflow-y-auto pr-1">
              {myActiveOrders.map((order) => {
                const displayStatus = order.status === "pending" 
                  ? "Pending" 
                  : order.status === "accepted" 
                  ? "Processing" 
                  : "Completed";

                const statusColor = order.status === "pending"
                  ? "text-amber-500 bg-amber-950/10 border-amber-900/40"
                  : order.status === "accepted"
                  ? "text-sky-400 bg-sky-950/10 border-sky-900/40"
                  : "text-emerald-400 bg-emerald-950/10 border-emerald-900/40";

                return (
                  <div key={order.id} className="py-1 flex items-center justify-between text-xs" id={`order-track-${order.id}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-zinc-500 font-sans text-[11px] truncate max-w-[180px] sm:max-w-md">
                        {order.items.map(i => `${formatItemName(i.name)} (x${i.quantity})`).join(", ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-zinc-400">
                        ₹{order.total.toFixed(2)}
                      </span>
                      <span className={`px-2 py-0.5 font-sans font-bold text-[9px] uppercase tracking-wider rounded border ${statusColor}`}>
                        {displayStatus}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dynamic Catalog Section */}
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center" id="no-dishes-view">
            <p className="font-sans text-sm text-neutral-500">
              {items.length === 0 
                ? "The digital menu is currently empty. Staff can create and edit items inside the Staff Dashboard."
                : `No dishes match "${searchQuery}"`}
            </p>
          </div>
        ) : (
          <motion.div 
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.04 } }
            }}
            initial="hidden"
            animate="visible"
            layout
            className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4" 
            id="dishes-grid"
          >
            {filteredItems.map((item) => (
              <motion.div 
                key={item.id} 
                id={`menu-item-card-${item.id}`}
                variants={{
                  hidden: { opacity: 0, y: 20, scale: 0.95 },
                  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 20 } }
                }}
                whileHover={{ y: -6, transition: { duration: 0.2 } }}
                className="bg-zinc-900/40 border border-zinc-800/40 rounded-2xl p-3 sm:p-4 flex flex-col group transition-all duration-300 hover:border-zinc-700/60 shadow-lg"
              >
                {/* Photo frame */}
                <div className="aspect-square w-full bg-zinc-800/50 rounded-xl mb-3 sm:mb-4 overflow-hidden relative">
                  {item.imageUrl ? (
                    <img 
                      src={item.imageUrl} 
                      alt={item.name} 
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-700 font-mono text-[10px] uppercase tracking-wider">
                      No Photo
                    </div>
                  )}
                </div>

                {/* Info block */}
                <div className="flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-4 gap-2">
                    <h3 className="font-sans font-medium text-xs sm:text-sm text-zinc-200 group-hover:text-white transition-colors tracking-tight line-clamp-1">
                      {formatItemName(item.name)}
                    </h3>
                    <span className="text-zinc-400 font-mono text-xs sm:text-sm shrink-0">
                      ₹{item.price.toFixed(2)}
                    </span>
                  </div>
                  
                  <motion.button
                    onClick={() => handleAddToCart(item)}
                    id={`add-to-cart-${item.id}`}
                    whileTap={{ scale: 0.95 }}
                    className="mt-auto w-full py-2.5 sm:py-3 bg-white hover:bg-zinc-100 text-black rounded-xl font-bold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs sm:text-sm tracking-wide shadow-md"
                  >
                    <Plus className="h-4 w-4 shrink-0 text-black" />
                    <span>Add Plate</span>
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

      {/* Bottom Collapsible Cart Sheet */}
      <AnimatePresence>
        {cart.length > 0 && !isCartMinimized && (
          <motion.div
            initial={{ y: 200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 200, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-[36px] py-6 px-10 shadow-[0_-15px_40px_rgba(0,0,0,0.4)] text-zinc-950 border-t border-zinc-100"
            id="persistent-order-bar"
          >
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 text-[10px] font-mono font-bold text-white">
                    {totalItemsCount}
                  </div>
                  <h4 className="font-sans text-xs font-bold uppercase tracking-widest text-zinc-800">Selected Plates</h4>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCart([])}
                    id="clear-cart-btn"
                    className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-zinc-950 transition-all cursor-pointer"
                  >
                    Cancel selection
                  </button>
                  <button
                    onClick={() => setIsCartMinimized(true)}
                    id="minimize-cart-btn"
                    className="p-1 rounded-full text-black hover:bg-zinc-100 transition-all cursor-pointer"
                    title="Collapse selection"
                  >
                    <X className="h-5 w-5 text-black font-extrabold stroke-[3.5]" />
                  </button>
                </div>
              </div>

              {/* Items scroll zone */}
              <div className="max-h-36 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-zinc-200">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm py-1" id={`cart-item-${item.id}`}>
                    <span className="font-sans font-semibold text-zinc-800">{formatItemName(item.name)}</span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono font-medium text-zinc-500">₹{(item.price * item.quantity).toFixed(2)}</span>
                      <div className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
                        <button
                          onClick={() => handleDecreaseQty(item.id)}
                          id={`qty-dec-${item.id}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center font-mono text-xs font-bold text-zinc-950">{item.quantity}</span>
                        <button
                          onClick={() => handleIncreaseQty(item.id)}
                          id={`qty-inc-${item.id}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200 transition-colors cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Checkout total and Single Click Submit Button */}
              <div className="flex flex-col gap-4 pt-2 md:flex-row md:items-center md:justify-between md:gap-8 border-t border-zinc-50">
                <div className="flex justify-between md:flex-col md:justify-center">
                  <span className="font-sans text-[10px] uppercase tracking-[0.15em] text-zinc-400 font-medium">Chef's Total Sum</span>
                  <span className="font-sans text-2xl font-extrabold tracking-tight text-zinc-950">₹{cartTotal.toFixed(2)}</span>
                </div>

                <button
                  onClick={handlePlaceOrder}
                  disabled={isPlacingOrder}
                  id="order-now-button"
                  className="flex flex-grow items-center justify-center gap-3 rounded-2xl bg-zinc-950 py-4 px-12 font-sans text-sm font-bold uppercase tracking-wider text-white transition-all hover:bg-zinc-800 disabled:opacity-50 active:scale-[0.98] cursor-pointer shadow-lg shadow-zinc-950/20"
                >
                  <Send className="h-4 w-4 shrink-0" />
                  <span>{isPlacingOrder ? "Placing Order..." : "ORDER NOW"}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success State Overlay Modal */}
      <AnimatePresence>
        {placedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/90 p-6 backdrop-blur-md"
            id="order-success-modal"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-[24px] border border-neutral-900 bg-neutral-900/80 p-8 text-center space-y-6"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-900/50">
                <CheckCircle className="h-8 w-8" />
              </div>

              <div className="space-y-2">
                <h3 className="font-sans text-2xl font-light tracking-tight text-neutral-100">Order Placed!</h3>
                <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
                  Ref ID: {placedOrder.id}
                </p>
                <p className="text-sm text-neutral-400 px-2 leading-relaxed">
                  Your kitchen ticket has been finalized for <strong className="text-neutral-100">{tableId}</strong>. We are processing your order.
                </p>
              </div>

              <div className="border-t border-neutral-900 pt-4 space-y-2">
                <div className="flex justify-between font-mono text-xs text-neutral-400">
                  <span>Charge Sum:</span>
                  <span className="text-neutral-200">₹{placedOrder.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-mono text-xs text-neutral-400">
                  <span>Sat Location:</span>
                  <span className="text-neutral-200">{tableId}</span>
                </div>
              </div>

              <button
                onClick={() => setPlacedOrder(null)}
                id="close-success-btn"
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-neutral-300 transition-all hover:border-neutral-500 hover:text-neutral-100 hover:bg-neutral-900 active:scale-95 animate-pulse"
              >
                Return to Menu
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
