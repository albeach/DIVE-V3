-- =============================================================================
-- DIVE V3 - WebAuthn Credential userHandle Fix
-- =============================================================================
-- CRITICAL FIX (2026-02-11): Keycloak WebAuthn Bug Mitigation
--
-- PROBLEM: Keycloak 26 WebAuthn registration does not populate the userHandle
--          field in credential_data JSON during passkey registration.
--
-- IMPACT: Re-authentication fails with "First authenticated user is not the
--         one authenticated by the Passkey" because Keycloak cannot validate
--         the userHandle returned by the authenticator against the stored
--         credential (which has userHandle=null).
--
-- ROOT CAUSE: Keycloak WebAuthn implementation issue - during registration,
--             the userHandle should be set to the user's ID (Base64-encoded),
--             but it's being omitted from the credential_data JSON.
--
-- SOLUTION: This script automatically adds the missing userHandle field to any
--           WebAuthn credentials that are missing it. The userHandle is set to
--           the Base64-encoded user_id, which is the correct value per WebAuthn
--           specification.
--
-- TIMING: This script runs during PostgreSQL init, BEFORE Keycloak creates its
--         schema. The function definitions are stored but the fix/trigger are
--         only applied if the credential table already exists. The trigger
--         function is available for manual application after Keycloak starts:
--           SELECT fix_webauthn_userhandle();
--           CREATE TRIGGER trg_fix_webauthn_userhandle ...
--
-- IDEMPOTENT: Safe to run multiple times.
-- =============================================================================

\connect keycloak_db

-- Function to fix missing userHandle in WebAuthn credentials
-- Safe to create even if credential table doesn't exist yet (not executed until called)
CREATE OR REPLACE FUNCTION fix_webauthn_userhandle()
RETURNS TABLE (
    fixed_credential_id varchar(36),
    username varchar(255),
    old_had_userhandle boolean,
    new_userhandle text
) AS $$
BEGIN
    -- Update all webauthn credentials that are missing userHandle
    RETURN QUERY
    WITH updated_credentials AS (
        UPDATE credential c
        SET credential_data = c.credential_data::jsonb ||
            jsonb_build_object('userHandle', encode(c.user_id::text::bytea, 'base64'))
        FROM user_entity u
        WHERE c.type = 'webauthn'
          AND c.user_id = u.id
          AND (
              c.credential_data::jsonb->>'userHandle' IS NULL
              OR c.credential_data::jsonb->>'userHandle' = ''
          )
        RETURNING
            c.id,
            u.username,
            false as old_had_userhandle,
            encode(c.user_id::text::bytea, 'base64') as new_userhandle
    )
    SELECT * FROM updated_credentials;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically fix new WebAuthn credentials
-- Safe to create even if credential table doesn't exist yet
CREATE OR REPLACE FUNCTION auto_fix_webauthn_userhandle()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'webauthn' AND (
        NEW.credential_data::jsonb->>'userHandle' IS NULL OR
        NEW.credential_data::jsonb->>'userHandle' = ''
    ) THEN
        NEW.credential_data := NEW.credential_data::jsonb ||
            jsonb_build_object('userHandle', encode(NEW.user_id::text::bytea, 'base64'));
        RAISE NOTICE 'Auto-fixed missing userHandle for WebAuthn credential: %', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply fix and trigger ONLY if credential table exists (Keycloak may not have started yet)
DO $$
DECLARE
    fix_count integer;
    rec record;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credential') THEN
        RAISE NOTICE 'credential table does not exist yet (Keycloak has not started)';
        RAISE NOTICE 'Functions created — trigger will be installed on next run after Keycloak init';
        RETURN;
    END IF;

    -- Fix existing credentials
    RAISE NOTICE 'Checking WebAuthn credentials for missing userHandle...';
    fix_count := 0;
    FOR rec IN SELECT * FROM fix_webauthn_userhandle() LOOP
        RAISE NOTICE '  Fixed credential for user: % (userHandle: %)', rec.username, rec.new_userhandle;
        fix_count := fix_count + 1;
    END LOOP;

    IF fix_count = 0 THEN
        RAISE NOTICE '  All WebAuthn credentials have valid userHandle';
    ELSE
        RAISE NOTICE '  Fixed % WebAuthn credential(s)', fix_count;
    END IF;

    -- Install trigger
    EXECUTE 'DROP TRIGGER IF EXISTS trg_fix_webauthn_userhandle ON credential';
    EXECUTE 'CREATE TRIGGER trg_fix_webauthn_userhandle BEFORE INSERT OR UPDATE ON credential FOR EACH ROW EXECUTE FUNCTION auto_fix_webauthn_userhandle()';

    RAISE NOTICE 'WebAuthn userHandle fix installed successfully';
    RAISE NOTICE '  - Existing credentials: fixed via fix_webauthn_userhandle()';
    RAISE NOTICE '  - Future credentials: auto-fixed via trigger';
END
$$;
