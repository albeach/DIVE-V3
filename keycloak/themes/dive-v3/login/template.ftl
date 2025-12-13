<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false displayWide=false showAnotherWayIfPresent=true>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"  "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">

<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="icon" href="${url.resourcesPath}/img/favicon.ico" />
    <#if properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.scripts?has_content>
        <#list properties.scripts?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
    
    <!-- Import Map for WebAuthn (rfc4648 module resolution) -->
    <script type="importmap">
        {
            "imports": {
                "rfc4648": "${url.resourcesCommonPath}/vendor/rfc4648/rfc4648.js"
            }
        }
    </script>
    <script src="${url.resourcesPath}/js/menu-button-links.js" type="module"></script>
    
    <#if scripts??>
        <#list scripts as script>
            <script src="${script}" type="text/javascript"></script>
        </#list>
    </#if>
    
    <!-- DIVE V3 Custom Styles -->
    <link href="${url.resourcesPath}/css/dive-v3.css" rel="stylesheet" />
    
    <#-- ============================================ -->
    <#-- Detect HOST INSTANCE (before body for data attribute) -->
    <#-- ============================================ -->
    <#assign hostInstance = "">
    <#assign hostFlag = "🌐">
    <#assign hostCountryName = "">
    
    <#-- Parse from realm displayName (e.g., "France", "Germany", "United States") -->
    <#if realm?? && realm.displayName?has_content>
        <#if realm.displayName?lower_case?contains("france")>
            <#assign hostInstance = "FRA"><#assign hostFlag = "🇫🇷"><#assign hostCountryName = "France">
        <#elseif realm.displayName?lower_case?contains("germany") || realm.displayName?lower_case?contains("deutschland")>
            <#assign hostInstance = "DEU"><#assign hostFlag = "🇩🇪"><#assign hostCountryName = "Germany">
        <#elseif realm.displayName?lower_case?contains("united kingdom") || realm.displayName?lower_case?contains("britain")>
            <#assign hostInstance = "GBR"><#assign hostFlag = "🇬🇧"><#assign hostCountryName = "United Kingdom">
        <#elseif realm.displayName?lower_case?contains("canada")>
            <#assign hostInstance = "CAN"><#assign hostFlag = "🇨🇦"><#assign hostCountryName = "Canada">
        <#elseif realm.displayName?lower_case?contains("spain") || realm.displayName?lower_case?contains("españa")>
            <#assign hostInstance = "ESP"><#assign hostFlag = "🇪🇸"><#assign hostCountryName = "Spain">
        <#elseif realm.displayName?lower_case?contains("italy") || realm.displayName?lower_case?contains("italia")>
            <#assign hostInstance = "ITA"><#assign hostFlag = "🇮🇹"><#assign hostCountryName = "Italy">
        <#elseif realm.displayName?lower_case?contains("netherlands") || realm.displayName?lower_case?contains("nederland")>
            <#assign hostInstance = "NLD"><#assign hostFlag = "🇳🇱"><#assign hostCountryName = "Netherlands">
        <#elseif realm.displayName?lower_case?contains("poland") || realm.displayName?lower_case?contains("polska")>
            <#assign hostInstance = "POL"><#assign hostFlag = "🇵🇱"><#assign hostCountryName = "Poland">
        <#elseif realm.displayName?lower_case?contains("new zealand") || realm.displayName?lower_case?contains("nzl") || realm.displayName?lower_case?contains("nzdf")>
            <#assign hostInstance = "NZL"><#assign hostFlag = "🇳🇿"><#assign hostCountryName = "New Zealand">
        <#elseif realm.displayName?lower_case?contains("australia") || realm.displayName?lower_case?contains("aus")>
            <#assign hostInstance = "AUS"><#assign hostFlag = "🇦🇺"><#assign hostCountryName = "Australia">
        <#elseif realm.displayName?lower_case?contains("japan") || realm.displayName?lower_case?contains("jpn")>
            <#assign hostInstance = "JPN"><#assign hostFlag = "🇯🇵"><#assign hostCountryName = "Japan">
        <#elseif realm.displayName?lower_case?contains("korea") || realm.displayName?lower_case?contains("kor")>
            <#assign hostInstance = "KOR"><#assign hostFlag = "🇰🇷"><#assign hostCountryName = "South Korea">
        <#elseif realm.displayName?lower_case?contains("usa") || realm.displayName?lower_case?contains("united states") || realm.displayName?lower_case?contains("america")>
            <#assign hostInstance = "USA"><#assign hostFlag = "🇺🇸"><#assign hostCountryName = "United States">
        </#if>
    </#if>
    
    <#-- Fallback: Default to USA -->
    <#if !hostInstance?has_content>
        <#assign hostInstance = "USA"><#assign hostFlag = "🇺🇸"><#assign hostCountryName = "United States">
    </#if>
