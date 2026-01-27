import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    darkMode: 'class', // Enable dark mode via class strategy (for next-themes)
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                // Instance theme colors (dynamically set via CSS variables)
                instance: {
                    primary: "var(--instance-primary)",
                    secondary: "var(--instance-secondary)",
                    accent: "var(--instance-accent)",
                    text: "var(--instance-text)",
                },
                // File type color system (2026 Design)
                fileType: {
                    document: {
                        50: '#eff6ff',
                        100: '#dbeafe',
                        200: '#bfdbfe',
                        500: '#3b82f6',
                        600: '#2563eb',
                        700: '#1d4ed8',
                    },
                    image: {
                        50: '#f0fdf4',
                        100: '#dcfce7',
                        200: '#bbf7d0',
                        500: '#22c55e',
                        600: '#16a34a',
                        700: '#15803d',
                    },
                    video: {
                        50: '#faf5ff',
                        100: '#f3e8ff',
                        200: '#e9d5ff',
                        500: '#a855f7',
                        600: '#9333ea',
                        700: '#7e22ce',
                    },
                    audio: {
                        50: '#fff7ed',
                        100: '#ffedd5',
                        200: '#fed7aa',
                        500: '#f97316',
                        600: '#ea580c',
                        700: '#c2410c',
                    },
                    archive: {
                        50: '#f9fafb',
                        100: '#f3f4f6',
                        200: '#e5e7eb',
                        500: '#6b7280',
                        600: '#4b5563',
                        700: '#374151',
                    },
                    code: {
                        50: '#f0fdfa',
                        100: '#ccfbf1',
                        200: '#99f6e4',
                        500: '#14b8a6',
                        600: '#0d9488',
                        700: '#0f766e',
                    },
                },
            },
            // Instance gradients
            backgroundImage: {
                'instance-banner': 'var(--instance-banner-bg)',
                'instance-hero': 'var(--instance-hero-bg)',
            },
            animation: {
                'fade-in': 'fadeIn 0.3s ease-in-out',
                'fade-in-up': 'fadeInUp 0.4s ease-out',
                'slide-in-right': 'slideInRight 0.3s ease-out',
                'slide-in-top': 'slideInTop 0.4s ease-out',
                'scale-in': 'scaleIn 0.2s ease-out',
                'shake': 'shake 0.5s ease-in-out',
                // File type badge animations (2026)
                'badge-in': 'badgeIn 0.3s ease-out',
                'badge-bounce': 'badgeBounce 0.3s ease-in-out',
                'badge-wiggle': 'badgeWiggle 0.4s ease-in-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                fadeInUp: {
                    '0%': {
                        opacity: '0',
                        transform: 'translateY(20px)',
                    },
                    '100%': {
                        opacity: '1',
                        transform: 'translateY(0)',
                    },
                },
                slideInRight: {
                    '0%': {
                        transform: 'translateX(100%)',
                        opacity: '0',
                    },
                    '100%': {
                        transform: 'translateX(0)',
                        opacity: '1',
                    },
                },
                slideInTop: {
                    '0%': {
                        transform: 'translateY(-20px)',
                        opacity: '0',
                    },
                    '100%': {
                        transform: 'translateY(0)',
                        opacity: '1',
                    },
                },
                scaleIn: {
                    '0%': {
                        transform: 'scale(0.95)',
                        opacity: '0',
                    },
                    '100%': {
                        transform: 'scale(1)',
                        opacity: '1',
                    },
                },
                shake: {
                    '0%, 100%': { transform: 'translateX(0)' },
                    '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
                    '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
                },
                // File type badge animations (2026)
                badgeIn: {
                    '0%': { opacity: '0', transform: 'scale(0.8) rotate(-5deg)' },
                    '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
                },
                badgeBounce: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-4px)' },
                },
                badgeWiggle: {
                    '0%, 100%': { transform: 'rotate(0deg)' },
                    '25%': { transform: 'rotate(-2deg)' },
                    '75%': { transform: 'rotate(2deg)' },
                },
            },
        },
    },
    plugins: [],
};
export default config;
