# Contributing to CRM AI Agent

Thank you for considering contributing to the CRM AI Agent! This document provides guidelines to help you contribute effectively.

## Code of Conduct

Be respectful and collaborative. We're all here to build something great together.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates
2. Use the bug report template
3. Include:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node version, OS, etc.)
   - Relevant logs or screenshots

### Suggesting Features

1. Check existing issues/discussions
2. Clearly describe the feature and its use case
3. Explain why it would be valuable
4. Consider implementation complexity

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following our coding standards
4. **Test thoroughly** - ensure nothing breaks
5. **Commit** with clear, descriptive messages:
   ```
   feat: add support for custom risk thresholds
   fix: resolve Telegram message formatting issue
   docs: update installation instructions
   ```
6. **Push** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request** with:
   - Clear title
   - Description of changes
   - Related issues (if any)
   - Screenshots (for UI changes)

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer const over let
- Use meaningful variable names
- Add JSDoc comments for exported functions
- Keep functions focused and single-purpose

### Code Style

```typescript
// Good
async function analyzeLead(leadId: number): Promise<LeadAnalysis> {
  const lead = await amocrm.getLead(leadId);
  const score = calculateRiskScore(lead);
  return { lead, score };
}

// Avoid
async function doStuff(id:number){
  var l=await amocrm.getLead(id)
  return {lead:l,score:calc(l)}
}
```

### File Organization

- Keep related code together
- Use meaningful file and folder names
- Separate concerns (services, utils, types)
- One main export per file for services

### Error Handling

```typescript
// Always handle errors gracefully
try {
  await riskyOperation();
} catch (error) {
  console.error('Descriptive error message:', error);
  // Recovery logic or rethrow
}
```

## Testing

- Test your changes before submitting
- Add test cases for new features
- Ensure existing tests still pass
- Test edge cases and error scenarios

## Documentation

- Update README.md if you change functionality
- Add JSDoc comments for new functions
- Update relevant docs in `docs/` folder
- Include examples for complex features

## Commit Message Format

We use conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

Examples:
```
feat: add /today command to show daily dashboard
fix: resolve rate limiting on amoCRM API calls
docs: update testing guide with new scenarios
refactor: extract lead filtering logic to separate service
```

## Questions?

Feel free to:
- Open an issue for discussion
- Reach out to maintainers
- Ask in pull request comments

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🎉
