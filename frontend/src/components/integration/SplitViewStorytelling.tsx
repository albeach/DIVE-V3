"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FederationPanel } from "./FederationPanel";
import { ObjectPanel } from "./ObjectPanel";

type ViewMode = "federation" | "object";

/**
 * Split-View Storytelling Component
 * 
 * Demonstrates ADatP-5663 (Federation/Identity) vs ACP-240 (Object/Data) security models
 * side-by-side with smooth horizontal transitions.
 * 
 * Features:
 * - Horizontal tab switching (Federation | Object)
 * - Color semantics: indigo→blue→cyan (5663), amber→orange→red (240)
 * - Framer Motion spring animations (< 250ms)
 * - Tooltips linking to spec sections
 * - WCAG 2.2 AA compliant (keyboard nav, screen reader)
 * - Dark mode optimized
 * 
 * @see ADatP-5663 §2.4 Federated Authentication, §6.4 ABAC
 * @see ACP-240 §5 ZTDF & Cryptography
 */
export function SplitViewStorytelling() {
  const [viewMode, setViewMode] = useState<ViewMode>("federation");

  return (
    <section 
      className="w-full py-12 px-4 sm:px-6 lg:px-8"
      aria-labelledby="split-view-title"
    >
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <h2 
          id="split-view-title"
          className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2"
        >
          Federation vs Object Security
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          Explore how identity federation (ADatP-5663) and data-centric security (ACP-240) work together
        </p>

        {/* Tab Controls */}
        <div 
          className="inline-flex rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-1"
          role="tablist"
          aria-label="Security model view selector"
        >
          {/* Federation Tab */}
          <button
            role="tab"
            aria-selected={viewMode === "federation"}
            aria-controls="federation-panel"
            id="federation-tab"
            onClick={() => setViewMode("federation")}
            className={`
              relative px-6 py-2.5 rounded-md font-medium text-sm transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
              ${viewMode === "federation"
                ? "text-white bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-500 shadow-lg"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }
            `}
          >
            <span className="relative z-10">
              Federation (5663)
            </span>
          </button>

          {/* Object Tab */}
          <button
            role="tab"
            aria-selected={viewMode === "object"}
            aria-controls="object-panel"
            id="object-tab"
            onClick={() => setViewMode("object")}
            className={`
              relative px-6 py-2.5 rounded-md font-medium text-sm transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500
              ${viewMode === "object"
                ? "text-white bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 shadow-lg"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }
            `}
          >
            <span className="relative z-10">
              Object (240)
            </span>
          </button>
        </div>
      </div>

      {/* Panel Container */}
      <div className="max-w-7xl mx-auto relative overflow-hidden">
        <AnimatePresence mode="wait">
          {viewMode === "federation" ? (
            <motion.div
              key="federation"
              id="federation-panel"
              role="tabpanel"
              aria-labelledby="federation-tab"
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 30,
                duration: 0.25 
              }}
            >
              <FederationPanel />
            </motion.div>
          ) : (
            <motion.div
              key="object"
              id="object-panel"
              role="tabpanel"
              aria-labelledby="object-tab"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ 
                type: "spring", 
                stiffness: 300, 
                damping: 30,
                duration: 0.25 
              }}
            >
              <ObjectPanel />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Keyboard Hint */}
      <div className="max-w-7xl mx-auto mt-6 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">Tab</kbd>
          {" "}to navigate, 
          <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs ml-2">Enter</kbd>
          {" "}to select
        </p>
      </div>
    </section>
  );
}
