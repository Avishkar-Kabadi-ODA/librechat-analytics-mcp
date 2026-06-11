import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { connectDB } from "./db.js";
import { getUsageSummary } from "./tools/getUsageSummary.js";
import { getTokenUsage } from "./tools/getTokenUsage.js";
import { getTopUsers } from "./tools/getTopUsers.js";
import { getModelUsage } from "./tools/getModelUsage.js";

function createMcpServer() {
  const server = new Server(
    {
      name: "librechat-analytics",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async () => {
      console.log("[MCP] Listing tools requested");
      return {
        tools: [
          {
            name: "get_usage_summary",
            description: "Get overall LibreChat usage summary",
            inputSchema: {
              type: "object",
              properties: {
                period: {
                  type: "string",
                  enum: ["daily", "monthly", "quarterly", "yearly"],
                },
              },
              required: ["period"],
            },
          },
          {
            name: "get_token_usage",
            description: "Get token usage grouped by period",
            inputSchema: {
              type: "object",
              properties: {
                period: {
                  type: "string",
                  enum: ["daily", "monthly", "quarterly", "yearly"],
                },
              },
              required: ["period"],
            },
          },
          {
            name: "get_top_users",
            description: "Get top users by token consumption",
            inputSchema: {
              type: "object",
              properties: {
                limit: {
                  type: "number",
                },
              },
            },
          },
          {
            name: "get_model_usage",
            description: "Get model usage statistics",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    }
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request) => {
      const { name, arguments: args = {} } = request.params;
      console.log(`[MCP] Executing tool: ${name} with args:`, JSON.stringify(args));

      try {
        let result;
        switch (name) {
          case "get_usage_summary": {
            result = await getUsageSummary(args.period);
            break;
          }

          case "get_token_usage": {
            result = await getTokenUsage(args.period);
            break;
          }

          case "get_top_users": {
            result = await getTopUsers(args.limit || 10);
            break;
          }

          case "get_model_usage": {
            result = await getModelUsage();
            break;
          }

          default:
            console.error(`[MCP Error] Unknown tool requested: ${name}`);
            return {
              content: [
                {
                  type: "text",
                  text: `Error: Unknown tool "${name}"`,
                },
              ],
              isError: true,
            };
        }

        console.log(`[MCP] Tool ${name} executed successfully`);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(`[MCP Error] Failed to execute tool ${name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error executing tool ${name}: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}

// Map to keep track of active transports by sessionId
const transports = new Map();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware for incoming requests
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  if (req.method === "POST" && req.path === "/mcp") {
    console.log(`[HTTP Debug POST] headers:`, JSON.stringify(req.headers));
    console.log(`[HTTP Debug POST] body type:`, typeof req.body);
    console.log(`[HTTP Debug POST] body:`, JSON.stringify(req.body));
  }
  next();
});

// GET /.well-known/oauth-protected-resource - Discovery endpoint
app.get("/.well-known/oauth-protected-resource", (req, res) => {
  console.log("[HTTP] Discovery query on /.well-known/oauth-protected-resource");
  res.status(404).json({ error: "No OAuth protection required for this resource" });
});

// GET /.well-known/oauth-protected-resource/mcp - Path-aware Discovery endpoint
app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
  console.log("[HTTP] Discovery query on /.well-known/oauth-protected-resource/mcp");
  res.status(404).json({ error: "No OAuth protection required for this resource" });
});

// POST /mcp/messages - Legacy SSE transport messages endpoint
app.post("/mcp/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  console.log(`[HTTP] Legacy POST /mcp/messages for session ${sessionId}`);

  if (!sessionId) {
    return res.status(400).send("Missing sessionId query parameter");
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(404).send("Session not found or expired");
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (error) {
    console.error(`[HTTP Error] Error handling legacy message for session ${sessionId}:`, error);
    if (!res.headersSent) {
      res.status(500).send("Error handling message");
    }
  }
});

// ALL /mcp - Dual Streamable HTTP and Legacy SSE transport handler
app.all("/mcp", async (req, res) => {
  const originalAccept = req.headers["accept"] || "";
  // Wants SSE if it specifically requests text/event-stream or standard SSE headers (excluding html)
  const wantsSSE = req.method === "GET" && 
    (originalAccept.includes("text/event-stream") || originalAccept.includes("*/*") || originalAccept === "") &&
    !originalAccept.includes("text/html");

  // Normalize the Accept header for Streamable HTTP requests to satisfy strict SDK checks
  if (req.method === "GET" && wantsSSE) {
    const accept = req.headers["accept"] || "";
    if (!accept.includes("text/event-stream")) {
      req.headers["accept"] = accept ? `${accept}, text/event-stream` : "text/event-stream";
    }
  } else if (req.method === "POST") {
    let accept = req.headers["accept"] || "";
    if (!accept.includes("application/json")) {
      accept = accept ? `${accept}, application/json` : "application/json";
    }
    if (!accept.includes("text/event-stream")) {
      accept = `${accept}, text/event-stream`;
    }
    req.headers["accept"] = accept;
  }

  // Handle health check pings (HEAD, plain GET, and empty POST) without session ID
  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  if (req.method === "GET" && !wantsSSE && !req.headers["mcp-session-id"]) {
    return res.status(200).send("LibreChat Analytics MCP Server is running.");
  }

  const sessionId = req.headers["mcp-session-id"] || req.query.sessionId;

  if (sessionId) {
    const transport = transports.get(sessionId);
    if (!transport) {
      console.warn(`[HTTP Warning] Session not found or expired: ${sessionId}`);
      return res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null
      });
    }

    try {
      if (typeof transport.handleRequest === "function") {
        await transport.handleRequest(req, res, req.body);
      } else {
        res.status(400).send("Legacy transport does not support request handling on this route");
      }
    } catch (error) {
      console.error(`[HTTP Error] Error handling request for session ${sessionId}:`, error);
      if (!res.headersSent) {
        res.status(500).send("Error handling message");
      }
    }
  } else {
    // 1. If it's a GET request and wants SSE, this is a legacy SSE client establishing connection!
    if (req.method === "GET" && wantsSSE) {
      console.log("[HTTP] Creating new Legacy SSE session");
      const transport = new SSEServerTransport("/mcp/messages", res);
      const newSessionId = transport.sessionId;
      transports.set(newSessionId, transport);

      const connectionServer = createMcpServer();
      let isClosing = false;
      transport.onclose = async () => {
        if (isClosing) return;
        isClosing = true;
        console.log(`[HTTP] Legacy session ${newSessionId} closed`);
        transports.delete(newSessionId);
        try {
          await connectionServer.close();
        } catch (_) {}
      };

      try {
        await connectionServer.connect(transport);
        console.log(`[HTTP] Registered legacy session: ${newSessionId}`);
      } catch (error) {
        console.error(`[HTTP Error] Failed to connect legacy session ${newSessionId}:`, error);
        transports.delete(newSessionId);
      }
      return;
    }

    // 2. Check if the request is a modern Streamable HTTP initialization request
    const isInit = req.method === "POST" && 
      (req.body?.method === "initialize" || 
       (Array.isArray(req.body) && req.body.some(m => m.method === "initialize")));

    if (!isInit) {
      // Return 200 OK for empty/ping POST requests
      if (req.method === "POST" && (!req.body || Object.keys(req.body).length === 0)) {
        return res.status(200).send("LibreChat Analytics MCP Server is running.");
      }

      console.warn("[HTTP Warning] Request received without session ID that is not an initialize request");
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: Mcp-Session-Id header is required" },
        id: null
      });
    }

    console.log("[HTTP] Creating new Streamable HTTP session");
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onerror = (error) => {
      console.error("[HTTP Transport Error]", error);
    };

    try {
      const connectionServer = createMcpServer();
      await connectionServer.connect(transport);
      await transport.handleRequest(req, res, req.body);

      const newSessionId = transport.sessionId;
      if (newSessionId) {
        transports.set(newSessionId, transport);
        console.log(`[HTTP] Registered Streamable session: ${newSessionId}`);

        let isClosing = false;
        transport.onclose = async () => {
          if (isClosing) return;
          isClosing = true;
          console.log(`[HTTP] Streamable session ${newSessionId} closed`);
          transports.delete(newSessionId);
          try {
            await connectionServer.close();
          } catch (_) {}
        };
      }
    } catch (error) {
      console.error("[HTTP Error] Failed to initialize Streamable session:", error);
      if (!res.headersSent) {
        res.status(500).send("Failed to initialize session");
      }
    }
  }
});

async function main() {
  console.log("Connecting to MongoDB...");
  try {
    await connectDB();
    console.log("Successfully connected to MongoDB");
  } catch (err) {
    console.error("Critical: Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`\n==================================================`);
    console.log("LibreChat Analytics Streamable HTTP MCP server:");
    console.log(`http://localhost:${port}/mcp`);
    console.log(`==================================================\n`);
  });
}

main().catch((err) => {
  console.error("Critical server startup failure:", err);
  process.exit(1);
});