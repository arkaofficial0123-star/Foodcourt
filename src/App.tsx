/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { MenuItem, Order, BannerSettings, Category } from "./types";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { collection, doc, onSnapshot, setDoc, query, where } from "firebase/firestore";
import TableSelector from "./components/TableSelector";
import ClientMenu from "./components/ClientMenu";
import AdminConsole from "./components/AdminConsole";
import SuperAdminConsole from "./components/SuperAdminConsole";
import { Loader, Store, Shield, ArrowRight, Eye, EyeOff } from "lucide-react";
import { motion } from "motion/react";

// Helper to parse the initial route synchronously to prevent initial render flicker/delay
const getInitialRouteState = () => {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const pathParts = path.split("/").filter(Boolean);
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const hash = typeof window !== "undefined" ? window.location.hash : "";

  const restParam = params.get("restaurant");
  const tableParam = params.get("table");
  const adminParam = params.get("admin");
  const superParam = params.get("superadmin");

  // If loading the app/superadmin on refresh, log them out for security
  const isSuperRoute = pathParts[0] === "superadmin" || superParam === "true" || hash === "#superadmin";
  
  if (isSuperRoute) {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("superadmin_global_auth");
      window.history.replaceState(null, "", "/");
    }
    return {
      isSuperAdmin: false,
      restaurantId: null,
      tableId: null,
      isAdmin: false,
      isCustomerView: false,
      isDataLoading: false,
      isTablePathRestricted: false
    };
  }

  let initialRestaurantId: string | null = null;
  let initialTableId: string | null = null;
  let initialIsAdmin = false;
  let initialIsCustomerView = false;
  let initialIsDataLoading = false;
  let initialIsTablePathRestricted = false;

  // STRICT PATH RESTRICITON:
  // - Allowed visitor/customer path: /restaurant/:slug/table/:tableId (QR scan customer access)
  // - Allowed operator login/directory path: /restaurant or / (and authenticated operator views)
  // - Other direct access like /restaurant/:slug or /restaurant/:slug/menu is unaccepted unless authenticated!
  if (pathParts[0] === "restaurant" && pathParts[1]) {
    const slug = pathParts[1];
    const hasTableId = pathParts[2] === "table" && pathParts[3];
    const isAuthedOp = typeof window !== "undefined" && (
      sessionStorage.getItem(`admin_role_${slug}`) === "staff" ||
      sessionStorage.getItem(`admin_role_${slug}`) === "superadmin" ||
      sessionStorage.getItem("superadmin_global_auth") === "true" ||
      sessionStorage.getItem(`isAdminBypass_${slug}`) === "true"
    );

    if (hasTableId) {
      initialRestaurantId = slug;
      initialTableId = decodeURIComponent(pathParts[3]!);
      initialIsCustomerView = true;
      initialIsAdmin = false;
      initialIsTablePathRestricted = false;
      initialIsDataLoading = true;
    } else if (isAuthedOp) {
      initialRestaurantId = slug;
      initialIsDataLoading = true;
      if (pathParts[2] === "table") {
        initialIsTablePathRestricted = false;
        initialIsAdmin = true;
        initialIsCustomerView = false;
        initialTableId = null;
      } else if (pathParts[2] === "menu") {
        initialTableId = null;
        initialIsCustomerView = true;
        initialIsAdmin = false;
        initialIsTablePathRestricted = false;
      } else {
        initialIsAdmin = true;
        initialIsCustomerView = false;
        initialTableId = null;
        initialIsTablePathRestricted = false;
      }
    } else {
      // Forbidden direct URL access!
      initialIsTablePathRestricted = true;
      initialIsAdmin = false;
      initialIsCustomerView = false;
      initialTableId = null;
      initialRestaurantId = null;
      initialIsDataLoading = false;
    }
  } else if (restParam) {
    initialRestaurantId = restParam;
    initialIsDataLoading = true;
    if (tableParam) {
      initialTableId = tableParam;
      initialIsCustomerView = true;
    } else if (adminParam === "true") {
      initialIsAdmin = true;
      initialIsCustomerView = false;
    } else {
      initialIsCustomerView = true;
      initialTableId = null;
    }
  }

  return {
    isSuperAdmin: false,
    restaurantId: initialRestaurantId,
    tableId: initialTableId,
    isAdmin: initialIsAdmin,
    isCustomerView: initialIsCustomerView,
    isDataLoading: initialIsDataLoading,
    isTablePathRestricted: initialIsTablePathRestricted
  };
};

