<#import "template.ftl" as layout>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${msg("logoutConfirmTitle")}</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />

    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            position: relative;
            overflow: hidden;
        }

        /* Animated gradient background */
        body::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background:
                radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.3) 0%, transparent 50%),
                radial-gradient(circle at 80% 50%, rgba(118, 75, 162, 0.3) 0%, transparent 50%);
            animation: rotate 20s linear infinite;
        }

        @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        /* Modern card container */
        .logout-container {
            position: relative;
            z-index: 10;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border-radius: 24px;
            box-shadow:
                0 20px 60px rgba(0, 0, 0, 0.3),
                0 0 0 1px rgba(255, 255, 255, 0.1);
            max-width: 500px;
            width: 100%;
            overflow: hidden;
            animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        /* Image section */
        .logout-hero {
            padding: 3rem 2rem 2rem;
            text-align: center;
            background: linear-gradient(180deg,
                rgba(102, 126, 234, 0.08) 0%,
                rgba(255, 255, 255, 0) 100%);
        }

        .logout-image {
            width: 200px;
            height: 200px;
            margin: 0 auto 1.5rem;
            animation: float 3s ease-in-out infinite;
        }

        .logout-image img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.1));
        }

        @keyframes float {
            0%, 100% {
                transform: translateY(0px);
            }
            50% {
                transform: translateY(-10px);
            }
        }

        /* Content section */
        .logout-content {
            padding: 0 2rem 3rem;
            text-align: center;
        }

        .logout-title {
            font-size: 1.875rem;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 0.75rem;
            letter-spacing: -0.025em;
        }

        .logout-subtitle {
            font-size: 1rem;
            color: #64748b;
            line-height: 1.6;
            margin-bottom: 2rem;
        }

        /* Buttons */
        .logout-actions {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .logout-button {
            width: 100%;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            border: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            text-decoration: none;
        }

        .logout-button-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }

        .logout-button-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.5);
        }

        .logout-button-primary:active {
            transform: translateY(0);
        }

        .logout-button-secondary {
            background: rgba(100, 116, 139, 0.08);
            color: #64748b;
            border: 1.5px solid rgba(100, 116, 139, 0.2);
        }

        .logout-button-secondary:hover {
            background: rgba(100, 116, 139, 0.12);
            border-color: rgba(100, 116, 139, 0.3);
        }

        .button-icon {
            width: 20px;
            height: 20px;
        }

        /* Security note */
        .logout-security-note {
            margin-top: 2rem;
            padding: 1rem;
            background: rgba(102, 126, 234, 0.05);
            border-radius: 12px;
            border: 1px solid rgba(102, 126, 234, 0.1);
        }

        .security-note-content {
            display: flex;
            align-items: start;
            gap: 0.75rem;
            text-align: left;
        }

        .security-icon {
            width: 20px;
            height: 20px;
            flex-shrink: 0;
            color: #667eea;
            margin-top: 2px;
        }

        .security-text {
            font-size: 0.875rem;
            color: #475569;
            line-height: 1.6;
        }

        /* Mobile responsive */
        @media (max-width: 640px) {
            body {
                padding: 1rem;
            }

            .logout-container {
                border-radius: 20px;
            }

            .logout-hero {
                padding: 2rem 1.5rem 1.5rem;
            }

            .logout-image {
                width: 160px;
                height: 160px;
            }

            .logout-content {
                padding: 0 1.5rem 2rem;
            }

            .logout-title {
                font-size: 1.5rem;
            }

            .logout-subtitle {
                font-size: 0.9375rem;
            }
        }

        /* Accessibility */
        @media (prefers-reduced-motion: reduce) {
            *,
            *::before,
            *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }
    </style>
</head>

<body>
    <div class="logout-container">
        <!-- Hero section with image -->
        <div class="logout-hero">
            <div class="logout-image">
                <img src="${url.resourcesPath}/img/logout-wave.png" alt="Goodbye" />
            </div>
        </div>

        <!-- Content section -->
        <div class="logout-content">
            <h1 class="logout-title">See you later! 👋</h1>
            <p class="logout-subtitle">
                Are you sure you want to sign out? You'll need to authenticate again to access coalition resources.
            </p>

            <!-- Logout form -->
            <form action="${url.logoutConfirmAction}" method="POST">
                <input type="hidden" name="session_code" value="${logoutConfirm.code}">

                <div class="logout-actions">
                    <button type="submit" name="confirmLogout" class="logout-button logout-button-primary">
                        <svg class="button-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span>Yes, sign me out</span>
                    </button>

                    <#if url.loginUrl??>
                        <a href="${url.loginUrl}" class="logout-button logout-button-secondary">
                            <svg class="button-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            <span>No, stay signed in</span>
                        </a>
                    </#if>
                </div>
            </form>

            <!-- Security note -->
            <div class="logout-security-note">
                <div class="security-note-content">
                    <svg class="security-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <p class="security-text">
                        Signing out will end your secure session and revoke access to classified resources.
                    </p>
                </div>
            </div>
        </div>
    </div>
</body>
</html>

