<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false displayInfo=false; section>
    <#if section = "header">
        <#if messageHeader??>
            <h1 class="dive-title">${messageHeader}</h1>
        <#else>
            <h1 class="dive-title">${message.summary}</h1>
        </#if>
    <#elseif section = "form">
        <div class="dive-info-page">
            <!-- Status Icon -->
            <div class="dive-info-icon">
                <#if message.type = 'success'>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64" class="dive-icon-success">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                <#elseif message.type = 'warning'>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64" class="dive-icon-warning">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                <#elseif message.type = 'error'>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64" class="dive-icon-error">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                <#else>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64" class="dive-icon-info">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </#if>
            </div>
            
            <!-- Message -->
            <div class="dive-info-message">
                <p class="dive-info-text">${kcSanitize(message.summary)?no_esc}</p>
            </div>
            
            <!-- Actions -->
            <div class="dive-info-actions">
                <#if skipLink??>
                <#else>
                    <#if pageRedirectUri?has_content>
                        <a href="${pageRedirectUri}" class="dive-button dive-button-primary">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            ${msg("backToApplication")}
                        </a>
                    <#elseif actionUri?has_content>
                        <a href="${actionUri}" class="dive-button dive-button-primary">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                            </svg>
                            ${msg("proceedWithAction")}
                        </a>
                    <#elseif (client.baseUrl)?has_content>
                        <a href="${client.baseUrl}" class="dive-button dive-button-primary">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            ${msg("backToApplication")}
                        </a>
                    </#if>
                </#if>
            </div>
            
            <#if requiredActions??>
                <div class="dive-required-actions">
                    <p class="dive-required-title">${msg("requiredAction")}</p>
                    <ul class="dive-required-list">
                        <#list requiredActions as reqActionItem>
                            <li>${msg("requiredAction.${reqActionItem}")}</li>
                        </#list>
                    </ul>
                </div>
            </#if>
        </div>
    </#if>
</@layout.registrationLayout>






