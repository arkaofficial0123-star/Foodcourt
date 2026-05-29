import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import platformConfig from "../firebase-applet-config.json";

// Detect if running locally / in-studio preview or on real deployed hostname
const isLocal = typeof window !== "undefined" && (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.includes("ais-dev-") ||
  window.location.hostname.includes("ais-pre-")
);

const resolvedDatabaseId = isLocal
  ? "ai-studio-315e30b7-e747-4788-8106-19c507058c15"
  : "Foodcourt-DATABASE";

// Default public client configuration fallback for zero-configuration deployments (e.g. Vercel)
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "trusty-aegis-vtgzl",
  appId: "1:448117199497:web:f9551cb6bed0e57a1bec58",
  apiKey: "AIzaSyAD8OUjE_dHiQSIDWsnTwMvD-pQvDRNSDw",
  authDomain: "trusty-aegis-vtgzl.firebaseapp.com",
  firestoreDatabaseId: resolvedDatabaseId,
  storageBucket: "trusty-aegis-vtgzl.firebasestorage.app",
  messagingSenderId: "448117199497"
};

// Standard production-ready setup: check for environment variables first,
// and gracefully fall back to the workspace configuration.
const metaEnv = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || platformConfig.apiKey || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || platformConfig.authDomain || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || platformConfig.projectId || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || platformConfig.storageBucket || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || platformConfig.messagingSenderId || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || platformConfig.appId || DEFAULT_FIREBASE_CONFIG.appId,
  firestoreDatabaseId: metaEnv.VITE_FIREBASE_FIRESTORE_DATABASE_ID || resolvedDatabaseId,
};

const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without passing the custom store database ID if it differs
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
