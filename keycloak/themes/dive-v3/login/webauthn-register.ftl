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
    </form>

    <div class="dive-form-group">
        <label for="authenticatorLabel-input" class="dive-label">${msg("webauthnRegisterLabelPrompt")}</label>
        <input type="text" id="authenticatorLabel-input" class="dive-input" placeholder="${msg("webauthnDefaultAuthenticatorLabel")}" value="${msg("webauthnDefaultAuthenticatorLabel")}" autofocus/>
    </div>

    <div class="dive-form-buttons">
        <button 
            id="registerWebAuthnButton"
            class="dive-button-primary" 
            type="button"
            onclick="webAuthnRegister()"
        >
            ${msg("doRegisterSecurityKey")}
        </button>
    </div>

    <div id="webauthn-status" class="dive-alert dive-alert-info" style="margin-bottom: 1rem; display: none;">
        <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        <span id="webauthn-status-text" class="dive-alert-text"></span>
    </div>

    <div class="dive-alert dive-alert-info" style="margin-bottom: 1rem;">
        <svg class="dive-alert-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="dive-alert-text">${msg("webauthnRegisterMessage")}</span>
    </div>

    <script type="module">
        // WebAuthn registration with fixed imports
        const challenge = "${challenge}";
        const userid = "${userid}";
        const username = "${username}";
        const signatureAlgorithms = ${signatureAlgorithms};
        const rpEntityName = "${rpEntityName}";
        const rpId = "${rpId}";
        const attestationConveyancePreference = "${attestationConveyancePreference}";
        const authenticatorAttachment = "${authenticatorAttachment}";
        const requireResidentKey = "${requireResidentKey}";
        const userVerificationRequirement = "${userVerificationRequirement}";
        const createTimeout = ${createTimeout};
        const excludeCredentialIds = "${excludeCredentialIds}";
        const isUserIdentified = ${isUserIdentified?c};

        // Use inline base64 utilities instead of rfc4648
        function base64url_decode(str) {
            // Add base64 padding
            str = str.replace(/-/g, '+').replace(/_/g, '/');
            while (str.length % 4) {
                str += '=';
            }
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

        function webAuthnRegister() {
            const statusDiv = document.getElementById('webauthn-status');
            const statusText = document.getElementById('webauthn-status-text');
            const button = document.getElementById('registerWebAuthnButton');
            
            // Show status
            statusDiv.style.display = 'flex';
            statusText.textContent = 'Preparing security key registration...';
            button.disabled = true;

            const authenticatorLabelInput = document.getElementById('authenticatorLabel-input');
            const labelValue = authenticatorLabelInput.value || "${msg("webauthnDefaultAuthenticatorLabel")}";

            let publicKey = {
                challenge: base64url_decode(challenge),
                rp: {
                    name: rpEntityName,
                    id: rpId
                },
                user: {
                    id: base64url_decode(userid),
                    name: username,
                    displayName: username
                },
                pubKeyCredParams: signatureAlgorithms,
                attestation: attestationConveyancePreference,
                timeout: createTimeout,
                authenticatorSelection: {
                    requireResidentKey: requireResidentKey === 'true',
                    userVerification: userVerificationRequirement
                }
            };

            if (authenticatorAttachment !== 'not specified') {
                publicKey.authenticatorSelection.authenticatorAttachment = authenticatorAttachment;
            }

            if (excludeCredentialIds !== '') {
                publicKey.excludeCredentials = excludeCredentialIds.split(',').map(id => ({
                    type: 'public-key',
                    id: base64url_decode(id)
                }));
            }

            statusText.textContent = 'Waiting for security key...';

            navigator.credentials.create({ publicKey })
                .then(credential => {
                    statusText.textContent = 'Processing credential...';
                    
                    const clientDataJSON = base64url_encode(credential.response.clientDataJSON);
                    const attestationObject = base64url_encode(credential.response.attestationObject);
                    const publicKeyCredentialId = base64url_encode(credential.rawId);

                    // Get transports if available
                    let transports = '';
                    if (credential.response.getTransports) {
                        transports = credential.response.getTransports().join(',');
                    }

                    // Populate form
                    document.getElementById('clientDataJSON').value = clientDataJSON;
                    document.getElementById('attestationObject').value = attestationObject;
                    document.getElementById('publicKeyCredentialId').value = publicKeyCredentialId;
                    document.getElementById('authenticatorLabel').value = labelValue;
                    document.getElementById('transports').value = transports;
                    
                    statusText.textContent = 'Completing registration...';
                    
                    // Submit form
                    document.getElementById('webauth').submit();
                })
                .catch(error => {
                    console.error('WebAuthn registration error:', error);
                    statusDiv.classList.remove('dive-alert-info');
                    statusDiv.classList.add('dive-alert-error');
                    statusText.textContent = 'Registration failed: ' + error.message;
                    button.disabled = false;
                    
                    // Also submit the error to Keycloak
                    document.getElementById('error').value = error.toString();
                    document.getElementById('webauth').submit();
                });
        }

        // Don't auto-start - wait for user button click to avoid session timeout
        window.webAuthnRegister = webAuthnRegister;
    </script>

    </#if>
</@layout.registrationLayout>

