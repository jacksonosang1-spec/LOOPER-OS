import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, where, getDocFromServer } from 'firebase/firestore';

import firebaseConfigJson from '../firebase-applet-config.json';

// Helper to get config value with fallback
const getConfigValue = (envVal: string | undefined, jsonVal: string | undefined, isApiKey: boolean = false) => {
  const isValid = (val: string | undefined) => {
    if (!val) return false;
    const v = val.trim();
    if (v === '' || v === 'undefined' || v === 'null' || v === 'TODO') return false;
    if (v.includes('PLACEHOLDER') || v.includes('YOUR_') || v.includes('MY_') || v.includes('<')) return false;
    if (isApiKey && !v.startsWith('AIza')) return false;
    return true;
  };

  // Prioritize JSON if it's valid and looks like a real provisioned value
  // This is because in AI Studio, the JSON is provisioned specifically for the project.
  if (isValid(jsonVal)) return jsonVal!.trim();
  if (isValid(envVal)) return envVal!.trim();
  return jsonVal;
};

// Handle potential JSON import variations
const configJson = (firebaseConfigJson as any).default || firebaseConfigJson;

// Firebase configuration
const firebaseConfig = {
  apiKey: getConfigValue(import.meta.env.VITE_FIREBASE_API_KEY, configJson.apiKey, true),
  authDomain: getConfigValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, configJson.authDomain),
  projectId: getConfigValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, configJson.projectId),
  appId: getConfigValue(import.meta.env.VITE_FIREBASE_APP_ID, configJson.appId),
  firestoreDatabaseId: getConfigValue(import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID, configJson.firestoreDatabaseId)
};

// Debug logging (safe)
console.log('[Firebase] Initializing with Project ID:', firebaseConfig.projectId);
if (!firebaseConfig.apiKey || !firebaseConfig.apiKey.startsWith('AIza')) {
  console.error('[Firebase] Invalid API Key detected during initialization');
}

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

export { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  where,
  signInWithPopup,
  signOut,
  onAuthStateChanged
};
export type { User };
