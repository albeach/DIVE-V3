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

                <div class="dive-form-options">
                    <#if realm.rememberMe && !usernameHidden??>
                        <div class="dive-checkbox">
                            <#if login.rememberMe??>
                                <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" checked> 
                            <#else>
                                <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox"> 
                            </#if>
                            <label for="rememberMe">${msg("rememberMe")}</label>
                        </div>
                    </#if>
                    
                    <#if realm.resetPasswordAllowed>
                        <div class="dive-forgot-password">
                            <a tabindex="5" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
                        </div>
                    </#if>
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
                        <#if idpAlias?contains("usa") || idpAlias?contains("us-")><#assign countryCode = "USA"><#assign flagEmoji = "🇺🇸"></#if>
                        <#if idpAlias?contains("fra") || idpAlias?contains("france")><#assign countryCode = "FRA"><#assign flagEmoji = "🇫🇷"></#if>
                        <#if idpAlias?contains("deu") || idpAlias?contains("germany")><#assign countryCode = "DEU"><#assign flagEmoji = "🇩🇪"></#if>
                        <#if idpAlias?contains("can") || idpAlias?contains("canada")><#assign countryCode = "CAN"><#assign flagEmoji = "🇨🇦"></#if>
                        <#if idpAlias?contains("gbr") || idpAlias?contains("uk")><#assign countryCode = "GBR"><#assign flagEmoji = "🇬🇧"></#if>
                        <#if idpAlias?contains("esp") || idpAlias?contains("spain")><#assign countryCode = "ESP"><#assign flagEmoji = "🇪🇸"></#if>
                        <#if idpAlias?contains("ita") || idpAlias?contains("italy")><#assign countryCode = "ITA"><#assign flagEmoji = "🇮🇹"></#if>
                        <#if idpAlias?contains("nld") || idpAlias?contains("netherlands")><#assign countryCode = "NLD"><#assign flagEmoji = "🇳🇱"></#if>
                        <#if idpAlias?contains("pol") || idpAlias?contains("poland")><#assign countryCode = "POL"><#assign flagEmoji = "🇵🇱"></#if>
                        
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


