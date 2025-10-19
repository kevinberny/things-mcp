# Changelog

## [Unreleased]

### Security
- **Fixed command injection vulnerability** in `openThingsURL()` function
  - Changed from `exec` with string interpolation to `spawn` with array arguments
  - This prevents potential command injection if URLs contain special characters

### Added
- **Startup validation** for JXA script and osascript binary
  - Server now exits with clear error message if required files are missing
  - Prevents runtime errors during tool execution

- **CLI argument support**
  - `--version` / `-v` flag to show version number
  - `--help` / `-h` flag to show usage information

- **Testing infrastructure**
  - Vitest test framework with coverage support
  - 12 tests covering URL construction and security
  - Tests verify proper encoding and command injection prevention

- **Code quality tools**
  - ESLint with TypeScript support (flat config for v9)
  - Prettier for consistent code formatting
  - Pre-configured rules following best practices

- **CI/CD pipeline**
  - GitHub Actions workflow for automated testing
  - Tests on Node.js 18, 20, and 22
  - Runs on macOS (required for Things integration)
  - Checks: linting, type checking, tests, formatting, and build

- **New package scripts**
  - `pnpm test` - Run tests
  - `pnpm test:watch` - Run tests in watch mode
  - `pnpm test:coverage` - Run tests with coverage report
  - `pnpm lint` - Lint code
  - `pnpm lint:fix` - Lint and auto-fix issues
  - `pnpm format` - Format code with Prettier
  - `pnpm format:check` - Check code formatting
  - `pnpm type-check` - Type check without emitting files
  - `pnpm prepublishOnly` - Build before publishing

### Changed
- Updated CLAUDE.md with comprehensive documentation of changes
- Reorganized imports to include new dependencies (spawn, existsSync)
- Improved error messages with more context

### Development
- Added eslint.config.js (ESLint v9 flat config format)
- Added .prettierrc and .prettierignore
- Added vitest.config.ts
- Added GitHub Actions CI configuration (.github/workflows/ci.yml)
- Added comprehensive test suite (test/url-construction.test.ts)

## [0.1.0] - Initial Release

Initial release of Things MCP Server with full Things URL scheme integration.
