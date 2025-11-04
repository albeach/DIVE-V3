# Test Users Module

Creates 4 test users per realm with varied clearances and COI tags for comprehensive testing.

## Test User Matrix

Each realm gets 4 users:

| Username | Clearance | AAL Level | MFA Method | COI Tags |
|----------|-----------|-----------|------------|----------|
| `testuser-{country}-unclass` | UNCLASSIFIED | AAL1 | None | [] |
| `testuser-{country}-confidential` | CONFIDENTIAL | AAL2 | OTP | [] |
| `testuser-{country}-secret` | SECRET | AAL2 | OTP | ["NATO-COSMIC"] |
| `testuser-{country}-ts` | TOP_SECRET | AAL3 | WebAuthn | ["NATO-COSMIC", "FVEY"] |

## Usage

```hcl
module "usa_test_users" {
  source = "./modules/realm-test-users"
  
  realm_id           = keycloak_realm.dive_v3_usa.id
  realm_name         = "dive-v3-usa"
  country_code       = "USA"
  country_code_lower = "usa"
  email_domain       = "example.mil"
  duty_org           = "US_ARMY"
  
  clearance_mappings = {
    "UNCLASSIFIED" = "UNCLASSIFIED"
    "CONFIDENTIAL" = "CONFIDENTIAL"
    "SECRET"       = "SECRET"
    "TOP_SECRET"   = "TOP SECRET"
  }
  
  coi_confidential = []
  coi_secret       = ["NATO-COSMIC"]
  coi_top_secret   = ["NATO-COSMIC", "FVEY", "CAN-US"]
}
```

## Test User Credentials

All users have the same password: `password123`

**UNCLASSIFIED users:**
- Can login immediately (no MFA setup required)

**CONFIDENTIAL/SECRET users:**
- Must configure OTP on first login
- Use authenticator app (Google Authenticator, Authy, etc.)

**TOP_SECRET users:**
- Must register WebAuthn/passkey on first login
- Requires hardware key (YubiKey) or platform authenticator (TouchID, Windows Hello)

