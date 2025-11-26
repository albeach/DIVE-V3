#!/usr/bin/env bash
# ============================================
# DIVE V3 - Status Page Generator
# ============================================
# Generates a static HTML status page from monitoring data
#
# Usage:
#   ./scripts/monitoring/generate-status-page.sh [output_dir]
#
# ============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
STATUS_FILE="${PROJECT_ROOT}/logs/monitoring/current-status.json"
HISTORY_FILE="${PROJECT_ROOT}/logs/monitoring/status-history.json"
OUTPUT_DIR="${1:-${PROJECT_ROOT}/logs/monitoring/status-page}"

mkdir -p "$OUTPUT_DIR"

# Generate status data
if [[ -f "$STATUS_FILE" ]]; then
    STATUS_DATA=$(cat "$STATUS_FILE")
else
    STATUS_DATA=$("$SCRIPT_DIR/health-check.sh" --json 2>/dev/null || echo '{"error":"check_failed"}')
fi

# Calculate uptime from history
UPTIME_DATA="[]"
if [[ -f "$HISTORY_FILE" ]]; then
    UPTIME_DATA=$(cat "$HISTORY_FILE" | jq '[.[] | .instances[]? | {instance: .instance, healthy: (if .status == "HEALTHY" then 1 else 0 end)}] | group_by(.instance) | map({instance: .[0].instance, uptime: ((map(.healthy) | add) / length * 100 | floor)})')
fi

