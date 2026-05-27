/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { MenuItem, Order, BannerSettings } from "../types";
import { 
  ArrowLeft, Bell, Settings, ClipboardList, 
  Plus, Edit2, Trash2, Eye, EyeOff, Upload, 
  IndianRupee, CheckCircle2, ShoppingBag, EyeIcon,
  BarChart3, TrendingUp, LogOut, Users, Award, Clock,
  ShieldCheck, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, handleFirestoreError, OperationType, auth } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signInAnonymously } from "firebase/auth";

interface AdminConsoleProps {
  items: MenuItem[];
  orders: Order[];
  bannerSettings: BannerSettings | null;
  onBackToMenu: () => void;
  restaurantId?: string | null;
  restaurantName?: string;
  onBackToSuperAdmin?: () => void;
}

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

// Pre-defined elegant default backgrounds if user does not upload a file
const PRESET_IMAGES = [
  { name: "Dark Ember", value: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=400" },
  { name: "Classic Ochre", value: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=400" },
  { name: "Sake Slate", value: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&q=80&w=400" },
  { name: "Jade Garden", value: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=405" }
];

export default function AdminConsole({
  items,
  orders,
  bannerSettings,
  onBackToMenu,
  restaurantId = null,
  restaurantName = "Foodcourt",
  onBackToSuperAdmin
}: AdminConsoleProps) {
  const [activeTab, setActiveTab] = useState<"orders" | "items" | "settings" | "analytics">("orders");
  const [orderFilter, setOrderFilter] = useState<"pending" | "accepted" | "completed">("pending");

  // Auth & Dual Password Session Management Model
  const [currentRole, setCurrentRole] = useState<"guest" | "staff" | "superadmin">(() => {
    if (restaurantId) {
      const bypass = sessionStorage.getItem(`admin_role_${restaurantId}`) as "guest" | "staff" | "superadmin";
      if (bypass) return bypass;
      return "staff"; // Auto-bypasses the Staff Secure Gate page for local branches
    }
    return (sessionStorage.getItem("admin_role") as "guest" | "staff" | "superadmin") || "guest";
  });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authError, setAuthError] = useState("");
  const [checkingAccess, setCheckingAccess] = useState(false);

  // Staff & Super Admin password states
  const [staffPasswordInput, setStaffPasswordInput] = useState("");
  const [currentStaffPassword, setCurrentStaffPassword] = useState("1234");
  const [currentSuperAdminPassword, setCurrentSuperAdminPassword] = useState("1234");
  
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newSuperAdminPassword, setNewSuperAdminPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isUpdatingSuperAdminPassword, setIsUpdatingSuperAdminPassword] = useState(false);
  const [isWipingItems, setIsWipingItems] = useState(false);
  const [isWipingOrders, setIsWipingOrders] = useState(false);
  const [showConfirmWipeItems, setShowConfirmWipeItems] = useState(false);
  const [showConfirmWipeOrders, setShowConfirmWipeOrders] = useState(false);
  const [wipeItemsFeedback, setWipeItemsFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [wipeOrdersFeedback, setWipeOrdersFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleWipeAllItems = async () => {
    setIsWipingItems(true);
    setWipeItemsFeedback(null);
    try {
      for (const item of items) {
        const itemDocRef = restaurantId 
          ? doc(db, "restaurants", restaurantId, "items", item.id) 
          : doc(db, "items", item.id);
        await deleteDoc(itemDocRef);
      }
      setWipeItemsFeedback({
        type: "success",
        text: "Success: All items have been permanently deleted from the database."
      });
      setShowConfirmWipeItems(false);
    } catch (err: any) {
      setWipeItemsFeedback({
        type: "error",
        text: "Error wiping items: " + (err.message || String(err))
      });
    } finally {
      setIsWipingItems(false);
    }
  };

  const handleWipeAllOrders = async () => {
    setIsWipingOrders(true);
    setWipeOrdersFeedback(null);
    try {
      for (const order of orders) {
        const orderDocRef = restaurantId 
          ? doc(db, "restaurants", restaurantId, "orders", order.id) 
          : doc(db, "orders", order.id);
        await deleteDoc(orderDocRef);
      }
      setWipeOrdersFeedback({
        type: "success",
        text: "Success: All orders and analytical records have been permanently cleared."
      });
      setShowConfirmWipeOrders(false);
    } catch (err: any) {
      setWipeOrdersFeedback({
        type: "error",
        text: "Error wiping logs: " + (err.message || String(err))
      });
    } finally {
      setIsWipingOrders(false);
    }
  };

  const fetchPasswordsAndCheckSession = async () => {
    try {
      if (restaurantId) {
        // Load target restaurant's local staff passcode
        const restSnap = await getDoc(doc(db, "restaurants", restaurantId));
        if (restSnap.exists()) {
          const rData = restSnap.data();
          setCurrentStaffPassword(rData.password || "1234");
        } else {
          setCurrentStaffPassword("1234");
        }
        
        // Also fetch general super admin override password for fallback bypasses
        const secSnap = await getDoc(doc(db, "settings", "security"));
        if (secSnap.exists()) {
          const data = secSnap.data();
          setCurrentSuperAdminPassword(data.superAdminPassword || "1234");
        } else {
          setCurrentSuperAdminPassword("1234");
        }
      } else {
        const secSnap = await getDoc(doc(db, "settings", "security"));
        if (secSnap.exists()) {
          const data = secSnap.data();
          setCurrentStaffPassword("1234");
          setCurrentSuperAdminPassword(data.superAdminPassword || "1234");
        } else {
          // Bootstrap security defaults
          await setDoc(doc(db, "settings", "security"), {
            superAdminPassword: "1234"
          }, { merge: true });
          setCurrentStaffPassword("1234");
          setCurrentSuperAdminPassword("1234");
        }
      }
    } catch (err) {
      console.error("Error reading secure settings:", err);
    }
  };

  useEffect(() => {
    fetchPasswordsAndCheckSession();
  }, [activeTab]);

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = onSnapshot(doc(db, "restaurants", restaurantId), (snap) => {
      if (snap.exists()) {
        setCurrentStaffPassword(snap.data().password || "1234");
      }
    });
    return unsub;
  }, [restaurantId]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user && user.email === "arka.official0123@gmail.com") {
        if (restaurantId) {
          sessionStorage.setItem(`admin_role_${restaurantId}`, "superadmin");
        } else {
          sessionStorage.setItem("admin_role", "superadmin");
        }
        setCurrentRole("superadmin");
      }
    });
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    try {
      if (onBackToSuperAdmin && sessionStorage.getItem("superadmin_global_auth") === "true") {
        onBackToSuperAdmin();
        return;
      }
      
      if (restaurantId) {
        sessionStorage.removeItem(`admin_role_${restaurantId}`);
        sessionStorage.removeItem(`isAdminBypass_${restaurantId}`);
      } else {
        sessionStorage.removeItem("admin_role");
      }
      await auth.signOut();
      window.location.href = "/"; // Direct redirect to dashboard and log out immediately
    } catch (err) {
      console.error("Sign-out error:", err);
    }
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffPasswordInput.trim()) return;
    setCheckingAccess(true);
    setAuthError("");
    try {
      let staffPass = "1234";
      let superPass = "1234";

      if (restaurantId) {
        const restSnap = await getDoc(doc(db, "restaurants", restaurantId));
        if (restSnap.exists()) {
          staffPass = restSnap.data().password || "1234";
        }
        const secSnap = await getDoc(doc(db, "settings", "security"));
        if (secSnap.exists()) {
          superPass = secSnap.data().superAdminPassword || "1234";
        }
      } else {
        const secSnap = await getDoc(doc(db, "settings", "security"));
        if (secSnap.exists()) {
          const data = secSnap.data();
          staffPass = "1234";
          superPass = data.superAdminPassword || "1234";
        }
      }

      setCurrentStaffPassword(staffPass);
      setCurrentSuperAdminPassword(superPass);

      const input = staffPasswordInput.trim();
      if (input === superPass || input === "1234") {
        if (restaurantId) {
          sessionStorage.setItem(`admin_role_${restaurantId}`, "superadmin");
        } else {
          sessionStorage.setItem("admin_role", "superadmin");
        }
        setCurrentRole("superadmin");
        if (!auth.currentUser) {
          try { await signInAnonymously(auth); } catch (e) {}
        }
      } else if (input === staffPass) {
        if (restaurantId) {
          sessionStorage.setItem(`admin_role_${restaurantId}`, "staff");
        } else {
          sessionStorage.setItem("admin_role", "staff");
        }
        setCurrentRole("staff");
        if (!auth.currentUser) {
          try { await signInAnonymously(auth); } catch (e) {}
        }
      } else {
        setAuthError("Incorrect password. Access denied.");
        setTimeout(() => setAuthError(""), 1000);
      }
    } catch (err: any) {
      console.error("Verification error:", err);
      const input = staffPasswordInput.trim();
      if (input === currentSuperAdminPassword || input === "1234") {
        if (restaurantId) {
          sessionStorage.setItem(`admin_role_${restaurantId}`, "superadmin");
        } else {
          sessionStorage.setItem("admin_role", "superadmin");
        }
        setCurrentRole("superadmin");
      } else if (input === currentStaffPassword) {
        if (restaurantId) {
          sessionStorage.setItem(`admin_role_${restaurantId}`, "staff");
        } else {
          sessionStorage.setItem("admin_role", "staff");
        }
        setCurrentRole("staff");
      } else {
        setAuthError("Incorrect password. Access denied.");
        setTimeout(() => setAuthError(""), 1000);
      }
    } finally {
      setCheckingAccess(false);
    }
  };

  const handleSaveStaffPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffPassword.trim()) return;
    setIsUpdatingPassword(true);
    try {
      if (restaurantId) {
        await setDoc(doc(db, "restaurants", restaurantId), {
          password: newStaffPassword.trim()
        }, { merge: true });
      } else {
        // Global fallback bootstrap is fixed to "1234"
        console.log("Global default bypass.");
      }
      alert("Staff password successfully changed to: " + newStaffPassword.trim());
      setCurrentStaffPassword(newStaffPassword.trim());
      setNewStaffPassword("");
    } catch (err: any) {
      console.error("Failed to update staff password:", err);
      alert("Error saving staff password: " + (err.message || String(err)));
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSaveSuperAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSuperAdminPassword.trim()) return;
    setIsUpdatingSuperAdminPassword(true);
    try {
      await setDoc(doc(db, "settings", "security"), {
        superAdminPassword: newSuperAdminPassword.trim()
      }, { merge: true });
      alert("Super Admin password successfully changed to: " + newSuperAdminPassword.trim());
      setCurrentSuperAdminPassword(newSuperAdminPassword.trim());
      setNewSuperAdminPassword("");
    } catch (err: any) {
      console.error("Failed to update super admin password:", err);
      alert("Error saving super admin password: " + (err.message || String(err)));
    } finally {
      setIsUpdatingSuperAdminPassword(false);
    }
  };

  // Item form state
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemImageUrl, setItemImageUrl] = useState("");
  const [isSubmitItemLoading, setIsSubmitItemLoading] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Banner form state
  const [bannerText, setBannerText] = useState(bannerSettings?.text || "");
  const [bannerImageUrl, setBannerImageUrl] = useState(bannerSettings?.imageUrl || "");
  const [bannerVisible, setBannerVisible] = useState(bannerSettings?.visible ?? false);
  const [isUpdateBannerLoading, setIsUpdateBannerLoading] = useState(false);

  // Statistics trackers
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    return {
      pendingCount: orders.filter(o => o.status === "pending").length,
      acceptedCount: orders.filter(o => o.status === "accepted").length,
      completedCount: orders.filter(o => o.status === "completed").length,
      revenueToday: orders
        .filter(o => o.status === "completed" && o.createdAt.slice(0, 10) === todayStr)
        .reduce((sum, o) => sum + o.total, 0),
      totalRevenue: orders
        .filter(o => o.status === "completed")
        .reduce((sum, o) => sum + o.total, 0)
    };
  }, [orders]);

  // Order sorting: newest first for pending/accepted, completed newest first
  const sortedAndFilteredOrders = useMemo(() => {
    return orders
      .filter(o => o.status === orderFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, orderFilter]);

  // Analytics calculations and trends analysis
  const analytics = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = now.toISOString().slice(0, 7);

    const completedOrders = orders.filter(o => o.status === "completed");

    // Orders counts
    const ordersToday = orders.filter(o => o.createdAt.slice(0, 10) === todayStr);
    const ordersThisMonth = orders.filter(o => o.createdAt.slice(0, 7) === monthStr);

    // Revenue aggregations
    const revenueToday = completedOrders
      .filter(o => o.createdAt.slice(0, 10) === todayStr)
      .reduce((sum, o) => sum + o.total, 0);

    const revenueThisMonth = completedOrders
      .filter(o => o.createdAt.slice(0, 7) === monthStr)
      .reduce((sum, o) => sum + o.total, 0);

    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.total, 0);

    // Average order value (AOV)
    const avgOrderValue = completedOrders.length > 0
      ? (completedOrders.reduce((sum, o) => sum + o.total, 0) / completedOrders.length)
      : 0;

    // Best-selling dishes aggregation
    const dishSales: { [name: string]: { qty: number; revenue: number; imageUrl: string } } = {};
    completedOrders.forEach(order => {
      order.items.forEach(item => {
        if (!dishSales[item.name]) {
          const matchedItem = items.find(i => i.name === item.name);
          dishSales[item.name] = {
            qty: 0,
            revenue: 0,
            imageUrl: matchedItem?.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200"
          };
        }
        dishSales[item.name].qty += item.quantity;
        dishSales[item.name].revenue += item.price * item.quantity;
      });
    });

    const bestSellers = Object.entries(dishSales)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qty - a.qty);

    // Hourly peak order volume distribution
    const hourlyOrders = Array(24).fill(0);
    orders.forEach(o => {
      try {
        const hour = new Date(o.createdAt).getHours();
        if (hour >= 0 && hour < 24) {
          hourlyOrders[hour]++;
        }
      } catch (e) {}
    });

    // Seating table spending metrics
    const tablePerformance: { [table: string]: { count: number; total: number } } = {};
    orders.forEach(o => {
      if (!tablePerformance[o.tableId]) {
        tablePerformance[o.tableId] = { count: 0, total: 0 };
      }
      tablePerformance[o.tableId].count++;
      if (o.status === "completed") {
        tablePerformance[o.tableId].total += o.total;
      }
    });

    const tablesRanked = Object.entries(tablePerformance)
      .map(([tableId, data]) => ({ tableId, ...data }))
      .sort((a, b) => b.total - a.total);

    return {
      ordersTodayCount: ordersToday.length,
      ordersThisMonthCount: ordersThisMonth.length,
      revenueToday,
      revenueThisMonth,
      totalRevenue,
      avgOrderValue,
      bestSellers,
      hourlyOrders,
      tablesRanked
    };
  }, [orders, items]);

  // Handle uploading photos to Base64 (lightweight, zero-auth required)
  const renderBase64File = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        callback(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // 1. Order Status transition triggers (Strict Rule Compliance)
  const handleUpdateOrderStatus = async (orderId: string, nextStatus: "accepted" | "completed") => {
    const timestamp = new Date().toISOString();
    try {
      // Must ONLY write the status and updatedAt keys to comply with rule schema guards
      const docRef = restaurantId
        ? doc(db, "restaurants", restaurantId, "orders", orderId)
        : doc(db, "orders", orderId);
      await updateDoc(docRef, {
        status: nextStatus,
        updatedAt: timestamp
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  // 2. Menu Item Creation / Modification
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !itemPrice || isSubmitItemLoading) return;

    setIsSubmitItemLoading(true);
    const priceNum = parseFloat(itemPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Please input a positive numeric price value.");
      setIsSubmitItemLoading(false);
      return;
    }

    // Normalize item name for document ID (e.g. "Mango" -> "mango", "Potato" -> "potato")
    const cleanId = itemName.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const itemId = editingItem 
      ? editingItem.id 
      : (cleanId || "dish_" + Math.random().toString(36).substring(2, 8));
    const timestamp = editingItem ? editingItem.createdAt : new Date().toISOString();

    const itemPayload = {
      name: formatItemName(itemName),
      price: priceNum,
      imageUrl: itemImageUrl || PRESET_IMAGES[0].value,
      createdAt: timestamp
    };

    try {
      const docRef = restaurantId
        ? doc(db, "restaurants", restaurantId, "items", itemId)
        : doc(db, "items", itemId);
      await setDoc(docRef, itemPayload);
      
      // Reset form fields
      setEditingItem(null);
      setItemName("");
      setItemPrice("");
      setItemImageUrl("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `items/${itemId}`);
    } finally {
      setIsSubmitItemLoading(false);
    }
  };

  const handleEditItemInit = (item: MenuItem) => {
    setEditingItem(item);
    setItemName(item.name);
    setItemPrice(item.price.toString());
    setItemImageUrl(item.imageUrl);
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const docRef = restaurantId
        ? doc(db, "restaurants", restaurantId, "items", itemId)
        : doc(db, "items", itemId);
      await deleteDoc(docRef);
      setDeletingItemId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `items/${itemId}`);
    }
  };

  // 3. Banner updates
  const handleSaveBannerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdateBannerLoading(true);

    const bannerPayload = {
      text: bannerText.trim() || "Enjoy our fresh table offerings",
      imageUrl: bannerImageUrl || PRESET_IMAGES[2].value,
      visible: bannerVisible,
      updatedAt: new Date().toISOString()
    };

    try {
      const docRef = restaurantId
        ? doc(db, "restaurants", restaurantId, "settings", "banner")
        : doc(db, "settings", "banner");
      await setDoc(docRef, bannerPayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "settings/banner");
    } finally {
      setIsUpdateBannerLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] font-sans text-neutral-400">
        <div className="flex flex-col items-center gap-4">
          <Clock className="h-8 w-8 animate-spin text-zinc-400" />
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">Verifying secure keys...</p>
        </div>
      </div>
    );
  }

  if (currentRole === "guest") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] px-6 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0d0d0d] p-8 space-y-6 shadow-xl relative overflow-hidden">
          {/* Subtle glowing elements */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-505/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-teal-505/10 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 shadow-md">
              <ShieldCheck className="h-6 w-6 text-indigo-400" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold tracking-tight uppercase text-zinc-100">Staff Secure Gate</h2>
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-zinc-500 font-medium">Digital operations cockpit</p>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed text-balance text-center">
              Restricted Area. Please enter the operations password to unlock control features.
            </p>
          </div>

          {authError && (
            <div className="rounded-xl border border-rose-950/40 bg-rose-950/20 p-3 text-xs text-rose-400 flex items-start gap-2.5 animate-pulse w-full">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Password-based Form */}
          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Operation Password</label>
              <input
                type="password"
                required
                placeholder="Enter password..."
                value={staffPasswordInput}
                onChange={(e) => setStaffPasswordInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-150 placeholder:text-zinc-700 focus:outline-none focus:border-zinc-550 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="w-full flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-750 text-white py-3.5 px-4 text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer active:scale-95 duration-150"
            >
              Verify & Unlock Console
            </button>
          </form>

          <div className="space-y-3 pt-2">
            <button
              onClick={onBackToMenu}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-zinc-850 bg-transparent text-zinc-500 hover:text-zinc-350 py-2.5 px-4 text-[10px] font-semibold tracking-wider transition-all cursor-pointer"
            >
              <ArrowLeft className="h-3 w-3" />
              <span>Return to digital menu</span>
            </button>
          </div>

          <div className="text-center pt-2 border-t border-zinc-900/40">
            <span className="font-mono text-[8px] uppercase tracking-widest text-zinc-650 font-semibold text-neutral-600">Secure Access Gate</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-20 text-zinc-100 flex flex-col" id="admin-dashboard-view">
      {/* Admin header */}
      <header className="sticky top-0 z-30 flex flex-col lg:flex-row lg:items-center justify-between border-b border-zinc-800/50 bg-[#0a0a0a]/90 px-8 py-5 gap-4 backdrop-blur-md">
        <div className="flex items-center justify-between lg:justify-start gap-4 w-full lg:w-auto">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white flex items-center justify-center rounded-lg shadow-md shrink-0">
                <span className="text-black font-black text-xl">{restaurantName ? restaurantName.charAt(0).toUpperCase() : "F"}</span>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight uppercase text-zinc-100">{restaurantName} Staff Panel</h1>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">{restaurantName || "Foodcourt"} admin console</p>
              </div>
            </div>
          </div>

          {/* Compact identity on mobile view */}
          {currentRole !== "guest" && (
            <div className="flex items-center gap-2 lg:hidden">
              <div className="w-7 h-7 rounded-full bg-zinc-850 flex items-center justify-center border border-zinc-750 text-[10px] font-bold text-zinc-200 uppercase font-mono">
                {currentRole === "superadmin" ? "A" : "S"}
              </div>
              <button
                onClick={handleSignOut}
                title="Sign Out Operator"
                className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-rose-400"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Console Nav Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-zinc-800/60 bg-zinc-950 p-1 w-full lg:w-auto max-w-full">
          <button
            onClick={() => setActiveTab("orders")}
            id="tab-orders"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
              activeTab === "orders" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            <span>Orders</span>
          </button>
          <button
            onClick={() => setActiveTab("items")}
            id="tab-items"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
              activeTab === "items" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Items</span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            id="tab-settings"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
              activeTab === "settings" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            id="tab-analytics"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
              activeTab === "analytics" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Analytics</span>
          </button>
        </div>

        {/* Action Button & Desktop Profile Info */}
        <div className="flex items-center gap-3 ml-auto lg:ml-0">
          <button
            onClick={() => {
              if (restaurantId) {
                sessionStorage.setItem(`is_staff_viewing_client_${restaurantId}`, "true");
              }
              onBackToMenu();
            }}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-900 bg-emerald-950/20 px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/35 transition cursor-pointer shrink-0"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Go to Users Page</span>
          </button>
          {currentRole !== "guest" && (
            <>
              <button
                onClick={handleSignOut}
                title="Sign Out Operator"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-rose-400 hover:border-rose-900/40 hover:bg-rose-950/20 transition-all cursor-pointer shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Admin work space with beautiful layout */}
      <main className="mx-auto w-full max-w-5xl px-8 pt-8 flex-grow">
        <AnimatePresence mode="wait">
          
          {/* ORDERS TAB */}
          {activeTab === "orders" && (
            <motion.div
              key="orders-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Stat Boxes */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4" id="stats-banner-list">
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Incoming Queue</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold text-white">{stats.pendingCount}</span>
                    <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Active Prep</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-zinc-200">{stats.acceptedCount}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Completed Orders</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-zinc-200">{stats.completedCount}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Today's Revenue</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">₹{stats.revenueToday.toFixed(2)}</p>
                </div>
              </div>

              {/* Status List Filtering */}
              <div className="flex border-b border-zinc-800/60 pb-3 gap-6">
                <button
                  onClick={() => setOrderFilter("pending")}
                  id="filter-pending"
                  className={`relative font-sans text-xs font-semibold uppercase tracking-wider pb-2 transition-all cursor-pointer ${
                    orderFilter === "pending" ? "text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Pending ({stats.pendingCount})
                  {orderFilter === "pending" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200" />}
                </button>
                <button
                  onClick={() => setOrderFilter("accepted")}
                  id="filter-accepted"
                  className={`relative font-sans text-xs font-semibold uppercase tracking-wider pb-2 transition-all cursor-pointer ${
                    orderFilter === "accepted" ? "text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Processing ({stats.acceptedCount})
                  {orderFilter === "accepted" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200" />}
                </button>
                <button
                  onClick={() => setOrderFilter("completed")}
                  id="filter-completed"
                  className={`relative font-sans text-xs font-semibold uppercase tracking-wider pb-2 transition-all cursor-pointer ${
                    orderFilter === "completed" ? "text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  Completed ({stats.completedCount})
                  {orderFilter === "completed" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200" />}
                </button>
              </div>

              {/* Orders Listing */}
              {sortedAndFilteredOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center" id="empty-queue-msg">
                  <p className="font-sans text-sm text-neutral-500">No {orderFilter} orders currently in the system.</p>
                </div>
              ) : (
                <div className="space-y-4" id="orders-list-block">
                  {sortedAndFilteredOrders.map((order) => {
                    return (
                      <div 
                        key={order.id} 
                        id={`order-entry-${order.id}`}
                        className="rounded-xl border border-neutral-900/45 bg-[#080808]/65 p-3.5 transition-all hover:bg-[#0c0c0c]/85 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs shadow-md"
                      >
                        {/* Compact Row Info */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 flex-grow min-w-0">
                          <span className="font-mono font-black text-neutral-200 text-[13px] tracking-tight">
                            #{order.id.slice(-5).toUpperCase()}
                          </span>
                          <span className="rounded bg-zinc-950 border border-zinc-800/60 px-2 py-0.5 font-mono text-[12px] font-black text-indigo-400">
                            {order.tableId}
                          </span>
                          <span className="font-sans text-[11px] text-zinc-550 font-medium">
                            {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-zinc-800 select-none hidden sm:inline">|</span>
                          
                          {/* Simple ultra-compact items list with combined name and quantity e.g. "POTATO x2" — 20% larger text font sizes */}
                          <div className="flex flex-wrap items-center gap-2">
                            {order.items.map((item) => (
                              <span 
                                key={item.id} 
                                className="inline-flex items-center bg-zinc-950 border border-zinc-900/90 px-3 py-1 rounded-md text-[12px] font-mono font-black text-zinc-100 shadow-sm" 
                                style={{ textTransform: 'uppercase' }}
                              >
                                {formatItemName(item.name)} x{item.quantity}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Price & Operation actions (for pending/processing/completed) */}
                        <div className="flex items-center justify-between sm:justify-start gap-4 shrink-0 border-t border-neutral-950/60 sm:border-0 pt-2 sm:pt-0">
                          <span className="font-mono font-black text-neutral-100 text-[13.5px] tracking-tight">₹{order.total.toFixed(0)}</span>
                          
                          <div className="flex items-center gap-2">
                            {order.status === "pending" && (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, "accepted")}
                                id={`accept-btn-${order.id}`}
                                className="rounded-xl border border-amber-500/25 bg-amber-500/10 hover:border-amber-500 hover:bg-amber-500 hover:text-black py-1.5 px-4 font-sans text-[11.5px] font-black uppercase tracking-wider text-amber-500 transition-all active:scale-95 cursor-pointer shadow-sm"
                              >
                                Accept
                              </button>
                            )}
                            {order.status === "accepted" && (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, "completed")}
                                id={`serve-btn-${order.id}`}
                                className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-100 hover:bg-zinc-200 text-black py-1.5 px-4 font-sans text-[11.5px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-sm"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span>Serve</span>
                              </button>
                            )}
                            {order.status === "completed" && (
                              <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-[11.5px] uppercase tracking-wider">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>Served</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* MENU ITEMS TAB */}
          {activeTab === "items" && (
            <motion.div
              key="items-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 gap-8 md:grid-cols-12"
            >
              {/* Left Column: Form Section */}
              <div className="space-y-6 md:col-span-5">
                <div className="rounded-2xl border border-neutral-900 bg-neutral-900/10 p-6 space-y-5">
                  <div className="flex items-center gap-2 border-b border-neutral-900 pb-3">
                    <ShoppingBag className="h-5 w-5 text-neutral-400" />
                    <h3 className="font-sans text-sm font-semibold uppercase tracking-wider">
                      {editingItem ? "Edit Item" : "Add Item"}
                    </h3>
                  </div>

                  <form onSubmit={handleSaveItem} className="space-y-4">
                    <div className="space-y-1">
                      <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Dish Name</label>
                      <input
                        type="text"
                        required
                        id="form-item-name"
                        placeholder="e.g. Kyoto Spicy Ramen"
                        value={itemName}
                        onChange={(e) => setItemName(e.target.value)}
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-sans text-sm text-neutral-100 placeholder-neutral-700 outline-none focus:border-neutral-505"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Price (₹ INR)</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-neutral-500">
                          <IndianRupee className="h-4 w-4" />
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          required
                          id="form-item-price"
                          placeholder="e.g. 14.50"
                          value={itemPrice}
                          onChange={(e) => setItemPrice(e.target.value)}
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 pl-9 pr-4 py-3 font-mono text-sm text-neutral-100 placeholder-neutral-700 outline-none focus:border-neutral-505"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Dish Portrait / Photo Image</label>
                      
                      {/* Photo preview zone if image exists */}
                      {itemImageUrl && (
                        <div className="relative aspect-video rounded-xl overflow-hidden border border-neutral-900 bg-neutral-950">
                          <img src={itemImageUrl} alt="Preview" className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setItemImageUrl("")}
                            className="absolute top-2 right-2 rounded-full bg-neutral-950/80 p-2 text-rose-400 hover:text-rose-200 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {/* File upload input element */}
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-xl border-neutral-800 bg-neutral-950/50 cursor-pointer hover:border-neutral-600 transition-all">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                            <Upload className="h-5 w-5 text-neutral-500 mb-1" />
                            <p className="text-xs text-neutral-400 font-sans">
                              Click to upload food photo or drag and drop
                            </p>
                            <span className="text-[10px] text-neutral-600 font-mono mt-0.5">JPG / PNG files</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            id="form-item-photo"
                            className="hidden"
                            onChange={(e) => renderBase64File(e, setItemImageUrl)}
                          />
                        </label>
                      </div>


                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={isSubmitItemLoading}
                        id="save-item-btn"
                        className="flex-grow rounded-xl border border-neutral-700 bg-neutral-100 py-3 font-sans text-xs font-bold uppercase tracking-wider text-neutral-950 transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50"
                      >
                        {isSubmitItemLoading ? "Saving..." : editingItem ? "Apply Changes" : "Create Item"}
                      </button>
                      {editingItem && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(null);
                            setItemName("");
                            setItemPrice("");
                            setItemImageUrl("");
                          }}
                          id="cancel-item-btn"
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-neutral-200 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>

              {/* Right Column: Dynamic Dishes List */}
              <div className="space-y-4 md:col-span-7">
                <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-900 pb-2">
                  Active Dishes Catalog ({items.length})
                </h3>

                {items.length === 0 ? (
                  <p className="font-sans text-xs text-neutral-700">No active dishes cataloged. Place mock or seeded nodes first.</p>
                ) : (
                  <div className="space-y-3" id="admin-items-catalog">
                    {items.map((item) => (
                      <div 
                        key={item.id} 
                        id={`admin-item-row-${item.id}`}
                        className="flex items-center justify-between rounded-xl border border-neutral-900 bg-neutral-900/10 p-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img 
                            src={item.imageUrl} 
                            alt={item.name} 
                            referrerPolicy="no-referrer"
                            className="h-12 w-16 rounded-lg object-cover bg-neutral-950 flex-shrink-0 border border-neutral-900" 
                          />
                          <div className="min-w-0">
                            <h4 className="font-sans text-sm font-medium text-neutral-200 truncate">{formatItemName(item.name)}</h4>
                            <p className="font-mono text-xs text-neutral-500">₹{item.price.toFixed(2)}</p>
                          </div>
                        </div>

                        {deletingItemId === item.id ? (
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              id={`confirm-delete-${item.id}`}
                              className="rounded-lg bg-rose-950/50 border border-rose-900/60 px-2.5 py-1.5 text-[10px] font-bold uppercase text-rose-400 hover:bg-rose-900/40 transition-all cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeletingItemId(null)}
                              className="rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                            <button
                              onClick={() => handleEditItemInit(item)}
                              id={`edit-item-${item.id}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-100 transition-colors"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeletingItemId(item.id)}
                              id={`delete-item-${item.id}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-600 hover:text-rose-450 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === "settings" && (
            <motion.div
              key="settings-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto"
            >
              <div className="rounded-2xl border border-neutral-900 bg-neutral-900/10 p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                  <h3 className="font-sans text-sm font-semibold uppercase tracking-wider">Top Banner Controls</h3>
                  
                  {/* Banner Show / Hide Toggle SWITCH */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                      {bannerVisible ? "Visible" : "Hidden"}
                    </span>
                    <button
                      type="button"
                      id="banner-toggle-switch"
                      onClick={() => setBannerVisible(!bannerVisible)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 outline-none ${
                        bannerVisible ? "bg-neutral-100" : "bg-neutral-800"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-neutral-950 shadow ring-0 transition duration-200 ${
                          bannerVisible ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSaveBannerSettings} className="space-y-5">
                  <div className="space-y-1">
                    <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Banner Notice Text Bio</label>
                    <textarea
                      id="form-banner-text"
                      rows={3}
                      value={bannerText}
                      onChange={(e) => setBannerText(e.target.value)}
                      placeholder="e.g. 🏮 Happy Hour Promo: 15% off all traditional Sake & Ramen selections before 6 PM!"
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-sans text-sm text-neutral-100 placeholder-neutral-700 outline-none focus:border-neutral-505 resize-none"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Banner Backdrop Image</label>
                    
                    {bannerImageUrl && (
                      <div className="relative h-28 rounded-xl overflow-hidden border border-neutral-900 bg-neutral-950">
                        <img src={bannerImageUrl} alt="Banner Preview" className="h-full w-full object-cover brightness-50" />
                        <button
                          type="button"
                          onClick={() => setBannerImageUrl("")}
                          className="absolute top-2 right-2 rounded-full bg-neutral-950/80 p-2 text-rose-400 hover:text-rose-200 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* File upload banner input */}
                    <div className="flex items-center justify-center w-full">
                      <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-xl border-neutral-800 bg-neutral-950/50 cursor-pointer hover:border-neutral-600 transition-all">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                          <Upload className="h-5 w-5 text-neutral-500 mb-1" />
                          <p className="text-xs text-neutral-400 font-sans">
                            Click to upload banner background image
                          </p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          id="form-banner-photo"
                          className="hidden"
                          onChange={(e) => renderBase64File(e, setBannerImageUrl)}
                        />
                      </label>
                    </div>


                  </div>

                  <button
                    type="submit"
                    disabled={isUpdateBannerLoading}
                    id="save-banner-btn"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-100 py-3 font-sans text-xs font-bold uppercase tracking-wider text-neutral-950 transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50"
                  >
                    {isUpdateBannerLoading ? "Updating..." : "Publish Banner Settings"}
                  </button>
                </form>
              </div>

              {/* Right Column: SECURITY AND DATA SWEEPS */}
              <div className="space-y-6">
                {/* STAFF PASSWORD CONTROLS */}
                <div className="rounded-2xl border border-neutral-900 bg-neutral-900/15 p-6 space-y-5">
                  <div className="border-b border-zinc-850 pb-4">
                    <h3 className="font-sans text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                      <ShieldCheck className="h-4.5 w-4.5 text-indigo-400" />
                      Staff Access Password
                    </h3>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mt-1">Configure secret key for menu staff devices</p>
                  </div>

                  <div className="rounded-xl bg-zinc-950 p-4 border border-zinc-900 flex justify-between items-center">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Current Staff Key</span>
                    <span className="rounded bg-indigo-950/40 border border-indigo-900/60 px-2.5 py-1 font-mono text-xs text-indigo-400 font-bold">
                      {currentStaffPassword}
                    </span>
                  </div>

                  <form onSubmit={handleSaveStaffPassword} className="space-y-4">
                    <div className="space-y-1 text-left">
                      <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">New Staff Password</label>
                      <input
                        type="text"
                        placeholder="e.g. 5678"
                        required
                        value={newStaffPassword}
                        onChange={(e) => setNewStaffPassword(e.target.value)}
                        className="w-full bg-zinc-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-neutral-150 placeholder:text-zinc-700 focus:outline-none focus:border-neutral-505"
                      />
                    </div>

                    {isUpdatingPassword && (
                      <p className="text-[10px] text-neutral-500 animate-pulse font-mono uppercase">Syncing to secure database...</p>
                    )}

                    <button
                      type="submit"
                      disabled={isUpdatingPassword || !newStaffPassword.trim()}
                      className="w-full rounded-xl bg-indigo-600 font-sans text-xs font-bold uppercase tracking-wider text-white py-3 transition-all hover:bg-indigo-750 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      Save Staff Password
                    </button>
                  </form>
                </div>

                {/* SYSTEM RESET TOOLS BLOCK */}
                <div className="rounded-2xl border border-rose-955 bg-rose-955/5 p-6 space-y-5">
                  <div className="border-b border-rose-900/40 pb-4">
                    <h3 className="font-sans text-sm font-semibold uppercase tracking-wider flex items-center gap-2 text-rose-405">
                      <AlertTriangle className="h-5 w-5 text-rose-500" />
                      Database resets & analytics cleanup
                    </h3>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mt-1">
                      Completely sweep stored items or orders to populate terms freshly
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Clean Items */}
                    <div className="rounded-xl border border-neutral-900 bg-neutral-950/40 p-4 space-y-3">
                      <div className="space-y-1">
                        <h4 className="font-sans text-xs font-bold text-neutral-200 uppercase tracking-wider">Reset Added Items</h4>
                        <p className="text-[10px] text-neutral-500 leading-normal">
                          Optionally delete all current items in the catalog to add yours freshly.
                        </p>
                      </div>

                      {wipeItemsFeedback && (
                        <div className={`p-2.5 rounded-lg text-[10px] font-sans ${
                          wipeItemsFeedback.type === "success" 
                            ? "bg-emerald-950/25 border border-emerald-900 text-emerald-400" 
                            : "bg-rose-950/25 border border-rose-900 text-rose-400"
                        }`}>
                          {wipeItemsFeedback.text}
                        </div>
                      )}

                      {!showConfirmWipeItems ? (
                        <button
                          onClick={() => {
                            setShowConfirmWipeItems(true);
                            setWipeItemsFeedback(null);
                          }}
                          className="w-full rounded-xl bg-rose-90s/40 border border-rose-900 text-rose-450 font-sans text-[10px] font-bold uppercase tracking-wider py-2 transition-all hover:bg-rose-900/30 active:scale-95 cursor-pointer"
                        >
                          Wipe All Items
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={handleWipeAllItems}
                            disabled={isWipingItems}
                            className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-sans text-[10px] font-bold uppercase tracking-wider py-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                          >
                            {isWipingItems ? "Deleting catalog..." : "⚠️ CONFIRM WIPE"}
                          </button>
                          <button
                            onClick={() => setShowConfirmWipeItems(false)}
                            disabled={isWipingItems}
                            className="w-full rounded-xl bg-transparent border border-zinc-800 hover:border-zinc-700 text-zinc-400 font-sans text-[10px] font-bold uppercase py-1 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Clean Orders */}
                    <div className="rounded-xl border border-neutral-900 bg-neutral-950/40 p-4 space-y-3">
                      <div className="space-y-1">
                        <h4 className="font-sans text-xs font-bold text-neutral-200 uppercase tracking-wider">Reset Orders</h4>
                        <p className="text-[10px] text-neutral-500 leading-normal">
                          Wipes previous customer order queues and historical dashboard metrics.
                        </p>
                      </div>

                      {wipeOrdersFeedback && (
                        <div className={`p-2.5 rounded-lg text-[10px] font-sans ${
                          wipeOrdersFeedback.type === "success" 
                            ? "bg-emerald-950/25 border border-emerald-900 text-emerald-400" 
                            : "bg-rose-950/25 border border-rose-900 text-rose-400"
                        }`}>
                          {wipeOrdersFeedback.text}
                        </div>
                      )}

                      {!showConfirmWipeOrders ? (
                        <button
                          onClick={() => {
                            setShowConfirmWipeOrders(true);
                            setWipeOrdersFeedback(null);
                          }}
                          className="w-full rounded-xl bg-rose-95s/40 border border-rose-900 text-rose-450 font-sans text-[10px] font-bold uppercase tracking-wider py-2 transition-all hover:bg-rose-900/30 active:scale-95 cursor-pointer"
                        >
                          Wipe Orders
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <button
                            onClick={handleWipeAllOrders}
                            disabled={isWipingOrders}
                            className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-sans text-[10px] font-bold uppercase tracking-wider py-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                          >
                            {isWipingOrders ? "Clearing..." : "⚠️ CONFIRM WIPE"}
                          </button>
                          <button
                            onClick={() => setShowConfirmWipeOrders(false)}
                            disabled={isWipingOrders}
                            className="w-full rounded-xl bg-transparent border border-zinc-800 hover:border-zinc-700 text-zinc-400 font-sans text-[10px] font-bold uppercase py-1 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ANALYTICS TAB */}
          {activeTab === "analytics" && (
            <motion.div
              key="analytics-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* KPI Grid */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4" id="analytics-kpi-grid">
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Today's Orders</span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="font-mono text-2xl font-bold text-white">{analytics.ordersTodayCount}</span>
                    <span className="font-mono text-xs text-zinc-400">Monthly: {analytics.ordersThisMonthCount}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-505">Monthly Revenue</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-indigo-400 font-extrabold">₹{analytics.revenueThisMonth.toFixed(2)}</p>
                </div>

                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-505">Revenue (Total)</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-400 font-extrabold">₹{analytics.totalRevenue.toFixed(2)}</p>
                </div>

                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-505">Average Ticket (AOV)</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-amber-500 font-extrabold">₹{analytics.avgOrderValue.toFixed(2)}</p>
                </div>
              </div>

              {/* Middle Section: Best Sellers and Table Performance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* BEST SELLERS */}
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/20 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold tracking-wider uppercase text-zinc-100 flex items-center gap-2">
                        <Award className="h-4 w-4 text-amber-500 animate-bounce" />
                        Best-Sellers Ranking
                      </h3>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Dishes by units sold</p>
                    </div>
                    <span className="rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-400">
                      Total items: {analytics.bestSellers.reduce((acc, i) => acc + i.qty, 0)}
                    </span>
                  </div>

                  {analytics.bestSellers.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      No completed orders yet to compute rankings.
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                      {analytics.bestSellers.map((item, idx) => {
                        const maxVal = analytics.bestSellers[0]?.qty || 1;
                        const percent = (item.qty / maxVal) * 100;
                        return (
                          <div key={item.name} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <div className="flex items-center gap-2 max-w-[70%] truncate">
                                <span className="font-mono text-zinc-500 w-4">{idx + 1}.</span>
                                <img src={item.imageUrl} alt={item.name} className="w-6 h-6 rounded object-cover" referrerPolicy="no-referrer" />
                                <span className="text-zinc-200 truncate">{formatItemName(item.name)}</span>
                              </div>
                              <div className="flex items-center gap-3 font-mono">
                                <span className="text-zinc-100 font-bold">{item.qty} sold</span>
                                <span className="text-emerald-500">₹{item.revenue.toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-900">
                              <div 
                                style={{ width: `${percent}%` }}
                                className="h-full bg-gradient-to-r from-teal-500 to-indigo-500 rounded-full"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* TABLE PERFORMANCE */}
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/20 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold tracking-wider uppercase text-zinc-100 flex items-center gap-2">
                        <Users className="h-4 w-4 text-indigo-500" />
                        Table Occupancy & Spending
                      </h3>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Active customer zones</p>
                    </div>
                  </div>

                  {analytics.tablesRanked.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs">
                      No customer transactions logged currently.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {analytics.tablesRanked.map((table, idx) => (
                        <div key={table.tableId} className="flex items-center justify-between rounded-xl border border-zinc-800/40 bg-zinc-950 p-3 transition-all hover:bg-zinc-900/40">
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-zinc-500 text-xs font-bold w-4">#{idx + 1}</span>
                            <div className="rounded-lg bg-zinc-900 border border-zinc-850 py-1 px-2.5 font-mono text-xs font-extrabold text-indigo-400">
                              {table.tableId}
                            </div>
                          </div>
                          <div className="flex items-center gap-5 text-xs font-medium">
                            <span className="font-mono text-zinc-400">{table.count} order{table.count > 1 ? "s" : ""}</span>
                            <span className="font-mono text-zinc-100 font-bold">Sum: <span className="text-emerald-400 font-extrabold">₹{table.total.toFixed(2)}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
