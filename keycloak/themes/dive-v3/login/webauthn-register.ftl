<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true; section>
    <#if section = "header">
        ${msg("webauthnRegisterTitle")}
    <#elseif section = "form">

    <form id="webauth" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
        <input type="hidden" id="clientDataJSON" name="clientDataJSON"/>
        <input type="hidden" id="attestationObject" name="attestationObject"/>
        <input type="hidden" id="publicKeyCredentialId" name="publicKeyCredentialId"/>
        <input type="hidden" id="authenticatorLabel" name="authenticatorLabel"/>
        <input type="hidden" id="transports" name="transports"/>
        <input type="hidden" id="error" name="error"/>
        <#-- Debug: Log form action URL to check if state is preserved -->
        <input type="hidden" id="debug_action_url" value="${url.loginAction}"/>
        <#-- Debug: Check if session code/tab ID exists -->
        <#if url.loginAction?contains("session_code=")>
            <input type="hidden" id="debug_has_session_code" value="true"/>
        <#else>
            <input type="hidden" id="debug_has_session_code" value="false"/>
        </#if>
    </form>

    <!-- Modern Info Card -->
    <div class="dive-webauthn-info-card">
        <div class="dive-webauthn-icon-container">
            <svg class="dive-webauthn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
        </div>
        <h2 class="dive-webauthn-title">${msg("webauthnRegisterMessage")}</h2>
        <p class="dive-webauthn-description">
            Use your device's built-in security (Face ID, Touch ID, Windows Hello) or a physical security key (YubiKey, Titan) for secure, passwordless authentication.
        </p>
    </div>

    <!-- Security Key Label Input -->
    <div class="dive-form-group">
        <label for="authenticatorLabel-input" class="dive-label">
            <svg class="dive-label-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            ${msg("webauthnRegisterLabelPrompt")}
        </label>
        <input
            type="text"
            id="authenticatorLabel-input"
            class="dive-input dive-input-modern"
            placeholder="e.g., My iPhone, YubiKey 5"
            value="${msg("webauthnDefaultAuthenticatorLabel")}"
            autofocus
        />
        <p class="dive-input-hint">Give your security key a memorable name</p>
    </div>

    <!-- Register Button -->
    <div class="dive-form-buttons">
        <button
            id="registerWebAuthnButton"
            class="dive-button-primary dive-button-hero"
            type="button"
            onclick="webAuthnRegister()"
        >
            <svg class="dive-button-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span>Register Passkey</span>
        </button>
    </div>

    <!-- Status Alert (Hidden by default) -->
    <div id="webauthn-status" class="dive-alert-modern dive-alert-info" style="display: none;">
        <div class="dive-alert-icon-wrapper">
            <svg class="dive-alert-icon-modern spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
        </div>
        <div class="dive-alert-content-modern">
            <p id="webauthn-status-text" class="dive-alert-title-modern"></p>
        </div>
    </div>

    <!-- Error Alert (Hidden by default) -->
    <div id="webauthn-error" class="dive-alert-modern dive-alert-error-modern" style="display: none;">
        <div class="dive-alert-icon-wrapper">
            <svg class="dive-alert-icon-modern" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
        </div>
        <div class="dive-alert-content-modern">
            <p class="dive-alert-title-modern">Passkey Registration Failed</p>
            <p id="webauthn-error-text" class="dive-alert-message-modern"></p>
            <div class="dive-alert-actions">
                <button onclick="retryRegistration()" class="dive-button-secondary-modern">
                    <svg class="dive-button-icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Try Again
                </button>
                <a href="${url.loginUrl}" class="dive-link-modern">Cancel</a>
            </div>
        </div>
    </div>

    <!-- Help Section -->
    <div class="dive-help-section">
        <details class="dive-help-details">
            <summary class="dive-help-summary">
                <svg class="dive-help-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Need help with passkey registration?
            </summary>
            <div class="dive-help-content">
                <h4>Troubleshooting Tips:</h4>
                <ul>
                    <li><strong>Device authenticators:</strong> Ensure Face ID, Touch ID, or Windows Hello is set up on your device</li>
                    <li><strong>Physical keys:</strong> Insert your security key (YubiKey, Titan) when prompted</li>
                    <li><strong>Browser support:</strong> Use Chrome, Edge, Safari, or Firefox (latest versions)</li>
                    <li><strong>HTTPS required:</strong> Passkeys only work on secure (HTTPS) connections</li>
                    <li><strong>Timeout issues:</strong> Complete the registration within 5 minutes</li>
                </ul>
            </div>
        </details>
    </div>

    <script type="module">
        // #region agent log
        // Hypothesis A,B,C,D: Log form action URL and available context
        const debugActionUrl = document.getElementById('debug_action_url')?.value || '';
        const debugHasSessionCode = document.getElementById('debug_has_session_code')?.value === 'true';
        const debugData = {
            actionUrl: debugActionUrl,
            hasSessionCode: debugHasSessionCode,
            urlParams: new URLSearchParams(window.location.search).toString(),
            referrer: document.referrer
        };
        fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webauthn-register.ftl:119',message:'WebAuthn form loaded',data:debugData,timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A,B,C,D'})}).catch(()=>{});
        // #endregion

        // WebAuthn registration with modern error handling
        const challenge = "${challenge}";
        const userid = "${userid}";
        const username = "${username}";
        const signatureAlgorithms = [<#list signatureAlgorithms as alg>{"type": "public-key", "alg": ${alg}}<#sep>,</#sep></#list>];
        const rpEntityName = "${rpEntityName}";
        const rpId = "${rpId}";
        const attestationConveyancePreference = "${attestationConveyancePreference}";
        const authenticatorAttachment = "${authenticatorAttachment}";
        const requireResidentKey = "${requireResidentKey}";
        const userVerificationRequirement = "${userVerificationRequirement}";
        const createTimeout = ${createTimeout};
        const excludeCredentialIds = "${excludeCredentialIds}";
        const isUserIdentified = ${(isUserIdentified!false)?c};

        // Base64 utilities
        function base64url_decode(str) {
            str = str.replace(/-/g, '+').replace(/_/g, '/');
            while (str.length % 4) str += '=';
            const binary = atob(str);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        }

        function base64url_encode(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary)
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
        }

        // Show/hide alerts
        function showStatus(message, isError = false) {
            const statusDiv = document.getElementById('webauthn-status');
            const errorDiv = document.getElementById('webauthn-error');
            const statusText = document.getElementById('webauthn-status-text');
            const errorText = document.getElementById('webauthn-error-text');

            if (isError) {
                statusDiv.style.display = 'none';
                errorDiv.style.display = 'flex';
                errorText.textContent = message;
            } else {
                errorDiv.style.display = 'none';
                statusDiv.style.display = 'flex';
                statusText.textContent = message;
            }
        }

        function hideAlerts() {
            document.getElementById('webauthn-status').style.display = 'none';
            document.getElementById('webauthn-error').style.display = 'none';
        }

        function getUserFriendlyError(error) {
            const errorName = error.name || '';
            const errorMessage = error.message || '';

            if (errorName === 'NotAllowedError' || errorMessage.includes('NotAllowedError')) {
                return 'The registration was cancelled or timed out. This can happen if:\n\n• You cancelled the passkey prompt\n• The operation took too long (timeout)\n• Your device doesn\'t support this type of passkey\n• Pop-ups are blocked in your browser\n\nPlease try again and complete the process promptly.';
            } else if (errorName === 'InvalidStateError') {
                return 'This passkey is already registered. Please use a different security key or device.';
            } else if (errorName === 'NotSupportedError') {
                return 'Your browser or device doesn\'t support this type of passkey. Try:\n\n• Using a different browser (Chrome, Edge, Safari, Firefox)\n• Using a physical security key (YubiKey, Titan)\n• Updating your browser to the latest version';
            } else if (errorName === 'SecurityError') {
                return 'Security error: This page must be accessed via HTTPS or localhost. Please check the URL.';
            } else {
                return 'An unexpected error occurred: ' + errorMessage + '\n\nPlease try again or contact your system administrator.';
            }
        }

        function webAuthnRegister() {
            const button = document.getElementById('registerWebAuthnButton');
            const authenticatorLabelInput = document.getElementById('authenticatorLabel-input');
            const labelValue = authenticatorLabelInput.value || "${msg("webauthnDefaultAuthenticatorLabel")}";

            button.disabled = true;
            hideAlerts();
            showStatus('Preparing your passkey registration...');

            console.log('[WebAuthn] Starting registration');
            console.log('[WebAuthn] rpId:', rpId);
            console.log('[WebAuthn] username:', username);
            console.log('[WebAuthn] requireResidentKey (raw):', requireResidentKey);
            console.log('[WebAuthn] userVerification:', userVerificationRequirement);
            console.log('[WebAuthn] timeout:', createTimeout, 'seconds');

            let publicKey = {
                challenge: base64url_decode(challenge),
                rp: { name: rpEntityName, id: rpId },
                user: {
                    id: base64url_decode(userid),
                    name: username,
                    displayName: username
                },
                pubKeyCredParams: signatureAlgorithms,
                attestation: attestationConveyancePreference,
                timeout: createTimeout * 1000, // CRITICAL: Convert seconds to milliseconds
                authenticatorSelection: {
                    requireResidentKey: requireResidentKey === 'Yes' || requireResidentKey === true || requireResidentKey === 'true',
                    userVerification: userVerificationRequirement
                }
            };

            console.log('[WebAuthn] requireResidentKey (evaluated):', publicKey.authenticatorSelection.requireResidentKey);

            // Only add authenticatorAttachment if specified
            if (authenticatorAttachment &&
                authenticatorAttachment !== '' &&
                authenticatorAttachment !== 'not specified' &&
                authenticatorAttachment !== 'Not specified') {
                publicKey.authenticatorSelection.authenticatorAttachment = authenticatorAttachment;
                console.log('[WebAuthn] authenticatorAttachment:', authenticatorAttachment);
            } else {
                console.log('[WebAuthn] No authenticatorAttachment (allows all types)');
            }

            if (excludeCredentialIds !== '') {
                publicKey.excludeCredentials = excludeCredentialIds.split(',').map(id => ({
                    type: 'public-key',
                    id: base64url_decode(id)
                }));
            }

            showStatus('Waiting for your passkey...\nFollow the prompts on your device or security key.');
            console.log('[WebAuthn] Calling navigator.credentials.create()');

            navigator.credentials.create({ publicKey })
                .then(credential => {
                    console.log('[WebAuthn] SUCCESS! Credential created');
                    showStatus('Passkey registered! Completing setup...');

                    const clientDataJSON = base64url_encode(credential.response.clientDataJSON);
                    const attestationObject = base64url_encode(credential.response.attestationObject);
                    const publicKeyCredentialId = base64url_encode(credential.rawId);

                    let transports = '';
                    if (credential.response.getTransports) {
                        transports = credential.response.getTransports().join(',');
                    }

                    document.getElementById('clientDataJSON').value = clientDataJSON;
                    document.getElementById('attestationObject').value = attestationObject;
                    document.getElementById('publicKeyCredentialId').value = publicKeyCredentialId;
                    document.getElementById('authenticatorLabel').value = labelValue;
                    document.getElementById('transports').value = transports;

                    // #region agent log
                    // Hypothesis A,D,E: Log right before form submission
                    const formData = {
                        actionUrl: document.getElementById('webauth').action,
                        hasSessionCode: document.getElementById('webauth').action.includes('session_code='),
                        credentialRegistered: true
                    };
                    fetch('http://127.0.0.1:7243/ingest/84b84b04-5661-4074-af82-a6f395f1c783',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webauthn-register.ftl:275',message:'About to submit WebAuthn form',data:formData,timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A,D,E'})}).catch(()=>{});
                    // #endregion

                    document.getElementById('webauth').submit();
                })
                .catch(error => {
                    console.error('[WebAuthn] Registration error:', error);
                    showStatus(getUserFriendlyError(error), true);
                    button.disabled = false;

                    // Also submit error to Keycloak
                    document.getElementById('error').value = error.toString();
                });
        }

        function retryRegistration() {
            hideAlerts();
            document.getElementById('registerWebAuthnButton').disabled = false;
        }

        window.webAuthnRegister = webAuthnRegister;
        window.retryRegistration = retryRegistration;
    </script>

    </#if>
</@layout.registrationLayout>
