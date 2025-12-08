<#import "template.ftl" as layout>
<@layout.registrationLayout; section>
    <#if section = "header">
        <h1 class="dive-title">${msg("logoutConfirmTitle")}</h1>
    <#elseif section = "form">
        <div class="dive-logout-confirm">
            <!-- Status Icon -->
            <div class="dive-logout-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
            </div>
            
            <!-- Message -->
            <div class="dive-logout-message">
                <p class="dive-logout-text">${msg("logoutConfirmHeader")}</p>
            </div>
            
            <!-- Confirmation Form -->
            <form class="dive-logout-form" action="${url.logoutConfirmAction}" method="POST">
                <input type="hidden" name="session_code" value="${logoutConfirm.code}">
                
                <div class="dive-logout-actions">
                    <button type="submit" name="confirmLogout" class="dive-button dive-button-primary" value="${msg("doLogout")}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        ${msg("doLogout")}
                    </button>
                    
                    <#if url.loginUrl??>
                        <a href="${url.loginUrl}" class="dive-button dive-button-secondary">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            ${msg("doCancel")}
                        </a>
                    </#if>
                </div>
            </form>
        </div>
    </#if>
</@layout.registrationLayout>










