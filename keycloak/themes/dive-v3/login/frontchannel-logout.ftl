<#import "template.ftl" as layout>
<@layout.registrationLayout; section>
    <#if section = "header">
        <h1 class="dive-title">${msg("frontchannel-logout.title")}</h1>
    <#elseif section = "form">
        <div class="dive-frontchannel-logout">
            <!-- Status Icon -->
            <div class="dive-logout-icon">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
            </div>
            
            <!-- Message -->
            <div class="dive-logout-message">
                <p class="dive-logout-text">${msg("frontchannel-logout.message")}</p>
            </div>
            
            <!-- Logout Progress -->
            <div class="dive-logout-progress">
                <ul class="dive-logout-clients">
                    <#list logout.clients as client>
                        <li class="dive-logout-client">
                            <#if client.name??>
                                ${client.name}
                            <#else>
                                ${client.clientId}
                            </#if>
                            <iframe src="${client.frontChannelLogoutUrl}" style="display:none;"></iframe>
                        </li>
                    </#list>
                </ul>
            </div>
            
            <!-- Continue Button -->
            <div class="dive-logout-actions">
                <#-- Pick the safest non-hardcoded destination: logoutRedirectUri -> loginUrl -> root -->
                <#assign continueHref = "/" >
                <#if logout.logoutRedirectUri?has_content>
                    <#assign continueHref = logout.logoutRedirectUri>
                <#elseif url.loginUrl??>
                    <#assign continueHref = url.loginUrl>
                </#if>
                <a href="${continueHref}" class="dive-button dive-button-primary">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    ${msg("doContinue")}
                </a>
            </div>
        </div>
    </#if>
</@layout.registrationLayout>










