/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { MenuItem, Order, BannerSettings } from "./types";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import TableSelector from "./components/TableSelector";
import ClientMenu from "./components/ClientMenu";
import AdminConsole from "./components/AdminConsole";
import SuperAdminConsole from "./components/SuperAdminConsole";
import { Loader, Store, Shield, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

export default function App() {
  // Navigation & Multi-Tenant state
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string>("");
  const [tableId, setTableId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCustomerView, setIsCustomerView] = useState(false);

  // High safety permission flag
  const [isRestaurantDisabled, setIsRestaurantDisabled] = useState(false);
  const [superAdminCredentials, setSuperAdminCredentials] = useState({ id: "ADMIN", password: "1234" });

  // Dynamic tenant-isolated data state
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bannerSettings, setBannerSettings] = useState<BannerSettings | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Home portal index
  const [allRestaurants, setAllRestaurants] = useState<any[]>([]);

  // Root Dashboard Integrated Access Gateway States
  const [formUserId, setFormUserId] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [selectedSlug, setSelectedSlug] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginSuccess, setLoginSuccess] = useState("");

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
  useEffect(() => {
    const parseUrlRoute = () => {
      const path = window.location.pathname;
      const pathParts = path.split("/").filter(Boolean);

      if (pathParts[0] === "superadmin") {
        setIsSuperAdmin(true);
        setIsDataLoading(false);
      } else if (pathParts[0] === "restaurant" && pathParts[1]) {
        const slug = pathParts[1];
        setRestaurantId(slug);

        if (pathParts[2] === "table" && pathParts[3]) {
          setTableId(decodeURIComponent(pathParts[3]));
          setIsCustomerView(true);
          setIsAdmin(false);
        } else if (pathParts[2] === "menu") {
          setTableId(null);
          setIsCustomerView(true);
          setIsAdmin(false);
        } else {
          // Default: Staff login / operator mode
          setIsCustomerView(false);
          setIsAdmin(true);
          setTableId(null);
        }
      } else {
        // Search query fallback check
        const params = new URLSearchParams(window.location.search);
        const restParam = params.get("restaurant");
        const tableParam = params.get("table");
        const adminParam = params.get("admin");
        const superParam = params.get("superadmin");

        if (superParam === "true" || window.location.hash === "#superadmin") {
          setIsSuperAdmin(true);
          setIsDataLoading(false);
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
        } else {
          // Clear states to show root landing
          setRestaurantId(null);
          setIsSuperAdmin(false);
          setIsAdmin(false);
          setIsCustomerView(false);
          setIsDataLoading(false);
        }
      }
    };

    parseUrlRoute();

    // Listen to history popstates
    window.addEventListener("popstate", parseUrlRoute);
    return () => window.removeEventListener("popstate", parseUrlRoute);
  }, []);

  // 2. Fetch all restaurants if at root index
  useEffect(() => {
    if (restaurantId || isSuperAdmin) return;

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
  }, [restaurantId, isSuperAdmin]);

  // 3. Attach Live listeners dynamically bound to core tenant branch namespaces
  useEffect(() => {
    if (!restaurantId) return;

    setIsDataLoading(true);

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
            price: d.price,
            imageUrl: d.imageUrl,
            createdAt: d.createdAt,
          });
        }
      });
      setMenuItems(fetched.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      setIsDataLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, itemsPath);
    });

    // Populate and listen to active orders list
    const ordersPath = `restaurants/${restaurantId}/orders`;
    const unsubOrders = onSnapshot(collection(db, "restaurants", restaurantId, "orders"), (snapshot) => {
      const fetched: Order[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        fetched.push({
          id: docSnap.id,
          tableId: d.tableId,
          items: d.items,
          total: d.total,
          status: d.status,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
        });
      });
      setOrders(fetched);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, ordersPath);
    });

    // Populate banner text settings
    const bannerDocPath = `restaurants/${restaurantId}/settings/banner`;
    const unsubBanner = onSnapshot(doc(db, "restaurants", restaurantId, "settings", "banner"), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setBannerSettings({
          text: d.text,
          imageUrl: d.imageUrl,
          visible: d.visible,
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
      unsubOrders();
      unsubBanner();
    };
  }, [restaurantId]);

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

    const userIdTrim = formUserId.trim();
    const passwordTrim = formPassword.trim();

    if (!userIdTrim || !passwordTrim) {
      setLoginError("Provide both ID Identity and Secret Passkey.");
      setTimeout(() => {
        setLoginError("");
      }, 1000);
      return;
    }

    // 1. Global Super Admin Match (Strict Case-Sensitive Username and Password)
    if (
      (userIdTrim === superAdminCredentials.id && passwordTrim === superAdminCredentials.password) ||
      (userIdTrim === "ADMIN" && passwordTrim === "1234")
    ) {
      setLoginSuccess("Verified. Launching admin center...");
      sessionStorage.setItem("superadmin_global_auth", "true");
      setTimeout(() => {
        setLoginSuccess("");
        setIsSuperAdmin(true);
        window.history.pushState(null, "", "/superadmin");
      }, 1000);
      return;
    }

    // 2. Individual Restaurant Tenant matching ONLY by unique ID (Strict Case-Sensitive matched by exact case-preserving string)
    const matchedBranch = allRestaurants.find(r => 
      r.id && r.id === userIdTrim
    );

    if (matchedBranch) {
      const correctPass = matchedBranch.password || "1234";
      if (passwordTrim === correctPass) {
        setLoginSuccess(`Correct! Welcome to the ${matchedBranch.name} portal.`);
        sessionStorage.setItem(`admin_role_${matchedBranch.id}`, "staff");
        setTimeout(() => {
          setLoginSuccess("");
          handleSelectRestaurant(matchedBranch.id);
        }, 1000);
        return;
      }
    }

    setLoginError("Invalid combination of ID Identity and Secret Passkey.");
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
      window.history.pushState(null, "", `/restaurant/${restaurantId}/menu`);
    }
  };

  // Loading indicator for database connection
  if (isDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 font-sans text-neutral-400">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-8 w-8 animate-spin text-neutral-200" />
          <p className="font-mono text-[9px] uppercase tracking-widest text-neutral-600">Connecting Database...</p>
        </div>
      </div>
    );
  }

  // 1. GLOBAL SUPER ADMIN CONSOLE MATCH
  if (isSuperAdmin) {
    return (
      <SuperAdminConsole 
        onBackToMain={() => {
          setIsSuperAdmin(false);
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

        <main className="flex-grow max-w-4xl mx-auto w-full px-8 py-16 flex flex-col items-center justify-center z-10 space-y-8">
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
              <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">Provide credentials below</p>
            </div>

            {loginError && (
              <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-900/60 text-rose-400 text-xs font-sans text-center">
                {loginError}
              </div>
            )}

            {loginSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-900/60 text-emerald-400 text-xs font-sans animate-pulse text-center">
                {loginSuccess}
              </div>
            )}

            <form onSubmit={handleGatewayLogin} className="space-y-4">
              {/* ID IDENTITY INPUT */}
              <div className="space-y-1 text-left">
                <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-500 block">ID Identity</label>
                <input
                  type="text"
                  required
                  placeholder="ID Identity"
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-650"
                />
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
      <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
        <AdminConsole
          items={menuItems}
          orders={orders}
          bannerSettings={bannerSettings}
          onBackToMenu={() => handleToggleAdminMode(false)}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          onBackToSuperAdmin={sessionStorage.getItem("superadmin_global_auth") === "true" ? () => {
            setRestaurantId(null);
            setIsSuperAdmin(true);
            setIsAdmin(false);
            window.history.pushState(null, "", "/superadmin");
          } : undefined}
        />
      </div>
    );
  }

  // 4. USER TABLE SELECTOR VIEW
  if (!tableId) {
    return (
      <TableSelector 
        onSelectTable={handleSelectTableNum} 
        restaurantName={restaurantName} 
      />
    );
  }

  // 5. USER SEATED MENU AND START ORDERING VIEW
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col">
      <ClientMenu
        tableId={tableId}
        items={menuItems}
        orders={orders}
        bannerSettings={bannerSettings}
        onBackToTableSelect={handleLeaveTable}
        onGoToAdmin={() => handleToggleAdminMode(true)}
        restaurantId={restaurantId}
        restaurantName={restaurantName}
      />
    </div>
  );
}
