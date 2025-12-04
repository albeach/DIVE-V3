<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <h1 class="dive-title">${msg("pageExpiredTitle")}</h1>
    <#elseif section = "form">
        <div class="dive-page-expired">
            <!-- Status Icon -->
            <div class="dive-expired-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            
            <!-- Message -->
            <div class="dive-expired-message">
                <p class="dive-expired-text">${msg("pageExpiredMsg1")}</p>
                <p class="dive-expired-subtext">${msg("pageExpiredMsg2")}</p>
            </div>
            
            <!-- Actions -->
            <div class="dive-expired-actions">
                <a id="loginRestartLink" href="${url.loginRestartFlowUrl}" class="dive-button dive-button-primary">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    ${msg("doClickHere")} - ${msg("pageExpiredTitle")}
                </a>
                
                <a id="loginContinueLink" href="${url.loginAction}" class="dive-button dive-button-secondary">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    ${msg("doContinue")}
                </a>
            </div>
            
            <!-- Help Text -->
            <div class="dive-expired-help">
                <p>${msg("pageExpiredHelpText", "This can happen if you waited too long or used the browser's back button.")}</p>
            </div>
        </div>
    </#if>
</@layout.registrationLayout>






