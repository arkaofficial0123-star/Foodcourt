/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

interface TableSelectorProps {
  onSelectTable: (tableId: string) => void;
}

export default function TableSelector({ onSelectTable }: TableSelectorProps) {
  const tables = [
    "T-1", "T-2", "T-3", "T-4", "T-5", "T-6", "T-7", "T-8", "T-9", "T-10",
    "T-11", "T-12", "T-13", "T-14", "T-15", "T-16", "T-17", "T-18", "T-19", "T-20"
  ];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] px-6 py-12 text-zinc-100" id="table-selector">
      <div className="w-full max-w-sm space-y-8 rounded-[28px] border border-zinc-800/60 bg-[#0a0a0a] p-8 shadow-2xl backdrop-blur-md">
        
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black font-black text-2xl shadow-xl">
            F
          </div>
          <h1 className="font-serif italic text-3xl text-white tracking-tight">
            Foodcourt
          </h1>
        </div>

        {/* Dynamic Selector */}
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
                className="flex h-12 items-center justify-center rounded-xl border border-zinc-800/80 bg-zinc-950 font-mono text-xs font-bold tracking-wider text-zinc-300 transition-all hover:border-zinc-500 hover:text-white hover:bg-zinc-900 cursor-pointer active:scale-95"
              >
                {table}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
