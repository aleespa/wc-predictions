# 🛠️ Maintenance Guide — WC Predictions Server

This guide covers day-to-day maintenance of the production server running on Oracle Cloud Free Tier.

---

## Server Access

**SSH into the VM:**
```bash
ssh -i "path/to/your-private-key.key" ubuntu@132.145.44.176
```

**Navigate to the app:**
```bash
cd ~/wc-predictions
```

---

## Deploying Updates

There is no auto-deploy on Oracle — you pull and rebuild manually after pushing changes to GitHub.

```bash
cd ~/wc-predictions
./update.sh
```

This rebuilds only changed layers so subsequent deploys are fast. The app will be briefly unavailable during the restart (~10–30 seconds).

---

## Checking App Status

**Are all containers running?**
```bash
docker compose -f docker-compose.prod.yml --env-file .env ps
```

Both services should show `Up`:
```
wc-predictions-backend-1    Up
wc-predictions-nginx-1      Up    0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

**Quick health check from inside the VM:**
```bash
curl -k https://localhost
```

---

## Viewing Logs

**All services (real-time):**
```bash
./logs.sh
```

**Specific service (real-time):**
```bash
./logs.sh backend
./logs.sh nginx
```

---

## Starting and Stopping

**Stop everything:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env down
```

**Start everything:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

**Restart a single service:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env restart backend
```

---

## Environment Variables

Variables are stored in the `.env` file on the VM. To edit them:

```bash
nano ~/wc-predictions/.env
```

After changing any variable, restart the affected service:
```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Current variables:
```
DATABASE_URL        # Neon PostgreSQL connection string
CLERK_SECRET_KEY    # Clerk backend secret key
ADMIN_EMAILS        # Comma-separated admin emails
VITE_CLERK_PUBLISHABLE_KEY  # Clerk frontend key
```

> ⚠️ Never commit the `.env` file to GitHub.

---

## SSL Certificate Renewal

Certificates are issued by Let's Encrypt and expire every 90 days. Certbot renews them automatically, but since renewal requires port 80 to be free, you need to stop Docker first.

**Manual renewal process:**
```bash
# Stop containers
docker compose -f docker-compose.prod.yml --env-file .env down

# Renew certificate
sudo certbot renew

# Copy renewed certs
sudo cp /etc/letsencrypt/live/wc-predictions.duckdns.org/fullchain.pem ~/wc-predictions/nginx/
sudo cp /etc/letsencrypt/live/wc-predictions.duckdns.org/privkey.pem ~/wc-predictions/nginx/
sudo chown ubuntu:ubuntu ~/wc-predictions/nginx/*.pem

# Restart containers
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

**Check certificate expiry date:**
```bash
sudo certbot certificates
```

> Current certificate expires: **2026-08-01**. Renew before that date.

---

## Database Management

The database runs on **Neon** (managed PostgreSQL) — no local database to maintain.

**Connect to the database** using any PostgreSQL client (TablePlus, DBeaver, pgAdmin) with the `DATABASE_URL` from your `.env` file.

**Run migrations manually:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env exec backend alembic upgrade head
```

**Reset the database completely:**
```bash
docker compose -f docker-compose.prod.yml --env-file .env exec backend alembic downgrade base
docker compose -f docker-compose.prod.yml --env-file .env exec backend alembic upgrade head
```

> ⚠️ Resetting permanently deletes all data.

---

## Disk & Memory Usage

**Check disk usage:**
```bash
df -h
```

**Check memory usage:**
```bash
free -h
```

**Check Docker disk usage:**
```bash
docker system df
```

**Clean up unused Docker images and containers:**
```bash
docker system prune -f
```

---

## VM Reboot

If the VM reboots (e.g. Oracle maintenance), Docker starts automatically but the app containers do not. You need to start them manually:

```bash
cd ~/wc-predictions
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

To make containers start automatically on reboot, the systemd service is configured at `/etc/systemd/system/wc-predictions.service`. Check its status with:

```bash
sudo systemctl status wc-predictions
```

If it's not enabled:
```bash
sudo systemctl enable wc-predictions
sudo systemctl start wc-predictions
```

---

## DuckDNS Domain

The domain `wc-predictions.duckdns.org` points to `132.145.44.176`. If the VM's public IP ever changes (e.g. after a stop/start), update it at [duckdns.org](https://duckdns.org).

> ℹ️ Oracle Free Tier VMs keep their public IP as long as the instance is running. The IP only changes if you stop and deallocate the instance.

---

## Firewall Rules

Two layers of firewall are in place:

**OS-level (iptables):**
```bash
sudo iptables -L INPUT -n  # view rules
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT   # open port 80
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT  # open port 443
sudo netfilter-persistent save  # persist rules across reboots
```

**Oracle Security List:**
Managed via Oracle Cloud Console → Networking → Virtual Cloud Networks → Security Lists. Current open ports: 22 (SSH), 80 (HTTP), 443 (HTTPS).

---

## Quick Reference

| Task | Command |
|---|---|
| SSH into server | `ssh -i key.key ubuntu@132.145.44.176` |
| Deploy update | `./update.sh` |
| Check status | `docker compose -f docker-compose.prod.yml --env-file .env ps` |
| View logs | `./logs.sh` |
| Stop app | `docker compose -f docker-compose.prod.yml --env-file .env down` |
| Start app | `docker compose -f docker-compose.prod.yml --env-file .env up -d` |
| Renew SSL | `sudo certbot renew` (stop Docker first) |
| Clean Docker | `docker system prune -f` |