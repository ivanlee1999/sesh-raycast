
## Setup

- `Server URL`: defaults to `https://sesh.liyifan.us`
- `App Username` / `App Password`: required when the sesh-web deployment is protected by the shared login wall. The extension will automatically POST to `/api/login`, cache the returned session cookie in Raycast local storage, and retry protected API calls.

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Test Structure
```
src/__tests__/
├── format.test.ts       # formatMinutes, formatCountdown, NaN guards, phase labels
├── timer-state.test.ts  # payload builders, effective remaining time, coercion
├── api.test.ts          # request helper, 204 handling, errors
└── types.test.ts        # interface shape validation vs actual API
```

### Contributing
- Every new function must have unit tests
- Bug fixes must include a regression test
- Run `npm test` before committing
- Run `npx ray build` to verify extension still compiles
