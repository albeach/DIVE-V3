<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        Passkey Error
    <#elseif section = "form">

    <!-- Modern Error Card -->
    <div class="dive-webauthn-info-card" style="border-left: 4px solid #ef4444;">
        <div class="dive-webauthn-icon-container" style="background: #fef2f2;">
            <svg class="dive-webauthn-icon" style="color: #ef4444;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
        <h2 class="dive-webauthn-title" style="color: #dc2626;">Passkey Authentication Failed</h2>
        <p class="dive-webauthn-description" style="color: #991b1b;">
            <#if message?has_content && message.summary?has_content>
                ${kcSanitize(message.summary)?no_esc}
            <#else>
                Failed to authenticate by the Passkey.
            </#if>
        </p>
    </div>

    <!-- Error Details (if available) -->
    <#if message?has_content && message.summary?has_content>
        <div class="dive-alert-modern dive-alert-error-modern" style="display: flex; margin-top: 1.5rem;">
            <div class="dive-alert-icon-wrapper">
                <svg class="dive-alert-icon-modern" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <div class="dive-alert-content-modern">
                <p class="dive-alert-title-modern">What happened?</p>
                <p class="dive-alert-message-modern">${kcSanitize(message.summary)?no_esc}</p>
            </div>
        </div>
    </#if>

    <!-- Action Buttons -->
    <div class="dive-form-buttons" style="display: flex; gap: 1rem; margin-top: 2rem;">
        <a href="${url.loginRestartFlowUrl}" class="dive-button-primary dive-button-hero" style="flex: 1;">
            <svg class="dive-button-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Try Again with Passkey</span>
        </a>
        <a href="${url.loginUrl}" class="dive-button-secondary-modern" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <svg class="dive-button-icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Use Password Instead
        </a>
    </div>

    <!-- Help Section -->
    <div class="dive-help-section">
        <details class="dive-help-details">
            <summary class="dive-help-summary">
                <svg class="dive-help-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Why did this fail?
            </summary>
            <div class="dive-help-content">
                <h4>Common Causes:</h4>
                <ul>
                    <li><strong>Passkey not registered:</strong> You may need to register a passkey first by logging in with username/password</li>
                    <li><strong>Wrong passkey used:</strong> Make sure you're using the passkey registered for this account</li>
                    <li><strong>Browser/device changed:</strong> Passkeys are device-specific and may not work on a different device</li>
                    <li><strong>User not found:</strong> The passkey is valid but not associated with any user in this system</li>
                    <li><strong>Timeout:</strong> The authentication request may have expired</li>
                </ul>
                <h4>What to do:</h4>
                <ul>
                    <li>Click "Use Password Instead" to log in normally</li>
                    <li>After logging in with password, register a new passkey for this device</li>
                    <li>Ensure you're using the correct security key or device authenticator</li>
                </ul>
            </div>
        </details>
    </div>

    </#if>
</@layout.registrationLayout>
