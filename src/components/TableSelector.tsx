/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { motion } from "motion/react";

interface TableSelectorProps {
  onSelectTable: (tableId: string) => void;
  restaurantName?: string;
}

export default function TableSelector({ onSelectTable, restaurantName = "Foodcourt" }: TableSelectorProps) {
  const tables = [
    "T-1", "T-2", "T-3", "T-4", "T-5", "T-6", "T-7", "T-8", "T-9", "T-10",
    "T-11", "T-12", "T-13", "T-14", "T-15", "T-16", "T-17", "T-18", "T-19", "T-20"
  ];

  const containerVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
        when: "beforeChildren",
        staggerChildren: 0.03
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { type: "spring", stiffness: 350, damping: 25 }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 py-12 text-zinc-100 relative overflow-hidden" id="table-selector">
      {/* Subtle ambient light gradient background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-zinc-950/40 rounded-full blur-[100px] pointer-events-none" />

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-sm space-y-8 rounded-[28px] border border-zinc-800/60 bg-[#0a0a0a]/90 p-8 shadow-2xl backdrop-blur-md relative z-10"
      >
        
        {/* Brand Header with dynamic scale transitions */}
        <motion.div 
          className="text-center space-y-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <motion.div 
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black font-black text-2xl shadow-xl hover:rotate-3 transition-transform"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {restaurantName.charAt(0).toUpperCase()}
          </motion.div>
          <h1 className="font-serif italic text-3xl text-white tracking-tight">
            {restaurantName}
          </h1>
        </motion.div>

        {/* Dynamic Selector */}
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-sm text-zinc-400 leading-relaxed font-sans">
              Choose your table
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {tables.map((table) => (
              <motion.button
                key={table}
                id={`table-btn-${table}`}
                variants={itemVariants}
                onClick={() => onSelectTable(table)}
                whileHover={{ scale: 1.05, border: "1px solid #71717a", backgroundColor: "#18181b" }}
                whileTap={{ scale: 0.95 }}
                className="flex h-12 items-center justify-center rounded-xl border border-zinc-805 bg-zinc-950 font-mono text-xs font-bold tracking-wider text-zinc-300 transition-all cursor-pointer shadow-sm"
              >
                {table}
              </motion.button>
            ))}
          </div>
        </div>

      </motion.div>
    </div>
  );
}
