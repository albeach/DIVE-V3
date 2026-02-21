#!/bin/bash
# Decode JWT token to see payload

token="$1"
if [ -z "$token" ]; then
  echo "Usage: $0 <jwt_token>"
  exit 1
fi

# Extract payload (second part of JWT)
payload=$(echo "$token" | cut -d'.' -f2)

# Add padding if needed
len=$(( ${#payload} % 4 ))
if [ $len -eq 2 ]; then
  payload="${payload}=="
elif [ $len -eq 3 ]; then
  payload="${payload}="
fi

# Decode base64 and format JSON
echo "$payload" | base64 -d | jq .
