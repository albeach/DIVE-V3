<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=social.displayInfo displayWide=(realm.password && social.providers??); section>
    <#if section = "header">
        ${msg("doLogIn")}
    <#elseif section = "form">
    <div id="kc-form" <#if realm.password && social.providers??>class="kc-form-social"</#if>>
      <div id="kc-form-wrapper">
        <#if realm.password>
            <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                <div class="dive-form-group">
                    <#if !usernameHidden??>
                        <#-- Fresh login: show editable username field -->
                        <label for="username" class="dive-label">
                            <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>
                        </label>
                        <input 
                            tabindex="1" 
                            id="username" 
                            class="dive-input" 
                            name="username" 
                            value="${(login.username!'')}"  
                            type="text" 
                            autofocus 
                            autocomplete="off"
                            aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                            placeholder="<#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif !realm.registrationEmailAsUsername>${msg("usernameOrEmail")}<#else>${msg("email")}</#if>"
                        />

                        <#if messagesPerField.existsError('username','password')>
                            <span id="input-error" class="dive-error" aria-live="polite">
                                ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                            </span>
                        </#if>
                    <#else>
                        <#-- Re-authentication: show read-only username with "Not you?" option -->
                        <label for="username-display" class="dive-label">
                            Signing in as
                        </label>
                        <div class="dive-reauth-user" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 1px solid #e2e8f0; border-radius: 0.5rem; margin-bottom: 0.5rem;">
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <div style="width: 2.25rem; height: 2.25rem; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 0.875rem; text-transform: uppercase;">
                                   <#if (login.username!'')?has_content>${(login.username!'')?substring(0, 1)}<#else>?</#if>
                                </div>
                                <span style="font-weight: 600; color: #1e293b; font-size: 0.9375rem;">${login.username!''}</span>
                            </div>
                            <a href="${url.loginRestartFlowUrl}" style="font-size: 0.8125rem; color: #6366f1; text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 0.375rem; padding: 0.375rem 0.75rem; border-radius: 0.375rem; transition: all 0.2s ease;" onmouseover="this.style.background='#eef2ff'" onmouseout="this.style.background='transparent'">
                                <span>Not you?</span>
                                <svg style="width: 0.875rem; height: 0.875rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                            </a>
                        </div>
                        <input type="hidden" id="username" name="username" value="${(login.username!'')}" />
                    </#if>
                </div>

                <div class="dive-form-group">
                    <label for="password" class="dive-label">${msg("password")}</label>
                    <div class="dive-password-wrapper">
                        <input 
                            tabindex="2" 
                            id="password" 
                            class="dive-input dive-password-input" 
                            name="password" 
                            type="password" 
                            autocomplete="off"
                            aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>"
                            placeholder="${msg("password")}"
                        />
                        <button 
                            type="button" 
                            class="dive-password-toggle" 
                            onclick="togglePassword()" 
                            aria-label="Toggle password visibility"
                        >
                            <svg id="eye-icon" class="dive-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <svg id="eye-off-icon" class="dive-icon dive-hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            </svg>
                        </button>
                    </div>

                    <#if usernameHidden?? && messagesPerField.existsError('username','password')>
                        <span id="input-error" class="dive-error" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
                        </span>
                    </#if>
                </div>

                <!-- Clearance Notice -->
                <div class="dive-clearance-notice" style="display: flex; align-items: flex-start; gap: 0.75rem; margin-top: 1rem; padding: 0.875rem 1rem; background: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <svg class="dive-clearance-icon" style="width: 1.25rem; height: 1.25rem; min-width: 1.25rem; flex-shrink: 0; color: #0ea5e9; margin-top: 0.125rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span class="dive-clearance-text" style="font-size: 0.8125rem; font-weight: 500; letter-spacing: 0.01em; color: #0c4a6e; line-height: 1.5;">Access level based on clearance assigned by your Identity Provider (IdP)</span>
                </div>

                <div id="kc-form-buttons" class="dive-form-buttons">
                    <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                    <button 
                        tabindex="4" 
                        class="dive-button-primary" 
                        name="login" 
                        id="kc-login" 
                        type="submit"
                    >
                        ${msg("doLogIn")}
                    </button>
                </div>
                
                <#-- Back to Instance Link: honor realm attribute appBaseUrl if set, else default to NEXTAUTH_URL base -->
                <#assign destinationUrl = "">
                <#if realm?? && realm.attributes?? && realm.attributes['appBaseUrl']?? && (realm.attributes['appBaseUrl']?length > 0)>
                    <#assign destinationUrl = realm.attributes['appBaseUrl']>
                </#if>
                <#if !destinationUrl?has_content && url?has_content && url.redirectUri??>
                    <#-- Derive base from redirectUri host if appBaseUrl not set -->
                    <#assign redirectUri = url.redirectUri>
                    <#assign protoHost = redirectUri?keep_before("/api/auth")>
                    <#if protoHost?has_content><#assign destinationUrl = protoHost></#if>
                </#if>
                <#if !destinationUrl?has_content>
                    <#assign destinationUrl = "https://localhost:3000">
                </#if>
                
                <div class="dive-back-link" style="text-align: center; margin-top: 1.25rem;">
                    <a href="${destinationUrl}" style="display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: #6b7280; text-decoration: none; transition: color 0.2s ease;">
                        <svg style="width: 1rem; height: 1rem;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span>Return to Portal</span>
                    </a>
                </div>
            </form>
        </#if>
        </div>

        <#if realm.password && social.providers??>
            <div id="kc-social-providers" class="dive-idp-section">
                <div class="dive-idp-divider">
                    <span class="dive-idp-divider-line"></span>
                    <span class="dive-idp-divider-text">${msg("orFederatedIdp", "or federate via")}</span>
                    <span class="dive-idp-divider-line"></span>
                </div>

                <div class="dive-idp-grid">
                    <#list social.providers as p>
                        <#-- Extract country code and flag emoji from alias -->
                        <#assign countryCode = "">
                        <#assign flagEmoji = "🌐">
                        <#assign idpAlias = p.alias!?lower_case>
                        
                        <#-- NATO Founding Members (1949) - 12 countries -->
                        <#if idpAlias?contains("usa") || idpAlias?contains("us-")><#assign countryCode = "USA"><#assign flagEmoji = "🇺🇸"></#if>
                        <#if idpAlias?contains("can") || idpAlias?contains("canada")><#assign countryCode = "CAN"><#assign flagEmoji = "🇨🇦"></#if>
                        <#if idpAlias?contains("gbr") || idpAlias?contains("uk")><#assign countryCode = "GBR"><#assign flagEmoji = "🇬🇧"></#if>
                        <#if idpAlias?contains("fra") || idpAlias?contains("france")><#assign countryCode = "FRA"><#assign flagEmoji = "🇫🇷"></#if>
                        <#if idpAlias?contains("bel") || idpAlias?contains("belgium")><#assign countryCode = "BEL"><#assign flagEmoji = "🇧🇪"></#if>
                        <#if idpAlias?contains("nld") || idpAlias?contains("netherlands")><#assign countryCode = "NLD"><#assign flagEmoji = "🇳🇱"></#if>
                        <#if idpAlias?contains("lux") || idpAlias?contains("luxembourg")><#assign countryCode = "LUX"><#assign flagEmoji = "🇱🇺"></#if>
                        <#if idpAlias?contains("dnk") || idpAlias?contains("denmark")><#assign countryCode = "DNK"><#assign flagEmoji = "🇩🇰"></#if>
                        <#if idpAlias?contains("nor") || idpAlias?contains("norway")><#assign countryCode = "NOR"><#assign flagEmoji = "🇳🇴"></#if>
                        <#if idpAlias?contains("isl") || idpAlias?contains("iceland")><#assign countryCode = "ISL"><#assign flagEmoji = "🇮🇸"></#if>
                        <#if idpAlias?contains("prt") || idpAlias?contains("portugal")><#assign countryCode = "PRT"><#assign flagEmoji = "🇵🇹"></#if>
                        <#if idpAlias?contains("ita") || idpAlias?contains("italy")><#assign countryCode = "ITA"><#assign flagEmoji = "🇮🇹"></#if>
                        
                        <#-- Cold War Expansion (1952-1982) - 4 countries -->
                        <#if idpAlias?contains("grc") || idpAlias?contains("greece")><#assign countryCode = "GRC"><#assign flagEmoji = "🇬🇷"></#if>
                        <#if idpAlias?contains("tur") || idpAlias?contains("turkey")><#assign countryCode = "TUR"><#assign flagEmoji = "🇹🇷"></#if>
                        <#if idpAlias?contains("deu") || idpAlias?contains("germany")><#assign countryCode = "DEU"><#assign flagEmoji = "🇩🇪"></#if>
                        <#if idpAlias?contains("esp") || idpAlias?contains("spain")><#assign countryCode = "ESP"><#assign flagEmoji = "🇪🇸"></#if>
                        
                        <#-- Post-Cold War Expansion (1999) - 3 countries -->
                        <#if idpAlias?contains("cze") || idpAlias?contains("czech")><#assign countryCode = "CZE"><#assign flagEmoji = "🇨🇿"></#if>
                        <#if idpAlias?contains("hun") || idpAlias?contains("hungary")><#assign countryCode = "HUN"><#assign flagEmoji = "🇭🇺"></#if>
                        <#if idpAlias?contains("pol") || idpAlias?contains("poland")><#assign countryCode = "POL"><#assign flagEmoji = "🇵🇱"></#if>
                        
                        <#-- 2004 Expansion - 7 countries -->
                        <#if idpAlias?contains("bgr") || idpAlias?contains("bulgaria")><#assign countryCode = "BGR"><#assign flagEmoji = "🇧🇬"></#if>
                        <#if idpAlias?contains("est") || idpAlias?contains("estonia")><#assign countryCode = "EST"><#assign flagEmoji = "🇪🇪"></#if>
                        <#if idpAlias?contains("lva") || idpAlias?contains("latvia")><#assign countryCode = "LVA"><#assign flagEmoji = "🇱🇻"></#if>
                        <#if idpAlias?contains("ltu") || idpAlias?contains("lithuania")><#assign countryCode = "LTU"><#assign flagEmoji = "🇱🇹"></#if>
                        <#if idpAlias?contains("rou") || idpAlias?contains("romania")><#assign countryCode = "ROU"><#assign flagEmoji = "🇷🇴"></#if>
                        <#if idpAlias?contains("svk") || idpAlias?contains("slovakia")><#assign countryCode = "SVK"><#assign flagEmoji = "🇸🇰"></#if>
                        <#if idpAlias?contains("svn") || idpAlias?contains("slovenia")><#assign countryCode = "SVN"><#assign flagEmoji = "🇸🇮"></#if>
                        
                        <#-- 2009-2020 Expansion - 4 countries -->
                        <#if idpAlias?contains("alb") || idpAlias?contains("albania")><#assign countryCode = "ALB"><#assign flagEmoji = "🇦🇱"></#if>
                        <#if idpAlias?contains("hrv") || idpAlias?contains("croatia")><#assign countryCode = "HRV"><#assign flagEmoji = "🇭🇷"></#if>
                        <#if idpAlias?contains("mne") || idpAlias?contains("montenegro")><#assign countryCode = "MNE"><#assign flagEmoji = "🇲🇪"></#if>
                        <#if idpAlias?contains("mkd") || idpAlias?contains("macedonia")><#assign countryCode = "MKD"><#assign flagEmoji = "🇲🇰"></#if>
                        
                        <#-- Nordic Expansion (2023-2024) - 2 countries -->
                        <#if idpAlias?contains("fin") || idpAlias?contains("finland")><#assign countryCode = "FIN"><#assign flagEmoji = "🇫🇮"></#if>
                        <#if idpAlias?contains("swe") || idpAlias?contains("sweden")><#assign countryCode = "SWE"><#assign flagEmoji = "🇸🇪"></#if>
                        
                        <#-- Non-NATO Partners (FVEY) -->
                        <#if idpAlias?contains("aus") || idpAlias?contains("australia")><#assign countryCode = "AUS"><#assign flagEmoji = "🇦🇺"></#if>
                        <#if idpAlias?contains("nzl") || idpAlias?contains("zealand")><#assign countryCode = "NZL"><#assign flagEmoji = "🇳🇿"></#if>
                        
                        <a id="social-${p.alias}" 
                           class="dive-idp-button" 
                           href="${p.loginUrl}"
                           title="${p.displayName!}"
                           aria-label="Sign in with ${p.displayName}">
                            <span class="dive-idp-flag-emoji">${flagEmoji}</span>
                            <#if countryCode?has_content>
                                <span class="dive-idp-code">${countryCode}</span>
                            <#else>
                                <span class="dive-idp-name">${p.displayName!}</span>
                            </#if>
                        </a>
                    </#list>
                </div>
            </div>
        </#if>

      </div>
    <#elseif section = "info" >
        <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
            <div id="kc-registration" class="dive-registration">
                <span>${msg("noAccount")} <a tabindex="6" href="${url.registrationUrl}">${msg("doRegister")}</a></span>
            </div>
        </#if>
    </#if>

</@layout.registrationLayout>


