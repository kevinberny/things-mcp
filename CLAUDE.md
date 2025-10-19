# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides integration with the Things 3 productivity app (macOS) via its URL scheme. The server exposes MCP tools that allow AI assistants to create, update, and query todos, projects, headings, and other Things entities.

**Key Technology**: Built with TypeScript, uses `@modelcontextprotocol/sdk` for MCP server implementation, and Zod for runtime validation.

**Platform**: macOS only (requires Things 3 app installed and running).

## Development Commands

```bash
# Build TypeScript to dist/
pnpm build

# Start the MCP server (after building)
pnpm start

# Run directly during development (after building)
node dist/index.js

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Lint code
pnpm lint

# Lint and auto-fix
pnpm lint:fix

# Format code
pnpm format

# Check formatting
pnpm format:check

# Type check without emitting
pnpm type-check

# CLI flags
node dist/index.js --version    # Show version
node dist/index.js --help       # Show help
```

## Architecture

### Single-File MCP Server (`src/index.ts`)

The entire server is implemented in one TypeScript file (~1170 lines). It follows this structure:

1. **Startup validation**: Checks JXA script exists and osascript binary is available before starting
2. **CLI argument handling**: Supports `--version` and `--help` flags
3. **URL execution** (`openThingsURL`): Uses `spawn` to safely call `open` command with URL as array argument (prevents command injection)
4. **Auth token resolution** (`resolveAuthToken`): Checks parameter or `THINGS_AUTH_TOKEN` env var
5. **Zod schemas**: Define structured project/todo/heading input formats and validation
6. **Builder functions**: Transform structured inputs into Things JSON payloads
   - `buildChecklistItems()`: Converts checklist arrays to Things format
   - `buildTodo()`: Creates to-do JSON with all attributes
   - `buildProjectItems()`: Processes mixed heading/todo arrays
   - `buildStructuredProjectPayload()`: Top-level project JSON generator
   - `buildRestructurePayload()`: Generates batch operations for heading/todo reordering
7. **MCP tool definitions**: Each `server.tool()` call registers a tool with schema + handler

### Things URL Scheme Integration

All operations construct `things:///` URLs with query parameters:

- Simple operations (add-todo, add-project): Use `URLSearchParams` to build URL directly
- Complex operations (create-structured-project, restructure-project): Build JSON payloads and pass via `data` parameter to `things:///json`
- Update operations (update, update-project): Require auth token from Things settings

**URL encoding**: Always uses `URLSearchParams.toString()` to handle special characters correctly.

### JXA Script Integration

The `evaluate` tool shells out to `scripts/things-evaluate-url.jxa` (JXA = JavaScript for Automation):

- Script path resolved relative to `dist/index.js` as `../scripts/things-evaluate-url.jxa`
- Requires executable permissions (`chmod +x scripts/things-evaluate-url.jxa`)
- Returns JSON representation of Things items (todos, projects, areas, tags)

**Location**: `evaluateScriptPath` at line 21-24 and usage at line 992-994

### Authorization Token Handling

The `THINGS_AUTH_TOKEN` environment variable is checked in multiple places:

- `resolveAuthToken()` function (lines 34-47): Checks parameter first, then env var
- Individual tools (`create-structured-project`, `json`): Check env var directly
- User obtains token from: Things → Settings → General → Enable Things URLs → Manage

## MCP Tools Catalog

All tools return `{ content: [{ type: "text", text: "..." }] }` format.

**Simple creation**:
- `add-todo`: Single/multiple todos with basic scheduling
- `add-project`: Project with optional nested todo titles

**Structured creation** (uses JSON format):
- `create-structured-project`: Build projects with real headings, nested todos, checklist items
- `restructure-project`: Reorder/create/delete headings and move todos in batch

**Updates** (require auth token):
- `update`: Modify existing todo
- `update-project`: Modify existing project

**Navigation/Search**:
- `show`: Navigate to specific item or list by ID/name
- `search`: Search across Things data

**Advanced**:
- `json`: Direct JSON batch operations (create/update multiple items)
- `evaluate`: Query Things item properties via JXA script (returns structured JSON)
- `version`: Get Things app version

## Coding Guidelines (from .cursorrules)

When modifying this codebase:

1. **TypeScript**: Use strict types, prefer Zod schemas for validation, use async/await
2. **MCP patterns**: All tool parameters must have Zod schemas with descriptions
3. **Things URL scheme**:
   - Always use `things:///` protocol
   - Use `URLSearchParams` for encoding
   - Support optional parameters (check for undefined)
   - Follow [Things URL scheme docs](https://culturedcode.com/things/support/articles/2803573/)
4. **Error handling**: Wrap `execAsync` calls in try/catch, provide clear error messages
5. **Parameter naming**: Use kebab-case for URL parameters (e.g., `"auth-token"`, `"list-id"`)

## Things Item IDs

To get item IDs for updates/queries:
- **macOS**: Control-click item → Share → Copy Link
- **iOS**: Tap item → toolbar → Share → Copy Link

IDs are embedded in `things:///show?id=<ID>` format.

## Common Pitfalls

1. **Auth token errors**: Update operations fail without auth token. Either pass `auth-token` parameter or set `THINGS_AUTH_TOKEN` env var in MCP client config.
2. **JXA script missing**: Server will exit with error at startup if `scripts/things-evaluate-url.jxa` is not found.
3. **Wrong build output**: The server expects `dist/index.js` to exist. Always run `pnpm build` before testing.
4. **Special characters in titles/notes**: Always rely on `URLSearchParams` encoding, never manual string concatenation.
5. **Linting errors**: Run `pnpm lint:fix` to automatically fix most linting issues before committing.

## Testing

Tests are located in `test/` directory and use Vitest. Current test coverage includes:

- URL construction and encoding
- URLSearchParams behavior with special characters
- Security tests for command injection prevention
- Things URL scheme format validation

Run tests before submitting PRs to ensure URL construction remains secure.

## Project Structure

```
things-mcp/
├── src/
│   └── index.ts                 # Entire MCP server implementation
├── test/
│   └── url-construction.test.ts # Tests for URL encoding and security
├── scripts/
│   └── things-evaluate-url.jxa  # JXA script for evaluate tool
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI pipeline
├── dist/                        # TypeScript build output (gitignored)
├── package.json                 # pnpm package with scripts and dependencies
├── tsconfig.json                # TypeScript config (ES2020, ESNext modules)
├── vitest.config.ts             # Vitest test configuration
├── .eslintrc.json               # ESLint configuration
├── .prettierrc                  # Prettier configuration
├── readme.md                    # User-facing documentation
└── .cursorrules                 # Cursor AI coding guidelines
```

## CI/CD

GitHub Actions CI runs on every push and PR:

- Tests on Node.js 18, 20, and 22
- Runs on macOS (required for Things-specific features)
- Linting with ESLint
- Type checking with TypeScript
- Tests with Vitest
- Format checking with Prettier
- Build verification
