import { BookingParties } from '../../src/modules/appointments/application/ports/booking-parties';

export class InMemoryBookingParties extends BookingParties {
  /**
   * @param customerIds existing customers
   * @param vehicleOwners vehicle id → owning customer id
   */
  constructor(
    private readonly customerIds: readonly string[] = [],
    private readonly vehicleOwners: ReadonlyMap<string, string> = new Map(),
  ) {
    super();
  }

  customerExists(customerId: string): Promise<boolean> {
    return Promise.resolve(this.customerIds.includes(customerId));
  }

  findVehicleOwnerId(vehicleId: string): Promise<string | null> {
    return Promise.resolve(this.vehicleOwners.get(vehicleId) ?? null);
  }
}
