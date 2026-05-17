import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8'));

async function test() {
  try {
    const app = initializeApp(firebaseConfig);
    // The client SDK getFirestore takes (app, databaseId) as well
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    
    console.log(`Testing connection to project: ${firebaseConfig.projectId}, database: ${firebaseConfig.firestoreDatabaseId} using CLIENT SDK`);
    const q = query(collection(db, 'leads'), limit(1));
    const snapshot = await getDocs(q);
    console.log(`SUCCESS: Found ${snapshot.size} leads.`);
  } catch (err: any) {
    console.error(`FAILURE: ${err.message}`);
    process.exit(1);
  }
}

test();
