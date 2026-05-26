# 🏮 Sakura Club Diner

> A premium, real-time, tabletop dining menu and order management platform. Built to route artisanal plates directly from seats to kitchens with frictionless tableside interactions.

---

## 📖 Introduction

**Sakura Club Diner** is an elegant, high-performance, responsive tabletop application designed specifically for foodcourts and modern dining spaces. By bypassing tedious account sign-ups and complex checkout forms, diners can instantly select their table, explore artisanal menu items, and assemble dynamic digital order sheets. Orders are instantly synchronized with kitchens utilizing real-time Cloud Firestore backends, and fully controllable via a secure, administrative dashboard.

---

## ✨ Key Features

### 🍽️ Diner Experience (Client Workspace)
*   **Table-Bound Routing:** Instant dining session initialization bound directly to specific tables (e.g. *Table Bar-A*).
*   **Aesthetic Backdrop Banner:** A beautifully styled announcement section featuring a 50% larger dark glass backdrop effect, automated grayscale masking, and fully aligned bio notice-text placed bottom-left.
*   **Instant Order Sheet:** Responsive tap actions to append or remove dishes inside a dynamic local order queue.
*   **Real-time Live Search:** Smooth UI transitions for swift catalog search and culinary categorization.

### 🛡️ Controller Experience (Admin Console)
*   **Live Announcement Management:** Modify backdrop imagery (with base64 image upload encoding support) and announcement text in real-time.
*   **Database Flush & Reset Tools:** Robust, safe operations to wipe active ordering records, customers' lists, and sales metrics, or re-populate items for fresh shifts.
*   **Comprehensive Order Desk:** Drag-and-drop or simple interactive status updating to mark items *Pending*, *In Preparation*, or *Delivered*.
*   **Sales & Metrics Visualizer:** Responsive analytical modules graphing item performance and aggregate daily revenue.

### ⚡ Infrastructure & Engineering
*   **Zero-Overhead Server State:** Powered serverless using Firebase and Firestore listener modules for instant reactive UI updates.
*   **Pure TypeScript Schema:** Highly structured static typing preserving consistency across orders, catalog items, and dashboard specifications.
*   **Bespoke Design System:** Handcrafted Tailwind slate accents, high contrast typography, standard layout paddings, and precise responsive layouts.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime & Bundler** | Node.js (v18+) & Vite | Lightweight development compilation and lightning fast production bundling |
| **Framework** | React 18 (TypeScript) | Reactive view components, hooks, and clean state distribution |
| **Database & API** | Firebase Cloud Firestore | Multi-user continuous synchronization, persistence, and rules-based queries |
| **Styling** | Tailwind CSS | Sleek utility classes, fluid grid systems, and high contrast accents |
| **Motion** | Framer Motion / Motion | Staggered lists entrance indicators and beautiful tab transitions |
| **Icons** | Lucide React | High fidelity vector iconography across all navigation panes |

---

## 📁 Directory Structure

```bash
sakura-club-diner/
├── src/
│   ├── components/
│   │   ├── AdminConsole.tsx    # Comprehensive administrative workspace
│   │   ├── Banner.tsx          # Styled backdrop banner and bottom-aligned announcements bio
│   │   ├── ClientMenu.tsx      # Multi-column interactive menu and order drawer
│   │   └── TableSelector.tsx   # Initial high-contrast tabletop router
│   ├── App.tsx                 # Core application controller
│   ├── firebase.ts             # Firestore connection config & helper rules
│   ├── types.ts                # TypeScript strictly typed schemas
│   ├── main.tsx                # Entry-point bootstrap
│   └── index.css               # Clean global Tailwind styles configuration
├── firestore.rules             # Rigorous Cloud Database Security Rules
├── package.json                # Project dependencies and deployment scripts
└── README.md                   # Project documentation
```

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have **Node.js (version 18 or above)** and `npm` installed.

### 2. Installation
Clone the codebase and install dependencies:
```bash
git clone <your-github-repo-url>
cd sakura-club-diner
npm install
```

### 3. Environment Variables
To connect the application to your Google Firebase ecosystem, copy the `.env.example` file and supply your Firestore connection secrets:
```bash
cp .env.example .env
```
Fill out the variables:
```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain_here
VITE_FIREBASE_PROJECT_ID=your_project_id_here
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket_here
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
```

### 4. Direct Development Execution
Boot up the fast local development server:
```bash
npm run dev
```
Open `http://localhost:3000` inside your favorite browser to check out the app!

### 5. Production Compilation
Bundle optimization for static deployment:
```bash
npm run build
```

---

## 🔒 Security Configuration
The database ensures robust verification. Security schemas (as stored in `firestore.rules`) prevent any data intrusion:
- **Menu Items Collection:** Universally readable by all diners; writable only to authorized admins.
- **Orders Collection:** Diners can read and write orders to initiate seat delivery; fully administrative-contrained for status updates.
- **Settings/Banner Collection:** Writable only by administrator credentials.

---

## 🤝 Contribution Guidelines
1. Fork the project on GitHub.
2. Form your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your modifications (`git commit -m 'Add custom AmazingFeature'`).
4. Push to your branch (`git push origin feature/AmazingFeature`).
5. Raise a Pull Request (PR) for auditing.
