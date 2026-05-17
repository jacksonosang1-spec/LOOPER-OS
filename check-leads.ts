
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

if (getApps().length === 0) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function checkLeads() {
  console.log("Fetching leads from Firestore...");
  const snapshot = await db.collection('leads').get();
  console.log(`Found ${snapshot.size} leads.`);
  
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`--- Lead: ${data.companyName} (${doc.id}) ---`);
    console.log(`Status: ${data.status}`);
    console.log(`Email: ${data.email}`);
    console.log(`Opened: ${data.isOpened} (${data.openedAt || 'N/A'})`);
    console.log(`Clicked: ${data.isClicked} (${data.clickedAt || 'N/A'})`);
    console.log(`Last Action: ${data.lastActionDate}`);
    if (data.activityHistory) {
      console.log(`Activity History Count: ${data.activityHistory.length}`);
      data.activityHistory.slice(0, 3).forEach((log: any) => {
          console.log(`  - [${log.timestamp}] ${log.type}: ${log.content}`);
      });
    }
    console.log('----------------------------------');
  });
}

checkLeads().catch(console.error);
