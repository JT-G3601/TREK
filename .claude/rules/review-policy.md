# Review Policy for Claude Code

## Review Standards

When reviewing agent-authored PRs on TREK, apply the following standards.

## Finding Priority

1. **Correctness** — Does the code do what the plan says? Any logic errors?
2. **Security** — Any exposed secrets, injection vectors, auth bypasses?
3. **Regression** — Could this break existing tests or behavior?
4. **Missing Tests** — Are acceptance criteria proven by tests?
5. **Scope Violation** — Any changes outside the approved plan or to protected paths?

## Style

- TREK uses Prettier and ESLint with workspace-level configs.
- Do not report style issues that lint/format CI would catch.
- Focus on substantive issues, not formatting preferences.

## Blocking vs Advisory

**Blocking** (must fix before `ai:ready-for-human`):
- Correctness bugs
- Security vulnerabilities
- Test coverage regression
- Scope violations
- Plan infidelity (implementation contradicts approved decisions)

**Advisory** (suggest, but do not block):
- Simplification opportunities
- Performance improvements (non-regression)
- Documentation improvements
- Naming suggestions

## Report Format

Every finding must include:
- `file` and `line` (where applicable)
- Concrete failure scenario for blocking findings
- Distinction between observed behavior and expected behavior

## Independence

- Do not reuse the implementation agent's reasoning or chat history.
- Cold-start from: Issue, approved handoff, PR diff, CI results.
- If in doubt about intent, flag it — do not assume.
