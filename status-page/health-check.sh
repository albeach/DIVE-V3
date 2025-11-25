#!/bin/bash
# Simplified health check for status page container

TIMEOUT=15

check_url() {
    local url="$1"
    local start=$(date +%s%N)
    local code=$(curl -sk -o /dev/null -w "%{http_code}" "$url" --max-time "$TIMEOUT" 2>/dev/null) || code="000"
    local end=$(date +%s%N)
    local ms=$(( (end - start) / 1000000 ))
    local status="DOWN"
    [[ "$code" =~ ^(200|301|302|303|307|308)$ ]] && status="UP"
    echo "$code|$ms|$status"
}

# Instances
INSTANCES=(
    "usa|United States|https://usa-app.dive25.com|https://usa-idp.dive25.com|https://usa-api.dive25.com"
    "fra|France|https://fra-app.dive25.com|https://fra-idp.dive25.com|https://fra-api.dive25.com"
    "deu|Germany|https://deu-app.prosecurity.biz|https://deu-idp.prosecurity.biz|https://deu-api.prosecurity.biz"
)

echo -n '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","instances":['

first=true
for inst in "${INSTANCES[@]}"; do
    IFS='|' read -r code name app_url idp_url api_url <<< "$inst"
    
    IFS='|' read -r app_code app_ms app_status <<< "$(check_url "$app_url")"
    IFS='|' read -r idp_code idp_ms idp_status <<< "$(check_url "${idp_url}/realms/dive-v3-broker")"
    IFS='|' read -r api_code api_ms api_status <<< "$(check_url "${api_url}/health")"
    
    overall="HEALTHY"
    [[ "$app_status" == "DOWN" || "$idp_status" == "DOWN" || "$api_status" == "DOWN" ]] && overall="DEGRADED"
    [[ "$app_status" == "DOWN" && "$idp_status" == "DOWN" && "$api_status" == "DOWN" ]] && overall="DOWN"
    
    $first || echo -n ','
    first=false
    
    cat << EOF
{"instance":"$code","name":"$name","status":"$overall","services":{"frontend":{"url":"$app_url","status":"$app_status","http_code":$app_code,"latency_ms":$app_ms},"keycloak":{"url":"$idp_url","status":"$idp_status","http_code":$idp_code,"latency_ms":$idp_ms},"backend":{"url":"$api_url","status":"$api_status","http_code":$api_code,"latency_ms":$api_ms}}}
EOF
done

echo ']}'

