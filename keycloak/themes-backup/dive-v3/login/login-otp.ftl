<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=social.displayInfo; section>
    <#if section = "header">
        ${msg("doLogIn")}
    <#elseif section = "form">
    <div id="kc-form">
      <div id="kc-form-wrapper">
        <form id="kc-otp-login-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <div class="dive-form-group">
                <label for="otp" class="dive-label">${msg("loginOtpOneTime")}</label>
                
                <div class="dive-alert dive-alert-info" style="margin-bottom: 1rem;">
                    <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span class="dive-alert-text">${msg("loginOtpMessage")}</span>
                </div>

                <input 
                    id="otp" 
                    name="otp" 
                    autocomplete="off" 
                    type="text" 
                    class="dive-input" 
                    autofocus 
                    placeholder="${msg("loginOtpOneTime")}"
                    aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                />

                <#if messagesPerField.existsError('totp')>
                    <span id="input-error-otp-code" class="dive-error" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('totp'))?no_esc}
                    </span>
                </#if>
            </div>

            <div class="dive-form-buttons">
                <button 
                    class="dive-button-primary" 
                    name="login" 
                    id="kc-login" 
                    type="submit"
                >
                    ${msg("doLogIn")}
                </button>
            </div>
        </form>
      </div>
    </div>
    </#if>

</@layout.registrationLayout>


