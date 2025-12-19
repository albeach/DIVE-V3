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

<body class="dive-body ${bodyClass}">
    <!-- Background -->
    <div class="dive-background">
        <#if properties.backgroundImage?has_content>
            <div class="dive-background-image" style="background-image: url('${url.resourcesPath}/img/${properties.backgroundImage}');"></div>
            <div class="dive-background-overlay"></div>
        </#if>
    </div>

    <!-- Main Container -->
    <div class="dive-container">
        <!-- Split Layout -->
        <div class="dive-layout">
            <!-- LEFT: Login Form -->
            <div class="dive-form-column">
                <div class="dive-card">
                    <!-- Logo -->
                    <#if realm.displayName?has_content || properties.logo?has_content>
                        <div class="dive-logo-container">
                            <#if properties.logo?has_content>
                                <img src="${url.resourcesPath}/img/${properties.logo}" alt="Logo" class="dive-logo" />
                            </#if>
                        </div>
                    </#if>

                    <!-- Header -->
                    <div class="dive-header">
                        <#nested "header">
                    </div>

                    <!-- Realm Name -->
                    <#if realm.displayName?has_content>
                        <p class="dive-realm-name">${realm.displayName}</p>
                    </#if>

                    <!-- Alert Messages -->
                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="dive-alert dive-alert-${message.type}">
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

                    <!-- Form Content -->
                    <div class="dive-form-content">
                        <#nested "form">
                    </div>

                    <!-- Info Section -->
                    <#if displayInfo>
                        <div class="dive-info">
                            <#nested "info">
                        </div>
                    </#if>
                </div>
            </div>

            <!-- RIGHT: Description/Branding -->
            <div class="dive-description-column">
                <div class="dive-description-content">
                    <h2 class="dive-description-title">
                        ${msg("dive.description.title")}
                    </h2>
                    <p class="dive-description-subtitle">
                        ${msg("dive.description.subtitle")}
                    </p>
                    <p class="dive-description-text">
                        ${msg("dive.description.content")}
                    </p>
                    
                    <!-- Features List -->
                    <div class="dive-features">
                        <div class="dive-feature">
                            <svg class="dive-feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span class="dive-feature-text">${msg("dive.feature.secure")}</span>
                        </div>
                        <div class="dive-feature">
                            <svg class="dive-feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span class="dive-feature-text">${msg("dive.feature.coalition")}</span>
                        </div>
                        <div class="dive-feature">
                            <svg class="dive-feature-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <span class="dive-feature-text">${msg("dive.feature.compliant")}</span>
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
