/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  db, 
  auth, 
  handleFirestoreError, 
  OperationType 
} from "../firebase";
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  getDoc,
  getDocs
} from "firebase/firestore";
import { 
  Shield, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Lock, 
  Eye, 
  EyeOff, 
  Check, 
  HelpCircle, 
  Search, 
  ArrowLeft,
  Settings,
  Store,
  KeyRound,
  Calendar,
  Sparkles,
  RefreshCw,
  LogOut,
  Mail,
  Phone,
  MapPin,
  Image as ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface RestaurantTenant {
  id: string; // URL Slug
  name: string;
  password: string;
  createdAt: string;
  isEnabled?: boolean;
  isStaffActive?: boolean;
  address?: string;
  mobile?: string;
  email?: string;
  imageUrl?: string;
}

interface SuperAdminConsoleProps {
  onBackToMain: () => void;
  onLaunchLocalBranch?: (slug: string) => void;
  allRestaurants?: any[];
}

export default function SuperAdminConsole({ onBackToMain, onLaunchLocalBranch, allRestaurants }: SuperAdminConsoleProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem("superadmin_global_auth") === "true";
  });
  const [masterPassword, setMasterPassword] = useState("");
  const [masterUsername, setMasterUsername] = useState("");
  const [successCreatedMsg, setSuccessCreatedMsg] = useState("");
  const [authError, setAuthError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // Tenant state - prewarm with loaded parent dataset to ensure absolute instant load on first click
  const [restaurants, setRestaurants] = useState<RestaurantTenant[]>(() => {
    if (allRestaurants && allRestaurants.length > 0) {
      return allRestaurants.map((r: any) => ({
        id: r.id,
        name: r.name || "",
        password: r.password || "1234",
        createdAt: r.createdAt || new Date().toISOString(),
        isEnabled: r.isEnabled !== false,
        isStaffActive: r.isStaffActive === true,
        address: r.address || "",
        mobile: r.mobile || "",
        email: r.email || "",
        imageUrl: r.imageUrl || ""
      })).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(() => {
    return !(allRestaurants && allRestaurants.length > 0);
  });

  // Dynamic panel states
  const [activePanel, setActivePanel] = useState<"list" | "register" | "globalSettings" >("list");

  // New restaurant state
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPicture, setNewPicture] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Global settings state
  const [globalAdminId, setGlobalAdminId] = useState("ADMIN");
  const [globalAdminPassword, setGlobalAdminPassword] = useState("1234");
  const [newGlobalAdminId, setNewGlobalAdminId] = useState("");
  const [newGlobalAdminPassword, setNewGlobalAdminPassword] = useState("");
  const [isUpdatingGlobalSettings, setIsUpdatingGlobalSettings] = useState(false);
  const [globalSettingsSuccess, setGlobalSettingsSuccess] = useState("");
  const [globalSettingsError, setGlobalSettingsError] = useState("");

  // Edit fields state
  const [editingRepoId, setEditingRepoId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPassword, setEditingPassword] = useState("");
  const [editingSlug, setEditingSlug] = useState("");
  const [editingAddress, setEditingAddress] = useState("");
  const [editingMobile, setEditingMobile] = useState("");
  const [editingEmail, setEditingEmail] = useState("");
  const [editingPicture, setEditingPicture] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
  const [expandedRestaurantId, setExpandedRestaurantId] = useState<string | null>(null);

  // Auto-reset all expand states & edit variables whenever active tab / panel changes or when the console is loaded/initialized.
  useEffect(() => {
    setExpandedRestaurantId(null);
    setEditingRepoId(null);
    setShowPasswords({});
    setEditingName("");
    setEditingPassword("");
    setEditingSlug("");
    setEditingAddress("");
    setEditingMobile("");
    setEditingEmail("");
    setEditingPicture("");
  }, [activePanel]);

  // Clean popstate behavior: reset any opened sub-controls to lists/defaults if browser Back/Forward occurs
  useEffect(() => {
    const handlePopState = () => {
      setExpandedRestaurantId(null);
      setEditingRepoId(null);
      setShowPasswords({});
      setActivePanel("list");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Custom delete verification state
  const [restaurantToDelete, setRestaurantToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [isWiping, setIsWiping] = useState(false);

  // Delete all verification state
  const [wipingAllModalOpen, setWipingAllModalOpen] = useState(false);
  const [allDeleteConfirmationInput, setAllDeleteConfirmationInput] = useState("");
  const [isWipingAll, setIsWipingAll] = useState(false);

  // Verify master password
  const handleVerifyMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsVerifying(true);

    try {
      // 1. Check if user is superadmin email
      if (auth.currentUser?.email === "arka.official0123" + "@gmail" + ".com") {
        sessionStorage.setItem("superadmin_global_auth", "true");
        setIsAuthenticated(true);
        setIsVerifying(false);
        return;
      }

      // 2. Check master credentials in firestore settings/security doc OR default
      const secSnap = await getDoc(doc(db, "settings", "security"));
      let allowedPass = "1234";
      let allowedId = "ADMIN";
      if (secSnap.exists()) {
        const data = secSnap.data();
        allowedPass = data.superAdminPassword || "1234";
        allowedId = data.superAdminId || "ADMIN";
      }

      const inputUser = masterUsername;
      const inputPass = masterPassword;

      if (
        inputUser === allowedId && inputPass === allowedPass
      ) {
        sessionStorage.setItem("superadmin_global_auth", "true");
        setIsAuthenticated(true);
      } else {
        setAuthError("Invalid username or password.");
        setTimeout(() => setAuthError(""), 1000);
      }
    } catch (err: any) {
      console.error("Master check failed:", err);
      setAuthError("System offline. Please check connection and try again.");
      setTimeout(() => setAuthError(""), 2000);
    } finally {
      setIsVerifying(false);
    }
  };

  // Sign out superadmin
  const handleSignOut = () => {
    sessionStorage.removeItem("superadmin_global_auth");
    setIsAuthenticated(false);
    onBackToMain();
  };

  // Dynamic global security sync
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = onSnapshot(doc(db, "settings", "security"), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setGlobalAdminId(d.superAdminId || "ADMIN");
        setGlobalAdminPassword(d.superAdminPassword || "1234");
      }
    });
    return unsub;
  }, [isAuthenticated]);

  // Subscribe to all restaurant tenants
  useEffect(() => {
    if (!isAuthenticated) return;

    const path = "restaurants";
    const unsub = onSnapshot(collection(db, path), (snapshot) => {
      const fetched: RestaurantTenant[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        fetched.push({
          id: docSnap.id,
          name: d.name || "",
          password: d.password || "1234",
          createdAt: d.createdAt || new Date().toISOString(),
          isEnabled: d.isEnabled !== false,
          isStaffActive: d.isStaffActive === true,
          address: d.address || "",
          mobile: d.mobile || "",
          email: d.email || "",
          imageUrl: d.imageUrl || ""
        });
      });
      setRestaurants(fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setIsLoading(false);
    }, (error) => {
      console.error("Firestore loading error:", error);
      setIsLoading(false);
    });

    return unsub;
  }, [isAuthenticated]);

  // Auto seed "foodcourt" branch if it does not exist
  useEffect(() => {
    if (!isAuthenticated) return;
    const checkAndSeed = async () => {
      try {
        const secRef = doc(db, "settings", "security");
        const secSnap = await getDoc(secRef);
        if (secSnap.exists() && secSnap.data().disableAutoSeed === true) {
          console.log("Auto-seeding is explicitly disabled.");
          return;
        }

        const fcRef = doc(db, "restaurants", "foodcourt");
        const snap = await getDoc(fcRef);
        if (!snap.exists()) {
          console.log("Auto-seeding default Foodcourt branch...");
          const payload = {
            name: "Foodcourt",
            password: "1234",
            createdAt: new Date().toISOString(),
            isEnabled: true
          };
          const initialItemRef = doc(db, "restaurants", "foodcourt", "items", "dummy-welcome-item");
          const bannerDocRef = doc(db, "restaurants", "foodcourt", "settings", "banner");
          
          await Promise.all([
            setDoc(fcRef, payload),
            setDoc(initialItemRef, {
              name: "Welcome Gourmet Platter",
              price: 9.50,
              imageUrl: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&q=80&w=600",
              createdAt: new Date().toISOString()
            }),
            setDoc(bannerDocRef, {
              text: `Welcome to Foodcourt! Tap dishes to populate your order sheet. Delivery directly to your table!`,
              imageUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=600",
              visible: true,
              updatedAt: new Date().toISOString()
            })
          ]);
        }
      } catch (err) {
        console.error("Auto seeding error:", err);
      }
    };
    checkAndSeed();
  }, [isAuthenticated]);

  // Handle name input change with auto slug suggestion (no spaces, no hyphens)
  const handleCompanyNameChange = (val: string) => {
    setNewName(val.toUpperCase());
    const autoSlug = val.replace(/[^a-zA-Z0-9]/g, ""); // Keep alphanumeric chars (case-preserved, absolutely no spaces, no hyphens)
    setNewSlug(autoSlug);
  };

  // Create new restaurant tenant instance with concurrent writes
  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    
    const slugClean = newSlug.trim();
    if (!slugClean) {
      setCreateError("Please enter a valid unique branch ID.");
      return;
    }

    if (/\s/.test(slugClean)) {
      setCreateError("Branch ID (username) cannot contain any spaces.");
      return;
    }

    if (slugClean.includes("/")) {
      setCreateError("Branch ID cannot contain forward slashes (/).");
      return;
    }

    if (restaurants.some(r => r.id.toLowerCase() === slugClean.toLowerCase())) {
      setCreateError(`Restaurant branch ID '${slugClean}' already exists.`);
      return;
    }

    if (!newName.trim()) {
      setCreateError("Restaurant Name is required.");
      return;
    }

    if (!newPassword.trim()) {
      setCreateError("Password is required.");
      return;
    }

    if (!newMobile.trim()) {
      setCreateError("Mobile number is required.");
      return;
    }

    // Standard Indian mobile validation: 10 digits (6-9) optionally with +91 or 91 or 0 prefix
    const cleanMobile = newMobile.replace(/[\s-]/g, "");
    if (!/^(?:(?:\+|0{0,2})91)?[6789]\d{9}$/.test(cleanMobile)) {
      setCreateError("Please enter a valid Indian mobile number (10 digits, e.g. 9876543210 or +91 9876543210).");
      return;
    }

    setIsCreating(true);
    try {
      const restRef = doc(db, "restaurants", slugClean);
      const payload = {
        name: newName.trim().toUpperCase() || "FOODCOURT",
        password: newPassword,
        address: newAddress.trim() || "",
        mobile: newMobile.trim(),
        email: newEmail.trim() || "",
        imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=600",
        createdAt: new Date().toISOString(),
        isEnabled: true
      };
      
      const initialItemRef = doc(db, "restaurants", slugClean, "items", "dummy-welcome-item");
      const bannerDocRef = doc(db, "restaurants", slugClean, "settings", "banner");

      // Concurrent write for flawless initialization without blocking
      await Promise.all([
        setDoc(restRef, payload),
        setDoc(initialItemRef, {
          name: "Welcome Gourmet Platter",
          price: 9.50,
          imageUrl: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&q=80&w=600",
          createdAt: new Date().toISOString()
        }),
        setDoc(bannerDocRef, {
          text: `Welcome to ${payload.name}! Tap dishes to populate your order sheet. Delivery directly to your table!`,
          imageUrl: payload.imageUrl,
          visible: true,
          updatedAt: new Date().toISOString()
        })
      ]);

      // Success Reset
      setNewSlug("");
      setNewName("");
      setNewPassword("");
      setNewAddress("");
      setNewMobile("");
      setNewEmail("");
      setNewPicture("");
      setSuccessCreatedMsg(`Success! Branch "${payload.name}" (ID: ${slugClean}) has been created.`);
      setActivePanel("list");
      // Auto dismiss after 2 seconds for success message
      setTimeout(() => {
        setSuccessCreatedMsg("");
      }, 2000);
    } catch (err: any) {
      console.error("Initialization error:", err);
      setCreateError("Initialization error: " + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Delete restaurant tenant instance trigger (custom modal)
  const handleDeleteRestaurant = (slug: string, name: string) => {
    setRestaurantToDelete({ id: slug, name });
    setDeleteConfirmationInput("");
  };

  // Perform backend tenant deletion safely
  const handleConfirmDelete = async () => {
    if (!restaurantToDelete) return;
    if (deleteConfirmationInput.trim().toUpperCase() !== "CONFIRM") {
      alert("Verification mismatch. Please type 'CONFIRM' to proceed.");
      return;
    }

    setIsWiping(true);
    try {
      if (restaurantToDelete.id === "foodcourt") {
        await setDoc(doc(db, "settings", "security"), { disableAutoSeed: true }, { merge: true });
      }
      await deleteDoc(doc(db, "restaurants", restaurantToDelete.id));
      setRestaurantToDelete(null);
      setDeleteConfirmationInput("");
    } catch (err: any) {
      alert("Wipe error: " + err.message);
    } finally {
      setIsWiping(false);
    }
  };

  // Perform bulk deletion of all restaurants safely
  const handleConfirmDeleteAll = async () => {
    if (allDeleteConfirmationInput.trim().toUpperCase() !== "DELETE ALL") {
      alert("Verification mismatch. Please type 'DELETE ALL' to proceed.");
      return;
    }

    setIsWipingAll(true);
    try {
      // Record permission so seeding won't recreate the default branch
      await setDoc(doc(db, "settings", "security"), { disableAutoSeed: true }, { merge: true });

      const promises = restaurants.map(async (r) => {
        try {
          await deleteDoc(doc(db, "restaurants", r.id));
        } catch (err: any) {
          handleFirestoreError(err, OperationType.DELETE, `restaurants/${r.id}`);
        }
      });
      await Promise.all(promises);
      setWipingAllModalOpen(false);
      setAllDeleteConfirmationInput("");
    } catch (err: any) {
      alert("Wipe All error: " + err.message);
    } finally {
      setIsWipingAll(false);
    }
  };

  // Save new passcode and User ID for restaurant branch
  const handleSaveBranchSettings = async (oldId: string) => {
    const slugClean = editingSlug.trim();
    const passwordClean = editingPassword;
    
    if (!slugClean) {
      alert("User ID cannot be empty.");
      return;
    }
    
    if (/[^a-zA-Z0-9]/.test(slugClean)) {
      alert("User ID can only contain alphanumeric characters (no spaces, no hyphens, no special characters).");
      return;
    }
    
    if (!passwordClean) {
      alert("Secret Passkey cannot be empty.");
      return;
    }

    if (!editingName.trim()) {
      alert("Restaurant Name is required.");
      return;
    }

    if (!editingMobile.trim()) {
      alert("Mobile number is required.");
      return;
    }

    const cleanEditingMobile = editingMobile.replace(/[\s-]/g, "");
    if (!/^(?:(?:\+|0{0,2})91)?[6789]\d{9}$/.test(cleanEditingMobile)) {
      alert("Please enter a valid 10-digit Indian mobile number (e.g. 9876543210 or +91 9876543210).");
      return;
    }

    setIsSavingEdit(true);
    try {
      if (oldId !== slugClean) {
        // Checking if target user id already exists (case-insensitive check)
        const targetRef = doc(db, "restaurants", slugClean);
        const targetSnap = await getDoc(targetRef);
        if (targetSnap.exists() || restaurants.some(r => r.id.toLowerCase() === slugClean.toLowerCase() && r.id !== oldId)) {
          alert(`The User ID "${slugClean}" already exists. Please choose a different one.`);
          setIsSavingEdit(false);
          return;
        }

        // Performing complete branch data and subcollections copy to the new User ID
        // 1. Get old main document
        const oldDocRef = doc(db, "restaurants", oldId);
        const oldDocSnap = await getDoc(oldDocRef);
        if (!oldDocSnap.exists()) {
          throw new Error("Source restaurant branch does not exist.");
        }
        
        const oldData = oldDocSnap.data();
        const newData = {
          ...oldData,
          name: editingName.trim().toUpperCase() || oldData.name || "FOODCOURT",
          password: passwordClean,
          address: editingAddress.trim(),
          mobile: editingMobile.trim(),
          email: editingEmail.trim(),
          imageUrl: oldData.imageUrl || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=600",
        };

        // Write new parent branch document
        await setDoc(targetRef, newData);

        // 2. Migrate 'items' subcollection
        const oldItemsCol = collection(db, "restaurants", oldId, "items");
        const itemsSnap = await getDocs(oldItemsCol);
        const itemsPromises = itemsSnap.docs.map(itemDoc => {
          const newItemRef = doc(db, "restaurants", slugClean, "items", itemDoc.id);
          return setDoc(newItemRef, itemDoc.data());
        });
        await Promise.all(itemsPromises);

        // 3. Migrate 'orders' subcollection
        const oldOrdersCol = collection(db, "restaurants", oldId, "orders");
        const ordersSnap = await getDocs(oldOrdersCol);
        const ordersPromises = ordersSnap.docs.map(orderDoc => {
          const newOrderRef = doc(db, "restaurants", slugClean, "orders", orderDoc.id);
          return setDoc(newOrderRef, orderDoc.data());
        });
        await Promise.all(ordersPromises);

        // 4. Migrate 'settings/banner' subdoc
        const oldBannerRef = doc(db, "restaurants", oldId, "settings", "banner");
        const bannerSnap = await getDoc(oldBannerRef);
        if (bannerSnap.exists()) {
          const newBannerRef = doc(db, "restaurants", slugClean, "settings", "banner");
          // Update dynamic banner context with new restaurant logo/picture
          await setDoc(newBannerRef, {
            ...bannerSnap.data(),
            imageUrl: editingPicture.trim() || bannerSnap.data().imageUrl
          });
        }

        // 5. Delete all old documents (subcollection docs + main doc)
        // Delete items docs
        const deleteItemsPromises = itemsSnap.docs.map(itemDoc => {
          return deleteDoc(doc(db, "restaurants", oldId, "items", itemDoc.id));
        });
        await Promise.all(deleteItemsPromises);

        // Delete orders docs
        const deleteOrdersPromises = ordersSnap.docs.map(orderDoc => {
          return deleteDoc(doc(db, "restaurants", oldId, "orders", orderDoc.id));
        });
        await Promise.all(deleteOrdersPromises);

        // Delete old banner doc
        if (bannerSnap.exists()) {
          await deleteDoc(oldBannerRef);
        }

        // Delete old parent doc
        await deleteDoc(oldDocRef);

        alert(`Successfully updated "${editingName}" slug access and details.`);
      } else {
        // Slug remained identical, perform inline details merge
        await setDoc(doc(db, "restaurants", oldId), {
          name: editingName.trim().toUpperCase() || "FOODCOURT",
          password: passwordClean,
          address: editingAddress.trim(),
          mobile: editingMobile.trim(),
          email: editingEmail.trim(),
        }, { merge: true });

        alert("Branch details successfully updated.");
      }

      setEditingRepoId(null);
    } catch (err: any) {
      console.error("Failed to save branch settings:", err);
      alert("Error saving branch settings: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open Staff Console for a specific restaurant directly (bypass passcode lock)
  const handleLaunchLocalBranch = (slug: string) => {
    // Set bypass and admin role details in sessionStorage so they are automatically authorized
    sessionStorage.setItem(`admin_role_${slug}`, "superadmin");
    sessionStorage.setItem(`isAdminBypass_${slug}`, "true");
    
    if (onLaunchLocalBranch) {
      onLaunchLocalBranch(slug);
    } else {
      // Inline redirect fallback
      window.location.href = `/restaurant/${slug}`;
    }
  };

  // Update website global settings (Super Admin Credentials)
  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalSettingsSuccess("");
    setGlobalSettingsError("");

    const targetId = newGlobalAdminId;
    const targetPass = newGlobalAdminPassword;

    if (!targetId && !targetPass) {
      setGlobalSettingsError("Please provide a new ID Identity or Secret Passkey to update.");
      return;
    }

    setIsUpdatingGlobalSettings(true);
    try {
      const updateData: any = {};
      if (targetId) updateData.superAdminId = targetId;
      if (targetPass) updateData.superAdminPassword = targetPass;

      await setDoc(doc(db, "settings", "security"), updateData, { merge: true });

      setGlobalSettingsSuccess("Super Admin security credentials updated successfully!");
      setTimeout(() => {
        setGlobalSettingsSuccess("");
      }, 2000);
      if (targetId) {
        setGlobalAdminId(targetId);
        setNewGlobalAdminId("");
      }
      if (targetPass) {
        setGlobalAdminPassword(targetPass);
        setNewGlobalAdminPassword("");
      }
    } catch (err: any) {
      setGlobalSettingsError("Configuration save error: " + err.message);
      setTimeout(() => {
        setGlobalSettingsError("");
      }, 2000);
    } finally {
      setIsUpdatingGlobalSettings(false);
    }
  };

  const filteredRestaurants = restaurants.filter(
    r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const togglePasswordVisibility = (slug: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [slug]: !prev[slug]
    }));
  };

  // Super Admin Login Layout
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 py-12 text-zinc-100" id="superadmin-auth">
        <motion.div 
          className="w-full max-w-sm space-y-6 rounded-3xl border border-zinc-900 bg-neutral-900/10 p-6 backdrop-blur-md"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-black font-black text-xl shadow-xl">
              <Shield className="h-6 w-6" />
            </div>
            <h1 className="font-sans font-bold text-lg text-white tracking-wider uppercase">SUPER ADMIN LOGIN</h1>
          </div>

          <form onSubmit={handleVerifyMaster} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-555">username</label>
              <input
                type="text"
                placeholder="ADMIN"
                value={masterUsername}
                onChange={(e) => setMasterUsername(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-800 focus:outline-none focus:border-amber-500 transition-colors font-mono"
                id="superadmin-user-input"
              />
            </div>

            <div className="space-y-1 text-left">
              <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-555">password</label>
              <input
                type="password"
                required
                placeholder="••••"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-855 focus:outline-none focus:border-amber-500 transition-colors"
                id="superadmin-pass-input"
              />
              <p className="text-[10px] text-zinc-650 font-sans mt-1.5">Default profile: <code className="font-mono bg-zinc-950 px-1 py-0.5 rounded text-amber-500/80">ADMIN</code> / <code className="font-mono bg-zinc-950 px-1 py-0.5 rounded text-amber-500/80">1234</code></p>
            </div>

            {authError && (
              <p className="text-xs text-rose-500 font-sans text-center">{authError}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onBackToMain}
                className="w-1/3 flex items-center justify-center rounded-xl border border-zinc-900 text-zinc-400 py-2.5 text-xs font-bold uppercase transition-all hover:bg-zinc-950 active:scale-95"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isVerifying}
                className="w-2/3 flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-600 text-black py-2.5 text-xs font-bold uppercase tracking-wider transition-all shadow active:scale-95 disabled:opacity-50"
              >
                {isVerifying ? "Verifying..." : "Log In"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-24 text-zinc-100 font-sans flex flex-col" id="superadmin-master-view">
      {/* Super Admin Header Row */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-900 bg-[#0a0a0a]/90 px-8 py-5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500 flex items-center justify-center rounded-lg shadow-md shrink-0">
              <Shield className="h-5 w-5 text-black" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight uppercase text-amber-500">ADMIN</h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-bold text-zinc-150 font-sans">System Operator (Master)</span>
            <span className="rounded-md bg-amber-955/20 border border-amber-900/60 px-1.5 py-0.5 font-mono text-[8px] font-bold text-amber-500 uppercase tracking-widest self-end">
              GLOBAL ACCESS
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-900 bg-zinc-950 text-zinc-400 hover:text-rose-455 transition-all active:scale-95 cursor-pointer"
            title="Lock Dashboard & Log Out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main content grid */}
      <main className="max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        
        {/* Banner / Stat Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-zinc-900 bg-neutral-900/5 space-y-1">
            <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Database Tenants</p>
            <p className="text-2xl font-serif text-zinc-100 italic">{restaurants.length} Registered</p>
          </div>
          <div className="p-4 rounded-xl border border-zinc-900 bg-neutral-900/5 space-y-1">
            <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Tenant Status</p>
            <p className="text-2xl font-serif text-emerald-400 italic">All Servers Online</p>
          </div>
        </div>

        {/* Modular Navigation Panel */}
        <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-zinc-900 bg-zinc-950 p-1 w-full max-w-md">
          <button
            onClick={() => setActivePanel("list")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 font-sans text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activePanel === "list" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Store className="h-3.5 w-3.5" />
            <span>Branches</span>
          </button>
          <button
            onClick={() => {
              setCreateError("");
              setNewName("");
              setNewSlug("");
              setNewPassword("");
              setActivePanel("register");
            }}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 font-sans text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activePanel === "register" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create</span>
          </button>
          <button
            onClick={() => setActivePanel("globalSettings")}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 font-sans text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              activePanel === "globalSettings" ? "bg-white text-black shadow-md" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activePanel === "register" && (
            <motion.div
              key="branches-create-container"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 w-full max-w-xl mx-auto"
            >
              <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-6 space-y-6 shadow-2xl">
                <div className="space-y-1">
                  <h3 className="font-serif italic text-xl text-white">Create Restaurant Branch</h3>
                  <p className="text-zinc-500 text-xs font-sans">Initialize a brand new business branch with comprehensive details and credentials</p>
                </div>

                <form onSubmit={handleCreateRestaurant} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Restaurant Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Downtown Gourmet"
                        value={newName}
                        onChange={(e) => handleCompanyNameChange(e.target.value)}
                        className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-500 font-sans transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Username ID (Slug)</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. downtown"
                        value={newSlug}
                        onChange={(e) => setNewSlug(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                        className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-500 font-mono transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Password</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. secret123"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-500 transition-all font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Mobile No</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 9876543210"
                        value={newMobile}
                        onChange={(e) => setNewMobile(e.target.value)}
                        className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Email Address <span className="text-zinc-600 font-sans italic lowercase">(Optional)</span></label>
                    <input
                      type="email"
                      placeholder="e.g. contact@shabyas.in"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-500 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">Address Location <span className="text-zinc-600 font-sans italic lowercase">(Optional)</span></label>
                    <input
                      type="text"
                      placeholder="e.g. 12 MG Road, Bengaluru, Karnataka"
                      value={newAddress}
                      onChange={(e) => setNewAddress(e.target.value)}
                      className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-500 transition-all"
                    />
                  </div>



                  {createError && (
                    <p className="text-xs text-rose-455 font-sans bg-rose-500/10 border border-rose-900/60 px-3 py-2 rounded-lg">{createError}</p>
                  )}

                  <div className="flex justify-end gap-3 pt-4 border-t border-zinc-900/60">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateError("");
                        setNewName("");
                        setNewSlug("");
                        setNewPassword("");
                        setNewAddress("");
                        setNewMobile("");
                        setNewEmail("");
                        setNewPicture("");
                        setActivePanel("list");
                      }}
                      className="rounded-lg border border-zinc-900 hover:bg-zinc-900/40 px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-150 cursor-pointer text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="rounded-lg bg-amber-500 hover:bg-amber-400 text-black px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isCreating ? "Creating..." : "Create"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Delete All Branches Action Box */}
              {restaurants.length > 0 && (
                <div className="rounded-2xl border border-rose-950/40 bg-rose-955/5 p-6 space-y-4 shadow-xl">
                  <div className="space-y-1">
                    <h4 className="font-sans text-xs font-bold text-rose-550 uppercase tracking-wider flex items-center gap-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                      Danger Zone
                    </h4>
                    <p className="text-zinc-550 text-[10px] leading-normal font-sans">
                      Permanently wipe all registered dining branch databases in a single action.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      setWipingAllModalOpen(true);
                      setAllDeleteConfirmationInput("");
                    }}
                    className="w-full rounded-lg bg-rose-950/20 hover:bg-rose-900/25 border border-rose-900/45 text-rose-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                    id="delete-all-restaurants-btn"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete All Branches</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activePanel === "globalSettings" && (
            <motion.div
              key="global-settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl border border-zinc-900 bg-zinc-950 p-6 max-w-xl mx-auto space-y-6"
            >
              <div className="space-y-1">
                <h3 className="font-serif italic text-xl text-white">Settings</h3>
              </div>

              {globalSettingsSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-955/40 text-emerald-400 text-xs text-center font-sans">
                  {globalSettingsSuccess}
                </div>
              )}

              {globalSettingsError && (
                <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-950/40 text-rose-455 text-xs text-center font-sans">
                  {globalSettingsError}
                </div>
              )}

              <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-900 space-y-2">
                <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Credentials:</p>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-zinc-500">User ID:</span> <span className="text-amber-400 font-bold">{globalAdminId}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Password:</span> <span className="text-zinc-300">{globalAdminPassword}</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSaveGlobalSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">New User ID</label>
                    <input
                      type="text"
                      placeholder="Leave empty"
                      value={newGlobalAdminId}
                      onChange={(e) => setNewGlobalAdminId(e.target.value)}
                      className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-500 animate-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">New Password</label>
                    <input
                      type="text"
                      placeholder="Leave empty"
                      value={newGlobalAdminPassword}
                      onChange={(e) => setNewGlobalAdminPassword(e.target.value)}
                      className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-650 focus:outline-none focus:border-zinc-550 animate-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingGlobalSettings}
                    className="rounded-lg bg-amber-500 hover:bg-amber-600 text-black px-6 py-2 text-xs font-bold uppercase tracking-wider transition-all shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdatingGlobalSettings ? "Updating..." : "Save"}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {activePanel === "list" && (
            <motion.div
              key="restaurants-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {successCreatedMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 text-xs font-sans flex items-center justify-between gap-2 shadow-lg">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    {successCreatedMsg}
                  </span>
                </div>
              )}

              {/* Filter Row */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-600" />
                  <input
                    type="text"
                    placeholder="Search restaurants..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-105 placeholder:text-zinc-750 focus:outline-none focus:border-amber-500 transition-colors font-sans outline-none"
                  />
                </div>
              </div>

              {isLoading ? (
                <div className="text-center py-20 text-zinc-600 font-mono text-xs uppercase tracking-widest">
                  Fetching Tenant Registries...
                </div>
              ) : filteredRestaurants.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-zinc-900 rounded-2xl text-zinc-700 font-sans">
                  <Store className="h-8 w-8 text-zinc-800 mx-auto mb-2" />
                  <p className="text-sm font-medium">No registered dining tenants detected.</p>
                  <p className="text-xs text-zinc-600 mt-1">Register a foodcourt brand to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4" id="tenant-instances-block">
                  {filteredRestaurants.map((restaurant) => {
                    const isExpanded = expandedRestaurantId === restaurant.id;
                    return (
                      <div 
                        key={restaurant.id}
                        id={`tenant-card-${restaurant.id}`}
                        className={`rounded-2xl border transition-all duration-300 bg-neutral-900/5 ${
                          isExpanded ? "border-amber-500/40 p-5 bg-neutral-900/20 shadow-lg" : "border-zinc-900 p-4 hover:border-zinc-850"
                        }`}
                      >
                        {/* Summary Header Row (Always Visible) */}
                        <div 
                          className="flex items-center justify-between cursor-pointer group select-none"
                          onClick={() => setExpandedRestaurantId(isExpanded ? null : restaurant.id)}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2.5">
                              <h3 className="font-serif italic text-lg text-neutral-100 group-hover:text-amber-400 transition-colors">
                                {restaurant.name}
                              </h3>
                              {restaurant.isStaffActive && (
                                <span 
                                  className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" 
                                  title="Staff Mode: ONLINE" 
                                />
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-500 font-mono">
                              Registered {new Date(restaurant.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <div className={`transform transition-transform duration-200 text-zinc-500 group-hover:text-zinc-300 ${isExpanded ? "rotate-180" : ""}`}>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible details pane */}
                        {isExpanded && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-4 pt-4 border-t border-zinc-900/60 w-full"
                          >
                            {editingRepoId === restaurant.id ? (
                              /* Inline Editing Mode Card Form */
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-zinc-300 bg-zinc-950/40 border border-zinc-900/80 p-5 rounded-2xl shadow-xl font-sans">
                                {/* Edit Identity */}
                                <div className="space-y-3.5">
                                  <h4 className="font-mono text-[9px] uppercase tracking-wider text-amber-500 font-bold">Edit Brand Identity</h4>
                                  <div className="space-y-1">
                                    <label className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">Restaurant Name</label>
                                    <input
                                      type="text"
                                      value={editingName}
                                      onChange={(e) => setEditingName(e.target.value)}
                                      className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-150 px-3 py-2 rounded-lg w-full font-semibold outline-none focus:border-amber-500/60 transition-colors"
                                      required
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">Access ID (Slug / Username)</label>
                                    <input
                                      type="text"
                                      value={editingSlug}
                                      onChange={(e) => setEditingSlug(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                                      className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-150 px-3 py-2 rounded-lg w-full font-mono font-bold outline-none focus:border-amber-500/60 transition-colors"
                                      required
                                      title="Changing this ID migrates access credentials to the new URL."
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="font-mono text-[8px] uppercase tracking-wider text-zinc-505">Secret Passkey</label>
                                    <input
                                      type="text"
                                      value={editingPassword}
                                      onChange={(e) => setEditingPassword(e.target.value)}
                                      className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-150 px-3 py-2 rounded-lg w-full font-mono font-bold outline-none focus:border-amber-500/60 transition-colors"
                                      required
                                    />
                                  </div>
                                </div>

                                {/* Edit Contacts & Location */}
                                <div className="space-y-3.5">
                                  <h4 className="font-mono text-[9px] uppercase tracking-wider text-amber-500 font-bold">Edit Address & Contacts</h4>
                                  <div className="space-y-1">
                                    <label className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">Mobile No</label>
                                    <input
                                      type="text"
                                      value={editingMobile}
                                      onChange={(e) => setEditingMobile(e.target.value)}
                                      className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-150 px-3 py-2 rounded-lg w-full outline-none focus:border-amber-500/60 transition-colors"
                                      required
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">Email Address <span className="text-zinc-600 font-sans italic lowercase">(Optional)</span></label>
                                    <input
                                      type="email"
                                      value={editingEmail}
                                      onChange={(e) => setEditingEmail(e.target.value)}
                                      className="bg-zinc-950 border border-zinc-805 text-xs text-zinc-150 px-3 py-2 rounded-lg w-full outline-none focus:border-amber-500/60 transition-colors"
                                    />
                                  </div>
                                </div>

                                {/* Column 3: Actions */}
                                <div className="flex flex-col justify-end">
                                  <div className="flex gap-2.5 pt-4 justify-end font-sans">
                                    <button
                                      type="button"
                                      onClick={() => setEditingRepoId(null)}
                                      className="rounded-lg border border-zinc-900 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-900/30 transition cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveBranchSettings(restaurant.id)}
                                      disabled={isSavingEdit}
                                      className="rounded-lg bg-amber-500 hover:bg-amber-400 text-black px-5 py-2 text-[10px] font-bold uppercase tracking-wider shadow-md active:scale-95 disabled:opacity-40 transition cursor-pointer"
                                    >
                                      {isSavingEdit ? "...Saving" : "Save Details"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Stunning Bento-Like Detail View Mode */
                              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-zinc-300 bg-zinc-950/20 border border-zinc-900/50 p-5 rounded-2xl shadow-lg font-sans">
                                {/* Identity & Info */}
                                <div className="space-y-4 flex flex-col justify-between">
                                  <div>
                                    <span className="font-mono text-[8px] uppercase tracking-widest text-zinc-550 font-bold block mb-1">Restaurant Name</span>
                                    <h3 className="font-serif italic text-lg text-white font-extrabold tracking-wide drop-shadow-md">{restaurant.name}</h3>
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] uppercase font-mono text-zinc-550 font-bold">Branch Slug:</span>
                                      <span className="font-mono text-xs font-bold text-zinc-300 select-all tracking-wider px-1.5 py-0.5 rounded bg-zinc-955 border border-zinc-900">{restaurant.id}</span>
                                    </div>
                                    <div className="text-[10px] font-mono text-zinc-550">
                                      Created {new Date(restaurant.createdAt).toLocaleDateString()}
                                    </div>
                                  </div>
                                </div>

                                {/* Contact & location info card */}
                                <div className="space-y-3 lg:border-x lg:border-zinc-900/50 lg:px-6">
                                  <h4 className="font-mono text-[9px] uppercase tracking-wider text-amber-500 font-bold flex items-center gap-1.5">Contact Details</h4>
                                  <div className="space-y-2.5 text-xs">
                                    <div className="flex items-start gap-2.5 text-zinc-400">
                                      <MapPin className="h-4 w-4 text-zinc-650 shrink-0 mt-0.5" />
                                      <span className="leading-tight text-zinc-300" title={restaurant.address}>
                                        {restaurant.address || "Main Street, Foodcourt Hub"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-zinc-400">
                                      <Phone className="h-4 w-4 text-zinc-650 shrink-0" />
                                      <span className="font-mono text-zinc-300">{restaurant.mobile || "+1-234-567-890"}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5 text-zinc-400">
                                      <Mail className="h-4 w-4 text-zinc-650 shrink-0" />
                                      <span className="text-zinc-300 truncate" title={restaurant.email}>{restaurant.email || "contact@foodcourt.com"}</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Controls & credentials panel */}
                                <div className="space-y-4 flex flex-col justify-between">
                                  <div>
                                    <span className="font-mono text-[8px] uppercase tracking-widest text-zinc-500 font-bold block">Terminal Passcode</span>
                                    <div className="flex items-center gap-2.5 mt-1.5 bg-zinc-955 px-3 py-2 border border-zinc-900 rounded-lg self-start">
                                      <span className="font-mono text-xs font-bold text-zinc-300 tracking-wider">
                                        {showPasswords[restaurant.id] ? restaurant.password : "• • • • • • •"}
                                      </span>
                                      <button
                                        onClick={() => togglePasswordVisibility(restaurant.id)}
                                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                      >
                                        {showPasswords[restaurant.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-900/60 font-sans">
                                    <button
                                      onClick={async () => {
                                        try {
                                          await setDoc(doc(db, "restaurants", restaurant.id), {
                                            isEnabled: !restaurant.isEnabled
                                          }, { merge: true });
                                        } catch (err: any) {
                                          alert("Failed to update: " + err.message);
                                        }
                                      }}
                                      className={`flex items-center gap-1.5 rounded-lg text-[9.5px] font-mono font-bold uppercase border px-2.5 py-1.5 transition-all self-start cursor-pointer active:scale-95 ${
                                        restaurant.isEnabled 
                                          ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-400 hover:bg-emerald-950/45" 
                                          : "bg-rose-955/20 border-rose-900/40 text-rose-455 hover:bg-rose-955/35"
                                      }`}
                                    >
                                      <span className={`h-1.5 w-1.5 rounded-full ${restaurant.isEnabled ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
                                      <span>Permission: {restaurant.isEnabled ? "ON" : "OFF"}</span>
                                    </button>

                                    <button
                                      onClick={() => {
                                        setEditingRepoId(restaurant.id);
                                        setEditingName(restaurant.name || "");
                                        setEditingPassword(restaurant.password || "1234");
                                        setEditingSlug(restaurant.id);
                                        setEditingAddress(restaurant.address || "Main Street, Foodcourt Hub");
                                        setEditingMobile(restaurant.mobile || "+1-234-567-890");
                                        setEditingEmail(restaurant.email || "contact@foodcourt.com");
                                        setEditingPicture(restaurant.imageUrl || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=600");
                                      }}
                                      className="px-3 py-1.5 border border-zinc-800 hover:border-zinc-700 hover:text-white rounded-lg text-[9.5px] font-mono font-bold uppercase tracking-wider text-zinc-400 transition active:scale-95 cursor-pointer"
                                    >
                                      Edit
                                    </button>

                                    <button
                                      onClick={() => handleLaunchLocalBranch(restaurant.id)}
                                      className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-black rounded-lg text-[9.5px] font-mono font-bold uppercase tracking-wider transition active:scale-95 cursor-pointer flex items-center gap-1"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      <span>Launch</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRestaurant(restaurant.id, restaurant.name)}
                                      className="p-1.5 border border-zinc-900 hover:border-rose-900 hover:text-rose-500 rounded-lg text-zinc-650 transition active:scale-95 cursor-pointer flex items-center justify-center"
                                      title="Delete Branch"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {restaurantToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm" id="custom-delete-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-zinc-900 bg-zinc-950 p-6 space-y-6"
            >
              <div className="space-y-2">
                <h3 className="font-serif italic text-xl text-rose-500">Wipe Restaurant Trace?</h3>
                <p className="text-xs text-zinc-400 font-sans">
                  This will permanently delete the tenant branch <strong className="text-zinc-100">{restaurantToDelete.name}</strong> (Branch ID: <code className="font-mono text-amber-500">{restaurantToDelete.id}</code>) and remove all administrative data.
                </p>
                <div className="bg-rose-950/10 border border-rose-900/30 rounded-xl p-3 text-[11px] text-rose-400 font-sans leading-relaxed">
                  ⚠️ <strong>Warning:</strong> This operation is irreversible and instant. All current orders and database pointers will be terminated.
                </div>
              </div>

              <div className="space-y-3">
                <label className="block font-mono text-[9px] uppercase tracking-wider text-zinc-500 font-bold font-mono">
                  Type <span className="text-zinc-350">CONFIRM</span> to proceed:
                </label>
                <input
                  type="text"
                  placeholder="CONFIRM"
                  value={deleteConfirmationInput}
                  onChange={(e) => setDeleteConfirmationInput(e.target.value)}
                  className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-700 font-mono uppercase focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 font-sans">
                <button
                  onClick={() => setRestaurantToDelete(null)}
                  className="rounded-lg border border-zinc-900 text-zinc-400 hover:bg-zinc-900 px-4 py-2 text-xs font-bold uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isWiping || deleteConfirmationInput.trim().toUpperCase() !== "CONFIRM"}
                  className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-30 disabled:hover:bg-rose-600 text-white px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all shadow active:scale-95 cursor-pointer"
                >
                  {isWiping ? "Deleting..." : "Delete Permanently"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Delete All Confirmation Modal */}
      <AnimatePresence>
        {wipingAllModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-sm" id="custom-delete-all-modal">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-zinc-900 bg-zinc-950 p-6 space-y-6"
            >
              <div className="space-y-2">
                <h3 className="font-serif italic text-xl text-rose-500">Wipe All Restaurant Branches?</h3>
                <p className="text-xs text-zinc-400 font-sans animate-pulse">
                  This will permanently delete <strong className="text-zinc-100">{restaurants.length} registered branches</strong> and wipe all of their administrative records.
                </p>
                <div className="bg-rose-955/20 border border-rose-900 px-3.5 py-3 rounded-xl text-[11px] text-rose-455 font-sans leading-relaxed">
                  🔥 <strong>CRITICAL WARNING:</strong> This is a master destructive command. Clicking delete will wipe absolutely all restaurant branch entries, configurations, menus, and orders from the database simultaneously.
                </div>
              </div>

              <div className="space-y-3">
                <label className="block font-mono text-[9px] uppercase tracking-wider text-zinc-500 font-bold">
                  Type <span className="text-zinc-350">DELETE ALL</span> to execute master purge:
                </label>
                <input
                  type="text"
                  placeholder="DELETE ALL"
                  value={allDeleteConfirmationInput}
                  onChange={(e) => setAllDeleteConfirmationInput(e.target.value)}
                  className="w-full bg-zinc-900/40 border border-zinc-900 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-700 font-mono uppercase focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 font-sans">
                <button
                  onClick={() => {
                    setWipingAllModalOpen(false);
                    setAllDeleteConfirmationInput("");
                  }}
                  className="rounded-lg border border-zinc-900 text-zinc-400 hover:bg-zinc-900 px-4 py-2 text-xs font-bold uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeleteAll}
                  disabled={isWipingAll || allDeleteConfirmationInput.trim().toUpperCase() !== "DELETE ALL"}
                  className="rounded-lg bg-rose-600 hover:bg-rose-750 disabled:opacity-20 disabled:hover:bg-rose-600 text-white px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all shadow active:scale-95 cursor-pointer"
                >
                  {isWipingAll ? "Purging..." : "Wipe All Databases"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
