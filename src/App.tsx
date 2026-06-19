/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { MenuItem, Order, BannerSettings, Category } from "./types";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { collection, doc, onSnapshot, setDoc, query, where } from "firebase/firestore";
import TableSelector from "./components/TableSelector";
import ClientMenu from "./components/ClientMenu";
import AdminConsole from "./components/AdminConsole";
import SuperAdminConsole from "./components/SuperAdminConsole";
import { Loader, Store, Shield, ArrowRight, Eye, EyeOff, Menu, X, ChevronRight, Sparkles, Check, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
  const [upiPermitted, setUpiPermitted] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [upiEnabled, setUpiEnabled] = useState(false);
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
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [heroImageIndex, setHeroImageIndex] = useState(0);

  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [signupLink, setSignupLink] = useState("");
  const [signupDetails, setSignupDetails] = useState("");

  // Sync signup details
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "signup"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setSignupLink(d.link || "");
        setSignupDetails(d.details || "");
      }
    });
    return unsub;
  }, []);

  const HERO_IMAGES = [
    "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=2000&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=2000&auto=format&fit=crop",
  ];

  // Custom slow-fast-slow smooth scroll function
  const customSmoothScrollTo = (targetElement: Element) => {
    const startY = window.pageYOffset;
    const rect = targetElement.getBoundingClientRect();
    const targetY = startY + rect.top;
    const distance = targetY - startY;
    const duration = 1500; // 1.5s smooth custom scroll
    let startTimestamp: number | null = null;
    
    // easeInOutCubic
    const easeInOutCubic = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeProgress = easeInOutCubic(progress);
      
      window.scrollTo(0, startY + distance * easeProgress);
      
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  };

  // Hero background image crossfader
  useEffect(() => {
    if (restaurantId) return;
    const interval = setInterval(() => {
      setHeroImageIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 2500); 
    return () => clearInterval(interval);
  }, [restaurantId]);

  // Auto-scroller every 3 seconds
  useEffect(() => {
    if (restaurantId) return;
    const autoScroll = setInterval(() => {
      const sections = document.querySelectorAll('.saas-section');
      let currentSectionIndex = -1;
      
      sections.forEach((sec, idx) => {
        const rect = sec.getBoundingClientRect();
        // Identify which section is currently active in the viewport
        if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
          currentSectionIndex = idx;
        }
      });

      if (currentSectionIndex !== -1 && currentSectionIndex < sections.length - 1) {
        customSmoothScrollTo(sections[currentSectionIndex + 1]);
      } else if (currentSectionIndex === sections.length - 1) {
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Return to top
      }
    }, 3000); 
    return () => clearInterval(autoScroll);
  }, [restaurantId]);

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
        setUpiPermitted(!!d.upiPermitted);
        setUpiId(d.upiId || "");
        setUpiEnabled(!!d.upiEnabled);
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
        setUpiPermitted(false);
        setUpiId("");
        setUpiEnabled(false);
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
    if (isAdmin || isCustomerView || tableId) {
      // Both admin and table mode require viewing all orders to synchronize popularity state and same views
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
            paymentMode: d.paymentMode || "CASH",
            paymentStatus: d.paymentStatus || "pending",
            upiTransactionId: d.upiTransactionId || "",
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
  }, [restaurantId, isAdmin, isCustomerView, tableId]);

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
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900/40 to-transparent rounded-full pointer-events-none animate-pulse" />
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
      <div className="flex flex-col bg-[#050505] font-sans text-zinc-100 relative overflow-x-hidden w-full" id="saas-homepage">
        
        {/* Dynamic Abstract Background Base */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <AnimatePresence mode="popLayout">
            <motion.img 
              key={heroImageIndex}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 0.15, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              src={HERO_IMAGES[heroImageIndex]} 
              alt="Background" 
              className="absolute inset-0 w-full h-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute top-0 w-full h-[500px] bg-gradient-to-b from-black via-[#050505]/90 to-transparent z-0" />
          <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/10 to-transparent rounded-full pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 to-transparent rounded-full pointer-events-none" />
        </div>

        <header className="fixed top-0 w-full px-6 py-6 flex items-center justify-between z-30 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm pointer-events-none">
          <div className="flex items-center gap-4 pointer-events-auto">
            <button 
              onClick={() => setIsNavOpen(!isNavOpen)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors backdrop-blur-md border border-white/5 bg-black/40"
            >
              <Menu className="w-5 h-5 text-white" />
            </button>
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-2"
            >
               <span className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-600 rounded-lg flex items-center justify-center font-serif font-black text-black">F</span>
               <span className="font-serif italic font-bold text-xl tracking-tight text-white shadow-black/50 drop-shadow-md">Foodcourt</span>
            </motion.div>
          </div>

          <motion.div
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ delay: 0.2 }}
             className="pointer-events-auto flex items-center gap-4"
          >
             <button onClick={() => setIsLoginModalOpen(true)} className="text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors cursor-pointer hidden sm:block">
                Log In
             </button>
             <button onClick={() => setIsSignupModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 text-white cursor-pointer">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 hidden sm:block" />
                Sign Up
             </button>
          </motion.div>
        </header>

        {/* Interactive Side Menu Overlay */}
        <AnimatePresence>
          {isNavOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsNavOpen(false)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="fixed left-0 top-0 bottom-0 w-80 sm:w-96 bg-[#0a0a0c]/90 backdrop-blur-xl border-r border-white/10 z-50 p-8 flex flex-col overflow-y-auto"
              >
                <div className="flex justify-between items-center mb-12 shrink-0">
                  <span className="font-serif italic font-bold text-2xl text-white">Menu</span>
                  <button onClick={() => setIsNavOpen(false)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <X className="w-5 h-5 text-zinc-400" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2">
                  <nav className="flex flex-col gap-6 mb-12">
                    {["Discover Hubs", "Partner Program", "Enterprise Logistics", "Help & Support"].map((item, i) => (
                      <motion.a 
                        key={item}
                        href="#"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + (i * 0.05) }}
                        className="text-xl sm:text-2xl font-serif text-zinc-400 hover:text-white hover:translate-x-2 transition-all flex items-center justify-between group"
                      >
                        {item}
                        <ChevronRight className="w-5 h-5 opacity-0 group-hover:opacity-100 text-amber-500 transition-opacity" />
                      </motion.a>
                    ))}
                  </nav>


                </div>

                <div className="mt-6 shrink-0 pt-4 border-t border-white/5">
                   <p className="text-[10px] text-zinc-600 font-mono text-center">v2.1.0-secure.build</p>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <main className="flex flex-col relative z-10 w-full pt-16">
          
          {/* Scroll Section 1 - Hero */}
          <section className="saas-section min-h-[90vh] flex items-center justify-center px-4 sm:px-8 relative w-full pb-20">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
              className="w-full max-w-5xl mx-auto flex flex-col items-center text-center gap-8"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, delay: 0.5 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-md text-[10px] sm:text-xs uppercase tracking-widest text-zinc-300 font-mono"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                System Online & Ready
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.6 }}
                className="text-5xl sm:text-7xl lg:text-[100px] font-serif italic text-white leading-[0.95] drop-shadow-2xl px-4"
              >
                Join with us.<br/>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500 pb-2 inline-block">
                  Build the future.
                </span>
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.7 }}
                className="text-lg sm:text-xl text-zinc-400 font-sans max-w-2xl mx-auto leading-relaxed drop-shadow-md px-4"
              >
                Experience seamless multi-tenant orchestration with our high-performance SaaS gateway. Build, manage, and scale your restaurant ecosystem instantly.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.9 }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-zinc-500"
              >
                <span className="text-[10px] uppercase font-mono tracking-widest">Scroll to explore</span>
                <motion.div 
                  animate={{ y: [0, 10, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="w-px h-12 bg-gradient-to-b from-amber-500/50 to-transparent"
                />
              </motion.div>
            </motion.div>
          </section>

          {/* Scroll Section 2 - Features with Images */}
          <section className="saas-section min-h-screen flex items-center justify-center px-4 sm:px-8 py-24 relative w-full border-t border-white/5 bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
              <motion.div 
                initial={{ opacity: 0, x: -40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="space-y-6"
              >
                <h2 className="text-4xl sm:text-5xl font-serif italic text-white drop-shadow-lg">
                  Unified <span className="text-amber-500">Command</span>
                </h2>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Monitor all your branches from a single panoramic display. Get real-time updates on orders, staff performance, and revenue across multiple locations without missing a beat.
                </p>
                <ul className="space-y-4 pt-4">
                  {[
                    "Live revenue streaming & tracking",
                    "Deep-dive analytics per location",
                    "Instant menu deployments"
                  ].map((feature, idx) => (
                    <motion.li 
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + (idx * 0.1) }}
                      className="flex items-center gap-3 text-white text-sm sm:text-base font-medium"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {feature}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, scale: 0.9, rotateX: 20 }}
                whileInView={{ opacity: 1, scale: 1, rotateX: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="relative rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_80px_-20px_rgba(245,158,11,0.2)] group"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10" />
                <img 
                  src="https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=1200&auto=format&fit=crop" 
                  alt="Restaurant Terminal" 
                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-1000"
                />
                <div className="absolute bottom-6 left-6 right-6 z-20">
                  <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                      <p className="text-white font-bold">Total Revenue</p>
                      <p className="text-amber-400 font-mono text-sm">+24.5% Today</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-serif italic text-white">$12,480</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Scroll Section 3 - Dynamic Operations with Parallaxing Images */}
          <section className="saas-section min-h-screen flex items-center justify-center px-4 sm:px-8 py-24 relative w-full border-t border-white/5 bg-black/60 backdrop-blur-md">
            <div className="w-full max-w-6xl mx-auto flex flex-col items-center">
              
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="text-center mb-16 space-y-4"
              >
                <h2 className="text-4xl sm:text-6xl font-serif italic text-white drop-shadow-lg">
                  Symphony of <span className="text-emerald-500">Service</span>
                </h2>
                <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                  Watch your kitchen orchestrate high-volume demands with precision algorithms. The magic happens behind the scenes, visually represented below.
                </p>
              </motion.div>

              <div className="grid md:grid-cols-3 gap-8 w-full mt-8">
                {[
                  {
                    img: "https://images.unsplash.com/photo-1556740758-90de374c12ad?q=80&w=800&auto=format&fit=crop",
                    title: "Automated Kiosks",
                    delay: 0.1
                  },
                  {
                    img: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop",
                    title: "Kitchen Routing",
                    delay: 0.3
                  },
                  {
                    img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop",
                    title: "Table Insights",
                    delay: 0.5
                  }
                ].map((block, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 50 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.8, delay: block.delay, ease: "easeOut" }}
                    className="group relative rounded-3xl overflow-hidden aspect-[3/4] border border-white/10"
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent z-10 opacity-80" />
                    <motion.img 
                      whileHover={{ scale: 1.1 }}
                      transition={{ duration: 0.4 }}
                      src={block.img}
                      className="absolute inset-0 w-full h-full object-cover transform scale-105"
                    />
                    <div className="absolute bottom-6 left-6 z-20">
                      <h3 className="font-serif italic text-white text-2xl translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                        {block.title}
                      </h3>
                      <div className="w-8 h-1 bg-amber-500 mt-2 rounded-full transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-300 delay-100" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Scroll Section 4 - Abstract Visuals */}
          <section className="saas-section min-h-screen flex items-center justify-center px-4 sm:px-8 py-24 relative w-full overflow-hidden">
            <motion.div 
              initial={{ scale: 1.2, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="absolute inset-0 z-0"
            >
              <img 
                src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=2000&auto=format&fit=crop" 
                className="w-full h-full object-cover opacity-20 sepia-[0.3]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/50 to-[#050505]" />
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative z-10 text-center max-w-4xl mx-auto space-y-8"
            >
              <h2 className="text-5xl sm:text-7xl font-serif italic text-white leading-tight">
                Crafted for  <br/> <span className="bg-clip-text text-transparent bg-gradient-to-r from-zinc-300 to-zinc-600">Perfection</span>
              </h2>
              <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
                No cluttered interfaces. No training required. Our platform is organically designed to match the speed of your kitchen and the simplicity of pen and paper, supercharged with AI.
              </p>
            </motion.div>
          </section>

          {/* Scroll Section 5 - Data & Scale */}
          <section className="saas-section min-h-screen flex items-center justify-center px-4 sm:px-8 py-24 relative w-full bg-[#050505]">
            <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row-reverse gap-16 items-center">
              <motion.div 
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="flex-1 space-y-6"
              >
                <h2 className="text-4xl sm:text-5xl font-serif italic text-white drop-shadow-lg">
                  Unprecedented <span className="text-indigo-400">Scale.</span>
                </h2>
                <p className="text-zinc-400 text-lg leading-relaxed">
                  Manage 10 to 1,000 locations seamlessly. Our global decentralized infrastructure ensures 99.99% uptime, keeping your transactions flowing even during peak hours.
                </p>
                <div className="grid grid-cols-2 gap-6 pt-6">
                  <div>
                    <h4 className="text-3xl font-serif text-white italic">0ms</h4>
                    <p className="text-sm text-zinc-500 font-mono mt-1">Data Latency</p>
                  </div>
                  <div>
                    <h4 className="text-3xl font-serif text-white italic">1M+</h4>
                    <p className="text-sm text-zinc-500 font-mono mt-1">Daily Orders</p>
                  </div>
                </div>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, rotateY: -20 }}
                whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="flex-1 relative rounded-3xl overflow-hidden border border-white/5 shadow-[0_0_80px_-20px_rgba(99,102,241,0.15)] group min-h-[400px] bg-[#0a0a0c] flex items-center justify-center"
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-transparent z-0" />
                <div className="relative z-10 w-full p-8 flex flex-col gap-4">
                  {[40, 70, 45, 90, 60].map((h, i) => (
                    <div key={i} className="flex items-end gap-4 w-full h-8 group-hover:gap-6 transition-all duration-500">
                      <div className="text-xs font-mono text-zinc-500 w-8">T-{h}</div>
                      <motion.div 
                        initial={{ width: 0 }}
                        whileInView={{ width: `${h}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 1, delay: 0.2 + (i * 0.1) }}
                        className="h-full bg-gradient-to-r from-indigo-500/50 to-indigo-400 rounded-r-sm"
                      />
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </section>

          {/* Scroll Section 6 - Seamless Integrations */}
          <section className="saas-section min-h-screen flex items-center justify-center px-4 sm:px-8 py-24 relative w-full border-t border-white/5 bg-black/40 backdrop-blur-md">
            <div className="w-full max-w-6xl mx-auto flex flex-col items-center">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="text-center mb-16 space-y-4"
              >
                <h2 className="text-4xl sm:text-6xl font-serif italic text-white drop-shadow-lg">
                  Universal <span className="text-sky-400">Connectivity</span>
                </h2>
                <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                  Plug into delivery networks, accounting software, and inventory suppliers with one click.
                </p>
              </motion.div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full max-w-4xl">
                {[
                  "Delivery Apps", "Payment Gateways", "Global Suppliers", "Tax Authorities", 
                  "IoT Devices", "HR Systems", "Marketing CRMs", "Analytics Tools"
                ].map((item, i) => (
                  <motion.div
                    key={item}
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.1)" }}
                    className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] flex items-center justify-center text-center backdrop-blur-md cursor-pointer transition-colors"
                  >
                    <span className="text-zinc-300 font-mono text-xs uppercase tracking-widest">{item}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Scroll Section 7 - CTA */}
          <section className="saas-section min-h-screen flex items-center justify-center px-4 sm:px-8 py-24 relative w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 via-black to-black" />
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="relative z-10 text-center max-w-4xl mx-auto space-y-8"
            >
              <h2 className="text-6xl sm:text-8xl font-serif italic text-white leading-tight">
                Ready to <br/> <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-orange-500">Transform?</span>
              </h2>
              
              <div className="pt-12 flex flex-col sm:flex-row items-center justify-center gap-6">
                <button onClick={() => setIsSignupModalOpen(true)} className="w-full sm:w-auto px-8 py-4 rounded-full bg-white text-black font-bold uppercase tracking-widest text-sm hover:scale-105 transition-transform flex items-center justify-center gap-3 group">
                  <Sparkles className="w-5 h-5 text-amber-500 group-hover:scale-110 transition-transform" />
                  Create New Account
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform opacity-50" />
                </button>
              </div>
            </motion.div>
          </section>

        </main>

        {/* Signup Modal Overlay */}
        <AnimatePresence>
          {isSignupModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-8 shadow-2xl overflow-hidden"
              >
                <div className="absolute top-4 right-4">
                  <button 
                    onClick={() => {
                      setIsSignupModalOpen(false);
                    }}
                    className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-amber-500 mb-2">
                      <Store className="w-5 h-5" />
                      <span className="font-mono text-[10px] uppercase tracking-widest">Connect Workspace</span>
                    </div>
                    <h3 className="text-3xl font-serif italic text-white">Join the Network</h3>
                    <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-wrap">
                      {signupDetails || "Please complete the registration form to request a new decentralized branch database."}
                    </p>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-amber-200/80">
                     <Shield className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                     <div className="text-xs">
                       <strong className="block text-amber-500 mb-1">Verification Required</strong>
                       Every tenant workspace undergoes manual setup and security clearance before gaining network access.
                     </div>
                  </div>
                  
                  <div className="pt-4 flex flex-col gap-3">
                    <a 
                      href={signupLink || "#"} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (!signupLink) {
                          e.preventDefault();
                          alert("Signup link is not currently configured by the admin.");
                        }
                      }}
                      className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg ${
                        signupLink 
                          ? "bg-amber-500 text-black hover:bg-amber-400 active:scale-95 cursor-pointer" 
                          : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      }`}
                    >
                      Proceed to Form <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Login Modal Overlay */}
        <AnimatePresence>
          {isLoginModalOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-8 shadow-2xl overflow-hidden"
              >
                <div className="absolute top-4 right-4 z-10">
                  <button 
                    onClick={() => {
                      setIsLoginModalOpen(false);
                      setFormUserId("");
                      setFormPassword("");
                      setLoginError("");
                      setLoginSuccess("");
                    }}
                    className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-6 relative z-0">
                  <div className="space-y-2">
                    <h3 className="font-serif italic text-3xl text-white">Authorized Access</h3>
                    {loginError ? (
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-rose-400 font-bold animate-pulse">
                        {loginError}
                      </p>
                    ) : loginSuccess ? (
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-emerald-400 font-bold animate-pulse">
                        {loginSuccess}
                      </p>
                    ) : (
                      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">
                        Workspace Login
                      </p>
                    )}
                  </div>
                  
                  <form onSubmit={handleGatewayLogin} className="space-y-4">
                    {/* ID IDENTITY INPUT */}
                    <div className="space-y-1.5 flex flex-col">
                      <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 ml-1">Workspace ID</label>
                      <div className="relative group/input">
                        <input
                          type={showFormUserId ? "text" : "password"}
                          required
                          placeholder="Store / Admin ID"
                          value={formUserId}
                          onChange={(e) => setFormUserId(e.target.value)}
                          className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:bg-black/80 transition-all font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowFormUserId(!showFormUserId)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors p-1 cursor-pointer"
                        >
                          {showFormUserId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* PASSWORD INPUT */}
                    <div className="space-y-1.5 flex flex-col">
                      <label className="font-mono text-[9px] uppercase tracking-widest text-zinc-400 ml-1">Secret Key</label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        className="w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:bg-black/80 transition-all font-mono"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-white hover:bg-zinc-200 text-black font-sans text-xs font-black uppercase tracking-widest py-3 hover:py-4 rounded-xl transition-all cursor-pointer active:scale-[0.98] mt-4 flex items-center justify-center gap-2 group/btn relative overflow-hidden"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        Authenticate
                        <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                      </span>
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-[200%] group-hover/btn:translate-x-[200%] transition-transform duration-700 ease-in-out" />
                    </button>
                  </form>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    );
  }

  // Direct access blocked for /table without table identifier or unauthorized subpaths
  if (isTablePathRestricted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 py-12 text-zinc-100 animate-fadeIn relative overflow-hidden" id="restricted-table-access">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-rose-500/20 to-transparent rounded-full pointer-events-none" />
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
          upiPermitted={upiPermitted}
          upiId={upiId}
          upiEnabled={upiEnabled}
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
        upiPermitted={upiPermitted}
        upiId={upiId}
        upiEnabled={upiEnabled}
      />
    </motion.div>
  );
}
