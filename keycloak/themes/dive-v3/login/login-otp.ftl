<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false displayMessage=false; section>
    <#if section = "header">
        <#-- Empty header - we use compact inline header -->
    <#elseif section = "form">
    
    <!-- Compact OTP Verification (AAL2) -->
    <div class="dive-otp-wrapper">
        <!-- AAL2 Badge & Header -->
        <div class="dive-otp-header">
            <div class="dive-aal2-badge">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>AAL2 Required</span>
            </div>
            
            <h2 class="dive-otp-title">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                ${msg("loginOtpTitle", "Enter Verification Code")}
            </h2>
            <p class="dive-otp-subtitle">${msg("loginOtpMessage")}</p>
        </div>

        <!-- OTP Form -->
        <form id="kc-otp-login-form" action="${url.loginAction}" method="post">
            <div class="dive-otp-input-wrapper">
                <input 
                    id="otp" 
                    name="otp" 
                    autocomplete="off" 
                    type="text" 
                    class="dive-otp-input" 
                    autofocus 
                    maxlength="6"
                    pattern="[0-9]*"
                    inputmode="numeric"
                    placeholder="000000"
                    aria-invalid="<#if messagesPerField.existsError('totp')>true</#if>"
                />
            </div>

            <#if messagesPerField.existsError('totp')>
                <div class="dive-alert dive-alert-error dive-alert-compact" style="margin-top: 0.75rem;">
                    <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span class="dive-alert-text">${kcSanitize(messagesPerField.get('totp'))?no_esc}</span>
                </div>
            </#if>

            <div class="dive-otp-timer" id="otp-timer">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span id="otp-countdown">Code refreshes every 30 seconds</span>
            </div>

            <div class="dive-form-buttons" style="margin-top: 1rem;">
                <button 
                    class="dive-button-primary" 
                    name="login" 
                    id="kc-login" 
                    type="submit"
                    style="width: 100%;"
                >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 1.25rem; height: 1.25rem; margin-right: 0.5rem;">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    ${msg("doLogIn", "Verify")}
                </button>
            </div>
        </form>
    </div>

    <script>
        // Auto-format OTP input
        document.getElementById('otp').addEventListener('input', function(e) {
            this.value = this.value.replace(/[^0-9]/g, '');
        });
        
        // Timer countdown
        function updateTimer() {
            const now = Math.floor(Date.now() / 1000);
            const remaining = 30 - (now % 30);
            const timerEl = document.getElementById('otp-timer');
            const countdownEl = document.getElementById('otp-countdown');
            
            countdownEl.textContent = remaining + 's remaining';
            
            if (remaining <= 5) {
                timerEl.classList.add('warning');
            } else {
                timerEl.classList.remove('warning');
            }
        }
        
        setInterval(updateTimer, 1000);
        updateTimer();
    </script>
    </#if>
</@layout.registrationLayout>
