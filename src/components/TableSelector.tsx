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

  // A single, continuous silk-smooth fade-in of the entire container on load
  const containerVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.25, 1, 0.5, 1] // Quintic ease-out for ultimate smoothness
      }
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
        
        {/* Brand Header with super clean static layout */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black font-black text-2xl shadow-xl transition-all duration-300 hover:rotate-3 hover:scale-105 active:scale-95 cursor-pointer">
            {restaurantName.charAt(0).toUpperCase()}
          </div>
          <h1 className="font-serif italic text-3xl text-white tracking-tight">
            {restaurantName}
          </h1>
        </div>

        {/* Smooth, Direct Selector Grid */}
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-sm text-zinc-400 leading-relaxed font-sans">
              Choose your table
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {tables.map((table) => (
              <button
                key={table}
                id={`table-btn-${table}`}
                onClick={() => onSelectTable(table)}
                className="flex h-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 font-mono text-xs font-bold tracking-wider text-zinc-400 cursor-pointer shadow-sm transition-all duration-200 ease-out hover:bg-zinc-90 w-full hover:border-zinc-500 hover:text-white active:scale-95"
              >
                {table}
              </button>
            ))}
          </div>
        </div>

      </motion.div>
    </div>
  );
}
