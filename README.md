# LibreChat Analytics MCP Server

A dedicated MCP (Model Context Protocol) server that connects directly to your LibreChat MongoDB database to provide real-time analytics on token usage, model consumption, and user activity.

## Tools

### `getModelUsage`
Returns total token consumption broken down per model across your LibreChat instance.

**No input required.**

**Example output:**
```json
{
  "gpt-4o": 120000,
  "claude-3-5-sonnet": 85000,
  "gemini-pro": 43000
}
```

---

### `getTokenUsage`
Returns token usage aggregated over a specified time period.

**Input:**
| Parameter | Type | Values |
|---|---|---|
| `period` | string | `daily`, `monthly`, `quarterly`, `yearly` |

---

### `getTopUsers`
Returns the top users ranked by total token consumption.

**Input:**
| Parameter | Type | Description |
|---|---|---|
| `limit` | number | Number of top users to return (e.g. `10`) |

---

### `getUsageSummary`
Returns a full usage summary for a specified period including total tokens, total messages, and active users.

**Input:**
| Parameter | Type | Values |
|---|---|---|
| `period` | string | `daily`, `monthly`, `quarterly`, `yearly` |

**Example output:**
```json
{
  "totalTokens": 248000,
  "totalMessages": 1340,
  "activeUsers": 38
}
```

---

## Setup

### Prerequisites
- Node.js v18+
- Access to your LibreChat MongoDB connection string

### Installation

```bash
# Clone the repository
git "clone https://github.com/Avishkar-Kabadi-ODA/librechat-analytics-mcp"
cd librechat-analytics-mcp

# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the root directory:

```env
MONGO_URI=mongodb+srv://<user>:<password>@<host>/?tls=true&retryWrites=false
DB_NAME=LibreChat
PORT=3100
```

| Variable | Description |
|---|---|
| `MONGO_URI` | Your LibreChat MongoDB connection string |
| `DB_NAME` | Database name — usually `LibreChat` |
| `PORT` | Port to run the MCP server on |

### Start the server

```bash
npm start
```

Server will start at `http://localhost:PORT/mcp`

---

## Connecting to LibreChat

### Option 1 — LibreChat running locally via Docker

If LibreChat is running locally in Docker, connect directly using:

```
http://localhost:PORT/mcp
```

In LibreChat → Settings → MCP Servers → add:
```
URL: http://localhost:3100/mcp
```

---

### Option 2 — LibreChat running on a remote server

You need to expose your local MCP server to the internet. Use either **Cloudflare Tunnel** or **ngrok**:

#### Using Cloudflare Tunnel (Recommended — free, no account required)

```bash
# Install cloudflared
winget install Cloudflare.cloudflared        # Windows
brew install cloudflare/cloudflare/cloudflared  # macOS

# Start tunnel
cloudflared tunnel --url http://localhost:3100
```

Cloudflare will generate a public URL like:
```
https://random-name.trycloudflare.com
```

Connect LibreChat using:
```
https://random-name.trycloudflare.com/mcp
```

#### Using ngrok

```bash
# Install ngrok from https://ngrok.com/download
# Then expose your port
ngrok http 3100
```

ngrok will generate a public URL like:
```
https://abc123.ngrok-free.app
```

Connect LibreChat using:
```
https://abc123.ngrok-free.app/mcp
```

> ⚠️ Free ngrok URLs change every time you restart. Use a paid plan or Cloudflare for a stable URL.

---

### Option 3 — Deploy to cloud

Deploy this MCP server to any cloud platform for a permanent public URL:

#### Azure Container Apps
```bash
az acr build --registry <your-acr> --image librechat-analytics-mcp .
az containerapp create --name analytics-mcp --image <your-acr>.azurecr.io/librechat-analytics-mcp ...
```

#### Render (Free tier available)
1. Push repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo
4. Set environment variables in Render dashboard
5. Deploy — Render provides a permanent public URL

#### Railway / Fly.io
Similar to Render — connect GitHub repo, set env vars, deploy.

Connect LibreChat using your deployed URL:
```
https://your-deployed-url.com/mcp
```

---

## Adding to LibreChat

In your `librechat.yaml`:

```yaml
mcpServers:
  analytics:
    url: https://your-mcp-url/mcp
    type: streamable-http
```

Or via LibreChat Admin Panel → MCP Servers → Add New.

---

## Contributing

Contributions are welcome! If you'd like to add new tools, improve existing ones, or fix bugs:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

For major changes, please open an issue first to discuss what you'd like to change.

## License

MIT
