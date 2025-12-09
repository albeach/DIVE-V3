<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false; section>
    <#if section = "header">
        <h1 class="dive-title">${msg("loginChooseAuthenticator")}</h1>
    <#elseif section = "form">
        <div class="dive-select-authenticator">
            <!-- Instructions -->
            <div class="dive-authenticator-message">
                <p>${msg("selectAuthenticatorHelp")}</p>
            </div>
            
            <!-- Authenticator Options -->
            <form id="kc-select-credential-form" class="dive-authenticator-form" action="${url.loginAction}" method="post">
                <div class="dive-authenticator-list">
                    <#list auth.authenticationSelections as authenticationSelection>
                        <button type="submit" 
                                class="dive-authenticator-option" 
                                name="authenticationExecution" 
                                value="${authenticationSelection.authExecId}">
                            <div class="dive-authenticator-icon">
                                <#if authenticationSelection.iconCssClass?has_content>
                                    <i class="${authenticationSelection.iconCssClass}" aria-hidden="true"></i>
                                <#elseif authenticationSelection.displayName?contains("OTP") || authenticationSelection.displayName?contains("otp")>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="32" height="32">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                <#elseif authenticationSelection.displayName?contains("WebAuthn") || authenticationSelection.displayName?contains("Security Key") || authenticationSelection.displayName?contains("Passkey")>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="32" height="32">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                <#elseif authenticationSelection.displayName?contains("Password")>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="32" height="32">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                <#else>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="32" height="32">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </#if>
                            </div>
                            <div class="dive-authenticator-details">
                                <span class="dive-authenticator-name">${msg('${authenticationSelection.displayName}')}</span>
                                <span class="dive-authenticator-help">${msg('${authenticationSelection.helpText}')}</span>
                            </div>
                            <div class="dive-authenticator-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                    </#list>
                </div>
            </form>
        </div>
    </#if>
</@layout.registrationLayout>











