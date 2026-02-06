/**
 * Animation Preferences Settings Page
 * 
 * UI for users to customize animation behavior across the admin interface.
 * Allows control over enable/disable, speed, and intensity of animations.
 * 
 * @phase Phase 4.4 - Animation Preferences Panel
 * @date 2026-02-06
 */

'use client';

import React, { useState } from 'react';
import { useAnimationPreferences } from '@/contexts/AnimationPreferencesContext';
import { AnimatedButton, AdminPageTransition } from '@/components/admin/shared';
import { Settings, Zap, Volume2, RefreshCw, Check } from 'lucide-react';

export default function AnimationSettingsPage() {
  const { preferences, updatePreferences, resetPreferences } = useAnimationPreferences();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  return (
    <AdminPageTransition pageKey="animation-settings">
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <Settings className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Animation Preferences
              </h1>
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              Customize how animations behave throughout the admin interface. 
              Changes are saved automatically and apply immediately.
            </p>
          </div>

          {/* Settings Cards */}
          <div className="space-y-6">
            {/* Enable/Disable Animations */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    Enable Animations
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Turn animations on or off globally. When disabled, all UI transitions 
                    and micro-interactions will be instant.
                  </p>
                </div>
                
                <label className="relative inline-flex items-center cursor-pointer ml-4">
                  <input
                    type="checkbox"
                    checked={preferences.enabled}
                    onChange={(e) => updatePreferences({ enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-8 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            {/* Animation Speed */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Animation Speed
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Control how fast animations play. Slower speeds are more noticeable, 
                while faster speeds feel snappier.
              </p>
              
              <div className="grid grid-cols-3 gap-4">
                {(['slow', 'normal', 'fast'] as const).map((speed) => (
                  <AnimatedButton
                    key={speed}
                    onClick={() => updatePreferences({ speed })}
                    className={`p-4 rounded-lg border-2 transition-colors ${
                      preferences.speed === speed
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    <div className="text-center">
                      {preferences.speed === speed && (
                        <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                      )}
                      <div className="font-semibold text-gray-900 dark:text-white capitalize">
                        {speed}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {speed === 'slow' && '300ms'}
                        {speed === 'normal' && '200ms'}
                        {speed === 'fast' && '100ms'}
                      </div>
                    </div>
                  </AnimatedButton>
                ))}
              </div>
            </div>

            {/* Animation Intensity */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <Volume2 className="w-5 h-5" />
                Animation Intensity
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Adjust how pronounced animations are. Subtle intensity is barely noticeable, 
                while strong intensity has more dramatic effects.
              </p>
              
              <div className="grid grid-cols-3 gap-4">
                {(['subtle', 'normal', 'strong'] as const).map((intensity) => (
                  <AnimatedButton
                    key={intensity}
                    onClick={() => updatePreferences({ intensity })}
                    className={`p-4 rounded-lg border-2 transition-colors ${
                      preferences.intensity === intensity
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
                    }`}
                  >
                    <div className="text-center">
                      {preferences.intensity === intensity && (
                        <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                      )}
                      <div className="font-semibold text-gray-900 dark:text-white capitalize">
                        {intensity}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {intensity === 'subtle' && '1.01x scale'}
                        {intensity === 'normal' && '1.02x scale'}
                        {intensity === 'strong' && '1.05x scale'}
                      </div>
                    </div>
                  </AnimatedButton>
                ))}
              </div>
            </div>

            {/* Live Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                Live Preview
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Hover over this button to see your current animation settings in action.
              </p>
              
              <div className="flex justify-center">
                <AnimatedButton
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-md transition-colors"
                  intensity={preferences.intensity}
                  disableAnimation={!preferences.enabled}
                >
                  Preview Animation
                </AnimatedButton>
              </div>
              
              <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>
                    <strong>Status:</strong> {preferences.enabled ? 'Enabled' : 'Disabled'}
                  </div>
                  <div>
                    <strong>Speed:</strong> {preferences.speed} 
                    ({preferences.speed === 'slow' ? '300ms' : preferences.speed === 'normal' ? '200ms' : '100ms'})
                  </div>
                  <div>
                    <strong>Intensity:</strong> {preferences.intensity}
                    ({preferences.intensity === 'subtle' ? '1.01x' : preferences.intensity === 'normal' ? '1.02x' : '1.05x'} scale)
                  </div>
                </div>
              </div>
            </div>

            {/* Reset Button */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
              <h3 className="font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                Reset to Defaults
              </h3>
              <p className="text-yellow-800 dark:text-yellow-300 text-sm mb-4">
                Restore all animation preferences to their default values.
              </p>
              
              {!showResetConfirm ? (
                <AnimatedButton
                  onClick={() => setShowResetConfirm(true)}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium"
                >
                  Reset Preferences
                </AnimatedButton>
              ) : (
                <div className="flex gap-3">
                  <AnimatedButton
                    onClick={() => {
                      resetPreferences();
                      setShowResetConfirm(false);
                    }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
                  >
                    Confirm Reset
                  </AnimatedButton>
                  <AnimatedButton
                    onClick={() => setShowResetConfirm(false)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium"
                  >
                    Cancel
                  </AnimatedButton>
                </div>
              )}
            </div>
          </div>

          {/* Info Footer */}
          <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>Note:</strong> Animation preferences are saved to your browser and will persist across sessions. 
              The system also respects your operating system's "reduce motion" accessibility setting.
            </p>
          </div>
        </div>
      </div>
    </AdminPageTransition>
  );
}
