# Unit tests

Fast, no I/O, no Nest testing module. Run on every save.

## Domain tests
Test entities, value objects and domain services directly with `new` / factories.

```ts
describe('Appointment.cancel', () => {
  const now = new Date('2026-01-01T09:00:00Z');

  it('marks a confirmed appointment as cancelled', () => {
    const appointment = anAppointment().build();
    appointment.cancel(now);
    expect(appointment.status).toBe(AppointmentStatus.Cancelled);
  });

  it('rejects cancelling twice', () => {
    const appointment = anAppointment().cancelled().build();
    expect(() => appointment.cancel(now)).toThrow(AppointmentAlreadyCancelledError);
  });
});
```

What to cover for each rule:
- valid case
- each way it can be violated (one test per error type/code)
- boundaries: equal timestamps, zero/negative values, empty collections, max lengths
- value object validation: invalid input cannot construct an instance

## Application (handler) tests
Construct the handler by hand with **fakes**; don't spin up Nest.

```ts
describe('CreateAppointmentHandler', () => {
  const clock = new FixedClock(new Date('2026-01-01T09:00:00Z'));
  // one dealership (08:00–18:00 UTC), one bay, one technician qualified for a 60-min service
  const world = aSchedulingWorld().withBays(1).withQualifiedTechnicians(1).build();
  let appointments: InMemoryAppointmentRepository;
  let handler: CreateAppointmentHandler;

  beforeEach(() => {
    appointments = new InMemoryAppointmentRepository();
    handler = new CreateAppointmentHandler(appointments, world.resources, world.vehicles, clock);
  });

  it('books the free bay and qualified technician for a free slot', async () => {
    const { id } = await handler.execute(world.request({ desiredStart: '2026-01-02T10:00:00Z' }));
    const saved = await appointments.findById(id);
    expect(saved?.bayId).toBe(world.bays[0].id);
    expect(saved?.technicianId).toBe(world.technicians[0].id);
  });

  it('rejects with NoServiceBayAvailable when the only bay is busy for part of the duration', async () => {
    await appointments.save(anAppointment().inBay(world.bays[0]).from('2026-01-02T10:30:00Z').build());
    await expect(
      handler.execute(world.request({ desiredStart: '2026-01-02T10:00:00Z' })),
    ).rejects.toBeInstanceOf(NoServiceBayAvailableError);
  });
});
```

Handler tests check orchestration: the right things are loaded, the domain is called, the result is saved, and the right result/error comes back. They don't re-test every domain rule; that's the domain tests' job.

`@Transactional()` is a no-op in unit tests. Transaction behaviour is proven in integration tests.

## Fakes and helpers (`test/`)
| Helper | Location | Purpose |
|---|---|---|
| `InMemoryXRepository` | `test/fakes/` | Implements the port with a `Map`; behaves like the real one (including uniqueness rules that matter) |
| `FixedClock` | `test/fakes/` | `Clock` with a settable `now`; `advance(ms)` for time-based rules |
| `aX()` builders | `test/builders/` | Valid defaults, fluent overrides |

Every fake must pass the same **contract test** as the real adapter (see `integration-and-e2e.md` › Repository contract tests), so fakes can't drift from reality.

## Controllers
No unit tests for controllers; they're thin mappers. Covered by e2e.
