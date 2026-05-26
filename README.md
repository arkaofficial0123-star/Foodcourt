# 🏮 Foodcourt

> A fast, QR-based digital menu and order management system for modern restaurants.

---

## 📖 About the Project

**Foodcourt** is a responsive web application that completely replaces traditional paper menus. Diners simply scan a table-bound **QR code** to browse dishes, filter by category, and send orders directly to the kitchen instantly—no sign-ups or app downloads required. 

Everything updates in real time on a central admin console, allowing restaurant staff to seamlessly track, prepare, and manage orders as they come in.

> 🤖 **Note:** This project was built using **Google AI Studio** to help scaffold the initial layout and UI structure, with manual code customizations added to handle the real-time database tracking and core business logic.

---

## ✨ Key Features

*   📱 **Scan to Order:** Table-bound ordering sessions activated instantly via QR code links.
*   🛒 **Live Basket:** Interactive digital menu with quick search, category filtering, and an instant checkout cart.
*   ⚡ **Real-Time Desk:** Admin dashboard that tracks incoming kitchen orders instantly using reactive listeners.
*   📋 **Status Tracking:** Quick staff controls to mark active orders as *Pending*, *In Preparation*, or *Delivered*.

---

## 🛠️ Tech Stack

*   **AI Assistant:** Google AI Studio
*   **Frontend Framework:** React 18 & TypeScript
*   **Build Tool:** Vite
*   **Database:** Firebase Cloud Firestore (Real-time sync)
*   **Styling & Motion:** Tailwind CSS & Framer Motion

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone <your-github-repo-url>
cd foodcourt
npm install


VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_domain
VITE_FIREBASE_PROJECT_ID=your_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id


npm run dev
