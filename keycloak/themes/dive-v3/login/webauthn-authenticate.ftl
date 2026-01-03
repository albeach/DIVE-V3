<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false displayMessage=false; section>
    <#if section = "header">
        <#-- Empty header - we use compact inline header -->
    <#elseif section = "form">

    <form id="webauth" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
        <input type="hidden" id="clientDataJSON" name="clientDataJSON"/>
        <input type="hidden" id="authenticatorData" name="authenticatorData"/>
        <input type="hidden" id="signature" name="signature"/>
        <input type="hidden" id="credentialId" name="credentialId"/>
        <input type="hidden" id="userHandle" name="userHandle"/>
        <input type="hidden" id="error" name="error"/>
    </form>

    <!-- Compact AAL3 WebAuthn Authentication -->
    <div class="dive-webauthn-wrapper">
        <!-- AAL3 Badge -->
        <div class="dive-aal3-badge" style="margin-bottom: 0.75rem;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span>AAL3 Required • TOP SECRET</span>
        </div>

        <!-- Icon & Title -->
        <div class="dive-webauthn-icon" style="width: 2.5rem; height: 2.5rem;">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
        </div>
        <h2 class="dive-webauthn-title">${msg("webauthnLoginTitle", "Security Key Login")}</h2>
        <p class="dive-webauthn-subtitle">Use your passkey, security key, or biometric to authenticate</p>
    </div>

    <!-- Authenticate Button (Hero Style) -->
    <div class="dive-form-buttons">
        <button
            id="authenticateWebAuthnButton"
            class="dive-button-primary dive-button-hero"
            type="button"
            onclick="webAuthnAuthenticate()"
        >
            <svg class="dive-button-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span>Sign in with Passkey</span>
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
            <p class="dive-alert-title-modern">Passkey Authentication Failed</p>
            <p id="webauthn-error-text" class="dive-alert-message-modern"></p>
            <div class="dive-alert-actions">
                <button onclick="retryAuthentication()" class="dive-button-secondary-modern">
                    <svg class="dive-button-icon-small" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Try Again
                </button>
                <a href="${url.loginUrl}" class="dive-link-modern">Use Password Instead</a>
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
                Need help with passkey authentication?
            </summary>
            <div class="dive-help-content">
                <h4>Troubleshooting Tips:</h4>
                <ul>
                    <li><strong>Device authenticators:</strong> Use Face ID, Touch ID, or Windows Hello when prompted</li>
                    <li><strong>Physical keys:</strong> Insert your security key (YubiKey, Titan) when prompted</li>
                    <li><strong>Browser support:</strong> Ensure you're using Chrome, Edge, Safari, or Firefox (latest versions)</li>
                    <li><strong>Passkey not found:</strong> You may need to register a passkey first</li>
                    <li><strong>Timeout issues:</strong> Complete the authentication within 5 minutes</li>
                </ul>
            </div>
        </details>
    </div>

    <script type="module">
        // WebAuthn authentication with modern error handling
        const challenge = "${challenge}";
        const userVerification = "${userVerification!'preferred'}";
        const rpId = "${rpId}";
        const createTimeout = ${timeout!60};

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
                return 'The authentication was cancelled or timed out. This can happen if:\n\n• You cancelled the passkey prompt\n• The operation took too long (timeout)\n• Your device doesn\'t have the passkey stored\n• Pop-ups are blocked in your browser\n\nPlease try again or use password authentication.';
            } else if (errorName === 'InvalidStateError') {
                return 'Invalid authentication state. Your session may have expired. Please refresh and try again.';
            } else if (errorName === 'NotSupportedError') {
                return 'Your browser or device doesn\'t support passkey authentication. Try:\n\n• Using a different browser (Chrome, Edge, Safari, Firefox)\n• Using password authentication instead\n• Updating your browser to the latest version';
            } else if (errorName === 'SecurityError') {
                return 'Security error: This page must be accessed via HTTPS or localhost. Please check the URL.';
            } else {
                return 'An unexpected error occurred: ' + errorMessage + '\n\nPlease try again or use password authentication.';
            }
        }

        function webAuthnAuthenticate() {
            const button = document.getElementById('authenticateWebAuthnButton');
            button.disabled = true;
            hideAlerts();
            showStatus('Preparing passkey authentication...');

            console.log('[WebAuthn] Starting authentication');
            console.log('[WebAuthn] rpId:', rpId);
            console.log('[WebAuthn] userVerification:', userVerification);
            console.log('[WebAuthn] timeout:', createTimeout, 'seconds');

            const publicKey = {
                challenge: base64url_decode(challenge),
                rpId: rpId,
                userVerification: userVerification,
                timeout: createTimeout * 1000 // Convert seconds to milliseconds
            };

            showStatus('Waiting for your passkey...\nFollow the prompts on your device or security key.');
            console.log('[WebAuthn] Calling navigator.credentials.get()');

            navigator.credentials.get({ publicKey })
                .then(credential => {
                    console.log('[WebAuthn] SUCCESS! Credential retrieved');
                    showStatus('Passkey verified! Completing authentication...');

                    const clientDataJSON = base64url_encode(credential.response.clientDataJSON);
                    const authenticatorData = base64url_encode(credential.response.authenticatorData);
                    const signature = base64url_encode(credential.response.signature);
                    const credentialId = base64url_encode(credential.rawId);
                    const userHandle = credential.response.userHandle ? base64url_encode(credential.response.userHandle) : '';

                    document.getElementById('clientDataJSON').value = clientDataJSON;
                    document.getElementById('authenticatorData').value = authenticatorData;
                    document.getElementById('signature').value = signature;
                    document.getElementById('credentialId').value = credentialId;
                    document.getElementById('userHandle').value = userHandle;

                    document.getElementById('webauth').submit();
                })
                .catch(error => {
                    console.error('[WebAuthn] Authentication error:', error);
                    showStatus(getUserFriendlyError(error), true);
                    button.disabled = false;

                    // Also submit error to Keycloak
                    document.getElementById('error').value = error.toString();
                });
        }

        function retryAuthentication() {
            hideAlerts();
            document.getElementById('authenticateWebAuthnButton').disabled = false;
        }

        window.webAuthnAuthenticate = webAuthnAuthenticate;
        window.retryAuthentication = retryAuthentication;

        // BEST PRACTICE: Do NOT auto-trigger WebAuthn on page load
        // In federated SSO flows with redirects, the document may not be focused,
        // causing "NotAllowedError: The document is not focused" errors.
        // User must click the "Sign in with Passkey" button to initiate authentication.
        // This ensures proper user interaction before calling navigator.credentials.get()
        document.addEventListener('DOMContentLoaded', function() {
            console.log('[WebAuthn] Page loaded - awaiting user interaction (click button to authenticate)');
            // Focus the button so user knows to click it
            const authButton = document.getElementById('authenticateWebAuthnButton');
            if (authButton) {
                authButton.focus();
            }
        });
    </script>

    </#if>
</@layout.registrationLayout>
