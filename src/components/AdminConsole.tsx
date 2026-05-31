/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { MenuItem, Order, BannerSettings, Category } from "../types";
import { 
  ArrowLeft, Bell, Settings, ClipboardList, 
  Plus, Edit2, Trash2, Eye, EyeOff, Upload, 
  IndianRupee, CheckCircle2, ShoppingBag, EyeIcon,
  BarChart3, TrendingUp, LogOut, Users, Award, Clock,
  ShieldCheck, AlertTriangle, Layers, ChevronLeft, ChevronRight, Sparkles, Search
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, handleFirestoreError, OperationType, auth } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signInAnonymously } from "firebase/auth";

interface AdminConsoleProps {
  items: MenuItem[];
  categories: Category[];
  categoryEnabled: boolean;
  orders: Order[];
  bannerSettings: BannerSettings | null;
  onBackToMenu: () => void;
  restaurantId?: string | null;
  restaurantName?: string;
  onBackToSuperAdmin?: () => void;
  onLogoutToLogin?: () => void;
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

const formatPrice = (price: number | string): string => {
  const p = Number(price);
  if (isNaN(p)) return "0";
  return p % 1 === 0 ? p.toString() : p.toFixed(2);
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
  categories = [],
  categoryEnabled = true,
  orders,
  bannerSettings,
  onBackToMenu,
  restaurantId = null,
  restaurantName = "Foodcourt",
  onBackToSuperAdmin,
  onLogoutToLogin
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
  const [isWipingCategories, setIsWipingCategories] = useState(false);
  const [showConfirmWipeItems, setShowConfirmWipeItems] = useState(false);
  const [showConfirmWipeOrders, setShowConfirmWipeOrders] = useState(false);
  const [showConfirmWipeCategories, setShowConfirmWipeCategories] = useState(false);
  const [wipeItemsFeedback, setWipeItemsFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [wipeOrdersFeedback, setWipeOrdersFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [wipeCategoriesFeedback, setWipeCategoriesFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isStaffActive, setIsStaffActive] = useState<boolean>(true);

  const handleWipeAllItems = async () => {
    setIsWipingItems(true);
    setWipeItemsFeedback(null);
    try {
      for (const item of items) {
        const itemDocRef = doc(db, "restaurants", restaurantId || "foodcourt", "items", item.id);
        await deleteDoc(itemDocRef);
      }
      setWipeItemsFeedback({
        type: "success",
        text: "Success: All items have been permanently deleted from the database."
      });
      setShowConfirmWipeItems(false);
      setTimeout(() => {
        setWipeItemsFeedback(null);
      }, 2000);
    } catch (err: any) {
      setWipeItemsFeedback({
        type: "error",
        text: "Error wiping items: " + (err.message || String(err))
      });
      setTimeout(() => {
        setWipeItemsFeedback(null);
      }, 2000);
    } finally {
      setIsWipingItems(false);
    }
  };

  const handleWipeAllOrders = async () => {
    setIsWipingOrders(true);
    setWipeOrdersFeedback(null);
    try {
      for (const order of orders) {
        const orderDocRef = doc(db, "restaurants", restaurantId || "foodcourt", "orders", order.id);
        await deleteDoc(orderDocRef);
      }
      setWipeOrdersFeedback({
        type: "success",
        text: "Success: All orders and analytical records have been permanently cleared."
      });
      setShowConfirmWipeOrders(false);
      setTimeout(() => {
        setWipeOrdersFeedback(null);
      }, 2000);
    } catch (err: any) {
      setWipeOrdersFeedback({
        type: "error",
        text: "Error wiping logs: " + (err.message || String(err))
      });
      setTimeout(() => {
        setWipeOrdersFeedback(null);
      }, 2000);
    } finally {
      setIsWipingOrders(false);
    }
  };

  const handleWipeAllCategories = async () => {
    setIsWipingCategories(true);
    setWipeCategoriesFeedback(null);
    try {
      for (const cat of categories) {
        const catDocRef = doc(db, "restaurants", restaurantId || "foodcourt", "categories", cat.id);
        await deleteDoc(catDocRef);
      }
      setWipeCategoriesFeedback({
        type: "success",
        text: "Success: All categories have been permanently deleted from the database."
      });
      setShowConfirmWipeCategories(false);
      setTimeout(() => {
        setWipeCategoriesFeedback(null);
      }, 2000);
    } catch (err: any) {
      setWipeCategoriesFeedback({
        type: "error",
        text: "Error wiping categories: " + (err.message || String(err))
      });
      setTimeout(() => {
        setWipeCategoriesFeedback(null);
      }, 2000);
    } finally {
      setIsWipingCategories(false);
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
        const d = snap.data();
        setCurrentStaffPassword(d.password || "1234");
        setIsStaffActive(d.isStaffActive === true);
      }
    });
    return unsub;
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const setOnlineState = async (online: boolean) => {
      try {
        await setDoc(doc(db, "restaurants", restaurantId), {
          isStaffActive: online
        }, { merge: true });
      } catch (err) {
        console.error("Failed to update staff active state:", err);
      }
    };
    setOnlineState(true);

    const handleBeforeUnload = () => {
      setOnlineState(false);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("unload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("unload", handleBeforeUnload);
      setOnlineState(false);
    };
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
      if (restaurantId) {
        // Toggle staff offline upon logging out
        await setDoc(doc(db, "restaurants", restaurantId), {
          isStaffActive: false
        }, { merge: true });
      }

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
      if (onLogoutToLogin) {
        onLogoutToLogin();
      } else {
        window.location.href = "/";
      }
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
      if (input === superPass) {
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
      if (input === currentSuperAdminPassword) {
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
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [isSubmitItemLoading, setIsSubmitItemLoading] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [dishSearchQuery, setDishSearchQuery] = useState("");

  // Category management & creation states
  const [itemsSubTab, setItemsSubTab] = useState<"dishes" | "categories">("categories");
  const [categoryName, setCategoryName] = useState("");
  const [categoryImageUrl, setCategoryImageUrl] = useState("");
  const [isSubmitCategoryLoading, setIsSubmitCategoryLoading] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  // Advanced Category Seeding State
  const [activeSeedingCategory, setActiveSeedingCategory] = useState<Category | null>(null);
  const [stagedDishes, setStagedDishes] = useState<Array<{ id: string; name: string; price: string; imageUrl: string }>>([]);
  const [isSeedingConfirmLoading, setIsSeedingConfirmLoading] = useState(false);
  const [activeStagedIdx, setActiveStagedIdx] = useState(0);

  // Reset utilities states
  const [isResetItemsLoading, setIsResetItemsLoading] = useState(false);
  const [isResetOrdersLoading, setIsResetOrdersLoading] = useState(false);
  const [isResetCategoriesLoading, setIsResetCategoriesLoading] = useState(false);
  const [showResetItemsConfirm, setShowResetItemsConfirm] = useState(false);
  const [showResetOrdersConfirm, setShowResetOrdersConfirm] = useState(false);
  const [showResetCategoriesConfirm, setShowResetCategoriesConfirm] = useState(false);

  // Banner form state
  const [bannerText, setBannerText] = useState(bannerSettings?.text || "");
  const [bannerImageUrl, setBannerImageUrl] = useState(bannerSettings?.imageUrl || "");
  const [bannerVisible, setBannerVisible] = useState(bannerSettings?.visible ?? false);
  const [bannerBioVisible, setBannerBioVisible] = useState(bannerSettings?.bioVisible !== false);
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

  // Sort items: newest added first (createdAt descending), filtered by searchable query
  const sortedItems = useMemo(() => {
    let filtered = [...items];
    if (dishSearchQuery.trim()) {
      const q = dishSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(item => {
        const matchesName = item.name.toLowerCase().includes(q);
        const catName = categories.find(c => c.id === item.categoryId)?.name || "";
        const matchesCat = catName.toLowerCase().includes(q);
        return matchesName || matchesCat;
      });
    }
    return filtered.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [items, dishSearchQuery, categories]);

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

    const itemPayload: any = {
      name: formatItemName(itemName),
      price: priceNum,
      imageUrl: itemImageUrl || PRESET_IMAGES[0].value,
      createdAt: timestamp
    };
    if (itemCategoryId) {
      itemPayload.categoryId = itemCategoryId;
    }

    try {
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "items", itemId);
      await setDoc(docRef, itemPayload);
      
      // Reset form fields
      setEditingItem(null);
      setItemName("");
      setItemPrice("");
      setItemImageUrl("");
      setItemCategoryId("");
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
    setItemCategoryId(item.categoryId || "");
    setItemsSubTab("dishes"); // Switch to dishes subTab so they can see the edit form
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "items", itemId);
      await deleteDoc(docRef);
      setDeletingItemId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `items/${itemId}`);
    }
  };

  // Category Creation / Modification
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim() || isSubmitCategoryLoading) return;

    setIsSubmitCategoryLoading(true);

    // Normalize category name for document ID
    const cleanId = categoryName.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const categoryId = cleanId || "cat_" + Math.random().toString(36).substring(2, 8);
    const timestamp = new Date().toISOString();

    const categoryPayload = {
      name: categoryName.trim(),
      imageUrl: categoryImageUrl || PRESET_IMAGES[1].value, // Fallback default backdrop preset
      createdAt: timestamp
    };

    try {
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "categories", categoryId);
      await setDoc(docRef, categoryPayload);
      
      setCategoryName("");
      setCategoryImageUrl("");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `categories/${categoryId}`);
    } finally {
      setIsSubmitCategoryLoading(false);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    try {
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "categories", catId);
      await deleteDoc(docRef);
      setDeletingCategoryId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `categories/${catId}`);
    }
  };

  // Multiple image category-dishes seeding handlers
  const handleStartSeeding = (cat: Category) => {
    setActiveSeedingCategory(cat);
    setStagedDishes([]);
    setActiveStagedIdx(0);
  };

  const handleBulkImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: any) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setStagedDishes((prev) => [
            ...prev,
            {
              id: "staged_" + Math.random().toString(36).substring(2, 8),
              name: "",
              price: "",
              imageUrl: reader.result
            }
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    // Reset to first newly uploaded if starting fresh
    setActiveStagedIdx(0);
    
    // Clear input so users can reselect or reupload
    e.target.value = "";
  };

  const updateStagedDish = (id: string, field: "name" | "price", value: string) => {
    setStagedDishes((prev) =>
      prev.map((dish) => (dish.id === id ? { ...dish, [field]: value } : dish))
    );
  };

  const removeStagedDish = (id: string) => {
    setStagedDishes((prev) => {
      const filtered = prev.filter((dish) => dish.id !== id);
      if (activeStagedIdx >= filtered.length) {
        setActiveStagedIdx(Math.max(0, filtered.length - 1));
      }
      return filtered;
    });
  };

  const handleConfirmSeeding = async () => {
    if (stagedDishes.length === 0) return;

    // Validate inputs
    const incomplete = stagedDishes.some(
      (dish) => !dish.name.trim() || !dish.price.toString().trim()
    );
    if (incomplete) {
      alert("Please provide a Name and positive Price for all uploaded dishes before saving.");
      return;
    }

    setIsSeedingConfirmLoading(true);
    try {
      for (const dish of stagedDishes) {
        const priceNum = parseFloat(dish.price);
        if (isNaN(priceNum) || priceNum <= 0) {
          throw new Error(`Invalid price input for "${dish.name}"`);
        }

        const cleanId = dish.name.trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        const itemId = cleanId || "dish_" + Math.random().toString(36).substring(2, 8);
        const timestamp = new Date().toISOString();

        const itemPayload: any = {
          name: formatItemName(dish.name),
          price: priceNum,
          imageUrl: dish.imageUrl,
          createdAt: timestamp
        };

        if (activeSeedingCategory && activeSeedingCategory.id !== "others_fallback") {
          itemPayload.categoryId = activeSeedingCategory.id;
        }

        const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "items", itemId);
        await setDoc(docRef, itemPayload);
      }

      alert(`Successfully added ${stagedDishes.length} dishes to "${activeSeedingCategory?.name}"!`);
      setStagedDishes([]);
      setActiveSeedingCategory(null);
    } catch (err: any) {
      console.error("Failed to seed items:", err);
      alert("Error seeding dishes: " + (err.message || String(err)));
    } finally {
      setIsSeedingConfirmLoading(false);
    }
  };

  // Safe database resets
  const handleResetAddedItems = async () => {
    setIsResetItemsLoading(true);
    try {
      const resId = restaurantId || "foodcourt";
      const itemsCol = collection(db, "restaurants", resId, "items");
      const snapshot = await getDocs(itemsCol);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      setShowResetItemsConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `items_reset`);
    } finally {
      setIsResetItemsLoading(false);
    }
  };

  const handleResetOrders = async () => {
    setIsResetOrdersLoading(true);
    try {
      const resId = restaurantId || "foodcourt";
      const ordersCol = collection(db, "restaurants", resId, "orders");
      const snapshot = await getDocs(ordersCol);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      setShowResetOrdersConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `orders_reset`);
    } finally {
      setIsResetOrdersLoading(false);
    }
  };

  const handleResetCategories = async () => {
    setIsResetCategoriesLoading(true);
    try {
      const resId = restaurantId || "foodcourt";
      const categoriesCol = collection(db, "restaurants", resId, "categories");
      const snapshot = await getDocs(categoriesCol);
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      setShowResetCategoriesConfirm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `categories_reset`);
    } finally {
      setIsResetCategoriesLoading(false);
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
      bioVisible: bannerBioVisible,
      updatedAt: new Date().toISOString()
    };

    try {
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "settings", "banner");
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
      <header className="relative sticky top-0 z-30 flex flex-col lg:flex-row lg:items-center justify-between border-b border-zinc-800/50 bg-[#0a0a0a]/90 px-8 py-5 gap-4 backdrop-blur-md">
        <div className="flex items-center justify-between lg:justify-start gap-4 w-full lg:w-auto">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white flex items-center justify-center rounded-lg shadow-md shrink-0">
                <span className="text-black font-black text-xl">{restaurantName ? restaurantName.charAt(0).toUpperCase() : "F"}</span>
              </div>
              <div className="flex flex-col">
                <h1 className="text-sm font-bold tracking-tight uppercase text-zinc-100">{restaurantName}</h1>
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-500">Admin Console</p>
              </div>
            </div>
          </div>
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
        <div className="absolute top-6 right-8 lg:static flex items-center gap-3 z-40">
          <button
            onClick={() => {
              if (restaurantId) {
                sessionStorage.setItem(`is_staff_viewing_client_${restaurantId}`, "true");
              }
              onBackToMenu();
            }}
            title="Go to Users Page"
            className="flex h-8 w-8 sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-emerald-950 bg-emerald-950/20 px-0 sm:px-3 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/35 transition cursor-pointer shrink-0 shadow-md"
          >
            <Eye className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Go to Users Page</span>
          </button>
          <button
            onClick={handleSignOut}
            title="Sign Out"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-rose-400 hover:border-rose-900/40 hover:bg-rose-950/20 transition-all cursor-pointer shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
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
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">PENDING</span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-2xl font-bold text-white">{stats.pendingCount}</span>
                    <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">PROCESSING</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-zinc-200">{stats.acceptedCount}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">COMPLETED</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-zinc-200">{stats.completedCount}</p>
                </div>
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">Today's Revenue</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-400">₹{formatPrice(stats.revenueToday)}</p>
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
                  PENDING ({stats.pendingCount})
                  {orderFilter === "pending" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200" />}
                </button>
                <button
                  onClick={() => setOrderFilter("accepted")}
                  id="filter-accepted"
                  className={`relative font-sans text-xs font-semibold uppercase tracking-wider pb-2 transition-all cursor-pointer ${
                    orderFilter === "accepted" ? "text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  PROCESSING ({stats.acceptedCount})
                  {orderFilter === "accepted" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-200" />}
                </button>
                <button
                  onClick={() => setOrderFilter("completed")}
                  id="filter-completed"
                  className={`relative font-sans text-xs font-semibold uppercase tracking-wider pb-2 transition-all cursor-pointer ${
                    orderFilter === "completed" ? "text-white font-bold" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  COMPLETED ({stats.completedCount})
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
                        className="rounded-lg border border-neutral-900/35 bg-[#080808]/70 p-2 sm:p-3 transition-all hover:bg-[#0c0c0c]/85 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 text-xs shadow-sm"
                      >
                        {/* Main Info Blocks with items showing at the absolute top on mobile */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1.5 flex-grow min-w-0">
                          {/* Dish Lists showing first on mobile screens ("Banana x1" is top-most) */}
                          <div className="flex flex-wrap items-center gap-1.5 order-first sm:order-last mb-1 sm:mb-0">
                            {order.items.map((item) => (
                              <span 
                                key={item.id} 
                                className="inline-flex items-center bg-zinc-950 border border-zinc-900 px-2 py-0.5 rounded text-[11.5px] sm:text-[13px] font-mono font-black text-zinc-100 shadow-sm" 
                                style={{ textTransform: 'uppercase' }}
                              >
                                {formatItemName(item.name)} x{item.quantity}
                              </span>
                            ))}
                          </div>

                          {/* Order metadata and identifiers */}
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 sm:order-first">
                            <span className="font-mono font-black text-neutral-300 text-[13px] sm:text-[14px] tracking-tight">
                              #{order.id.slice(-5).toUpperCase()}
                            </span>
                            <span className="rounded bg-zinc-950 border border-zinc-850 px-1.5 py-0.5 font-mono text-[12px] sm:text-[13px] font-black text-indigo-400">
                              {order.tableId}
                            </span>
                            <span className="font-sans text-[11px] sm:text-[12.5px] text-zinc-550 font-medium">
                              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-zinc-800 select-none hidden sm:inline">|</span>
                          </div>
                        </div>

                        {/* Price & Operation actions (for pending/processing/completed) */}
                        <div className="flex items-center justify-between sm:justify-start gap-3 shrink-0 border-t border-neutral-950/35 sm:border-0 pt-1.5 sm:pt-0">
                          <span className="font-mono font-black text-neutral-100 text-[13.5px] sm:text-[15px] tracking-tight">₹{formatPrice(order.total)}</span>
                          
                          <div className="flex items-center gap-1.5">
                            {order.status === "pending" && (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, "accepted")}
                                id={`accept-btn-${order.id}`}
                                className="rounded-lg border border-amber-500/25 bg-amber-500/10 hover:border-amber-500 hover:bg-amber-500 hover:text-black py-1 px-3.5 font-sans text-[11px] sm:text-[12.5px] font-black uppercase tracking-wider text-amber-500 transition-all active:scale-95 cursor-pointer shadow-sm animate-none"
                              >
                                Accept
                              </button>
                            )}
                            {order.status === "accepted" && (
                              <button
                                onClick={() => handleUpdateOrderStatus(order.id, "completed")}
                                id={`serve-btn-${order.id}`}
                                className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-100 hover:bg-zinc-200 text-black py-1 px-3.5 font-sans text-[11px] sm:text-[12.5px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-sm"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                <span>Serve</span>
                              </button>
                            )}
                            {order.status === "completed" && (
                              <div className="flex items-center gap-1 text-emerald-500 font-bold text-[11px] sm:text-[12.5px] uppercase tracking-wider">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
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
              className="space-y-6"
            >
              {/* Items Sub-Tab Headers */}
              <div className="flex border-b border-neutral-900 pb-px gap-6">
                <button
                  type="button"
                  onClick={() => setItemsSubTab("dishes")}
                  className={`border-b-2 px-1 pb-3 text-xs uppercase tracking-wider font-sans font-bold transition-all cursor-pointer ${
                    itemsSubTab === "dishes"
                      ? "border-neutral-100 text-neutral-100 font-extrabold"
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Manage Dishes ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setItemsSubTab("categories")}
                  className={`border-b-2 px-1 pb-3 text-xs uppercase tracking-wider font-sans font-bold transition-all cursor-pointer ${
                    itemsSubTab === "categories"
                      ? "border-neutral-100 text-neutral-100 font-extrabold"
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  Manage Categories ({categories.length})
                </button>
              </div>

              {itemsSubTab === "dishes" ? (
                <div className="space-y-4">
                  <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-900 pb-2">
                    Active Dishes Catalog ({items.length})
                  </h3>

                  {items.length > 0 && (
                    <div className="relative w-full mb-2 animate-none">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-neutral-500">
                        <Search className="h-3.5 w-3.5" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search active dishes by name or category..."
                        value={dishSearchQuery}
                        onChange={(e) => setDishSearchQuery(e.target.value)}
                        className="w-full bg-neutral-950/40 border border-neutral-800/80 focus:border-neutral-700 px-4 py-2 pl-9 rounded-xl text-xs focus:outline-none placeholder:text-neutral-505 text-neutral-200 transition-all outline-none"
                      />
                      {dishSearchQuery && (
                        <button 
                          type="button"
                          onClick={() => setDishSearchQuery("")}
                          className="absolute inset-y-0 right-3 flex items-center text-neutral-500 hover:text-neutral-300 text-xs font-mono font-bold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}

                  {items.length === 0 ? (
                    <p className="font-sans text-xs text-neutral-700">No active dishes cataloged. Please go to the categories sub-tab, tap a category, and upload photos to seed dishes!</p>
                  ) : sortedItems.length === 0 ? (
                    <p className="font-sans text-xs text-neutral-500 py-4">No active dishes match your search query.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="admin-items-catalog">
                      {sortedItems.map((item) => (
                        <div 
                          key={item.id} 
                          id={`admin-item-row-${item.id}`}
                          className="flex items-center justify-between rounded-xl border border-neutral-900 bg-neutral-900/10 p-3 animate-none hover:bg-neutral-900/20 transition-all shadow-sm"
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
                              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <span className="font-mono text-xs text-neutral-500 font-bold">₹{formatPrice(item.price)}</span>
                                {item.categoryId ? (
                                  <span className="rounded bg-neutral-950 border border-neutral-850 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-indigo-400">
                                    {categories.find(c => c.id === item.categoryId)?.name || "Category Loaded"}
                                  </span>
                                ) : (
                                  <span className="rounded bg-neutral-950 border border-neutral-805 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-zinc-500">
                                    Others
                                  </span>
                                )}
                              </div>
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
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-850 bg-neutral-950 text-neutral-450 hover:text-neutral-100 transition-colors cursor-pointer"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingItemId(item.id)}
                                id={`delete-item-${item.id}`}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-850 bg-neutral-950 text-neutral-600 hover:text-rose-450 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : activeSeedingCategory ? (
                <div className="space-y-6" id="category-seeding-panel">
                  {/* Seeder header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-900 pb-4 gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setActiveSeedingCategory(null);
                          setStagedDishes([]);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-neutral-100 transition-colors cursor-pointer"
                        title="Back to Categories"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <div>
                        <h2 className="text-base font-bold text-neutral-100 uppercase tracking-wide">
                          Upload Dishes to {activeSeedingCategory.name}
                        </h2>
                        <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          Add multiple images to start listing their details
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Multi-image drag and click upload box */}
                  <div className="flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed rounded-xl border-zinc-800 bg-zinc-900/10 cursor-pointer hover:border-zinc-600 transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                        <Upload className="h-7 w-7 text-indigo-400 mb-2 animate-bounce" />
                        <p className="text-xs text-neutral-200 font-sans font-bold">
                          Click to select / upload multiple photos at once
                        </p>
                        <span className="text-[10px] text-neutral-500 font-mono mt-1">
                          You can upload multiple files (JPG, PNG) directly
                        </span>
                      </div>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        onChange={handleBulkImageUpload}
                      />
                    </label>
                  </div>

                  {/* Staged Dishes Form List */}
                  {stagedDishes.length > 0 ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                          <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-neutral-400">
                            Configure Staged Dishes ({stagedDishes.length})
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setStagedDishes([]);
                            setActiveStagedIdx(0);
                          }}
                          className="text-rose-450 hover:text-rose-350 text-[10px] font-mono uppercase font-bold cursor-pointer bg-transparent border-none outline-none"
                        >
                          Clear All
                        </button>
                      </div>

                      {/* Horizontal Thumbnail Strip for Quick Navigation */}
                      <div className="flex gap-2 pb-2 overflow-x-auto select-none no-scrollbar">
                        {stagedDishes.map((dish, idx) => {
                          const isCurrent = idx === activeStagedIdx;
                          const isConfigured = dish.name.trim() !== "" && dish.price.toString().trim() !== "";
                          return (
                            <div
                              key={dish.id}
                              onClick={() => setActiveStagedIdx(idx)}
                              className={`relative h-12 w-16 rounded-lg overflow-hidden cursor-pointer shrink-0 transition-all duration-200 ${
                                isCurrent
                                  ? "ring-2 ring-indigo-500 border-transparent scale-105"
                                  : "border border-zinc-900 opacity-60 hover:opacity-100"
                              }`}
                            >
                              <img
                                src={dish.imageUrl}
                                alt={`Draft ${idx + 1}`}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                              {/* Serial badge */}
                              <span className="absolute bottom-1 left-1 bg-black/80 text-[8px] font-mono font-bold text-zinc-300 px-1 py-px rounded leading-none">
                                {idx + 1}
                              </span>
                              {/* Status dot */}
                              {isConfigured ? (
                                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-emerald-500 shadow border border-black"></span>
                              ) : (
                                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500 shadow border border-black"></span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Selected Draft Card */}
                      {stagedDishes[activeStagedIdx] && (() => {
                        const dish = stagedDishes[activeStagedIdx];
                        return (
                          <div
                            key={`slider-card-${activeStagedIdx}`}
                            className="bg-neutral-950/40 border border-neutral-900 p-4 rounded-xl flex flex-col md:flex-row gap-5"
                          >
                            {/* Image side */}
                            <div className="w-full md:w-1/3 aspect-video md:aspect-square rounded-lg overflow-hidden border border-neutral-900 bg-neutral-950 relative shrink-0">
                              <img
                                src={dish.imageUrl}
                                alt="Draft"
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute bottom-2 left-2 bg-black/75 px-2 py-0.5 rounded text-[8px] font-mono uppercase text-zinc-400 border border-zinc-850">
                                Draft {activeStagedIdx + 1} of {stagedDishes.length}
                              </div>
                            </div>

                            {/* Inputs side */}
                            <div className="flex-grow flex flex-col justify-between space-y-4">
                              <div className="space-y-3.5">
                                <div className="space-y-1 text-left">
                                  <label className="font-mono text-[9px] uppercase tracking-wider text-neutral-500 font-semibold flex justify-between">
                                    <span>Dish Name</span>
                                    {dish.name.trim() === "" && <span className="text-amber-500 text-[8px]">Required</span>}
                                  </label>
                                  <input
                                    type="text"
                                    required
                                    autoFocus
                                    key={`staged-name-input-${activeStagedIdx}`}
                                    placeholder="e.g. Kyoto Spicy Ramen, Salmon Sushi"
                                    value={dish.name}
                                    onChange={(e) => updateStagedDish(dish.id, "name", e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        document.getElementById("staged-price-input")?.focus();
                                      }
                                    }}
                                    className="w-full rounded-lg border border-neutral-850 bg-neutral-950 px-3 py-2 font-sans text-xs text-neutral-100 placeholder-neutral-800 outline-none focus:border-indigo-500 transition-colors"
                                  />
                                </div>

                                <div className="space-y-1 text-left">
                                  <label className="font-mono text-[9px] uppercase tracking-wider text-neutral-500 font-semibold flex justify-between">
                                    <span>Price (₹ INR)</span>
                                    {dish.price.toString().trim() === "" && <span className="text-amber-500 text-[8px]">Required</span>}
                                  </label>
                                  <div className="relative">
                                    <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-neutral-600">
                                      <IndianRupee className="h-3 w-3" />
                                    </div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      required
                                      id="staged-price-input"
                                      placeholder="e.g. 150"
                                      value={dish.price}
                                      onChange={(e) => updateStagedDish(dish.id, "price", e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          if (activeStagedIdx < stagedDishes.length - 1) {
                                            setActiveStagedIdx((prev) => prev + 1);
                                          } else {
                                            document.getElementById("bulk-confirm-save-btn")?.focus();
                                          }
                                        }
                                      }}
                                      className="w-full rounded-lg border border-neutral-850 bg-neutral-950 pl-7 pr-3 py-2 font-mono text-xs text-neutral-100 placeholder-neutral-800 outline-none focus:border-indigo-500 transition-colors"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Navigation and item actions */}
                              <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-900/60">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={activeStagedIdx === 0}
                                    onClick={() => setActiveStagedIdx((prev) => prev - 1)}
                                    className="flex h-7 px-2 items-center justify-center rounded bg-neutral-950 border border-neutral-900 text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer text-[10px] font-mono uppercase font-bold"
                                  >
                                    <ChevronLeft className="h-3 w-3 mr-0.5" />
                                    <span>Prev</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={activeStagedIdx === stagedDishes.length - 1}
                                    onClick={() => setActiveStagedIdx((prev) => prev + 1)}
                                    className="flex h-7 px-2 items-center justify-center rounded bg-neutral-950 border border-neutral-900 text-neutral-400 hover:text-white disabled:opacity-30 cursor-pointer text-[10px] font-mono uppercase font-bold"
                                  >
                                    <span>Next</span>
                                    <ChevronRight className="h-3 w-3 ml-0.5" />
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => removeStagedDish(dish.id)}
                                  className="flex h-7 px-2 items-center justify-center rounded border border-neutral-900 bg-neutral-950/40 text-neutral-600 hover:text-rose-450 hover:bg-rose-950/10 hover:border-rose-900/40 transition-colors cursor-pointer text-[10px] font-mono uppercase font-bold"
                                  title="Remove item"
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  <span>Remove Draft</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Instruction Help Note */}
                      <div className="flex items-center gap-2 justify-center py-2 bg-indigo-950/10 border border-indigo-950/25 rounded-lg px-3">
                        <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span className="font-sans text-[10px] text-indigo-305 font-medium leading-normal">
                          Fast Mode: Press <span className="font-mono bg-indigo-950 border border-indigo-850 px-1 py-0.2 rounded font-bold">Enter</span> to cycle from Name to Price, and to auto-slide to the next draft!
                        </span>
                      </div>

                      {/* Bulk confirms action button */}
                      <button
                        id="bulk-confirm-save-btn"
                        onClick={handleConfirmSeeding}
                        disabled={isSeedingConfirmLoading}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-100 py-3.5 font-sans text-xs font-bold uppercase tracking-wider text-neutral-950 transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50 cursor-pointer shadow-md"
                      >
                        {isSeedingConfirmLoading ? (
                          <span className="flex items-center gap-2">
                            <Clock className="h-4 w-4 animate-spin" />
                            Seeding Saved Dishes...
                          </span>
                        ) : (
                          <span>Confirm & Save {stagedDishes.length} Dishes</span>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/50 p-8 text-center text-zinc-500 font-sans text-xs">
                      No images selected yet. Please upload one or more food pictures above to fill out details.
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
                  {/* Left Column: Form Section */}
                  <div className="space-y-6 md:col-span-12 lg:col-span-5">
                    <div className="rounded-2xl border border-neutral-900 bg-neutral-900/10 p-6 space-y-5">
                      <div className="flex items-center gap-2 border-b border-neutral-900 pb-3">
                        <Layers className="h-5 w-5 text-neutral-400" />
                        <h3 className="font-sans text-sm font-semibold uppercase tracking-wider">
                          Add Category
                        </h3>
                      </div>

                      <form onSubmit={handleSaveCategory} className="space-y-4">
                        <div className="space-y-1">
                          <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Category Name</label>
                          <input
                            type="text"
                            required
                            id="form-category-name"
                            placeholder="e.g. Tea, Chinese, Beverages, Desserts"
                            value={categoryName}
                            onChange={(e) => setCategoryName(e.target.value)}
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-sans text-sm text-neutral-100 placeholder-neutral-700 outline-none focus:border-neutral-505"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Category Portrait / Landscape Image</label>
                          
                          {/* Photo preview zone if image exists */}
                          {categoryImageUrl && (
                            <div className="relative aspect-video rounded-xl overflow-hidden border border-neutral-900 bg-neutral-950">
                              <img src={categoryImageUrl} alt="Preview" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setCategoryImageUrl("")}
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
                                  Click to upload category photo or drag and drop
                                </p>
                                <span className="text-[10px] text-neutral-600 font-mono mt-0.5">JPG / PNG files</span>
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                id="form-category-photo"
                                className="hidden"
                                onChange={(e) => renderBase64File(e, setCategoryImageUrl)}
                              />
                            </label>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitCategoryLoading}
                          id="save-category-btn"
                          className="w-full rounded-xl border border-neutral-700 bg-neutral-100 py-3 font-sans text-xs font-bold uppercase tracking-wider text-neutral-950 transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50 cursor-pointer animate-none"
                        >
                          {isSubmitCategoryLoading ? "Saving..." : "Create Category"}
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right Column: Dynamic Categories list */}
                  <div className="space-y-4 md:col-span-12 lg:col-span-7">
                    <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-900 pb-2">
                      Active Categories ({categories.length})
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="admin-categories-catalog">
                      {categories.map((cat) => (
                        <div 
                          key={cat.id} 
                          id={`admin-category-row-${cat.id}`}
                          onClick={() => handleStartSeeding(cat)}
                          className="flex items-center justify-between rounded-xl border border-neutral-900 bg-neutral-900/10 p-3 hover:bg-neutral-900/25 transition-all cursor-pointer group text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img 
                              src={cat.imageUrl} 
                              alt={cat.name} 
                              referrerPolicy="no-referrer"
                              className="h-10 w-14 rounded-lg object-cover bg-neutral-950 flex-shrink-0 border border-neutral-900 group-hover:border-neutral-700 transition-colors" 
                            />
                            <div className="min-w-0 text-left">
                              <h4 className="font-sans text-sm font-medium text-neutral-200 truncate">{formatItemName(cat.name)}</h4>
                              <p className="font-mono text-[9px] text-zinc-500 uppercase tracking-wider">Tap to add dishes</p>
                            </div>
                          </div>

                          {deletingCategoryId === cat.id ? (
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => handleDeleteCategory(cat.id)}
                                className="rounded-lg bg-rose-950/50 border border-rose-900/60 px-2.5 py-1.5 text-[10px] font-bold uppercase text-rose-400 hover:bg-rose-900/40 transition-all cursor-pointer"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeletingCategoryId(null)}
                                className="rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setDeletingCategoryId(cat.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-600 hover:text-rose-450 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Special virtual "Others" category card for fallback / uncategorized items */}
                      <div 
                        key="others_fallback" 
                        id="admin-category-row-others_fallback"
                        onClick={() => handleStartSeeding({
                          id: "others_fallback",
                          name: "Others",
                          imageUrl: "https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&q=80&w=400",
                          createdAt: ""
                        })}
                        className="flex items-center justify-between rounded-xl border border-dashed border-zinc-805 bg-zinc-900/5 p-3 hover:bg-zinc-900/10 hover:border-zinc-700 transition-all cursor-pointer group text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-14 rounded-lg bg-neutral-950 flex items-center justify-center border border-zinc-900 group-hover:border-zinc-750 shrink-0">
                            <span className="text-zinc-500 font-bold font-mono text-[10px]">OTH</span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-sans text-sm font-bold text-zinc-350 truncate">Others</h4>
                            <p className="font-mono text-[9px] text-zinc-650 uppercase tracking-wide">Uncategorized items</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-[9px] uppercase font-mono text-zinc-500 font-bold bg-zinc-950 border border-zinc-850 px-1.5 py-0.5 rounded shrink-0 ml-4">
                          <span>Virtual</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Light-weight elegant modal for single item editing */}
              {editingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" id="single-item-edit-modal">
                  <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-[#0d0d0d] p-6 space-y-5 shadow-2xl relative text-left">
                    <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                      <div className="flex items-center gap-2">
                        <Edit2 className="h-4 w-4 text-neutral-400" />
                        <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-neutral-200">
                          Edit Dish Details
                        </h3>
                      </div>
                      <button 
                        type="button"
                        onClick={() => {
                          setEditingItem(null);
                          setItemName("");
                          setItemPrice("");
                          setItemImageUrl("");
                          setItemCategoryId("");
                        }} 
                        className="text-zinc-500 hover:text-zinc-200 text-xs font-bold uppercase cursor-pointer"
                      >
                        Close
                      </button>
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

                      {/* Category Selector (Optional) */}
                      <div className="space-y-1">
                        <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Category (Optional)</label>
                        <select
                          id="form-item-category-id"
                          value={itemCategoryId}
                          onChange={(e) => setItemCategoryId(e.target.value)}
                          className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-sans text-sm text-neutral-150 outline-none focus:border-neutral-505 cursor-pointer appearance-none"
                          style={{ backgroundImage: "url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23737373%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3e%3cpolyline points=%276 9 12 15 18 9%27/%3e%3c/svg%3e')", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', backgroundSize: '16px' }}
                        >
                          <option value="" className="text-neutral-500">-- None / Select Category --</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id} className="text-neutral-105 bg-neutral-950">
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Dish Photo</label>
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

                        <div className="flex items-center justify-center w-full">
                          <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-xl border-neutral-800 bg-neutral-950/50 cursor-pointer hover:border-neutral-600 transition-all">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                              <Upload className="h-5 w-5 text-neutral-500 mb-1" />
                              <p className="text-xs text-neutral-400 font-sans">
                                Click to upload food photo or drag-and-drop
                              </p>
                            </div>
                            <input
                              type="file"
                              accept="image/*"
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
                          className="flex-grow rounded-xl border border-neutral-700 bg-neutral-100 py-3 font-sans text-xs font-bold uppercase tracking-wider text-neutral-950 transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {isSubmitItemLoading ? "Saving..." : "Apply Changes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(null);
                            setItemName("");
                            setItemPrice("");
                            setItemImageUrl("");
                            setItemCategoryId("");
                          }}
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-neutral-400 hover:text-neutral-200 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
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
                <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b border-neutral-900 pb-4 gap-4">
                  <h3 className="font-sans text-sm font-semibold uppercase tracking-wider">Top Banner Controls</h3>
                  
                  <div className="flex flex-col items-start gap-3.5 select-none w-full sm:w-auto">
                    {/* Banner Image Toggle SWITCH */}
                    <div className="flex items-center gap-2 justify-between w-full sm:w-36">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">
                        Banner: {bannerVisible ? "On" : "Off"}
                      </span>
                      <button
                        type="button"
                        id="banner-image-toggle-switch"
                        onClick={() => setBannerVisible(!bannerVisible)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 outline-none ${
                          bannerVisible ? "bg-neutral-100" : "bg-neutral-800"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-neutral-950 shadow ring-0 transition duration-200 ${
                            bannerVisible ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Banner Bio Toggle SWITCH */}
                    <div className="flex items-center gap-2 justify-between w-full sm:w-36">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">
                        Bio: {bannerBioVisible ? "On" : "Off"}
                      </span>
                      <button
                        type="button"
                        id="banner-bio-toggle-switch"
                        onClick={() => setBannerBioVisible(!bannerBioVisible)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 outline-none ${
                          bannerBioVisible ? "bg-neutral-100" : "bg-neutral-800"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-neutral-950 shadow ring-0 transition duration-200 ${
                            bannerBioVisible ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Category Block Toggle SWITCH */}
                    <div className="flex items-center gap-2 justify-between w-full sm:w-36">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">
                        Categories: {categoryEnabled ? "On" : "Off"}
                      </span>
                      <button
                        type="button"
                        id="category-toggle-switch"
                        onClick={async () => {
                          try {
                             const docRef = doc(db, "restaurants", restaurantId || "foodcourt");
                             await updateDoc(docRef, { categoryEnabled: !categoryEnabled });
                          } catch (err) {
                             handleFirestoreError(err, OperationType.UPDATE, `restaurants/${restaurantId}`);
                          }
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 outline-none ${
                          categoryEnabled ? "bg-neutral-100" : "bg-neutral-800"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-neutral-950 shadow ring-0 transition duration-200 ${
                            categoryEnabled ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
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

                {/* DATABASE TOOLS BLOCK */}
                <div className="rounded-2xl border border-rose-955 bg-rose-955/5 p-6 space-y-5" id="database-tools-settings-panel">
                  <div className="border-b border-rose-900/40 pb-4">
                    <h3 className="font-sans text-sm font-semibold uppercase tracking-wider flex items-center gap-2 text-rose-405">
                      <AlertTriangle className="h-5 w-5 text-rose-500" />
                      Database Tools
                    </h3>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mt-1">
                      Completely purge cached collections to restart empty or populate custom offerings
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Clean Items */}
                    <div className="rounded-xl border border-neutral-900 bg-neutral-950/40 p-4 space-y-3 flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="font-sans text-xs font-bold text-neutral-200 uppercase tracking-wider">RESET ADDED ITEMS</h4>
                        <p className="text-[10px] text-neutral-500 leading-normal">
                          Delete all currently loaded food and beverage items in the menu catalog.
                        </p>
                      </div>

                      <div className="space-y-2 pt-2">
                        {wipeItemsFeedback && (
                          <div className={`p-2 rounded-lg text-[10px] font-sans ${
                            wipeItemsFeedback.type === "success" 
                              ? "bg-emerald-950/25 border border-emerald-950 text-emerald-400" 
                              : "bg-rose-950/25 border border-rose-950 text-rose-450"
                          }`}>
                            {wipeItemsFeedback.text}
                          </div>
                        )}

                        {!showConfirmWipeItems ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowConfirmWipeItems(true);
                              setWipeItemsFeedback(null);
                            }}
                            className="w-full rounded-xl bg-rose-950/20 border border-rose-900 hover:bg-rose-900/10 text-rose-450 font-sans text-[10px] font-bold uppercase tracking-wider py-2.5 transition-all text-center cursor-pointer"
                          >
                            Reset Added Items
                          </button>
                        ) : (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={handleWipeAllItems}
                              disabled={isWipingItems}
                              className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-sans text-[10px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40 cursor-pointer"
                            >
                              {isWipingItems ? "Deleting..." : "Confirm Delete"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowConfirmWipeItems(false)}
                              disabled={isWipingItems}
                              className="w-full rounded-xl bg-transparent border border-zinc-800 hover:border-zinc-700 text-zinc-400 font-sans text-[10px] font-bold uppercase py-1 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Clean Categories */}
                    <div className="rounded-xl border border-neutral-900 bg-neutral-950/40 p-4 space-y-3 flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="font-sans text-xs font-bold text-neutral-200 uppercase tracking-wider">RESET CATEGORYS</h4>
                        <p className="text-[10px] text-neutral-500 leading-normal">
                          Delete all menu categories. Uncategorized items will fall back to virtual section.
                        </p>
                      </div>

                      <div className="space-y-2 pt-2">
                        {wipeCategoriesFeedback && (
                          <div className={`p-2 rounded-lg text-[10px] font-sans ${
                            wipeCategoriesFeedback.type === "success" 
                              ? "bg-emerald-950/25 border border-emerald-950 text-emerald-400" 
                              : "bg-rose-950/25 border border-rose-950 text-rose-450"
                          }`}>
                            {wipeCategoriesFeedback.text}
                          </div>
                        )}

                        {!showConfirmWipeCategories ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowConfirmWipeCategories(true);
                              setWipeCategoriesFeedback(null);
                            }}
                            className="w-full rounded-xl bg-rose-950/20 border border-rose-900 hover:bg-rose-900/10 text-rose-450 font-sans text-[10px] font-bold uppercase tracking-wider py-2.5 transition-all text-center cursor-pointer"
                          >
                            Reset Categorys
                          </button>
                        ) : (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={handleWipeAllCategories}
                              disabled={isWipingCategories}
                              className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-sans text-[10px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40 cursor-pointer"
                            >
                              {isWipingCategories ? "Deleting..." : "Confirm Delete"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowConfirmWipeCategories(false)}
                              disabled={isWipingCategories}
                              className="w-full rounded-xl bg-transparent border border-zinc-800 hover:border-zinc-700 text-zinc-400 font-sans text-[10px] font-bold uppercase py-1 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Clean Orders */}
                    <div className="rounded-xl border border-neutral-900 bg-neutral-950/40 p-4 space-y-3 flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="font-sans text-xs font-bold text-neutral-200 uppercase tracking-wider">RESET ORDERS</h4>
                        <p className="text-[10px] text-neutral-500 leading-normal">
                          Clear and wipe previous table orders queue and daily analytical charts completely.
                        </p>
                      </div>

                      <div className="space-y-2 pt-2">
                        {wipeOrdersFeedback && (
                          <div className={`p-2 rounded-lg text-[10px] font-sans ${
                            wipeOrdersFeedback.type === "success" 
                              ? "bg-emerald-950/25 border border-emerald-950 text-emerald-400" 
                              : "bg-rose-950/25 border border-rose-950 text-rose-450"
                          }`}>
                            {wipeOrdersFeedback.text}
                          </div>
                        )}

                        {!showConfirmWipeOrders ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowConfirmWipeOrders(true);
                              setWipeOrdersFeedback(null);
                            }}
                            className="w-full rounded-xl bg-rose-950/20 border border-rose-900 hover:bg-rose-900/10 text-rose-450 font-sans text-[10px] font-bold uppercase tracking-wider py-2.5 transition-all text-center cursor-pointer"
                          >
                            Reset Orders
                          </button>
                        ) : (
                          <div className="space-y-1.5">
                            <button
                              type="button"
                              onClick={handleWipeAllOrders}
                              disabled={isWipingOrders}
                              className="w-full rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-sans text-[10px] font-bold uppercase tracking-wider py-2 transition-all disabled:opacity-40 cursor-pointer"
                            >
                              {isWipingOrders ? "Clearing..." : "Confirm Purge"}
                            </button>
                            <button
                              type="button"
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
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-550">Monthly Revenue</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-indigo-400 font-extrabold">₹{formatPrice(analytics.revenueThisMonth)}</p>
                </div>

                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-550">Revenue (Total)</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-400 font-extrabold">₹{formatPrice(analytics.totalRevenue)}</p>
                </div>

                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-550">Average Ticket (AOV)</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-amber-500 font-extrabold">₹{formatPrice(analytics.avgOrderValue)}</p>
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
                                <span className="text-emerald-500">₹{formatPrice(item.revenue)}</span>
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
                            <span className="font-mono text-zinc-100 font-bold">Sum: <span className="text-emerald-400 font-extrabold">₹{formatPrice(table.total)}</span></span>
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
