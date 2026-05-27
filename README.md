# 🍔 Foodcourt

A modern, real-time tabletop dining menu and order management platform built with React, Vite, Tailwind CSS, and Firebase.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory and add your Firebase credentials:
```env
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-auth-domain"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"
VITE_FIREBASE_FIRESTORE_DATABASE_ID=""
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

---

## 🚀 Deploying to Vercel

1. Push your code to a **GitHub repository**.
2. Go to [Vercel](https://vercel.com) and click **Add New > Project**.
3. Import your repository.
4. Under **Environment Variables**, paste the keys from your `.env` file.
5. Click **Deploy**. Vercel will build and serve your app instantly!
