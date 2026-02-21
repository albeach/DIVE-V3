<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true; section>
    <#if section = "header">
        Session Conflict Detected
    <#elseif section = "form">
    
    <!-- Session Conflict Card -->
    <div class="dive-webauthn-info-card" style="border-left: 4px solid #f59e0b;">
        <div class="dive-webauthn-icon-container" style="background: #fffbeb;">
            <svg class="dive-webauthn-icon" style="color: #f59e0b;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
        <h2 class="dive-webauthn-title" style="color: #d97706;">Active Session Detected</h2>
        <p class="dive-webauthn-description" style="color: #92400e;">
            You are already authenticated as a different user in this session. Please sign out first before switching accounts.
        </p>
    </div>

    <!-- Action Buttons -->
    <div class="dive-button-group" style="margin-top: 2rem;">
        <a href="${url.logoutUrl}" class="dive-button dive-button-primary" style="width: 100%;">
            <svg style="width: 20px; height: 20px; margin-right: 8px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out & Login as Different User
        </a>
        
        <a href="${url.loginRestartFlowUrl}" class="dive-button dive-button-secondary" style="width: 100%; margin-top: 1rem;">
            <svg style="width: 20px; height: 20px; margin-right: 8px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Continue with Current Session
        </a>
    </div>

    <#elseif section = "info">
        <p>This security measure prevents accidental account mixing and session fixation attacks.</p>
    </#if>
</@layout.registrationLayout>
