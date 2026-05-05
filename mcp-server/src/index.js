"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const zod_1 = require("zod");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
// 1. Initialize the Server
const server = new mcp_js_1.McpServer({
    name: "locker-docs-bridge",
    version: "1.0.0",
});
// 2. Resource: Expose the Markdown docs
server.resource("system-docs", "mcp://docs/system-overview", async () => ({
    contents: [{
            uri: "mcp://docs/system-overview",
            mimeType: "text/markdown",
            text: await promises_1.default.readFile(path_1.default.join(__dirname, "../../docs/system-overview.md"), "utf-8")
        }]
}));
// 3. Tool: Check Live API Status
server.tool("check_locker_status", "Fetches the current real-time status of all smart lockers", {}, // No input needed
async () => {
    const response = await fetch("http://localhost:3000/lockers");
    const data = await response.json();
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
});
// 4. Start the Server using STDIO
const transport = new stdio_js_1.StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map