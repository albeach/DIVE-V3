<#import "template.ftl" as layout>
<@layout.registrationLayout displayRequiredFields=false displayInfo=false displayMessage=false; section>
    <#if section = "header">
        <#-- Empty header - we use compact inline header -->
    <#elseif section = "form">
        
        <!-- Hide logo/realm name for compact MFA wizard -->
        <style>
            .dive-logo-container, .dive-realm-name { display: none !important; }
            .dive-card { padding-top: 0.75rem !important; }
        </style>
        
        <!-- Compact MFA Enrollment Wizard -->
        <div class="mfa-wizard mfa-compact">
            <!-- Compact Header with Progress -->
            <div class="mfa-compact-header">
                <div class="mfa-compact-title">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>${msg("mfaWizardTitle", "Two-Factor Authentication Setup")}</span>
                </div>
                <div class="mfa-compact-progress">
                    <div class="mfa-compact-step mfa-compact-step-active" id="step-dot-1">1</div>
                    <div class="mfa-compact-line"></div>
                    <div class="mfa-compact-step" id="step-dot-2">2</div>
                    <div class="mfa-compact-line"></div>
                    <div class="mfa-compact-step" id="step-dot-3">3</div>
                </div>
            </div>

            <!-- Form -->
            <form action="${url.loginAction}" class="mfa-wizard-form" id="kc-totp-settings-form" method="post">
                <!-- Step 1: Get Authenticator App -->
                <div class="mfa-step mfa-step-active" id="step-1">
                    <div class="mfa-step-header">
                        <h2>${msg("mfaStep1Title", "Get an Authenticator App")}</h2>
                        <p>${msg("mfaStep1Desc", "Install any of these free apps on your phone:")}</p>
                    </div>
                    
                    <div class="mfa-app-row">
                        <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" class="mfa-app-pill mfa-app-google">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 100-16 8 8 0 000 16z"/></svg>
                            <span>Google</span>
                        </a>
                        <a href="https://apps.apple.com/app/microsoft-authenticator/id983156458" target="_blank" class="mfa-app-pill mfa-app-microsoft">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 11V3H3v8h8zm2 0h8V3h-8v8zm0 2v8h8v-8h-8zm-2 0H3v8h8v-8z"/></svg>
                            <span>Microsoft</span>
                        </a>
                        <a href="https://authy.com/download/" target="_blank" class="mfa-app-pill mfa-app-authy">
                            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                            <span>Authy</span>
                        </a>
                    </div>

                    <div class="mfa-have-app">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                        <span>${msg("mfaAlreadyHave", "Already have one? Continue →")}</span>
                    </div>

                    <button type="button" class="mfa-btn mfa-btn-primary mfa-btn-full" onclick="goToStep(2)">
                        <span>${msg("mfaContinue", "Continue")}</span>
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                </div>

                <!-- Step 2: Scan QR Code -->
                <div class="mfa-step" id="step-2">
                    <div class="mfa-qr-layout">
                        <div class="mfa-qr-side">
                            <div class="mfa-qr-box">
                                <img id="kc-totp-secret-qr-code" src="data:image/png;base64, ${totp.totpSecretQrCode}" alt="QR Code" />
                            </div>
                        </div>
                        <div class="mfa-qr-instructions">
                            <h2>${msg("mfaStep2Title", "Scan QR Code")}</h2>
                            <p>${msg("mfaStep2Desc", "Open your authenticator app, tap + and scan this code.")}</p>
                            
                            <details class="mfa-manual">
                                <summary>
                                    <span>${msg("mfaCantScan", "Can't scan? Manual entry")}</span>
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                                </summary>
                                <div class="mfa-manual-content">
                                    <div class="mfa-secret-key">
                                        <code id="manual-key">${totp.totpSecretEncoded}</code>
                                        <button type="button" class="mfa-copy" onclick="copyKey()">
                                            <svg id="copy-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                            <svg id="check-icon" class="mfa-hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                                        </button>
                                    </div>
                                    <div class="mfa-settings-row">
                                        <span>Type: TOTP</span>
                                        <span>Algorithm: ${totp.policy.algorithm}</span>
                                        <span>Digits: ${totp.policy.digits}</span>
                                        <span>Period: ${totp.policy.period}s</span>
                                    </div>
                                </div>
                            </details>
                        </div>
                    </div>

                    <div class="mfa-btn-row">
                        <button type="button" class="mfa-btn mfa-btn-secondary" onclick="goToStep(1)">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            <span>${msg("mfaBack", "Back")}</span>
                        </button>
                        <button type="button" class="mfa-btn mfa-btn-primary" onclick="goToStep(3)">
                            <span>${msg("mfaContinue", "Continue")}</span>
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </button>
                    </div>
                </div>

                <!-- Step 3: Verify Code -->
                <div class="mfa-step" id="step-3">
                    <div class="mfa-step-header">
                        <h2>${msg("mfaStep3Title", "Enter Verification Code")}</h2>
                        <p>${msg("mfaStep3Desc", "Enter the 6-digit code from your authenticator app.")}</p>
                    </div>

                    <!-- Hidden fields -->
                    <input type="hidden" id="totpSecret" name="totpSecret" value="${totp.totpSecret}" />
                    <input type="hidden" id="mode" name="mode" value="${mode!''}"/>

                    <div class="mfa-verify-row">
                        <div class="mfa-otp-field">
                            <input type="text" 
                                   id="totp" 
                                   name="totp" 
                                   autocomplete="off" 
                                   autofocus
                                   maxlength="6"
                                   pattern="[0-9]*"
                                   inputmode="numeric"
                                   placeholder="000000"
                                   required />
                            <div class="mfa-timer">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span id="timer">30s</span>
                            </div>
                        </div>
                        
                        <div class="mfa-device-field">
                            <input type="text" 
                                   id="userLabel" 
                                   name="userLabel"
                                   value="${msg("mfaDefaultDevice", "My Authenticator")}"
                                   placeholder="${msg("mfaDevicePlaceholder", "Device name (optional)")}" />
                        </div>
                    </div>

                    <label class="mfa-logout-check">
                        <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" />
                        <span class="mfa-check-box"></span>
                        <span>${msg("mfaLogoutOthers", "Sign out other devices")}</span>
                    </label>

                    <div class="mfa-btn-row">
                        <button type="button" class="mfa-btn mfa-btn-secondary" onclick="goToStep(2)">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            <span>${msg("mfaBack", "Back")}</span>
                        </button>
                        <button type="submit" class="mfa-btn mfa-btn-success" id="saveTOTPBtn">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>${msg("mfaComplete", "Complete Setup")}</span>
                        </button>
                    </div>
                </div>
            </form>
        </div>

        <script>
            function goToStep(stepNumber) {
                document.querySelectorAll('.mfa-step').forEach(step => step.classList.remove('mfa-step-active'));
                document.getElementById('step-' + stepNumber).classList.add('mfa-step-active');
                
                document.querySelectorAll('.mfa-compact-step').forEach((dot, i) => {
                    dot.classList.remove('mfa-compact-step-active', 'mfa-compact-step-done');
                    if (i + 1 < stepNumber) dot.classList.add('mfa-compact-step-done');
                    else if (i + 1 === stepNumber) dot.classList.add('mfa-compact-step-active');
                });
                
                if (stepNumber === 3) setTimeout(() => document.getElementById('totp').focus(), 100);
            }
            
            function copyKey() {
                navigator.clipboard.writeText(document.getElementById('manual-key').textContent).then(() => {
                    document.getElementById('copy-icon').classList.add('mfa-hidden');
                    document.getElementById('check-icon').classList.remove('mfa-hidden');
                    setTimeout(() => {
                        document.getElementById('copy-icon').classList.remove('mfa-hidden');
                        document.getElementById('check-icon').classList.add('mfa-hidden');
                    }, 2000);
                });
            }
            
            document.getElementById('totp').addEventListener('input', function() {
                this.value = this.value.replace(/[^0-9]/g, '');
                if (this.value.length === 6) document.getElementById('saveTOTPBtn').focus();
            });
            
            function updateTimer() {
                const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
                document.getElementById('timer').textContent = remaining + 's';
                document.querySelector('.mfa-timer').classList.toggle('mfa-timer-warn', remaining <= 5);
            }
            setInterval(updateTimer, 1000);
            updateTimer();
        </script>
    </#if>
</@layout.registrationLayout>
