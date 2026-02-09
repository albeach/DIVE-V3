# Scoped policy for Transit auto-unseal token
# Only allows encrypt/decrypt on the "autounseal" Transit key

path "transit/encrypt/autounseal" {
  capabilities = ["update"]
}

path "transit/decrypt/autounseal" {
  capabilities = ["update"]
}
