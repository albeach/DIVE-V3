<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
    <#elseif section = "form">
        <#-- #region agent log -->
        <#-- Hypothesis C,E: Log error page context to see what state was lost -->
        <script>
        (function() {
            const errorData = {
                message: '${message.summary?js_string}',
                url: window.location.href,
                hasState: window.location.href.includes('state='),
                hasCode: window.location.href.includes('code='),
                hasSessionState: window.location.href.includes('session_state='),
                realm: '${realm.name?js_string}',
                client: '${client.clientId?js_string}'
            };
            fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'error.ftl:10',message:'OAuth error page loaded',data:errorData,timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'C,E'})}).catch(()=>{});
        })();
        </script>
        <#-- #endregion -->
        <div class="dive-error-page">
            <!-- Status Indicator -->
            <div class="dive-error-status">
                <#if message?has_content && message.summary?has_content>
                    <#assign errorText = message.summary?lower_case>
                    <#if errorText?contains("expired") || errorText?contains("timeout") || errorText?contains("login again") || errorText?contains("please login")>
                        <span class="dive-error-code">⏳</span>
                    <#elseif errorText?contains("denied") || errorText?contains("unauthorized") || errorText?contains("forbidden")>
                        <span class="dive-error-code">🚫</span>
                    <#elseif errorText?contains("locked") || errorText?contains("disabled")>
                        <span class="dive-error-code">🔒</span>
                    <#else>
                        <span class="dive-error-code">⚠</span>
                    </#if>
                <#else>
                    <span class="dive-error-code">⚠</span>
                </#if>
            </div>

            <!-- Title -->
            <#if message?has_content && message.summary?has_content>
                <#assign errorText = message.summary?lower_case>
                <#if errorText?contains("expired") || errorText?contains("timeout") || errorText?contains("login again") || errorText?contains("please login")>
                    <h1 class="dive-error-title">${msg("errorSessionTitle")}</h1>
                <#elseif errorText?contains("denied") || errorText?contains("unauthorized") || errorText?contains("forbidden")>
                    <h1 class="dive-error-title">${msg("errorUnauthorizedTitle")}</h1>
                <#else>
                    <h1 class="dive-error-title">${msg("errorTitle")}</h1>
                </#if>
            <#else>
                <h1 class="dive-error-title">${msg("errorTitle")}</h1>
            </#if>

            <!-- Error-Specific Message -->
            <div class="dive-error-message">
                <#if message?has_content && message.summary?has_content>
                    <#assign errorText = message.summary?lower_case>

                    <#-- SESSION EXPIRED / LOGIN AGAIN (most common error) -->
                    <#if errorText?contains("login again") || errorText?contains("please login") || errorText?contains("error occurred")>
                        <p><strong>${msg("errorSessionTitle")}</strong></p>
                        <p>${msg("errorSessionDesc")}</p>

                    <#-- CONFIGURATION ERRORS -->
                    <#elseif errorText?contains("redirect") || errorText?contains("client not found")>
                        <p><strong>${msg("errorRedirectTitle")}</strong></p>
                        <p>${msg("errorRedirectDesc")}</p>

                    <#-- CREDENTIAL ERRORS -->
                    <#elseif errorText?contains("invalid") && (errorText?contains("credential") || errorText?contains("password") || errorText?contains("username"))>
                        <p><strong>${msg("errorCredentialsTitle")}</strong></p>
                        <p>${msg("errorCredentialsDesc")}</p>

                    <#-- ACCOUNT LOCKED -->
                    <#elseif errorText?contains("locked")>
                        <p><strong>${msg("errorAccountLockedTitle")}</strong></p>
                        <p>${msg("errorAccountLockedDesc")}</p>

                    <#-- ACCOUNT DISABLED -->
                    <#elseif errorText?contains("disabled") && !errorText?contains("temporarily")>
                        <p><strong>${msg("errorAccountDisabledTitle")}</strong></p>
                        <p>${msg("errorAccountDisabledDesc")}</p>

                    <#-- TEMPORARILY DISABLED -->
                    <#elseif errorText?contains("temporarily") || (errorText?contains("too many") && errorText?contains("attempt"))>
                        <p><strong>${msg("errorAccountTempDisabledTitle")}</strong></p>
                        <p>${msg("errorAccountTempDisabledDesc")}</p>

                    <#-- SESSION/TOKEN EXPIRED -->
                    <#elseif errorText?contains("expired") || errorText?contains("timeout") || errorText?contains("timed out")>
                        <p><strong>${msg("errorSessionTitle")}</strong></p>
                        <p>${msg("errorSessionDesc")}</p>

                    <#-- INVALID TOKEN -->
                    <#elseif errorText?contains("invalid") && errorText?contains("token")>
                        <p><strong>${msg("errorTokenInvalidTitle")}</strong></p>
                        <p>${msg("errorTokenInvalidDesc")}</p>

                    <#-- IDP UNAVAILABLE -->
                    <#elseif errorText?contains("identity provider") && (errorText?contains("unavailable") || errorText?contains("error") || errorText?contains("failed"))>
                        <p><strong>${msg("errorIdpUnavailableTitle")}</strong></p>
                        <p>${msg("errorIdpUnavailableDesc")}</p>

                    <#-- ACCOUNT LINKING -->
                    <#elseif errorText?contains("link") && errorText?contains("account")>
                        <p><strong>${msg("errorIdpLinkTitle")}</strong></p>
                        <p>${msg("errorIdpLinkDesc")}</p>

                    <#-- ACCESS DENIED -->
                    <#elseif errorText?contains("access denied") || errorText?contains("unauthorized") || errorText?contains("forbidden")>
                        <p><strong>${msg("errorUnauthorizedTitle")}</strong></p>
                        <p>${msg("errorUnauthorizedDesc")}</p>

                    <#-- MFA REQUIRED -->
                    <#elseif errorText?contains("mfa") || errorText?contains("two-factor") || errorText?contains("otp required")>
                        <p><strong>${msg("errorMfaRequiredTitle")}</strong></p>
                        <p>${msg("errorMfaRequiredDesc")}</p>

                    <#-- MFA FAILED -->
                    <#elseif errorText?contains("otp") && (errorText?contains("invalid") || errorText?contains("incorrect"))>
                        <p><strong>${msg("errorMfaFailedTitle")}</strong></p>
                        <p>${msg("errorMfaFailedDesc")}</p>

                    <#-- SECURITY KEY -->
                    <#elseif errorText?contains("webauthn") || errorText?contains("security key") || errorText?contains("passkey")>
                        <p><strong>${msg("errorSecurityKeyTitle")}</strong></p>
                        <p>${msg("errorSecurityKeyDesc")}</p>

                    <#-- CERTIFICATE -->
                    <#elseif errorText?contains("certificate") || errorText?contains("ssl") || errorText?contains("tls")>
                        <p><strong>${msg("errorCertificateTitle")}</strong></p>
                        <p>${msg("errorCertificateDesc")}</p>

                    <#-- USER NOT FOUND -->
                    <#elseif errorText?contains("user") && (errorText?contains("not found") || errorText?contains("does not exist"))>
                        <p><strong>${msg("errorUserNotFoundTitle")}</strong></p>
                        <p>${msg("errorUserNotFoundDesc")}</p>

                    <#-- INVALID EMAIL -->
                    <#elseif errorText?contains("email") && errorText?contains("invalid")>
                        <p><strong>${msg("errorEmailInvalidTitle")}</strong></p>
                        <p>${msg("errorEmailInvalidDesc")}</p>

                    <#-- NETWORK/SERVICE -->
                    <#elseif errorText?contains("network") || errorText?contains("connection") || errorText?contains("unreachable")>
                        <p><strong>${msg("errorNetworkTitle")}</strong></p>
                        <p>${msg("errorNetworkDesc")}</p>

                    <#elseif errorText?contains("service") && errorText?contains("unavailable")>
                        <p><strong>${msg("errorServiceTitle")}</strong></p>
                        <p>${msg("errorServiceDesc")}</p>

                    <#-- FALLBACK: Show raw message -->
                    <#else>
                        <p>${kcSanitize(message.summary)?no_esc}</p>
                    </#if>
                <#else>
                    <p>${msg("errorGenericDesc")}</p>
                </#if>
            </div>

            <!-- Authorization Check Visualization (for access denials) -->
            <#if message?has_content && message.summary?has_content>
                <#assign errorText = message.summary?lower_case>
                <#if errorText?contains("access") || errorText?contains("denied") || errorText?contains("forbidden") || errorText?contains("unauthorized") || errorText?contains("clearance") || errorText?contains("releasab")>
                    <details class="dive-authz-check">
                        <summary class="dive-authz-summary">
                            <span>${msg("error.authz.checkTitle")}</span>
                            <svg class="dive-authz-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <div class="dive-authz-content">
                            <p class="dive-authz-note">${msg("error.authz.checkNote")}</p>
                            <ul class="dive-authz-list">
                                <li class="dive-authz-item dive-authz-pass">
                                    <span class="dive-authz-icon">✓</span>
                                    <span class="dive-authz-label">${msg("error.authz.authenticated")}</span>
                                </li>
                                <li class="dive-authz-item dive-authz-unknown">
                                    <span class="dive-authz-icon">?</span>
                                    <span class="dive-authz-label">${msg("error.authz.clearance")}</span>
                                </li>
                                <li class="dive-authz-item dive-authz-unknown">
                                    <span class="dive-authz-icon">?</span>
                                    <span class="dive-authz-label">${msg("error.authz.releasability")}</span>
                                </li>
                                <li class="dive-authz-item dive-authz-unknown">
                                    <span class="dive-authz-icon">?</span>
                                    <span class="dive-authz-label">${msg("error.authz.coi")}</span>
                                </li>
                            </ul>
                            <p class="dive-authz-footer">${msg("error.authz.footer")}</p>
                        </div>
                    </details>
                </#if>
            </#if>

            <!-- Actions -->
            <div class="dive-error-actions">
                <#if url.loginRestartFlowUrl?has_content>
                    <a href="${url.loginRestartFlowUrl}" class="dive-button-primary">
                        ${msg("errorTryAgain")}
                    </a>
                <#elseif url.loginUrl?has_content>
                    <a href="${url.loginUrl}" class="dive-button-primary">
                        ${msg("errorTryAgain")}
                    </a>
                </#if>
                <#if client?? && client.baseUrl?has_content>
                    <a href="${client.baseUrl}" class="dive-button-secondary">
                        ${msg("errorBackToApp")}
                    </a>
                </#if>
            </div>

            <!-- Technical Reference (Microprogression Level 3) -->
            <#if message?has_content && message.summary?has_content>
                <details class="dive-error-details">
                    <summary>${msg("errorTechnicalRef")}</summary>
                    <div class="dive-error-trace">
                        <div class="dive-trace-header">
                            <span class="dive-trace-label">${msg("error.trace.timestamp")}</span>
                            <span class="dive-trace-value">${.now?iso_utc}</span>
                        </div>
                        <div class="dive-trace-header">
                            <span class="dive-trace-label">${msg("error.trace.realm")}</span>
                            <span class="dive-trace-value"><#if realm?? && realm.name?has_content>${realm.name}<#else>unknown</#if></span>
                        </div>
                        <div class="dive-trace-header">
                            <span class="dive-trace-label">${msg("error.trace.client")}</span>
                            <span class="dive-trace-value"><#if client?? && client.clientId?has_content>${client.clientId}<#else>unknown</#if></span>
                        </div>
                        <div class="dive-trace-message">
                            <span class="dive-trace-label">${msg("error.trace.message")}</span>
                            <code>${kcSanitize(message.summary)?no_esc}</code>
                        </div>
                    </div>
                </details>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>
