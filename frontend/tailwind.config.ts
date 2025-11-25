import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
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
            },
        },
    },
    plugins: [],
};
export default config;

