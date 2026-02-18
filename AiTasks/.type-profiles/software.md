# Type Profile: software

## Domain Classification
- **Assigned type**: `software`
- **Classification**: single
- **Confidence**: high
- **Rationale**: Web application development — frontend notebook UI + backend Claude Agent SDK service
- **Refinement log**:
  - 2026-02-18 research: initial profile from notebook task

## Phase Intelligence
- **plan**: Architecture design, API contracts, data models, component hierarchy
- **verify**: Unit tests (Jest/Vitest), integration tests, E2E tests (Playwright)
- **check**: Code quality (ESLint/TypeScript), security, performance benchmarks
- **exec**: TypeScript/React frontend, Node.js backend, WebSocket communication

## Domain Methodology
- **Design approach**: Component-based architecture, event-driven communication
- **Key tools**: TypeScript, React, Node.js, npm/pnpm
- **Workflow**: Requirements -> Architecture -> Implementation -> Testing -> Deployment

## Verification Standards
- **Testing approach**: Unit + integration + E2E
- **Quality metrics**: TypeScript type safety, test coverage > 70%
- **Acceptance criteria**: Functional requirements met, tests pass, no type errors

## Implementation Patterns
- **Common patterns**: MVC/MVVM, REST/WebSocket APIs, component composition
- **Known pitfalls**: State management complexity, WebSocket reconnection, security
- **Tool chain**: npm/pnpm, TypeScript, ESLint, Prettier, Jest/Vitest
