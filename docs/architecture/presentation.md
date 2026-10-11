# Presentation layer

HTTP adapter. Translates HTTP ⇄ commands/queries and contains no business logic.

## Controllers
- Inject only `CommandBus` and `QueryBus`.
- Each action: validated DTO → build Command/Query → `execute` → map result → response DTO.
- Never import entities, repositories, Prisma or handlers.
- Versioned with `@Controller({ path: 'appointments', version: '1' })`. Operational controllers (`health`) use `VERSION_NEUTRAL`.

```ts
@ApiTags('appointments')
@Controller({ path: 'appointments', version: '1' })
export class AppointmentController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: AppointmentIdResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto })
  async create(@Body() dto: CreateAppointmentRequestDto): Promise<AppointmentIdResponseDto> {
    const { id } = await this.commands.execute(
      new CreateAppointmentCommand(
        dto.customerId, dto.vehicleId, dto.dealershipId, dto.serviceTypeId, new Date(dto.desiredStart),
      ),
    );
    return { id };
  }

  @Get(':id')
  @ApiOkResponse({ type: AppointmentResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<AppointmentResponseDto> {
    const view = await this.queries.execute(new GetAppointmentQuery(id));
    return AppointmentResponseDto.from(view);
  }
}
```

## DTOs
- Request DTOs validate **shape only** with `class-validator` (types, formats, required, ranges). Business rules belong in the domain.
- Response DTOs are explicit classes with Swagger decorators and a static `from(view)`. Never return views or entities raw.
- Shared DTOs (`CursorQueryDto`, `PageResponseDto<T>`, `ErrorResponseDto`) live in `shared/presentation/dto`.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.

## Error mapping
`GlobalExceptionFilter` (in `shared/presentation/filters`) is the **only** place that maps domain errors to HTTP status codes:

| Error | Status |
|---|---|
| `ValidationError`, class-validator failure, invalid cursor | 400 |
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `BusinessRuleError` | 422 |
| anything else | 500 `INTERNAL_ERROR` (logged, generic message) |

The response body follows `../conventions.md` › Errors.

## Versioning
Rules are in `../conventions.md` › Versioning. A new API version means new controllers/DTOs in presentation (`@Version('2')`) that reuse the same commands/queries. Application and domain are not versioned.

## Swagger
Every endpoint documents its request DTO, success response and possible error responses (`@ApiConflictResponse({ type: ErrorResponseDto })` etc.). Served at `/docs`.
