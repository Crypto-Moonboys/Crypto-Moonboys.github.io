# Space Agent Protected Access Runbook

Last updated: 2026-05-06

This runbook provisions protected Space Agent access at:

- `https://space.cryptomoonboys.com`

Non-goals:

- Do not expose Space Agent as an unprotected public page.
- Do not change `THE BRAIN` live-edit boundary rules.
- Do not expose Ollama (`11434`) publicly.

## 1) Cloudflare DNS

Create or verify:

- Type: `A`
- Name: `space`
- Content: `158.220.91.71`
- Proxy status: `DNS only` (initially)
- TTL: `Auto`

Check after save:

```bash
dig +short space.cryptomoonboys.com
```

Expected: `158.220.91.71`

## 2) Systemd Service (localhost bind only)

Create `/etc/systemd/system/space-agent.service`:

```ini
[Unit]
Description=Space Agent service
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/space-agent
Environment=HOST=127.0.0.1
Environment=PORT=3010
ExecStart=/usr/bin/node space serve
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

Apply:

```bash
systemctl daemon-reload
systemctl enable --now space-agent
systemctl status space-agent --no-pager
curl -I http://127.0.0.1:3010/login
```

Expected:

- `systemctl status` shows `active (running)`.
- `curl -I` returns HTTP headers (200/302 acceptable as long as route responds).

## 3) Nginx Reverse Proxy + Basic Auth

Ensure htpasswd file exists:

```bash
test -f /etc/nginx/.space-agent.htpasswd || htpasswd -c /etc/nginx/.space-agent.htpasswd admin
```

Create `/etc/nginx/sites-available/space-agent`:

```nginx
server {
    listen 80;
    server_name space.cryptomoonboys.com;

    auth_basic "Restricted Space Agent";
    auth_basic_user_file /etc/nginx/.space-agent.htpasswd;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

Enable and verify:

```bash
ln -sfn /etc/nginx/sites-available/space-agent /etc/nginx/sites-enabled/space-agent
nginx -t
systemctl reload nginx
```

## 4) HTTPS Certificate

Issue cert:

```bash
certbot --nginx -d space.cryptomoonboys.com
```

Post-check:

```bash
nginx -t
systemctl reload nginx
```

## 5) Verify External Protection and Reachability

From external network:

```bash
curl -I https://space.cryptomoonboys.com
```

Expected before entering credentials:

- `401 Unauthorized` with `WWW-Authenticate: Basic`

Browser check:

1. Visit `https://space.cryptomoonboys.com`
2. Confirm HTTP Basic Auth challenge appears first.
3. After successful Basic Auth, confirm Space Agent login page appears.
4. Confirm app interaction/streaming/websocket behavior works.

## 6) Ollama Local-only Safety

Never bind Ollama publicly. Keep access local on VPS:

```bash
curl http://127.0.0.1:11434/api/tags
```

Test model:

```bash
curl -s --max-time 60 http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5:0.5b","messages":[{"role":"user","content":"Say only: local model connected"}],"stream":false}'
```

Expected response contains:

- `local model connected`

Provider settings to use in Space Agent:

- Endpoint URL: `http://127.0.0.1:11434/v1/chat/completions`
- Model Name: `qwen2.5:0.5b`
- API Key: `ollama`

If Space Agent frontend attempts direct browser calls to model endpoint, do not expose `11434` publicly. Use server-side provider calls or a protected internal proxy.

## 7) Optional GitHub Pages Launcher

Static launcher only:

- `/admin/space-agent.html`
- Link/button to `https://space.cryptomoonboys.com`
- No credentials in page
- No iframe requirement

## 8) Required Safety Workflow

Space Agent website work must follow:

- `inspect -> explain -> propose -> user confirms -> edit -> test -> commit`

Space Agent must not:

- auto-edit production blindly
- bypass tests
- push direct unreviewed changes
- alter THE BRAIN live-edit rules
- expose Ollama publicly
- expose admin tools without auth

## Acceptance Checklist

- [ ] Cloudflare DNS `space.cryptomoonboys.com` points to `158.220.91.71`.
- [ ] `systemctl status space-agent` is active/running.
- [ ] `curl -I http://127.0.0.1:3010/login` works on VPS.
- [ ] `https://space.cryptomoonboys.com` loads via HTTPS.
- [ ] HTTP Basic Auth protects subdomain.
- [ ] Space Agent login appears after Basic Auth.
- [ ] `https://game.cryptomoonboys.com` still works.
- [ ] `https://cryptomoonboys.com` still works.
- [ ] `https://cryptomoonboys.com/admin/the-brain.html` still works.
- [ ] Ollama is not publicly exposed.
- [ ] `qwen2.5:0.5b` works server-side through local endpoint.
- [ ] Launcher page is static only and does not expose secrets.
