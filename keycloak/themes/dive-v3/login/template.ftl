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
</head>

<body class="dive-body dive-compact ${bodyClass}" data-realm="<#if realm?? && realm.displayName?has_content>${realm.displayName}</#if>">
    <!-- Background -->
    <div class="dive-background">
        <#if properties.backgroundImage?has_content>
            <div class="dive-background-image" style="background-image: url('${url.resourcesPath}/img/${properties.backgroundImage}');"></div>
            <div class="dive-background-overlay"></div>
        </#if>
    </div>

    <!-- Federation Flow Banner (Above Main Container) -->
    <#assign clientData = "">
    <#if client?? && client.clientId??>
        <#assign clientData = client.clientId>
    </#if>
    <#assign isFederated = (clientData?has_content && clientData?contains("federation")) || (brokerContext?? && brokerContext.username?has_content)>
    <#assign spCode = "">
    <#assign idpCode = "">
    
    <#-- Parse SP (Service Provider) from client ID -->
    <#if clientData?has_content>
        <#if clientData?lower_case?contains("usa")><#assign spCode = "USA"></#if>
        <#if clientData?lower_case?contains("fra")><#assign spCode = "FRA"></#if>
        <#if clientData?lower_case?contains("deu")><#assign spCode = "DEU"></#if>
        <#if clientData?lower_case?contains("can")><#assign spCode = "CAN"></#if>
        <#if clientData?lower_case?contains("gbr")><#assign spCode = "GBR"></#if>
        <#if clientData?lower_case?contains("ita")><#assign spCode = "ITA"></#if>
        <#if clientData?lower_case?contains("esp")><#assign spCode = "ESP"></#if>
        <#if clientData?lower_case?contains("nld")><#assign spCode = "NLD"></#if>
        <#if clientData?lower_case?contains("pol")><#assign spCode = "POL"></#if>
    </#if>
    
    <#-- Get IdP from realm name -->
    <#assign realmName = "">
    <#if realm?? && realm.name??>
        <#assign realmName = realm.name>
    </#if>
    <#if realmName?has_content && realmName?contains("broker")><#assign idpCode = "USA"></#if>

    <#-- Flag emoji lookup -->
    <#assign spFlag = "🌐">
    <#assign idpFlag = "🇺🇸">
    <#if spCode == "USA"><#assign spFlag = "🇺🇸"></#if>
    <#if spCode == "FRA"><#assign spFlag = "🇫🇷"></#if>
    <#if spCode == "DEU"><#assign spFlag = "🇩🇪"></#if>
    <#if spCode == "CAN"><#assign spFlag = "🇨🇦"></#if>
    <#if spCode == "GBR"><#assign spFlag = "🇬🇧"></#if>
    <#if spCode == "ESP"><#assign spFlag = "🇪🇸"></#if>
    <#if spCode == "ITA"><#assign spFlag = "🇮🇹"></#if>
    <#if spCode == "NLD"><#assign spFlag = "🇳🇱"></#if>
    <#if spCode == "POL"><#assign spFlag = "🇵🇱"></#if>
    
    <#assign idpCodeVal = idpCode!'USA'>
    <#if idpCodeVal == "USA"><#assign idpFlag = "🇺🇸"></#if>
    <#if idpCodeVal == "FRA"><#assign idpFlag = "🇫🇷"></#if>
    <#if idpCodeVal == "DEU"><#assign idpFlag = "🇩🇪"></#if>

    <#if isFederated && spCode?has_content>
    <!-- Federation Flow Banner - Separate Visual Element -->
    <div class="dive-federation-banner">
        <div class="dive-federation-flow-visual">
            <!-- Destination (Where you're going) -->
            <div class="dive-flow-destination">
                <span class="dive-flow-flag-emoji">${spFlag}</span>
                <div class="dive-flow-text">
                    <span class="dive-flow-tiny-label">Accessing</span>
                    <span class="dive-flow-country">${spCode}</span>
                </div>
            </div>
            
            <!-- Flow Arrow -->
            <div class="dive-flow-connector">
                <div class="dive-flow-line"></div>
                <svg class="dive-flow-arrow-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <div class="dive-flow-line"></div>
            </div>
            
            <!-- Identity Provider (Where you're authenticating) -->
            <div class="dive-flow-idp-badge">
                <span class="dive-flow-flag-emoji">${idpFlag}</span>
                <div class="dive-flow-text">
                    <span class="dive-flow-tiny-label">via IdP</span>
                    <span class="dive-flow-country">${idpCodeVal}</span>
                </div>
            </div>
        </div>
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
                            <#if realm.displayName?has_content && realm.displayName?contains("France")>🇫🇷
                            <#elseif realm.displayName?has_content && realm.displayName?contains("Germany")>🇩🇪
                            <#elseif realm.displayName?has_content && realm.displayName?contains("Canada")>🇨🇦
                            <#elseif realm.displayName?has_content && realm.displayName?contains("United Kingdom")>🇬🇧
                            <#elseif realm.displayName?has_content && realm.displayName?contains("Spain")>🇪🇸
                            <#else>🇺🇸</#if>
                        </div>
                        <div class="dive-realm-info">
                            <div class="dive-realm-country">
                                <#if realm.displayName?has_content && realm.displayName?contains("France")>FRANCE
                                <#elseif realm.displayName?has_content && realm.displayName?contains("Germany")>GERMANY
                                <#elseif realm.displayName?has_content && realm.displayName?contains("Canada")>CANADA
                                <#elseif realm.displayName?has_content && realm.displayName?contains("United Kingdom")>UNITED KINGDOM
                                <#elseif realm.displayName?has_content && realm.displayName?contains("Spain")>SPAIN
                                <#else>USA</#if>
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
            <#-- Determine country names for display -->
            <#assign idpCountryName = "United States">
            <#assign idpCountryCode = idpCodeVal!'USA'>
            <#if idpCountryCode == "FRA"><#assign idpCountryName = "France"></#if>
            <#if idpCountryCode == "DEU"><#assign idpCountryName = "Germany"></#if>
            <#if idpCountryCode == "GBR"><#assign idpCountryName = "United Kingdom"></#if>
            <#if idpCountryCode == "CAN"><#assign idpCountryName = "Canada"></#if>
            <#if idpCountryCode == "ESP"><#assign idpCountryName = "Spain"></#if>
            
            <div class="dive-description-column">
                <div class="dive-transparency-panel">
                    
                    <!-- LEVEL 0: Trust Chain Summary (Always Visible) -->
                    <div class="dive-trust-summary">
                        <div class="dive-trust-chain-visual">
                            <div class="dive-trust-node dive-trust-idp">
                                <span class="dive-trust-flag">${idpFlag}</span>
                                <span class="dive-trust-label">${idpCountryCode}</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-hub">
                                <span class="dive-trust-icon">🔗</span>
                                <span class="dive-trust-label">DIVE</span>
                            </div>
                            <div class="dive-trust-arrow">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </div>
                            <div class="dive-trust-node dive-trust-sp">
                                <span class="dive-trust-icon">🌐</span>
                                <span class="dive-trust-label">Resources</span>
                            </div>
                        </div>
                        <p class="dive-trust-tagline">${msg("dive.trust.tagline")}</p>
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
    </script>
    <#if properties.scriptsBottom?has_content>
        <#list properties.scriptsBottom?split(' ') as script>
            <script src="${url.resourcesPath}/${script}" type="text/javascript"></script>
        </#list>
    </#if>
</body>
</html>
</#macro>


