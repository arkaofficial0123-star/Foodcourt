/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BannerSettings } from "../types";
import { Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BannerProps {
  settings: BannerSettings | null;
}

export default function Banner({ settings }: BannerProps) {
  if (!settings || !settings.visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full flex flex-col"
        id="top-banner-container"
      >
        {/* Backdrop Image Panel (10% smaller height and padding) */}
        {settings.imageUrl && (
          <div className="relative w-full overflow-hidden border-b border-zinc-800/50 bg-[#0a0a0a]/95 py-12 sm:py-16 px-8 min-h-[145px] sm:min-h-[180px]">
            <div className="absolute inset-0 z-0">
              <img
                src={settings.imageUrl}
                alt="Banner backdrop"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover opacity-35 brightness-[0.3] grayscale transition-all duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/85 to-transparent" />
            </div>
          </div>
        )}

        {/* Bio text formatted and placed cleanly directly under the banner container */}
        <div className="w-full px-8 pt-2 pb-0 flex flex-col items-start gap-1" id="banner-bio-text-container">
          <p className="font-sans text-xs sm:text-xs text-zinc-400 leading-relaxed font-semibold max-w-3xl text-left">
            {settings.text || "Welcome to our digital menu. Place your order directly below!"}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