# Generate HTML
cat > "$OUTPUT_DIR/index.html" << 'HTMLHEAD'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="60">
    <title>DIVE V3 - System Status</title>
    <style>
        :root {
            --bg-dark: #0f172a;
            --bg-card: #1e293b;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --status-healthy: #22c55e;
            --status-degraded: #eab308;
            --status-down: #ef4444;
            --accent: #3b82f6;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-dark);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 2rem;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        header {
            text-align: center;
            margin-bottom: 3rem;
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #3b82f6, #22c55e);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
            color: var(--text-secondary);
            font-size: 1.1rem;
        }
        
        .overall-status {
            text-align: center;
            padding: 2rem;
            background: var(--bg-card);
            border-radius: 1rem;
            margin-bottom: 2rem;
        }
        
        .status-badge {
            display: inline-block;
            padding: 0.5rem 1.5rem;
            border-radius: 2rem;
            font-weight: 600;
            font-size: 1.2rem;
        }
        
        .status-healthy { background: var(--status-healthy); color: #000; }
        .status-degraded { background: var(--status-degraded); color: #000; }
        .status-down { background: var(--status-down); color: #fff; }
        
        .instances {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .instance-card {
            background: var(--bg-card);
            border-radius: 1rem;
            padding: 1.5rem;
            border-left: 4px solid var(--status-healthy);
        }
        
        .instance-card.degraded { border-left-color: var(--status-degraded); }
        .instance-card.down { border-left-color: var(--status-down); }
        
        .instance-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .instance-name {
            font-size: 1.3rem;
            font-weight: 600;
        }
        
        .instance-code {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        
        .services {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        
        .service {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid #334155;
        }
        
        .service:last-child { border-bottom: none; }
        
        .service-name {
            font-weight: 500;
        }
        
        .service-status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: var(--status-healthy);
        }
        
        .status-dot.down { background: var(--status-down); }
        
        .latency {
            color: var(--text-secondary);
            font-size: 0.85rem;
        }
        
        .uptime-section {
            background: var(--bg-card);
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .uptime-section h2 {
            margin-bottom: 1rem;
            font-size: 1.2rem;
        }
        
        .uptime-bars {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        
        .uptime-item {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        
        .uptime-label {
            width: 80px;
            font-weight: 500;
        }
        
        .uptime-bar {
            flex: 1;
            height: 8px;
            background: #334155;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .uptime-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--status-healthy), #4ade80);
            border-radius: 4px;
        }
        
        .uptime-percent {
            width: 60px;
            text-align: right;
            font-weight: 600;
        }
        
        footer {
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.9rem;
            padding-top: 2rem;
            border-top: 1px solid #334155;
        }
        
        .refresh-info {
            margin-top: 0.5rem;
            font-size: 0.8rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🔐 DIVE V3 Status</h1>
            <p class="subtitle">Coalition Identity & Access Management</p>
        </header>
        
        <div class="overall-status">
            <span class="status-badge" id="overall-badge">Checking...</span>
            <p style="margin-top: 1rem; color: var(--text-secondary);" id="last-check">Last check: Loading...</p>
        </div>
        
        <div class="instances" id="instances-container">
            <!-- Populated by JavaScript -->
        </div>
        
        <div class="uptime-section">
            <h2>📊 Uptime (Last 24 Hours)</h2>
            <div class="uptime-bars" id="uptime-container">
                <!-- Populated by JavaScript -->
            </div>
        </div>
        
        <footer>
            <p>DIVE V3 - Federated Identity Management for Coalition Partners</p>
            <p class="refresh-info">Auto-refresh every 60 seconds</p>
        </footer>
    </div>
    
    <script>
HTMLHEAD

# Inject status data
echo "        const statusData = $STATUS_DATA;" >> "$OUTPUT_DIR/index.html"
echo "        const uptimeData = $UPTIME_DATA;" >> "$OUTPUT_DIR/index.html"

cat >> "$OUTPUT_DIR/index.html" << 'HTMLBODY'
        
        function renderStatus() {
            const container = document.getElementById('instances-container');
            const overallBadge = document.getElementById('overall-badge');
            const lastCheck = document.getElementById('last-check');
            
            if (!statusData.instances) {
                container.innerHTML = '<p>Unable to load status data</p>';
                return;
            }
            
            // Overall status
            let overall = 'HEALTHY';
            statusData.instances.forEach(i => {
                if (i.status === 'DOWN') overall = 'DOWN';
                else if (i.status === 'DEGRADED' && overall !== 'DOWN') overall = 'DEGRADED';
            });
            
            overallBadge.textContent = overall === 'HEALTHY' ? '✅ All Systems Operational' : 
                                       overall === 'DEGRADED' ? '⚠️ Partial Outage' : '❌ Major Outage';
            overallBadge.className = `status-badge status-${overall.toLowerCase()}`;
            
            lastCheck.textContent = `Last check: ${new Date(statusData.timestamp).toLocaleString()}`;
            
            // Instance cards
            container.innerHTML = statusData.instances.map(instance => `
                <div class="instance-card ${instance.status.toLowerCase()}">
                    <div class="instance-header">
                        <div>
                            <div class="instance-name">${instance.name}</div>
                            <div class="instance-code">${instance.instance.toUpperCase()}</div>
                        </div>
                        <span class="status-badge status-${instance.status.toLowerCase()}">${instance.status}</span>
                    </div>
                    <div class="services">
                        ${Object.entries(instance.services).map(([name, svc]) => `
                            <div class="service">
                                <span class="service-name">${name.charAt(0).toUpperCase() + name.slice(1)}</span>
                                <div class="service-status">
                                    <span class="status-dot ${svc.status === 'DOWN' ? 'down' : ''}"></span>
                                    <span class="latency">${svc.latency_ms}ms</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
            
            // Uptime bars
            const uptimeContainer = document.getElementById('uptime-container');
            uptimeContainer.innerHTML = uptimeData.map(item => `
                <div class="uptime-item">
                    <span class="uptime-label">${item.instance.toUpperCase()}</span>
                    <div class="uptime-bar">
                        <div class="uptime-fill" style="width: ${item.uptime}%"></div>
                    </div>
                    <span class="uptime-percent">${item.uptime}%</span>
                </div>
            `).join('') || '<p style="color: var(--text-secondary)">No historical data available</p>';
        }
        
        renderStatus();
    </script>
</body>
</html>
HTMLBODY

echo "Status page generated: $OUTPUT_DIR/index.html"


