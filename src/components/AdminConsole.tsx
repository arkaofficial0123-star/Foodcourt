/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { MenuItem, Order, BannerSettings, Category } from "../types";
import { 
  ArrowLeft, Bell, Settings, ClipboardList, 
  Plus, Edit2, Trash2, Eye, EyeOff, Upload, 
  IndianRupee, CheckCircle2, ShoppingBag, EyeIcon, Search,
  BarChart3, TrendingUp, LogOut, Users, Award, Clock,
  ShieldCheck, AlertTriangle, PlusCircle, ChevronLeft, ImagePlus, X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, handleFirestoreError, OperationType, auth } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signInAnonymously } from "firebase/auth";

interface AdminConsoleProps {
  items: MenuItem[];
  categories: Category[];
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

const formatMonthName = (monthStr: string): string => {
  try {
    const [year, month] = monthStr.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } catch (e) {
    return monthStr;
  }
};

const getCurrentRolloverTimes = () => {
  const now = new Date();
  
  // Daily rollover boundary: Start of today (00:00:00 local time)
  const dailyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // Monthly rollover boundary: Start of this month (1st day at 00:00:00 local time)
  const monthlyStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  // Yearly rollover boundary: Start of this year (Jan 1st at 00:00:00 local time)
  const yearlyStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);

