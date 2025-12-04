# DIVE V3 - Quick Start Access Guide

**For Kubernetes Beginners** - Simple step-by-step instructions

---

## 🎯 What You Need to Know

1. **Services run inside Kubernetes** - You can't access them directly
2. **Two ways to access:**
   - **Local (port forwarding)** - Access via `localhost` on your computer
   - **Public (ingress)** - Access via public URLs (requires DNS/SSL)

---

## 🚀 Quick Start - Local Access (Easiest)

### Step 1: Start Port Forwards

Open a terminal and run:

```bash
./scripts/start-port-forwards.sh
```

**Keep this terminal open!** Port forwards stop if you close it.

### Step 2: Access Services

Open your web browser and go to:

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:4000/health
- **Keycloak Admin:** http://localhost:8081/admin

### Step 3: Stop Port Forwards (when done)

```bash
./scripts/stop-port-forwards.sh
```

---

## 🌐 Public Access (Advanced)

### Current Status

- **Ingress IP:** `136.110.202.9`
- **DNS:** Configured (`app.dive25.com` → `136.110.202.9`)
- **SSL Certificate:** ⏳ Still provisioning (takes 10-60 minutes)

### Once SSL Certificate is Active

You'll be able to access:

- **Frontend:** https://app.dive25.com
- **Backend API:** https://api.dive25.com/health
- **Keycloak:** https://idp.dive25.com

### Check SSL Certificate Status

```bash
kubectl get managedcertificate -n dive-v3
```

Wait until status shows `Active` (not `Provisioning`).

---

## 🔍 Monitoring Resources

### Watch Pods Starting Up

```bash
# Watch all pods
kubectl get pods --all-namespaces -w | grep dive-v3
```

Press `Ctrl+C` to stop watching.

### Check Status Quickly

```bash
# See all pods
kubectl get pods --all-namespaces | grep dive-v3

# See PVCs (storage)
kubectl get pvc --all-namespaces | grep dive-v3

# See recent events
kubectl get events --all-namespaces --sort-by=.lastTimestamp | grep dive-v3 | tail -10
```

### Use the Monitoring Script

```bash
./scripts/watch-provisioning.sh
```

This shows everything updating in real-time.

---

## 🐛 Troubleshooting

### "Can't connect to localhost:3000"

**Problem:** Port forwards aren't running

**Solution:**
```bash
# Check if port forwards are running
ps aux | grep "kubectl port-forward"

# If nothing shows, start them
./scripts/start-port-forwards.sh
```

### "Pods are stuck in Pending"

**Problem:** Resources are still provisioning

**Solution:**
- **PVCs:** Wait 5-15 minutes for storage to provision
- **Init containers:** Wait for them to finish (check logs)
- **Cluster:** May need more nodes (check events)

**Check why:**
```bash
# Why is a pod pending?
kubectl describe pod -n dive-v3-fra <pod-name>

# Check events
kubectl get events -n dive-v3-fra --sort-by=.lastTimestamp | tail -10
```

### "Can't access public URLs"

**Problem:** SSL certificate still provisioning

**Solution:**
- Wait 10-60 minutes for certificate to become `Active`
- Check status: `kubectl get managedcertificate -n dive-v3`
- DNS must be configured correctly

---

## 📊 Understanding Kubernetes Status

### Pod Statuses

- **Running** ✅ - Pod is working
- **Pending** ⏳ - Waiting for resources (storage, nodes)
- **Init:0/1** ⏳ - Initialization container running
- **CrashLoopBackOff** ❌ - Pod keeps crashing (check logs)
- **ImagePullBackOff** ❌ - Can't pull image (check image name)

### PVC Statuses

- **Bound** ✅ - Storage ready
- **Pending** ⏳ - Waiting for storage to provision

### How to Check Logs

```bash
# View pod logs
kubectl logs -n dive-v3 <pod-name>

# View logs with more detail
kubectl logs -n dive-v3 <pod-name> --tail=50

# View init container logs
kubectl logs -n dive-v3 <pod-name> -c <init-container-name>
```

---

## 🎓 Key Concepts

### Namespaces

Think of namespaces as separate "folders" in Kubernetes:

- `dive-v3` - USA instance
- `dive-v3-fra` - France instance
- `dive-v3-gbr` - United Kingdom instance
- `dive-v3-deu` - Germany instance

### Port Forwarding

Port forwarding creates a "tunnel" from your computer to Kubernetes:

```
Your Computer          Kubernetes
localhost:3000   →→→   frontend:80
```

### Ingress

Ingress is like a "reverse proxy" that routes public traffic:

```
Internet → Ingress → Services
```

---

## 📝 Common Commands

```bash
# See all pods
kubectl get pods --all-namespaces

# See pods in specific namespace
kubectl get pods -n dive-v3

# Describe a pod (see details)
kubectl describe pod -n dive-v3 <pod-name>

# View logs
kubectl logs -n dive-v3 <pod-name>

# Check services
kubectl get svc -n dive-v3

# Check ingress
kubectl get ingress -n dive-v3

# Check events (what's happening)
kubectl get events --all-namespaces --sort-by=.lastTimestamp | tail -20
```

---

## ✅ Current Status

### USA Instance (Working)

- ✅ Frontend: http://localhost:3000
- ✅ Backend: http://localhost:4000
- ✅ Keycloak: http://localhost:8081
- ✅ All pods running

### FRA/GBR/DEU Instances (Initializing)

- ⏳ Waiting for PVCs to provision
- ⏳ OPA ConfigMaps created (just fixed)
- ⏳ Pods will start once storage is ready

---

## 🆘 Need Help?

1. **Check pod status:** `kubectl get pods --all-namespaces | grep dive-v3`
2. **Check events:** `kubectl get events --all-namespaces --sort-by=.lastTimestamp | grep dive-v3 | tail -10`
3. **View logs:** `kubectl logs -n dive-v3 <pod-name>`
4. **Use monitoring script:** `./scripts/watch-provisioning.sh`

---

**Last Updated:** December 4, 2025


