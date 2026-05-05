import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new McpServer({
  name: "locker-bridge",
  version: "1.0.0",
});

// 1. System Overview Resource (4 Arguments)
server.registerResource(
  "System Overview", 
  "mcp://docs/system-overview",
  { description: "Architecture and state logic" },
  async (uri: any) => {
    const filePath = path.join(__dirname, "../../portal/src/content/docs/concepts/system-overview.md");
    const content = await fs.readFile(filePath, "utf-8");
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: "text/markdown",
        text: content
      }]
    };
  }
);

// 2. Troubleshooting Guide Resource (4 Arguments)
server.registerResource(
  "Troubleshooting Guide",
  "mcp://docs/troubleshooting",
  { description: "Official SOP for locker errors" },
  async (uri: any) => {
    const filePath = path.join(__dirname, "../../portal/src/content/docs/reference/troubleshooting.md");
    const content = await fs.readFile(filePath, "utf-8");
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: "text/markdown",
        text: content
      }]
    };
  }
);

// 3. Tool: Check Live API Status (3 Arguments)
server.registerTool(
  "check_locker_status",
  { description: "Fetches the current real-time status of all smart lockers" },
  async () => {
    const response = await fetch("http://localhost:3000/lockers");
    const data = await response.json();
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  }
);

// 4. Tool: Get Documentation (3 Arguments using Zod)
server.registerTool(
  "get_docs",
  {
    description: "Retrieves official documentation",
    // Use z.object here to satisfy the AnySchema requirement
    inputSchema: z.object({
      docType: z.enum(["concepts", "reference"]),
      fileName: z.string()
    })
  },
  async ({ docType, fileName }: { docType: "concepts" | "reference"; fileName: string }) => {
    try {
      const filePath = path.join(__dirname, `../../portal/src/content/docs/${docType}/${fileName}.md`);
      const content = await fs.readFile(filePath, "utf-8");
      return {
        content: [{ type: "text", text: content }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: Document not found. ${error}` }],
        isError: true
      };
    }
  }
);

// 5. Start the Server using STDIO
const transport = new StdioServerTransport();
await server.connect(transport);