  return { dailyStart, monthlyStart, yearlyStart };
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
  const [isWipingCategories, setIsWipingCategories] = useState(false);
  const [isWipingOrders, setIsWipingOrders] = useState(false);
  const [showConfirmWipeItems, setShowConfirmWipeItems] = useState(false);
  const [showConfirmWipeCategories, setShowConfirmWipeCategories] = useState(false);
  const [showConfirmWipeOrders, setShowConfirmWipeOrders] = useState(false);
  const [wipeItemsFeedback, setWipeItemsFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [wipeCategoriesFeedback, setWipeCategoriesFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [wipeOrdersFeedback, setWipeOrdersFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
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
      const completedOrders = orders.filter(o => o.status === "completed");
      for (const order of completedOrders) {
        const orderDocRef = doc(db, "restaurants", restaurantId || "foodcourt", "orders", order.id);
        await deleteDoc(orderDocRef);
      }
      setWipeOrdersFeedback({
        type: "success",
        text: "Success: All completed orders have been permanently cleared."
      });
      setShowConfirmWipeOrders(false);
      setTimeout(() => {
        setWipeOrdersFeedback(null);
      }, 2000);
    } catch (err: any) {
      setWipeOrdersFeedback({
        type: "error",
        text: "Error wiping completed orders: " + (err.message || String(err))
      });
      setTimeout(() => {
        setWipeOrdersFeedback(null);
      }, 2000);
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
    if (activeTab !== "items") {
      setSelectedManageCategory(null);
      setBatchDishes([]);
    }
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
    if (!staffPasswordInput) return;
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

      const input = staffPasswordInput;
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
      const input = staffPasswordInput;
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
    if (!newStaffPassword) return;
    setIsUpdatingPassword(true);
    try {
      if (restaurantId) {
        await setDoc(doc(db, "restaurants", restaurantId), {
          password: newStaffPassword
        }, { merge: true });
      } else {
        // Global fallback bootstrap is fixed to "1234"
        console.log("Global default bypass.");
      }
      alert("Staff password successfully changed to: " + newStaffPassword);
      setCurrentStaffPassword(newStaffPassword);
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
    if (!newSuperAdminPassword) return;
    setIsUpdatingSuperAdminPassword(true);
    try {
      await setDoc(doc(db, "settings", "security"), {
        superAdminPassword: newSuperAdminPassword
      }, { merge: true });
      alert("Super Admin password successfully changed to: " + newSuperAdminPassword);
      setCurrentSuperAdminPassword(newSuperAdminPassword);
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

  // Dish inline editing states
  const [editingDishId, setEditingDishId] = useState<string | null>(null);
  const [editingDishName, setEditingDishName] = useState("");
  const [editingDishPrice, setEditingDishPrice] = useState("");
  const [adminItemsSearchQuery, setAdminItemsSearchQuery] = useState("");
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

  // Categories and batch upload states
  const [selectedManageCategory, setSelectedManageCategory] = useState<Category | { id: string; name: string } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryImageUrl, setNewCategoryImageUrl] = useState("");
  const [isSubmitCategoryLoading, setIsSubmitCategoryLoading] = useState(false);
  const [batchDishes, setBatchDishes] = useState<{ id: string; name: string; price: string; imageUrl: string }[]>([]);
  const [categoriesEnabled, setCategoriesEnabled] = useState(bannerSettings?.categoriesEnabled ?? true);

  // Banner form state
  const [bannerText, setBannerText] = useState(bannerSettings?.text || "");
  const [bannerImageUrl, setBannerImageUrl] = useState(bannerSettings?.imageUrl || "");
  const [bannerVisible, setBannerVisible] = useState(bannerSettings?.visible ?? false);
  const [bannerBioVisible, setBannerBioVisible] = useState(bannerSettings?.bioVisible !== false);
  const [isUpdateBannerLoading, setIsUpdateBannerLoading] = useState(false);

  // Statistics trackers
  const stats = useMemo(() => {
    const { dailyStart } = getCurrentRolloverTimes();
    const pendingCount = orders.filter(o => o.status === "pending").length;
    const acceptedCount = orders.filter(o => o.status === "accepted").length;
    
    const completedToday = orders.filter(o => {
      if (o.status !== "completed") return false;
      try {
        return new Date(o.createdAt).getTime() >= dailyStart.getTime();
      } catch (err) {
        return false;
      }
    });

    const revenueToday = completedToday.reduce((sum, o) => sum + o.total, 0);

    return {
      pendingCount,
      acceptedCount,
      completedCount: orders.filter(o => o.status === "completed").length,
      revenueToday
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
    const { dailyStart, monthlyStart, yearlyStart } = getCurrentRolloverTimes();
    const completedOrders = orders.filter(o => o.status === "completed");

    // Revenue aggregations matching 12:00 PM rollover segments
    const revenueToday = completedOrders
      .filter(o => {
        try {
          return new Date(o.createdAt).getTime() >= dailyStart.getTime();
        } catch (e) {
          return false;
        }
      })
      .reduce((sum, o) => sum + o.total, 0);

    const revenueThisMonth = completedOrders
      .filter(o => {
        try {
          return new Date(o.createdAt).getTime() >= monthlyStart.getTime();
        } catch (e) {
          return false;
        }
      })
      .reduce((sum, o) => sum + o.total, 0);

    const totalRevenue = completedOrders
      .filter(o => {
        try {
          return new Date(o.createdAt).getTime() >= yearlyStart.getTime();
        } catch (e) {
          return false;
        }
      })
      .reduce((sum, o) => sum + o.total, 0);

    // Best-selling dishes aggregation (Calculated monthly based on current month's completed orders)
    const dishSales: { [name: string]: { qty: number; revenue: number; imageUrl: string } } = {};
    completedOrders
      .filter(order => {
        try {
          return new Date(order.createdAt).getTime() >= monthlyStart.getTime();
        } catch (e) {
          return false;
        }
      })
      .forEach(order => {
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

    // Monthly history aggregation for January to December of current year
    const currentYear = new Date().getFullYear();
    const monthlyHistory = Array.from({ length: 12 }, (_, i) => {
      const monthStart = new Date(currentYear, i, 1, 0, 0, 0, 0);
      const monthEnd = new Date(currentYear, i + 1, 1, 0, 0, 0, 0);

      const monthTotal = completedOrders.filter(o => {
        try {
          const t = new Date(o.createdAt).getTime();
          return t >= monthStart.getTime() && t < monthEnd.getTime();
        } catch (e) {
          return false;
        }
      }).reduce((sum, o) => sum + o.total, 0);

      const monthLabel = new Date(currentYear, i, 1).toLocaleDateString("en-US", { month: "long" });

      return {
        month: monthLabel,
        total: monthTotal
      };
    });

    const historyYearlyTotal = monthlyHistory.reduce((sum, h) => sum + h.total, 0);

    return {
      revenueToday,
      revenueThisMonth,
      totalRevenue,
      bestSellers,
      hourlyOrders,
      tablesRanked,
      monthlyHistory,
      currentYear,
      historyYearlyTotal
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
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "items", itemId);
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
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "items", itemId);
      await deleteDoc(docRef);
      setDeletingItemId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `items/${itemId}`);
    }
  };

  const handleUpdateDishDetails = async (itemId: string) => {
    const priceNum = parseFloat(editingDishPrice);
    if (!editingDishName.trim() || isNaN(priceNum) || priceNum <= 0) {
      alert("Please ensure you enter a valid name and positive numeric price.");
      return;
    }
    try {
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "items", itemId);
      await setDoc(docRef, {
        name: formatItemName(editingDishName),
        price: priceNum
      }, { merge: true });
      setEditingDishId(null);
    } catch (err) {
      console.error("Failed to update dish details:", err);
      alert("Failed to save dish details updates.");
    }
  };

  // Sync banner and settings from props
  useEffect(() => {
    if (bannerSettings) {
      setBannerText(bannerSettings.text);
      setBannerImageUrl(bannerSettings.imageUrl);
      setBannerVisible(bannerSettings.visible);
      setBannerBioVisible(bannerSettings.bioVisible !== false);
      setCategoriesEnabled(bannerSettings.categoriesEnabled ?? true);
    }
  }, [bannerSettings]);

  // 3. Banner updates
  const handleSaveBannerSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdateBannerLoading(true);

    const bannerPayload = {
      text: bannerText.trim() || "Enjoy our fresh table offerings",
      imageUrl: bannerImageUrl || PRESET_IMAGES[2].value,
      visible: bannerVisible,
      bioVisible: bannerBioVisible,
      categoriesEnabled: categoriesEnabled,
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

  // Add a new Category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrim = newCategoryName.trim();
    if (!nameTrim || isSubmitCategoryLoading) return;
    setIsSubmitCategoryLoading(true);

    const categoryId = "cat_" + Math.random().toString(36).substring(2, 10);
    try {
      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "categories", categoryId);
      await setDoc(docRef, {
        id: categoryId,
        name: nameTrim,
        imageUrl: newCategoryImageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80", // Default nice food preset image if none uploaded
        createdAt: new Date().toISOString()
      });
      setNewCategoryName("");
      setNewCategoryImageUrl("");
    } catch (err) {
      console.error("Failed to add category:", err);
    } finally {
      setIsSubmitCategoryLoading(false);
    }
  };

  // Remove all Categories in one block
  const handleWipeAllCategories = async () => {
    setIsWipingCategories(true);
    setWipeCategoriesFeedback(null);
    try {
      for (const cat of categories) {
        await deleteDoc(doc(db, "restaurants", restaurantId || "foodcourt", "categories", cat.id));
      }
      for (const item of items) {
        if (item.category) {
          await setDoc(doc(db, "restaurants", restaurantId || "foodcourt", "items", item.id), { category: "" }, { merge: true });
        }
      }
      setSelectedManageCategory(null);
      setWipeCategoriesFeedback({
        type: "success",
        text: "Success: All categories have been permanently cleared. All items are moved to \"Others\"."
      });
      setShowConfirmWipeCategories(false);
      setTimeout(() => {
        setWipeCategoriesFeedback(null);
      }, 3000);
    } catch (err: any) {
      console.error("Failed to remove all categories:", err);
      setWipeCategoriesFeedback({
        type: "error",
        text: "Error wiping categories: " + (err.message || String(err))
      });
      setTimeout(() => {
        setWipeCategoriesFeedback(null);
      }, 3000);
    } finally {
      setIsWipingCategories(false);
    }
  };

  // Delete an existing Category and update affected items to Others
  const handleDeleteCategory = async (catId: string, catName: string) => {
    try {
      await deleteDoc(doc(db, "restaurants", restaurantId || "foodcourt", "categories", catId));
      
      const affectedItems = items.filter((i) => i.category === catName);
      for (const item of affectedItems) {
        await setDoc(
          doc(db, "restaurants", restaurantId || "foodcourt", "items", item.id), 
          { category: "" }, 
          { merge: true }
        );
      }
      if (selectedManageCategory && selectedManageCategory.id === catId) {
        setSelectedManageCategory(null);
      }
    } catch (err) {
      console.error("Failed to delete category:", err);
    }
  };

  // Convert and add multiple image selections into batch dishes
  const handleMultipleImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const newDish = {
            id: "batch_" + Math.random().toString(36).substring(2, 12),
            name: "",
            price: "",
            imageUrl: reader.result
          };
          setBatchDishes((prev) => [...prev, newDish]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUpdateBatchDish = (id: string, field: "name" | "price", value: string) => {
    setBatchDishes((prev) =>
      prev.map((dish) => (dish.id === id ? { ...dish, [field]: value } : dish))
    );
  };

  const handleRemoveBatchDish = (id: string) => {
    setBatchDishes((prev) => prev.filter((dish) => dish.id !== id));
  };

  const handleConfirmBatchDishes = async () => {
    if (batchDishes.length === 0 || !selectedManageCategory) return;

    const invalid = batchDishes.some(
      (d) => !d.name.trim() || isNaN(parseFloat(d.price)) || parseFloat(d.price) <= 0
    );
    if (invalid) {
      alert("Please ensure all dishes have a valid name and price greater than 0.");
      return;
    }

    setIsSubmitItemLoading(true);
    try {
      for (const dish of batchDishes) {
        const cleanId = dish.name.trim().toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || "dish_" + Math.random().toString(36).substring(2, 8);

        const itemId = cleanId + "_" + Math.random().toString(36).substring(2, 6);
        const timestamp = new Date().toISOString();

        const itemPayload = {
          name: formatItemName(dish.name),
          price: parseFloat(dish.price),
          imageUrl: dish.imageUrl,
          category: selectedManageCategory.name,
          createdAt: timestamp
        };

        const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "items", itemId);
        await setDoc(docRef, itemPayload);
      }
      setBatchDishes([]);
      alert("Dishes successfully saved under category " + selectedManageCategory.name + "!");
    } catch (err) {
      console.error("Failed to save batch dishes:", err);
      alert("Error saving dishes, please try again.");
    } finally {
      setIsSubmitItemLoading(false);
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
                          <span className="font-mono font-black text-neutral-100 text-[13.5px] sm:text-[15px] tracking-tight">₹{order.total.toFixed(0)}</span>
                          
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
              {/* If no category is selected, show general Category Management */}
              {!selectedManageCategory ? (
                <>
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-12 font-sans">
                  {/* Left column: Add/Create Category form */}
                  <div className="space-y-6 md:col-span-5">
                    <div className="rounded-2xl border border-neutral-900 bg-neutral-900/10 p-6 space-y-5">
                      <div className="flex items-center gap-2 border-b border-neutral-900 pb-3">
                        <PlusCircle className="h-5 w-5 text-neutral-400" />
                        <h3 className="font-sans text-sm font-semibold uppercase tracking-wider">
                          Create New Category
                        </h3>
                      </div>
                      <form onSubmit={handleAddCategory} className="space-y-4">
                        <div className="space-y-1">
                          <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                            Category Name
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Tea, Chinese, Dessert"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 font-sans text-sm text-neutral-100 placeholder-neutral-700 outline-none focus:border-neutral-500"
                          />
                        </div>

                        {/* Category Image Picker */}
                        <div className="space-y-2">
                          <label className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 block">
                            Category Display Photo
                          </label>
                          
                          {newCategoryImageUrl && (
                            <div className="relative aspect-video rounded-xl overflow-hidden border border-neutral-900 bg-neutral-950">
                              <img src={newCategoryImageUrl} alt="Preview" className="h-full w-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setNewCategoryImageUrl("")}
                                className="absolute top-2 right-2 rounded-full bg-neutral-950/80 p-2 text-rose-400 hover:text-rose-200 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}

                          <div className="flex items-center justify-center w-full">
                            <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed rounded-xl border-neutral-800 bg-neutral-950/50 cursor-pointer hover:border-neutral-600 transition-all">
                              <div className="flex flex-col items-center justify-center pt-3 pb-4 text-center px-4">
                                <Upload className="h-5 w-5 text-neutral-500 mb-1" />
                                <p className="text-xs text-neutral-400 font-sans">
                                  Click to upload category icon photo
                                </p>
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => renderBase64File(e, setNewCategoryImageUrl)}
                              />
                            </label>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmitCategoryLoading}
                          className="w-full rounded-xl border border-neutral-700 bg-neutral-100 py-3 font-sans text-xs font-bold uppercase tracking-wider text-neutral-950 transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50"
                        >
                          {isSubmitCategoryLoading ? "Creating..." : "Add Category"}
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* Right column: Categories List / Grid */}
                  <div className="space-y-4 md:col-span-7 font-sans">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-neutral-900 pb-3 gap-3">
                      <div>
                        <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-neutral-400">
                          Categories Directory
                        </h3>
                        <p className="font-sans text-[11px] text-neutral-500 leading-relaxed mt-0.5">
                          Tap on any category below to manage its dishes, or search items globally.
                        </p>
                      </div>

                      {/* Search Bar for searching any item from any category */}
                      <div className="relative w-full sm:w-56 shrink-0">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-500" />
                        <input
                          type="text"
                          placeholder="Search any item..."
                          value={adminItemsSearchQuery}
                          onChange={(e) => setAdminItemsSearchQuery(e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl py-2 pl-9 pr-4 text-xs font-sans text-neutral-200 outline-none focus:border-neutral-700 placeholder-neutral-600"
                        />
                      </div>
                    </div>

                    {adminItemsSearchQuery ? (
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-500">
                            Search Results ({items.filter(item => item.name.toLowerCase().includes(adminItemsSearchQuery.toLowerCase()) || (item.category && item.category.toLowerCase().includes(adminItemsSearchQuery.toLowerCase()))).length})
                          </span>
                          <button
                            onClick={() => setAdminItemsSearchQuery("")}
                            className="text-[10px] uppercase font-bold text-neutral-450 hover:text-white"
                          >
                            Clear
                          </button>
                        </div>

                        {(() => {
                          const filteredItems = items.filter(item => 
                            item.name.toLowerCase().includes(adminItemsSearchQuery.toLowerCase()) ||
                            (item.category && item.category.toLowerCase().includes(adminItemsSearchQuery.toLowerCase()))
                          );

                          if (filteredItems.length === 0) {
                            return (
                              <div className="text-center py-8 border border-dashed border-neutral-900 rounded-xl bg-neutral-950/20">
                                <p className="text-xs text-neutral-500">No items found matching "{adminItemsSearchQuery}"</p>
                              </div>
                            );
                          }

                          return (
                            <div className="grid grid-cols-1 gap-4 max-h-[500px] overflow-y-auto pr-1 no-scrollbar">
                              {filteredItems.map((item) => (
                                <div
                                  key={item.id}
                                  id={`admin-all-item-row-${item.id}`}
                                  className="flex items-center justify-between rounded-xl border border-neutral-900 bg-neutral-950/30 p-3 min-h-[70px] hover:border-neutral-800 transition-all font-sans"
                                >
                                  {editingDishId === item.id ? (
                                    <div className="flex-grow flex items-center gap-3 min-w-0 pr-4">
                                      <img
                                        src={item.imageUrl}
                                        alt={item.name}
                                        className="h-12 w-16 rounded-lg object-cover bg-neutral-950 flex-shrink-0 border border-neutral-900"
                                      />
                                      <div className="flex-grow grid grid-cols-2 gap-2">
                                        <div className="space-y-0.5">
                                          <span className="text-[8px] font-mono uppercase text-neutral-500">Dish Name</span>
                                          <input
                                            type="text"
                                            value={editingDishName}
                                            onChange={(e) => setEditingDishName(e.target.value)}
                                            placeholder="Dish Name"
                                            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-700"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <span className="text-[8px] font-mono uppercase text-neutral-500">Price (₹)</span>
                                          <input
                                            type="number"
                                            value={editingDishPrice}
                                            onChange={(e) => setEditingDishPrice(e.target.value)}
                                            placeholder="Price"
                                            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-mono text-neutral-200 outline-none focus:border-neutral-700"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="h-12 w-16 rounded-lg overflow-hidden flex-shrink-0 border border-neutral-900 bg-neutral-950">
                                        {item.imageUrl ? (
                                          <img
                                            src={item.imageUrl}
                                            alt={item.name}
                                            referrerPolicy="no-referrer"
                                            className="w-full h-full object-cover"
                                          />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center font-mono text-[8px] text-neutral-605">
                                            NO PHOTO
                                          </div>
                                        )}
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className="font-sans text-sm font-medium text-neutral-200 truncate">{formatItemName(item.name)}</h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          <span className="font-mono text-xs text-neutral-400 font-semibold">₹{item.price.toFixed(2)}</span>
                                          <span className="text-[9px] font-sans font-bold uppercase px-1.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-800/80 text-zinc-400">
                                            {item.category || "Others"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {editingDishId === item.id ? (
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                      <button
                                        onClick={() => handleUpdateDishDetails(item.id)}
                                        className="rounded-lg bg-emerald-950/50 border border-emerald-900/60 px-2.5 py-1.5 text-[10px] font-bold uppercase text-emerald-400 hover:bg-emerald-900/40 transition-all cursor-pointer"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => setEditingDishId(null)}
                                        className="rounded-lg bg-zinc-900 border border-zinc-805 px-2.5 py-1.5 text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : deletingItemId === item.id ? (
                                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                                      <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="rounded-lg bg-rose-950/50 border border-rose-900/60 px-2.5 py-1.5 text-[10px] font-bold uppercase text-rose-450 hover:bg-rose-900/40 transition-all cursor-pointer"
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
                                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                                      <button
                                        onClick={() => {
                                          setEditingDishId(item.id);
                                          setEditingDishName(item.name);
                                          setEditingDishPrice(item.price.toString());
                                        }}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                                        title="Edit Name & Price"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setDeletingItemId(item.id)}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-650 hover:text-rose-400 transition-colors cursor-pointer"
                                        title="Delete Dish"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                        {/* Custom dynamic categories from DB - sorted newest first! */}
                        {categories
                          .filter((cat) => cat.id !== "others_bucket" && cat.name.toLowerCase() !== "others")
                          .sort((a, b) => {
                            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                            return bTime - aTime;
                          })
                          .map((cat) => {
                            const count = items.filter((i) => i.category && i.category.toLowerCase() === cat.name.toLowerCase()).length;
                            return (
                              <div
                                key={cat.id}
                                onClick={() => {
                                  if (deletingCategoryId === cat.id) return;
                                  setSelectedManageCategory(cat);
                                }}
                                className="rounded-xl border border-neutral-900 bg-neutral-900/10 p-4 hover:border-neutral-800 hover:bg-neutral-900/20 cursor-pointer group transition-all relative"
                              >
                                <div className="flex items-center gap-3">
                                  {/* Category Image display */}
                                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-neutral-950 border border-neutral-800">
                                    <img
                                      src={cat.imageUrl || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&auto=format&fit=crop&q=80"}
                                      alt={cat.name}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                  </div>

                                  <div className="flex-grow min-w-0 pr-6">
                                    <h4 className="font-sans text-sm font-semibold text-neutral-300 group-hover:text-white transition-colors truncate">
                                      {cat.name}
                                    </h4>
                                    <p className="font-sans text-[10px] text-neutral-500 mt-0.5 truncate">
                                      Tap to publish dishes
                                    </p>
                                  </div>

                                  {deletingCategoryId === cat.id ? (
                                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          handleDeleteCategory(cat.id, cat.name);
                                          setDeletingCategoryId(null);
                                        }}
                                        className="rounded-lg bg-rose-950/50 border border-rose-900/60 px-2.5 py-1 text-[10px] font-bold uppercase text-rose-450 hover:bg-rose-900/40 transition-all cursor-pointer"
                                      >
                                        Sure?
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setDeletingCategoryId(null);
                                        }}
                                        className="rounded-lg bg-zinc-900 border border-zinc-805 px-2.5 py-1 text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                      <span className="font-mono text-xs font-extrabold text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded-md">
                                        {count}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          setDeletingCategoryId(cat.id);
                                        }}
                                        className="text-neutral-600 hover:text-rose-400 p-1 rounded-md transition-colors cursor-pointer"
                                        title="Delete Category"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        {/* Special static "Others" category card */}
                        {(() => {
                          const othersCount = items.filter((i) => !i.category || i.category.toLowerCase() === "" || i.category.toLowerCase() === "others").length;
                          const othersDb = categories.find((c) => c.id === "others_bucket" || c.name.toLowerCase() === "others");
                          const othersImageUrl = othersDb?.imageUrl;
                          return (
                            <div
                              onClick={() => setSelectedManageCategory(othersDb || { id: "others_bucket", name: "Others" })}
                              className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/20 p-4 hover:border-neutral-600 hover:bg-neutral-950/40 cursor-pointer group transition-all"
                            >
                              <div className="flex items-center gap-3">
                                {othersImageUrl ? (
                                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-neutral-950 border border-neutral-805">
                                    <img
                                      src={othersImageUrl}
                                      alt="Others Category Display"
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                  </div>
                                ) : (
                                  <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-neutral-900 border border-neutral-800 text-neutral-500 font-mono text-lg shrink-0">
                                    #
                                  </div>
                                )}
                                <div className="flex-grow min-w-0">
                                  <h4 className="font-sans text-sm font-semibold text-neutral-300 group-hover:text-white transition-colors">
                                    Others
                                  </h4>
                                  <p className="font-sans text-[10px] text-neutral-500 mt-0.5 truncate">
                                    Dishes not in any other category
                                  </p>
                                </div>
                                <span className="font-mono text-xs font-extrabold text-neutral-400 bg-neutral-900 px-2 py-1 rounded-md shrink-0">
                                  {othersCount}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
                /* A specific category is managed */
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                    <button
                      onClick={() => {
                        setSelectedManageCategory(null);
                        setBatchDishes([]);
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all cursor-pointer"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </button>
                    <div className="text-right">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Managing Category</span>
                      <h2 className="font-sans text-lg font-black text-neutral-100">{selectedManageCategory.name}</h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-8 md:grid-cols-12 animate-fadeIn">
                    {/* Left Column: BATCH IMAGE & DETAILS EDITOR */}
                    <div className="space-y-6 md:col-span-6">
                      {/* Category display image configuration panel */}
                      <div className="rounded-2xl border border-neutral-900 bg-neutral-900/10 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-neutral-100">
                              Category Display Image
                            </h3>
                            <p className="text-[11px] text-neutral-500 mt-1 leading-normal max-w-[210px]">
                              Upload or update the representation photo for this category.
                            </p>
                          </div>
                          {/* image thumbnail */}
                          <div className="w-14 h-14 rounded-lg overflow-hidden border border-neutral-805 bg-neutral-950 shrink-0">
                            <img 
                              src={(categories.find(c => c.id === selectedManageCategory?.id || c.name.toLowerCase() === selectedManageCategory?.name.toLowerCase())?.imageUrl) || "https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=100&auto=format&fit=crop&q=80"} 
                              alt="Category cover" 
                              className="w-full h-full object-cover font-mono text-[8px] text-neutral-600 uppercase text-center"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-center w-full">
                          <label className="flex items-center justify-center gap-2 w-full h-12 border border-dashed rounded-xl border-neutral-800 bg-neutral-950/40 cursor-pointer hover:border-neutral-600 transition-all text-center">
                            <Upload className="h-4 w-4 text-neutral-500 shrink-0" />
                            <span className="text-xs text-neutral-300 font-sans font-semibold">
                              Upload Category Icon
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = async () => {
                                  if (typeof reader.result === "string") {
                                    try {
                                      const catId = selectedManageCategory?.id || "others_bucket";
                                      const docRef = doc(db, "restaurants", restaurantId || "foodcourt", "categories", catId);
                                      await setDoc(docRef, {
                                        id: catId,
                                        name: selectedManageCategory?.name || "Others",
                                        imageUrl: reader.result,
                                        createdAt: selectedManageCategory?.createdAt || new Date().toISOString()
                                      }, { merge: true });
                                      alert("Category display photo updated successfully!");
                                    } catch (err) {
                                      console.error("Failed to save category image:", err);
                                      alert("Could not update category image.");
                                    }
                                  }
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-neutral-900 bg-neutral-900/10 p-6 space-y-6">
                        <div>
                          <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-neutral-100">
                            Add Dishes in Bulk
                          </h3>
                          <p className="text-xs text-neutral-550 mt-1 leading-relaxed">
                            Upload multiple photos of dishes first. For each photo, fill in its title name and price instantly right on its side.
                          </p>
                        </div>

                        {/* Multiple files choose click area */}
                        <div className="flex items-center justify-center w-full">
                          <label className="flex flex-col items-center justify-center w-full h-28 border border-dashed rounded-xl border-neutral-800 bg-neutral-950/50 cursor-pointer hover:border-neutral-600 transition-all">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                              <ImagePlus className="h-6 w-6 text-neutral-500 mb-1" />
                              <p className="text-xs text-neutral-300 font-sans font-semibold">
                                Upload / Select Multiple Images
                              </p>
                              <span className="text-[10px] text-neutral-600 font-mono mt-0.5">Drag-and-drop or select several JPG/PNG images</span>
                            </div>
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              className="hidden"
                              onChange={handleMultipleImagesSelect}
                            />
                          </label>
                        </div>

                        {/* Batch editor queue */}
                        {batchDishes.length > 0 && (
                          <div className="space-y-4 pt-2">
                            <h4 className="font-mono text-[10px] uppercase tracking-widest text-neutral-400">
                              Dishes Details queue ({batchDishes.length})
                            </h4>

                             <div className="max-h-96 overflow-y-auto space-y-4 pr-1">
                              {batchDishes.map((dish) => (
                                <div key={dish.id} className="flex gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-950/80 relative">
                                  {/* Thumbnail */}
                                  <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-neutral-800 bg-neutral-900">
                                    <img src={dish.imageUrl} alt="Batch Preview" className="w-full h-full object-cover" />
                                  </div>

                                  {/* Side Fields */}
                                  <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-550">Dish Name</span>
                                      <input
                                        type="text"
                                        required
                                        id={`batch-name-${dish.id}`}
                                        value={dish.name}
                                        onChange={(e) => handleUpdateBatchDish(dish.id, "name", e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            const nextField = document.getElementById(`batch-price-${dish.id}`);
                                            if (nextField) (nextField as HTMLInputElement).focus();
                                          }
                                        }}
                                        placeholder="e.g. Kyoto Ramen"
                                        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 outline-none focus:border-neutral-600"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-550">Price (₹)</span>
                                      <input
                                        type="number"
                                        required
                                        step="0.01"
                                        id={`batch-price-${dish.id}`}
                                        value={dish.price}
                                        onChange={(e) => handleUpdateBatchDish(dish.id, "price", e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            const index = batchDishes.findIndex((d) => d.id === dish.id);
                                            if (index !== -1 && index < batchDishes.length - 1) {
                                              const nextDish = batchDishes[index + 1];
                                              const nextField = document.getElementById(`batch-name-${nextDish.id}`);
                                              if (nextField) (nextField as HTMLInputElement).focus();
                                            } else {
                                              const confirmBtn = document.getElementById("confirm-batch-dishes-btn");
                                              if (confirmBtn) (confirmBtn as HTMLButtonElement).focus();
                                            }
                                          }
                                        }}
                                        placeholder="e.g. 150"
                                        className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-mono text-neutral-200 outline-none focus:border-neutral-600"
                                      />
                                    </div>
                                  </div>

                                  {/* Delete slot */}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveBatchDish(dish.id)}
                                    className="absolute top-2 right-2 text-neutral-600 hover:text-rose-450 p-1 cursor-pointer"
                                    title="Remove"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>

                            <button
                              id="confirm-batch-dishes-btn"
                              onClick={handleConfirmBatchDishes}
                              disabled={isSubmitItemLoading}
                              className="w-full rounded-xl border border-neutral-700 bg-neutral-100 py-3.5 font-sans text-xs font-bold uppercase tracking-wider text-neutral-950 transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              {isSubmitItemLoading ? "Publishing Dishes..." : "Confirm & Save Dishes"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Existing Items in selected Category */}
                    <div className="space-y-4 md:col-span-6 animate-fadeIn">
                      {(() => {
                        const currentCategoryName = selectedManageCategory.name;
                        const belongsToThisCategory = items.filter((item) => {
                          if (currentCategoryName === "Others") {
                            return !item.category || item.category === "" || item.category.toLowerCase() === "others";
                          }
                          return item.category && item.category.toLowerCase() === currentCategoryName.toLowerCase();
                        });

                        return (
                          <>
                            <h3 className="font-sans text-sm font-semibold uppercase tracking-wider text-neutral-400 border-b border-neutral-900 pb-2">
                              Dish list under {currentCategoryName} ({belongsToThisCategory.length})
                            </h3>

                            {belongsToThisCategory.length === 0 ? (
                              <p className="font-sans text-xs text-neutral-600">No dishes currently found in this category.</p>
                            ) : (
                              <div className="space-y-3">
                                {belongsToThisCategory.map((item) => (
                                  <div
                                    key={item.id}
                                    id={`admin-item-row-${item.id}`}
                                    className="flex items-center justify-between rounded-xl border border-neutral-900 bg-neutral-900/10 p-3 min-h-[70px]"
                                  >
                                    {editingDishId === item.id ? (
                                      <div className="flex-grow flex items-center gap-3 min-w-0 pr-4">
                                        <img
                                          src={item.imageUrl}
                                          alt={item.name}
                                          className="h-12 w-16 rounded-lg object-cover bg-neutral-950 flex-shrink-0 border border-neutral-900"
                                        />
                                        <div className="flex-grow grid grid-cols-2 gap-2">
                                          <div className="space-y-0.5">
                                            <span className="text-[8px] font-mono uppercase text-neutral-500">Dish Name</span>
                                            <input
                                              type="text"
                                              value={editingDishName}
                                              onChange={(e) => setEditingDishName(e.target.value)}
                                              placeholder="Dish Name"
                                              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-neutral-700"
                                            />
                                          </div>
                                          <div className="space-y-0.5">
                                            <span className="text-[8px] font-mono uppercase text-neutral-500">Price (₹)</span>
                                            <input
                                              type="number"
                                              value={editingDishPrice}
                                              onChange={(e) => setEditingDishPrice(e.target.value)}
                                              placeholder="Price"
                                              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs font-mono text-neutral-200 outline-none focus:border-neutral-700"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-3 min-w-0">
                                        <img
                                          src={item.imageUrl}
                                          alt={item.name}
                                          referrerPolicy="no-referrer"
                                          className="h-12 w-16 rounded-lg object-cover bg-neutral-950 flex-shrink-0 border border-neutral-900"
                                        />
                                        <div className="min-w-0">
                                          <h4 className="font-sans text-sm font-medium text-neutral-200 truncate">{formatItemName(item.name)}</h4>
                                          <p className="font-mono text-xs text-neutral-550">₹{item.price.toFixed(2)}</p>
                                        </div>
                                      </div>
                                    )}

                                    {editingDishId === item.id ? (
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                          onClick={() => handleUpdateDishDetails(item.id)}
                                          className="rounded-lg bg-emerald-950/50 border border-emerald-900/60 px-2.5 py-1.5 text-[10px] font-bold uppercase text-emerald-400 hover:bg-emerald-900/40 transition-all cursor-pointer"
                                        >
                                          Save
                                        </button>
                                        <button
                                          onClick={() => setEditingDishId(null)}
                                          className="rounded-lg bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 text-[10px] font-bold uppercase text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : deletingItemId === item.id ? (
                                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-4">
                                        <button
                                          onClick={() => handleDeleteItem(item.id)}
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
                                      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                                        <button
                                          onClick={() => {
                                            setEditingDishId(item.id);
                                            setEditingDishName(item.name);
                                            setEditingDishPrice(item.price.toString());
                                          }}
                                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                                          title="Edit Name & Price"
                                        >
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={() => setDeletingItemId(item.id)}
                                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-600 hover:text-rose-450 transition-colors cursor-pointer"
                                          title="Delete Dish"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-900 pb-3 gap-3">
                  <h3 className="font-sans text-sm font-semibold uppercase tracking-wider">Top Banner Controls</h3>
                  
                  <div className="flex flex-col items-start gap-2.5">
                    {/* Banner Image Toggle SWITCH */}
                    <div className="flex items-center gap-2 justify-between w-full min-w-[140px]">
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
                    <div className="flex items-center gap-2 justify-between w-full min-w-[140px]">
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

                    {/* Categories Section Toggle SWITCH */}
                    <div className="flex items-center gap-2 justify-between w-full min-w-[140px]">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">
                        Categories: {categoriesEnabled ? "On" : "Off"}
                      </span>
                      <button
                        type="button"
                        id="categories-toggle-switch"
                        onClick={() => setCategoriesEnabled(!categoriesEnabled)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 outline-none ${
                          categoriesEnabled ? "bg-neutral-100" : "bg-neutral-800"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-neutral-950 shadow ring-0 transition duration-200 ${
                            categoriesEnabled ? "translate-x-4" : "translate-x-0"
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

                {/* SYSTEM RESET HOOK PANEL */}
                <div className="space-y-4">
                  <h3 className="font-sans text-[11px] font-bold uppercase tracking-widest text-neutral-500">System Reset Tools</h3>
                  
                  {/* Card 1: RESET ADDED ITEMS */}
                  <div className="rounded-2xl border border-red-955 bg-rose-955/5 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-neutral-200">
                          RESET ADDED ITEMS
                        </h4>
                        <p className="text-[11px] text-neutral-500 mt-1 leading-normal">
                          Safely delete all food items from the catalog.
                        </p>
                      </div>
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
                        className="w-full rounded-xl bg-red-950/15 border border-red-900 text-red-400 font-sans text-xs font-bold uppercase tracking-wider py-2.5 transition-all hover:bg-neutral-905 active:scale-95 cursor-pointer"
                      >
                        Wipe All Items
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={handleWipeAllItems}
                          disabled={isWipingItems}
                          className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-sans text-xs font-bold uppercase tracking-wider py-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                        >
                          {isWipingItems ? "Deleting catalog..." : "⚠️ CONFIRM WIPE"}
                        </button>
                        <button
                          onClick={() => setShowConfirmWipeItems(false)}
                          disabled={isWipingItems}
                          className="w-full rounded-xl bg-transparent border border-zinc-800 hover:border-zinc-700 text-zinc-400 font-sans text-xs font-bold uppercase py-1.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card 2: RESET CATEGORYS */}
                  <div className="rounded-2xl border border-red-955 bg-rose-955/5 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-neutral-200">
                          RESET CATEGORYS
                        </h4>
                        <p className="text-[11px] text-neutral-500 mt-1 leading-normal">
                          Wipe all existing categories in this workspace. All assigned dishes are safely preserved and relocated under the "Others" category.
                        </p>
                      </div>
                    </div>

                    {wipeCategoriesFeedback && (
                      <div className={`p-2.5 rounded-lg text-[10px] font-sans ${
                        wipeCategoriesFeedback.type === "success" 
                          ? "bg-emerald-950/25 border border-emerald-950 text-emerald-400" 
                          : "bg-rose-950/25 border border-rose-900/60 text-rose-450"
                      }`}>
                        {wipeCategoriesFeedback.text}
                      </div>
                    )}

                    {!showConfirmWipeCategories ? (
                      <button
                        onClick={() => {
                          setShowConfirmWipeCategories(true);
                          setWipeCategoriesFeedback(null);
                        }}
                        disabled={categories.length === 0}
                        className="w-full rounded-xl bg-red-950/15 border border-red-900 text-red-400 font-sans text-xs font-bold uppercase tracking-wider py-2.5 transition-all hover:bg-neutral-905 active:scale-95 cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                      >
                        Reset / Clear All Categories
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={handleWipeAllCategories}
                          disabled={isWipingCategories}
                          className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-sans text-xs font-bold uppercase tracking-wider py-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                        >
                          {isWipingCategories ? "Clearing..." : "⚠️ CONFIRM RESET"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowConfirmWipeCategories(false)}
                          disabled={isWipingCategories}
                          className="w-full rounded-xl bg-transparent border border-zinc-800 hover:border-zinc-700 text-zinc-400 font-sans text-xs font-bold uppercase py-1.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card 3: RESET COMPLETED ORDERS */}
                  <div className="rounded-2xl border border-red-955 bg-rose-955/5 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-sans text-xs font-bold uppercase tracking-wider text-neutral-200">
                          RESET COMPLETED ORDERS
                        </h4>
                        <p className="text-[11px] text-neutral-500 mt-1 leading-normal">
                          Wipe previous completed customer orders cleanly.
                        </p>
                      </div>
                    </div>

                    {wipeOrdersFeedback && (
                      <div className={`p-2.5 rounded-lg text-[10px] font-sans ${
                        wipeOrdersFeedback.type === "success" 
                          ? "bg-emerald-950/25 border border-emerald-905 text-emerald-400" 
                          : "bg-rose-950/25 border border-rose-905 text-rose-450"
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
                        className="w-full rounded-xl bg-red-950/15 border border-red-900 text-red-400 font-sans text-xs font-bold uppercase tracking-wider py-2.5 transition-all hover:bg-neutral-905 active:scale-95 cursor-pointer"
                      >
                        Wipe Completed Orders
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={handleWipeAllOrders}
                          disabled={isWipingOrders}
                          className="w-full rounded-xl bg-red-600 hover:bg-red-700 text-white font-sans text-xs font-bold uppercase tracking-wider py-2 transition-all active:scale-95 disabled:opacity-40 cursor-pointer"
                        >
                          {isWipingOrders ? "Clearing..." : "⚠️ CONFIRM WIPE"}
                        </button>
                        <button
                          onClick={() => setShowConfirmWipeOrders(false)}
                          disabled={isWipingOrders}
                          className="w-full rounded-xl bg-transparent border border-zinc-800 hover:border-zinc-700 text-zinc-400 font-sans text-xs font-bold uppercase py-1.5 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" id="analytics-kpi-grid">
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">MONTHLY REVENUE</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-indigo-400 font-extrabold">₹{analytics.revenueThisMonth.toFixed(2)}</p>
                </div>

                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/30 p-5">
                  <span className="font-sans text-[10px] uppercase tracking-widest text-zinc-500">YEARLY REVENUE</span>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-400 font-extrabold">₹{analytics.totalRevenue.toFixed(2)}</p>
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
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Dishes by units sold this month (Max 10)</p>
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
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1 text-zinc-200">
                      {analytics.bestSellers.slice(0, 10).map((item, idx) => {
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

                {/* MONTHS - TOTAL REVENUE MONTHLY(HISTORY) */}
                <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/20 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold tracking-wider uppercase text-zinc-100 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-indigo-500" />
                        MONTHLY REVENUE HISTORY
                      </h3>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">January to December Monthwise History</p>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {analytics.monthlyHistory.map((history, idx) => (
                      <div key={history.month} className="flex items-center justify-between rounded-xl border border-zinc-800/40 bg-zinc-950 p-3 transition-all hover:bg-zinc-900/40">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-zinc-500 text-xs font-bold w-4">#{idx + 1}</span>
                          <div className="rounded-lg bg-zinc-900 border border-zinc-850 py-1 px-2.5 font-mono text-xs font-extrabold text-indigo-400">
                            {history.month}
                          </div>
                        </div>
                        <div className="flex items-center text-xs font-medium">
                          <span className="font-mono text-zinc-100 font-bold">Total: <span className="text-emerald-400 font-extrabold ml-1">₹{history.total.toFixed(2)}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-zinc-800/40 flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-405 uppercase tracking-wider font-sans">
                      Total Revenue in Year ({analytics.currentYear})
                    </span>
                    <div className="font-mono text-sm font-extrabold text-emerald-400">
                      ₹{analytics.historyYearlyTotal.toFixed(2)}
                    </div>
                  </div>
                </div>

              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
