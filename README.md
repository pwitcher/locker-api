# Smart Locker API & AI-Integrated Portal

A "Docs-as-Code" demonstration project featuring a live REST API, a Starlight documentation portal, and an MCP (Model Context Protocol) bridge for AI-driven troubleshooting.

## 🏗️ Project Structure
- `/` - Node.js Express API (The System)
- `/portal` - Astro/Starlight documentation (The Human UI)
- `/mcp-server` - TypeScript MCP Server (The AI Bridge)

## 🚀 Key Features
- **AI-Driven Troubleshooting:** Uses MCP to allow LLMs (like Claude) to read local documentation to solve live API issues.
- **Single Source of Truth:** Documentation authored in Markdown feeds both the web portal and the AI agent.
- **API Real-time Status:** Integration between static docs and live system state.

## 🛠️ Tech Stack
- **Documentation:** Astro, Starlight, Markdown, YAML
- **Backend:** Node.js, Express
- **AI/Integration:** TypeScript, Model Context Protocol SDK, Zod
