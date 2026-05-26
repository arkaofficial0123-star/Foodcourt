/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { MenuItem, Order, BannerSettings } from "./types";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { collection, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import Banner from "./components/Banner";
import TableSelector from "./components/TableSelector";
import ClientMenu from "./components/ClientMenu";
import AdminConsole from "./components/AdminConsole";
import { Loader } from "lucide-react";

// Pre-configured rich mockup catalog to instantly populate empty stores
const INITIAL_CATALOG: Omit<MenuItem, "id">[] = [
  {
    name: "Classic Shoyu Ramen",
    price: 14.50,
    imageUrl: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&q=80&w=600",
    createdAt: new Date().toISOString()
  },
  {
    name: "Spicy Salmon Crunch Roll",
    price: 13.00,
    imageUrl: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&q=80&w=600",
    createdAt: new Date().toISOString()
  },
  {
    name: "Pan Fried Pork Gyoza",
    price: 8.50,
    imageUrl: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&q=80&w=600",
    createdAt: new Date().toISOString()
  },
  {
    name: "Matcha Crepe Lava Cake",
    price: 9.00,
    imageUrl: "https://images.unsplash.com/photo-1536680465769-2365207b035e?auto=format&fit=crop&q=80&w=600",
    createdAt: new Date().toISOString()
  },
  {
    name: "Hibiscus Yuzu Charcoal Soda",
    price: 6.00,
    imageUrl: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=600",
    createdAt: new Date().toISOString()
  }
];

const INITIAL_BANNER: BannerSettings = {
  text: "🏮 Sakura Club Diner: Tap dishes to append them to your order sheet. Fast kitchen delivery directly to your seat!",
  imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=600",
  visible: true,
  updatedAt: new Date().toISOString()
};

export default function App() {
  const [tableId, setTableId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Real-time database synchronizations
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bannerSettings, setBannerSettings] = useState<BannerSettings | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);

  // 1. Parse Seating Table Number and View Routings from URL path or local Storage
  useEffect(() => {
    // Parse pathname e.g. "/table/T-5" or "/admin"
    const path = window.location.pathname;
    const pathParts = path.split("/").filter(Boolean);

    if (pathParts[0] === "table" && pathParts[1]) {
      const detectedId = decodeURIComponent(pathParts[1]);
      setTableId(detectedId);
      localStorage.setItem("qr_table_id", detectedId);
    } else if (pathParts[0] === "admin") {
      setIsAdmin(true);
    } else {
      // Fallback check: Search Query params (e.g. "?table=T-2")
      const params = new URLSearchParams(window.location.search);
      const tableParam = params.get("table");
      const adminParam = params.get("admin");

      if (tableParam) {
        setTableId(tableParam);
        localStorage.setItem("qr_table_id", tableParam);
      } else if (adminParam === "true") {
        setIsAdmin(true);
      } else {
        // Fallback check: local storage cache
        const cachedTable = localStorage.getItem("qr_table_id");
        if (cachedTable) {
          setTableId(cachedTable);
        }
      }
    }
  }, []);

  // 2. Attach live Firestore Snapshot listeners for dishes, settings, and table orders
  useEffect(() => {
    const itemsPath = "items";
    const unsubItems = onSnapshot(collection(db, itemsPath), (snapshot) => {
      const fetched: MenuItem[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        fetched.push({
          id: docSnap.id,
          name: d.name,
          price: d.price,
          imageUrl: d.imageUrl,
          createdAt: d.createdAt,
        });
      });
      setMenuItems(fetched.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      setIsDataLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, itemsPath);
    });

    const ordersPath = "orders";
    const unsubOrders = onSnapshot(collection(db, ordersPath), (snapshot) => {
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

    const bannerDocPath = "settings/banner";
    const unsubBanner = onSnapshot(doc(db, "settings", "banner"), (docSnap) => {
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
      unsubItems();
      unsubOrders();
      unsubBanner();
    };
  }, []);

  // 3. Initialize default banner if not exists, but do NOT auto-seed items anymore
  useEffect(() => {
    if (!isDataLoading && !bannerSettings) {
      const initBanner = async () => {
        try {
          await setDoc(doc(db, "settings", "banner"), INITIAL_BANNER);
        } catch (err) {
          console.error("Initializing default banner error:", err);
        }
      };
      initBanner();
    }
  }, [isDataLoading, bannerSettings]);

  // Handle seating choice manually (simulates Sitting at desk)
  const handleSelectTableNum = (num: string) => {
    setTableId(num);
    localStorage.setItem("qr_table_id", num);
    // Refresh to update path or just update internal state
    window.history.pushState(null, "", `/table/${encodeURIComponent(num)}`);
  };

  const handleLeaveTable = () => {
    setTableId(null);
    localStorage.removeItem("qr_table_id");
    window.history.pushState(null, "", "/");
  };

  const handleToggleAdminMode = (state: boolean) => {
    setIsAdmin(state);
    if (state) {
      window.history.pushState(null, "", "/admin");
    } else {
      const currentTable = tableId || localStorage.getItem("qr_table_id");
      if (currentTable) {
        window.history.pushState(null, "", `/table/${encodeURIComponent(currentTable)}`);
      } else {
        window.history.pushState(null, "", "/");
      }
    }
  };

  // Loading Screen representation
  if (isDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 font-sans text-neutral-400">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-8 w-8 animate-spin text-neutral-200" />
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-600">Connecting Database...</p>
        </div>
      </div>
    );
  }

  // Choose corresponding layout based on view states
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans">
        <AdminConsole
          items={menuItems}
          orders={orders}
          bannerSettings={bannerSettings}
          onBackToMenu={() => handleToggleAdminMode(false)}
        />
      </div>
    );
  }

  if (!tableId) {
    return (
      <TableSelector onSelectTable={handleSelectTableNum} />
    );
  }

  // Active Dining Client menu route view
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col">
      <ClientMenu
        tableId={tableId}
        items={menuItems}
        orders={orders}
        bannerSettings={bannerSettings}
        onBackToTableSelect={handleLeaveTable}
        onGoToAdmin={() => handleToggleAdminMode(true)}
      />
    </div>
  );
}