const initialRoute = getInitialRouteState();

export default function App() {
  // Navigation & Multi-Tenant state with synchronous hydration to eliminate flickers
  const [isSuperAdmin, setIsSuperAdmin] = useState(initialRoute.isSuperAdmin);
  const [restaurantId, setRestaurantId] = useState<string | null>(initialRoute.restaurantId);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [tableId, setTableId] = useState<string | null>(initialRoute.tableId);
  const [isAdmin, setIsAdmin] = useState(initialRoute.isAdmin);
  const [isCustomerView, setIsCustomerView] = useState(initialRoute.isCustomerView);
  const [isTablePathRestricted, setIsTablePathRestricted] = useState(initialRoute.isTablePathRestricted || false);

  // High safety permission flag
  const [isRestaurantDisabled, setIsRestaurantDisabled] = useState(false);
  const [superAdminCredentials, setSuperAdminCredentials] = useState({ id: "ADMIN", password: "1234" });

  // Dynamic tenant-isolated data state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bannerSettings, setBannerSettings] = useState<BannerSettings | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(initialRoute.isDataLoading);

  // Home portal index
  const [allRestaurants, setAllRestaurants] = useState<any[]>([]);

  // Root Dashboard Integrated Access Gateway States
  const [formUserId, setFormUserId] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [selectedSlug, setSelectedSlug] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");
  const [showFormUserId, setShowFormUserId] = useState(false);

  // Synchronously listen to dynamic super admin gatekeeper credentials
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "security"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setSuperAdminCredentials({
          id: d.superAdminId || "ADMIN",
          password: d.superAdminPassword || "1234"
        });
      } else {
        setSuperAdminCredentials({ id: "ADMIN", password: "1234" });
      }
    });
    return unsub;
  }, []);

  // 1. Initial pathname parsing & active route configuration
  const isFirstRenderRef = React.useRef(true);

  useEffect(() => {
    const isFirstRun = isFirstRenderRef.current;
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
    }

    const parseUrlRoute = () => {
      const path = window.location.pathname;
      const pathParts = path.split("/").filter(Boolean);

      if (pathParts[0] === "superadmin") {
        if (isFirstRun) {
          // Automatic logout of super admin dashboard on page refresh / load
          sessionStorage.removeItem("superadmin_global_auth");
          setIsSuperAdmin(false);
          setIsDataLoading(false);
          window.history.replaceState(null, "", "/");
        } else {
          setIsSuperAdmin(true);
          setIsDataLoading(false);
        }
      } else if (pathParts[0] === "restaurant" && pathParts[1]) {
        const slug = pathParts[1];
        
        const hasTableId = pathParts[2] === "table" && pathParts[3];
        const isAuthedOp = (
          sessionStorage.getItem(`admin_role_${slug}`) === "staff" ||
          sessionStorage.getItem(`admin_role_${slug}`) === "superadmin" ||
          sessionStorage.getItem("superadmin_global_auth") === "true" ||
          sessionStorage.getItem(`isAdminBypass_${slug}`) === "true"
        );

        if (hasTableId) {
          setRestaurantId(slug);
          setTableId(decodeURIComponent(pathParts[3]));
          setIsCustomerView(true);
          setIsAdmin(false);
          setIsTablePathRestricted(false);
        } else if (isAuthedOp) {
          setRestaurantId(slug);
          if (pathParts[2] === "table") {
            setIsTablePathRestricted(false);
            setIsAdmin(true);
            setIsCustomerView(false);
            setTableId(null);
          } else if (pathParts[2] === "menu") {
            setTableId(null);
            setIsCustomerView(true);
            setIsAdmin(false);
            setIsTablePathRestricted(false);
          } else {
            setIsCustomerView(false);
            setIsAdmin(true);
            setTableId(null);
            setIsTablePathRestricted(false);
          }
        } else {
          // Forbidden direct URL access!
          setIsTablePathRestricted(true);
          setIsAdmin(false);
          setIsCustomerView(false);
          setTableId(null);
          setRestaurantId(null);
          setIsDataLoading(false);
        }
      } else {
        // Search query fallback check
        const params = new URLSearchParams(window.location.search);
        const restParam = params.get("restaurant");
        const tableParam = params.get("table");
        const adminParam = params.get("admin");
        const superParam = params.get("superadmin");

        if (superParam === "true" || window.location.hash === "#superadmin") {
          if (isFirstRun) {
            // Automatic logout on page refresh / load
            sessionStorage.removeItem("superadmin_global_auth");
            setIsSuperAdmin(false);
            setIsDataLoading(false);
            window.history.replaceState(null, "", "/");
          } else {
            setIsSuperAdmin(true);
            setIsDataLoading(false);
          }
          setIsTablePathRestricted(false);
        } else if (restParam) {
          setRestaurantId(restParam);
          if (tableParam) {
            setTableId(tableParam);
            setIsCustomerView(true);
          } else if (adminParam === "true") {
            setIsAdmin(true);
            setIsCustomerView(false);
          } else {
            setIsCustomerView(true);
            setTableId(null);
          }
          setIsTablePathRestricted(false);
        } else {
          // Clear states to show root landing
          setRestaurantId(null);
          setIsSuperAdmin(false);
          setIsAdmin(false);
          setIsCustomerView(false);
          setIsDataLoading(false);
          setIsTablePathRestricted(false);
          
          if (window.location.pathname === "/") {
            window.history.replaceState(null, "", "/restaurant");
          }
        }
      }
    };

    parseUrlRoute();

    // Listen to history popstates
    window.addEventListener("popstate", parseUrlRoute);
    return () => window.removeEventListener("popstate", parseUrlRoute);
  }, []);

  // 2. Fetch all restaurants globally (kept active always to support instant case-sensitive login and seamless navigation without fetching delay)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "restaurants"), (snapshot) => {
      const fetched: any[] = [];
      snapshot.forEach((docSnap) => {
        fetched.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      setAllRestaurants(fetched);
    }, (err) => {
      console.error("Failed to load restaurant index:", err);
    });

    return unsub;
  }, []);

  // 3. Attach Live listeners dynamically bound to core tenant branch namespaces
  useEffect(() => {
    if (!restaurantId) return;

    setIsDataLoading(true);

    let restReady = false;
    let itemsReady = false;
    let catsReady = false;

    const checkReady = () => {
      if (restReady && itemsReady && catsReady) {
        setIsDataLoading(false);
      }
    };

    // Get Active Restaurant properties
    const unsubRest = onSnapshot(doc(db, "restaurants", restaurantId), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setRestaurantName(d.name || "Local Branch");
        if (d.isEnabled === false) {
          setIsRestaurantDisabled(true);
          sessionStorage.removeItem(`admin_role_${restaurantId}`);
          sessionStorage.removeItem(`isAdminBypass_${restaurantId}`);
        } else {
          setIsRestaurantDisabled(false);
        }
      } else {
        setRestaurantName("Unknown Brand");
        setIsRestaurantDisabled(false);
      }
      restReady = true;
      checkReady();
    });

    // Populate and listen to catalog
    const itemsPath = `restaurants/${restaurantId}/items`;
    const unsubItems = onSnapshot(collection(db, "restaurants", restaurantId, "items"), (snapshot) => {
      const fetched: MenuItem[] = [];
      snapshot.forEach((docSnap) => {
        if (docSnap.id !== "dummy-welcome-item") {
          const d = docSnap.data();
          fetched.push({
            id: docSnap.id,
            name: d.name,
            price: typeof d.price === "number" ? d.price : (parseFloat(d.price) || 0),
            imageUrl: d.imageUrl,
            createdAt: d.createdAt,
            category: d.category || "",
          });
        }
      });
      setMenuItems(fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      itemsReady = true;
      checkReady();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, itemsPath);
      itemsReady = true;
      checkReady();
    });

    // Populate and listen to categories
    const categoriesPath = `restaurants/${restaurantId}/categories`;
    const unsubCategories = onSnapshot(collection(db, "restaurants", restaurantId, "categories"), (snap) => {
      const fetched: Category[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        fetched.push({
          id: docSnap.id,
          name: d.name,
          imageUrl: d.imageUrl || "",
          createdAt: d.createdAt,
        });
      });
      setCategories(fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      catsReady = true;
      checkReady();
    }, () => {
      catsReady = true;
      checkReady();
    });

    // Populate and listen to active orders list (Optimized query: scan QR codes load first!)
    let unsubOrders = () => {};
    if (isAdmin) {
      // Admin dashboard requires viewing all orders
      const ordersPath = `restaurants/${restaurantId}/orders`;
      unsubOrders = onSnapshot(collection(db, "restaurants", restaurantId, "orders"), (snapshot) => {
        const fetched: Order[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          fetched.push({
            id: docSnap.id,
            tableId: d.tableId,
            items: (d.items || []).map((item: any) => ({
              id: item.id,
              name: item.name,
              price: typeof item.price === "number" ? item.price : (parseFloat(item.price) || 0),
              quantity: item.quantity
            })),
            total: typeof d.total === "number" ? d.total : (parseFloat(d.total) || 0),
            status: d.status,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          });
        });
        setOrders(fetched);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, ordersPath);
      });
    } else if (tableId) {
      // Customer at a specific table: only load their table's active / uncompleted orders
      const ordersPath = `restaurants/${restaurantId}/orders`;
      const q = query(
        collection(db, "restaurants", restaurantId, "orders"),
        where("tableId", "==", tableId)
      );
      unsubOrders = onSnapshot(q, (snapshot) => {
        const fetched: Order[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          fetched.push({
            id: docSnap.id,
            tableId: d.tableId,
            items: (d.items || []).map((item: any) => ({
              id: item.id,
              name: item.name,
              price: typeof item.price === "number" ? item.price : (parseFloat(item.price) || 0),
              quantity: item.quantity
            })),
            total: typeof d.total === "number" ? d.total : (parseFloat(d.total) || 0),
            status: d.status,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
          });
        });
        setOrders(fetched);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, ordersPath);
      });
    } else {
      // Customers just browsing menu without any table assigned: no orders subscription necessary!
      setOrders([]);
    }

    // Populate banner text settings
    const bannerDocPath = `restaurants/${restaurantId}/settings/banner`;
    const unsubBanner = onSnapshot(doc(db, "restaurants", restaurantId, "settings", "banner"), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setBannerSettings({
          text: d.text,
          imageUrl: d.imageUrl,
          visible: d.visible,
          bioVisible: d.bioVisible,
          categoriesEnabled: d.categoriesEnabled ?? true,
          updatedAt: d.updatedAt,
        });
      } else {
        setBannerSettings(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, bannerDocPath);
    });

    return () => {
      unsubRest();
      unsubItems();
      unsubCategories();
      unsubOrders();
      unsubBanner();
    };
  }, [restaurantId, isAdmin, tableId]);

  // State handlers to update URL cleanly
  const handleSelectRestaurant = (slug: string) => {
    setRestaurantId(slug);
    setIsAdmin(true); // Default to staff operator interface
    setIsCustomerView(false);
    setTableId(null);
    window.history.pushState(null, "", `/restaurant/${slug}`);
  };

  const handleGatewayLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginSuccess("");

    const userIdExact = formUserId;
    const passwordExact = formPassword;

    if (!userIdExact || !passwordExact) {
      setLoginError("INVALID PASSWORD !");
      setFormUserId("");
      setFormPassword("");
      setTimeout(() => {
        setLoginError("");
      }, 1000);
      return;
    }

    // 1. Global Super Admin Match (Strict case-sensitive and spacing-sensitive ID and Password)
    if (
      userIdExact === superAdminCredentials.id && passwordExact === superAdminCredentials.password
    ) {
      setLoginSuccess("Verified. Launching admin center...");
      sessionStorage.setItem("superadmin_global_auth", "true");
      setFormUserId("");
      setFormPassword("");
      setTimeout(() => {
        setLoginSuccess("");
        setIsSuperAdmin(true);
        window.history.pushState(null, "", "/superadmin");
      }, 600);
      return;
    }

    // 2. Individual Restaurant Tenant matching (Strict case-sensitive and spacing-sensitive lookup)
    const matchedBranch = allRestaurants.find(r => 
      r.id && r.id === userIdExact
    );

    if (matchedBranch) {
      const correctPass = matchedBranch.password || "1234";
      if (passwordExact === correctPass) {
        setLoginSuccess(`Correct! Welcome to the ${matchedBranch.name} portal.`);
        sessionStorage.setItem(`admin_role_${matchedBranch.id}`, "staff");
        setFormUserId("");
        setFormPassword("");
        setTimeout(() => {
          setLoginSuccess("");
          handleSelectRestaurant(matchedBranch.id);
        }, 600);
        return;
      }
    }

    setLoginError("INVALID PASSWORD !");
    setFormUserId("");
    setFormPassword("");
    setTimeout(() => {
      setLoginError("");
    }, 1000);
  };

  const handleSelectTableNum = (num: string) => {
    setTableId(num);
    setIsCustomerView(true);
    window.history.pushState(null, "", `/restaurant/${restaurantId}/table/${encodeURIComponent(num)}`);
  };

  const handleLeaveTable = () => {
    setTableId(null);
    setIsCustomerView(true);
    window.history.pushState(null, "", `/restaurant/${restaurantId}/menu`);
  };

  const handleToggleAdminMode = (state: boolean) => {
    setIsAdmin(state);
    setIsCustomerView(!state);
    if (state) {
      window.history.pushState(null, "", `/restaurant/${restaurantId}`);
    } else {
      setTableId(null);
      window.history.pushState(null, "", `/restaurant/${restaurantId}/menu`);
    }
  };

  // Loading indicator for database connection with absolute silk-smooth layout
  if (isDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] font-sans text-zinc-100 relative overflow-hidden" id="app-database-loader">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-zinc-900/30 rounded-full blur-[90px] pointer-events-none animate-pulse" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center gap-5 relative z-10 text-center"
        >
          <div className="relative flex justify-center items-center h-16 w-16">
            <div className="absolute h-12 w-12 rounded-full border-2 border-zinc-800 border-t-zinc-200 animate-spin" />
            <div className="absolute h-7 w-7 rounded-full border border-zinc-900 border-b-zinc-550 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }} />
          </div>
          <div className="space-y-1 mt-2">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-400 select-none">
              Loading
            </p>
            <p className="font-sans text-[10px] text-zinc-650 tracking-normal select-none">
              Syncing with foodcourt network
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // 1. GLOBAL SUPER ADMIN CONSOLE MATCH
  if (isSuperAdmin) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="min-h-screen bg-[#050505]"
      >
        <SuperAdminConsole 
          allRestaurants={allRestaurants}
          onBackToMain={() => {
            setIsSuperAdmin(false);
            setFormUserId("");
            setFormPassword("");
            window.history.pushState(null, "", "/");
          }} 
          onLaunchLocalBranch={(slug) => {
            sessionStorage.setItem(`admin_role_${slug}`, "superadmin");
            sessionStorage.setItem(`isAdminBypass_${slug}`, "true");
            setRestaurantId(slug);
            setIsAdmin(true);
            setIsCustomerView(false);
            setTableId(null);
            setIsSuperAdmin(false);
            setIsRestaurantDisabled(false); // Reset disabled state temporarily
            window.history.pushState(null, "", `/restaurant/${slug}`);
          }}
        />
      </motion.div>
    );
  }

  // 2. ROOT SaaS DIRECTORY SELECTOR VIEW
  if (!restaurantId) {
    return (
      <div className="flex min-h-screen flex-col bg-[#050505] font-sans text-zinc-100 relative overflow-hidden" id="saas-homepage">
        {/* Subtle glowing halo backgrounds */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-zinc-950 rounded-full blur-[100px] pointer-events-none" />

        <header className="max-w-7xl mx-auto w-full px-8 py-5 flex items-center justify-between border-b border-zinc-900/60 z-10 bg-[#050505]/80 backdrop-blur-md sticky top-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white flex items-center justify-center rounded-xl shadow-lg shrink-0">
              <span className="text-black font-black text-xl">F</span>
            </div>
            <div>
              <span className="font-serif italic font-bold text-lg text-white">Foodcourt Hub</span>
              <span className="ml-1.5 rounded-md bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 font-mono text-[8px] font-bold text-zinc-500 uppercase tracking-widest">
                SaaS System
              </span>
            </div>
          </div>
        </header>

        <main className="flex-grow max-w-4xl mx-auto w-full px-8 pt-6 pb-16 flex flex-col items-center justify-center -mt-6 sm:-mt-12 z-10 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-serif italic text-4xl sm:text-5xl text-white tracking-tight leading-normal">
              Foodcourt
            </h2>
            <p className="text-sm text-zinc-500 font-sans">
              Welcome to Foodcourt
            </p>
          </div>

          {/* HIGH-CONTRAST SECURE LOGIN TERMINAL */}
          <div className="w-full max-w-md rounded-3xl border border-zinc-900 bg-[#0a0a0c] p-6 sm:p-8 shadow-2xl relative space-y-6">
            <div className="space-y-1 text-center border-b border-zinc-900 pb-4">
              <h3 className="font-serif italic text-2xl text-white">Credentials</h3>
              {loginError ? (
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-rose-500 font-bold animate-pulse">
                  {loginError}
                </p>
              ) : loginSuccess ? (
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-emerald-500 font-bold animate-pulse">
                  {loginSuccess}
                </p>
              ) : (
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">
                  Provide credentials below
                </p>
              )}
            </div>

            <form onSubmit={handleGatewayLogin} className="space-y-4">
              {/* ID IDENTITY INPUT */}
              <div className="space-y-1 text-left">
                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 block">ID Identity</label>
                <div className="relative">
                  <input
                    type={showFormUserId ? "text" : "password"}
                    required
                    placeholder="ID Identity"
                    value={formUserId}
                    onChange={(e) => setFormUserId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-4 pr-12 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-650"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormUserId(!showFormUserId)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                    title={showFormUserId ? "Hide ID" : "Show ID"}
                  >
                    {showFormUserId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* PASSWORD INPUT */}
              <div className="space-y-1 text-left">
                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 block">Secret Passkey</label>
                <input
                  type="password"
                  required
                  placeholder="Secret Passkey"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-800 focus:outline-none focus:border-indigo-650 font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-zinc-100 hover:bg-white text-black font-sans text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl transition-all cursor-pointer active:scale-95 shadow-md shadow-zinc-950/20 font-black mt-3 block"
              >
                PROCEED
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  // Direct access blocked for /table without table identifier or unauthorized subpaths
  if (isTablePathRestricted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 py-12 text-zinc-100 animate-fadeIn relative overflow-hidden" id="restricted-table-access">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-rose-500/10 rounded-full blur-[90px] pointer-events-none" />
        <div className="w-full max-w-md rounded-[28px] border border-rose-950/45 bg-[#0a0a0c]/90 backdrop-blur-md p-8 text-center space-y-6 shadow-2xl relative z-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-955/20 border border-rose-900/40 text-rose-500 text-xl font-bold shadow-xl">
            🔒
          </div>
          <div className="space-y-2">
            <h1 className="font-serif italic text-2xl text-rose-400 tracking-tight leading-normal">Direct Access Restricted</h1>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-sans">
              To browse menus and place orders, you must scan the physical QR code located on your table. Live operator dashboards and settings require credentials verification from the official login portal.
            </p>
          </div>
          <button
            onClick={() => {
              setIsTablePathRestricted(false);
              window.history.pushState(null, "", "/restaurant");
              window.dispatchEvent(new Event("popstate"));
            }}
            className="w-full bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 hover:text-white font-sans text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl transition-all cursor-pointer block active:scale-95 duration-150"
          >
            Go to Restaurant Login
          </button>
        </div>
      </div>
    );
  }

  // Suspend Screen block for disabled / inactive restaurant registries
  if (restaurantId && isRestaurantDisabled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 py-12 text-zinc-100 animate-fadeIn">
        <div className="w-full max-w-md rounded-3xl border border-rose-950/45 bg-[#0a0a0c] p-8 text-center space-y-6 shadow-2xl text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-955/20 border border-rose-900/40 text-rose-500 font-extrabold text-2 shadow-xl mb-4">
            🔒
          </div>
          <div className="space-y-2">
            <h1 className="font-serif italic text-2xl text-rose-400">Branch Registry Suspended</h1>
            <p className="text-xs text-zinc-550 leading-relaxed font-sans">
              This branch registry has been suspended by the site administrator. Please contact Super Admin support.
            </p>
          </div>
          {sessionStorage.getItem("superadmin_global_auth") === "true" && (
            <button
              onClick={() => {
                setRestaurantId(null);
                setIsSuperAdmin(true);
                window.history.pushState(null, "", "/superadmin");
              }}
              className="w-full bg-zinc-100 hover:bg-white text-black font-sans text-xs font-bold uppercase tracking-wider py-3.5 rounded-xl transition-all cursor-pointer block"
            >
              Back to Superadmin Control
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. BRAND STAFF CONSOLE / LOCAL OPERATOR VIEW (Default state when clicking a restaurant)
  if (isAdmin && !isCustomerView) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="min-h-screen bg-neutral-950 text-neutral-100 font-sans"
      >
        <AdminConsole
          items={menuItems}
          categories={categories}
          orders={orders}
          bannerSettings={bannerSettings}
          onBackToMenu={() => handleToggleAdminMode(false)}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          onLogoutToLogin={() => {
            setRestaurantId(null);
            setIsAdmin(false);
            setIsCustomerView(false);
            setTableId(null);
            setFormUserId("");
            setFormPassword("");
            window.history.pushState(null, "", "/");
          }}
          onBackToSuperAdmin={sessionStorage.getItem("superadmin_global_auth") === "true" ? () => {
            setRestaurantId(null);
            setIsSuperAdmin(true);
            setIsAdmin(false);
            window.history.pushState(null, "", "/superadmin");
          } : undefined}
        />
      </motion.div>
    );
  }

  // 4. USER TABLE SELECTOR VIEW
  if (!tableId) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="min-h-screen bg-[#050505]"
      >
        <TableSelector 
          onSelectTable={handleSelectTableNum} 
          restaurantName={restaurantName} 
        />
      </motion.div>
    );
  }

  // 5. USER SEATED MENU AND START ORDERING VIEW
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col"
    >
      <ClientMenu
        tableId={tableId}
        items={menuItems}
        categories={categories}
        orders={orders}
        bannerSettings={bannerSettings}
        onBackToTableSelect={handleLeaveTable}
        onGoToAdmin={() => handleToggleAdminMode(true)}
        restaurantId={restaurantId}
        restaurantName={restaurantName}
      />
    </motion.div>
  );
}
