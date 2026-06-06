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
  if (!settings) return null;

  const showBannerImage = settings.visible && settings.imageUrl;
  const showBioText = settings.bioVisible !== false; // default to true if not specified

  if (!showBannerImage && !showBioText) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full flex flex-col"
        id="top-banner-container"
      >
        {/* Backdrop Image Panel */}
        {showBannerImage && (
          <div className="relative w-full overflow-hidden border-b border-zinc-800/10 bg-[#0a0a0a] min-h-[145px] sm:min-h-[180px]">
            <img
              src={settings.imageUrl}
              alt="Banner backdrop"
              referrerPolicy="no-referrer"
              className="w-full h-[145px] sm:h-[180px] object-cover transition-all duration-300"
            />
          </div>
        )}

        {/* Bio text formatted and placed cleanly directly under the banner container */}
        {showBioText && (
          <div className="w-full px-4 sm:px-6 md:px-8 pt-4 pb-0 flex flex-col items-start gap-1" id="banner-bio-text-container">
            <p className="font-sans text-xs sm:text-xs text-zinc-400 leading-relaxed font-semibold max-w-3xl text-left">
              {settings.text || "Welcome to our digital menu. Place your order directly below!"}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
