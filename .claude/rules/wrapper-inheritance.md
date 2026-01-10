---
paths:
  - "src/wrapper/**/*.ts"
---

# Wrapper Inheritance Pattern

## BaseWrapper is the Single Source of Truth

When adding shared functionality to agent wrappers (TmuxWrapper, PtyWrapper), ALWAYS add it to `BaseWrapper` first.

## Required Pattern

1. **Add property/method to BaseWrapper** - Not to individual wrappers
2. **Use protected access** - So subclasses can use it
3. **Provide helper methods** - For common operations

```typescript
// In base-wrapper.ts
export abstract class BaseWrapper extends EventEmitter {
  // Shared state goes here
  protected idleDetector: UniversalIdleDetector;

  // Helper methods for subclasses
  protected setIdleDetectorPid(pid: number): void {
    this.idleDetector.setPid(pid);
  }

  protected feedIdleDetectorOutput(output: string): void {
    this.idleDetector.onOutput(output);
  }
}
```

## Anti-patterns

```typescript
// WRONG: Adding same property to both wrappers
class TmuxWrapper extends BaseWrapper {
  private idleDetector: UniversalIdleDetector; // NO!
}

class PtyWrapper extends BaseWrapper {
  private idleDetector: UniversalIdleDetector; // NO!
}

// CORRECT: Add once to BaseWrapper, use inherited methods
class TmuxWrapper extends BaseWrapper {
  // Uses this.setIdleDetectorPid() from parent
  // Uses this.feedIdleDetectorOutput() from parent
}
```

## Checklist for New Features

- [ ] Is this functionality needed by both TmuxWrapper AND PtyWrapper?
- [ ] If yes, add to BaseWrapper with protected access
- [ ] Create helper methods in BaseWrapper for subclasses to call
- [ ] Remove duplicate code from individual wrappers
- [ ] Update both wrappers to use the shared functionality

## Why This Matters

- Prevents code duplication and divergence
- Single point of maintenance
- Consistent behavior across all wrapper types
- Easier to test (test BaseWrapper once)
