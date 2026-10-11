# Test doubles: fakes, stubs, mocks and WireMock

## Vocabulary
| Double | What it is | Use here for |
|---|---|---|
| **Fake** | Working lightweight implementation (`InMemoryAppointmentRepository`, `FixedClock`) | **Default** for our own ports in unit tests |
| **Stub** | Returns canned answers, no logic | A port whose behaviour doesn't matter to the test (e.g. "notifier always succeeds") |
| **Mock** | Records calls so you can assert on them (`jest.fn()`) | Only when the *call itself* is the behaviour: "an email was sent once with X" |
| **Spy** | Wraps a real object to observe calls | Rarely; prefer fakes |
| **HTTP stub server (WireMock)** | Real HTTP server returning configured responses | **External HTTP APIs** in integration/e2e |

Rule of thumb: **fakes for our ports, WireMock for other people's HTTP APIs, mocks only to verify a side effect.** Over-mocking makes tests pass while the real wiring is broken.

## Which double, by situation
| Situation | Double |
|---|---|
| Handler needs a repository | Fake (`InMemoryXRepository`) |
| Handler needs time | `FixedClock` |
| Handler calls an external-service port, result matters | Fake or stub of the port |
| Verify "event published / email sent" | Mock (`jest.fn()`) or a recording fake |
| Adapter code that calls a third-party HTTP API | **WireMock** (integration test of the adapter) |
| Full API test where the app calls a third-party API | **WireMock** (e2e) |
| Database | Never mocked; real Postgres in integration/e2e, fakes in unit |
| AWS (Secrets Manager) | floci in one integration test; config override elsewhere |

## WireMock

Use it only if the brief involves calling external HTTP services (e.g. a manufacturer API, payment, notifications). If there are none, don't add it.

### Why WireMock (vs `nock`/`msw`)
It's a real server, so it tests our actual HTTP client, timeouts, retries and serialization, and the same stubs work for the local dev run (Compose) and tests (Testcontainers). Language-agnostic mappings live as JSON in the repo.

### Layout
```
test/wiremock/
  mappings/            stub definitions (JSON), one file per scenario
    parts-api.get-part.ok.json
    parts-api.get-part.not-found.json
  __files/             response bodies referenced by mappings
```

```json
{
  "request":  { "method": "GET", "urlPathPattern": "/parts/[A-Z0-9-]+" },
  "response": { "status": 200, "jsonBody": { "sku": "AB-123", "inStock": true },
                "headers": { "Content-Type": "application/json" } }
}
```

### Local run (Compose)
```yaml
  wiremock:
    image: wiremock/wiremock:<pinned-version>
    ports: ["8080:8080"]
    volumes:
      - ./test/wiremock:/home/wiremock
```
The app's base URL for the external API points to `http://localhost:8080` via env var.

### Tests (Testcontainers)
- Start `wiremock/wiremock` as a `GenericContainer` in e2e `globalSetup`, mounting `test/wiremock`.
- Per-test stubs via the admin API: `POST /__admin/mappings`; `POST /__admin/reset` in `beforeEach`.
- Verify outbound calls when they matter: `POST /__admin/requests/count` with a request pattern.

### Scenarios every external adapter must be tested for
- success response → mapped correctly into our domain/application type
- 4xx (e.g. 404) → translated to the right domain/application error
- 5xx → our error handling (retry if designed, then a clear error)
- **timeout / slow response** (`"fixedDelayMilliseconds"`) → we time out, not hang
- malformed body → handled, not a crash

### Rules
- WireMock stubs describe the **external contract**; keep them realistic (copy real response examples from the provider docs).
- Never stub our own API with WireMock.
- Stubs live in the repo and are reviewed like code.
