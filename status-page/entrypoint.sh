#!/bin/bash
# DIVE V3 Status Page Entrypoint
# Runs health checks in background and serves status page

set -e

CHECK_INTERVAL="${CHECK_INTERVAL:-60}"
HISTORY_SIZE="${HISTORY_SIZE:-1440}"

# Initialize files
echo '[]' > /usr/share/nginx/html/history.json
echo '{}' > /usr/share/nginx/html/status.json

# Generate initial status page HTML
generate_html() {
    cat > /usr/share/nginx/html/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DIVE V3 - System Status</title>
    <style>
        :root {
            --bg-dark: #0f172a;
            --bg-card: #1e293b;
            --bg-card-hover: #334155;
            --text-primary: #f1f5f9;
            --text-secondary: #94a3b8;
            --status-healthy: #22c55e;
            --status-degraded: #eab308;
            --status-down: #ef4444;
            --accent: #3b82f6;
        }
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--bg-dark);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 2rem;
        }
        
        .container { max-width: 1200px; margin: 0 auto; }
        
        header {
            text-align: center;
            margin-bottom: 3rem;
        }
        
        .logo {
            font-size: 3rem;
            margin-bottom: 0.5rem;
        }
        
        h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
            background: linear-gradient(135deg, #3b82f6, #22c55e);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        
        .subtitle { color: var(--text-secondary); font-size: 1rem; }
        
        .overall-status {
            text-align: center;
            padding: 2rem;
            background: var(--bg-card);
            border-radius: 1rem;
            margin-bottom: 2rem;
        }
        
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 2rem;
            font-weight: 600;
            font-size: 1.1rem;
        }
        
        .status-healthy { background: var(--status-healthy); color: #000; }
        .status-degraded { background: var(--status-degraded); color: #000; }
        .status-down { background: var(--status-down); color: #fff; }
        
        .pulse {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: currentColor;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
        }
        
        .last-check {
            margin-top: 1rem;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        
        .instances {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .instance-card {
            background: var(--bg-card);
            border-radius: 1rem;
            padding: 1.5rem;
            border-left: 4px solid var(--status-healthy);
            transition: transform 0.2s, background 0.2s;
        }
        
        .instance-card:hover {
            transform: translateY(-2px);
            background: var(--bg-card-hover);
        }
        
        .instance-card.degraded { border-left-color: var(--status-degraded); }
        .instance-card.down { border-left-color: var(--status-down); }
        
        .instance-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1rem;
        }
        
        .instance-info { display: flex; align-items: center; gap: 0.75rem; }
        
        .flag {
            font-size: 2rem;
            line-height: 1;
        }
        
        .instance-name { font-size: 1.2rem; font-weight: 600; }
        .instance-code { color: var(--text-secondary); font-size: 0.85rem; }
        
        .mini-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-size: 0.75rem;
            font-weight: 600;
        }
        
        .services { display: flex; flex-direction: column; gap: 0.75rem; }
        
        .service {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid #334155;
        }
        
        .service:last-child { border-bottom: none; }
        .service-name { font-weight: 500; color: var(--text-secondary); }
        
        .service-status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--status-healthy);
        }
        
        .status-dot.down { background: var(--status-down); }
        .latency { color: var(--text-secondary); font-size: 0.85rem; font-family: monospace; }
        
        .uptime-section {
            background: var(--bg-card);
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
        }
        
        .uptime-section h2 {
            margin-bottom: 1.5rem;
            font-size: 1.1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .uptime-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
        }
        
        .uptime-item {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        
        .uptime-label {
            display: flex;
            justify-content: space-between;
            font-size: 0.9rem;
        }
        
        .uptime-bar {
            height: 6px;
            background: #334155;
            border-radius: 3px;
            overflow: hidden;
        }
        
        .uptime-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--status-healthy), #4ade80);
            border-radius: 3px;
            transition: width 0.3s;
        }
        
        footer {
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.85rem;
            padding-top: 2rem;
            border-top: 1px solid #334155;
        }
        
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
        }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--bg-card);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        @media (max-width: 640px) {
            body { padding: 1rem; }
            h1 { font-size: 1.5rem; }
            .instances { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo">🔐</div>
            <h1>DIVE V3 System Status</h1>
            <p class="subtitle">Coalition Identity & Access Management Platform</p>
        </header>
        
        <div class="overall-status">
            <div class="status-badge" id="overall-badge">
                <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
                <span>Checking...</span>
            </div>
            <p class="last-check" id="last-check">Loading status...</p>
        </div>
        
        <div class="instances" id="instances-container">
            <div class="loading"><div class="spinner"></div></div>
        </div>
        
        <div class="uptime-section">
            <h2>📊 Uptime (Last 24 Hours)</h2>
            <div class="uptime-grid" id="uptime-container">
                <div class="loading"><div class="spinner"></div></div>
            </div>
        </div>
        
        <footer>
            <p>DIVE V3 - Federated Identity Management for Coalition Partners</p>
            <p style="margin-top: 0.5rem; opacity: 0.7;">Auto-updates every 30 seconds</p>
        </footer>
    </div>
    
    <script>
        const FLAGS = {
            usa: '🇺🇸',
            fra: '🇫🇷',
            deu: '🇩🇪',
            gbr: '🇬🇧',
            can: '🇨🇦'
        };
        
        async function fetchStatus() {
            try {
                const response = await fetch('/api/status?t=' + Date.now());
                return await response.json();
            } catch (e) {
                console.error('Failed to fetch status:', e);
                return null;
            }
        }
        
        async function fetchHistory() {
            try {
                const response = await fetch('/api/history?t=' + Date.now());
                return await response.json();
            } catch (e) {
                console.error('Failed to fetch history:', e);
                return [];
            }
        }
        
        function calculateUptime(history) {
            if (!history || history.length === 0) return {};
            
            const uptime = {};
            history.forEach(check => {
                if (check.instances) {
                    check.instances.forEach(inst => {
                        if (!uptime[inst.instance]) {
                            uptime[inst.instance] = { total: 0, healthy: 0 };
                        }
                        uptime[inst.instance].total++;
                        if (inst.status === 'HEALTHY') {
                            uptime[inst.instance].healthy++;
                        }
                    });
                }
            });
            
            return Object.entries(uptime).reduce((acc, [k, v]) => {
                acc[k] = Math.round((v.healthy / v.total) * 100);
                return acc;
            }, {});
        }
        
        function renderStatus(data) {
            const container = document.getElementById('instances-container');
            const badge = document.getElementById('overall-badge');
            const lastCheck = document.getElementById('last-check');
            
            if (!data || !data.instances) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Unable to load status</p>';
                return;
            }
            
            // Overall status
            let overall = 'HEALTHY';
            data.instances.forEach(i => {
                if (i.status === 'DOWN') overall = 'DOWN';
                else if (i.status === 'DEGRADED' && overall !== 'DOWN') overall = 'DEGRADED';
            });
            
            const statusText = overall === 'HEALTHY' ? '✅ All Systems Operational' :
                              overall === 'DEGRADED' ? '⚠️ Partial Outage' : '❌ Major Outage';
            
            badge.innerHTML = `<div class="pulse"></div><span>${statusText}</span>`;
            badge.className = `status-badge status-${overall.toLowerCase()}`;
            
            lastCheck.textContent = `Last updated: ${new Date(data.timestamp).toLocaleString()}`;
            
            // Instance cards
            container.innerHTML = data.instances.map(inst => `
                <div class="instance-card ${inst.status.toLowerCase()}">
                    <div class="instance-header">
                        <div class="instance-info">
                            <span class="flag">${FLAGS[inst.instance] || '🌐'}</span>
                            <div>
                                <div class="instance-name">${inst.name}</div>
                                <div class="instance-code">${inst.instance.toUpperCase()}</div>
                            </div>
                        </div>
                        <span class="mini-badge status-${inst.status.toLowerCase()}">${inst.status}</span>
                    </div>
                    <div class="services">
                        ${Object.entries(inst.services || {}).map(([name, svc]) => `
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
        }
        
        function renderUptime(uptime) {
            const container = document.getElementById('uptime-container');
            
            if (!uptime || Object.keys(uptime).length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary);">No historical data yet</p>';
                return;
            }
            
            container.innerHTML = Object.entries(uptime).map(([inst, pct]) => `
                <div class="uptime-item">
                    <div class="uptime-label">
                        <span>${FLAGS[inst] || '🌐'} ${inst.toUpperCase()}</span>
                        <span>${pct}%</span>
                    </div>
                    <div class="uptime-bar">
                        <div class="uptime-fill" style="width: ${pct}%"></div>
                    </div>
                </div>
            `).join('');
        }
        
        async function update() {
            const [status, history] = await Promise.all([fetchStatus(), fetchHistory()]);
            renderStatus(status);
            renderUptime(calculateUptime(history));
        }
        
        // Initial load and auto-refresh
        update();
        setInterval(update, 30000);
    </script>
</body>
</html>
HTMLEOF
}

# Background health check loop
run_health_checks() {
    while true; do
        echo "[$(date)] Running health check..."
        
        # Run health check
        /scripts/health-check.sh > /tmp/status.json 2>/dev/null || echo '{"error":"check_failed"}' > /tmp/status.json
        
        # Update current status
        cp /tmp/status.json /usr/share/nginx/html/status.json
        
        # Update history
        if [[ -f /usr/share/nginx/html/history.json ]]; then
            jq --slurpfile new /tmp/status.json '. + $new | .[-'$HISTORY_SIZE':]' \
                /usr/share/nginx/html/history.json > /tmp/history.json 2>/dev/null || true
            mv /tmp/history.json /usr/share/nginx/html/history.json 2>/dev/null || true
        fi
        
        sleep "$CHECK_INTERVAL"
    done
}

# Generate HTML
generate_html

# Start health check loop in background
run_health_checks &

# Start nginx
exec nginx -g 'daemon off;'

