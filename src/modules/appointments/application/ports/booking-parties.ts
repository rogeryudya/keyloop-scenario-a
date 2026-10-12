/**
 * Read port for the customer and vehicle on a booking (BR-5, BR-13). Implemented by a read adapter on
 * the customers module's tables, like BookableResources (see ../../README.md). Also the DI token.
 */
export abstract class BookingParties {
  abstract customerExists(customerId: string): Promise<boolean>;

  /** The owning customer's id, or `null` when the vehicle doesn't exist. */
  abstract findVehicleOwnerId(vehicleId: string): Promise<string | null>;
}