</head>

<body class="dive-body dive-compact ${bodyClass}" data-realm="<#if realm?? && realm.displayName?has_content>${realm.displayName}</#if>" data-instance="${hostInstance}">
    <!-- Background -->
    <div class="dive-background">
        <#if properties.backgroundImage?has_content>
            <div class="dive-background-image" style="background-image: url('${url.resourcesPath}/img/${properties.backgroundImage}');"></div>
            <div class="dive-background-overlay"></div>
        </#if>
    </div>

    <!-- ============================================ -->
    <!-- FEDERATION HANDOFF BANNER                   -->
    <!-- Modern 2025 UX with clear user education   -->
    <!-- ============================================ -->
    
    <#-- Detect USER'S HOME COUNTRY from federation context -->
    <#assign userHomeInstance = "">
    <#assign userHomeFlag = "🌐">
    <#assign userHomeCountryName = "Partner Nation">
    <#assign isFederatedLogin = false>
    
    <#-- Check for brokerContext (user coming from external IdP) -->
    <#if brokerContext?? && brokerContext.identityProviderAlias?has_content>
        <#assign isFederatedLogin = true>
        <#assign idpAlias = brokerContext.identityProviderAlias?lower_case>
        
        <#if idpAlias?contains("usa") || idpAlias?contains("us-")>
            <#assign userHomeInstance = "USA"><#assign userHomeFlag = "🇺🇸"><#assign userHomeCountryName = "United States">
        <#elseif idpAlias?contains("fra") || idpAlias?contains("france")>
            <#assign userHomeInstance = "FRA"><#assign userHomeFlag = "🇫🇷"><#assign userHomeCountryName = "France">
        <#elseif idpAlias?contains("deu") || idpAlias?contains("germany")>
            <#assign userHomeInstance = "DEU"><#assign userHomeFlag = "🇩🇪"><#assign userHomeCountryName = "Germany">
        <#elseif idpAlias?contains("gbr") || idpAlias?contains("uk")>
            <#assign userHomeInstance = "GBR"><#assign userHomeFlag = "🇬🇧"><#assign userHomeCountryName = "United Kingdom">
        <#elseif idpAlias?contains("can") || idpAlias?contains("canada")>
            <#assign userHomeInstance = "CAN"><#assign userHomeFlag = "🇨🇦"><#assign userHomeCountryName = "Canada">
        <#elseif idpAlias?contains("esp") || idpAlias?contains("spain")>
            <#assign userHomeInstance = "ESP"><#assign userHomeFlag = "🇪🇸"><#assign userHomeCountryName = "Spain">
        <#elseif idpAlias?contains("ita") || idpAlias?contains("italy")>
            <#assign userHomeInstance = "ITA"><#assign userHomeFlag = "🇮🇹"><#assign userHomeCountryName = "Italy">
        <#elseif idpAlias?contains("nld") || idpAlias?contains("netherlands")>
            <#assign userHomeInstance = "NLD"><#assign userHomeFlag = "🇳🇱"><#assign userHomeCountryName = "Netherlands">
        <#elseif idpAlias?contains("pol") || idpAlias?contains("poland")>
            <#assign userHomeInstance = "POL"><#assign userHomeFlag = "🇵🇱"><#assign userHomeCountryName = "Poland">
        </#if>
    </#if>
    
    <#-- Also check client ID for federation hints -->
    <#-- Client ID format: dive-v3-{source}-federation (e.g., dive-v3-usa-federation means coming FROM USA) -->
    <#assign clientData = "">
    <#assign sourceInstance = "">
    <#assign sourceFlag = "">
    <#assign sourceCountryName = "">
    <#if client?? && client.clientId??>
        <#assign clientData = client.clientId?lower_case>
        <#if clientData?contains("federation") || clientData?contains("broker") || clientData?contains("cross-border")>
            <#assign isFederatedLogin = true>
            <#-- Extract source country from client_id (e.g., dive-v3-usa-federation) -->
            <#if clientData?contains("-usa-")>
                <#assign sourceInstance = "USA"><#assign sourceFlag = "🇺🇸"><#assign sourceCountryName = "United States">
            <#elseif clientData?contains("-fra-")>
                <#assign sourceInstance = "FRA"><#assign sourceFlag = "🇫🇷"><#assign sourceCountryName = "France">
            <#elseif clientData?contains("-deu-")>
                <#assign sourceInstance = "DEU"><#assign sourceFlag = "🇩🇪"><#assign sourceCountryName = "Germany">
            <#elseif clientData?contains("-gbr-")>
                <#assign sourceInstance = "GBR"><#assign sourceFlag = "🇬🇧"><#assign sourceCountryName = "United Kingdom">
            <#elseif clientData?contains("-can-")>
                <#assign sourceInstance = "CAN"><#assign sourceFlag = "🇨🇦"><#assign sourceCountryName = "Canada">
            <#elseif clientData?contains("-esp-")>
                <#assign sourceInstance = "ESP"><#assign sourceFlag = "🇪🇸"><#assign sourceCountryName = "Spain">
            <#-- NEW: For cross-border-client, detect source from redirect_uri parameter -->
            <#elseif clientData?contains("cross-border")>
                <#-- Check redirect_uri query parameter to determine source -->
                <#if RequestParameters?? && RequestParameters['redirect_uri']??>
                    <#assign redirectUriParam = RequestParameters['redirect_uri']?first?lower_case>
                    <#if redirectUriParam?contains("dive-v3-broker/broker") || redirectUriParam?contains(":8443")>
                        <#-- Default to USA Hub for dive-v3-broker realm -->
                        <#assign sourceInstance = "USA"><#assign sourceFlag = "🇺🇸"><#assign sourceCountryName = "United States">
                    </#if>
                <#else>
                    <#-- Fallback: If using cross-border-client and realm is NOT dive-v3-broker-*, assume USA Hub -->
                    <#if realm?? && realm.name?? && !realm.name?contains("-fra") && !realm.name?contains("-deu") && !realm.name?contains("-can")>
                        <#assign sourceInstance = "USA"><#assign sourceFlag = "🇺🇸"><#assign sourceCountryName = "United States">
                    </#if>
                </#if>
            </#if>
        </#if>
    </#if>

    <#-- Show Federation Handoff Banner when cross-border authentication detected -->
    <#-- This shows when: user comes from a different instance (sourceInstance != hostInstance) -->
    <#if isFederatedLogin && sourceInstance?has_content && sourceInstance != hostInstance>
    <div class="dive-federation-banner dive-federation-banner-animated">
        <div class="dive-federation-handoff">
            <!-- LEFT: Your Identity (Where you're authenticating) -->
            <div class="dive-handoff-source">
                <div class="dive-handoff-flag-container dive-flag-glow">
                    <span class="dive-handoff-flag">${hostFlag}</span>
                </div>
                <div class="dive-handoff-label">
                    <span class="dive-handoff-micro">Your Identity</span>
                    <span class="dive-handoff-country">${hostInstance}</span>
                </div>
            </div>
            
            <!-- Animated Flow Indicator -->
            <div class="dive-handoff-flow">
                <div class="dive-handoff-arrow-track">
                    <div class="dive-handoff-arrow-particle"></div>
                </div>
                <span class="dive-handoff-via">→</span>
            </div>
            
            <!-- RIGHT: Destination Application (Where you want access) -->
            <div class="dive-handoff-destination">
                <div class="dive-handoff-flag-container dive-flag-pulse">
                    <span class="dive-handoff-flag">${sourceFlag}</span>
                </div>
                <div class="dive-handoff-label">
                    <span class="dive-handoff-micro">Accessing</span>
                    <span class="dive-handoff-country">${sourceInstance}</span>
                </div>
            </div>
        </div>
        
        <!-- Policy Notice - Expandable -->
        <details class="dive-policy-notice">
            <summary class="dive-policy-trigger">
                <svg class="dive-policy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Cross-Border Access · Tap to learn more</span>
                <svg class="dive-policy-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
            </summary>
            <div class="dive-policy-content">
                <p class="dive-policy-main">
                    <strong>🤝 Bilateral Trust Agreement</strong><br/>
                    By authenticating through <strong>${hostCountryName}</strong> to access <strong>${sourceCountryName}</strong>'s resources, 
                    you agree to operate under ${sourceCountryName}'s data governance policies.
                </p>
                <ul class="dive-policy-list">
                    <li>✓ Your identity is verified by ${hostCountryName} (${hostInstance})</li>
                    <li>✓ Access decisions follow ${sourceInstance}'s security policies</li>
                    <li>✓ Your actions may be logged for audit compliance</li>
                </ul>
            </div>
        </details>
    </div>
    </#if>

    <!-- Main Container -->
    <div class="dive-container">
        <!-- Split Layout -->
        <div class="dive-layout">
            <!-- LEFT: Login Form -->
            <div class="dive-form-column">
                <div class="dive-card">
                    <!-- Instance Identity Banner - Informative -->
                    <div class="dive-realm-banner">
                        <div class="dive-realm-flag">
                            ${hostFlag}
                        </div>
                        <div class="dive-realm-info">
                            <div class="dive-realm-country">
                                <#if hostCountryName?has_content>${hostCountryName?upper_case}<#else>${hostInstance}</#if>
                            </div>
                            <div class="dive-realm-context">${msg("dive.banner.context")}</div>
                        </div>
                    </div>

                    <!-- Alert Messages (Compact) -->
                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="dive-alert dive-alert-compact dive-alert-${message.type}">
                            <#if message.type = 'success'>
                                <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            <#elseif message.type = 'warning'>
                                <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            <#elseif message.type = 'error'>
                                <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            <#else>
                                <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </#if>
                            <span class="dive-alert-text">${kcSanitize(message.summary)?no_esc}</span>
                        </div>
                    </#if>

                    <!-- Header Section -->
                    <div class="dive-header dive-header-compact">
                        <#nested "header">
                    </div>

                    <!-- Form Content -->
                    <div class="dive-form-content">
                        <#nested "form">
                    </div>

                    <!-- Info Section -->
                    <#if displayInfo>
                        <div class="dive-info dive-info-compact">
                            <#nested "info">
                        </div>
                    </#if>
                </div>
            </div>

            <!-- RIGHT: Trust Chain & Transparency Panel -->
            <#-- Determine IdP info for transparency panel -->
            <#-- Use hostInstance as the "IdP" for this realm (since this IS the IdP) -->
            <#assign idpCodeVal = hostInstance!'USA'>
            <#assign idpCountryName = hostCountryName!'United States'>
            <#assign idpFlag = hostFlag!'🇺🇸'>
            
            <#-- Override with userHomeInstance if this is a federation flow -->
            <#if isFederatedLogin && userHomeInstance?has_content>
                <#assign idpCodeVal = userHomeInstance>
                <#assign idpCountryName = userHomeCountryName>
                <#assign idpFlag = userHomeFlag>
            </#if>
            
            <#assign idpCountryCode = idpCodeVal>
            
            <div class="dive-description-column">
                <div class="dive-transparency-panel">
                    
                    <!-- LEVEL 0: Trust Chain Summary (Always Visible) -->
                    <div class="dive-trust-summary">
                        <#-- Show different trust chains for federation vs direct login -->
                        <#if isFederatedLogin && sourceInstance?has_content && sourceInstance != hostInstance>
                        <#-- FEDERATION FLOW: Show full handoff chain -->
                        <div class="dive-trust-chain-visual dive-trust-federation">
                            <div class="dive-trust-node dive-trust-idp">
                                <span class="dive-trust-flag">${hostFlag}</span>
                                <span class="dive-trust-label">${hostInstance}</span>
                                <span class="dive-trust-sublabel">Identity</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-sp">
                                <span class="dive-trust-flag">${sourceFlag}</span>
                                <span class="dive-trust-label">${sourceInstance}</span>
                                <span class="dive-trust-sublabel">Application</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-hub">
                                <span class="dive-trust-icon">🤝</span>
                                <span class="dive-trust-label">Coalition</span>
                                <span class="dive-trust-sublabel">Resources</span>
                            </div>
                        </div>
                        <div class="dive-trust-explanation">
                            <p class="dive-trust-flow-text">
                                Use your <strong>${hostInstance}</strong>-approved identity
                                <span class="dive-flow-divider">→</span>
                                Access <strong>${sourceInstance}</strong> application
                                <span class="dive-flow-divider">→</span>
                                Unlock shared coalition resources
                            </p>
                        </div>
                        <#else>
                        <#-- DIRECT LOGIN: Show simple, clear explanation -->
                        <div class="dive-trust-chain-visual">
                            <div class="dive-trust-node dive-trust-idp">
                                <span class="dive-trust-flag">${idpFlag}</span>
                                <span class="dive-trust-label">${idpCountryCode}</span>
                                <span class="dive-trust-sublabel">Your Credentials</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-hub">
                                <span class="dive-trust-icon">🔐</span>
                                <span class="dive-trust-label">Verified</span>
                                <span class="dive-trust-sublabel">Identity Check</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-sp">
                                <span class="dive-trust-icon">📁</span>
                                <span class="dive-trust-label">Access</span>
                                <span class="dive-trust-sublabel">Coalition Data</span>
                            </div>
                        </div>
                        <p class="dive-trust-tagline">${msg("dive.trust.tagline")}</p>
                        </#if>
                    </div>
                    
                    <!-- LEVEL 1: "How does this work?" (Expandable) -->
                    <details class="dive-microprogression dive-level-1">
                        <summary class="dive-expand-trigger">
                            ${msg("dive.trust.howItWorks")}
                            <svg class="dive-expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <div class="dive-expand-content">
                            <ol class="dive-trust-steps">
                                <li>
                                    <strong>${idpCountryName}</strong> ${msg("dive.trust.step1")}
                                </li>
                                <li>
                                    <strong>DIVE</strong> ${msg("dive.trust.step2")}
                                </li>
                                <li>
                                    ${msg("dive.trust.step3")}
                                </li>
                            </ol>
                        </div>
                    </details>
                    
                    <!-- LEVEL 2: "What gets shared?" (Expandable) -->
                    <details class="dive-microprogression dive-level-2">
                        <summary class="dive-expand-trigger">
                            ${msg("dive.trust.whatShared")}
                            <svg class="dive-expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <div class="dive-expand-content">
                            <ul class="dive-attribute-list">
                                <li>
                                    <span class="dive-attr-icon">🆔</span>
                                    <span class="dive-attr-name">${msg("dive.attr.uniqueId")}</span>
                                </li>
                                <li>
                                    <span class="dive-attr-icon">🔐</span>
                                    <span class="dive-attr-name">${msg("dive.attr.clearance")}</span>
                                </li>
                                <li>
                                    <span class="dive-attr-icon">🌍</span>
                                    <span class="dive-attr-name">${msg("dive.attr.country")}</span>
                                </li>
                                <li>
                                    <span class="dive-attr-icon">🏷️</span>
                                    <span class="dive-attr-name">${msg("dive.attr.coi")}</span>
                                </li>
                            </ul>
                            <p class="dive-attr-note">${msg("dive.attr.note")}</p>
                        </div>
                    </details>
                    
                    <!-- LEVEL 3: "Technical Details" (Expandable) -->
                    <details class="dive-microprogression dive-level-3">
                        <summary class="dive-expand-trigger">
                            ${msg("dive.trust.technical")}
                            <svg class="dive-expand-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </summary>
                        <div class="dive-expand-content dive-technical">
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.protocol")}</span>
                                <span class="dive-tech-value">OpenID Connect / SAML 2.0</span>
                            </div>
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.tokenFormat")}</span>
                                <span class="dive-tech-value">JWT (RS256)</span>
                            </div>
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.policyEngine")}</span>
                                <span class="dive-tech-value">OPA (Rego)</span>
                            </div>
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.standard")}</span>
                                <span class="dive-tech-value">ACP-240 / STANAG 4774</span>
                            </div>
                            <div class="dive-tech-item">
                                <span class="dive-tech-label">${msg("dive.tech.realm")}</span>
                                <span class="dive-tech-value"><#if realm?? && realm.name?has_content>${realm.name}<#else>dive-v3</#if></span>
                            </div>
                        </div>
                    </details>
                    
                    <!-- Help Notice (Generic) -->
                    <div class="dive-help-footer">
                        <button type="button" class="dive-help-trigger-small" onclick="document.getElementById('helpPanel').classList.toggle('dive-hidden')">
                            ${msg("dive.help.trigger")}
                        </button>
                        <div id="helpPanel" class="dive-help-panel dive-hidden">
                            <p class="dive-help-heading">${msg("dive.help.heading")}</p>
                            <ul class="dive-help-list">
                                <li>${msg("dive.help.item1")}</li>
                                <li>${msg("dive.help.item2")}</li>
                                <li>${msg("dive.help.item3")}</li>
                            </ul>
                            <p class="dive-help-note">${msg("dive.help.note")}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Scripts -->
    <script>
        function togglePassword() {
            const passwordInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eye-icon');
            const eyeOffIcon = document.getElementById('eye-off-icon');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                eyeIcon.classList.add('dive-hidden');
                eyeOffIcon.classList.remove('dive-hidden');
            } else {
                passwordInput.type = 'password';
                eyeIcon.classList.remove('dive-hidden');
                eyeOffIcon.classList.add('dive-hidden');
            }
        }
        
        // Toggle forgot password info panel (matches desktop behavior)
        function toggleForgotPasswordInfo() {
            const infoPanel = document.getElementById('forgot-password-info');
            const chevron = document.getElementById('forgot-chevron');
            
            if (infoPanel.classList.contains('dive-hidden')) {
                infoPanel.classList.remove('dive-hidden');
                infoPanel.style.maxHeight = infoPanel.scrollHeight + 'px';
                chevron.style.transform = 'rotate(180deg)';
            } else {
                infoPanel.style.maxHeight = '0';
                setTimeout(() => infoPanel.classList.add('dive-hidden'), 300);
                chevron.style.transform = 'rotate(0deg)';
            }
        }
    </script>
    <#if properties.scriptsBottom?has_content>
        <#list properties.scriptsBottom?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
</body>
</html>
</#macro>


